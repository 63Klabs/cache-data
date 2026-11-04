# Requirements Document

## Introduction

`RequestInfo._clientRequestInfo()` in `src/lib/tools/RequestInfo.class.js` sets the client IP to the **first** entry of the `X-Forwarded-For` header, falling back to `requestContext.identity.sourceIp`. CloudFront appends the address it sees to whatever `X-Forwarded-For` the viewer sent, so the first entry is whatever the viewer chose. `getClientIp()`, `getProps().client.ip`, and the `RESPONSE` log line all report that value. A runtime capture on 2026-11-04 confirmed the effect: a request carrying `X-Forwarded-For: 192.0.2.1` was logged as coming from `192.0.2.1` on two deployed stacks (PLAN.md, Round 4).

This feature resolves the client IP from sources a trusted proxy wrote. It checks `CloudFront-Viewer-Address` first, then `X-Forwarded-For` read from the right using a configurable count of trusted proxies, then `identity.sourceIp`. The count comes from a new environment variable, `CACHE_DATA_TRUSTED_PROXY_HOPS`, which defaults to the measured value for an edge-optimized REST API with no CloudFront distribution of the user's own.

The same change fixes the `RESPONSE` log line, where request-derived fields were written without removing the `|` delimiter (the user-agent clean-up regex matched nothing), and stops the `queryKeys` field from logging query values, which its documentation says it doesn't do.

The change ships in v1.4.1 as a patch release (Q1). Decisions are recorded in the Decision Log in [PLAN.md](PLAN.md), and references such as (Q5) or (U4) point there. All decisions are locked. The technical design is in [design.md](design.md).

## Glossary

- **Resolver**: the internal static class in `src/lib/utils/ClientIpResolver.class.js` that this feature introduces (D4).
- **Hop count** (`N`): the number of trusted proxies that append to `X-Forwarded-For` between the client and the Lambda function. The resolver reads the entry `N` from the right (Q3).
- **Hop count env var**: `CACHE_DATA_TRUSTED_PROXY_HOPS` (Q4).
- **Default hop count**: `2`, the measured value for topology T1 (U4).
- **Topologies** (PLAN.md Section 4.3; Round 4 and Q16 measured T1, T2, and T4):

  | ID | Topology | Hop count |
  |---|---|---|
  | T1 | Edge-optimized REST API with no CloudFront distribution of the user's own | 2 |
  | T2 | The user's CloudFront distribution in front of an edge-optimized REST API | 3 |
  | T3 | The user's CloudFront distribution in front of a Regional REST API | 2 (from AWS documentation) |
  | T4 | Regional REST API with no CloudFront | 1 |

