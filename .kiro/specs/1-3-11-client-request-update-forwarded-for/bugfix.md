# Bugfix Requirements Document

## Introduction

When API Gateway is deployed behind CloudFront, the `ClientRequest` class returns CloudFront's IP address and user agent string instead of the original client's values. The `_clientRequestInfo` method in `RequestInfo.class.js` reads `identity.sourceIp` and `identity.userAgent` from the API Gateway event's `requestContext.identity`, which reflect CloudFront's identity rather than the end user's. The fix should prefer the `x-forwarded-for` and `user-agent` HTTP headers, which carry the original client values through the proxy chain. Since this fix produces expected behavior, backwards compatibility is not required.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN API Gateway is behind CloudFront AND the request contains an `x-forwarded-for` header with the original client IP THEN the system returns CloudFront's IP address from `identity.sourceIp` instead of the original client IP

1.2 WHEN API Gateway is behind CloudFront AND the `x-forwarded-for` header contains multiple comma-separated IP addresses THEN the system ignores the header entirely and returns CloudFront's IP address from `identity.sourceIp`

1.3 WHEN API Gateway is behind CloudFront AND the request contains a `user-agent` header with the original client's user agent THEN the system returns "Amazon CloudFront" from `identity.userAgent` instead of the original client's user agent

### Expected Behavior (Correct)

2.1 WHEN the request contains an `x-forwarded-for` header with a single IP address THEN the system SHALL use that IP address as the client IP

2.2 WHEN the `x-forwarded-for` header contains multiple comma-separated IP addresses THEN the system SHALL extract only the first IP address (the original client) and use that as the client IP

2.3 WHEN the request contains a `user-agent` header THEN the system SHALL use the `user-agent` header value as the client user agent

2.4 WHEN the request does not contain an `x-forwarded-for` header THEN the system SHALL fall back to `identity.sourceIp` as the client IP

2.5 WHEN the request does not contain a `user-agent` header THEN the system SHALL fall back to `identity.userAgent` as the client user agent

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the request does not contain an `x-forwarded-for` header AND `identity.sourceIp` is available THEN the system SHALL CONTINUE TO return `identity.sourceIp` as the client IP

3.2 WHEN the request does not contain a `user-agent` header AND `identity.userAgent` is available THEN the system SHALL CONTINUE TO return `identity.userAgent` as the client user agent

3.3 WHEN the request contains origin, referer, if-modified-since, if-none-match, accept, or query string parameters THEN the system SHALL CONTINUE TO parse and return those values correctly

3.4 WHEN the request contains no headers and no identity data THEN the system SHALL CONTINUE TO return null for client IP and user agent
