# Trusted Client IP Resolution and Response Log Sanitization

> **Status**: Locked 2026-11-04. All questions (Q1–Q16) answered; runtime capture completed (Round 4). Requirements are in [requirements.md](requirements.md), the design in [design.md](design.md), and the task list in [tasks.md](tasks.md).
> **Issue**: Chat request (no ISSUE.md). Client IP can be spoofed behind CloudFront → API Gateway; fix the resolution order and two log clean-up defects.
> **Reviewed against**: `dev` at `2299b63` on 2026-11-02
> **Release**: v1.4.1 (patch, Q1)

## 1. Summary

`getClientIp()` returns the **leftmost** `X-Forwarded-For` entry. CloudFront appends the real viewer IP to whatever `X-Forwarded-For` the viewer sent, so the leftmost entry is attacker-controlled. Every consumer of `getClientIp()` (the `RESPONSE` log line, `getProps().client.ip`, and any application logic such as rate limiting or allowlists) can be fed a forged IP with one request header.

The resolution order becomes:

1. `cloudfront-viewer-address` (set by CloudFront from the TCP connection), with the port removed. Trusted only when `CACHE_DATA_TRUSTED_PROXY_HOPS` is 2 or more (Q8). In the capture, a viewer-supplied value never reached Lambda.
2. `x-forwarded-for`, read from the **right**: the entry `N` from the right, where `N` is `CACHE_DATA_TRUSTED_PROXY_HOPS`. The default describes an **edge-optimized REST API with no CloudFront distribution of your own** (AWS-managed CloudFront → API Gateway, U4), measured at `2`. With your own CloudFront in front of an edge-optimized API the measured value is `3`.
3. `requestContext.identity.sourceIp`.

Each candidate must be a valid IP or the next step is tried (Q9).

The same spec cleans every request- and application-derived field in the `RESPONSE` log line (Q10), which covers the two reported defects: the user-agent `|` removal regex is a no-op, and the client IP is written without any cleaning. It also stops `queryKeys` from logging query values (F1, Q13). The documentation describes each deployment scenario with its hop count and gives commands to work out the value for a deployment (U5).

