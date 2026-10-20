# Spec Questions: Fully Implement hashThisData

Please answer inline under each question. I have grouped them by impact. Q1 is the
most important and blocks the design, because the answer changes cache-key behavior
for every existing consumer of this package.

---

## Q1. Array order sensitivity — CRITICAL, behavioral conflict found

The PLAN requires that array order MUST matter:
`['apple', 'orange']` is NOT the same as `['orange', 'apple']`.

I verified the current behavior of BOTH hashing paths and neither satisfies this:

- `tools.hashThisData()` (the `useToolsHash: true` path): the final step is
  `arrayOfStuff.sort().join("|||")`, and every array element is tagged with the same
  `$array` marker, so array elements are re-sorted and order is discarded.
  Confirmed by test: `hashThisData("sha256", ["apple","orange"])` ===
  `hashThisData("sha256", ["orange","apple"])`.
- `object-hash` (the current default path): `Cache.generateIdHash()` sets
  `unorderedArrays: true`, with an inline comment: "would be a problem if array
  sequence mattered, but not in this use case." So order is intentionally ignored today.

So requiring array order to matter is a **behavior change** for existing caches, not
just an internal refactor. Any object whose cache key includes an array in a different
order will now produce a different hash, which means a one-time cache miss / re-key on
deploy.

**Question:** Confirm the intent. Pick one:

- **(a)** Yes — array order MUST matter going forward. Accept that this changes cache
  keys for existing consumers (one-time cache invalidation on upgrade). This is a
  behavior change to call out in the CHANGELOG under a minor/major bump.
- **(b)** No — preserve today's behavior (array order does NOT matter). The PLAN's
  `['apple','orange'] != ['orange','apple']` line was aspirational; keep order-insensitive
  to stay drop-in compatible with existing cache keys.

> Answer: A

---

## Q2. Property order independence

The PLAN requires `{headers:{a:1}, parameters:{b:2}}` to equal
`{parameters:{b:2}, headers:{a:1}}`. I verified `hashThisData` already satisfies this
(object keys are sorted before hashing), so no change is needed here. Confirm this is
the desired behavior (object/property order does NOT matter).

> Answer: yes, this is the desired behavior

---

## Q3. Hash output compatibility with existing cached data

Separate from array order (Q1): even for identical inputs, `DataHasher.hash()` and
`object-hash` produce **different hash strings** (different serialization formats). So
removing `object-hash` and switching the default to the tools hash will re-key the
entire existing cache on the first deploy regardless of Q1, since the default today is
`object-hash` (`useToolsHash` defaults to false).

**Question:** Is a one-time full cache invalidation on upgrade acceptable? (Expected
answer: yes, caches repopulate from origin; just needs a CHANGELOG note. Confirm.)

> Answer: Yes, this is acceptable

---

## Q4. Version bump and semver classification

`package.json` is at `1.4.0`. Removing the `useToolsHash` parameter and the
`CACHE_DATA_USE_TOOLS_HASH` env var as *functional switches*, plus changing the default
hash algorithm/output, is a behavior change.

**Question:** How should these removed inputs behave if a consumer still passes them?

- **(a)** Silently ignore `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH` (no error), since
  the tools hash is now the only path. Optionally log a one-time deprecation notice.
- **(b)** Throw on `useToolsHash` to force consumers to remove it.

Per the AGENTS.md backwards-compatibility rules, (a) is strongly preferred (ignoring a
now-meaningless flag is non-breaking at the API surface). Confirm (a), and confirm this
ships as part of `1.4.0`.

> Answer: A: silently ignore

---

## Q5. New class API shape

The PLAN specifies a new class `DataHasher` with a static `hash` method in
`src/lib/utils/` (like `InMemoryCache`). The existing function signature is
`hashThisData(algorithm, data, options)` where `options = {salt, iterations}`.

**Question:** Confirm the target signature:
`DataHasher.hash(algorithm, data, options = {})` with the same `options`
(`salt`, `iterations`). And confirm `tools.hashThisData` should remain exported as a
thin wrapper that delegates to `DataHasher.hash` (keeps the existing public tools export
backwards compatible), rather than being removed.

> Answer: Yes. Both are confirmed

---

## Q6. Scope of `object-hash` removal

`object-hash` is only referenced in `src/lib/dao-cache.js` (and mirrored in one test
helper, `test/cache/cache-shared-id-property-tests.jest.mjs`, which re-implements the
`object-hash` settings to independently verify hashes). Removing the dependency means
that test helper must be rewritten to compute the expected hash via `DataHasher` instead.

**Question:** Confirm it is fine to rewrite that test helper (and any other test that
asserts specific `object-hash` output) to verify against `DataHasher` output. No test
should continue to depend on `object-hash`.

> Answer: yes, it is fine to rewrite

---

## Q7. Deep hashing / recursion

The PLAN says "Deep hashing needs to be performed using recursive methods." The current
`hashThisData` is already recursive. Confirm the requirement is simply "preserve the
existing recursive deep-hash behavior" and not a request to change the recursion
strategy (e.g., iterative rewrite, depth limits, cycle detection for circular refs).

- Note: the current implementation relies on `JSON.stringify` normalization, so circular
  references would throw. Should `DataHasher` explicitly handle or document circular-ref
  behavior, or is "JSON-serializable input only" an acceptable documented constraint
  (as the current JSDoc already states)?

> Answer: Yes, preserve current behavior for recursion
