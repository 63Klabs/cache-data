# APIRequest.class Test Coverage Analysis

## Test Count Summary

**Total Test Cases in test/endpoint/api-request-tests.mjs: 20**

### Breakdown by Test Suite:
- **Call test endpoint using tools APIRequest class**: 10 tests
- **Test ConnectionAuthentication class**: 8 tests
- **Test APIRequest class**: 2 tests

## Test Coverage Areas

### 1. Basic Request Functionality (Covered)
- ✅ GET request with URI
- ✅ GET request with host and path
- ✅ GET request with host, path, and empty URI
- ✅ POST request with body
- ✅ GET request (explicit method test)

### 2. Header Handling (Covered)
- ✅ Custom headers passed along
- ✅ Authorization header
- ✅ User-Agent header
- ✅ Content-Type header

### 3. Parameter Handling (Covered)
- ✅ Parameters passed along with combined duplicates (CSV)
- ✅ Parameters passed along with separate duplicates
- ✅ Parameter encoding

### 4. Body Handling (Covered)
- ✅ Body passed in POST request
- ✅ Text/plain body

### 5. Response Handling (Covered)
- ✅ 200 Success response
- ✅ 404 Error response
- ✅ Response headers
- ✅ Response body parsing

### 6. Redirect Handling (Partial Coverage)
- ✅ No redirect scenario
- ❌ 301 Permanent redirect
- ❌ 302 Found redirect
- ❌ 303 See Other redirect
- ❌ 307 Temporary redirect
- ❌ Multiple redirects
- ❌ Max redirects exceeded (MAX_REDIRECTS = 5)
- ❌ Protocol downgrade prevention (https to http)

### 7. Timeout Handling (Covered)
- ✅ Timeout scenario with 504 response
- ✅ Console warning on timeout
- ✅ Minimum timeout value (8000ms default)

### 8. ConnectionAuthentication (Covered)
- ✅ Basic authentication
- ✅ Parameter-based authentication
- ✅ Parameter authentication with existing parameters
- ✅ Header-based authentication
- ✅ Header authentication with existing headers
- ✅ Body-based authentication
- ✅ Body authentication with existing body

### 9. APIRequest Class Methods (Covered)
- ✅ Getter methods (getMethod, getBody, getTimeOutInMilliseconds)
- ✅ Setter methods (constructor)
- ✅ Minimum timeout validation

## Untested Code Paths in src/lib/tools/APIRequest.class.js

### Critical Untested Paths:

1. **Redirect Handling (Lines ~100-150)**
   - 301 Permanent redirect processing
   - 302 Found redirect processing
   - 303 See Other redirect processing
   - 307 Temporary redirect processing
   - Max redirects exceeded error (> MAX_REDIRECTS)
   - Protocol downgrade prevention logic
   - Redirect logging (301 warning vs other redirects)

2. **304 Not Modified Response (Lines ~155-165)**
   - 304 status code handling
   - Null body for 304 response

3. **Error Handling Paths**
   - Response 'error' event handler (Line ~240)
   - Request 'error' event handler (Line ~280)
   - Error during response processing (Line ~220)
   - Error during callback (Line ~250)

4. **X-Ray Integration (Throughout)**
   - X-Ray subsegment creation
   - X-Ray annotations (response_status, request_method, etc.)
   - X-Ray metadata (http request/response)
   - X-Ray error tracking (addError, addFaultFlag, addErrorFlag)
   - X-Ray fault flags for 5xx errors
   - X-Ray error flags for 4xx errors
   - X-Ray segment closing

5. **Query String Building (Lines ~370-420)**
   - Array parameter handling with different delimiters
   - separateDuplicateParameters with '1++' option
   - separateDuplicateParameters with '[]' option
   - combinedDuplicateParameterDelimiter with '|' option
   - combinedDuplicateParameterDelimiter with ' ' option
   - Empty parameters object
   - Null parameters

6. **Request Methods**
   - PUT method (not implemented, Line ~500)
   - DELETE method (not implemented, Line ~500)
   - Other HTTP methods

7. **URI Construction**
   - URI with null host
   - URI with null path
   - URI with empty protocol
   - URI with null protocol

