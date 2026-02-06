# Design Document: Cache DAO Undefined Header Fix

## Overview

This design addresses a production bug where undefined values are passed to HTTP headers in the cache-dao module, causing request failures with the error: `Invalid value "undefined" for header "if-modified-since"`.

The root cause is that the `getHeader()` method can return `undefined` when a header key exists in the headers object but has an undefined value. The conditional checks in `CacheableDataAccess.getData()` only validate against `null`, allowing undefined values to be assigned to HTTP headers.

This design provides a minimal, backwards-compatible fix that:
1. Normalizes undefined to null in `getHeader()`
2. Adds defensive validation at header assignment points
3. Introduces Jest for better testing of AWS integrations
4. Provides comprehensive test coverage to prevent regression

## Architecture

### Current Flow (Buggy)

```
Cache.read() 
  → getHeaders() returns {headers: {"last-modified": undefined}}
  → getLastModified() calls getHeader("last-modified")
  → getHeader() returns undefined (key exists but value is undefined)
  → CacheableDataAccess checks: getLastModified() !== null (passes!)
  → connection.headers['if-modified-since'] = undefined
  → APIRequest sends request with undefined header value
  → HTTP error: "Invalid value 'undefined' for header"
```

### Fixed Flow

```
Cache.read()
  → getHeaders() returns {headers: {"last-modified": undefined}}
  → getLastModified() calls getHeader("last-modified")
  → getHeader() normalizes undefined → null
  → getHeader() returns null
  → CacheableDataAccess checks: getLastModified() !== null (fails)
  → Header assignment skipped
  → APIRequest sends request without if-modified-since header
  → Request succeeds
```

## Components and Interfaces

### 1. Cache.getHeader() Method (Primary Fix)

**Location:** `src/lib/dao-cache.js` - Cache class

**Current Implementation:**
```javascript
getHeader(key) {
    let headers = this.getHeaders();
    return ( headers !== null && key in headers) ? headers[key] : null
}
```

**Problem:** If `headers[key]` is `undefined`, it returns `undefined` instead of `null`.

**Fixed Implementation:**
```javascript
getHeader(key) {
    let headers = this.getHeaders();
    if (headers === null || !(key in headers)) {
        return null;
    }
    // Normalize undefined to null for consistent behavior
    const value = headers[key];
    return (value === undefined || value === null) ? null : value;
}
```

**Rationale:**
- Maintains backwards compatibility (null still returns null)
- Normalizes undefined to null for consistent conditional checks
- Minimal change to existing logic
- No changes to public API signature

### 2. Header Assignment Validation (Defensive Fix)

**Location:** `src/lib/dao-cache.js` - CacheableDataAccess.getData()

**Current Implementation:**
```javascript
if (!("if-modified-since" in connection.headers) && cache.getLastModified() !== null) { 
    connection.headers['if-modified-since'] = cache.getLastModified(); 
}
```

**Problem:** Only checks `!== null`, not `!== undefined`.

**Fixed Implementation:**
```javascript
const lastModified = cache.getLastModified();
if (!("if-modified-since" in connection.headers) && lastModified !== null && lastModified !== undefined) { 
    connection.headers['if-modified-since'] = lastModified; 
}

const etag = cache.getETag();
if (!("if-none-match" in connection.headers) && etag !== null && etag !== undefined) { 
    connection.headers['if-none-match'] = etag;
}
```

**Rationale:**
- Defense in depth: validates at assignment point even after getHeader() fix
- Explicit undefined check makes intent clear
- Stores value in variable to avoid multiple method calls
- Consistent pattern for both headers

### 3. Helper Function for Header Validation (Optional Enhancement)

**Location:** `src/lib/dao-cache.js` - Cache class (static method)

**Implementation:**
```javascript
/**
 * Validate that a header value is suitable for HTTP header assignment.
 * Returns true if the value is a non-empty string or number, false otherwise.
 * 
 * @param {*} value The value to validate
 * @returns {boolean} True if value is valid for HTTP header, false otherwise
 * @private
 */
static _isValidHeaderValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    const type = typeof value;
    if (type === 'string') {
        return value.length > 0;
    }
    if (type === 'number') {
        return !isNaN(value);
    }
    return false;
}
```

**Usage:**
```javascript
const lastModified = cache.getLastModified();
if (!("if-modified-since" in connection.headers) && Cache._isValidHeaderValue(lastModified)) { 
    connection.headers['if-modified-since'] = lastModified; 
}
```

**Rationale:**
- Centralizes validation logic
- Makes validation criteria explicit
- Reusable across multiple header assignments
- Private method (not part of public API)

## Data Models

### Header Value Types

**Valid Types:**
- `string` (non-empty)
- `number` (not NaN)

**Invalid Types:**
- `undefined`
- `null`
- `boolean`
- `object`
- `array`
- Empty string `""`

### Cache Headers Object

```javascript
{
    "etag": string | null | undefined,
    "last-modified": string | null | undefined,
    "expires": string | null | undefined,
    "content-type": string | null | undefined,
    // ... other headers
}
```

