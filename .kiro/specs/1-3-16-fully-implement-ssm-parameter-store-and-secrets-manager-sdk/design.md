# Design Document

## Overview

This design adds the AWS SDK as a co-equal retrieval transport alongside the AWS Parameters and Secrets Lambda Extension, adds Secrets Manager to the configuration-driven loading path, and remediates five defects in `AppConfig._getParametersFromStore` — two of which cause silent data loss.

The structural move is to extract retrieval, key safety, and grouping out of `AppConfig` into four internal classes under `src/lib/utils/`, then have both the legacy `AppConfig` seam and the new `CachedParameterSecrets.init()` API delegate to them. That inversion is what lets the legacy three-method seam stay byte-for-byte compatible in signature while silently gaining every fix.

### A constraint that shapes the whole design

**The Lambda extension has no list or path endpoint.** It exposes only single-item lookups:

- `/systemsmanager/parameters/get/?name=<name>&withDecryption=true`
- `/secretsmanager/get?secretId=<id>&withDecryption=true`

There is no extension equivalent of `GetParametersByPath`. This is confirmed by the current implementation, which only ever builds those two paths (`CachedSsmParameter.getPath()`, `CachedSecret.getPath()`).

Consequences that ripple through every component below:

1. **Path-based discovery always uses the SDK**, even when the extension is available and healthy. There is no alternative.
2. Therefore **`ssm:GetParametersByPath` is required whenever path-based configuration is used, regardless of transport.** Documentation must not present the SDK path as "only needed if you drop the layer."
3. Transport selection is therefore **per-operation, not global**. Availability governs *value retrieval by name*; discovery is SDK-only. A single `useSdk` boolean would be wrong.

## Design Goals

1. **Legacy seam is inviolable.** `_initParameters()`, `_getParameters()`, and `_getParametersFromStore()` keep their signatures and return contracts so existing tests pass unmodified (Req 18.11).
2. **One place for dynamic key assignment.** Every write of an externally-derived key goes through one function, so the bug class cannot reappear per-path (Req 7).
3. **Transport is an implementation detail.** `getValue()` returns the same string whichever transport served it (Req 11.7).
4. **Failures are diagnosable, never silent.** Every skip, truncation, or collision produces a warning naming the parameter; enumerated names throw (Req 2).
5. **No new eager module-load cost.** Secrets Manager is required lazily; nothing new runs at `require()` time (Req 8.3).

## Glossary

Terms beyond those in [requirements.md](requirements.md):

- **Loader**: an internal class that turns configuration entries into a populated store by calling AWS
- **Discovery**: resolving a path to the concrete parameter names beneath it, always via `GetParametersByPath`
- **Retrieval**: fetching a value for a known name, via either transport
- **Segments**: the `/`-delimited path components of a parameter name below its matched group prefix
- **Prefix match**: selection of the configured entry whose normalized path is the longest prefix of a returned parameter name
- **Shadow collision**: the case where one parameter name is a strict path prefix of another, so one would have to be both a scalar and an object
- **Seeded value**: a value already known from a discovery response, injected into a `CachedParameterSecret` to avoid a redundant retrieval

## Architecture

### Current architecture

```
AppConfig.init({ssmParameters})
  └─ _initParameters ─ _getParameters ─ _getParametersFromStore
                                          └─ AWS.ssm.getByName / getByPath   [no batching, no paging]
                                          └─ inline key assignment           [prototype-reachable defect]

new CachedSsmParameter(name)  ─ refresh ─ _requestSecretsFromLambdaExtension ─ http localhost:2773
new CachedSecret(id)          ─ refresh ─ _requestSecretsFromLambdaExtension ─ http localhost:2773
```

Two paths, no shared code, `CachedParametersSecrets.classes.js` does not import `AWS.classes.js`.

### New architecture

```
                          ┌─────────────────────────────────────────────┐
AppConfig.init            │  src/lib/utils/  (internal, not exported)   │
 ├─ ssmParameters ────────┼──> ParameterStoreLoader                     │
 ├─ secrets ──────────────┼──> SecretsManagerLoader                     │
 │                        │      both use ─> ParameterKeySafety          │
 ├─ parameters()          │                                             │
 └─ secrets()             │    ExtensionAvailability                    │
                          └─────────────────────────────────────────────┘
                                        ▲                    ▲
_initParameters (deprecated)            │                    │
 └─ _getParameters (deprecated)         │                    │
     └─ _getParametersFromStore ────────┘                    │
                                                             │
CachedParameterSecrets.init ──> discovery via ParameterStoreLoader
CachedParameterSecret.refresh ──> transport selected by ExtensionAvailability
   ├─ Layer  ─> http localhost:<port>
   └─ SDK    ─> AWS.ssm.getByName | AWS.secrets.get
```

### Module layout

