# Design Document: Test Migration Phase 3

## Overview

This design document outlines the technical approach for migrating Mocha tests for ClientRequest and RequestInfo classes to the Jest testing framework, and creating comprehensive test coverage for RequestInfo which currently has no tests. This is Phase 3 of the ongoing test framework migration for the @63klabs/cache-data package.

### Background

The @63klabs/cache-data package is migrating from Mocha to Jest as part of a broader effort to modernize the testing infrastructure. During this transition period, both test frameworks must coexist and pass. This phase focuses on two critical modules:

- **ClientRequest**: Processes Lambda event data, validates parameters, extracts path/resource information, and manages request lifecycle including authentication and authorization (47 public methods)
- **RequestInfo**: Processes Lambda event data to extract client information such as IP address, user agent, referrer, and request headers (20+ public methods, currently untested)

### Goals

1. Migrate all existing ClientRequest unit tests from Mocha to Jest
2. Migrate all existing ClientRequest property-based tests from Mocha to Jest
3. Create comprehensive unit test coverage for RequestInfo class
4. Create property-based tests for RequestInfo class
5. Ensure both Mocha and Jest test suites pass during the migration period
6. Maintain backwards compatibility with existing APIs
7. Follow Jest best practices and existing test patterns

### Non-Goals

- Modifying the implementation of ClientRequest or RequestInfo classes
- Changing the public API of either class
- Refactoring test helpers or test data structures
- Migrating other test files beyond ClientRequest and RequestInfo

## Architecture

### Test Framework Migration Strategy

The migration follows a parallel testing approach where both Mocha and Jest tests coexist:

```
test/request/
├── client-request-tests.mjs              # Mocha (legacy, retain)
├── client-request-tests.jest.mjs         # Jest (new, create)
├── client-request-property-tests.mjs     # Mocha (legacy, retain)
├── client-request-property-tests.jest.mjs # Jest (new, create)
├── request-info-tests.jest.mjs           # Jest (new, create)
└── request-info-property-tests.jest.mjs  # Jest (new, create)
```

### Test Execution Flow

```
npm run test:all
├── npm test (Mocha)
│   ├── client-request-tests.mjs
│   └── client-request-property-tests.mjs
└── npm run test:jest (Jest)
    ├── client-request-tests.jest.mjs
    ├── client-request-property-tests.jest.mjs
    ├── request-info-tests.jest.mjs
    └── request-info-property-tests.jest.mjs
```

Both test suites must pass for CI/CD to succeed.

## Components and Interfaces

### ClientRequest Class (Existing)

**Location**: `src/lib/tools/ClientRequest.class.js`

**Public Methods** (47 total):
- Static: `init()`, `info()`, `getReferrerWhiteList()`, `getParameterValidations()`, `requiresValidReferrer()`
- Instance: `getPath()`, `getPathArray()`, `getPathAt()`, `getResource()`, `getResourceArray()`, `getResourceAt()`, `getPathParameters()`, `getQueryStringParameters()`, `getHeaderParameters()`, `getCookieParameters()`, `isAuthenticated()`, `isGuest()`, `isAuthorizedToPerform()`, `getRoles()`, `getAuthorizations()`, `isAuthorizedReferrer()`, `hasNoAuthorization()`, `getExecutionTime()`, `getFinalExecutionTime()`, `getProps()`, `addPathLog()`, `addQueryLog()`, `getRequestLog()`, `timerStop()`, `getRemainingTimeInMillis()`, `calcRemainingTimeInMillis()`, `deadline()`, `calcMsToDeadline()`, `getContext()`, `getEvent()`

**Existing Test Coverage**:
- Unit tests: Initialization, client information, props, path/resource methods, edge cases
- Property tests: Defensive copy immutability, JSON pattern compatibility

### RequestInfo Class (Existing)

**Location**: `src/lib/tools/RequestInfo.class.js`

**Public Methods** (20+ total):
- Constructor: `constructor(event)`
- Validation: `isValid()`
- Serialization: `toObject(full)`, `get(key)`, `getClient(key)`
- Client Information: `getClientUserAgent()`, `getClientIp()`, `getClientIP()`, `getClientReferrer(full)`, `getClientReferer(full)`, `getClientOrigin()`, `getClientIfModifiedSince()`, `getClientIfNoneMatch()`, `getClientAccept()`, `getClientHeaders()`, `getClientParameters()`, `getClientBody()`, `getClientHeadersToProxy(headerKeysToProxy)`

