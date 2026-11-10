# Requirements Document

## Introduction

The v1.4.1 documentation and the `ClientIpResolver` class comment say that a `CACHE_DATA_TRUSTED_PROXY_HOPS` value that is too high is safe because resolution "falls through to `identity.sourceIp`". That is true only when the `X-Forwarded-For` header has fewer entries than the count. A client can add entries, so a count that is too high can select an entry the client wrote. A count that is too low selects the address of one of the user's own proxies, which is the safe direction. The same paragraph names the unsafe condition backwards. This is GitHub issue [#253](https://github.com/63Klabs/cache-data/issues/253). v1.4.1 is unreleased (npm `latest` is 1.4.0), so no published guidance is wrong.

A re-measurement on 2026-11-09 (PLAN.md Section 3.1) showed that on a Regional REST API `identity.sourceIp` is the real viewer address, directly and through the user's own CloudFront, and that forged `X-Forwarded-For`, `Forwarded`, `X-Real-Ip`, and `CloudFront-Viewer-Address` values do not change it. On an edge-optimized API with no CloudFront of the user's own it is also the client; behind the user's own CloudFront it is an edge address. So `0`, which returns `identity.sourceIp`, is correct for three of the four deployment topologies and forgeable in none. The same measurement showed that CloudFront's managed `AllViewerExceptHostHeader` origin request policy forwards `CloudFront-Viewer-Address`, which the README says it does not.

This feature (1) corrects the safety statement everywhere it appears, (2) changes the default hop count from `2` to `0` (Q2), (3) rewrites the scenario guidance around "use `0` wherever `sourceIp` is the viewer", (4) adds `docs/cloudfront-notes/README.md`, a dated record of the CloudFront and API Gateway behavior that the package relies on (U1), and (5) keeps the README, JSDoc, types, CHANGELOG, and the draft security advisory consistent. No tests are added (Q3). The only change to the resolver's behavior is the default value.

The change ships in v1.4.1. Decisions are recorded in [PLAN.md](PLAN.md); references such as (Q2), (U1), or (D4) point there. All decisions are locked.

## Glossary

- **Resolver**: the internal static class in `src/lib/utils/ClientIpResolver.class.js` (introduced by spec `1-4-1-trusted-client-ip`).
- **Hop count** (`N`): the number of trusted proxies that append to `X-Forwarded-For` between the client and the Lambda function. The resolver reads the entry `N` from the right.
- **Hop count env var**: `CACHE_DATA_TRUSTED_PROXY_HOPS`.
- **Default hop count**: `0` after this feature (`2` before it). A hop count of `0` makes the resolver return `identity.sourceIp` and skip both header steps.
- **Real chain**: the entries of `X-Forwarded-For` that proxies wrote, ending at the right end of the header. `R` is its length.
- **Padded chain**: a header with `p` extra entries on the left written by the client.
- **Topologies** (PLAN.md Section 4.3; all four measured):

  | ID | Topology | Chain at the function | Count that matches the chain | Value to document |
  |---|---|---|---|---|
  | T1 | Edge-optimized REST API, no CloudFront of the user's own | `..., C, M` | 2 | `0` (the default); `2` is also correct |
  | T2 | The user's CloudFront in front of an edge-optimized REST API | `..., V, E, M` | 3 | `3` |
  | T3 | The user's CloudFront in front of a Regional REST API | `..., V, E` | 2 | `0` |
  | T4 | Regional REST API, no CloudFront | `..., C` | 1 | `0`; `1` is also correct |

  `C` is the client, `V` the viewer of the user's CloudFront, `E` the edge address of the user's CloudFront, and `M` the edge address of the CloudFront distribution that AWS manages for an edge-optimized API.
