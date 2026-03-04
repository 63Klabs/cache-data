# Requirements Document

## Introduction

This specification defines the requirements for migrating Mocha tests for ClientRequest.class and RequestInfo.class to the Jest testing framework as part of the ongoing test framework migration. This is Phase 3 of the test migration effort, focusing on request handling and client information processing modules.

The @63klabs/cache-data package is currently migrating from Mocha to Jest. During this transition period, both test frameworks must coexist and pass. This phase focuses on two critical modules that handle Lambda event processing and client request information extraction.

## Glossary

- **ClientRequest**: A class that processes Lambda event data, validates parameters, extracts path/resource information, and manages request lifecycle including authentication and authorization
- **RequestInfo**: A class that processes Lambda event data to extract client information such as IP address, user agent, referrer, and request headers
- **Mocha**: Legacy test framework using Chai assertions (files ending in `-tests.mjs`)
- **Jest**: Current test framework with built-in assertions (files ending in `.jest.mjs`)
- **Property-Based Testing**: Testing approach that validates universal properties across many generated inputs using fast-check library
- **Test Migration**: The process of converting tests from Mocha to Jest while maintaining test coverage and ensuring both frameworks pass
- **Defensive Copy**: A copy of data that prevents modifications to the original data structure
- **Lambda Event**: AWS Lambda event object containing request information from API Gateway
- **Test Harness**: A pattern for exposing private classes and methods for testing purposes without compromising the public API

## Requirements

### Requirement 1: Migrate ClientRequest Unit Tests to Jest

**User Story:** As a developer, I want all ClientRequest unit tests migrated to Jest, so that I can use modern testing features and maintain consistency with the project's testing direction.

#### Acceptance Criteria

1. THE Test_Migration_System SHALL create a new file `test/request/client-request-tests.jest.mjs` containing all unit tests from `test/request/client-request-tests.mjs`
2. WHEN migrating test assertions, THE Test_Migration_System SHALL convert Chai assertions to Jest assertions
3. WHEN migrating test structure, THE Test_Migration_System SHALL maintain the same test organization and describe blocks
4. THE Test_Migration_System SHALL ensure all ClientRequest initialization tests pass in Jest
5. THE Test_Migration_System SHALL ensure all ClientRequest client information tests pass in Jest
6. THE Test_Migration_System SHALL ensure all ClientRequest props tests pass in Jest
7. THE Test_Migration_System SHALL ensure all ClientRequest path and resource method tests pass in Jest
8. THE Test_Migration_System SHALL ensure all ClientRequest edge case tests for structuredClone optimization pass in Jest
9. WHEN all Jest tests pass, THE Test_Migration_System SHALL retain the original Mocha test file for backwards compatibility during the migration period

### Requirement 2: Migrate ClientRequest Property-Based Tests to Jest

**User Story:** As a developer, I want ClientRequest property-based tests migrated to Jest, so that I can validate universal properties using the same framework as unit tests.

#### Acceptance Criteria

1. THE Test_Migration_System SHALL create a new file `test/request/client-request-property-tests.jest.mjs` containing all property tests from `test/request/client-request-property-tests.mjs`
2. THE Test_Migration_System SHALL use fast-check library for property generation in Jest tests
3. THE Test_Migration_System SHALL ensure Property 1 (Defensive Copy Immutability) passes in Jest with all three sub-properties
4. THE Test_Migration_System SHALL ensure Property 2 (Output Compatibility with JSON Pattern) passes in Jest with all three sub-properties
5. THE Test_Migration_System SHALL maintain the same numRuns configuration (100 iterations) for property tests
6. WHEN all property tests pass in Jest, THE Test_Migration_System SHALL retain the original Mocha property test file during the migration period

### Requirement 3: Create RequestInfo Unit Tests in Jest

**User Story:** As a developer, I want comprehensive unit tests for RequestInfo class, so that I can ensure client information extraction works correctly across all scenarios.

#### Acceptance Criteria

