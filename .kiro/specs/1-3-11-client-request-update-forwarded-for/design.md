# Client Request Update - Forwarded For Bugfix Design

## Overview

When API Gateway is deployed behind CloudFront, the `_clientRequestInfo` method in `RequestInfo.class.js` returns CloudFront's IP and user agent instead of the original client's values. The method currently reads `identity.sourceIp` and `identity.userAgent` from the API Gateway event's `requestContext.identity`, which reflect CloudFront's identity. The fix will prioritize the `x-forwarded-for` and `user-agent` HTTP headers, which carry the original client values through the proxy chain, falling back to `identity` values when headers are absent.

## Glossary

- **Bug_Condition (C)**: The condition where `x-forwarded-for` or `user-agent` headers are present in the request but ignored in favor of `identity.sourceIp` and `identity.userAgent`
- **Property (P)**: When proxy headers are present, the system should use them as the source of client IP and user agent; when absent, fall back to identity values
- **Preservation**: All other client request parsing (origin, referrer, if-modified-since, if-none-match, accept, query parameters, body) must remain unchanged
- **`_clientRequestInfo`**: The method in `src/lib/tools/RequestInfo.class.js` (lines ~270-330) that parses the Lambda event into a client data object containing IP, user agent, and other request metadata
- **`RequestInfo`**: The base class in `src/lib/tools/RequestInfo.class.js` that processes Lambda events and provides client data accessors (`getClientIp()`, `getClientUserAgent()`, etc.)
- **`ClientRequest`**: The class in `src/lib/tools/ClientRequest.class.js` that extends `RequestInfo` and calls `this.getClientIp()` and `this.getClientUserAgent()` in its constructor to populate `client.ip` and `client.userAgent`
- **`identity`**: The `event.requestContext.identity` object from API Gateway, containing `sourceIp` and `userAgent` which reflect the immediate caller (CloudFront when behind a CDN)

## Bug Details

### Bug Condition

The bug manifests when API Gateway is behind CloudFront (or any reverse proxy) and the request includes `x-forwarded-for` and/or `user-agent` HTTP headers containing the original client's values. The `_clientRequestInfo` method reads `identity.sourceIp` and `identity.userAgent` but never checks the corresponding HTTP headers, so the original client values are lost.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type APIGatewayEvent
  OUTPUT: boolean

  LET headers = lowercaseKeys(input.headers) OR {}
  LET identity = input.requestContext.identity OR {}

  LET hasForwardedFor = "x-forwarded-for" IN headers
                        AND headers["x-forwarded-for"] IS NOT null
                        AND headers["x-forwarded-for"] IS NOT ""

  LET hasUserAgentHeader = "user-agent" IN headers
                           AND headers["user-agent"] IS NOT null
                           AND headers["user-agent"] IS NOT ""

  LET ipFromIdentity = identity.sourceIp OR null
  LET uaFromIdentity = identity.userAgent OR null

  // Bug: x-forwarded-for header present but identity.sourceIp used instead
  LET ipBug = hasForwardedFor AND ipFromIdentity IS NOT null
              AND ipFromIdentity != firstIp(headers["x-forwarded-for"])

  // Bug: user-agent header present but identity.userAgent used instead
  LET uaBug = hasUserAgentHeader AND uaFromIdentity IS NOT null
              AND uaFromIdentity != headers["user-agent"]

  RETURN ipBug OR uaBug
