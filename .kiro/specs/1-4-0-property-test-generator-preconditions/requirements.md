# Requirements Document

## Introduction

Two property-based tests in `test/security/parameter-key-safety-tests.jest.mjs` contain fast-check generators whose preconditions are weaker than the acceptance rule the implementation under test actually applies. Each can emit a draw that `ParameterKeySafety` is specified to reject, while the property asserts acceptance. Because fast-check draws a fresh random seed on every run, these failures are invisible on most runs and surface at random — one instance of this same defect class blocked the v1.3.17 release package build after passing on every prior commit run.

This spec fixes the two confirmed instances, closes the audit on the defect class, and makes any future counterexample reproducible by making the whole suite's fast-check seed controllable from one place.

**No `src/` changes are in scope.** `ParameterKeySafety` behaved correctly in every observed case; the defects are entirely in the tests' preconditions. Because `test` and `.kiro` are both excluded by `.npmignore`, this work changes nothing in the published package: no API surface, no runtime behavior, no consumer-visible change. Its value is release-pipeline reliability.

This spec targets **v1.4.0**, matching the current `package.json` version.

## Verified Findings

The issue report was validated empirically before writing this document rather than taken at face value. A throwaway harness sampled each suspect generator 100,000 times and checked every draw against the implementation's own predicate. Findings that differ from or add to the issue report are called out.

The rates below were subsequently **remeasured** during task 2.3, at 200,000 draws × 20 sampling seeds (4,000,000 draws) per generator, because sizing the precondition audit's draw budget depends on them. The table carries the remeasured figures; the original single-seed figures and what changed are recorded in the note that follows.

### Both reported instances are real

| # | Location | Property | Measured violation rate | `numRuns` |
|---|----------|----------|------------------------:|----------:|
| 1 | line ~395 (`describe` at 325) | `Property: any safe group + secret name round-trips the value` | ~1 in 49,383 (81 / 4,000,000 draws) | 200 |
| 2 | line ~304 (`describe` at 225) | `Property A5: generated Secrets Manager ARNs are accepted` | ~1 in 666,667 (6 / 4,000,000 draws) | 100 |

Observed counterexamples, with the implementation's rejection reason:

- Instance 1: `"+_8@/valueOf"` → `prototype-segment`; `"toString/p"` → `prototype-segment`
- Instance 2: `"arn:aws:secretsmanager:072--:332621208729:secret:/prototype/--16L5H3"` → `dangerous-segment`; `"arn:aws:secretsmanager:07lp:228806069831:secret:/__proto__/P-5BPE4f"` → `dangerous-segment`

Two controls returned zero violations in 100,000 draws each, confirming the measurement discriminates: the already-fixed segment-aware generator at line ~554, and the `isSafeKey` generators whose charset contains no `/`.

> **Note**: The first measurement reported 2 violations per 100,000 draws for **both** instances (~1 in 50,000 each) from a single fixed sampling seed. At 2 violations the sampling error is large, and for instance 2 that observation turned out to be a low-probability one: remeasured over 40x the data, instance 2 sits at ~1 in 666,667, roughly **13x rarer** than instance 1 and ~13x rarer than first recorded. Instance 1's remeasured rate (~1 in 49,383) matches its original figure closely. Both remain low-rate, both are real, and the remediation is unchanged — but the rates are *not* interchangeable for budget sizing, which is why the audit uses a per-entry draw budget rather than one shared number.
>
> The issue's reported figures (1 in 20,000 and 1 in 100,000) are still not reproduced, but its **directional** claim is: it said instance 1 is "roughly 2.5x more likely" than instance 2, and instance 1 is in fact more likely — by roughly 13x. The direction is reproducible and should be relied on; the 2.5x magnitude should not.

### The release risk is understated, not overstated

Combining both instances at their configured `numRuns` gives roughly a **0.42%** chance per suite run that at least one emits a violating draw (instance 1: 200 draws at ~1 in 49,383 ≈ 0.40%; instance 2: 100 draws at ~1 in 666,667 ≈ 0.015%). The CI matrix runs four Node legs, but the `'26'` leg is `continue-on-error` and cannot fail the workflow, so **three** legs can block — about a **1.25% chance per CI run (~1 in 80)** that this defect class blocks a build. The issue's per-leg framing is correct; its 4x multiplier is not.

