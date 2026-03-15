# GitHub Workflow Test Fix - Bugfix Design

## Overview

The GitHub Actions workflow fails on Node 24 when running `npm test -- --coverage` because Jest's default coverage provider (`babel-plugin-istanbul`) depends on `test-exclude`, which calls `util.promisify()` on something Node 24 no longer considers a plain function. The fix switches Jest's coverage provider from the default Babel/Istanbul pipeline to V8's built-in coverage, bypassing the incompatible dependency chain entirely. This is a workflow/configuration-only change with no source code modifications.

## Glossary

- **Bug_Condition (C)**: Running `npm test -- --coverage` on Node 24 triggers the `babel-plugin-istanbul` → `test-exclude` → `util.promisify()` crash
- **Property (P)**: Coverage collection completes without errors on Node 24 and all test suites execute
- **Preservation**: Coverage collection on Node 20/22 continues to work; non-coverage test runs on all Node versions are unaffected; coverage artifact upload continues to work
- **babel-plugin-istanbul**: Jest's default coverage instrumentation plugin that injects counters into source code via Babel transforms
- **test-exclude**: Dependency of `babel-plugin-istanbul` that determines which files to instrument; the source of the `util.promisify()` crash on Node 24
- **V8 coverage provider**: Alternative coverage provider built into V8 that collects coverage natively without Babel instrumentation; configured via `coverageProvider: 'v8'` in Jest config or `--coverageProvider=v8` CLI flag

## Bug Details

### Bug Condition

The bug manifests when Jest runs with `--coverage` on Node 24. The default coverage provider (`babel`) loads `babel-plugin-istanbul`, which loads `test-exclude`, which calls `util.promisify()` on a value that Node 24 no longer accepts as a plain function. This crashes `ScriptTransformer._instrumentFile` for every source file under `src/`, failing 127 of 147 test suites.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type WorkflowRun { nodeVersion: string, coverageEnabled: boolean, coverageProvider: string }
  OUTPUT: boolean

  RETURN input.nodeVersion >= '24'
         AND input.coverageEnabled = true
         AND input.coverageProvider = 'babel'  // default provider
