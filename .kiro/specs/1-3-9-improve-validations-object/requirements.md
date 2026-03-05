# Requirements Document

## Introduction

This feature enhances the ClientRequest validation system to support route-specific and method-specific parameter validations. Currently, the validation system only supports global parameter validations, which means the same parameter name (e.g., `id`, `players`) must have the same validation rules across all routes and HTTP methods. This limitation prevents applications from having different validation rules for the same parameter name in different contexts.

The enhanced validation system will maintain full backwards compatibility with existing global parameter validations while adding support for route-specific and method-specific validation rules with a clear priority order.

## Glossary

- **ClientRequest**: The class that processes and validates incoming Lambda API Gateway requests
- **Validation_Function**: A JavaScript function that takes a parameter value and returns true if valid, false if invalid
- **Global_Parameter_Validation**: A validation function that applies to a parameter name across all routes and methods
- **Route_Pattern**: A string representing an API route path, optionally including path parameter placeholders (e.g., `product/{id}`, `game/join/{id}`)
- **Method_Specific_Validation**: A validation function that applies only when a specific HTTP method is used (e.g., `GET`, `POST`)
- **Route_Specific_Validation**: A validation function that applies only to a specific route pattern
- **Method_And_Route_Validation**: A validation function that applies only to a specific combination of HTTP method and route pattern
- **Validation_Priority**: The order in which validation rules are checked, from most specific to least specific
- **BY_ROUTE**: A special array property in the validations object that contains route-specific and method-and-route-specific validation rules
- **BY_METHOD**: A special array property in the validations object that contains method-only validation rules (without route patterns)
- **Parameter_Specification**: A string or array specifying which parameter(s) to validate in a route pattern (e.g., `?key` for query parameters, `{id}` for path parameters)
- **Multi_Parameter_Validation**: A validation function that receives multiple parameters as an object and validates them together

## Requirements

### Requirement 1: Backwards Compatibility with Global Validations

**User Story:** As a developer with existing validation configurations, I want my current global parameter validations to continue working without any code changes, so that I can upgrade to the new version without breaking my application.

#### Acceptance Criteria

1. THE ClientRequest SHALL continue to support global parameter validations in the existing format
2. WHEN a parameter is validated using only global validations, THE ClientRequest SHALL apply the global validation function
3. THE ClientRequest SHALL maintain the existing validation behavior for pathParameters, queryParameters, headerParameters, cookieParameters, and bodyParameters
4. THE ClientRequest SHALL accept validations objects that do not include the BY_ROUTE property
5. THE ClientRequest SHALL process existing validation configurations without requiring any modifications

### Requirement 2: Route-Specific Parameter Validations

**User Story:** As a developer building an API with multiple routes, I want to define different validation rules for the same parameter name in different routes, so that I can have context-appropriate validation (e.g., `id` in `/product/{id}` validates differently than `id` in `/employee/{id}`).

#### Acceptance Criteria

1. THE ClientRequest SHALL support a BY_ROUTE array property within each parameter type object
2. WHEN a BY_ROUTE array is provided, THE ClientRequest SHALL check route-specific validations before global validations
3. THE ClientRequest SHALL match route patterns against the actual request route
4. WHEN a route pattern matches the request route, THE ClientRequest SHALL apply the route-specific validation function
5. THE ClientRequest SHALL support route patterns with path parameter placeholders (e.g., `product/{id}`)

### Requirement 3: Method-Only Parameter Validations

**User Story:** As a developer building a RESTful API, I want to define different validation rules for the same parameter when used with different HTTP methods across all routes, so that I can enforce method-appropriate constraints globally (e.g., `POST` requires stricter validation than `GET` for any route).

#### Acceptance Criteria

1. THE ClientRequest SHALL support a BY_METHOD array property within each parameter type object for method-only validations
2. THE ClientRequest SHALL support method-only validation rules using the format `METHOD` (e.g., `GET`, `POST`) without route patterns
3. WHEN a method-only validation is defined, THE ClientRequest SHALL apply it to all requests using that HTTP method regardless of route
4. THE ClientRequest SHALL support method-only validations for GET, POST, PUT, DELETE, PATCH, and OPTIONS methods
5. THE ClientRequest SHALL check method-only validations after route-specific validations but before global parameter validations
6. THE ClientRequest SHALL require each BY_METHOD entry to have a `method` property and a `validate` property

### Requirement 4: Method-And-Route-Specific Validations

**User Story:** As a developer building complex APIs, I want to define validation rules that apply only to specific combinations of HTTP method and route, so that I can have the most precise control over validation behavior (e.g., `POST:join/{id}` validates differently than `GET:join/{id}`).

#### Acceptance Criteria

