# Design Document

## Overview

`ClientRequest` gets a synchronous answer to "did this request come through the distribution that holds my secret?" without any AWS call on the request path. A new internal class, `IngressVerifier`, owns the configuration, the comparison, the failure bookkeeping, and the rate-limited reload. Two internal secret readers (private subclasses of `CachedSecret`) keep the `AWSCURRENT` and `AWSPREVIOUS` values warm in the existing `CachedParameterSecrets` registry, so an application's existing `await CachedParameterSecrets.prime()` loads them, and a new static `ClientRequest.prime()` loads them for applications that do not use the registry. `RequestInfo` adds `client.sourceIp`. `ClientRequest` adds `client.ingress`, `isIngressVerified()`, `prime()`, and one `INGRESS_UNVERIFIED` log line per unverified request. Nothing about validation, status codes, or the `RESPONSE` line changes.

The design follows [requirements.md](requirements.md) and the decisions in [PLAN.md](PLAN.md); references such as (R4.5), (Decision 9), or (D16) point there.

## Design goals

1. **No work on the request path except one synchronous comparison.** Three SHA-256 digests of short strings and two `timingSafeEqual` calls. No `await`, no AWS call.
2. **Fail closed, say why, say it once.** Every state in which the check cannot succeed gives `unverified` with one of six reason codes. Errors are logged once per failure episode, never once per request (R10.4).
3. **No public API growth beyond what was decided.** `ClientRequest.prime()` and `ClientRequest.isIngressVerified()` are the only additions. `CachedSecret` is not extended; the readers are private subclasses (Decision 2).
4. **Follow `ClientIpResolver`.** Static class, environment variable read on each call and memoized by raw value, one warning per distinct bad value, total functions, never throws.
5. **Keep the secret out of every log and object.** The package never stores the header value and never passes a secret to a logging call.
6. **Survive an outage.** A failed refresh keeps the last good value, waits 30 seconds before retrying, and never leaves a reader stuck.

## Pre-design findings

Observed by reading the code and by running probes on 2026-11-10 at `386c2f9`. Nothing was deployed.

| # | Finding | Consequence for the design |
|---|---------|----------------------------|
| P1 | `CachedParameterSecret`'s constructor calls `CachedParameterSecrets.add(this)`, which calls `this.getName()`, before a subclass's own fields exist (`CachedParametersSecrets.classes.js:366-371`, `:62-70`) | A reader cannot compute its registry key from an instance field. The version is a `static STAGE` on a thin subclass, read through `this.constructor.STAGE` |
| P2 | `needsRefresh()` is true whenever `cache.status < 0` (`:450-452`), and `prime()` refreshes when it is (`:480-485`). A failing read is therefore retried on every `prime()` | The readers override `needsRefresh()` with a 30-second wait after a failure (R4.11) |
| P3 | `refresh()` keeps the old `value` when a refresh fails, and `sync_getValue()` works while `value` is non-null (`:490-565`, `:578-590`) | An outage after the first load does not break verification (PLAN 4.1) |
| P4 | `refresh()`'s outer `catch` resolves -1 but leaves `cache.status` at 0 (`:557-561`), and `isRefreshing()` is `status === 0` | A thrown error would leave a reader refreshing forever. The readers reset status 0 to -1 after `refresh()` settles (R4.11) |
| P5 | On a non-2xx answer the extension path logs a warning and returns `reason: 'non-2xx'`, and `refresh()` does not fall back to the SDK (`:660-663`, `:525-531`) | A missing `AWSPREVIOUS` through the extension arrives as `non-2xx`. A hook is needed to log it at debug level (R4.2) |
| P6 | `CachedSecret._requestFromSdk` logs an error on every failure and returns `reason: error.message` (`:790-800`) | The readers override `_requestFromSdk` to add `VersionStage`, to treat `ResourceNotFoundException` for the previous version as "none", and to log once per episode |
| P7 | `AWS.secrets.get(params)` passes `params` unchanged to `GetSecretValueCommand` (`AWS.classes.js:582`) | `VersionStage` can be passed without changing `AWS` |
| P8 | The extension accepts `versionStage=AWSCURRENT|AWSPREVIOUS` on `secretsmanager/get`, caches for `SECRETS_MANAGER_TTL` (default 300 s, maximum 300 s) ([AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html)) | Path built as `CachedSecret.getPath()` builds it, with `&versionStage=` added |
| P9 | `RequestInfo._clientRequestInfo` lowercases header keys, reads `headers` only, and already holds `identity` (`RequestInfo.class.js:300-347`) | `sourceIp` is added there. The verifier receives the lowercased map |
| P10 | `getProps()` returns the live `#props` object (`ClientRequest.class.js:1438`) | `isIngressVerified()` reads a private field (R7.1) |
| P11 | `DebugAndLog.log(message, tag)` writes `[TAG] message` through `console.log` (`DebugAndLog.class.js:440-536`); with the Powertools bridge active it logs through the bridge | The line reads `[INGRESS_UNVERIFIED] {"reason":"mismatch"}` |
| P12 | `sanitize()` masks a header named `*secret*` by its last four characters and leaves text after a character outside `a-z 0-9 + _ : . - /` (probes in PLAN C4) | The documentation says never to log the header; no code relies on `sanitize()` |
| P13 | `ParameterKeySafety.checkSecretName` accepts `[a-zA-Z0-9_.+=@:/-]` up to 2048 characters and rejects `__proto__`-like segments (`ParameterKeySafety.class.js:56-181`) | Used as the allowlist for the secret id (D5). ARNs pass |
| P14 | The platform generates the secret with `PasswordLength: 48` and `ExcludePunctuation: true` and puts the whole `SecretString` in the header | The comparison is on the whole string, no JSON (D3) |

Still to observe (V1, Requirement 14): the SDK error name and message, and the extension's status and body, for a missing `AWSPREVIOUS` version; and whether `update-secret-version-stage --remove-from-version-id` detaches `AWSPREVIOUS`.

## Architecture

### Current

```
new ClientRequest(event, context)
  → RequestInfo._clientRequestInfo(event)      lowercases headers, resolves client.ip
  → #props.client = { ip, userAgent, origin, referrer, isAuthenticated, ... }
  → #validate()
```

### New

