# Design Document: Body Validation and Header Format Fix

## Overview

This design document specifies the implementation of body parameter validation and header key format documentation improvements for the ClientRequest class. The design follows the existing validation architecture using ValidationMatcher and ValidationExecutor, ensuring consistency with path, query, header, and cookie parameter validation.

### Goals

1. Implement complete body parameter validation using the existing validation framework
2. Add utility method for header key format conversion (kebab-case to camelCase)
3. Provide comprehensive documentation for header key conversion behavior
4. Maintain full backwards compatibility with existing code
5. Handle edge cases gracefully (null body, invalid JSON, empty strings)

### Non-Goals

- Changing the existing validation architecture or patterns
- Modifying behavior of path, query, header, or cookie validation
- Adding new validation frameworks or libraries
- Changing the header key conversion algorithm

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ClientRequest                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Validation Chain                          │ │
│  │                                                        │ │
│  │  1. isAuthorizedReferrer()                           │ │
│  │  2. #hasValidPathParameters()                        │ │
│  │  3. #hasValidQueryStringParameters()                 │ │
│  │  4. #hasValidHeaderParameters()                      │ │
│  │  5. #hasValidCookieParameters()                      │ │
│  │  6. #hasValidBodyParameters()  ← NEW                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Parameter Extraction Methods                   │ │
│  │                                                        │ │
│  │  • getPathParameters()                                │ │
│  │  • getQueryStringParameters()                         │ │
│  │  • getHeaderParameters()                              │ │
│  │  • getCookieParameters()                              │ │
│  │  • getBodyParameters()  ← ENHANCED                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Utility Methods                                │ │
│  │                                                        │ │
│  │  • convertHeaderKeyToCamelCase(headerKey)  ← NEW     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ uses
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Validation Framework                            │
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐   │
│  │  ValidationMatcher   │      │  ValidationExecutor  │   │
│  │                      │      │                      │   │
│  │  • 4-tier priority   │      │  • Single param      │   │
│  │  • Route matching    │      │  • Multi param       │   │
│  │  • Method matching   │      │  • Error handling    │   │
│  └──────────────────────┘      └──────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Request (API Gateway Event)
        │
        ▼
┌─────────────────────┐
│  ClientRequest      │
│  Constructor        │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  #validate()        │
│  method             │
└─────────────────────┘
        │
        ├─────────────────────────────────────────┐
        │                                         │
        ▼                                         ▼
┌─────────────────────┐              ┌─────────────────────┐
│  #hasValidBody      │              │  Other validation   │
│  Parameters()       │              │  methods            │
└─────────────────────┘              └─────────────────────┘
        │
        ├──────────────┬──────────────┬──────────────┐
        │              │              │              │
        ▼              ▼              ▼              ▼
   Parse JSON    Create         Use            Execute
   from body     Validation     Validation     Validation
                 Matcher        Matcher        Executor
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                       │
                       ▼
              Store validated
              parameters in
              #props.bodyParameters
```

## Components and Interfaces

### 1. Body Validation Method

#### Method Signature

```javascript
/**
 * Validate body parameters from the request.
 * 
 * Parses JSON body content before validation. Handles both API Gateway v1 and v2 formats.
 * Uses ValidationMatcher to find matching validation rules based on route pattern and HTTP method.
 * Extracts validated body parameters and stores them in this.#props.bodyParameters.
 * 
 * @private
 * @returns {boolean} True if all body parameters are valid, false otherwise
 * @example
 * // Internal use during request validation
 * const isValid = #hasValidBodyParameters();
 */
#hasValidBodyParameters() {
    // Implementation
}
```

#### Implementation Details

**Step 1: Parse Body Content**
- Check if `this.#event.body` exists
- Handle null, undefined, and empty string cases
- Parse JSON with try-catch error handling
- Log parsing errors and return false on failure

**Step 2: Create Normalized Body Object**
- If body is null/undefined/empty, use empty object `{}`
- If body is valid JSON, use parsed object
- Normalize keys if needed (currently no normalization for body keys)

