# Requirements Document

## Introduction

Two property-based tests in `test/security/parameter-key-safety-tests.jest.mjs` contain fast-check generators whose preconditions are weaker than the acceptance rule the implementation under test actually applies. Each can emit a draw that `ParameterKeySafety` is specified to reject, while the property asserts acceptance. Because fast-check draws a fresh random seed on every run, these failures are invisible on most runs and surface at random — one instance of this same defect class blocked the v1.3.17 release package build after passing on every prior commit run.

This spec fixes the two confirmed instances, closes the audit on the defect class, and makes any future counterexample reproducible by making the whole suite's fast-check seed controllable from one place.

**No `src/` changes are in scope.** `ParameterKeySafety` behaved correctly in every observed case; the defects are entirely in the tests' preconditions. Because `test` and `.kiro` are both excluded by `.npmignore`, this work changes nothing in the published package: no API surface, no runtime behavior, no consumer-visible change. Its value is release-pipeline reliability.

## Verified Findings

The issue report was validated empirically before writing this document rather than taken at face value. A throwaway harness sampled each suspect generator 100,000 times and checked every draw against the implementation's own predicate. Findings that differ from or add to the issue report are called out.

### Both reported instances are real

| # | Location | Property | Violations / 100,000 draws | `numRuns` |
|---|----------|----------|---------------------------:|----------:|
| 1 | line ~395 (`describe` at 325) | `Property: any safe group + secret name round-trips the value` | 2 | 200 |
| 2 | line ~304 (`describe` at 225) | `Property A5: generated Secrets Manager ARNs are accepted` | 2 | 100 |

Observed counterexamples, with the implementation's rejection reason:

- Instance 1: `"+_8@/valueOf"` → `prototype-segment`; `"toString/p"` → `prototype-segment`
- Instance 2: `"arn:aws:secretsmanager:072--:332621208729:secret:/prototype/--16L5H3"` → `dangerous-segment`; `"arn:aws:secretsmanager:07lp:228806069831:secret:/__proto__/P-5BPE4f"` → `dangerous-segment`

Two controls returned zero violations in 100,000 draws each, confirming the measurement discriminates: the already-fixed segment-aware generator at line ~554, and the `isSafeKey` generators whose charset contains no `/`.

> **Note**: Measured rates (~1 in 50,000 for both) differ from the issue's reported figures (1 in 20,000 and 1 in 100,000). At 2 violations per 100,000 draws the sampling error is large, and this measurement used a single fixed sampling seed. The rates are the same order of magnitude; the issue's claim that instance 1 is "roughly 2.5x more likely" than instance 2 is **not** reproduced and should not be relied on. Both are low-rate, both are real, and the remediation is the same either way, so no further rate measurement is required.

### The release risk is understated, not overstated

Combining both instances at their configured `numRuns` gives roughly a 0.6% chance per suite run that at least one emits a violating draw. The CI matrix runs four Node legs, but the `'26'` leg is `continue-on-error` and cannot fail the workflow, so **three** legs can block — about a **1.8% chance per CI run (~1 in 56)** that this defect class blocks a build. The issue's per-leg framing is correct; its 4x multiplier is not.

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

**User Story:** As a maintainer, I want a bounded, repeatable check for this defect shape across the suite, so that closing this issue means the class is actually closed and not just its two known instances.

#### Acceptance Criteria

1. THE audit SHALL enumerate every `fc.assert` call site in `test/` whose generator character class contains a separator character (`/`, `:`, or `.`) and whose property asserts acceptance or successful assignment
2. FOR each enumerated call site, THE audit SHALL record one of: no precondition to violate, precondition already segment-aware, or defect requiring a fix
3. THE audit SHALL verify each enumerated call site empirically by sampling its generator and checking each draw against the relevant acceptance predicate, rather than by inspection alone
4. WHERE the audit finds a defect beyond the two in Requirements 1 and 2, THE defect SHALL be fixed under the same rules: gate-predicate filtering permitted only where the property asserts a downstream behavior, safe-by-construction narrowing required where the property asserts the predicate itself
5. THE audit method SHALL be recorded in the design document in enough detail to be re-run by a future maintainer against a changed suite
6. THE audit SHALL NOT be treated as requiring manual review of all 113 files calling `fc.assert`; the mechanical enumeration in criterion 1 defines its scope

### Requirement 5: Suite-wide reproducible seeding via global configuration

**User Story:** As a maintainer triaging a CI failure, I want to replay the exact run that failed from the seed printed in the log, so that a randomly-timed failure is diagnosable in minutes instead of being unreproducible.

