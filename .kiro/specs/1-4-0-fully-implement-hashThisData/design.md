# Design: Fully Implement hashThisData

## Overview

This design promotes the built-in hasher to be the single hashing path for cache-key
generation, moves its logic into a dedicated internal `DataHasher` class, corrects array
order semantics so array element order becomes significant, and removes the external
`object-hash` dependency entirely. It targets release `1.4.0`.

Today, `Cache.generateIdHash()` defaults to `object-hash` and only uses the built-in
`tools.hashThisData()` when the experimental `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH`
switch is on (default off). Both current paths ignore array element order, which this
change deliberately corrects. The result is a single, predictable hashing path with one
externally observable behavior change (array order now matters) and a one-time cache
re-key on upgrade (the hash output differs from `object-hash` regardless of ordering).

The work is intentionally conservative with respect to the public surface. The existing
`tools.hashThisData(algorithm, data, options)` export is preserved and becomes a thin
wrapper that delegates to `DataHasher.hash(algorithm, data, options)`, so existing
consumers of that export keep working with only the documented behavior change. The new
`DataHasher` class is internal (placed in `src/lib/utils/`, not exported from the public
API), mirroring the `InMemoryCache` precedent.

### Goals

- A single internal class, `DataHasher`, owns all object-hashing logic.
- Array element order is significant; object key order is not, at every nesting depth.
- `object-hash` is removed as a dependency with no remaining runtime references.
- `tools.hashThisData` remains exported and behaves identically to `DataHasher.hash`.
- The full test suite passes and new behavior is locked in with unit and property tests.

### Non-goals

- Changing the hashing algorithm set, the salt-resolution policy in `generateIdHash`, or
  the encryption/storage layers.
- Supporting non-JSON-serializable input (circular references continue to throw; this is a
  documented constraint, not a feature).

## Technology stack (locked)

- Source: CommonJS (`require` / `module.exports`), Node `>=22`, tabs, double quotes.
- Hashing: Node built-in `crypto.createHash(algorithm)` (already used by `hashThisData`);
  no new runtime dependency is introduced.
- Tests: Jest (`*.jest.mjs`), `fast-check` for property tests, with the global `FC_SEED`
  hook already registered via `test/setup/fast-check-seed.mjs` in `setupFilesAfterEnv`.

## Components and Interfaces

This section summarizes the components introduced or touched by this change and their
public/internal interfaces. The detailed behavior for each follows in the "Architecture",
"The DataHasher.hash algorithm", "tools.hashThisData migration", "Cache.init() changes", and
"Cache.generateIdHash() changes" sections below.

| Component | Visibility | Interface | Responsibility |
|-----------|------------|-----------|----------------|
| `DataHasher` (`src/lib/utils/DataHasher.class.js`) | Internal (`@private`, not exported) | `static hash(algorithm, data, options = {})` → hex `string` | Owns all object-hashing logic: recursive deep hash, array-order-significant, object-key-order-insensitive, salt + iterations. |
| `tools.hashThisData` (`src/lib/tools/utils.js`) | Public (re-exported via `src/lib/tools/index.js`) | `hashThisData(algorithm, data, options = {})` → hex `string` | Thin wrapper that delegates unchanged to `DataHasher.hash`; preserves the existing public signature and export location. |
| `Cache.init()` (`src/lib/dao-cache.js`) | Public | `init(parameters)` | Touchpoint: drops the `#useToolsHash` field and the switch read; no longer consults `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH`. |
| `Cache.generateIdHash()` (`src/lib/dao-cache.js`) | Public | `generateIdHash(connection)` → hex `string` | Touchpoint: always routes through `tools.hashThisData` with salt passed as `options.salt`; no switch branch, no `object-hash`. |

`DataHasher.hash` is the single implementation; both `tools.hashThisData` and
`Cache.generateIdHash` reach it (the latter via the wrapper) so the behavior can never
diverge between entry points.

## Architecture

### New internal class: DataHasher

