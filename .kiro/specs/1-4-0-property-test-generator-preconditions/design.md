# Design Document

## Overview

This design fixes two fast-check generators whose preconditions are weaker than the acceptance rule `ParameterKeySafety` applies, then replaces the one-time audit and the per-call-site seed pattern the issue proposed with two mechanisms that are cheaper and strictly more sensitive: a deterministic precondition-audit test, and a single global seed hook.

No `src/` file changes. All work is in `test/`, `jest.config.mjs`, `.github/workflows/`, `.kiro/steering/`, and `CHANGELOG.md`.

Every design choice below was validated empirically before being written down. Measurements are labelled as such; the one claim that is analytic rather than measured is labelled too.

### Decisions carried in from requirements

Both open questions are resolved:

- **Audit boundary — by predicate, not charset.** Scope is every property asserting acceptance or success of a predicate that applies rules to *substructure*. That set is the `checkSecretName` / `isSafeSecretName` family plus `resolveGroupAndSegments`. The charset grep remains a discovery heuristic, not the boundary.
- **Controls — Goal A primary, Goal B manual.** The precondition-audit test is the primary control and runs on every push. The full-suite seed sweep is `workflow_dispatch` only, with no cron and therefore no recurring Actions cost.

### Why the issue's proposed controls were replaced

Measured on this machine: the full suite is 223 files / 3,096 tests in 25s at full parallelism, 48s capped at two workers. Direct sampling of one generator is 0.71s for 500,000 draws.

The two instances do **not** share one violation rate. Remeasured at 200,000 draws × 20 seeds each (4,000,000 draws per generator): instance 1 is ~1 in 49,383, instance 2 is ~1 in 666,667 — roughly 13x rarer. Detection is therefore quoted per instance.

| Control | Cost | Detection: instance 1 (~1 in 49,383) | Detection: instance 2 (~1 in 666,667) |
|---|---|---:|---:|
| Full-suite sweep, 40 seeds | ~33 min runner time | 15.0% | 0.6% |
| Full-suite sweep, 500 seeds | ~7 h | 86.8% | 7.2% |
| Direct sampling, 200,000 draws | 0.30s | 98.3% | 25.9% |
| Direct sampling, 500,000 draws | 0.71s | 99.995% | 52.8% |
| Direct sampling, 2,600,000 draws | ~18s (measured, ARN generator incl. predicate checks) | ~100% | 98.0% |

Sweep rows use each property's configured `numRuns` (200 for instance 1, 100 for instance 2), so a seed buys that many draws of the generator in question.

A seed sweep re-runs 3,096 tests to buy `numRuns` extra draws of the one generator that matters. Direct sampling spends the whole budget on the generator under test. That is the entire argument for the Goal A / Goal B split.

The right-hand column is also why the audit's budget is **per entry** rather than suite-wide: a single 200,000-draw budget gives ~98% detection for instance 1 and only ~26% for instance 2, which is the instance whose defect class blocked the v1.3.17 release. See section E.

## Architecture

### Files changed

| File | Change | Requirement |
|---|---|---|
| `test/helpers/parameter-key-arbitraries.mjs` | **new** — single source of truth for the audited arbitraries and their paired predicates | 1, 2, 4 |
| `test/security/parameter-key-safety-tests.jest.mjs` | import shared arbitraries; fix two generators; add deterministic rejection cases; drop call-site `seed`; seed-drive the shuffle | 1, 2, 3, 5, 9 |
| `test/security/property/generator-precondition-audit-tests.jest.mjs` | **new** — the Goal A audit | 4 |
| `test/setup/fast-check-seed.mjs` | **new** — global seed hook | 5 |
| `jest.config.mjs` | register `setupFilesAfterEnv` | 5 |
| 12 files carrying `seed:` options | remove 69 call-site `seed:` options | 5 |
| `.github/workflows/property-seed-sweep.yml` | **new** — manual sweep | 6 |
| `.kiro/steering/test-execution-monitoring.md` | extend the property-testing guardrails | 7 |
| `test/utils/property/prefix-resolution-property-tests.jest.mjs` | seed-drive the shuffle | 9 |
| `test/security/property/jsdoc-parsing-property-tests.jest.mjs` | seed-drive wrapper selection | 9 |
| `test/security/property/shell-injection-prevention-property-tests.jest.mjs` | seed-drive metacharacter and position | 9 |
| `CHANGELOG.md` | test-only entry | 8 |

