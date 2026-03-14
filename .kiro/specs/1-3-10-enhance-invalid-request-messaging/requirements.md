# Requirements Document

## Introduction

The `ClientRequest` class validates incoming requests against referrer whitelists, parameter validation rules, and authentication checks. Currently, when any validation fails, the class sets a blanket `isValid = false` with no indication of which check failed or what HTTP status code is appropriate. This feature introduces a `getValidationReason()` method that returns a structured object containing the validation result, an appropriate HTTP status code, and descriptive messages identifying each failure. A convenience method is also added to the `Response` class to simplify passing validation messages into responses.

## Glossary

- **ClientRequest**: The public class in `src/lib/tools/ClientRequest.class.js` that extends `RequestInfo` and validates Lambda API Gateway event requests against configured referrers, parameters, and authentication rules.
- **Response_Class**: The `Response` class in `src/lib/tools/Response.class.js` that creates and manages HTTP responses with support for multiple content types.
- **Validation_Reason**: A plain JavaScript object with the shape `{ isValid: boolean, statusCode: number, messages: Array<string> }` returned by `getValidationReason()`.
- **Referrer_Check**: The validation step that verifies the request's referrer against the configured whitelist using `isAuthorizedReferrer()`.
- **Parameter_Check**: The validation step that verifies path, query string, header, cookie, and body parameters against configured validation rules.
- **Authentication_Check**: The validation step that verifies the request meets authentication and authorization requirements.
- **RequestInfo**: The base class in `src/lib/tools/RequestInfo.class.js` that `ClientRequest` extends, which defines the `_isValid` property and `isValid()` method.

## Requirements

### Requirement 1: Validation Reason Data Structure

**User Story:** As a developer using the @63klabs/cache-data package, I want a structured validation result object, so that I can determine why a request failed and respond with the correct HTTP status code and message.

#### Acceptance Criteria

1. THE ClientRequest SHALL store validation failure details during the `#validate()` method execution, including the HTTP status code and one or more descriptive messages for each failed check.
2. WHEN all validation checks pass, THE ClientRequest SHALL store a Validation_Reason with `isValid` set to `true`, `statusCode` set to `200`, and `messages` set to an empty array.
3. WHEN the Referrer_Check fails, THE ClientRequest SHALL store a Validation_Reason with `statusCode` set to `403` and a message identifying the referrer as invalid.
4. WHEN the Authentication_Check fails, THE ClientRequest SHALL store a Validation_Reason with `statusCode` set to `401` and a message of `"Unauthorized"`.
5. WHEN one or more Parameter_Checks fail, THE ClientRequest SHALL store a Validation_Reason with `statusCode` set to `400` and a message for each invalid parameter identifying the parameter name.
6. WHEN multiple validation checks fail, THE ClientRequest SHALL use the highest-priority status code (401 > 403 > 400) and collect all failure messages into the `messages` array.

### Requirement 2: getValidationReason Method

**User Story:** As a developer using the @63klabs/cache-data package, I want a `getValidationReason()` method on `ClientRequest`, so that I can retrieve the structured validation result after checking `isValid()`.

#### Acceptance Criteria

1. THE ClientRequest SHALL expose a public `getValidationReason()` method that returns the stored Validation_Reason object.
2. WHEN `getValidationReason()` is called on a valid request, THE ClientRequest SHALL return `{ isValid: true, statusCode: 200, messages: [] }`.
3. WHEN `getValidationReason()` is called on an invalid request, THE ClientRequest SHALL return a Validation_Reason with `isValid` set to `false`, the appropriate `statusCode`, and one or more descriptive `messages`.
4. THE `getValidationReason()` method SHALL return a new object on each call to prevent external mutation of internal state.
5. THE `statusCode` property in the Validation_Reason SHALL be a numeric type consistent with the Response_Class conventions.

### Requirement 3: Preserve Backwards Compatibility

**User Story:** As an existing consumer of the @63klabs/cache-data package, I want the `isValid()` method to continue returning a boolean, so that my existing application code continues to work without changes.

#### Acceptance Criteria

1. THE `isValid()` method on RequestInfo SHALL continue to return a boolean value.
2. THE `#validate()` method in ClientRequest SHALL continue to set `super._isValid` to a boolean value as before.
3. THE constructor of ClientRequest SHALL continue to perform all existing validation checks in the same order and with the same pass/fail logic.
4. WHEN `getValidationReason()` is not called by the consuming application, THE ClientRequest SHALL incur no additional overhead beyond storing the validation details during construction.

### Requirement 4: Parameter Failure Message Detail

