# Plan: Cache Key Generation Documentation Correction

- **Spec**: `1-4-0-cache-key-generation-docs`
- **Source issue**: [#235](https://github.com/63Klabs/cache-data/issues/235) (`issue.md`)
- **Package version**: `1.4.0` (from `package.json`)
- **Status**: Plan — **all clarifying questions (Q1-Q7) resolved.** Ready to draft `requirements.md`. X2 is in scope as a priority item (Q3). Two design-phase verifications carry forward: re-measure F2/F3 against the current hasher (§4 step 2), and confirm whether the `Connection`/`Config.init` path reuses an instance or yields a fresh object (Q3) — both answerable by reading this repo's code.

> **Revision note (post-review against current v1.4.0 source).** This plan was
> originally drafted against an earlier source tree where the `useToolsHash` /
> `CACHE_DATA_USE_TOOLS_HASH` switch still existed. In the current v1.4.0 source
> that switch is **already removed and already documented as removed**. Several
> items below (§1.3, C5, C6, X1, the `useToolsHash` half of F4, and the original
> framing of D5) are therefore moot or restated. Struck items are kept for
> traceability rather than deleted. Every claim retained below was re-verified
> against the current `src/lib/dao-cache.js` and `docs/features/cache/README.md`.

---

## 1. Verification Summary

The issue was reviewed against the v1.4.0 source rather than taken at face value. Factual
claims were reproduced empirically against `src/lib/dao-cache.js` (throwaway scripts deleted after
use), then re-confirmed against the current source during the plan review.

### 1.1 Claims confirmed

| # | Claim | Status | Evidence (current source) |
|---|-------|:------:|----------|
| C1 | README "Cache Key Generation" understates hash inputs | ✅ still true | `docs/features/cache/README.md` L578 lists only `host`, `path`, `parameters`, `headers` |
| C2 | `getData` hashes `{ data, connection, cachePolicy }` | ✅ still true | `src/lib/dao-cache.js` L3266-3268 (`idToHash = { data, connection, cachePolicy }`) |
| C3 | Only `connection.options` is stripped | ✅ still true | L2011 (`delete clonedIdObject.connection.options`) |
| C4 | The entire `cachePolicy` flows into the hash | ✅ still true | Adding `defaultExpirationExtensionOnErrorInSeconds: 30` changed the hash |
| ~~C5~~ | ~~Salt order is `sharedCacheId` → `CACHE_SHARED_ID` → `AWS_LAMBDA_FUNCTION_NAME` → `""`~~ | ⚠️ **restated** — see 1.3a | Salt is now a **two-tier** resolve inside `generateIdHash`; see below |
| ~~C6~~ | ~~`Cache.init` gates `useToolsHash` on the wrong env var~~ | ❌ **moot** — switch removed | See 1.3 |

### 1.2 Additional drift sources found (not in the issue)

These share the issue's root cause — inputs that look inert but are load-bearing for the hash —
and are each more reachable than the reported one.

**F1 — `getData` mutates the caller's `connection`, so a reused object reference drifts.**
**Still live in current source and the most consequential finding.** The hash is computed at
L3266-3268, *before* the refresh branch mutates the same object at L3280-3299:

```js
// L3266-3268: hash computed from connection as it is now
const idToHash = { data, connection, cachePolicy };
const cache = new Cache(idToHash, cachePolicy);
const idHash = cache.getIdHash();
// ...
// L3280-3299: the SAME connection object is then mutated
if ( !("headers" in connection)) { connection.headers = {}; }   // runs on every refresh
// ... then conditionally:
connection.headers['if-none-match'] = etag;
connection.headers['if-modified-since'] = lastModified;
```

Measured:

- `{host, path}` vs `{host, path, headers: {}}` → **different hashes**
- `headers: {}` vs `headers: {'if-none-match': '"x"'}` → **different hashes**

A connection object held at module scope — the exact shape the README's own shared-cache example
uses — is reused across invocations in a warm container. Invocation 1 writes under hash `H1` and
leaves `headers: {}` on the object; invocation 2 computes `H2 ≠ H1`. The entry written under `H1`
is then unreachable. This reproduces the issue's symptom (a cache that reads as permanently empty)
with no cross-Lambda profile drift at all.

> **The exclusion is intentional; the mutation is the bug.** Keeping the conditional-request
> markers (`if-none-match`, `if-modified-since`) *out* of the hash is correct — two requests that
> differ only in their revalidation validators are the same cache identity. The defect is *how*
> they are kept out: the code computes the hash, then writes the markers onto the caller's own
> object. The fix (X2) is not to hash the markers; it is to stop mutating the argument — build the
> conditional headers on an internal copy. See [Q2](#q2--resolved) for the full implication
> analysis.

Reach depends on consumer code (see [Q3](#q3--open)): callers who build the connection fresh per
request, or who pass a fresh object each time, get a new object and are unaffected. Only callers
holding a long-lived reference are exposed.

**F2 — A key present with value `undefined` may hash differently from an absent key.**
Originally measured against the former dual-backend code (`structuredClone` + `object-hash`):
`{...profile, defaultExpirationExtensionOnErrorInSeconds: undefined}` ≠ `{...profile}`.
⚠️ **Must be re-measured against the current single hasher before documenting.** The current
`generateIdHash` JSDoc (L1958-1960) states `undefined` and `bigint` are "normalized to string
forms," which may change this result. Do not write the F2 warning until the current behavior is
confirmed empirically.

**F3 — The hash is type-sensitive.** `defaultExpirationInSeconds: "300"` ≠
`defaultExpirationInSeconds: 300`. A profile sourced from SSM, JSON, or a CloudFormation parameter
where a number arrives as a string will not match a hard-coded sibling, even though the `Cache`
constructor `parseInt`s both to the same behavior. ⚠️ Re-measure alongside F2 against the current
hasher before documenting.

**~~F4~~ — restated.** The original F4 (that `Cache.info()` omits `useToolsHash`) is **moot**: the
setting no longer exists, so there is nothing to report. The genuinely useful remnant is that
`info()` does not expose the **resolved salt provenance** (which tier produced the salt). If a
code-side diagnostic is wanted, reframe F4 as "add resolved-salt provenance to `Cache.info()`" —
additive, low risk. Tracked under the revised X3 / [Q7](#q7--resolved).

### 1.3 `useToolsHash` env var defect — ❌ MOOT (already fixed in current source)

The entire §1.3 analysis described a defect in a code branch that **no longer exists**. Current
source, `src/lib/dao-cache.js` L1629-1632:

```js
this.#idHashAlgorithm = parameters.idHashAlgorithm || process.env.CACHE_DATA_ID_HASH_ALGORITHM || "RSA-SHA256";
// Note: the former useToolsHash / CACHE_DATA_USE_TOOLS_HASH switch has been removed (Task 6).
// These are now silently ignored (no read, no throw); hashing always uses the single path.
```

There is only one hashing path now (`tools.hashThisData` via `DataHasher`, L2014). The parameter
and both env-var names are read nowhere. Consequently:

- **X1 is deleted** (nothing to fix).
- The README already documents the deprecation at L255 (options table: "Deprecated (no longer
  used as of 1.4.0) … silently ignored") and L338 (env block: "no longer used as of 1.4.0").
- **D5 is re-scoped** from "reconcile the name" to a *consistency sweep*: two of the five original
  locations still cite the dead `CACHE_DATA_USE_TOOLS_HASH_METHOD` as if live —
  `docs/00-example-implementation/README.md` L227 and
  `example-template-lambda-function.yml` L54. Bring those in line with the README's shipped
  deprecation note. Pure doc edits, zero behavior risk.

### 1.3a Salt resolution — restated (supersedes C5)

Current source resolves the salt in **two tiers**, inside `generateIdHash`:

```js
const salt = this.#sharedCacheId !== null ? this.#sharedCacheId
           : (process.env?.AWS_LAMBDA_FUNCTION_NAME || "");
```

`CACHE_SHARED_ID` is **not** read here. It feeds `#sharedCacheId` during `Cache.init()` (README
options table L258 documents `sharedCacheId` defaulting from the `CACHE_SHARED_ID` env var). The
*effective* precedence is therefore `sharedCacheId` param → `CACHE_SHARED_ID` env →
`AWS_LAMBDA_FUNCTION_NAME` → `""` — the same end result the issue described, but new doc prose must
describe it as a two-tier resolve in `generateIdHash` fed by a configured value, not a four-tier
chain inside the hash function. The existing `generateIdHash` JSDoc (L1941-1944) already states this
correctly; new README prose should match that wording.

### 1.4 Claim narrowed (unchanged)

The issue's optional follow-up #2 asks for the computed `id_hash` to be logged. **It already is**,
at normal log level, on every `getData` completion:

```js
tools.DebugAndLog.log(`${idHash} | ${tags.path} | ${cache.getStatus()} | ${timer.elapsed()}`, "CACHE");
```

So that recommendation should not be implemented as written. The actual gap is that nothing reveals
*what produced* the hash, which is what makes drift undiagnosable — addressed by D4 (docs) and
optionally the revised X3/X4 (code). Exact line: `src/lib/dao-cache.js` L3351.

### 1.5 Unrelated defect noticed (unchanged)

`docs/features/cache/README.md` has a duplicate `idHashAlgorithm` row in the `Cache.init()` options
table (L247 and L256) with differing descriptions. Trivial, in the file being edited, folded in as
D6.

---

## 2. Assessment of the Issue's Optional Follow-Up #1 (unchanged — see [Q4](#q4--resolved))

The issue asks whether behavioral cache-profile fields should be part of a cache entry's
*identity*. Recommendation: **document the current behavior now; do not change the hash in 1.4.0.**

Reasoning:

- Narrowing hash inputs to `hostId`/`pathId`/`encrypt`/`profile` invalidates every existing cache
  entry in every deployment on upgrade. That is a major-version change at minimum, and a silent one
  — the symptom is a cold cache, not an error.
- `encrypt` genuinely belongs in identity: an entry's bytes are either encrypted or not, and a
  reader with the wrong expectation cannot decode it. Fields like
  `defaultExpirationExtensionOnErrorInSeconds` arguably do not.
- A cheaper remedy exists for the stated pain (per-consumer error-TTL tuning without splitting the
  cache): an explicit, opt-in identity object would let consumers converge on a shared identity
  while keeping divergent behavior, with no change to the default hash.

Resolution: keep #1 out of 1.4.0, record this analysis as a decision in `design.md`, and open a
separate spec for a 2.0.0 identity change (or the opt-in-identity feature) if the project pursues it.

---

## 3. Proposed Scope

The issue is filed as documentation. F1 and the revised code items are defects/enhancements
uncovered while verifying it. The split keeps the docs fix unblocked.

### Phase 1 — Documentation (this spec, no behavior change)

| ID | Change | File |
|----|--------|------|
| D1 | Rewrite "Cache Key Generation" to state all three hash inputs plus the salt (two-tier resolve per §1.3a), and the `connection.options` exclusion with its rationale | `docs/features/cache/README.md` §Cache Key Generation |
| D2 | Document the drift sources: full `cachePolicy` participation (C4), reused-connection mutation (F1), and — **only after re-measurement** — `undefined`-vs-absent (F2) and type sensitivity (F3) | same |
| D3 | Add a "Shared cache pitfalls" callout to §Shared Cache, and change the two-Lambda example to build the connection **per request** (or pass a fresh object) rather than a shared module-scope `const conn`, so the docs stop teaching the F1-triggering shape | same, §Shared Cache |
| D4 | Add a shared-cache drift troubleshooting walkthrough: symptom (reader sees a permanently empty cache), how to confirm (compare the `CACHE`-tagged `id_hash` across both functions' logs), and the checklist of inputs to diff (`connection` minus `options`, full `cachePolicy`, resolved salt, reused-object drift from F1) | same |
| D5 | **Re-scoped (see §1.3):** sweep the two stale locations still citing the dead `CACHE_DATA_USE_TOOLS_HASH_METHOD` env var to match the README's already-shipped 1.4.0 deprecation note | `docs/00-example-implementation/README.md` L227, `example-template-lambda-function.yml` L54 |
| D6 | Remove the duplicate `idHashAlgorithm` table row | `docs/features/cache/README.md` |
| D7 | Align the `Cache.getIdHash` and `Cache.generateIdHash` JSDoc with D1. The `generateIdHash` JSDoc still shows a `{query, connection, cachePolicy}` example (L1972-1976) while `getData` passes `{data, connection, cachePolicy}` — `query` is stale | `src/lib/dao-cache.js` |

### Phase 2 — Code changes (scope decision needed, see [Q2](#q2--resolved)/[Q3](#q3--open))

| ID | Change | Risk |
|----|--------|------|
| ~~X1~~ | ~~Fix the `useToolsHash` env var gate~~ | ❌ **Deleted** — switch already removed in current source (§1.3) |
| X2 | Stop `getData` from mutating the caller's `connection`; derive conditional request headers on an internal copy | Fixes F1. Hashes unchanged for fresh-per-call connections. For reused connections the hash stops drifting (correct direction, but a behavior change). Also removes an undocumented side effect some callers may read back. Needs unit + property tests and a release-note callout |
| X3 | **Restated from F4:** expose the **resolved salt provenance** in `Cache.info()` (not `useToolsHash`, which no longer exists) | Additive, low risk. Closes the real diagnostic gap |
| X4 | *Optional, likely deferred.* In-code drift diagnostic. **Do not** dump raw hash inputs. If pursued, log only salt provenance + per-component sub-hashes (hash of `connection`, of `cachePolicy`, separately) so a diff points at the drifting component without exposing values | Additive, debug-only. See [Q7](#q7--resolved) — recommended **dropped for 1.4.0** in favor of D4 |

### Out of scope for 1.4.0

- Narrowing hash inputs (issue follow-up #1) — see §2 / [Q4](#q4--resolved).
- Logging the computed `id_hash` (issue follow-up #2) — already implemented, see §1.4.
- `useToolsHash` env-var gate fix (old X1) — moot, already removed.

---

## 4. Implementation Approach

1. Resolve [Q3](#q3--open) (consumer-pattern check) to size X2's urgency, then write `requirements.md`
   covering Phase 1 with the X2 timing recorded as an explicit decision.
2. **Re-measure F2 and F3** against the current single hasher (`tools.hashThisData` / `DataHasher`)
   before writing any D2 prose about them. The current JSDoc claims `undefined`/`bigint`
   normalization; the docs must describe what 1.4.0 actually does.
3. Write `design.md` with the exact replacement prose for D1-D4, the §2 identity decision record,
   and correctness properties for any Phase 2 item accepted.
4. Documentation validation tests already exist under `test/documentation/`. Extend them so the
   README's stated hash inputs are checked against the implementation rather than asserted in prose
   — a test that computes two hashes differing only in one `cachePolicy` field and asserts they
   differ keeps D1 honest as the code evolves.
5. Any Phase 2 change needs unit tests plus a property test asserting hash stability for inputs the
   change is not meant to affect, so the blast radius is measured rather than assumed.
6. `CHANGELOG.md` entry under 1.4.0.

### Risk notes

- No Phase 1 change alters a hash. That is the property to preserve; a regression here silently
  invalidates production caches.
- X2 can change hashes for reused-connection consumers. It needs an explicit decision and a
  release-note callout, not a quiet patch.
- `test/cache/cache-shared-id-property-tests.jest.mjs` and `cache-shared-id-validation-tests.jest.mjs`
  already cover salt resolution; read them before adding tests to avoid duplication.

---

## 5. Clarifying Questions — Resolutions

### Q1 — resolved (now moot)

**Q.** Should the `useToolsHash` env var defect (§1.3) be fixed in this spec, or split out?

**Answer given:** Fix in this spec; note that as of 1.4.0 `useToolsHash` is deprecated as there is
now a single hashing option.

**Resolution:** Overtaken by the code — the switch and its defective env-var gate are **already
removed** in the current v1.4.0 source, and the README already carries the deprecation note. There
is nothing left to fix. **X1 is deleted** and **D5 is re-scoped** to a consistency sweep of the two
doc locations that still cite the dead `CACHE_DATA_USE_TOOLS_HASH_METHOD` name (see §1.3).

### Q2 — resolved

**Q.** How should F1 (the reused-connection mutation) be handled? Isn't leaving the cache markers
outside the hash intentional? Explain the implications of leaving it as is.

**Resolution — two separate things are being conflated:**

- **Intentional and correct:** excluding the conditional-request markers (`if-none-match`,
  `if-modified-since`) from the hash. Two requests that differ only in revalidation validators are
  the *same* cache identity; hashing them would make revalidation permanently miss. Keep this.
- **A bug regardless:** *how* the markers are kept out. `getData` computes the hash (L3266-3268),
  then writes the markers onto the **caller's own `connection` object** (L3280-3299). They never
  enter *this* hash, but they now sit on the object, so a caller reusing that reference computes a
  different hash next invocation.

**Implications of leaving it as is:**

1. **Identity drift across warm invocations** for any caller holding a long-lived `connection`:
   invocation 1 writes under `H1` and leaves `headers` on the object; invocation 2 computes
   `H2 ≠ H1` and the `H1` entry becomes unreachable — the reader sees a permanently empty cache.
   This reproduces the exact reported outage with no profile drift involved.
2. **An undocumented output parameter** — `getData` silently rewrites a field on an object the
   caller owns, a surprising contract for a read-through accessor.

**Decision:** keep F1 in scope as **X2**, fixed by *copy-not-mutate* (build conditional headers on
an internal copy), **not** by hashing the markers. If the project prefers this spec stay docs-only,
X2 splits to its own small code spec and Phase 1 still ships the D2/D3 warning as the interim
safety net. Timing depends on [Q3](#q3--open).

### Q3 — resolved

**Q.** Is the module-scope `const conn` pattern in the README's shared-cache examples
representative of how consumers actually write this?

**Answer given:** It is a common signature. The `conn` object most likely comes from a `Connection`
object set during `Config.init` — i.e. built once at init and reused across invocations.

**Resolution:** That is the long-lived-reference shape F1 drifts on, and it is the **mainline**
pattern, not an edge case. **X2 is therefore in scope as a priority item for 1.4.0** (the "do X2
now" branch). D3 still changes the README examples regardless.

**One design-phase verification (answerable by reading this repo's code, not the maintainer):**
whether the `Connection` / `Config.init` path hands `getData` a reused **class instance** or a
fresh **plain-object projection** each call.

- If callers pass the instance (or a stable plain object) and `getData` mutates it → F1 is a **live
  production bug** and X2 fixes it.
- If the path already yields a fresh plain object per call (e.g. via `conn.toObject()`) → F1 is
  **latent** and X2 is hardening.

Either way X2 is correct; this only calibrates the release-note framing (bug fix vs. hardening).
Recorded as a design-phase task: inspect the `Connection` class, `Config.init`, and `getData`'s
argument handling in `src/lib/`.

### Q4 — resolved

**Q.** Confirm narrowing hash inputs (issue follow-up #1) is deferred to a future major version.

**Resolution:** **Deferred to 2.0.0.** Narrowing is a breaking, silent (cold-cache) change. Record
the §2 analysis as a decision in `design.md`. If the "explicit opt-in identity object" alternative
is wanted instead, that is a separate feature spec, not this one. Out of scope for 1.4.0 either way.

### Q5 — resolved (with a precondition)

**Q.** How much F2/F3 detail belongs in the README versus `docs/technical/`?

**Resolution:** short, concrete warning in the README ("exact-match required, including value types
and explicitly-`undefined` keys"), with the `structuredClone`/hasher mechanism in a technical doc.
**Precondition:** re-measure F2 and F3 against the current single hasher first (step 2 of §4) — the
current JSDoc claims `undefined`/`bigint` normalization, so the warning must describe 1.4.0's actual
behavior, not the former dual-backend behavior.

### Q6 — resolved

**Q.** Should Phase 1 include a worked diagnostic walkthrough (D4)?

**Resolution:** **Yes — keep D4.** It is the highest-leverage item in the spec: it converts a
multi-hour production mystery into a two-minute log diff using logs that already exist (the
`CACHE`-tagged `id_hash` at L3351). The added README length is worth it. Tie its checklist to the
drift sources documented in D2 (C4, F1, and F2/F3 if they survive re-measurement).

### Q7 — resolved

**Q.** For X4, what is acceptable to log?

**Resolution:** **Drop the raw-input dump for 1.4.0.** With D4 plus the corrected docs, drift is
already diagnosable from existing logs, so a new value-logging code path is not worth the
sensitive-data surface area under deadline. If an in-code diagnostic is still wanted later, implement
it as **salt provenance + per-component sub-hashes** (hash of `connection`, of `cachePolicy`,
separately) — safer and more actionable than any redacted value dump, and it pairs with exposing the
resolved salt in `Cache.info()` (revised X3). Never log `data`, header values, or `parameters`
values.