A new file `src/lib/utils/DataHasher.class.js` defines a single class `DataHasher` with one
public static method, `hash(algorithm, data, options = {})`. The file is CommonJS and ends
with `module.exports = DataHasher;`, mirroring `src/lib/utils/InMemoryCache.js`. The class
is internal: it is **not** added to `src/index.js` or `src/lib/tools/index.js`, and its
class-level JSDoc carries an `@private` tag with a note that it is used internally by
`tools.hashThisData` and `Cache.generateIdHash`.

`DataHasher.hash` requires `crypto` at the top of the file. It also needs `safeClone`
(currently exported from `src/lib/tools/utils.js`) for the same defensive cloning the
current implementation performs. Because `DataHasher` lives under `src/lib/utils/` and
`safeClone` lives under `src/lib/tools/utils.js`, the file will
`require("../tools/utils.js").safeClone`. This is an internal-to-internal dependency and
does not create a public coupling. (An alternative — duplicating a small deep-clone helper
into `DataHasher` — was rejected because it would fork behavior that must stay identical to
the wrapper, and `safeClone` is already the shared helper the logic was written against.)

### Test access strategy

No `TestHarness` is needed. Existing `src/lib/utils/` classes are tested by importing the
file path directly (for example `InMemoryCache-basic-tests.jest.mjs` does
`import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js'`). `DataHasher`
tests follow the same pattern:

```javascript
import DataHasher from "../../../src/lib/utils/DataHasher.class.js";
```

The TestHarness pattern is reserved for private classes co-located inside a module that
also exports a public surface (as in `dao-cache.js`); a standalone internal file does not
need it.

## Data Models

This section describes the data shapes the hasher accepts, constructs internally, and
returns. The algorithm that operates on them is specified in "The DataHasher.hash
algorithm" below; the shapes here stand on their own.

### Options object

```javascript
{ salt: string, iterations: number, skipParse?: boolean }
```

- `salt` — string, default `""`. Folded into every hashing iteration; a differing salt
  changes the result for otherwise-identical input.
- `iterations` — number, default `1`, clamped to a minimum of `1`. Each iteration folds the
  previous digest back in, so values `> 1` change the result deterministically.
- `skipParse` — boolean, internal only, default `false`. Signals that top-level
  normalization has already run so recursive calls do not re-normalize. Not documented for
  consumers.

Defaults are applied against a clone of the caller's `options` (`safeClone(options)`), so the
caller's object is never mutated.

### Accepted data types

`data` may be any of:

```text
Object | Array | BigInt | Number | String | Boolean | null
```

Object/array input must be JSON-serializable (circular references and other
non-serializable input throw during normalization). `bigint` and `undefined` are normalized
to string forms (see the Step 1 replacer); functions and symbols are dropped by
`JSON.stringify`.

### Intermediate serialized entry-string format

Each node is reduced to a deterministic string before hashing:

- **Scalar** (`string`, `number`, `boolean`, `null`):

  ```text
  -:::<dataType>:::<value>
  ```

- **Object entry** (one per key, keys taken in sorted order):

  ```text
  <sortedKey>:::object:::<childHash>
  ```

- **Array entry** (one per index, indices in ascending order):

  ```text
  <index>:::array:::<childHash>
  ```

Entries for a given object or array are joined with the `|||` separator. Object entries are
built from a sorted key list (key order insignificant); array entries are built from
ascending indices and are not re-sorted (element order significant). The `:::object:::` vs
`:::array:::` marker distinguishes the two container kinds, including the empty-object vs
empty-array case.

### Return value

A lowercase hexadecimal `string` — the digest produced by `crypto.createHash(algorithm)`
after the configured number of iterations.

## The DataHasher.hash algorithm

`DataHasher.hash` preserves the current recursive, salt-and-iteration structure of
`hashThisData` and changes exactly one thing: how arrays are serialized. The design below
states the complete algorithm so the behavior is deterministic and reproducible.

### Signature and options

```javascript
DataHasher.hash(algorithm, data, options = {})
```

- `algorithm` — string passed directly to `crypto.createHash` (e.g. `"sha256"`,
  `"RSA-SHA256"`).
