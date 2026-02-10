---
inclusion: always
---

# Test Harness Pattern for Private Classes and Methods

## Purpose

This document defines the pattern for exposing private classes and methods for testing purposes without compromising the public API surface or exposing internal implementation details to end users.

## Core Principle

**Private classes and methods MUST NOT be exposed in the public API.** However, they need to be testable. The TestHarness pattern provides controlled access to internal implementation for testing while keeping the public API clean.

## When to Use TestHarness

Use the TestHarness pattern when:

1. **Testing Private Classes**: You need to test classes that are not exported in the public API (e.g., `CacheData`, `S3Cache`, `DynamoDbCache` in `dao-cache.js`)
2. **Testing Private Methods**: You need to test private methods (using `#` syntax) that cannot be accessed from outside the class
3. **Mocking Internal Dependencies**: Tests need to mock or stub internal classes for property-based testing or unit testing
4. **Accessing Internal State**: Tests need to verify internal state that is not exposed through public methods

## TestHarness Implementation Pattern

### Structure

Create a `TestHarness` class at the end of the module file, just before the `module.exports` statement:

```javascript
/**
 * Test harness for accessing internal classes and methods for testing purposes.
 * WARNING: This class is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
class TestHarness {
/**
 * Get access to internal classes for testing purposes.
 * WARNING: This method is for testing only and should never be used in production.
 * 
 * @returns {{PrivateClass1: typeof PrivateClass1, PrivateClass2: typeof PrivateClass2}} Object containing internal classes
 * @private
 * @example
 * // In tests only - DO NOT use in production
 * const { PrivateClass1, PrivateClass2 } = TestHarness.getInternals();
 * 
 * // Mock PrivateClass1.method for testing
 * const originalMethod = PrivateClass1.method;
 * PrivateClass1.method = async () => ({ test: 'data' });
 * // ... run tests ...
 * PrivateClass1.method = originalMethod; // Restore
 */
static getInternals() {
return {
PrivateClass1,
PrivateClass2
};
}
}
```

### Export Pattern

Export the TestHarness alongside public classes:

```javascript
module.exports = {
PublicClass1,
PublicClass2,
TestHarness  // For testing only
};
```

## Example: dao-cache.js

The `dao-cache.js` module demonstrates this pattern:

**Private Classes** (not in public API):
- `CacheData` - Internal cache data management
- `S3Cache` - Low-level S3 operations
- `DynamoDbCache` - Low-level DynamoDB operations

**Public Classes** (exported for users):
- `Cache` - High-level caching interface
- `CacheableDataAccess` - Cacheable data access wrapper

**TestHarness** (exported for testing):
```javascript
class TestHarness {
static getInternals() {
return {
CacheData,
S3Cache,
DynamoDbCache
};
}
}

module.exports = {
Cache,
CacheableDataAccess,
TestHarness
};
```

## Usage in Tests

### Accessing Private Classes

```javascript
import { TestHarness } from '../src/lib/dao-cache.js';

const { CacheData, S3Cache, DynamoDbCache } = TestHarness.getInternals();

// Now you can test private classes
describe('CacheData', () => {
it('should calculate expiration correctly', () => {
const expires = CacheData.calculateExpires(300);
expect(expires).to.be.a('number');
});
});
```

### Mocking Private Classes for Property-Based Testing

```javascript
import { TestHarness } from '../src/lib/dao-cache.js';

const { CacheData } = TestHarness.getInternals();

// Save original method
const originalRead = CacheData.read;

// Mock for testing
CacheData.read = async () => ({
cache: { 
body: 'test', 
headers: { 'content-type': 'application/json' }, 
expires: 1234567890, 
statusCode: '200' 
}
});

// Run tests...

// Restore original method
CacheData.read = originalRead;
```

## Documentation Requirements

### JSDoc for TestHarness

The TestHarness class MUST include:

1. **Class-level JSDoc** with `@private` tag and warning about production use
2. **Method-level JSDoc** for `getInternals()` with:
   - Clear warning about testing-only usage
   - `@returns` tag documenting the returned object structure
   - `@private` tag
   - `@example` showing proper usage in tests

### Warning Language

Always include this warning in JSDoc:

```javascript
/**
 * WARNING: This class/method is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
```

## Rules for AI Assistants

When working with private classes and methods:

1. **DO NOT export private classes directly** in `module.exports`
2. **DO create a TestHarness class** if private classes need testing
3. **DO export TestHarness** alongside public classes
4. **DO document TestHarness** with `@private` tags and warnings
5. **DO use TestHarness in tests** to access private classes
6. **DO restore mocked methods** after tests complete
7. **DO NOT use TestHarness** in production code or examples
8. **DO NOT mention TestHarness** in user-facing documentation

## Checklist for Adding TestHarness

When adding a TestHarness to a module:

- [ ] Create `TestHarness` class at end of file (before `module.exports`)
- [ ] Implement `static getInternals()` method
- [ ] Return object with private classes that need testing
- [ ] Add JSDoc with `@private` tag and production warning
- [ ] Add `@example` showing proper test usage
- [ ] Export `TestHarness` in `module.exports`
- [ ] Update tests to use `TestHarness.getInternals()`
- [ ] Verify TestHarness is NOT mentioned in user documentation
- [ ] Verify TestHarness is NOT used in example code

## Anti-Patterns to Avoid

### ❌ DON'T: Export Private Classes Directly

```javascript
// BAD - Exposes internal implementation
module.exports = {
Cache,           // Public
CacheData,       // Private - should not be exported directly
S3Cache,         // Private - should not be exported directly
DynamoDbCache    // Private - should not be exported directly
};
```

### ❌ DON'T: Use TestHarness in Production Code

```javascript
// BAD - TestHarness should only be used in tests
import { TestHarness } from '@63klabs/cache-data';
const { CacheData } = TestHarness.getInternals();
```

### ❌ DON'T: Forget to Restore Mocked Methods

```javascript
// BAD - Original method is never restored
const originalRead = CacheData.read;
CacheData.read = async () => ({ test: 'data' });
// ... tests run ...
// Missing: CacheData.read = originalRead;
```

### ✅ DO: Use TestHarness Only in Tests

```javascript
// GOOD - TestHarness used only in test files
import { TestHarness } from '../src/lib/dao-cache.js';
const { CacheData } = TestHarness.getInternals();

describe('CacheData', () => {
it('should work correctly', () => {
// Test private class
});
});
```

## Mocking Getter Properties in Jest

### The Getter Problem

Some classes use getter properties that return new objects on each access. A common example is `AWS.dynamo`, which is implemented as a getter:

```javascript
class AWS {
  static get dynamo() {
    return {
      client: dynamoClient,
      get: async (params) => { /* ... */ },
      put: async (params) => { /* ... */ },
      // ... other methods
    };
  }
}
```

**The Problem**: You cannot directly mock methods on the returned object because each access to the getter returns a NEW object:

```javascript
// ❌ WRONG - This doesn't work!
const tools = await import('../../src/lib/tools/index.js');
tools.default.AWS.dynamo.get = jest.fn(); // This mocks a NEW object, not the one used by the code
```

### Solution: Spy on the Getter Itself

To mock getter properties in Jest, you must spy on the getter and return a mocked object:

```javascript
// ✅ CORRECT - Spy on the getter
import { jest } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');

// Create your mock function
const mockGet = jest.fn().mockResolvedValue({
  Item: { /* your test data */ }
});

// Spy on the getter and return a complete mock object
jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
  client: {},
  get: mockGet,
  put: jest.fn(),
  scan: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  sdk: {}
});

// Now when code accesses AWS.dynamo, it gets your mocked object
// You can verify the mock was called
expect(mockGet).toHaveBeenCalled();
```

### Complete Example: Mocking AWS.dynamo in Cache Tests

Here's a complete example from `test/cache/cache-header-assignment.jest.mjs`:

```javascript
import { jest } from '@jest/globals';
import { randomBytes } from 'crypto';

// Import tools first so we can spy on it
const tools = await import('../../src/lib/tools/index.js');

// Initialize cache
const testKey = randomBytes(32).toString('hex');
const dataKey = Buffer.from(testKey, 'hex');

const cacheInit = {
  dynamoDbTable: "test-table-jest",
  s3Bucket: "test-bucket-jest",
  secureDataKey: dataKey,
  idHashAlgorithm: "sha256"
};

const cache = await import('../../src/lib/dao-cache.js');
cache.Cache.init(cacheInit);

describe('CacheableDataAccess - Header Assignment', () => {
  afterEach(() => {
    // CRITICAL: Restore all mocks after each test
    jest.restoreAllMocks();
  });

  it('should handle undefined headers correctly', async () => {
    // Step 1: Create mock function with desired behavior
    const mockGet = jest.fn().mockResolvedValue({
      Item: {
        id_hash: 'test-hash-unique-1',
        expires: Math.floor(Date.now() / 1000) - 1, // Expired
        data: {
          body: '{"test":"data"}',
          headers: {
            'last-modified': undefined, // Test undefined header
            'etag': '"valid-etag"'
          },
          statusCode: '200',
          info: {
            classification: 'public',
            objInS3: false
          }
        }
      }
    });
    
    // Step 2: Spy on the dynamo getter and return mock object
    jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
      client: {},
      get: mockGet,
      put: jest.fn(),
      scan: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      sdk: {}
    });

    // Step 3: Use the cache module (it will use your mocked dynamo)
    const { Cache, CacheableDataAccess } = cache;
    
    const mockApiFunction = jest.fn().mockResolvedValue({
      success: true,
      statusCode: 304,
      body: '',
      headers: {}
    });

    const connection = {
      host: 'api.example.com',
      path: '/test-unique-1',
      headers: {}
    };

    const cachePolicy = {
      hostId: 'api.example.com',
      pathId: '/test-unique-1',
      profile: 'default',
      overrideOriginHeaderExpiration: false,
      defaultExpirationInSeconds: 300,
      expirationIsOnInterval: false,
      headersToRetain: '',
      hostEncryption: 'public'
    };

    // Step 4: Call the function under test
    await CacheableDataAccess.getData(
      cachePolicy,
      mockApiFunction,
      connection,
      null,
      { path: 'test-unique-1', id: 'jest-test-1' }
    );

    // Step 5: Verify mock was called and assert results
    expect(mockGet).toHaveBeenCalled();
    expect(connection.headers['if-modified-since']).toBeUndefined();
    expect(connection.headers['if-none-match']).toBe('"valid-etag"');
  });
});
```

