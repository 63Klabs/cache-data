# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Application-Set Cache Headers Overwritten by finalize()
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to inputs where `isBugCondition(input)` is true — the application has pre-set `Cache-Control` and/or `Expires` headers via `addHeader()` before calling `finalize()`, and `finalize()` enters either the error path (status >= 400) or the success path (status < 400 with `routeExpirationInSeconds > 0`)
  - Create test file `test/response/cache-header-override-bug-condition-property-tests.jest.mjs`
  - Use fast-check to generate: random `Cache-Control` string values, random `Expires` string values, status codes >= 400 (error path) and status codes in [200, 399] with `routeExpirationInSeconds > 0` (success path)
  - For each generated input: create a `Response` instance, call `addHeader("Cache-Control", generatedValue)` and/or `addHeader("Expires", generatedValue)`, then call `finalize()`
  - Assert that `result.headers["Cache-Control"]` equals the application-set value (not the config-derived `max-age=<configValue>`)
  - Assert that `result.headers["Expires"]` equals the application-set value (not the config-derived date string)
  - Also test partial pre-set: only `Cache-Control` set (assert it's preserved, `Expires` gets config default), and only `Expires` set (assert it's preserved, `Cache-Control` gets config default)
  - Mock `console.log` and `ClientRequest` methods as done in existing response tests (`test/response/response-tests.jest.mjs`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists by showing application-set headers are overwritten)
  - Document counterexamples found (e.g., "addHeader('Cache-Control', 'no-store') then finalize() with status 500 → Cache-Control becomes 'max-age=180' instead of 'no-store'")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Default Cache Headers Applied When Not Pre-Set
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file `test/response/cache-header-preservation-property-tests.jest.mjs`
  - Observe on UNFIXED code: for status >= 400 with no pre-set cache headers, `finalize()` sets `Cache-Control` to `max-age=<errorExpirationInSeconds>` and `Expires` to a UTC date string computed from `errorExpirationInSeconds`
  - Observe on UNFIXED code: for status < 400 with `routeExpirationInSeconds > 0` and no pre-set cache headers, `finalize()` sets `Cache-Control` to `max-age=<routeExpirationInSeconds>` and `Expires` to a UTC date string computed from `routeExpirationInSeconds`
  - Observe on UNFIXED code: for status < 400 with `routeExpirationInSeconds = 0` and no pre-set cache headers, `finalize()` does NOT set `Cache-Control` or `Expires`
  - Observe on UNFIXED code: non-cache headers set via `addHeader()` (e.g., `X-Custom-Header`) survive `finalize()` unchanged
  - Write property-based tests using fast-check:
    - Property 2a: For all status codes >= 400 with no pre-set cache headers, `Cache-Control` equals `max-age=<errorExpirationInSeconds>` and `Expires` is a valid UTC date string
    - Property 2b: For all status codes in [200, 399] with `routeExpirationInSeconds > 0` and no pre-set cache headers, `Cache-Control` equals `max-age=<routeExpirationInSeconds>` and `Expires` is a valid UTC date string
    - Property 2c: For all status codes in [200, 399] with `routeExpirationInSeconds = 0` and no pre-set cache headers, response headers do NOT contain `Cache-Control` or `Expires` (beyond what was set by `reset()`)
    - Property 2d: For all arbitrary non-cache header key/value pairs set via `addHeader()`, those headers survive `finalize()` unchanged
  - Mock `console.log` and `ClientRequest` methods as done in existing response tests
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for Response.finalize() unconditionally overwriting Cache-Control and Expires headers

  - [x] 3.1 Implement the fix in `src/lib/tools/Response.class.js`
    - In the `finalize()` method, guard the `Expires` write in the error path (status >= 400) with `if (!('Expires' in this._headers))`
    - Guard the `Cache-Control` write in the error path with `if (!('Cache-Control' in this._headers))`
    - Guard the `Expires` write in the success path (status < 400, `routeExpirationInSeconds > 0`) with `if (!('Expires' in this._headers))`
    - Guard the `Cache-Control` write in the success path with `if (!('Cache-Control' in this._headers))`
    - _Bug_Condition: isBugCondition(input) where ('Cache-Control' IN input.headers OR 'Expires' IN input.headers) AND (input.statusCode >= 400 OR (input.statusCode < 400 AND routeExpirationInSeconds > 0))_
    - _Expected_Behavior: Application-set Cache-Control and Expires headers are preserved unchanged through finalize()_
    - _Preservation: When no Cache-Control or Expires headers are pre-set, finalize() continues to apply config-derived defaults identically to the unfixed version_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Update JSDoc on `finalize()` method
    - Add a note to the JSDoc comment documenting that application-set `Cache-Control` and `Expires` headers take precedence over config defaults
    - Mention that if neither header is pre-set, `finalize()` applies config-derived values as before
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Application-Set Cache Headers Preserved
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `npm test -- test/response/cache-header-override-bug-condition-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Default Cache Headers Applied When Not Pre-Set
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2: `npm test -- test/response/cache-header-preservation-property-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.5 Update user documentation
    - Update `docs/01-advanced-implementation-for-web-service/response-management.md` to document how to override cache headers per-response using `addHeader("Cache-Control", ...)` and `addHeader("Expires", ...)`
    - Add a section or note explaining that application-set `Cache-Control` and `Expires` headers take precedence over `routeExpirationInSeconds` and `errorExpirationInSeconds` config defaults
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite: `npm test`
  - Ensure all tests pass, including the new bug condition and preservation property tests
  - Verify no regressions in existing response tests (`test/response/response-tests.jest.mjs` and others)
  - Ask the user if questions arise