- `data` — `Object | Array | BigInt | Number | String | Boolean | null`.
- `options.salt` — string, default `""`.
- `options.iterations` — number, default `1`, clamped to a minimum of `1`.
- `options.skipParse` — internal only, default `false`. Used so normalization runs once at
  the top call and not on every recursive call. It is not documented for consumers.

Option defaults are applied against a clone of `options` (`safeClone(options)`), so the
caller's object is never mutated. This matches current behavior.

### Step 1: normalize once (top-level objects/arrays)

On the first call (`skipParse === false`) where `data` is an object or array, normalize via
`JSON.stringify` with a replacer, then `JSON.parse`, then `safeClone`. The replacer matches
current `hashThisData` behavior exactly:

- `bigint` → `value.toString()`
- `undefined` → the literal string `"undefined"`
- everything else → unchanged

This is where functions and symbols are dropped (they do not survive `JSON.stringify`),
`Date` is converted through its `.toJSON()`, and circular references throw a `TypeError`
from `JSON.stringify`. After normalization, `skipParse` is set to `true` so recursive calls
do not re-normalize.

### Step 2: classify the node

Compute `dataType`:

- `"null"` when `data === null`.
- `"array"` when `Array.isArray(data)`.
- otherwise `typeof data` (`"object"`, `"string"`, `"number"`, `"boolean"`).

Then coerce the sentinels used for string construction: if `data === null`, set
`data = "null"`; if `data === undefined`, set `data = "undefined"` (post-normalization this
only occurs for a top-level `null`/`undefined` scalar input).

### Step 3: build the deterministic value string

For scalars (`string`, `number`, `boolean`, `null`):

```text
valueStr = `-:::${dataType}:::${data.toString()}`
```

For objects and arrays, recurse into each child (with `iterations` forced to `1` on the
recursive call so iteration happens only once, at the end of the top call), then combine.
The key difference from today is the per-entry marker and the final combine step:

- **Objects (key order insignificant).** Iterate keys in `Object.keys(data).sort()` order.
  For each key, compute `childHash = DataHasher.hash(algorithm, data[key], opts)` and push
  the entry string `` `${key}:::object:::${childHash}` ``. Join the entries with `"|||"`.
  Because keys are sorted before building entries, two objects differing only in key order
  produce the identical entry sequence and therefore the identical string. **Do not**
  re-sort the already key-sorted entry list (sorting by sorted-key order is equivalent, but
  the design standardizes on "sort keys, then build in that order, then join" so the object
  and array paths are symmetric and auditable).

- **Arrays (order significant — the fix).** Iterate indices `0..data.length-1` in order.
  For each index `i`, compute `childHash = DataHasher.hash(algorithm, data[i], opts)` and
  push the entry string `` `${i}:::array:::${childHash}` `` — the index `i`, not a constant
  `"$array"` marker. Join the entries with `"|||"` **without any final sort**.

The two defects in the current code that this corrects:

1. Current code tags every array element with the same literal `"$array"` marker instead of
   its index, so position information is lost before combining.
2. Current code applies `arrayOfStuff.sort()` to the combined entries, which re-orders array
   entries regardless of their original position.

By using the index as the per-entry marker *and* removing the final sort from the array
path, array element order is fully preserved: `["apple","orange"]` yields entries
`["0:::array:::H(apple)", "1:::array:::H(orange)"]` while `["orange","apple"]` yields
`["0:::array:::H(orange)", "1:::array:::H(apple)"]`, which join to different strings and
therefore different hashes. The index-as-marker and position-join combination also means
array length changes and element moves both change the hash. Because recursion applies the
same rule at every depth, nested arrays are order-significant and nested objects remain
key-order-insensitive automatically (Requirement 2.2, 3.2).

> **Determinism note**: object entries are built from a sorted key list and array entries
> from ascending indices, so for a fixed `(algorithm, data, salt, iterations)` the
> constructed string is byte-for-byte identical across calls and processes. No `Map`,
> `Set`, or insertion-order iteration influences the output.

