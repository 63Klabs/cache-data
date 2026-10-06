# Implementation Plan: Property-Test Generator Preconditions

## Overview

This plan fixes two fast-check generators whose preconditions are weaker than the acceptance rule `ParameterKeySafety` applies, then replaces the one-time audit and per-call-site seed pattern with a deterministic precondition-audit test and a single global seed hook. The implementation language is **JavaScript (Node.js >= 22.0.0)**, matching the existing test suite — no language-selection step is required.

**No `src/` changes.** `ParameterKeySafety` is correct; every observed counterexample was correctly rejected. All work is in `test/`, `jest.config.mjs`, `.github/workflows/`, `.kiro/steering/`, and `CHANGELOG.md`. Because `.npmignore` excludes `test` and `.kiro`, nothing here reaches the published package.

Work proceeds control-first: the shared arbitraries module and the audit test land before the generators are rewired, so that the audit is proven to *detect* the defect before it is used to certify the fix. A control that has never failed is not known to work, and that is the specific mistake this spec exists to correct.

All tests are `*.jest.mjs`, use `expect` / `jest.spyOn`, and run via direct Jest binary invocation (`node --experimental-vm-modules node_modules/jest/bin/jest.js <file>`) per the test-execution-monitoring steering. No test invokes `npm test` or spawns a child process. Neither new non-test module (`test/helpers/parameter-key-arbitraries.mjs`, `test/setup/fast-check-seed.mjs`) matches `testMatch` of `**/test/**/*.jest.mjs`, so neither is collected as a suite.

