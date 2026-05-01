# Fix Flaky CI httpbin Tests — Bugfix Design

## Overview

The backwards compatibility test file `test/request/api-request-backwards-compat-tests.jest.mjs` contains 9 tests across 3 describe blocks that make real HTTP requests to `httpbin.org`. These tests fail intermittently in GitHub Actions CI because `httpbin.org` can be slow, rate-limited, or unavailable from CI runners. The fix replaces the real HTTP calls with mocked responses by spying on the internal `_httpGetExecute` function, which is the lowest-level HTTP call in the `ApiRequest` class. This approach tests the full `send()` → `send_get()` → `_handleRetries()` → `_httpGetExecute()` chain without requiring network access, while preserving all existing backwards compatibility assertions.

## Glossary

- **Bug_Condition (C)**: A test case that calls `ApiRequest.send()` with `host: 'httpbin.org'` and has no mock on the HTTP layer, causing it to make a real network request
- **Property (P)**: The test passes reliably without network dependency, while still validating the same backwards compatibility assertions (response format, metadata absence, status codes, timeout handling)
- **Preservation**: The 6 non-HTTP describe blocks (Constructor Compatibility, Static Method Compatibility, Public API Compatibility, Query String Building, Redirect Handling, Options Merging) must remain completely unchanged
- **`_httpGetExecute`**: The module-scoped function in `ApiRequest.class.js` that performs the actual `https.request` call. It is invoked by `_handleRetries()` and returns a Promise that resolves to `true` (complete) or `false` (redirect)
- **`ApiRequest.responseFormat`**: Static method returning `{ success, statusCode, message, headers, body }` — the standard response shape all tests assert against
- **`_handleRetries`**: Instance method on `ApiRequest` that loops calling `_httpGetExecute` until the request is complete, handling retry logic

## Bug Details

### Bug Condition

The bug manifests when any of the 9 HTTP-dependent tests run in a CI environment where `httpbin.org` is slow, rate-limited, or unavailable. The `ApiRequest.send()` method delegates through `send_get()` → `_handleRetries()` → `_httpGetExecute()`, which calls `https.request` against `httpbin.org`. When the external service is unreliable, the tests fail with network timeouts or unexpected HTTP status codes.

**Formal Specification:**
```
FUNCTION isBugCondition(T)
  INPUT: T of type TestCase
  OUTPUT: boolean

  RETURN T.describeBlock IN {
           "Response Format Compatibility",
           "Requests Without Pagination Behave Identically",
           "Requests Without Retry Behave Identically"
         }
    AND T.callsApiRequestSend = true
    AND T.requestHost = "httpbin.org"
    AND T.httpLayerIsMocked = false
END FUNCTION
```

### Examples

- **Response Format — `/status/200`**: Test expects `response.success === true`, `response.statusCode === 200`, and no `metadata` property. When `httpbin.org` is slow, the request times out and returns `{ success: false, statusCode: 504 }` instead.
- **Pagination disabled — `/get`**: Test expects `response.success === true` and no `metadata`. When `httpbin.org` rate-limits, it returns a 429 or 503, failing the assertion.
- **Retry — `/status/500`**: Test expects `response.success === false` and `statusCode >= 500 && < 600`. When `httpbin.org` is completely down, the request may timeout with 504 instead of returning the expected 500.
- **Timeout — `/delay/10`**: Test expects `response.success === false` and `statusCode === 504`. This test is the most reliable of the group since it intentionally triggers a timeout, but it still depends on `httpbin.org` being reachable to accept the connection.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The 6 non-HTTP describe blocks must continue to pass with zero modifications: Constructor Compatibility (5 tests), Static Method Compatibility (3 tests), Public API Compatibility (8 tests), Query String Building (4 tests), Redirect Handling (2 tests), Options Merging (3 tests)
- The `ApiRequest` production code must not be modified — only the test file changes
- The backwards compatibility assertions in the 9 HTTP tests must remain identical (same `expect` calls, same property checks, same value assertions)
- The `afterEach(() => jest.restoreAllMocks())` cleanup in the top-level describe must remain

