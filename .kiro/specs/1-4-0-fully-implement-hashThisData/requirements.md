# Requirements: Fully Implement hashThisData

## Introduction

`@63klabs/cache-data` currently generates cache-key identifiers with the external
`object-hash` package (default path) and offers an experimental built-in alternative,
`tools.hashThisData()`, behind the `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH` feature
switch (default off). This feature promotes the built-in hasher to be the only hashing
path, moves its logic into a dedicated internal `DataHasher` class, and removes the
`object-hash` dependency entirely.

The change also corrects hashing semantics: array element order becomes significant
(`['apple','orange']` must not equal `['orange','apple']`), while object property order
remains insignificant (`{a,b}` equals `{b,a}`). Neither current path honors array order
today, so this is a deliberate, documented behavior change that re-keys existing caches
once on upgrade.

Target release: `1.4.0`.

### Locked decisions (from SPEC-QUESTIONS.md)

- Q1: Array order **is** significant going forward.
- Q2: Object/property order remains insignificant (keys sorted before hashing).
- Q3: One-time full cache invalidation on upgrade is acceptable; document in CHANGELOG.
- Q4: `useToolsHash` and `CACHE_DATA_USE_TOOLS_HASH` are silently ignored (no throw).
- Q5: `DataHasher.hash(algorithm, data, options = {})`, options `{salt, iterations}`;
  `tools.hashThisData` remains as a delegating wrapper.
- Q6: Rewrite object-hash-dependent tests to verify against `DataHasher`.
- Q7: Preserve recursive deep-hash strategy; JSON-serializable input is a documented
  constraint (circular references throw).

---

## Requirement 1: Dedicated internal DataHasher class

**User Story:** As a maintainer, I want the object-hashing logic in a dedicated internal
class under `src/lib/utils/`, so that it follows the same organization as `InMemoryCache`
and is testable without being exposed in the public API.

### Acceptance Criteria

1. WHEN the package is built THEN a class `DataHasher` SHALL exist at
   `src/lib/utils/DataHasher.class.js`.
2. The `DataHasher` class SHALL expose a static method
   `hash(algorithm, data, options = {})` that returns a reproducible hex-encoded hash
   string.
3. The `options` parameter SHALL accept `salt` (string, default `""`) and `iterations`
   (number, default `1`, minimum `1`), matching the current `hashThisData` options.
4. `DataHasher` SHALL NOT be exported from the public API (`src/index.js` or
   `src/lib/tools/index.js`) and SHALL be marked `@private` in its JSDoc.
5. WHERE internal classes are documented, `DataHasher` SHALL follow the same pattern used
   for other `src/lib/utils/` classes (e.g. `InMemoryCache`).

---

## Requirement 2: Array order significance

**User Story:** As a consumer, I want arrays hashed in an order-significant way, so that
two cache inputs that differ only in array element order are treated as distinct cache
entries.

### Acceptance Criteria

1. WHEN `DataHasher.hash` is given two arrays with identical elements in a different order
   (e.g. `['apple','orange']` vs `['orange','apple']`) THEN it SHALL produce different
   hashes.
2. WHEN array elements are nested inside objects or other arrays THEN order significance
   SHALL apply at every nesting depth.
3. WHEN `DataHasher.hash` is given two arrays with identical elements in the same order
   THEN it SHALL produce identical hashes.
4. The implementation SHALL NOT re-sort array elements prior to hashing (array index
   position SHALL contribute to the hash).

---

## Requirement 3: Object property order independence

**User Story:** As a consumer, I want object property order to be irrelevant to the hash,
so that semantically identical objects produce the same cache key regardless of key
insertion order.

### Acceptance Criteria

1. WHEN `DataHasher.hash` is given two objects with identical keys and values in a
   different key order (e.g. `{headers:{a:1}, parameters:{b:2}}` vs
   `{parameters:{b:2}, headers:{a:1}}`) THEN it SHALL produce identical hashes.
2. WHEN objects are nested THEN key-order independence SHALL apply at every nesting depth.
3. The implementation SHALL sort object keys deterministically before hashing.

---

## Requirement 4: Deterministic, recursive deep hashing

**User Story:** As a consumer, I want deep/nested structures hashed deterministically via
recursion, so that the same input always yields the same cache key within a given
algorithm and salt.

### Acceptance Criteria

1. WHEN `DataHasher.hash` is called multiple times with the same algorithm, data, and
   options THEN it SHALL return identical hashes.
2. WHEN the input is a nested object/array structure THEN `DataHasher.hash` SHALL process
   it recursively to arbitrary depth (preserving the current recursive strategy).
3. WHEN `salt` differs THEN hashes for otherwise-identical input SHALL differ.
4. WHEN `iterations` is greater than 1 THEN the hash SHALL be iterated that many times,
   matching the current behavior.
5. WHEN the input is not JSON-serializable (e.g. contains circular references) THEN the
   behavior SHALL match the current implementation (an error is thrown), and this
   constraint SHALL be documented in the method's JSDoc.
6. WHEN data contains values that do not survive `JSON.stringify` (functions, symbols,
   `undefined`, `bigint`) THEN `DataHasher.hash` SHALL handle them consistently with the
   current `hashThisData` normalization behavior.