Baseline before starting: 223 suites, 3,096 passing / 2 skipped, ~25s at full parallelism.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "5.1"] },
    { "id": 1, "tasks": ["1.3", "5.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "5.3", "6", "7.1", "7.2", "7.3"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "4", "7.4"] },
    { "id": 6, "tasks": ["8"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["10"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["11.4"] }
  ]
}
```

Two independent streams. The generator stream (1-4) and the seeding stream (5-7) can proceed in parallel; they converge at tasks 8-11.

```
Generator stream                      Seeding stream
----------------                      --------------
1. Shared arbitraries                 5. Global seed hook
   |                                     |
   +--> 2. Audit test                    +--> 6. Remove 69 call-site seeds
   |       (2.3 proves detection)        |
   |                                     +--> 7. Math.random removal
   +--> 3. Rewire properties                    (7.4 needs 5)
           |
           v
        4. Deterministic rejection coverage

                 both streams
                      |
                      v
         8. Manual sweep workflow  (needs 5 for FC_SEED, 2 for FC_AUDIT_DRAWS)
                      |
                      v
         9. Steering guidance
                      |
                      v
        10. CHANGELOG
                      |
                      v
        11. Final verification  (needs all)
```

| Task | Depends on | Why |
|---|---|---|
| 1 | — | Foundation; defines the arbitraries and registry |
| 2 | 1 | Audit iterates `AUDITED_ARBITRARIES` |
| 3 | 1 | Properties import the shared arbitraries |
| 4 | 3 | Compensates for rejection-path draws that task 3 removes |
| 5 | — | Independent of the generator work |
| 6 | 5 | Removing call-site seeds without a replacement would lose reproducibility outright |
| 7 | 5 (for 7.4 only) | Implementation is independent; the reproducibility check needs the hook |
| 8 | 2, 5 | Workflow drives `FC_SEED` and `FC_AUDIT_DRAWS` |
| 9 | 1, 2, 5 | Guidance documents the mechanisms those tasks establish |
| 10 | 1-9 | Describes completed work |
| 11 | all | Full-suite, sampling, and 40-seed verification |

### Ordering constraint worth preserving

Task 2.3 must run before task 3. The audit is the primary control introduced by this spec, and a control that has never been observed to fail is not known to work. Proving it detects the pre-fix generators, and only then using it to certify the fix, is the whole reason the plan is control-first rather than fix-first.

## Tasks

- [x] 1. Create the shared arbitraries module with the fixed generators
  - Create `test/helpers/parameter-key-arbitraries.mjs`, importing `ParameterKeySafety` from `src/lib/utils/ParameterKeySafety.class.js`
  - This module is the single source of truth: the property tests and the audit test MUST import the same arbitrary objects, so the audit can never pass against a copy while the real generator drifts
  - _Requirements: 1.1, 2.1, 4.4_

  - [x] 1.1 Add `safeSecretName` using a gate-predicate filter
    - `fc.stringMatching(/^[a-zA-Z0-9_.+=@:/-]{1,20}$/).filter(value => ParameterKeySafety.checkSecretName(value).safe)`
    - Call the implementation rather than hand-mirroring its segment rule, so the filter cannot drift when the rule changes
    - Retain the full character set including `/`, `:`, `+`, `=`, `@`, `.`, `_`, `-` so punctuation coverage is not reduced
    - Add the comment explaining that filtering here is a precondition and not a tautology, because the properties that consume it assert `setGroupedSecret` / `setGroupedSecretMap` assignment behavior rather than `checkSecretName`'s verdict
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 1.2 Add `safeSecretNameArn`, safe by construction
    - Build a `secretNameSegment` arbitrary as `fc.tuple(/^[a-zA-Z0-9_.+=@-]{0,8}$/, /^[0-9]$/, /^[a-zA-Z0-9_.+=@-]{0,8}$/)` mapped to concatenation, so every segment carries at least one digit
    - Join 1-4 segments with `/`, with an optionally-prepended leading `/` so the implementation's empty-segment skip path stays covered
    - Compose the full ARN as `arn:aws:secretsmanager:<region>:<accountId>:secret:<name>-<suffix>` using the existing region, account-id, and suffix arbitraries
    - Add the comment stating this is safe by construction and NOT by filtering, why (the consuming property asserts `isSafeSecretName` itself, so filtering would make it vacuous), and an explicit instruction not to "simplify" it into a `.filter()`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.7_

  - [x] 1.3 Add the `AUDITED_ARBITRARIES` registry
    - Export an array of `{ name, arbitrary, predicate, describe, assertedBy }` entries per the design's `AuditedArbitrary` shape, one for `safeSecretName` and one for `safeSecretNameArn`
    - `predicate` returns `checkSecretName(value).safe`; `describe` returns the full `{safe, reason}` descriptor for failure output; `assertedBy` names the consuming property
    - Add the comment stating that registering an arbitrary here is what brings it under audit, so the Requirement 4 boundary is maintained by adding entries rather than by editing the audit test
    - Record that the boundary is the predicate, not the character set, and that this scope does NOT require manual review of all 113 files calling `fc.assert`
    - Add JSDoc including the `@typedef` for the entry shape, per repo documentation standards
    - _Requirements: 4.1, 4.2, 4.4, 4.6, 4.9_

- [x] 2. Add the precondition audit test and prove it detects the defect
  - Create `test/security/property/generator-precondition-audit-tests.jest.mjs`
  - _Requirements: 4.3, 4.5, 4.6, 4.7_

  - [x] 2.1 Implement the audit over the registry
    - Iterate `AUDITED_ARBITRARIES`; for each, sample `FC_AUDIT_DRAWS` draws (default `200000`) via `fc.sample` and assert zero draws fail `predicate`
    - Use sampling seed `FC_SEED` when set, else a fixed constant, so the test is deterministic by default and either always passes or always fails
    - Add the comment recording the budget rationale: 200,000 draws gives ~98% detection of a reintroduced defect at the ~1-in-50,000 rate measured for the original instances, for ~0.3s per arbitrary
    - On violation, report `name`, the counterexample, the `describe` descriptor, and `assertedBy`, so the failure names which property's precondition broke
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Add the digit-lemma premise guard
    - Assert that no member of `DANGEROUS_KEYS` or `PROTOTYPE_KEYS` contains a character in `[0-9]`
    - Add the comment explaining this is the premise that makes `safeSecretNameArn` safe by construction, and that a future runtime adding a digit-bearing `Object.prototype` own property must fail loudly here rather than silently weakening the generator
    - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 3: No reserved key contains a digit`
    - _Requirements: 2.1, 4.7 (Property 3)_

  - [x] 2.3 Verify the audit detects the pre-fix generators
    - Using a scratch script that is NOT committed and NOT matched by `testMatch`, point the audit logic at the pre-fix generator definitions (whole-string-only filter; unfiltered ARN secret-name portion) and confirm it reports non-zero violations
    - Record the observed violation counts and counterexamples, confirming the control fails when it should
    - Delete the scratch script; do not leave the committed suite in a failing state at any point
    - WHERE this step surfaces a precondition defect beyond the two in Requirements 1 and 2, fix it under the same rules: gate-predicate filtering only where the property asserts a downstream behavior, safe-by-construction narrowing where it asserts the predicate itself
    - _Requirements: 4.3, 4.8, 8.4, 8.5_

- [x] 3. Rewire the parameter-key-safety properties onto the shared arbitraries
  - [x] 3.1 Fix `Property: any safe group + secret name round-trips the value` (line ~388)
    - Replace the inline whole-string-only filtered secret-name arbitrary with the imported `safeSecretName`
    - Leave the property body asserting `setGroupedSecret`'s `assigned: true`, group enumerability, and value round-trip; do NOT weaken it into an assertion about `checkSecretName`
    - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 1: Gate-filtered secret names are always accepted`
    - _Requirements: 1.1, 1.4 (Property 1)_

  - [x] 3.2 Fix `Property A5: generated Secrets Manager ARNs are accepted` (line ~300)
    - Replace the inline ARN generator's unfiltered secret-name portion with the imported `safeSecretNameArn`
    - Leave the property body asserting `ParameterKeySafety.isSafeSecretName(arn) === true` unchanged
    - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 2: Constructed ARNs are always accepted`
    - _Requirements: 2.1, 2.3 (Property 2)_

  - [x] 3.3 Converge the already-fixed `setGroupedSecretMap` property (line ~536) onto the shared arbitrary
    - Replace its hand-written segment-aware filter with the imported `safeSecretName`, so one definition serves both round-trip properties
    - Rationale to record in the commit/comment: the v1.3.17 hand-mirror is correct only until the implementation grows a rule the mirror does not know about; calling the implementation removes that drift risk
    - Preserve the existing explanatory comment's intent about why the segment rule matters
    - _Requirements: 1.1, 1.2, 7.1_

  - [x] 3.4 Run the file and the audit, and confirm both pass
    - `node --experimental-vm-modules node_modules/jest/bin/jest.js test/security/parameter-key-safety-tests.jest.mjs`
    - `node --experimental-vm-modules node_modules/jest/bin/jest.js test/security/property/generator-precondition-audit-tests.jest.mjs`
    - _Requirements: 1.6, 2.6_

- [x] 4. Add deterministic coverage of the `setGroupedSecret` rejection paths
  - Add an `it.each` block over `setGroupedSecret` mirroring the existing `setGroupedSecretMap` block, covering: `toString/p` → `prototype-segment`, `+_8@/valueOf` → `prototype-segment`, `/__proto__` → `dangerous-segment`, `myapp/__proto__/db` → `dangerous-segment`, `myapp/constructor` → `dangerous-segment`, `/hasOwnProperty` → `prototype-segment`
  - Assert the exact `reason` string and that nothing was written to the store
  - Include `toString/p` and `+_8@/valueOf` specifically: both are counterexamples observed during verification, and `toString/p` is the first-segment-without-leading-separator shape the original issue report missed
  - Add the comment explaining these cases compensate for the rejection-path draws that Task 3 removed from the generators, so net coverage does not decrease
  - Do NOT duplicate the equivalent `setGroupedSecretMap` coverage, which already exists
  - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 5: Reserved segments are rejected with an exact reason`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 (Property 5)_

- [x] 5. Add the global fast-check seed hook
  - [x] 5.1 Create `test/setup/fast-check-seed.mjs`
    - Read `FC_SEED`; when set and non-empty, parse it and call `fc.configureGlobal({ seed })`
    - Throw on a non-integer value with a message naming the received value; do NOT fall back to random seeding, because a run that reports a seed it did not use is worse than no seeding
    - Treat unset or empty `FC_SEED` as the normal path: do not call `fc.configureGlobal` at all, leaving current behavior untouched
    - _Requirements: 5.1, 5.2, 5.3, 5.8_

  - [x] 5.2 Register the hook in `jest.config.mjs`
    - Add `setupFilesAfterEnv: ['<rootDir>/test/setup/fast-check-seed.mjs']`
    - Use `setupFilesAfterEnv`, not `setupFiles`: a global configured in `setupFiles` runs in a module registry the test files do not share and does not reach `fc.assert`
    - _Requirements: 5.2_

  - [x] 5.3 Verify the hook's three behaviors
    - Full suite with `FC_SEED` unset passes with timing unchanged from baseline
    - Full suite with `FC_SEED` set to an integer passes
    - A run with `FC_SEED=notanumber` fails loudly with the guard's message rather than degrading to random
    - Tag the negative case `// Feature: 1-4-0-property-test-generator-preconditions, Property 8: An invalid seed fails the run`
    - _Requirements: 5.3, 5.4, 5.8 (Properties 7, 8)_

- [x] 6. Remove the call-site `seed` options
  - Remove all 69 `seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined` options across the 12 files that carry them (`test/response/` ×4, `test/powertools/property/` ×5, `test/security/parameter-key-safety-tests.jest.mjs`, `test/utils/` ×2)
  - This is the load-bearing step for Requirement 5: an explicit `seed: undefined` overrides the global configuration, so left in place these 12 files would be the only ones a sweep could not reach
  - Where removing the option empties the `fc.assert` options object, remove the now-redundant object rather than leaving `{}`
  - Do NOT add a `seed` option to any other call site
  - Confirm no `seed:` options remain except any deliberately-fixed integer seeds, which must carry an inline comment giving the reason
  - _Requirements: 5.5, 5.6, 5.7_

- [x] 7. Bring remaining test input under fast-check's control
  - [x] 7.1 Seed-drive the two permutation sites
    - In `test/utils/property/prefix-resolution-property-tests.jest.mjs` (line ~131) and `test/security/parameter-key-safety-tests.jest.mjs` (line ~888), replace `names.slice().sort(() => Math.random() - 0.5)` with a `.chain()` that draws `fc.shuffledSubarray(names, { minLength: names.length, maxLength: names.length })`
    - Add the comment noting the replaced idiom was both unseeded and an inconsistent comparator, so the previous order was implementation-defined and biased rather than a uniform shuffle
    - Keep the permutation-invariance assertions unchanged
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 7.2 Seed-drive metacharacter selection and insertion position
    - In `test/security/property/shell-injection-prevention-property-tests.jest.mjs` (lines ~51-52), draw the metacharacter with `fc.constantFrom(...)` and the position with `fc.nat({ max: str.length })` via `.chain()`, so the position is drawn exactly within bounds rather than derived by modulo
    - Keep the `execFile`-literalness assertions unchanged
    - _Requirements: 9.1, 9.3, 9.5_

  - [x] 7.3 Seed-drive JSDoc type-wrapper selection
    - In `test/security/property/jsdoc-parsing-property-tests.jest.mjs` (lines ~51, ~182, ~228), draw an array of wrapper *indices* and use them in the nesting loop
    - Indices rather than prebuilt strings: each wrapper embeds the type built by the previous iteration, so the choice cannot be precomputed
    - Keep the parsing assertions unchanged
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 7.4 Confirm the remaining `Math.random` uses are benign and verify reproducibility
    - Leave the three uses that only build unique temp-file and temp-directory names; confirm by inspection that none influences an assertion
    - With `FC_SEED` fixed, run each of the four modified files twice and confirm identical inputs are exercised
    - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 6: A fixed seed reproduces inputs`
    - _Requirements: 9.6, 9.7 (Property 6)_

- [x] 8. Add the manual seed sweep workflow
  - Create `.github/workflows/property-seed-sweep.yml` with a `workflow_dispatch` trigger only — no `schedule`, no `push`, no `pull_request`
  - Inputs: `seed_count` (default 50, clamped to a documented maximum), `start_seed` (default 1), `audit_draws` (forwarded as `FC_AUDIT_DRAWS`)
  - Run the suite sequentially per seed in a single job; stop at the first failure and print the replay command for the failing seed
  - Set job-level `timeout-minutes` and bound the loop by `seed_count`
  - Sequential in one job rather than a matrix: a matrix pays install overhead per leg for no wall-clock benefit at this cadence
  - Add a header comment stating the expected detection probability (~9.5% for a 1-in-50,000 defect on a `numRuns: 200` assert at 50 seeds), that this is deliberately low because the Task 2 audit covers the known class at ~98% per push, and that a sweep failure most likely indicates a test-precondition defect rather than a `src/` regression
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 9. Extend the property-testing guardrails in steering
  - Update the "Property-Based Testing Specific Guardrails" section of `.kiro/steering/test-execution-monitoring.md`
  - State that a generator's precondition must match the acceptance rule of the implementation under test, including per-segment and per-component rules
  - State the gate-predicate distinction: a property asserting a *downstream* behavior may filter by the implementation's predicate; a property asserting the *predicate itself* must be made safe by construction
  - Warn that filtering by the predicate under test produces a vacuous property that can never fail
  - Replace the existing per-call-site seed guidance with the global `FC_SEED` hook, and record that an explicit `seed: undefined` defeats global configuration so the `seed` option should simply be omitted
  - Document the `FC_SEED` replay command and the `FC_AUDIT_DRAWS` budget knob
  - Record the charset grep (`fc.stringMatching` arbitraries whose character class contains a separator) as a discovery heuristic for finding new candidates, while stating plainly that the audit boundary is the predicate rather than the character set
  - Cite this spec and the v1.3.17 release block as the motivating incident
  - _Requirements: 4.10, 5.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 10. Update `CHANGELOG.md`
  - Add the v1.4.0 entry under `### Fixed` describing the generator precondition fixes, and under `### Changed` the global seed mechanism
  - State explicitly that the change is test-only with no effect on the published package, since `.npmignore` excludes `test` and `.kiro`
  - _Requirements: 8.6_

- [x] 11. Final verification
  - [x] 11.1 Run the full suite and compare against baseline
    - `npm test` — expect all suites passing, with net test count not lower than the 3,096 baseline given Task 4's additions
    - _Requirements: 8.1, 8.7_

  - [x] 11.2 Sample each fixed arbitrary at 500,000 draws
    - Confirm zero precondition violations for both `safeSecretName` and `safeSecretNameArn`; record the results
    - Confirm separator and punctuation coverage has not regressed (design baseline: `/` present in ~42% of `safeSecretName` draws and ~87% of ARN secret-name portions; each of `+ = @ . _` in ~82% of ARN portions)
    - Use a harness that is removed afterwards or placed where `testMatch` will not collect it
    - Tag `// Feature: 1-4-0-property-test-generator-preconditions, Property 9: Coverage is not reduced`
    - _Requirements: 8.2, 8.4 (Properties 1, 2, 9)_

  - [x] 11.3 Run the suite across 40 distinct `FC_SEED` values
    - Expect 40 passes, demonstrating both that the fixes hold and that the global seed mechanism works end to end
    - Invoke the Jest binary directly in the loop; do NOT invoke `npm test` from any script that itself runs under Jest
    - _Requirements: 8.3, 8.5_

  - [x] 11.4 Confirm cleanup and documentation hygiene
    - No scratch or verification files remain in the working tree
    - No new file matching `testMatch` was added unintentionally
    - Steering, CHANGELOG, and the `FC_SEED` replay documentation are consistent with the implemented behavior
    - _Requirements: 8.4, 8.6_

## Notes

### Scope boundaries

- **No `src/` changes.** `ParameterKeySafety` correctly rejected every observed counterexample. If implementation work appears necessary during execution, stop and re-examine the assumption rather than editing `src/`.
- **No `numRuns` changes.** Rebalancing iteration counts is a separate performance concern and is explicitly out of scope.
- **No new `seed` options.** Task 6 removes them; adding any back defeats the global hook.

### Known residual risk

Task 1.2's generator is safe by construction, and nothing mechanically prevents a future maintainer from "simplifying" it into a `.filter()` on `isSafeSecretName`. The property would still pass — silently vacuous. The inline comment and the task 9 steering entry are the only guards. This is recorded as residual in the design rather than claimed as mitigated.

### Measurements carried in from design validation

Available as expected values during execution; all were measured before the plan was written.

| Check | Expected |
|---|---|
| `safeSecretName`, 500,000 draws | 0 violations; ~42% contain `/` |
| `safeSecretNameArn`, 500,000 draws | 0 violations; ~75% multi-segment; `/` in ~87%; `+ = @ . _` each in ~82% |
| `secretNameSegment`, 500,000 draws | 0 segments equal to a reserved key |
| Reserved-key enumeration | 13 names, all matching `^[A-Za-z_]+$` |
| Full suite with hook, `FC_SEED` unset | 223 suites, 3,096 passing, ~25s — unchanged |
| `FC_SEED=notanumber` | "Test suite failed to run" plus the guard's message |
| `fc.shuffledSubarray` full permutation, 20,000 draws | length and multiset preserved in all draws; deterministic per seed |

### Process guardrails

Per `.kiro/steering/test-execution-monitoring.md`: check for stray `jest` processes before timing runs, invoke the Jest binary directly rather than `npm test` from any script that itself runs under Jest, and delete scratch harnesses (tasks 2.3, 11.2) so they are never collected by `testMatch`.

The committed suite must never be left failing. Task 2.3 deliberately observes a failure, but only via an uncommitted scratch script.