| File | Responsibility | Exported publicly |
|---|---|---|
| `src/lib/utils/ParameterKeySafety.class.js` | Key validation, path normalization, prefix matching, grouped and nested assignment | No |
| `src/lib/utils/ParameterStoreLoader.class.js` | SSM batching, pagination, recursion, grouping | No |
| `src/lib/utils/SecretsManagerLoader.class.js` | Secret retrieval, optional JSON parsing, nesting | No |
| `src/lib/utils/ExtensionAvailability.class.js` | Availability state machine, port resolution, failure classification | No |
| `src/lib/tools/AWS.classes.js` | Adds lazy `secrets` accessor | Yes (`AWS.secrets`) |
| `src/lib/tools/CachedParametersSecrets.classes.js` | Adds `init()`, `info()`, `clear()`, SDK fallback | Yes |
| `src/lib/tools/index.js` | Adds `options.secrets`, `parameters()`, `secrets()`; deprecates the seam | Yes |

Per `AGENTS.md` §3.4 all four new classes live in `src/lib/utils/`, carry `@private` JSDoc, and are absent from `src/index.js`, `src/lib/tools/index.js`, and the public type definitions (Req 7.1-7.3, 19.7).

### Execution flow: `AppConfig.init({ ssmParameters })`

```
1. init() builds loadPromise = _initParameters(options.ssmParameters)      [unchanged call]
2. init() assigns _ssmParameters = loadPromise                            [unchanged contract]
3. init() derives registered = loadPromise.then(store => {
        _parametersResolved = store; return true;
   }).catch(err => { DebugAndLog.error(...); return false; })
4. init() calls add(registered)                                           [contained per Req 16]
5. _initParameters → _getParameters → _getParametersFromStore
6. _getParametersFromStore → ParameterStoreLoader.load(entries)
7. returns result.store, discarding result diagnostics                    [legacy shape]
```

Steps 2 and 3 are the crux of Requirement 18: `_ssmParameters` keeps resolving to the paramstore while the *registered* promise resolves to a boolean. Verified that holding a second reference to a rejecting promise emits no unhandled rejection, because the `.then().catch()` chain attaches a handler to the original.

### Execution flow: `CachedParameterSecret.refresh()`

```
1. if isRefreshing() return cache.promise                                 [unchanged]
2. status = 0; cache.promise = new Promise(...)
3. transport = ExtensionAvailability.transportForRetrieval()
4. if transport === LAYER:
      loop up to 3 times: result = requestFromExtension()                 [unchanged retry count]
      if result.reason === CONNECTION_REFUSED:
          ExtensionAvailability.markUnavailable(reason)
          transport = SDK                                                 [fall through, same tick]
5. if transport === SDK:
      result = requestFromSdk()                                           [single attempt, Req 11.9]
6. on success: value = normalize(result); lastRefresh = Date.now(); status = 1
   on failure: status = -1
7. timer.stop(); resolve(status)                                          [never rejects]
```

## Components and Interfaces

### ParameterKeySafety

Stateless. All methods static. This is the single chokepoint for externally-derived keys.

```js
/**
 * @private
 */
class ParameterKeySafety {
	/** Dangerous keys retained alongside the allowlist because `__proto__` satisfies the pattern (Req 1.7). */
	static DANGEROUS_KEYS = ["__proto__", "constructor", "prototype"];
	static VALID_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

	/** @returns {boolean} */
	static isSafeKey(key) { }

	/** @returns {{safe: boolean, reason: string|null}} */
	static checkKey(key) { }

	/** Normalizes to exactly one trailing slash. @returns {string} */
	static normalizePath(path) { }

	/** @returns {object} Object.create(null) accumulator (Req 7.6) */
	static createAccumulator() { }

	/** Own-property-safe single-level set. @returns {boolean} assigned */
	static setGrouped(store, group, name, value) { }

	/** Own-property-safe nested set for recursive results. @returns {{assigned: boolean, reason: string|null}} */
	static setGroupedPath(store, group, segments, value) { }

	/** @returns {{group: string, segments: string[]}|null} null when no entry matches */
	static resolveGroupAndSegments(parameterName, normalizedEntries) { }

	/** @returns {Array<{name: string, shadowedBy: string}>} */
	static detectShadowCollisions(parameterNames) { }
}
```

`setGrouped` and `setGroupedPath` are the only functions in the codebase permitted to perform bracket assignment with an externally-derived key.

### ParameterStoreLoader

