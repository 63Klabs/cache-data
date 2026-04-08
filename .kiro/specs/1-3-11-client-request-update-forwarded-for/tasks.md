# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - X-Forwarded-For and User-Agent Header Priority
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases where `x-forwarded-for` and/or `user-agent` headers are present alongside different `identity` values
  - Create test file `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`
  - Import `RequestInfo` from `../../src/lib/tools/RequestInfo.class.js` and `fc` from `fast-check`
  - Write property-based test: for events where `x-forwarded-for` header is present and non-empty with `identity.sourceIp` set to a different value, assert `getClientIp()` returns the first IP from `x-forwarded-for` (trimmed)
  - Write property-based test: for events where `user-agent` header is present and non-empty with `identity.userAgent` set to a different value (e.g., "Amazon CloudFront"), assert `getClientUserAgent()` returns the `user-agent` header value
  - Test concrete cases: single IP `x-forwarded-for: "203.0.113.50"` with `identity.sourceIp: "54.240.144.1"`, expect `getClientIp()` returns `"203.0.113.50"`
  - Test concrete cases: multiple IPs `x-forwarded-for: "203.0.113.50, 70.132.20.1, 54.240.144.1"` with `identity.sourceIp: "54.240.144.1"`, expect `getClientIp()` returns `"203.0.113.50"`
  - Test concrete cases: `user-agent: "Mozilla/5.0 (Windows NT 10.0)"` with `identity.userAgent: "Amazon CloudFront"`, expect `getClientUserAgent()` returns `"Mozilla/5.0 (Windows NT 10.0)"`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., `getClientIp()` returns `"54.240.144.1"` instead of `"203.0.113.50"`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Fallback and Unrelated Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file `test/request/request-info-forwarded-for-preservation-tests.jest.mjs`
  - Import `RequestInfo` from `../../src/lib/tools/RequestInfo.class.js` and `fc` from `fast-check`
  - Observe on UNFIXED code: `RequestInfo` with no `x-forwarded-for` header and `identity.sourceIp: "192.168.1.1"` returns `getClientIp()` === `"192.168.1.1"`
  - Observe on UNFIXED code: `RequestInfo` with no `user-agent` header and `identity.userAgent: "Mozilla/5.0"` returns `getClientUserAgent()` === `"Mozilla/5.0"`
  - Observe on UNFIXED code: origin, referrer, if-modified-since, if-none-match, accept, parameters, body all parse identically regardless of `x-forwarded-for`/`user-agent` presence
  - Write property-based test: for all events WITHOUT `x-forwarded-for` header (or with empty/null value), `getClientIp()` returns `identity.sourceIp` (or null if identity missing)
  - Write property-based test: for all events WITHOUT `user-agent` header (or with empty/null value), `getClientUserAgent()` returns `identity.userAgent` (or null if identity missing)
  - Write property-based test: for all random events, `getClientOrigin()`, `getClientReferrer()`, `getClientIfModifiedSince()`, `getClientIfNoneMatch()`, `getClientAccept()`, `getClientParameters()`, `getClientBody()` produce identical results regardless of whether `x-forwarded-for` or `user-agent` headers are present (compare with and without these headers)
  - Write property-based test: for events with no headers and no identity data, IP and user agent remain null
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_


- [x] 3. Fix for X-Forwarded-For and User-Agent header priority in _clientRequestInfo

  - [x] 3.1 Implement the fix in `_clientRequestInfo` method
    - Open `src/lib/tools/RequestInfo.class.js` and locate the `_clientRequestInfo` method
    - After the existing `identity.sourceIp` check (~line 290), add a check for `x-forwarded-for` header: if `headers["x-forwarded-for"]` exists and is non-empty, extract the first IP from the comma-separated list (split by `,`, trim whitespace from first entry), and set `client.ip` to that value
    - After the existing `identity.userAgent` check (~line 295), add a check for `user-agent` header: if `headers["user-agent"]` exists and is non-empty, set `client.userAgent` to that value
    - Handle edge cases: `x-forwarded-for` value that is only whitespace or commas should fall back to identity value
    - Preserve the existing fallback behavior: identity values are used when headers are absent or empty
    - Do NOT modify any other parts of the method (origin, referrer, if-modified-since, if-none-match, accept, parameters, body)
    - Do NOT modify `ClientRequest.class.js` - it delegates to `RequestInfo` getters which read from the underlying data
    - _Bug_Condition: isBugCondition(input) where x-forwarded-for or user-agent headers are present but identity values are used instead_
    - _Expected_Behavior: When x-forwarded-for is present, client.ip = firstIp(headers["x-forwarded-for"]). When user-agent header is present, client.userAgent = headers["user-agent"]_
    - _Preservation: All non-x-forwarded-for/user-agent behavior unchanged. Fallback to identity when headers absent._
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - X-Forwarded-For and User-Agent Header Priority
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Fallback and Unrelated Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `test/request/request-info-forwarded-for-preservation-tests.jest.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Update JSDoc documentation for `_clientRequestInfo` method
    - Update the JSDoc comment for `_clientRequestInfo` in `src/lib/tools/RequestInfo.class.js`
    - Document that `client.ip` now prefers `x-forwarded-for` header (first IP from comma-separated list) over `identity.sourceIp`
    - Document that `client.userAgent` now prefers `user-agent` header over `identity.userAgent`
    - Document the fallback behavior when headers are absent
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite with `npm test` to ensure no regressions
  - Verify `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs` passes
  - Verify `test/request/request-info-forwarded-for-preservation-tests.jest.mjs` passes
  - Verify all existing `test/request/request-info-tests.jest.mjs` and `test/request/request-info-property-tests.jest.mjs` still pass
  - Ensure all tests pass, ask the user if questions arise.
