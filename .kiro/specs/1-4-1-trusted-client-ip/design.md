# Design Document

## Overview

This design moves client IP selection out of `RequestInfo._clientRequestInfo()` into a new internal static class, `ClientIpResolver` (`src/lib/utils/ClientIpResolver.class.js`). The resolver reads `CloudFront-Viewer-Address`, then `X-Forwarded-For` from the right by a hop count, then `identity.sourceIp`, and returns the first valid result (Req 2 to 5). The hop count comes from `CACHE_DATA_TRUSTED_PROXY_HOPS`, default `2` (Req 6). At debug level the resolver logs how it chose the IP, without addresses (Req 7).

Two smaller changes ride along. `Response._log()` passes every request-derived field of the `RESPONSE` line through one sanitizer (Req 8), and `ClientRequest.getRequestLog()` returns query keys without values (Req 9).

Production changes are confined to the new class and three existing files: `RequestInfo.class.js`, `Response.class.js`, and `ClientRequest.class.js`. The rest is:

- doc comments in `types/lib/tools/index.d.ts`
- one rewritten existing test file and two updated expected strings in another (`test/response/response-tests.jest.mjs`)
- new tests
- documentation
- the CHANGELOG entry and a draft security advisory

Requirement numbers refer to [requirements.md](requirements.md). Q, U, D, and Round numbers refer to [PLAN.md](PLAN.md).

## Design goals

1. **Never select a value only the client wrote** when the hop count matches the deployment (Req 4.5). When it doesn't, err toward a trusted proxy's address (the fail-safe direction, PLAN.md Section 4.1).
2. **Never throw on request data.** Malformed, missing, or non-string values fall through to the next source (Req 2.6).
3. **The public API doesn't move.** Signatures, return types, exports, and the 13-field log layout stay the same (Req 11).
4. **A pure core.** Every rule takes explicit inputs, including the hop count, so tests cover any topology in one process without touching `process.env` (Req 10.3, 10.4).
5. **No new dependency.** `node:net` `isIP()` is the only validator (Req 1.4).

## Pre-design measurements

Measured on the development machine with Node.js 24.15.0 and fast-check 4.10.2, and against deployed test stacks on 2026-11-04 (PLAN.md, Round 4 and Q16).

| Finding | Consequence for the design |
|---|---|
| Measured chains: T1 `C, M`; T2 `C, E, M`; T4 `C`. API Gateway appends the address that connected to it | Hop counts 2, 3, and 1. The default is 2 (U4) |
| For edge-optimized APIs `identity.sourceIp` equals the `X-Forwarded-For` entry 2 from the right: `C` in T1, `E` in T2 | Falling through to `sourceIp` lands on a trusted proxy's address, never a forged one |
| CloudFront dropped a viewer-supplied `CloudFront-Viewer-Address` in T1 and T2; a Regional API with no CloudFront (T4) delivered it | Step 1 is gated on a hop count of 2 or more (Q8). The docs tell T4 users to set 1 |
| CloudFront joined two viewer `X-Forwarded-For` headers into one value, in order, in both `headers` and `multiValueHeaders` | The resolver reads `headers` only |
| `isIP("2001:db8::1:1234")` is 6: an IPv6 address followed by a 4-digit port is itself a valid IPv6 | `CloudFront-Viewer-Address` is parsed port-first (D13) |
| Port-first parsing returned the generated address for 200,000 draws each of `fc.ipV4()` and `fc.ipV6()` with ports 0 to 65535, IPv6 bracketed and unbracketed. Bare `fc.ipV6()` values were misread as address-plus-port in 23,937 of 200,000 draws (12%) | Properties cover the with-port forms and bare IPv4. Bare IPv6 is tested by examples (Req 3.5, 10.4) |
| `isIP()` returns 0 for non-strings, for values with surrounding spaces, and for zone IDs containing `|`, space, or a newline. It accepts `fe80::1%eth0` | Entries are trimmed before `isIP()`. A selected value can't carry `|` or a control character into the log; the sanitizer covers the IP field anyway |
| `DebugAndLog.debug()` returns a promise and filters by level inside `writeLog()`. `DebugAndLog.getLogLevel()` and `DebugAndLog.DEBUG_LEVEL_NUM` are public | The resolver checks `getLogLevel()` before building the debug message (Req 7.3), and calls methods through the class so Jest spies see them |
| ESLint's `no-control-regex` flags `/[|\x00-\x1F\x7F]/` | The sanitizer filters by character code instead of a regex |
| `ClientRequest` builds `#props.queryStringParameters` from validated parameters. With `parameters.excludeParamsWithNoValidationMatch: false` and no rules, all parameters pass through | `getRequestLog()` tests initialize `ClientRequest` that way |
| `ClientRequest.getRequestLog().apiKey` is always `null`: nothing sets `#logs.apiKey` | Log tests inject field values by spying on the `ClientRequest` getters |
| ESLint baseline: `RequestInfo.class.js` 1 error (`no-constant-condition`, the `if ( false )` block at line 370); `Response.class.js`, `ClientRequest.class.js`, and the bug-exploration test 0 | The baseline for Req 10.10. The `if ( false )` block is outside this spec and stays |
| `src/lib/utils/TimeUtils.class.js`, `ParameterStoreLoader.class.js`, and `SecretsManagerLoader.class.js` already require `../tools/DebugAndLog.class.js` | The resolver does the same; no new load-order risk |
| The `test/documentation/` JSDoc tests scan `src/lib/tools/` but not `src/lib/utils/` | Edits to the three tools files must keep those tests passing. The resolver's JSDoc follows the standard without being machine-checked |
| `jest.config.mjs` matches `**/test/**/*.jest.mjs` and sets `restoreMocks: true` | New directories need no config change |