```js
/**
 * @private
 */
class ParameterStoreLoader {
	static MAX_NAMES_PER_CALL = 10;      // GetParameters hard limit
	static MAX_RESULTS_PER_PAGE = 10;    // GetParametersByPath hard limit
	static MAX_CONCURRENT_CALLS = 5;     // throttle guard (Req 4.4)

	/**
	 * @returns {Promise<{store: object, skipped: Array, invalid: Array, collisions: Array, pages: number}>}
	 */
	static async load(entries) { }

	/** @returns {Promise<Array<{Name, Value, Type}>>} */
	static async #retrieveByNames(names) { }

	/** Follows NextToken to exhaustion (Req 5). @returns {Promise<Array>} */
	static async #discoverByPath(normalizedPath, recursive) { }
}
```

`#discoverByPath` is also the discovery primitive `CachedParameterSecrets.init()` reuses, so pagination is implemented once.

### SecretsManagerLoader

```js
/**
 * @private
 */
class SecretsManagerLoader {
	/**
	 * @returns {Promise<{store: object, skipped: Array, failed: Array}>}
	 */
	static async load(entries) { }

	/** @returns {string|object} raw string, or parsed object when entry.parseJson (Req 14.4-14.8) */
	static #resolveValue(entry, response) { }
}
```

### ExtensionAvailability

```js
/**
 * @private
 */
class ExtensionAvailability {
	static STATE = { UNKNOWN: "unknown", AVAILABLE: "available", UNAVAILABLE: "unavailable" };
	static REASON = {
		OVERRIDE: "override",
		NO_SESSION_TOKEN: "no-session-token",
		CONNECTION_REFUSED: "connection-refused",
		TIMEOUT: "timeout",
		PROBED_OK: "probed-ok"
	};

	static #state = ExtensionAvailability.STATE.UNKNOWN;
	static #reason = null;
	static #override = null;

	/** Explicit init override, evaluated before any heuristic (Req 9.2). */
	static setOverride(useExtension) { }

	/** Applies the env heuristic; does not probe (Req 9.3-9.5). @returns {string} state */
	static evaluate() { }

	static markUnavailable(reason) { }
	static markAvailable(reason) { }

	/** @returns {"layer"|"sdk"} */
	static transportForRetrieval() { }

	/** @returns {string} resolved hostname */
	static hostname() { }

	/** PARAMETERS_SECRETS_EXTENSION_HTTP_PORT, else CachedParameterSecret.port (Req 9.5-9.6). */
	static port() { }

	/** @returns {{state, reason, hostname, port, transport}} for info() */
	static toObject() { }

	/** Test seam only. */
	static reset() { }
}
```

### CachedParameterSecrets additions

```js
/**
 * Initialize parameters and secrets from path and name groupings.
 * @param {object} options
 * @param {Array<{group?: string, path: string, names?: string[], recursive?: boolean}>} [options.ssmParameters]
 * @param {Array<{group?: string, names: string[], parseJson?: boolean}>} [options.secrets]
 * @returns {Promise<{registered: number, discovered: number, skipped: Array}>}
 */
static async init(options = {}) { }

/** @returns {{availability: object, registered: Array, counts: object}} never includes values (Req 13.6) */
static info() { }

/** Clears the registry. Primarily a test seam (Req 13.7-13.8). */
static clear() { }
```

### AppConfig additions

```js
static _parametersResolved = null;   // declared beside _settings / _connections (Req 18.12)
static _secretsResolved = null;

/**
 * Resolved SSM parameters. Null until AppConfig.promise() settles.
 * @returns {object|null}
 */
static parameters() { return AppConfig._parametersResolved; }

/**
 * Resolved Secrets Manager secrets. Null until AppConfig.promise() settles.
 * @returns {object|null}
 */
static secrets() { return AppConfig._secretsResolved; }
```

Both are synchronous and return `null` before initialization completes, matching `settings()` and `connections()` (Req 15.1-15.6). They are populated in the `.then()` of the derived registered promise, which is the only writer.

Naming note: `AppConfig.secrets()` (the accessor) and `options.secrets` (the init key) are intentionally symmetric with the existing `settings()` / `options.settings` pairing.

### AWS.secrets

```js
static #secretsSdk = null;      // memoized { client, sdk } or { error }

/**
 * @returns {{client: object|null, get: function, sdk: object|null, available: boolean, reason: string|null}}
 */
static get secrets() { }
```

The accessor keeps the established shape — a fresh object literal per access carrying `client`, verbs, and `sdk` — so the `jest.spyOn(AWS, 'secrets', 'get')` mocking pattern works identically to `ssm` (Req 8.1, test steering). Laziness lives *behind* the getter in `#secretsSdk`, not in the getter's return value.

## Data Models

### Configuration entry shapes

```js
// SSM parameters — enumerated names
{ group: "app", path: "/myapp/prod/", names: ["authUsername", "authPassword"] }

// SSM parameters — path discovery, optionally recursive (Req 6.1-6.2)
{ group: "app", path: "/myapp/prod/", recursive: false }

// Secrets — always enumerated; there is no list endpoint and no path form
{ group: "app", names: ["myapp/db/credentials"], parseJson: false }
```

