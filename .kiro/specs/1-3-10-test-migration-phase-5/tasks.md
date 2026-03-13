# Implementation Plan: Test Migration Phase 5

## Overview

This implementation plan covers the migration of Mocha tests to Jest for response-related classes and utility modules in the @63klabs/cache-data package. The migration creates equivalent Jest tests while maintaining existing Mocha tests, ensuring both test suites pass in CI/CD.

**Key Principles**:
- Do NOT modify or delete existing Mocha test files
- All new tests use Jest (*.jest.mjs files)
- Both test suites must pass
- Property-based tests use fast-check with 100+ iterations
- Tests must be deterministic and follow test-execution-monitoring.md guidelines

## Tasks

- [ ] 1. Migrate Generic Response Module Tests
  - [x] 1.1 Create generic-response-json-tests.jest.mjs
    - Create test/response/generic-response-json-tests.jest.mjs
    - Import from @jest/globals (describe, it, expect)
    - Test response() function for all status codes (200, 400, 401, 403, 404, 405, 408, 418, 427, 500)
    - Verify statusCode, headers, and body structure for each response
    - Test contentType property matches 'application/json'
    - Test default behavior for invalid status codes (should return response500)
    - Use expect().toBe() for primitive equality
    - Use expect().toEqual() for object equality
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 1.9, 1.10_
  
  - [x] 1.2 Create generic-response-html-tests.jest.mjs
    - Create test/response/generic-response-html-tests.jest.mjs
    - Import from @jest/globals
    - Test response() function for all status codes
    - Verify statusCode, headers, and body structure
    - Test contentType property matches 'text/html'
    - Test default behavior for invalid status codes
    - _Requirements: 1.2, 1.6, 1.7, 1.8, 1.9, 1.10_
  
  - [x] 1.3 Create generic-response-text-tests.jest.mjs
    - Create test/response/generic-response-text-tests.jest.mjs
    - Import from @jest/globals
    - Test response() function for all status codes
    - Verify statusCode, headers, and body structure
    - Test contentType property matches 'text/plain'
    - Test default behavior for invalid status codes
    - _Requirements: 1.3, 1.6, 1.7, 1.8, 1.9, 1.10_
  
  - [x] 1.4 Create generic-response-xml-tests.jest.mjs
    - Create test/response/generic-response-xml-tests.jest.mjs
    - Import from @jest/globals
    - Test response() function for all status codes
    - Verify statusCode, headers, and body structure
    - Test contentType property matches 'application/xml'
    - Test default behavior for invalid status codes
    - _Requirements: 1.4, 1.6, 1.7, 1.8, 1.9, 1.10_
  
  - [x] 1.5 Create generic-response-rss-tests.jest.mjs
    - Create test/response/generic-response-rss-tests.jest.mjs
    - Import from @jest/globals
    - Test response() function for all status codes
    - Verify statusCode, headers, and body structure
    - Test contentType property matches 'application/rss+xml'
    - Test default behavior for invalid status codes
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 2. Migrate ImmutableObject Class Tests
  - [x] 2.1 Create ImmutableObject-unit-tests.jest.mjs
    - Create test/utils/ImmutableObject-unit-tests.jest.mjs
    - Import from @jest/globals (describe, it, expect, beforeEach, afterEach)
    - Test get() returns a copy not a reference
    - Test modifying returned values does not affect internal state
    - Test finalize() locks the object preventing further changes
    - Test get(key) returns copy of nested value by key
    - Test toObject() returns complete copy of internal data
    - Test null and undefined handling
    - Test empty objects and arrays
    - Use afterEach() with jest.restoreAllMocks()
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 2.2 Create ImmutableObject-property-tests.jest.mjs
    - Create test/utils/ImmutableObject-property-tests.jest.mjs
    - Import from @jest/globals and fast-check
    - **Property 3: Defensive copy immutability** - Verify modifying returned values does not affect internal state across arbitrary inputs
    - **Property 4: Output compatibility with JSON pattern** - Verify structuredClone output matches JSON.parse(JSON.stringify()) output
    - **Property 5: Deep clone reference breaking** - Verify references are broken at all nesting levels
    - Use fc.assert with numRuns: 100
    - Use seed from process.env.FC_SEED for reproducibility
    - Tag each property test with property number and requirements
    - _Requirements: 2.2, 2.8, 2.9, 2.10_