## Architecture

### Current

```
RequestInfo._clientRequestInfo(event)
  headers = event.headers with keys lowercased
  client.ip = identity.sourceIp
  if headers["x-forwarded-for"] non-empty:
    client.ip = first comma-separated entry, trimmed          chosen by the client

Response._log()
  logFields = [statusCode, bytes, contentType, execms, clientIp,
               userAgent.replace(/|/g, ""),                   removes nothing
               origin, referrer, resource, queryKeys, routeLog, queryLog, apiKey]
  DebugAndLog.log(logFields.join(" | "), "RESPONSE")

ClientRequest.getRequestLog().queryKeys = sorted "key=value" pairs joined with "&"
```

### New

```
RequestInfo._clientRequestInfo(event)
  headers = event.headers with keys lowercased                 unchanged
  client.ip = ClientIpResolver.resolve(headers, identity)

ClientIpResolver.resolve(headers, identity, hops = getTrustedProxyHops())
  hops >= 2 and parseViewerAddress(headers["cloudfront-viewer-address"])  → step "viewer-address"
  hops >= 1 and selectForwardedFor(headers["x-forwarded-for"], hops).ip  → step "x-forwarded-for"
  identity.sourceIp is not null/undefined                                 → step "source-ip"
  otherwise null                                                          → step "none"
  at debug level: one line with step, hops, and entry count

Response._log()
  each request-derived field → sanitizeLogField(value)         "-" for empty; "|" and control characters removed

ClientRequest.getRequestLog().queryKeys = sorted keys joined with "&"
```

### Files

| File | Change | Requirements |
|---|---|---|
| `src/lib/utils/ClientIpResolver.class.js` (new) | The resolver | 1 to 7 |
| `src/lib/tools/RequestInfo.class.js` | Require the resolver; replace lines 312–324 with one call; JSDoc | 1.5, 11.5, 12.2 |
| `src/lib/tools/Response.class.js` | `sanitizeLogField()`; use it for nine fields; JSDoc of `_log()` | 8, 11.4 |
| `src/lib/tools/ClientRequest.class.js` | `queryKeys` keys only; JSDoc for the class and `getRequestLog()` | 9, 12.2, 12.3 |
| `types/lib/tools/index.d.ts` | Doc comments for `getClientIp`/`getClientIP` | 11.3, 12.4 |
| `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs` | IP property and two IP cases rewritten | 10.2 |
| `test/response/response-tests.jest.mjs` | Two "Test finalize and log" expected `queryKeys` values changed to keys only | 9, 10.2 |
| `test/request/client-ip/unit/` (3 new files) | Resolver unit tests, configuration and logging, integration through `RequestInfo` | 10.3, 10.5, 10.6 |
| `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs` (new) | Properties 1 to 6 | 10.4 |
| `test/response/response-log-field-sanitization-tests.jest.mjs` (new) | Sanitizer examples through `_log()` | 10.3 |
| `test/response/response-log-field-sanitization-property-tests.jest.mjs` (new) | Properties 7 and 8 | 10.4 |
| `test/request/client-request-request-log-tests.jest.mjs` (new) | `queryKeys` examples | 10.3 |
| `docs/features/tools/README.md` | "Client IP resolution" subsection; note at line 1092; `ip` comment at line 1128 | 12.5, 12.6 |
| `CHANGELOG.md` | Entries under `v1.4.1 (unreleased)` | 13.1 to 13.3 |
| `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` (new) | Draft advisory | 13.4, 13.5 |

## Components and interfaces

### ClientIpResolver

```javascript
// src/lib/utils/ClientIpResolver.class.js
const { isIP } = require("node:net");
const DebugAndLog = require("../tools/DebugAndLog.class.js");

const ENV_VAR = "CACHE_DATA_TRUSTED_PROXY_HOPS";
const DEFAULT_TRUSTED_PROXY_HOPS = 2;

let memoRaw = Symbol("unread");     // last raw env value seen; a Symbol never equals a real value
let memoHops = DEFAULT_TRUSTED_PROXY_HOPS;
const warnedRawValues = new Set();

class ClientIpResolver {
	static ENV_VAR = ENV_VAR;
	static DEFAULT_TRUSTED_PROXY_HOPS = DEFAULT_TRUSTED_PROXY_HOPS;

	static resolve(headers, identity, trustedProxyHops) { }          // → string | null
	static resolveDetailed(headers, identity, trustedProxyHops) { }  // → { ip, step, trustedProxyHops, forwardedForEntryCount }
	static getTrustedProxyHops() { }                                 // → number, from the env var
	static parseTrustedProxyHops(rawValue) { }                       // → { trustedProxyHops, isValid }
	static parseViewerAddress(value) { }                             // → string | null
	static selectForwardedFor(value, trustedProxyHops) { }           // → { ip, entryCount }
}

module.exports = ClientIpResolver;
```

The class has no instance members and no reset. Module state is the env memo and the set of values already warned about; each Jest test file gets a fresh module instance.

**`resolveDetailed(headers, identity, trustedProxyHops = ClientIpResolver.getTrustedProxyHops())`**