`recursive` defaults to `false`. `parseJson` defaults to `false` (Req 14.4).

### Store shapes

```js
// Non-recursive parameters
{ app: { authUsername: "svc", authPassword: "..." } }

// Recursive: /myapp/prod/ containing /myapp/prod/db/host
{ app: { authUsername: "svc", db: { host: "db.example.com" } } }

// Secrets, raw (default)
{ app: { "myapp/db/credentials": "{\"username\":\"admin\"}" } }

// Secrets, parseJson: true — nested under secret name per Req 14.6
{ app: { "myapp/db/credentials": { username: "admin", password: "..." } } }
```

Note the secret name is used verbatim as a key and may contain `/`, which fails `VALID_KEY_PATTERN`. Resolved under Known Limitations below.

### Wrapper shape normalization (Req 11.5-11.6)

| Source | Raw response | Normalized to |
|---|---|---|
| Layer, SSM | `{Parameter: {Name, Value, ...}}` | unchanged |
| SDK, SSM | `{Parameters: [{Name, Value, ...}], InvalidParameters: []}` | `{Parameter: Parameters[0]}` |
| Layer, secret | `{ARN, Name, SecretString, ...}` | unchanged |
| SDK, secret | `{ARN, Name, SecretString, ...}` | unchanged |

Both SSM forms then satisfy `"Parameter" in value`, and both secret forms satisfy `"SecretString" in value`, so `sync_getValue()`, `toString()`, `toJSON()`, and connection basic auth are untouched (Req 17.3-17.4, 17.8).

## Algorithms

### Longest-prefix group resolution (Req 6.4-6.5)

This is the piece flagged as unresolved in review. Overlapping configured paths are settled by prefix length, making resolution independent of API response order.

```
PRE-PASS, once per load:
	normalizedEntries := entries mapped to { path: normalizePath(entry.path), group, recursive }
	sort normalizedEntries by path.length DESCENDING

RESOLVE(parameterName):
	FOR each entry IN normalizedEntries:            // longest first
		IF parameterName startsWith entry.path:
			remainder := parameterName after entry.path
			segments  := remainder split on "/"
			IF segments.length > 1 AND NOT entry.recursive:
				RETURN null                         // deeper than a non-recursive entry claims
			RETURN { group: entry.group, segments }
	RETURN null                                     // Req 3.1-3.2: warn and skip
```

Worked example. Configured: `/app/` recursive, and `/app/db/` non-recursive with group `database`.

| Returned name | Matched entry | Group | Segments | Result |
|---|---|---|---|---|
| `/app/host` | `/app/` | `app` | `["host"]` | `store.app.host` |
| `/app/db/host` | `/app/db/` (longer) | `database` | `["host"]` | `store.database.host` |
| `/app/cache/ttl` | `/app/` | `app` | `["cache","ttl"]` | `store.app.cache.ttl` |
| `/other/x` | none | — | — | warn, skip |

The second row is the answer to the overlap question: the more specific entry wins and the recursive parent does not also claim it.

### Shadow collision detection (Req 6.6)

A recursive query can return both `/app/db` and `/app/db/host`, which would require `store.app.db` to be simultaneously a string and an object. Detected in a pre-pass so behavior does not depend on response ordering:

```
DETECT(parameterNames):
	sorted := parameterNames sorted ascending
	collisions := []
	FOR i IN 0..sorted.length-1:
		FOR j IN i+1..sorted.length-1:
			IF sorted[j] startsWith sorted[i] + "/":
				collisions.push({ name: sorted[j], shadowedBy: sorted[i] })
	RETURN collisions
```

Resolution: the shallower scalar is kept, every deeper name is skipped with a warning naming both parameters. Deterministic, and it favors the value a non-recursive configuration would have produced.

### Nested assignment (Req 1, 6.6)

```
SET_GROUPED_PATH(store, group, segments, value):
	IF NOT isSafeKey(group): RETURN { assigned: false, reason: "unsafe-group" }
	FOR each segment IN segments:
		IF NOT isSafeKey(segment): RETURN { assigned: false, reason: "unsafe-segment" }

	IF NOT hasOwnProperty(store, group): store[group] := {}
	node := store[group]

	FOR i IN 0..segments.length-2:
		IF hasOwnProperty(node, segments[i]):
			IF node[segments[i]] is NOT a plain object:
				RETURN { assigned: false, reason: "shadow-collision" }
		ELSE:
			node[segments[i]] := {}
		node := node[segments[i]]

	leaf := segments[last]
	IF hasOwnProperty(node, leaf) AND node[leaf] is a plain object:
		RETURN { assigned: false, reason: "shadow-collision" }
	node[leaf] := value
	RETURN { assigned: true, reason: null }
```