**Current Test Coverage**: None (this phase will create all tests)

### Test Helpers (Existing)

**Location**: `test/helpers/`

**Available Helpers**:
- `testEventA`: Frozen Lambda event object with complete request data
- `testContextA`: Lambda context object with timing and metadata
- `testValidationsA`: Frozen validation configuration for parameter validation

These helpers will be reused in all migrated and new tests.

## Data Models

### Lambda Event Structure

```javascript
{
  resource: string,              // API Gateway resource path
  path: string,                  // Actual request path
  httpMethod: string,            // HTTP method (GET, POST, etc.)
  headers: Object,               // Request headers (case-insensitive)
  pathParameters: Object,        // Path parameters from route
  queryStringParameters: Object, // Query string parameters
  requestContext: {
    identity: {
      sourceIp: string,          // Client IP address
      userAgent: string          // Client user agent
    },
    // ... other context fields
  },
  body: string|null,             // Request body
  isBase64Encoded: boolean
}
```

### Lambda Context Structure

```javascript
{
  functionName: string,
  functionVersion: string,
  invokedFunctionArn: string,
  memoryLimitInMB: string,
  awsRequestId: string,
  logGroupName: string,
  logStreamName: string,
  getRemainingTimeInMillis: () => number,
  // ... other context fields
}
```

### RequestInfo Internal Structure

```javascript
{
  client: {
    ip: string|null,
    userAgent: string|null,
    origin: string|null,
    referrer: string|null,
    ifModifiedSince: string|null,
    ifNoneMatch: string|null,
    accept: string|null,
    headers: Object,              // Normalized to lowercase
    parameters: Object,           // Query string parameters
    body: string|null
  }
}
```

## Test Migration Approach

### Mocha to Jest Conversion Patterns

#### Assertion Conversion

| Mocha (Chai) | Jest |
|--------------|------|
| `expect(value).to.equal(expected)` | `expect(value).toBe(expected)` |
| `expect(value).to.not.equal(expected)` | `expect(value).not.toBe(expected)` |
| `expect(value).to.deep.equal(expected)` | `expect(value).toEqual(expected)` |
| `expect(array).to.include(item)` | `expect(array).toContain(item)` |
| `expect(value).to.be.a('string')` | `expect(typeof value).toBe('string')` |
| `expect(value).to.be.greaterThan(n)` | `expect(value).toBeGreaterThan(n)` |

#### Import Conversion

```javascript
// Mocha
import { expect } from 'chai';

// Jest
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
```

#### Test Structure

Both frameworks use similar describe/it structure, so test organization remains the same:

```javascript
describe('ClientRequest Class', () => {
  describe('Initialize ClientRequest Class', () => {
    it('Set Options during initialization and check values', () => {
      // Test implementation
    });
  });
});
```

### Property-Based Testing with fast-check

fast-check works identically in both Mocha and Jest, so property tests require minimal changes:

```javascript
// Works in both Mocha and Jest
fc.assert(
  fc.property(
    fc.string(),
    (input) => {
      // Property test logic
    }
  ),
  { numRuns: 100 }
);
```

### Test Isolation Strategy

All tests must be isolated and independent:

1. **Static Initialization**: Call `ClientRequest.init()` once before all tests
2. **Instance Creation**: Create new instances in each test
3. **Mock Restoration**: Use `afterEach(() => jest.restoreAllMocks())` to clean up
4. **No Shared State**: Avoid modifying global state or shared objects

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: ClientRequest Defensive Copy Immutability

*For any* ClientRequest instance and any method that returns an array or object, modifications to the returned value should not affect the internal state of the ClientRequest instance.

**Validates: Requirements 1.8 (edge cases for structuredClone optimization)**

**Sub-properties**:
1. Modifying returned authorizations from `getAuthorizations()` does not affect subsequent calls
2. Multiple calls to `getAuthorizations()` return independent copies
3. Nested modifications to returned values do not affect internal state

**Test Strategy**: Use property-based testing with fast-check to generate random modifications and verify internal state remains unchanged.

### Property 2: ClientRequest JSON Pattern Compatibility