### Step 4: hash and iterate

Identical to current behavior:

```javascript
let hashOfData = "";
for (let i = 0; i < options.iterations; i++) {
    const hash = crypto.createHash(algorithm);
    hash.update(valueStr + hashOfData + options.salt);
    hashOfData = hash.digest("hex");
}
return hashOfData;
```

Each iteration folds the previous digest back in along with the salt, so `iterations > 1`
changes the result deterministically (Requirement 4.4), and a differing `salt` changes the
result for otherwise-identical input (Requirement 4.3). The return is lowercase hex
(Requirement 1.2).

### Edge cases and base cases

- **`null` / primitive top-level input** — handled by the scalar branch; returns a stable
  hash. `null` is distinguished from the string `"null"` input only by `dataType`
  (`"null"` vs `"string"`), which is encoded in `valueStr`.
- **Empty object vs empty array** — both produce an empty entry list, but `valueStr`
  differs because the recursion marker/`dataType` differs between the object and array
  branches; the empty object yields `""` joined with object semantics and the empty array
  yields `""` joined with array semantics. They are distinguished because each element's
  entry (when present) carries `":::object:::"` vs `":::array:::"`, and the top-level call's
  scalar fallback is not taken. (This matches the current implementation's distinction and
  is covered by a unit test.)
- **`bigint`, `undefined`, functions, symbols** — handled by the Step 1 replacer exactly as
  today (Requirement 4.6).
- **Circular references / non-serializable input** — `JSON.stringify` throws; the error
  propagates to the caller unchanged. This is documented in the method JSDoc
  (Requirement 4.5, 7.x) and is not caught.

## Error Handling

### Error handling for DataHasher.hash

| Operation | Failure condition | Recoverable? | Caller receives | Logged? |
|-----------|-------------------|--------------|-----------------|---------|
| `JSON.stringify` normalization | Circular reference / BigInt edge / non-serializable | Fatal to the call | The thrown `TypeError` propagates unchanged | No (documented constraint; caller decides) |
| `crypto.createHash(algorithm)` | Unknown/unsupported algorithm name | Fatal to the call | The thrown `Error` from Node `crypto` propagates unchanged | No |

`DataHasher.hash` adds no new `try/catch`. It is a pure, synchronous function and
deliberately surfaces these two failures to the caller rather than masking them with a
fallback value, because a silent fallback would produce a cache key that cannot be
reproduced. Callers that need resilience (none do today) can wrap the call.

### Input validation for DataHasher.hash

| Input | Required | Type | Limits | On invalid |
|-------|----------|------|--------|------------|
| `algorithm` | Yes | string | Must be a valid Node `crypto` hash name | `crypto.createHash` throws; propagated |
| `data` | Yes | JSON-serializable value or scalar | Must survive `JSON.stringify` when object/array | `JSON.stringify` throws; propagated |
| `options.salt` | No | string | — | Defaulted to `""` when absent |
| `options.iterations` | No | number | `>= 1` | Clamped to `1` when absent or `< 1` |

This matches the current `hashThisData` contract; the method is intentionally permissive on
options (defaulting rather than throwing) to preserve backwards compatibility.

## tools.hashThisData migration (thin wrapper)

`src/lib/tools/utils.js` keeps the `hashThisData` export and its signature
`hashThisData(algorithm, data, options = {})`. Its body is reduced to a delegation:

```javascript
const DataHasher = require("../utils/DataHasher.class.js");

const hashThisData = function(algorithm, data, options = {}) {
    return DataHasher.hash(algorithm, data, options);
};
```

The JSDoc on `hashThisData` is updated to note the new array-order semantics and the
JSON-serializable constraint, and to indicate the implementation lives in `DataHasher`. The
`module.exports` block in `utils.js` is unchanged (still exports `hashThisData` alongside
`printMsg`, `sanitize`, `obfuscate`, `safeClone`), and `src/lib/tools/index.js` continues to
re-export `tools.hashThisData` exactly as before. This keeps the public surface identical
(Requirement 7.1, 7.2) while the behavior change flows through both the wrapper and the
direct class (Requirement 7.3).