> **Note**: These figures replace an earlier **0.6% per suite run / 1.8% per CI run (~1 in 56)**, which assumed both instances shared a ~1-in-50,000 rate. Correcting instance 2 to ~1 in 666,667 lowers the combined estimate by about a third and makes instance 1 responsible for ~96% of the remaining risk. The conclusion does not change: the per-CI-run risk is still well above the issue's framing, and both instances still need fixing.

### Instance 1's violations are not limited to a leading slash

The issue's examples (`"/__proto__"`, `"/prototype"`) all place the reserved key after a leading `/`. The draw `"toString/p"` shows the reserved key can be the **first** segment with no leading slash at all. Any fix must apply the segment rule uniformly across all segments, not special-case a leading separator.

### The separator-charset audit is already effectively closed

A mechanical scan for `fc.stringMatching` arbitraries whose character class contains `/` or `:` found only four call sites in the entire suite, all in `test/security/parameter-key-safety-tests.jest.mjs`: the two instances above, the already-fixed generator at line ~554, and the `normalizePath` differential-oracle generator at line ~161. The oracle generator asserts agreement between two implementations of `normalizePath` and has no safety precondition to violate, so it is benign. The issue's item 2 therefore does not require an open-ended sweep of 113 files.

### The proposed seed fix is counterproductive at scale; a better one is verified

The suite has 638 `fc.assert` call sites across 113 files; 12 files pass a `seed` option. The issue proposes adding `seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined` to the rest. Two facts measured against the installed fast-check 4.10.2:

1. `fc.configureGlobal({ seed })` loaded from a Jest `setupFilesAfterEnv` module **does** reach every `fc.assert` that omits `seed`. Verified end-to-end under Jest ESM: with `FC_SEED=777`, a seed-less `fc.assert` produced byte-identical draws across two separate runs. One setup file plus one `jest.config.mjs` line covers all 638 call sites.
2. An explicit `seed: undefined` at a call site **overrides the global config and restores random seeding.** Verified: with a global seed set, call sites passing `seed: undefined` produced different draws on every run.

So the issue's proposed pattern does not merely add redundant code — replicated across the suite it would make a global seed sweep impossible, and the 12 files already using it are currently immune to one. The per-call-site pattern should be removed in favor of the global, not propagated.

With `FC_SEED` unset, `fc.configureGlobal` is never called and seeding behavior is unchanged, so normal CI runs keep their current randomized coverage.

### A global seed alone will not make the suite replayable: `Math.random` feeds test inputs in four files

`FC_SEED` controls fast-check's PRNG only. Seven call sites across four property-test files call `Math.random()` to build or select the value actually under test, so those tests would remain unreproducible even after Requirement 5 lands:

| File | Lines | What `Math.random` decides |
|------|-------|----------------------------|
| `test/utils/property/prefix-resolution-property-tests.jest.mjs` | 131 | which permutation of names is tested |
| `test/security/parameter-key-safety-tests.jest.mjs` | 888 | which permutation of names is tested |
| `test/security/property/jsdoc-parsing-property-tests.jest.mjs` | 51, 182, 228 | which type wrapper is applied to the input |
| `test/security/property/shell-injection-prevention-property-tests.jest.mjs` | 51, 52 | which shell metacharacter, and where it is inserted |

This is an analytic consequence of `Math.random` being independent of fast-check's generator, not a measured result. It matters because it would make Requirement 5's replay guarantee false for precisely the kind of randomized security test where a rare counterexample is most expensive to lose. It is addressed by Requirement 9.

A further, separable observation: both permutation sites use `sort(() => Math.random() - 0.5)`, an inconsistent comparator. The resulting order is implementation-defined and biased rather than a uniform shuffle. The properties assert permutation invariance, so any permutation is still a valid input and the tests are not wrong — but the idiom explores the permutation space far less evenly than it appears to.

Separately, `Math.random` is also used in three files purely to build unique temp-file and temp-table names. Those uses do not influence any assertion and are out of scope.

## Glossary

