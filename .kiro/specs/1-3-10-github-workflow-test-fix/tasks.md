# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Node 24 Coverage Crash with Default Babel Provider
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: The bug is deterministic - scope the property to the concrete failing case: running Jest with `--coverage` using the default `babel` provider on Node >= 24
  - **Manual verification test**: Run `npm test -- --coverage` on Node 24 with the current `jest.config.mjs` (no `coverageProvider` setting)
  - Expected: 127+ test suites fail with `TypeError: The "original" argument must be of type function` at `node_modules/test-exclude/index.js:5:14`
  - Confirm that `npm test` (without `--coverage`) passes all suites on Node 24 (isolates the bug to coverage instrumentation)
  - Document counterexamples: all suites importing `src/` files crash in `ScriptTransformer._instrumentFile`; suites not importing source files (migration, documentation, security) pass
  - Mark task complete when the bug is confirmed and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Coverage and Non-Node-24 Coverage Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **Manual verification**: Run the following on UNFIXED code and record results:
  - Observe: `npm test` on Node 20 → all suites pass
  - Observe: `npm test` on Node 22 → all suites pass
  - Observe: `npm test` on Node 24 (no coverage) → all suites pass
  - Observe: `npm test -- --coverage` on Node 20 → all suites pass, `coverage-jest/` populated with `text`, `lcov`, `html` reports
  - Observe: `npm test -- --coverage` on Node 22 → all suites pass, `coverage-jest/` populated
  - Record pass/fail counts for each combination as the preservation baseline
  - Verify these observations PASS on UNFIXED code (confirms baseline behavior to preserve)
  - Mark task complete when baseline observations are documented
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for Node 24 coverage crash

  - [x] 3.1 Implement the fix
    - Add `coverageProvider: 'v8'` to the config object in `jest.config.mjs`
    - Place it in the coverage configuration section, before `coverageDirectory`
    - No changes to `.github/workflows/test.yml`
    - No changes to `package.json`
    - _Bug_Condition: isBugCondition(input) where input.nodeVersion >= '24' AND input.coverageEnabled = true AND input.coverageProvider = 'babel' (default)_
    - _Expected_Behavior: Jest collects coverage without TypeError crashes on Node 24; all suites that pass without coverage also pass with coverage_
    - _Preservation: Non-coverage runs on all Node versions unaffected; coverage runs on Node 20/22 continue to work; coverage-jest/ output directory and reporters (text, lcov, html) unchanged_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Node 24 Coverage Completes Successfully
    - **IMPORTANT**: Re-run the SAME manual test from task 1 - do NOT write a new test
    - Run `npm test -- --coverage` on Node 24 with the fixed `jest.config.mjs`
    - **EXPECTED OUTCOME**: All test suites pass, no `TypeError` crashes, coverage report generated in `coverage-jest/`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Coverage and Non-Node-24 Coverage Behavior
    - **IMPORTANT**: Re-run the SAME manual tests from task 2 - do NOT write new tests
    - Run `npm test` on Node 20, 22, 24 → all suites pass (same counts as baseline)
    - Run `npm test -- --coverage` on Node 20, 22 → all suites pass, coverage reports generated (same counts as baseline)
    - **EXPECTED OUTCOME**: All results match the baseline observations from task 2
    - Confirm no regressions introduced by the fix

- [x] 4. Checkpoint - Ensure all tests pass
  - Push the fix and verify the GitHub Actions workflow passes on all matrix entries: Node 20, 22, 24 × {with coverage, without coverage}
  - Ensure coverage artifact upload succeeds for Node 24
  - Ensure all tests pass, ask the user if questions arise