END FUNCTION
```

### Examples

- **Single IP in x-forwarded-for**: Event has `x-forwarded-for: "203.0.113.50"` and `identity.sourceIp: "54.240.144.1"` (CloudFront IP). Current: returns `"54.240.144.1"`. Expected: returns `"203.0.113.50"`.
- **Multiple IPs in x-forwarded-for**: Event has `x-forwarded-for: "203.0.113.50, 70.132.20.1, 54.240.144.1"` and `identity.sourceIp: "54.240.144.1"`. Current: returns `"54.240.144.1"`. Expected: returns `"203.0.113.50"` (first IP only).
- **CloudFront user agent**: Event has `user-agent: "Mozilla/5.0 (Windows NT 10.0)"` header and `identity.userAgent: "Amazon CloudFront"`. Current: returns `"Amazon CloudFront"`. Expected: returns `"Mozilla/5.0 (Windows NT 10.0)"`.
- **No x-forwarded-for header**: Event has no `x-forwarded-for` header and `identity.sourceIp: "192.168.1.1"`. Current and expected: returns `"192.168.1.1"` (fallback behavior, unchanged).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When no `x-forwarded-for` header is present, `identity.sourceIp` continues to be used as client IP
- When no `user-agent` header is present, `identity.userAgent` continues to be used as client user agent
- Origin header parsing must continue to work exactly as before
- Referrer header parsing (including query string stripping) must remain unchanged
- `if-modified-since`, `if-none-match`, and `accept` header parsing must remain unchanged
- Query string parameter extraction must remain unchanged
- Body handling must remain unchanged
- The `client` object structure (ip, userAgent, origin, referrer, ifModifiedSince, ifNoneMatch, accept, headers, parameters, body) must remain unchanged
- When no headers and no identity data are present, IP and user agent remain null

**Scope:**
All inputs that do NOT involve `x-forwarded-for` or `user-agent` headers should be completely unaffected by this fix. This includes:
- Events without proxy headers (direct API Gateway calls)
- Mouse/touch interactions or other non-header request properties
- All other header fields (origin, referer, accept, etc.)
- Query string parameters and body content

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is straightforward:

1. **Missing Header Priority Logic for IP**: The `_clientRequestInfo` method (line ~290) sets `client.ip` from `identity.sourceIp` but never checks the `x-forwarded-for` header. When behind CloudFront, `identity.sourceIp` contains CloudFront's IP, not the original client's. The `x-forwarded-for` header is already available in the lowercased `headers` object but is never read for IP extraction.

2. **Missing Header Priority Logic for User Agent**: The method (line ~295) sets `client.userAgent` from `identity.userAgent` but never checks the `user-agent` header. When behind CloudFront, `identity.userAgent` is `"Amazon CloudFront"`. The `user-agent` header value (containing the real client UA) is already in the lowercased `headers` object but is never read for user agent extraction.

3. **Headers Already Available**: The method already lowercases all header keys and stores them in a local `headers` object. The fix only needs to add priority checks for `x-forwarded-for` and `user-agent` before falling back to identity values.

## Correctness Properties

Property 1: Bug Condition - X-Forwarded-For and User-Agent Header Priority

_For any_ API Gateway event where the `x-forwarded-for` header is present and non-empty, the fixed `_clientRequestInfo` method SHALL use the first IP address from the comma-separated `x-forwarded-for` header value (trimmed) as `client.ip`. _For any_ event where the `user-agent` header is present and non-empty, the fixed method SHALL use the `user-agent` header value as `client.userAgent`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Fallback and Unrelated Behavior

_For any_ API Gateway event where the `x-forwarded-for` header is NOT present (or is empty/null), the fixed `_clientRequestInfo` method SHALL produce the same `client.ip` as the original method (using `identity.sourceIp`). _For any_ event where the `user-agent` header is NOT present (or is empty/null), the fixed method SHALL produce the same `client.userAgent` as the original method (using `identity.userAgent`). _For all_ events, the fixed method SHALL produce identical values for `client.origin`, `client.referrer`, `client.ifModifiedSince`, `client.ifNoneMatch`, `client.accept`, `client.headers`, `client.parameters`, and `client.body`.

**Validates: Requirements 2.4, 2.5, 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/tools/RequestInfo.class.js`

**Function**: `_clientRequestInfo`

**Specific Changes**:

1. **Add x-forwarded-for header check before identity.sourceIp**: After the headers are lowercased and before the identity-based IP assignment, check if `x-forwarded-for` exists in headers. If present, extract the first IP from the comma-separated list (trim whitespace) and use it as `client.ip`. Only fall back to `identity.sourceIp` if `x-forwarded-for` is not present or empty.

2. **Add user-agent header check before identity.userAgent**: Similarly, check if the `user-agent` header exists in the lowercased headers object. If present and non-empty, use it as `client.userAgent`. Only fall back to `identity.userAgent` if the header is not present or empty.

3. **Preserve existing header assignment order**: The `x-forwarded-for` and `user-agent` checks should be placed after the headers are lowercased (existing code) and should replace the current identity-only assignments. The rest of the method (origin, referrer, if-modified-since, etc.) remains untouched.