`hasOwnProperty` is always `Object.prototype.hasOwnProperty.call(...)`, never the `in` operator (Req 1.1). Every created node is a plain `{}` so consumers retain inherited methods (Req 7.5); only the top-level *accumulator* is `Object.create(null)` (Req 7.6).

### Batching and pagination (Req 4, 5)

```
RETRIEVE_BY_NAMES(names):
	chunks := partition(names, 10)
	results := []
	FOR each slice OF chunks IN groups of MAX_CONCURRENT_CALLS:
		responses := await Promise.all(slice mapped to AWS.ssm.getByName({Names, WithDecryption: true}))
		FOR each response:
			results.push(...response.Parameters)
			FOR each invalid IN response.InvalidParameters:
				record invalid                      // Req 4.5: warn, do not throw
	RETURN results

DISCOVER_BY_PATH(path, recursive):
	results := []; token := null; pages := 0
	REPEAT:
		query := { Path: path, WithDecryption: true, MaxResults: 10 }   // Req 19 explicit
		IF recursive: query.Recursive := true
		IF token: query.NextToken := token
		response := await AWS.ssm.getByPath(query)
		results.push(...response.Parameters)
		token := response.NextToken; pages := pages + 1
	UNTIL token is absent
	RETURN results
```

### Availability resolution (Req 9)

```
EVALUATE():
	IF #override is not null:
		RETURN #override ? AVAILABLE(OVERRIDE) : UNAVAILABLE(OVERRIDE)
	IF AWS_SESSION_TOKEN absent or empty:
		RETURN UNAVAILABLE(NO_SESSION_TOKEN)        // Req 9.4, no request issued
	RETURN UNKNOWN                                   // inconclusive; first attempt decides
```

Failure classification on the first layer attempt:

| Outcome | State | Falls back to SDK |
|---|---|---|
| 2xx, parseable body | `available` | No |
| `ECONNREFUSED` / `EHOSTUNREACH` / `ENOTFOUND` | `unavailable` | Yes |
| Request timeout | `unavailable` | Yes |
| Non-2xx status | `available` | **No** |
| 2xx, unparseable body | `available` | No |

**Deliberate decision on non-2xx.** A non-2xx means the extension is present and answered; the *request* failed (unknown parameter, bad token, throttle). Treating that as "layer unavailable" would silently switch transport on a misconfiguration, doubling latency and masking the real error. So it marks `available`, the failure surfaces through the existing `status = -1` path, and only an explicit override forces SDK. The tradeoff: a function with the layer installed but a broken extension token will not self-heal via SDK. That is the right default — silent transport switching on auth failure hides a deployment problem — and the override exists for operators who want the other behavior.

## Correctness Properties

Each becomes a fast-check property test. Property numbering is referenced by tasks.md.

**Property 1 — Bug condition: prototype-reachable keys.** *For any* group or name drawn from `Object.getOwnPropertyNames(Object.prototype)`, loading completes, no own property is added to `Object.prototype` or to any function reachable from it, and no built-in function object gains a property. **Validates: Req 1.2-1.4**

**Property 2 — Bug condition: dangerous keys.** *For any* group or name in `{__proto__, constructor, prototype}`, the parameter is not stored and `Object.prototype` is unmodified. **Validates: Req 1.5, 1.7**

**Property 3 — Preservation: safe keys round-trip.** *For any* group and name matching `/^[a-zA-Z0-9_.-]+$/`, the value is stored at `store[group][name]`, is enumerable via `Object.keys`, and equals the input. **Validates: Req 1.6, 7.5**

**Property 4 — Bug condition: group named for a prototype member is usable.** *For any* group in `{toString, valueOf, hasOwnProperty, isPrototypeOf, propertyIsEnumerable, toLocaleString}` with a safe name, the group appears in `Object.keys(store)` and the value is readable. This is the live v1.3.16 defect. **Validates: Req 1.2-1.4**

**Property 5 — Enumerated rejection throws, discovered rejection warns.** *For any* unsafe key reached as an enumerated name the loader throws; *for any* unsafe key reached by path discovery it warns, skips, and stores all remaining parameters. **Validates: Req 2.1-2.5**

**Property 6 — Completeness: batching.** *For any* N enumerated names, all N existing parameters are returned and `ceil(N/10)` `GetParameters` calls are issued. **Validates: Req 4.1-4.3**

**Property 7 — Completeness: pagination.** *For any* N parameters under a path, all N are returned regardless of how the mock splits them across `NextToken` pages. **Validates: Req 5.2-5.5**

**Property 8 — Prefix determinism.** *For any* set of configured paths and any returned parameter name matching more than one, the selected group is the one whose normalized path is the longest prefix, independent of entry order and response order. **Validates: Req 6.4**