1. If `trustedProxyHops` isn't a non-negative safe integer, use `getTrustedProxyHops()` instead. This only matters for callers inside the package or tests; `RequestInfo` never passes it.
2. Treat a `headers` or `identity` that isn't a non-null object as `{}`.
3. Step 1: if `trustedProxyHops >= 2`, `ip = parseViewerAddress(headers["cloudfront-viewer-address"])`. Non-null → step `viewer-address`.
4. Step 2: `{ ip, entryCount } = selectForwardedFor(headers["x-forwarded-for"], trustedProxyHops)`. Non-null `ip` → step `x-forwarded-for`. `entryCount` is computed whether or not step 1 already produced a value, so the debug line always reports it.
5. Step 3: `identity.sourceIp` that is neither `null` nor `undefined` → step `source-ip`, returned as-is (D8).
6. Otherwise `ip = null`, step `none`.

Returns `{ ip, step, trustedProxyHops, forwardedForEntryCount }`.

**`resolve(headers, identity, trustedProxyHops)`** calls `resolveDetailed()`, emits the debug line, and returns `ip`. The whole body sits in a `try`/`catch` that logs `DebugAndLog.error` and returns `null`. No input should reach it; it's there because `RequestInfo` runs on every request (Req 2.6).

**`selectForwardedFor(value, trustedProxyHops)`**

```javascript
if (typeof value !== "string") return { ip: null, entryCount: 0 };
const entries = value.split(",").map((entry) => entry.trim());     // empty entries keep their positions (D7)
const entryCount = entries.length;
if (trustedProxyHops < 1 || entryCount < trustedProxyHops) return { ip: null, entryCount };
const candidate = entries[entryCount - trustedProxyHops];
return { ip: (isIP(candidate) ? candidate : null), entryCount };
```

An empty string splits into one empty entry, so `entryCount` is 1 and no IP is selected.

**`parseViewerAddress(value)`** (port-first, D13)

```javascript
if (typeof value !== "string") return null;
const trimmed = value.trim();
const lastColon = trimmed.lastIndexOf(":");
if (lastColon > 0) {
	const port = trimmed.slice(lastColon + 1);
	let host = trimmed.slice(0, lastColon);
	if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
	if (/^[0-9]{1,5}$/.test(port) && isIP(host)) return host;
}
return (isIP(trimmed) ? trimmed : null);
```

The port check is a format check (1 to 5 digits), not a range check; Req 3.1 asks for no more.

**`parseTrustedProxyHops(rawValue)`** is pure:

| Raw value | Result |
|---|---|
| `undefined`, or a string that is empty after trimming | `{ trustedProxyHops: 2, isValid: true }` |
| Trimmed string matching `/^[0-9]+$/` | `{ trustedProxyHops: Number.parseInt(trimmed, 10), isValid: true }`. A value beyond `Number.MAX_SAFE_INTEGER` still parses to a large number, which only ever falls through to `sourceIp` |
| Anything else | `{ trustedProxyHops: 2, isValid: false }` |

**`getTrustedProxyHops()`** reads `process.env[ENV_VAR]` on every call. If the raw value is the same as `memoRaw`, it returns `memoHops`. Otherwise it parses, stores both, and, when `isValid` is false and the raw value isn't in `warnedRawValues`, adds it and logs:

```
CACHE_DATA_TRUSTED_PROXY_HOPS must be a non-negative integer. Received "<raw>". Using the default of 2.
```

`<raw>` is the value through `JSON.stringify`, so quotes and control characters are escaped. The set isn't bounded; a Lambda execution environment sees one value, and tests see a handful (Req 6.4 to 6.6).

**Debug line** (Req 7). In `resolve()`, after `resolveDetailed()`:

```javascript
if (DebugAndLog.getLogLevel() >= DebugAndLog.DEBUG_LEVEL_NUM) {
	DebugAndLog.debug(`ClientIpResolver: step=${step} trustedProxyHops=${trustedProxyHops} xForwardedForEntries=${forwardedForEntryCount}`);
}
```

The message holds only the step name and two integers (Req 7.2). The returned promise isn't awaited; `DebugAndLog.debug()` writes synchronously inside `writeLog()`.

### `RequestInfo._clientRequestInfo()`

Lines 312–324 become:

```javascript
		// >! Resolve the client IP only from values a trusted proxy wrote:
		// >! CloudFront-Viewer-Address, X-Forwarded-For read from the right, then identity.sourceIp.
		client.ip = ClientIpResolver.resolve(headers, identity);
```

`headers` is the lowercased map the method already builds, and `identity` is `event.requestContext.identity` or `{}`. The user-agent block and everything after it are unchanged (Req 11.5). The file gains `const ClientIpResolver = require("../utils/ClientIpResolver.class.js");`.

### `Response._log()`

A module-level function above the class, not exported:

```javascript
/**
 * Remove the RESPONSE log delimiter and control characters from a request-derived value.
 * @private
 * @param {*} value
 * @returns {string} "-" for null, undefined, "", or a value with nothing left after cleaning
 */
function sanitizeLogField(value) {
	if (value === null || value === undefined || value === "") { return "-"; }
	const text = String(value);
	let cleaned = "";
	for (const char of text) {
		const code = char.charCodeAt(0);
		// >! Remove "|" (the RESPONSE field delimiter) and control characters, so a request can't add or shift log fields
		if (char === "|" || code <= 0x1F || code === 0x7F) { continue; }
		cleaned += char;
	}
	return (cleaned === "" ? "-" : cleaned);
}
```