**Note:** Headers can have undefined values due to:
1. Object initialization with missing properties
2. Explicit assignment of undefined
3. Destructuring with missing properties
4. Object.assign() with undefined source values

## Root Cause Analysis

### Investigation Findings

**Question:** Why do headers contain undefined values?

**Analysis of Recent Changes:**

1. **1.3.6 In-Memory Cache Spec:**
   - Added `InMemoryCache` class
   - No changes to header handling
   - **Conclusion:** Not the source

2. **1.3.6 Reduce JSON.stringify Spec:**
   - Replaced `JSON.parse(JSON.stringify())` with `structuredClone()`
   - Changed in: `ImmutableObject`, `Connections`, `ResponseDataModel`, `utils`, `ClientRequest`
   - **Potential Issue:** `structuredClone()` preserves undefined values, while JSON.stringify() removes them

**JSON.stringify() vs structuredClone() Behavior:**

```javascript
const obj = { a: "value", b: undefined, c: null };

// JSON.stringify removes undefined
JSON.parse(JSON.stringify(obj))
// Result: { a: "value", c: null }

// structuredClone preserves undefined
structuredClone(obj)
// Result: { a: "value", b: undefined, c: null }
```

**Conclusion:** The switch to `structuredClone()` in 1.3.6 is likely exposing a latent bug. Headers with undefined values were previously stripped by JSON.stringify(), but now they're preserved. This is actually **correct behavior** - the bug was always present, but masked by JSON.stringify().

**Recommendation:** Fix the bug properly (normalize undefined to null) rather than relying on JSON.stringify() side effects.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: getHeader Undefined Normalization

*For any* Cache instance and any header key, when getHeader(key) is called and the header value is undefined, the method should return null (never undefined).

**Validates: Requirements 1.3, 2.2, 2.5**

**Test Strategy:** Generate random Cache instances with headers containing undefined values, call getHeader() for various keys, and verify the return value is never undefined.

### Property 2: Header Value Type Validation

*For any* header value assigned to connection.headers in CacheableDataAccess, the value should be either a non-empty string or a number (never undefined, null, boolean, object, or empty string).

**Validates: Requirements 1.4, 1.5**

**Test Strategy:** Monitor all header assignments in CacheableDataAccess.getData() and verify assigned values are valid types.

### Property 3: Conditional Header Assignment

*For any* Cache instance, when getLastModified() or getETag() returns null or undefined, the corresponding HTTP header (if-modified-since or if-none-match) should not be assigned to the connection object.

**Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.5**

**Test Strategy:** Generate random Cache instances with various header states (null, undefined, valid), call CacheableDataAccess.getData(), and verify headers are only assigned when values are valid.

### Property 4: Valid Header Passthrough

*For any* Cache instance with valid (non-null, non-undefined) header values, getHeader() should return the exact value without modification.

**Validates: Requirements 2.4**

**Test Strategy:** Generate random Cache instances with valid header values (strings and numbers), call getHeader(), and verify the returned value equals the original value.

### Property 5: Backwards Compatibility for Valid Values

*For any* Cache instance with valid header values (including explicit null), the behavior after the fix should be identical to the behavior before the fix.

**Validates: Requirements 9.2, 9.3**

**Test Strategy:** Run existing test suite and verify all tests pass. Generate random Cache instances with valid values and verify getHeader() behavior matches expected behavior.

## Error Handling

### Scenarios

1. **Undefined Header Value**
   - **Detection:** getHeader() receives undefined from headers object
   - **Handling:** Normalize to null and return
   - **Logging:** Debug level (not an error, expected behavior)

2. **Null Header Value**
   - **Detection:** getHeader() receives null from headers object
   - **Handling:** Return null as-is
   - **Logging:** None (normal behavior)

3. **Invalid Header Type**
   - **Detection:** Header value is boolean, object, or array
   - **Handling:** Treat as invalid, skip assignment
   - **Logging:** Debug level warning

4. **Empty String Header**
   - **Detection:** Header value is ""
   - **Handling:** Treat as invalid, skip assignment
   - **Logging:** Debug level warning

### Error Messages

```javascript
// Debug logging for undefined normalization
tools.DebugAndLog.debug(`Header '${key}' has undefined value, normalizing to null`);

// Debug logging for skipped assignment
tools.DebugAndLog.debug(`Skipping header assignment for '${headerName}': invalid value type`);
```

## Testing Strategy

### Dual Testing Approach

This fix requires both unit tests and property-based tests:

**Unit Tests:**
- Specific examples of undefined, null, and valid header values
- Edge cases: empty string, NaN, boolean, object
- Integration with CacheableDataAccess.getData()
- Backwards compatibility verification

**Property Tests:**
- Universal properties across all possible header states
- Random generation of Cache instances with various header configurations
- Comprehensive input coverage through randomization
- Minimum 100 iterations per property test

### Jest Setup

**Why Jest:**
- Better mocking capabilities for AWS SDK
- Built-in code coverage
- Snapshot testing for complex objects
- Modern async/await support
- Parallel test execution

**Configuration:**