**Property 9 — Trailing slash invariance.** *For any* configured path, results are identical whether or not the caller supplied a trailing slash. **Validates: Req 3.3-3.4**

**Property 10 — Unmatched parameters never throw.** *For any* returned parameter matching no configured entry, loading completes, the parameter is reported, and every matched parameter is still stored. **Validates: Req 3.1-3.2, 3.5**

**Property 11 — Shadow collisions are deterministic.** *For any* set containing a name that is a strict path prefix of another, the shallower scalar is stored, deeper names are reported, and the outcome is independent of response order. **Validates: Req 6.6**

**Property 12 — Transport equivalence.** *For any* parameter or secret resolvable by both transports, `getValue()` returns an identical string and `isValid()` is true under both. **Validates: Req 11.7-11.8**

**Property 13 — Wrapper shape invariance.** *For any* value obtained via the SDK, the normalized wrapper satisfies the same `isValid()` predicate as the layer form, and `sync_getValue()` returns the value. **Validates: Req 11.5-11.6**

**Property 14 — Preservation: unresolved contract.** *For any* name, `sync_getValue()` throws matching `CachedParameterSecret Error` while unresolved, and `toString()`/`toJSON()` return `[Pending: <name>]`; once resolved by either transport both equal `sync_getValue()`. **Validates: Req 17.3-17.4**

**Property 15 — Preservation: lenient construction.** *For any* constructor name value including null, undefined, empty string, number, object, and array, construction does not throw and `getName()` round-trips it. **Validates: Req 17.1-17.2**

**Property 16 — Availability determinism.** *For any* sequence of retrievals after availability is resolved, every retrieval uses the same transport and no additional probe is issued. **Validates: Req 9.9-9.10**

**Property 17 — Failure classification.** *For any* extension outcome, the classification table above is honored: connection errors and timeouts yield `unavailable` and fall back; non-2xx and unparseable 2xx yield `available` and do not. **Validates: Req 10.2-10.5**

**Property 18 — Legacy seam contract.** *For any* entry array, `_initParameters()` resolves to the paramstore (never a boolean or wrapper), and `await AppConfig._ssmParameters` equals that paramstore. **Validates: Req 18.1-18.2, 18.8**

**Property 19 — Error containment.** *For any* retrieval failure, `AppConfig.promise()` resolves, the registered promise resolves `false`, no unhandled rejection is emitted, and `parameters()` returns null. **Validates: Req 16.1-16.5, 18.10**

**Property 20 — Registry dedupe.** *For any* name registered by both `init()` and direct construction, the registry holds exactly one entry for it. **Validates: Req 12.9**

**Property 21 — No value leakage in diagnostics.** *For any* resolved parameter or secret, its value appears in neither `info()` nor `toObject()` output, nor in any warning or error message. **Validates: Req 2.4, 13.6**

**Property 22 — JSON secret key safety.** *For any* JSON secret payload including keys `__proto__`, `constructor`, and `prototype`, parsing stores no property on `Object.prototype` and unsafe keys are skipped with a warning. **Validates: Req 14.7**

## Error Handling

| Condition | Handling | Rationale |
|---|---|---|
| Enumerated name fails key validation | Throw from loader; contained by `init()` wrapper, `promise()` resolves `false` | Req 2.1; a credential explicitly requested must not vanish |
| Discovered name fails key validation | `DebugAndLog.warn`, skip, continue | Req 2.3; one bad parameter must not block the rest |
| No configured entry matches | `DebugAndLog.warn`, skip, continue | Req 3.2 |
| Shadow collision | `DebugAndLog.warn` naming both, keep shallower | Req 6.6 |
| Name in `InvalidParameters` | `DebugAndLog.warn`, omit from store | Req 4.5 |
| `GetParameters` / `GetParametersByPath` rejects | Propagate to `init()` wrapper, contained | Req 16.1-16.3 |
| Secrets Manager SDK package absent | `AWS.secrets.available === false` with reason; retrieval fails with a diagnosable error | Req 8.4-8.5 |
| `parseJson` on non-JSON value | `DebugAndLog.warn`, store raw string | Req 14.8 |
| Extension connection refused | Mark `unavailable`, fall back to SDK | Req 9.8 |
| Extension non-2xx | Mark `available`, fail this retrieval, `status = -1` | Design decision above |
| Binary-only secret | `isValid()` false, treated as unresolved | Known limitation below |

No new throw escapes `AppConfig.init()`; every path resolves through the Requirement 16 containment.

## Testing Strategy

Per `test-requirements.md` and `test-execution-monitoring.md`. All files `.jest.mjs`, run via `node --experimental-vm-modules node_modules/jest/bin/jest.js`. No test invokes `npm test`.

### New shared mocks

