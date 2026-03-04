# Implementation Plan: Test Migration Phase 3

## Overview

This implementation plan covers the migration of ClientRequest and RequestInfo tests from Mocha to Jest, and the creation of comprehensive test coverage for RequestInfo. The migration follows the parallel testing approach where both Mocha and Jest tests coexist during the transition period.

## Tasks

- [x] 1. Migrate ClientRequest unit tests to Jest
  - Create `test/request/client-request-tests.jest.mjs` with all unit tests from Mocha version
  - Convert Chai assertions to Jest assertions (expect().to.equal() → expect().toBe())
  - Convert imports from Chai to @jest/globals
  - Maintain test structure and describe blocks from original
  - Test initialization with validations
  - Test client information extraction
  - Test props against test event
  - Test getPath and getResource methods
  - Test edge cases for structuredClone optimization
  - Verify all tests pass with `npm run test:jest`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 2. Migrate ClientRequest property-based tests to Jest
  - Create `test/request/client-request-property-tests.jest.mjs` with all property tests from Mocha version
  - Convert Chai assertions to Jest assertions
  - Convert imports from Chai to @jest/globals
  - Use fast-check library for property generation (same as Mocha)
  - Maintain numRuns: 100 configuration for all property tests
  - _Requirements: 2.1, 2.2, 2.5, 2.6_

- [x] 2.1 Migrate Property 1: Defensive Copy Immutability
  - **Property 1: ClientRequest Defensive Copy Immutability**
  - **Validates: Requirements 1.8**
  - Test that modifying returned authorizations from constructor does not affect static property
  - Test that modifying returned authorizations from getAuthorizations() does not affect static property
  - Test that modifying nested values in authorizations does not affect internal state
  - _Requirements: 2.3_

- [x] 2.2 Migrate Property 2: JSON Pattern Compatibility
  - **Property 2: ClientRequest JSON Pattern Compatibility**
  - **Validates: Requirements 2.3, 2.4**
  - Test that getAuthorizations() output matches JSON parse/stringify pattern
  - Test that authorization arrays with various structures produce identical results
  - Test that empty and single-element arrays are handled identically
  - _Requirements: 2.4_

- [x] 3. Checkpoint - Verify ClientRequest migration
  - Run `npm test` to verify Mocha tests still pass
  - Run `npm run test:jest` to verify Jest tests pass
  - Run `npm run test:all` to verify both suites pass
  - Ensure all tests pass, ask the user if questions arise

- [x] 4. Create RequestInfo unit tests in Jest
  - Create `test/request/request-info-tests.jest.mjs` for comprehensive RequestInfo testing
  - Import from @jest/globals (describe, it, expect, beforeEach, afterEach)
  - Use testEventA helper for Lambda event data
  - Test all public methods (20+ methods)
  - _Requirements: 3.1, 3.2, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 4.1 Test RequestInfo construction and initialization
  - Test construction with valid Lambda event
  - Test construction with null event (graceful handling)
  - Test construction with missing requestContext
  - Test construction with missing headers
  - Test isValid() method returns correct validation status
  - _Requirements: 3.2, 3.4_

- [x] 4.2 Test RequestInfo client information getters
  - Test getClientUserAgent() returns correct user agent
  - Test getClientIp() and getClientIP() return correct IP address
  - Test getClientReferrer(true) returns full referrer
  - Test getClientReferrer(false) returns domain-only referrer
  - Test getClientReferer() alias works correctly
  - Test getClientOrigin() returns correct origin
  - Test getClientIfModifiedSince() returns correct header
  - Test getClientIfNoneMatch() returns correct header
  - Test getClientAccept() returns correct accept header
  - Test getClientHeaders() returns normalized headers
  - Test getClientParameters() returns query string parameters
  - Test getClientBody() returns request body
  - _Requirements: 3.3, 3.7_

- [x] 4.3 Test RequestInfo data access methods
  - Test get(key) method for accessing request data
  - Test getClient(key) method for accessing client data
  - Test get() returns null for non-existent keys
  - Test getClient() returns null for non-existent keys
  - _Requirements: 3.6_

- [x] 4.4 Test RequestInfo serialization
  - Test toObject() strips sensitive data by default
  - Test toObject(false) strips sensitive data
  - Test toObject(true) includes all data including sensitive fields
  - Test that headers and allHeaders are stripped from default output
  - Test serialization structure matches expected format
  - _Requirements: 3.5, 3.10_

- [x] 4.5 Test RequestInfo header proxying
  - Test getClientHeadersToProxy() with default header list
  - Test getClientHeadersToProxy(customList) with custom header list
  - Test header proxying handles missing headers gracefully
  - Test header proxying normalizes header keys to lowercase
  - _Requirements: 3.8_

- [x] 4.6 Test RequestInfo edge cases
  - Test handling of undefined header values
  - Test handling of empty query string parameters
  - Test handling of null referrer
  - Test handling of missing identity data in requestContext
  - Test handling of malformed event structures
  - _Requirements: 3.9_

