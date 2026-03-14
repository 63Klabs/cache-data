# Requirements Document

## Introduction

The `ApiRequest` class provides a static `responseFormat()` method that wraps data into a standardized response object used for caching and workflow processing. This method uses positional arguments, which makes it difficult for developers to use correctly — especially when only a subset of fields (such as `body`) need non-default values. This feature introduces a modern, object-based API consisting of four new static methods: `format()`, `success()`, `error()`, and `apiGateway()`. The existing `responseFormat()` method signature remains unchanged for backwards compatibility, but its internal implementation is refactored to delegate to the new `format()` method.

## Glossary

- **ApiRequest**: The public class in `src/lib/tools/ApiRequest.class.js` that handles HTTP request construction, execution, and response formatting.
- **Response_Format_Object**: A plain JavaScript object with the shape `{ success: boolean, statusCode: number, message: string|null, headers: object|null, body: object|string|null }` returned by `responseFormat()` and the new formatting methods.
- **Api_Gateway_Object**: A plain JavaScript object with the shape `{ statusCode: number, headers: object|null, body: string|null }` suitable for returning directly from an AWS Lambda handler to API Gateway.
- **Format_Options**: A destructured object parameter accepted by `format()`, `success()`, and `error()` with properties `success`, `statusCode`, `message`, `headers`, and `body`.

## Requirements

### Requirement 1: Core format() Method

**User Story:** As a developer using the @63klabs/cache-data package, I want a `format()` static method on `ApiRequest` that accepts a destructured object parameter, so that I can create response format objects without memorizing positional argument order.

#### Acceptance Criteria

1. THE ApiRequest SHALL expose a public static `format()` method that accepts a single Format_Options object parameter with destructured properties `success`, `statusCode`, `message`, `headers`, and `body`.
2. WHEN `format()` is called with no arguments, THE ApiRequest SHALL return a Response_Format_Object with `success` set to `false`, `statusCode` set to `0`, `message` set to `null`, `headers` set to `null`, and `body` set to `null`.
3. WHEN `format()` is called with a partial Format_Options object, THE ApiRequest SHALL use default values for any omitted properties: `success` defaults to `false`, `statusCode` defaults to `0`, `message` defaults to `null`, `headers` defaults to `null`, and `body` defaults to `null`.
4. WHEN `format()` is called with all properties specified, THE ApiRequest SHALL return a Response_Format_Object containing exactly those values.
5. THE Response_Format_Object returned by `format()` SHALL contain exactly five properties: `success`, `statusCode`, `message`, `headers`, and `body`.

### Requirement 2: success() Shortcut Method

**User Story:** As a developer using the @63klabs/cache-data package, I want a `success()` shortcut method on `ApiRequest`, so that I can create successful response format objects with sensible defaults and minimal code.

#### Acceptance Criteria

1. THE ApiRequest SHALL expose a public static `success()` method that accepts a single Format_Options object parameter with destructured properties `success`, `statusCode`, `message`, `headers`, and `body`.
2. WHEN `success()` is called with no arguments, THE ApiRequest SHALL return a Response_Format_Object with `success` set to `true`, `statusCode` set to `200`, `message` set to `"SUCCESS"`, `headers` set to `null`, and `body` set to `null`.
3. WHEN `success()` is called with a partial Format_Options object, THE ApiRequest SHALL use the success-specific defaults for any omitted properties: `success` defaults to `true`, `statusCode` defaults to `200`, `message` defaults to `"SUCCESS"`, `headers` defaults to `null`, and `body` defaults to `null`.
4. THE `success()` method SHALL delegate to the `format()` method to construct the Response_Format_Object.

### Requirement 3: error() Shortcut Method

**User Story:** As a developer using the @63klabs/cache-data package, I want an `error()` shortcut method on `ApiRequest`, so that I can create error response format objects with sensible defaults and minimal code.

#### Acceptance Criteria

1. THE ApiRequest SHALL expose a public static `error()` method that accepts a single Format_Options object parameter with destructured properties `success`, `statusCode`, `message`, `headers`, and `body`.
2. WHEN `error()` is called with no arguments, THE ApiRequest SHALL return a Response_Format_Object with `success` set to `false`, `statusCode` set to `500`, `message` set to `"ERROR"`, `headers` set to `null`, and `body` set to `null`.
3. WHEN `error()` is called with a partial Format_Options object, THE ApiRequest SHALL use the error-specific defaults for any omitted properties: `success` defaults to `false`, `statusCode` defaults to `500`, `message` defaults to `"ERROR"`, `headers` defaults to `null`, and `body` defaults to `null`.
4. THE `error()` method SHALL delegate to the `format()` method to construct the Response_Format_Object.

### Requirement 4: apiGateway() Conversion Method

**User Story:** As a developer using the @63klabs/cache-data package, I want an `apiGateway()` static method on `ApiRequest`, so that I can convert a response format object into the shape expected by AWS API Gateway Lambda proxy integration.

#### Acceptance Criteria

