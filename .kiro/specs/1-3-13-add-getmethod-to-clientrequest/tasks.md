# Implementation Plan: Add getMethod() to ClientRequest

## Overview

This plan implements the `getMethod()` instance method on `ClientRequest` and normalizes the `method` property in `#props` to always be uppercase. The implementation modifies a single file (`src/lib/tools/ClientRequest.class.js`), adds unit and property-based tests, and updates user documentation.

## Tasks

- [x] 1. Modify constructor and add getMethod() method
  - [x] 1.1 Normalize the method property in the constructor
    - In `src/lib/tools/ClientRequest.class.js`, change `method: this.#event.httpMethod` to `method: (this.#event.httpMethod || '').toUpperCase()`
    - This ensures the `method` property in `#props` is always uppercase and handles null/undefined safely
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Add the getMethod() instance method with JSDoc
    - Place the method after `getBodyParameters()` and before `getProps()` in `src/lib/tools/ClientRequest.class.js`
    - Implementation: `return this.#props.method;`
    - Include full JSDoc with description, `@returns {string}`, and `@example` tag
    - _Requirements: 1.1, 1.2, 1.5, 3.1_

  - [x] 1.3 Write unit tests for getMethod()
    - Create `test/request/client-request-getmethod-unit-tests.jest.mjs`
    - Test that `getMethod()` returns `'GET'` for a standard GET event
    - Test that `getMethod()` returns `'POST'` for lowercase `'post'` input
    - Test that `getMethod()` returns `'DELETE'` for mixed-case `'DeLeTe'` input
    - Test that `getProps().method` is `'GET'` for lowercase `'get'` input
    - Test that `getMethod()` returns empty string when `httpMethod` is `undefined`
    - Test that `getMethod()` returns empty string when `httpMethod` is `null`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.4 Write property-based test for getMethod()
    - Create `test/request/client-request-getmethod-property-tests.jest.mjs`
    - **Property 1: Uppercase Normalization and Accessor Consistency**
    - For any arbitrary string as `httpMethod`, verify: `getMethod() === input.toUpperCase()` AND `getProps().method === input.toUpperCase()` AND `getMethod() === getProps().method`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 5.5, 5.6**

- [x] 2. Checkpoint - Verify backwards compatibility
  - Ensure all tests pass, ask the user if questions arise.
  - Run existing test suite (`npm run test:request`) to confirm existing tests still pass
  - The existing test checking `props.method === 'GET'` must continue to pass without modification
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Update user documentation
  - [x] 3.1 Update routing patterns documentation
    - In `docs/01-advanced-implementation-for-web-service/`, add an example showing `clientRequest.getMethod()` as an alternative to `clientRequest.getProps().method`
    - Note that `getMethod()` always returns the method in uppercase
    - _Requirements: 4.1, 4.2_

- [x] 4. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run full test suite (`npm test`) to confirm no regressions

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The implementation is localized to a single class file with no new dependencies
- Property tests validate the single correctness property defined in the design document
- Unit tests validate specific examples and edge cases
- Backwards compatibility is verified by running the existing test suite