- **Precondition violation**: a generated draw that the property's own stated precondition excludes, but which the generator emitted anyway, causing the property body to assert a guarantee the implementation never made for that input
- **Acceptance predicate**: the implementation function that decides whether an input is valid — here `ParameterKeySafety.checkSecretName` / `isSafeSecretName` / `isSafeKey`
- **Segment**: one `/`-delimited component of a secret name; `ParameterKeySafety.checkSecretName` applies its denylists to each non-empty segment in addition to the whole string
- **Whole-string-only filter**: a generator `.filter()` that tests the full generated string against a denylist but not its individual segments — the defect shape at the root of this spec
- **Safe-by-construction generator**: a generator whose output cannot violate the precondition because its alphabet or shape makes a violating value unreachable, as opposed to one that generates broadly and filters
- **Gate predicate**: the acceptance predicate a property uses to *establish* its precondition, as distinct from the behavior the property *asserts*
- **Vacuous property**: a property that filters its input by the same predicate it then asserts, so it can never fail and tests nothing
- **Global seed**: a fast-check seed set once per Jest worker via `fc.configureGlobal`, applying to every `fc.assert` that does not pass its own `seed`
- **Seed sweep**: running the suite repeatedly with a different `FC_SEED` each time, to surface low-rate precondition violations on a schedule instead of during release packaging

## Requirements

### Requirement 1: Fix the `setGroupedSecret` round-trip generator (Instance 1)

**User Story:** As a maintainer, I want the `setGroupedSecret` round-trip property to draw only secret names the implementation is specified to accept, so that it tests assignment behavior instead of randomly rediscovering `checkSecretName`'s segment rule.

The property at line ~395 asserts a *downstream* behavior — that `setGroupedSecret` returns `assigned: true` and the value round-trips. It does not assert the acceptance predicate itself. It may therefore legitimately establish its precondition using the implementation's own gate predicate without becoming vacuous.

#### Acceptance Criteria

1. THE secret-name generator for `Property: any safe group + secret name round-trips the value` SHALL be constrained such that every draw satisfies `ParameterKeySafety.checkSecretName(name).safe === true`
2. THE constraint SHALL apply the reserved-key denylists to every `/`-delimited segment of the generated name, not only to the name as a whole, and SHALL NOT special-case a leading separator
3. WHERE the constraint is expressed as a hand-written mirror of the implementation's segment rule, it SHALL skip empty segments, matching the implementation's `if (seg.length === 0) continue` behavior
4. THE property body SHALL continue to assert `setGroupedSecret`'s assignment and round-trip behavior; it SHALL NOT be weakened into an assertion about `checkSecretName`
5. THE generator's character set SHALL continue to include `/`, `:`, `+`, `=`, `@`, `.`, `_`, and `-`, so the fix does not reduce the punctuation coverage the property provides
6. WHEN the generator is sampled at least 100,000 times, THE number of draws for which `checkSecretName(name).safe === false` SHALL be zero

### Requirement 2: Fix the Property A5 ARN generator (Instance 2)

**User Story:** As a maintainer, I want the generated-ARN acceptance property to keep independently verifying that `isSafeSecretName` accepts well-formed ARNs, so that fixing its precondition does not quietly turn it into a test that cannot fail.

This property asserts `isSafeSecretName(arn) === true` — the acceptance predicate *is* the subject under test. Filtering the generator by that same predicate would make the property vacuous. This is the material difference from Requirement 1 and it constrains the fix.

#### Acceptance Criteria

1. THE secret-name portion of the ARN generator SHALL be made safe by construction, by narrowing the generated alphabet or shape so that no segment can equal a member of `DANGEROUS_KEYS` or `PROTOTYPE_KEYS`
2. THE generator SHALL NOT establish its precondition by filtering on `isSafeSecretName`, `checkSecretName`, or any other form of the predicate the property asserts
3. THE property body SHALL continue to assert `ParameterKeySafety.isSafeSecretName(arn) === true` unchanged
4. THE generator SHALL continue to produce multi-segment secret-name portions containing `/`, so that ARN segment handling remains covered
5. THE generator SHALL continue to produce the ARN punctuation characters `:`, `+`, `=`, `@`, `.`, `_`, and `-` that the property exists to cover
6. WHEN the generator is sampled at least 100,000 times, THE number of draws for which `isSafeSecretName(arn) === false` SHALL be zero
7. THE narrowing SHALL be documented with an inline comment stating why the generator is constructed safe rather than filtered, so a future maintainer does not "simplify" it into a vacuous filter

### Requirement 3: Deterministic coverage of the rejection paths