## 2. Assessment of the request

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | The IP comes from `x-forwarded-for` first entry, then `identity.sourceIp` | Confirmed | `src/lib/tools/RequestInfo.class.js:313-324` |
| C2 | Behind CloudFront the IP can be spoofed | Confirmed | CloudFront appends the viewer IP to a viewer-supplied `X-Forwarded-For` ([CloudFront docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html)); the code takes index 0 |
| C3 | `cloudfront-viewer-address` can be checked first | Confirmed, with conditions | Headers are already lowercased (`RequestInfo.class.js:298-300`). CloudFront only sends it when an origin request policy includes it ([docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)). Format is `IP:port`; IPv6 is sent without brackets, for example `2001:db8::1:60776` ([nginx #2524](https://trac.nginx.org/nginx/ticket/2524)) |
| C4 | The user-agent `|` removal does nothing | Confirmed | `Response.class.js:749` uses `/|/g`, an empty alternation. Ran locally: `"a|b|c".replace(/|/g, "")` → `"a|b|c"` |
| C5 | The client IP is not cleaned before logging | Confirmed | `Response.class.js:747` pushes `clientIp` as-is; fields are joined with `" | "` at line 758 |
| C6 | Each CloudFront hop appends its viewer's IP and API Gateway appends the edge IP, so an edge-optimized API alone yields `[..., client, managed-edge]` and one behind your own CloudFront yields `[..., viewer, your-edge, managed-edge]` | **Confirmed by capture** (Round 4) | T1: `C, M` on two APIs. T2: `C, E, M` |
| C7 | A viewer-supplied `CloudFront-Viewer-Address` is overwritten or removed by CloudFront | **Confirmed by capture** for both topologies with `AllViewerExceptHostHeader` (Round 4) | A sent `CloudFront-Viewer-Address: 192.0.2.9:1234` was absent at Lambda in T1 and T2. Not tested with a policy that forwards the header (no distribution has one) |
| C8 | What `identity.sourceIp` holds for an edge-optimized API (the client, or the AWS-managed edge) | **Measured** (Round 4) | The peer of the AWS-managed distribution, which equals the `X-Forwarded-For` entry 2 from the right: the client in T1, your distribution's edge in T2. Viewer-supplied entries never changed it |
| C9 | Today's code logs a forged IP in practice | **Confirmed by capture** (Round 4) | With `X-Forwarded-For: 192.0.2.1`, the `RESPONSE` lines of atlantis-starter-02 (T1) and atlantis-mcp-test (T1 and T2) logged `192.0.2.1` |

## 3. Current state

- **Resolution** lives in `RequestInfo._clientRequestInfo(event)` (`RequestInfo.class.js:287-368`). `ClientRequest extends RequestInfo` (`ClientRequest.class.js:384`) and calls `super(event)`. `RequestInfo` is public, documented as extendable, and declared in `types/lib/tools/index.d.ts:1140` (`getClientIp(): string | null` at line 1191).
- **Why it is this way:** spec `1-3-11-client-request-update-forwarded-for` (`bugfix.md` requirement 2.2) deliberately chose "extract only the first IP address (the original client)". That fixed CloudFront edge IPs appearing in logs but introduced the spoofing path. It shipped in v1.3.11 (CHANGELOG line 212).
- **Consumers of the IP:** `Response._log()` (`Response.class.js:736`), `ClientRequest.getProps().client.ip` (`ClientRequest.class.js:474`), and application code.
- **`RESPONSE` log line** (`Response.class.js:720-764`): 13 fields joined with `" | "`. Request-derived string fields: `clientIp`, `userAgent`, `origin`, `referrer`, `resource`, `queryKeys`, `routeLog`, `queryLog`, `apiKey`. Only `userAgent` has an attempted clean-up. A `null` IP becomes an empty field because `Array.join` renders `null` as `""`. No test asserts the format of this line. The Atlantis dashboard parses it positionally: `PARSE @message "[*] * | * | ... | *" as loggingType, statusCode, bytes, contentType, execTime, clientIP, userAgent, origin, referrer, resource, queryKeys, pathLog, queryLog, key` ([atlantis-starter-02 #13](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/13)).
- **`queryKeys` logs values.** `getRequestLog()` builds sorted `key=value` pairs (`ClientRequest.class.js:1487`). Its JSDoc (line 1477) and the comment in `Response.class.js:754` say keys only, no values. Values have been logged since the line was written (commit `53629b9`, 2024-11-15, renamed `queryString` → `queryStringParameters` only). `getRequestLog()` isn't declared in `types/`, and no test or doc references `queryKeys`.
- **Configuration conventions:** environment variables use the `CACHE_DATA_` prefix in UPPER_SNAKE_CASE (`CACHE_DATA_DYNAMO_DB_TABLE`, `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`, `CACHE_DATA_POWERTOOLS`).
- **Event shape:** `ClientRequest` only supports API Gateway REST (payload v1) events. It reads `event.httpMethod` and `event.resource` (`ClientRequest.class.js:462, 489`) and never reads `requestContext.http`.
- **Packaging:** `docs/` and `scripts/` are excluded from the npm package (`.npmignore`), so documentation and any helper script are read from GitHub.
- **Reference deployment (Atlantis):**
  - The network template (`atlantis-sam-templates` v0.0.45, `template-network-route53-cloudfront-s3-apigw.yml`) forwards headers to API Gateway with the managed `AllViewerExceptHostHeader` policy. That policy forwards "all headers in the viewer request except for the Host header" and **no CloudFront headers** ([managed policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)). Step 1 is inert for Atlantis users until [atlantis-sam-templates #9](https://github.com/63Klabs/atlantis-sam-templates/issues/9) lands. `docs/features/tools/README.md:1092` also recommends this policy.
  - The starter's `WebApi` (`atlantis-starter-02` at `bff7199`, `application-infrastructure/template.yml:374`) is an `AWS::Serverless::Api` and is **edge-optimized**. Neither the resource, `Globals.Api`, nor `template-openapi-spec.yml` sets an endpoint type, and edge-optimized "is the default endpoint type for API Gateway REST APIs" ([API Gateway endpoint types](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html)). It stays edge-optimized (U3). A starter deployment may or may not have the network template's CloudFront in front of it.
  - The starter's handler logs the raw event at debug level (`routes/index.js:20`, `DebugAndLog.debug("Received event", event)`), so a stage at debug log level already records the headers the Q2 capture needs.

## 4. Review

### 4.1 Security

- **Trust boundary.** Every request header is attacker-controlled unless a trusted proxy sets or overwrites it. The trustworthy values are what CloudFront itself writes (`CloudFront-Viewer-Address`, and the entry each CloudFront hop appends to `X-Forwarded-For`), the entry API Gateway appends, and `identity.sourceIp`, which API Gateway takes from the connection.
- **Right-to-left with a hop count is the standard fix.** Each trusted proxy appends the address of the peer it received the connection from. With `N` trusted appenders, the entry `N` from the right is the last address a trusted proxy observed. Entries further left are attacker-supplied.
- **A hop count that is too high is forgeable; too low is only wrong.** With `N` one higher than the real chain, the selected entry is attacker-supplied whenever the viewer sends `X-Forwarded-For`. With `N` one lower, the selected entry is a trusted proxy's address: wrong, but not forgeable.
- **The chosen default fails safe (U4).** The default describes the shortest CloudFront topology, an edge-optimized API with no distribution of your own. A starter deployment that does have its own CloudFront in front and leaves the default selects that distribution's edge IP: wrong, not forgeable, and fixed by setting the documented value. The opposite default (counting your own CloudFront) would make every edge-optimized deployment without one forgeable.
- **No origin bypass for an edge-optimized API alone.** Its `execute-api` hostname resolves to the AWS-managed distribution, so every request crosses at least that hop.
- **Origin bypass with your own CloudFront in front.** The API Gateway endpoint stays reachable without your distribution, so an attacker can send a crafted `X-Forwarded-For` (and `CloudFront-Viewer-Address`) through only the AWS-managed hop. With the hop count set for your own distribution, one forged entry is then selected. No code in this package can tell your CloudFront hop from a forged one. The mitigation is infrastructure: an origin-verify secret header checked by AWS WAF or a Lambda authorizer ([AWS blog](https://aws.amazon.com/blogs/networking-and-content-delivery/restricting-access-http-api-gateway-lambda-authorizer/)). The docs say so plainly; for Atlantis it is filed as [atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14).
- **Regional APIs without CloudFront (T4).** The default is one too high for them (measured chain `[..., C]`), so an attacker who sends one `X-Forwarded-For` entry is selected. With no CloudFront to drop it, a viewer-supplied `CloudFront-Viewer-Address` also reaches Lambda (measured, Q16), and at the default step 1 accepts it. Both paths are forgeable today too (index 0), so this is no worse than v1.4.0, but it is not fixed unless those users set `1` (or `0`), which also turns step 1 off (Q8). The docs put this warning in the T4 row and next to the default.
- **Step 1 in the default topology.** No distribution of your own means nothing legitimate sets `CloudFront-Viewer-Address`. Step 1 is safe only because the AWS-managed distribution drops a viewer-supplied value, which the capture showed (C7). Q8 option C stands. The docs state this as observed behavior with its date, since AWS doesn't document it.
- **Edge-optimized APIs already report a trustworthy `sourceIp`** (C8). In T1 it is the client; in T2 it is your distribution's edge. So for edge-optimized APIs, a hop count that is too low lands on the same address as step 3, and the fail-safe direction holds.
- **Fail direction.** Falling through to `sourceIp` is fail-safe: it is never attacker-chosen.
- **Log injection.** Any request-derived field containing `|` shifts the dashboard's positional parsing. Control characters (CR, LF) can also break line-oriented tools. All request- and application-derived fields are cleaned (Q10), and the IP is validated (Q9).
- **Query values in logs.** `queryKeys` writes query values (tokens, email addresses, search terms) to CloudWatch although its documentation says it doesn't. Fixed to keys only (Q13).
- **Disclosure.** `.kiro/specs/` is pushed to the public GitHub repository but is excluded from the npm package (`.npmignore:7`). Leftmost-`X-Forwarded-For` spoofing is a widely documented class, and this plan contains no detail beyond AWS's own docs. A GitHub Security Advisory is published at release for v1.3.11 through v1.4.0 (Q11).

### 4.2 Software engineering

- **Behavior change for honest traffic.** With the hop count matching the deployment and no viewer-supplied header, today's result (index 0) and the new result are the same viewer IP. Differences appear only when the chain has extra entries. Example for the default topology (edge-optimized, no distribution of your own, `N = 2`; chains as measured in Round 4):

  | Scenario | `X-Forwarded-For` at Lambda | Today | New |
  |---|---|---|---|
  | Normal client | `C, M` | `C` | `C` |
  | Client sends a forged header | `S, C, M` | `S` (forged) | `C` |
  | Client behind a corporate proxy that adds `X-Forwarded-For: B` | `B, P, M` | `B` | `P` (proxy egress) |
  | Your own CloudFront in front, default left unset | `V, E, M` | `V` | `E` (your edge; set the documented value) |
  | Your own CloudFront in front, value set for it (`3`) | `V, E, M` | `V` | `V` |

  `C` client, `M` AWS-managed edge, `S` forged, `P` corporate proxy, `B` client behind it, `V` viewer, `E` your distribution's edge. The corporate-proxy row is the only honest case that changes when the value is right; it becomes the address CloudFront actually saw. The "default left unset" row is the cost of the fail-safe default. CHANGELOG must call out both.
- **Where the logic goes.** A pure, internal static class `src/lib/utils/ClientIpResolver.class.js` (`@private`, not exported) keeps the public surface unchanged, follows AGENTS.md §3.4, and can be property-tested directly. `_clientRequestInfo()` calls it.
- **No new dependency.** `node:net` `isIP()` validates IPv4 and IPv6.
- **Reading the variable.** Lambda environment variables are fixed for the life of an execution environment, but tests change `process.env` between cases. Reading on each request and memoizing the parsed result keyed on the raw string costs a string comparison per request, stays correct under tests, and logs an invalid value once rather than per request.
- **Semver.** v1.4.1 is a patch release (Q1) that adds an environment variable. AGENTS.md §2.2 classes new configuration as MINOR; the user chose patch because the change is a security fix. Recorded as a risk.
- **Tests that encode current behavior and must change:**
  - `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`: Property 1 asserts the leftmost entry wins, and the concrete cases expect `203.0.113.50`. Rewritten for the new rules.
  - `test/request/request-info-forwarded-for-preservation-tests.jest.mjs`: the "no `X-Forwarded-For` → `sourceIp`" properties should still hold. Re-check every property that sets the header.
  - `request-info-tests.jest.mjs`, `client-request-tests.jest.mjs`, `request-info-property-tests.jest.mjs`: their events have no `X-Forwarded-For` (`test/helpers/test-event.js`), so they should pass unchanged.
  - No existing test references `queryKeys`.
- **Test hygiene.** Env-var tests save and restore `process.env` in `afterEach` (test-execution-monitoring rules). Property generators for "forged prefix" chains are unrestricted by construction (any list of strings on the left), so no generator precondition can drift from the acceptance rule.
- **Not affected:** `RequestInfo.class.js`, `Response.class.js`, and `ClientRequest.class.js` are not in the `git status` lists of the migration property tests, so uncommitted edits to them won't trip those tests locally.

### 4.3 Cloud engineering

- **Topologies and chains** (each CloudFront hop appends its viewer; API Gateway appends the edge that connected to it):

  | # | Topology | Chain at Lambda | `N` | `identity.sourceIp` | Source |
  |---|---|---|---|---|---|
  | T1 | Edge-optimized API, no CloudFront of your own (**default**, U4) | `[..., C, M]` | 2 | `C` | Measured, two APIs (Round 4) |
  | T2 | Your CloudFront → edge-optimized API | `[..., V, E, M]` | 3 | `E` | Measured (Round 4) |
  | T3 | Your CloudFront → Regional API | `[..., V, E]` (expected) | 2 (expected) | `E` (expected) | AWS docs; no such deployment exists (D12) |
  | T4 | Regional API, no CloudFront | `[..., C]` | 1 | `C` (expected; the logged event was truncated before `requestContext`) | Measured, chain only (Round 4, Q16) |

  `M` addresses were in `15.158.0.0/16` and `E` addresses in `18.68.0.0/16` during the capture; these are observations, not something to match on.
- **`identity.sourceIp`** for an edge-optimized API is the peer of the AWS-managed distribution (C8). For Regional APIs it is the connecting address per AWS docs.
- **Duplicate `X-Forwarded-For` headers** from the viewer were joined by CloudFront into one comma-separated value, in order, in both `headers` and `multiValueHeaders` (Round 4).
- **HTTP APIs (payload v2)** are not supported by `ClientRequest` (Section 3), so they are out of scope (F4, note only).
- **Enabling `CloudFront-Viewer-Address`** (T2, T3 only). The managed `AllViewerExceptHostHeader` policy does not include it, and `AllViewerAndCloudFrontHeaders-2022-06` also forwards `Host`, which is why the docs avoid it for API Gateway origins. A custom origin request policy is needed. No distribution in the test account forwards the header (the atlantis-mcp-test API behavior uses `AllViewerExceptHostHeader`), so which header behavior works with an API Gateway origin stays an open point in atlantis-sam-templates #9, and the docs give the requirement without a recommended policy. The AWS-managed distribution in T1 is not configurable.
- **No IaC or IAM change in this repository.** Users set one Lambda environment variable only when their topology differs from the default. For the starter, atlantis-starter-02 #14 covers setting it when the network template's CloudFront is in front.
- **Observability.** The resolved IP stays in the `RESPONSE` line in the same position. An invalid environment value produces one `DebugAndLog.warn` per distinct value per execution environment. At debug level the resolver logs one line per request with the `X-Forwarded-For` entry count, the hop count in use, and the step that produced the IP, without any addresses (Q15).
- **Rollout and rollback.** Pure code change. Rollback is a package downgrade. Setting the variable to `0` restores "`sourceIp` only" with a configuration change alone.

## 5. Gaps and observations

- **G1. API Gateway appending is load-bearing (C6).** Resolved: it appends (Round 4).
- **G2. Viewer-supplied `CloudFront-Viewer-Address` (C7).** Resolved: dropped in T1 and T2 (Round 4). Q8 option C stands.
- **G3. Deployments without CloudFront.** Resolved by Q8: hop count `1` or `0` turns step 1 off.
- **G4. Chain shorter than `N`.** Resolved by Q5: fall through to `sourceIp`.
- **G5. Invalid environment values.** Resolved by Q6: warn once, use the default.
- **G6. Validation of the selected value.** Resolved by Q9: `isIP()`, fall through when invalid.
- **G7. Other unsanitized log fields.** Resolved by Q10: all request- and application-derived fields.
- **G8. `queryKeys` logs values.** Folded in (F1); keys only (Q13).
- **G9. Duplicate `X-Forwarded-For` headers.** Resolved: CloudFront joins them into one value in order, so `headers` holds the whole chain (Round 4). The resolver reads `headers` only.
- **G10. JSDoc says `getClientIp()` returns `string`;** it can return `null`. The `.d.ts` is already `string | null`. Fixed in the docs work.
- **G11. The Atlantis starter is edge-optimized** and stays so (U3). It is T1 without the network template and T2 with it. Resolved by U4: the default is T1; T2 deployments set the documented value.
- **G12. `sourceIp` for edge-optimized APIs (C8).** Resolved: a T2 request that skips your distribution (chain `[D, M]`, shorter than `3`) falls back to the real caller `D` (Round 4).
- **G13. Working out the value for a deployment (U5).** Resolved by Q15: documented configuration and marker checks, plus a debug-level resolution line.
- **G14. Regional chains.** Resolved for T4 by Q16: chain `[..., C]`, and a viewer-supplied `CloudFront-Viewer-Address` passes through. T3 stays documented from AWS docs (D12), since no Regional API sits behind CloudFront.
- **G15. Endpoint identifiers in this file.** Resolved: the endpoint list that named `execute-api` IDs and distribution domains was removed before requirements were written.

## 6. Proposed approach

### 6.1 Resolution (internal `ClientIpResolver`)

```javascript
// Pseudocode
resolve(headers, identity):
	hops = trustedProxyHops()   // CACHE_DATA_TRUSTED_PROXY_HOPS, default 2 (T1, U4), memoized on the raw string

	// Step 1: CloudFront-Viewer-Address (Q8: only when hops >= 2)
	if (hops >= 2) {
		ip = parseViewerAddress(headers["cloudfront-viewer-address"])
		if (ip !== null) return ip
	}

	// Step 2: X-Forwarded-For, N from the right
	if (hops > 0 && typeof headers["x-forwarded-for"] === "string") {
		entries = headers["x-forwarded-for"].split(",").map(trim)
		if (entries.length >= hops) {                  // Q5: shorter chains skip to step 3
			candidate = entries[entries.length - hops]
			if (isIP(candidate)) return candidate       // Q9: invalid falls through
		}
	}

	// Step 3: identity.sourceIp (unchanged: returned as-is, or null)
	return identity?.sourceIp ?? null
```

- `parseViewerAddress(value)`: non-strings return `null`; trim; split at the **last** `:`, and if the tail is 1–5 digits and the head (with surrounding `[ ]` removed) is an IP, return the head; otherwise, if the whole value is an IP, return it; otherwise `null` (port-first, D13).
- Empty entries are not removed before indexing. A trusted proxy never writes an empty entry, so removing them would only let an attacker's empty entries shift positions.
- `_clientRequestInfo()` replaces lines 312-324 with one call. User-agent handling is unchanged.
- Debug line (Q15): one `DebugAndLog.debug` per request with the `X-Forwarded-For` entry count, the hop count in use, and the step that produced the IP (`viewer-address`, `x-forwarded-for`, `source-ip`, or `none`). No addresses. Built only when the debug level is enabled, so it costs nothing otherwise.

### 6.2 Configuration: `CACHE_DATA_TRUSTED_PROXY_HOPS` (environment variable only, Q4, Q6, Q7)

T1, T2, and T4 values are measured (Round 4, Q16). T3 comes from AWS documentation (D12).

| Value (after trimming) | Meaning |
|---|---|
| unset, empty, whitespace | `2`, the default: T1, edge-optimized API with no CloudFront of your own |
| `0` | ignore `X-Forwarded-For` and `CloudFront-Viewer-Address`; use `sourceIp` |
| `1` | T4, Regional API with no CloudFront; `CloudFront-Viewer-Address` ignored |
| `2` | T1 (default), or T3: your CloudFront → Regional API |
| `3` | T2: your CloudFront → edge-optimized API |
| any other run of digits | that many trusted proxies |
| anything else (`abc`, `-1`, `1.5`, `2 hops`) | one `DebugAndLog.warn` per distinct value, then the default |

### 6.3 Log sanitization (Q10)

A private helper in `Response.class.js` replaces each request- or application-derived string field (`clientIp`, `userAgent`, `origin`, `referrer`, `resource`, `queryKeys`, `routeLog`, `queryLog`, `apiKey`) with `"-"` when it is `null`, `undefined`, or empty, and otherwise removes `|` and control characters (`\x00-\x1F`, `\x7F`). If nothing is left, it logs `"-"`. The user-agent line uses the helper instead of `/|/g`. Numeric and code fields (`statusCode`, `bytes`, `contentType`, `execms`) are unchanged. The field count and order stay at 13, so the dashboard `PARSE` pattern is unaffected.

### 6.4 `queryKeys` (F1, Q13)

`getRequestLog().queryKeys` returns the query string keys only, sorted and joined with `&` (for example `id&limit`), matching its JSDoc. Applications that want values in the log already have `addQueryLog()`, which feeds the `queryLog` field.

### 6.5 Documentation

- JSDoc: `RequestInfo._clientRequestInfo`, `getClientIp`/`getClientIP` (resolution order, `string|null`), class-level note in `ClientRequest`, `getRequestLog()` (`queryKeys` keys only), and the resolver's `@private` JSDoc.
- `types/lib/tools/index.d.ts`: doc comments on `getClientIp`/`getClientIP`. No signature change.
- `docs/features/tools/README.md` (ClientRequest section), a "Client IP resolution" subsection (U5):
  - The resolution order and the configuration table.
  - A scenario table for T1–T4: endpoint type, whether your own CloudFront is in front, the value to set, what `getClientIp()` returns, and what happens if the value is left at the default. T1, T2, and T4 rows give the measured chains (Round 4 and Q16, dated); the T3 row is labeled as derived from AWS documentation (D12). The T4 row and the default's description warn that a Regional API without CloudFront must set `1`, because at the default both `X-Forwarded-For` and `CloudFront-Viewer-Address` can be forged there. The note that CloudFront dropped a viewer-supplied `CloudFront-Viewer-Address` is stated as observed behavior with its date.
  - How to work out the value for your deployment (Q15): the configuration check (`aws apigateway get-rest-api ... --query endpointConfiguration.types`, and `aws cloudfront list-distributions` filtered on origins whose domain starts with `<id>.execute-api.`, with the custom-domain caveat), and the marker check (send `X-Forwarded-For: 192.0.2.1`; at debug level the resolver line reports the entry count, and the hop count is that count minus one).
  - How to forward `CloudFront-Viewer-Address` (T2, T3) and the origin-lock warning.
  - Update the note at line 1092 and the `ip` comment at line 1128.
- CHANGELOG under `## v1.4.1 (unreleased)`: **Security** (spoofing fix; the corporate-proxy and "your own CloudFront, default left unset" behavior changes; `queryKeys` no longer logs values), **Added** (`CACHE_DATA_TRUSTED_PROXY_HOPS`), **Fixed** (log field sanitization). Per the changelog convention the developer creates the `v1.4.1 (unreleased)` heading and bumps `package.json`; if either is missing when the CHANGELOG task runs, the task stops and asks.
- GitHub Security Advisory for v1.3.11 through v1.4.0, published at release (Q11). Drafting the advisory text is a task; publishing it is the user's step.

### 6.6 Tests

- Unit and property tests for the resolver in `test/request/` (new files; `*-property-tests.jest.mjs` for properties):
  - Spoof resistance: for any list of forged strings `P` and IPs `C`, `M`, the chain `P ++ [C, M]` with the default resolves to `C`; likewise `P ++ [V, E, M]` with `N = 3` resolves to `V`.
  - Generalized: for any `N` from 1 to 5 and trusted tail of length `N`, the result is the tail's first element.
  - Fail-safe direction: with the default and a T2 chain `P ++ [V, E, M]`, the result is `E`, never an element of `P`.
  - Short chain (`length < N`) resolves to `sourceIp`.
  - Step 1 ignored when `N` is `0` or `1`; used when `N ≥ 2` (or per the opt-in form if Q8's condition triggers).
  - `parseViewerAddress` for IPv4 with port, IPv6 without brackets with port, bracketed IPv6, bare IPs, and garbage.
  - Environment parsing: unset, empty, `0`–`3`, and each invalid shape, with `process.env` restored in `afterEach`; the warning is logged once per distinct value.
  - Debug line: emitted with the entry count, hop count, and step name when debug is on; contains no value from `X-Forwarded-For`, `CloudFront-Viewer-Address`, or `sourceIp`; not emitted below debug.
- Rewrite the 1.3.11 bug-exploration tests (Section 4.2) to the new rules, keeping their feature-tag history in a header comment. Concrete cases use the chain shapes recorded in Round 4, with documentation-range addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) in place of real ones.
- `RESPONSE` log tests: spy on `DebugAndLog.log`; for arbitrary strings (including `|`, CR, LF) in every request-derived field, the line splits into exactly 13 fields on `" | "`.
- `getRequestLog()` tests: `queryKeys` contains every key and no value, for arbitrary query objects.

## 7. Related improvements

| Item | Class | Rationale | Effort | Risk |
|------|-------|-----------|--------|------|
| JSDoc return type `string|null` for `getClientIp()` (G10) | Include | Touched anyway | S | Low |
| Sanitize all request-derived log fields (G7) | Include (Q10) | Same defect class as the two requested fixes, one helper | S | Low |
| F1. `queryKeys` logs query values (G8) | Include (folded in, Q12; keys only, Q13) | Privacy; matches documented behavior | S | Med |
| Scenario documentation and a way to work out the value (G13) | Include (U5; Q15 option C) | Requested; the default can't fit every topology | S | Low |
| F2. Atlantis network template: forward `CloudFront-Viewer-Address` to API origins | Spun off: [atlantis-sam-templates #9](https://github.com/63Klabs/atlantis-sam-templates/issues/9) | Makes step 1 effective for Atlantis users with the network template | M | Med |
| F3. Atlantis origin lock (origin-verify header + WAF or authorizer), plus the starter's hop-count value | Spun off: [atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14) | Only real fix for origin bypass in T2 | M | Med |
| F4. HTTP API (payload v2) support in `ClientRequest`/`RequestInfo` | Note only | Package doesn't support v2 events anywhere today | L | Med |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| T2 deployments (starter with the network template) log their distribution's edge IP until they set `3` | Fail-safe by design (U4); scenario docs; atlantis-starter-02 #14 sets the value in the template |
| Regional APIs without CloudFront stay forgeable at the default | Scenario docs; `1`/`0` settings also turn step 1 off |
| AWS starts passing a viewer-supplied `CloudFront-Viewer-Address` through (undocumented behavior observed in Round 4) | Docs date the observation; `CACHE_DATA_TRUSTED_PROXY_HOPS=0` or `1` turns step 1 off; the marker check in the docs shows the header if it appears |
| T3 documented from AWS docs only | Labeled as such (D12) |
| T4 users who leave the default accept a forged `CloudFront-Viewer-Address` as well as a forged `X-Forwarded-For` | Same exposure as v1.4.0; T4 row and default description in the docs say to set `1`; CHANGELOG Security entry says the same |
| Corporate-proxy users see a different IP | Documented under Security in CHANGELOG with the table in 4.2 |
| Origin bypass forges headers in T2 | Origin-lock documentation; atlantis-starter-02 #14 |
| Dashboards or alarms that read query values from `queryKeys` lose them | CHANGELOG Security entry; `addQueryLog()` documented as the way to log chosen values |
| Dashboards that parse an empty IP field see `-` | D9; CHANGELOG note |
| A patch release adds configuration, which AGENTS.md §2.2 classes as MINOR | User decision (Q1): shipped as a security fix; the variable is optional with a default |
| Subclasses overriding `_clientRequestInfo()` | Unaffected; the resolver is called from the base implementation only |

## 9. Locked decisions

### Decided in this plan (veto any of these)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Resolution order: `cloudfront-viewer-address` → `x-forwarded-for` with hop count → `identity.sourceIp` | Stated by the user |
| D2 | The hop-count default describes T1 (AWS-managed CloudFront → API Gateway) | Stated by the user (U4); value from the Q2 capture |
| D3 | Fix the user-agent `/|/g` no-op and clean the client IP in the `RESPONSE` line | Stated by the user; widened by Q10 |
| D4 | Logic goes in an internal `src/lib/utils/ClientIpResolver.class.js` (`@private`, not exported) | Public surface unchanged; AGENTS.md §3.4 |
| D5 | IP validation uses `node:net` `isIP()`; no new dependency | Built in |
| D6 | The variable is read per request and memoized on its raw string; an invalid value warns once per distinct value | Correct under tests, negligible cost |
| D7 | Empty `X-Forwarded-For` entries keep their positions | Prevents position shifting by forged entries |
| D8 | `identity.sourceIp` is returned as-is (not validated) | API Gateway sets it; unchanged from today |
| D9 | In the `RESPONSE` line, empty or `null` request fields log as `-` (the IP field logged as an empty string before) | Consistent with the other fields |
| D10 | `|` and control characters are removed, not replaced | Matches the existing intent at `Response.class.js:749` |
| D11 | Public signatures, return types, and the `.d.ts` shapes don't change | Backwards compatibility |
| D12 | Scenario rows not measured (T3) are documented from AWS documentation and labeled that way |
| D13 | `CloudFront-Viewer-Address` is parsed port-first: strip a trailing `:<1–5 digits>` and use the rest if it is a valid IP; only otherwise try the whole value. Found while writing design.md: `2001:db8::1:1234` (address plus port) is itself a valid IPv6, so whole-value-first would return the port as part of the address. The cost is that a bare IPv6 such as `::1:2` reads as `::1` with port 2, which CloudFront never sends | CloudFront always sends `IP:port` (C3); `isIP()` checks run locally on Node.js 24.15.0 | Documentation accuracy standard: no unmeasured claim presented as measured |

### Decided by the user in chat

| # | Decision |
|---|----------|
| U1 | The spec directory is `.kiro/specs/1-4-1-trusted-client-ip/` (moved from `1-4-0-trusted-client-ip` on 2026-11-02) |
| U2 | Spin-offs F2 and F3 are filed as GitHub issues in their repositories with the `gh` CLI: atlantis-sam-templates #9 and atlantis-starter-02 #14 (filed 2026-11-02, label `enhancement`) |
| U3 | The atlantis-starter-02 `WebApi` stays edge-optimized. A starter deployment may or may not have its own CloudFront in front. (Replaces Q14 option C) |
| U4 | The default hop count describes AWS-managed CloudFront → API Gateway (T1: edge-optimized API, no CloudFront of your own). The capture tests both T1 and T2 (your CloudFront → AWS-managed CloudFront → API Gateway) |
| U5 | Once the hop behavior is measured, document each scenario, plus a CLI command or small script to work out the value for a deployment |

---

# Decision Log & Clarifying Questions

> Answer inline under **Answer:** (a letter is enough; add notes where you want changes). Once every question is 🟢 LOCKED, the plan body above is revised to match and `requirements.md` is written.

**Legend:** 🟡 OPEN (awaiting answer) · 🟢 LOCKED (decided) · 🔵 REVISED (plan body updated to match)

## Round 1

## Q1 — Release version and spec directory prefix

`package.json` is `1.4.0`, but `v1.4.0` is already tagged and its CHANGELOG section is dated 2026-11-02. A new environment variable is a new feature under semver, and the IP change is a behavior change for some users.

- **Option A — 1.5.0 (minor).**
- **Option B — 1.4.1 (patch).** Treat it as a security fix; the new variable is incidental.
- **Option C — Other.**

**Recommendation: Option A.** The variable is new public configuration, which AGENTS.md §2.2 classes as MINOR.

**Answer:** We will treat as patch, and go with 1.4.1

**Decision:** Option B. The release is v1.4.1 and the spec lives in `1-4-1-trusted-client-ip` (U1). CHANGELOG entries go under `## v1.4.1 (unreleased)`. The departure from AGENTS.md §2.2 is recorded in Section 8.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q2 — Runtime verification before locking the default

C6, C7, C8, G1, G2, G9, and G12 can't be settled by reading.

- **Option A — You run the capture.**
- **Option B — I run it** against a stage you name, after you confirm.
- **Option C — Proceed on documentation only.**

**Recommendation: Option A.**

**Answer:** B - i can give you a list of endpoints and their log group arns in CloudWatch

**Decision:** Option B. I send the requests with `curl` and read the results with read-only `aws logs`, `aws apigateway get-rest-api`, and `aws cloudfront list-distributions` calls. Results are recorded here as a capture round before requirements are written.

**Capture plan (revised for U3, U4):** one starter stack with the network template's CloudFront in front covers both required topologies. T2 uses the distribution URL; T1 uses the same stack's `execute-api` URL. For each:

1. No `X-Forwarded-For`.
2. `X-Forwarded-For: 192.0.2.1` (TEST-NET-1 marker).
3. Two `X-Forwarded-For` headers (`192.0.2.1` and `192.0.2.2`).
4. `CloudFront-Viewer-Address: 192.0.2.9:1234` (viewer-supplied).
5. T2 only, if a distribution can carry a custom origin request policy that adds `CloudFront-Viewer-Address`: requests 1–4 again with that policy.

Recorded per request: `headers["x-forwarded-for"]`, `multiValueHeaders["x-forwarded-for"]`, `headers["cloudfront-viewer-address"]`, `requestContext.identity.sourceIp`, and the IP my `curl` client presented. T3 and T4 are measured only if a Regional endpoint is in your list (D12).

**Inputs needed from you:**

1. For each endpoint: the CloudFront URL of one cheap `GET` route, the matching `execute-api` URL, and the Lambda log group ARN.
2. Any Regional endpoint you want included (optional).
3. The AWS CLI profile and region to use for the read-only calls.
4. Confirmation that the stage logs the raw event. The atlantis-starter-02 handler does at debug level (`DebugAndLog.debug("Received event", event)` in `routes/index.js:20`), so its stage needs a debug log level during the capture. If a stage isn't at debug, tell me whether you'll raise it or pick another endpoint.
5. Whether any distribution already forwards `CloudFront-Viewer-Address` (request 5).

About 10 requests per topology, spaced out. No writes to any AWS resource.

**Result:** run on 2026-11-04 with the `release` profile in `us-east-2`; see Round 4.

**Status:** 🔵 REVISED (capture done, plan body updated to match)

---

## Q3 — Hop-count meaning and default

- **Option A — `N` is the number of trusted proxies that append to `X-Forwarded-For`; the client is the entry `N` from the right.**
- **Option B — `N` is the number of entries to skip from the right.**
- **Option C — Other.**

**Recommendation: Option A, default `2`,** subject to Q2 confirming the chain `[..., V, E]`.

**Answer:** A

**Decision:** Option A. `0` disables header-based resolution. Which topology the default describes was later set by U4 (T1); its value is the T1 hop count, measured at `2` in Round 4.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q4 — Environment variable name

- **Option A — `CACHE_DATA_TRUSTED_PROXY_HOPS`.**
- **Option B — `CACHE_DATA_X_FORWARDED_FOR_TRUSTED_HOPS`.**
- **Option C — `CACHE_DATA_CLIENT_IP_TRUSTED_HOPS`.**
- **Option D — Other.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** `CACHE_DATA_TRUSTED_PROXY_HOPS`.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q5 — Chain shorter than the hop count

- **Option A — Skip step 2 and use `sourceIp`.**
- **Option B — Use the leftmost entry.**
- **Option C — Use the rightmost entry.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** A chain with fewer than `N` entries skips step 2.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q6 — Invalid environment value

- **Option A — Warn once and use the default.**
- **Option B — Warn once and use `0`.**
- **Option C — Throw when a request is processed.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** Accepted values are digits only after trimming. Anything else logs one warning per distinct value and uses the default.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q7 — Programmatic option in addition to the environment variable

- **Option A — Environment variable only.**
- **Option B — Also `ClientRequest.init({ trustedProxyHops })`.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** Environment variable only. An `init()` option can be added later without breaking anything.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q8 — When to trust `CloudFront-Viewer-Address`

- **Option A — Always trust it when present.**
- **Option B — A second variable, default `true`.**
- **Option C — Trust it only when the hop count is 2 or more.**
- **Option D — Off by default; enable with a variable.**

**Recommendation: Option C,** unless Q2 shows CloudFront passes a viewer-supplied header through (G2). In that case, Option D.

**Answer:** C unless Q2 shows CloudFront passes a viewer-supplied header through (G2). In that case, Option D.

**Decision:** Option C: step 1 runs only when `CACHE_DATA_TRUSTED_PROXY_HOPS` is 2 or more. Under U4 the default topology (T1) has no distribution of your own, so nothing legitimate sets the header there; the capture therefore tests a viewer-supplied value on both the `execute-api` URL (T1) and the distribution URL (T2). If either delivers it to Lambda, step 1 becomes opt-in (Option D) and a new question settles the opt-in variable's name.

**Status:** 🔵 REVISED (plan body updated to match; option C confirmed by Round 4)

---

## Q9 — Validating the selected value

- **Option A — Validate with `isIP()`; an invalid value falls through to the next step.**
- **Option B — Return the selected string as-is.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** Steps 1 and 2 return only values `isIP()` accepts; otherwise the next step runs.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q10 — Scope of `RESPONSE` log sanitization

- **Option A — Only the two requested fixes.**
- **Option B — Every request- or application-derived string field through one helper.**
- **Option C — Option B, but escape `|`.**

**Recommendation: Option B.**

**Answer:** B

**Decision:** One private helper cleans `clientIp`, `userAgent`, `origin`, `referrer`, `resource`, `queryKeys`, `routeLog`, `queryLog`, and `apiKey` (Section 6.3).

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q11 — Disclosure

- **Option A — Normal process.**
- **Option B — Option A, plus a GitHub Security Advisory at release.**
- **Option C — Keep this spec off GitHub until the release ships.**

**Recommendation: Option B.**

**Answer:** B

**Decision:** Normal process, plus a GitHub Security Advisory for v1.3.11 through v1.4.0 at release. A task drafts the advisory text; you publish it.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q12 — Findings outside this spec

- **F1** — `queryKeys` logs query values despite its documentation (G8).
- **F2** — Atlantis network template forwards no CloudFront headers to API origins.
- **F3** — Atlantis origin lock for API Gateway behind CloudFront.
- **F4** — HTTP API (payload v2) support.

**Answer:** F1=fold in, F2=spin off (use gh cli to submit to appropriate repo), F3=spin off to @63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs using gh cli

**Decision:**

- **F1:** folded in (Section 6.4). Its format is Q13.
- **F2:** filed as [63Klabs/atlantis-sam-templates #9](https://github.com/63Klabs/atlantis-sam-templates/issues/9). Related to the closed #2 and #8, which added `AllViewerExceptHostHeader` and its permissions.
- **F3:** filed as [63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14). It also covers setting `CACHE_DATA_TRUSTED_PROXY_HOPS` for the starter's endpoint type, and links #13 (the dashboard query that counts client IPs).
- **F4:** not answered; the recommendation (note only) is applied. Say so if you want something else.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Round 2 — Raised by the Round 1 answers

## Q13 — `queryKeys` format after folding in F1

`getRequestLog().queryKeys` currently returns sorted `key=value` pairs, for example `id=42&q=jane%40example.com`. Its JSDoc and the `Response` comment say keys only. No test, doc, or type declaration references the field, but dashboards may read values from it.

- **Option A — Keys only, sorted, joined with `&`** (`id&q`). Matches the documentation. Applications that want specific values logged use `addQueryLog()`, which feeds `queryLog`.
- **Option B — Keep `key=value` and change the documentation** to say values are logged.
- **Option C — Keys only by default; an environment variable turns values back on.**

**Recommendation: Option A.**

**Answer:** A

**Decision:** Keys only, sorted, joined with `&` (Section 6.4). CHANGELOG lists it under Security.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q14 — Default if edge-optimized APIs need a different hop count

The Atlantis starter is edge-optimized. If CloudFront → edge-optimized needs `N = 3` while other topologies need `2`, one default can't serve both.

- **Option A — Keep the default at `2`; the starter sets `CACHE_DATA_TRUSTED_PROXY_HOPS: 3`.**
- **Option B — Default to `3`.**
- **Option C — Keep the default at `2`; the starter switches `WebApi` to `EndpointConfiguration: REGIONAL`.**
- **Option D — Other.**

**Recommendation: Option C.**

**Answer:** (in chat) Keep the starter edge-optimized. It may or may not be behind an additional CloudFront. Test CloudFront → AWS-managed CloudFront → API Gateway and AWS-managed CloudFront → API Gateway, and set the default as AWS-managed CloudFront → API Gateway.

**Decision:** Option A in substance, recorded as U3 and U4. The default describes T1 (expected `2`); a starter deployment with the network template's CloudFront in front sets the T2 value (expected `3`), which atlantis-starter-02 #14 covers. Option C is rejected. The default fails safe for T2 (Section 4.1).

**Status:** 🔵 REVISED (plan body updated to match)

---

## Round 3 — Raised by U3–U5

## Q15 — How to work out the value for a deployment (U5)

Two checks are possible, and neither needs a code change:

- **Configuration check.** `aws apigateway get-rest-api --rest-api-id <id> --query endpointConfiguration.types` gives `EDGE` or `REGIONAL`, and `aws cloudfront list-distributions` filtered on origins whose domain starts with `<id>.execute-api.` shows whether your own distribution is in front. Together they pick a row in the scenario table. Limit: a distribution that reaches the API through an API Gateway custom domain name doesn't match that filter, so the docs also show how to look up the custom domain's target.
- **Empirical check.** Send one request with `X-Forwarded-For: 192.0.2.1` and read the logged `X-Forwarded-For`: the hop count is the number of entries after `192.0.2.1`. This measures the real chain, but needs the function to log the header, which most functions don't do outside debug level.

Options:

- **Option A — Documentation only.** Both checks as copy-paste CLI and `curl` commands in the "Client IP resolution" section. The empirical check relies on the application logging the event (the starter does at debug level).
- **Option B — Option A, plus a script in `scripts/`** (for example `scripts/check-trusted-proxy-hops.sh`) that runs the configuration check for a REST API ID and prints the suggested value. GitHub-only, since `scripts/` isn't in the npm package. It needs its own tests and maintenance as the AWS CLI output changes.
- **Option C — Option A, plus one debug-level line from the resolver** on each request: the number of `X-Forwarded-For` entries, the hop count in use, and which step produced the IP (no addresses). With the marker request, entries minus one is the hop count, so the empirical check works for any application that uses this package at debug level, not only ones that log the raw event.
- **Option D — B and C.**

**Recommendation: Option C.** It makes the empirical check, which is the one that measures the real chain, available to every user at debug level without logging any IP addresses, and it costs one `DebugAndLog.debug` call. A script adds a second artifact to maintain for a check that is three CLI commands.

**Answer:** C

**Decision:** Documentation of both checks (configuration and marker), plus one debug-level resolver line per request with the `X-Forwarded-For` entry count, the hop count in use, and the producing step, without addresses (Sections 6.1, 6.5, 6.6). No script in `scripts/`.

**Status:** 🔵 REVISED (plan body updated to match)

---

## Round 4 — Q2 capture results (2026-11-04)

**How:** `curl -4` from one client (its public IPv4 shown as `C`; redacted because this file is published), four requests per target, about one second apart: (r1) no `X-Forwarded-For`; (r2) `X-Forwarded-For: 192.0.2.1`; (r3) two `X-Forwarded-For` headers, `192.0.2.1` then `192.0.2.2`; (r4) `CloudFront-Viewer-Address: 192.0.2.9:1234`. Each request carried an `X-Capture-Id` header to find it in the logs. Reads were read-only `apigateway get-rest-api`, `get-resources`, `get-method`, `get-stage`, `cloudfront get-distribution-config`, `lambda get-function-configuration`, and `logs filter-log-events`. Nothing was written.

**Targets (endpoint types read with `get-rest-api`):**

| Label | Topology | Target | Where the headers were read |
|---|---|---|---|
| T2 | Your CloudFront → edge-optimized | atlantis-mcp-test distribution, `GET /mcp/auth/profile` (API behavior uses `AllViewerExceptHostHeader`, `CachingDisabled`) | API Gateway execution logs (data trace is on for that stage); `sourceIp` from its access logs |
| T1 | Edge-optimized, no CloudFront of yours | atlantis-mcp-test `execute-api` URL, same route | Same as T2 |
| T1 | Edge-optimized, no CloudFront of yours | atlantis-starter-02 test `execute-api` URL, `GET /api/example` | The function's debug event log |
| (T1) | Edge-optimized | atlantis-starter-00 test | Not readable: the function doesn't log the event and the stage has no execution logs |
| (T4) | Regional, no CloudFront | atlantis-starter-01 test (Python) | Not readable, same reasons |

Prod and beta stacks were not sent any requests.

**Results** (`M` = AWS-managed edge, `E` = your distribution's edge):

| Target | Request | `X-Forwarded-For` at API Gateway / Lambda | `CloudFront-Viewer-Address` at Lambda | `identity.sourceIp` | Logged by today's code |
|---|---|---|---|---|---|
| T2 | r1 | `C, E, M` | absent | `E` | `C` |
| T2 | r2 | `192.0.2.1, C, E, M` | absent | `E` | `192.0.2.1` (forged) |
| T2 | r3 | `192.0.2.1, 192.0.2.2, C, E, M` | absent | `E` | `192.0.2.1` (forged) |
| T2 | r4 | `C, E, M` | **absent** (viewer value dropped) | `E` | `C` |
| T1 (mcp) | r1 | `C, M` | absent | `C` | `C` |
| T1 (mcp) | r2 | `192.0.2.1, C, M` | absent | `C` | `192.0.2.1` (forged) |
| T1 (mcp) | r3 | `192.0.2.1, 192.0.2.2, C, M` | absent | `C` | `192.0.2.1` (forged) |
| T1 (mcp) | r4 | `C, M` | **absent** | `C` | `C` |
| T1 (starter-02) | r1–r4 | same shapes as T1 (mcp); `multiValueHeaders` held the same single joined string | **absent** in r4 | `C` | `C`, `192.0.2.1`, `192.0.2.1`, `C` |

**What this settles:**

- **C6, G1:** confirmed. Each CloudFront hop appends its viewer, and API Gateway appends the AWS-managed edge. T1 is `N = 2`; T2 is `N = 3`. U4's default of `2` is correct for T1, and left at `2` in T2 it selects `E`, never a forged entry.
- **C7, G2:** a viewer-supplied `CloudFront-Viewer-Address` did not reach Lambda in either topology. Q8 option C stands; step 1 stays as designed.
- **C8, G12:** for edge-optimized APIs `sourceIp` is the AWS-managed distribution's peer: `C` in T1, `E` in T2. A T2 request that skips your distribution therefore falls back to the real caller.
- **G9:** CloudFront joins duplicate `X-Forwarded-For` headers into one value in order.
- **C9:** today's code logs the forged `192.0.2.1` in both topologies.
- Not settled in this round: T3 (no deployment exists) and T4 (no readable logs; measured later under Q16). The behavior of a policy that forwards `CloudFront-Viewer-Address` remains untested (atlantis-sam-templates #9).

**Status:** 🔵 REVISED (plan body updated to match)

---

## Q16 — Measure the Regional API (T4)?

T4's documented value (`1`) would come from AWS documentation only (D12). Measuring it needs headers from a Regional API, and atlantis-starter-01's test stage doesn't expose them: the Python function doesn't log the event, and the stage has no execution logging. T3 can't be measured because no Regional API sits behind CloudFront.

- **Option A — Leave T4 unmeasured.** Document T3 and T4 as derived from AWS documentation, as D12 already says.
- **Option B — Turn on execution logging with data trace for the atlantis-starter-01 test stage** (`loggingLevel: INFO`, `dataTraceEnabled: true` under `methodSettings */*`), rerun r1–r3 against it, then turn it back off. This writes to the stage, so I'd do it only with your go-ahead, or you make the change and tell me. The account needs the API Gateway CloudWatch role, which it has (atlantis-mcp-test already writes execution logs).
- **Option C — Deploy a change to atlantis-starter-01 that logs the event at debug level,** then rerun. Heavier than B for the same data.

**Recommendation: Option B.** T4 is the topology the default is wrong for (Section 4.1), so its row is the one where an unmeasured claim matters most. Setting `methodSettings` on a test stage is a stage update, reversible in one command, and needs no redeploy.

**Attempt 1 (2026-11-04 03:29Z):** the stage now has execution logging at `INFO` and an access log destination. I reran r1–r4 (all `200`). Still not measurable:

- Execution logs at `INFO` without data trace record the request flow but no headers and no event body.
- The access log destination, `/aws/apigateway/acme-tst-app-start-01-WebApi-access-logs`, doesn't exist as a log group, so no access log entries were written. Access logs couldn't show `X-Forwarded-For` anyway; REST API access log formats only take `$context` variables.

Needed: `dataTraceEnabled: true` on `*/*` for the stage. With it, the execution log's "Endpoint request body after transformations" line holds the whole proxy event, including the headers and `requestContext.identity.sourceIp`, so the access log isn't needed.

**Answer:** (in chat) Option B. You enabled access logs, then data tracing, on the atlantis-starter-01 test stage.

**Attempt 2 (2026-11-04 03:33Z):** with `loggingLevel: INFO` and `dataTraceEnabled: true` confirmed, r1–r4 again (all `200`):

| Request | `X-Forwarded-For` at API Gateway / Lambda | `CloudFront-Viewer-Address` at Lambda |
|---|---|---|
| r1 | `C` | absent |
| r2 | `192.0.2.1, C` | absent |
| r3 | `192.0.2.1, 192.0.2.2, C` | absent |
| r4 | `C` | **`192.0.2.9:1234`** (viewer value delivered) |

`multiValueHeaders` held the same single string as `headers`. The logged event body was truncated before `requestContext`, so `sourceIp` wasn't visible; AWS documents it as the connecting address (`C`).

**Decision:** T4 is measured: API Gateway alone appends the client, so `N = 1`. With no CloudFront in front, a viewer-supplied `CloudFront-Viewer-Address` reaches Lambda, so at the default (`2`) step 1 would accept it. This doesn't change Q8: G2's condition was about CloudFront passing the header through, and both CloudFront topologies dropped it. It does make the T4 warning in the docs stronger (Section 4.1, risks table): Regional APIs without CloudFront must set `1`, which turns step 1 off. T3 stays documented from AWS docs (D12).

Turn data trace back off on that stage afterwards: `aws apigateway update-stage --rest-api-id <api-id> --stage-name <stage> --patch-operations op=replace,path=/*/*/logging/dataTrace,value=false`.

**Status:** 🔵 REVISED (plan body updated to match)