**Step 3: Validate Using Existing Framework**
- Call `#hasValidParameters()` with:
  - `ClientRequest.getParameterValidations()?.bodyParameters`
  - Parsed body object
  - `this.#validationMatchers.bodyParameters`
- Store result in `this.#props.bodyParameters`
- Return validation result

**Step 4: Error Handling**
- Catch JSON parsing errors
- Log errors using `DebugAndLog.error()`
- Return `false` on any error
- Set `this.#props.bodyParameters = {}`

### 2. Header Key Conversion Utility

#### Method Signature

```javascript
/**
 * Convert HTTP header key from kebab-case to camelCase.
 * 
 * This utility method helps developers determine the correct key names for header validation rules.
 * HTTP headers use kebab-case (e.g., 'content-type'), but ClientRequest converts them to camelCase
 * (e.g., 'contentType') during validation for JavaScript property naming conventions.
 * 
 * The conversion algorithm:
 * 1. Convert entire string to lowercase
 * 2. Replace each hyphen followed by a letter with the uppercase letter
 * 3. Remove all hyphens
 * 
 * @param {string} headerKey - HTTP header key in kebab-case (e.g., 'Content-Type', 'x-custom-header')
 * @returns {string} Header key in camelCase (e.g., 'contentType', 'xCustomHeader')
 * @example
 * // Common HTTP headers
 * ClientRequest.convertHeaderKeyToCamelCase('content-type');  // 'contentType'
 * ClientRequest.convertHeaderKeyToCamelCase('Content-Type');  // 'contentType'
 * ClientRequest.convertHeaderKeyToCamelCase('x-api-key');     // 'xApiKey'
 * 
 * @example
 * // Multiple hyphens
 * ClientRequest.convertHeaderKeyToCamelCase('x-custom-header-name');  // 'xCustomHeaderName'
 * 
 * @example
 * // Use in validation configuration
 * const headerKey = ClientRequest.convertHeaderKeyToCamelCase('X-Custom-Header');
 * // Now use 'xCustomHeader' in validation rules
 */
static convertHeaderKeyToCamelCase(headerKey) {
    // Implementation
}
```

#### Implementation Details

```javascript
static convertHeaderKeyToCamelCase(headerKey) {
    if (!headerKey || typeof headerKey !== 'string') {
        return '';
    }
    
    // Convert to lowercase and replace -([a-z]) with uppercase letter
    return headerKey.toLowerCase().replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}
```

### 3. Validation Chain Update

#### Current Validation Chain

```javascript
#validate() {
    let valid = false;
    
    valid = this.isAuthorizedReferrer() && 
            this.#hasValidPathParameters() && 
            this.#hasValidQueryStringParameters() && 
            this.#hasValidHeaderParameters() && 
            this.#hasValidCookieParameters();
    
    super._isValid = valid;
}
```

#### Updated Validation Chain

```javascript
#validate() {
    let valid = false;
    
    // >! Add body validation to the validation chain after cookie validation
    valid = this.isAuthorizedReferrer() && 
            this.#hasValidPathParameters() && 
            this.#hasValidQueryStringParameters() && 
            this.#hasValidHeaderParameters() && 
            this.#hasValidCookieParameters() &&
            this.#hasValidBodyParameters();
    
    super._isValid = valid;
}
```

### 4. Constructor Initialization

#### Add Body Validation Matcher

The constructor must initialize a ValidationMatcher for body parameters:

```javascript
constructor(event, context) {
    // ... existing initialization ...
    
    // Initialize validation matchers for all parameter types
    this.#validationMatchers = {
        pathParameters: new ValidationMatcher(
            ClientRequest.getParameterValidations()?.pathParameters,
            this.#httpMethod,
            this.#resourcePath
        ),
        queryStringParameters: new ValidationMatcher(
            ClientRequest.getParameterValidations()?.queryStringParameters || 
            ClientRequest.getParameterValidations()?.queryParameters,
            this.#httpMethod,
            this.#resourcePath
        ),
        headerParameters: new ValidationMatcher(
            ClientRequest.getParameterValidations()?.headerParameters,
            this.#httpMethod,
            this.#resourcePath
        ),
        cookieParameters: new ValidationMatcher(
            ClientRequest.getParameterValidations()?.cookieParameters,
            this.#httpMethod,
            this.#resourcePath
        ),
        // >! Add body parameters validation matcher
        bodyParameters: new ValidationMatcher(
            ClientRequest.getParameterValidations()?.bodyParameters,
            this.#httpMethod,
            this.#resourcePath
        )
    };
    
    // ... rest of initialization ...
}
```

