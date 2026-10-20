# Implementation Plan: Fully Implement hashThisData

Each task is incremental, references the requirements it satisfies, and ends in a
buildable/testable state. Run `npm test` after each task that changes code. Do not break
the public API surface (`tools.hashThisData` signature and export). Target release `1.4.0`.

- [x] 1. Create the `DataHasher` internal class with the current hashing behavior
  - Create `src/lib/utils/DataHasher.class.js` as a CommonJS class with a single static
    method `hash(algorithm, data, options = {})`, ending in `module.exports = DataHasher;`,
    mirroring the structure/JSDoc style of `src/lib/utils/InMemoryCache.js`.
  - Port the existing `hashThisData` logic from `src/lib/tools/utils.js` verbatim first
    (recursive structure, `safeClone(options)`, `salt`/`iterations`/`skipParse` defaults,
    the `JSON.stringify` replacer for `bigint`→string and `undefined`→`"undefined"`, Step 4
    hash-and-iterate loop). Do NOT yet apply the array-order fix.
  - Require `crypto` at the top. Obtain `safeClone` via `require("../tools/utils.js")`.
    **Verify there is no load-time circular-require failure** between
    `DataHasher.class.js` and `tools/utils.js` (destructure `safeClone` inside `hash`, or
    require at top and read lazily); confirm `node -e "require('./src/lib/tools/utils.js')"`
    and `node -e "require('./src/lib/utils/DataHasher.class.js')"` both load cleanly.
  - Mark the class `@private` in JSDoc with a note it is used internally by
    `tools.hashThisData` and `Cache.generateIdHash`; document the JSON-serializable
    constraint (circular refs throw).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.5, 4.6_

- [x] 2. Apply the array-order-significance fix in `DataHasher.hash`
  - In the array branch of Step 3, tag each element entry with its numeric index
    (`` `${i}:::array:::${childHash}` ``) instead of the constant `"$array"` marker.
  - Build array entries in ascending index order and join with `"|||"` **without** a final
    `.sort()` on the array entry list.
  - Keep the object branch sorting keys (`Object.keys(data).sort()`) and building entries in
    that order (object key order stays insignificant).
  - Keep scalar form `-:::${dataType}:::${data.toString()}` and the object/array `dataType`
    markers so empty-object vs empty-array remain distinguishable.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2_

- [x] 3. Add `DataHasher` unit tests
  - Create `test/cache/data-hasher/unit/data-hasher-unit-tests.jest.mjs`, importing the
    class directly: `import DataHasher from "../../../../src/lib/utils/DataHasher.class.js";`
  - Cover: determinism; array order significance (different order ⇒ different hash; same
    order ⇒ same hash); nested array order significance (inside objects and nested arrays);
    object key-order independence (incl. nested); salt effect; iterations effect (2 ≠ 1, and
    `< 1` clamps to 1); deep nesting; `null`/primitive inputs distinguishable (e.g. `null`
    vs `"null"`); empty object ≠ empty array.
  - _Requirements: 9.1, 9.2, 2.x, 3.x, 4.x_

- [x] 4. Add `DataHasher` property tests (fast-check, repo guardrails)
  - Create `test/cache/data-hasher/property/data-hasher-property-tests.jest.mjs`.
  - Follow guardrails: no `seed` option at any `fc.assert` call site (rely on the global
    `FC_SEED` hook); generators must be non-vacuous — never filter a generator by the
    predicate the property asserts.
  - Implement: array-order-significance via a distinct-by-construction permutation generator
    (unique-tagged elements, then a non-identity permutation such as reverse/index-permute)
    asserting different order ⇒ different hash; object key-order independence via a
    fast-check-driven key shuffle (not `Math.random()`) asserting equal hashes; determinism;
    salt sensitivity (two distinct-by-construction salts); iterations effect; and
    wrapper-equivalence (`tools.hashThisData(...) === DataHasher.hash(...)`).
  - Restrict generated strings/keys to JSON-serializable content (precondition, not a filter
    on the asserted predicate). Use default `numRuns` (100); no child processes.
  - _Requirements: 9.1, 9.3, 2.x, 3.x, 4.x, 7.3_

