# Bugfix Requirements Document

## Introduction

The GitHub Actions CI workflow fails intermittently on the Node 24 matrix entry because the backwards compatibility test file `test/request/api-request-backwards-compat-tests.jest.mjs` makes real HTTP requests to the external service `httpbin.org`. This external dependency is unreliable from GitHub Actions runners — it can be slow, rate-limited, or unavailable — causing network timeouts or unexpected response codes that fail the test suite. Since CI must pass for NPM deployment, these flaky failures block releases.

The affected test groups are:
- **"Response Format Compatibility"** (3 tests) — requests to `/status/200`, `/get`
- **"Requests Without Pagination Behave Identically"** (3 tests) — requests to `/get`, `/headers`
- **"Requests Without Retry Behave Identically"** (3 tests) — requests to `/status/200`, `/status/500`, `/delay/10`

The remaining test groups in the same file (Constructor Compatibility, Static Method Compatibility, Public API Compatibility, Query String Building Compatibility, Redirect Handling Compatibility, Options Merging Compatibility) are already pure unit tests that do not make HTTP requests and are unaffected.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the "Response Format Compatibility" tests run in CI and `httpbin.org` is slow, unavailable, or rate-limiting THEN the system fails with network timeout errors or unexpected HTTP status codes, causing the CI workflow to fail

1.2 WHEN the "Requests Without Pagination Behave Identically" tests run in CI and `httpbin.org` is slow, unavailable, or rate-limiting THEN the system fails with network timeout errors or unexpected HTTP status codes, causing the CI workflow to fail

1.3 WHEN the "Requests Without Retry Behave Identically" tests run in CI and `httpbin.org` is slow, unavailable, or rate-limiting THEN the system fails with network timeout errors or unexpected HTTP status codes, causing the CI workflow to fail

### Expected Behavior (Correct)

2.1 WHEN the "Response Format Compatibility" tests run in CI THEN the system SHALL pass reliably without depending on external HTTP services by using mocked HTTP responses that simulate the expected `httpbin.org` behavior

2.2 WHEN the "Requests Without Pagination Behave Identically" tests run in CI THEN the system SHALL pass reliably without depending on external HTTP services by using mocked HTTP responses that simulate the expected `httpbin.org` behavior

2.3 WHEN the "Requests Without Retry Behave Identically" tests run in CI THEN the system SHALL pass reliably without depending on external HTTP services by using mocked HTTP responses that simulate the expected `httpbin.org` behavior

2.4 WHEN the mocked HTTP tests run THEN the system SHALL still validate the same backwards compatibility properties as the original tests: response format structure, absence of metadata when features are disabled, correct success/failure status codes, and timeout handling

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the "Constructor Compatibility" tests run THEN the system SHALL CONTINUE TO validate that `ApiRequest` accepts old parameter formats, minimal request objects, URI-based requests, POST requests with body, and array parameters without any changes

3.2 WHEN the "Static Method Compatibility" tests run THEN the system SHALL CONTINUE TO validate that `ApiRequest.responseFormat()` returns the correct structure and `ApiRequest.MAX_REDIRECTS` equals 5

3.3 WHEN the "Public API Compatibility" tests run THEN the system SHALL CONTINUE TO validate that all public methods exist and return correct values (`send`, `send_get`, `resetRequest`, `updateRequestURI`, `addRedirect`, `getNumberOfRedirects`, `setResponse`, `getURI`, `getBody`, `getMethod`, `getNote`, `getTimeOutInMilliseconds`, `getHost`, `toObject`)

3.4 WHEN the "Query String Building Compatibility" tests run THEN the system SHALL CONTINUE TO validate query string construction with simple parameters, combined array parameters, separate array parameters, and special character encoding

3.5 WHEN the "Redirect Handling Compatibility" tests run THEN the system SHALL CONTINUE TO validate redirect tracking and URI updates

3.6 WHEN the "Options Merging Compatibility" tests run THEN the system SHALL CONTINUE TO validate that custom options merge with defaults, default timeout is 8000ms, and custom timeout overrides the default

---

### Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(T)
  INPUT: T of type TestCase
  OUTPUT: boolean
  
  // Returns true when the test makes a real HTTP request to an external service
  RETURN T.describeBlock IN {"Response Format Compatibility", "Requests Without Pagination Behave Identically", "Requests Without Retry Behave Identically"}
    AND T.callsApiRequestSend = true
    AND T.httpTarget = "httpbin.org"
    AND T.httpLayerIsMocked = false
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking - All httpbin-dependent tests use mocked HTTP
FOR ALL T WHERE isBugCondition(T) DO
  T' ← applyFix(T)
  ASSERT T'.httpLayerIsMocked = true
    AND T'.passesReliably = true
    AND T'.validatesBackwardsCompatibility = true
END FOR
```

### Preservation Property

```pascal
// Property: Preservation Checking - Non-HTTP tests remain unchanged
FOR ALL T WHERE NOT isBugCondition(T) DO
  ASSERT T(before_fix) = T(after_fix)
END FOR
```
