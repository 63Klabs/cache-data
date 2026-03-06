# Implementation Plan

## Phase 1: Bug Condition Exploration Tests (BEFORE Fix)

### 1. Write Bug Condition Exploration Tests

**CRITICAL**: These tests MUST be written BEFORE implementing any fixes. They will FAIL on unfixed code - this is expected and confirms the bugs exist.

- [x] 1.1 Write exploration test for Defect 1: Multiple Placeholder Route Matching
  - **Property 1: Fault Condition** - Multiple Placeholder Route Matching Failure
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that routes with multiple placeholders fail to match
  - **Test File**: `test/request/validation/unit/multiple-placeholder-route-exploration.jest.mjs`
  - Test route pattern `users/{userId}/posts/{postId}` with request path `/users/123/posts/456`
  - Test route pattern `api/{version}/resources/{resourceId}/items/{itemId}` with 3+ placeholders
  - Assert that `isValid()` returns `true` for valid requests (will fail on unfixed code)
  - Assert that route matching works correctly (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "Route with 2 placeholders returns isValid()===false instead of true")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1_

- [x] 1.2 Write exploration test for Defect 2: Query String Parameter Extraction
  - **Property 1: Fault Condition** - Query Parameter Extraction Returns Empty Object
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that query parameters return {} instead of actual values
  - **Test File**: `test/request/validation/unit/query-parameter-extraction-exploration.jest.mjs`
  - Test validation rule `search?query,limit` with request query `{ query: 'test', limit: '10' }`
  - Test validation rule `filter?status,category,page` with multiple query parameters
  - Assert that `getQueryStringParameters()` returns actual parameter values (will fail on unfixed code)
  - Assert that validation passes and parameters are extracted (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "getQueryStringParameters() returns {} instead of {query:'test',limit:'10'}")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.2_

- [x] 1.3 Write exploration test for Defect 3: Header Parameter Extraction
  - **Property 1: Fault Condition** - Header Parameter Extraction Returns Empty Object
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that header parameters return {} instead of actual values
  - **Test File**: `test/request/validation/unit/header-parameter-extraction-exploration.jest.mjs`
  - Test validation rule for header parameters with request headers `{ 'content-type': 'application/json', 'authorization': 'Bearer token' }`
  - Test validation rule for multiple header parameters
  - Assert that `getHeaderParameters()` returns actual header values (will fail on unfixed code)
  - Assert that validation passes and headers are extracted (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "getHeaderParameters() returns {} instead of actual header values")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.3_

- [x] 1.4 Write exploration test for Defect 4: Duplicate Parameters
  - **Property 1: Fault Condition** - Duplicate Parameter Names in Validation Rules
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that rule.params contains duplicate parameter names
  - **Test File**: `test/request/validation/unit/duplicate-parameters-exploration.jest.mjs`
  - Test route pattern `product/{id}?key` and verify `rule.params` array
  - Test route pattern `users/{userId}?userId,status` (same name in path and query)
  - Assert that `rule.params` contains unique parameter names only (will fail on unfixed code)
  - Assert that validation interface selection works correctly (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "rule.params contains ['id','key','key'] instead of ['id','key']")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.4_

