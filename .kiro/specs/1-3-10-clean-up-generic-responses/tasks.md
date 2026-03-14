# Implementation Plan: Clean Up Generic Responses

## Overview

Refactor the five duplicated `generic.response.*.js` files into thin wrappers around a new centralized `generic.response.js` factory module. The factory encapsulates the shared STATUS_CODE_MAP, response object generation, and `response()` lookup function. Each format file passes its content type and body formatter to the factory and re-exports the result alongside its format helper. All existing exports, return values, and public API contracts remain unchanged.

## Tasks

- [x] 1. Create the centralized generic response module
  - [x] 1.1 Create `src/lib/tools/generic.response.js` with `createGenericResponseModule` factory function
    - Define `STATUS_CODE_MAP` with all 10 status codes and their default messages
    - Implement `createGenericResponseModule(contentType, bodyFormatter)` that iterates over the map, calls `bodyFormatter(statusCode, message)` for each entry, and builds the response objects
    - Attach a `response()` function that parses the status code to an integer via `parseInt` and looks up `this["response" + statusCode]`, falling back to `this.response500`
    - Export `{ createGenericResponseModule }` via `module.exports`
    - Use `function` keyword (not arrow) for `response()` to preserve `this` binding
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.1, 6.2_

  - [x] 1.2 Write property test: Factory structural completeness (Property 1)
    - **Property 1: Factory structural completeness**
    - Generate random content type strings and body formatter functions via fast-check
    - Verify the returned module has all required properties: `contentType`, `headers`, `response200`–`response500`, and `response`
    - Verify `headers["Content-Type"]` equals the provided content type string
    - Minimum 100 iterations
    - **Validates: Requirements 1.1, 5.7**

  - [x] 1.3 Write property test: Body formatter invocation (Property 5)
    - **Property 5: Body formatter invocation**
    - Pass a tracking/spy body formatter to the factory
    - Verify it was called exactly once per status code entry (10 calls total) with the correct `(statusCode, message)` arguments
    - Minimum 100 iterations
    - **Validates: Requirements 5.6**

- [x] 2. Checkpoint - Verify centralized module
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Refactor format files to use centralized module
  - [x] 3.1 Refactor `generic.response.json.js` to use factory
    - Import `createGenericResponseModule` from `./generic.response`
    - Define `jsonBodyFormatter = (statusCode, message) => ({ message })`
    - Keep the existing `json` helper function as-is
    - Call factory with `"application/json"` and `jsonBodyFormatter`
    - Spread the result and export alongside `json`: `module.exports = { ...mod, json }`
    - _Requirements: 2.2, 3.1, 3.2_

  - [x] 3.2 Refactor `generic.response.text.js` to use factory
    - Import `createGenericResponseModule` from `./generic.response`
    - Define `textBodyFormatter = (statusCode, message) => message`
    - Keep the existing `text` helper function as-is
    - Call factory with `"text/plain"` and `textBodyFormatter`
    - Spread the result and export alongside `text`: `module.exports = { ...mod, text }`
    - _Requirements: 2.4, 3.1, 3.2_

  - [x] 3.3 Refactor `generic.response.html.js` to use factory
    - Import `createGenericResponseModule` from `./generic.response`
    - Keep the existing `html` helper function as-is
    - Define `HTML_TITLE_MAP` for special title cases: `{ 200: "OK", 500: "Error" }`
    - Define `htmlBodyFormatter = (statusCode, message) => html(statusCode + " " + (HTML_TITLE_MAP[statusCode] || message), "<p>" + message + "</p>")`
    - Call factory with `"text/html; charset=utf-8"` and `htmlBodyFormatter`
    - Spread the result and export alongside `html`: `module.exports = { ...mod, html }`
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.4 Refactor `generic.response.rss.js` to use factory
    - Import `createGenericResponseModule` from `./generic.response`
    - Keep the existing `rss` helper function as-is
    - Define `rssBodyFormatter` that uses `<hello>` tag for 200, `<error>` tag for others, and prefixes 418 message with `"418 "`
    - Call factory with `"application/rss+xml"` and `rssBodyFormatter`
    - Spread the result and export alongside `rss`: `module.exports = { ...mod, rss }`
    - _Requirements: 2.3, 3.1, 3.2_

  - [x] 3.5 Refactor `generic.response.xml.js` to use factory
    - Import `createGenericResponseModule` from `./generic.response`
    - Keep the existing `xml` helper function as-is
    - Define `xmlBodyFormatter` that uses `<hello>` tag for 200, `<error>` tag for others, and prefixes 418 message with `"418 "`
    - Call factory with `"application/xml"` and `xmlBodyFormatter`
    - Spread the result and export alongside `xml`: `module.exports = { ...mod, xml }`
    - _Requirements: 2.5, 3.1, 3.2_

- [x] 4. Checkpoint - Run existing tests to verify backwards compatibility
  - Run all existing generic response tests (`generic-response-html-tests.jest.mjs`, `generic-response-json-tests.jest.mjs`, `generic-response-rss-tests.jest.mjs`, `generic-response-text-tests.jest.mjs`, `generic-response-xml-tests.jest.mjs`) and `response-tests.jest.mjs`
  - Ensure all tests pass without modification, ask the user if questions arise.
  - _Requirements: 3.3, 3.4, 4.1, 4.2_

- [x] 5. Write new tests for centralized module
  - [x] 5.1 Create `test/response/generic-response-module-tests.jest.mjs` with unit tests
    - Test that factory produces a module with all 10 response objects for a given content type
    - Test that `response()` returns `response500` for unknown codes (999, 0, -1, NaN from non-numeric string)
    - Test that `response()` handles string `"404"` the same as integer `404`
    - Test that headers object contains the correct `Content-Type` value
    - Test that each format file still exports its format helper function (`html`, `json`, `rss`, `text`, `xml`)
    - Test that the `json()` helper still returns `data || {}`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [x] 5.2 Write property test: Known status code lookup (Property 2)
    - **Property 2: Known status code lookup (int and string)**
    - For a randomly selected known status code from {200, 400, 401, 403, 404, 405, 408, 418, 427, 500} (as int or string), verify `response()` returns a Response_Object whose `statusCode` field equals that integer
    - Minimum 100 iterations
    - **Validates: Requirements 1.3, 1.5**

  - [x] 5.3 Write property test: Unknown status code fallback (Property 3)
    - **Property 3: Unknown status code fallback**
    - Generate random integers outside the known set {200, 400, 401, 403, 404, 405, 408, 418, 427, 500}
    - Verify `response()` returns the same Response_Object as `response(500)`
    - Minimum 100 iterations
    - **Validates: Requirements 1.4**

  - [x] 5.4 Write property test: Backwards compatibility of format output (Property 4)
    - **Property 4: Backwards compatibility of format output**
    - For a randomly selected (format, statusCode) pair, verify the refactored module's `response(statusCode)` returns a Response_Object with identical `statusCode`, `headers`, and `body` values to the expected original output
    - Use hardcoded expected values from the original implementations
    - Minimum 100 iterations
    - **Validates: Requirements 3.1, 3.2**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Run the full test suite to confirm all existing and new tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with minimum 100 iterations
- The `response()` function must use `function` keyword (not arrow) to preserve `this` binding for `Response.init()` compatibility
- No changes needed to `tools/index.js` or `Response.class.js`
- Code style: tabs for indentation, double quotes for strings, semicolons required