- [x] 5. Reduce `tools.hashThisData` to a thin wrapper over `DataHasher.hash`
  - In `src/lib/tools/utils.js`, replace the `hashThisData` body with a delegation to
    `DataHasher.hash(algorithm, data, options)` (require `../utils/DataHasher.class.js`).
    Keep the signature `hashThisData(algorithm, data, options = {})` and the `module.exports`
    block unchanged (still exports `hashThisData` alongside `printMsg`, `sanitize`,
    `obfuscate`, `safeClone`).
  - Confirm `src/lib/tools/index.js` still re-exports `tools.hashThisData` unchanged.
  - Update the `hashThisData` JSDoc to note array-order semantics, the JSON-serializable
    constraint, and that the implementation lives in `DataHasher`.
  - Re-verify no circular-require breakage at load time (both modules require cleanly).
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Remove the feature switch from `Cache.init()`
  - In `src/lib/dao-cache.js`, delete the `static #useToolsHash` field declaration and the
    `this.#useToolsHash = (...)` assignment line in `init()`.
  - Ensure `init()` no longer reads `parameters.useToolsHash`, `CACHE_DATA_USE_TOOLS_HASH`,
    or `CACHE_DATA_USE_TOOLS_HASH_METHOD`; passing them must be silently ignored (no throw).
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 7. Route `Cache.generateIdHash()` through `DataHasher` and remove object-hash usage
  - Remove `const objHash = require('object-hash')` from the top of `dao-cache.js`.
  - Remove the `#useToolsHash` branch, the `objHashSettings` object, and the
    `clonedIdObject.THIS_IS_SALT_FOR_CK_CACHE_DATA_ID_HASH = salt` property-injection.
  - Keep `removeFunctions`, `structuredClone`, `connection.options` deletion, and salt
    resolution (`#sharedCacheId` else `AWS_LAMBDA_FUNCTION_NAME || ""`). Return
    `tools.hashThisData(this.#idHashAlgorithm, clonedIdObject, { salt });`.
  - Rewrite the `generateIdHash` JSDoc to describe the `DataHasher` mechanism (recursive
    deep hash, array order significant, object key order insignificant, salt via options);
    drop all object-hash language/snippets.
  - _Requirements: 5.4, 6.1, 6.3, 8.3_

- [x] 8. Rewrite the shared-id test oracle to use `DataHasher` (drop object-hash)
  - In `test/cache/cache-shared-id-property-tests.jest.mjs`, remove
    `import objHash from "object-hash"` and add
    `import DataHasher from "../../src/lib/utils/DataHasher.class.js"`.
  - Rewrite `computeExpectedHash(connection, salt)` to: `structuredClone`, delete
    `connection.options` if present, then
    `return DataHasher.hash("RSA-SHA256", cloned, { salt });` (salt via options, no
    property-injection). Leave the surrounding properties' intent unchanged.
  - _Requirements: 6.4, 9.4_

- [x] 9. Remove the `object-hash` dependency
  - Remove `"object-hash"` from `dependencies` in `package.json`.
  - Regenerate `package-lock.json` by running `npm install` (do not hand-edit the lockfile).
  - Grep the repo to confirm zero runtime `require`/`import` of `object-hash` under `src/`
    and `test/` (doc/CHANGELOG historical mentions are allowed).
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Update TypeScript definitions
  - In `types/lib/dao-cache.d.ts`, keep `useToolsHash?: boolean` but annotate it
    `@deprecated` (since 1.4.0, no longer used / silently ignored, slated for removal in a
    future major). Do not delete the property.
  - Rewrite the `generateIdHash` JSDoc in the `.d.ts` to describe the `DataHasher` mechanism
    and remove the `object-hash` reference.
  - Verify `npm run test:types` passes.
  - _Requirements: 8.2_

- [x] 11. Update markdown documentation
  - `docs/features/cache/README.md`: update the `Cache.init` options table + any example
    listing `useToolsHash`, and the env example listing `CACHE_DATA_USE_TOOLS_HASH`, to
    state the switch is no longer used.
  - `docs/00-example-implementation/README.md`: same treatment for switch/env references
    (including `CACHE_DATA_USE_TOOLS_HASH_METHOD`).
  - `docs/00-example-implementation/example-template-lambda-function.yml`: remove or
    annotate the `CACHE_DATA_USE_TOOLS_HASH` env entry as no longer used.
  - _Requirements: 8.1_

- [x] 12. Add the CHANGELOG 1.4.0 entry
  - Add a `1.4.0` section to `CHANGELOG.md` documenting: hashing now always uses the
    built-in hasher; `object-hash` dependency removed; array element order is now
    significant (object property order remains insignificant); `useToolsHash` /
    `CACHE_DATA_USE_TOOLS_HASH` silently ignored; and the one-time cache invalidation on
    upgrade (entries miss once and repopulate from origin).
  - _Requirements: 8.4, 3.x (behavior change note)_

- [x] 13. Full verification pass
  - Run `npm test` and confirm the whole suite passes (exit code 0), including
    `test/cache/force-refresh/**` and the rewritten shared-id property tests.
  - Run `npm run test:types` and `npm run lint` (or `lint:ci`) and resolve any issues.
  - Grep for any remaining `object-hash` / `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH`
    references that should have been removed or annotated.
  - _Requirements: 9.1, 9.5, 6.3_
