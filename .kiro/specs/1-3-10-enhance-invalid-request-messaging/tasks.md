# Implementation Plan: Enhance Invalid Request Messaging

## Overview

Add structured validation failure reporting to `ClientRequest` and a message convenience method to `Response`. The `#validate()` method is modified to run all checks (no short-circuit), collect failure reasons with per-parameter messages, and store a `#validationReason` object. A new `getValidationReason()` method returns a defensive copy. The `Response` class gains a `setMessage()` method that merges message(s) into the JSON body via `addToJsonBody()`. All changes are backwards-compatible with the existing `isValid()` boolean API.

## Tasks

- [x] 1. Add `#validationReason` field and `#upgradeStatusCode()` helper to ClientRequest
  - [x] 1.1 Add `#validationReason` private field and `#upgradeStatusCode()` private method
    - Add `#validationReason = { isValid: true, statusCode: 200, messages: [] }` field declaration
    - Add `#upgradeStatusCode(current, candidate)` method with priority map `{ 401: 3, 403: 2, 400: 1, 200: 0 }`
    - _Requirements: 1.1, 1.6_

- [x] 2. Modify `#hasValidParameters()` to return invalid parameter names
  - [x] 2.1 Enhance `#hasValidParameters()` to collect invalid parameter names instead of returning early
    - Change the method to continue iterating after a validation failure instead of returning immediately
    - Collect all invalid parameter names into an `invalidParams` array on the return value
    - Preserve existing `isValid` and `params` return properties
    - Return shape becomes `{ isValid: boolean, params: Object, invalidParams: Array<string> }`
    - Maintain existing `DebugAndLog.warn()` calls for each invalid parameter
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 3. Modify `#validate()` to collect failure reasons and populate `#validationReason`
  - [x] 3.1 Rewrite `#validate()` to run all checks without short-circuiting
    - Replace the single `&&` chain with individual calls to each validation check
    - Check `isAuthorizedReferrer()` and on failure push `"Forbidden"` message, upgrade status code to 403
    - Check `hasNoAuthorization()` and on failure push `"Unauthorized"` message, upgrade status code to 401
    - Call each `#hasValid*Parameters()` method and collect `invalidParams` from each
    - For each invalid parameter name, push `"Invalid parameter: {parameterName}"` message, upgrade status code to 400
    - Handle invalid JSON body: push `"Invalid request body"` message, upgrade status code to 400
    - Compute combined `valid` boolean from all check results
    - Set `super._isValid = valid` (preserving backwards compatibility)
    - Set `this.#validationReason = { isValid: valid, statusCode: valid ? 200 : statusCode, messages: valid ? [] : reasons }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 3.3, 4.5_

- [x] 4. Add public `getValidationReason()` method to ClientRequest
  - [x] 4.1 Implement `getValidationReason()` with defensive copy
    - Return a new object on each call: `{ isValid, statusCode, messages: [...this.#validationReason.messages] }`
    - Add complete JSDoc documentation with `@returns` type definition and two `@example` blocks (valid and invalid request)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1_

- [x] 5. Checkpoint - Verify ClientRequest changes
  - Run existing ClientRequest tests (`test/request/client-request-tests.jest.mjs`, `test/request/client-request-property-tests.jest.mjs`) to confirm backwards compatibility.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Add public `setMessage()` method to Response class
  - [x] 6.1 Implement `setMessage(message)` on Response
    - Accept a string → merge `{ message: str }` via `addToJsonBody()`
    - Accept an array → merge `{ messages: arr }` via `addToJsonBody()`
    - Do not alter status code or headers
    - Add complete JSDoc documentation with `@param`, `@returns`, and `@example` blocks
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.2_

- [x] 7. Checkpoint - Verify Response changes
  - Run existing Response tests (`test/response/response-tests.jest.mjs`) to confirm backwards compatibility.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Write unit tests for `getValidationReason()`
  - [x] 8.1 Create `test/request/validation-reason-unit-tests.jest.mjs`
    - Test valid request returns `{ isValid: true, statusCode: 200, messages: [] }`
    - Test referrer failure returns `statusCode: 403` with `"Forbidden"` message
    - Test authentication failure returns `statusCode: 401` with `"Unauthorized"` message
    - Test single invalid path parameter returns `statusCode: 400` with `"Invalid parameter: {name}"` message
    - Test single invalid query parameter returns `statusCode: 400` with parameter-specific message
    - Test multiple invalid parameters collect all messages
    - Test invalid JSON body returns `statusCode: 400` with `"Invalid request body"` message
    - Test multiple failure types use highest-priority status code (401 > 403 > 400)
    - Test `getValidationReason()` returns a new object each call (no shared references)
    - Test `isValid()` still returns a boolean
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 9. Write unit tests for `setMessage()`
  - [x] 9.1 Create `test/response/set-message-unit-tests.jest.mjs`
    - Test `setMessage("string")` merges `{ message: "string" }` into JSON body
    - Test `setMessage(["a", "b"])` merges `{ messages: ["a", "b"] }` into JSON body
    - Test `setMessage()` does not alter status code or headers
    - Test `setMessage()` with non-object body is a no-op
    - Test `setMessage([])` merges `{ messages: [] }` into body
    - _Requirements: 7.1, 7.9_

- [x] 10. Checkpoint - Verify unit tests pass
  - Ensure all unit tests pass, ask the user if questions arise.

- [x] 11. Write property-based tests for ClientRequest validation reason
  - [x] 11.1 Create `test/request/validation-reason-property-tests.jest.mjs`
    - Set up fast-check generators for valid events, invalid events, and mixed failure scenarios

  - [x] 11.2 Write property test for Property 1: Valid request produces canonical validation reason
    - **Property 1: Valid request produces canonical validation reason**
    - For any ClientRequest with valid referrer, valid auth, and valid parameters, `getValidationReason()` returns `{ isValid: true, statusCode: 200, messages: [] }`
    - **Validates: Requirements 1.2, 2.2**

  - [x] 11.3 Write property test for Property 2: Invalid request produces well-formed validation reason
    - **Property 2: Invalid request produces well-formed validation reason**
    - For any ClientRequest that fails at least one check, `getValidationReason()` returns `isValid: false`, `statusCode !== 200`, and non-empty `messages` array of strings
    - **Validates: Requirements 1.1, 2.3**

  - [x] 11.4 Write property test for Property 3: Referrer failure maps to 403
    - **Property 3: Referrer failure maps to 403**
    - For any ClientRequest with invalid referrer and no higher-priority failure, `statusCode` is `403` and messages contain referrer-related message
    - **Validates: Requirements 1.3**

  - [x] 11.5 Write property test for Property 4: Authentication failure maps to 401
    - **Property 4: Authentication failure maps to 401**
    - For any ClientRequest where authentication check fails, `statusCode` is `401` and messages contain `"Unauthorized"`
    - **Validates: Requirements 1.4**

  - [x] 11.6 Write property test for Property 5: Parameter failure maps to 400 with per-parameter messages
    - **Property 5: Parameter failure maps to 400 with per-parameter messages**
    - For any ClientRequest with invalid parameters and no higher-priority failure, `statusCode` is `400` and messages contain `"Invalid parameter: {name}"` for each invalid parameter
    - **Validates: Requirements 1.5, 4.1, 4.2, 4.3, 4.4, 4.6**

  - [x] 11.7 Write property test for Property 6: Invalid JSON body maps to 400
    - **Property 6: Invalid JSON body maps to 400 with body message**
    - For any ClientRequest with non-empty invalid JSON body, `statusCode` is `400` and messages contain `"Invalid request body"`
    - **Validates: Requirements 4.5**

  - [x] 11.8 Write property test for Property 7: Status code priority ordering
    - **Property 7: Status code priority ordering**
    - For any ClientRequest with multiple failure types, `statusCode` is the highest-priority code (401 > 403 > 400) and all failure messages are present
    - **Validates: Requirements 1.6**

  - [x] 11.9 Write property test for Property 8: Defensive copy prevents mutation
    - **Property 8: Defensive copy prevents mutation**
    - For any ClientRequest, two calls to `getValidationReason()` return distinct object references; mutating one does not affect the other
    - **Validates: Requirements 2.4**

  - [x] 11.10 Write property test for Property 9: Backwards compatibility — isValid consistency
    - **Property 9: Backwards compatibility — isValid consistency**
    - For any ClientRequest, `isValid()` returns a boolean equal to `getValidationReason().isValid`
    - **Validates: Requirements 3.1, 3.3**

  - [x] 11.11 Write property test for Property 12: Integration — validation reason flows to Response
    - **Property 12: Integration — validation reason flows to Response**
    - For any invalid ClientRequest, passing `getValidationReason().statusCode` to `Response.reset()` produces a response with that status code, and passing `messages` to `setMessage()` merges them into the body
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 12. Write property-based tests for Response `setMessage()`
  - [x] 12.1 Create `test/response/set-message-property-tests.jest.mjs`
    - Set up fast-check generators for random strings and string arrays

  - [x] 12.2 Write property test for Property 10: setMessage with string merges message property
    - **Property 10: setMessage with string merges message property**
    - For any Response with JSON object body and any non-empty string `s`, `setMessage(s)` results in `getBody().message === s` without altering status code or headers
    - **Validates: Requirements 5.2, 5.4**

  - [x] 12.3 Write property test for Property 11: setMessage with array merges messages property
    - **Property 11: setMessage with array merges messages property**
    - For any Response with JSON object body and any non-empty array of strings, `setMessage(arr)` results in `getBody().messages` deep-equal to `arr` without altering status code or headers
    - **Validates: Requirements 5.3, 5.4**

- [x] 13. Final checkpoint - Ensure all tests pass
  - Run the full test suite to confirm all existing and new tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Test files use `.jest.mjs` extension with Jest framework and fast-check for property tests
- Code style: tabs for indentation, double quotes for strings, semicolons required
- All changes are backwards-compatible — `isValid()` continues to return a boolean