### Naming note

Neither new non-test module may match Jest's `testMatch` of `**/test/**/*.jest.mjs`. Both `test/helpers/parameter-key-arbitraries.mjs` and `test/setup/fast-check-seed.mjs` end in `.mjs` but not `.jest.mjs`, so neither is collected as a suite. This matches the existing `test/helpers/` convention.

## Components and Interfaces

### A. Shared arbitraries module

The audit must sample the *same* arbitrary object the property uses. If the audit held its own copy, it would verify the copy and the real generator could drift — which is the defect class this spec exists to close. So the arbitraries move into one module that both importers share.

`test/helpers/parameter-key-arbitraries.mjs` exports each named arbitrary plus a registry pairing it with the predicate that must accept every draw:

```javascript
// Each entry: the arbitrary, the predicate every draw must satisfy, and where
// the arbitrary is asserted. The audit test iterates this registry, so adding a
// safety-critical arbitrary here automatically brings it under audit.
export const AUDITED_ARBITRARIES = [
    {
        name: 'safeSecretName',
        arbitrary: safeSecretName,
        predicate: (value) => ParameterKeySafety.checkSecretName(value).safe,
        describe: (value) => ParameterKeySafety.checkSecretName(value),
        assertedBy: 'setGroupedSecret / setGroupedSecretMap round-trip properties'
    },
    // ... safeSecretNameArn, and any future substructure-gated arbitrary
];
```

### B. Instance 1 — gate-predicate filter (Requirement 1)

The property asserts `setGroupedSecret` returns `assigned: true` and the value round-trips. It does not assert the acceptance predicate, so it may establish its precondition from that predicate without becoming vacuous.

The filter calls the real implementation rather than hand-mirroring the segment rule:

```javascript
// The property below asserts setGroupedSecret's assignment behavior, NOT
// checkSecretName's verdict, so filtering on checkSecretName is a precondition,
// not a tautology. Calling the implementation rather than re-deriving its rule
// means this filter cannot drift when the rule changes.
export const safeSecretName = fc
    .stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/)
    .filter((value) => ParameterKeySafety.checkSecretName(value).safe);
```

This is deliberately stronger than the v1.3.17 fix, which hand-mirrored the segment rule at what is now line ~554. A hand-mirror is correct only until the implementation grows a rule the mirror does not know about. The existing mirror is replaced by this shared arbitrary so both round-trip properties share one definition.

Rejection rate is far below fast-check's constraint threshold, so no `maxSkipsPerRun` tuning is needed.

**Measured:** 500,000 draws, 0 violations, 42.4% of draws contain `/`. Separator coverage is retained.

### C. Instance 2 — safe by construction (Requirement 2)

This property asserts `isSafeSecretName(arn) === true`. Filtering on that predicate would make it unable to fail, so the generator must instead make violating draws unreachable.

**The digit lemma.** `DANGEROUS_KEYS` united with `Object.getOwnPropertyNames(Object.prototype)` is 13 names. All 13 match `^[A-Za-z_]+$`; none contains a digit or any of `. + = @ : - /`. **Measured** by enumeration. Therefore any string containing at least one digit cannot equal a reserved name, so forcing one digit into every segment makes `dangerous-segment` and `prototype-segment` unreachable without ever consulting the predicate under test.

