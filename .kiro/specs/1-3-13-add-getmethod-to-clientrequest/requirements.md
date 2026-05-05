# Requirements Document

## Introduction

Add a `getMethod()` instance method to the `ClientRequest` class that returns the HTTP method in uppercase. Additionally, normalize the `method` property in the internal `#props` object to always store the HTTP method in uppercase. This provides a direct accessor for the HTTP method without requiring the roundabout `getProps().method` pattern, and ensures consistent uppercase representation regardless of how the event source provides the method string.

## Glossary

- **ClientRequest**: The class in `src/lib/tools/ClientRequest.class.js` that extends `RequestInfo` to provide request validation, parameter extraction, and authentication for Lambda API Gateway events.
- **HTTP_Method**: A string representing the HTTP verb (e.g., GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD) used in a request.
- **Props**: The internal `#props` object within `ClientRequest` that stores parsed request properties including method, path, pathArray, resource, resourceArray, and various parameter collections.

## Requirements

### Requirement 1: Add getMethod() Instance Method

**User Story:** As a developer using the @63klabs/cache-data package, I want a `getMethod()` method on `ClientRequest`, so that I can retrieve the HTTP method directly without accessing `getProps().method`.

#### Acceptance Criteria

1. THE ClientRequest SHALL provide a public instance method named `getMethod` that accepts no parameters
2. WHEN `getMethod` is called, THE ClientRequest SHALL return the HTTP_Method as a string in all uppercase characters
3. WHEN the event source provides the HTTP method in lowercase (e.g., "get"), THE ClientRequest SHALL return the method in uppercase (e.g., "GET") from `getMethod`
4. WHEN the event source provides the HTTP method in mixed case (e.g., "Get"), THE ClientRequest SHALL return the method in uppercase (e.g., "GET") from `getMethod`
5. THE ClientRequest `getMethod` return value SHALL equal the `method` property of the object returned by `getProps()`

### Requirement 2: Normalize method Property to Uppercase

**User Story:** As a developer using the @63klabs/cache-data package, I want the `method` property in `getProps()` to always be uppercase, so that routing comparisons are consistent regardless of how the API Gateway event provides the method.

#### Acceptance Criteria

1. WHEN a ClientRequest instance is constructed, THE ClientRequest SHALL store the HTTP_Method in the `method` property of Props in all uppercase characters
2. WHEN the event `httpMethod` field is provided in lowercase, THE ClientRequest SHALL convert the value to uppercase before storing it in Props
3. WHEN the event `httpMethod` field is provided in mixed case, THE ClientRequest SHALL convert the value to uppercase before storing it in Props
4. THE ClientRequest SHALL apply the uppercase conversion using the JavaScript `toUpperCase()` method on the `httpMethod` value from the event

### Requirement 3: Update JSDoc Documentation

**User Story:** As a developer using the @63klabs/cache-data package, I want the `getMethod()` method to have complete JSDoc documentation, so that IDE autocomplete and type checking work correctly.

#### Acceptance Criteria

1. THE ClientRequest `getMethod` method SHALL include a JSDoc comment with a description, `@returns` tag specifying `{string}`, and an `@example` tag
2. THE ClientRequest class-level JSDoc SHALL reference the `getMethod` method as an available accessor

### Requirement 4: Update User Documentation

**User Story:** As a developer using the @63klabs/cache-data package, I want the routing patterns documentation to show the `getMethod()` accessor, so that I can discover and use the direct method.

#### Acceptance Criteria

1. THE routing patterns documentation SHALL include at least one example using `clientRequest.getMethod()` as an alternative to `clientRequest.getProps().method`
2. THE documentation SHALL note that `getMethod()` always returns the method in uppercase

### Requirement 5: Add Tests for getMethod()

**User Story:** As a maintainer of the @63klabs/cache-data package, I want tests covering the `getMethod()` method and the uppercase normalization, so that regressions are caught automatically.

#### Acceptance Criteria

1. THE test suite SHALL include a unit test verifying that `getMethod()` returns the HTTP method in uppercase for a standard GET request
2. THE test suite SHALL include a unit test verifying that `getMethod()` returns uppercase when the event provides a lowercase method
3. THE test suite SHALL include a unit test verifying that `getMethod()` returns uppercase when the event provides a mixed-case method
4. THE test suite SHALL include a unit test verifying that `getProps().method` is uppercase when the event provides a lowercase method
5. THE test suite SHALL include a property-based test verifying that for any arbitrary string provided as `httpMethod`, both `getMethod()` and `getProps().method` return the same value equal to the input uppercased
6. THE test suite SHALL verify that `getMethod()` return value equals `getProps().method` for all HTTP methods

### Requirement 6: Maintain Backwards Compatibility

**User Story:** As a developer with existing applications using the @63klabs/cache-data package, I want the addition of `getMethod()` and the uppercase normalization to not break my existing code, so that I can upgrade without changes.

#### Acceptance Criteria

1. THE ClientRequest SHALL continue to expose the `method` property via `getProps()` with the same key name
2. WHEN existing code accesses `getProps().method` with events that already provide uppercase HTTP methods (the standard API Gateway behavior), THE ClientRequest SHALL return the same value as before the change
3. THE existing test that checks `props.method` equals `'GET'` SHALL continue to pass without modification
