# Security advisory draft: client IP can be chosen by the client

> **Status**: Draft for the developer. Publishing it, and filing it through the GitHub Security Advisory form for `63Klabs/cache-data`, is a separate step that this spec does not perform. The sections below follow the form's fields. Delete this note before publishing.
>
> All addresses in this draft are from the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737). The draft contains no real IP addresses, account IDs, or endpoint identifiers.

## Title

`getClientIp()` returns a client-controlled value behind CloudFront and API Gateway

## Summary

In `@63klabs/cache-data` versions 1.3.11 through 1.4.0, `ClientRequest.getClientIp()` and `getProps().client.ip` returned the first (leftmost) entry of the `X-Forwarded-For` header. The client controls that entry: CloudFront and API Gateway append to whatever the client sends. A request sent with `X-Forwarded-For: 192.0.2.1` was therefore reported, and written to the `RESPONSE` log line, as coming from `192.0.2.1`.

Version 1.4.1 reads the address from sources that a trusted proxy wrote. Only deployments with their own CloudFront distribution in front of an edge-optimized REST API must also set the new environment variable `CACHE_DATA_TRUSTED_PROXY_HOPS` (see [Who must act after upgrading](#who-must-act-after-upgrading)). At the default, no topology can have its client IP chosen by the client.

## Package and versions

| Field | Value |
|---|---|
| Ecosystem | npm |
| Package | `@63klabs/cache-data` |
| Affected versions | `>= 1.3.11, <= 1.4.0` |
| Patched version | `1.4.1` |

## Severity

Left for the developer to set in the advisory form. Inputs for the CVSS calculation:

- Attack vector: network.
- Attack complexity: low. The attacker sets one request header.
- Privileges required: none.
- User interaction: none.
- Scope: unchanged.
- Confidentiality: the `queryKeys` log field also wrote query values to the logs (see below); that is a limited disclosure to anyone who can read the function's logs, not to the requester.
- Integrity: limited to logged and application-level IP data. The package's cache and endpoint modules are not affected.
- Availability: none.

## Description

### Forgeable client IP

`ClientRequest` took the client IP from the first `X-Forwarded-For` entry. Behind CloudFront and API Gateway, each proxy appends the address of the peer that connected to it, so only the entries on the right of the header were written by infrastructure. Everything to the left of them is whatever the client sent.

Measured on 2026-11-04 on deployed test stacks with a request sending `X-Forwarded-For: 192.0.2.1`, the `RESPONSE` log lines of both an edge-optimized API with no distribution of its own and an edge-optimized API behind a distribution of its own recorded `192.0.2.1` as the client IP.

### Related defects fixed in the same release

- **`RESPONSE` log field injection.** Request-derived fields in the `RESPONSE` log line (client IP, user agent, origin, referrer, resource, query keys, route and query logs, API key) were written without removing the `|` field delimiter or control characters such as CR and LF. A request could shift or add fields in the line, and could break line-oriented tools. The clean-up that was meant to remove `|` from the user agent matched nothing.
- **Query values in the logs.** The `queryKeys` field of `getRequestLog()` and of the `RESPONSE` line contained `key=value` pairs, although it is documented as holding keys only. Query values such as tokens or email addresses were written to the logs.

## Impact

An attacker who can send requests to an affected deployment can choose the address that:

- `getClientIp()` and `getProps().client.ip` return to the application,
- the `RESPONSE` log line records, and therefore what dashboards, metric filters, and alarms built on that line show.

Any application logic that relies on `getClientIp()` is affected, for example rate limiting, allowlists and denylists, geolocation, and audit records. The attacker can hide their own address or attribute requests to another address.

Through the log defects, an attacker could also alter how the `RESPONSE` line parses, and query values were readable by anyone with access to the function's logs.

The cache module (`Cache`, `CacheData`, `S3Cache`, `DynamoDbCache`) and the endpoint module are not affected.

## Patches

Version 1.4.1 resolves the client IP in this order, using the first source that yields a valid IP address:

1. `CloudFront-Viewer-Address`, only when the hop count is 2 or more.
2. The `X-Forwarded-For` entry counted from the right by the number of trusted proxies (`CACHE_DATA_TRUSTED_PROXY_HOPS`), only when the count is 1 or more.
3. `event.requestContext.identity.sourceIp`.

It also removes `|` and control characters from request-derived `RESPONSE` log fields, and makes `queryKeys` list keys only. Use `addQueryLog()` to log chosen query values.

`CACHE_DATA_TRUSTED_PROXY_HOPS` is the number of trusted proxies that append to `X-Forwarded-For` in front of the function. It defaults to `0`, which returns `event.requestContext.identity.sourceIp`. An invalid value logs one warning and uses `0`. A count above the real number of proxies in front of the function is not safe: it can select an entry the client wrote.

## Who must act after upgrading

Upgrade to 1.4.1 first. Then find your topology and set the variable if the table says so. Only T2 must act.

| Topology | Hop count to set | Chain at the function | `identity.sourceIp` | Result at the default (`0`) |
|---|---|---|---|---|
| **T1.** Edge-optimized REST API, no CloudFront distribution of your own | Nothing. The default `0` is correct (`2` also works) | Client address, then the AWS-managed distribution's address (measured 2026-11-04 and 2026-11-09) | The client | Correct. A forged entry is never read |
| **T2.** Your CloudFront distribution in front of an edge-optimized REST API | Set `CACHE_DATA_TRUSTED_PROXY_HOPS=3` | Viewer address, your distribution's edge address, then the AWS-managed distribution's address (measured 2026-11-04 and 2026-11-09) | Your distribution's edge address | Not forgeable, but the logged IP is your distribution's edge address instead of the viewer's, until you set `3` |
| **T3.** Your CloudFront distribution in front of a Regional REST API | Nothing. The default `0` is correct | Viewer address, then your distribution's edge address (measured 2026-11-09) | The viewer | Correct |
| **T4.** Regional REST API with no CloudFront | Nothing. The default `0` is correct (`1` also works) | Client address only (measured 2026-11-04 and 2026-11-09) | The client (measured 2026-11-09; the 2026-11-04 capture did not record it) | Correct. Not forgeable |

Notes:

- A hop count above the real number of proxies lets a client choose the result. Set a count only for T2.
- `0` makes the resolver use only `identity.sourceIp`.
- On Atlantis-style deployments the starter's API is edge-optimized. It is T1 without the network template and T2 with it.

### Work out which topology you have

Replace `<id>` with your REST API id.

```bash
# API endpoint type: EDGE or REGIONAL
aws apigateway get-rest-api --rest-api-id <id> --query 'endpointConfiguration.types'

# CloudFront distributions whose origin is that API
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[?starts_with(DomainName, '<id>.execute-api.')]].{Id: Id, Domain: DomainName}"
```

A distribution that reaches the API through an API Gateway custom domain name does not match the second query.

Then send a marker request with debug logging on and read the `ClientIpResolver:` line:

```bash
curl -H "X-Forwarded-For: 192.0.2.1" "https://<your-api-url>/<path>"
```

The line reports the number of `X-Forwarded-For` entries, the hop count in use, and which source produced the IP, without addresses. The reported number of entries minus one is the count that matches your chain. Set it only for T2; leave the default in T1, T3, and T4.

## Recommendation: lock the origin

Setting the hop count cannot defend against a request that skips your own infrastructure. In T2 at `3`, a client that calls the API Gateway endpoint directly, instead of your CloudFront distribution, can still send a forged `X-Forwarded-For`. The chain is then shorter than expected, and the function falls back to `identity.sourceIp`, which is the real caller, but any entries the client put on the left remain in the header for other code that reads it. No package setting prevents the direct call.

Restrict the API to your distribution with infrastructure:

1. Have CloudFront add a secret origin-verify header to every request it sends to the API.
2. Check that header in AWS WAF or in a Lambda authorizer, and reject requests without it.

See the AWS blog post [Restricting access to HTTP APIs with a Lambda authorizer](https://aws.amazon.com/blogs/networking-and-content-delivery/restricting-access-http-api-gateway-lambda-authorizer/). It describes the pattern for HTTP APIs; the same idea applies to REST APIs with AWS WAF or a Lambda authorizer.

Keep the origin-verify secret out of the repository and rotate it on a schedule.

## Workarounds

If you cannot upgrade immediately:

- **T1 (edge-optimized, no CloudFront of your own).** Read `event.requestContext.identity.sourceIp` directly instead of calling `getClientIp()`. For an edge-optimized API it holds the peer of the AWS-managed distribution, which is the client, and viewer-supplied `X-Forwarded-For` entries did not change it when measured.
- **T4 (Regional, no CloudFront).** Read `event.requestContext.identity.sourceIp` directly. Measured 2026-11-09: it is the connecting client and forged headers did not change it.
- **T3 (your own CloudFront, Regional API).** Read `event.requestContext.identity.sourceIp` directly. Measured 2026-11-09: it is the connecting client and forged headers did not change it.
- **T2 (your own CloudFront, edge-optimized API).** Read the `X-Forwarded-For` entry 3 from the right and ignore entries to its left. Or restrict the API to your distribution (see above).
- **Everywhere.** Do not use `getClientIp()` or the `RESPONSE` log's client IP field as the only input to a security decision. Do not parse the `RESPONSE` line positionally in alarms that act on it. Avoid logging sensitive values in query strings, because 1.4.0 and earlier logged them through `queryKeys`; review the log group's retention and access policy.

## Remediation steps

1. Upgrade to `@63klabs/cache-data` 1.4.1:

   ```bash
   npm install @63klabs/cache-data@1.4.1
   ```

2. Identify your topology (T1 to T4) with the commands above.
3. For T2 set `CACHE_DATA_TRUSTED_PROXY_HOPS=3` as a Lambda function environment variable. T1, T3, and T4 need no setting.
4. (T2) Deploy, send the marker request, and confirm that the `ClientIpResolver:` line shows the hop count you expect and that the logged IP is your own address, not `192.0.2.1`.
5. For T2, add the origin lock.
6. Check dashboards, metric filters, and alarms that parse the `RESPONSE` line:
   - An empty client IP is now logged as `-`.
   - `queryKeys` holds keys only. Use `addQueryLog()` for values you need.
   - `|` and control characters no longer appear inside request-derived fields.
7. Review application code and alarms that treated an IP from 1.3.11 to 1.4.0 as trustworthy, and review logs from that period for forged or unexpected addresses.

## Behavior changes to expect

- A client behind a corporate proxy that adds its own `X-Forwarded-For` is reported as the proxy's egress address, the address CloudFront saw.
- A selected value that is not a valid IP address falls through to the next source instead of being returned.
- In T2 with the variable unset, the logged IP is your distribution's edge address.
- `CloudFront-Viewer-Address` is read only when the count is 2 or more, so it is not read at the default.

## Known limitations

- Requests that reach API Gateway without passing through your own CloudFront (T2 at `3`) can still forge `X-Forwarded-For`. Only an origin lock fixes that.
- That CloudFront drops a viewer-supplied `CloudFront-Viewer-Address` in T1 and T2 was observed on 2026-11-04 and is not documented by AWS. If AWS changes it, step 1 would trust a forged header in T1 when the count is 2 or more. At the default the step is off.
- AWS does not document what `identity.sourceIp` holds on a Regional API behind your own CloudFront (T3). It was observed on 2026-11-09 (see `docs/cloudfront-notes/README.md`). If AWS changes it, set the variable explicitly.

## References

- `CHANGELOG.md`, entries under `v1.4.1`: "Client IP can no longer be chosen by the client", "`queryKeys` logs keys only", "`CACHE_DATA_TRUSTED_PROXY_HOPS`", and "`RESPONSE` log fields can't add or shift fields".
- `docs/features/tools/README.md`, "Client IP resolution" subsection of the ClientRequest section.
- `docs/cloudfront-notes/README.md`, observed CloudFront and API Gateway behavior with dates.
- [Restricting access to HTTP APIs with a Lambda authorizer](https://aws.amazon.com/blogs/networking-and-content-delivery/restricting-access-http-api-gateway-lambda-authorizer/) (AWS blog).
- Spec: `.kiro/specs/1-4-1-trusted-client-ip/`.

## Weaknesses

Suggested CWE identifiers for the form:

- CWE-348: Use of Less Trusted Source
- CWE-290: Authentication Bypass by Spoofing (applies where the application uses the address for access decisions)
- CWE-117: Improper Output Neutralization for Logs
- CWE-532: Insertion of Sensitive Information into Log File

## Credits

- Reporter: _placeholder, to be completed by the developer_
- Analyst: _placeholder, to be completed by the developer_
- Remediation developer: _placeholder, to be completed by the developer_
- Remediation reviewer: _placeholder, to be completed by the developer_