```javascript
// Safe by construction, NOT by filtering: this arbitrary feeds a property that
// asserts isSafeSecretName(...) === true, so filtering on that predicate would
// make the property vacuous. Instead every segment carries at least one digit,
// and no reserved key contains a digit (see the digit-lemma guard test), so no
// segment can collide with DANGEROUS_KEYS or PROTOTYPE_KEYS.
// Do NOT "simplify" this into a .filter() on isSafeSecretName.
const secretNameSegment = fc
    .tuple(
        fc.stringMatching(/^[a-zA-Z0-9_.+=@-]{0,8}$/),
        fc.stringMatching(/^[0-9]$/),
        fc.stringMatching(/^[a-zA-Z0-9_.+=@-]{0,8}$/)
    )
    .map(([before, digit, after]) => before + digit + after);
```

Segments are joined with `/`, with an optional leading `/` so the implementation's empty-segment skip path is still exercised.

**Measured** over 500,000 draws: 0 violations; 74.5% multi-segment; 50.0% carry a leading slash; `/` present in 87.2%; each of `+ = @ . _` present in ~81.6%; `-` in 100%. A separate 500,000-draw check of the segment arbitrary alone found 0 segments equal to a reserved key, as the lemma predicts.

The lemma's premise is runtime-dependent — a future Node adding an `Object.prototype` own property containing a digit would invalidate it. The audit test therefore asserts the premise directly, so the generator cannot silently become unsafe.

### D. Deterministic rejection coverage (Requirement 3)

Fixing the generators removes the only path by which these properties reached the `dangerous-segment` and `prototype-segment` branches, so without compensating cases this spec would reduce coverage. An `it.each` block over `setGroupedSecret` mirrors the existing `setGroupedSecretMap` block:

| Secret name | Expected reason | Why this case |
|---|---|---|
| `toString/p` | `prototype-segment` | reserved key as first segment, no leading separator — the shape the issue missed |
| `+_8@/valueOf` | `prototype-segment` | observed counterexample from verification |
| `/__proto__` | `dangerous-segment` | reserved key after a leading separator |
| `myapp/__proto__/db` | `dangerous-segment` | reserved key in a middle segment |
| `myapp/constructor` | `dangerous-segment` | `constructor` is in both denylists; `DANGEROUS_KEYS` is checked first |
| `/hasOwnProperty` | `prototype-segment` | leading separator plus a prototype method name |

Each case asserts the exact `reason` string and that nothing was written to the store. `setGroupedSecretMap` already has equivalent coverage, so per Requirement 3 criterion 5 it is not duplicated.

### E. The precondition audit (Requirement 4, Goal A)

`test/security/property/generator-precondition-audit-tests.jest.mjs` iterates `AUDITED_ARBITRARIES`, samples each, and asserts zero violations.

```javascript
// Baseline budget, used by any registry entry that does not state its own.
const BASELINE_DRAW_COUNT = 200000;
const AUDIT_DRAWS = Number(process.env.FC_AUDIT_DRAWS ?? BASELINE_DRAW_COUNT);

// FC_AUDIT_DRAWS SCALES rather than replaces: it moves the baseline, and every
// per-entry budget moves by the same factor, so the sweep workflow's
// audit_draws input is a uniform "sample this much wider" dial. Replacing
// per-entry budgets with one number would, at any value below 2,600,000,
// silently reduce the ARN budget and re-weaken the control.
const BUDGET_SCALE = AUDIT_DRAWS / BASELINE_DRAW_COUNT;

// Fixed default sampling seed so this test is deterministic: it either always
// passes or always fails, and can never become a randomly-timed release block
// of the kind this spec exists to eliminate. FC_SEED varies it in a sweep.
// This is the BASE seed; each sampling batch derives its own from it.
const SAMPLING_SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 1;
```

**Per-entry draw budgets.** Sensitivity is a property of the generator, not of the registry, so `AuditedArbitrary` carries an optional `drawCount`. Entries that omit it run on the baseline. Measured over 4,000,000 pre-fix draws each:

| Entry | Measured rate | Pre-fix seeds detecting (of 20) | Detection at baseline 200,000 | Budget |
|---|---|---:|---:|---:|
| `safeSecretName` | ~1 in 49,383 | 20 | ~98.3% | baseline (200,000) |
| `safeSecretNameArn` | ~1 in 666,667 | 6 | ~26% | 2,600,000 |

The ARN budget is derived as `-ln(0.02) × 666,667 = 3.912 × 666,667 ≈ 2,608,000`, rounded to 2,600,000, which gives `1 - exp(-2,600,000 / 666,667) = ~98.0%` — the same target the other entry already meets at the baseline. This correction matters because the pre-fix ARN generator was **not** detected at the audit's committed default seed at 200,000 draws: the primary control this spec introduces would have been weak for exactly the instance whose defect class blocked the v1.3.17 release.

**Batched sampling.** 200,000 retained draws measure ~104MB peak heap, so a 2,600,000-draw budget cannot be one `fc.sample` call. The audit samples in 200,000-draw batches, checking and discarding each. Batching must not cost sensitivity, so each batch takes a **distinct derived seed**: batch 0 keeps the base seed (an entry fitting in one batch is sampled exactly as before batching existed), and later batches mix the base seed with the batch index through an xorshift32 step. A plain `base + index` would make seed 1's batch 1 identical to seed 2's batch 0, so a 40-seed sweep would re-sample the same sequences instead of exploring 40x the space. Per-test timeouts scale with the resolved budget so a large budget cannot report itself as a precondition failure.

Two design points:

- **Determinism is the point.** A randomly-seeded audit would reintroduce exactly the failure mode being fixed. With a fixed seed, a reintroduced whole-string-only filter either appears in that specific draw sequence or does not — and at each entry's own budget it appears with ~98% probability, after which it fails on every run until fixed.
- **Failure output must be actionable.** On violation the test reports the arbitrary's name, the counterexample, the predicate's `reason`, and the `assertedBy` string, so a maintainer sees which property's precondition broke rather than a bare boolean.

The audit also carries the digit-lemma guard from section C: assert that no member of `DANGEROUS_KEYS` or `PROTOTYPE_KEYS` contains a digit. If a future runtime breaks that premise, this fails with a clear message instead of the ARN generator quietly becoming unsafe.

This converts Requirement 4's one-time manual audit into a permanent regression test. Registering a new arbitrary in the registry is what brings it under audit, so the boundary is re-checked automatically as the suite changes.

### F. Global seeding (Requirement 5)

`test/setup/fast-check-seed.mjs`:

```javascript
import fc from 'fast-check';

const raw = process.env.FC_SEED;
if (raw !== undefined && raw !== '') {
    const seed = Number(raw);
    // Fail loudly rather than silently falling back to random seeding: a typo in
    // a sweep configuration must not produce a run that looks reproducible but
    // is not.
    if (!Number.isInteger(seed)) {
        throw new Error(`FC_SEED must be an integer; received "${raw}"`);
    }
    fc.configureGlobal({ seed });
}
```

Registered in `jest.config.mjs` as `setupFilesAfterEnv: ['<rootDir>/test/setup/fast-check-seed.mjs']`.

`setupFilesAfterEnv` is required; `setupFiles` runs in a module registry the test files do not share, and a global configured there does not reach `fc.assert`. **Measured.**

**Removing the call-site overrides.** An explicit `seed: undefined` overrides the global and restores random seeding — **measured**. The suite currently has 69 such options across 12 files (requirements said "12", which counted files). All 69 are removed. They are textually identical, so this is a mechanical substitution, but it is the load-bearing step: left in place, those 12 files would be the only ones a sweep could not reach.

Replay command, to be documented per criterion 9:

```bash
FC_SEED=1171791119 npm test -- test/security/parameter-key-safety-tests.jest.mjs
```