`test/helpers/extension-mock.mjs` — spies `http.request`, with factories for: 2xx SSM body, 2xx secret body, `ECONNREFUSED`, timeout, non-2xx with JSON body, 2xx with malformed body (Req 21.1).

`test/helpers/aws-parameter-mocks.mjs` — getter spies for `AWS.ssm` and `AWS.secrets` returning complete objects, with factories for multi-page `NextToken` responses, `InvalidParameters`, and chunked `GetParameters` (Req 21.2-21.3).

### Layout

```
test/config/
  cached-parameter-secrets-init-tests.jest.mjs
  cached-parameter-secrets-info-tests.jest.mjs
  extension-availability-tests.jest.mjs
  sdk-fallback-tests.jest.mjs
  secrets-config-path-tests.jest.mjs
  property/
    transport-equivalence-property-tests.jest.mjs         # P12, P13
    availability-determinism-property-tests.jest.mjs      # P16, P17
    legacy-seam-preservation-property-tests.jest.mjs      # P18, P19
test/security/
  parameter-key-safety-tests.jest.mjs
  property/
    prototype-reachable-key-property-tests.jest.mjs       # P1, P2, P4, P22
test/utils/
  parameter-store-loader-tests.jest.mjs
  property/
    batching-pagination-property-tests.jest.mjs           # P6, P7
    prefix-resolution-property-tests.jest.mjs             # P8, P9, P10, P11
```

### Isolation

`ExtensionAvailability` and `CachedParameterSecrets` both hold process-global state. Every suite touching them calls `ExtensionAvailability.reset()` and `CachedParameterSecrets.clear()` in `beforeEach`, and `jest.restoreAllMocks()` in `afterEach` (Req 21.9). Property tests use the default 100 runs; none spawn child processes.

### Preservation gate

The four `test/config/appconfig-async-init-*` files and both cached-parameter `toString` property files must pass **unmodified** (Req 21.10). If any requires a change, the legacy seam design has been violated and the change is wrong.

## Backwards Compatibility Analysis

### Unchanged

- All public class and method signatures (Req 17.7)
- `_initParameters` / `_getParameters` / `_getParametersFromStore` signatures and return contracts (Req 18.1-18.4)
- `AppConfig._ssmParameters` resolving to the paramstore (Req 18.8)
- Constructor leniency and `getName()` round-trip (Req 17.1-17.2)
- `sync_getValue()` throw contract, `toString()`/`toJSON()` placeholders (Req 17.3-17.4)
- `CachedSSMParameter` alias (Req 17.5)
- `CachedParameterSecret.hostname` / `.port` writable (Req 9.6)
- Layer retry count of 3 (Req 11.10)
- `dynamo`, `s3`, `ssm` accessors eager and unchanged (Req 8.10)

### Intentionally changed

| Change | Impact | Req |
|---|---|---|
| More than 10 path parameters now returned | Consumers previously silently truncated now receive full data | 5 |
| More than 10 enumerated names no longer throws | Previously a `ValidationException` | 4 |
| Groups named for prototype members now work | Previously leaked to a shared function and returned empty | 1 |
| `AppConfig.promise()` no longer rejects on parameter failure | Anyone catching that rejection now sees success; must check `parameters()` | 16 |
| Retrieval succeeds without the layer | New AWS calls, new IAM requirements, new latency | 11 |
| Deprecation notice logged once per process | New log line for subclass-pattern users | 18.7 |

### Deprecations

`_initParameters`, `_getParameters`, `_getParametersFromStore` gain `@deprecated` JSDoc and a once-per-process notice keyed by method name in a module-level `Set` (Req 18.6-18.7). All remain fully functional for at least one major version per `AGENTS.md` §2.1.

## Known Limitations

1. **Secret names containing `/` cannot be group keys as-is.** `myapp/db/credentials` fails `VALID_KEY_PATTERN`. Design: secret *names* are exempt from segment validation and stored as a single verbatim key via `setGrouped` (never split on `/`), because the name is caller-supplied configuration rather than a discovered value. Keys produced by `parseJson` are fully validated (Req 14.7). This asymmetry is deliberate and must be documented.
2. **Binary secrets are unsupported.** `GetSecretValue` omits `SecretString` for binary secrets, so `isValid()` returns false and the value reads as unresolved. Pre-existing for the layer path; this design does not change it. Worth a documented warning rather than silent failure.
3. **Path discovery requires SDK permissions regardless of transport**, per the Overview. `ssm:GetParametersByPath` is not optional for path-based configuration.
4. **`init()` seeds discovered values** to avoid a redundant retrieval per discovered name. A seeded instance's `cache.lastRefresh` is set at discovery time, so its first `refreshAfter` window is measured from discovery rather than from first use.
5. **No cross-invocation caching.** Values live in module scope for the container's lifetime only; this design adds no DynamoDB or S3 persistence.

## Documentation and Release Design

