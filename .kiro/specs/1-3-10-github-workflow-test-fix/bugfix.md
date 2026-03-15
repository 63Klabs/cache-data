# Bugfix Requirements Document

## Introduction

The GitHub Actions workflow `.github/workflows/test.yml` fails when running `npm test -- --coverage` on the Node 24 matrix entry. The failure is caused by an incompatibility between the `test-exclude` package (used by `babel-plugin-istanbul` for Jest coverage instrumentation) and Node 24. Specifically, `test-exclude` calls `util.promisify()` on something that is no longer a plain function in Node 24, producing `TypeError: The "original" argument must be of type function`. This causes 127 of 147 test suites to fail — every suite that imports source files requiring coverage instrumentation. The 20 suites that pass are those that don't import source files (e.g., documentation validation, migration property tests that parse files rather than import them).

Node 20 and Node 22 matrix entries pass all tests, including coverage. The project uses Jest 30.2.0 with `--experimental-vm-modules`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the GitHub Actions workflow runs `npm test -- --coverage` on Node 24 THEN the `test-exclude` package throws `TypeError: The "original" argument must be of type function` during Jest's coverage instrumentation pipeline (`babel-plugin-istanbul` → `test-exclude`)

1.2 WHEN Jest attempts to instrument any source file under `src/` for coverage on Node 24 THEN the `ScriptTransformer._instrumentFile` step crashes before the test suite can execute, causing the entire suite to report as FAIL

1.3 WHEN 127 test suites that import source files are run with `--coverage` on Node 24 THEN all 127 suites fail with the same `TypeError`, while 20 suites that do not import source files pass

### Expected Behavior (Correct)

2.1 WHEN the GitHub Actions workflow runs `npm test -- --coverage` on Node 24 THEN the coverage instrumentation pipeline SHALL complete without errors and all test suites SHALL execute

2.2 WHEN Jest attempts to instrument source files under `src/` for coverage on Node 24 THEN `ScriptTransformer._instrumentFile` SHALL successfully instrument the files and the test suites SHALL run to completion

2.3 WHEN all 147 test suites are run with `--coverage` on Node 24 THEN the same suites that pass on Node 20 and Node 22 SHALL also pass on Node 24 (no coverage-related failures)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the GitHub Actions workflow runs `npm test` (without `--coverage`) on Node 20, Node 22, or Node 24 THEN the system SHALL CONTINUE TO execute all test suites successfully

3.2 WHEN the GitHub Actions workflow runs `npm test -- --coverage` on Node 20 or Node 22 THEN the system SHALL CONTINUE TO instrument source files and execute all test suites successfully with coverage reporting

3.3 WHEN the GitHub Actions workflow completes coverage collection on Node 24 THEN the system SHALL CONTINUE TO upload the coverage report artifact to GitHub Actions with 14-day retention

3.4 WHEN `npm test` is run locally on any supported Node version (>=20.0.0) THEN the system SHALL CONTINUE TO execute all test suites successfully without requiring any workflow-specific configuration