---

## Requirement 5: Remove the feature switch from Cache initialization

**User Story:** As a consumer, I want cache-key generation to always use the built-in
hasher, so that there is a single, predictable hashing path with no experimental switch.

### Acceptance Criteria

1. WHEN `Cache.init()` is called THEN it SHALL NOT read or act on a `useToolsHash`
   parameter or the `CACHE_DATA_USE_TOOLS_HASH` (or `CACHE_DATA_USE_TOOLS_HASH_METHOD`)
   environment variable.
2. WHEN a consumer passes `useToolsHash` to `Cache.init()` THEN it SHALL be silently
   ignored and SHALL NOT throw.
3. WHEN `CACHE_DATA_USE_TOOLS_HASH` is set in the environment THEN it SHALL have no effect
   and SHALL NOT throw.
4. WHEN `Cache.generateIdHash()` is called THEN it SHALL always compute the hash via
   `DataHasher` (directly or via `tools.hashThisData`), with no branching on the removed
   switch.
5. The `#useToolsHash` private static field SHALL be removed from the `Cache` class.

---

## Requirement 6: Remove the object-hash dependency

**User Story:** As a maintainer, I want `object-hash` removed from the package, so that
the codebase relies on fewer externally managed dependencies.

### Acceptance Criteria

1. WHEN the package is built THEN `src/lib/dao-cache.js` SHALL NOT require or reference
   `object-hash`.
2. `object-hash` SHALL be removed from `dependencies` in `package.json` and from
   `package-lock.json`.
3. WHEN the source tree is searched THEN there SHALL be no remaining runtime `require` or
   `import` of `object-hash` in `src/`.
4. WHEN the test suite is searched THEN no test SHALL depend on `object-hash` output;
   tests that previously did SHALL verify against `DataHasher` output instead.

---

## Requirement 7: Preserve the public tools.hashThisData export

**User Story:** As an existing consumer using `tools.hashThisData()`, I want that export
to keep working, so that upgrading does not break my code.

### Acceptance Criteria

1. WHEN a consumer calls `tools.hashThisData(algorithm, data, options)` THEN it SHALL
   remain exported from `src/lib/tools/index.js` with the same signature.
2. `tools.hashThisData` SHALL delegate to `DataHasher.hash` (thin wrapper) and return the
   same result `DataHasher.hash` would return for the same arguments.
3. WHEN existing behavior changes (array order now significant) THEN `tools.hashThisData`
   SHALL reflect the new behavior, consistent with `DataHasher.hash`.

---

## Requirement 8: Documentation and type updates

**User Story:** As a consumer reading the docs, I want accurate documentation that the
`useToolsHash` parameter and `CACHE_DATA_USE_TOOLS_HASH` env var are no longer used, so
that I am not misled into configuring a no-op.

### Acceptance Criteria

1. WHEN documentation references `useToolsHash` or `CACHE_DATA_USE_TOOLS_HASH` /
   `CACHE_DATA_USE_TOOLS_HASH_METHOD` THEN it SHALL be updated to state the switch is no
   longer used (removed/no-op). This includes at minimum:
   - `docs/features/cache/README.md`
   - `docs/00-example-implementation/README.md`
   - `docs/00-example-implementation/example-template-lambda-function.yml`
2. WHEN the TypeScript definitions are inspected THEN `types/lib/dao-cache.d.ts` SHALL NOT
   declare a functional `useToolsHash?` option (removed or documented as ignored), and the
   `generateIdHash` JSDoc SHALL NOT describe object-hash as the mechanism.
3. WHEN the `generateIdHash` JSDoc in `src/lib/dao-cache.js` is read THEN it SHALL describe
   the `DataHasher`-based mechanism rather than object-hash.
4. WHEN `CHANGELOG.md` is read THEN it SHALL contain a `1.4.0` entry documenting:
   the switch removal, the `object-hash` dependency removal, the array-order behavior
   change, and the one-time cache invalidation on upgrade.

---

## Requirement 9: Test coverage and suite health

**User Story:** As a maintainer, I want full test coverage for the new hashing behavior
and a passing suite, so that CI/CD is not blocked and the behavior is locked in.

### Acceptance Criteria

1. WHEN the full test suite runs (`npm test`) THEN all tests SHALL pass.
2. WHEN `DataHasher` is tested THEN there SHALL be unit tests covering: determinism,
   array-order significance (positive and negative cases), object-key-order independence,
   `salt` effect, `iterations` effect, deep nesting, and `null`/primitive inputs.
3. WHEN `DataHasher` is tested THEN there SHALL be property-based tests (fast-check)
   validating the order-significance and order-independence invariants across generated
   inputs, following the repository's property-test guardrails (global `FC_SEED` hook, no
   per-call-site `seed`, non-vacuous generators).
4. WHEN `test/cache/cache-shared-id-property-tests.jest.mjs` runs THEN its expected-hash
   computation SHALL be derived from `DataHasher` (not a re-implementation of object-hash
   settings).
5. WHEN tests that call `Cache.generateIdHash()` run (e.g. `test/cache/force-refresh/**`,
   `test/types/consumer-cache.ts`) THEN they SHALL still pass against the new hashing path.
