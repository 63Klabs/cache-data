# ClientRequest: report whether a request came through the expected distribution (ingress secret)

> **Status**: Locked 2026-11-10. All questions (Q1 to Q10) answered and recorded as Decisions 1 to 10 (Section 9). Requirements are in [requirements.md](requirements.md) , the design in [design.md](design.md), and the task list in [tasks.md](tasks.md)
> **Issue**: [ISSUE.md](ISSUE.md) (GitHub issue [#254](https://github.com/63Klabs/cache-data/issues/254))
> **Reviewed against**: `main` (same as `dev`) at `386c2f9` on 2026-11-10. This spec directory is untracked and was renamed from a `1-4-2-` prefix to `1-4-1-`.
> **Release**: v1.4.1 (unreleased; `package.json` is 1.4.1, npm `latest` is 1.4.0, tag `v1.4.1` marks the version bump commit `14acac0`)

## 1. Summary

An application behind an Atlantis CloudFront distribution is still reachable at its API Gateway `execute-api` URL, and nothing in `ClientRequest` can tell the two paths apart. The network template now does its half: `atlantis-sam-templates` v0.0.46 (issue #10, closed 2026-11-09) adds the opt-in `ApiOriginProtection` parameter, which makes CloudFront send `X-Atlantis-Origin-Secret` with the value of the Secrets Manager secret `<Prefix>-<ProjectId>-<StageId>-OriginSecret`. This issue adds the application half: when `CACHE_DATA_INGRESS_SECRET_NAME` is set, `ClientRequest` compares the header with the secret and reports `client.ingress` as `direct`, `cloudfront`, or `unverified`, plus `client.sourceIp` and `isIngressVerified()`. Rejection stays in the handler.

Most claims in the issue hold. Four things the issue leaves open decide whether the feature works in practice:

1. `new ClientRequest(event)` is synchronous, but `CachedSecret` loads its value asynchronously. The check works only if the secret was primed earlier (Q1).
2. The "previous" value for rotation has no source today. `CachedSecret` reads only the current version and has no version stage option (Q2).
3. A rotation can reject legitimate traffic for as long as the refresh interval plus 300 s unless the runbook waits for function caches. With the 3600 s default that is over an hour, so the plan adds a rate-limited refresh on a header mismatch (Section 6.3, Decision 9).
4. `sanitize()` does not fully mask the header. It shows the last four characters and masks nothing after a character outside its allowed set (Section 2, C4).

The locked shape is one small internal class in `src/lib/utils/` that does the check without any AWS call in `ClientRequest`, a synchronous read from the primed cache (primed by `CachedParameterSecrets.prime()` or by a new static `ClientRequest.prime()`), `AWSCURRENT` plus `AWSPREVIOUS` as the two accepted values, a refresh interval that defaults to 3600 s and can be changed, a rate-limited refresh when a header does not match (so a stale copy heals itself after a rotation), fail-closed handling for every unusable state, one `INGRESS_UNVERIFIED` log line per unverified request, and no change to the `RESPONSE` log line.

## 2. Assessment of the issue

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | Nothing in the function can tell a request that came through the distribution from one that skipped it | Confirmed | No ingress check exists in `src/`. `RequestInfo._clientRequestInfo` reads `X-Forwarded-For`, `CloudFront-Viewer-Address`, and `identity.sourceIp` only, through `ClientIpResolver` |
| C2 | A request that skips the distribution cannot forge the client address on a Regional API | Confirmed for the default hop count of `0` | [Observations O3 and O8](../../../docs/cloudfront-notes/README.md#observations), 2026-11-09. Not true when `CACHE_DATA_TRUSTED_PROXY_HOPS` is 1 or more on a Regional API (CHANGELOG v1.4.1) |
| C3 | CloudFront overwrites a viewer-sent header of the same name (measured on both API types) | Confirmed | AWS documents it: "If a header is present, CloudFront overwrites the header value" ([Add custom headers to origin requests](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)). The maintainer measured both API types on 2026-11-09 (atlantis-sam-templates #10). This repository's observation table has no row for it yet (Section 6.2, D7) |
| C4 | The name contains "secret", so `sanitize()` masks its value in logs; `X-Origin-Verify` and `X-Origin-Credential` are written unmasked | **Partially confirmed** | Probe on this code: `x-atlantis-origin-secret` is masked and `x-origin-verify` is not. The mask keeps the last four characters (`******EFGH`, `utils.js` `obfuscate`). The value pattern in `sanitize()` (`utils.js:130`) allows only `a-z 0-9 + _ : . - /`. A value with `=`, `!`, `#`, `$`, `%`, or `"` is masked only up to that character and the rest is printed (probe: `*******hij!klmnop#qrstuvwxyz$0123456789AB%CDEFGH`). The platform generates 48 alphanumeric characters (`ExcludePunctuation: true`), so the platform secret shows its last four characters |
| C5 | `client.ip` is unchanged and follows `CACHE_DATA_TRUSTED_PROXY_HOPS` | Confirmed | `RequestInfo.class.js` `_clientRequestInfo`; `ClientIpResolver.resolve` |
| C6 | `sourceIp` is `requestContext.identity.sourceIp` | Confirmed, with caveats | The resolver reads `identity.sourceIp` only. On an edge-optimized API behind your own CloudFront it is an edge address (O3). `ClientRequest` reads REST (payload v1) events only, so an HTTP API (v2) event gives `null` |
| C7 | The `RESPONSE` log line is positional and must keep its columns | Confirmed | `Response.class.js` `_log` (13 fields, comment "be sure to update the Dashboard template"). The starter dashboards parse it positionally |
| C8 | `CachedSecret` can read the secret | Partially confirmed | It reads the current version through the extension or the SDK (`CachedParametersSecrets.classes.js`, `CachedSecret.getPath`, `_requestFromSdk`). It has no version stage option (no `VersionStage` or `versionStage` anywhere in `src/`, `types/`, or `docs/`), and `CachedParameterSecrets.add` skips a second entry with the same name |
| C9 | Accepting the current and the previous value allows rotation without an outage | Partially confirmed | Works only if the function has reloaded the secret before the distribution switches. Effective staleness is the refresh interval plus, when the layer is used, the extension TTL (`SECRETS_MANAGER_TTL`, 300 s default and 300 s maximum, [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html)). The platform runbook does not wait for it (Section 5, G3). Mitigated by the mismatch refresh (Decision 9); procedure in Section 6.3 |
| C10 | A constant-time comparison is available | Confirmed | `crypto.timingSafeEqual` exists on Node 22 and later. Nothing in `src/` uses it yet |
| C11 | A function that does not set the variable behaves as 1.4.1 does today | Partially confirmed | Behavior is the same, but `getProps().client` gains `sourceIp` and `ingress: "direct"` for every application. The change is additive |
| C12 | A rejection should be `401`, not `403` or `404`, because the Atlantis distribution rewrites those two | Confirmed by the platform documentation | `docs/end-user/api-ingress-standard.md` in atlantis-sam-templates, "Distribution-wide 403 and 404 rewrite". Not checkable in this repository. A `401` generic response exists (`generic.response.js`) |
| C13 | `types/` must be updated | Partially confirmed | `types/lib/tools/index.d.ts` declares neither `getProps()` nor the shape of `client`. The new method can be typed; the new fields have no declaration to join |

Needs runtime verification:

| # | Item | Check |
|---|------|-------|
| V1 | What the SDK and the Lambda extension return when the `AWSPREVIOUS` stage does not exist, and that it appears after the second `put-secret-value` | Temporary secret in the test account: `create-secret`, `get-secret-value --version-stage AWSPREVIOUS` (expect a not-found error), `put-secret-value`, repeat, then `delete-secret --force-delete-without-recovery`. Also check that `update-secret-version-stage --version-stage AWSPREVIOUS --remove-from-version-id <old>` detaches the label (the way to retire the old value early). Writes on one temporary secret. Approved by Decision 7 for the first four commands; I will confirm the label-removal write before running it. Runs at the start of implementation |
| V2 | The header arrives in a Lambda proxy event's `headers` through a Regional and an edge-optimized API | Already seen at the API by mock integrations (atlantis-sam-templates #10). Confirm during adoption in atlantis-starter-02 #14. Not blocking |
| V3 | End-to-end rotation timing | Derive from the cache arithmetic in C9 and state it in the documentation. A live run is not planned |

## 3. Current state

- **Event handling.** `ClientRequest` extends `RequestInfo`. `RequestInfo._clientRequestInfo` lowercases every header key, so `X-Atlantis-Origin-Secret` is found as `x-atlantis-origin-secret` whatever case the client or the Regional endpoint used. `ClientRequest`'s constructor builds `#props.client` once (`ClientRequest.class.js:485-494`), synchronously.
- **Secrets.** `CachedSecret` extends `CachedParameterSecret`. `refresh()` tries the Lambda extension, then falls back to the SDK (`AWS.secrets.get({ SecretId })`, `AWS.classes.js:582`). A failed refresh sets `cache.status = -1` but keeps the old value, and `sync_getValue()` works while the value is non-null. `prime()` refreshes only when `needsRefresh()` is true, and `CachedParameterSecrets.prime()` primes everything registered. A failing refresh is retried on every `prime()`.
- **Priming pattern.** The documentation and the example handler call `CachedParameterSecrets.prime()` inside `Config.prime()` before handling a request (`docs/00-example-implementation/example-handler.js`, `docs/lambda-optimization/README.md`). A code search of atlantis-starter-02 found no use of `CachedParameterSecrets`, so whether the starter primes secrets could not be confirmed.
- **Existing guidance.** `docs/features/tools/README.md:1169-1170` says only infrastructure can stop requests that skip your distribution, for example an origin-verify header checked by AWS WAF or a Lambda authorizer. The CHANGELOG v1.4.1 Security entry and the draft `security-advisory.md` in `.kiro/specs/1-4-1-trusted-client-ip/` say the same.
- **Platform side (live).** Template v0.2.0 reads the secret with a versionless `{{resolve:secretsmanager:...}}` reference, so the header holds `AWSCURRENT` as of the last stack deployment. The platform's rotation steps are: deploy an application that accepts the old and the new value, put the new value, change `ApiOriginSecretRevision` so CloudFormation re-resolves it, wait until the distribution is `Deployed` plus a margin, remove the old value. The secret is created by the application stack with `GenerateSecretString` (`PasswordLength: 48`, `ExcludePunctuation: true`), so it is a plain string, not JSON. Its guidance for the application: compare in constant time, never log the header, reject when the secret is missing or empty, answer with a status other than 403 or 404, and count rejections.
- **Related issues.** atlantis-starter-02 #14 (open) adopts this feature with a handler guard that returns `401` with a JSON body and `Cache-Control: no-store`, and sets `CACHE_DATA_INGRESS_SECRET_NAME` only when the stage sits behind CloudFront.

## 4. Review

### 4.1 Security

- **What the secret proves.** That a request passed through a distribution configured with that secret, not who the caller is. The platform documentation says so and keeps normal authorization in place. The documentation here repeats it.
- **Who can read the secret.** Any principal with `cloudfront:GetDistribution` or `GetDistributionConfig` can read it from the distribution configuration (platform documentation). Treat it as an ingress token.
- **Fail closed.** Every state in which the check cannot succeed gives `unverified`: header missing, header not a single string, value mismatch, secret not loaded, secret unreadable, secret empty or a placeholder (Q3), and an invalid variable value. Only an unset or empty `CACHE_DATA_INGRESS_SECRET_NAME` gives `direct`.
- **Comparison.** Hash both sides with SHA-256 and compare the digests with `crypto.timingSafeEqual`, so length differences and early mismatches do not leak. Compare against both accepted values without stopping at the first match.
- **Guessing.** A 48-character alphanumeric value cannot be guessed online. Each guess costs the owner one Lambda invocation, so the cost of a flood is the same as any unauthenticated flood. The platform's optional WAF rule rejects earlier.
- **The mismatch refresh is caller-triggerable.** A direct caller can make a container call Secrets Manager by sending a wrong value. The cooldown (one forced refresh per 60 s per container, D19) bounds this, and a missing header does not trigger it. The refresh only reloads the same secret, so it gives the caller no information: the response is `unverified` either way.
- **Log hygiene.** The unverified line carries a fixed token and a reason code only: no header value, no secret name, no address. `sanitize()` is not a safe way to log the header (C4), so the documentation says never to log it, as the platform documentation does. Application code that logs `event` or `getClientHeaders()` outside `sanitize()` prints the full value.
- **Availability coupling.** A Secrets Manager outage after the value is cached does not break verification, because a failed refresh keeps the old value. A cold start during an outage cannot load the secret, so with enforcement on the function rejects traffic until the read succeeds. That is the fail-closed behavior the platform asks for.
- **Disclosure.** The issue describes a new defense, not an exploitable weakness. The only weakness found, partial masking in `sanitize()`, is minor and generic (Q8, F1). `.kiro/specs/` is published, so the plan records no account, endpoint, or distribution identifiers.

### 4.2 Software engineering

- **Placement.** AGENTS.md section 3.2 keeps AWS calls out of `ClientRequest` and section 3.4 puts non-public classes in `src/lib/utils/`. A new internal class there (working name `IngressVerifier`) owns the environment variable, the secret readers, and the comparison, like `ClientIpResolver` does for the address. `ClientRequest` calls it once in the constructor. It is not exported and not mentioned in `types/` or the public indexes (the existing `ClientIpResolver` test enforces that rule for the resolver).
- **Sync versus async.** Locked by Decision 1: synchronous read from the primed cache, with a static `ClientRequest.prime()` for applications that do not call `CachedParameterSecrets.prime()`.
- **Previous value.** Locked by Decision 2. Registration by name in `CachedParameterSecrets` was the obstacle; the internal reader registers under its own key.
- **A missing previous version must not be a failed refresh.** `needsRefresh()` is true whenever `cache.status < 0`, so a reader that records "not found" as a failure would call Secrets Manager on every request for a secret that was never rotated. The reader records "no previous version" as a successful, cached state (D16).
- **Backward compatibility.** Additive only: two new fields in `getProps().client` and `RequestInfo`'s client object, one new method, one new environment variable. No signature, default, `isValid()`, or `RESPONSE` change. Applications that compare the whole `client` object with a fixed shape would see the two new keys; a search of `test/request` found no such assertion in this repository.
- **Tests (Jest, `.jest.mjs`).**
  - Property tests: a header that is not the accepted secret never verifies; header-name case does not matter; either accepted value verifies; a non-string or array header never verifies; an unusable secret never verifies whatever the header holds. Generators must be safe by construction, and no `seed` option may be passed to `fc.assert` (test-execution-monitoring rules 9 to 11).
  - Unit tests (with fake timers) for the mismatch refresh: a mismatch starts one forced refresh of both readers; a second mismatch within 60 s starts none; a missing header never starts one; a request after the refresh sees the new values.
  - Unit tests: unset variable gives `direct` and the same `getProps()` as 1.4.1 apart from the two fields; secret unreadable; secret not primed; empty and placeholder values; invalid variable value; rotation (previous accepted, older rejected); the unverified line has no secret, header value, or address and appears once per request; the `RESPONSE` line still has 13 fields.
  - Existing tests: none are expected to change, but `test/request/client-request-tests.jest.mjs` and the `getProps()` consumers need a run (Section 5).
- **Documentation.** JSDoc for the new method and for any new class in `src/lib/tools` is machine-checked by `test/documentation`; `src/lib/utils` is not. `npm run lint:ci` fails on the repository baseline, so new files must lint clean on their own.
- **Naming.** New names follow the conventions: `CACHE_DATA_INGRESS_SECRET_NAME` (environment variable, as the issue gives it), `isIngressVerified()`, `IngressVerifier`, reason codes in kebab-case.

### 4.3 Cloud engineering

- **Topology.** CloudFront adds the header on every origin request; API Gateway (REST, Regional or edge-optimized) passes it into the Lambda proxy event; a direct call to `execute-api` has no header. The platform rewrites 403 and 404 to its landing page with 200 when a static origin exists, so enforcement answers `401`.
- **Infrastructure in this repository.** None. The example templates under `docs/00-example-implementation/` get no change; the documentation names the environment variable and the permission instead. The permission is `secretsmanager:GetSecretValue` on the one secret (current and previous versions use the same action), plus `kms:Decrypt` when the secret uses a customer-managed key.
- **Stages.** The secret name includes `StageId`, so each stage has its own secret. Set the variable only on stages whose distribution has `ApiOriginProtection="true"`; a stage with no distribution header would reject everything once enforced.
- **Staged rollout.** Because reporting is separate from rejection, a function can report `unverified` lines for a while before the handler enforces. This matches the platform's deployment order, which enables enforcement last. Rollback is removing the variable.
- **Cost and quotas.** Secrets Manager charges $0.05 per 10,000 API calls (US commercial price, [AWS pricing](https://aws.amazon.com/secrets-manager/pricing); multiple 2026 sources agree) against $0.40 per secret per month. Each warm container makes two `GetSecretValue` calls (current and previous) per refresh interval; the extension cache does not reduce this once the interval is 300 s or more. For 50 warm containers around the clock: about $4.30 a month at 300 s, $1.44 at 900 s, $0.36 at 3600 s. Real figures are lower because containers recycle. The default is 3600 s (Decision 9). The mismatch refresh adds at most two calls per container per minute while a caller keeps sending wrong values: about $0.43 a month per container, $22 for 50 containers, under a sustained attack only (the attack's own Lambda invocations cost more). The unverified line adds one log line per direct request, on top of the existing `RESPONSE` line.
- **Observability.** The fixed token supports a metric filter and an alarm, which is what the platform asks for ("count rejections").
- **Rotation.** Runbook order matters (Section 6.3): the new cache-data version must be deployed first (platform step 1), the function caches should refresh between the `put` and the stack update (a container that has not refreshed heals itself on its first mismatch), and a second rotation before the distribution updates leaves the distribution on a value that is neither current nor previous.

## 5. Gaps and observations

| # | Gap or observation |
|---|--------------------|
| G1 | The issue does not say how a synchronous constructor gets an asynchronously loaded secret. Resolved: Decision 1 |
| G2 | "Previous secret value" has no source in the code or in the issue. Resolved: Decision 2 |
| G3 | The platform runbook has no wait between putting the new value and updating the stack, but function caches can hold the old current value for the refresh interval plus up to 300 s. Resolved by the mismatch refresh (Decision 9) and the procedure in Section 6.3; the platform runbook gap is spun off (Decision 8, F2) |
| G4 | `isIngressVerified()` is undefined for `direct`. Resolved: Decision 5 |
| G5 | The empty and placeholder cases are listed as open points. Resolved: Decision 3 |
| G6 | The log line's token is listed as an open point; its level, frequency, fields, and the moment it is written are not defined. Resolved: Decisions 6 and 10 |
| G7 | The issue does not define behavior for an invalid `CACHE_DATA_INGRESS_SECRET_NAME` value. Decided in Section 6.2 (D5) |
| G8 | The issue does not define the header value type. REST events give a string; anything else is `unverified` (D4) |
| G9 | `sourceIp` is an edge address on an edge-optimized API behind your own CloudFront (O3). The documentation says so next to the field |
| G10 | The 1.4.1 documentation, CHANGELOG Security entry, and draft advisory name WAF and authorizers as the only fix. This feature adds a third option (D8, D9) |
| G11 | Affected files: `src/lib/utils/` (new class), `ClientRequest.class.js`, `RequestInfo.class.js` (`sourceIp`), `types/lib/tools/index.d.ts`, `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md`, `CHANGELOG.md`, tests under `test/request/` |

## 6. Proposed approach

### 6.1 Shape

1. **`IngressVerifier`** (internal, `src/lib/utils/IngressVerifier.class.js`).
   - Reads `CACHE_DATA_INGRESS_SECRET_NAME` on each call and caches the parsed result by raw value, like `ClientIpResolver`. Unset or empty means not configured.
   - Owns two readers, current (`AWSCURRENT`) and previous (`AWSPREVIOUS`), private subclasses of `CachedSecret` registered under their own keys (Decision 2). Both are registered with `CachedParameterSecrets` as soon as the variable is set, so `CachedParameterSecrets.prime()` loads them (Decision 1).
   - Reads `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` for the refresh interval (Decisions 4 and 9; default 3600).
   - On a mismatch (a header is present and differs from both values) it starts a forced, non-awaited refresh of both readers, at most once per 60 s per container (D19). The request that triggered it is still `unverified`.
   - `prime()` primes both readers and resolves `true` when nothing is configured or the current value loaded, `false` otherwise; it never rejects (D15).
   - `evaluate(headers)` is synchronous and returns `{ ingress, reason }`. It does the digest comparison against both values.
   - Logs one error per failure episode, not per request (D10).
2. **`RequestInfo`**: `_clientRequestInfo` adds `sourceIp` (a non-empty string from `identity.sourceIp`, else `null`).
3. **`ClientRequest`**: the constructor adds `client.ingress` from `IngressVerifier.evaluate`. A new public static `ClientRequest.prime()` calls `IngressVerifier.prime()`. `isIngressVerified()` is strict (Decision 5). When the result is `unverified` it writes one `INGRESS_UNVERIFIED` log line (Decisions 6 and 10). `isValid()`, `getValidationReason()`, and the `RESPONSE` line do not change.
4. **Documentation, types, CHANGELOG**: a new "Ingress verification" subsection next to the "Origin lock" warning in `docs/features/tools/README.md` (setup, priming requirement with both ways to prime, IAM, the rotation procedure of Section 6.3, reason codes, 401 guidance, the `sanitize()` limits), an updated warning there, `isIngressVerified()` and `ClientRequest.prime()` in `types/lib/tools/index.d.ts`, and an "Added" entry under v1.4.1.
5. **Observations**: one new row in `docs/cloudfront-notes/README.md` for the origin-header overwrite (D7).

Alternatives not chosen:

- Doing the check in a Lambda authorizer or WAF only. Both stay valid and are documented, but they need infrastructure per application and the issue asks for a function-level signal.
- Adding the check inside `ClientRequest` directly. It would put AWS secret handling in a request class (AGENTS.md 3.2).
- Rejecting inside `ClientRequest` (making `isValid()` false). The issue keeps the status and body in the application, and it would change behavior for every enforcing application at once.

### 6.2 Further decisions recorded in this plan

| # | Decision | Reason |
|---|----------|--------|
| D1 | Target release is v1.4.1 | The spec was moved to the `1-4-1-` prefix; npm `latest` is 1.4.0; 1.4.1 already adds `Response.setBodyToNull()` and `CACHE_DATA_TRUSTED_PROXY_HOPS` |
| D2 | Header name is fixed as `X-Atlantis-Origin-Secret` and matched case-insensitively | The issue fixes it; `RequestInfo` lowercases keys |
| D3 | The whole `SecretString` is the value, compared exactly, with no JSON parsing and no trimming | The platform generates a plain string and the template puts the whole `SecretString` in the header |
| D4 | The header must be a single string. An array, a non-string, or a missing header is `unverified` | A value that is not a plain string cannot be the secret |
| D5 | A set `CACHE_DATA_INGRESS_SECRET_NAME` that fails the secret-name allowlist (`ParameterKeySafety.checkSecretName`) or exceeds 2048 characters is `unverified` with reason `bad-configuration`, one error logged. Unset or empty (after trimming) is `direct` | Garbage must not silently disable the check. Empty must be usable to turn it off from a template condition |
| D6 | `sourceIp` is a non-empty string from `requestContext.identity.sourceIp`, else `null`, with no IP validation | The resolver returns `sourceIp` unchanged in its last step |
| D7 | Record one observation (O9) in `docs/cloudfront-notes/README.md`: a distribution's origin custom header overwrote a viewer-sent header of the same name on Regional and edge-optimized REST APIs; AWS documents it; measured 2026-11-09, source atlantis-sam-templates #10 | The notes page exists for exactly this. The evidence was gathered by the maintainer, so the row cites that source instead of claiming a new measurement |
| D8 | CHANGELOG is add-only: one entry under "Added" for v1.4.1; the existing Security entry is not edited | It is not false, only incomplete. The repository convention forbids editing existing text |
| D9 | Add one line to the draft `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` workaround text naming `CACHE_DATA_INGRESS_SECRET_NAME` as an application-level option | The advisory is published with 1.4.1, the same release |
| D10 | A read failure logs one error per failure episode (until a read succeeds), not one per request | Under an outage a per-request error floods the log |
| D11 | No `getClientSourceIp()` or `getClientIngress()` on `RequestInfo`; the values are in `getProps().client` as the issue specifies | Not requested |
| D12 | `getProps()` stays untyped in `types/`; only `isIngressVerified()` is added | Typing the whole props shape is a separate change (Section 7, F3) |
| D13 | REST (payload v1) events only, like the rest of `ClientRequest` | HTTP API support is a known gap (Section 7, F4) |
| D14 | The unverified line is written at construction whether or not the application enforces | Supports a monitor-first rollout |
| D15 | `ClientRequest.prime()` (Decision 1) is static, takes no arguments, and returns `Promise<boolean>`: `true` when no secret is configured or the current value loaded, `false` when a configured secret could not be loaded. It never rejects. A missing previous version is not a failure. It is idempotent with `CachedParameterSecrets.prime()` | Same name and shape as the other `prime()` methods in the package (`CachedParameterSecrets.prime()` resolves a boolean) |
| D16 | A missing `AWSPREVIOUS` version is recorded as a successful, cached "no previous version" state, logged at debug level, and re-checked only when the refresh interval expires. Any other previous-version failure is a warning, one per failure episode | A failure status makes `needsRefresh()` true on every request (Section 4.2) |
| D17 | `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` must be an integer from 60 to 86400. Anything else logs one warning and uses the default | Mirrors `CACHE_DATA_TRUSTED_PROXY_HOPS`. A very low value would call Secrets Manager on nearly every request |
| D18 | Decision 7's check also covers detaching the `AWSPREVIOUS` label, which is how the old value is retired early (Section 6.3) | Same temporary secret, one more command |
| D19 | Mismatch refresh (Decision 9): triggered only when the header is a single string that matches neither value; not by a missing header, a non-string header, `secret-not-primed`, or an unusable secret. It forces `refresh()` on both readers (not `prime()`, which skips unexpired values), is not awaited, and is limited to one start per 60 s per container (a fixed constant, not a setting). The cooldown is measured from the last start | A missing header means a direct call, which a reload cannot fix. A forced refresh also picks up an `AWSPREVIOUS` version created after the container cached "no previous version" |
| D20 | The documentation tells applications to send `Cache-Control: no-store` with the `401` | CloudFront can cache a 4xx briefly, which would repeat one rejected request to other viewers. atlantis-starter-02 #14 already plans it |

### 6.3 Rotation procedure (documentation content)

Three places hold a copy of the secret, and each changes at a different time. Let R be the refresh interval (`CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS`).

| Where | What it holds | When it changes | Delay |
|-------|---------------|-----------------|-------|
| Secrets Manager | Versions labeled `AWSCURRENT` and `AWSPREVIOUS` | `put-secret-value` moves the label: new is current, old becomes previous | Immediate |
| CloudFront distribution | The `AWSCURRENT` value at the last stack update (versionless dynamic reference) | A stack update with a changed `ApiOriginSecretRevision` | About one to two minutes to `Deployed` (platform measurement) |
| Each warm Lambda container | A copy of current and of previous | Its next `prime()` after R seconds. With the extension layer, the value may also be up to 300 s old | Up to R + 300 s |

Order of steps:

1. Deploy this version with `CACHE_DATA_INGRESS_SECRET_NAME` set and confirm the secret loads (platform step 1).
2. Put the new value. Secrets Manager: current is new, previous is old. The distribution still sends old. Containers still hold current = old, which matches, and then refresh to current = new, previous = old, which also matches.
3. Wait at least R + 300 s (65 minutes at the default), plus a margin, so every warm container has refreshed on its own and no request is rejected. This is the step the platform runbook does not have. Waiting is recommended, not required: see the next paragraph.
4. Update the network stack with a changed `ApiOriginSecretRevision`. The distribution switches to new over one to two minutes. During the switch both values reach the function, and both are accepted.
5. Wait until the distribution is `Deployed`, plus a margin.
6. Retire the old value: detach the `AWSPREVIOUS` label (command confirmed by V1) or wait for the next rotation. Containers stop accepting the old value after up to R + 300 s.

Do not put a second new value before step 4 finishes: the distribution would then send a value that is neither current nor previous. If the stack update runs before step 3 completes, a container that has not refreshed rejects the new header once, and that mismatch starts a forced refresh (Decision 9, D19). Requests that arrive before the refresh finishes are rejected too. Without the extension layer the container then holds the new values within seconds, and a further mismatch cannot start another refresh for 60 s. With the layer, the extension may still return its cached copy, which is at most 300 s old, so the container can need further mismatches (one refresh per 60 s) and corrects itself within about 6 minutes. Compared with 65 minutes without the mismatch refresh, a skipped wait costs minutes of rejected requests, not an hour.

The mismatch refresh does not shorten step 6: a retired value keeps matching the cached previous copy, so no mismatch occurs to trigger a reload.

Suspected leak: put the new value, detach `AWSPREVIOUS`, make the functions start fresh containers (publish a new version or change any setting), then update the stack. Legitimate traffic is rejected from the moment the containers restart until the distribution switches, about one to two minutes. The interval does not delay revocation in this path.

Effect of R: the cost scales with 1/R (Section 4.3), and the wait in step 3 and the delay before a retired value stops working scale with R. The outage window after a skipped wait does not, because of the mismatch refresh. A busy stage that rotates often can lower R with `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS`.

## 7. Related improvements

| Item | Class | Rationale | Effort | Risk |
|------|-------|-----------|--------|------|
| F1. `sanitize()` prints the tail of a secret and masks nothing after a character outside `a-z 0-9 + _ : . - /` (C4) | Spin off, confirmed (Decision 8): ISSUE.md-only spec under `1-4-2-` | Generic; affects any `key`, `secret`, `token`, or `Authorization` value with `=` padding or punctuation. Not needed here because the platform secret is alphanumeric | M | Med (regex, ReDoS limits, existing tests) |
| F2. atlantis-sam-templates `docs/end-user/api-ingress-standard.md` rotation steps have no wait for function caches | Spin off to another repository, confirmed (Decision 8): GitHub issue in `63Klabs/atlantis-sam-templates`, label `enhancement`, filed after this plan locks | The wait comes from the application's cache, which the template documentation cannot see | S | Low |
| F3. `types/lib/tools/index.d.ts` declares no `getProps()` | Note only | Predates this issue | S | Low |
| F4. `ClientRequest` reads REST events only; an HTTP API event has no `identity.sourceIp` | Note only | Already recorded in `1-4-1-trusted-client-ip` as its F4 | L | Med |
| F5. A failing secret refresh is retried on every `prime()` | Note only | Existing behavior for all cached secrets; the verifier inherits it | M | Low |
| F6. Ingress verification documentation in `docs/features/tools/README.md`, the CloudFront notes row, the advisory line, and the CHANGELOG entry | Include | Part of the feature | S | Low |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| An application that never primes secrets rejects every request once it enforces | Distinct reason `secret-not-primed` in the log line; the documentation makes priming a numbered setup step (Q1) |
| A cold start can reject its first requests if priming is skipped, and CloudFront caches 4xx errors briefly by default | Same as above; the documentation tells enforcing applications to prime before handling |
| A rotation rejects legitimate traffic while function caches hold the old current value | The mismatch refresh (Decision 9, D19) limits it to a few minutes; the documented wait of R + 300 s between the `put` and the stack update avoids it; `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` lets an application shorten R; cross-repository note to the platform runbook (Decision 8, F2) |
| The mismatch refresh lets a direct caller trigger Secrets Manager calls | Fixed 60 s cooldown per container; a missing header never triggers it; about $0.43 a month per container under a sustained attack (Section 4.3); the platform's optional WAF rule stops such requests earlier |
| With the layer, a forced refresh can return the extension's cached copy (up to 300 s old) | Documented; the container corrects itself within about 6 minutes. `SECRETS_MANAGER_TTL` can be lowered for functions that rotate often |
| A second rotation before the distribution updates leaves it on a value that is neither current nor previous | Documented: update the distribution after every `put` |
| Secret tail shown by `sanitize()` in debug logs | Document "never log the header"; F1 |
| Application code echoes headers | Documented; the package never returns headers except through `getClientHeaders()` and `toObject(true)` |
| Log volume doubles during a direct flood | One short line, kept per request for an exact rejection count (Decision 6); the platform's WAF rule is the earlier layer |
| `AWSPREVIOUS` read errors create log noise on a secret that was never rotated | Treat a missing previous version as normal and log at debug level (D16; V1 fixes the exact error shapes) |
| A "not found" previous version recorded as a failed refresh makes every request call Secrets Manager | D16: record it as a successful, cached state. A unit test asserts that a never-rotated secret causes no refresh before the interval expires |
| Priming is skipped in an application that uses neither `CachedParameterSecrets.prime()` nor `ClientRequest.prime()` | The `secret-not-primed` reason and error line; the documentation shows both ways to prime (Decision 1) |

## 9. Locked decisions

Section 6.2 lists further decisions made in this plan without asking (D1 to D18).

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | (Q1, option C) The check reads the primed secret synchronously in the constructor. The verifier registers its readers with `CachedParameterSecrets` as soon as `CACHE_DATA_INGRESS_SECRET_NAME` is set, so `CachedParameterSecrets.prime()` loads them. A new public static `ClientRequest.prime()` primes only the ingress secret, for applications that do not use `CachedParameterSecrets`. An unloaded secret gives `unverified` with reason `secret-not-primed` and one error naming both fixes. Contract details in D15 | `ingress` must exist right after construction (the issue's contract). The starter's priming could not be confirmed, so a one-line static method gives applications a path that does not depend on `CachedParameterSecrets` |
| 2 | (Q2, option A) Previous value is `AWSPREVIOUS`, current is `AWSCURRENT`. Both are read by private subclasses of `CachedSecret` in `src/lib/utils/`, each registered under its own key. A missing previous version is normal (D16). No change to the public `CachedSecret` | Matches how the template resolves the header and how Secrets Manager moves labels; no public API growth |
| 3 | (Q3, option A) A secret value that is empty, whitespace-only, or `BLANK` (any case) is unusable: always `unverified`, reason `secret-unusable`, one error logged | Covers the issue's two named cases without a new rule |
| 4 | (Q4, option B) Add `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` so an application can set the refresh interval. Range and invalid-value handling in D17. The default is 3600 s (Decision 9). Rotation procedure and the recommended wait: Section 6.3 | The user wants control over the interval and questioned whether 5 minutes is needed for a rarely rotated secret |
| 5 | (Q5, option A) `isIngressVerified()` is strict: `true` only when `ingress` is `cloudfront`. `direct` returns `false` | A guard that fails loudly beats one that fails open. Applications enforce only where they set the variable, as atlantis-starter-02 #14 plans |
| 6 | (Q6, option A) One log line per unverified request, written with `DebugAndLog.log` (the `RESPONSE` channel), compact JSON `{"reason":"<code>"}`. Codes: `missing-header`, `mismatch`, `secret-not-primed`, `secret-unavailable`, `secret-unusable`, `bad-configuration`. No address, header value, or secret name. The token must not start with `ORIGIN`: the user pointed out it can be confused with the `Origin` request header and a CloudFront origin. Token: Decision 10 | Exact count for a metric filter; the platform asks applications to count rejections |
| 7 | (Q7, option A) At the start of implementation, run V1 on one temporary secret in the test account (`--profile release`, `us-east-2`): create, read `AWSPREVIOUS` before and after a second put, delete with `--force-delete-without-recovery`. D18 adds the label-removal command, which I will confirm before running. If the SSO token has expired I will ask rather than retry | The code can then tell "never rotated" from "read failed" |
| 8 | (Q8) F1 (`sanitize()` partial masking): create an ISSUE.md-only spec under `1-4-2-`. F2 (platform runbook has no wait for function caches): file a GitHub issue in `63Klabs/atlantis-sam-templates` with label `enhancement`. Both created 2026-11-10 after the plan locked: F1 as [`1-4-2-sanitize-masks-only-part-of-a-secret-value`](../1-4-2-sanitize-masks-only-part-of-a-secret-value/ISSUE.md), F2 as [atlantis-sam-templates #11](https://github.com/63Klabs/atlantis-sam-templates/issues/11) (no duplicate found in a search of all states) | Separable from this change |
| 9 | (Q9, option D) The default for `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS` is 3600 s, plus a mismatch refresh: a header that matches neither value starts a forced, non-awaited refresh of both readers, at most once per 60 s per container. Rules in D19 | 3600 s cuts calls by 12 times against 300 s (about $0.36 a month for 50 busy containers). The mismatch refresh removes the hour-long outage window after a skipped wait, at the cost of a bounded, caller-triggerable Secrets Manager call (Section 4.1, Section 8) |
| 10 | (Q10, option A) The log token is `INGRESS_UNVERIFIED` | Matches the `client.ingress` field and the platform's "ingress standard" wording. Avoids the `Origin` header, CloudFront origin, and `sourceIp` confusions |
| U1 | (User, 2026-11-10, after requirements.md was written) The package's own names use "ingress", never "origin", because "origin" already means the `Origin` request header and a CloudFront origin (API Gateway or S3). Renamed: `OriginVerifier` to `IngressVerifier` (file `IngressVerifier.class.js`); `isOriginVerified()` to `isIngressVerified()`; `CACHE_DATA_ORIGIN_SECRET_NAME` to `CACHE_DATA_INGRESS_SECRET_NAME`; `CACHE_DATA_ORIGIN_SECRET_REFRESH_SECONDS` to `CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS`; the documentation subsection "Origin verification" to "Ingress verification". One name each, no alias. Applied in PLAN.md, requirements.md, and the `1-4-2-sanitize-...` ISSUE.md. Not changed: the imported ISSUE.md of this spec, and names that belong to other systems or to AWS (`X-Atlantis-Origin-Secret`, `ApiOriginProtection`, `ApiOriginSecretRevision`, `<Prefix>-<ProjectId>-<StageId>-OriginSecret`, the existing "Origin lock" heading, CloudFront "origin request" and "origin custom header") | Removes the ambiguity the user found, consistently with the `INGRESS_UNVERIFIED` token (Decision 10). The rename is cheap because nothing is implemented yet |

## 10. Open questions and recommendations

No open questions.