**Measured** end to end: full suite passes with the hook registered and `FC_SEED` unset (223 suites, 3,096 tests, 24.7s — unchanged); passes with `FC_SEED=12345`; and `FC_SEED=notanumber` fails loudly with "Test suite failed to run" and the guard's message.

### G. Manual seed sweep (Requirement 6, Goal B)

`.github/workflows/property-seed-sweep.yml`, `workflow_dispatch` only. No `push`, no `pull_request`, no `schedule` — it cannot block a merge or a release, and costs nothing when not invoked.

Inputs: `seed_count` (default 50, clamped to a documented maximum), `start_seed` (default 1), `audit_draws` (forwarded as `FC_AUDIT_DRAWS`). The job sets `timeout-minutes` and the loop is bounded by `seed_count`, satisfying criterion 5.

The loop runs the suite sequentially per seed, stops at the first failure, and prints the replay command for the failing seed. Sequential-in-one-job rather than a matrix: a matrix would pay install overhead per leg for no wall-clock benefit at this cadence.

Per criterion 6, the stated assumption: a 50-seed sweep detects instance 1's defect (~1 in 49,383, `numRuns: 200`, so 10,000 draws) with ~18% probability, and instance 2's (~1 in 666,667, `numRuns: 100`, so 5,000 draws) with under 1%. That is deliberately low. The sweep's purpose is breadth — order effects, timing, defect classes nobody has enumerated — because Goal A covers this known class at 98% per push. Criterion 7's documentation must say plainly that a sweep failure most likely indicates a test-precondition defect rather than a `src/` regression.

### H. Bringing test input under fast-check's control (Requirement 9)

`FC_SEED` controls fast-check's PRNG only, so seven `Math.random()` call sites that decide test input would stay unreproducible. Each is replaced with a drawn value.

**Permutations** (`prefix-resolution-property-tests.jest.mjs:131`, `parameter-key-safety-tests.jest.mjs:888`). The current `sort(() => Math.random() - 0.5)` is both unseeded and an inconsistent comparator, so the order is implementation-defined and biased:

```javascript
fc.uniqueArray(nameArbitrary, { minLength: 0, maxLength: 15 }).chain((names) =>
    fc.tuple(
        fc.constant(names),
        // Full permutation: min = max = length. Seed-driven, and a well-defined
        // distribution, unlike sort(() => Math.random() - 0.5).
        fc.shuffledSubarray(names, { minLength: names.length, maxLength: names.length })
    )
)
```

**Measured** over 20,000 draws: length preserved 20,000/20,000, multiset preserved 20,000/20,000 (so it is a true permutation), order differed in 14,713 of the cases with length > 1, and two samples at the same seed were identical.

**Shell metacharacter and position** (`shell-injection-prevention-property-tests.jest.mjs:51-52`). `chain` is used rather than a modulo so the position is drawn exactly within bounds:

```javascript
fc.tuple(fc.string({ minLength: 1, maxLength: 50 }), fc.constantFrom(...SHELL_METACHARACTERS))
    .chain(([str, metachar]) =>
        fc.nat({ max: str.length }).map(
            (position) => str.slice(0, position) + metachar + str.slice(position)
        )
    )
```

**JSDoc type wrappers** (`jsdoc-parsing-property-tests.jest.mjs:51, 182, 228`). Each wrapper string embeds the type built by the previous iteration, so the drawn value must be an *index*, not a prebuilt string:

```javascript
fc.tuple(baseTypeArbitrary, fc.integer({ min: 0, max: 3 }), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 3, maxLength: 3 }))
    .map(([baseType, depth, wrapperChoices]) => {
        let type = baseType;
        for (let i = 0; i < depth; i++) {
            const wrappers = [`Array<${type}>`, `Promise<${type}>`, `{data: ${type}}`, `{id: string, value: ${type}}`];
            type = wrappers[wrapperChoices[i]];
        }
        return type;
    })
```

Assertions are unchanged throughout; only the source of randomness moves. The three `Math.random()` uses that build unique temp-file and temp-directory names do not influence any assertion and are left alone per criterion 6.