**User Story:** As a maintainer, I want the segment-rejection behavior covered by deterministic cases, so that it is verified on every run rather than reached only by a rare random draw.

Both fixes remove violating draws from the generators. Without Requirement 3 that would *reduce* coverage: the `dangerous-segment` and `prototype-segment` paths would no longer be exercised at all through these entry points. The v1.3.17 fix established this pattern for `setGroupedSecretMap` with five `it.each` cases; it is extended here.

#### Acceptance Criteria

1. THE suite SHALL include deterministic test cases asserting that `setGroupedSecret` rejects a secret name carrying a reserved `/`-delimited segment, and writes nothing to the store
2. THE deterministic cases SHALL cover both the `dangerous-segment` reason and the `prototype-segment` reason
3. THE deterministic cases SHALL include at least one name where the reserved segment is the first segment with no leading separator (for example `toString/p`), and at least one where it follows a leading separator (for example `/__proto__`)
4. THE deterministic cases SHALL assert the exact `reason` string returned, not merely that the call was rejected
5. WHERE equivalent deterministic coverage for an entry point already exists, Requirement 3 SHALL be satisfied by that existing coverage and SHALL NOT be duplicated
6. THE counterexamples observed during verification SHALL be used as the deterministic case inputs where applicable, so the specific values that caused or could have caused a release block are permanently covered

### Requirement 4: Close the audit on the defect class

**User Story:** As a maintainer, I want a bounded, mechanical, permanently-running check for this defect shape, so that closing this issue means the class stays closed rather than being verified once and left to drift.

Scope is bounded by *predicate*, not by character set. A generator can only violate a precondition if the acceptance predicate applies a rule the generator's filter does not mirror; the characters involved are incidental. Enumerating `src/` acceptance predicates, only the `checkSecretName` / `isSafeSecretName` family applies rules to substructure, and `resolveGroupAndSegments` gates success on segment depth in the same shape. `checkKey` / `isSafeKey` are whole-value only and structurally cannot exhibit the defect.

#### Acceptance Criteria

1. THE audit SHALL cover every property that asserts acceptance or success of a predicate which applies rules to substructure rather than to the whole value
2. THE audited set SHALL include the `checkSecretName` / `isSafeSecretName` family and `resolveGroupAndSegments`, and SHALL NOT be bounded by the generator's character set
3. THE audit SHALL be implemented as a permanent test that samples each audited generator and asserts zero precondition violations, NOT as a one-time manual review
4. THE audit SHALL sample the same arbitrary object the property under test uses, so that it cannot pass against a copy while the real generator drifts
5. THE audit SHALL be deterministic by default, so that it either always passes or always fails and cannot become a new source of randomly-timed release blocks
6. THE audit SHALL report, on failure, the generator name, the counterexample, the predicate's rejection reason, and which property relied on the precondition
7. WHERE the audit relies on a premise about the runtime (such as the character content of `Object.prototype` own-property names), THE premise SHALL itself be asserted so that a runtime change cannot silently weaken a generator
8. WHERE the audit finds a defect beyond the two in Requirements 1 and 2, THE defect SHALL be fixed under the same rules: gate-predicate filtering permitted only where the property asserts a downstream behavior, safe-by-construction narrowing required where the property asserts the predicate itself
9. THE audit SHALL NOT be treated as requiring manual review of all 113 files calling `fc.assert`; criterion 1 defines its scope
10. THE charset grep used during verification MAY be retained as a discovery heuristic for finding new candidates, but SHALL NOT define the audit boundary

### Requirement 5: Suite-wide reproducible seeding via global configuration

**User Story:** As a maintainer triaging a CI failure, I want to replay the exact run that failed from the seed printed in the log, so that a randomly-timed failure is diagnosable in minutes instead of being unreproducible.

#### Acceptance Criteria

