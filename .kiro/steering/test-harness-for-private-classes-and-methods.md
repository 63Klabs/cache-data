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