## Data Models

Nothing here is a runtime data model in the package sense; these are the test-side shapes this design introduces or consumes.

### `AuditedArbitrary` (new, test-only)

The registry entry that pairs a generator with the predicate every one of its draws must satisfy. The audit test iterates these, so this shape is the contract between section A and section E.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Stable identifier used in audit failure output |
| `arbitrary` | `fc.Arbitrary<string>` | The exact arbitrary object the property under test uses |
| `predicate` | `(value: string) => boolean` | Must return `true` for every draw |
| `describe` | `(value: string) => {safe: boolean, reason: string\|null}` | Diagnostic detail for failure output |
| `assertedBy` | `string` | Which property relies on this precondition, so a failure names the affected test |

### `{safe, reason}` — consumed, not defined here

`ParameterKeySafety.checkSecretName` returns this descriptor and this design depends on its `reason` values being stable, because section D asserts exact strings. The values relied upon are `dangerous-key`, `prototype-key`, `dangerous-segment`, `prototype-segment`, `invalid-characters`, `not-a-non-empty-string`, and `too-long`. No `src/` change means none of these move.

### Environment variable contract (new)

| Variable | Type | Default | Consumer |
|---|---|---|---|
| `FC_SEED` | integer string | unset (random per run) | `test/setup/fast-check-seed.mjs`, audit sampling seed |
| `FC_AUDIT_DRAWS` | integer string | `200000` | audit test draw budget |

Both are read-only inputs. `FC_SEED` is validated; see Error Handling.

## Correctness Properties

### Property 1: Gate-filtered secret names are always accepted

For every draw of `safeSecretName`, `ParameterKeySafety.checkSecretName(draw).safe === true`.

Verified by the audit test at 200,000 draws; measured at 500,000 draws with 0 violations during design.

**Validates: Requirements 1.1, 1.2, 1.6**

### Property 2: Constructed ARNs are always accepted

For every draw of `safeSecretNameArn`, `ParameterKeySafety.isSafeSecretName(draw) === true`.

Verified by the audit test at 200,000 draws; measured at 500,000 draws with 0 violations during design.

**Validates: Requirements 2.1, 2.6**

### Property 3: No reserved key contains a digit

No member of `DANGEROUS_KEYS` or `PROTOTYPE_KEYS` contains a character in `[0-9]`.

This is the premise that makes Property 2 true by construction. Verified by enumeration in the audit test, so a runtime change that breaks it fails loudly instead of silently weakening the ARN generator.

**Validates: Requirements 2.1**

### Property 4: The ARN generator never consults the predicate it asserts

`safeSecretNameArn` establishes its precondition by narrowing its alphabet, never by filtering on `isSafeSecretName` or `checkSecretName`.

Not mechanically checkable — a violation would still pass. Enforced by inline comment and steering guidance; recorded as residual risk.

**Validates: Requirements 2.2, 2.7**

### Property 5: Reserved segments are rejected with an exact reason

For each name in the section D table, `setGroupedSecret` returns the stated `reason` and writes nothing to the store.

Verified by deterministic `it.each` cases, so these paths are exercised on every run rather than by random draw.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

### Property 6: A fixed seed reproduces inputs

With `FC_SEED` set to an integer, repeated runs of the same command draw identical inputs for every property that does not pass its own `seed` and does not draw input from outside fast-check.

Verified by the 40-seed run and by the Requirement 9 changes that remove the remaining outside-fast-check randomness.

**Validates: Requirements 5.4, 9.7**

### Property 7: An unset seed changes nothing

With `FC_SEED` unset, seeding behavior is identical to today's and the suite's pass/fail state and timing are unchanged.

Measured during design: 223 suites, 3,096 tests, 24.7s with the hook registered.

**Validates: Requirements 5.3**

### Property 8: An invalid seed fails the run

With `FC_SEED` set to a non-integer, the run fails rather than degrading to random seeding.