1. THE ApiRequest SHALL expose a public static `apiGateway()` method that accepts a single Format_Options object parameter.
2. WHEN `apiGateway()` is called with a Format_Options object, THE ApiRequest SHALL first pass the input through the `format()` method to normalize defaults.
3. THE `apiGateway()` method SHALL return an Api_Gateway_Object containing exactly three properties: `statusCode`, `headers`, and `body`.
4. THE Api_Gateway_Object SHALL contain the `statusCode` value from the normalized Response_Format_Object.
5. THE Api_Gateway_Object SHALL contain the `headers` value from the normalized Response_Format_Object.
6. WHEN the `body` value in the normalized Response_Format_Object is an object, THE `apiGateway()` method SHALL stringify the body using `JSON.stringify()`.
7. WHEN the `body` value in the normalized Response_Format_Object is a string or `null`, THE `apiGateway()` method SHALL pass the body through unchanged.

### Requirement 5: Refactor responseFormat() to Delegate to format()

**User Story:** As a package maintainer, I want the existing `responseFormat()` method to delegate to the new `format()` method internally, so that the response construction logic is centralized in one place.

#### Acceptance Criteria

1. THE `responseFormat()` method signature SHALL remain `responseFormat(success = false, statusCode = 0, message = null, headers = null, body = null)` with no changes to parameter names, order, or defaults.
2. THE `responseFormat()` method SHALL internally call `ApiRequest.format()` with the positional arguments mapped to the Format_Options object.
3. FOR ALL combinations of arguments, THE `responseFormat()` method SHALL return a Response_Format_Object identical to the one it returned before the refactoring.
4. FOR ALL valid Format_Options objects, calling `format()` then comparing with an equivalent `responseFormat()` call SHALL produce identical Response_Format_Objects (round-trip equivalence).

### Requirement 6: JSDoc Documentation

**User Story:** As a developer using the @63klabs/cache-data package, I want complete JSDoc documentation for the new methods, so that I can understand their usage through IDE autocomplete and documentation tools.

#### Acceptance Criteria

1. THE `format()` method SHALL have complete JSDoc documentation including a description, `@param` tags for the Format_Options object and each destructured property with types, `@returns` with the Response_Format_Object type definition, and at least two `@example` blocks.
2. THE `success()` method SHALL have complete JSDoc documentation including a description, `@param` tags for the Format_Options object and each destructured property with types and default values, `@returns` with the Response_Format_Object type definition, and at least one `@example` block.
3. THE `error()` method SHALL have complete JSDoc documentation including a description, `@param` tags for the Format_Options object and each destructured property with types and default values, `@returns` with the Response_Format_Object type definition, and at least one `@example` block.
4. THE `apiGateway()` method SHALL have complete JSDoc documentation including a description, `@param` tags for the Format_Options parameter with types, `@returns` with the Api_Gateway_Object type definition, and at least one `@example` block.
5. THE JSDoc parameter names SHALL match the actual function signatures exactly.

### Requirement 7: Jest Unit Tests

**User Story:** As a package maintainer, I want comprehensive Jest unit tests for the new methods, so that I can verify correctness and prevent regressions.

#### Acceptance Criteria

1. THE new test files SHALL be Jest test files with the `.jest.mjs` extension.
2. THE tests SHALL verify that `format()` returns correct defaults when called with no arguments.
3. THE tests SHALL verify that `format()` returns correct values when called with all properties specified.
4. THE tests SHALL verify that `format()` returns correct values when called with partial properties, using defaults for omitted ones.
5. THE tests SHALL verify that `success()` returns correct success-specific defaults when called with no arguments.
6. THE tests SHALL verify that `success()` allows overriding individual default properties.
7. THE tests SHALL verify that `error()` returns correct error-specific defaults when called with no arguments.
8. THE tests SHALL verify that `error()` allows overriding individual default properties.
9. THE tests SHALL verify that `apiGateway()` returns an object with exactly three properties: `statusCode`, `headers`, and `body`.
10. THE tests SHALL verify that `apiGateway()` stringifies object bodies using `JSON.stringify()`.
11. THE tests SHALL verify that `apiGateway()` passes string and null bodies through unchanged.
12. THE tests SHALL verify that the refactored `responseFormat()` produces identical output to the original implementation for all combinations of arguments.

### Requirement 8: Property-Based Tests

**User Story:** As a package maintainer, I want property-based tests using fast-check for the new methods, so that I can validate universal correctness properties across many generated inputs.

#### Acceptance Criteria

1. THE property-based test file SHALL be a Jest test file with the `.jest.mjs` extension and use the fast-check library.
2. THE tests SHALL verify the round-trip equivalence property: for all valid inputs, `responseFormat(s, c, m, h, b)` produces the same result as `format({success: s, statusCode: c, message: m, headers: h, body: b})`.
3. THE tests SHALL verify the idempotence property: for all valid Format_Options, calling `format(format(opts))` produces the same result as calling `format(opts)` once (where the output object is passed as input).
4. THE tests SHALL verify that `success()` always returns a Response_Format_Object with `success` set to `true` when the `success` property is not explicitly overridden.
5. THE tests SHALL verify that `error()` always returns a Response_Format_Object with `success` set to `false` when the `success` property is not explicitly overridden.
6. THE tests SHALL verify that `apiGateway()` never includes `success` or `message` properties in the returned Api_Gateway_Object.
7. THE tests SHALL verify that for all valid Format_Options, the Response_Format_Object returned by `format()` contains exactly five properties.