**Scope:**
All test cases that do NOT call `ApiRequest.send()` with `httpbin.org` are completely unaffected by this fix. The fix only adds `beforeEach` mock setup within the 3 HTTP-dependent describe blocks.

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **External Service Dependency**: The 9 tests make real HTTP requests to `httpbin.org`, an external service not under our control. GitHub Actions runners have variable network conditions, and `httpbin.org` itself can be slow, rate-limited, or temporarily unavailable.

2. **No Mock Layer**: Unlike the other 6 describe blocks which test `ApiRequest` construction, static methods, and public API without making HTTP calls, these 3 describe blocks call `apiRequest.send()` which triggers the full HTTP request chain ending in `_httpGetExecute()` → `https.request()`.

3. **CI Environment Sensitivity**: The tests pass locally most of the time because local networks are typically faster and more reliable than CI runner networks. The flakiness is specific to the CI environment where network conditions are less predictable.

## Correctness Properties

Property 1: Bug Condition — Mocked HTTP Tests Pass Reliably

_For any_ test case in the 3 HTTP-dependent describe blocks ("Response Format Compatibility", "Requests Without Pagination Behave Identically", "Requests Without Retry Behave Identically"), the fixed test file SHALL pass reliably without making real HTTP requests, by mocking `_httpGetExecute` to simulate the expected `httpbin.org` responses while preserving all original backwards compatibility assertions.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Non-HTTP Tests Unchanged

_For any_ test case in the 6 non-HTTP describe blocks (Constructor Compatibility, Static Method Compatibility, Public API Compatibility, Query String Building, Redirect Handling, Options Merging), the fixed test file SHALL produce exactly the same test results as the original file, with zero modifications to those test blocks.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `test/request/api-request-backwards-compat-tests.jest.mjs`

**Approach**: Spy on `ApiRequest.prototype._httpGetExecute` (or the module-scoped `_httpGetExecute` function) to intercept HTTP calls and return mock responses. Since `_httpGetExecute` is a module-scoped function assigned as a property, the cleanest approach is to spy on the prototype or use `jest.spyOn` on the instance.

**Note on `_httpGetExecute` scope**: Looking at the source, `_httpGetExecute` is defined as a module-scoped `const` function expression (not a class method). It is called inside `_handleRetries` as `await _httpGetExecute(options, this, xRaySegment)`. Since it's module-scoped, we cannot directly spy on it from outside. However, we can mock at a higher level — spying on the `ApiRequest.prototype.send_get` or `ApiRequest.prototype._handleRetries` method, or we can mock the `https` module. The most practical approach is to mock `_handleRetries` on the prototype since it's an instance method we can spy on, and it's the method that calls `_httpGetExecute`.

**Specific Changes**:

1. **Add `beforeEach` mock to "Response Format Compatibility"**: Spy on `ApiRequest.prototype._handleRetries` to return mock responses simulating `httpbin.org` behavior for `/status/200` and `/get` endpoints. The mock should:
   - Return `{ success: true, statusCode: 200, message: "SUCCESS", headers: {...}, body: "..." }` for `/status/200` and `/get`
   - Return response without `metadata` property (matching original behavior when pagination/retry not used)
   - Set `this.#requestComplete` and `this.#response` appropriately via the existing response flow

2. **Add `beforeEach` mock to "Requests Without Pagination Behave Identically"**: Spy on `_handleRetries` to return mock responses for `/get` and `/headers` endpoints with `success: true, statusCode: 200`.

3. **Add `beforeEach` mock to "Requests Without Retry Behave Identically"**: Spy on `_handleRetries` to return mock responses:
   - `/status/200`: `{ success: true, statusCode: 200 }`
   - `/status/500`: `{ success: false, statusCode: 500 }`
   - `/delay/10` with 1000ms timeout: `{ success: false, statusCode: 504 }` (simulating timeout)