*For any* ClientRequest instance, the output of methods using `structuredClone` should be identical to the output that would have been produced using the JSON parse/stringify pattern.

**Validates: Requirements 2.3, 2.4 (property test migration)**

**Sub-properties**:
1. `getAuthorizations()` output matches JSON pattern output
2. Authorization arrays with various structures produce identical results
3. Empty and single-element arrays are handled identically

**Test Strategy**: Use property-based testing to compare `structuredClone` output with `JSON.parse(JSON.stringify())` output for various inputs.

### Property 3: RequestInfo Immutability

*For any* RequestInfo instance, modifications to objects returned by getter methods should not affect the internal state of the RequestInfo instance.

**Validates: Requirements 4.2 (Immutability property)**

**Test Strategy**: Use property-based testing to generate random Lambda events, create RequestInfo instances, modify returned objects, and verify internal state is unchanged.

### Property 4: RequestInfo Referrer Parsing Consistency

*For any* valid referrer string, parsing with `getClientReferrer(true)` (full) and `getClientReferrer(false)` (domain-only) should produce consistent results where the domain-only version is a substring of the full version.

**Validates: Requirements 4.3 (Referrer parsing consistency)**

**Test Strategy**: Use property-based testing to generate random referrer URLs and verify that:
- Domain-only version removes protocol (`https://`, `http://`)
- Domain-only version removes path (everything after first `/`)
- Domain-only version is contained in full version

### Property 5: RequestInfo Sensitive Data Stripping

*For any* RequestInfo instance, calling `toObject()` without the `full` parameter (or with `full=false`) should always strip sensitive fields (`headers`, `allHeaders`) from the output.

**Validates: Requirements 3.10, 4.4 (Sensitive data stripping)**

**Test Strategy**: Use property-based testing to generate random Lambda events, create RequestInfo instances, and verify that:
- `toObject()` does not contain `client.headers`
- `toObject()` does not contain `client.allHeaders`
- `toObject(true)` contains all fields including sensitive ones

### Property 6: RequestInfo Header Case Insensitivity

*For any* Lambda event with headers, RequestInfo should normalize all header keys to lowercase for consistent access regardless of the original case.

**Validates: Requirements 4.5, 11.3 (Header normalization)**

**Test Strategy**: Use property-based testing to generate Lambda events with headers in various cases (uppercase, lowercase, mixed) and verify:
- All header keys in `getClientHeaders()` are lowercase
- Headers can be accessed consistently regardless of original case
- Header values are preserved exactly as provided

### Property 7: RequestInfo Round-Trip Serialization

*For any* valid RequestInfo instance, serializing with `toObject(true)` and then creating a new RequestInfo from equivalent event data should produce an equivalent object structure.

**Validates: Requirements 11.6, 11.7 (Round-trip property)**

**Test Strategy**: Use property-based testing to:
1. Generate random Lambda event
2. Create RequestInfo instance
3. Serialize with `toObject(true)`
4. Verify structure is preserved
5. Verify sensitive data handling is consistent

## Error Handling

### ClientRequest Error Handling

**Validation Errors**:
- Invalid path parameters: Validation functions return `false`, request marked as invalid
- Invalid query string parameters: Validation functions return `false`, request marked as invalid
- Invalid header parameters: Validation functions return `false`, request marked as invalid
- Missing required parameters: Validation functions return `false`, request marked as invalid

**Error Handling Strategy**:
- Graceful degradation: Invalid requests are marked but don't throw exceptions
- Validation results accessible via `getProps()` and validation methods
- Tests should verify both valid and invalid parameter scenarios

### RequestInfo Error Handling

**Input Errors**:
- Null/undefined event: Should handle gracefully, set fields to null
- Missing requestContext: Should handle gracefully, set identity fields to null
- Missing headers: Should handle gracefully, return empty object
- Malformed headers: Should handle gracefully, normalize what's possible

**Error Handling Strategy**:
- Defensive programming: Check for null/undefined before accessing nested properties
- Default values: Use null or empty objects as defaults
- No exceptions: RequestInfo should never throw during construction
- Tests should verify edge cases (null, undefined, missing fields)

## Testing Strategy

### Dual Testing Approach

This project requires both unit tests and property-based tests:

**Unit Tests**:
- Test specific examples and expected behavior
- Test edge cases (null, undefined, empty, boundary values)
- Test error conditions and error messages
- Test integration between methods
- Verify specific input/output pairs

**Property-Based Tests**:
- Test universal properties across all inputs
- Use fast-check to generate random test data
- Validate invariants and mathematical properties
- Run minimum 100 iterations per property
- Catch edge cases that unit tests might miss

Both approaches are complementary and necessary for comprehensive coverage.

### Test Organization

```
test/request/
├── client-request-tests.jest.mjs
│   ├── ClientRequest Class
│   │   ├── Initialize ClientRequest Class
│   │   │   ├── Set Options during initialization and check values
│   │   │   ├── Check client information against test event
│   │   │   ├── Test Props against test event
│   │   │   └── Test getPath and getResource methods
│   │   └── ClientRequest - Edge Cases for structuredClone optimization
│   │       ├── Empty authorization arrays
│   │       ├── Authorization arrays with various structures
│   │       └── Authorization cloning consistency
├── client-request-property-tests.jest.mjs
│   └── ClientRequest - Property-Based Tests
│       ├── Property 1: Defensive Copy Immutability
│       │   ├── should not affect static property when modifying returned authorizations from constructor
│       │   ├── should not affect static property when modifying returned authorizations from getAuthorizations()
│       │   └── should not affect internal state when modifying nested values in authorizations
│       └── Property 2: Output Compatibility with JSON Pattern
│           ├── should produce identical output for getAuthorizations() compared to JSON pattern
│           ├── should produce identical output for authorization arrays with various structures
│           └── should handle empty and single-element authorization arrays identically
├── request-info-tests.jest.mjs
│   └── RequestInfo Class
│       ├── Construction and Initialization
│       │   ├── should process valid Lambda event
│       │   ├── should handle null event gracefully
│       │   ├── should handle missing requestContext
│       │   └── should handle missing headers
│       ├── Client Information Getters
│       │   ├── should return correct user agent
│       │   ├── should return correct IP address
│       │   ├── should return correct referrer (full and domain-only)
│       │   ├── should return correct origin
│       │   ├── should return correct if-modified-since
│       │   ├── should return correct if-none-match
│       │   ├── should return correct accept header
│       │   ├── should return correct headers
│       │   ├── should return correct parameters
│       │   └── should return correct body
│       ├── Data Access Methods
│       │   ├── should access data via get() method
│       │   ├── should access client data via getClient() method
│       │   └── should return null for non-existent keys
│       ├── Serialization
│       │   ├── should serialize with sensitive data stripped by default
│       │   ├── should serialize with full data when requested
│       │   └── should strip headers and allHeaders from default output
│       ├── Header Proxying
│       │   ├── should proxy default headers
│       │   ├── should proxy custom header list
│       │   └── should handle missing headers gracefully
│       └── Edge Cases
│           ├── should handle undefined header values
│           ├── should handle empty query string parameters
│           ├── should handle null referrer
│           └── should handle missing identity data
└── request-info-property-tests.jest.mjs
    └── RequestInfo - Property-Based Tests
        ├── Property 1: Immutability
        │   ├── should not affect internal state when modifying returned headers
        │   ├── should not affect internal state when modifying returned parameters
        │   └── should not affect internal state when modifying toObject output
        ├── Property 2: Referrer Parsing Consistency
        │   ├── should extract domain correctly from full referrer
        │   ├── should handle referrers with and without paths consistently
        │   └── should handle referrers with query strings correctly
        ├── Property 3: Sensitive Data Stripping
        │   ├── should always strip headers from toObject() without full parameter
        │   ├── should always strip allHeaders from toObject() without full parameter
        │   └── should include sensitive data in toObject(true)
        ├── Property 4: Header Case Insensitivity
        │   ├── should normalize all header keys to lowercase
        │   ├── should preserve header values exactly
        │   └── should allow case-insensitive header access
        └── Property 5: Round-Trip Serialization
            ├── should preserve structure through toObject round-trip
            └── should handle nested objects in round-trip
```

### Property-Based Test Configuration

All property-based tests must:
- Use fast-check library for input generation
- Run minimum 100 iterations (`{ numRuns: 100 }`)
- Include descriptive comments explaining the property being tested
- Reference the design document property number
- Tag format: `// Feature: 1-3-9-test-migration-phase-3, Property {number}: {property_text}`