Measured during design: fails with "Test suite failed to run" and the guard's message.

**Validates: Requirements 5.8**

### Property 9: Coverage is not reduced

The fixed generators retain their separator and punctuation coverage, and net test count does not decrease.

Verified by the coverage percentages in sections B and C and by the Requirement 8 count check.

**Validates: Requirements 1.5, 2.4, 2.5, 8.7**

## Testing Strategy

Per `.kiro/steering/test-execution-monitoring.md`, no test added here spawns a child process, so no direct-Jest-invocation or timeout concerns apply to the new tests. The sampling in the audit test is in-process.

The audit test's draw budget is the one performance consideration: 200,000 draws per arbitrary at ~0.3s each adds well under a second to a 25s suite.

Verification sequence for Requirement 8:

1. `npm test` — expect 223 suites / 3,096 tests passing, plus the new cases.
2. Sample each fixed arbitrary 500,000 times against its predicate; expect 0 violations; record the result.
3. Run the suite at 40 distinct `FC_SEED` values; expect 40 passes. At 25s each this is ~17 minutes locally.
4. Confirm `FC_SEED=notanumber` fails loudly.
5. Confirm the sampling harness is either removed or not matched by `testMatch`.
6. Confirm net test count has not decreased.

## Error Handling

Three failure paths matter here, and each is designed to be loud rather than silent, because every defect in this spec was originally a silent one.

### Invalid `FC_SEED`

`test/setup/fast-check-seed.mjs` throws on a non-integer value. Jest surfaces this as "Test suite failed to run" and the whole run fails. The alternative — falling back to random seeding — would produce a run that reports a seed it did not use, which is worse than no seeding at all.

An unset or empty `FC_SEED` is not an error; it is the normal CI path and leaves fast-check's own default seeding untouched.

### Audit violation

The audit test reports the arbitrary's `name`, the counterexample, the predicate's `{safe, reason}` descriptor, and `assertedBy`, then fails. The message must identify which property's precondition is broken, since the audit is one test standing in for several properties.

### Sweep failure

The sweep workflow stops at the first failing seed and prints the replay command for it. It does not continue through remaining seeds: the first counterexample is sufficient to act on, and continuing would bury it in later output. Because the workflow is `workflow_dispatch` only, a failure blocks nothing.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The gate-predicate filter in section B makes the property vacuous | It does not: the property asserts `setGroupedSecret`'s assignment and round-trip, not `checkSecretName`'s verdict. The distinction is recorded in code comments and in steering guidance so a future reader does not "fix" one into the other. |
| Someone later simplifies the section C generator into a `.filter()` on `isSafeSecretName` | Inline comment states the prohibition; steering guidance explains why; the property would still pass, so this is the residual risk this design cannot fully close by testing. |
| A future runtime adds an `Object.prototype` property containing a digit, invalidating the digit lemma | Audit test asserts the premise directly and fails with a clear message. |
| Removing 69 call-site `seed:` options touches 12 files mechanically | The options are textually identical; the full suite is the regression check, and P7 confirms unchanged behavior with `FC_SEED` unset. |
| `setupFilesAfterEnv` loads a module into every test file's context | Measured: full suite passes with identical timing. The hook is a no-op unless `FC_SEED` is set. |
| Fixed audit seed means static coverage | Accepted deliberately: determinism is worth more than incremental draw diversity, and the manual sweep varies the seed when broader sampling is wanted. |

## Traceability

| Requirement | Design section |
|---|---|
| 1 — Fix Instance 1 | B |
| 2 — Fix Instance 2 | C |
| 3 — Deterministic rejection coverage | D |
| 4 — Close the audit | A, E |
| 5 — Global seeding | F |
| 6 — Manual sweep | G |
| 7 — Prevent recurrence | B, C, E (comments); steering update |
| 8 — Verification and release hygiene | Testing Strategy |
| 9 — Test input under fast-check control | H |