`jest.config.mjs`:
```javascript
export default {
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.jest.mjs'],
    transform: {},
    extensionsToTreatAsEsm: ['.mjs'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    coverageDirectory: 'coverage-jest',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
    ],
};
```

**Package.json Scripts:**
```json
{
    "scripts": {
        "test": "mocha 'test/**/*-tests.mjs'",
        "test:jest": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
        "test:all": "npm test && npm run test:jest",
        "test:cache": "mocha 'test/cache/**/*-tests.mjs'",
        "test:cache:jest": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/cache"
    }
}
```

**Test Organization:**
- Mocha tests: `test/**/*-tests.mjs`
- Jest tests: `test/**/*.jest.mjs`
- No overlap in file patterns
- Both can coexist without conflicts

### Test Coverage Analysis

**Current Coverage Gaps:**

1. **Cache.getHeader():**
   - Missing: undefined value handling
   - Missing: null value handling
   - Missing: type validation

2. **Cache.getLastModified():**
   - Missing: undefined return value scenarios
   - Missing: integration with CacheableDataAccess

3. **Cache.getETag():**
   - Missing: undefined return value scenarios
   - Missing: integration with CacheableDataAccess

4. **CacheableDataAccess.getData():**
   - Missing: header assignment with undefined values
   - Missing: header assignment with null values
   - Missing: integration with APIRequest

5. **APIRequest:**
   - Missing: validation of header values before HTTP request
   - Missing: error handling for invalid header types

**Estimated Test Count for Full Coverage:**

- **Unit Tests:** 25-30 tests
  - getHeader(): 8 tests
  - getLastModified(): 4 tests
  - getETag(): 4 tests
  - CacheableDataAccess header assignment: 6 tests
  - Helper function validation: 5 tests

- **Integration Tests:** 10-12 tests
  - Cache → CacheableDataAccess: 4 tests
  - CacheableDataAccess → APIRequest: 4 tests
  - End-to-end with AWS mocks: 4 tests

- **Property-Based Tests:** 5 tests
  - One per correctness property

**Total:** 40-47 tests for comprehensive coverage

**This Spec:** 15-20 tests (focused on the bug fix)

## Implementation Notes

### Backwards Compatibility

**Guaranteed:**
- No changes to public API signatures
- No changes to exported classes or functions
- Valid header values behave identically
- Existing tests continue to pass

**Changes:**
- `getHeader()` now returns null instead of undefined for undefined values
- This is a **bug fix**, not a breaking change
- Applications checking `!== null` will now work correctly
- Applications checking `!== undefined` may need adjustment (but were already broken)

### Performance Impact

**Minimal:**
- One additional conditional check in getHeader()
- One additional variable assignment in CacheableDataAccess
- No additional AWS API calls
- No additional object allocations

**Estimated:** < 1μs per cache operation

### Security Considerations

**No Impact:**
- No changes to encryption or data handling
- No changes to AWS permissions
- No exposure of sensitive data
- No new attack vectors

### Migration Path

**For Users:**
1. Update to 1.3.7
2. No code changes required
3. Existing code works as-is
4. Bug is automatically fixed

**For Maintainers:**
1. Review and merge fix
2. Run full test suite
3. Update CHANGELOG.md
4. Release as PATCH version (1.3.7)

## Alternative Approaches Considered

### Alternative 1: Only Fix at Assignment Point

**Approach:** Leave getHeader() unchanged, only add undefined checks at assignment.

**Pros:**
- Minimal code change
- No risk to getHeader() behavior

**Cons:**
- Doesn't fix root cause
- Other code calling getHeader() still gets undefined
- Requires defensive checks everywhere getHeader() is used
- Doesn't prevent future bugs

**Decision:** Rejected. Fix should be at the source (getHeader()).

### Alternative 2: Use JSON.stringify() to Strip Undefined

**Approach:** Continue using JSON.stringify() instead of structuredClone() for headers.

**Pros:**
- Masks the undefined issue
- No code changes needed

**Cons:**
- Relies on side effect, not explicit behavior
- Loses other benefits of structuredClone()
- Doesn't fix the actual bug
- Fragile solution

**Decision:** Rejected. Fix the bug properly.

### Alternative 3: Throw Error on Undefined

**Approach:** Make getHeader() throw an error when encountering undefined.

**Pros:**
- Fails fast
- Makes bug obvious

**Cons:**
- Breaking change
- Requires major version bump
- Breaks existing code
- Too aggressive for a bug fix

**Decision:** Rejected. Too disruptive.

### Alternative 4: Add TypeScript

**Approach:** Convert to TypeScript to catch undefined at compile time.

**Pros:**
- Type safety
- Catches issues early

**Cons:**
- Major undertaking
- Breaking change for users
- Requires major version bump
- Out of scope for bug fix

**Decision:** Rejected. Too large for this fix.

## Conclusion

This design provides a minimal, backwards-compatible fix for the undefined header bug by:

1. Normalizing undefined to null in getHeader()
2. Adding defensive validation at header assignment points
3. Introducing Jest for better AWS integration testing
4. Providing comprehensive test coverage

The fix addresses the root cause while maintaining full backwards compatibility and requiring no changes from users.
