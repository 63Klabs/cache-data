# Requirements Document

## Introduction

This specification addresses two critical issues in the ClientRequest validation system:

1. **Missing Body Parameter Validation**: The validation system currently validates path, query, header, and cookie parameters, but body parameter validation is not implemented. Users can configure `bodyParameters` in validation rules, but these rules are never executed, and the `getBodyParameters()` method always returns an empty object.

2. **Header Key Format Configuration Issue**: Headers are automatically converted from kebab-case (HTTP standard) to camelCase during validation. This conversion is not clearly documented, and users must configure validation rules using camelCase keys (e.g., `contentType` instead of `content-type`), which is inconsistent with HTTP header naming conventions.

These issues affect the completeness and usability of the ClientRequest validation system, which is a critical component for API Gateway Lambda function request handling.

## Glossary

- **ClientRequest**: Class that wraps AWS Lambda API Gateway event and context, providing request validation and parameter extraction
- **ValidationMatcher**: Internal class that matches parameter names to validation rules using a 4-tier priority system (BY_METHOD_AND_ROUTE, BY_ROUTE, BY_METHOD, global)
- **ValidationExecutor**: Internal class that executes validation functions with appropriate interfaces (single or multi-parameter)
- **Body_Parameters**: Parameters sent in the HTTP request body (typically JSON for POST/PUT/PATCH requests)
- **Header_Parameters**: HTTP headers sent with the request
- **Parameter_Validation_Rules**: Configuration object defining validation functions for different parameter types
- **Validation_Chain**: The sequence of validation checks performed during request validation

## Requirements

### Requirement 1: Implement Body Parameter Validation

**User Story:** As an API developer, I want to validate body parameters using the same validation system as other parameter types, so that I can ensure request body data meets my requirements before processing.

#### Acceptance Criteria

1. WHEN body parameter validation rules are configured, THE ClientRequest SHALL validate body parameters using the ValidationMatcher and ValidationExecutor
2. WHEN body parameters pass validation, THE ClientRequest SHALL store validated parameters in `this.#props.bodyParameters`
3. WHEN `getBodyParameters()` is called after validation, THE ClientRequest SHALL return the validated body parameters object
4. WHEN body parameter validation fails, THE ClientRequest SHALL set `isValid` to false and prevent request processing
5. THE ClientRequest SHALL parse JSON body content before validation
6. WHEN the request body is not valid JSON, THE ClientRequest SHALL handle the error gracefully and set `isValid` to false
7. THE ClientRequest SHALL support both `event.body` (API Gateway v1) and `event.body` (API Gateway v2) formats
8. FOR ALL valid body parameter configurations, validating then retrieving parameters SHALL return the same validated data (round-trip property)

### Requirement 2: Add Body Validation to Validation Chain

**User Story:** As an API developer, I want body validation to be part of the standard validation chain, so that all parameter types are validated consistently.

#### Acceptance Criteria

1. WHEN `#validate()` is called, THE ClientRequest SHALL include `#hasValidBodyParameters()` in the validation chain
2. THE ClientRequest SHALL call `#hasValidBodyParameters()` after header validation and before returning the validation result
3. WHEN any validation in the chain fails (including body validation), THE ClientRequest SHALL set `isValid` to false
4. THE ClientRequest SHALL maintain the validation order: referrer → path → query → header → cookie → body

### Requirement 3: Document Header Key Format Conversion

**User Story:** As an API developer, I want clear documentation about header key format conversion, so that I can configure validation rules correctly without trial and error.

#### Acceptance Criteria

1. THE ClientRequest JSDoc SHALL document that header keys are converted from kebab-case to camelCase
2. THE ClientRequest JSDoc SHALL provide examples showing both HTTP header names and their camelCase equivalents
3. THE ClientRequest JSDoc SHALL explain why this conversion is necessary (JavaScript property naming conventions)
4. THE validation configuration documentation SHALL include a header key conversion reference table
5. THE `#hasValidHeaderParameters()` JSDoc SHALL document the conversion algorithm: lowercase, then replace `-([a-z])` with uppercase letter

### Requirement 4: Provide Header Key Conversion Utility

**User Story:** As an API developer, I want a utility function to convert HTTP header names to camelCase, so that I can easily determine the correct key names for validation rules.

#### Acceptance Criteria

1. THE ClientRequest SHALL provide a static method `convertHeaderKeyToCamelCase(headerKey)` that converts kebab-case to camelCase
2. WHEN given a kebab-case header name, THE method SHALL return the camelCase equivalent
3. THE method SHALL handle multiple hyphens correctly (e.g., `x-custom-header` → `xCustomHeader`)
4. THE method SHALL handle uppercase letters in input (e.g., `Content-Type` → `contentType`)
5. THE method SHALL be documented with examples of common HTTP headers
6. FOR ALL valid HTTP header names, converting to camelCase then using in validation SHALL work correctly (conversion property)

### Requirement 5: Add Body Validation Examples

**User Story:** As an API developer, I want examples of body parameter validation, so that I can quickly implement validation for my API endpoints.

#### Acceptance Criteria

1. THE ClientRequest JSDoc SHALL include an example of body parameter validation configuration
2. THE example SHALL demonstrate validating JSON body content
3. THE example SHALL show both single-field and multi-field body validation
4. THE example SHALL demonstrate error handling for invalid body content
5. THE example SHALL show how to access validated body parameters using `getBodyParameters()`

### Requirement 6: Maintain Backwards Compatibility

**User Story:** As an existing user of the package, I want my current code to continue working without changes, so that I can upgrade without breaking my application.

#### Acceptance Criteria

1. THE ClientRequest SHALL maintain all existing public method signatures
2. WHEN body validation rules are not configured, THE ClientRequest SHALL behave as before (no body validation)
3. WHEN `getBodyParameters()` is called without body validation configured, THE ClientRequest SHALL return an empty object (current behavior)
4. THE ClientRequest SHALL not change the behavior of path, query, header, or cookie validation
5. THE ClientRequest SHALL not change the validation chain order for existing parameter types
6. THE header key conversion behavior SHALL remain unchanged (already converts to camelCase)

### Requirement 7: Handle Edge Cases in Body Validation

**User Story:** As an API developer, I want body validation to handle edge cases gracefully, so that my API doesn't crash on unexpected input.

#### Acceptance Criteria

1. WHEN the request body is null or undefined, THE ClientRequest SHALL treat it as an empty object for validation
2. WHEN the request body is an empty string, THE ClientRequest SHALL treat it as an empty object for validation
3. WHEN the request body is not valid JSON, THE ClientRequest SHALL log the error and set `isValid` to false
4. WHEN body validation rules expect specific fields, THE ClientRequest SHALL validate against the parsed JSON object
5. WHEN body validation throws an exception, THE ValidationExecutor SHALL catch it, log it, and return false
6. IF the request body is too large to parse, THEN THE ClientRequest SHALL handle the error gracefully

### Requirement 8: Support Common Body Validation Patterns

**User Story:** As an API developer, I want to validate common body patterns easily, so that I can implement standard validation rules quickly.

#### Acceptance Criteria

1. THE ClientRequest SHALL support validating required fields in the body
2. THE ClientRequest SHALL support validating field types (string, number, boolean, array, object)
3. THE ClientRequest SHALL support validating field formats (email, URL, date, etc.)
4. THE ClientRequest SHALL support validating field constraints (min/max length, min/max value, regex patterns)
5. THE ClientRequest SHALL support validating nested object fields
6. THE ClientRequest SHALL support validating array elements
7. THE validation system SHALL work with both single-parameter and multi-parameter validation functions