- [x] 3. Migrate Response Class Tests
  - [x] 3.1 Create response-tests.jest.mjs
    - Create test/response/response-tests.jest.mjs
    - Import from @jest/globals (describe, it, expect, jest, beforeEach, afterEach)
    - Test init() configures static class properties correctly
    - Test constructor creates instance with correct initial state
    - Test set() updates statusCode, headers, and body correctly
    - Test addHeader() adds individual headers without replacing existing headers
    - Test addToJsonBody() merges objects into JSON body
    - Test finalize() calculates correct Cache-Control and Expires headers
    - Test finalize() applies error expiration time for error status codes
    - Test finalize() applies route expiration time for success status codes
    - Test inspectContentType() detects content type from response structure
    - Test getGenericResponses() returns correct generic response module for content type
    - Test finalize() logs response with sanitized sensitive data
    - Use jest.spyOn() for mocking console.log
    - Use afterEach() with jest.restoreAllMocks()
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 4. Migrate ResponseDataModel Class Tests
  - [x] 4.1 Create ResponseDataModel-property-tests.jest.mjs
    - Create test/response/ResponseDataModel-property-tests.jest.mjs
    - Import from @jest/globals and fast-check
    - Test getResponseData() returns defensive copy not reference
    - Test addItem() adds items to array structure correctly
    - Test addItemByKey() adds items by key correctly
    - Test duplicate keys convert single value to array
    - Test toObject() returns data wrapped with label as key
    - Test toString() returns valid JSON string
    - Test nested ResponseDataModel instances are handled correctly
    - Test null and undefined values are handled gracefully
    - Test empty objects and arrays are handled as placeholders
    - **Property 3: Defensive copy immutability** - Verify modifying returned data does not affect internal state
    - **Property 4: Output compatibility with JSON pattern** - Verify output matches JSON pattern
    - Use fc.assert with numRuns: 100
    - Use seed from process.env.FC_SEED for reproducibility
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_

- [x] 5. Migrate Utils Module Tests
  - [x] 5.1 Create hash-data-tests.jest.mjs
    - Create test/utils/hash-data-tests.jest.mjs
    - Import from @jest/globals
    - Test hashThisData() produces consistent hashes for same input
    - Test hashThisData() produces different hashes for different inputs
    - Test hashThisData() handles null and undefined inputs
    - Test hashThisData() handles empty objects and arrays
    - Test hashThisData() handles nested objects
    - Test hashThisData() with different hash algorithms (SHA256, MD5)
    - _Requirements: 5.1, 5.5, 5.6_
  
  - [x] 5.2 Create safeClone-tests.jest.mjs
    - Create test/utils/safeClone-tests.jest.mjs
    - Import from @jest/globals
    - Test safeClone() creates deep copy breaking all references
    - Test safeClone() handles circular references gracefully
    - Test safeClone() handles Promises without cloning them
    - Test safeClone() handles null and undefined
    - Test safeClone() handles empty objects and arrays
    - Test safeClone() handles nested objects at multiple levels
    - _Requirements: 5.2, 5.7, 5.8, 5.9_
  
  - [x] 5.3 Create sanitize-obfuscate-tests.jest.mjs
    - Create test/utils/sanitize-obfuscate-tests.jest.mjs
    - Import from @jest/globals
    - Test sanitize() obfuscates sensitive data in objects
    - Test sanitize() handles nested objects and arrays
    - Test sanitize() preserves non-sensitive data
    - Test obfuscate() masks strings leaving only specified characters visible
    - Test obfuscate() handles empty strings
    - Test obfuscate() handles short strings
    - _Requirements: 5.3, 5.10, 5.11, 5.12_
  
  - [x] 5.4 Create utils-property-tests.jest.mjs
    - Create test/utils/utils-property-tests.jest.mjs
    - Import from @jest/globals and fast-check
    - **Property 6: Hash function determinism** - Verify hashThisData() produces same hash for same input
    - **Property 7: Hash function collision resistance** - Verify hashThisData() produces different hashes for different inputs
    - **Property 8: Hash data cloning isolation** - Verify hashThisData() does not modify original input
    - **Property 4: Output compatibility with JSON pattern** - Verify hash input cloning matches JSON pattern
    - Use fc.assert with numRuns: 100
    - Use seed from process.env.FC_SEED for reproducibility
    - _Requirements: 5.4, 5.13, 5.14_

