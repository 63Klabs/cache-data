# Implementation Plan: New Response Format Method

## Overview

Add four new static methods (`format()`, `success()`, `error()`, `apiGateway()`) to the `ApiRequest` class in `src/lib/tools/ApiRequest.class.js`, then refactor the existing `responseFormat()` to delegate to `format()`. All methods include complete JSDoc documentation. New unit tests go in `test/response/response-format-unit-tests.jest.mjs` and property-based tests in `test/response/response-format-property-tests.jest.mjs`.

## Tasks

- [x] 1. Add format() and success() methods to ApiRequest
  - [x] 1.1 Implement `format()` static method with full JSDoc documentation
    - Add `format()` immediately before the existing `responseFormat()` method (around line 1516)
    - Accept a single destructured `Format_Options` parameter with `= {}` default
    - Destructure `success = false`, `statusCode = 0`, `message = null`, `headers = null`, `body = null`
    - Return a plain object `{ success, statusCode, message, headers, body }`
    - JSDoc must include description, `@param` for the object and each property with types, `@returns` with Response_Format_Object shape, and at least two `@example` blocks
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1_

  - [x] 1.2 Implement `success()` static method with full JSDoc documentation
    - Place immediately after `format()`
    - Destructure with success-specific defaults: `success = true`, `statusCode = 200`, `message = "SUCCESS"`, `headers = null`, `body = null`
    - Delegate to `ApiRequest.format()` with the destructured values
    - JSDoc must include description, `@param` tags with default values, `@returns`, and at least one `@example`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.2_


  - [x] 1.3 Write property test: format() structural invariant (Property 3)
    - **Property 3: format() Structural Invariant**
    - For any valid Format_Options (including empty/partial), verify `Object.keys(format(opts))` has length 5 with keys `success`, `statusCode`, `message`, `headers`, `body`
    - Create file `test/response/response-format-property-tests.jest.mjs`
    - Use fast-check arbitraries: `fc.boolean()`, `fc.integer()`, `fc.oneof(fc.string(), fc.constant(null))` for message, `fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null))` for headers, `fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null))` for body
    - Minimum 100 iterations with seed support via `process.env.FC_SEED`
    - **Validates: Requirements 1.5, 8.7**

  - [x] 1.4 Write property test: format() value preservation (Property 4)
    - **Property 4: format() Value Preservation**
    - For any set of values passed to `format()`, verify the returned object contains those exact values for each provided property, and default values for omitted properties
    - Minimum 100 iterations
    - **Validates: Requirements 1.3, 1.4**

  - [x] 1.5 Write property test: success() default success flag (Property 5)
    - **Property 5: success() Default Success Flag**
    - For any Format_Options that does not include an explicit `success` property, verify `success(opts).success === true`
    - Minimum 100 iterations
    - **Validates: Requirements 2.3, 8.4**