```
module load of ClientRequest.class.js
  → IngressVerifier.register()                  creates and registers the two readers if the variable is valid

Cold start (application)
  → await CachedParameterSecrets.prime()  or  await ClientRequest.prime()
      → current reader and previous reader refresh (extension or SDK)

Every request
  new ClientRequest(event, context)
    → RequestInfo._clientRequestInfo            adds client.sourceIp
    → IngressVerifier.evaluate(headers)         synchronous, returns { ingress, reason }
    → #ingress (private), #props.client.ingress
    → if unverified: DebugAndLog.log('{"reason":"…"}', "INGRESS_UNVERIFIED")
    → #validate()                               unchanged

On a mismatch
  → IngressVerifier starts refresh() of both readers, not awaited, at most once per 60 s
```

### Files

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/utils/IngressVerifier.class.js` | Configuration, evaluation, priming, mismatch refresh, failure bookkeeping |
| Create | `src/lib/utils/IngressSecretReaders.classes.js` | `IngressSecretReader` (shared), `IngressCurrentSecretReader`, `IngressPreviousSecretReader` |
| Modify | `src/lib/tools/CachedParametersSecrets.classes.js` | Add `_logNon2xxResponse(statusCode, path)` and call it where the warning is written today |
| Modify | `src/lib/tools/RequestInfo.class.js` | `client.sourceIp`; JSDoc |
| Modify | `src/lib/tools/ClientRequest.class.js` | Require the verifier and call `register()`; constructor; `isIngressVerified()`; `static prime()`; JSDoc and the `getProps()` typedef |
| Modify | `types/lib/tools/index.d.ts` | `ClientRequest.isIngressVerified()` and `ClientRequest.prime()` |
| Modify | `docs/features/tools/README.md` | "Ingress verification" subsection; warning; `getProps()` listing |
| Modify | `docs/cloudfront-notes/README.md` | Observation O9 |
| Modify | `CHANGELOG.md` | One entry under v1.4.1 "Added" |
| Modify | `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` | One sentence (R13.4) |
| Create | `test/request/ingress/...` | See Testing strategy |

`IngressVerifier` and the readers are not exported from `src/index.js` or `src/lib/tools/index.js`, and are not named in `types/` (R11.4).

## Components and interfaces

### IngressVerifier

Static class, no instances. Private state is held in `static #` fields.

```javascript
class IngressVerifier {
	static SECRET_HEADER = "x-atlantis-origin-secret";
	static ENV_SECRET_NAME = "CACHE_DATA_INGRESS_SECRET_NAME";
	static ENV_REFRESH_SECONDS = "CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS";
	static DEFAULT_REFRESH_SECONDS = 3600;
	static MIN_REFRESH_SECONDS = 60;
	static MAX_REFRESH_SECONDS = 86400;
	static MISMATCH_REFRESH_COOLDOWN_MS = 60000;
	static INGRESS = Object.freeze({ DIRECT: "direct", CLOUDFRONT: "cloudfront", UNVERIFIED: "unverified" });
	static REASON = Object.freeze({
		MISSING_HEADER: "missing-header", MISMATCH: "mismatch", SECRET_NOT_PRIMED: "secret-not-primed",
		SECRET_UNAVAILABLE: "secret-unavailable", SECRET_UNUSABLE: "secret-unusable", BAD_CONFIGURATION: "bad-configuration"
	});

	static register()                    // → void. Creates and registers the readers when the variable is valid. Idempotent. Never throws.
	static evaluate(headers)             // → { ingress, reason }. Synchronous. Never throws.
	static async prime()                 // → Promise<boolean>. Never rejects.
	static reset()                       // FOR TESTING ONLY. Clears memo, episode set, cooldown, and the held readers (not the registry).
}
```

The header constant is the lowercase form of the platform's `X-Atlantis-Origin-Secret` (D2). `evaluate` returns one of seven frozen result objects (`direct`, `cloudfront`, and one `unverified` per reason code), so the request path allocates nothing.

**Configuration (R1).** Two memoized reads, each keyed by raw value with a `Symbol` as the "not read yet" marker, as `ClientIpResolver` does.

```javascript
static #readName() {
	const raw = process.env[IngressVerifier.ENV_SECRET_NAME];
	if (raw === IngressVerifier.#nameRaw) { return IngressVerifier.#nameConfig; }
	IngressVerifier.#nameRaw = raw;
	const trimmed = (typeof raw === "string") ? raw.trim() : "";
	if (trimmed === "") {
		IngressVerifier.#nameConfig = { kind: "unset", secretId: null };
	} else if (ParameterKeySafety.checkSecretName(trimmed).safe) {   // also rejects > 2048 characters
		IngressVerifier.#nameConfig = { kind: "ok", secretId: trimmed };
	} else {
		IngressVerifier.#nameConfig = { kind: "invalid", secretId: null };
		// >! JSON.stringify escapes quotes and control characters, so an environment value can't forge or split the log line
		DebugAndLog.error(`${ENV_SECRET_NAME} is not a valid Secrets Manager secret name or ARN. Received ${JSON.stringify(raw)}. The ingress check will report unverified (bad-configuration).`);
	}
	return IngressVerifier.#nameConfig;
}
```

The refresh interval is read the same way: unset or blank gives 3600 silently; digits only and 60 to 86400 gives that number; anything else logs one `DebugAndLog.warn` per distinct raw value and gives 3600 (R1.6). When the interval changes, `#applySeconds()` writes `cache.refreshAfter` on the existing readers, so no reader is re-created and the registry keeps pointing at the instances the verifier holds.

**Readers.** `#ensureReaders(secretId, seconds)` returns `{ secretId, current, previous }`. If the held pair has a different `secretId`, a new pair is created (the old pair stays in the registry under its own keys). The constructors are called with `{ refreshAfter: seconds }`. `register()` calls `#readName()`, and when the kind is `ok` calls `#ensureReaders`. `ClientRequest.class.js` calls `IngressVerifier.register()` once at module scope (R1.5). `evaluate()` and `prime()` also call it, so a variable that becomes valid later is picked up (R1.5).

**Evaluation (R3).** Pseudocode, in the order of the table in R3.2:

```javascript
static evaluate(headers) {
	try {
		const config = IngressVerifier.#readName();
		if (config.kind === "unset") { return RESULT_DIRECT; }                                  // row 1
		if (config.kind === "invalid") { return RESULT.BAD_CONFIGURATION; }                    // row 2

		const readers = IngressVerifier.#ensureReaders(config.secretId, IngressVerifier.#readSeconds());
		const currentValue = readers.current.secretValue();       // string or null
		if (!readers.current.hasSettled()) {                                                     // row 3
			return IngressVerifier.#failing("not-primed", RESULT.SECRET_NOT_PRIMED, NOT_PRIMED_MESSAGE);
		}
		if (currentValue === null) {                                                             // row 4
			return IngressVerifier.#failing("unavailable", RESULT.SECRET_UNAVAILABLE, null);   // the reader already logged
		}
		if (IngressVerifier.#isUnusable(currentValue)) {                                         // row 5
			return IngressVerifier.#failing("unusable", RESULT.SECRET_UNUSABLE, UNUSABLE_MESSAGE);
		}
		// the current value is good: the "not-primed", "unavailable", and "unusable" episodes end
		IngressVerifier.#episodes.delete("not-primed");
		IngressVerifier.#episodes.delete("unavailable");
		IngressVerifier.#episodes.delete("unusable");

		let outcome;
		const header = headers?.[IngressVerifier.SECRET_HEADER];
		if (typeof header !== "string" || header === "") {
			outcome = RESULT.MISSING_HEADER;                                                    // row 6
		} else {
			const previousValue = readers.previous.secretValue();
			const previousUsable = (previousValue !== null && !IngressVerifier.#isUnusable(previousValue));
			const headerDigest = digest(header);
			const matchesCurrent = timingSafeEqual(headerDigest, digest(currentValue));
			const matchesPrevious = previousUsable ? timingSafeEqual(headerDigest, digest(previousValue)) : false;

			if (matchesCurrent || matchesPrevious) {
				outcome = RESULT_CLOUDFRONT;                                                    // row 7 (both compared first)
			} else {
				IngressVerifier.#startMismatchRefresh(readers);                                 // row 8
				outcome = RESULT.MISMATCH;
			}
		}
		IngressVerifier.#episodes.delete("exception");           // completed without throwing: an exception episode ends
		return outcome;
	} catch (error) {
		return IngressVerifier.#failing("exception", RESULT.SECRET_UNAVAILABLE, `...${error?.message}`);   // R3.7
	}
}
```

`digest(s)` is `crypto.createHash("sha256").update(s, "utf8").digest()` from `node:crypto`. Both operands of `timingSafeEqual` are 32-byte buffers, so the call cannot throw on a length difference, and the header's length is not observable. `#isUnusable(v)` is `v.trim() === "" || v.trim().toUpperCase() === "BLANK"` (Decision 3). A `previousValue` that is unusable is ignored and does not change the result (R3.3).

`#failing(key, result, message)` implements the once-per-episode rule: if `key` is not in `#episodes`, it adds it and, when `message` is not null, calls `DebugAndLog.error(message)`; then it returns `result`. The `"not-primed"`, `"unavailable"`, and `"unusable"` keys leave the set when rows 3 to 5 pass, and the `"exception"` key leaves only when `evaluate` completes without throwing, so a later failure logs again. (Corrected in task 5.3: the first draft cleared every key before reading the header, which made a header read that throws log an error on every request instead of once per episode.) Messages never contain a value from the header or the secret. The secret id may appear.

`NOT_PRIMED_MESSAGE` reads: `The ingress secret has not been loaded. Call await ClientRequest.prime() or await CachedParameterSecrets.prime() before creating a ClientRequest. Requests are reported as unverified until it loads.`

**Mismatch refresh (R6, D19).**

```javascript
static #startMismatchRefresh(readers) {
	const now = Date.now();
	if (now - IngressVerifier.#lastMismatchRefreshAt < MISMATCH_REFRESH_COOLDOWN_MS) { return; }
	IngressVerifier.#lastMismatchRefreshAt = now;
	// >! Not awaited: the request that mismatched is already answered unverified. refresh() returns the running promise when a read is in progress, so no second read starts.
	Promise.resolve(readers.current.refresh()).catch(() => {});
	Promise.resolve(readers.previous.refresh()).catch(() => {});
}
```

The cooldown starts counting at the start of the last refresh. `refresh()` is called, not `prime()`, so an unexpired value is reloaded. The 30-second failure wait lives in `needsRefresh()` and does not apply to a direct `refresh()` call (R4.11).

**Priming (R5).**

```javascript
static async prime() {
	try {
		IngressVerifier.register();
		const config = IngressVerifier.#readName();
		if (config.kind === "unset") { return true; }
		if (config.kind === "invalid") { return false; }
		const readers = IngressVerifier.#readers;
		await Promise.all([readers.current.prime(), readers.previous.prime()]);
		return readers.current.secretValue() !== null;
	} catch (error) {
		DebugAndLog.error(`IngressVerifier.prime(): ${error?.message}`, error?.stack);
		return false;
	}
}
```

`reader.prime()` is the inherited one: it refreshes only when `needsRefresh()` is true, otherwise returns the stored promise. Calling it together with `CachedParameterSecrets.prime()` is therefore safe (R5.4).

### Ingress secret readers

File `src/lib/utils/IngressSecretReaders.classes.js`. All three classes are `@private`.