- [x] 5. Create RequestInfo property-based tests in Jest
  - Create `test/request/request-info-property-tests.jest.mjs` for property validation
  - Import fast-check for property generation
  - Use numRuns: 100 for all property tests
  - Generate arbitrary Lambda event structures for testing
  - _Requirements: 4.1, 4.6, 4.7_

- [x] 5.1 Implement Property 3: RequestInfo Immutability
  - **Property 3: RequestInfo Immutability**
  - **Validates: Requirements 4.2**
  - Test that modifying returned headers does not affect internal state
  - Test that modifying returned parameters does not affect internal state
  - Test that modifying toObject() output does not affect internal state
  - Use fast-check to generate random Lambda events
  - _Requirements: 4.2_

- [x] 5.2 Implement Property 4: Referrer Parsing Consistency
  - **Property 4: RequestInfo Referrer Parsing Consistency**
  - **Validates: Requirements 4.3**
  - Test that domain-only referrer is substring of full referrer
  - Test that domain-only removes protocol (https://, http://)
  - Test that domain-only removes path (everything after first /)
  - Use fast-check to generate random referrer URLs
  - _Requirements: 4.3_

- [x] 5.3 Implement Property 5: Sensitive Data Stripping
  - **Property 5: RequestInfo Sensitive Data Stripping**
  - **Validates: Requirements 3.10, 4.4**
  - Test that toObject() without full parameter strips headers
  - Test that toObject() without full parameter strips allHeaders
  - Test that toObject(false) strips sensitive fields
  - Test that toObject(true) includes all fields including sensitive ones
  - Use fast-check to generate random Lambda events
  - _Requirements: 4.4_

- [x] 5.4 Implement Property 6: Header Case Insensitivity
  - **Property 6: RequestInfo Header Case Insensitivity**
  - **Validates: Requirements 4.5, 11.3**
  - Test that all header keys are normalized to lowercase
  - Test that header values are preserved exactly as provided
  - Test that headers can be accessed consistently regardless of original case
  - Use fast-check to generate headers with various cases (uppercase, lowercase, mixed)
  - _Requirements: 4.5_

- [x] 5.5 Implement Property 7: Round-Trip Serialization
  - **Property 7: RequestInfo Round-Trip Serialization**
  - **Validates: Requirements 11.6, 11.7**
  - Test that toObject(true) preserves structure
  - Test that serialization handles nested objects correctly
  - Test that sensitive data handling is consistent through round-trip
  - Use fast-check to generate random Lambda events
  - _Requirements: 4.6_

- [x] 6. Checkpoint - Verify RequestInfo test coverage
  - Run `npm run test:jest` to verify all RequestInfo tests pass
  - Verify all 20+ public methods are tested
  - Verify all 5 correctness properties pass with 100 iterations
  - Ensure all tests pass, ask the user if questions arise

- [x] 7. Validate test execution parity
  - Run `npm test` to verify all Mocha tests pass
  - Run `npm run test:jest` to verify all Jest tests pass
  - Run `npm run test:all` to verify both suites pass
  - Verify no test failures introduced by migration
  - Verify test coverage maintained or improved
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Verify test isolation and independence
  - Verify each test can run independently
  - Verify beforeEach and afterEach hooks are used appropriately
  - Verify jest.restoreAllMocks() is called in afterEach
  - Verify ClientRequest.init() is called appropriately
  - Verify tests do not modify global state
  - Verify property tests use deterministic seeds when needed
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 9. Validate Jest best practices compliance
  - Verify all imports from @jest/globals
  - Verify .toBe() used for primitive comparisons
  - Verify .toEqual() used for object/array comparisons
  - Verify descriptive test names used throughout
  - Verify describe blocks used for logical grouping
  - Verify async/await used for asynchronous tests
  - Verify *.jest.mjs naming convention followed
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 10. Document test coverage and validate completeness
  - Verify all ClientRequest public methods tested (47 methods)
  - Verify all RequestInfo public methods tested (20+ methods)
  - Verify error handling paths tested in both classes
  - Verify edge cases tested (boundary values, null inputs, invalid data)
  - Verify authentication and authorization methods tested
  - Verify timing and deadline methods tested
  - Verify request logging methods tested
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [ ] 11. Final checkpoint - Complete migration validation
  - Run `npm test` - verify Mocha tests pass
  - Run `npm run test:jest` - verify Jest tests pass
  - Run `npm run test:all` - verify both suites pass
  - Verify no backwards compatibility issues
  - Verify all test files follow existing patterns
  - Verify test documentation is clear and complete
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with 100 iterations
- Unit tests validate specific examples and edge cases
- Both Mocha and Jest test suites must pass during migration period
- Original Mocha test files are retained for backwards compatibility
- All new tests follow Jest best practices and existing test patterns
- Test isolation is critical - use afterEach(() => jest.restoreAllMocks())
- ClientRequest has 47 public methods, RequestInfo has 20+ public methods
- RequestInfo currently has no tests - this phase creates complete coverage