> **Circular-require note**: `DataHasher.class.js` requires `safeClone` from
> `../tools/utils.js`, and `utils.js` requires `DataHasher.class.js`. Node resolves this
> because `safeClone` is defined in `utils.js` before the `module.exports` and is only
> *called* at hash time, not at module-load time, and `DataHasher` is only *called* from the
> `hashThisData` wrapper at call time. To remove any fragility, `DataHasher.class.js`
> performs its `require("../tools/utils.js")` at the top but reads `.safeClone` lazily
> inside `hash` (i.e. `const { safeClone } = require("../tools/utils.js")` at the top is
> acceptable only if load order is verified; the safe choice is to require at top and
> destructure inside the function). This is called out so the implementer verifies no
> load-time cycle, and the property/unit tests will catch a cycle immediately if one exists.

## Cache.init() changes

Remove the `#useToolsHash` private static field declaration from the `Cache` class, and
remove the line in `Cache.init()` that reads it:

```javascript
// REMOVED:
this.#useToolsHash = ( "useToolsHash" in parameters ) ? Cache.bool(parameters.useToolsHash) :
    ("CACHE_DATA_USE_TOOLS_HASH" in process.env ? Cache.bool(process.env.CACHE_DATA_USE_TOOLS_HASH_METHOD) : false);
```

`Cache.init()` no longer reads `parameters.useToolsHash`, `CACHE_DATA_USE_TOOLS_HASH`, or
`CACHE_DATA_USE_TOOLS_HASH_METHOD`. Passing `useToolsHash` or setting the env var is
silently ignored — `init()` does not inspect them and therefore does not throw
(Requirement 5.1, 5.2, 5.3, 5.5). No deprecation log is added (the locked decision Q4 makes
it optional, and silence keeps the change minimal). The incidental env-var name mismatch
(`...HASH` key vs `...HASH_METHOD` read) disappears with the branch.

## Cache.generateIdHash() changes

`generateIdHash()` keeps its existing pre-processing — `removeFunctions`,
`structuredClone`, deletion of `connection.options`, and the salt resolution
(`this.#sharedCacheId` when set, else `process.env.AWS_LAMBDA_FUNCTION_NAME || ""`). Three
things change:

1. Remove `const objHash = require('object-hash')` from the top of `dao-cache.js`
   (Requirement 6.1, 6.3).
2. Remove the `this.#useToolsHash` branch, the `objHashSettings` object, and the
   `clonedIdObject.THIS_IS_SALT_FOR_CK_CACHE_DATA_ID_HASH = salt` property-injection hack.
3. Always compute the hash through the built-in path, passing salt as an option:

```javascript
return tools.hashThisData(this.#idHashAlgorithm, clonedIdObject, { salt });
```

Delegating through `tools.hashThisData` (rather than importing `DataHasher` directly into
`dao-cache.js`) keeps `dao-cache.js` free of `src/lib/utils` hashing internals and routes
through the same public entry point consumers use, so the two can never diverge
(Requirement 5.4, 7.2). Salt is passed as `options.salt` — the property-injection approach
was only needed because `object-hash` had no salt concept, and it is removed.

The `generateIdHash` JSDoc block is rewritten to describe the `DataHasher`-based mechanism
(recursive deep hash, array order significant, object key order insignificant, salt applied
via options) and to drop the `object-hash` dependency snippet and language
(Requirement 8.3).

## Dependency removal

- Remove `"object-hash"` from `dependencies` in `package.json` (currently `^3.0.0`).
- Remove the `object-hash` entry (and any now-orphaned transitive-only entries it pulled in,
  verified via `npm ls` / lockfile inspection) from `package-lock.json` by running
  `npm install` after editing `package.json` so the lockfile is regenerated consistently
  rather than hand-edited.
- A repository-wide search for `object-hash` must return zero runtime `require`/`import`
  hits under `src/` and zero under `test/` after the test-oracle rewrite (Requirement 6.2,
  6.3, 6.4). Remaining mentions are allowed only in docs/CHANGELOG as historical notes.