- [x] 6. Create Vars Module Tests
  - [x] 6.1 Create vars-tests.jest.mjs (new tests, no Mocha equivalent)
    - Create test/utils/vars-tests.jest.mjs
    - Import from @jest/globals
    - Test nodeVer exports valid version string in format "0.0.0"
    - Test nodeVerMajor exports integer representing major version
    - Test nodeVerMinor exports integer representing minor version
    - Test nodeVerMajorMinor exports string in format "0.0"
    - Test all exported values match AWS.NODE_VER properties
    - Test version values are consistent with process.version
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 7. Verify Test Equivalence and Coverage
  - [x] 7.1 Compare test counts between Mocha and Jest
    - Count test cases in each Mocha test file
    - Count test cases in corresponding Jest test file
    - Verify Jest tests cover all Mocha test cases
    - Document any differences in test coverage
    - _Requirements: 7.1, 7.2, 7.3, 8.6_
  
  - [x] 7.2 Verify all exported functions have tests
    - Review src/lib/tools/index.js for exported functions
    - Verify each exported function has at least one test
    - Identify any functions without tests
    - Create tests for uncovered functions
    - _Requirements: 7.3, 7.4_
  
  - [x] 7.3 Verify error conditions are tested
    - Review each function for error conditions
    - Verify error conditions have tests
    - Test error messages are correct
    - Test error types are correct
    - _Requirements: 7.5_
  
  - [x] 7.4 Verify edge cases are tested
    - Identify edge cases for each function (null, undefined, empty, boundary values)
    - Verify edge cases have tests
    - Add tests for missing edge cases
    - Document edge cases in test comments
    - _Requirements: 7.6, 7.7_

- [x] 8. Checkpoint - Run all tests and verify both suites pass
  - Run npm test (Mocha tests)
  - Run npm run test:jest (Jest tests)
  - Run npm run test:all (both test suites)
  - Verify all tests pass with zero failures
  - Verify no test warnings or errors
  - Check test execution time is reasonable
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Validate Test Quality and Documentation
  - [x] 9.1 Verify Jest testing patterns are followed
    - Check all Jest tests use @jest/globals imports
    - Verify expect().toBe() used for primitive equality
    - Verify expect().toEqual() used for object equality
    - Verify expect().toThrow() used for error assertions
    - Verify jest.fn() used for mock functions (not Sinon)
    - Verify jest.spyOn() used for spying on methods (not Sinon)
    - Verify afterEach() with jest.restoreAllMocks() in all test files
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  
  - [x] 9.2 Verify property-based tests follow patterns
    - Check all property tests use fast-check
    - Verify numRuns is set to 100 or higher
    - Verify seed is configurable via process.env.FC_SEED
    - Verify property tests are tagged with property number
    - Verify property tests reference requirements
    - _Requirements: 9.8, 10.1, 10.2, 10.3, 10.4_
  
  - [x] 9.3 Verify test documentation is complete
    - Check all test files have descriptive comments explaining module being tested
    - Verify test names follow pattern "should [expected behavior] when [condition]"
    - Verify test coverage gaps are documented
    - Verify complex test setup has explanatory comments
    - Verify property tests document which property is being tested
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_
  
  - [x] 9.4 Verify test file naming and placement
    - Check all Jest test files use .jest.mjs extension
    - Verify Jest test files are in same directories as Mocha test files
    - Verify test file names match module names
    - _Requirements: 9.9, 9.10_

- [x] 10. CI/CD Integration Validation
  - [x] 10.1 Verify CI/CD pipeline configuration
    - Check that npm run test:all is used in CI/CD
    - Verify both Mocha and Jest tests run in CI/CD
    - Verify test failures block deployment
    - Check test execution timeout is reasonable
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [x] 10.2 Verify test execution safety
    - Check tests do not create infinite loops
    - Verify tests do not spawn runaway processes
    - Verify tests clean up resources after execution
    - Check tests are deterministic (no flaky tests)
    - Monitor process count during test execution
    - _Requirements: 12.5, 12.6, 12.7_
  
  - [x] 10.3 Run final validation
    - Run npm run test:all locally
    - Verify all tests pass
    - Check test execution completes in reasonable time
    - Verify no warnings or errors in test output
    - Confirm both Mocha and Jest test suites pass