`for...of` iterates by code point, so astral characters pass through intact. In `_log()`, the nine request-derived fields are pushed as `sanitizeLogField(clientIp)`, `sanitizeLogField(userAgent)`, and so on, replacing the per-field `"-"` ternaries and the `/|/g` replace. `statusCode`, `bytes`, `contentType`, and `execms` are pushed as before. Field order is unchanged (Req 8.6, 11.4).

Two small differences from today follow from the helper, both covered by D9: `clientIp` of `null` logs `-` instead of an empty field, and `routeLog`, `queryLog`, or `queryKeys` of `""` keep logging `-` as they do today.

### `ClientRequest.getRequestLog()`

```javascript
-			queryKeys: Object.keys(this.#props.queryStringParameters).sort().map(key => `${key}=${this.#props.queryStringParameters[key]}`).join('&'),
+			// >! Keys only: query values can hold tokens or personal data and must not reach the logs
+			queryKeys: Object.keys(this.#props.queryStringParameters).sort().join('&'),
```

The JSDoc already says "query string keys (no values)", so only the return description is touched (Req 12.3).

### Types

Only doc comments change in `types/lib/tools/index.d.ts`: `getClientIp()` and `getClientIP()` describe the resolution order, `CACHE_DATA_TRUSTED_PROXY_HOPS`, and that `null` is returned when no source has a value. Signatures stay `string | null` (Req 11.3, 12.4).

## Execution flows

### Every request

```
new ClientRequest(event, context) → RequestInfo constructor → _clientRequestInfo(event)
  ClientIpResolver.resolve(headers, identity)
    getTrustedProxyHops(): env read; memo hit after the first request
    up to two isIP() calls on header values, or one when step 1 is skipped
    debug line only at debug level
```

Cost per request: one `process.env` read, one string comparison, one `split`, and at most a few `isIP()` calls. No allocation is added at info level beyond the split array.

### First request with an invalid hop count

The first resolution logs one warning, then uses 2. Later requests with the same raw value hit the memo and don't warn.

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| `headers` or `identity` is `null`, `undefined`, or not an object | Treated as `{}` | 2.6 |
| A header value isn't a string | That step produces no value | 2.4, 3.4 |
| `cloudfront-viewer-address` doesn't parse | Step 1 produces no value | 3.4 |
| `x-forwarded-for` has fewer than `N` entries | Step 2 produces no value | 4.3 |
| The selected entry isn't a valid IP | Step 2 produces no value | 4.4 |
| `identity.sourceIp` is `null` or `undefined` | `resolve()` returns `null` | 2.5 |
| `CACHE_DATA_TRUSTED_PROXY_HOPS` is invalid | One warning per distinct value; hop count 2 | 6.4, 6.5 |
| An unexpected exception inside `resolve()` | Logged with `DebugAndLog.error`; returns `null` | 2.6 |
| A log field is a non-string, such as a number | `String(value)`, then cleaned | 8.3 |

## Correctness properties

Properties 1 to 6 run in `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs`; Properties 7 and 8 in `test/response/response-log-field-sanitization-property-tests.jest.mjs`. None spawns a child process, so each uses at least 100 runs: 500 for Properties 1, 2, and 7, and 200 for the rest. None passes `seed` (Req 10.7, 10.8).

Shared arbitraries, all valid by construction:

- `ip`: `fc.oneof(fc.ipV4(), fc.ipV6())`. Every draw satisfies `isIP() > 0` (measured, 200,000 each).
- `forged`: `fc.array(fc.string({ maxLength: 40 }), { maxLength: 6 })`. Anything at all, including commas, spaces, and IPs.
- `hops`: `fc.integer({ min: 1, max: 5 })`.
- `port`: `fc.integer({ min: 0, max: 65535 })`.
- `docIp(prefix)`: an address in one documentation range, built as `${prefix}.${fc.integer({ min: 1, max: 254 })}`. Properties that need sources to be distinguishable draw each source from a different range (`192.0.2.0/24` for `CloudFront-Viewer-Address`, `198.51.100.0/24` for `X-Forwarded-For`, `203.0.113.0/24` for `sourceIp`), so equality between sources can't occur by construction.

`resolve(h, i, n)` below means `ClientIpResolver.resolve(h, i, n)` with an explicit hop count, except in Property 2.

**Property 1 — Right-to-left selection.** *For any* `forged` list P, hop count N, and list T of N `ip` values, `resolve({ "x-forwarded-for": [...P, ...T].join(", ") }, {}, N)` is `T[0]`. Commas inside P only add entries on the left, so the index of `T[0]` from the right doesn't move. **Validates: Req 4.1, 4.2, 4.5**

**Property 2 — Fail-safe at the default.** With `CACHE_DATA_TRUSTED_PROXY_HOPS` deleted from `process.env` (restored in `afterEach`), *for any* P and `ip` values V, E, and M, `resolve({ "x-forwarded-for": [...P, V, E, M].join(", ") }, { sourceIp: E })` is `E`. **Validates: the fail-safe direction in Req 10.4; Req 6.2**

**Property 3 — Short chains fall through.** *For any* N from 2 to 5, a list S of 1 to N − 1 `docIp("198.51.100")` values, and a `docIp("203.0.113")` value D, `resolve({ "x-forwarded-for": S.join(", ") }, { sourceIp: D }, N)` is D. **Validates: Req 4.3, 5.1**

**Property 4 — Viewer address with a port.** *For any* `fc.ipV4()` value A4, `fc.ipV6()` value A6, and port p: `parseViewerAddress` returns A4 for `` `${A4}:${p}` `` and for A4, and returns A6 for `` `${A6}:${p}` `` and `` `[${A6}]:${p}` ``. Each form is also wrapped in 0 to 3 spaces on each side. **Validates: Req 3.1 to 3.3**

**Property 5 — Step 1 gating.** *For any* hop count N from 0 to 5, `docIp("192.0.2")` value V, list X of 3 `docIp("198.51.100")` values, and `docIp("203.0.113")` value D, with headers `{ "cloudfront-viewer-address": `${V}:443`, "x-forwarded-for": X.join(", ") }` and identity `{ sourceIp: D }`: the result is V when N ≥ 2, `X[2]` when N is 1, and D when N is 0. **Validates: Req 2.1 to 2.3**

**Property 6 — Total and well-typed.** *For any* header map built with `fc.dictionary(fc.oneof(fc.constantFrom("cloudfront-viewer-address", "x-forwarded-for", "user-agent"), fc.string()), fc.anything())`, any identity from `fc.oneof(fc.constant(null), fc.constant(undefined), fc.anything(), fc.record({ sourceIp: fc.anything() }))`, and any N from 0 to 5: `resolve()` doesn't throw, and returns `null`, the identity's `sourceIp`, or a string with `isIP() > 0`. **Validates: Req 2.5, 2.6, 3.4, 4.4, 5.1**

**Property 7 — Thirteen fields.** *For any* nine strings drawn from `fc.string({ unit: fc.constantFrom("a", "Z", "0", " ", "|", "\r", "\n", "\t", "\x00", "\x7F", "é", "😀"), maxLength: 30 })`, with `getClientIp`, `getClientUserAgent`, `getClientOrigin`, `getClientReferrer`, and `getRequestLog` on a real `ClientRequest` spied to return them, the message `Response.finalize()` passes to `DebugAndLog.log` splits on `" | "` into exactly 13 parts, and parts 5 to 13 contain no `|` and no character below `0x20` or equal to `0x7F`. **Validates: Req 8.1, 8.3, 8.6**

**Property 8 — The sanitizer removes exactly the listed characters.** *For any* string s from the same alphabet, the logged field equals the model `[...s].filter((c) => c !== "|" && c.charCodeAt(0) > 0x1F && c.charCodeAt(0) !== 0x7F).join("")`, or `"-"` when the model is empty. The model filters an array; the implementation builds a string in a loop, so they share the rule but not the code. **Validates: Req 8.2, 8.3**

Property 7 asserts the field count, and its generator isn't filtered on it. Property 2 relies on the `docIp` construction nowhere; V, E, and M may coincide, and the assertion still holds because E is what's expected either way.

## Testing strategy

Every test file is `.jest.mjs`, imports its globals from `@jest/globals`, and imports CommonJS modules with `(await import(path)).default`. Nothing invokes `npm test` or spawns a child process. Files that touch `process.env` save it in `beforeEach` and restore it in `afterEach`; files that spy rely on `restoreMocks: true` and also call `jest.restoreAllMocks()` in `afterEach` (Req 10.5).

Every test that depends on the default deletes `CACHE_DATA_TRUSTED_PROXY_HOPS` first, so a value in the developer's shell can't change the result.

### Test files

| File | What it checks |
|---|---|
| `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs` | Steps and order with explicit hop counts; the measured T1, T2, and T4 chain shapes with documentation range addresses; `parseViewerAddress` examples; `selectForwardedFor` edge cases (Req 2 to 5) |
| `test/request/client-ip/unit/client-ip-resolver-config-tests.jest.mjs` | Env parsing, memo, warning, and debug line (Req 6, 7) |
| `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs` | Integration through `RequestInfo` and `ClientRequest`; source and export checks (Req 1.2, 1.5, 11.1, 11.5) |
| `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs` | Properties 1 to 6 (Req 10.4) |
| `test/response/response-log-field-sanitization-tests.jest.mjs` | `_log()` examples (Req 8.2 to 8.5) |
| `test/response/response-log-field-sanitization-property-tests.jest.mjs` | Properties 7 and 8 |
| `test/request/client-request-request-log-tests.jest.mjs` | `queryKeys` (Req 9) |

`client-ip-resolver-unit-tests.jest.mjs` checks:

- T1, `198.51.100.10, 203.0.113.20` at N = 2 → `198.51.100.10`; with a forged `192.0.2.1` prepended → still `198.51.100.10`.
- T2, `198.51.100.10, 203.0.113.30, 203.0.113.20` at N = 3 → `198.51.100.10`; at N = 2 → `203.0.113.30`.
- T4, `198.51.100.10` at N = 1 → `198.51.100.10`; `192.0.2.1, 198.51.100.10` at N = 1 → `198.51.100.10`; the same at N = 2 → `192.0.2.1`, the documented T4 exposure, asserted so a future change to it is deliberate.
- A short chain, an empty header, `" , "`, and a non-IP selected entry, each falling through to `sourceIp`.
- `parseViewerAddress`: `198.51.100.10:46532`, `2001:db8::1:60776`, `2001:db8::1:1234`, `[2001:db8::1]:443`, `198.51.100.10`, `2001:db8::1`, `::1`, ` 198.51.100.10:443 `; `::1:2` → `::1` (Req 3.5); and `null` for `""`, `198.51.100.10:`, `198.51.100.10:123456`, `garbage`, `[::1]`, a number, and `undefined`.
- Step 1 runs at N = 2 and 3 and is skipped at N = 0 and 1.
- N = 0 ignores `x-forwarded-for`.
- `resolve(null, null)`, `resolve(undefined, undefined)`, and `resolve("x", 5)` return `null` without throwing.
- `identity.sourceIp` is returned unchanged even when it isn't a valid IP (D8).
- The class's own static property names are exactly the six methods, the two constants, and `length`, `name`, and `prototype`, so no reset member exists.

`client-ip-resolver-config-tests.jest.mjs` checks:

- `parseTrustedProxyHops` for `undefined`, `""`, `"  "`, `"0"`, `"1"`, `"2"`, `"3"`, `" 3 "`, `"007"`, and the invalid shapes `"abc"`, `"-1"`, `"1.5"`, `"2 hops"`, `"+2"`, `"0x2"`, and `"２"` (a full-width digit).
- `getTrustedProxyHops()` through `process.env`: unset → 2; `"3"` → 3; changing the value is seen on the next call (Req 6.6).
- The warning: one `DebugAndLog.warn` for an invalid value across five calls, with the exact message; a second distinct invalid value warns once more; a valid value doesn't warn. Each case uses a raw value no other case in the file uses, because the warned set lives for the file's module instance (Req 10.5).
- The debug line: with `DebugAndLog.getLogLevel` spied to return `DebugAndLog.DEBUG_LEVEL_NUM`, one `DebugAndLog.debug` call per `resolve()` with the exact text for each of the four steps; the message contains none of the addresses in the request. With it spied to return `DebugAndLog.INFO_LEVEL_NUM`, no `debug` call (Req 7).

`request-info-client-ip-tests.jest.mjs` checks:

- `new RequestInfo(event).getClientIp()` and `new ClientRequest(event, context).getProps().client.ip` follow the resolver for a T1 event with a forged entry, mixed-case header names (`X-Forwarded-For`, `CloudFront-Viewer-Address`), and an event with no headers.
- The user agent, origin, referrer, `ifModifiedSince`, `ifNoneMatch`, and `accept` are the same as before for the test event in `test/helpers/test-event.js`.
- `RequestInfo.class.js` source no longer contains `x-forwarded-for` (Req 1.5).
- `src/index.js`, `src/lib/tools/index.js`, and every file under `types/` don't mention `ClientIpResolver` (Req 1.2, 11.1).

`response-log-field-sanitization-tests.jest.mjs` checks, with `DebugAndLog.log` spied and the `ClientRequest` getters spied for the field values:

- A user agent `Mozilla/5.0 | evil` logs as `Mozilla/5.0  evil` (Req 8.4).
- `null`, `undefined`, and `""` log as `-`; a value that is only `|||` logs as `-`.
- CR, LF, tab, NUL, and DEL are removed; `é` and `😀` are kept.
- `statusCode`, `bytes`, `contentType`, and `execms` are unchanged (Req 8.5).
- A request with no client IP logs `-` in field 5 (D9).

`client-request-request-log-tests.jest.mjs` initializes `ClientRequest` with `{ parameters: { excludeParamsWithNoValidationMatch: false } }` and checks:

- `?q=jane%40example.com&id=42` gives `queryKeys` of `id&q`, containing no `=` and no value.
- No query parameters gives `""`.
- `resource`, `routeLog`, `queryLog`, and `apiKey` are unchanged.

### Changes to existing tests

**`test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`.** The header comment keeps `Feature: 1-3-11-client-request-update-forwarded-for` and adds a line naming `1-4-1-trusted-client-ip` and stating that IP selection changed from leftmost to right-to-left. A `beforeEach`/`afterEach` pair deletes and restores `CACHE_DATA_TRUSTED_PROXY_HOPS`.

| Test | Before | After |
|---|---|---|
| `Property: getClientIp() returns first IP from x-forwarded-for when present` | Leftmost entry wins | Renamed `Property: getClientIp() returns the x-forwarded-for entry 2 from the right by default`. Chain `[...proxyIps, clientIp, edgeIp]`; expects `clientIp` |
| `single IP: x-forwarded-for '203.0.113.50' with identity.sourceIp '54.240.144.1'` | Expects `203.0.113.50` | `single IP: a one-entry chain falls back to identity.sourceIp`, with `203.0.113.50` and `198.51.100.1`; expects `198.51.100.1` |
| `multiple IPs: x-forwarded-for '203.0.113.50, 70.132.20.1, 54.240.144.1' ...` | Expects `203.0.113.50` | `multiple IPs: a forged left entry is ignored`, with `192.0.2.1, 203.0.113.50, 198.51.100.1`; expects `203.0.113.50` |
| The two user-agent tests | Unchanged | Unchanged |

The real AWS addresses in the old names (`54.240.144.1`, `70.132.20.1`) are replaced with documentation range addresses. `fc.pre(clientIp !== identityIp)` stays: it's a precondition on the inputs, not the property being asserted.

**`test/response/response-tests.jest.mjs`.** Two assertions change, both named "Test finalize and log" (one in each of two `describe` blocks). They check the `[RESPONSE]` log line, whose `queryKeys` field now lists keys without values (Req 9). Nothing else in the file changes.

| Test | Before | After |
|---|---|---|
| "Test finalize and log" (first `describe` block, `toContain`) | `queryKeys` is `format=detailed&include=contact,department&version=2` | `format&include&version` |
| "Test finalize and log" (second `describe` block, `toBe`) | `queryKeys` is `format=detailed&include=contact,department&version=2` | `format&include&version` |

No other existing test file changes (Req 10.2). `request-info-forwarded-for-preservation-tests.jest.mjs` passes as is: its `sourceIp` fallback property sets `X-Forwarded-For` only to `null`, `""`, or nothing, and its other properties don't assert on the IP.

### Lint

| File | Errors before | Errors after |
|---|---|---|
| `src/lib/tools/RequestInfo.class.js` | 1 (`no-constant-condition`) | 1 |
| `src/lib/tools/Response.class.js` | 0 | 0 |
| `src/lib/tools/ClientRequest.class.js` | 0 | 0 |
| `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs` | 0 | 0 |
| Every new `.js` and `.mjs` file | n/a | 0 |

`npm run lint:ci` fails on the repository baseline before and after, so Req 10.10 is checked per file with `npx eslint <files>`. `.ts` files aren't linted.

### Full-suite gate

`npm test` must pass with only the bug-exploration rewrite and the two `queryKeys` string updates in `response-tests.jest.mjs`. Anticipated risks:

- A test whose event carries `X-Forwarded-For` with one entry and asserts `getClientIp()`. A search found only the two files above.
- A test that spies on `DebugAndLog.debug` while building `ClientRequest` at debug level and counts calls. It now sees one more call. A search found no `DebugAndLog.debug` spy in `test/`; the `console.debug` spies in `test/logging/` only silence output and don't build `ClientRequest`.

Any other failure is a design problem to bring back, not a test to edit.

## Documentation design

### JSDoc

- **ClientIpResolver:** class-level `@private` description with an `@example` (`resolve()` on a T1 header map). Each static method documented per Req 1.3: the hop-count semantics, the fail-safe direction, the gating of step 1, port-first parsing and its bare-IPv6 caveat, and the env var with its default (Req 12.1).
- **`RequestInfo._clientRequestInfo()`:** the paragraph about `x-forwarded-for` being "preferred" is replaced with the resolution order, `CACHE_DATA_TRUSTED_PROXY_HOPS`, and a pointer to the README subsection. **`getClientIp()`/`getClientIP()`:** `@returns {string|null}` and one sentence on the order (Req 12.2).
- **`ClientRequest` class JSDoc:** one sentence on how the client IP is resolved, linking the README subsection.
- **`getRequestLog()`:** `queryKeys` keys only (Req 12.3).
- Parameter names in every edited block match the signatures, which `test/documentation/` checks for `src/lib/tools/`.

### `docs/features/tools/README.md`

A new `#### Client IP resolution` subsection follows the `getClientIp()` example in the ClientRequest section, in the file's heading style:

1. **Order.** The three sources, when each is skipped, and that an invalid value moves on to the next source.
2. **Setting `CACHE_DATA_TRUSTED_PROXY_HOPS`.** A table: unset (2), `0`, `1`, `2`, `3`, other digits, invalid values (warning, then 2).
3. **Which value to set.** A table of T1 to T4 with columns: endpoint type, your own CloudFront in front, value, chain at Lambda, what `getClientIp()` returns, and what happens at the default. T1, T2, and T4 rows say "measured 2026-11-04"; T3 says "from AWS documentation" (Req 12.5).
4. **Warning for Regional APIs without CloudFront.** At the default, both headers can be forged; set `1`.
5. **About `CloudFront-Viewer-Address`.** What it is, that CloudFront dropped a viewer-supplied value in T1 and T2 when measured on 2026-11-04 (not documented by AWS), and that forwarding it to an API Gateway origin needs a custom origin request policy because `AllViewerExceptHostHeader` doesn't include CloudFront headers. No specific policy is recommended.
6. **Origin lock.** For T2, requests sent straight to the API Gateway endpoint skip your distribution and can forge `X-Forwarded-For`. Only infrastructure prevents it: an origin-verify header added by CloudFront and checked by AWS WAF or an authorizer. Links the AWS blog post.
7. **Check your deployment.**
   - Configuration: `aws apigateway get-rest-api --rest-api-id <id> --query 'endpointConfiguration.types'`, and `aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[?starts_with(DomainName, '<id>.execute-api.')]].{Id: Id, Domain: DomainName}"`, with the caveat that a distribution using an API Gateway custom domain name as its origin won't match.
   - Marker: send `curl -H "X-Forwarded-For: 192.0.2.1" <url>` at debug log level and read the `ClientIpResolver:` line. The hop count is `xForwardedForEntries` minus one.

The note at line 1092 gains one sentence pointing to the subsection, and the `ip` comment at line 1128 reads "IP of client (see Client IP resolution)" (Req 12.6). The examples use `<id>` and documentation range addresses only.

### CHANGELOG

Entries go under `## v1.4.1 (unreleased)`, which the developer creates along with the `package.json` bump. If either is missing when the CHANGELOG task runs, the task stops and asks (Req 13.3). Each entry ends with `[Spec: 1-4-1-trusted-client-ip](.kiro/specs/1-4-1-trusted-client-ip/)`, shortened to `[Spec]` below.

```markdown
### Security
- **Client IP can no longer be chosen by the client** — `getClientIp()`, `getProps().client.ip`, and the `RESPONSE` log line used the first `X-Forwarded-For` entry, which the client controls: CloudFront and API Gateway append to whatever the client sends. The IP now comes from `CloudFront-Viewer-Address`, then the `X-Forwarded-For` entry counted from the right by the number of trusted proxies, then `identity.sourceIp`. Affects v1.3.11 through v1.4.0. [Spec]
  - The default counts two proxies: the AWS-managed CloudFront distribution of an edge-optimized REST API, and API Gateway. Behind your own CloudFront in front of an edge-optimized API, set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`; until then the logged IP is your distribution's edge address, not a forged one.
  - A Regional REST API without CloudFront must set `CACHE_DATA_TRUSTED_PROXY_HOPS=1`. At the default, both headers can still be forged there, as in v1.4.0.
  - A client behind a corporate proxy that adds its own `X-Forwarded-For` is now reported as the proxy's address, which is the address CloudFront saw.
  - Requests that reach API Gateway without passing through your own CloudFront can still forge `X-Forwarded-For`; restricting the API to CloudFront needs an origin-verify header checked by AWS WAF or an authorizer. See the ClientRequest documentation.
- **`queryKeys` logs keys only** — The `queryKeys` field of `getRequestLog()` and of the `RESPONSE` log line contained `key=value` pairs, although documented as keys only, so query values such as tokens or email addresses reached CloudWatch. It now lists the keys. Use `addQueryLog()` to log chosen values. [Spec]

### Added
- **`CACHE_DATA_TRUSTED_PROXY_HOPS`** — The number of trusted proxies that append to `X-Forwarded-For` in front of the function: `2` by default (edge-optimized API), `3` with your own CloudFront in front of an edge-optimized API, `1` for a Regional API without CloudFront, `0` to use only `identity.sourceIp`. An invalid value logs one warning and uses `2`. At debug level, one line per request reports the number of `X-Forwarded-For` entries, the hop count, and which source produced the IP, without addresses. [Spec]

### Fixed
- **`RESPONSE` log fields can't add or shift fields** — Request-derived fields (client IP, user agent, origin, referrer, resource, query keys, route and query logs, API key) are written with `|` and control characters removed. The user-agent clean-up previously removed nothing. An empty client IP now logs as `-`. [Spec]
```

Test-only changes get no entry.

### Security advisory draft

`.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`, in the GitHub advisory form's sections:

- **Summary:** `getClientIp()` returned a client-chosen value behind CloudFront and API Gateway.
- **Affected versions:** `>= 1.3.11, <= 1.4.0`. **Patched:** `1.4.1`.
- **Impact:** forged addresses in `RESPONSE` logs, dashboards, and any application logic that uses `getClientIp()` for rate limiting, allowlists, or audit records. No effect on the cache or endpoint modules.
- **Who must act after upgrading:** the T2 and T4 rows, with the values to set.
- **Workarounds before upgrading:** read `event.requestContext.identity.sourceIp` directly where an edge-optimized API is used without your own CloudFront.
- **References:** the README subsection and the CHANGELOG entry.
- **Severity:** left for the developer to set in the form; the draft notes the inputs (network, no privileges, no user interaction, integrity impact limited to logged and application-level IP data).

It contains no real addresses, account IDs, or endpoint identifiers (Req 13.5).

## Backwards compatibility analysis

**Unchanged:**

- every export, and every public method's name, signature, and return type
- the type declarations, apart from doc comments
- the `RESPONSE` line's 13 fields and their order
- the user agent and every other client field `_clientRequestInfo()` sets
- requests with no `X-Forwarded-For` and no `CloudFront-Viewer-Address`: `identity.sourceIp`, as before

**Intentionally changed:** the 10 rows of [Consumer-visible behavior changes](requirements.md#consumer-visible-behavior-changes), plus:

- A subclass that overrides `_clientRequestInfo()` keeps its own behavior, since the resolver is only called from the base implementation.
- A deployment with a debug-level spy counting `DebugAndLog.debug` calls sees one more per request.

## Known limitations

1. Requests that reach API Gateway without passing through your own CloudFront (T2) can still forge `X-Forwarded-For`. Only an origin lock fixes that ([atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14) for the starter).
2. A Regional API without CloudFront (T4) stays forgeable at the default until it sets `1`.
3. That CloudFront drops a viewer-supplied `CloudFront-Viewer-Address` is observed, not documented. If AWS changes it, T1 deployments would trust a forged header in step 1; setting `0` or `1` turns step 1 off, and the marker check shows whether the header arrives.
4. A bare IPv6 `CloudFront-Viewer-Address` whose last group is decimal and whose prefix is a valid IP reads as address plus port (D13). CloudFront always sends a port.
5. A trusted proxy that writes `IP:port` entries into `X-Forwarded-For` (not CloudFront or API Gateway, as measured) makes step 2 fall through to `sourceIp`.
6. T3 (your CloudFront in front of a Regional API) is documented from AWS documentation, not measured.
7. `isIP()` accepts IPv6 zone IDs such as `fe80::1%eth0`; neither CloudFront nor API Gateway writes them.

## Follow-ups (outside this spec)

- Forward `CloudFront-Viewer-Address` in the Atlantis network template ([atlantis-sam-templates #9](https://github.com/63Klabs/atlantis-sam-templates/issues/9)).
- Origin lock and the hop-count setting for the Atlantis starter ([atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14)).
- HTTP API (payload v2) support (F4).
- A programmatic hop-count option, if requested (Q7).
- The repository's ESLint baseline, which keeps `npm run lint:ci` failing.