Example:

```javascript
it('Property 1: Immutability - modifications do not affect internal state', () => {
  // Feature: 1-3-9-test-migration-phase-3, Property 3: RequestInfo Immutability
  fc.assert(
    fc.property(
      fc.object(),
      (randomEvent) => {
        const requestInfo = new RequestInfo(randomEvent);
        const headers = requestInfo.getClientHeaders();
        
        // Modify returned object
        headers.newHeader = 'modified';
        
        // Verify internal state unchanged
        const headersAgain = requestInfo.getClientHeaders();
        expect(headersAgain).not.toHaveProperty('newHeader');
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Isolation Requirements

All tests must follow these isolation rules:

1. **Static Initialization**: Call `ClientRequest.init()` once at module level
2. **Instance Independence**: Create new instances in each test
3. **Mock Cleanup**: Use `afterEach(() => jest.restoreAllMocks())`
4. **No Global Mutations**: Don't modify test helpers or shared objects
5. **Deterministic Seeds**: Use fixed seeds for reproducible property tests when debugging

Example:

```javascript
import { describe, it, expect, afterEach } from '@jest/globals';
import { ClientRequest } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

// Initialize once at module level
ClientRequest.init({ validations: testValidationsA });

describe('ClientRequest Class', () => {
  afterEach(() => {
    // Clean up mocks after each test
    jest.restoreAllMocks();
  });

  it('should test something', () => {
    // Create new instance for this test
    const req = new ClientRequest(testEventA, testContextA);
    // Test logic
  });
});
```

### Jest Best Practices

All Jest tests must follow these practices:

1. **Import from @jest/globals**: `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'`
2. **Use appropriate assertions**:
   - `.toBe()` for primitive comparisons (===)
   - `.toEqual()` for object/array deep equality
   - `.toContain()` for array membership
   - `.toHaveProperty()` for object property checks
3. **Descriptive test names**: Clearly state what is being tested
4. **Logical grouping**: Use describe blocks for organization
5. **Async/await**: Use async/await for asynchronous tests
6. **File naming**: Use `*.jest.mjs` extension

### Test Coverage Goals

**ClientRequest**:
- All 47 public methods tested
- All validation scenarios tested
- All path/resource manipulation methods tested
- All authentication/authorization methods tested
- All timing/deadline methods tested
- All logging methods tested
- Edge cases for structuredClone optimization

**RequestInfo**:
- All 20+ public methods tested
- All client information getters tested
- All serialization modes tested
- All header proxying scenarios tested
- Edge cases (null, undefined, missing fields)
- Property-based tests for universal properties

## Migration Approach

### Phase 1: ClientRequest Unit Test Migration

1. Create `test/request/client-request-tests.jest.mjs`
2. Copy test structure from `client-request-tests.mjs`
3. Convert imports from Chai to Jest
4. Convert assertions from Chai to Jest
5. Verify all tests pass
6. Retain original Mocha file

### Phase 2: ClientRequest Property Test Migration

1. Create `test/request/client-request-property-tests.jest.mjs`
2. Copy test structure from `client-request-property-tests.mjs`
3. Convert imports from Chai to Jest
4. Convert assertions from Chai to Jest
5. Verify property tests pass with 100 iterations
6. Retain original Mocha file

### Phase 3: RequestInfo Unit Test Creation

1. Create `test/request/request-info-tests.jest.mjs`
2. Analyze RequestInfo class for all public methods
3. Create test cases for each method
4. Test edge cases (null, undefined, missing fields)
5. Test serialization modes
6. Test header proxying
7. Verify all tests pass

### Phase 4: RequestInfo Property Test Creation

1. Create `test/request/request-info-property-tests.jest.mjs`
2. Implement Property 1: Immutability
3. Implement Property 2: Referrer Parsing Consistency
4. Implement Property 3: Sensitive Data Stripping
5. Implement Property 4: Header Case Insensitivity
6. Implement Property 5: Round-Trip Serialization
7. Verify all property tests pass with 100 iterations

### Phase 5: Validation and Documentation

1. Run `npm test` - verify Mocha tests pass
2. Run `npm run test:jest` - verify Jest tests pass
3. Run `npm run test:all` - verify both suites pass
4. Verify no test coverage regression
5. Update documentation if needed
6. Create pull request with migration

