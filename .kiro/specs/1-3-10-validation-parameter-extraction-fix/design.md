# Validation Parameter Extraction Fix - Bugfix Design

## Overview

The ClientRequest validation system has a critical bug in the `#hasValidParameters()` method that prevents parameter extraction when validation rules exist and validation passes. This bug causes validated parameters to be lost, resulting in empty objects being returned from parameter getter methods (`getQueryStringParameters()`, `getHeaderParameters()`, `getBodyParameters()`, `getPathParameters()`).

The validation system correctly validates parameters using ValidationMatcher and ValidationExecutor, but fails to extract and store the validated parameter values. This renders the validation system unusable in production, as applications cannot access the validated request data they need to process API Gateway requests.

This bugfix addresses the parameter extraction logic in `#hasValidParameters()` to ensure that when validation passes, the validated parameter values are properly extracted and stored for retrieval by the getter methods.

## Glossary

- **Bug_Condition (C)**: The condition that triggers parameter extraction failure - when validation rules exist, validation passes, but parameter getter methods return empty objects instead of validated parameter values
- **Property (P)**: The desired behavior - when validation passes, parameter getter methods return the actual validated parameter values
- **Preservation**: Existing behavior for validation failures, missing validation rules, and the excludeParamsWithNoValidationMatch flag must remain unchanged
- **#hasValidParameters()**: Private method in ClientRequest that validates parameters and extracts validated values
- **ValidationMatcher**: Internal class that finds the best matching validation rule using four-tier priority (Method-and-Route > Route > Method > Global)
- **ValidationExecutor**: Internal class that executes validation functions with appropriate interfaces (single-parameter or multi-parameter)
- **Validated Parameters**: Parameters that have passed validation and should be available via getter methods
- **Parameter Extraction**: The process of collecting validated parameter values into the result object returned by `#hasValidParameters()`

## Bug Details

### Bug Condition

The bug manifests when validation rules exist and validation passes, but the validated parameter values are not extracted and stored.

**Current Defective Behavior:**
The `#hasValidParameters()` method (lines 698-728 in ClientRequest.class.js) has a critical flaw in its parameter extraction logic. When a validation rule is found and validation passes, the method should add the parameter to `rValue.params`, but the current implementation fails to do this correctly.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type {
    paramValidations: Object,
    clientParameters: Object,
    validationMatcher: ValidationMatcher
  }
  OUTPUT: boolean
  
  RETURN (
    hasValidationRules(input.paramValidations)
    AND validationPasses(input.clientParameters, input.paramValidations)
    AND extractedParameters(input) === {}
  )
END FUNCTION
```

### Examples

**Example 1: Query String Parameter Extraction Failure**
```javascript
// Configuration
ClientRequest.init({
  parameters: {
    queryStringParameters: {
      query: (value) => typeof value === 'string' && value.length > 0,
      limit: (value) => !isNaN(value) && value > 0
    }
  }
});

// Request
const event = {
  httpMethod: 'GET',
  resource: '/search',
  queryStringParameters: {
    query: 'test',
    limit: '10'
  }
};

const request = new ClientRequest(event, context);

// Expected behavior
request.isValid(); // true (validation passes)
request.getQueryStringParameters(); // { query: 'test', limit: '10' }

// Actual behavior (BUG)
request.isValid(); // true (validation passes)
request.getQueryStringParameters(); // {} (empty object - parameters lost!)
```

**Example 2: Header Parameter Extraction Failure**
```javascript
// Configuration
ClientRequest.init({
  parameters: {
    headerParameters: {
      authorization: (value) => value.startsWith('Bearer '),
      contentType: (value) => value === 'application/json'
    }
  }
});

// Request
const event = {
  httpMethod: 'POST',
  resource: '/api/data',
  headers: {
    'authorization': 'Bearer token123',
    'content-type': 'application/json'
  }
};

const request = new ClientRequest(event, context);

// Expected behavior
request.isValid(); // true
request.getHeaderParameters(); // { authorization: 'Bearer token123', contentType: 'application/json' }

