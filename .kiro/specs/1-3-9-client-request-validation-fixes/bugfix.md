# Bugfix Requirements Document

## Introduction

The ClientRequest validation system has multiple failures affecting route pattern matching, parameter extraction, and validation interface selection. These failures impact 12 Jest tests across 4 test files, preventing proper validation of API Gateway requests with complex route patterns and multiple parameters.

The validation system is critical for securing Lambda functions by validating incoming API Gateway requests. The current failures mean that:
- Routes with multiple path placeholders (e.g., `users/{userId}/posts/{postId}`) fail validation incorrectly
- Query string and header parameters are not extracted when validation rules exist
- Validation rules contain duplicate parameters, breaking the validation interface
- The `getBodyParameters()` method is missing, causing TypeErrors in tests

This bugfix addresses these issues to restore proper validation functionality for real-world API Gateway integration scenarios.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a route pattern contains multiple placeholders (e.g., `users/{userId}/posts/{postId}`) THEN the system returns `isValid() === false` instead of `true`

1.2 WHEN a validation rule exists for query string parameters THEN the system returns empty object `{}` from `getQueryStringParameters()` instead of the actual parameter values

1.3 WHEN a validation rule exists for header parameters THEN the system returns empty object `{}` from `getHeaderParameters()` instead of the actual parameter values

1.4 WHEN ValidationMatcher creates validation rules THEN `rule.params` contains duplicate parameter names (e.g., `['paramName', 'paramName']`) instead of unique names

1.5 WHEN tests call `request.getBodyParameters()` THEN the system throws TypeError "getBodyParameters is not a function"

1.6 WHEN a route pattern like `POST:product/{id}` is configured THEN the system fails to match the route correctly

### Expected Behavior (Correct)

2.1 WHEN a route pattern contains multiple placeholders (e.g., `users/{userId}/posts/{postId}`) THEN the system SHALL return `isValid() === true` and extract all path parameters correctly

2.2 WHEN a validation rule exists for query string parameters THEN the system SHALL return the actual parameter values from `getQueryStringParameters()` (e.g., `{includeProfile: 'true'}`)

2.3 WHEN a validation rule exists for header parameters THEN the system SHALL return the actual parameter values from `getHeaderParameters()` (e.g., `{contentType: 'application/json'}`)

2.4 WHEN ValidationMatcher creates validation rules THEN `rule.params` SHALL contain unique parameter names without duplicates (e.g., `['paramName']`)

2.5 WHEN tests call `request.getBodyParameters()` THEN the system SHALL return the validated body parameters as an object

2.6 WHEN a route pattern like `POST:product/{id}` is configured THEN the system SHALL match the route correctly and apply the validation

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a route pattern has a single placeholder THEN the system SHALL CONTINUE TO match and validate correctly

3.2 WHEN validation rules use global parameter validation (no BY_ROUTE or BY_METHOD) THEN the system SHALL CONTINUE TO validate parameters correctly

3.3 WHEN a request is valid according to all validation rules THEN the system SHALL CONTINUE TO return `isValid() === true`

3.4 WHEN a request fails validation THEN the system SHALL CONTINUE TO return `isValid() === false` and exclude invalid parameters

3.5 WHEN path parameters are validated successfully THEN the system SHALL CONTINUE TO return them from `getPathParameters()`

3.6 WHEN the excludeParamsWithNoValidationMatch flag is true (default) THEN the system SHALL CONTINUE TO exclude parameters without validation rules

3.7 WHEN single-parameter validation is used THEN the system SHALL CONTINUE TO pass the value directly to the validation function

3.8 WHEN multi-parameter validation is used THEN the system SHALL CONTINUE TO pass an object with all parameter names as keys to the validation function