- **Observation**: a statement about AWS service behavior that the package relies on, with a date, a topology, a method, and a status ("Documented by AWS" or "Not documented by AWS"). Observations O1 to O8 are listed in Requirement 6.
- **Documentation range addresses**: `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737), used in docs and tests in place of real addresses.
- **Documentation set**: `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md`, `docs/README.md`, the JSDoc in `src/lib/utils/ClientIpResolver.class.js`, `src/lib/tools/RequestInfo.class.js`, and `src/lib/tools/ClientRequest.class.js`, the doc comments in `types/lib/tools/index.d.ts`, the v1.4.1 entries of `CHANGELOG.md`, and the draft advisory `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`.

## Requirements

### Requirement 1: Corrected safety statement (C1 to C4, C11, C12, D1 to D4)

**User Story:** As a Lambda function developer choosing a hop count, I want the documentation to say which mistakes are safe, so that I don't set a value that lets a client choose my logged IP.

#### Acceptance Criteria

1. THE paragraph at `docs/features/tools/README.md` line 1110 SHALL be replaced by text stating that: a hop count that is too low selects the address of one of the user's own proxies and never an entry the client wrote; a hop count that is too high selects an entry to the left of the real chain, which the client can write; with a count `k` higher than the real chain, a client that sends at least `k` extra `X-Forwarded-For` entries chooses the result, and with fewer the header is shorter than the count and resolution falls through to `identity.sourceIp`; and a count of `0` never reads `X-Forwarded-For`.
2. THE README SHALL include the example from the issue, in documentation range addresses: the header `192.0.2.1, 198.51.100.10, 203.0.113.30` resolved with a count of 2 (`198.51.100.10`, the client), 3 (`192.0.2.1`, a client-written entry), and 1 (`203.0.113.30`, a proxy), and the statement that a count of 4 falls through to `identity.sourceIp`.
3. THE class comment of `ClientIpResolver` (lines 33 to 42) SHALL state the same rule. Neither the README nor any JSDoc or type comment SHALL contain the phrase "unless the count is lower than the real number of proxies", and none SHALL state that a count that is too high is safe without the condition in criterion 1.
4. THE README SHALL state that, with an edge-optimized API behind the user's own CloudFront, one count cannot be correct for both the path through the distribution (`..., V, E, M`, count 3) and the raw `execute-api` URL (`..., C, M`, count 2), and SHALL recommend a Regional API behind the user's own CloudFront, with a link to the "Origin lock" section for users who keep an edge-optimized API. (D4)
5. THE statements in criteria 1 to 4 SHALL be consistent with the output of the resolver. The values in criterion 2 SHALL be reproducible by calling `ClientIpResolver.resolve(headers, { sourceIp: "203.0.113.30" }, N)` for `N` = 1 to 4.

### Requirement 2: Default hop count of 0 (Q2, D5, D8)

**User Story:** As a Lambda function developer who sets nothing, I want the default to be a value that no client can influence on any topology, so that a forgotten setting is never an exposure.

#### Acceptance Criteria

1. `DEFAULT_TRUSTED_PROXY_HOPS` in `src/lib/utils/ClientIpResolver.class.js` SHALL be `0`, and the static property `ClientIpResolver.DEFAULT_TRUSTED_PROXY_HOPS` SHALL equal it.
2. WHEN `process.env.CACHE_DATA_TRUSTED_PROXY_HOPS` is unset, empty, or only whitespace, THE hop count SHALL be `0` and the resolver SHALL NOT log a warning.
3. WHEN the trimmed value consists only of the digits `0` to `9`, THE hop count SHALL be that number in base 10, as before.
4. IF the trimmed value is anything else, THEN THE hop count SHALL be `0`, and THE resolver SHALL log one `DebugAndLog.warn` per distinct raw value with the text `<variable> must be a non-negative integer. Received <JSON-quoted value>. Using the default of 0.`, built from the constant.
5. WHILE the hop count is `0`, THE resolver SHALL return `identity.sourceIp` unchanged when it is neither `null` nor `undefined`, SHALL return `null` otherwise, and SHALL NOT read `x-forwarded-for` or `cloudfront-viewer-address` for the result.
6. THE resolver SHALL NOT change in any other way: the order of steps, the gating of the `cloudfront-viewer-address` step (hop count 2 or more) and of the `x-forwarded-for` step (hop count 1 or more), the parsing and validation rules, the per-raw-value memoization, the debug line (which reports `step=source-ip trustedProxyHops=0` at the default), and the guarantee that no method throws.
7. THE signatures and return types of `ClientIpResolver`, `RequestInfo.getClientIp()`, `RequestInfo.getClientIP()`, and `ClientRequest.getProps()` SHALL NOT change, and `ClientIpResolver` SHALL remain unexported from `src/index.js` and `src/lib/tools/index.js`.

### Requirement 3: Existing tests updated, none added (Q3)

**User Story:** As a maintainer, I want the test suite to describe the new default without adding tests, so that CI stays green and the decision not to add tests is respected.

#### Acceptance Criteria

1. THE existing tests that assert the default of `2` SHALL be updated, in these files and in any further file that fails after Requirement 2 is implemented: `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs`, `test/request/client-ip/unit/client-ip-resolver-config-tests.jest.mjs`, `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs`, `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs`, and `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`. `test/request/client-request-request-log-tests.jest.mjs` is checked and changes only if it fails.
2. A test whose subject is selection by count (for example "ignores a forged leftmost entry (T1 chain, default hop count)") SHALL set `CACHE_DATA_TRUSTED_PROXY_HOPS` explicitly to the count it needs and SHALL restore `process.env` in `afterEach`. A test whose subject is the default SHALL assert the new default.
3. THE "Property 2: Fail-safe at the default" test in the resolver property file SHALL be rewritten in place so that its name, comment, and assertion describe the new default: with the variable unset, any `X-Forwarded-For` chain resolves to `identity.sourceIp`.
4. THE stale header comment "default 1" in `request-info-forwarded-for-bug-exploration-tests.jest.mjs` SHALL be corrected. (G10)
5. THIS feature SHALL NOT add test files, `describe` blocks, `it` blocks, or property definitions. IT MAY change the assertions, fixtures, names, and comments of existing tests. (Q3)
6. THE full suite (`npm test`) SHALL pass, the `test/documentation/` tests SHALL pass, and `npm run test:types` SHALL pass.
7. Modified files SHALL NOT gain ESLint errors relative to the repository baseline. (`npm run lint:ci` already fails on the baseline, which is outside this spec.)

### Requirement 4: Scenario guidance in the tools README (D3 to D6, D11, D14, Q4)

**User Story:** As a Lambda function developer, I want the README to tell me which value to set for my deployment and how to check it, so that I choose a safe value and know where the evidence is.

#### Acceptance Criteria

1. THE configuration table at `docs/features/tools/README.md` lines 1119 to 1125 SHALL describe `0` as the default, as returning `identity.sourceIp`, as correct for T1, T3, and T4, and as returning the edge address (wrong, not forgeable) in T2; SHALL describe `1` and `2` as valid and, for honest traffic, equivalent to `0` in T4 and in T1 and T3 respectively, with the raw-URL caveat for `2` in T3; SHALL describe `3` as the value for T2; and SHALL say that an invalid value logs a warning and uses `0`.
2. THE T4 warning at line 1126 and the sentence at line 1128 ("The default fails safe for the other topologies") SHALL be replaced by text stating that at the default no topology lets a client choose the address, and that in T2 the logged address is the user's distribution's edge address until `3` is set.
3. THE scenario table (lines 1136 to 1139) SHALL list, for T1 to T4: the value to document (T1 `0`, T2 `3`, T3 `0`, T4 `0`), the measured chain, what `getClientIp()` returns, and the effect of leaving the default. THE effect for T1, T3, and T4 SHALL be "none"; for T2 it SHALL be that the edge address is returned and that `3` selects a client-written entry on the raw `execute-api` URL unless the origin is verified.
4. THE "Source" column SHALL name the observation IDs of `docs/cloudfront-notes/README.md` and their dates: T1 and T2 measured 2026-11-04 and 2026-11-09; T3 and T4 measured 2026-11-09. No row SHALL say "not measured". (G5)
5. THE README SHALL contain a provenance sentence stating: the date of the measurement; that AWS documents `identity.sourceIp` as the source IP address of the immediate TCP connection, with a link to the API Gateway variables page; that AWS does not document the behavior of a Regional API behind the user's own CloudFront; and that the user should set the variable explicitly if AWS changes it. THE README SHALL NOT link to AWS re:Post. (Q4)
6. THE marker-check paragraph at line 1182 SHALL state that the entry count minus one equals the chain length and is the value that matches a T2 deployment; and that for a Regional API, or an edge-optimized API with no CloudFront of the user's own, `0` is preferred. (G1)
7. THE note at line 1092 and the sentence at line 1153 that say the managed `AllViewerExceptHostHeader` policy does not forward `CloudFront-Viewer-Address` SHALL be removed or corrected to match observations O6 and O7, with a link to `docs/cloudfront-notes/README.md`. (C16, G9)
8. THE "About `CloudFront-Viewer-Address`" section (lines 1147 to 1153) SHALL be rewritten to say: the header is read only when the hop count is 2 or more, so it is not read at the default; the AWS-managed distribution of an edge-optimized API drops a viewer-supplied value (T1, T2), so forwarding it gives nothing in T2; a Regional API with no CloudFront delivers a viewer-supplied value unchanged (T4); and through the user's own CloudFront to a Regional API the header arrives with the real viewer address (T3). Each statement SHALL carry its date and SHALL link to its observation. (G2)
9. THE README SHALL state each measured claim once, with a link to the observation, and SHALL NOT repeat the evidence tables of `docs/cloudfront-notes/README.md`. (D14)
10. THE README SHALL contain no real IP address, account ID, endpoint ID, or distribution domain. Examples SHALL use documentation range addresses. THE README SHALL NOT mention `TestHarness`.
11. THE README SHALL NOT present as measured any statement that the observations do not record as measured.
12. THE introduction of the "Client IP resolution" subsection (line 1096) SHALL say that the IP is `identity.sourceIp` by default and that a hop count is set only for T2, and the "Origin lock" section (lines 1155 to 1159) SHALL say that the forged-header risk applies to T2 at `3` and to any deployment that sets a count above the real chain, and that for a Regional API behind the user's own CloudFront a request that skips the distribution cannot change the client address but still bypasses the distribution's caching and web ACL. THE headings `Client IP resolution`, `Setting CACHE_DATA_TRUSTED_PROXY_HOPS`, `Origin lock for your own CloudFront (T2 and T3)`, and `Check your deployment` SHALL keep their text, so existing anchors keep working.
13. THE "Resolution order" table (under the `Resolution order` heading, line 1098) SHALL keep its rows and add, before it, one sentence that at the default hop count of `0` only step 3 applies.

### Requirement 5: JSDoc and type comments (G3)

**User Story:** As a developer reading IDE hints, I want the doc comments to match the README, so that the hints don't recommend a value that the README has changed.

#### Acceptance Criteria

1. THE `ClientIpResolver` constant comment (line 9), class comment (lines 33 to 42), and the `@param` and `@returns` text that say "2 when unset" or "default of 2" (`resolve`, `resolveDetailed`, `getTrustedProxyHops`, `parseTrustedProxyHops`, including the `parseTrustedProxyHops("abc")` example) SHALL say `0`. THE comment SHALL describe the default as "use `identity.sourceIp`" and SHALL remove "A Regional REST API with no CloudFront needs 1".
2. THE JSDoc of `RequestInfo.getClientIp`, `RequestInfo.getClientIP`, and `RequestInfo._clientRequestInfo` (`src/lib/tools/RequestInfo.class.js`) and of `ClientRequest` (`src/lib/tools/ClientRequest.class.js`) SHALL describe the default as `0`, SHALL say that `0` returns `identity.sourceIp` and is correct for a Regional API and for an edge-optimized API with no CloudFront of the user's own, and SHALL say that an edge-optimized API behind the user's own CloudFront needs `3`.
3. THE doc comments of `getClientIp` and `getClientIP` in `types/lib/tools/index.d.ts` SHALL say the same. THE only changes in `types/` SHALL be doc comments.
4. THE JSDoc SHALL keep the structure required by `.kiro/steering/documentation-standards-jsdoc.md`: parameter names matching the signatures, `@returns`, and `@example`.
5. JSDoc and type comments SHALL name `docs/features/tools/README.md` and `docs/cloudfront-notes/README.md` by path in text and SHALL NOT link to them, because `docs/` is excluded from the npm package. (G12)

### Requirement 6: CloudFront notes (U1, D12, D13)

**User Story:** As a maintainer adding features for functions that sit behind CloudFront, and as a developer who wants to know how far to trust a header, I want a dated record of the observed AWS behavior the package relies on, so that each feature states its basis and can be re-checked when AWS changes something.

#### Acceptance Criteria

1. THE repository SHALL contain `docs/cloudfront-notes/README.md`, linked from `docs/README.md` (a new entry under a section for the notes) and from the "Client IP resolution" subsection of `docs/features/tools/README.md`. THE file SHALL follow `.kiro/steering/documentation-standards-markdown.md`: one H1, ATX headers without skipped levels, code blocks with a language, tables with header separators, and relative links for internal references.
2. THE file SHALL begin with a purpose statement (behavior of API Gateway and CloudFront that features of this package rely on, recorded as observations), a note that each observation has a date and a status, and a note that AWS can change observed behavior, with a pointer to the method for re-checking.
3. THE file SHALL define the topologies T1 to T4 in one table with the chain at the function, what `identity.sourceIp` holds, and the measurement dates, using the glossary of this document.
4. THE file SHALL record the following observations, each with an ID, a date, the topology, what was sent, what was seen, the status ("Documented by AWS", with the link, or "Not documented by AWS"), and the effect on this package:
   - O1. Each CloudFront distribution appends the viewer address to the end of `X-Forwarded-For`, and API Gateway appends the address that connected to it (2026-11-04 and 2026-11-09, T1 to T4).
   - O2. Duplicate viewer `X-Forwarded-For` headers are joined into one comma-separated value, in order (2026-11-04).
   - O3. `identity.sourceIp` is the client in T1, T3, and T4 and an edge address in T2, and no forged header changed it. AWS documents the field as the immediate TCP connection and does not document T3. (2026-11-04 for T1 and T2, 2026-11-09 for all four)
   - O4. The AWS-managed distribution of an edge-optimized API drops a viewer-supplied `CloudFront-Viewer-Address` (T1, T2; Not documented by AWS).
   - O5. A viewer-supplied `CloudFront-Viewer-Address` reaches a Regional API with no CloudFront unchanged (T4; Not documented by AWS).
   - O6. Through the user's own CloudFront to a Regional API, `CloudFront-Viewer-Address` arrives holding the real viewer address and port, and a viewer-supplied value is replaced (T3, 2026-11-09, managed `AllViewerExceptHostHeader` policy).
   - O7. The managed `AllViewerExceptHostHeader` origin request policy forwarded `CloudFront-Viewer-Address` to a Regional origin (2026-11-09). AWS documents the policy as including additional CloudFront request headers for protocol, TLS version, device type, and viewer location. THE file SHALL say that the earlier statement in this package's documentation, that the policy does not forward the header, was wrong.
   - O8. Forged `Forwarded`, `X-Real-Ip`, and `X-Forwarded-For` values did not change `identity.sourceIp` in any topology (2026-11-09).
5. THE file SHALL describe the method for both dates: the 2026-11-04 captures from deployed REST API test stacks read from Lambda event logs or API Gateway execution logs, using documentation range addresses as markers; and the 2026-11-09 re-measurement from a temporary stack of one Regional and one edge-optimized REST API with mock integrations, each with a CloudFront distribution (managed `CachingDisabled` cache policy, managed `AllViewerExceptHostHeader` origin request policy, HTTPS to the origin), with the four header variants listed in PLAN.md Section 3.1. THE file SHALL show the response mapping template that returns `$context.identity.sourceIp` and the two request headers, and SHALL state the limits: mock integration instead of a Lambda proxy integration, one client address, IPv4 only.
6. THE file SHALL describe how to add an observation (the fields in criterion 4, one row or section per observation, new files in the directory for new topics), so that later features follow the same convention.
7. THE file SHALL contain no real IP address, account ID, endpoint ID, distribution domain, stack name, or CloudFront edge address range, and SHALL use documentation range addresses in every example.
8. THE file SHALL NOT claim as measured anything the observations do not record as measured, and SHALL state the status of each observation in the same words used in criterion 4.
9. EVERY link in the file, and every link added to `docs/README.md` and `docs/features/tools/README.md`, SHALL resolve, so that the tests in `test/documentation/` pass.

### Requirement 7: Changelog (Q5, G11)

**User Story:** As an existing user, I want the release notes to describe the default and the scenario guidance correctly, so that the notes agree with the documentation.

#### Acceptance Criteria

1. THE changes SHALL be recorded under `## v1.4.1 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, each entry linking `[Spec: 1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that](.kiro/specs/1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that/)` and, where the entry addresses the issue, `addresses [#253](https://github.com/63Klabs/cache-data/issues/253)`.
2. EACH row of [Consumer-visible behavior changes](#consumer-visible-behavior-changes) SHALL appear under the category that table assigns it.
3. A new entry under "Added" SHALL announce `docs/cloudfront-notes/README.md`, per the convention for significant documentation changes.
4. THE three existing entries named in G11 (lines 16, 18, and 23 of `CHANGELOG.md`) say the default is `2` and that Regional APIs stay forgeable until `1` is set. THIS feature SHALL edit those three entries in place, and only those three, as a one-time exception to the rule in `.kiro/steering/changelog-convention.md` that existing text is never updated, recorded in PLAN.md as the answer to Q5: line 16 ("The default counts two proxies...") SHALL describe the default of `0` and the value `3` for T2; line 18 ("Regional APIs without CloudFront stay forgeable until you set...") SHALL be removed, because the statement is no longer true; line 23 (the `CACHE_DATA_TRUSTED_PROXY_HOPS` entry) SHALL state the default of `0` and the value `3` for T2, and SHALL say that an invalid value logs one warning and uses `0`. No other existing line SHALL change.
5. IF the `## v1.4.1 (unreleased)` heading or the `1.4.1` version in `package.json` is missing when the changelog task runs, THEN the task SHALL stop and ask the developer, rather than create either.

### Requirement 8: Draft security advisory (D7)

**User Story:** As the maintainer who publishes the advisory at release, I want the draft to match the final guidance, so that the advisory doesn't tell Regional users to set a value the README has replaced.

#### Acceptance Criteria

1. THE draft `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` SHALL be updated at lines 75, 84 to 86, 135, 148, and 166 and wherever else it states the default or the T3 or T4 value, to say: the default is `0`; only a T2 deployment must act (set `3`); T1, T3, and T4 need nothing; and no topology is forgeable at the default.
2. THE draft SHALL remove "A T4 deployment is not fixed by upgrading alone" and the limitation "A Regional API without CloudFront (T4) stays forgeable at the default", and SHALL replace "confirm the field on your own deployment" for T4 with the measured result and its date.
3. THE draft SHALL keep the T2 origin-lock recommendation and the statement that requests that skip the user's distribution can forge `X-Forwarded-For` when `3` is set.
4. THE draft SHALL contain no real IP address, account ID, or endpoint identifier. Publishing it SHALL remain the developer's step.
5. THE sibling spec's `PLAN.md`, `requirements.md`, `design.md`, and `tasks.md` SHALL NOT be modified. (D7)

### Requirement 9: Backwards compatibility and release (D5)

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.1 without changing my code.

#### Acceptance Criteria

1. THE package exports SHALL keep their names and kinds, and no export SHALL be added.
2. `getClientIp()`, `getClientIP()`, `getProps()`, and `Response.finalize()` SHALL keep their signatures and return types.
3. FOR every topology T1 to T4 and honest traffic, THE client IP returned at the new default SHALL equal the client IP returned at the previous default of `2` (`identity.sourceIp` for T1, T3, and T4, and the edge address for T2), as listed in PLAN.md Section 4.3. THE previous default was never released.
4. THE change SHALL ship in v1.4.1, which is unreleased. THE `package.json` version SHALL stay `1.4.1`.
5. THE spec directory name SHALL stay `1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that`.

### Requirement 10: Accuracy and consistency of the documentation set (G3, D11)

**User Story:** As a reader, I want every file to give the same guidance, so that I don't find one file recommending `1` for a Regional API and another `0`.

#### Acceptance Criteria

1. THE documentation set SHALL NOT contain, after this feature, any of: a default of `2` (other than as a valid value or as the count that matches T1 and T3); a recommendation to set `1` for a Regional API as the value to document; the statement that a too-high hop count is safe or "fail-safe" without the condition in Requirement 1.1; the statement that the managed `AllViewerExceptHostHeader` policy does not forward CloudFront headers. The `1` and `2` values MAY appear as valid values and in the explanations of the count that matches a chain.
2. A search of the documentation set for `PROXY_HOPS` SHALL show only text that agrees with Requirements 1, 2, 4, and 5.
3. EVERY measured statement in the documentation set SHALL be traceable to a row of PLAN.md Section 3.1 or to a 2026-11-04 observation of spec `1-4-1-trusted-client-ip`.
4. User documentation SHALL describe behavior rather than resolver internals, and the modified JSDoc and Markdown SHALL pass the validation tests in `test/documentation/`.

## Consumer-visible behavior changes

Relative to v1.4.0, the last release. The "Category" column is the CHANGELOG category (Requirement 7.2). Rows 1, 3, and 4 describe parts of one new variable, so they are written in one entry.

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | `CACHE_DATA_TRUSTED_PROXY_HOPS` defaults to `0`: `getClientIp()` returns `identity.sourceIp`, which is the client in T1, T3, and T4. The earlier draft default of `2` is not released | Everyone; no action in T1, T3, and T4. T2 users set `3` | Added | Q2, D5 |
| 2 | At the default no topology lets a client choose the logged IP, including a Regional API with no CloudFront | Regional API users; replaces the draft statement that they stay forgeable until they set `1` | Security | Q2, C6 |
| 3 | `CloudFront-Viewer-Address` is read only when the hop count is 2 or more, so it is not read at the default | Users who forward the header and set no value; T2 and T3 results are unchanged (`E` and `V`). Described in the entry for the variable | Added | Q2, D8 |
| 4 | An invalid `CACHE_DATA_TRUSTED_PROXY_HOPS` value now falls back to `0`, with one warning | Users with a malformed value. Described in the entry for the variable | Added | D8 |
| 5 | New `docs/cloudfront-notes/README.md` records the observed CloudFront and API Gateway behavior the package relies on, and corrects the README statement about the managed origin request policy | Everyone reading the docs | Added | U1, D12 |

The other v1.4.1 entries (own CloudFront logs the edge address until `3` is set; corporate proxy egress address; invalid selected values fall through; empty client IP logged as `-`; `RESPONSE` field clean-up; `queryKeys` keys only; debug resolution line) are unchanged by this feature, except for the three entries edited under Requirement 7.4.

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. Corrected safety statement | C1 to C4, C11, C12, D1 to D4 |
| 2. Default hop count of 0 | Q2, D5, D8, C13 |
| 3. Existing tests updated, none added | Q3, G10 |
| 4. Scenario guidance in the tools README | D3 to D6, D11, D14, Q4, C16, G1, G2, G5, G9 |
| 5. JSDoc and type comments | G3, G12 |
| 6. CloudFront notes | U1, D12, D13, D14, G12, G13 |
| 7. Changelog | Q5, G11 |
| 8. Draft security advisory | D7, I3 |
| 9. Backwards compatibility and release | D5, D10 |
| 10. Accuracy and consistency | G3, D11 |

## Out of scope

- Changing the resolver in any way other than the default value (Requirement 2.6).
- Adding tests (Q3).
- Editing the sibling spec's `PLAN.md`, `requirements.md`, `design.md`, and `tasks.md` (D7).
- The origin-secret check of issue #254 (`1-4-1-clientrequest-report-whether-a-request-came`) and the Atlantis repositories' use of this guidance (atlantis-starter-02 #14, atlantis-sam-templates #9 and #10). The owners are told the outcome (PLAN.md N3), outside this repository.
- HTTP API (payload v2) events.
- A programmatic option for the hop count.
- Moving or re-creating the `v1.4.1` tag (PLAN.md N1).
- Recording observations about features not yet built; the notes follow the convention in Requirement 6.6 when they are.