// Actual behavior (BUG)
request.isValid(); // true
request.getHeaderParameters(); // {} (empty object - headers lost!)
```

**Example 3: Body Parameter Extraction Failure**
```javascript
// Configuration
ClientRequest.init({
  parameters: {
    bodyParameters: {
      name: (value) => typeof value === 'string' && value.length > 0,
      email: (value) => value.includes('@')
    }
  }
});

// Request
const event = {
  httpMethod: 'POST',
  resource: '/users',
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
};

const request = new ClientRequest(event, context);

// Expected behavior
request.isValid(); // true
request.getBodyParameters(); // { name: 'John Doe', email: 'john@example.com' }

// Actual behavior (BUG)
request.isValid(); // true
request.getBodyParameters(); // {} (empty object - body data lost!)
```

**Example 4: Path Parameter Extraction with Multiple Placeholders**
```javascript
// Configuration
ClientRequest.init({
  parameters: {
    pathParameters: {
      BY_ROUTE: [
        {
          route: 'users/{userId}/posts/{postId}',
          validate: ({userId, postId}) => {
            return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
          }
        }
      ]
    }
  }
});

// Request
const event = {
  httpMethod: 'GET',
  resource: '/users/{userId}/posts/{postId}',
  pathParameters: {
    userId: '123',
    postId: '456'
  }
};

const request = new ClientRequest(event, context);

// Expected behavior
request.isValid(); // true
request.getPathParameters(); // { userId: '123', postId: '456' }

// Actual behavior (BUG)
request.isValid(); // true
request.getPathParameters(); // {} (empty object - path params lost!)
```

**Example 5: Multi-Parameter Validation Extraction Failure**
```javascript
// Configuration
ClientRequest.init({
  parameters: {
    queryStringParameters: {
      BY_ROUTE: [
        {
          route: 'search?query,limit',
          validate: ({query, limit}) => {
            return query.length > 0 && limit >= 1 && limit <= 100;
          }
        }
      ]
    }
  }
});

// Request
const event = {
  httpMethod: 'GET',
  resource: '/search',
  queryStringParameters: {
    query: 'test',
    limit: '10'
  }
};

const request = new ClientRequest(event, context);

// Expected behavior
request.isValid(); // true
request.getQueryStringParameters(); // { query: 'test', limit: '10' }

// Actual behavior (BUG)
request.isValid(); // true
request.getQueryStringParameters(); // {} (empty object - both params lost!)
```

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When validation fails, parameter getter methods must continue to return empty objects
- When no validation rules exist and excludeParamsWithNoValidationMatch is true (default), parameter getter methods must continue to return empty objects
- When excludeParamsWithNoValidationMatch is false, unvalidated parameters must continue to be included
- The validation logic itself (ValidationMatcher and ValidationExecutor) must remain unchanged
- The isValid() method behavior must remain unchanged
- Single-parameter validation interface (passing value directly) must continue to work
- Multi-parameter validation interface (passing object) must continue to work

**Scope:**
All inputs that do NOT have validation rules configured, or where validation fails, should be completely unaffected by this fix. This includes:
- Requests with no validation rules configured
- Requests that fail validation
- Requests where excludeParamsWithNoValidationMatch is false
- The validation matching and execution logic

## Hypothesized Root Cause

Based on code analysis of the `#hasValidParameters()` method in ClientRequest.class.js (lines 698-877), the root cause is:

**Root Cause**: The `#hasValidParameters()` method fails to extract validated parameters when validation rules exist and validation passes.

**Specific Issue**: After ValidationExecutor.execute() returns `true` (indicating validation passed), the method should add the validated parameter to `rValue.params`. However, the current implementation at lines 862-863 only adds the parameter when `isValid` is true:

```javascript
if (isValid) {
    rValue.params[paramKey] = paramValue;
}
```

The problem is that this code is inside the loop that iterates over `clientParameters`, but when a validation rule is found, the code executes validation and then should extract ALL parameters specified in `rule.params`, not just the current `paramKey`.

**For single-parameter validation**, this works because `rule.params` contains only the current parameter name.