8. **Options Handling**
   - Null options object
   - Missing timeout in options
   - Timeout = 0 (should default to 8000)
   - Timeout < 0 (should default to 8000)

9. **Helper Methods**
   - resetRequest() method
   - updateRequestURI() method
   - addRedirect() method
   - getNumberOfRedirects() method
   - getURI(false) - without query string
   - getHost() method
   - getNote() method
   - toObject() method

10. **Edge Cases**
    - Empty body in POST request
    - Null headers
    - Empty headers object
    - Very long URI
    - Special characters in parameters
    - Unicode in parameters
    - Null note field

## Missing Test Cases Needed for Complete Coverage

### High Priority (Critical Functionality):

1. **Redirect Tests**
   ```javascript
   it('should handle 301 permanent redirect')
   it('should handle 302 found redirect')
   it('should handle 303 see other redirect')
   it('should handle 307 temporary redirect')
   it('should handle multiple redirects')
   it('should fail after MAX_REDIRECTS exceeded')
   it('should prevent protocol downgrade on redirect')
   it('should log warning for 301 redirects')
   ```

2. **304 Not Modified Test**
   ```javascript
   it('should handle 304 not modified with null body')
   ```

3. **Error Handling Tests**
   ```javascript
   it('should handle response error event')
   it('should handle request error event')
   it('should handle error during response processing')
   ```

4. **Query String Building Tests**
   ```javascript
   it('should handle array parameters with pipe delimiter')
   it('should handle array parameters with space delimiter')
   it('should handle separateDuplicateParameters with 1++ option')
   it('should handle separateDuplicateParameters with [] option')
   it('should handle empty parameters object')
   it('should handle null parameters')
   ```

5. **Helper Method Tests**
   ```javascript
   it('should reset request state')
   it('should update request URI')
   it('should track redirect count')
   it('should return URI without query string')
   it('should return host from URI')
   it('should return request object')
   ```

### Medium Priority (Edge Cases):

6. **URI Construction Tests**
   ```javascript
   it('should handle missing host')
   it('should handle missing path')
   it('should handle empty protocol')
   ```

7. **Options Handling Tests**
   ```javascript
   it('should handle null options')
   it('should handle missing timeout')
   it('should handle negative timeout')
   ```

8. **Edge Case Tests**
   ```javascript
   it('should handle null body in POST')
   it('should handle null headers')
   it('should handle empty headers')
   it('should handle special characters in parameters')
   it('should handle unicode in parameters')
   ```

### Low Priority (X-Ray Integration):

9. **X-Ray Tests** (if X-Ray is enabled)
   ```javascript
   it('should create X-Ray subsegment')
   it('should add X-Ray annotations')
   it('should add X-Ray metadata')
   it('should track errors in X-Ray')
   it('should set fault flag for 5xx errors')
   it('should set error flag for 4xx errors')
   ```

## Coverage Metrics Estimate

Based on the analysis:

- **Lines Covered**: ~60% (estimated)
- **Branches Covered**: ~50% (estimated)
- **Functions Covered**: ~70% (estimated)

**Key Gaps**:
- Redirect handling: 0% coverage
- 304 Not Modified: 0% coverage
- Error event handlers: 0% coverage
- X-Ray integration: 0% coverage
- Query string edge cases: ~30% coverage
- Helper methods: ~40% coverage

## Recommendations

1. **Immediate Priority**: Add redirect tests (301, 302, 303, 307, max redirects)
2. **High Priority**: Add 304 Not Modified test
3. **High Priority**: Add error handling tests
4. **Medium Priority**: Add query string edge case tests
5. **Medium Priority**: Add helper method tests
6. **Low Priority**: Add X-Ray integration tests (if applicable)

## Notes

- The existing tests focus primarily on happy path scenarios
- Most error paths are untested
- Redirect functionality is completely untested despite being a significant part of the code
- X-Ray integration is untested (may require mocking)
- Helper methods are untested but are used internally
- Query string building has partial coverage but missing edge cases

## Test Migration Impact

When migrating to Jest:
- All 20 existing tests should be migrated
- Approximately 15-20 additional tests should be added to cover gaps
- Total Jest tests should be ~35-40 for comprehensive coverage
- Focus on redirect handling, error paths, and edge cases