1. THE ClientRequest SHALL support method-and-route-specific validations using the format `METHOD:route_pattern`
2. WHEN a method-and-route validation matches both the HTTP method and route pattern, THE ClientRequest SHALL apply that validation function
3. THE ClientRequest SHALL check method-and-route validations before route-only validations
4. THE ClientRequest SHALL support path parameter placeholders in method-and-route patterns
5. THE ClientRequest SHALL match method-and-route patterns case-insensitively for the HTTP method

### Requirement 5: Validation Priority Order

**User Story:** As a developer using multiple validation levels, I want a clear and predictable priority order for validation rules, so that I can understand which validation will be applied when multiple rules could match.

#### Acceptance Criteria

1. THE ClientRequest SHALL apply validation rules in the following priority order: (1) Method-and-route match (BY_ROUTE with METHOD:route), (2) Route-only match (BY_ROUTE with route), (3) Method-only match (BY_METHOD), (4) Global parameter name
2. WHEN a higher-priority validation rule matches, THE ClientRequest SHALL not check lower-priority rules
3. WHEN no route-specific or method-specific validation matches, THE ClientRequest SHALL fall back to global parameter validation
4. WHEN no validation rule matches a parameter, THE ClientRequest SHALL exclude that parameter from the validated parameters object
5. THE ClientRequest SHALL document the validation priority order in JSDoc comments

### Requirement 6: Route Pattern Matching

**User Story:** As a developer defining route-specific validations, I want flexible route pattern matching that handles path parameters correctly, so that I can write validation rules that match the actual API Gateway resource paths.

#### Acceptance Criteria

1. THE ClientRequest SHALL match route patterns against the resource path (not the actual path with values)
2. WHEN a route pattern includes path parameter placeholders, THE ClientRequest SHALL match them against any value in that position
3. THE ClientRequest SHALL normalize route patterns by removing leading and trailing slashes
4. THE ClientRequest SHALL perform case-insensitive matching for route patterns
5. THE ClientRequest SHALL support both exact route matches and pattern matches with placeholders

### Requirement 7: Validation Function Interface

**User Story:** As a developer writing validation functions, I want a consistent interface for all validation types, so that I can reuse validation logic across different contexts.

#### Acceptance Criteria

1. THE ClientRequest SHALL accept validation functions that take a single parameter value and return a boolean for single-parameter validations
2. THE ClientRequest SHALL accept validation functions that take an object with multiple parameters and return a boolean for multi-parameter validations
3. WHEN a validation function returns true, THE ClientRequest SHALL include the parameter(s) in the validated parameters object
4. WHEN a validation function returns false, THE ClientRequest SHALL mark the request as invalid and exclude the parameter(s)
5. THE ClientRequest SHALL log a warning when a validation function returns false
6. THE ClientRequest SHALL support validation functions that are synchronous (no async validation)
7. THE ClientRequest SHALL automatically determine whether to pass a single value or an object based on the parameter specification in the route pattern

### Requirement 8: BY_ROUTE and BY_METHOD Array Structures

**User Story:** As a developer configuring route-specific and method-specific validations, I want clear and consistent structures for the BY_ROUTE and BY_METHOD arrays, so that I can easily define and maintain validation rules.

#### Acceptance Criteria

1. THE ClientRequest SHALL accept BY_ROUTE as an array of route-specific validation rule objects
2. THE ClientRequest SHALL accept BY_METHOD as an array of method-only validation rule objects
3. WHEN a BY_ROUTE array is provided, THE ClientRequest SHALL iterate through it to find matching rules
4. WHEN a BY_METHOD array is provided, THE ClientRequest SHALL iterate through it to find matching rules
5. THE ClientRequest SHALL require each BY_ROUTE entry to have a `route` property and a `validate` property
6. THE ClientRequest SHALL require each BY_METHOD entry to have a `method` property and a `validate` property
7. THE ClientRequest SHALL support the `route` property as either a route pattern or a method-and-route pattern (METHOD:route_pattern)
8. THE ClientRequest SHALL require the `validate` property to be a validation function

### Requirement 9: Error Handling and Logging

**User Story:** As a developer debugging validation issues, I want clear error messages and logging, so that I can quickly identify why a request was marked as invalid.

#### Acceptance Criteria

1. WHEN a validation function returns false, THE ClientRequest SHALL log a warning with the parameter name and value
2. WHEN a validation function throws an error, THE ClientRequest SHALL catch the error and mark the request as invalid
3. THE ClientRequest SHALL log validation errors with sufficient context to identify the failing validation rule
4. THE ClientRequest SHALL not expose sensitive parameter values in error messages
5. THE ClientRequest SHALL continue processing other parameters after a validation failure

### Requirement 10: Documentation and Examples

