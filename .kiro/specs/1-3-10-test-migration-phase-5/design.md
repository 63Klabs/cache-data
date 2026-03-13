# Design Document: Test Migration Phase 5

## Overview

This design document specifies the technical approach for migrating Mocha tests to Jest for response-related classes and utility modules in the @63klabs/cache-data package. This migration is part of an ongoing effort to transition from Mocha to Jest as the primary testing framework while maintaining backwards compatibility during the transition period.

### Scope

The modules in scope for this phase are:
- **Generic Response Modules**: generic.response.json.js, generic.response.html.js, generic.response.text.js, generic.response.xml.js, generic.response.rss.js
- **Response Classes**: Response.class.js, ResponseDataModel.class.js
- **Utility Classes**: ImmutableObject.class.js
- **Utility Functions**: utils.js (hashThisData, safeClone, sanitize, obfuscate)
- **Version Constants**: vars.js

### Goals

1. Create equivalent Jest tests for all modules in scope
2. Maintain Mocha test compatibility (no modifications or deletions)
3. Identify and fill test coverage gaps
4. Ensure both test suites pass in CI/CD
5. Follow Jest testing patterns and conventions
6. Migrate property-based tests using fast-check
7. Preserve test logic and assertions from Mocha tests

### Non-Goals

- Modifying or deleting existing Mocha tests
- Changing source code functionality
- Refactoring source code
- Creating new features

## Architecture

### Test Migration Strategy

The migration follows a parallel testing approach where both Mocha and Jest test suites coexist and must pass:

```
test/
├── response/
│   ├── generic-response-tests.mjs          (Mocha - existing)
│   ├── generic-response-json-tests.jest.mjs (Jest - new)
│   ├── generic-response-html-tests.jest.mjs (Jest - new)
│   ├── generic-response-text-tests.jest.mjs (Jest - new)
│   ├── generic-response-xml-tests.jest.mjs  (Jest - new)
│   ├── generic-response-rss-tests.jest.mjs  (Jest - new)
│   ├── response-tests.mjs                   (Mocha - existing)
│   ├── response-tests.jest.mjs              (Jest - new)
│   ├── ResponseDataModel-property-tests.mjs (Mocha - existing)
│   └── ResponseDataModel-property-tests.jest.mjs (Jest - new)
└── utils/
    ├── ImmutableObject-unit-tests.mjs       (Mocha - existing)
    ├── ImmutableObject-unit-tests.jest.mjs  (Jest - new)
    ├── ImmutableObject-property-tests.mjs   (Mocha - existing)
    ├── ImmutableObject-property-tests.jest.mjs (Jest - new)
    ├── hash-data-tests.mjs                  (Mocha - existing)
    ├── hash-data-tests.jest.mjs             (Jest - new)
    ├── safeClone-tests.mjs                  (Mocha - existing)
    ├── safeClone-tests.jest.mjs             (Jest - new)
    ├── sanitize-obfuscate-tests.mjs         (Mocha - existing)
    ├── sanitize-obfuscate-tests.jest.mjs    (Jest - new)
    ├── utils-property-tests.mjs             (Mocha - existing)
    ├── utils-property-tests.jest.mjs        (Jest - new)
    └── vars-tests.jest.mjs                  (Jest - new, no Mocha equivalent)
```

### Test Execution Flow

```
Developer runs: npm run test:all
    ↓
Executes: npm test && npm run test:jest
    ↓
├─→ Mocha Test Suite (legacy)
│   ├─ Runs all *-tests.mjs files
│   └─ Must pass (exit code 0)
│
└─→ Jest Test Suite (current)
    ├─ Runs all *.jest.mjs files
    └─ Must pass (exit code 0)
```

Both test suites must pass for CI/CD to succeed.


## Components and Interfaces

### Test Migration Components

#### 1. Generic Response Module Tests

**Purpose**: Test pre-configured HTTP response templates for different content types.

**Modules to Test**:
- `generic.response.json.js` - JSON response templates
- `generic.response.html.js` - HTML response templates
- `generic.response.text.js` - Plain text response templates
- `generic.response.xml.js` - XML response templates
- `generic.response.rss.js` - RSS feed response templates