**For multi-parameter validation**, this fails because:
1. The validation function receives an object with multiple parameters (e.g., `{query: 'test', limit: '10'}`)
2. ValidationExecutor.execute() returns `true` if the validation passes
3. But the code only adds the current `paramKey` to `rValue.params`, not all parameters in `rule.params`
4. The loop continues, but subsequent parameters may not have their own validation rules, so they're skipped

**Additional Issue**: The parameter extraction logic doesn't correctly handle the case where a validation rule applies to multiple parameters. When `rule.params` contains multiple parameter names (e.g., `['query', 'limit']`), the code should extract ALL of those parameters from `clientParameters` and add them to `rValue.params`, not just the one that triggered the validation rule match.

**Evidence from Code**:
- Line 862-863: Only adds `paramKey` to `rValue.params`, not all parameters in `rule.params`
- Line 858: ValidationExecutor.execute() is called with `rule.params` and `normalizedParams`, but the result is only used to add a single parameter
- Lines 730-745 (#hasValidQueryStringParameters): Calls `#hasValidParameters()` and assigns result to `this.#props.queryStringParameters`, expecting validated parameters
- Lines 747-759 (#hasValidHeaderParameters): Same pattern as query string parameters
- Lines 761-777 (#hasValidBodyParameters): Same pattern as body parameters

## Correctness Properties

Property 1: Bug Condition - Query String Parameter Extraction

_For any_ request where validation rules exist for query string parameters and validation passes, the fixed #hasValidParameters() method SHALL extract and return all validated query string parameter values, making them available via getQueryStringParameters().

**Validates: Requirements 2.1**

Property 2: Bug Condition - Header Parameter Extraction

_For any_ request where validation rules exist for header parameters and validation passes, the fixed #hasValidParameters() method SHALL extract and return all validated header parameter values, making them available via getHeaderParameters().

**Validates: Requirements 2.2**

Property 3: Bug Condition - Body Parameter Extraction

_For any_ request where validation rules exist for body parameters and validation passes, the fixed #hasValidParameters() method SHALL extract and return all validated body parameter values, making them available via getBodyParameters().

**Validates: Requirements 2.3**

Property 4: Bug Condition - Path Parameter Extraction with Multiple Placeholders

_For any_ request where validation rules exist for path parameters with multiple placeholders and validation passes, the fixed #hasValidParameters() method SHALL extract and return all validated path parameter values, making them available via getPathParameters().

**Validates: Requirements 2.4**

Property 5: Bug Condition - BY_ROUTE Validation with Multiple Placeholders

_For any_ request where BY_ROUTE validation rules are configured with multiple placeholders and validation passes, the fixed #hasValidParameters() method SHALL extract all validated parameters and return isValid() === true.

**Validates: Requirements 2.5**

Property 6: Bug Condition - Multi-Parameter Validation Extraction

_For any_ request where multi-parameter validation is configured (e.g., route?param1,param2) and validation passes, the fixed #hasValidParameters() method SHALL extract all validated parameters specified in the validation rule.

**Validates: Requirements 2.6**

Property 7: Bug Condition - Method-and-Route Pattern Extraction

_For any_ request where method-and-route patterns are configured (e.g., POST:product/{id}) and validation passes, the fixed #hasValidParameters() method SHALL extract all validated parameters.

**Validates: Requirements 2.7**

Property 8: Bug Condition - Validation Priority Order Extraction

_For any_ request where validation priority order applies (Method-and-Route > Route > Method > Global) and validation passes, the fixed #hasValidParameters() method SHALL extract parameters using the highest-priority matching validation rule.

**Validates: Requirements 2.8**

Property 9: Preservation - No Validation Rules

_For any_ request where no validation rules exist for parameters, the fixed #hasValidParameters() method SHALL continue to return empty objects (when excludeParamsWithNoValidationMatch is true), maintaining existing behavior.

**Validates: Requirements 3.1**

Property 10: Preservation - Validation Failure

_For any_ request where validation fails for any parameter, the fixed #hasValidParameters() method SHALL continue to return isValid: false and empty parameter objects, maintaining existing behavior.

**Validates: Requirements 3.2**

Property 11: Preservation - Exclude Unmatched Flag

_For any_ request when excludeParamsWithNoValidationMatch flag is false, the fixed #hasValidParameters() method SHALL continue to include unvalidated parameters in the results, maintaining existing behavior.

**Validates: Requirements 3.3**

Property 12: Preservation - Single-Parameter Validation Interface

_For any_ validation rule with a single parameter, the fixed #hasValidParameters() method SHALL continue to pass the value directly to the validation function via ValidationExecutor, maintaining existing behavior.

**Validates: Requirements 3.4**

Property 13: Preservation - Path Parameters Without BY_ROUTE

_For any_ request where path parameters are validated successfully without BY_ROUTE rules, the fixed #hasValidParameters() method SHALL continue to return them from getPathParameters(), maintaining existing behavior.

**Validates: Requirements 3.5**

Property 14: Preservation - Referrer Validation

_For any_ request where referrer validation fails, the fixed ClientRequest SHALL continue to return isValid() === false regardless of parameter validation, maintaining existing behavior.

**Validates: Requirements 3.6**

Property 15: Preservation - Single Placeholder Routes

_For any_ request where route patterns have single placeholders, the fixed #hasValidParameters() method SHALL continue to match and validate correctly, maintaining existing behavior.

**Validates: Requirements 3.7**

Property 16: Preservation - Global Parameter Validation

_For any_ request where global parameter validation is used (no BY_ROUTE or BY_METHOD), the fixed #hasValidParameters() method SHALL continue to validate and extract parameters correctly, maintaining existing behavior.

**Validates: Requirements 3.8**

Property 17: Preservation - No Duplicate Parameters

_For any_ validation rules that contain no duplicate parameters, the fixed #hasValidParameters() method SHALL continue to work correctly, maintaining existing behavior.

**Validates: Requirements 3.9**

Property 18: Preservation - getBodyParameters() Method

_For any_ ClientRequest instance, the getBodyParameters() method SHALL continue to return an object (not throw TypeError), maintaining existing behavior.

**Validates: Requirements 3.10**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/ClientRequest.class.js`

**Function**: `#hasValidParameters()` (lines 698-877)

**Specific Changes**:

1. **Fix Parameter Extraction Logic for Multi-Parameter Validation**:
   - When ValidationExecutor.execute() returns `true`, extract ALL parameters specified in `rule.params`, not just the current `paramKey`
   - Iterate over `rule.params` array and add each parameter from `clientParameters` to `rValue.params`
   - Ensure parameter values are correctly extracted from the normalized parameter map

2. **Current Code (DEFECTIVE)**:
   ```javascript
   // Line 858-863 (approximate)
   const isValid = ValidationExecutor.execute(rule.validate, rule.params, normalizedParams);
   
   if (isValid) {
       rValue.params[paramKey] = paramValue;  // BUG: Only adds current paramKey
   } else {
       // ... error handling
   }
   ```

3. **Fixed Code (CORRECT)**:
   ```javascript
   const isValid = ValidationExecutor.execute(rule.validate, rule.params, normalizedParams);
   
   if (isValid) {
       // >! Extract ALL parameters specified in rule.params, not just paramKey
       // >! This handles both single-parameter and multi-parameter validation
       for (const ruleParamName of rule.params) {
           // >! Find the parameter value in clientParameters
           // >! Use normalized key matching to handle case differences
           const normalizedRuleParam = ruleParamName.replace(/^\/|\/$/g, '');
           
           // >! Search for matching parameter in clientParameters
           for (const [clientKey, clientValue] of Object.entries(clientParameters)) {
               const normalizedClientKey = clientKey.replace(/^\/|\/$/g, '');
               
               if (normalizedClientKey === normalizedRuleParam) {
                   rValue.params[clientKey] = clientValue;
                   break;
               }
           }
       }
   } else {
       // ... existing error handling
   }
   ```

4. **Alternative Simpler Fix** (if normalized params already contain correct keys):
   ```javascript
   const isValid = ValidationExecutor.execute(rule.validate, rule.params, normalizedParams);
   
   if (isValid) {
       // >! Extract ALL parameters specified in rule.params
       for (const ruleParamName of rule.params) {
           // >! Get value from clientParameters using original key
           if (clientParameters[paramKey] !== undefined) {
               rValue.params[paramKey] = clientParameters[paramKey];
           }
           
           // >! Also check if ruleParamName matches any other parameter
           for (const [clientKey, clientValue] of Object.entries(clientParameters)) {
               const normalizedClientKey = clientKey.replace(/^\/|\/$/g, '');
               const normalizedRuleParam = ruleParamName.replace(/^\/|\/$/g, '');
               
               if (normalizedClientKey === normalizedRuleParam) {
                   rValue.params[clientKey] = clientValue;
               }
           }
       }
   } else {
       // ... existing error handling
   }
   ```

5. **Handle Loop Continuation**:
   - After extracting all parameters from a validation rule, the loop should continue to check remaining parameters
   - However, parameters that have already been validated should not be validated again
   - Consider tracking which parameters have been processed to avoid duplicate validation

6. **Ensure Early Exit on Validation Failure**:
   - The existing code at line 870 has an early exit: `return rValue;`
   - This should remain to ensure that when validation fails, no parameters are extracted
   - Verify this behavior is preserved in the fix

### Implementation Approach

The fix should follow this logic:

1. **For each parameter in clientParameters**:
   - Find the best matching validation rule using ValidationMatcher
   - If a rule is found:
     - Execute validation using ValidationExecutor with all parameters in rule.params
     - If validation passes:
       - Extract ALL parameters specified in rule.params from clientParameters
       - Add them to rValue.params
       - Mark these parameters as processed (to avoid re-validation)
     - If validation fails:
       - Set rValue.isValid = false
       - Clear rValue.params
       - Return immediately (early exit)
   - If no rule is found:
     - If excludeUnmatched is false, include the parameter
     - If excludeUnmatched is true, skip the parameter

2. **Track Processed Parameters**:
   - Use a Set to track which parameters have been validated
   - Skip parameters that have already been processed
   - This prevents duplicate validation and ensures each parameter is validated only once

3. **Maintain Backwards Compatibility**:
   - Single-parameter validation should work exactly as before
   - Multi-parameter validation should now correctly extract all parameters
   - Validation failure behavior should remain unchanged
   - excludeParamsWithNoValidationMatch flag behavior should remain unchanged

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that configure validation rules, send valid requests, and assert that parameter getter methods return the actual parameter values. Run these tests on the UNFIXED code to observe failures (empty objects returned).

**Test Cases**:
1. **Query String Parameter Extraction Test**: Configure validation for `query` and `limit` parameters, send request with valid values, assert `getQueryStringParameters()` returns `{query: 'test', limit: '10'}` (will fail on unfixed code, returning `{}`)

2. **Header Parameter Extraction Test**: Configure validation for `authorization` and `contentType` headers, send request with valid headers, assert `getHeaderParameters()` returns actual header values (will fail on unfixed code, returning `{}`)

3. **Body Parameter Extraction Test**: Configure validation for `name` and `email` body parameters, send request with valid JSON body, assert `getBodyParameters()` returns actual body values (will fail on unfixed code, returning `{}`)

4. **Path Parameter Extraction with Multiple Placeholders Test**: Configure BY_ROUTE validation for `users/{userId}/posts/{postId}`, send request to `/users/123/posts/456`, assert `getPathParameters()` returns `{userId: '123', postId: '456'}` (will fail on unfixed code, returning `{}`)

5. **Multi-Parameter Validation Extraction Test**: Configure BY_ROUTE validation for `search?query,limit` with multi-parameter validation function, send request with both parameters, assert `getQueryStringParameters()` returns both parameters (will fail on unfixed code, returning `{}`)

6. **Method-and-Route Pattern Extraction Test**: Configure BY_ROUTE validation for `POST:product/{id}`, send POST request to `/product/123`, assert `getPathParameters()` returns `{id: '123'}` (will fail on unfixed code, returning `{}`)

7. **Validation Priority Order Extraction Test**: Configure multiple validation rules at different priority levels, send request that matches highest priority, assert parameters are extracted using highest-priority rule (will fail on unfixed code, returning `{}`)

**Expected Counterexamples**:
- All parameter getter methods return `{}` when they should return actual validated parameter values
- `isValid()` returns `true` but parameters are lost
- Multi-parameter validation passes but only one parameter (or none) is extracted

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := hasValidParameters_fixed(input)
  ASSERT result.isValid === true
  ASSERT result.params contains all validated parameters
  ASSERT getParameterMethod() returns actual parameter values
END FOR
```

**Test Cases**:
1. **Query String Parameters**: Test various query parameter configurations and verify all are extracted correctly
2. **Header Parameters**: Test various header parameter configurations and verify all are extracted correctly
3. **Body Parameters**: Test various body parameter configurations and verify all are extracted correctly
4. **Path Parameters with Multiple Placeholders**: Test various multi-placeholder patterns and verify all path parameters are extracted
5. **Multi-Parameter Validation**: Test various multi-parameter validation rules and verify all specified parameters are extracted
6. **Method-and-Route Patterns**: Test various method-and-route patterns and verify parameters are extracted correctly
7. **Validation Priority Order**: Test that parameters are extracted using the highest-priority matching rule

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT hasValidParameters_original(input) = hasValidParameters_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for validation failures, missing validation rules, and excludeParamsWithNoValidationMatch flag, then write property-based tests capturing that behavior.

**Test Cases**:
1. **No Validation Rules Preservation**: Verify that when no validation rules exist, parameter getter methods continue to return empty objects (when excludeParamsWithNoValidationMatch is true)
2. **Validation Failure Preservation**: Verify that when validation fails, parameter getter methods continue to return empty objects
3. **Exclude Unmatched Flag Preservation**: Verify that excludeParamsWithNoValidationMatch flag continues to work correctly
4. **Single-Parameter Validation Preservation**: Verify that single-parameter validation continues to work exactly as before
5. **Path Parameters Without BY_ROUTE Preservation**: Verify that path parameter extraction without BY_ROUTE rules continues to work
6. **Referrer Validation Preservation**: Verify that referrer validation failure continues to cause isValid() to return false
7. **Single Placeholder Routes Preservation**: Verify that route patterns with single placeholders continue to match and validate correctly\n8. **Global Parameter Validation Preservation**: Verify that global parameter validation (no BY_ROUTE or BY_METHOD) continues to work correctly\n9. **No Duplicate Parameters Preservation**: Verify that validation rules with no duplicate parameters continue to work correctly\n10. **getBodyParameters() Method Preservation**: Verify that getBodyParameters() method continues to return an object without throwing TypeError\n\n### Unit Tests\n\n- Test #hasValidParameters() with single-parameter validation rules\n- Test #hasValidParameters() with multi-parameter validation rules\n- Test #hasValidParameters() with BY_ROUTE validation rules\n- Test #hasValidParameters() with BY_METHOD validation rules\n- Test #hasValidParameters() with method-and-route patterns\n- Test #hasValidParameters() with validation failures\n- Test #hasValidParameters() with no validation rules\n- Test #hasValidParameters() with excludeParamsWithNoValidationMatch flag\n- Test parameter extraction for query string, header, body, and path parameters\n- Test edge cases (null values, empty objects, malformed parameters)\n\n### Property-Based Tests\n\n- Generate random validation rule configurations and verify parameter extraction works correctly\n- Generate random parameter sets and verify extraction works for all valid inputs\n- Generate random validation failures and verify empty objects are returned\n- Test that all non-buggy inputs continue to produce the same results as before\n\n### Integration Tests\n\n- Test full ClientRequest validation flow with query string parameters\n- Test full ClientRequest validation flow with header parameters\n- Test full ClientRequest validation flow with body parameters\n- Test full ClientRequest validation flow with path parameters (multiple placeholders)\n- Test full ClientRequest validation flow with multi-parameter validation\n- Test full ClientRequest validation flow with method-and-route patterns\n- Test full ClientRequest validation flow with validation priority order\n- Test that validated parameters are correctly returned from all getter methods\n- Test that validation failures result in empty parameter objects\n- Test that excludeParamsWithNoValidationMatch flag works correctly\n