## Risk Mitigation Strategies

### Risk 1: Test Failures During Migration

**Mitigation**:
- Migrate tests incrementally (one file at a time)
- Run both Mocha and Jest tests after each migration
- Compare test results between frameworks
- Fix any discrepancies immediately

### Risk 2: Assertion Behavior Differences

**Mitigation**:
- Document Chai to Jest assertion mappings
- Test edge cases where behavior might differ
- Use Jest's built-in matchers consistently
- Verify deep equality behavior matches expectations

### Risk 3: Property Test Randomness

**Mitigation**:
- Use fixed seeds for reproducible failures
- Log failing examples from fast-check
- Document how to reproduce failures
- Use `fc.sample()` to inspect generated values

### Risk 4: Test Isolation Issues

**Mitigation**:
- Use `afterEach(() => jest.restoreAllMocks())`
- Create new instances in each test
- Don't modify shared test helpers
- Verify tests pass in any order

### Risk 5: Missing Test Coverage

**Mitigation**:
- Analyze class methods systematically
- Create checklist of methods to test
- Review existing Mocha tests for patterns
- Use code coverage tools to identify gaps

### Risk 6: Breaking Changes to APIs

**Mitigation**:
- Don't modify implementation during migration
- Verify method signatures match documentation
- Test backwards compatibility explicitly
- Document any discovered discrepancies

## Implementation Checklist

### Pre-Migration

- [ ] Review ClientRequest class implementation
- [ ] Review RequestInfo class implementation
- [ ] Review existing Mocha tests
- [ ] Review test helpers and test data
- [ ] Document current test coverage
- [ ] Set up Jest configuration if needed

### ClientRequest Migration

- [ ] Create `client-request-tests.jest.mjs`
- [ ] Migrate initialization tests
- [ ] Migrate client information tests
- [ ] Migrate props tests
- [ ] Migrate path/resource method tests
- [ ] Migrate edge case tests
- [ ] Verify all unit tests pass
- [ ] Create `client-request-property-tests.jest.mjs`
- [ ] Migrate Property 1: Defensive Copy Immutability
- [ ] Migrate Property 2: JSON Pattern Compatibility
- [ ] Verify all property tests pass

### RequestInfo Creation

- [ ] Create `request-info-tests.jest.mjs`
- [ ] Implement construction tests
- [ ] Implement client information getter tests
- [ ] Implement data access method tests
- [ ] Implement serialization tests
- [ ] Implement header proxying tests
- [ ] Implement edge case tests
- [ ] Verify all unit tests pass
- [ ] Create `request-info-property-tests.jest.mjs`
- [ ] Implement Property 1: Immutability
- [ ] Implement Property 2: Referrer Parsing Consistency
- [ ] Implement Property 3: Sensitive Data Stripping
- [ ] Implement Property 4: Header Case Insensitivity
- [ ] Implement Property 5: Round-Trip Serialization
- [ ] Verify all property tests pass

### Validation

- [ ] Run `npm test` - Mocha tests pass
- [ ] Run `npm run test:jest` - Jest tests pass
- [ ] Run `npm run test:all` - Both suites pass
- [ ] Verify no test coverage regression
- [ ] Verify test isolation (tests pass in any order)
- [ ] Verify property tests run 100 iterations
- [ ] Review test documentation and comments

### Documentation

- [ ] Update CHANGELOG.md if needed
- [ ] Update test documentation if needed
- [ ] Document any discovered issues
- [ ] Create pull request with clear description

## Summary

This design provides a comprehensive approach for migrating ClientRequest tests to Jest and creating complete test coverage for RequestInfo. The migration follows established patterns, maintains backwards compatibility, and ensures both Mocha and Jest test suites pass during the transition period.

Key principles:
- Parallel testing: Both frameworks coexist
- Test isolation: Each test is independent
- Property-based testing: Universal properties validated with fast-check
- Jest best practices: Modern assertions and patterns
- Comprehensive coverage: All public methods tested
- Risk mitigation: Incremental migration with validation at each step

The migration will result in:
- 4 new Jest test files
- Complete test coverage for RequestInfo (previously untested)
- Migrated tests for ClientRequest maintaining existing coverage
- Both Mocha and Jest suites passing
- Foundation for completing the test framework migration