- [x] 1.5 Write exploration test for Defect 5: Missing getBodyParameters() Method
  - **Property 1: Fault Condition** - getBodyParameters() Method Does Not Exist
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that getBodyParameters() throws TypeError
  - **Test File**: `test/request/validation/unit/missing-body-parameters-method-exploration.jest.mjs`
  - Create ClientRequest instance
  - Attempt to call `request.getBodyParameters()`
  - Assert that method exists and returns an object (will fail on unfixed code with TypeError)
  - Assert that method signature matches other parameter getters (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS with TypeError (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "TypeError: request.getBodyParameters is not a function")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.5_

- [x] 1.6 Write exploration test for Defect 6: Method-and-Route Pattern Matching
  - **Property 1: Fault Condition** - Method-and-Route Patterns Fail to Match
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that method-and-route patterns fail to match
  - **Test File**: `test/request/validation/unit/method-route-pattern-exploration.jest.mjs`
  - Test route pattern `POST:product/{id}` with POST request to `/product/123`
  - Test route pattern `GET:users/{userId}` with GET request to `/users/456`
  - Test route pattern `PUT:items/{itemId}/status` with PUT request
  - Assert that route matches correctly (will fail on unfixed code)
  - Assert that validation applies correctly (will fail on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "POST:product/{id} fails to match POST /product/123")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.6_

## Phase 2: Preservation Property Tests (BEFORE Fix)

### 2. Write Preservation Property Tests

**CRITICAL**: These tests MUST be written BEFORE implementing fixes. They will PASS on unfixed code - this confirms baseline behavior to preserve.

- [x] 2.1 Write preservation test for single-placeholder routes
  - **Property 2: Preservation** - Single Placeholder Route Matching Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/single-placeholder-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for single-placeholder routes (e.g., `product/{id}`)
  - Write property-based test: for all single-placeholder routes, matching and validation work correctly
  - Use fast-check to generate various single-placeholder route patterns
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.1_

- [x] 2.2 Write preservation test for global validations
  - **Property 2: Preservation** - Global Parameter Validations Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/global-validation-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for global parameter validations (no BY_ROUTE or BY_METHOD)
  - Write property-based test: for all global validations, validation works correctly
  - Use fast-check to generate various global validation configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.2_

- [x] 2.3 Write preservation test for valid request handling
  - **Property 2: Preservation** - Valid Requests Return isValid()===true
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/valid-request-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for valid requests
  - Write property-based test: for all valid requests (matching all validation rules), isValid() returns true
  - Use fast-check to generate various valid request configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.3_

- [x] 2.4 Write preservation test for invalid request handling
  - **Property 2: Preservation** - Invalid Requests Return isValid()===false
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/invalid-request-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for invalid requests
  - Write property-based test: for all invalid requests (failing validation rules), isValid() returns false
  - Use fast-check to generate various invalid request configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.4_

- [x] 2.5 Write preservation test for path parameter extraction
  - **Property 2: Preservation** - Path Parameter Extraction Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/path-parameter-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for path parameter extraction
  - Write property-based test: for all validated path parameters, getPathParameters() returns correct values
  - Use fast-check to generate various path parameter configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.5_

- [x] 2.6 Write preservation test for excludeParamsWithNoValidationMatch flag
  - **Property 2: Preservation** - Exclude Unmatched Parameters Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/exclude-unmatched-preservation.jest.mjs`
  - Observe behavior on UNFIXED code when excludeParamsWithNoValidationMatch is true (default)
  - Write property-based test: for all requests with unmatched parameters, they are excluded from results
  - Use fast-check to generate various parameter configurations with and without validation rules
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.6_

- [ ] 2.7 Write preservation test for single-parameter validation interface
  - **Property 2: Preservation** - Single-Parameter Validation Interface Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/single-param-interface-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for single-parameter validation functions
  - Write property-based test: for all validation rules with single parameter, value is passed directly to validation function
  - Use fast-check to generate various single-parameter validation configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.7_

- [ ] 2.8 Write preservation test for multi-parameter validation interface
  - **Property 2: Preservation** - Multi-Parameter Validation Interface Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test File**: `test/request/validation/property/multi-param-interface-preservation.jest.mjs`
  - Observe behavior on UNFIXED code for multi-parameter validation functions (with correct parameter lists)
  - Write property-based test: for all validation rules with multiple parameters (no duplicates), object with all parameter names is passed to validation function
  - Use fast-check to generate various multi-parameter validation configurations
  - Verify test PASSES on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline behavior to preserve)
  - Mark task complete when test is written, run, and passing on unfixed code
  - _Requirements: 3.8_

## Phase 3: Implementation

### 3. Fix ValidationMatcher Class

- [ ] 3.1 Fix #routeMatches() for multiple placeholders
  - **File**: `src/lib/utils/ValidationMatcher.class.js` (lines 119-148)
  - Review segment-by-segment comparison logic
  - Ensure placeholder detection works correctly for all segments
  - Verify normalized routes are compared correctly
  - Add explicit handling for multiple consecutive placeholders
  - Test with various multi-placeholder patterns
  - _Bug_Condition: Route patterns with multiple placeholders (e.g., users/{userId}/posts/{postId}) fail to match request paths_
  - _Expected_Behavior: Route matching works correctly for any number of placeholders_
  - _Preservation: Single-placeholder routes continue to match correctly_
  - _Requirements: 2.1, 3.1_

- [ ] 3.2 Fix #extractParamNames() to remove duplicates
  - **File**: `src/lib/utils/ValidationMatcher.class.js` (lines 308-345)
  - After extracting path and query parameters, deduplicate the results
  - Use Set or filter to ensure unique parameter names
  - Maintain order of parameters (path parameters first, then query parameters)
  - Example: `return [...new Set(params)]`
  - Test with route patterns containing duplicate parameter names
  - _Bug_Condition: rule.params arrays contain duplicate parameter names (e.g., ['id','key','key'])_
  - _Expected_Behavior: rule.params contains unique parameter names only_
  - _Preservation: Existing parameter extraction for non-duplicate cases unchanged_
  - _Requirements: 2.4, 3.1_

- [ ] 3.3 Fix #findMethodRouteMatch() for method-and-route patterns
  - **File**: `src/lib/utils/ValidationMatcher.class.js` (lines 150-195)
  - Review method prefix extraction logic (line 167)
  - Ensure route part is correctly extracted after splitting on `:`
  - Verify route normalization works correctly for method-and-route patterns
  - Check that route matching logic handles extracted route part correctly
  - Test with various method-and-route patterns (GET, POST, PUT, DELETE)
  - _Bug_Condition: Method-and-route patterns (e.g., POST:product/{id}) fail to match_
  - _Expected_Behavior: Method-and-route patterns match correctly when method and path match_
  - _Preservation: Existing route matching without method prefix unchanged_
  - _Requirements: 2.6, 3.1_

- [ ] 3.4 Verify bug condition exploration tests now pass
  - **Property 1: Expected Behavior** - All Bug Conditions Fixed
  - **IMPORTANT**: Re-run the SAME tests from Phase 1 - do NOT write new tests
  - Run all exploration tests from tasks 1.1-1.6
  - **EXPECTED OUTCOME**: All tests PASS (confirms bugs are fixed)
  - Verify multiple placeholder routes match correctly
  - Verify no duplicate parameters in rule.params
  - Verify method-and-route patterns match correctly
  - _Requirements: 2.1, 2.4, 2.6_

### 4. Fix ClientRequest Class

- [ ] 4.1 Fix #hasValidParameters() parameter extraction logic
  - **File**: `src/lib/tools/ClientRequest.class.js` (lines 698-728)
  - Review how ValidationExecutor.execute() results are processed
  - Ensure that when validation passes, parameter values are added to rValue.params
  - Verify parameter key and value are correctly extracted from clientParameters
  - Check that loop doesn't exit early when it should continue processing
  - Test with various parameter configurations
  - _Bug_Condition: Parameter extraction fails when validation rules exist_
  - _Expected_Behavior: Validated parameters are correctly extracted and returned_
  - _Preservation: Existing parameter extraction for working scenarios unchanged_
  - _Requirements: 2.2, 2.3, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.2 Fix #hasValidQueryStringParameters() parameter extraction
  - **File**: `src/lib/tools/ClientRequest.class.js` (lines 730-745)
  - Apply fix from task 4.1 to ensure query parameters are extracted
  - Verify that this.#props.queryStringParameters is populated with actual values
  - Test with various query parameter configurations
  - _Bug_Condition: getQueryStringParameters() returns {} when validation rules exist_
  - _Expected_Behavior: getQueryStringParameters() returns actual query parameter values_
  - _Preservation: Query parameter extraction for non-validated parameters unchanged_
  - _Requirements: 2.2, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.3 Fix #hasValidHeaderParameters() parameter extraction
  - **File**: `src/lib/tools/ClientRequest.class.js` (lines 747-759)
  - Apply fix from task 4.1 to ensure header parameters are extracted
  - Verify that this.#props.headerParameters is populated with actual values
  - Test with various header parameter configurations
  - _Bug_Condition: getHeaderParameters() returns {} when validation rules exist_
  - _Expected_Behavior: getHeaderParameters() returns actual header parameter values_
  - _Preservation: Header parameter extraction for non-validated parameters unchanged_
  - _Requirements: 2.3, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.4 Add getBodyParameters() method
  - **File**: `src/lib/tools/ClientRequest.class.js` (after line 847)
  - Implement missing method following same pattern as other parameter getters
  - Return this.#props.bodyParameters (or empty object {} if not implemented)
  - Add JSDoc documentation matching other parameter getter methods
  - Example implementation:
    ```javascript
    /**
     * Returns the body parameters received in the request.
     * Body parameters are validated in the applications validation functions.
     * @returns {object} body parameters
     */
    getBodyParameters() {
        return this.#props.bodyParameters || {};
    }
    ```
  - Test that method exists and returns expected structure
  - _Bug_Condition: getBodyParameters() method does not exist (TypeError)_
  - _Expected_Behavior: getBodyParameters() method exists and returns object_
  - _Preservation: Other parameter getter methods unchanged_
  - _Requirements: 2.5_

- [ ] 4.5 Verify bug condition exploration tests now pass
  - **Property 1: Expected Behavior** - All Parameter Extraction Fixed
  - **IMPORTANT**: Re-run the SAME tests from Phase 1 - do NOT write new tests
  - Run exploration tests from tasks 1.2, 1.3, 1.5
  - **EXPECTED OUTCOME**: All tests PASS (confirms bugs are fixed)
  - Verify query parameters extract correctly
  - Verify header parameters extract correctly
  - Verify getBodyParameters() method exists
  - _Requirements: 2.2, 2.3, 2.5_

### 5. Verify Preservation Tests Still Pass

- [ ] 5.1 Re-run all preservation property tests
  - **Property 2: Preservation** - No Regressions in Existing Behavior
  - **IMPORTANT**: Re-run the SAME tests from Phase 2 - do NOT write new tests
  - Run all preservation tests from tasks 2.1-2.8
  - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
  - Verify single-placeholder routes still work
  - Verify global validations still work
  - Verify valid/invalid request handling unchanged
  - Verify path parameter extraction unchanged
  - Verify excludeParamsWithNoValidationMatch flag unchanged
  - Verify single-parameter validation interface unchanged
  - Verify multi-parameter validation interface unchanged
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

## Phase 4: Integration Testing

### 6. Integration Tests

- [ ] 6.1 Write integration test for complex validation scenarios
  - **Test File**: `test/request/validation/integration/complex-validation-integration.jest.mjs`
  - Test full ClientRequest validation flow with multiple placeholders
  - Test validation with all parameter types (path, query, header, cookie, body)
  - Test validation priority order (Method-and-Route > Route > Method > Global)
  - Test that validated parameters are correctly returned from all getter methods
  - Test that invalid parameters are correctly excluded
  - Verify all fixes work together correctly
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 6.2 Write integration test for real-world API Gateway scenarios
  - **Test File**: `test/request/validation/integration/api-gateway-scenarios-integration.jest.mjs`
  - Test realistic API Gateway request structures
  - Test complex route patterns from real applications
  - Test edge cases (empty parameters, null values, malformed patterns)
  - Test error handling and graceful degradation
  - Verify fixes work in production-like scenarios
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

## Phase 5: Documentation

### 7. Update Documentation

- [ ] 7.1 Update JSDoc for modified methods
  - Update JSDoc for ValidationMatcher#routeMatches()
  - Update JSDoc for ValidationMatcher#extractParamNames()
  - Update JSDoc for ValidationMatcher#findMethodRouteMatch()
  - Update JSDoc for ClientRequest#hasValidParameters()
  - Update JSDoc for ClientRequest#hasValidQueryStringParameters()
  - Update JSDoc for ClientRequest#hasValidHeaderParameters()
  - Add JSDoc for new ClientRequest#getBodyParameters() method
  - Ensure all parameter names match function signatures exactly
  - Ensure all return types match actual return values
  - _Requirements: All_

- [ ] 7.2 Update CHANGELOG.md
  - Add entry for version 1.3.9
  - Document all 6 bug fixes under "Fixed" section
  - Include examples of affected scenarios
  - Note that fixes maintain backwards compatibility
  - _Requirements: All_

- [ ] 7.3 Update user documentation if needed
  - Review README.md for any mentions of validation behavior
  - Update examples if they demonstrate affected scenarios
  - Add notes about multi-placeholder route support
  - Add notes about method-and-route pattern support
  - _Requirements: All_

## Phase 6: Final Validation

### 8. Checkpoint - Ensure All Tests Pass

- [ ] 8.1 Run full test suite
  - Run `npm run test:all` (both Mocha and Jest)
  - Verify all existing tests still pass
  - Verify all new exploration tests pass
  - Verify all new preservation tests pass
  - Verify all new integration tests pass
  - Ensure no test failures or regressions
  - _Requirements: All_

- [ ] 8.2 Run documentation validation
  - Run `npm test -- test/documentation/`
  - Run `node scripts/audit-documentation.mjs`
  - Verify all JSDoc is accurate and complete
  - Verify no documentation validation errors
  - _Requirements: All_

- [ ] 8.3 Final review and user confirmation
  - Review all changes for backwards compatibility
  - Verify all 6 defects are fixed
  - Verify no regressions in existing functionality
  - Ask user if any questions or concerns arise
  - Confirm ready for release
  - _Requirements: All_