## Documentation and type updates

### Markdown docs

- `docs/features/cache/README.md` — update the `Cache.init` options table and any example
  that lists `useToolsHash`, and the env-var example that lists `CACHE_DATA_USE_TOOLS_HASH`,
  to state the switch is removed / no longer used (Requirement 8.1).
- `docs/00-example-implementation/README.md` — same treatment for any reference to the
  switch or env var.
- `docs/00-example-implementation/example-template-lambda-function.yml` — remove or annotate
  the `CACHE_DATA_USE_TOOLS_HASH` environment entry as no longer used (Requirement 8.1).

### TypeScript definitions (design decision)

`types/lib/dao-cache.d.ts` currently declares:

```typescript
/** Whether to use the built-in tools hash method instead of object-hash */
useToolsHash?: boolean;
```

**Decision: keep the `useToolsHash?` property in the `.d.ts` but mark it `@deprecated` and
document it as ignored, rather than deleting it.** Requirement 8.2 permits either removal or
"documented as ignored", and keeping it as an optional, deprecated, no-op field avoids a
compile-time breaking change for any TypeScript consumer who currently passes
`useToolsHash` to `Cache.init(...)`. Deleting the optional property would turn their
existing, type-checking code into a compile error (`Object literal may only specify known
properties`), which is a worse upgrade experience than a deprecation hint for what is a
silently-ignored runtime no-op. The field is annotated like:

```typescript
/**
 * @deprecated Since 1.4.0. No longer used; silently ignored. Cache-key hashing
 * always uses the built-in hasher. This property will be removed in a future major version.
 */
useToolsHash?: boolean;
```

The `generateIdHash` JSDoc in the same `.d.ts` (currently "Uses object-hash to…") is
rewritten to describe the `DataHasher`-based mechanism, removing the `object-hash` reference
(Requirement 8.2).

### CHANGELOG

Add a `1.4.0` entry documenting, at minimum (Requirement 8.4):

- **Changed** — Cache-key hashing now always uses the built-in hasher; `object-hash` is no
  longer used.
- **Changed (behavior)** — Array element order is now significant in hashing
  (`['apple','orange']` differs from `['orange','apple']`); object property order remains
  insignificant.
- **Removed** — `object-hash` dependency.
- **Deprecated / removed switch** — `useToolsHash` parameter and `CACHE_DATA_USE_TOOLS_HASH`
  environment variable are no longer used and are silently ignored.
- **Upgrade note** — One-time full cache invalidation on upgrade: hash output differs from
  the previous `object-hash` output, so existing cache entries miss once and repopulate from
  origin.

## Testing strategy

### New DataHasher unit tests

New file: `test/cache/data-hasher/unit/data-hasher-unit-tests.jest.mjs` (directory mirrors
the `src/lib/utils` grouping used by `in-memory-cache` tests), importing the class directly:

```javascript
import DataHasher from "../../../../src/lib/utils/DataHasher.class.js";
```

Cases (Requirement 9.2):

- Determinism: same `(algorithm, data, options)` returns identical hashes across calls.
- Array order significance (positive): `["apple","orange"]` ≠ `["orange","apple"]`.
- Array order significance (same order): `["apple","orange"]` === `["apple","orange"]`.
- Nested array order significance: order matters inside objects and inside nested arrays.
- Object key order independence: `{headers:{a:1}, parameters:{b:2}}` ===
  `{parameters:{b:2}, headers:{a:1}}`, including nested objects.
- Salt effect: differing `salt` changes the hash.
- Iterations effect: `iterations: 2` differs from `iterations: 1`, and `< 1` clamps to `1`.
- Deep nesting: arbitrary-depth object/array mix hashes without error and deterministically.
- `null` and primitive inputs (`string`, `number`, `boolean`, `bigint`) hash to stable
  values and are distinguishable from each other (e.g. `null` vs `"null"`).
- Empty object vs empty array produce different hashes.

