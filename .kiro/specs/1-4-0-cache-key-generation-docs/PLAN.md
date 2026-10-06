# Plan: Cache Key Generation Documentation Correction

- **Spec**: `1-4-0-cache-key-generation-docs`
- **Source issue**: [#235](https://github.com/63Klabs/cache-data/issues/235) (`issue.md`)
- **Package version**: `1.4.0` (from `package.json`)
- **Status**: Plan — awaiting answers to [Clarifying Questions](#clarifying-questions) before `requirements.md`

---

## 1. Verification Summary

The issue was reviewed against the v1.4.0 source rather than taken at face value. Every factual
claim in the report was reproduced empirically with throwaway scripts against
`src/lib/dao-cache.js` (scripts were deleted after use).

### 1.1 Claims confirmed

| # | Claim | Verified | Evidence |
|---|-------|:--------:|----------|
| C1 | README "Cache Key Generation" understates hash inputs | ✅ | `docs/features/cache/README.md` L578 lists only `host`, `path`, `parameters`, `headers` |
| C2 | `getData` hashes `{ data, connection, cachePolicy }` | ✅ | `src/lib/dao-cache.js` L3284-3286 |
| C3 | Only `connection.options` is stripped | ✅ | L2014; `options: {timeout, forceRefresh}` produced an identical hash |
| C4 | The entire `cachePolicy` flows into the hash | ✅ | Adding `defaultExpirationExtensionOnErrorInSeconds: 30` changed the hash |
| C5 | Salt order is `sharedCacheId` → `CACHE_SHARED_ID` → `AWS_LAMBDA_FUNCTION_NAME` → `""` | ✅ | L1670-1679 (resolution), L2011 (application) |
| C6 | `Cache.init` gates `useToolsHash` on the wrong env var | ✅ (worse than reported) | See §1.3 |

### 1.2 Additional drift sources found (not in the issue)

These share the issue's root cause — inputs that look inert but are load-bearing for the hash —
and are each more reachable than the reported one. All were reproduced.

**F1 — `getData` mutates the caller's `connection`, so a reused object reference drifts.**
This is the most consequential finding. Inside the refresh branch (L3300-3325) `getData` does:

```js
if ( !("headers" in connection)) { connection.headers = {}; }   // runs on every refresh
// ... then conditionally:
connection.headers['if-none-match'] = etag;
connection.headers['if-modified-since'] = lastModified;
```

The hash is computed *before* this mutation. Measured:

- `{host, path}` vs `{host, path, headers: {}}` → **different hashes**
- `headers: {}` vs `headers: {'if-none-match': '"x"'}` → **different hashes**

A connection object held at module scope — the exact shape the README's own shared-cache example
uses (`const conn = { uri: "..." }`, L389 and L407) — is reused across invocations in a warm
container. Invocation 1 writes under hash `H1` and leaves `headers: {}` on the object; invocation 2
computes `H2 ≠ H1`. The entry written under `H1` is then unreachable. This reproduces the issue's
symptom (a cache that reads as permanently empty) without any cross-Lambda profile drift at all.

Needs confirmation of real-world reach before sizing the fix: callers who build the connection
fresh per request, or who pass `conn.toObject()`, get a new object each time and are unaffected.
Only callers holding a long-lived reference are exposed.

**F2 — A key present with value `undefined` hashes differently from an absent key.**
`{...profile, defaultExpirationExtensionOnErrorInSeconds: undefined}` ≠ `{...profile}`.
`structuredClone` preserves `undefined`-valued keys and `object-hash` distinguishes them. Two
profiles that are deep-equal by any normal reading can therefore produce different hashes. This
makes the issue's "byte-identical objects" requirement stricter than most readers would assume.

**F3 — The hash is type-sensitive.**
`defaultExpirationInSeconds: "300"` ≠ `defaultExpirationInSeconds: 300`. A profile sourced from
SSM, JSON, or a CloudFormation parameter where a number arrives as a string will not match a
hard-coded sibling, even though the `Cache` constructor `parseInt`s both to the same behavior.

**F4 — `Cache.info()` does not report `useToolsHash` or the resolved `idHashAlgorithm` provenance.**
`info()` returns `sharedCacheId` and `idHashAlgorithm` but omits `useToolsHash`, so the single
setting that switches hashing backends — and therefore changes every hash — is not
introspectable. This blocks the cheapest possible shared-cache diagnostic.

### 1.3 `useToolsHash` env var defect — confirmed and larger than reported

`src/lib/dao-cache.js` L1633:

```js
this.#useToolsHash = ( "useToolsHash" in parameters ) ? Cache.bool(parameters.useToolsHash) :
    ("CACHE_DATA_USE_TOOLS_HASH" in process.env ? Cache.bool(process.env.CACHE_DATA_USE_TOOLS_HASH_METHOD) : false);
```

The gate reads `CACHE_DATA_USE_TOOLS_HASH`; the value reads `CACHE_DATA_USE_TOOLS_HASH_METHOD`.
Measured hash output across four configurations:

| Configuration | `useToolsHash` effective |
|---|:--:|
| `useToolsHash: true` parameter | enabled |
| `CACHE_DATA_USE_TOOLS_HASH=true` only | **disabled** |
| `CACHE_DATA_USE_TOOLS_HASH_METHOD=true` only | **disabled** |
| both env vars `=true` | enabled |

Neither env var works alone. Both must be set. The issue described this as "setting
`CACHE_DATA_USE_TOOLS_HASH_METHOD` alone doesn't work"; in fact *neither* name alone works, so the
feature is effectively unreachable via environment variables.

The docs disagree with each other and with the code on the name:

| Location | Name documented |
|---|---|
| `docs/features/cache/README.md` L255 (options table) | `CACHE_DATA_USE_TOOLS_HASH` |
| `docs/features/cache/README.md` L338 (env var block) | `CACHE_DATA_USE_TOOLS_HASH` |
| `docs/features/cache/README.md` L307 (code comment) | `CACHE_DATA_USE_TOOLS_HASH_METHOD` |
| `docs/00-example-implementation/README.md` L227 | `CACHE_DATA_USE_TOOLS_HASH_METHOD` |
| `docs/00-example-implementation/example-template-lambda-function.yml` L54 | `CACHE_DATA_USE_TOOLS_HASH_METHOD` |

Because switching backends changes every hash, documenting the wrong name here carries the same
class of risk as the original issue.

### 1.4 Claim narrowed

The issue's optional follow-up #2 asks for the computed `id_hash` to be logged. **It already is**,
at normal log level, on every `getData` completion (L~3450):

```js
tools.DebugAndLog.log(`${idHash} | ${tags.path} | ${cache.getStatus()} | ${timer.elapsed()}`, "CACHE");
```

So that recommendation should not be implemented as written. The actual gap is that nothing reveals
*what produced* the hash, which is what makes drift undiagnosable. Recommendation reframed in §3.

Exact line: `src/lib/dao-cache.js` L3351.

### 1.5 Unrelated defect noticed

`docs/features/cache/README.md` has a duplicate `idHashAlgorithm` row in the `Cache.init()` options
table (L247 and L256) with differing descriptions. Trivial, in the file being edited, worth folding
into this spec.

---

## 2. Assessment of the Issue's Optional Follow-Up #1

The issue asks whether behavioral cache-profile fields should be part of a cache entry's
*identity*. Recommendation: **document the current behavior now; do not change the hash in 1.4.0.**

Reasoning:

- Narrowing hash inputs to `hostId`/`pathId`/`encrypt`/`profile` invalidates every existing cache
  entry in every deployment on upgrade. That is a major-version change at minimum, and it is a
  silent one — the symptom is a cold cache, not an error.
- `encrypt` genuinely belongs in identity: an entry's bytes are either encrypted or not, and a
  reader with the wrong expectation cannot decode it. Fields like
  `defaultExpirationExtensionOnErrorInSeconds` arguably do not.
- But a cheaper remedy exists for the stated pain. The reported scenario needed per-consumer
  error-TTL tuning *without* splitting the cache. If the hash inputs were made explicit and
  opt-in — say, a documented way to supply the identity object — consumers could converge on a
  shared identity while keeping divergent behavior, with no change to the default hash.

Proposal: keep #1 out of 1.4.0, capture the analysis in this spec as a recorded decision, and open
a separate spec for a 2.0.0 identity change if the project wants to pursue it. Flagged as
[Q4](#clarifying-questions).

---

## 3. Proposed Scope

The issue is filed as documentation. Findings F1 and §1.3 are code defects uncovered while
verifying it. Splitting them out is proposed below so the docs fix is not held up.

### Phase 1 — Documentation (this spec, no behavior change)

| ID | Change | File |
|----|--------|------|
| D1 | Rewrite "Cache Key Generation" to state all three hash inputs plus the salt, and the `connection.options` exclusion with its rationale | `docs/features/cache/README.md` §Cache Key Generation |
| D2 | Document the drift sources: full `cachePolicy` participation (C4), `undefined`-vs-absent (F2), type sensitivity (F3), and reused-connection mutation (F1) | same |
| D3 | Add a "Shared cache pitfalls" callout to §Shared Cache, and make the two-Lambda example show the realistic per-function `connections.js` shape rather than one shared inline profile | same, §Shared Cache |
| D4 | Add a shared-cache drift troubleshooting entry: symptom (reader sees a permanently empty cache), how to confirm (compare the `CACHE`-tagged `id_hash` across both functions' logs), and the checklist of inputs to diff | same |
| D5 | Reconcile the `useToolsHash` env var name across all five doc locations to whatever the code ends up accepting, and state the both-vars-required constraint if C1 is not fixed in this spec | README, `00-example-implementation/README.md`, `example-template-lambda-function.yml` |
| D6 | Remove the duplicate `idHashAlgorithm` table row | `docs/features/cache/README.md` |
| D7 | Align the `Cache.getIdHash` and `Cache.generateIdHash` JSDoc with D1. `generateIdHash`'s JSDoc currently describes a `{query, connection, cachePolicy}` wrapper, but `getData` passes `{data, connection, cachePolicy}` — `query` is stale | `src/lib/dao-cache.js` |

### Phase 2 — Code defects (scope decision needed, see [Q1](#clarifying-questions)/[Q2](#clarifying-questions))

| ID | Change | Risk |
|----|--------|------|
| X1 | Fix the `useToolsHash` env var gate to read one consistent name, accepting the legacy name as an alias | Enables a previously dead code path. Anyone who set *both* env vars already gets `useToolsHash`, so no hash changes for them. Anyone who set only one would see every hash change on upgrade — needs a decision, not a silent fix |
| X2 | Stop `getData` from mutating the caller's `connection`; derive conditional request headers on an internal copy | Fixes F1. Hashes are unchanged for fresh-per-call connections. For reused connections the hash stops drifting, which is the correct direction but is a behavior change. Also removes an undocumented side effect some callers may read back |
| X3 | Expose `useToolsHash` in `Cache.info()` | Additive, low risk. Closes F4 |
| X4 | Add a debug-level dump of the hash *input* object (redacted) so drift is diagnosable | Additive, debug-only. Must not log `data`, headers, or anything secret-bearing — needs a redaction design |

### Out of scope for 1.4.0

- Narrowing hash inputs (issue follow-up #1) — see §2.
- Logging the computed `id_hash` (issue follow-up #2) — already implemented, see §1.4.

---

## 4. Implementation Approach

1. Write `requirements.md` covering Phase 1, with the Phase 2 split resolved per the answers below.
2. Write `design.md` with the exact replacement prose for D1-D4 and correctness properties for any
   Phase 2 item that is accepted.
3. Documentation validation tests already exist under `test/documentation/`. Extend them so the
   README's stated hash inputs are checked against the implementation rather than asserted in prose
   — a test that computes two hashes differing only in one `cachePolicy` field and asserts they
   differ keeps D1 honest as the code evolves.
4. Any Phase 2 change needs unit tests plus a property test asserting hash stability for inputs the
   change is not meant to affect, so the blast radius is measured rather than assumed.
5. `CHANGELOG.md` entry under 1.4.0.

### Risk notes

- No Phase 1 change alters a hash. That is the property to preserve; a regression here silently
  invalidates production caches.
- X1 and X2 can change hashes for some consumers. Both need an explicit decision and a release-note
  callout, not a quiet patch.
- `test/cache/cache-shared-id-property-tests.jest.mjs` and `cache-shared-id-validation-tests.jest.mjs`
  already cover salt resolution; they should be read before adding tests to avoid duplication.

---

## Clarifying Questions

**Q1. Should the `useToolsHash` env var defect (§1.3) be fixed in this spec, or split out?**
It is a one-line code fix in a docs spec. Fixing it means deciding which name is canonical and what
happens to someone who set only one env var and will see every hash change on upgrade. Three
options: (a) fix the gate and accept both names as aliases, documenting the hash change in the
release notes; (b) document the both-vars-required behavior as-is and defer the fix; (c) split into
its own spec. Preference?

**Q2. How should F1 (the reused-connection mutation) be handled?**
This is the highest-impact finding and arguably a latent production bug, not a docs problem. Is it
in scope here as X2, or should it become its own spec? If it is split out, Phase 1 should still warn
about it in the docs — confirm that is acceptable as an interim measure.

**Q3. Is the module-scope `const conn` pattern in the README's shared-cache examples representative
of how consumers actually write this?**
The answer determines whether F1 is a widespread latent bug or an edge case, and therefore how
urgent X2 is. The docs currently teach the risky shape, so at minimum the examples should change.

**Q4. Confirm that narrowing hash inputs (issue follow-up #1) is deferred to a future major
version.** §2 recommends deferring and recording the analysis. If you would rather pursue the
"explicit opt-in identity object" alternative sketched there, that is a feature spec, not this one.

**Q5. How much detail belongs in the user-facing README versus `docs/technical/`?**
F2 (`undefined` vs absent) and F3 (type sensitivity) are implementation consequences of
`object-hash` + `structuredClone`. They have real user impact, but the project's documentation
standards separate user docs from technical docs. Proposal: a short "exact-match required, including
value types and explicitly-`undefined` keys" warning in the README, with the mechanism explained in
a technical doc. Confirm, or state a preference.

**Q6. Should the Phase 1 scope include a worked diagnostic walkthrough (D4)?**
A troubleshooting section that walks through comparing `id_hash` values across two functions' logs
is the thing that would have caught the reported outage. It makes the README longer. Worth it?

**Q7. For X4, what is acceptable to log?**
If a redacted hash-input dump is wanted, the safe set appears to be the `cachePolicy` key names and
values plus `connection` keys — excluding `data`, header values, and `parameters` values, any of
which can carry tokens or PII. Confirm that boundary, or confirm X4 should be dropped.