## Data Models

### Request Body Structure

```javascript
// API Gateway v1 format
{
    "body": "{\"userId\":\"123\",\"action\":\"update\"}",  // JSON string
    "isBase64Encoded": false
}

// API Gateway v2 format
{
    "body": "{\"userId\":\"123\",\"action\":\"update\"}",  // JSON string
    "isBase64Encoded": false
}

// Parsed body object (after JSON.parse)
{
    "userId": "123",
    "action": "update"
}
```

### Body Validation Configuration

```javascript
{
    parameters: {
        bodyParameters: {
            // Global body parameter validation
            userId: (value) => typeof value === 'string' && value.length > 0,
            action: (value) => ['create', 'update', 'delete'].includes(value),
            
            // Route-specific validation
            BY_ROUTE: [
                {
                    route: 'POST:users',
                    validate: ({email, password}) => {
                        return email && password && 
                               email.includes('@') && 
                               password.length >= 8;
                    }
                },
                {
                    route: 'users/{userId}',
                    validate: ({action}) => {
                        return ['update', 'delete'].includes(action);
                    }
                }
            ],
            
            // Method-specific validation
            BY_METHOD: [
                {
                    method: 'POST',
                    validate: (body) => {
                        return body && typeof body === 'object';
                    }
                }
            ]
        }
    }
}
```

### Validated Parameters Storage

```javascript
// Internal props structure
this.#props = {
    pathParameters: {},
    queryStringParameters: {},
    headerParameters: {},
    cookieParameters: {},
    bodyParameters: {}  // ← Populated by #hasValidBodyParameters()
};
```

### Header Key Conversion Reference

| HTTP Header (kebab-case) | JavaScript Property (camelCase) |
|--------------------------|----------------------------------|
| `content-type` | `contentType` |
| `Content-Type` | `contentType` |
| `authorization` | `authorization` |
| `x-api-key` | `xApiKey` |
| `X-API-Key` | `xApiKey` |
| `x-custom-header` | `xCustomHeader` |
| `if-modified-since` | `ifModifiedSince` |
| `if-none-match` | `ifNoneMatch` |
| `cache-control` | `cacheControl` |
| `user-agent` | `userAgent` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

Before defining the correctness properties, I've reviewed all testable properties from the prework analysis to eliminate redundancy:

**Identified Redundancies:**

1. **Properties 1.1, 1.2, and 1.3 can be combined**: These all test that body validation works correctly using the validation framework and stores/retrieves parameters. They can be combined into a single comprehensive property about the validation round-trip.

2. **Properties 1.4 and 2.3 are redundant**: Both test that validation failures set isValid to false. Property 2.3 is more general (covers all validation types), so 1.4 is redundant.

3. **Properties 1.8 and 1.3 are the same**: Both test the round-trip property of validating and retrieving body parameters.

4. **Properties 8.1-8.6 can be combined**: These all test that various validation patterns work correctly. They can be combined into a single property that the validation system supports common validation patterns.

5. **Property 4.6 subsumes 4.1 and 4.2**: The conversion property (4.6) already validates that the conversion method works correctly and produces usable results, which covers the basic functionality tested by 4.1 and 4.2.

**Consolidated Properties:**

After removing redundancies, we have these unique properties:

1. **Body Validation Round-Trip**: Validating and storing body parameters, then retrieving them returns the same data
2. **Validation Failure Propagation**: Any validation failure (including body) sets isValid to false
3. **JSON Parsing Before Validation**: Body content is parsed from JSON before validation
4. **Header Key Conversion Correctness**: Converting header keys to camelCase produces correct, usable results
5. **Backwards Compatibility**: When no body validation is configured, system behaves as before
6. **Common Validation Patterns**: The validation system supports required fields, types, formats, constraints, nested objects, and arrays
7. **Multi-Parameter Validation**: The validation system works with both single and multi-parameter validation functions

### Correctness Properties

### Property 1: Body Validation Round-Trip

*For any* valid body parameter configuration and request body, if body parameters pass validation and are stored, then calling `getBodyParameters()` SHALL return the same validated parameters.

**Validates: Requirements 1.1, 1.2, 1.3, 1.8**

**Rationale**: This property ensures the complete body validation workflow functions correctly - from parsing JSON, through validation using ValidationMatcher and ValidationExecutor, to storage and retrieval. It validates that the validation framework is properly integrated for body parameters.

**Test Strategy**: Generate random body parameter configurations and request bodies, validate them, store the results, and verify that `getBodyParameters()` returns the exact same validated data.

### Property 2: Validation Failure Propagation

*For any* request with invalid body parameters, when body validation fails, the ClientRequest SHALL set `isValid` to false and prevent request processing.

**Validates: Requirements 1.4, 2.3**

**Rationale**: This property ensures that body validation failures are properly propagated through the validation chain and affect the overall request validity, just like failures in other parameter types.

**Test Strategy**: Generate random invalid body parameters, validate them, and verify that `isValid` becomes false and the validation chain stops.

### Property 3: JSON Parsing Precondition

*For any* request body containing valid JSON, the ClientRequest SHALL parse the JSON string into an object before passing it to validation functions.

**Validates: Requirements 1.5**

**Rationale**: This property ensures that validation functions receive parsed JavaScript objects, not JSON strings, allowing them to access fields and perform validation logic.

**Test Strategy**: Generate random JSON strings, validate them, and verify that validation functions receive parsed objects with accessible properties.

### Property 4: Header Key Conversion Correctness

*For any* valid HTTP header name in kebab-case, converting it to camelCase using `convertHeaderKeyToCamelCase()` SHALL produce a valid JavaScript property name that can be used in validation rules.

**Validates: Requirements 4.1, 4.2, 4.6**

**Rationale**: This property ensures that the header key conversion utility correctly transforms HTTP header names into JavaScript-friendly property names that work in validation configurations.

**Test Strategy**: Generate random kebab-case header names, convert them to camelCase, and verify the result is a valid JavaScript identifier that can be used in validation rules.

### Property 5: Backwards Compatibility Preservation

*For any* request without body validation configuration, the ClientRequest SHALL behave identically to the previous version, with `getBodyParameters()` returning an empty object and validation succeeding.

**Validates: Requirements 6.2, 6.3**

**Rationale**: This property ensures that existing code continues to work without modification when upgrading to the new version. Users who don't configure body validation should see no change in behavior.

**Test Strategy**: Create requests without body validation configuration, validate them, and verify that `getBodyParameters()` returns `{}` and validation succeeds (assuming other validations pass).

### Property 6: Validation Chain Inclusion

*For any* request, when `#validate()` is called, the validation chain SHALL include `#hasValidBodyParameters()` and execute it after cookie validation.

**Validates: Requirements 2.1**

**Rationale**: This property ensures that body validation is properly integrated into the validation chain and executes in the correct order.

**Test Strategy**: Verify that body validation is called during the validation process and that it executes after cookie validation but before the validation result is returned.

### Property 7: Common Validation Pattern Support

*For any* body validation rule that checks required fields, field types, field formats, field constraints, nested objects, or array elements, the validation system SHALL correctly execute the validation and return the appropriate result.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**

**Rationale**: This property ensures that the body validation system supports all common validation patterns that developers need for API request validation.

**Test Strategy**: Create validation rules for each pattern type (required fields, types, formats, constraints, nested objects, arrays), generate test data, and verify that validation works correctly for each pattern.