### Type definitions (Req 19)

Additions to `types/lib/tools/index.d.ts`, placed beside their existing siblings:

| Declaration | Placed with |
|---|---|
| `AWS.secrets` return shape | the existing `ssm` accessor block |
| `AppConfig.parameters()`, `AppConfig.secrets()` | `settings()` / `connections()` |
| `options.secrets` on `AppConfig.init` | `options.ssmParameters` |
| `CachedParameterSecrets.init()`, `info()`, `clear()` | the `CachedParameterSecrets` block |
| `recursive` and `parseJson` entry options | the parameter entry type |

The four `src/lib/utils/` classes are absent from the public types (Req 19.7). `test/types/consumer-appconfig-extend.ts` currently passes `ssmParameters` as an object literal while the implementation requires an array — a pre-existing type/implementation mismatch. Correcting the entry type will surface it, so that fixture needs updating alongside.

### Documentation (Req 20)

New `docs/` content covering transport selection, with three points that must be stated explicitly because they are easy to get wrong:

1. **`ssm:GetParametersByPath` is required for path-based configuration even with the layer installed**, because the extension has no list endpoint (Overview).
2. **SDK retrieval requires `ssm:GetParameters`, `secretsmanager:GetSecretValue`, and `kms:Decrypt`** in addition, and this is an action-required item for anyone dropping the layer (Req 20.4, 20.6).
3. **Recursive path queries grant transitive read access.** A principal permitted on `/a` can read `/a/b` even when IAM explicitly denies the deeper parameter, so `recursive` defaults to false (Req 6.7).

Changelog entries under an unreleased v1.3.16 section: SDK fallback and the new APIs under **Added** with the IAM action-required note; pagination, batching, key safety, and path-mismatch fixes under **Fixed**; the three seam methods under **Deprecated** noting they remain fully supported and now carry the fixes (Req 20.6-20.9).

### Prior version deprecation (Req 22)

`npm deprecate` on the v1.1.x and v1.2.x ranges pointing at `>=1.3.10`. This is a registry action taken at release time, not a code change, and does not affect availability for existing installations (Req 22.3). It belongs in tasks.md as a release step rather than in any component above.

## Implementation Notes

1. **Require-cycle check.** `CachedParametersSecrets.classes.js` will import `AWS.classes.js` for the first time. `AWS.classes.js` requires `./PowertoolsInit` inside a function, and `tools/index.js` requires both. Verify no cycle; if one appears, require `AWS` lazily inside `_requestFromSdk()`.
2. **Do not convert the accessor getters to memoized singletons.** The suite depends on a fresh object literal per access for getter spying. Memoize `#secretsSdk` behind the getter instead.
3. **`DANGEROUS_KEYS` at module scope**, not inside iteration (Req 1.8).
4. **Every `hasOwnProperty` via `Object.prototype.hasOwnProperty.call`**, never `obj.hasOwnProperty` (the object may have a `hasOwnProperty` group) and never `in`.
5. **Never log values.** Warnings name the group, parameter name, and reason only (Req 2.4, 21 P21). `toObject()` already excludes the value but returns `cache` by reference — worth returning a copy.
6. **Configure an explicit request timeout** on the extension request so the existing `req.on('timeout')` handler becomes reachable (Req 10.7).
7. **Security comment notation.** Mark key-safety and transport-selection decisions with `// >!` per `secure-coding-practices.md`.

## Summary

The design turns two unrelated retrieval paths into one layered stack: four internal classes under `src/lib/utils/` own key safety, SSM loading, secrets loading, and availability; the public `AppConfig` and `CachedParameterSecrets` surfaces become thin adapters over them; and the deprecated three-method seam is preserved exactly so existing consumers and tests are untouched while inheriting every fix.

The two decisions worth re-reading before implementation are the **non-2xx classification** (extension present but failing does *not* trigger SDK fallback) and the **longest-prefix rule with shadow-collision pre-pass**, which together settle the two ambiguities carried out of requirements review.

## Related Documentation

- [requirements.md](requirements.md) - The 22 requirements this design satisfies
- [PLAN.md](PLAN.md) - Workstreams and the answered design questions
- [FINDINGS.md](FINDINGS.md) - Source of Requirements 1 through 3
- [1-3-x-convert-aws-to-lazy-accessors](../1-3-x-convert-aws-to-lazy-accessors/SPEC.md) - Deferred full lazy conversion
- [AWS: GetParametersByPath](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParametersByPath.html) - `MaxResults` ceiling of 10, `NextToken`, recursive access note
- [AWS: GetParameters](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html) - 10-name maximum
- [AWS: GetSecretValue](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html) - `SecretString` omitted for binary secrets
- [AWS: Using the Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) - single-item endpoints only

*Content from AWS documentation was rephrased for compliance with licensing restrictions.*