**Test Structure**:
```javascript
// Jest test structure
import { describe, it, expect } from '@jest/globals';
import jsonResponse from '../../src/lib/tools/generic.response.json.js';

describe('Generic JSON Response Module', () => {
  describe('response() function', () => {
    it('should return response200 for status code 200', () => {
      const result = jsonResponse.response(200);
      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Type']).toBe('application/json');
    });
    
    it('should return response500 for invalid status code', () => {
      const result = jsonResponse.response(999);
      expect(result.statusCode).toBe(500);
    });
  });
  
  describe('contentType property', () => {
    it('should match expected MIME type', () => {
      expect(jsonResponse.contentType).toBe('application/json');
    });
  });
});
```

**Key Testing Patterns**:
- Test each status code response (200, 400, 401, 403, 404, 405, 408, 418, 427, 500)
- Verify response structure (statusCode, headers, body)
- Test default behavior for invalid status codes
- Verify content type consistency

#### 2. ImmutableObject Class Tests

**Purpose**: Test defensive copying functionality to prevent reference mutation.

**Test Categories**:
- **Unit Tests**: Specific behaviors and edge cases
- **Property Tests**: Universal properties across arbitrary inputs

**Unit Test Structure**:
```javascript
import { describe, it, expect } from '@jest/globals';
import ImmutableObject from '../../src/lib/tools/ImmutableObject.class.js';

describe('ImmutableObject - Unit Tests', () => {
  describe('get() method', () => {
    it('should return a copy not a reference', () => {
      const obj = { a: 1, b: { c: 2 } };
      const immutable = new ImmutableObject(obj, true);
      const copy = immutable.get();
      
      copy.a = 999;
      copy.b.c = 999;
      
      const unchanged = immutable.get();
      expect(unchanged.a).toBe(1);
      expect(unchanged.b.c).toBe(2);
    });
  });
  
  describe('finalize() method', () => {
    it('should lock the object preventing further changes', () => {
      const immutable = new ImmutableObject({ a: 1 });
      immutable.finalize();
      
      // Attempting to finalize again should not change the object
      immutable.finalize({ a: 999 });
      
      const result = immutable.get();
      expect(result.a).toBe(1);
    });
  });
});
```

**Property Test Structure**:
```javascript
import fc from 'fast-check';

describe('ImmutableObject - Property Tests', () => {
  it('Property: Defensive copy immutability', () => {
    fc.assert(
      fc.property(
        fc.object(),
        (obj) => {
          const immutable = new ImmutableObject(obj, true);
          const copy = immutable.get();
          const originalState = immutable.get();
          
          // Modify the copy
          if (typeof copy === 'object' && copy !== null) {
            copy.modified = true;
          }
          
          const stateAfterModification = immutable.get();
          expect(JSON.stringify(stateAfterModification))
            .toBe(JSON.stringify(originalState));
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### 3. Response Class Tests

**Purpose**: Test HTTP response building and finalization functionality.

**Test Structure**:
```javascript
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Response, ClientRequest } from '../../src/lib/tools/index.js';