### Property 8: Multi-Parameter Validation Interface

*For any* body validation rule, whether it uses single-parameter interface (receives one value) or multi-parameter interface (receives object with multiple values), the ValidationExecutor SHALL correctly execute the validation with the appropriate interface.

**Validates: Requirements 8.7**

**Rationale**: This property ensures that the ValidationExecutor correctly handles both validation function interfaces for body parameters, maintaining consistency with other parameter types.

**Test Strategy**: Create validation rules with both single-parameter and multi-parameter interfaces, validate body parameters, and verify that each interface receives the correct arguments.

## Error Handling

### JSON Parsing Errors

**Error Condition**: Request body contains invalid JSON

**Handling Strategy**:
1. Catch `JSON.parse()` exceptions in `#hasValidBodyParameters()`
2. Log error with `DebugAndLog.error()` including error message and stack trace
3. Set `this.#props.bodyParameters = {}`
4. Return `false` to mark validation as failed
5. Set `super._isValid = false` through validation chain

**Example**:
```javascript
try {
    bodyObject = JSON.parse(this.#event.body);
} catch (error) {
    DebugAndLog.error(
        `Failed to parse request body as JSON: ${error?.message || 'Unknown error'}`,
        error?.stack
    );
    this.#props.bodyParameters = {};
    return false;
}
```

### Null/Undefined/Empty Body

**Error Condition**: Request body is `null`, `undefined`, or empty string `""`

**Handling Strategy**:
1. Check for null/undefined/empty before parsing
2. Treat as empty object `{}` for validation
3. Allow validation rules to run against empty object
4. Validation rules can check for required fields

**Example**:
```javascript
if (!this.#event.body || this.#event.body === '') {
    bodyObject = {};
} else {
    bodyObject = JSON.parse(this.#event.body);
}
```

### Validation Function Exceptions

**Error Condition**: Validation function throws an exception

**Handling Strategy**:
1. ValidationExecutor already catches exceptions (existing behavior)
2. Logs error with parameter names and error message
3. Returns `false` to mark validation as failed
4. No changes needed - existing error handling applies to body validation

**Example** (existing ValidationExecutor code):
```javascript
try {
    return validateFn(value);
} catch (error) {
    DebugAndLog.error(
        `Validation function threw error for parameters [${paramNames.join(", ")}]: ${error?.message}`,
        error?.stack
    );
    return false;
}
```

### Large Body Handling

**Error Condition**: Request body is too large to parse

**Handling Strategy**:
1. API Gateway enforces payload size limits (10MB for REST API, 6MB for HTTP API)
2. If `JSON.parse()` fails due to size, catch exception and handle as JSON parsing error
3. No special handling needed beyond standard JSON parsing error handling
4. Lambda memory limits provide additional protection

### Missing Validation Configuration

**Error Condition**: No body validation rules configured

**Handling Strategy**:
1. `#hasValidParameters()` handles this case (existing behavior)
2. If `paramValidations` is null/undefined, returns `{ isValid: true, params: {} }`
3. `getBodyParameters()` returns empty object `{}`
4. Validation succeeds (backwards compatible)

## Testing Strategy

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **Body Validation Success**
   - Valid JSON body with valid parameters
   - Empty body treated as empty object
   - Body with multiple fields

2. **Body Validation Failure**
   - Invalid JSON body
   - Valid JSON but fails validation rules
   - Missing required fields

3. **Header Key Conversion**
   - Common HTTP headers (content-type, authorization, etc.)
   - Multiple hyphens (x-custom-header-name)
   - Uppercase input (Content-Type)
   - Edge cases (empty string, null, no hyphens)

4. **Validation Chain**
   - Body validation included in chain
   - Body validation executes after cookie validation
   - Body validation failure affects overall validity

5. **Backwards Compatibility**
   - No body validation configured
   - getBodyParameters() returns empty object
   - Other validations unaffected

### Property-Based Tests

Property-based tests will verify universal properties across many inputs:

1. **Property 1: Body Validation Round-Trip**
   - Generate random body configurations and request bodies
   - Validate and store parameters
   - Verify getBodyParameters() returns same data
   - Minimum 100 iterations

2. **Property 2: Validation Failure Propagation**
   - Generate random invalid body parameters
   - Verify isValid becomes false
   - Minimum 100 iterations

3. **Property 3: JSON Parsing Precondition**
   - Generate random JSON strings
   - Verify validation receives parsed objects
   - Minimum 100 iterations

4. **Property 4: Header Key Conversion Correctness**
   - Generate random kebab-case header names
   - Verify conversion produces valid camelCase
   - Minimum 100 iterations

5. **Property 5: Backwards Compatibility Preservation**
   - Generate random requests without body validation
   - Verify behavior unchanged
   - Minimum 100 iterations

6. **Property 7: Common Validation Pattern Support**
   - Generate validation rules for each pattern type
   - Verify each pattern works correctly
   - Minimum 100 iterations per pattern

7. **Property 8: Multi-Parameter Validation Interface**
   - Generate single and multi-parameter validation rules
   - Verify correct interface used
   - Minimum 100 iterations

### Integration Tests

Integration tests will verify interactions between components:

1. **End-to-End Body Validation**
   - Create ClientRequest with body validation configuration
   - Validate request with body parameters
   - Verify complete workflow from parsing to retrieval

2. **Validation Framework Integration**
   - Verify ValidationMatcher finds correct rules for body parameters
   - Verify ValidationExecutor executes body validation correctly
   - Verify 4-tier priority system works for body parameters

3. **Error Handling Integration**
   - Verify JSON parsing errors are logged and handled
   - Verify validation exceptions are caught and logged
   - Verify error states propagate correctly

### Test File Organization

```
test/request/validation/
├── unit/
│   ├── body-validation-tests.jest.mjs
│   ├── header-key-conversion-tests.jest.mjs
│   └── validation-chain-tests.jest.mjs
├── property/
│   ├── body-validation-round-trip-property-tests.jest.mjs
│   ├── validation-failure-propagation-property-tests.jest.mjs
│   ├── header-conversion-property-tests.jest.mjs
│   └── validation-patterns-property-tests.jest.mjs
└── integration/
    ├── body-validation-integration-tests.jest.mjs
    └── validation-framework-integration-tests.jest.mjs
```

### Test Tags

All property-based tests must include tags referencing the design document:

```javascript
/**
 * Property-Based Test: Body Validation Round-Trip
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 1: For any valid body parameter configuration and request body,
 * if body parameters pass validation and are stored, then calling
 * getBodyParameters() SHALL return the same validated parameters.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 1: Body Validation Round-Trip
 */
```

## Implementation Plan

### Phase 1: Core Body Validation

1. Add `#hasValidBodyParameters()` method to ClientRequest
2. Update `#validate()` to include body validation in chain
3. Add body validation matcher initialization in constructor
4. Implement JSON parsing with error handling
5. Update `getBodyParameters()` JSDoc (already returns from props)

### Phase 2: Header Key Conversion Utility

1. Add `static convertHeaderKeyToCamelCase(headerKey)` method
2. Implement conversion algorithm
3. Add comprehensive JSDoc with examples
4. Add unit tests for conversion method

### Phase 3: Documentation Updates

1. Update ClientRequest class JSDoc with header conversion explanation
2. Add header key conversion reference table to JSDoc
3. Update `#hasValidHeaderParameters()` JSDoc with algorithm details
4. Add body validation examples to JSDoc
5. Update validation configuration documentation

### Phase 4: Testing

1. Write unit tests for body validation
2. Write unit tests for header key conversion
3. Write property-based tests for all correctness properties
4. Write integration tests for validation framework
5. Verify all tests pass (both Mocha and Jest)

### Phase 5: Documentation and Review

1. Update CHANGELOG.md with new features
2. Update README.md if needed
3. Run documentation validation tests
4. Code review and feedback incorporation
5. Final testing before merge

## Backwards Compatibility

### No Breaking Changes