### New DataHasher property tests

New file: `test/cache/data-hasher/property/data-hasher-property-tests.jest.mjs`
(Requirement 9.3). These follow the repo property-test guardrails:

- **No per-call-site `seed`.** Every `fc.assert` omits the `seed` option; the global
  `FC_SEED` hook in `test/setup/fast-check-seed.mjs` supplies it.
- **Non-vacuous generators.** The order-significance property must not filter a generator by
  the predicate it asserts. Instead, construct two arrays that are permutations of each
  other with at least two distinct elements *by construction*:

```javascript
// Generate a base array of >= 2 DISTINCT elements, then a non-identity permutation.
// Distinctness is guaranteed by construction (unique tags), not by filtering on the
// asserted predicate, so the property is not vacuous.
const distinctArrayArb = fc
    .uniqueArray(fc.string(), { minLength: 2, maxLength: 8 })
    .map((items) => items.map((value, index) => `${index}:${value}`));
```

  The property then compares `hash(arr)` against `hash(permute(arr))` where `permute`
  produces a genuinely different ordering (e.g. reverse, or a fast-check `shuffledSubarray`
  /index-permutation arbitrary applied so the result differs from the input). The assertion
  is "different order ⇒ different hash", and the generator guarantees a different order
  without ever evaluating the hash to decide what to emit.

- **Object key-order independence property.** Generate an object, then build a second object
  by inserting the same key/value pairs in a shuffled key order (shuffle driven by a
  fast-check arbitrary, not `Math.random()`), and assert the two hashes are equal.
- **Determinism property.** For a generated JSON-serializable value, assert
  `hash(v) === hash(v)` and that it equals a hash computed from a structurally-cloned copy.
- **Salt sensitivity property.** For a generated value and two distinct salts (distinct by
  construction), assert the hashes differ.
- **Iterations property.** For a generated value, assert `hash(v,{iterations:1})` differs
  from `hash(v,{iterations:2})`.
- **Wrapper equivalence property.** For generated `(algorithm from a small constant set,
  value, options)`, assert `tools.hashThisData(...) === DataHasher.hash(...)`.

Generators restrict strings/keys to JSON-safe, serializable content so inputs always survive
`JSON.stringify` (this is a precondition matching the implementation's acceptance rule, not a
filter on the asserted predicate). `numRuns` uses the suite default (100) since these tests
spawn no child processes.

### Rewrite of cache-shared-id-property-tests.jest.mjs oracle

`test/cache/cache-shared-id-property-tests.jest.mjs` currently imports
`objHash from "object-hash"` and its `computeExpectedHash(connection, salt)` re-implements
the `object-hash` settings plus the `THIS_IS_SALT_FOR_CK_CACHE_DATA_ID_HASH`
property-injection. It is rewritten (Requirement 9.4, 6.4) so:

- The `import objHash from "object-hash"` line is removed.
- A `DataHasher` import is added:
  `import DataHasher from "../../src/lib/utils/DataHasher.class.js"`.
- `computeExpectedHash(connection, salt)` becomes the new oracle, matching the new
  `generateIdHash` salt-as-option behavior:

```javascript
function computeExpectedHash(connection, salt) {
    const cloned = structuredClone(connection);
    if (cloned.connection?.options) { delete cloned.connection.options; }
    return DataHasher.hash("RSA-SHA256", cloned, { salt });
}
```

  Note the removal of the salt property-injection — salt is now passed via `options.salt`,
  exactly as `generateIdHash` does. The surrounding properties (same-salt → same hash,
  different-salt → different hash, parameter-over-env priority, backwards-compat salt,
  null/undefined fall-through) are unchanged in intent; only the oracle's computation
  changes. The subprocess helpers that call `Cache.generateIdHash` are unaffected because
  `generateIdHash` now routes through `DataHasher` internally.

### Suite-wide checks

- `test/cache/force-refresh/**` and `test/types/consumer-cache.ts` call
  `Cache.generateIdHash` and must still pass against the new path (Requirement 9.5); they
  assert on internal consistency, not on specific `object-hash` output, so they are expected
  to pass unchanged and are re-run to confirm.