**User Story:** As a developer implementing the new validation system, I want comprehensive documentation and examples, so that I can understand how to use all validation features correctly.

#### Acceptance Criteria

1. THE ClientRequest SHALL include JSDoc documentation for all validation-related methods
2. THE ClientRequest SHALL provide examples of global, route-specific, method-only, and method-and-route validations
3. THE ClientRequest SHALL provide examples of single-parameter and multi-parameter validations
4. THE ClientRequest SHALL document the validation priority order in the JSDoc
5. THE ClientRequest SHALL include examples in the example-validations.js file demonstrating all validation types
6. THE ClientRequest SHALL document the BY_ROUTE and BY_METHOD array structures and usage
7. THE ClientRequest SHALL document the parameter specification syntax for query parameters and path parameters
8. THE ClientRequest SHALL provide examples showing how to validate multiple parameters together

### Requirement 11: Performance Considerations

**User Story:** As a developer running Lambda functions with tight performance requirements, I want the validation system to be efficient, so that validation overhead does not significantly impact request processing time.

#### Acceptance Criteria

1. THE ClientRequest SHALL minimize the number of route pattern comparisons by checking most specific patterns first
2. WHEN a validation rule matches, THE ClientRequest SHALL stop checking lower-priority rules for that parameter
3. THE ClientRequest SHALL cache normalized route patterns to avoid repeated string processing
4. THE ClientRequest SHALL perform validation during request initialization (constructor) to fail fast
5. THE ClientRequest SHALL not perform validation on parameters that are not present in the request

### Requirement 12: Export Structure Compatibility

**User Story:** As a developer with existing validation configuration files, I want the export structure to remain unchanged, so that I don't need to modify my configuration file structure.

#### Acceptance Criteria

1. THE ClientRequest SHALL continue to accept validations objects with the existing export structure
2. THE ClientRequest SHALL support the `referrers` property at the root level
3. THE ClientRequest SHALL support the `parameters` property containing pathParameters, queryParameters, headerParameters, cookieParameters, and bodyParameters
4. THE ClientRequest SHALL accept BY_ROUTE as an optional property within each parameter type object
5. THE ClientRequest SHALL accept BY_METHOD as an optional property within each parameter type object
6. THE ClientRequest SHALL not require any changes to the module.exports structure in validation files

### Requirement 13: Parameter Specification in Route Patterns

**User Story:** As a developer defining route-specific validations, I want to specify which parameter(s) to validate in a route pattern, so that I can validate specific query parameters, path parameters, or multiple parameters together.

#### Acceptance Criteria

1. THE ClientRequest SHALL support parameter specification in route patterns using the format `route?param` for query parameters
2. THE ClientRequest SHALL support parameter specification in route patterns using the format `route{param}` for path parameters (already supported)
3. THE ClientRequest SHALL support multiple parameter specification using comma-separated format `route?param1,param2` or `route/{id}/{page}`
4. WHEN a single parameter is specified, THE ClientRequest SHALL pass only that parameter's value to the validation function
5. WHEN multiple parameters are specified, THE ClientRequest SHALL pass an object containing all specified parameters with their names and values to the validation function
6. THE ClientRequest SHALL support mixed parameter types in multi-parameter validation (e.g., path and query parameters together)

**Examples:**
- `GET:path/to/{id}?key` - Validates the `key` query parameter for this specific route and method
- `GET:path/to/endpoint?key,id` - Validates both `key` and `id` query parameters, passing `{key: value1, id: value2}` to the validation function
- `GET:path/to/{id}/{page}` - Validates both path parameters, passing `{id: value1, page: value2}` to the validation function

### Requirement 14: Multi-Parameter Validation Functions

**User Story:** As a developer writing validation logic, I want to validate multiple related parameters together, so that I can enforce cross-parameter constraints and relationships.

#### Acceptance Criteria

1. THE ClientRequest SHALL support validation functions that accept a single value for single-parameter validations
2. THE ClientRequest SHALL support validation functions that accept an object for multi-parameter validations
3. WHEN multiple parameters are specified in a route pattern, THE ClientRequest SHALL pass an object with parameter names as keys and parameter values as values
4. THE ClientRequest SHALL include all specified parameters in the object even if some are undefined or null
5. THE ClientRequest SHALL allow validation functions to return true/false based on the combined evaluation of multiple parameters
6. THE ClientRequest SHALL log validation failures with all parameter names and values involved in multi-parameter validations

**Example validation function for multi-parameter:**
```javascript
// Single parameter validation
function validateId(id) {
  return typeof id === 'string' && id.length > 0;
}

// Multi-parameter validation
function validatePagination({page, limit}) {
  return page >= 1 && limit >= 1 && limit <= 100;
}
```