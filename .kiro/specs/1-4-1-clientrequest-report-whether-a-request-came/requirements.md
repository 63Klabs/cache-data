# Requirements Document

## Introduction

An application behind a CloudFront distribution is usually still reachable at its API Gateway `execute-api` URL, and nothing in `ClientRequest` can tell a request that came through the distribution from one that skipped it. The Atlantis network template (atlantis-sam-templates v0.0.46, issue #10) now makes CloudFront add the header `X-Atlantis-Origin-Secret` to every origin request when `ApiOriginProtection` is `"true"`. The value is the Secrets Manager secret `<Prefix>-<ProjectId>-<StageId>-OriginSecret`, and CloudFront overwrites any value the viewer sent. This is GitHub issue [#254](https://github.com/63Klabs/cache-data/issues/254).

This feature adds the application half. When `CACHE_DATA_INGRESS_SECRET_NAME` names a Secrets Manager secret, `ClientRequest` compares the header with the secret's current and previous values and reports `getProps().client.ingress` as `direct`, `cloudfront`, or `unverified`. It also reports `getProps().client.sourceIp`, adds `ClientRequest.isIngressVerified()` and a static `ClientRequest.prime()`, writes one `INGRESS_UNVERIFIED` log line for each unverified request, and documents the setup, the rotation procedure, and the limits. Rejection stays in the application, so it controls the status and body. A function that does not set the variable behaves as it does today, apart from two additive fields.

The change ships in v1.4.1, which is unreleased (npm `latest` is 1.4.0). Decisions are recorded in [PLAN.md](PLAN.md); references such as (Decision 3) or (D5) point there. All decisions are locked. The package's own names use "ingress" and never "origin", because "origin" already means the `Origin` request header and a CloudFront origin (U1).

## Glossary

- **Verifier**: the internal static class `IngressVerifier` in `src/lib/utils/IngressVerifier.class.js`. It is not exported from `src/index.js` or `src/lib/tools/index.js` and is not mentioned in `types/`.
- **Secret header**: the request header `X-Atlantis-Origin-Secret`. It is read from the lowercased header map that `RequestInfo` builds (`x-atlantis-origin-secret`).
- **Secret variable**: `CACHE_DATA_INGRESS_SECRET_NAME`, the name or ARN of a Secrets Manager secret.
- **Interval variable**: `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS`, the refresh interval R in seconds.
- **Current reader** and **previous reader**: the two private subclasses of `CachedSecret` in `src/lib/utils/` that read the secret's `AWSCURRENT` and `AWSPREVIOUS` versions (Decision 2).
- **Accepted values**: the usable values held by the current reader and by the previous reader.
- **Unusable value**: a secret value that is empty, whitespace-only, or `BLANK` in any case (Decision 3).
- **Primed**: a reader that has finished at least one read. A reader that has never started or finished a read is **not primed**.
- **Mismatch**: the secret header is a non-empty string that equals neither accepted value.
- **Mismatch refresh**: the forced, non-awaited reload of both readers that a mismatch starts (Decision 9, D19).
- **Ingress**: `direct`, `cloudfront`, or `unverified` (Requirement 3).
- **Reason code**: one of `missing-header`, `mismatch`, `secret-not-primed`, `secret-unavailable`, `secret-unusable`, `bad-configuration` (Requirement 3, Requirement 9).
- **Failure episode**: the time from a failed read until the next successful read of the same reader.
- **Documentation range addresses**: `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737), used in docs and tests in place of real addresses.
- **Documentation set**: `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md`, the JSDoc in `src/lib/utils/IngressVerifier.class.js`, `src/lib/tools/ClientRequest.class.js`, and `src/lib/tools/RequestInfo.class.js`, the doc comments in `types/lib/tools/index.d.ts`, the v1.4.1 entries of `CHANGELOG.md`, and the draft advisory `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`.

## Requirements

### Requirement 1: Configuration (Decision 1, D5, D17)

**User Story:** As a Lambda function developer, I want to turn the check on with one environment variable, and to be told when the value is wrong, so that a typo never silently disables it.

#### Acceptance Criteria

1. WHEN `process.env.CACHE_DATA_INGRESS_SECRET_NAME` is unset, empty, or only whitespace, THE verifier SHALL treat the check as not configured, THE ingress SHALL be `direct`, and THE verifier SHALL NOT create or register a reader, start a read, or log.
2. WHEN the trimmed value passes `ParameterKeySafety.checkSecretName` and is at most 2048 characters, THE verifier SHALL treat the check as configured and use the trimmed value as the secret id for both readers.
3. IF the trimmed value fails `ParameterKeySafety.checkSecretName` or is longer than 2048 characters, THEN THE ingress SHALL be `unverified` with reason `bad-configuration`, THE verifier SHALL NOT create a reader, and THE verifier SHALL log one `DebugAndLog.error` per distinct raw value, quoting the value with `JSON.stringify` and naming the variable.
4. THE verifier SHALL read the variable on every evaluation and memoize the parsed result by raw value, so a changed value is seen on the next request, as `ClientIpResolver` does for `CACHE_DATA_TRUSTED_PROXY_HOPS`.
5. WHEN the variable is set to a valid value at the time `ClientRequest` is first loaded, THE verifier SHALL create and register both readers immediately, so that `CachedParameterSecrets.prime()` loads them (Decision 1). WHEN the variable becomes valid later, THE verifier SHALL create and register them on the next evaluation or `ClientRequest.prime()` call.
6. WHEN `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` is unset, empty, or only whitespace, THE refresh interval R SHALL be 3600 seconds without a warning. WHEN the trimmed value consists only of the digits `0` to `9` and is from 60 to 86400 inclusive, R SHALL be that number. OTHERWISE R SHALL be 3600 and THE verifier SHALL log one `DebugAndLog.warn` per distinct raw value, quoting the value with `JSON.stringify`, naming the variable, and stating the accepted range and the default. (Decisions 4 and 9, D17)
7. THE readers SHALL use R as their `refreshAfter` value.

### Requirement 2: `client.sourceIp` (D6, D11)

**User Story:** As a developer behind CloudFront, I want the address API Gateway saw, so that I can log it next to `client.ip` when `client.ip` comes from a header.

#### Acceptance Criteria

1. `RequestInfo._clientRequestInfo` SHALL set `client.sourceIp` to `event.requestContext.identity.sourceIp` when that value is a non-empty string, and to `null` otherwise, including when `requestContext` or `identity` is missing or `null`.
2. THE value SHALL NOT be validated, trimmed, or changed.
3. `getProps().client.sourceIp` SHALL hold the same value.
4. `client.ip`, `getClientIp()`, and `getClientIP()` SHALL NOT change.
5. THE feature SHALL NOT add `getClientSourceIp()`, `getClientIngress()`, or any other getter to `RequestInfo`.
6. THE documentation SHALL state that on an edge-optimized API behind the user's own CloudFront the value is an edge address (observation O3), that an HTTP API (payload v2) event gives `null`, and that the field is unaffected by `CACHE_DATA_TRUSTED_PROXY_HOPS`.

### Requirement 3: `client.ingress` and reason codes (D2 to D4, Decisions 3 and 5)

**User Story:** As a developer, I want the function to tell me whether a request came through my distribution, and why not, so that I can reject or monitor it.

#### Acceptance Criteria

1. THE `ClientRequest` constructor SHALL set `getProps().client.ingress` once, from `IngressVerifier.evaluate(headers)`, where `headers` is the lowercased header map. THE value SHALL NOT change afterwards.
2. THE verifier SHALL evaluate in this order and stop at the first row that applies:

   | Order | Condition | Ingress | Reason code |
   |------:|-----------|---------|-------------|
   | 1 | The secret variable is not configured (Requirement 1.1) | `direct` | none |
   | 2 | The variable is set and invalid (Requirement 1.3) | `unverified` | `bad-configuration` |
   | 3 | The current reader has never started or finished a read | `unverified` | `secret-not-primed` |
   | 4 | The current reader finished a read and holds no value | `unverified` | `secret-unavailable` |
   | 5 | The current reader's value is unusable | `unverified` | `secret-unusable` |
   | 6 | The secret header is absent, an empty string, an array, or not a string | `unverified` | `missing-header` |
   | 7 | The header equals the current value, or equals the previous reader's value when that value is usable | `cloudfront` | none |
   | 8 | Otherwise (a mismatch) | `unverified` | `mismatch` |

3. THE previous reader SHALL be treated as absent, and SHALL NOT affect the result, when it holds no value, has never been primed, or holds an unusable value. A missing previous value SHALL NOT produce `secret-unavailable`.
4. THE comparison SHALL hash the header and each accepted value with SHA-256 and compare the digests with `crypto.timingSafeEqual`. THE verifier SHALL compare the header with both accepted values on every evaluation that reaches row 7, without stopping at the first match.
5. THE comparison SHALL be exact: the secret value is the whole `SecretString`, with no trimming and no JSON parsing (D3).
6. THE header name SHALL be matched case-insensitively, through the lowercased map. THE verifier SHALL read `headers` only and SHALL NOT read `multiValueHeaders`.
7. THE verifier SHALL NOT throw. IF an unexpected error occurs, THEN THE ingress SHALL be `unverified` with the reason code of the nearest applicable row, or `secret-unavailable` when none applies, and THE verifier SHALL log one error that contains no header value and no secret value.
8. WHILE the check is configured, THE only result that allows `cloudfront` SHALL be row 7.

### Requirement 4: Reading the secret (Decision 2, D16)

**User Story:** As a maintainer, I want the previous version read without changing the public `CachedSecret`, so that the package API stays stable.

#### Acceptance Criteria

1. THE current reader SHALL read the secret's `AWSCURRENT` version and THE previous reader SHALL read its `AWSPREVIOUS` version. Both SHALL be private subclasses of `CachedSecret` in `src/lib/utils/` (a shared private subclass with one thin subclass per version, so that the version is known when `CachedParameterSecrets.add` runs inside the base constructor), SHALL NOT be exported from `src/index.js` or `src/lib/tools/index.js`, and SHALL be marked `@private`.
2. THE public `CachedSecret`, `CachedParameterSecret`, and `CachedParameterSecrets` SHALL NOT change in exports, signatures, or observable behavior. THE only edit to `CachedParametersSecrets.classes.js` SHALL be one additional internal, overridable method `CachedParameterSecret._logNon2xxResponse(statusCode, path)` whose default writes exactly the `DebugAndLog.warn` message that `_requestSecretsFromLambdaExtension` writes today, so that the previous reader can log the same event at debug level.
3. EACH reader SHALL register in `CachedParameterSecrets` under its own key, which SHALL differ from the secret id and from the other reader's key, so that an application's own `CachedSecret` for the same secret id and the two readers do not hide one another.
4. THE current reader's extension request SHALL carry `versionStage=AWSCURRENT` and its SDK request SHALL carry `VersionStage: "AWSCURRENT"`. THE previous reader's SHALL carry `AWSPREVIOUS`. THE extension query string SHALL be built with `encodeURIComponent`, as `CachedSecret.getPath()` does.
5. WHEN the previous version does not exist, THE previous reader SHALL record a successful "no previous version" state with `cache.status` 1, SHALL log at debug level only, and SHALL NOT be refreshed again before R seconds have passed or before a mismatch refresh. IT SHALL NOT set `cache.status` below 0 for this case. (D16)
6. FOR any other failure to read the previous version, THE previous reader SHALL log one `DebugAndLog.warn` per failure episode.
7. FOR a failure to read the current version, THE current reader SHALL log one `DebugAndLog.error` per failure episode and SHALL keep the last good value, as `CachedParameterSecret.refresh()` does (D10).
8. NO log line from either reader SHALL contain a secret value or a header value. The secret id MAY appear.
9. THE readers SHALL use the Lambda extension when it is available and the SDK otherwise, through the existing transport selection, and SHALL NOT call the AWS SDK outside `AWS.secrets` (AGENTS.md 3.2, 10.2).
10. THE exact response of the SDK and the extension to a missing `AWSPREVIOUS` version SHALL be taken from the check in Requirement 14 and recorded before criterion 5 is implemented.
11. AFTER a failed read, THE reader's `needsRefresh()` SHALL stay `false` for 30 seconds, so that a Secrets Manager or extension outage does not make every request wait for a failing read. A forced refresh (Requirement 6) and a call to `refresh()` SHALL NOT be blocked by this wait. A refresh that ends with `cache.status` still 0 SHALL be set to -1, so that a reader can never stay in the refreshing state.

### Requirement 5: Priming (Decision 1, D15)

**User Story:** As a developer whose application does not prime Cached secrets, I want a one-line way to load the ingress secret before the first request.

#### Acceptance Criteria

1. `ClientRequest` SHALL gain a public static method `prime()` that takes no arguments and returns `Promise<boolean>`.
2. `ClientRequest.prime()` SHALL resolve `true` when the check is not configured, or when it is configured and the current reader holds a value after priming. It SHALL resolve `false` when it is configured and invalid (Requirement 1.3), or when the current reader holds no value. It SHALL NOT reject.
3. A missing previous version SHALL NOT make `ClientRequest.prime()` resolve `false`.
4. `ClientRequest.prime()` SHALL create and register the readers when the variable is valid and they do not exist yet, then call `prime()` on both readers. It SHALL be safe to call repeatedly and together with `CachedParameterSecrets.prime()`, and SHALL NOT start a second read while one is running.
5. THE JSDoc and `types/lib/tools/index.d.ts` SHALL declare `static prime(): Promise<boolean>` on `ClientRequest`, with an `@example` that awaits it before handling.
6. THE documentation SHALL show both ways to prime (`CachedParameterSecrets.prime()` inside `Config.prime()`, and `ClientRequest.prime()`) and SHALL state that an enforcing application that does neither rejects requests with reason `secret-not-primed`.

### Requirement 6: Mismatch refresh (Decision 9, D19)

**User Story:** As an operator who rotates the secret, I want a container with a stale copy to correct itself, so that a skipped wait costs minutes of rejected requests, not an hour.

#### Acceptance Criteria

1. WHEN an evaluation ends in row 8 of the table in Requirement 3.2 (a mismatch), THE verifier SHALL start a forced `refresh()` of both readers and SHALL NOT await it. The request that caused it SHALL stay `unverified` with reason `mismatch`.
2. THE verifier SHALL start at most one mismatch refresh per 60 seconds per container. THE cooldown SHALL be a fixed constant, SHALL be measured from the last start, and SHALL NOT be a setting.
3. A header that is absent, an empty string, or not a string, an unusable secret, a secret that is not primed, an unavailable secret, and an invalid configuration SHALL NOT start a mismatch refresh.
4. THE mismatch refresh SHALL call `refresh()`, not `prime()`, so that an unexpired value is reloaded. WHEN a reader is already refreshing, THE verifier SHALL NOT start a second read for it.
5. A failure of the mismatch refresh SHALL follow Requirements 4.5 to 4.7 and SHALL NOT throw into the request.
6. THE mismatch refresh SHALL reload a previous version that was created after the container cached "no previous version".
7. THE documentation SHALL state that, with the extension layer, a forced refresh may return the extension's cached copy, which is at most 300 seconds old, so a stale container can need further mismatches (one per 60 seconds) and corrects itself within about 6 minutes; and that without the layer it corrects itself within seconds.

### Requirement 7: `isIngressVerified()` (Decision 5)

**User Story:** As a developer writing a guard, I want a method whose name says what it tests.

#### Acceptance Criteria

1. `ClientRequest` SHALL gain an instance method `isIngressVerified()` that returns `true` when the ingress recorded at construction is `cloudfront` and `false` for `direct` and `unverified`. THE recorded value SHALL be held in a private field, so that changing the object returned by `getProps()` does not change the result.
2. THE method SHALL be synchronous and SHALL NOT throw.
3. THE JSDoc and `types/lib/tools/index.d.ts` SHALL declare it as `isIngressVerified(): boolean`, with an `@example` that returns a `401` and a description that says `direct` returns `false`.
4. THE feature SHALL NOT change `isValid()`, `getValidationReason()`, or any status code the validation reports. A request with ingress `unverified` SHALL remain valid.
5. THE documentation SHALL state that a handler that enforces must set the secret variable, and that a handler that enforces without it rejects every request.

### Requirement 8: Log line `INGRESS_UNVERIFIED` (Decisions 6 and 10)

**User Story:** As an operator, I want a countable log line for each unverified request, so that I can chart rejections and run in monitor mode before enforcing.

#### Acceptance Criteria

1. WHEN the ingress is `unverified`, THE `ClientRequest` constructor SHALL write exactly one line with `DebugAndLog.log(message, "INGRESS_UNVERIFIED")`, whether or not the application later enforces (D14).
2. THE message SHALL be the compact JSON `{"reason":"<code>"}` built with `JSON.stringify`, where the code is one of the six reason codes.
3. THE line SHALL NOT contain an IP address, a header value, a secret value, or the secret id.
4. WHEN the ingress is `direct` or `cloudfront`, THE constructor SHALL NOT write the line.
5. THE `RESPONSE` log line SHALL NOT change: it keeps its 13 fields in their order, and `Response._log` SHALL NOT read the ingress.
6. THE documentation SHALL describe the line, the reason codes, a CloudWatch Logs Insights example that counts rejections by reason, and the monitor-first rollout (set the variable, watch the line, then enforce).

### Requirement 9: Reason codes (Decision 6)

**User Story:** As an operator, I want each code to point at one cause.

#### Acceptance Criteria

1. THE documentation SHALL define the codes as:

   | Code | Meaning | Usual cause |
   |------|---------|-------------|
   | `missing-header` | The header is absent, empty, or not a single string | A request that skipped the distribution; `ApiOriginProtection` is `"false"` |
   | `mismatch` | The header matches neither accepted value | A guessed value; a distribution holding an old value; a stale container |
   | `secret-not-primed` | The current reader has not finished a read | Priming was skipped (Requirement 5) |
   | `secret-unavailable` | The current read finished without a value | Missing permission, wrong secret id, Secrets Manager outage on a cold start |
   | `secret-unusable` | The current value is empty, whitespace, or `BLANK` | The application stack has not generated the secret |
   | `bad-configuration` | The variable value fails validation | A typo in the secret id |

2. THE codes SHALL be the only values of `reason` in the log line.

### Requirement 10: Fail-closed behavior and secrecy (D3, D4, D10)

**User Story:** As a security reviewer, I want every failure to end in `unverified`, and the secret never to be logged by this package.

#### Acceptance Criteria

1. ONLY an unset or empty secret variable SHALL give `direct`.
2. THE verifier and readers SHALL NOT write the secret value or the header value to any log, error message, debug line, or object returned by the package.
3. THE verifier SHALL NOT store the secret header value, and SHALL NOT add it to any object returned by `getProps()`, `getRequestLog()`, or `toObject()`.
4. THE verifier SHALL log errors once per failure episode, not once per request (D10). A reader's failure state SHALL end only on a successful read.
5. THE documentation SHALL state: the secret proves passage through a distribution configured with it and is not authentication; anyone who can read the distribution configuration can read it; never log the header or the secret, because `sanitize()` prints the last four characters of an alphanumeric value and prints everything after the first character outside `a-z 0-9 + _ : . - /` (PLAN.md C4); and that code that logs `event` or `getClientHeaders()` outside `sanitize()` prints the full value.

### Requirement 11: Backwards compatibility (D1, D11, D12, D13)

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.1 without changing my code.

#### Acceptance Criteria

1. WHEN the secret variable is unset, THE behavior of `ClientRequest`, `RequestInfo`, `Response`, and the logs SHALL equal v1.4.1 without this feature, except that `getProps().client` and `RequestInfo`'s client object gain `sourceIp` and `ingress`.
2. THE package exports SHALL keep their names and kinds. THE only additions to the public API SHALL be `ClientRequest.prime()` and `ClientRequest.isIngressVerified()`.
3. NO method SHALL change its signature, return type, or default.
4. THE verifier and the two readers SHALL NOT be exported, and no file under `types/`, `src/index.js`, or `src/lib/tools/index.js` SHALL mention `IngressVerifier`.
5. `types/lib/tools/index.d.ts` SHALL gain only the declarations in Requirements 5.5 and 7.3. `getProps()` SHALL remain undeclared (D12).
6. THE feature SHALL support REST API (payload v1) events only, like the rest of `ClientRequest` (D13).
7. THE change SHALL ship in v1.4.1 and `package.json` SHALL stay `1.4.1`.

### Requirement 12: Documentation (Decisions 1, 4, 5, 6, 9; D7, D20)

**User Story:** As a developer adopting the check, I want one place that tells me how to set it up, rotate the secret, and read the logs.

#### Acceptance Criteria

1. `docs/features/tools/README.md` SHALL gain an "Ingress verification" subsection directly after the "Origin lock for your own CloudFront (T2 and T3)" subsection, containing: what the check proves and does not prove; setup (secret variable, IAM `secretsmanager:GetSecretValue` on the secret and `kms:Decrypt` for a customer-managed key, optional extension layer); the two ways to prime; the `ingress` values and `isIngressVerified()` with a handler example that returns `401` with a JSON body and `Cache-Control: no-store` (D20) and explains why not `403` or `404`; the reason-code table (Requirement 9); the log line; the two environment variables in a table with defaults; the rotation procedure of PLAN.md Section 6.3, including the wait of R + 300 seconds, the mismatch refresh, the warning not to put a second value before the distribution updates, and the suspected-leak path; and the limits (Requirement 10.5; REST events only; `sourceIp` caveats).
2. THE "Origin lock" warning (`docs/features/tools/README.md` lines 1169 to 1170) SHALL name the secret variable as a third option next to AWS WAF and a Lambda authorizer, with a link to the new subsection.
3. THE `getProps()` listing in the "ClientRequest `getProps()`" subsection SHALL include `sourceIp` and `ingress` with one-line comments.
4. THE new subsection SHALL link to the platform's [API ingress standard](https://github.com/63Klabs/atlantis-sam-templates/blob/main/docs/end-user/api-ingress-standard.md) for the template side and SHALL NOT repeat its text.
5. THE rotation procedure SHALL NOT state the command that detaches the `AWSPREVIOUS` label until the check in Requirement 14 has confirmed it. IF the check shows the command does not work, THEN THE procedure SHALL say to wait for the next rotation instead.
6. `docs/cloudfront-notes/README.md` SHALL gain observation O9: a distribution's origin custom header overwrote a viewer-sent header of the same name on a Regional and an edge-optimized REST API, measured 2026-11-09 by the maintainer (atlantis-sam-templates #10), documented by AWS with a link to "Add custom headers to origin requests", with the effect on this package (D7). THE row SHALL NOT claim a new measurement.
7. THE JSDoc of `ClientRequest.prime`, `ClientRequest.isIngressVerified`, the `ClientRequest` class comment, and `RequestInfo._clientRequestInfo` SHALL be complete (description, `@param`, `@returns`, `@example`) and SHALL name `docs/features/tools/README.md` by path in text without linking, because `docs/` is excluded from the npm package. THE JSDoc of the verifier and readers SHALL be complete and marked `@private`.
8. THE documentation set SHALL contain no real IP address, account ID, endpoint ID, distribution domain, secret value, or stack name, and SHALL use documentation range addresses in examples. IT SHALL NOT mention `TestHarness`.
9. EVERY link added SHALL resolve, and the tests in `test/documentation/` SHALL pass. THE existing headings that other text links to (`Client IP resolution`, `Check your deployment`, `Origin lock for your own CloudFront (T2 and T3)`) SHALL keep their text.

### Requirement 13: Changelog and draft advisory (D8, D9)

**User Story:** As a user and as the maintainer who publishes the advisory, I want the release notes and the advisory to mention the new check.

#### Acceptance Criteria

1. THE change SHALL be recorded under `## v1.4.1 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, as one new entry under "Added" linking `[Spec: 1-4-1-clientrequest-report-whether-a-request-came](.kiro/specs/1-4-1-clientrequest-report-whether-a-request-came/)` and `addresses [#254](https://github.com/63Klabs/cache-data/issues/254)`. THE entry SHALL list, in sub-bullets: the secret variable and the interval variable with the default; `client.sourceIp` and `client.ingress`; `isIngressVerified()` and `ClientRequest.prime()`; the `INGRESS_UNVERIFIED` line; the mismatch refresh; and the O9 notes row.
2. NO existing line of `CHANGELOG.md` SHALL change (D8).
3. IF the `## v1.4.1 (unreleased)` heading or the `1.4.1` version in `package.json` is missing when the changelog task runs, THEN the task SHALL stop and ask the developer, rather than create either.
4. THE draft `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` SHALL gain one sentence in its origin-lock recommendation naming `CACHE_DATA_INGRESS_SECRET_NAME` as an application-level check and `ApiOriginProtection` as the template side. NO other line of that file, and NO other file of that spec, SHALL change in this feature. Publishing the advisory SHALL remain the developer's step.

### Requirement 14: Runtime check of the missing previous version (Decision 7, D18)

**User Story:** As a maintainer, I want the previous-version reader built on observed behavior, so that "never rotated" is not reported as a failure and a real failure is not hidden.

#### Acceptance Criteria

1. BEFORE the previous reader is implemented, THE implementer SHALL run the check of Decision 7 on one temporary secret in the test account (profile `release`, region `us-east-2`): `create-secret`; `get-secret-value --version-stage AWSPREVIOUS` (expect a not-found error); `put-secret-value`; `get-secret-value --version-stage AWSPREVIOUS` again; and `delete-secret --force-delete-without-recovery`.
2. BEFORE running the label-removal command (`update-secret-version-stage --version-stage AWSPREVIOUS --remove-from-version-id <old>`), THE implementer SHALL tell the user the exact write and wait for approval (D18).
3. IF the SSO token has expired, THEN THE implementer SHALL ask the user to sign in again and SHALL NOT retry.
4. THE check SHALL create no other resource. AFTER it, THE implementer SHALL confirm that the temporary secret no longer exists.
5. THE results (the SDK error name and message for a missing stage, the extension's HTTP status and body if it was exercised, and whether the label removal worked) SHALL be recorded in the spec's design or notes with no account ID, endpoint, or secret value.
6. THE extension's behavior MAY be exercised only if a function with the layer already exists in the test account. THE check SHALL NOT create a function for it. IF the extension's response is not observed, THEN the reader SHALL treat any non-2xx response for the previous stage as "no previous version" at debug level and record that choice in the design.

### Requirement 15: Tests (AGENTS.md 2.3)

**User Story:** As a maintainer, I want the new behavior covered by deterministic Jest tests, so that CI stays green.

#### Acceptance Criteria

1. THE feature SHALL add Jest tests (`.jest.mjs`) for the verifier, the readers, `ClientRequest`, and `RequestInfo`, using mocks for `AWS.secrets` and the extension transport and no real AWS calls.
2. PROPERTY tests (fast-check) SHALL cover: a header that equals neither accepted value never gives `cloudfront`; the header name matches in any letter case; either accepted value gives `cloudfront`; a non-string, array, or empty header never gives `cloudfront`; an unusable current value never gives `cloudfront` whatever the header holds. Generators SHALL be safe by construction, SHALL NOT filter by the predicate they assert, and SHALL NOT pass `seed` to `fc.assert`. Expensive properties SHALL limit `numRuns`.
3. UNIT tests SHALL cover each row of the table in Requirement 3.2; an unset and an empty variable giving `direct` and the same `getProps()` as before apart from the two fields; an invalid variable value; an invalid and an out-of-range interval; `sourceIp` for present, missing, and non-string values; the previous reader when absent, unusable, and failing; rotation (previous accepted, older rejected); `client.ip` unchanged; the `isIngressVerified()` results; and `ClientRequest.prime()` results (Requirement 5.2).
4. UNIT tests with fake timers SHALL cover the mismatch refresh: one start on a mismatch; none within 60 seconds of the last start; none for a missing, empty, or non-string header; the next request after completion sees the new values; a running refresh is not started twice.
5. A UNIT test SHALL assert that a never-rotated secret causes no refresh of the previous reader before R seconds pass (D16).
6. UNIT tests SHALL assert that the `INGRESS_UNVERIFIED` line is written once per unverified request, contains only `{"reason":"<code>"}`, and contains no secret, header value, address, or secret id; that no line is written for `direct` and `cloudfront`; and that the `RESPONSE` line still has 13 fields.
7. A UNIT test SHALL assert that no log call made while a secret value and a header value are in play contains either value.
8. A TEST SHALL assert that `src/index.js`, `src/lib/tools/index.js`, and `types/` do not mention `IngressVerifier`.
9. Tests that spawn processes SHALL invoke the Jest binary directly and SHALL NOT run `npm test` (test-execution-monitoring rules 1 and 2).
10. THE full suite (`npm test`) SHALL pass, the `test/documentation/` tests SHALL pass, and `npm run test:types` SHALL pass.
11. New and modified files SHALL NOT gain ESLint errors relative to the repository baseline. (`npm run lint:ci` already fails on the baseline, which is outside this spec.)

## Consumer-visible behavior changes

Relative to v1.4.0, the last release. All entries are new in v1.4.1.

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | `CACHE_DATA_INGRESS_SECRET_NAME` turns on the ingress check; `client.ingress` is `direct`, `cloudfront`, or `unverified` | Users who set the variable. Everyone else sees `ingress: "direct"` | Added | Decisions 1, 2, 3, 5 |
| 2 | `getProps().client.sourceIp` is `requestContext.identity.sourceIp` or `null` | Everyone; additive | Added | D6 |
| 3 | `ClientRequest.isIngressVerified()` and `ClientRequest.prime()` | Users who enforce or who do not use `CachedParameterSecrets.prime()` | Added | Decisions 1, 5 |
| 4 | `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` (default 3600) | Users who set the secret variable | Added | Decisions 4, 9 |
| 5 | One `INGRESS_UNVERIFIED` log line per unverified request | Users who set the secret variable; metric filters and dashboards can match the token | Added | Decisions 6, 10 |
| 6 | A header mismatch starts a rate-limited reload of the secret | Users who set the secret variable | Added | Decision 9 |
| 7 | `docs/cloudfront-notes/README.md` records the origin-header overwrite (O9); the tools README gains "Ingress verification" | Everyone reading the docs | Added | D7 |

## Additions beyond PLAN.md

These details are not spelled out in PLAN.md. Veto any of them.

- The evaluation order and the reason code for each failure (Requirement 3.2). An empty string header counts as `missing-header`.
- An unusable or absent previous value is ignored; only the current value being unusable gives `secret-unusable` (Requirement 3.3).
- Each reader has its own registry key, including the current reader, so an application's own `CachedSecret` for the same secret id is not hidden (Requirement 4.3).
- The header is read from `headers` only, never from `multiValueHeaders` (Requirement 3.6).
- A setting that becomes valid after load is picked up on the next evaluation or `ClientRequest.prime()` (Requirement 1.5).
- The ingress is evaluated once per `ClientRequest` and not re-evaluated (Requirement 3.1).
- The non-observed extension response falls back to "any non-2xx for the previous stage is no previous version" (Requirement 14.6).
- A 30-second wait after a failed read (Requirement 4.11). Without it, `CachedParameterSecret.prime()` retries a failed read on every request, and an extension that times out costs each request up to three 5-second attempts. This follows from the existing behavior (PLAN.md F5), which the plan had left as a note.
- A guard against a reader stuck in the refreshing state (Requirement 4.11), because `CachedParameterSecret.refresh()` leaves `cache.status` at 0 when an unexpected exception escapes its inner `try`.
- One internal hook on `CachedParameterSecret` (Requirement 4.2). The alternative is to copy the extension's HTTP code into the previous reader.
- `isIngressVerified()` reads a private field, not `getProps()` (Requirement 7.1).

## Traceability

| Requirement | PLAN.md |
|---|---|
| 1. Configuration | Decisions 1, 4, 9; D5, D17 |
| 2. `client.sourceIp` | D6, D11; C6, G9 |
| 3. `client.ingress` and reason codes | D2 to D4; Decisions 3, 5; C10 |
| 4. Reading the secret | Decision 2; D10, D16; V1 |
| 5. Priming | Decision 1; D15 |
| 6. Mismatch refresh | Decision 9; D19 |
| 7. `isIngressVerified()` | Decision 5 |
| 8. Log line | Decisions 6, 10; D14; C7 |
| 9. Reason codes | Decision 6 |
| 10. Fail-closed and secrecy | D3, D4, D10; C4 |
| 11. Backwards compatibility | D1, D11, D12, D13; C11 |
| 12. Documentation | D7, D20; Section 6.3; C3, C12 |
| 13. Changelog and advisory | D8, D9 |
| 14. Runtime check | Decision 7; D18; V1 |
| 15. Tests | Section 4.2; AGENTS.md 2.3 |

## Out of scope

- Fixing `sanitize()` partial masking: spin-off [`1-4-2-sanitize-masks-only-part-of-a-secret-value`](../1-4-2-sanitize-masks-only-part-of-a-secret-value/ISSUE.md) (Decision 8, F1).
- The platform runbook's missing wait: [atlantis-sam-templates #11](https://github.com/63Klabs/atlantis-sam-templates/issues/11) (Decision 8, F2).
- Rejecting requests inside `ClientRequest` or changing `isValid()`.
- AWS WAF rules, Lambda authorizers, and any CloudFormation or SAM template change in this repository.
- HTTP API (payload v2) events (F4) and typing `getProps()` (F3).
- Any change to `client.ip` or `CACHE_DATA_TRUSTED_PROXY_HOPS`.
- A public `versionStage` option on `CachedSecret`.
- Reading the secret as JSON, or a secret-value minimum length.
- Spec files other than the one sentence in Requirement 13.4.