#### Acceptance Criteria

1. THE suite SHALL support setting the fast-check seed for every property test in the run from a single `FC_SEED` environment variable
2. THE mechanism SHALL be a Jest setup module registered via `setupFilesAfterEnv` that calls `fc.configureGlobal({ seed })`, so that no per-call-site edits are required
3. WHEN `FC_SEED` is not set, THE setup module SHALL NOT call `fc.configureGlobal` with a seed, and every property test SHALL retain its current randomized per-run seeding
4. WHEN `FC_SEED` is set to an integer, THE same command SHALL produce identical generated inputs across repeated runs for every property test that does not pass its own `seed`
5. THE 12 existing call-site `seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined` options SHALL be removed, because an explicit `seed: undefined` overrides the global configuration and would exempt those call sites from a seed sweep
6. THE `seed:` option SHALL NOT be added to any additional `fc.assert` call site as part of this spec
7. WHERE a property test legitimately requires a fixed seed independent of `FC_SEED`, THE call site MAY retain an explicit integer `seed`, and the reason SHALL be documented in an inline comment
8. WHEN `FC_SEED` is set to a non-integer or otherwise unparseable value, THE setup module SHALL fail loudly rather than silently falling back to random seeding, so a typo in a sweep configuration cannot produce a run that appears reproducible but is not
9. THE `FC_SEED` usage SHALL be documented for maintainers, including the exact command to replay a reported counterexample

### Requirement 6: Scheduled multi-seed sweep

**User Story:** As a maintainer, I want low-rate precondition violations to surface on a schedule, so that the next one costs a triage ticket instead of a release cycle.

#### Acceptance Criteria

1. THE repository SHALL include a scheduled GitHub Actions workflow that runs the test suite repeatedly, varying `FC_SEED` on each iteration
2. THE sweep SHALL run on a cron schedule and SHALL also be manually triggerable via `workflow_dispatch`
3. THE sweep SHALL NOT run on `push` or `pull_request`, so that it cannot block a merge or a release
4. THE sweep SHALL report the failing `FC_SEED` value in its output in a form directly replayable via Requirement 5's documented command
5. THE sweep SHALL have a job-level `timeout-minutes` and SHALL bound its iteration count, so a hanging or slow iteration cannot consume the runner indefinitely
6. THE sweep's iteration count and schedule SHALL be chosen such that a defect at the rate measured for the instances in this spec (~1 in 50,000 draws) has a meaningful chance of being caught within a release cycle; the design document SHALL state the assumed rate and the resulting detection probability
7. THE sweep workflow SHALL be documented so that a maintainer encountering a sweep failure knows it indicates a test-precondition defect rather than a regression in `src/`

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

## Non-Goals

- Changing any file under `src/`. `ParameterKeySafety` is correct as written; every observed counterexample was correctly rejected.
- Changing `ParameterKeySafety`'s acceptance rules, denylists, or `reason` strings.
- Adding a `seed` option to individual `fc.assert` call sites. Requirement 5 deliberately replaces that approach and removes the 12 existing instances.
- Raising or lowering `numRuns` on existing properties. Rebalancing iteration counts is a separate performance concern.
- A general review of property-test quality or coverage across the suite. The audit is scoped by Requirement 4, criterion 1.
- Reconciling the sampling rates measured here with the issue's reported rates. Both confirm a low-rate real defect; higher precision would not change the remediation.

## Open Questions

1. **Version placement.** `package.json` is at `1.3.17`, but this spec directory is prefixed `1-4-0`, as are four sibling specs. Per `.kiro/steering/spec-naming-convention-from-npm-package.md` the prefix should come from the current `package.json` version. Since the work is test-only and invisible to consumers, it carries no semver weight and could ship with any release. Confirm whether `package.json` should be bumped to `1.4.0` or this spec re-prefixed `1-3-18`.
2. **Sweep budget.** Requirement 6 does not fix a cron frequency or iteration count. The issue notes a 40-seed sweep over a single file finishes in well under a minute locally; a full-suite sweep is substantially more expensive. The design document should set both against available Actions minutes.
3. **Audit boundary.** Requirement 4 scopes enumeration to generators whose charset contains `/`, `:`, or `.`. The general defect class is "precondition weaker than acceptance predicate," which is broader than separator characters. Confirm whether the separator-based bound is acceptable for this spec, or whether the audit should also cover non-`stringMatching` arbitraries such as `fc.string` and `fc.constantFrom` feeding acceptance assertions.