- Full `npm test` must pass with exit code 0 (Requirement 9.1).

## Correctness properties

| # | Property | Statement | Validates |
|---|----------|-----------|-----------|
| P1 | Array-order significance | For arrays `a`, `b` that are permutations with ≥ 2 distinct elements and different order, `hash(a) !== hash(b)`; applies at every nesting depth. | Req 2.1, 2.2, 2.4 |
| P2 | Array same-order stability | For equal-ordered arrays with equal elements, `hash(a) === hash(b)`. | Req 2.3 |
| P3 | Object key-order independence | For objects with identical keys/values in different key order, `hash(x) === hash(y)`; applies at every nesting depth. | Req 3.1, 3.2, 3.3 |
| P4 | Determinism | For fixed `(algorithm, data, options)`, repeated calls return identical hashes. | Req 4.1, 4.2 |
| P5 | Salt sensitivity | For identical input and two distinct salts, hashes differ. | Req 4.3 |
| P6 | Iterations effect | `iterations > 1` changes the hash deterministically vs `iterations = 1`. | Req 4.4 |
| P7 | Normalization consistency | `bigint`/`undefined`/functions/symbols are handled identically to the prior `hashThisData` normalization. | Req 4.6 |
| P8 | Non-serializable throws | Circular/non-serializable input throws (documented, not handled). | Req 4.5 |
| P9 | Wrapper equivalence | `tools.hashThisData(alg, data, opts) === DataHasher.hash(alg, data, opts)` for all same arguments. | Req 7.1, 7.2, 7.3 |
| P10 | Single hashing path | `Cache.generateIdHash` always routes through `DataHasher` with salt-as-option and no switch branch. | Req 5.4, 6.1 |

P1–P6 and P9 are covered by the new `DataHasher` property tests; P7, P8, and the
distinguishability edge cases by unit tests; P10 by the rewritten shared-id oracle plus the
`generateIdHash` determinism/consistency tests.

## Behavior change and backwards compatibility

- **One-time cache re-key.** Because the hash output differs from `object-hash` (and array
  order now contributes), the first run after upgrade produces new cache keys. Existing
  entries are simply not found, miss once, and repopulate from origin. No migration step is
  required; documented in the CHANGELOG `1.4.0` entry.
- **Silently-ignored switch.** `useToolsHash` (parameter) and `CACHE_DATA_USE_TOOLS_HASH`
  (env var, including the old mis-read `CACHE_DATA_USE_TOOLS_HASH_METHOD`) are no longer
  consulted. Passing them has no effect and does not throw. The TypeScript `useToolsHash?`
  option is retained as a `@deprecated` no-op to avoid a compile-time break for existing
  consumers.
- **Preserved public surface.** `tools.hashThisData` keeps its name, signature, and export
  location; only its documented array-order behavior changes.

## Requirements traceability

| Requirement | Covered by design section(s) |
|-------------|------------------------------|
| 1 — Dedicated internal DataHasher class | Architecture → New internal class; Test access strategy |
| 2 — Array order significance | The DataHasher.hash algorithm → Step 3; Correctness properties P1, P2 |
| 3 — Object property order independence | The DataHasher.hash algorithm → Step 3; Correctness properties P3 |
| 4 — Deterministic, recursive deep hashing | The DataHasher.hash algorithm → Steps 1–4, Edge cases; Properties P4–P8 |
| 5 — Remove feature switch from Cache init | Cache.init() changes; Cache.generateIdHash() changes (P10) |
| 6 — Remove object-hash dependency | Cache.generateIdHash() changes; Dependency removal (P10) |
| 7 — Preserve public tools.hashThisData export | tools.hashThisData migration; Property P9 |
| 8 — Documentation and type updates | Documentation and type updates (markdown, .d.ts decision, JSDoc, CHANGELOG) |
| 9 — Test coverage and suite health | Testing strategy (unit, property, oracle rewrite, suite-wide checks) |