This implementation introduces no breaking changes:

1. **Method Signatures**: All existing public methods maintain their signatures
2. **Default Behavior**: When no body validation is configured, behavior is unchanged
3. **Validation Chain**: Existing validation types (path, query, header, cookie) are unaffected
4. **Return Values**: `getBodyParameters()` already exists and returns from props
5. **Header Conversion**: Existing header conversion behavior is unchanged

### Opt-In Feature

Body validation is opt-in:

- Users must explicitly configure `bodyParameters` validation rules
- Without configuration, body validation passes and returns empty object
- Existing code without body validation continues to work

### Migration Path

No migration needed:

- Existing code works without changes
- Users can add body validation incrementally
- No deprecations or removals

## Security Considerations

### Input Validation

Body validation enhances security by:

1. **Validating Request Bodies**: Ensures body content meets requirements before processing
2. **Type Checking**: Validates field types to prevent type confusion attacks
3. **Format Validation**: Validates field formats (email, URL, etc.) to prevent injection
4. **Required Fields**: Ensures required fields are present

### JSON Parsing Safety

JSON parsing is handled safely:

1. **Error Handling**: All JSON parsing errors are caught and logged
2. **Size Limits**: API Gateway enforces payload size limits
3. **No eval()**: Uses `JSON.parse()` which is safe
4. **Validation After Parsing**: Validation runs on parsed object, not raw string

### Validation Function Safety

Validation functions are executed safely:

1. **Exception Handling**: ValidationExecutor catches all exceptions
2. **Error Logging**: All validation errors are logged for debugging
3. **No Code Injection**: Validation functions are provided by developers, not users
4. **Timeout Protection**: Lambda timeout provides protection against infinite loops

## Performance Considerations

### JSON Parsing Performance

- `JSON.parse()` is native and highly optimized
- Parsing happens once per request
- Minimal performance impact for typical request sizes

### Validation Performance

- Validation uses existing ValidationMatcher and ValidationExecutor
- Performance characteristics same as other parameter types
- 4-tier priority system minimizes rule comparisons
- Cached patterns improve route matching performance

### Memory Usage

- Parsed body object stored in memory
- Validated parameters stored in props
- Memory usage proportional to body size
- API Gateway limits prevent excessive memory usage

## Monitoring and Debugging

### Logging

Body validation includes comprehensive logging:

1. **JSON Parsing Errors**: Logged with error message and stack trace
2. **Validation Failures**: Logged with parameter names and values
3. **Validation Exceptions**: Logged with error details
4. **Debug Mode**: Existing debug logging applies to body validation

### Error Messages

Error messages are clear and actionable:

- "Failed to parse request body as JSON: [error message]"
- "Invalid parameter: [paramName] = [paramValue]"
- "Validation function threw error for parameters [paramNames]: [error message]"

### Debugging Tools

Developers can debug body validation using:

1. **CloudWatch Logs**: All errors logged to CloudWatch
2. **Debug Mode**: Enable debug logging for detailed information
3. **Unit Tests**: Test validation rules in isolation
4. **Property Tests**: Verify validation works across many inputs

## Appendix A: Complete Code Examples

### Example 1: Basic Body Validation

```javascript
// Configure body validation
ClientRequest.init({
    parameters: {
        bodyParameters: {
            // Global validation for userId field
            userId: (value) => typeof value === 'string' && value.length > 0,
            
            // Route-specific validation
            BY_ROUTE: [
                {
                    route: 'POST:users',
                    validate: ({email, password}) => {
                        return email && 
                               email.includes('@') && 
                               password && 
                               password.length >= 8;
                    }
                }
            ]
        }
    }
});

// Lambda handler
export const handler = async (event, context) => {
    const request = new ClientRequest(event, context);
    
    if (!request.isValid) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid request' })
        };
    }
    
    // Access validated body parameters
    const bodyParams = request.getBodyParameters();
    console.log('User ID:', bodyParams.userId);
    console.log('Email:', bodyParams.email);
    
    // Process request...
};
```

### Example 2: Header Key Conversion