4. **Handle edge cases in x-forwarded-for parsing**: When splitting by comma, trim whitespace from the first entry. Handle cases where the header value is just whitespace or commas.

5. **No changes to ClientRequest.class.js**: The `ClientRequest` class calls `this.getClientIp()` and `this.getClientUserAgent()` which delegate to `RequestInfo.getClient("ip")` and `RequestInfo.getClient("userAgent")`. Since the fix is in `_clientRequestInfo` which populates the underlying data, no changes are needed in `ClientRequest`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that create API Gateway events with `x-forwarded-for` and `user-agent` headers alongside `identity.sourceIp` and `identity.userAgent`, then assert that the client IP and user agent match the header values. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Single IP Forwarded-For Test**: Create event with `x-forwarded-for: "203.0.113.50"` and `identity.sourceIp: "54.240.144.1"`, assert `getClientIp()` returns `"203.0.113.50"` (will fail on unfixed code)
2. **Multiple IP Forwarded-For Test**: Create event with `x-forwarded-for: "203.0.113.50, 70.132.20.1"` and `identity.sourceIp: "54.240.144.1"`, assert `getClientIp()` returns `"203.0.113.50"` (will fail on unfixed code)
3. **User-Agent Header Priority Test**: Create event with `user-agent: "Mozilla/5.0"` header and `identity.userAgent: "Amazon CloudFront"`, assert `getClientUserAgent()` returns `"Mozilla/5.0"` (will fail on unfixed code)
4. **Both Headers Present Test**: Create event with both `x-forwarded-for` and `user-agent` headers alongside different identity values, assert both are read from headers (will fail on unfixed code)

**Expected Counterexamples**:
- `getClientIp()` returns `identity.sourceIp` value instead of `x-forwarded-for` first IP
- `getClientUserAgent()` returns `identity.userAgent` value instead of `user-agent` header
- Possible cause: `_clientRequestInfo` only reads from `identity` object, never checks headers for IP/UA

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := _clientRequestInfo_fixed(input)
  LET expectedIp = firstIp(input.headers["x-forwarded-for"])
  LET expectedUa = input.headers["user-agent"]
  ASSERT result.ip == expectedIp
  ASSERT result.userAgent == expectedUa
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT _clientRequestInfo_original(input) = _clientRequestInfo_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss (empty headers, null values, whitespace-only values)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for events without `x-forwarded-for`/`user-agent` headers, then write property-based tests capturing that behavior.

**Test Cases**:
1. **IP Fallback Preservation**: Verify that events without `x-forwarded-for` header continue to use `identity.sourceIp`
2. **UA Fallback Preservation**: Verify that events without `user-agent` header continue to use `identity.userAgent`
3. **Other Headers Preservation**: Verify that origin, referrer, if-modified-since, if-none-match, accept parsing is identical before and after fix
4. **Null/Empty Preservation**: Verify that events with no headers and no identity data still return null for IP and user agent

### Unit Tests

- Test `x-forwarded-for` with single IP extracts correctly
- Test `x-forwarded-for` with multiple comma-separated IPs extracts first IP
- Test `x-forwarded-for` with whitespace around IPs trims correctly
- Test `user-agent` header takes priority over `identity.userAgent`
- Test fallback to `identity.sourceIp` when no `x-forwarded-for` header
- Test fallback to `identity.userAgent` when no `user-agent` header
- Test null/empty `x-forwarded-for` falls back to identity
- Test null/empty `user-agent` header falls back to identity
- Test event with no headers and no identity returns null for both

### Property-Based Tests

- Generate random API Gateway events with `x-forwarded-for` headers containing 1-5 random IPs and verify the first IP is always used as client IP
- Generate random events without `x-forwarded-for` and verify `identity.sourceIp` is used (preservation)
- Generate random events with various header combinations and verify all non-IP/UA fields (origin, referrer, accept, etc.) are parsed identically to the original implementation

### Integration Tests

- Test full `RequestInfo` construction with CloudFront-style event (identity has CloudFront values, headers have real client values)
- Test `ClientRequest` construction with CloudFront-style event and verify `client.ip` and `client.userAgent` in props reflect header values
- Test that `toObject()` serialization includes correct IP and user agent from headers