**User Story:** As a developer using the @63klabs/cache-data package, I want each invalid parameter identified by name in the validation messages, so that I can provide specific feedback to API consumers.

#### Acceptance Criteria

1. WHEN a path parameter fails validation, THE ClientRequest SHALL include a message in the format `"Invalid parameter: {parameterName}"` in the Validation_Reason messages array.
2. WHEN a query string parameter fails validation, THE ClientRequest SHALL include a message in the format `"Invalid parameter: {parameterName}"` in the Validation_Reason messages array.
3. WHEN a header parameter fails validation, THE ClientRequest SHALL include a message in the format `"Invalid parameter: {parameterName}"` in the Validation_Reason messages array.
4. WHEN a body parameter fails validation, THE ClientRequest SHALL include a message in the format `"Invalid parameter: {parameterName}"` in the Validation_Reason messages array.
5. WHEN the request body contains invalid JSON, THE ClientRequest SHALL include a message of `"Invalid request body"` in the Validation_Reason messages array with `statusCode` set to `400`.
6. WHEN multiple parameters fail validation, THE ClientRequest SHALL include a separate message for each invalid parameter.

### Requirement 5: Response Class Message Convenience Method

**User Story:** As a developer using the @63klabs/cache-data package, I want a convenience method on the Response class to set a message on generic responses, so that I can easily pass validation failure messages to the client.

#### Acceptance Criteria

1. THE Response_Class SHALL expose a public `setMessage(message)` method that accepts a string or an array of strings.
2. WHEN `setMessage()` is called with a string and the body is a JSON object, THE Response_Class SHALL merge a `message` property into the body using the existing `addToJsonBody()` mechanism.
3. WHEN `setMessage()` is called with an array of strings and the body is a JSON object, THE Response_Class SHALL merge a `messages` property into the body using the existing `addToJsonBody()` mechanism.
4. THE `setMessage()` method SHALL not alter the status code or headers of the response.
5. THE `setMessage()` method SHALL be backwards-compatible and not affect existing Response_Class behavior when not called.

### Requirement 6: Integration Between ClientRequest and Response

**User Story:** As a developer using the @63klabs/cache-data package, I want to pass the validation reason status code directly to the Response object, so that I can generate properly coded error responses with minimal boilerplate.

#### Acceptance Criteria

1. THE `statusCode` returned by `getValidationReason()` SHALL be directly usable with `Response.reset()` or `Response.setStatusCode()` to generate the appropriate generic error response.
2. WHEN a developer passes the Validation_Reason `statusCode` to `Response.reset({ statusCode })`, THE Response_Class SHALL produce the correct generic response for that status code (400, 401, 403, etc.).
3. THE `messages` array from `getValidationReason()` SHALL be directly usable with the `setMessage()` method on the Response_Class.

### Requirement 7: Jest Tests for Validation Reason

**User Story:** As a package maintainer, I want comprehensive Jest tests for the validation reason feature, so that I can verify correctness and prevent regressions.

#### Acceptance Criteria

1. THE new test files SHALL be Jest test files with the `.jest.mjs` extension.
2. THE tests SHALL verify that `getValidationReason()` returns `{ isValid: true, statusCode: 200, messages: [] }` for valid requests.
3. THE tests SHALL verify that `getValidationReason()` returns `statusCode` `403` with an appropriate message when the Referrer_Check fails.
4. THE tests SHALL verify that `getValidationReason()` returns `statusCode` `401` with `"Unauthorized"` when the Authentication_Check fails.
5. THE tests SHALL verify that `getValidationReason()` returns `statusCode` `400` with parameter-specific messages when Parameter_Checks fail.
6. THE tests SHALL verify that multiple failure messages are collected when multiple parameters are invalid.
7. THE tests SHALL verify that `getValidationReason()` returns a new object on each call (no shared references).
8. THE tests SHALL verify that the existing `isValid()` method continues to return a boolean.
9. THE tests SHALL verify that the `setMessage()` method on the Response_Class correctly merges messages into JSON bodies.

### Requirement 8: Developer Documentation

**User Story:** As a developer using the @63klabs/cache-data package, I want JSDoc documentation and usage examples for the new methods, so that I can understand how to use the validation reason feature.

#### Acceptance Criteria

1. THE `getValidationReason()` method SHALL have complete JSDoc documentation including description, `@returns` with the Validation_Reason type definition, and at least two `@example` blocks showing usage with valid and invalid requests.
2. THE `setMessage()` method on the Response_Class SHALL have complete JSDoc documentation including description, `@param` for the message parameter, `@returns`, and at least one `@example` block.
3. THE JSDoc parameter names SHALL match the actual function signatures exactly.