```javascript
// Determine correct header key for validation
const headerKey = ClientRequest.convertHeaderKeyToCamelCase('X-API-Key');
console.log(headerKey); // 'xApiKey'

// Use in validation configuration
ClientRequest.init({
    parameters: {
        headerParameters: {
            // Use camelCase key in validation rules
            xApiKey: (value) => value && value.startsWith('sk-'),
            contentType: (value) => value === 'application/json'
        }
    }
});
```

### Example 3: Complex Body Validation

```javascript
// Configure validation for nested objects and arrays
ClientRequest.init({
    parameters: {
        bodyParameters: {
            BY_ROUTE: [
                {
                    route: 'POST:orders',
                    validate: (body) => {
                        // Validate required fields
                        if (!body.customerId || !body.items) {
                            return false;
                        }
                        
                        // Validate field types
                        if (typeof body.customerId !== 'string') {
                            return false;
                        }
                        
                        // Validate array
                        if (!Array.isArray(body.items) || body.items.length === 0) {
                            return false;
                        }
                        
                        // Validate array elements
                        for (const item of body.items) {
                            if (!item.productId || !item.quantity) {
                                return false;
                            }
                            if (typeof item.quantity !== 'number' || item.quantity < 1) {
                                return false;
                            }
                        }
                        
                        // Validate nested object
                        if (body.shippingAddress) {
                            if (!body.shippingAddress.street || 
                                !body.shippingAddress.city || 
                                !body.shippingAddress.zipCode) {
                                return false;
                            }
                        }
                        
                        return true;
                    }
                }
            ]
        }
    }
});
```

## Appendix B: Header Key Conversion Reference

### Common HTTP Headers

| HTTP Header | camelCase Property | Usage |
|-------------|-------------------|-------|
| `content-type` | `contentType` | Request/response content type |
| `Content-Type` | `contentType` | Same (case-insensitive) |
| `authorization` | `authorization` | Authentication credentials |
| `Authorization` | `authorization` | Same (case-insensitive) |
| `x-api-key` | `xApiKey` | Custom API key header |
| `X-API-Key` | `xApiKey` | Same (case-insensitive) |
| `x-custom-header` | `xCustomHeader` | Custom header |
| `if-modified-since` | `ifModifiedSince` | Conditional request |
| `if-none-match` | `ifNoneMatch` | Conditional request |
| `cache-control` | `cacheControl` | Caching directives |
| `user-agent` | `userAgent` | Client identification |
| `accept` | `accept` | Acceptable content types |
| `accept-encoding` | `acceptEncoding` | Acceptable encodings |
| `accept-language` | `acceptLanguage` | Acceptable languages |

### Conversion Algorithm

```
Input: HTTP header key (any case, with hyphens)
Output: camelCase JavaScript property name

Steps:
1. Convert entire string to lowercase
2. Find each hyphen followed by a letter: -([a-z])
3. Replace with the uppercase letter (remove hyphen)
4. Result is camelCase property name

Examples:
  "Content-Type"        → "content-type"      → "contentType"
  "X-API-Key"           → "x-api-key"         → "xApiKey"
  "x-custom-header"     → "x-custom-header"   → "xCustomHeader"
  "if-modified-since"   → "if-modified-since" → "ifModifiedSince"
```

## Summary

This design document specifies the implementation of body parameter validation and header key format documentation for the ClientRequest class. The implementation:

1. **Follows Existing Patterns**: Uses ValidationMatcher and ValidationExecutor like other parameter types
2. **Maintains Backwards Compatibility**: No breaking changes, opt-in feature
3. **Handles Edge Cases**: Graceful error handling for invalid JSON, null bodies, etc.
4. **Provides Utility**: Header key conversion method helps developers configure validation
5. **Comprehensive Testing**: Unit, property-based, and integration tests ensure correctness
6. **Well Documented**: JSDoc, examples, and reference tables guide developers

The design ensures that body validation integrates seamlessly with the existing validation system while maintaining the high quality and reliability standards of the @63klabs/cache-data package.