END FUNCTION
```

### Examples

- Node 24 + `npm test -- --coverage` (default babel provider) → 127/147 suites FAIL with `TypeError: The "original" argument must be of type function` (BUG)
- Node 24 + `npm test` (no coverage) → all suites PASS (no bug, coverage not enabled)
- Node 22 + `npm test -- --coverage` (default babel provider) → all suites PASS (no bug, Node 22 compatible)
- Node 20 + `npm test -- --coverage` (default babel provider) → all suites PASS (no bug, Node 20 compatible)
- Node 24 + `npm test -- --coverage --coverageProvider=v8` → expected to PASS (V8 provider bypasses babel-plugin-istanbul)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `npm test` (without `--coverage`) on Node 20, 22, and 24 must continue to pass all test suites
- `npm test -- --coverage` on Node 20 and 22 must continue to produce coverage reports
- Coverage artifact upload to GitHub Actions with 14-day retention must continue to work
- Local `npm test` on any supported Node version (>=20.0.0) must continue to work without workflow-specific configuration
- The `coverage-jest/` output directory must continue to be used for coverage reports
- Coverage reporters (`text`, `lcov`, `html`) must continue to produce output

**Scope:**
All inputs that do NOT involve running coverage on Node 24 with the default babel provider should be completely unaffected by this fix. This includes:
- Non-coverage test runs on any Node version
- Coverage runs on Node 20 and 22
- Local development workflows
- Any other CI steps (checkout, install, artifact upload)

## Hypothesized Root Cause

Based on the error trace and bug description, the root cause is:

1. **Dependency Incompatibility**: `test-exclude` (loaded by `babel-plugin-istanbul`) calls `util.promisify()` on `glob` or a similar API that changed its export shape in Node 24. Node 24 tightened the type check on `util.promisify()`'s argument, rejecting objects that were previously accepted as functions.

2. **Upstream Not Yet Fixed**: The `test-exclude` package has not released a Node 24-compatible version. Since `babel-plugin-istanbul` is pulled in transitively by Jest's default coverage provider, the project cannot easily pin or override `test-exclude` without also managing the entire babel-plugin-istanbul dependency chain.

3. **V8 Provider Avoids the Issue**: Jest's V8 coverage provider (`coverageProvider: 'v8'`) uses V8's built-in code coverage instead of Babel instrumentation. It does not load `babel-plugin-istanbul` or `test-exclude` at all, completely sidestepping the incompatibility.

## Correctness Properties

Property 1: Bug Condition - Coverage Completes on Node 24

_For any_ workflow run where Node version is 24 and coverage is enabled, the fixed configuration SHALL allow Jest to collect coverage without `TypeError` crashes, and all test suites that pass without coverage SHALL also pass with coverage.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Node-24 Coverage and Non-Coverage Runs

_For any_ workflow run where either (a) coverage is not enabled, or (b) Node version is 20 or 22, the fixed configuration SHALL produce the same test results and coverage output as the original configuration, preserving all existing behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `jest.config.mjs`

**Change**: Add `coverageProvider: 'v8'`

**Specific Changes**:
1. **Add V8 coverage provider**: Add `coverageProvider: 'v8'` to the Jest config object. This tells Jest to use V8's native coverage instead of the default Babel/Istanbul instrumentation pipeline. This applies to all Node versions uniformly, which is simpler and avoids conditional logic.

2. **No workflow file changes needed**: The `.github/workflows/test.yml` does not need modification. The `npm test -- --coverage` command will pick up the `coverageProvider` setting from `jest.config.mjs` automatically.

3. **No package.json changes needed**: No dependency additions, overrides, or script changes are required.

**Rationale for V8 over alternatives**:
- V8 coverage is built into the Node.js runtime — no extra dependencies
- Jest 30.x has mature V8 coverage support
- Applying `coverageProvider: 'v8'` globally (not just Node 24) keeps the config simple and avoids version-conditional logic
- V8 coverage is generally faster than Babel instrumentation since it doesn't require an AST transform pass
- The `transform: {}` setting in the existing config (native ESM, no Babel transforms) makes V8 coverage a natural fit

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, confirm the bug exists on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Confirm the bug exists on the unfixed code before applying the fix.

**Test Plan**: Run `npm test -- --coverage` on Node 24 without the `coverageProvider: 'v8'` setting and observe the `TypeError` failures.

**Test Cases**:
1. **Node 24 Coverage Failure**: Run `npm test -- --coverage` on Node 24 with default config — expect 127+ suite failures with `TypeError: The "original" argument must be of type function` (will fail on unfixed code)
2. **Node 24 No-Coverage Baseline**: Run `npm test` on Node 24 without coverage — expect all suites to pass (confirms the issue is coverage-specific)

**Expected Counterexamples**:
- All test suites that import source files fail with `TypeError` at `node_modules/test-exclude/index.js:5:14`
- Suites that don't import source files (documentation, migration property tests) pass

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed configuration produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := runJestWithV8Coverage(input)
  ASSERT result.allSuitesExecuted = true
  ASSERT result.typeErrors = 0
  ASSERT result.coverageReportGenerated = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed configuration produces the same result as the original configuration.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT runJestFixed(input).passedSuites = runJestOriginal(input).passedSuites
  ASSERT runJestFixed(input).failedSuites = runJestOriginal(input).failedSuites
END FOR
```

**Testing Approach**: Manual verification across the Node version matrix is the primary approach here, since the change is a configuration flag rather than source code logic. Property-based testing is not directly applicable to CI workflow configuration changes.

**Test Plan**: Run the full test suite on Node 20, 22, and 24 with and without coverage after applying the fix.

**Test Cases**:
1. **Node 20 No-Coverage Preservation**: Run `npm test` on Node 20 — verify same pass/fail results as before fix
2. **Node 22 No-Coverage Preservation**: Run `npm test` on Node 22 — verify same pass/fail results as before fix
3. **Node 24 No-Coverage Preservation**: Run `npm test` on Node 24 — verify same pass/fail results as before fix
4. **Node 20 Coverage Preservation**: Run `npm test -- --coverage` on Node 20 — verify coverage report generated and same results
5. **Node 22 Coverage Preservation**: Run `npm test -- --coverage` on Node 22 — verify coverage report generated and same results
6. **Coverage Output Preservation**: Verify `coverage-jest/` directory is populated with `text`, `lcov`, and `html` reports after fix

### Unit Tests

- No unit tests needed — this is a configuration change, not a source code change

### Property-Based Tests

- Not applicable — the fix is a single configuration flag in `jest.config.mjs` with no parameterized logic to test

### Integration Tests

- The GitHub Actions workflow matrix itself serves as the integration test: Node 20, 22, and 24 × {with coverage, without coverage}
- Verify the workflow passes on all matrix entries after the fix is pushed
