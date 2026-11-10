# Docs: a CACHE_DATA_TRUSTED_PROXY_HOPS value that is too high is not fail-safe; Regional APIs need 0

> **Status**: Locked 2026-11-09. All questions (Q1 to Q5) answered and U1 recorded; the runtime check for Q1 was run the same day. Requirements are in [requirements.md](requirements.md) and the design in [design.md](design.md), and the task list in [tasks.md](tasks.md).
> **Issue**: [ISSUE.md](ISSUE.md) (GitHub issue [#253](https://github.com/63Klabs/cache-data/issues/253))
> **Reviewed against**: `dev` at `f746cde` on 2026-11-09
> **Release**: v1.4.1 (unreleased; `package.json` is 1.4.1, npm `latest` is 1.4.0)

## 1. Summary

The v1.4.1 documentation and the `ClientIpResolver` class comment say that a `CACHE_DATA_TRUSTED_PROXY_HOPS` value that is too high is safe because resolution "falls through to `identity.sourceIp`". That holds only when the `X-Forwarded-For` header has fewer entries than the count. A client can add entries, so a count that is too high selects an entry the client wrote. A count that is too low selects one of your own proxies, which is safe. The same paragraph names the unsafe condition backwards. Running the resolver on the issue's table confirms every row (Section 2, C1 to C4).

The issue's second claim is also confirmed. On 2026-11-09 a temporary test stack showed that on a Regional REST API `identity.sourceIp` is the true viewer address, directly and through your own CloudFront, and that forged `X-Forwarded-For`, `Forwarded`, `X-Real-Ip`, and `CloudFront-Viewer-Address` values do not change it (Section 3.1). This resolves the conflict with a 2020 AWS re:Post answer, which says otherwise for Regional endpoints.

The user chose to change the default from `2` to `0` in this spec (Q2 = B). With the default at `0`, honest-traffic results are unchanged in every topology and the default is forgeable in none. Only an edge-optimized API behind your own CloudFront needs a value (`3`). The change is made before 1.4.1 publishes, so no released behavior changes.

The work: correct the safety statement everywhere it appears, rewrite the scenario guidance around "use `0` wherever `sourceIp` is the viewer", change the default constant and the existing tests that assert it, and keep the documentation set (README, JSDoc, types, CHANGELOG, draft advisory) consistent. No new tests are added (Q3 = D).

Measurement also showed that CloudFront's managed `AllViewerExceptHostHeader` policy forwards `CloudFront-Viewer-Address`, which the README says it does not. That statement is corrected in the same pass (Section 5, G9).

The user also asked (U1) for a place in the documentation that records these observations about CloudFront and API Gateway behavior, because more features for deployments behind CloudFront are planned and each rests on observed behavior. The plan adds `docs/cloudfront-notes/README.md` (Section 6.5), with each observation dated, its method stated, and a label saying whether AWS documents it.

## 2. Assessment of the issue

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | Docs say a count that is too high is fail-safe because it "falls through to `identity.sourceIp`" | Confirmed | `docs/features/tools/README.md:1110`; `src/lib/utils/ClientIpResolver.class.js:38-42` ("Fail-safe direction: a hop count that is too high falls through...") |
| C2 | The same paragraph names the unsafe condition backwards ("unless the count is lower than the real number of proxies") | Confirmed | Same two places. A lower count selects only entries to the right of the client's entries, and proxies wrote those. Probe in C3 |
| C3 | The issue's three-row table (counts 2, 3, 1 on `192.0.2.1, 198.51.100.10, 203.0.113.30`) | Confirmed | Ran `ClientIpResolver.resolve` on that header with `sourceIp` `203.0.113.30`: count 1 gives `203.0.113.30`, 2 gives `198.51.100.10`, 3 gives `192.0.2.1`. Count 4 gives `sourceIp` (the header has 3 entries) |
| C4 | A too-high count falls through only when the header is shorter than the count | Confirmed | `ClientIpResolver.selectForwardedFor` returns no entry when `entryCount < trustedProxyHops`. With a real chain of length R, a count of R + k, and p client-written entries: the selected entry is client-written when p >= k, and the result is `sourceIp` when p < k |
| C5 | The statements appear in `docs/features/tools/README.md` and the class comment | Partially confirmed | Those two hold the wrong claim. Other places state the guidance the issue changes: Section 5, G3 |
| C6 | On a **Regional** REST API, `identity.sourceIp` is the true viewer address, direct or through CloudFront, and forged headers do not change it | **Confirmed by re-measurement** (2026-11-09, Q1) | Section 3.1: R1 and R2. Controls R3 and R4 reproduced the earlier edge-optimized results |
| C7 | On an edge-optimized API behind your own CloudFront, `sourceIp` is an edge address | Confirmed | Sibling spec Round 4, and re-measured as R4 |
| C8 | `0` is correct for an edge-optimized API with no CloudFront of your own | Confirmed | Sibling spec Round 4 (two APIs), and re-measured as R3 |
| C9 | AWS describes the rule in a re:Post answer and a re:Post article | Partially confirmed | The answer ([re:Post](https://www.repost.aws/zh-Hans/questions/QU-xMNlCuTT5m6fL60GYEcgg/what-does-the-x-forwarded-for-note-in-the-docs-mean), 2020) contains the quoted sentence, but says that for a Regional endpoint the last `X-Forwarded-For` entry becomes `sourceIp`. R1 shows that does not happen today. The article ([re:Post](https://www.repost.aws/articles/AR5xIMzCMiSUqyMKCy2qDv9Q/waf-client-ip-based-rules-work-even-for-edge-optimized-api-gateway-and-cognito-with-custom-domain)) covers AWS-managed CloudFront, not your own. Neither is cited in the documentation (Q4 = A) |
| C10 | The current default of `2` is forgeable on a Regional raw URL | Confirmed | Unit test at `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs:79`; README:1126; CHANGELOG:18 |
| C11 | An edge-optimized API behind your own CloudFront needs `3`, which is forgeable on the API's raw URL unless the origin is verified | Confirmed | README "Origin lock" section; sibling PLAN.md Section 4.1. On the raw URL the chain is `[..., D, M]`, so `3` selects a client entry whenever the client adds one |
| C12 | One count cannot be correct for both paths when an edge-optimized API sits behind your own CloudFront | Confirmed | Through the distribution the chain has one more entry than on the raw URL (R4 versus R3) |
| C13 | `0` is correct for three of the four topologies and forgeable in none | Confirmed | T1 by R3, T2 by R4 (returns the edge address, not forgeable), T3 by R2, T4 by R1 |
| C14 | A unit test should record the current behavior for a padded chain above the real count | Declined by the user | Q3 = D. One such case already exists for T4 (C10) |
| C15 | The resolver's behavior does not change | Changes | Q2 = B changes `DEFAULT_TRUSTED_PROXY_HOPS` to `0` |
| C16 | (Found during measurement) The AWS managed `AllViewerExceptHostHeader` origin request policy does not forward `CloudFront-Viewer-Address` | **Not confirmed** | R2: the header reached the Regional API through a distribution using that policy, holding the real viewer address, even when the viewer sent a forged value. AWS documents the policy as including "additional CloudFront request headers for HTTP protocol, HTTP version, TLS version, and all device type and viewer location headers" ([AWS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)) |

## 3. Current state

- **Resolver.** `ClientIpResolver.resolveDetailed` (`src/lib/utils/ClientIpResolver.class.js`) tries `CloudFront-Viewer-Address` when the count is 2 or more, then the `X-Forwarded-For` entry at index `length - N`, then `identity.sourceIp`. It returns nothing from the header step when `N < 1` or the header has fewer than `N` entries. Called from `RequestInfo._clientRequestInfo()` (`RequestInfo.class.js:347`).
- **Why the default is 2.** Locked decision U4 of spec `1-4-1-trusted-client-ip`: the default describes an edge-optimized API with no CloudFront of your own. That spec's own plan already stated the right rule ("A hop count that is too high is forgeable; too low is only wrong", `PLAN.md` Section 4.1). The README and the class comment contradict it. Q2 = B supersedes U4 (Section 9).
- **Published state.** `npm view @63klabs/cache-data dist-tags` shows `latest` 1.4.0. The wrong statement has not shipped. The tag `v1.4.1` exists on `origin` at `14acac0` (the version bump), one commit before the implementation commit `f746cde` (Section 7, N1).
- **Draft security advisory** for v1.3.11 to v1.4.0 lives in `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`. The maintainer publishes it at release. It tells T4 users to set `1` and T3 users to keep `2`.
- **Related direction in the Atlantis repositories.** [atlantis-starter-02 #14](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/issues/14) ("Regional API behind CloudFront, `CACHE_DATA_TRUSTED_PROXY_HOPS=0`, origin secret") and atlantis-sam-templates #10 (an "ingress standard" recommending a Regional API behind the distribution) cite this issue. Both rest on C6, which is now verified. #9 (forward `CloudFront-Viewer-Address`) is closed on the same premise.
- **Issue #254** (origin secret, sibling spec `1-4-1-clientrequest-report-whether-a-request-came`, ISSUE.md only) also relies on C6.

### 3.1 Re-measurement, 2026-11-09 (Q1)

Method: one temporary CloudFormation stack in the test account, `us-east-2`. Two REST APIs (one Regional, one edge-optimized), each with a mock integration whose response template returns `$context.identity.sourceIp`, the `X-Forwarded-For` header, and the `CloudFront-Viewer-Address` header, and one CloudFront distribution in front of each (managed `CachingDisabled` cache policy and managed `AllViewerExceptHostHeader` origin request policy, HTTPS-only to the origin). Requests came from one client address with these headers: none; `X-Forwarded-For: 192.0.2.1`; `X-Forwarded-For: 192.0.2.1, 192.0.2.2`; and `X-Forwarded-For` plus `Forwarded: for=192.0.2.3`, `X-Real-Ip: 192.0.2.4`, and `CloudFront-Viewer-Address: 192.0.2.5:1234`. The stack was deleted afterwards; a check found no remaining stack, API, or distribution. Account, endpoint, and distribution identifiers are not recorded here.

| Case | Path | `sourceIp` in all four header variants | `X-Forwarded-For` seen by the API (forged entries first) | `CloudFront-Viewer-Address` seen by the API |
|------|------|----------------------------------------|----------------------------------------------------------|----------------------------------------------|
| R1 | Regional, direct (T4) | The client. Never a forged value | `[forged..., client]` (API Gateway appends the peer) | Passed through unchanged when the client sent one |
| R2 | Regional through your own CloudFront (T3) | The client (the viewer), not the CloudFront edge | `[forged..., client, edge]` | The real viewer address and port. A viewer-sent forged value was replaced |
| R3 | Edge-optimized, direct (T1, control) | The client | `[forged..., client, managed-edge]` | Absent, also when the client sent one |
| R4 | Edge-optimized through your own CloudFront (T2, control) | An edge address, not the client | `[forged..., client, edge, managed-edge]` | Absent, also when the client sent one |

R3 and R4 match the 2026-11-04 capture of the sibling spec, so the harness is sound, and R1 and R2 can be trusted. Limits: the API under test returned `$context.identity.sourceIp` from a mock integration, not from a Lambda proxy event (the same API Gateway field); one client address; IPv4 only.

## 4. Review

### 4.1 Security

- **The correction closes a documentation hazard, not a code defect.** A reader who set a count one too high because "too high is safe" gets a client-chosen address. It has not shipped.
- **The premise for `0` on Regional is verified** (C6) but undocumented by AWS behind your own CloudFront. The documentation labels it as observed behavior with its date, as it already does for the `CloudFront-Viewer-Address` drop. AWS can change an undocumented behavior; `0` then needs a re-check.
- **`0` is the safest failure mode.** It has no topology to miscount and cannot select a client-written entry unless `sourceIp` itself is client-influenced, which R1 to R4 show it is not. An invalid environment value now also resolves to `0`, which is fail-safe (previously `2`, which is forgeable on Regional).
- **Residual forgeable paths after this change:** T2 with a value of `3` on the raw `execute-api` URL (closed only by an origin lock; README "Origin lock"). Unchanged by this plan.
- **R1 shows `CloudFront-Viewer-Address` passes through on a Regional API with no CloudFront**, as the sibling capture found. With the default at `0` the header is not read, so this is no longer exploitable at the default.
- **Disclosure.** `.kiro/specs/` is pushed to GitHub and excluded from the npm package. The plan adds nothing beyond the issue, AWS documentation, and test-net addresses. No account or endpoint identifiers are recorded.

### 4.2 Software engineering

- **Correct wording (draft for the README paragraph):** see Section 6.1.
- **Default change.** `DEFAULT_TRUSTED_PROXY_HOPS` is one constant. The warning text (`Using the default of ${DEFAULT_TRUSTED_PROXY_HOPS}.` in `getTrustedProxyHops`) follows it. JSDoc text that says "2 when unset" does not and must be edited by hand.
- **Existing tests that assert the default of 2** must change or CI fails. Found by reading and a grep of `test/request/` (confirm with the full client-ip and request test directories when implementing):
  - `client-ip-resolver-unit-tests.jest.mjs`: the test that asserts `DEFAULT_TRUSTED_PROXY_HOPS` is 2 and resolves with the default (around lines 85 to 90).
  - `client-ip-resolver-config-tests.jest.mjs`: `EXPECTED_WARNING` and the inline warning text ("Using the default of 2."), the parse cases that expect `trustedProxyHops: 2`, the `getTrustedProxyHops()` cases that expect `2` for unset, empty, whitespace, and invalid values, and the debug-line case "reports the default hop count of 2".
  - `client-ip-resolver-property-tests.jest.mjs`: "Property 2: Fail-safe at the default" resolves a T2 chain with the default and expects the entry 2 from the right. It passes today only because the test passes `sourceIp: e`; its name and comment describe a behavior that no longer exists and are rewritten.
  - `request-info-client-ip-tests.jest.mjs` ("ignores a forged leftmost x-forwarded-for entry (T1 chain, default hop count)") and `request-info-forwarded-for-bug-exploration-tests.jest.mjs` (default-hop tests that expect the entry 2 from the right; its header comment already says "default 1", which is stale). These set no environment variable, so they now return `sourceIp`; each sets `CACHE_DATA_TRUSTED_PROXY_HOPS=2` explicitly or is rewritten for the new default.
  - `client-request-request-log-tests.jest.mjs` unsets the variable in `beforeEach`; check whether its expectations depend on the default.
- **No new tests** (Q3 = D). Updating the assertions above keeps AGENTS.md section 2.3 satisfied for the code change (Section 8).
- **Backwards compatibility.** No published API changes: 1.4.1 is unreleased. Versus 1.4.0, which returned the first `X-Forwarded-For` entry, the honest-traffic result is the same in every topology (Section 4.3).

### 4.3 Cloud engineering

- **Topologies and what each value returns** (all four rows measured; chains from Section 3.1):

  | # | Topology | Chain at Lambda | Correct count | `sourceIp` | Value `0` returns |
  |---|----------|-----------------|---------------|------------|-------------------|
  | T1 | Edge-optimized, no CloudFront of your own | `..., C, M` | 2 | `C` | `C` |
  | T2 | Your CloudFront to edge-optimized | `..., V, E, M` | 3 | `E` | `E` (wrong, not forgeable) |
  | T3 | Your CloudFront to Regional | `..., V, E` | 2 | `V` | `V` |
  | T4 | Regional, no CloudFront | `..., C` | 1 | `C` | `C` |

- **Default `0` versus default `2`, honest traffic:** T1, T2, T3 give the same result; T4 gives `C` instead of a forgeable value. In T2 the viewer-address step never applies (the managed edge drops the header, R4), so nothing is lost there. In T3 the step would return `V`, the same as `sourceIp`.
- **Raw `execute-api` URL.** For a Regional API `sourceIp` is the true caller on the raw URL too (R1), so a request that skips your distribution cannot change the client address. The Atlantis origin lock (#254, #14) is then needed only to refuse such requests, not to protect the address.
- **Marker-check procedure** (README:1182) derives the count as "entries minus one". That is the chain length: correct for T2 (3), and a safe but unnecessary value for T1, T3, and T4, where `0` is preferred. The procedure needs a caution (G1).
- **Rollout and rollback.** A constant change plus documentation. Rollback is a package downgrade. Setting the variable overrides the default.
- **Observability.** The debug line (`ClientIpResolver: step=... trustedProxyHops=... xForwardedForEntries=...`) is unchanged; at the new default it reports `step=source-ip trustedProxyHops=0`.
- **No IaC or IAM change in this repository.** The verification stack was temporary and outside the repository.

## 5. Gaps and observations

- **G1. Marker check gives the chain length, not the safest value.** Add a caution: for a Regional API, or an edge-optimized API with no CloudFront of your own, use `0`; use the marker count only to confirm a T2 deployment's `3`.
- **G2. The "About `CloudFront-Viewer-Address`" section** says to forward the header for T2 and T3. R2 shows the header arrives through the managed policy for T3, and R4 shows the managed edge drops it for T2, so forwarding gives nothing in T2. With `0` the step is off anyway. The section is rewritten to match.
- **G3. Places that must stay consistent:**

  | File | Lines | Holds |
  |------|-------|-------|
  | `docs/features/tools/README.md` | 1092 | Note that the managed policy "does not forward `CloudFront-Viewer-Address`" (G9) |
  | | 1110 | Wrong fail-safe paragraph |
  | | 1119-1125 | Value table (default text; `1` for T4; `2` for T3) |
  | | 1126, 1128 | T4 warning ("set `1`"); "default fails safe for the other topologies" |
  | | 1136-1141 | Scenario table (Value, Effect of default, Source columns) |
  | | 1147-1153 | `CloudFront-Viewer-Address` section (the policy statement is at 1153) |
  | | 1182 | Marker check |
  | `src/lib/utils/ClientIpResolver.class.js` | 9, 33-42, 69, 103, 139-147 | Default constant and its comment; class comment (wrong paragraph; "Regional needs 1"); JSDoc "2 when unset" |
  | `src/lib/tools/RequestInfo.class.js` | 156-159, 176-177, 307-309 | JSDoc: "defaults to 2", "Regional API without CloudFront needs 1" |
  | `src/lib/tools/ClientRequest.class.js` | 26-27 | Class JSDoc: "default 2" |
  | `types/lib/tools/index.d.ts` | 1196-1199, 1215 | Same text as `RequestInfo` |
  | `CHANGELOG.md` | 15-18, 23, 28 | Security bullets ("default counts two proxies", "Regional ... set `1`"), the Added entry ("Defaults to `2`"), the own-CloudFront entry |
  | `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` | 75, 84-86, 135, 148, 166 | Draft advisory: default text, the T1 to T4 table, workaround list, action steps, limitations |

  `src/lib/tools` JSDoc is scanned by `test/documentation/`; `src/lib/utils` is not (memory: documentation tests scope), so write the resolver comment to the JSDoc standard by hand.
- **G4. README T2 and T3 rows** do not state the raw-URL consequence. With the default at `0` T3 has none (R1); T2 keeps it at `3`.
- **G5. T3 "Source" column** says "From AWS documentation; not measured". It becomes "Measured 2026-11-09".
- **G6. Issue #254's premise** is now verified. The owners of #254 and the Atlantis issues can proceed (N3).
- **G7. The issue's third open point** (cite re:Post or only the measurement) is decided (Q4 = A).
- **G8. The issue says "Edit the two places".** The correction touches two; the default change and guidance touch every row of G3.
- **G9. The README says the managed `AllViewerExceptHostHeader` policy does not forward `CloudFront-Viewer-Address`.** R2 contradicts it (C16). The claim appears in the ClientRequest note above "Client IP resolution" (line 1092) and in the "About `CloudFront-Viewer-Address`" section. The sibling spec's plan carried the same premise, and atlantis-sam-templates #9 was filed on it. Fix: say the policy forwards additional CloudFront headers, that the header arrived in the 2026-11-09 test, and that this is observed behavior.
- **G11. The changelog steering file says existing text "should NEVER be updated"** and that Kiro adds entries only; the developer reviews unreleased entries before release (`.kiro/steering/changelog-convention.md`). Three entries written by the sibling spec, all under `v1.4.1 (unreleased)`, become false once the default is `0`: line 16 ("The default counts two proxies"), line 18 ("Regional APIs without CloudFront stay forgeable until you set `...=1`"), and line 23 ("Defaults to `2` ... `1` for a Regional API ... uses `2`"). Section 6.4 had assumed they are edited in place. Q5.
- **G12. `docs/` is excluded from the npm package** (`.npmignore`), so the new notes are read on GitHub. JSDoc and `types/` therefore name the path in text, as the existing comments do, and do not link to it. The link-validity test scans every Markdown file under `docs/`, so every link in the new file must resolve.
- **G13. The 2026-11-04 observations come from deployed Atlantis test stacks** (Lambda event logs and API Gateway execution logs) and the 2026-11-09 ones from a temporary mock-integration stack. The notes state the method for each date without stack names, account, endpoint, or distribution identifiers, and without CloudFront edge address ranges (the sibling plan calls those "observations, not something to match on").
- **G10. The stale header comment** in `request-info-forwarded-for-bug-exploration-tests.jest.mjs` ("default 1") is corrected while that file is edited for the default change.

## 6. Proposed approach

### 6.1 Part 1: correct the safety statement

Replace the wrong paragraph in `README.md:1110` and the class comment at `ClientIpResolver.class.js:38-42`. Draft README text:

> A hop count that is too low selects the address of one of your own proxies. That is the wrong address, but never one the client wrote, because every entry to the right of the client's entries was appended by a proxy. A hop count that is too high is not safe. It selects an entry to the left of your real proxy chain, and the client can write those. With a count that is `k` higher than the real number of proxies, a client that sends at least `k` extra `X-Forwarded-For` entries chooses the result. With fewer, the header is shorter than the count and resolution falls through to `identity.sourceIp`. A count of `0` avoids the question: it never reads `X-Forwarded-For`.

Draft class-comment text: the same content, shorter. Add the issue's padded-chain example (counts 2, 3, 1 on `192.0.2.1, 198.51.100.10, 203.0.113.30`) to the README, using documentation addresses only.

Add a short paragraph: one count cannot be correct for both the distribution path and the raw URL when an edge-optimized API sits behind your own CloudFront; use a Regional API behind your distribution, or set `3` and add an origin lock (D4).

### 6.2 Part 2: Regional guidance and scenario table

- Value table (README:1119-1125): `0` is the default. It returns `identity.sourceIp`. It is correct for T1, T3, and T4 and returns the edge address in T2 (wrong, not forgeable). `1` and `2` stay valid; `1` is described as equivalent to `0` in T4 and `2` as equivalent to `0` in T1 and T3 for honest traffic, with the raw-URL caveat for `2`. `3` is for T2. An invalid value logs a warning and uses `0`.
- Replace the T4 warning (README:1126) and the "default fails safe" sentence (1128): at the default, no topology is forgeable; T2 logs your distribution's edge address until you set `3`.
- Scenario table: Value to set T1 `0` (default; `2` also correct), T2 `3`, T3 `0`, T4 `0`. "Effect of leaving the default" column: T1 none, T2 returns `E` (wrong, not forgeable), T3 none, T4 none. T2 row notes the raw-URL consequence of `3`. Source column: T1 and T2 "Measured 2026-11-04 and 2026-11-09", T3 and T4 "Measured 2026-11-09".
- Provenance sentence, placed under the table (Q4 = A): measured on 2026-11-09 with REST APIs using mock integrations; AWS documents `sourceIp` as the source IP of the immediate TCP connection ([API Gateway variables](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html)) and does not document the behavior of a Regional API behind your own CloudFront; if AWS changes it, set the variable explicitly. No re:Post links.
- Marker-check caution (G1). `CloudFront-Viewer-Address` section and the note above "Client IP resolution" corrected (G2, G9).

### 6.3 Part 3: default `0`

- `DEFAULT_TRUSTED_PROXY_HOPS = 0` in `ClientIpResolver.class.js`; its comment now describes "use `identity.sourceIp`; correct for an API whose `sourceIp` is the viewer".
- JSDoc and comments in the files of G3 change from "2 when unset" / "default 2" to `0`; `@param` names are unchanged.
- The `RESPONSE` log, `getProps().client.ip`, and `getClientIp()` signatures, return types, and the `.d.ts` shapes do not change.
- Update the existing tests listed in Section 4.2. Run the whole `test/request/` tree and the documentation tests; run the full suite before commit (test-requirements rule).

### 6.4 Part 4: documentation set

Apply Parts 1 to 3 to every row of G3 in one change. CHANGELOG: the content needed is that the Security entry describes the default of `0` and drops "The default counts two proxies"; the "Regional APIs ... stay forgeable until you set `1`" bullet no longer applies; the Added entry reads "Defaults to `0` (use `identity.sourceIp`); set `3` for your own CloudFront in front of an edge-optimized API"; the own-CloudFront entry stays; and a new Added entry announces the CloudFront notes. Whether the three superseded entries are edited in place or left for the developer is Q5. Draft advisory: only T2 must act; the T1 to T4 table, the workaround list, the action steps, and the limitations are rewritten to match; remove "A T4 deployment is not fixed by upgrading alone". Leave the sibling spec's PLAN.md, requirements.md, design.md, and tasks.md untouched.

### 6.5 Part 5: CloudFront notes (U1, D12)

Create `docs/cloudfront-notes/README.md` (a directory, so later notes can be added as further files) and link it from `docs/README.md` and from the "Client IP resolution" subsection of `docs/features/tools/README.md`. It is user documentation: it describes observed behavior and what the package does because of it.

Contents of the README:

- **Purpose and how to read it.** Behavior of API Gateway and CloudFront that features of this package rely on; each observation is dated and carries a status, "Documented by AWS" (with the link) or "Not documented by AWS". The package states these as observations; if AWS changes one, re-check with the method below.
- **Topologies.** T1 to T4 with the chain at the function and the value `identity.sourceIp` takes, in one table (Section 4.3), measured dates per row. The tools README scenario table links here for the evidence.
- **Observations**, each with ID, date, topology, what was sent, what was seen, status, and the effect on this package:
  - O1. Each CloudFront distribution appends the viewer address to the end of `X-Forwarded-For`; API Gateway appends the address that connected to it (R1 to R4; 2026-11-04 and 2026-11-09).
  - O2. Duplicate viewer `X-Forwarded-For` headers are joined into one comma-separated value, in order (2026-11-04).
  - O3. `identity.sourceIp` per topology: the client in T1, T3, and T4; the edge address in T2; never a forged value (2026-11-04 for T1 and T2, 2026-11-09 for all four). AWS documents the field as the immediate TCP connection and does not document T3.
  - O4. A viewer-supplied `CloudFront-Viewer-Address` is dropped by the AWS-managed distribution of an edge-optimized API, with or without your own CloudFront (T1, T2).
  - O5. A viewer-supplied `CloudFront-Viewer-Address` passes through unchanged to a Regional API with no CloudFront (T4).
  - O6. Through your own CloudFront to a Regional API (T3), the header arrives holding the real viewer address and port, and a viewer-supplied value is replaced (2026-11-09, managed `AllViewerExceptHostHeader` policy).
  - O7. The managed `AllViewerExceptHostHeader` policy forwarded `CloudFront-Viewer-Address` to the Regional origin (O6); AWS documents the policy as including additional CloudFront headers, listing viewer location headers. The README's earlier claim that it did not is removed.
  - O8. Forged `Forwarded`, `X-Real-Ip`, and `X-Forwarded-For` values did not change `identity.sourceIp` in any topology (2026-11-09).
- **Method.** The 2026-11-04 captures: deployed REST API test stacks, read from Lambda event logs or API Gateway execution logs, using documentation-range marker addresses. The 2026-11-09 re-measurement: a temporary stack of one Regional and one edge-optimized REST API with mock integrations whose response template returns `$context.identity.sourceIp` and the two request headers, each with a CloudFront distribution (managed `CachingDisabled` cache policy, managed `AllViewerExceptHostHeader` origin request policy, HTTPS to the origin), and the four header variants sent. The response mapping template is shown. Limits: mock integration instead of Lambda proxy, one client address, IPv4 only.
- **How to add an observation** (a short convention so later features follow it): one row or section per observation with the fields above; never record real addresses, account IDs, endpoint IDs, or edge address ranges.

The tools README keeps the instructions (what to set, how to check) and states each claim once with a link to the observation ID, instead of repeating the evidence.

### 6.6 Alternatives considered

- **Fix only the two places named in the issue.** Leaves the default forgeable on Regional and the guidance contradicting itself. Rejected (G3).
- **Make the resolver detect a too-high count.** Impossible: it cannot tell proxy-written entries from client-written ones. Rejected.
- **Default stays `2` (Q2 = A) or changes later (Q2 = C).** Rejected by the user.
- **Remove the `1` setting for T4.** Breaks users who followed the 1.4.1 draft guidance. `1` stays valid.

## 7. Related improvements

| Item | Class | Rationale | Effort | Risk |
|------|-------|-----------|--------|------|
| I1. Marker-check caution (G1) | Include | The procedure otherwise yields a count that is correct but not the safest value | S | Low |
| I2. `CloudFront-Viewer-Address` section edit (G2) | Include | The measurement changes what T2 and T3 need | S | Low |
| I3. Update draft security advisory (G3) | Include | Published at release; contradicting the README would be worse than a late edit | S | Low |
| I4. Correct the managed-policy statement (G9) | Include | Same README section; the measurement disproved it; one-sentence fix | S | Low |
| I5. Fix the stale "default 1" test comment (G10) | Include | The file is edited for the default change anyway | S | Low |
| I6. `docs/cloudfront-notes/README.md` (Part 5, U1) | Include | The user asked for it; later CloudFront features rest on the same observations | M | Low |
| N1. Tag `v1.4.1` exists on `origin` at the version-bump commit, one commit before `f746cde` and before this work. The publish workflow runs when a GitHub release is published | Note only | Before creating the release, check that the tag points at the final commit. Release process is the maintainer's | S | Med if missed |
| N2. A too-high count cannot be detected at runtime | Note only | Nothing the package can check; documentation is the control | n/a | n/a |
| N3. Tell the owners of #254 and Atlantis #14 and #10 that C6 is verified, and that the managed policy forwards `CloudFront-Viewer-Address` (G9), which was the stated reason #9 was filed | Note only | They rely on both facts | S | Low |

No spin-offs; everything separable is already tracked.

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| AWS changes the undocumented Regional behavior later | Label as observed behavior with a date (Q4 = A). The documentation tells readers to set the variable explicitly if AWS changes it |
| Docs, JSDoc, types, CHANGELOG, and advisory drift apart | One change touches every row of G3; reviewer checklist |
| Default `0` drops the viewer-address step for users who set nothing | No topology loses a result (Section 4.3); setting `2` or `3` restores the step |
| No test pins the corrected behavior, and AGENTS.md section 2.3 says every change includes tests (Q3 = D, adopted by the user) | The default change updates the existing tests that assert it. The corrected paragraph describes behavior already covered by the resolver tests (the T4 `N = 2` case and the T2 `N = 2` case). Residual: a future edit to the documentation could reintroduce the wrong claim without a failing test |
| Updating the default misses a test that depends on it | Run the whole `test/request/` tree, then the full suite, before commit |
| One probe client address, IPv4 only, mock integration instead of Lambda proxy | The field is the same API Gateway context value; the controls matched earlier captures. Documentation states the method |

## 9. Locked decisions

### Decided in this plan (veto any of these)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Part 1 (the correction) is in scope whatever the answers | Certain; probed; the wrong statement has not shipped |
| D2 | State the rule as arithmetic (count = real + k; p >= k selects a client entry, p < k falls through; a lower count is always proxy-written) | The README currently has no statement a reader can check |
| D3 | T2 states the raw-URL consequence of `3`; T1, T3, and T4 state none at the default | Follows Section 4.3 |
| D4 | The README recommends a Regional API behind your own CloudFront as the way to avoid the two-path problem | Matches the Atlantis ingress standard (starter-02 #14, templates #10). Changes what the docs recommend only; no starter changes |
| D5 | `0` is the documented value for T3 and T4 and the default; `1` stays accepted for T4 and `2` for T1 and T3 | Issue request; keeps 1.4.1 draft guidance valid |
| D6 | The marker check keeps its method and gets a caution (I1) | The method is still correct for T2 |
| D7 | The sibling spec's PLAN, requirements, design, and tasks stay unedited; the draft `security-advisory.md` is edited | The first set records history; the advisory is a publish artifact |
| D8 | An invalid environment value resolves to the new default `0` | Follows from the single constant; it is fail-safe |
| D9 | `ISSUE.md` is not edited | Imported file |
| D10 | The spec directory keeps its name; the package version stays 1.4.1 | Naming convention; unreleased |
| D11 | The managed-policy statement is corrected in the same pass (I4); the measured request headers and addresses are not reproduced in the documentation beyond documentation-range examples | Same README section; accuracy rule; no real addresses in published docs |
| D12 | The notes live at `docs/cloudfront-notes/README.md`, a directory so later notes can be added as files beside it. The user wrote "maybe docs/cloudfront-notes" | Matches the existing directory-per-topic layout of `docs/` (for example `lambda-optimization/README.md`) |
| D13 | The notes record the observations as O1 to O8 (Section 6.5), each with date, topology, status, and effect. No account, endpoint, or distribution identifiers and no CloudFront edge address ranges appear | Accuracy standard; the ranges are not something to match on; published repository |
| D14 | The tools README states each claim once with a link to the observation, and keeps instructions (what to set, how to check) | Avoids two copies of the evidence drifting apart |

### Decided by the user

| # | Decision |
|---|----------|
| Q1 | **A.** The agent re-measured on a temporary stack. Done 2026-11-09; results in Section 3.1; stack deleted and checked |
| Q2 | **B.** Documentation plus default `0` in this spec. Supersedes sibling decision U4 ("the default describes T1") with "the default returns `identity.sourceIp`, which is the client for T1, T3, and T4" |
| Q3 | **D.** "I don't think we need a test." No new tests are added. The existing tests that assert the old default are updated (Section 4.2). Residual risk recorded in Section 8 |
| Q4 | **A.** Cite the measurement with its date and the AWS definition of `sourceIp`; state that AWS does not document the behavior behind your own CloudFront; no re:Post links |
| Q5 | **B.** Edit the three superseded CHANGELOG entries (lines 16, 18, 23 of the v1.4.1 section) in place, and only those three, as a one-time exception to "never update existing text" recorded here, because they are unreleased text of the same release. All other existing entries stay untouched |
| U1 | (Chat, 2026-11-09, before `requirements.md`) Write documentation of the forwarding findings and the IP findings as observations, because observations like these matter to this package and more features for deployments behind CloudFront are planned. "Maybe `docs/cloudfront-notes`." Recorded as Part 5, I6, D12 to D14, and a requirement in `requirements.md` |

## 10. Open questions and recommendations

No open questions. Q5 is answered below and recorded in Section 9.

### Q5 (answered). How should the unreleased CHANGELOG entries that this spec makes false be corrected?

**Why it matters:** `.kiro/steering/changelog-convention.md` says existing changelog text must never be updated, that Kiro adds entries only, and that the developer reviews unreleased entries before release. Three entries under `v1.4.1 (unreleased)` (lines 16, 18, and 23, written by spec `1-4-1-trusted-client-ip` in commit `f746cde`) say the default is `2` and that Regional APIs stay forgeable until `1` is set. After this spec they are false, and the release notes would contradict the README, the types, and the advisory. The sibling spec's requirements said "without modifying existing entries".

**Options:**
- **A. Add only.** Kiro adds new entries (the default is `0`; the CloudFront notes) and leaves the three entries as they are. The task list names the three entries so the developer corrects or removes them at the pre-release review. Follows the convention exactly; the release notes are wrong until the developer acts.
- **B. Edit the three entries in place** (and only those three), as a one-time exception recorded in the spec because they are unreleased text from the same release. The release notes are right when the spec completes; breaks the "never" rule.
- **C. Add and mark.** Add new entries as in A, and prefix each of the three entries with "Superseded in this release:" followed by a pointer to the new entry. Edits existing text by adding a prefix only; the notes stay accurate but longer.
- **D. Other**: describe.

**Recommendation:** B. The entries have not shipped, the text is false once this spec lands, and a manual follow-up step is the kind that gets skipped before a release. The exception is small (three named entries) and recorded here. A is the right choice if you want the convention to have no exceptions; C adds clutter to release notes.

**Answer:** B. Edit the changelog in place.
