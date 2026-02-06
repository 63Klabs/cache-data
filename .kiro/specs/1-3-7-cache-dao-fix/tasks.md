# Implementation Plan: Cache DAO Undefined Header Fix

## Overview

This implementation plan addresses a production bug where undefined values are passed to HTTP headers, causing request failures. The fix involves normalizing undefined to null in the getHeader() method, adding defensive validation at header assignment points, setting up Jest for testing, and providing comprehensive test coverage.

## Tasks

- [x] 1. Fix getHeader() method to normalize undefined to null
  - Modify `src/lib/dao-cache.js` Cache.getHeader() method
  - Add conditional to check for undefined values
  - Normalize undefined to null before returning
  - Maintain backwards compatibility for null and valid values
  - _Requirements: 1.3, 2.2, 2.5_

- [x] 1.1 Write property test for getHeader undefined normalization
  - **Property 1: getHeader Undefined Normalization**
  - **Validates: Requirements 1.3, 2.2, 2.5**
  - Generate random Cache instances with undefined header values
  - Verify getHeader() never returns undefined
  - Test with minimum 100 iterations

- [x] 1.2 Write unit tests for getHeader() edge cases
  - Test with undefined value
  - Test with null value
  - Test with missing key
  - Test with valid string value
  - Test with valid number value
  - Test with empty string
  - Test with boolean value
  - Test with object value
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Add defensive validation at header assignment points
  - Modify `src/lib/dao-cache.js` CacheableDataAccess.getData()
  - Store getLastModified() result in variable
  - Add undefined check in addition to null check for if-modified-since
  - Store getETag() result in variable
  - Add undefined check in addition to null check for if-none-match
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [x] 2.1 Write property test for conditional header assignment
  - **Property 3: Conditional Header Assignment**
  - **Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.5**
  - Generate random Cache instances with various header states
  - Verify headers are only assigned when values are valid
  - Test with minimum 100 iterations

- [x] 2.2 Write integration tests for CacheableDataAccess header assignment
  - Test with undefined getLastModified()
  - Test with null getLastModified()
  - Test with valid getLastModified()
  - Test with undefined getETag()
  - Test with null getETag()
  - Test with valid getETag()
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Add optional helper function for header validation
  - Add Cache._isValidHeaderValue() static method to `src/lib/dao-cache.js`
  - Implement validation for string (non-empty) and number (not NaN)
  - Return false for null, undefined, boolean, object, array, empty string
  - Mark as private method with JSDoc @private tag
  - _Requirements: 3.4_

- [x] 3.1 Write property test for header value type validation
  - **Property 2: Header Value Type Validation**
  - **Validates: Requirements 1.4, 1.5**
  - Generate random header values of various types
  - Verify only valid types pass validation
  - Test with minimum 100 iterations

- [x] 3.2 Write unit tests for _isValidHeaderValue() helper
  - Test with null (should return false)
  - Test with undefined (should return false)
  - Test with empty string (should return false)
  - Test with non-empty string (should return true)
  - Test with number (should return true)
  - Test with NaN (should return false)
  - Test with boolean (should return false)
  - Test with object (should return false)
  - Test with array (should return false)

- [x] 4. Set up Jest testing framework
  - Install Jest as dev dependency: `npm install --save-dev jest`
  - Create `jest.config.mjs` with ES module configuration
  - Configure testMatch pattern for `*.jest.mjs` files
  - Configure Jest to exclude Mocha test files
  - Set testEnvironment to 'node'
  - Configure coverage directory as 'coverage-jest'
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 4.1 Add Jest npm scripts to package.json
  - Add `test:jest` script: `node --experimental-vm-modules node_modules/jest/bin/jest.js`
  - Add `test:all` script: `npm test && npm run test:jest`
  - Add `test:cache:jest` script for cache-specific Jest tests
  - Verify Mocha scripts remain unchanged
  - _Requirements: 4.4_

- [x] 4.2 Write Jest integration test for header assignment with AWS mocks
  - Create test file: `test/cache/cache-header-assignment.jest.mjs`
  - Mock DynamoDbCache.read() to return headers with undefined values
  - Test CacheableDataAccess.getData() with mocked cache
  - Verify undefined headers are not assigned to connection
  - Verify valid headers are assigned correctly
  - _Requirements: 5.4, 5.5_

- [x] 5. Update JSDoc documentation
  - Update Cache.getHeader() JSDoc to document null return for undefined
  - Update Cache.getLastModified() JSDoc to clarify return values
  - Update Cache.getETag() JSDoc to clarify return values
  - Add JSDoc for Cache._isValidHeaderValue() with @private tag
  - Ensure all parameter types and return types are accurate
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run Mocha tests: `npm test`
  - Run Jest tests: `npm run test:jest`
  - Run all tests: `npm run test:all`
  - Verify no regressions in existing tests
  - Ensure all new tests pass
  - Ask the user if questions arise

- [x] 6.1 Write property test for valid header passthrough
  - **Property 4: Valid Header Passthrough**
  - **Validates: Requirements 2.4**
  - Generate random Cache instances with valid header values
  - Verify getHeader() returns exact value without modification
  - Test with minimum 100 iterations

- [x] 6.2 Write property test for backwards compatibility
  - **Property 5: Backwards Compatibility for Valid Values**
  - **Validates: Requirements 9.2, 9.3**
  - Generate random Cache instances with valid values
  - Verify behavior matches expected behavior
  - Run existing test suite to verify no regressions
  - Test with minimum 100 iterations

- [x] 7. Create test coverage analysis report
  - Analyze cache-dao public methods
  - Identify untested scenarios
  - Count unit tests needed for complete coverage
  - Count integration tests needed for AWS interactions
  - Count property-based tests needed for core logic
  - Document findings in `.kiro/specs/1-3-7-cache-dao-fix/test-coverage-analysis.md`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Update CHANGELOG.md
  - Add entry under "Unreleased" section
  - Use "Fixed" category for bug fix
  - Include brief description of the undefined header bug
  - Reference spec: `[Spec: 1-3-7-cache-dao-fix](./)`
  - Mention Jest setup as "Added" entry
  - _Requirements: 8.5_

- [x] 9. Final checkpoint - Verify backwards compatibility
  - Run full test suite: `npm run test:all`
  - Verify no changes to public API
  - Verify no changes to exported classes or functions
  - Verify valid header values behave identically
  - Confirm this is a PATCH version change (bug fix only)
  - Ask the user if questions arise
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Jest is added alongside Mocha without removing existing tests
- This is a PATCH version change (1.3.7) - bug fix only, no breaking changes