describe('Response Class', () => {
  let clientRequest;
  let logStub;
  
  beforeEach(() => {
    logStub = jest.spyOn(console, 'log').mockImplementation();
    clientRequest = new ClientRequest(testEvent, testContext);
    Response.init(testOptions);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('init() method', () => {
    it('should configure static class properties correctly', () => {
      expect(Response.getContentType()).toBe('application/json');
      expect(Response.getErrorExpirationInSeconds()).toBe(422);
    });
  });
  
  describe('finalize() method', () => {
    it('should calculate correct Cache-Control headers', () => {
      const response = new Response(clientRequest);
      const result = response.finalize();
      
      expect(result.headers['Cache-Control']).toBe('max-age=922');
    });
    
    it('should apply error expiration for error status codes', () => {
      const response = new Response(clientRequest, { statusCode: 500 });
      const result = response.finalize();
      
      expect(result.headers['Cache-Control']).toBe('max-age=422');
    });
  });
});
```

#### 4. ResponseDataModel Class Tests

**Purpose**: Test response data collection and structuring functionality.

**Test Structure**:
```javascript
import { describe, it, expect } from '@jest/globals';
import ResponseDataModel from '../../src/lib/tools/ResponseDataModel.class.js';

describe('ResponseDataModel', () => {
  describe('addItem() method', () => {
    it('should add items to array structure correctly', () => {
      const model = new ResponseDataModel();
      model.addItem({ id: 1 });
      model.addItem({ id: 2 });
      
      const data = model.getResponseData();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
    });
  });
  
  describe('addItemByKey() method', () => {
    it('should convert single value to array for duplicate keys', () => {
      const model = new ResponseDataModel({});
      model.addItemByKey({ id: 1 }, 'item');
      model.addItemByKey({ id: 2 }, 'item');
      
      const data = model.getResponseData();
      expect(Array.isArray(data.item)).toBe(true);
      expect(data.item).toHaveLength(2);
    });
  });
});
```

#### 5. Utils Module Tests

**Purpose**: Test utility functions for hashing, cloning, and sanitization.

**Test Structure**:
```javascript
import { describe, it, expect } from '@jest/globals';
import { hashThisData, safeClone, sanitize, obfuscate } from '../../src/lib/tools/utils.js';

describe('hashThisData()', () => {
  it('should produce consistent hashes for same input', () => {
    const data = { a: 1, b: 2 };
    const hash1 = hashThisData('SHA256', data);
    const hash2 = hashThisData('SHA256', data);
    
    expect(hash1).toBe(hash2);
  });
  
  it('should produce different hashes for different inputs', () => {
    const hash1 = hashThisData('SHA256', { a: 1 });
    const hash2 = hashThisData('SHA256', { a: 2 });
    
    expect(hash1).not.toBe(hash2);
  });
});

describe('safeClone()', () => {
  it('should create deep copy breaking all references', () => {
    const obj = { a: { b: { c: 1 } } };
    const clone = safeClone(obj);
    
    clone.a.b.c = 999;
    
    expect(obj.a.b.c).toBe(1);
  });
});
```

#### 6. Vars Module Tests

**Purpose**: Test Node.js version constant exports (new tests, no Mocha equivalent).

**Test Structure**:
```javascript
import { describe, it, expect } from '@jest/globals';
import { nodeVer, nodeVerMajor, nodeVerMinor, nodeVerMajorMinor } from '../../src/lib/tools/vars.js';

describe('Vars Module', () => {
  it('should export valid version string in format "0.0.0"', () => {
    expect(nodeVer).toMatch(/^\d+\.\d+\.\d+$/);
  });
  
  it('should export integer for major version', () => {
    expect(Number.isInteger(nodeVerMajor)).toBe(true);
    expect(nodeVerMajor).toBeGreaterThanOrEqual(16);
  });
  
  it('should export string in format "0.0" for major.minor', () => {
    expect(nodeVerMajorMinor).toMatch(/^\d+\.\d+$/);
  });
});
```


## Data Models

### Test File Mapping

| Source Module | Mocha Test File | Jest Test File | Status |
|--------------|----------------|----------------|--------|
| generic.response.json.js | generic-response-tests.mjs | generic-response-json-tests.jest.mjs | New |
| generic.response.html.js | generic-response-tests.mjs | generic-response-html-tests.jest.mjs | New |
| generic.response.text.js | generic-response-tests.mjs | generic-response-text-tests.jest.mjs | New |
| generic.response.xml.js | generic-response-tests.mjs | generic-response-xml-tests.jest.mjs | New |
| generic.response.rss.js | generic-response-tests.mjs | generic-response-rss-tests.jest.mjs | New |
| Response.class.js | response-tests.mjs | response-tests.jest.mjs | New |
| ResponseDataModel.class.js | ResponseDataModel-property-tests.mjs | ResponseDataModel-property-tests.jest.mjs | New |
| ImmutableObject.class.js | ImmutableObject-unit-tests.mjs | ImmutableObject-unit-tests.jest.mjs | New |
| ImmutableObject.class.js | ImmutableObject-property-tests.mjs | ImmutableObject-property-tests.jest.mjs | New |
| utils.js (hashThisData) | hash-data-tests.mjs | hash-data-tests.jest.mjs | New |
| utils.js (safeClone) | safeClone-tests.mjs | safeClone-tests.jest.mjs | New |
| utils.js (sanitize, obfuscate) | sanitize-obfuscate-tests.mjs | sanitize-obfuscate-tests.jest.mjs | New |
| utils.js (properties) | utils-property-tests.mjs | utils-property-tests.jest.mjs | New |
| vars.js | N/A | vars-tests.jest.mjs | New (no Mocha) |

### Assertion Conversion Mapping

| Mocha/Chai Pattern | Jest Pattern | Notes |
|-------------------|--------------|-------|
| `expect(x).to.equal(y)` | `expect(x).toBe(y)` | Primitive equality |
| `expect(x).to.deep.equal(y)` | `expect(x).toEqual(y)` | Object equality |
| `expect(x).to.not.equal(y)` | `expect(x).not.toBe(y)` | Primitive inequality |
| `expect(x).to.be.true` | `expect(x).toBe(true)` | Boolean true |
| `expect(x).to.be.false` | `expect(x).toBe(false)` | Boolean false |
| `expect(x).to.be.null` | `expect(x).toBeNull()` | Null check |
| `expect(x).to.be.undefined` | `expect(x).toBeUndefined()` | Undefined check |
| `expect(x).to.be.a('string')` | `expect(typeof x).toBe('string')` | Type check |
| `expect(arr).to.have.lengthOf(n)` | `expect(arr).toHaveLength(n)` | Array length |
| `expect(x).to.be.greaterThan(y)` | `expect(x).toBeGreaterThan(y)` | Comparison |
| `expect(x).to.be.lessThan(y)` | `expect(x).toBeLessThan(y)` | Comparison |
| `expect(str).to.include(substr)` | `expect(str).toContain(substr)` | String contains |
| `expect(str).to.match(/regex/)` | `expect(str).toMatch(/regex/)` | Regex match |
| `expect(fn).to.throw()` | `expect(fn).toThrow()` | Error throwing |

### Mock Conversion Mapping

| Mocha/Sinon Pattern | Jest Pattern | Notes |
|--------------------|--------------|-------|
| `sinon.stub(console, 'log')` | `jest.spyOn(console, 'log').mockImplementation()` | Spy on method |
| `sinon.restore()` | `jest.restoreAllMocks()` | Restore all mocks |
| `stub.called` | `mockFn.mock.calls.length > 0` | Check if called |
| `stub.getCall(0).args[0]` | `mockFn.mock.calls[0][0]` | Get call arguments |
| `stub.restore()` | `mockFn.mockRestore()` | Restore single mock |

### Test Coverage Gap Analysis

**Identified Gaps**:

1. **vars.js Module**: No existing tests
   - Need to create comprehensive tests for version exports
   - Test format validation for version strings
   - Test consistency with AWS.NODE_VER properties

2. **Generic Response Modules**: Tests are combined in one file
   - Need to split into separate files per module
   - Improve test organization and clarity
   - Add tests for edge cases (invalid status codes)

3. **Error Handling**: Limited error condition testing
   - Add tests for error scenarios in all modules
   - Test error message content
   - Test error recovery behavior

4. **Edge Cases**: Some edge cases not covered
   - Null and undefined handling
   - Empty objects and arrays
   - Circular references (where applicable)
   - Large data structures


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all 107 acceptance criteria, I identified the following redundancies and consolidations:

**Redundant Properties Identified**:
1. Properties 2.3 and 2.4 (ImmutableObject) both test defensive copying - consolidated into Property 1
2. Properties 2.6 and 2.7 (ImmutableObject) both test defensive copying for different access patterns - consolidated into Property 1
3. Multiple generic response module properties (1.6-1.9) can be consolidated into fewer comprehensive properties

**Consolidated Approach**:
- Focus on universal properties that apply across all modules
- Eliminate redundant tests that validate the same behavior
- Combine related properties into comprehensive tests

### Property 1: Generic Response Module Consistency

*For any* generic response module (JSON, HTML, XML, RSS, TEXT), the response() function should return a response object with the correct statusCode, headers containing the appropriate Content-Type, and a body matching the expected structure for that content type.

**Validates: Requirements 1.6, 1.7, 1.8, 1.9**

**Rationale**: This property consolidates multiple related requirements about generic response modules. Instead of testing each aspect separately, we verify that all aspects work together correctly for any status code.

### Property 2: Generic Response Default Behavior

*For any* invalid status code (not in the predefined set), the generic response module should return the response500 object as a safe default.

**Validates: Requirements 1.10**

**Rationale**: This is an edge case property that ensures graceful degradation when invalid input is provided.

### Property 3: Defensive Copy Immutability

*For any* object stored in ImmutableObject or ResponseDataModel, modifying the returned value from get() or getResponseData() should not affect the internal state of the container.

**Validates: Requirements 2.3, 2.4, 2.6, 2.7, 2.8, 4.2, 4.9**

**Rationale**: This is the fundamental property of defensive copying. It applies to both ImmutableObject and ResponseDataModel, so we test it as a universal property across both classes.

### Property 4: Output Compatibility with JSON Pattern

*For any* JSON-serializable data, the output from structuredClone (used by ImmutableObject, ResponseDataModel, and safeClone) should be identical to the output from JSON.parse(JSON.stringify()).

**Validates: Requirements 2.9, 4.10, 5.14**

**Rationale**: This property ensures that the optimization from JSON pattern to structuredClone doesn't change behavior. It's critical for backwards compatibility.

### Property 5: Deep Clone Reference Breaking

*For any* nested object structure, cloning should break references at all nesting levels, not just the top level.

**Validates: Requirements 2.10, 5.7**

**Rationale**: This property ensures that deep cloning works correctly for arbitrarily nested structures. It's essential for preventing subtle reference bugs.

### Property 6: Hash Function Determinism

*For any* input data, hashThisData() should produce the same hash value when called multiple times with the same input.

**Validates: Requirements 5.5**

**Rationale**: This is a fundamental property of hash functions - determinism. The same input must always produce the same output.

### Property 7: Hash Function Collision Resistance

*For any* two different inputs, hashThisData() should produce different hash values (with high probability).

**Validates: Requirements 5.6**

**Rationale**: This is another fundamental property of hash functions - collision resistance. Different inputs should produce different outputs.

### Property 8: Hash Data Cloning Isolation

*For any* input data, calling hashThisData() should not modify the original input data.

**Validates: Requirements 5.13**

**Rationale**: This property ensures that the internal cloning behavior of hashThisData doesn't have side effects on the input.

### Example-Based Tests (Not Properties)

The following requirements are best tested with specific examples rather than property-based tests:

**Generic Response Module Examples**:
- Test each specific status code (200, 400, 401, 403, 404, 405, 408, 418, 427, 500)
- Test each content type module separately
- **Validates: Requirements 1.1-1.5**

**Response Class Examples**:
- Test init() configuration
- Test constructor initialization
- Test set(), addHeader(), addToJsonBody() methods
- Test finalize() behavior for success and error status codes
- Test content type detection
- Test logging behavior
- **Validates: Requirements 3.2-3.12**

**ResponseDataModel Examples**:
- Test addItem() and addItemByKey() methods
- Test duplicate key handling
- Test toObject() and toString() methods
- Test nested ResponseDataModel instances
- **Validates: Requirements 4.3-4.8**

**Utils Module Examples**:
- Test sanitize() obfuscation behavior
- Test obfuscate() masking behavior
- **Validates: Requirements 5.10-5.12**

**Vars Module Examples**:
- Test version string format
- Test version number types
- Test consistency with AWS.NODE_VER
- **Validates: Requirements 6.2-6.6**

**Edge Cases**:
- Null and undefined handling (Requirements 4.11)
- Empty objects and arrays (Requirements 4.12)
- Circular references (Requirements 5.8)
- Promises in safeClone (Requirements 5.9)
- Invalid status codes (Requirements 1.10)


## Error Handling

### Test Execution Errors

**Error Type**: Test fails to execute due to syntax or import errors

**Handling Strategy**:
- Use getDiagnostics tool to check for syntax errors before running tests
- Verify all imports are correct and modules exist
- Use try-catch in test setup to catch initialization errors
- Provide clear error messages indicating which test file failed

**Example**:
```javascript
describe('Module Tests', () => {
  let module;
  
  beforeAll(async () => {
    try {
      module = await import('../../src/lib/tools/module.js');
    } catch (error) {
      throw new Error(`Failed to import module: ${error.message}`);
    }
  });
});
```

### Mock Restoration Errors

**Error Type**: Mocks not properly restored causing test pollution

**Handling Strategy**:
- Always use afterEach() with jest.restoreAllMocks()
- Use try-finally blocks for critical mock restoration
- Verify mocks are restored even if tests fail
- Use jest.clearAllMocks() to clear mock call history

**Example**:
```javascript
describe('Tests with mocks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  
  it('should test with mocks', () => {
    const mockFn = jest.spyOn(console, 'log').mockImplementation();
    // Test code
    // Mock automatically restored in afterEach
  });
});
```

### Property Test Failures

**Error Type**: Property-based test fails with specific counterexample

**Handling Strategy**:
- Log the failing input for reproduction
- Use fc.assert verbose mode to see shrinking process
- Preserve seed for reproducibility
- Add unit test for the failing case

**Example**:
```javascript
it('Property test', () => {
  try {
    fc.assert(
      fc.property(fc.object(), (obj) => {
        // Test logic
      }),
      { 
        numRuns: 100,
        verbose: true,
        seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now()
      }
    );
  } catch (error) {
    console.error('Property test failed with seed:', error.seed);
    throw error;
  }
});
```

### Assertion Errors

**Error Type**: Test assertion fails

**Handling Strategy**:
- Provide descriptive error messages
- Include actual and expected values in error output
- Use custom matchers for complex assertions
- Add context about what was being tested

**Example**:
```javascript
it('should have correct structure', () => {
  const result = someFunction();
  
  expect(result).toEqual(
    expect.objectContaining({
      statusCode: expect.any(Number),
      headers: expect.any(Object),
      body: expect.anything()
    })
  );
});
```

### Timeout Errors

**Error Type**: Test exceeds timeout limit

**Handling Strategy**:
- Set appropriate timeouts for async tests
- Use jest.setTimeout() for long-running tests
- Avoid infinite loops in test code
- Monitor for runaway processes

**Example**:
```javascript
describe('Long-running tests', () => {
  jest.setTimeout(30000); // 30 seconds
  
  it('should complete within timeout', async () => {
    await longRunningOperation();
  });
});
```

### Test Isolation Errors

**Error Type**: Tests interfere with each other

**Handling Strategy**:
- Use unique identifiers for each test
- Clean up state in afterEach()
- Avoid shared mutable state
- Use separate test instances

**Example**:
```javascript
describe('Isolated tests', () => {
  let instance;
  
  beforeEach(() => {
    instance = new TestClass(); // Fresh instance for each test
  });
  
  afterEach(() => {
    instance = null; // Clean up
  });
});
```


## Testing Strategy

### Dual Testing Approach

This migration maintains both Mocha and Jest test suites during the transition period:

**Unit Tests**:
- Verify specific examples and expected behaviors
- Test edge cases and boundary conditions
- Test error conditions and error messages
- Focus on concrete scenarios

**Property-Based Tests**:
- Verify universal properties across all inputs
- Use fast-check for input generation
- Run minimum 100 iterations per property
- Test invariants and mathematical properties

**Balance**: Unit tests provide concrete examples, property tests provide comprehensive coverage. Both are necessary and complementary.

### Test Framework Configuration

**Jest Configuration** (jest.config.mjs):
```javascript
export default {
  testMatch: ['**/*.jest.mjs'],
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.mjs'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageDirectory: 'coverage-jest',
  coverageReporters: ['text', 'lcov', 'html']
};
```

**Mocha Configuration** (package.json):
```json
{
  "scripts": {
    "test": "mocha 'test/**/*-tests.mjs'",
    "test:jest": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:all": "npm test && npm run test:jest"
  }
}
```

### Property Test Configuration

All property-based tests must follow these standards:

**Minimum Iterations**: 100 runs per property test
```javascript
fc.assert(
  fc.property(/* ... */),
  { numRuns: 100 }
);
```

**Property Test Tags**: Each property test must reference its design document property
```javascript
// Feature: 1-3-10-test-migration-phase-5, Property 3: Defensive Copy Immutability
it('Property 3: Defensive copy immutability', () => {
  fc.assert(/* ... */);
});
```

**Seed Preservation**: Use environment variable for reproducibility
```javascript
fc.assert(
  fc.property(/* ... */),
  { 
    numRuns: 100,
    seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now()
  }
);
```

### Test Organization

**Directory Structure**:
```
test/
├── response/
│   ├── generic-response-json-tests.jest.mjs
│   ├── generic-response-html-tests.jest.mjs
│   ├── generic-response-text-tests.jest.mjs
│   ├── generic-response-xml-tests.jest.mjs
│   ├── generic-response-rss-tests.jest.mjs
│   ├── response-tests.jest.mjs
│   └── ResponseDataModel-property-tests.jest.mjs
└── utils/
    ├── ImmutableObject-unit-tests.jest.mjs
    ├── ImmutableObject-property-tests.jest.mjs
    ├── hash-data-tests.jest.mjs
    ├── safeClone-tests.jest.mjs
    ├── sanitize-obfuscate-tests.jest.mjs
    ├── utils-property-tests.jest.mjs
    └── vars-tests.jest.mjs
```

**Test File Structure**:
```javascript
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Module under test
import ModuleToTest from '../../src/lib/tools/module.js';

describe('Module Name', () => {
  // Setup and teardown
  beforeEach(() => {
    // Setup code
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  // Unit tests
  describe('Method Name', () => {
    it('should do something when condition', () => {
      // Test code
    });
  });
  
  // Property tests
  describe('Property Tests', () => {
    it('Property 1: Description', () => {
      fc.assert(
        fc.property(/* ... */),
        { numRuns: 100 }
      );
    });
  });
  
  // Edge cases
  describe('Edge Cases', () => {
    it('should handle null values', () => {
      // Test code
    });
  });
});
```

### Migration Checklist

For each module being migrated:

- [ ] Create new Jest test file with .jest.mjs extension
- [ ] Import from @jest/globals (describe, it, expect, jest, beforeEach, afterEach)
- [ ] Convert Chai assertions to Jest assertions
- [ ] Convert Sinon mocks to Jest mocks
- [ ] Migrate property-based tests with fast-check
- [ ] Add afterEach() with jest.restoreAllMocks()
- [ ] Verify test coverage is equivalent to Mocha tests
- [ ] Run Jest tests: npm run test:jest
- [ ] Run both test suites: npm run test:all
- [ ] Verify both test suites pass
- [ ] Do NOT modify or delete Mocha test files

### Test Execution Commands

**Run Mocha tests only**:
```bash
npm test
```

**Run Jest tests only**:
```bash
npm run test:jest
```

**Run both test suites** (required for CI/CD):
```bash
npm run test:all
```

**Run specific Jest test file**:
```bash
npm run test:jest -- test/response/response-tests.jest.mjs
```

**Run Jest tests with coverage**:
```bash
npm run test:jest -- --coverage
```

### CI/CD Integration

**GitHub Actions Workflow**:
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Mocha tests
        run: npm test
      
      - name: Run Jest tests
        run: npm run test:jest
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./coverage-jest
```

**Required Checks**:
- All Mocha tests must pass (exit code 0)
- All Jest tests must pass (exit code 0)
- No test failures or errors
- Tests complete within reasonable time (< 5 minutes)


## Risk Analysis and Mitigation

### Risk 1: Test Equivalence

**Risk**: Jest tests may not be equivalent to Mocha tests, leading to different coverage or behavior.

**Impact**: High - Could miss bugs or create false confidence

**Mitigation**:
- Compare test counts between Mocha and Jest files
- Verify same assertions are being made
- Run both test suites and compare results
- Use property-based tests to ensure comprehensive coverage
- Review test output for any discrepancies

**Detection**:
- Count test cases in both files
- Compare assertion types and values
- Check for missing edge cases

### Risk 2: Mock Conversion Issues

**Risk**: Converting from Sinon to Jest mocks may introduce subtle differences in behavior.

**Impact**: Medium - Could cause tests to pass when they shouldn't

**Mitigation**:
- Carefully review mock conversion patterns
- Test mock behavior explicitly
- Use jest.restoreAllMocks() in afterEach()
- Verify mock call counts and arguments
- Test that mocks are properly cleaned up

**Detection**:
- Check for test pollution (tests passing in isolation but failing together)
- Verify mock restoration in afterEach()
- Look for unexpected mock behavior

### Risk 3: Property Test Seed Issues

**Risk**: Property tests may fail intermittently due to random seed variations.

**Impact**: Medium - Could cause flaky tests in CI/CD

**Mitigation**:
- Use consistent seed for reproducibility
- Log seed on failure for debugging
- Run property tests with sufficient iterations (100+)
- Add unit tests for failing property test cases
- Use fc.assert verbose mode for debugging

**Detection**:
- Tests fail intermittently in CI/CD
- Different results on different runs
- Seed-dependent failures

### Risk 4: Test Isolation Failures

**Risk**: Tests may interfere with each other due to shared state or improper cleanup.

**Impact**: High - Could cause false positives or negatives

**Mitigation**:
- Use unique identifiers for each test
- Clean up state in afterEach()
- Restore all mocks after each test
- Avoid shared mutable state
- Use fresh instances for each test

**Detection**:
- Tests pass in isolation but fail when run together
- Test order affects results
- Unexpected state in tests

### Risk 5: Infinite Loops or Runaway Processes

**Risk**: Tests that spawn child processes or have infinite loops could hang CI/CD.

**Impact**: Critical - Could block deployments

**Mitigation**:
- Set timeouts for all async tests
- Avoid recursive test execution
- Monitor process count during test execution
- Use timeout command in CI/CD
- Follow test-execution-monitoring.md guidelines

**Detection**:
- Tests never complete
- High CPU usage
- Multiple test processes running
- CI/CD timeout

### Risk 6: Breaking Changes to Source Code

**Risk**: Accidentally modifying source code during test migration.

**Impact**: Critical - Could introduce bugs

**Mitigation**:
- Only modify test files, never source files
- Review all changes before committing
- Run existing Mocha tests to verify no regression
- Use version control to track changes
- Get code review before merging

**Detection**:
- Source files show modifications in git diff
- Mocha tests start failing
- Unexpected behavior in application

### Risk 7: Test Coverage Gaps

**Risk**: Missing test coverage for some functionality.

**Impact**: Medium - Could miss bugs in untested code

**Mitigation**:
- Analyze existing test coverage
- Identify gaps in coverage
- Add tests for uncovered functionality
- Use coverage reports to verify completeness
- Document known gaps

**Detection**:
- Coverage reports show low coverage
- Functionality without tests
- Edge cases not tested

### Risk 8: CI/CD Pipeline Failures

**Risk**: Tests fail in CI/CD but pass locally.

**Impact**: High - Could block deployments

**Mitigation**:
- Test locally before pushing
- Use same Node.js version as CI/CD
- Verify environment variables are set correctly
- Check for timing-dependent tests
- Use deterministic test data

**Detection**:
- Tests pass locally but fail in CI/CD
- Environment-specific failures
- Timing-related failures

### Risk 9: Performance Degradation

**Risk**: Jest tests may be slower than Mocha tests.

**Impact**: Low - Could slow down development

**Mitigation**:
- Monitor test execution time
- Optimize slow tests
- Use parallel test execution
- Set reasonable timeouts
- Profile test performance

**Detection**:
- Tests take longer to run
- CI/CD timeout warnings
- Developer complaints about slow tests

### Risk 10: Documentation Drift

**Risk**: Test documentation may not match actual test behavior.

**Impact**: Low - Could cause confusion

**Mitigation**:
- Keep test comments up to date
- Document test purpose clearly
- Use descriptive test names
- Review documentation during code review
- Update documentation when tests change

**Detection**:
- Comments don't match test code
- Unclear test purpose
- Outdated documentation

## Mitigation Summary

**High Priority Mitigations**:
1. Verify test equivalence between Mocha and Jest
2. Ensure proper test isolation and cleanup
3. Prevent breaking changes to source code
4. Avoid infinite loops and runaway processes

**Medium Priority Mitigations**:
1. Handle mock conversion carefully
2. Manage property test seeds properly
3. Fill test coverage gaps
4. Ensure CI/CD compatibility

**Low Priority Mitigations**:
1. Monitor test performance
2. Keep documentation up to date

**Monitoring and Detection**:
- Run both test suites on every commit
- Monitor CI/CD for failures
- Review test output for warnings
- Check coverage reports regularly
- Profile test execution time