- [ ] 11. Final Checkpoint - Complete migration verification
  - Verify all 14 Jest test files have been created
  - Verify all existing Mocha test files remain unchanged
  - Run npm run test:all and confirm both test suites pass
  - Review test coverage reports for completeness
  - Verify all requirements are satisfied
  - Document any known issues or limitations
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All new tests must use Jest (*.jest.mjs files)
- Do NOT modify or delete existing Mocha test files
- Both test suites must pass before completion

## Test Files to Create

| Module | Jest Test File | Type | Requirements |
|--------|---------------|------|--------------|
| generic.response.json.js | test/response/generic-response-json-tests.jest.mjs | Unit | 1.1, 1.6-1.10 |
| generic.response.html.js | test/response/generic-response-html-tests.jest.mjs | Unit | 1.2, 1.6-1.10 |
| generic.response.text.js | test/response/generic-response-text-tests.jest.mjs | Unit | 1.3, 1.6-1.10 |
| generic.response.xml.js | test/response/generic-response-xml-tests.jest.mjs | Unit | 1.4, 1.6-1.10 |
| generic.response.rss.js | test/response/generic-response-rss-tests.jest.mjs | Unit | 1.5, 1.6-1.10 |
| ImmutableObject.class.js | test/utils/ImmutableObject-unit-tests.jest.mjs | Unit | 2.1, 2.3-2.7 |
| ImmutableObject.class.js | test/utils/ImmutableObject-property-tests.jest.mjs | Property | 2.2, 2.8-2.10 |
| Response.class.js | test/response/response-tests.jest.mjs | Unit | 3.1-3.12 |
| ResponseDataModel.class.js | test/response/ResponseDataModel-property-tests.jest.mjs | Unit + Property | 4.1-4.12 |
| utils.js (hashThisData) | test/utils/hash-data-tests.jest.mjs | Unit | 5.1, 5.5-5.6 |
| utils.js (safeClone) | test/utils/safeClone-tests.jest.mjs | Unit | 5.2, 5.7-5.9 |
| utils.js (sanitize, obfuscate) | test/utils/sanitize-obfuscate-tests.jest.mjs | Unit | 5.3, 5.10-5.12 |
| utils.js (properties) | test/utils/utils-property-tests.jest.mjs | Property | 5.4, 5.13-5.14 |
| vars.js | test/utils/vars-tests.jest.mjs | Unit | 6.1-6.6 |

## Property Tests Summary

| Property | Description | Test File | Requirements |
|----------|-------------|-----------|--------------|
| Property 1 | Generic Response Module Consistency | generic-response-*-tests.jest.mjs | 1.6-1.9 |
| Property 2 | Generic Response Default Behavior | generic-response-*-tests.jest.mjs | 1.10 |
| Property 3 | Defensive Copy Immutability | ImmutableObject-property-tests.jest.mjs, ResponseDataModel-property-tests.jest.mjs | 2.3-2.4, 2.6-2.8, 4.2, 4.9 |
| Property 4 | Output Compatibility with JSON Pattern | ImmutableObject-property-tests.jest.mjs, ResponseDataModel-property-tests.jest.mjs, utils-property-tests.jest.mjs | 2.9, 4.10, 5.14 |
| Property 5 | Deep Clone Reference Breaking | ImmutableObject-property-tests.jest.mjs | 2.10, 5.7 |
| Property 6 | Hash Function Determinism | utils-property-tests.jest.mjs | 5.5 |
| Property 7 | Hash Function Collision Resistance | utils-property-tests.jest.mjs | 5.6 |
| Property 8 | Hash Data Cloning Isolation | utils-property-tests.jest.mjs | 5.13 |

## Implementation Order

The tasks are organized to allow parallel work on independent modules:

1. **Phase 1** (Tasks 1-2): Generic Response and ImmutableObject tests - Can be done in parallel
2. **Phase 2** (Tasks 3-4): Response and ResponseDataModel tests - Can be done in parallel
3. **Phase 3** (Tasks 5-6): Utils and Vars tests - Can be done in parallel
4. **Phase 4** (Tasks 7-9): Verification and validation - Sequential
5. **Phase 5** (Tasks 10-11): CI/CD integration and final validation - Sequential

## Success Criteria

- All 14 Jest test files created
- All existing Mocha test files unchanged
- Both test suites pass (npm run test:all)
- All 8 correctness properties validated
- All 107 acceptance criteria satisfied
- Test coverage equivalent to or better than Mocha tests
- No test warnings or errors
- Tests complete in reasonable time
- CI/CD pipeline passes
