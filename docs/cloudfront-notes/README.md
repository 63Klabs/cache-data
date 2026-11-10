# CloudFront and API Gateway observations

This page records how API Gateway and CloudFront behave in front of a Lambda function, as observed on deployed REST APIs. Features of `@63klabs/cache-data` that depend on that behavior, such as client IP resolution, cite the observation they rely on.

Each observation has a date and a status: "Documented by AWS" (with a link) or "Not documented by AWS". AWS can change behavior that it does not document. To check an observation again, repeat the [method](#method).

All addresses on this page come from the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24`.

## Topologies

The observations refer to four deployment topologies.

| ID | Topology | Chain in `X-Forwarded-For` at the function | `identity.sourceIp` | Measured |
|----|----------|--------------------------------------------|---------------------|----------|
| T1 | Edge-optimized REST API, no CloudFront of your own | `..., C, M` | `C` | 2026-11-04, 2026-11-09 |
| T2 | Your CloudFront in front of an edge-optimized REST API | `..., V, E, M` | `E` | 2026-11-04, 2026-11-09 |
| T3 | Your CloudFront in front of a Regional REST API | `..., V, E` | `V` | 2026-11-09 |
| T4 | Regional REST API, no CloudFront | `..., C` | `C` | 2026-11-04 (chain), 2026-11-09 |

In the chains, `C` is the client, `V` is the viewer of your own CloudFront distribution, `E` is the edge address of your own CloudFront distribution, and `M` is the edge address of the CloudFront distribution that AWS manages for an edge-optimized API. Entries written by the client appear to the left of the entries that proxies append.

## Observations

| ID | Date | Topology | What was sent | What was seen | AWS documents it? | Effect on this package |
|----|------|----------|---------------|---------------|-------------------|------------------------|
| O1 | 2026-11-04 (T1, T2, T4), 2026-11-09 (T1 to T4) | T1 to T4 | A request with and without a forged `X-Forwarded-For` | Each CloudFront distribution appended the viewer address to the end of the header, and API Gateway appended the address that connected to it. Forged entries stayed on the left | Documented by AWS for CloudFront ([request and response behavior for custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html)). Not documented by AWS for the entry API Gateway appends | A hop count of `N` reads the entry `N` from the right |
| O2 | 2026-11-04 | Through CloudFront | Two `X-Forwarded-For` headers from the viewer | CloudFront joined them into one comma-separated value, in order | Not documented by AWS | The header is read as one comma-separated value |
| O3 | 2026-11-04 (T1, T2), 2026-11-09 (T1 to T4) | T1 to T4 | A forged `X-Forwarded-For` | `identity.sourceIp` was the client in T1, T3, and T4 and an edge address in T2. It never held a forged value | Documented by AWS as the address of the immediate TCP connection ([API Gateway variables](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html)). Not documented by AWS for T3 | The default hop count of `0` returns this value |
| O4 | 2026-11-04, 2026-11-09 | T1, T2 | A viewer-supplied `CloudFront-Viewer-Address` | The header was absent at the API | Not documented by AWS | The AWS-managed distribution drops a viewer-supplied value, so the header cannot be forged in T1 and T2 and gives nothing in T2 |
| O5 | 2026-11-04, 2026-11-09 | T4 | A viewer-supplied `CloudFront-Viewer-Address` | The API received the value unchanged | Not documented by AWS | A hop count of 2 or more, which reads the header, must not be set in T4 |
| O6 | 2026-11-09 | T3 | A viewer-supplied `CloudFront-Viewer-Address`, through a distribution using the managed `AllViewerExceptHostHeader` origin request policy | The API received the real viewer address and port. The supplied value was replaced | Not documented by AWS | At a hop count of 2 or more, the header holds the viewer address in T3 |
| O7 | 2026-11-09 | T3 | A request through a distribution using the managed `AllViewerExceptHostHeader` origin request policy | The policy forwarded `CloudFront-Viewer-Address` to a Regional origin | Documented by AWS as including additional CloudFront request headers for protocol, TLS version, device type, and viewer location ([managed origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)) | The earlier statement in this package's documentation that the policy does not forward the header was wrong and has been removed |
| O8 | 2026-11-09 | T1 to T4 | Forged `Forwarded`, `X-Real-Ip`, and `X-Forwarded-For` values | `identity.sourceIp` did not change | Not documented by AWS | The package reads neither `Forwarded` nor `X-Real-Ip` for the client IP |

## Method

### 2026-11-04 captures

The captures came from deployed REST API test stacks of each type, one of them with its own CloudFront distribution in front. The values were read from the Lambda event logs or the API Gateway execution logs. Requests carried marker values for `X-Forwarded-For` and `CloudFront-Viewer-Address`, taken from the documentation ranges.

### 2026-11-09 re-measurement

The re-measurement used one temporary stack with two REST APIs, one Regional and one edge-optimized. Each API had a mock integration and one `GET` method on the root resource, with the request template `{"statusCode": 200}`. Each API had a CloudFront distribution in front of it, using the managed `CachingDisabled` cache policy, the managed `AllViewerExceptHostHeader` origin request policy, and HTTPS to the origin.

The response mapping template returns the value of `$context.identity.sourceIp` and the two request headers:

```text
{"sourceIp":"$context.identity.sourceIp","xff":"$util.escapeJavaScript($input.params('X-Forwarded-For'))","viewerAddress":"$util.escapeJavaScript($input.params('CloudFront-Viewer-Address'))"}
```

Requests came from one client address, directly to each API and through its distribution, with four header variants:

1. No forwarding headers.
2. `X-Forwarded-For: 192.0.2.1`
3. `X-Forwarded-For: 192.0.2.1, 192.0.2.2`
4. `X-Forwarded-For` together with `Forwarded: for=192.0.2.3`, `X-Real-Ip: 192.0.2.4`, and `CloudFront-Viewer-Address: 192.0.2.5:1234`

The stack was deleted afterwards.

### Limits

- The 2026-11-09 stack used mock integrations instead of a Lambda proxy integration. `$context.identity.sourceIp` is the same API Gateway field that fills `requestContext.identity.sourceIp` in a Lambda proxy event.
- Requests came from one client address.
- Only IPv4 was tested.

## Adding an observation

Record each new observation with the same fields as the table in [Observations](#observations):

- **ID**: the next free number, such as O9.
- **Date**: the day it was measured.
- **Topology**: the topology from the [Topologies](#topologies) table, or a new one described there.
- **What was sent**: the request, with documentation range addresses only.
- **What was seen**: the result at the function or at the API.
- **AWS documents it?**: "Documented by AWS" with a link to the AWS page, or "Not documented by AWS".
- **Effect on this package**: what the package does because of it.

Add one row or section per observation. Put a new topic in a new file in this directory, and link that file from this page. Link from the feature documentation that depends on the observation to its ID. Never record a real IP address, account ID, endpoint ID, distribution domain, stack name, or CloudFront edge address range.

## Related documentation

- [Client IP resolution](../features/tools/README.md#client-ip-resolution) - How `getClientIp()` chooses the client address and which hop count to set for each topology
- [Lambda proxy response body observations](lambda-proxy-response-body.md) - What API Gateway REST API does with a `null`, missing, or empty `body`, and the feature of `Response` that depends on it