1. THE Test_System SHALL create a new file `test/request/request-info-tests.jest.mjs` for RequestInfo unit tests
2. WHEN testing RequestInfo construction, THE Test_System SHALL verify the class correctly processes Lambda event data
3. THE Test_System SHALL test all public getter methods including getClientUserAgent, getClientIp, getClientReferrer, getClientOrigin, getClientIfModifiedSince, getClientIfNoneMatch, getClientAccept, getClientHeaders, getClientParameters, and getClientBody
4. THE Test_System SHALL test the isValid method returns correct validation status
5. THE Test_System SHALL test the toObject method with both full and stripped sensitive data modes
6. THE Test_System SHALL test the get and getClient methods for accessing request data
7. THE Test_System SHALL test getClientReferrer with both full and domain-only modes
8. THE Test_System SHALL test getClientHeadersToProxy with default and custom header lists
9. THE Test_System SHALL test edge cases including null values, undefined values, missing headers, and empty objects
10. THE Test_System SHALL test that sensitive information (headers, allHeaders) is stripped from toObject output by default

### Requirement 4: Create RequestInfo Property-Based Tests in Jest

**User Story:** As a developer, I want property-based tests for RequestInfo class, so that I can validate universal properties across many generated Lambda event structures.

#### Acceptance Criteria

1. THE Test_System SHALL create a new file `test/request/request-info-property-tests.jest.mjs` for RequestInfo property tests
2. THE Test_System SHALL validate Property 1: Immutability - modifications to returned objects do not affect internal state
3. THE Test_System SHALL validate Property 2: Referrer Parsing Consistency - full and domain-only referrer parsing produces consistent results
4. THE Test_System SHALL validate Property 3: Sensitive Data Stripping - toObject without full parameter always strips sensitive fields
5. THE Test_System SHALL validate Property 4: Header Case Insensitivity - headers are normalized to lowercase for consistent access
6. THE Test_System SHALL use fast-check to generate arbitrary Lambda event structures for property validation
7. THE Test_System SHALL run each property test with at least 100 iterations

### Requirement 5: Ensure Test Execution Parity

**User Story:** As a developer, I want both Mocha and Jest test suites to pass with identical results, so that I can ensure the migration does not introduce regressions.

#### Acceptance Criteria

1. WHEN running `npm test`, THE Test_Execution_System SHALL execute all Mocha tests including ClientRequest tests and they SHALL pass
2. WHEN running `npm run test:jest`, THE Test_Execution_System SHALL execute all Jest tests including new ClientRequest and RequestInfo tests and they SHALL pass
3. WHEN running `npm run test:all`, THE Test_Execution_System SHALL execute both Mocha and Jest test suites and both SHALL pass
4. THE Test_Execution_System SHALL ensure no test failures are introduced by the migration
5. THE Test_Execution_System SHALL ensure test coverage for ClientRequest and RequestInfo is maintained or improved

### Requirement 6: Maintain Test Isolation and Independence

**User Story:** As a developer, I want tests to be isolated and independent, so that test execution order does not affect results.

#### Acceptance Criteria

1. THE Test_System SHALL ensure each test can run independently without relying on other tests
2. THE Test_System SHALL use beforeEach and afterEach hooks to set up and tear down test state
3. THE Test_System SHALL restore all mocks and stubs after each test using jest.restoreAllMocks
4. THE Test_System SHALL ensure ClientRequest.init is called with appropriate test validations before tests that require it
5. THE Test_System SHALL ensure tests do not modify global state that affects other tests
6. THE Test_System SHALL ensure property-based tests use deterministic seeds when needed for reproducibility

### Requirement 7: Follow Jest Testing Best Practices

**User Story:** As a developer, I want tests to follow Jest best practices, so that they are maintainable and consistent with the project's testing standards.

#### Acceptance Criteria