- [x] 2. Add error() and apiGateway() methods to ApiRequest
  - [x] 2.1 Implement `error()` static method with full JSDoc documentation
    - Place immediately after `success()`
    - Destructure with error-specific defaults: `success = false`, `statusCode = 500`, `message = "ERROR"`, `headers = null`, `body = null`
    - Delegate to `ApiRequest.format()` with the destructured values
    - JSDoc must include description, `@param` tags with default values, `@returns`, and at least one `@example`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.3_

  - [x] 2.2 Implement `apiGateway()` static method with full JSDoc documentation
    - Place immediately after `error()`
    - Destructure with same defaults as `format()`, delegate to `ApiRequest.format()` for normalization
    - Return object with exactly three properties: `statusCode`, `headers`, `body`
    - If `body` is a non-null object, stringify with `JSON.stringify()`; pass strings and `null` through unchanged
    - JSDoc must include description, `@param` tags, `@returns` with Api_Gateway_Object shape, and at least one `@example`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.4_

  - [x] 2.3 Write property test: error() default success flag (Property 6)
    - **Property 6: error() Default Success Flag**
    - For any Format_Options that does not include an explicit `success` property, verify `error(opts).success === false`
    - Minimum 100 iterations
    - **Validates: Requirements 3.3, 8.5**

  - [x] 2.4 Write property test: apiGateway() structural invariant (Property 7)
    - **Property 7: apiGateway() Structural Invariant**
    - For any valid Format_Options, verify `Object.keys(apiGateway(opts))` equals `["statusCode", "headers", "body"]` and never contains `success` or `message`
    - Minimum 100 iterations
    - **Validates: Requirements 4.3, 8.6**

  - [x] 2.5 Write property test: apiGateway() body stringification (Property 8)
    - **Property 8: apiGateway() Body Stringification**
    - For Format_Options where body is a non-null object, verify `apiGateway(opts).body === JSON.stringify(originalBody)`
    - For Format_Options where body is a string or null, verify body passes through unchanged
    - Minimum 100 iterations
    - **Validates: Requirements 4.6, 4.7**

  - [x] 2.6 Write property test: apiGateway() preserves statusCode and headers (Property 9)
    - **Property 9: apiGateway() Preserves statusCode and headers**
    - For any valid Format_Options, verify `apiGateway(opts).statusCode === format(opts).statusCode` and `apiGateway(opts).headers` deeply equals `format(opts).headers`
    - Minimum 100 iterations
    - **Validates: Requirements 4.4, 4.5**

- [x] 3. Checkpoint - Verify new methods
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor responseFormat() and add round-trip tests
  - [x] 4.1 Refactor `responseFormat()` to delegate to `format()`
    - Replace the body of `responseFormat()` with `return ApiRequest.format({ success, statusCode, message, headers, body });`
    - Signature must remain exactly `responseFormat(success = false, statusCode = 0, message = null, headers = null, body = null)`
    - Do not change the existing JSDoc on `responseFormat()`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 Write property test: round-trip equivalence (Property 1)
    - **Property 1: Round-Trip Equivalence (responseFormat ↔ format)**
    - For any boolean `s`, number `c`, value `m`, value `h`, value `b`, verify `responseFormat(s, c, m, h, b)` deeply equals `format({success: s, statusCode: c, message: m, headers: h, body: b})`
    - Minimum 100 iterations
    - **Validates: Requirements 5.3, 5.4**

  - [x] 4.3 Write property test: format() idempotence (Property 2)
    - **Property 2: format() Idempotence**
    - For any valid Format_Options `opts`, verify `format(format(opts))` deeply equals `format(opts)`
    - Minimum 100 iterations
    - **Validates: Requirements 8.3**

- [x] 5. Write unit tests
  - [x] 5.1 Create `test/response/response-format-unit-tests.jest.mjs` with unit tests
    - Test `format()` with no arguments returns `{ success: false, statusCode: 0, message: null, headers: null, body: null }`
    - Test `format()` with all properties returns exact values
    - Test `format()` with partial properties uses defaults for omitted ones
    - Test `success()` with no arguments returns `{ success: true, statusCode: 200, message: "SUCCESS", headers: null, body: null }`
    - Test `success()` with overrides applies them correctly
    - Test `error()` with no arguments returns `{ success: false, statusCode: 500, message: "ERROR", headers: null, body: null }`
    - Test `error()` with overrides applies them correctly
    - Test `apiGateway()` returns object with exactly three properties: `statusCode`, `headers`, `body`
    - Test `apiGateway()` stringifies object bodies
    - Test `apiGateway()` passes string bodies unchanged
    - Test `apiGateway()` passes null bodies unchanged
    - Test refactored `responseFormat()` produces identical output for various argument combinations
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Run the full test suite to confirm all existing and new tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with minimum 100 iterations and seed support via `FC_SEED` env var
- Code style: tabs for indentation, double quotes for strings, semicolons required
- New methods are placed immediately before `responseFormat()` in the class, in order: `format()`, `success()`, `error()`, `apiGateway()`
- All methods are static, matching the existing `responseFormat()` pattern
- JSDoc parameter names must match actual function signatures exactly
