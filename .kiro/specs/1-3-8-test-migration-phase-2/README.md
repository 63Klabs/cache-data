# Test Migration Phase 2

## Overview

This specification covers the migration of Mocha tests to Jest for three critical modules:
- APIRequest.class.js
- dao-endpoint.js
- AWS.classes.js

The migration maintains backwards compatibility, ensures no breaking changes, and runs both test frameworks in parallel during the transition period.

## Migration Status: COMPLETED ✓

All tasks have been completed successfully. Both Mocha and Jest test suites are running in parallel.

## What Was Migrated

### 1. APIRequest.class.js Tests
**Source:** `test/endpoint/api-request-tests.mjs` (Mocha)  
**Target:** `test/endpoint/api-request-tests.jest.mjs` (Jest)

**Test Coverage:**
- Basic GET and POST requests
- Header and parameter passing
- Redirect handling (301, 302, 303, 307)
- Timeout scenarios with mocks
- Request/response formatting
- Connection and ConnectionAuthentication classes
- Error handling and edge cases

**Test Count:** 29 tests migrated + additional coverage tests

### 2. dao-endpoint.js Tests
**Source:** `test/endpoint/endpoint-dao-tests.mjs` (Mocha)  
**Target:** `test/endpoint/endpoint-dao-tests.jest.mjs` (Jest)

**Test Coverage:**
- Connection configuration
- Query parameter merging
- JSON response parsing
- Non-JSON response handling
- Error handling in _call() method
- Timeout scenarios
- Default values (method, protocol)

**Test Count:** 17 tests migrated + additional coverage tests

### 3. AWS.classes.js Tests
**Source:** `test/tools/aws-classes-tests.mjs` (Mocha)  
**Target:** `test/tools/aws-classes-tests.jest.mjs` (Jest)

**Test Coverage:**
- Node.js version detection
- AWS SDK version selection (V3)
- Region configuration
- DynamoDB client operations
- S3 client operations
- SSM client operations
- X-Ray initialization
- Error handling for missing environment variables

**Test Count:** 29 tests migrated

## Configuration Updates

### package.json Scripts
Added new test scripts for convenience:
- `test:endpoint:jest` - Run Jest tests for endpoint module
- `test:tools:jest` - Run Jest tests for tools module

Existing scripts verified:
- `test:jest` - Run all Jest tests
- `test:all` - Run both Mocha and Jest tests

### jest.config.mjs
Enhanced Jest configuration with:
- ESM support for .mjs files
- Test file pattern matching (*.jest.mjs)
- Coverage configuration (separate coverage-jest directory)
- Test timeout settings (30 seconds)
- Mock cleanup between tests
- Verbose output for debugging

### .gitignore
Updated to explicitly ignore:
- `coverage/` - Mocha coverage directory
- `coverage-jest/` - Jest coverage directory
- `.nyc_output/` - NYC coverage tool output

## Test Execution

### Run All Tests (Mocha + Jest)
```bash
npm run test:all
```

### Run Jest Tests Only
```bash
npm run test:jest
```

### Run Specific Module Tests
```bash
# Endpoint tests (Jest)
npm run test:endpoint:jest

# Tools tests (Jest)
npm run test:tools:jest

# Endpoint tests (Mocha)
npm run test:endpoint
```

### Run Migration Validation
```bash
npm run test:migration:validation
```

## Issues Encountered

### 1. Test Execution Equivalence Property Test
**Issue:** The property test for test execution equivalence (`test-execution-equivalence-property-tests.mjs`) was causing infinite loops by executing `npm test` from within a test file.

**Resolution:** The test was excluded from the default test suite and can be run separately with `npm run test:migration:validation`. The test was updated to invoke test runners directly instead of using npm scripts.

### 2. AWS Region Warnings
**Issue:** Tests generate warnings about AWS_REGION not being set.

**Resolution:** This is expected behavior in test environments. The warnings are informational and do not affect test results. The code defaults to 'us-east-1' when AWS_REGION is not set.

### 3. Mock Cleanup
**Issue:** Some tests were not properly cleaning up mocks, causing test pollution.

**Resolution:** Added `afterEach` blocks with `jest.restoreAllMocks()` to all Jest test files to ensure proper cleanup.

## Property-Based Testing

Created property-based tests for migration validation:
- **Property 1:** Test Migration Completeness - Verifies Jest test count equals Mocha test count
- **Property 2:** Test Execution Equivalence - Verifies both frameworks produce same results
- **Property 7:** Source Code Immutability - Verifies source files unchanged
- **Property 11:** Jest File Naming Convention - Verifies .jest.mjs naming pattern
- **Property 12:** Jest File Location Convention - Verifies Jest files in same directory as Mocha files

All property tests are located in `test/migration/property/`.

## Backwards Compatibility

✓ No source code modifications were made during migration  
✓ All existing Mocha tests remain in place and continue to run  
✓ No changes to public APIs or function signatures  
✓ No new production dependencies added  
✓ Both test frameworks pass with identical assertions

## Test Results Summary

### Mocha Tests
- All existing tests pass
- No regressions introduced
- Test suite continues to run as before

### Jest Tests
- All migrated tests pass
- Additional coverage tests added
- Test count matches Mocha tests for each module

### Combined Test Suite
- Both frameworks run in parallel via `npm run test:all`
- No conflicts between test frameworks
- Total execution time: ~2-3 minutes

## Next Steps for Future Phases

### Phase 3: Migrate Remaining Tools Module Tests
- Migrate tests for other classes in `src/lib/tools/`
- Follow same patterns established in Phase 2

### Phase 4: Migrate Cache Module Tests
- Migrate tests for `dao-cache.js`
- Handle complex mocking scenarios for S3 and DynamoDB

### Phase 5: Migrate Configuration and Utility Tests
- Migrate tests for configuration modules
- Migrate tests for utility functions

### Phase 6: Complete Migration
- Remove Mocha dependency
- Update CI/CD to use Jest only
- Archive Mocha test files

## Lessons Learned

1. **Parallel Execution Strategy Works Well:** Running both test frameworks simultaneously provides confidence and catches discrepancies early.

2. **Mock Cleanup is Critical:** Always restore mocks in `afterEach` blocks to prevent test pollution.

3. **Direct Test Runner Invocation:** When tests need to execute other tests, invoke test runners directly (mocha/jest binaries) instead of using npm scripts to avoid infinite loops.

4. **Property-Based Testing for Validation:** Property tests are excellent for validating migration correctness across all modules.

5. **Documentation is Essential:** Clear documentation of what was migrated, issues encountered, and next steps helps future migration phases.

## References

- [Requirements Document](requirements.md)
- [Design Document](design.md)
- [Implementation Tasks](tasks.md)
- [APIRequest Analysis](analysis-2.1-api-request.md)
- [dao-endpoint Analysis](analysis-2.2-dao-endpoint.md)
- [AWS.classes Analysis](analysis-2.3-aws-classes.md)

## Questions and Clarifications

For any questions or clarifications during spec development, see SPEC-QUESTIONS.md in this directory.
