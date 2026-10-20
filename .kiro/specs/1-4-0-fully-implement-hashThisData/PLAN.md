# Fully Implement hashThisData

Fully implement a method that replaces the `object-hash` npm package.

The replacement method `hashThisData` has been available internally from the tools utils for a while now.

Cache Data currently uses 2 outside packages in a very limited capacity, it would make sense to move this functionality internally as it reduces the reliance on externally managed packages and will provide a leaner code-base since not all functionality from these packages are utilized. This would replace one of those packages `object-hash`.

Object Hashing is used to provide caches with unique keys based on the properties and values contained within an object that is passed to it.

There is currently a feature switch that is default to false, when setting Cache.init() called `useToolsHash` or the environment variable `CACHE_DATA_USE_TOOLS_HASH`. These should no longer be checked for during Cache.init and only the tools hash `hashThisData` should be used.

The `hashThisData` method should be migrated to a new class `DataHasher` with the static method `hash` and stored in src/lib/utils similar to InMemoryCache.

Documentation should be updated to include information about the environment variable `CACHE_DATA_USE_TOOLS_HASH` and Cache.init parameter `useToolsHash` are no longer used.

Tests should still pass.

It needs to be determined if the `hashThisData` method respects the order of arrays passed to it and must determine that `['apple', 'orange']` is NOT the same as `['orange', 'apple']`. Property order should be alphabetical, such that `{headers: {a: 1}, parameters: {b: 2}}` IS the same as `{parameters: {b: 2}, headers: {a: 1}}` If that is not the case then `hashThisData` needs to be updated.

Deep hashing needs to be performed using recursive methods.

`object-hash` should be removed as a dependency.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
---

# Findings & Finalization (pre-spec review)

I reviewed the current implementation before drafting requirements. Summary of what
exists today and what the plan implies, so we can lock scope. Open decisions are in
`SPEC-QUESTIONS.md`.

## Where the code lives today

- `tools.hashThisData(algorithm, data, options)` — `src/lib/tools/utils.js`.
  Recursive, object keys sorted, options are `{salt, iterations}`. Exported via
  `src/lib/tools/index.js`.
- `object-hash` — used in exactly one place: `Cache.generateIdHash()` in
  `src/lib/dao-cache.js` (`const objHash = require('object-hash')`).
- The `useToolsHash` switch — read in `Cache.init()` into `#useToolsHash`; branches the
  hashing path in `generateIdHash()`. Default is `false`, so **the default production
  path today is `object-hash`, not the tools hash.**
- Env var bug (incidental): `init()` keys off `CACHE_DATA_USE_TOOLS_HASH` but reads
  `process.env.CACHE_DATA_USE_TOOLS_HASH_METHOD`. Being removed anyway, so no separate
  fix needed.

## Verified behavior (ran the code)

| Check | Result today |
|-------|--------------|
| `['apple','orange']` vs `['orange','apple']` (tools hash) | **SAME** (order ignored) |
| nested array order (tools hash) | **SAME** (order ignored) |
| property/key order independence (tools hash) | independent (as desired) |
| `object-hash` path array order | ignored (`unorderedArrays: true`, intentional per inline comment) |

So the plan's requirement that **array order MUST matter is a behavior change**, not a
no-op refactor. Neither current path honors array order. This is the key decision in
`SPEC-QUESTIONS.md` Q1. It needs resolution before design, because the correctness
properties for the spec depend on it.

## Agreed scope (independent of Q1 answer)

1. Create `DataHasher` class in `src/lib/utils/DataHasher.class.js` with static `hash`,
   mirroring the `InMemoryCache` placement/pattern. Internal class (not in public API).
2. Move the `hashThisData` logic into `DataHasher.hash`. Keep `tools.hashThisData` as a
   thin delegating wrapper so the existing public tools export stays backwards
   compatible (pending Q5 confirmation).
3. Remove the `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH` branching from `Cache.init()`
   and `generateIdHash()`; `generateIdHash()` always uses `DataHasher`.
4. Remove `object-hash` from `package.json` dependencies and `package-lock.json`.
5. Update docs that mention the switch:
   - `docs/features/cache/README.md` (options table + example + env example)
   - `docs/00-example-implementation/README.md`
   - `docs/00-example-implementation/example-template-lambda-function.yml`
   - `types/lib/dao-cache.d.ts` (remove `useToolsHash?`, fix `generateIdHash` JSDoc that
     references object-hash)
6. Update the `generateIdHash` JSDoc block in `dao-cache.js` (currently describes
   object-hash at length).
7. Rewrite test helper `test/cache/cache-shared-id-property-tests.jest.mjs` which
   independently re-implements `object-hash` settings to verify hashes — it must verify
   against `DataHasher` output instead (pending Q6).
8. Add unit + property tests for `DataHasher` (array-order behavior per Q1, property-order
   independence, salt, iterations, deterministic/reproducible output, deep nesting).
9. CHANGELOG entry documenting: switch removal, dependency removal, and the one-time
   cache-key change (hash output differs from object-hash regardless of Q1).

## Behavior-change / compatibility notes for CHANGELOG

- Default hash output changes (object-hash → DataHasher) ⇒ one-time cache invalidation on
  upgrade even if Q1 = preserve order-insensitivity. Caches repopulate from origin.
- `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH` become no-ops (recommended: ignored, not
  throwing — see Q4).

## Test-impact inventory (files that reference the affected surface)

- `test/cache/cache-shared-id-property-tests.jest.mjs` — re-implements object-hash; must
  be rewritten.
- `test/cache/force-refresh/**` and `test/types/consumer-cache.ts` — call
  `generateIdHash`; should still pass but must be re-run to confirm.
- No existing dedicated test file for `hashThisData` was found — new coverage needed.
---

# Resolved Decisions (answers locked)

All SPEC-QUESTIONS.md answers received. Locked decisions for the spec:

- **Q1 = A** — Array order MUST be significant. `DataHasher.hash` changes so that array
  element order is preserved (do not re-sort array entries), while object keys remain
  sorted. Correctness properties:
  - `hash([a, b]) !== hash([b, a])` when `a !== b`
  - `hash({x, y}) === hash({y, x})` (object key order irrelevant)
  - nested arrays follow the same order-significant rule at every depth
  - This is a behavior change vs both current paths → CHANGELOG + one-time re-key.
- **Q2 = yes** — Object/property order independence preserved.
- **Q3 = yes** — One-time full cache invalidation on upgrade is acceptable; CHANGELOG note
  required (hash output differs from object-hash regardless of Q1).
- **Q4 = A** — `useToolsHash` param and `CACHE_DATA_USE_TOOLS_HASH` env var are silently
  ignored (no throw). Optional one-time deprecation log is acceptable but not required.
  Ships as part of `1.4.0`.
- **Q5 = yes** — `DataHasher.hash(algorithm, data, options = {})`, options `{salt, iterations}`.
  `tools.hashThisData` stays as a thin wrapper delegating to `DataHasher.hash`.
- **Q6 = yes** — Rewrite `test/cache/cache-shared-id-property-tests.jest.mjs` (and any
  other object-hash-output assertions) to verify against `DataHasher`. No test depends on
  object-hash after this.
- **Q7 = yes** — Preserve recursive deep-hash strategy. JSON-serializable input remains a
  documented constraint; circular references continue to throw (documented, not handled).

Scope is finalized. Ready to proceed to the spec workflow: requirements → design → tasks.