1. THE Test_System SHALL use Jest's built-in expect assertions instead of Chai
2. THE Test_System SHALL import test functions from '@jest/globals' (describe, it, expect, beforeEach, afterEach)
3. THE Test_System SHALL use .toBe for primitive comparisons and .toEqual for object/array comparisons
4. THE Test_System SHALL use descriptive test names that clearly state what is being tested
5. THE Test_System SHALL organize tests using describe blocks for logical grouping
6. THE Test_System SHALL use async/await for asynchronous tests instead of callbacks
7. THE Test_System SHALL follow the naming convention `*.jest.mjs` for all Jest test files

### Requirement 8: Document Test Coverage Gaps

**User Story:** As a developer, I want to identify and document any test coverage gaps, so that I can ensure comprehensive testing of ClientRequest and RequestInfo modules.

#### Acceptance Criteria

1. THE Test_System SHALL analyze ClientRequest.class.js to identify untested public methods
2. THE Test_System SHALL analyze RequestInfo.class.js to identify untested public methods
3. THE Test_System SHALL create tests for any public methods lacking coverage
4. THE Test_System SHALL test error handling paths in both classes
5. THE Test_System SHALL test edge cases including boundary values, null inputs, and invalid data
6. THE Test_System SHALL ensure all authentication and authorization methods in ClientRequest are tested
7. THE Test_System SHALL ensure all timing and deadline methods in ClientRequest are tested
8. THE Test_System SHALL ensure all request logging methods in ClientRequest are tested

### Requirement 9: Validate Against Existing Test Patterns

**User Story:** As a developer, I want migrated tests to follow existing test patterns in the codebase, so that tests are consistent and maintainable.

#### Acceptance Criteria

1. THE Test_System SHALL use the same test helper imports (testEventA, testContextA, testValidationsA) as existing tests
2. THE Test_System SHALL follow the same test structure as other migrated Jest tests in the project
3. THE Test_System SHALL use the same assertion patterns as existing Jest tests
4. THE Test_System SHALL follow the same property-based testing patterns as existing fast-check tests
5. THE Test_System SHALL maintain consistency with test organization in test/request directory

### Requirement 10: Ensure Backwards Compatibility

**User Story:** As a developer, I want to ensure no breaking changes are introduced to ClientRequest or RequestInfo classes, so that existing applications continue to work.

#### Acceptance Criteria

1. THE Test_System SHALL verify all public API methods remain unchanged
2. THE Test_System SHALL verify method signatures remain unchanged
3. THE Test_System SHALL verify return types remain unchanged
4. THE Test_System SHALL verify default parameter values remain unchanged
5. THE Test_System SHALL verify error handling behavior remains unchanged
6. IF any discrepancies are found, THE Test_System SHALL document them and seek user approval before proceeding

### Requirement 11: Parser and Serializer Testing

**User Story:** As a developer, I want to ensure request parsing and data serialization work correctly, so that Lambda events are processed accurately.

#### Acceptance Criteria

1. THE Test_System SHALL test Lambda event parsing in RequestInfo with valid event structures
2. THE Test_System SHALL test Lambda event parsing with malformed or incomplete event structures
3. THE Test_System SHALL test header normalization (case insensitivity) in RequestInfo
4. THE Test_System SHALL test query string parameter parsing in ClientRequest
5. THE Test_System SHALL test path parameter extraction in ClientRequest
6. THE Test_System SHALL include round-trip property tests for data that is parsed and then serialized (toObject method)
7. FOR ALL valid request data, parsing then serializing then parsing SHALL produce equivalent objects

### Requirement 12: Test Documentation and Examples

**User Story:** As a developer, I want well-documented tests with clear examples, so that I can understand test intent and maintain tests effectively.

#### Acceptance Criteria

1. THE Test_System SHALL include descriptive comments for complex test logic
2. THE Test_System SHALL use clear test names that describe the expected behavior
3. THE Test_System SHALL include examples of test data structures in comments where helpful
4. THE Test_System SHALL document any test-specific setup or configuration requirements
5. THE Test_System SHALL include comments explaining property-based test properties being validated