### Key Points for Mocking Getters

1. **Import the module first**: Import the module containing the getter before importing modules that use it
2. **Spy on the getter**: Use `jest.spyOn(object, 'propertyName', 'get')`
3. **Return complete object**: The mocked return value must include ALL properties/methods that code might access
4. **Create named mock functions**: Create `const mockGet = jest.fn()` so you can verify calls
5. **Restore after each test**: Always call `jest.restoreAllMocks()` in `afterEach()`
6. **Use unique identifiers**: Use unique paths/IDs in tests to avoid cache collisions

### Common Getter Properties to Mock

In this codebase, the following getter properties may need mocking:

- `tools.default.AWS.dynamo` - Returns DynamoDB client wrapper
- `tools.default.AWS.s3` - Returns S3 client wrapper
- `tools.default.AWS.ssm` - Returns SSM client wrapper
- `tools.default.AWS.REGION` - Returns AWS region string
- `tools.default.AWS.SDK_VER` - Returns SDK version string

### Anti-Patterns for Getter Mocking

#### ❌ DON'T: Try to mock the returned object directly

```javascript
// BAD - This creates a mock on a NEW object that won't be used
const tools = await import('../../src/lib/tools/index.js');
tools.default.AWS.dynamo.get = jest.fn(); // Wrong!
```

#### ❌ DON'T: Forget to include all required properties

```javascript
// BAD - Missing required properties
jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
  get: mockGet
  // Missing: client, put, scan, delete, update, sdk
});
```

#### ❌ DON'T: Forget to restore mocks

```javascript
// BAD - Mocks leak into other tests
describe('My tests', () => {
  it('test 1', () => {
    jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({...});
    // ... test code ...
  });
  // Missing afterEach with jest.restoreAllMocks()
});
```

#### ✅ DO: Follow the complete pattern

```javascript
// GOOD - Complete pattern with all best practices
import { jest } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');

describe('My tests', () => {
  afterEach(() => {
    jest.restoreAllMocks(); // Always restore
  });

  it('test with mocked getter', () => {
    const mockGet = jest.fn().mockResolvedValue({ Item: {...} });
    
    jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
      client: {},
      get: mockGet,
      put: jest.fn(),
      scan: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      sdk: {}
    });

    // ... test code ...
    
    expect(mockGet).toHaveBeenCalled();
  });
});
```

### Debugging Getter Mocks

If your getter mock isn't working:

1. **Verify import order**: Import the module with the getter BEFORE modules that use it
2. **Check the spy syntax**: Use `jest.spyOn(object, 'propertyName', 'get')` with the third parameter
3. **Verify complete object**: Ensure your mock return value includes all properties the code accesses
4. **Check for multiple getters**: If code accesses the getter multiple times, each access gets your mock
5. **Use console.log**: Temporarily log the getter return value to see what's being accessed

```javascript
// Debugging: See what the getter returns
jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockImplementation(() => {
  const mockObj = {
    client: {},
    get: mockGet,
    put: jest.fn(),
    scan: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    sdk: {}
  };
  console.log('dynamo getter called, returning:', mockObj);
  return mockObj;
});
```

## Summary

The TestHarness pattern provides a clean separation between:
- **Public API**: What users interact with (`Cache`, `CacheableDataAccess`)
- **Private Implementation**: Internal classes not meant for users (`CacheData`, `S3Cache`, `DynamoDbCache`)
- **Test Interface**: Controlled access to private implementation for testing (`TestHarness`)

This pattern ensures:
1. Clean public API surface
2. Testable private implementation
3. Clear documentation of testing-only interfaces
4. No accidental production use of internal classes

**For getter properties**: Use `jest.spyOn(object, 'propertyName', 'get')` to mock getters that return new objects on each access. Always restore mocks in `afterEach()` to prevent test pollution.