4. **Remove `httpbin.org` host references**: Change the `host` in request objects from `'httpbin.org'` to a non-routable host like `'mock.example.com'` or keep `'httpbin.org'` (since the HTTP layer is mocked, the host doesn't matter for the test assertions — but keeping it documents the original intent).

5. **Remove extended timeout values**: The `15000` ms Jest timeout overrides on the HTTP tests can be removed since mocked tests complete instantly.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, confirm the bug exists by observing flaky behavior on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the tests are indeed flaky due to external HTTP dependency.

**Test Plan**: Run the 9 HTTP-dependent tests multiple times on the UNFIXED code and observe intermittent failures. In CI, these tests fail when `httpbin.org` is slow or unavailable.

**Test Cases**:
1. **Response Format `/status/200` Test**: Run test — may fail with timeout (504) or unexpected status code when `httpbin.org` is slow (will fail intermittently on unfixed code)
2. **Pagination `/get` Test**: Run test — may fail with network error or unexpected status when `httpbin.org` rate-limits (will fail intermittently on unfixed code)
3. **Retry `/status/500` Test**: Run test — may fail with 504 timeout instead of expected 500 when `httpbin.org` is down (will fail intermittently on unfixed code)
4. **Timeout `/delay/10` Test**: Run test — may fail if `httpbin.org` refuses connection entirely (will fail intermittently on unfixed code)

**Expected Counterexamples**:
- Tests return 504 (timeout) instead of expected status codes
- Tests return network errors (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`)
- Possible causes: `httpbin.org` unavailability, CI network latency, rate limiting

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed tests pass reliably.

**Pseudocode:**
```
FOR ALL T WHERE isBugCondition(T) DO
  T' ← applyFix(T)  // Add _handleRetries mock
  result := runTest(T')
  ASSERT result.passed = true
    AND T'.httpLayerIsMocked = true
    AND T'.assertionsCoveredSameProperties = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed test file produces the same results as the original.

**Pseudocode:**
```
FOR ALL T WHERE NOT isBugCondition(T) DO
  ASSERT testCode(T, before_fix) = testCode(T, after_fix)
  ASSERT runTest(T, after_fix).passed = true
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It can generate many different test execution orderings to verify no interdependencies were introduced
- It catches edge cases where mock setup might leak into non-HTTP test blocks
- It provides strong guarantees that the 6 non-HTTP describe blocks are completely unaffected

**Test Plan**: Run the full test file after the fix and verify all 34 tests pass. Specifically verify the 25 non-HTTP tests produce identical results.

**Test Cases**:
1. **Constructor Compatibility Preservation**: Verify all 5 constructor tests pass identically after fix
2. **Static Method Preservation**: Verify all 3 static method tests pass identically after fix
3. **Public API Preservation**: Verify all 8 public API tests pass identically after fix
4. **Query String Preservation**: Verify all 4 query string tests pass identically after fix
5. **Redirect Handling Preservation**: Verify all 2 redirect tests pass identically after fix
6. **Options Merging Preservation**: Verify all 3 options merging tests pass identically after fix

### Unit Tests

- Verify each mocked HTTP test still asserts the same response format properties (`success`, `statusCode`, `headers`, `body`, `message`)
- Verify each mocked HTTP test still asserts absence of `metadata` when pagination/retry not used
- Verify the timeout simulation test returns `statusCode: 504` and `success: false`
- Verify the error status simulation test returns `statusCode: 500` and `success: false`

### Property-Based Tests

- Generate random test execution orders and verify all 34 tests pass regardless of order
- Verify that mock setup in HTTP describe blocks does not leak into non-HTTP describe blocks
- Verify that `jest.restoreAllMocks()` in `afterEach` properly cleans up mocks between tests

### Integration Tests

- Run the full test file end-to-end and verify all tests pass
- Run the full test file multiple times to confirm no flakiness
- Run the test file alongside other test files to verify no cross-file interference
