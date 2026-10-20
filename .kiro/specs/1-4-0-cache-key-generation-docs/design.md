# Design: Cache Key Generation Documentation Correction

- **Spec**: `1-4-0-cache-key-generation-docs`
- **Source issue**: [#235](https://github.com/63Klabs/cache-data/issues/235) (`issue.md`)
- **Package version**: `1.4.0` (from `package.json`)
- **Precedes**: `tasks.md`
- **Basis**: `requirements.md` (Requirements 1-11), `PLAN.md` (Q1-Q7 resolved)

## Overview

This design corrects the "Cache Key Generation" documentation so it matches the implementation,
documents the drift sources around the `id_hash`, adds a diagnostic walkthrough, and makes one
behavior-preserving code change (X2) plus one additive code change (X3). The governing safety
property is that no change alters the `id_hash` for a caller that passes a fresh `connection` object
per request.

The two design-phase verifications flagged in `requirements.md` are now resolved against the current
source and recorded under Architecture (§ Verification results). Their outcomes drive concrete
decisions in the X2 and X3 component designs.

## Architecture

The work splits into a documentation track (Phase 1: D1-D7) and a small code track (X2, X3). The
code track touches only `CacheableDataAccess.getData` and `Cache.info()` in `src/lib/dao-cache.js`;
no module boundary, class responsibility, or public export changes. The hashing path
(`Cache.generateIdHash` -> `tools.hashThisData` -> `DataHasher.hash`) is **not** modified — its
behavior is documented, not changed.

### Verification results (resolved by reading and running the current source)

#### Verification 1 — F2 and F3 under the current single hasher

The hasher is `DataHasher.hash` (`src/lib/utils/DataHasher.class.js`), reached through
`tools.hashThisData` and `Cache.generateIdHash`. Its normalization step (the `JSON.stringify`
replacer, then `JSON.parse`) maps `bigint` to its string form and `undefined` to the **literal
string `'undefined'`**, and its leaf serialization is `-:::${dataType}:::${data.toString()}` where
`dataType` is `typeof value`.

Both behaviors were confirmed empirically (algorithm `RSA-SHA256`, throwaway script, deleted after
use):

| Probe | Input A | Input B | Result |
|-------|---------|---------|--------|
| F2 (undefined vs absent) | `{a:1, b:undefined}` | `{a:1}` | **different hashes** — confirmed |
| F2 (undefined vs literal string) | `{a:1, b:undefined}` | `{a:1, b:"undefined"}` | **same hash** — confirmed |
| F3 (type sensitivity) | `{x:300}` | `{x:"300"}` | **different hashes** — confirmed |

**Conclusions for the docs (Requirement 2, criteria 4-6):**

- **F2 warning IS warranted.** A key whose value is `undefined` hashes differently from an absent
  key. The accurate mechanism is the replacer, *not* `structuredClone` preservation. The doc prose
  must not repeat the plan's original `structuredClone` explanation. A precise, non-obvious
  corollary — an `undefined` value collides with the literal string `"undefined"` — belongs in the
  technical document, not the README.
- **F3 warning IS warranted.** The value type is encoded in the hash via the `dataType` tag, so a
  number sourced as a string (SSM, JSON, CloudFormation) will not match a hard-coded number.
- Neither warning is being added speculatively; both are measured against 1.4.0.

#### Verification 2 — `Connection` object identity

`Connection.toObject()` (`src/lib/tools/Connections.classes.js`) returns a **fresh, deep-cloned
object on every call** (via `safeClone` on headers, parameters, and the authentication object).
Confirmed: two successive `toObject()` calls are not `===`, their nested `headers` are not `===`,
and mutating a returned object does not affect a later `toObject()` result. `Connections.toObject()`
and `Connections.get(name)` behave consistently (the latter returns the `Connection` instance).

**Conclusions for X2 framing (Requirement 11, criterion 3):**

- A consumer who follows the documented path — `Config.init` builds `Connections`, each request
  obtains its connection via `connection.toObject()` — receives a **fresh object per call**. For
  that path, F1 does **not** bite, so X2 is **hardening**, not a live-bug fix.
- F1 is a **live bug** only for a consumer who captures a single `toObject()` result and reuses the
  captured reference across invocations, or who hand-builds and holds a plain connection object and
  passes that same reference each time.
- Therefore the changelog (Requirement 11) frames X2 as **hardening that also fixes a latent bug
  for reused-reference callers**, not as a fix for a defect on the documented happy path.

#### Stale `Connection` JSDoc accessor — folded into D7 (in scope)

The `Connection` class JSDoc examples call a `.get()` accessor (for example at the class-level
`@example` and in the `Connections` examples), but `Connection` exposes `toObject()`, not `get()`.
This is a stale-JSDoc defect in the same file family as D7. Per maintainer decision it is **folded
into D7's committed scope**: the `.get()` references in the `Connection` / `Connections` JSDoc in
`src/lib/tools/Connections.classes.js` are corrected to `toObject()` as part of this spec. See the
JSDoc alignment component for the amended D7 scope.

## Components and Interfaces

### Documentation components (Phase 1)

All README edits target `docs/features/cache/README.md` unless stated otherwise. Exact replacement
prose is specified so implementation is mechanical and reviewable.

#### "Cache Key Generation" rewrite (D1, D2 — Requirements 1, 2)

Replace the single-paragraph section at L576-581 with the following. It names all three inputs, the
`connection.options` exclusion and its rationale, the behavioral `cachePolicy` fields, the two-tier
salt, and the shared-cache consequence.

> ### Cache Key Generation
>
> The `id_hash` that identifies a cache entry is derived from three inputs together with a salt:
>
> 1. The `data` parameter passed to `CacheableDataAccess.getData()`.
> 2. The `connection` object — every field **except** `connection.options`. `options` is excluded
>    on purpose so runtime toggles such as `forceRefresh` and `timeout` do not change the key.
> 3. The full `cachePolicy` object, **including** its behavioral fields:
>    `defaultExpirationInSeconds`, `defaultExpirationExtensionOnErrorInSeconds`,
>    `expirationIsOnInterval`, `overrideOriginHeaderExpiration`, `encrypt`, `hostId`, `pathId`,
>    `headersToRetain`, and `profile`.
>
> The salt scopes keys to a deployment. It resolves to `sharedCacheId` when that is configured,
> otherwise to `AWS_LAMBDA_FUNCTION_NAME` (empty string if unset). `sharedCacheId` itself defaults
> from the `CACHE_SHARED_ID` environment variable during `Cache.init()`.
>
> **Consequence for shared caches.** Two functions that intend to share an entry must use identical
> `connection` (minus `options`) and identical `cachePolicy` objects, in addition to the same salt.
> Drift in any single `cachePolicy` field — even a purely operational one such as
> `defaultExpirationExtensionOnErrorInSeconds` — produces a different `id_hash`, and the functions
> will silently read and write different rows.
>
> **Exact match includes value types and empty keys.** The hash is value-type sensitive: a field
> whose value is the number `300` does not match the string `"300"` (a number arriving as a string
> from SSM, JSON, or a CloudFormation parameter is a common cause). A key present with the value
> `undefined` also does not match the same object with that key absent. See
> [Cache key hashing details](../../technical/cache-key-hashing.md) for the mechanism.

The two warning sentences in the last block satisfy Requirement 2 criteria 4-6; they are included
because Verification 1 confirmed the behavior. The link target is created under Data Models
(technical doc).

#### Shared-cache pitfalls callout and realistic example (D3 — Requirement 3)

In the "Shared Cache" section, add a pitfalls callout and revise the two-Lambda example.

Callout to add:

> **Shared cache pitfalls.** Both functions must agree on every hash input, not just `sharedCacheId`:
>
> - Identical `connection` (minus `options`) and identical `cachePolicy`, including behavioral
>   fields. A field added to one function's profile and not the other's splits the cache silently.
> - Matching value types and no stray `undefined`-valued keys (see Cache Key Generation above).
> - Obtain the connection per request. Do not capture a single connection object and reuse the same
>   reference across invocations.

Example revision: the current example shows both functions using one shared inline cache profile,
which hides the drift risk. Revise it so each function defines its own `connections.js` /
`cachePolicy` and obtains its connection per request via `connection.toObject()` (the documented,
fresh-object path confirmed in Verification 2). The example must not show a module-scope
`const conn = {...}` reused across invocations.

#### Drift troubleshooting walkthrough (D4 — Requirement 4)

Add a troubleshooting subsection:

> **Symptom.** A reader function behaves as though the shared cache is permanently empty and keeps
> falling through to its fetch/error path, even though the writer reports success.
>
> **Confirm.** On every `getData` completion the library logs, at normal level, a line tagged
> `CACHE`: `"<id_hash> | <path> | <status> | <elapsed>"`. Compare the `id_hash` for the same logical
> entry across both functions' logs. If they differ, the functions are not sharing the entry.
>
> **Diagnose — diff these inputs between the two functions:**
>
> 1. The resolved salt. Call `Cache.info()` and compare the salt provenance (`saltSource`) and
>    `sharedCacheId`.
> 2. The `connection` object (ignoring `connection.options`).
> 3. The full `cachePolicy`, field by field — including behavioral fields and value types.
> 4. Whether either function reuses a single connection object reference across invocations (a
>    reused reference can drift; obtain the connection per request).

Item 4 cross-references the X2 hazard (Requirement 4, criterion 3). Item 1 depends on X3.

#### Env-var consistency sweep (D5 — Requirement 5)

Two locations still present the removed switch as live. Update both to match the README's shipped
note ("deprecated, silently ignored as of 1.4.0"):

- `docs/00-example-implementation/README.md` — the `CACHE_DATA_USE_TOOLS_HASH_METHOD` reference.
- `docs/00-example-implementation/example-template-lambda-function.yml` — the env-var entry.

No code change (Requirement 5, criterion 4). The implementation already ignores the switch.

#### Duplicate options-table row (D6 — Requirement 6)

Remove the duplicate `idHashAlgorithm` row from the `Cache.init()` options table (two rows exist;
keep the one carrying the `RSA-SHA256` default and the `CACHE_DATA_ID_HASH_ALGORITHM` override).

#### JSDoc alignment (D7 — Requirement 9)

In `src/lib/dao-cache.js`:

- `Cache.generateIdHash` JSDoc: change the complex-object example from
  `{ query, connection, cachePolicy }` to `{ data, connection, cachePolicy }` to match what
  `getData` passes (the stale `query` wrapper is at the `@example` near L1972-1976).
- Ensure both `generateIdHash` and `getIdHash` JSDoc describe hash inputs and the two-tier salt
  consistently with the "Cache Key Generation" rewrite. The existing salt paragraph in
  `generateIdHash` is already correct and is the reference wording.
- Parameter names in JSDoc must match signatures exactly (per JSDoc standards).

In `src/lib/tools/Connections.classes.js` (folded into D7 per maintainer decision):

- Correct the `Connection` and `Connections` JSDoc `@example` blocks that call a nonexistent
  `.get()` accessor so they call `toObject()` instead (the actual accessor). This includes the
  class-level `@example` and any `const connObj = apiConnection.get();` style lines.
- Do not change any runtime code; this is a JSDoc-only correction. `Connections.get(name)` (which
  returns a `Connection` instance) is a real method and must not be altered — only the stale
  `Connection.get()` plain-object accessor references are wrong.

### Code component — X2: `CacheableDataAccess.getData` (Requirement 7)

**Current behavior.** In `getData` (`src/lib/dao-cache.js`), the hash is computed at L3266-3268 from
`{ data, connection, cachePolicy }`. Later, inside the refresh branch (L3280-3301), the code mutates
the caller's `connection` directly:

- L3281: `if ( !("headers" in connection)) { connection.headers = {}; }`
- L3283-3289: deletes invalid values from `connection.headers` in place.
- L3293-3300: assigns `connection.headers['if-none-match']` / `['if-modified-since']`.

Then L3302: `await apiCallFunction(connection, data)` passes the mutated object to the origin call.

**Change.** Introduce an internal working copy and perform all header preparation on it, leaving the
caller's `connection` untouched. Pass the working copy to `apiCallFunction`.

```js
// Hash is computed from the caller's connection as-is (unchanged, still L3266-3268).

// >! Work on an internal deep copy so the caller's connection object is never mutated.
// >! Mutating the caller's object caused id_hash drift when the reference was reused
// >! across warm invocations (see spec 1-4-0-cache-key-generation-docs, Requirement 7).
const requestConnection = tools.safeClone(connection);

if ( !("headers" in requestConnection) ) { requestConnection.headers = {}; }

for (const key in requestConnection.headers) {
    if (!Cache._isValidHeaderValue(requestConnection.headers[key])) {
        delete requestConnection.headers[key];
    }
}

const etag = cache.getETag();
if ( !("if-none-match" in requestConnection.headers) && Cache._isValidHeaderValue(etag) ) {
    requestConnection.headers['if-none-match'] = etag;
}

const lastModified = cache.getLastModified();
if ( !("if-modified-since" in requestConnection.headers) && Cache._isValidHeaderValue(lastModified) ) {
    requestConnection.headers['if-modified-since'] = lastModified;
}

let originalSource = await apiCallFunction(requestConnection, data);
```

Notes:

- `tools.safeClone` is the package's existing deep-clone helper (`src/lib/tools/utils.js`), already
  used throughout and already a dependency of this module's hashing path. Using it avoids a new
  dependency and matches house style.
- The hash input is unchanged: it is still computed from the original `connection` before any copy
  exists, so fresh-per-call callers get byte-identical `id_hash` (Requirement 7, criterion 5).
- `apiCallFunction` still receives the conditional-request markers, now on the copy, so revalidation
  requests are unchanged from the origin's perspective (Requirement 7, criterion 6).
- The header sanitization now operates on the copy (Requirement 7, criterion 7).
- The debug log line for a removed invalid header (currently L3287) can be retained against the copy
  or dropped; retaining it is preferred to avoid a behavior change in logging.

**Risk.** Low. The only observable changes are (a) the caller's `connection` is no longer mutated —
the intended fix — and (b) any caller that *read back* the injected markers from its own object
after `getData` will no longer find them. That read-back was an undocumented side effect; the
changelog calls it out (Requirement 11, criterion 2).

### Code component — X3: `Cache.info()` salt provenance (Requirement 8)

**Current behavior.** `Cache.info()` (`src/lib/dao-cache.js`) returns a merged object including
`idHashAlgorithm`, `sharedCacheId`, `useInMemoryCache`, `inMemoryOnly`, and (conditionally)
`inMemoryCache`. It does not report how the salt was resolved.

**Change.** Add a single additive field, `saltSource`, reporting which tier produced the salt. The
salt logic lives in `generateIdHash`; `info()` mirrors the same resolution without recomputing the
hash:

```js
// inside Cache.info(), additive only
info.saltSource =
    this.#sharedCacheId !== null ? "sharedCacheId"
    : (process.env?.AWS_LAMBDA_FUNCTION_NAME ? "AWS_LAMBDA_FUNCTION_NAME" : "none");
```

- The value is one of `"sharedCacheId"`, `"AWS_LAMBDA_FUNCTION_NAME"`, or `"none"` — a provenance
  label, never the salt bytes beyond what `sharedCacheId` already surfaces (Requirement 8,
  criterion 3).
- Additive only: no existing field is renamed or removed (Requirement 8, criterion 2).
- Update the `Cache.info()` JSDoc `@returns` block to document `saltSource` (Requirement 8,
  criterion 4).

**Risk.** Minimal. Additive field on an object-returning introspection method; no behavior depends
on it.

## Data Models

### Hash input object (unchanged, documented)

The object hashed by `getData` is `{ data, connection, cachePolicy }` (`src/lib/dao-cache.js`
L3266). `connection.options` is deleted from a clone before hashing; everything else participates.
This model is not modified by this spec; it is the subject of the D1/D2 documentation.

### Salt resolution (unchanged, documented and introspected)

Two-tier resolve inside `generateIdHash`: `sharedCacheId` when non-null, else
`AWS_LAMBDA_FUNCTION_NAME` (else `""`). `sharedCacheId` is itself seeded during `Cache.init()` from
the `CACHE_SHARED_ID` env var. X3 adds a read-only `saltSource` label mirroring this.

### `Cache.info()` return shape (additive change)

Existing fields are preserved. One field is added:

| Field | Type | Values |
|-------|------|--------|
| `saltSource` | string | `"sharedCacheId"`, `"AWS_LAMBDA_FUNCTION_NAME"`, `"none"` |

### Technical document (new file)

`docs/technical/cache-key-hashing.md` holds the mechanism behind the user-facing warnings: the
`DataHasher` normalization (replacer mapping `undefined` to the string `"undefined"` and `bigint` to
its decimal string), the `dataType`-tagged leaf serialization that makes the hash type sensitive,
sorted-key/order-significant-array behavior, and the `undefined`-collides-with-literal-`"undefined"`
corollary. This keeps the user-facing README concise (Requirement 2, criterion 7).

## Correctness Properties

These properties govern the X2 change and are the basis for its property test.

### Property 1: No caller mutation

For any `connection` object `C` and any refresh outcome, `getData(... C ...)` leaves `C`
structurally equal to its pre-call state (same keys, same nested values, same presence or absence of
`headers`).

**Validates: Requirements 7.1, 7.3**

### Property 2: Stable key across reuse

For a caller that passes the same reference `C` to two successive `getData` calls with no other
change, the two computed `id_hash` values are equal.

**Validates: Requirements 7.2**

### Property 3: No key change for fresh objects

For any `connection` value, the `id_hash` computed by the post-fix code equals the `id_hash` the
pre-fix code computed for the same value. Established by construction — the hash input is untouched —
and guarded by a property test over generated connection shapes.

**Validates: Requirements 7.5, 10.3**

### Property 4: Markers still excluded

`if-none-match` and `if-modified-since` never enter the hash input. Unchanged by this fix; asserted
to prevent regression.

**Validates: Requirements 7.4, 7.6**

## Error Handling

- **X2.** `tools.safeClone` already falls back from `structuredClone` to a `JSON.parse(JSON.stringify())`
  path and, failing that, returns the original object (see `src/lib/tools/utils.js`). A connection
  object that survives hashing (which requires JSON-serializability) will clone cleanly; no new
  error path is introduced. The surrounding `try/catch` in `getData` is unchanged.
- **X3.** Pure string computation from already-resolved state; no new throw sites. `process.env`
  access is guarded with optional chaining, matching the existing `generateIdHash` resolution.
- **Documentation tasks.** No runtime error surface.

## Testing Strategy

### Documentation validation test

Extend `test/documentation/` so the README's hash-input claims are checked against the
implementation rather than asserted in prose. Concretely: compute `Cache.generateIdHash` (or the
`getData` path) for two inputs differing only in one `cachePolicy` behavioral field (for example
`defaultExpirationExtensionOnErrorInSeconds`) and assert the hashes differ. This keeps D1/D2 honest
as the code evolves.

### X2 unit tests

- Caller `connection` is structurally unchanged after a refresh (covers Property 1 and Requirement 7
  criterion 1).
- A `connection` passed with no `headers` still has no `headers` after the call (criterion 3).
- Two calls with a reused reference yield equal `id_hash` (Property 2, criterion 2).
- `apiCallFunction` receives the conditional-request markers on the object it is given (criterion 6)
  while the caller's object does not (criterion 1).

Use the existing getter-mocking pattern for `tools.AWS.dynamo` (see steering) to drive the refresh
branch without real AWS.

### X2 property test

Generate varied `connection` shapes (with/without `headers`, nested objects, mixed value types) and
assert Property 3 (post-fix `id_hash` equals a snapshot computed from the same input the way the
pre-fix code hashed it) and Property 1 (no mutation). Follow the project property-test rules: rely on the global
`FC_SEED` hook, do not pass `seed` at the `fc.assert` call site, and keep generator preconditions
matched to the asserted rule.

### X3 test

Assert `Cache.info().saltSource` returns the correct label for each tier. Because `Cache.init()` is
a once-only global, use the subprocess-isolation pattern (see steering) to exercise the
`sharedCacheId`-set and `sharedCacheId`-unset cases without cross-test state bleed.

### Existing coverage to read first

`test/cache/cache-shared-id-property-tests.jest.mjs` and
`test/cache/cache-shared-id-validation-tests.jest.mjs` already cover salt resolution; read them
before adding tests to avoid duplication (Requirement 10, criterion 4).

### Suite gate

The full suite must pass before completion (Requirement 10, criterion 6).

## Changelog (Requirement 11)

Under `1.4.0` in `CHANGELOG.md`:

- **Documentation:** corrected "Cache Key Generation" to list all three hash inputs, the full
  `cachePolicy` participation, the two-tier salt, value-type and `undefined`-key sensitivity, a
  shared-cache pitfalls callout, and a drift troubleshooting walkthrough; reconciled stale
  `CACHE_DATA_USE_TOOLS_HASH_METHOD` references; removed a duplicate options-table row.
- **Fixed / Hardening:** `CacheableDataAccess.getData` no longer mutates the caller's `connection`
  object; conditional-request headers are prepared on an internal copy. This ends `id_hash` drift
  for callers that reuse a single `connection` reference across invocations and removes an
  undocumented side effect (injected `if-none-match` / `if-modified-since` on the caller's object).
  Callers that pass a fresh `connection` per request — including the documented
  `Connection.toObject()` path — see no change to their cache keys.
- **Added:** `Cache.info()` reports `saltSource` (`"sharedCacheId"`, `"AWS_LAMBDA_FUNCTION_NAME"`, or
  `"none"`) for shared-cache diagnosis.

Framing reflects Verification 2: X2 is hardening for the documented path and a latent-bug fix for
reused-reference callers (Requirement 11, criterion 3).

## Traceability

| Requirement | Design section |
|-------------|----------------|
| 1 (D1 accurate section) | Components — "Cache Key Generation" rewrite |
| 2 (D2 drift sources) | Components — rewrite (warnings gated by Verification 1); Data Models — technical doc |
| 3 (D3 pitfalls + examples) | Components — pitfalls callout |
| 4 (D4 troubleshooting) | Components — troubleshooting walkthrough |
| 5 (D5 env-var sweep) | Components — env-var sweep |
| 6 (D6 duplicate row) | Components — duplicate row |
| 7 (X2 no mutation) | Components — X2; Correctness Properties (Properties 1-4) |
| 8 (X3 salt provenance) | Components — X3; Data Models |
| 9 (D7 JSDoc) | Components — JSDoc alignment (dao-cache.js + Connections.classes.js) |
| 10 (tests) | Testing Strategy |
| 11 (changelog) | Changelog |