1. THE suite SHALL support setting the fast-check seed for every property test in the run from a single `FC_SEED` environment variable
2. THE mechanism SHALL be a Jest setup module registered via `setupFilesAfterEnv` that calls `fc.configureGlobal({ seed })`, so that no per-call-site edits are required
3. WHEN `FC_SEED` is not set, THE setup module SHALL NOT call `fc.configureGlobal` with a seed, and every property test SHALL retain its current randomized per-run seeding
4. WHEN `FC_SEED` is set to an integer, THE same command SHALL produce identical generated inputs across repeated runs for every property test that does not pass its own `seed` and does not draw test input from a source outside fast-check's control (see Requirement 9)
5. THE 69 existing call-site `seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined` options, spread across 12 files, SHALL be removed, because an explicit `seed: undefined` overrides the global configuration and would exempt those call sites from a seed sweep
6. THE `seed:` option SHALL NOT be added to any additional `fc.assert` call site as part of this spec
7. WHERE a property test legitimately requires a fixed seed independent of `FC_SEED`, THE call site MAY retain an explicit integer `seed`, and the reason SHALL be documented in an inline comment
8. WHEN `FC_SEED` is set to a non-integer or otherwise unparseable value, THE setup module SHALL fail loudly rather than silently falling back to random seeding, so a typo in a sweep configuration cannot produce a run that appears reproducible but is not
9. THE `FC_SEED` usage SHALL be documented for maintainers, including the exact command to replay a reported counterexample

### Requirement 6: Manual multi-seed sweep

**User Story:** As a maintainer, I want to be able to sweep many seeds on demand, so that I can widen sampling when I suspect seed-dependent behavior without paying for it continuously.

The sweep is a breadth net, not the primary control for this defect class. Requirement 4's audit covers the known class at far higher sensitivity and far lower cost, so the sweep exists to catch what nobody has enumerated: order effects, timing, genuinely rare defects in `src/`. It is manually triggered only, and therefore has no recurring cost.

#### Acceptance Criteria

1. THE repository SHALL include a GitHub Actions workflow that runs the test suite repeatedly, varying `FC_SEED` on each iteration
2. THE sweep SHALL be triggerable only via `workflow_dispatch`; it SHALL NOT be configured with a `schedule` trigger
3. THE sweep SHALL NOT run on `push` or `pull_request`, so that it cannot block a merge or a release
4. THE sweep SHALL accept the number of seeds, the starting seed, and the audit draw budget as workflow inputs, with documented defaults
5. THE sweep SHALL stop at the first failing seed and report that seed in a form directly replayable via Requirement 5's documented command
6. THE sweep SHALL have a job-level `timeout-minutes` and SHALL bound its iteration count, so a hanging or slow iteration cannot consume the runner indefinitely
7. THE design document SHALL state the sweep's expected detection probability at its default seed count against the defect rate measured in this spec, so its low sensitivity relative to Requirement 4 is explicit rather than implied
8. THE sweep workflow SHALL be documented so that a maintainer encountering a sweep failure knows it most likely indicates a test-precondition defect rather than a regression in `src/`

### Requirement 7: Prevent recurrence

**User Story:** As a maintainer, I want the rule that was violated here written down where the next person writing a property test will see it, so that this defect class does not reappear.

#### Acceptance Criteria

1. THE guidance SHALL state that a generator's precondition must match the acceptance rule of the implementation under test, including any per-segment or per-component rules
2. THE guidance SHALL state the distinction established by Requirements 1 and 2: a property asserting a downstream behavior may filter by the implementation's gate predicate, while a property asserting the gate predicate itself must instead be made safe by construction
3. THE guidance SHALL warn that filtering by the predicate under test produces a vacuous property that can never fail
4. THE guidance SHALL record that an explicit `seed: undefined` at an `fc.assert` call site defeats global seed configuration, and SHALL direct maintainers to omit the `seed` option instead
5. THE guidance SHALL be placed in the existing property-testing guardrails section of `.kiro/steering/test-execution-monitoring.md`, consistent with where seed preservation is already documented, rather than in a new document
6. THE guidance SHALL cite this spec and the v1.3.17 release block as the concrete motivating incident

### Requirement 8: Verification and release hygiene

**User Story:** As a maintainer, I want evidence that the fixes work and that nothing else regressed, so that this spec does not itself become a source of release risk.

#### Acceptance Criteria

1. THE full Jest test suite SHALL pass via `npm test` with no new failures before this spec is considered complete
2. THE fixed generators SHALL each be sampled at least 100,000 times against the relevant acceptance predicate, with zero violations, and the result SHALL be recorded
3. THE suite SHALL be run at a minimum of 40 distinct `FC_SEED` values with no failures, demonstrating both that the fixes hold and that Requirement 5's mechanism works end to end
4. THE verification harness used for sampling SHALL be either removed or placed where Jest's `testMatch` will not collect it, so it does not become part of the default suite
5. WHERE any verification script spawns a child process, it SHALL invoke the Jest binary directly and SHALL NOT invoke `npm test`, per `.kiro/steering/test-execution-monitoring.md`
6. THE `CHANGELOG.md` entry SHALL state that the change is test-only with no effect on the published package
7. THE number of test cases SHALL not decrease as a net effect of this spec; the deterministic cases added under Requirement 3 SHALL compensate for the rejection-path draws removed from the generators