- **Header map**: `event.headers` with every key lowercased, as `_clientRequestInfo()` builds it today.
- **Valid IP**: a string for which `isIP()` from `node:net` returns 4 or 6 (D5).
- **Resolution step**: which source produced the client IP: `viewer-address`, `x-forwarded-for`, `source-ip`, or `none`.
- **`RESPONSE` log line**: the line `Response._log()` writes through `DebugAndLog.log(msg, "RESPONSE")`, 13 fields joined with `" | "`.
- **Request-derived log field**: one of `clientIp`, `userAgent`, `origin`, `referrer`, `resource`, `queryKeys`, `routeLog`, `queryLog`, and `apiKey` in the `RESPONSE` log line (Q10).
- **Documentation range addresses**: `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737), used in tests and docs in place of real addresses.

## Requirements

### Requirement 1: Internal ClientIpResolver class (D4, D5)

**User Story:** As a maintainer, I want the IP resolution rules in one internal class, so that they can be property-tested directly without adding to the public API.

#### Acceptance Criteria

1. THE package SHALL contain a static class `ClientIpResolver` in `src/lib/utils/ClientIpResolver.class.js`, exported with `module.exports = ClientIpResolver`.
2. THE ClientIpResolver class SHALL NOT be exported from `src/index.js` or `src/lib/tools/index.js`, and SHALL NOT be declared in `types/`.
3. THE class JSDoc SHALL include `@private`. EACH public static method SHALL have a description, an `@param` for every parameter with a name matching the signature, `@returns`, at least one `@example`, and `@throws` where the method can throw.
4. THE ClientIpResolver class SHALL validate addresses with `isIP()` from `node:net`, and SHALL require only Node.js built-ins and modules in this package.
5. `RequestInfo._clientRequestInfo()` SHALL set `client.ip` to the value the resolver returns for the header map and `requestContext.identity`, and SHALL NOT contain its own IP selection logic.

### Requirement 2: Resolution order (D1, Q5, Q8, Q9)

**User Story:** As a Lambda function developer, I want the client IP taken only from values a trusted proxy wrote, so that a client can't choose the IP my logs and access checks see.

#### Acceptance Criteria

1. THE resolver SHALL try, in order: the `cloudfront-viewer-address` header (Requirement 3), the `x-forwarded-for` header (Requirement 4), and `identity.sourceIp` (Requirement 5), and SHALL return the first value a step produces.
2. WHEN the hop count is 2 or more, THE resolver SHALL run the `cloudfront-viewer-address` step. WHEN the hop count is 0 or 1, THE resolver SHALL skip it. (Q8)
3. WHEN the hop count is 0, THE resolver SHALL skip the `x-forwarded-for` step.
4. WHEN a header step finds no usable value, THE resolver SHALL continue with the next step.
5. THE resolver SHALL return `null` WHEN no step produces a value.
6. THE resolver SHALL NOT throw for any header map or identity value, including `null`, `undefined`, non-string header values, and objects without the expected keys.

### Requirement 3: CloudFront-Viewer-Address (C3, Q9)

**User Story:** As a Lambda function developer whose CloudFront distribution forwards `CloudFront-Viewer-Address`, I want that header used first, so that the viewer IP is correct whatever the length of the proxy chain.

#### Acceptance Criteria

1. WHEN the header map's `cloudfront-viewer-address` value is a string, THE resolver SHALL trim it and split it at its **last** `:`. IF the part after it is 1 to 5 decimal digits AND the part before it, with one pair of surrounding square brackets removed if present, is a valid IP, THEN THE resolver SHALL return that address. (D13)
2. OTHERWISE, IF the whole trimmed value is a valid IP, THE resolver SHALL return it.
3. THE resolver SHALL return the address for IPv4 with a port (`198.51.100.10:46532`), IPv6 without brackets with a port (`2001:db8::1:60776`, and `2001:db8::1:1234`, whose port is also a valid IPv6 group), IPv6 with brackets with a port (`[2001:db8::1]:60776`), bare IPv4, and bare IPv6 whose last group isn't all decimal digits after a valid prefix.
4. IN every other case, including a missing, empty, or non-string value, the step SHALL produce no value.
5. A bare IPv6 address whose text minus its last `:`-separated group is itself a valid IP (for example `::1:2`) SHALL be read as an address with a port. CloudFront always sends a port, so this ambiguity only affects values CloudFront didn't write. (D13)

### Requirement 4: X-Forwarded-For from the right (Q3, Q5, Q9, D7)

**User Story:** As a Lambda function developer, I want `X-Forwarded-For` read from the right by the number of trusted proxies in front of my function, so that entries a client added on the left are never selected.

#### Acceptance Criteria

1. WHEN the hop count is `N` ≥ 1 and the header map's `x-forwarded-for` value is a string, THE resolver SHALL split it on `,` and trim each entry, without removing empty entries.
2. WHEN the number of entries is at least `N`, THE resolver SHALL take the entry at index `length - N`, and SHALL return it IF it is a valid IP.
3. WHEN the number of entries is less than `N`, the step SHALL produce no value. (Q5)
4. WHEN the selected entry is not a valid IP, the step SHALL produce no value. (Q9)
5. FOR every list of strings `P` and every list `T` of `N` valid IPs, a header value made of `P` followed by `T`, joined with `", "`, SHALL resolve to the first element of `T`.

### Requirement 5: identity.sourceIp (D8)

**User Story:** As a Lambda function developer, I want the connection address API Gateway reports used as the last resort, so that a missing or short chain falls back to a value no client can set.

#### Acceptance Criteria

1. WHEN neither header step produces a value AND `identity.sourceIp` is neither `null` nor `undefined`, THE resolver SHALL return it unchanged, without validation.
2. THE resolver SHALL NOT read `requestContext.http` (payload v2 events are out of scope, F4).

### Requirement 6: Hop count configuration (Q4, Q6, Q7, U4, D6)

**User Story:** As a Lambda function developer, I want to set the number of trusted proxies with one environment variable, and have a mistake in it reported without breaking requests.

#### Acceptance Criteria

1. THE resolver SHALL read the hop count from `process.env.CACHE_DATA_TRUSTED_PROXY_HOPS` and from no other source. (Q7)
2. WHEN the variable is unset, empty, or only whitespace, THE hop count SHALL be the default hop count, `2`.
3. WHEN the trimmed value consists only of the digits `0`–`9`, THE hop count SHALL be that number in base 10.
4. IF the trimmed value is anything else, THEN THE hop count SHALL be `2`, and THE resolver SHALL log one `DebugAndLog.warn` naming the variable and the rejected value.
5. THE resolver SHALL log that warning at most once per distinct raw value per module instance, however many requests use the value.
6. THE resolver SHALL reflect a change to the variable on the next resolution, and SHALL cache the parsed result keyed on the raw string, so that an unchanged value isn't parsed again.
7. THE resolver SHALL NOT throw because of the variable's value. (Q6)

### Requirement 7: Debug resolution line (Q15)

**User Story:** As a Lambda function developer working out my hop count, I want a debug-level line that tells me how the IP was chosen, so that I can count the proxies in a real request without logging addresses.

#### Acceptance Criteria

1. WHILE `DebugAndLog.getLogLevel()` is at least `DebugAndLog.DEBUG_LEVEL_NUM`, THE resolver SHALL log one `DebugAndLog.debug` line per resolution containing the number of `x-forwarded-for` entries (0 when the header is absent), the hop count in use, and the resolution step.
2. THE line SHALL NOT contain any value from `x-forwarded-for`, `cloudfront-viewer-address`, or `identity.sourceIp`.
3. WHILE the log level is below debug, THE resolver SHALL NOT build the line's message.

### Requirement 8: RESPONSE log line fields (Q10, D9, D10)

**User Story:** As an operator parsing `RESPONSE` lines in CloudWatch, I want every request-derived field free of the field delimiter and control characters, so that a request can't shift or forge fields in my dashboards.

#### Acceptance Criteria

1. `Response._log()` SHALL pass every request-derived log field through one private helper before joining the fields.
2. THE helper SHALL return `"-"` WHEN the value is `null`, `undefined`, or an empty string.
3. OTHERWISE THE helper SHALL convert the value to a string and remove every `|` and every character in `\x00`–`\x1F` and `\x7F`, and SHALL return `"-"` WHEN nothing is left.
4. THE user-agent field SHALL use the helper instead of `.replace(/|/g, "")`.
5. `statusCode`, `bytes`, `contentType`, and `execms` SHALL be logged as before.
6. FOR all values of the request-derived log fields, THE `RESPONSE` log line SHALL contain exactly 13 fields when split on `" | "`, in the existing order.

### Requirement 9: queryKeys without values (Q13, F1)

**User Story:** As an operator, I want `queryKeys` to log only the query string keys, as documented, so that tokens and personal data in query values stay out of CloudWatch.

#### Acceptance Criteria

1. `ClientRequest.getRequestLog().queryKeys` SHALL be the keys of the query string parameters, sorted in the existing order, joined with `&`, with no values and no `=`.
2. WHEN there are no query string parameters, `queryKeys` SHALL be an empty string, as today.
3. THE other fields that `getRequestLog()` returns SHALL be unchanged.

### Requirement 10: Verification and tests

**User Story:** As a maintainer, I want the new rules covered by tests, so that a later change can't bring back leftmost selection or log injection.

#### Acceptance Criteria

1. THE full suite (`npm test`) SHALL pass.
2. `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs` SHALL be rewritten so that its IP property and its two concrete IP cases assert the new rules; its user-agent tests SHALL be kept. Its header comment SHALL keep the 1.3.11 feature tag and name this spec. `test/response/response-tests.jest.mjs` SHALL have its two "Test finalize and log" expected `queryKeys` values updated to keys only (Requirement 9). Other existing test files SHALL stay unmodified.
3. Unit tests SHALL verify Requirements 2, 3, 4.1 to 4.4, 5, 6, 7, 8.2 to 8.5, and 9, using the chain shapes measured in PLAN.md Round 4 and Q16 for T1, T2, and T4, with documentation range addresses.
4. Property-based tests SHALL verify Requirement 4.5 for `N` from 1 to 5, the fail-safe direction (with the default hop count and a T2 chain `P ++ [V, E, M]`, the result is `E` and never an element of `P`), Requirement 3.1 over generated IPv4 and IPv6 addresses with ports from 0 to 65535 (bracketed and unbracketed for IPv6), bare IPv4 under Requirement 3.2, and Requirement 8.6 over arbitrary strings including `|`, CR, and LF. Bare IPv6 (Requirement 3.5) SHALL be covered by examples, not a property.
5. Tests that set `CACHE_DATA_TRUSTED_PROXY_HOPS` SHALL restore `process.env` in `afterEach`. Tests that assert the warning in Requirement 6.5 SHALL account for the per-module-instance memo, by using distinct raw values or a fresh process.
6. Tests that assert on `DebugAndLog` output SHALL capture it through a Jest spy, or in a child process through both stdout and stderr, since `warn` and `error` write to stderr.
7. Tests that spawn child processes SHALL use `execFile`, `execFileSync`, or `spawnSync` with an argument array, SHALL set a timeout of at most 120 seconds, and SHALL NOT invoke `npm test`. A property test that spawns child processes SHALL use at most 10 runs; other property tests SHALL use at least 100.
8. Property tests SHALL NOT pass a `seed` option to `fc.assert`. Generators SHALL be valid by construction, or gated on a predicate other than the one the property asserts.
9. New resolver test files SHALL live under `test/request/client-ip/` in `unit/` and `property/` directories; new `RESPONSE` log tests under `test/response/`; new `getRequestLog()` tests under `test/request/`. They SHALL follow the `*-tests.jest.mjs` and `*-property-tests.jest.mjs` naming conventions.
10. Modified files SHALL NOT gain ESLint errors relative to the baseline recorded in design.md, new files SHALL report no ESLint errors, and `npm run test:types` SHALL pass. (`npm run lint:ci` already fails on the repository baseline, which is outside this spec.)

Criteria 5 to 8 apply `.kiro/steering/test-execution-monitoring.md`, `.kiro/steering/secure-coding-practices.md`, and `.kiro/steering/test-requirements.md`.

### Requirement 11: Backwards compatibility (D11)

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.1 without changing my code.

#### Acceptance Criteria

1. THE package exports SHALL keep their names and kinds, and no export SHALL be added for the resolver.
2. `getClientIp()`, `getClientIP()`, `getProps()`, `getRequestLog()`, and `Response.finalize()` SHALL keep their signatures and return types.
3. THE only changes in `types/` SHALL be doc comments.
4. THE `RESPONSE` log line SHALL keep its 13 fields in their current order.
5. THE user-agent, origin, referrer, and other client fields that `_clientRequestInfo()` sets SHALL be unchanged.
6. THE change SHALL ship in v1.4.1 as a patch release. (Q1)

### Requirement 12: Documentation (U5, Q15, D12)

**User Story:** As a Lambda function developer, I want the docs to tell me which value to set for my deployment and how to check it, so that I don't leave a forgeable or wrong setting in place.

#### Acceptance Criteria

1. THE resolver JSDoc SHALL meet Requirement 1.3, and SHALL document the resolution order, the hop-count semantics, the environment variable, and the fail-safe direction.
2. THE JSDoc for `RequestInfo._clientRequestInfo`, `getClientIp`, `getClientIP`, and `ClientRequest` SHALL describe the new resolution order and `CACHE_DATA_TRUSTED_PROXY_HOPS`, and `getClientIp`/`getClientIP` SHALL document a `string|null` return. (G10)
3. THE `getRequestLog()` JSDoc SHALL state that `queryKeys` contains keys only.
4. THE doc comments for `getClientIp` and `getClientIP` in `types/lib/tools/index.d.ts` SHALL describe the new resolution order.
5. `docs/features/tools/README.md` SHALL gain a "Client IP resolution" subsection in the ClientRequest section covering:
   - the resolution order and when each step is skipped
   - a configuration table for `CACHE_DATA_TRUSTED_PROXY_HOPS`, including `0`, the default, and invalid values
   - a scenario table for T1 to T4: endpoint type, whether the user's own CloudFront is in front, the value to set, the measured chain, what `getClientIp()` returns, and the effect of leaving the default. T1, T2, and T4 SHALL be labeled as measured, with the date; T3 SHALL be labeled as derived from AWS documentation (D12)
   - a warning that a Regional API without CloudFront (T4) must set `1`, because at the default both `X-Forwarded-For` and `CloudFront-Viewer-Address` can be forged there
   - the observation, with its date, that CloudFront dropped a viewer-supplied `CloudFront-Viewer-Address` in T1 and T2, and that AWS doesn't document this
   - how to forward `CloudFront-Viewer-Address` to an API Gateway origin (a custom origin request policy; the managed `AllViewerExceptHostHeader` policy doesn't include it), without recommending a specific header behavior
   - the origin-lock warning for T2: requests that skip the user's distribution can forge `X-Forwarded-For`, and only infrastructure (an origin-verify header checked by AWS WAF or an authorizer) prevents it
   - the configuration check: `aws apigateway get-rest-api --rest-api-id <id> --query endpointConfiguration.types`, and `aws cloudfront list-distributions` filtered on origins whose domain starts with `<id>.execute-api.`, with the caveat for distributions that reach the API through a custom domain name
   - the marker check: send `X-Forwarded-For: 192.0.2.1` and read the debug resolution line; the hop count is the entry count minus one
6. THE note at `docs/features/tools/README.md` line 1092 and the `ip` comment at line 1128 SHALL be updated to match.
7. User documentation SHALL describe behavior rather than resolver internals, and SHALL NOT mention `TestHarness`.
8. Modified JSDoc and documentation SHALL pass the validation tests in `test/documentation/`.

### Requirement 13: Changelog and advisory (Q11)

**User Story:** As an existing user, I want the release notes and a security advisory to tell me what changed and whether I need to set the new variable.

#### Acceptance Criteria

1. THE change SHALL be recorded under `## v1.4.1 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, linking `[Spec: 1-4-1-trusted-client-ip](.kiro/specs/1-4-1-trusted-client-ip/)`, without modifying existing entries.
2. EACH row of [Consumer-visible behavior changes](#consumer-visible-behavior-changes) SHALL appear under the category that table assigns it.
3. IF the `## v1.4.1 (unreleased)` heading or the `1.4.1` version in `package.json` is missing when the changelog task runs, THEN the task SHALL stop and ask the developer, rather than create either. (PLAN.md Section 6.5)
4. A draft GitHub Security Advisory SHALL be written to `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`, covering the affected range v1.3.11 through v1.4.0, the patched version v1.4.1, the impact, which deployments must set `CACHE_DATA_TRUSTED_PROXY_HOPS`, and the origin-lock recommendation. Publishing it is the developer's step.
5. THE advisory draft SHALL NOT contain real IP addresses, account IDs, or endpoint identifiers.

## Consumer-visible behavior changes

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | `getClientIp()` no longer returns the first `X-Forwarded-For` entry. It uses `CloudFront-Viewer-Address`, then the entry `N` from the right, then `identity.sourceIp` | Everyone whose clients send `X-Forwarded-For`; a forged first entry is no longer selected | Security | D1, Q3, Q8 |
| 2 | New `CACHE_DATA_TRUSTED_PROXY_HOPS` environment variable, default `2` | Additive. T2 users should set `3`, T4 users `1` | Added | Q4, Q6, Q7, U4 |
| 3 | Behind the user's own CloudFront in front of an edge-optimized API (T2) with the default left unset, the logged IP is the distribution's edge address instead of the viewer's | T2 deployments until they set `3` | Changed | U4 |
| 4 | A client behind a corporate proxy that adds its own `X-Forwarded-For` is reported as the proxy's egress address, the address CloudFront saw | Users relying on addresses behind such proxies | Changed | Q3 |
| 5 | Regional APIs without CloudFront (T4) remain forgeable at the default, through both headers, until they set `1` | T4 deployments; same exposure as v1.4.0 | Security | Q16 |
| 6 | A selected value that isn't a valid IP falls through to the next source instead of being returned | Requests with malformed headers | Changed | Q9 |
| 7 | Request-derived fields in the `RESPONSE` log line have `|` and control characters removed (the user-agent clean-up previously removed nothing) | Dashboards and queries that parse the line; values containing those characters | Fixed | Q10 |
| 8 | An empty or missing client IP is logged as `-` instead of an empty field | Dashboards that match an empty field | Changed | D9 |
| 9 | `getRequestLog().queryKeys`, and the `queryKeys` field of the `RESPONSE` line, contain keys only, not `key=value` pairs | Dashboards or alarms that read query values from that field; use `addQueryLog()` to log chosen values | Security | Q13 |
| 10 | At debug level, one line per request reports the `X-Forwarded-For` entry count, the hop count, and the resolution step | Debug-level logs only | Added | Q15 |

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. Internal ClientIpResolver class | D4, D5 |
| 2. Resolution order | D1, Q5, Q8, Q9 |
| 3. CloudFront-Viewer-Address | Q8, Q9, D13, Round 4 |
| 4. X-Forwarded-For from the right | Q3, Q5, Q9, D7, Round 4 |
| 5. identity.sourceIp | D8, Round 4 |
| 6. Hop count configuration | Q4, Q6, Q7, U4, D6 |
| 7. Debug resolution line | Q15 |
| 8. RESPONSE log line fields | Q10, D9, D10 |
| 9. queryKeys without values | Q12 (F1), Q13 |
| 10. Verification and tests | Round 4, Q16 |
| 11. Backwards compatibility | D11, Q1 |
| 12. Documentation | U5, Q15, D12, Q16 |
| 13. Changelog and advisory | Q1, Q11 |

## Out of scope

- HTTP API (payload v2) events and `requestContext.http.sourceIp` (F4).
- A programmatic option for the hop count, such as `ClientRequest.init({ trustedProxyHops })` (Q7).
- An opt-in variable for the `CloudFront-Viewer-Address` step (Q8 option D; its condition did not occur).
- A helper script in `scripts/` (Q15 option B).
- Forwarding `CloudFront-Viewer-Address` in the Atlantis network template ([atlantis-sam-templates #9](https://github.com/63Klabs/atlantis-sam-templates/issues/9)) and the origin lock for the Atlantis starter ([atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14)).
- Switching the Atlantis starter to a Regional endpoint (U3).
- Measuring T3, for which no deployment exists (D12).
