# Requirements: Cache Key Generation Documentation Correction

- **Spec**: `1-4-0-cache-key-generation-docs`
- **Source issue**: [#235](https://github.com/63Klabs/cache-data/issues/235) (`issue.md`)
- **Package version**: `1.4.0` (from `package.json`)
- **Precedes**: `design.md`, `tasks.md`
- **Basis**: `PLAN.md` (all clarifying questions Q1-Q7 resolved)

---

## Introduction

The "Cache Key Generation" section of `docs/features/cache/README.md` describes the cache-key
inputs more narrowly than the implementation computes them. It lists only a subset of `connection`
fields and omits both `data` and the full `cachePolicy` object, all of which flow into the
`id_hash`. This understatement caused a silent production outage: two Lambda functions sharing a
cache entry drifted on a single cache-profile field, produced different `id_hash` values, and the
reader function saw a permanently empty cache with no diagnostic surfacing the cause.

This spec corrects the documentation to match the implementation, documents the full set of hash
inputs and the drift sources around them, adds a diagnostic walkthrough, and fixes one code defect
uncovered during verification: `CacheableDataAccess.getData` mutates the caller's `connection`
object after computing the hash, which causes hash drift for the common pattern of a reused
`connection` reference.

No change in this spec is permitted to alter the `id_hash` for a caller that passes a fresh
`connection` object per request. Preserving existing cache keys is the primary safety property;
a regression silently invalidates production caches across every deployment on upgrade.

### Scope

**In scope**

- Documentation corrections to `docs/features/cache/README.md` (D1-D4, D6).
- A documentation consistency sweep of two stale env-var references (D5).
- JSDoc alignment in `src/lib/dao-cache.js` (D7).
- A code fix (X2) stopping `getData` from mutating the caller's `connection` object.
- Exposing resolved salt provenance in `Cache.info()` (X3).
- Documentation validation tests and code tests for the above.

**Out of scope (recorded decisions, see PLAN.md §2 and Q4/Q7)**

- Narrowing the hash inputs (issue follow-up #1) — deferred to a future major version (2.0.0).
- Logging the computed `id_hash` (issue follow-up #2) — already implemented at
  `src/lib/dao-cache.js` L3351.
- The former `useToolsHash` / `CACHE_DATA_USE_TOOLS_HASH` gate fix (old X1) — moot; the switch is
  already removed in the current v1.4.0 source.
- An in-code raw hash-input dump (old X4) — dropped for 1.4.0.

### Design-phase verifications (carried forward from PLAN.md)

These are resolved by reading this repository's code during `design.md`, not by further questions:

1. Re-measure the behavior of F2 (a key present with value `undefined` vs. an absent key) and F3
   (value type sensitivity) against the current single hasher (`tools.hashThisData` / `DataHasher`)
   before writing any user-facing prose about them. The current `generateIdHash` JSDoc claims
   `undefined`/`bigint` normalization, which may change F2's result from what was measured against
   the former dual-backend code.
2. Determine whether the `Connection` / `Config.init` path hands `getData` a reused class instance
   or a fresh plain-object projection per call. This calibrates the X2 release-note framing (live
   bug vs. hardening); X2 is correct either way.

---

## Glossary

- **`id_hash`**: the hex-encoded hash that uniquely identifies a cache entry, returned by
  `Cache.getIdHash()` and computed by `Cache.generateIdHash()`.
- **Hash input object**: the object actually hashed. In `CacheableDataAccess.getData` this is
  `{ data, connection, cachePolicy }` (`src/lib/dao-cache.js` L3266).
- **Salt**: a per-deployment value mixed into the hash so cache keys are scoped to a deployment.
- **Conditional-request markers**: the `if-none-match` and `if-modified-since` request headers used
  for HTTP revalidation.
- **Drift**: two parties that intend to share a cache entry computing different `id_hash` values
  because a hash input differs between them.

---

## Requirements

### Requirement 1: Accurate "Cache Key Generation" documentation (D1)

**User story:** As a developer configuring cache-data, I want the "Cache Key Generation" section to
list every input that contributes to the `id_hash`, so that I can predict when two requests share a
cache entry and when they do not.

#### Acceptance criteria

1. WHEN a reader consults the "Cache Key Generation" section THEN it SHALL state that the `id_hash`
   is derived from three inputs together with a salt: (a) the `data` parameter passed to
   `CacheableDataAccess.getData()`, (b) the `connection` object with all fields except
   `connection.options`, and (c) the full `cachePolicy` object including its behavioral fields.
2. WHEN the section describes the `connection.options` exclusion THEN it SHALL state the rationale:
   runtime toggles such as `forceRefresh` and `timeout` are intentionally excluded so they do not
   shift the key.
3. WHEN the section enumerates `cachePolicy` fields THEN it SHALL name the behavioral fields that
   participate in the hash, including at minimum `defaultExpirationInSeconds`,
   `defaultExpirationExtensionOnErrorInSeconds`, `expirationIsOnInterval`,
   `overrideOriginHeaderExpiration`, `encrypt`, `hostId`, `pathId`, `headersToRetain`, and
   `profile`.
4. WHEN the section describes the salt THEN it SHALL describe it as a two-tier resolve inside
   `generateIdHash` — `sharedCacheId` when configured, otherwise `AWS_LAMBDA_FUNCTION_NAME` (empty
   string if unset) — fed by a configured value, AND it SHALL note that `sharedCacheId` itself
   defaults from the `CACHE_SHARED_ID` environment variable during `Cache.init()`.
5. WHEN the section is finalized THEN it SHALL NOT claim or imply that only `connection` fields, or
   only a subset of `connection` fields, contribute to the hash.
6. WHEN the corrected prose makes a factual claim about hash inputs THEN that claim SHALL match the
   current implementation in `src/lib/dao-cache.js` rather than any prior version's behavior.

### Requirement 2: Documented drift sources and shared-cache consequence (D2)

**User story:** As a developer sharing a cache entry across two functions, I want the documentation
to spell out what must be identical for the entries to collide, so that I do not silently split the
cache by changing a field I assumed was operational.

#### Acceptance criteria

1. WHEN the documentation describes shared-cache requirements THEN it SHALL state that two parties
   sharing a cache entry must use identical `connection` (minus `options`) and identical
   `cachePolicy` objects in addition to the same salt.
2. WHEN the documentation describes `cachePolicy` participation THEN it SHALL state that drift in
   any single behavioral field — including a purely operational one such as
   `defaultExpirationExtensionOnErrorInSeconds` — produces a different `id_hash` and causes the
   parties to read and write different rows.
3. WHEN the documentation describes the reused-connection hazard THEN it SHALL warn that a
   `connection` object reused across invocations can drift (cross-referencing Requirement 7), and
   this warning SHALL remain present even if the X2 fix lands, framed as guidance for the supported
   pattern.
4. IF the design-phase re-measurement (verification 1) confirms that a key with value `undefined`
   hashes differently from an absent key under the current hasher THEN the documentation SHALL
   include a concise warning that exact match is required including explicitly-`undefined` keys.
5. IF the design-phase re-measurement confirms the hash is value-type sensitive under the current
   hasher THEN the documentation SHALL include a concise warning that value types must match (for
   example a numeric field sourced as a string from SSM or CloudFormation will not match a
   hard-coded number).
6. WHEN a warning from criteria 4 or 5 is NOT confirmed by re-measurement THEN that warning SHALL
   NOT be added, so the documentation never describes behavior the current hasher does not exhibit.
7. WHEN the mechanism behind the criteria 4 and 5 warnings is documented in depth THEN that depth
   SHALL live in a technical document, with only the concise warning in the user-facing README.

### Requirement 3: Shared-cache pitfalls callout and realistic examples (D3)

**User story:** As a developer following the README's shared-cache example, I want the example to
reflect the real multi-function shape and to avoid teaching a pattern that triggers drift, so that
copying it does not reproduce the reported outage.

#### Acceptance criteria

1. WHEN the "Shared Cache" section is finalized THEN it SHALL contain a "Shared cache pitfalls"
   callout summarizing the drift sources from Requirement 2.
2. WHEN the two-Lambda example is finalized THEN it SHALL show each function defining its own
   configuration such that the drift risk is visible, rather than a single shared inline cache
   profile that sidesteps the risk.
3. WHEN the shared-cache example constructs a `connection` THEN it SHALL NOT teach the shape that
   triggers Requirement 7's mutation hazard (a long-lived `connection` reference mutated in place);
   it SHALL demonstrate a connection obtained per request or an equivalent fresh-object pattern.
4. WHEN examples are updated THEN they SHALL remain executable and consistent with the package's
   markdown documentation standards (language-tagged code blocks, realistic names).

### Requirement 4: Shared-cache drift troubleshooting walkthrough (D4)

**User story:** As an on-call engineer facing a reader that sees an empty shared cache, I want a
troubleshooting walkthrough, so that I can locate the drift from logs in minutes instead of reading
source.

#### Acceptance criteria

1. WHEN the troubleshooting walkthrough is added THEN it SHALL state the symptom: a reader perceives
   a permanently empty cache and falls through to its fetch/error path despite the writer succeeding.
2. WHEN the walkthrough describes confirmation THEN it SHALL instruct the reader to compare the
   `CACHE`-tagged `id_hash` emitted on every `getData` completion across both functions' logs, and
   SHALL note that this log line already exists at normal log level.
3. WHEN the walkthrough describes diagnosis THEN it SHALL provide a checklist of inputs to diff:
   `connection` (minus `options`), the full `cachePolicy`, the resolved salt, and the reused-object
   drift from Requirement 7.
4. WHEN the walkthrough references drift causes THEN it SHALL cross-reference the drift sources
   documented under Requirement 2.

### Requirement 5: Env-var documentation consistency sweep (D5)

**User story:** As a developer reading the example implementation docs, I want references to the
removed hashing switch to match the package's shipped deprecation note, so that I do not configure a
setting that no longer exists.

#### Acceptance criteria

1. WHEN `docs/00-example-implementation/README.md` is reviewed THEN any reference to
   `CACHE_DATA_USE_TOOLS_HASH_METHOD` (or the related switch) SHALL be updated to match the README's
   shipped note that the setting is deprecated and silently ignored as of 1.4.0.
2. WHEN `docs/00-example-implementation/example-template-lambda-function.yml` is reviewed THEN any
   reference to the removed env var SHALL be updated or removed consistently with criterion 1.
3. WHEN the sweep is complete THEN no documentation location SHALL present the removed switch as a
   live, functional option.
4. WHEN the sweep is complete THEN it SHALL NOT introduce any code change, because the switch is
   already removed from the implementation.

### Requirement 6: Remove duplicate options-table row (D6)

**User story:** As a developer reading the `Cache.init()` options table, I want each option listed
once with one description, so that I am not misled by conflicting rows.

#### Acceptance criteria

1. WHEN the `Cache.init()` options table in `docs/features/cache/README.md` is finalized THEN
   `idHashAlgorithm` SHALL appear exactly once.
2. WHEN the duplicate is removed THEN the retained row SHALL carry the accurate description,
   including the default `RSA-SHA256` and the `CACHE_DATA_ID_HASH_ALGORITHM` env-var override.

### Requirement 7: `getData` must not mutate the caller's `connection` (X2)

**User story:** As a developer who holds a `connection` object across warm invocations (the common
pattern where it comes from a `Connection` set during `Config.init`), I want `CacheableDataAccess.getData`
to leave my object unmodified, so that its reuse does not cause the `id_hash` to drift and silently
orphan cache entries.

#### Acceptance criteria

1. WHEN `getData` prepares conditional-request markers for the origin call THEN it SHALL derive them
   on an internal copy and SHALL NOT add, remove, or modify any property of the caller's
   `connection` object, including the `headers` property.
2. WHEN `getData` is called twice with the same caller-held `connection` reference and nothing else
   changes THEN both invocations SHALL compute the same `id_hash`.
3. WHEN `getData` is called with a `connection` that has no `headers` property THEN the caller's
   object SHALL still have no `headers` property after the call returns.
4. WHEN the conditional-request markers (`if-none-match`, `if-modified-since`) are prepared THEN they
   SHALL continue to be excluded from the hash input, preserving HTTP revalidation behavior (this
   exclusion is intentional and SHALL NOT change).
5. WHEN a caller passes a fresh `connection` object per request THEN the `id_hash` SHALL be
   identical to the value the pre-fix code produced for that same object, so no existing cache key
   changes for that usage pattern.
6. WHEN the origin call function (`apiCallFunction`) receives its `connection` argument THEN it
   SHALL still receive the conditional-request markers that the pre-fix code supplied, so
   revalidation requests are unchanged from the origin's perspective.
7. WHEN header sanitization currently performed on `connection.headers` runs THEN it SHALL operate
   on the internal copy and SHALL NOT delete values from the caller's object.

### Requirement 8: Expose resolved salt provenance in `Cache.info()` (X3)

**User story:** As an engineer diagnosing shared-cache drift, I want `Cache.info()` to report how the
salt was resolved, so that I can confirm two functions resolved the same salt without reading source.

#### Acceptance criteria

1. WHEN `Cache.info()` is called THEN its return value SHALL include the resolved salt provenance,
   indicating whether the salt came from a configured `sharedCacheId` or from
   `AWS_LAMBDA_FUNCTION_NAME` (or an empty default).
2. WHEN the salt provenance is added to `Cache.info()` THEN the addition SHALL be additive and SHALL
   NOT remove or rename any existing field of the returned object, preserving backward compatibility.
3. WHEN the salt provenance is reported THEN it SHALL NOT expose any secret-bearing value; it
   reports which source was used and the non-sensitive salt identifier already surfaced via
   `sharedCacheId`.
4. WHEN `Cache.info()` gains the new field THEN its JSDoc return-type documentation SHALL be updated
   to document the field accurately.

### Requirement 9: JSDoc alignment (D7)

**User story:** As a developer relying on IDE hints, I want the `Cache.getIdHash` and
`Cache.generateIdHash` JSDoc to match what the code hashes, so that the inline documentation does
not contradict the corrected README.

#### Acceptance criteria

1. WHEN the `Cache.generateIdHash` JSDoc is finalized THEN its example and description SHALL
   reflect the `{ data, connection, cachePolicy }` wrapper that `getData` actually passes, and
   SHALL NOT present a stale `{ query, connection, cachePolicy }` wrapper.
2. WHEN the `Cache.getIdHash` and `Cache.generateIdHash` JSDoc describe hash inputs or salt
   resolution THEN they SHALL be consistent with the corrected "Cache Key Generation" documentation
   (Requirement 1).
3. WHEN JSDoc is edited THEN parameter names in the JSDoc SHALL match the actual function signatures
   exactly, per the package JSDoc standards.

### Requirement 10: Verification and backward-compatibility safeguards

**User story:** As a maintainer, I want automated checks that keep the corrected documentation honest
and prove the code change does not shift existing cache keys, so that a future edit cannot silently
reintroduce the drift or invalidate production caches.

#### Acceptance criteria

1. WHEN documentation validation tests under `test/documentation/` are extended THEN they SHALL
   include a check that the README's stated hash inputs are verified against the implementation —
   for example, computing two hashes that differ only in one `cachePolicy` field and asserting the
   hashes differ.
2. WHEN the X2 fix (Requirement 7) is implemented THEN it SHALL be accompanied by unit tests
   covering: an unchanged caller object after a refresh, equal `id_hash` across two calls with a
   reused reference, and a caller object with no `headers` remaining without `headers`.
3. WHEN the X2 fix is implemented THEN it SHALL be accompanied by a property test asserting
   `id_hash` stability for fresh-per-call `connection` inputs, so the no-key-change property
   (Requirement 7, criterion 5) is measured rather than assumed.
4. WHEN new tests are added THEN existing salt-resolution coverage in
   `test/cache/cache-shared-id-property-tests.jest.mjs` and
   `test/cache/cache-shared-id-validation-tests.jest.mjs` SHALL be reviewed first to avoid
   duplication.
5. WHEN property tests are added THEN they SHALL follow the project's property-testing rules
   (global `FC_SEED` hook, no `seed` option at an `fc.assert` call site, generator preconditions
   matching the asserted acceptance rule).
6. WHEN the full test suite is run THEN all tests SHALL pass before the change is considered
   complete.

### Requirement 11: Changelog and release framing

**User story:** As a consumer upgrading to 1.4.0, I want the changelog to record the documentation
corrections and the `getData` behavior change, so that I understand what changed and whether it
affects me.

#### Acceptance criteria

1. WHEN `CHANGELOG.md` is updated THEN it SHALL record the documentation corrections under 1.4.0.
2. WHEN `CHANGELOG.md` records the X2 fix THEN it SHALL describe the removed side effect on the
   caller's `connection` object and the resulting end to `id_hash` drift for reused-connection
   callers.
3. WHEN the X2 fix is framed in the changelog THEN the framing (bug fix vs. hardening) SHALL reflect
   the outcome of design-phase verification 2 (whether the `Connection`/`Config.init` path reuses an
   instance or yields a fresh object).
4. WHEN the changelog entry is written THEN it SHALL state that callers passing a fresh `connection`
   per request see no change to their cache keys.