```javascript
class IngressSecretReader extends CachedSecret {
	static STAGE = null;                       // set by the thin subclasses
	static RETRY_WAIT_AFTER_FAILURE_MS = 30000;

	#settled = false;
	#failing = false;
	#lastFailureAt = 0;

	getName()    { return `${this.name}#${this.constructor.STAGE}`; }      // registry key (R4.3); safe before fields exist (P1)
	getNameTag() { return `${this.name} [${this.constructor.name} ${this.constructor.STAGE}]`; }
	getPath()    { return `/secretsmanager/get?secretId=${encodeURIComponent(this.name)}&versionStage=${this.constructor.STAGE}&withDecryption=true`; }

	hasSettled() { return this.#settled; }
	secretValue() { return (this.isValid() && typeof this.value.SecretString === "string") ? this.value.SecretString : null; }

	needsRefresh() {
		if (this.cache.status < 0 && this.#lastFailureAt !== 0 && (Date.now() - this.#lastFailureAt) < IngressSecretReader.RETRY_WAIT_AFTER_FAILURE_MS) { return false; }   // R4.11
		return super.needsRefresh();
	}

	async refresh() {
		const status = await super.refresh();
		if (this.cache.status === 0) { this.cache.status = -1; }                 // R4.11: never stuck refreshing (P4)
		this.#settled = true;
		this.#recordOutcome(this.cache.status);
		return status;
	}

	isValid() { return super.isValid(); }     // CachedSecret: value is an object with SecretString
}

class IngressCurrentSecretReader  extends IngressSecretReader { static STAGE = "AWSCURRENT"; }
class IngressPreviousSecretReader extends IngressSecretReader { static STAGE = "AWSPREVIOUS"; ... }
```

`#recordOutcome(status)` implements the episode rule for reads: a status below 0 sets `#lastFailureAt = Date.now()` and, if `#failing` was false, writes one `DebugAndLog.error` for the current reader or one `DebugAndLog.warn` for the previous reader, naming the secret id and the stage but no value (R4.6, R4.7); a status of 1 clears `#failing` and `#lastFailureAt`. A "no previous version" result has status 1, so it is never a failure.

**SDK path (`_requestFromSdk`).** Both readers call `AWS.secrets.get({ SecretId: this.name, VersionStage: this.constructor.STAGE })`, with `AWS` required lazily as `CachedParametersSecrets.classes.js` does.

- Current reader: on success, `{ ok: true, value: response }`; on any error, `{ ok: false, value: null, reason: error.message }` and no logging here (the outcome is logged once by `#recordOutcome`).
- Previous reader: an error whose `name` is `ResourceNotFoundException` returns `{ ok: true, value: NO_PREVIOUS_VERSION }` where `NO_PREVIOUS_VERSION` is a frozen object with no `SecretString`; its `isValid()` is false, so `secretValue()` is `null`, and `cache.status` becomes 1, so it is not re-read before the interval (R4.5, D16). Any other error returns `{ ok: false, ... }`. The error name is confirmed or corrected by V1 (R4.10).

**Extension path.** Inherited, with the version in `getPath()`. The previous reader adds:

```javascript
_logNon2xxResponse(statusCode, path) {            // called by the base class (the hook, below)
	this.#lastNon2xxStatus = statusCode;
	DebugAndLog.debug(`IngressPreviousSecretReader: HTTP ${statusCode} for the previous version of ${this.name}; treating as no previous version`);
}

async _requestSecretsFromLambdaExtension() {
	this.#lastNon2xxStatus = null;
	const result = await super._requestSecretsFromLambdaExtension();
	if (!result.ok && result.reason === "non-2xx" && PREVIOUS_MISSING_STATUS.has(this.#lastNon2xxStatus)) {
		return { ok: true, value: NO_PREVIOUS_VERSION, reason: null };
	}
	return result;
}
```

`PREVIOUS_MISSING_STATUS` is a predicate over the status code. It starts as "any non-2xx" (R14.6) and is narrowed to the statuses V1 shows if the extension is exercised. Other non-2xx results fall through to the base class, which marks the read failed, so the previous reader records one warning for the episode and the previous value is treated as absent (R3.3).

### The base-class hook

In `CachedParameterSecret._requestSecretsFromLambdaExtension`, the line that writes the non-2xx warning changes from

```javascript
DebugAndLog.warn(`CachedParameterSecret http: Non-2xx ${res.statusCode} for ${options.path}`);
```

to

```javascript
this._logNon2xxResponse(res.statusCode, options.path);
```

and the class gains

```javascript
/**
 * Writes the log entry for a non-2xx answer from the extension. Subclasses may override it.
 * @private
 */
_logNon2xxResponse(statusCode, path) {
	DebugAndLog.warn(`CachedParameterSecret http: Non-2xx ${statusCode} for ${path}`);
}
```

The default writes the same message at the same level, so existing behavior and tests are unchanged. A test asserts it (Testing strategy).

### RequestInfo

In `_clientRequestInfo`, the default `client` object gains `sourceIp: null`, and after `identity` is resolved:

```javascript
// >! sourceIp is the connection API Gateway received. No header can change it, so it is stored as given.
if (typeof identity.sourceIp === "string" && identity.sourceIp !== "") { client.sourceIp = identity.sourceIp; }
```

`identity` is already `{}` when `requestContext` or `identity` is missing or `null`. `client.ip` and `ClientIpResolver` are untouched (R2.4). No getter is added (D11).

### ClientRequest

```javascript
const IngressVerifier = require('../utils/IngressVerifier.class');
IngressVerifier.register();          // creates and registers the readers when the variable is valid (R1.5)

class ClientRequest extends RequestInfo {
	#ingress = IngressVerifier.INGRESS.DIRECT;      // set once in the constructor (R7.1)
	...
	constructor(event, context) {
		super(event);
		...
		const ingressResult = IngressVerifier.evaluate(this.getClientHeaders());
		this.#ingress = ingressResult.ingress;
		this.#props = {
			...
			client: {
				ip: this.getClientIp(),
				sourceIp: this.getClient("sourceIp"),
				ingress: ingressResult.ingress,
				userAgent: ..., origin: ..., referrer: ..., isAuthenticated: ..., isGuest: ..., authorizations: ..., roles: ...
			},
			...
		};
		if (ingressResult.ingress === IngressVerifier.INGRESS.UNVERIFIED) {
			DebugAndLog.log(JSON.stringify({ reason: ingressResult.reason }), "INGRESS_UNVERIFIED");
		}
		...
	}

	isIngressVerified() { return this.#ingress === IngressVerifier.INGRESS.CLOUDFRONT; }
	static prime() { return IngressVerifier.prime(); }
}
```

`getClientHeaders()` returns the lowercased map. The log call is not awaited, as the other `DebugAndLog` calls in the class are not. The reason is one of six fixed strings, so `JSON.stringify` output has no free text. `isValid()`, `#validate()`, and `getValidationReason()` are not touched (R7.4). `Response._log` is not touched (R8.5).

The `getProps()` JSDoc typedef gains `sourceIp: string|null` and `ingress: "direct"|"cloudfront"|"unverified"`.

### Types

In `types/lib/tools/index.d.ts`, `class ClientRequest`:

```typescript
/**
 * Whether the request came through the distribution that holds the ingress secret.
 * ...
 * @returns true only when getProps().client.ingress was "cloudfront" at construction
 */
isIngressVerified(): boolean;

/**
 * Loads the ingress secret before the first request. Resolves true when ...
 */
static prime(): Promise<boolean>;
```

`getProps()` stays undeclared (D12).

## Execution flows

### Cold start with `CachedParameterSecrets` priming

```
require("@63klabs/cache-data")  → ClientRequest.class.js loads → IngressVerifier.register()
                                    variable valid → current and previous readers created, registered under "<id>#AWSCURRENT" / "<id>#AWSPREVIOUS"
handler, first invocation        → await Config.prime() → CachedParameterSecrets.prime()
                                    current.prime(): needsRefresh (status -1, never failed) → refresh() → extension or SDK
                                    previous.prime(): same; "no previous version" is stored as status 1
                                 → new ClientRequest(event) → evaluate → row 7 or 8
```

### Application without the registry

```
handler → await ClientRequest.prime() → IngressVerifier.prime() → both readers prime → true
```

### A request with a stale copy after a rotation

```
put new value → distribution switches → container still holds current = old, previous = older
request with the new header → evaluate → row 8 (mismatch) → INGRESS_UNVERIFIED {"reason":"mismatch"}
  → #startMismatchRefresh: no start within 60 s of the last? start refresh() of both readers, not awaited
next request after the refresh finished → current = new, previous = old → row 7
```

With the extension layer the forced refresh may return the extension's cached copy (at most 300 s old). The next mismatch, 60 seconds later, tries again (R6.7).

### Secrets Manager unavailable

```
refresh fails → status -1, old value kept → verification continues with the old value (P3)
needsRefresh() stays false for 30 s, then true → one retry per prime() after that
first failure of the episode → one DebugAndLog.error; later failures are quiet; a success ends the episode
cold start during an outage → no value → row 4 (secret-unavailable) for every request until a read succeeds
```

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| Variable unset, empty, or only whitespace | `direct`; no reader, no read, no log | 1.1 |
| Variable fails `checkSecretName` or is longer than 2048 characters | `unverified`, `bad-configuration`; one error per distinct raw value; no reader | 1.3 |
| Interval variable invalid or out of range | 3600; one warning per distinct raw value | 1.6 |
| Current reader never finished a read | `unverified`, `secret-not-primed`; one error per episode naming both fixes | 3.2 |
| Current read finished with no value | `unverified`, `secret-unavailable`; the reader logged once for the episode | 3.2, 4.7 |
| Current value empty, whitespace, or `BLANK` | `unverified`, `secret-unusable`; one error per episode | 3.2, D10 |
| Header absent, empty, an array, or not a string | `unverified`, `missing-header`; no refresh | 3.2, 6.3 |
| Header differs from both values | `unverified`, `mismatch`; one forced, non-awaited refresh per 60 s per container | 3.2, 6.1, 6.2 |
| Previous version does not exist | Previous reader stores "none" with status 1; debug log; not re-read before R | 4.5 |
| Previous read fails otherwise | One warning per episode; previous treated as absent | 4.6, 3.3 |
| Current read fails after an earlier success | Old value kept; one error per episode; retry after 30 s | 4.7, 4.11 |
| A reader would stay in the refreshing state | Status reset from 0 to -1 | 4.11 |
| Unexpected exception inside `evaluate()` | Result `unverified`, `secret-unavailable`; one error with the message only | 3.7 |
| `IngressVerifier.prime()` throws | Logged; resolves `false` | 5.2 |
| `headers` is `null`, `undefined`, or not an object | Treated as no header: `missing-header` | 3.2 |
| `identity.sourceIp` missing, empty, or not a string | `client.sourceIp` is `null` | 2.1 |

## Correctness properties

Properties 1 to 6 and 9 run in `test/request/ingress/property/ingress-verifier-property-tests.jest.mjs`; Property 7 in the integration file; Property 8 in the mismatch-refresh unit file. None spawns a process, so each uses at least 100 runs, except Property 9, which drives fake time and uses 100. None passes `seed`.

Shared arbitraries, all valid by construction:

- `secret`: `fc.stringMatching(/^[a-zA-Z0-9]{24,64}$/)`. Never empty, whitespace, or `BLANK` (the pattern has no whitespace and `BLANK` has 5 characters).
- `wrongHeader(secret)`: `"!" + s` for any `fc.string()` s. The `!` is outside the secret alphabet, so no draw can equal any secret.
- `nearMiss(secret)`: the secret with the character at index i replaced by the next character of `"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"` after it (wrapping). It differs from the secret at index i by construction.
- `casing`: a function of the header name that upper-cases each letter by a drawn boolean mask.
- `notAString`: `fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer(), fc.boolean(), fc.array(fc.string()))`.
- `readerState`: `fc.constantFrom("unprimed", "settled-no-value", "value", "unusable")`.

Two `CachedSecret` readers cannot be built cheaply per run, so the properties use `IngressVerifier.evaluate` over real readers with `AWS.secrets.get` mocked, loaded once per run through `ClientRequest.prime()`, with unique secret ids so the registry never reuses a reader. The generators build the state; the model in Property 9 is a separate decision list.

**Property 1 — A wrong header never verifies.** *For any* `secret` S and any `wrongHeader(S)` or `nearMiss(S)` H, with S loaded as the current value and no previous value, `evaluate({ "x-atlantis-origin-secret": H })` has ingress `unverified` and reason `mismatch`. **Validates: R3.2 row 8, R3.8, R10.1**

**Property 2 — The header name is case-insensitive.** *For any* `secret` S and `casing` function C, `new ClientRequest(event)` built from an event whose headers contain `C("X-Atlantis-Origin-Secret"): S` has `getProps().client.ingress === "cloudfront"`. **Validates: R3.6**

**Property 3 — Current and previous verify; older does not.** *For any* distinct secrets A, B, and C: with current = B and previous = A, header A and header B verify and header C does not; with no previous value, header A does not. **Validates: R3.2 row 7, R3.3, R4.1**

**Property 4 — Non-strings and empty headers never verify.** *For any* `notAString` value or the empty string as the header, the result is `unverified` with reason `missing-header` and no mismatch refresh starts. **Validates: R3.2 row 6, R6.3**

**Property 5 — An unusable secret never verifies.** *For any* header H (any string, including the secret's own text) and a current value drawn from `fc.constantFrom("", " ", "\t\n", "BLANK", "blank", "Blank")`, the result is `unverified` with reason `secret-unusable`. **Validates: R3.2 row 5, Decision 3**

**Property 6 — Total.** *For any* `headers` from `fc.anything()` and any reader state, `evaluate` does not throw and returns an object whose `ingress` is one of three values and whose `reason` is `null` or one of six values. **Validates: R3.7, R10.1**

**Property 7 — The secret is never logged.** *For any* `secret` S, header H, and sequence of requests, no argument of any `DebugAndLog.log`, `error`, `warn`, `info`, or `debug` call made while S and H are in play contains S or H. H is always `"!"` followed by drawn text, and the package's own messages contain no `"!"`, so H cannot appear in a message by chance. A separate example test asserts that none of the package's messages contains `"!"`. **Validates: R10.2, R8.3**

**Property 8 — The mismatch refresh is rate-limited.** *For any* non-decreasing list of mismatch times in milliseconds, with `Date.now` mocked, the number of forced refresh starts of the current reader is at most `floor((last − first) / 60000) + 1`, and two starts are never less than 60,000 ms apart. **Validates: R6.2**

**Property 9 — Decision table.** *For any* combination of (variable state, current reader state, previous reader state, header kind), the `(ingress, reason)` pair equals the pair given by a model that is a plain ordered list of conditions written in the test. The model shares the rule of R3.2, not the code. **Validates: R3.2**

Property 3 draws A, B, and C as three values from one `fc.uniqueArray(secret, { minLength: 3, maxLength: 3 })`, so they are distinct by construction. Property 5 does not filter on the predicate under test.

## Testing strategy

Every test file is `.jest.mjs`, imports its globals from `@jest/globals`, and imports CommonJS modules with `(await import(path)).default` (internal classes directly, as other tests do for `src/lib/utils`). Nothing invokes `npm test` or spawns a child process. Files that touch `process.env` save it in `beforeEach` and restore it in `afterEach`; files that spy call `jest.restoreAllMocks()` in `afterEach`. Every test calls `IngressVerifier.reset()` and `ExtensionAvailability.reset()` in `beforeEach`, and uses a secret id unique to the test, because `CachedParameterSecrets` has no reset and keeps every reader.

Transport control: tests call `ExtensionAvailability.markUnavailable(ExtensionAvailability.REASON.OVERRIDE)` to force the SDK path and mock `AWS.secrets` with `jest.spyOn(tools.default.AWS, "secrets", "get")`, as `test/helpers/aws-parameter-mocks.mjs` does. Extension tests mock `http.request`. Time-dependent tests mock `Date.now` with `jest.spyOn(Date, "now")` rather than fake timers, because `needsRefresh()` and the cooldown read `Date.now()` and nothing uses timers.

### Test files

| File | Contents | Requirements |
|---|---|---|
| `test/request/ingress/unit/ingress-verifier-config-tests.jest.mjs` | Unset, empty, whitespace, valid, invalid, over-long secret id; memo by raw value; one error per distinct bad value; interval parsing and range; `register()` idempotent; no reader when unset or invalid | R1 |
| `test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs` | Every row of the R3.2 table; previous value absent, unusable, failing; rotation; `direct` returns the same `getProps()` apart from two fields; error episodes (one error across many requests, again after recovery) | R3, R10 |
| `test/request/ingress/unit/ingress-verifier-prime-tests.jest.mjs` | `prime()` results for unset, invalid, loaded, not loaded, never-rotated secret; together with `CachedParameterSecrets.prime()`; no second read while one runs | R5 |
| `test/request/ingress/unit/ingress-verifier-mismatch-refresh-tests.jest.mjs` | One start on a mismatch; none inside 60 s; none for missing, empty, non-string header, unusable, not primed; the next request sees the new values; a running read is not started twice; Property 8 | R6 |
| `test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs` | Registry keys; extension path and SDK parameters carry the stage; `ResourceNotFoundException` and non-2xx become "no previous version" with status 1 and a debug log; no re-read before R; other failures warn once; 30-second wait after a failure; forced refresh not blocked; status 0 reset; old value kept after a failed refresh; the base hook default still writes the existing warning | R4 |
| `test/request/ingress/unit/request-info-source-ip-tests.jest.mjs` | Present, missing `requestContext`, `null` identity, empty string, non-string; `client.ip` unchanged | R2 |
| `test/request/ingress/unit/client-request-ingress-tests.jest.mjs` | `getProps().client.ingress` and `sourceIp`; `isIngressVerified()` for the three values; changing `getProps()` does not change `isIngressVerified()`; `isValid()` unchanged for `unverified`; one `INGRESS_UNVERIFIED` line with exactly `{"reason":"<code>"}`; no line for `direct` and `cloudfront`; `RESPONSE` still 13 fields; `ClientRequest.prime()` results | R5, R7, R8, R2 |
| `test/request/ingress/unit/ingress-not-exported-tests.jest.mjs` | `src/index.js`, `src/lib/tools/index.js`, and every file under `types/` do not contain `IngressVerifier` or `IngressSecretReader` | R11.4 |
| `test/request/ingress/property/ingress-verifier-property-tests.jest.mjs` | Properties 1 to 6 and 9 | R3, R10 |
| `test/request/ingress/integration/ingress-log-secrecy-tests.jest.mjs` | Property 7 over complete request sequences | R10.2 |

### Changes to existing tests

None are expected. After implementing, run `test/request/`, `test/utils/`, `test/documentation/`, and the cached-secrets tests first, then the full suite. If a test asserts the exact key set of `getProps().client` or of `RequestInfo`'s client object, it changes by the two new keys.

### Lint

New and modified files must not add ESLint errors relative to the baseline. `npm run lint:ci` already fails on the baseline, so check only the new files, for example with `npx eslint src/lib/utils/IngressVerifier.class.js src/lib/utils/IngressSecretReaders.classes.js`.

### Full-suite gate

`npm test`, the `test/documentation/` tests, and `npm run test:types` pass before the changelog task is marked done (R15.10).

## Documentation design

### `docs/features/tools/README.md`

A new `##### Ingress verification` subsection directly after `##### Origin lock for your own CloudFront (T2 and T3)` and before `##### Check your deployment`. Outline:

1. **What it proves.** One paragraph: a request carries the secret CloudFront adds, so it passed through a distribution configured with it. It is not authentication. Anyone who can read the distribution configuration can read it. Link to the platform's [API ingress standard](https://github.com/63Klabs/atlantis-sam-templates/blob/main/docs/end-user/api-ingress-standard.md).
2. **Setup.** Numbered: (1) enable `ApiOriginProtection` on the network stack and create the secret in the application stack (link, no copy); (2) set the two environment variables (table below); (3) grant `secretsmanager:GetSecretValue` on the secret (and `kms:Decrypt` for a customer-managed key), with a CloudFormation `Policies` snippet using PascalCase names; (4) prime; (5) guard.

   | Variable | Default | Meaning |
   |---|---|---|
   | `CACHE_DATA_INGRESS_SECRET_NAME` | unset | Name or ARN of the secret. Unset or empty turns the check off (`direct`) |
   | `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` | `3600` | Seconds before a loaded secret is read again. 60 to 86400 |

3. **Handler example**, following the documentation standards:

   ```javascript
   const { tools: { ClientRequest, Response } } = require("@63klabs/cache-data");

   exports.handler = async (event, context) => {
   	// Load the ingress secret before creating a ClientRequest.
   	// Not needed if Config.prime() already calls CachedParameterSecrets.prime().
   	await ClientRequest.prime();

   	const clientRequest = new ClientRequest(event, context);
   	const response = new Response(clientRequest);

   	if (!clientRequest.isIngressVerified()) {
   		// 401, not 403 or 404: the Atlantis distribution rewrites those two to its landing page with HTTP 200
   		response.setStatusCode(401);
   		response.addHeader("Cache-Control", "no-store");
   		response.addHeader("Expires", "0");
   		response.setBody({ message: "Unauthorized" });
   		return response.finalize();
   	}

   	// ... handle the request ...
   	return response.finalize();
   };
   ```

4. **Values and reason codes.** The `ingress` table and the reason-code table of R9.1.
5. **The log line.** `[INGRESS_UNVERIFIED] {"reason":"mismatch"}`; a Logs Insights query:

   ```
   fields @timestamp, @message
   | filter @message like /INGRESS_UNVERIFIED/
   | parse @message '"reason":"*"' as reason
   | stats count() by reason, bin(5m)
   ```

   and the monitor-first rollout (set the variable, watch the line, then enforce).
6. **Rotating the secret.** The table and steps of PLAN Section 6.3, the 65-minute wait at the default, what the mismatch refresh does and does not do, the warning not to put a second value before the distribution updates, and the suspected-leak path. The label-removal command appears only if V1 confirms it (R12.5).
7. **Limits.** REST API events only; `sourceIp` is an edge address on an edge-optimized API behind your own CloudFront (link O3) and `null` for an HTTP API event; never log the header (the `sanitize()` limits, R10.5).

The "Origin lock" warning gets one more sentence naming `CACHE_DATA_INGRESS_SECRET_NAME` and linking `#ingress-verification` (R12.2). The `getProps()` listing gains:

```
    sourceIp: "x.x.x.x", // address API Gateway received (identity.sourceIp), or null
    ingress: "direct", // "direct" (no ingress secret configured), "cloudfront" (secret verified), or "unverified"
```

### `docs/cloudfront-notes/README.md`

One row after O8:

| ID | Date | Topology | What was sent | What was seen | AWS documents it? | Effect on this package |
|----|------|----------|---------------|---------------|-------------------|------------------------|
| O9 | 2026-11-09 | T2 and T3 | A request with a viewer-sent `X-Atlantis-Origin-Secret` through a distribution whose origin custom headers include the same name | The API received the distribution's value. The viewer's value was replaced. Measured by the maintainer on a temporary stack (atlantis-sam-templates #10), not re-measured here | Yes: "If a header is present, CloudFront overwrites the header value before forwarding the request to the origin" ([Add custom headers to origin requests](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)) | A viewer cannot present a header value through the distribution, so a matching header proves the request passed through a distribution configured with the secret |

### JSDoc

`IngressVerifier` and the three reader classes: full JSDoc with `@private`. `ClientRequest.prime`, `ClientRequest.isIngressVerified`, the class comment, the `getProps()` typedef, and `RequestInfo._clientRequestInfo` are in `src/lib/tools`, so `test/documentation` validates them: description, `@param`, `@returns`, `@example`, names matching signatures. They name `docs/features/tools/README.md` by path, without a link (R12.7).

### CHANGELOG

One entry under `## v1.4.1 (unreleased)` / `### Added`, placed with the other v1.4.1 "Added" entries, with no existing line changed:

```markdown
- **Ingress verification** — When `CACHE_DATA_INGRESS_SECRET_NAME` names a Secrets Manager secret, `ClientRequest` compares the `X-Atlantis-Origin-Secret` header that the Atlantis network template adds at CloudFront with the secret's current and previous values and reports `getProps().client.ingress` as `direct` (not configured), `cloudfront` (verified), or `unverified`. Rejection stays in your handler. A request that skips your distribution can no longer pass as one that went through it. [Spec: 1-4-1-clientrequest-report-whether-a-request-came](.kiro/specs/1-4-1-clientrequest-report-whether-a-request-came/) addresses [#254](https://github.com/63Klabs/cache-data/issues/254)
  - New `ClientRequest.isIngressVerified()` (true only for `cloudfront`) and `ClientRequest.prime()` (loads the secret; not needed if you call `CachedParameterSecrets.prime()`).
  - New `getProps().client.sourceIp`, the address API Gateway received. `client.ip` is unchanged.
  - New `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` (default `3600`, 60 to 86400). A header that matches neither value reloads the secret, at most once a minute per container, so a rotation heals itself.
  - Every unverified request writes one `INGRESS_UNVERIFIED` log line with a reason code. The `RESPONSE` line is unchanged.
  - Requires `secretsmanager:GetSecretValue` on the secret. Documentation: the ingress verification section of `docs/features/tools/README.md`, and observation O9 in `docs/cloudfront-notes/README.md`.
```

### Security advisory draft

One sentence added to the origin-lock recommendation (R13.4), after the paragraph that ends at the Lambda authorizer link:

> If you use the Atlantis network template, enable `ApiOriginProtection` and set `CACHE_DATA_INGRESS_SECRET_NAME` (v1.4.1) so that `getProps().client.ingress` and `isIngressVerified()` tell you whether a request passed through your distribution.

## V1 check procedure

Run at the start of implementation (Decision 7), before the previous reader is written. Region `us-east-2`, profile `release`. The temporary secret name starts with `kiro-probe-`. Record only results, never identifiers.

1. `aws secretsmanager create-secret --name kiro-probe-ingress-<n> --secret-string first --profile release --region us-east-2`
2. `aws secretsmanager get-secret-value --secret-id kiro-probe-ingress-<n> --version-stage AWSPREVIOUS ...` — expect a not-found error. Record the error name and message.
3. `aws secretsmanager put-secret-value --secret-id ... --secret-string second ...`
4. The same `get-secret-value --version-stage AWSPREVIOUS` — expect `first`.
5. After approval of the write: `aws secretsmanager update-secret-version-stage --secret-id ... --version-stage AWSPREVIOUS --remove-from-version-id <version id of first> ...`, then `get-secret-value --version-stage AWSPREVIOUS` again. Record whether the label was removed and what the read returns.
6. `aws secretsmanager delete-secret --secret-id ... --force-delete-without-recovery ...`, then `list-secrets --filters Key=name,Values=kiro-probe-` to confirm none remain.

If the SSO token has expired, stop and ask for a new login. The extension is exercised only if a function with the layer already exists (R14.6). Results go in a short "V1 results" section appended to this document.

## Backwards compatibility analysis

| Surface | Change | Effect on existing code |
|---|---|---|
| `getProps().client` | Two new keys: `sourceIp` and `ingress` | None unless code compares the whole object with a fixed shape |
| `RequestInfo` client object | One new key: `sourceIp` | None unless code compares the whole object |
| `ClientRequest` | New method `isIngressVerified()`, new static `prime()` | None |
| Environment | Two new variables. Unset gives `direct` and no work | None |
| `CachedParameterSecret` | One new internal method; same default output | None |
| `CachedSecret`, `CachedParameterSecrets` | Not modified | None |
| `isValid()`, status codes, `RESPONSE` line | Not modified | None |
| Logs | One new line type, only for unverified requests and only when the variable is set | Metric filters that match everything would count it |
| Exports and `types/` | Two declarations added | None |

Applications that set the variable and do not prime see every request as `unverified` with reason `secret-not-primed` until the secret loads. That is the intended fail-closed behavior, documented as a setup step.

## Known limitations

- **Stale copies.** A container can hold the old value for up to R plus 300 s after a rotation. The mismatch refresh shortens the rejected window to minutes; the recommended wait avoids it.
- **Retiring a value.** A retired value keeps working in containers until their cache expires, because a request that matches the cached previous value causes no mismatch.
- **Extension TTL.** With the layer, a forced refresh can return a copy up to 300 s old.
- **Per container.** The cooldown, the failure wait, and the episode log are per container. Many containers mean many reloads and many error lines in an outage.
- **Cold start during an outage.** No value can be loaded, so an enforcing application rejects traffic until a read succeeds.
- **REST events only.** An HTTP API event has no `identity.sourceIp`, and `ClientRequest` does not read its headers or paths today.
- **The existing refresh catch.** The base `refresh()` leaves `cache.status` at 0 on an unexpected exception. The readers guard against it; other `CachedSecret` users are not changed.
- **Unverified response text.** The previous reader's treatment of any non-2xx answer as "no previous version" is a fallback until V1 narrows it.

## Follow-ups (outside this spec)

- `sanitize()` partial masking: `1-4-2-sanitize-masks-only-part-of-a-secret-value` (Decision 8, F1).
- Platform runbook wait: [atlantis-sam-templates #11](https://github.com/63Klabs/atlantis-sam-templates/issues/11) (Decision 8, F2).
- Typing `getProps()` in `types/` (F3).
- HTTP API (payload v2) events (F4).
- A public `versionStage` option on `CachedSecret`, if other features need it.
- Moving the "failure wait" and "stuck refreshing" guards into `CachedParameterSecret` for every secret, which would change existing behavior and so needs its own spec.

## V1 results

The "V1 check procedure" above was run by the maintainer by hand, because the implementation sandbox could not call AWS. Region `us-east-2`, profile `release`, one temporary secret whose name started with `kiro-probe-`. No account number, ARN, version id, or secret value is recorded here (R14.5).

| Step | Call | Result |
|---|---|---|
| 1 | `create-secret` (value `first`) | Succeeded |
| 2 | `get-secret-value --version-stage AWSPREVIOUS` with one version | Error `ResourceNotFoundException` from the `GetSecretValue` operation. Message: "Secrets Manager can't find the specified secret value for staging label: AWSPREVIOUS" |
| 3 | `put-secret-value` (value `second`) | Succeeded. The new version carries `AWSCURRENT` |
| 4 | `get-secret-value --version-stage AWSPREVIOUS` | Returned `first`, with `VersionStages` of `["AWSPREVIOUS"]` |
| 5 | `update-secret-version-stage --version-stage AWSPREVIOUS --remove-from-version-id <version of first>` (approved, R14.2), then `get-secret-value --version-stage AWSPREVIOUS` | The removal succeeded. The read returned the same `ResourceNotFoundException` and message as step 2. `AWSCURRENT` stayed on the second version |
| 6 | `delete-secret --force-delete-without-recovery`, then `list-secrets --filters Key=name,Values=kiro-probe-` | The delete succeeded. The first listing still showed the secret (eventual consistency). A listing about a minute later was empty, so nothing remains (R14.4) |

**Extension.** Not exercised. No function with the layer exists in the test account and none was created (R14.6). The extension's HTTP status and body for a missing `AWSPREVIOUS` version are unobserved.

### Decisions from V1

1. **Error name (R4.10).** The previous reader maps an SDK error whose `name` is exactly `ResourceNotFoundException` to "no previous version". This is the design default, and the observed error confirms it. Any other error name is a failed read.
2. **`PREVIOUS_MISSING_STATUS` (R14.6).** It stays "any non-2xx", because the extension's response was not observed and there is no status to narrow it to. On the extension path, any non-2xx answer for the previous stage is "no previous version", logged at debug level. The "Unverified response text" limitation above remains in force.
3. **Label-removal command (R12.5).** The removal worked, so the rotation procedure in the documentation (task 10.1) may state `aws secretsmanager update-secret-version-stage --secret-id <secret> --version-stage AWSPREVIOUS --remove-from-version-id <version id of the old value>`. The documentation does not need the "wait for the next rotation" fallback. After the command, a read of the previous stage behaves as a never-rotated secret, which the previous reader already treats as "no previous version" (R4.5).

### Check against requirements.md and design.md

No result contradicts a statement in either document. The not-found error name equals the design default, the label removal worked as R12.5 conditions it, and the unobserved extension takes the fallback that R14.6 prescribes. The sentence "Still to observe (V1, Requirement 14)" in the design's observations section describes the state before the check and is now answered by this section. It was left unchanged.