### Requirement 9: Bring test input under fast-check's control

**User Story:** As a maintainer replaying a reported seed, I want every input the property actually tested to be determined by that seed, so that Requirement 5's replay guarantee is true for the whole suite rather than most of it.

#### Acceptance Criteria

1. WHERE a property test uses `Math.random()` to construct or select a value that influences an assertion, THE randomness SHALL be replaced by a fast-check arbitrary so the value is determined by the run's seed
2. THE permutation sites SHALL use a fast-check-controlled shuffle rather than `sort(() => Math.random() - 0.5)`, so that the permutation is both seed-determined and drawn from a well-defined distribution
3. THE metacharacter selection and insertion position in `shell-injection-prevention-property-tests.jest.mjs` SHALL be drawn from fast-check arbitraries
4. THE type-wrapper selection in `jsdoc-parsing-property-tests.jest.mjs` SHALL be drawn from a fast-check arbitrary
5. THE properties' existing assertions and intent SHALL be preserved; this requirement changes how inputs are drawn, not what is asserted
6. `Math.random()` uses that only generate unique temp-file or temp-resource names, and do not influence any assertion, SHALL be left unchanged
7. WHEN `FC_SEED` is set to a fixed integer, THE affected test files SHALL exercise identical inputs across repeated runs, and this SHALL be verified by observation rather than assumed

## Non-Goals

- Changing any file under `src/`. `ParameterKeySafety` is correct as written; every observed counterexample was correctly rejected.
- Changing `ParameterKeySafety`'s acceptance rules, denylists, or `reason` strings.
- Adding a `seed` option to individual `fc.assert` call sites. Requirement 5 deliberately replaces that approach and removes the 12 existing instances.
- Raising or lowering `numRuns` on existing properties. Rebalancing iteration counts is a separate performance concern.
- A general review of property-test quality or coverage across the suite. The audit is scoped by Requirement 4, criterion 1.
- Reconciling the sampling rates measured here with the issue's reported rates. Both confirm a low-rate real defect; higher precision would not change the remediation.

## Open Questions

### 1. Version placement — RESOLVED

`package.json` has been bumped to `1.4.0`; this spec targets v1.4.0 and the directory prefix `1-4-0` is correct. Recorded in the Introduction.

### 2. Controls and sweep budget — RESOLVED

The Goal A / Goal B split is accepted. A deterministic precondition-audit test is the primary control and runs on every push (Requirement 4). The full-suite seed sweep is demoted to a breadth net and is **`workflow_dispatch` only, with no cron trigger** and therefore no recurring Actions cost (Requirement 6).

Rationale, measured during requirements verification and carried into the design: the full suite is 25s parallel / 48s at two workers, while direct sampling of one generator is 0.71s for 500,000 draws. Against instance 1 (~1 in 49,383), a 40-seed sweep costs ~33 minutes of runner time for ~15% detection, while 200,000 draws of direct sampling costs 0.3s for ~98%. Against instance 2 (~1 in 666,667) the same sweep gives under 1%, and 200,000 draws give only ~26% — which is why the audit budgets draws per generator rather than suite-wide. Either way the sweep is the wrong tool for this defect class, and the audit test makes a recurring schedule unnecessary.

### 3. Audit boundary — RESOLVED

The predicate-based boundary is accepted. Requirement 4 is scoped to properties asserting success of a predicate that applies rules to substructure: the `checkSecretName` / `isSafeSecretName` family plus `resolveGroupAndSegments`. The charset grep is retained as a discovery heuristic only.

Rationale: the characters a generator can emit are incidental; what matters is whether the predicate has a rule the filter fails to mirror. `checkSecretName` is the only acceptance predicate in `src/` with a substructure rule, and the whole-value predicates cannot exhibit this defect shape — which the zero-violation control measurement confirms. The boundary is small and was verified rather than assumed.
