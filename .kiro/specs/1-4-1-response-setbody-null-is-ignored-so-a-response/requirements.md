# Requirements Document

## Introduction

`Response.set()` assigns a body only when it is truthy (`src/lib/tools/Response.class.js`, `set`), and `reset()` fills the body from a generic status template whenever none is supplied. Every new `Response` therefore holds a template body (`{"message":"Success"}` for 200), and no public call replaces it with `null`, although `finalize()` already returns `body: null` for a null body. A handler cannot send a bodiless 202 or 204. The reporter of GitHub issue [#252](https://github.com/63Klabs/cache-data/issues/252) works around this by writing the private `_body` field in `atlantis-mcp`.

The repository's own routing example makes the same mistake. `docs/01-advanced-implementation-for-web-service/routing-patterns.md` calls `response.setBody(null)` after `setStatusCode(204)` in a delete handler, and today that sends the template body with the 204 (PLAN.md C9).

This feature (1) adds a public `Response.setBodyToNull()` that sets the body to `null` (Q1 A; the issue calls it `clearBody()`, renamed in Q7 B so that it sorts next to `setBody` and says what it does), (2) leaves `set()`, `setBody()`, `reset()`, the constructor, and `finalize()` unchanged (Q1 A, Q2 A, Q3 A, D4), (3) documents what `setBody()` and `set()` do with falsy values and how to send a bodiless response, including the `Cache-Control` pairing (Q3 A), (4) corrects the 204 example and the invalid `Response` sample in the user documentation (D6), (5) records the API Gateway behavior that `setBodyToNull()` relies on as dated observations in `docs/cloudfront-notes/` (C15, D9, D11), and (6) adds unit, property, characterization, and type tests (D7).

The change ships in v1.4.1, which is unreleased (npm `latest` is 1.4.0) (D1). Decisions are recorded in [PLAN.md](PLAN.md); references such as (Q1), (D4), or (C15) point there. All decisions are locked.

## Glossary

- **Null body**: a `Response` whose `_body` is `null`. `getBody()` and `toObject()` return `null` for it, and `finalize()` returns `body: null` (PLAN.md C7, C8).
- **Bodiless response**: a response sent to the client with no content, from a null body, an omitted `body`, or an empty string `body` in the Lambda proxy result. For API Gateway REST API the three are indistinguishable at the client (Observation O9).
- **Falsy value**: `null`, `undefined`, `''`, `0`, or `false`. `set()` and `setBody()` do not assign a falsy `body` (PLAN.md C1, C5).
- **Template body**: the body taken from the generic response module for the status code and content type, by `reset()` and by the constructor.
- **Config-derived cache headers**: the `Cache-Control: max-age` and `Expires` headers that `finalize()` adds from `routeExpirationInSeconds` (status below 400) and `errorExpirationInSeconds` (status 400 and above) when the application did not set them.
- **REST API**: Amazon API Gateway REST API with a Lambda proxy integration, Regional or edge-optimized. HTTP API, Application Load Balancer, and Lambda function URLs are not REST API.
- **Observations O9 to O12**: statements about API Gateway behavior recorded in this feature's addition to `docs/cloudfront-notes/` (Requirement 6). O1 to O8 already exist there.
- **Documentation set**: `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/01-advanced-implementation-for-web-service/routing-patterns.md`, `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md` and the new notes file, the JSDoc of `src/lib/tools/Response.class.js`, the doc comments of `types/lib/tools/index.d.ts`, and the v1.4.1 entries of `CHANGELOG.md`.
- **Documentation range addresses**: `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737), used in docs in place of real addresses.

## Requirements

### Requirement 1: `Response.setBodyToNull()` (Q1 A, Q7 B, D2, D3, D4, D5)

**User Story:** As a Lambda function developer, I want a public call that removes the body from a response, so that I can send a 202 Accepted or 204 No Content without writing a private field.

#### Acceptance Criteria

1. THE `Response` class SHALL provide a public instance method `setBodyToNull`, defined as an arrow-function class property directly after `setBody` in `src/lib/tools/Response.class.js`, like its neighbors `setBody`, `setStatusCode`, and `setHeaders`. IT SHALL take no parameters and return `undefined`.
2. WHEN `setBodyToNull()` is called, THE `Response` SHALL set its body to `null` and SHALL NOT change the status code, the headers (including `Content-Type`), or any other property.
3. AFTER `setBodyToNull()`, `getBody()` SHALL return `null`, `toObject()` called before `finalize()` SHALL return an object whose `body` is `null` and whose `statusCode` and `headers` are those before the call, and `finalize()` SHALL return `body: null` with the same status code. (`finalize()` adds cache and other headers to the response object, so `toObject()` called after it shows them.)
4. AFTER `setBodyToNull()`, `finalize()` SHALL keep the `Content-Type` header, SHALL preserve an application-set `Cache-Control` and `Expires` exactly as it does for a non-null body (PLAN.md C11), SHALL add config-derived cache headers under the same conditions as before, and SHALL log a `RESPONSE` line that reports a body size of 0 bytes (PLAN.md C7).
5. `setBodyToNull()` SHALL be idempotent, callable at any point before `finalize()`, and SHALL NOT throw, log, or read a parameter.
6. AFTER `setBodyToNull()`, THE following existing behaviors SHALL hold and SHALL be stated in the JSDoc and the user documentation (PLAN.md Section 4.2, N4):
   1. `reset()` restores a template body.
   2. `setBody(x)` with a truthy `x` assigns `x`.
   3. `setStatusCode()` and `setHeaders()` leave the body `null`.
   4. `addToJsonBody()` and `setMessage()` build a new JSON body from the null body.
7. THE private field name `_body` SHALL NOT change, SHALL NOT be documented as API, and SHALL NOT appear in the user documentation or in the type declarations. (D3)
8. `setBodyToNull` SHALL NOT be added to `ClientRequest`, `ResponseDataModel`, or any other class.
9. THE method name SHALL be exactly `setBodyToNull`. NO alias (such as `clearBody`) SHALL be added in `src/`, `types/`, or the documentation, except that the documentation MAY say that the issue called the method `clearBody()`. (Q7)

### Requirement 2: Existing behavior unchanged (Q1 A, Q2 A, Q3 A, D4, D5)

**User Story:** As an existing user, I want every current call on `Response` to behave as before, so that upgrading to v1.4.1 does not change what my clients receive.

#### Acceptance Criteria

1. `set()` and `setBody()` SHALL continue to assign `statusCode`, `headers`, and `body` only when the supplied value is truthy. WHEN `setBody()` is called with `null`, `undefined`, `''`, `0`, or `false`, THE previous body SHALL stay unchanged.
2. `reset()` and the constructor SHALL continue to take the supplied `body` when it is neither `null` nor `undefined`, and the template body for the status code otherwise. A supplied `body: null` SHALL still select the template.
3. `finalize()` SHALL NOT change. THE executable code of `finalize()`, `set()`, `reset()`, and the constructor SHALL be as before; the only code change in `Response.class.js` SHALL be the added `setBodyToNull` property, and the only other change SHALL be JSDoc.
4. THE generic response modules (`generic.response*.js`), `ResponseDataModel`, `ClientRequest`, and the log-field sanitizer SHALL NOT change.
5. THE `Content-Type` header of a bodiless response SHALL NOT be removed or altered by `setBodyToNull()` or by `finalize()` (D5).

### Requirement 3: JSDoc and type declarations (D2, I2, I4)

**User Story:** As a developer reading IDE hints, I want `setBodyToNull()` and the falsy-value rule documented in the editor, so that I find the call without reading the source.

#### Acceptance Criteria

1. THE JSDoc of `setBodyToNull` SHALL follow `.kiro/steering/documentation-standards-jsdoc.md`: a description, `@returns {void}`, and two `@example` blocks, one for a 204 delete handler and one for a 202 that adds `Cache-Control: no-store`. THE description SHALL state that `setBody(null)` is ignored and this method is the way to send no body, SHALL state the behaviors in Requirement 1.6, and SHALL name `docs/01-advanced-implementation-for-web-service/response-management.md` by path in text and not as a link, because `docs/` is excluded from the npm package. (PLAN.md Section 3, Packaging)
2. THE JSDoc of `setBody` and `set` SHALL state that a falsy `body` is not assigned and the previous body stays, and SHALL point to `setBodyToNull()` to send no body and to `reset()` to restore the template. THE `@param` types of `setBody` and `set` SHALL NOT change.
3. `types/lib/tools/index.d.ts` SHALL declare `setBodyToNull(): void;` on the `Response` class directly after `setBody`, with a doc comment that states what Requirement 1.2 and 1.6 state. THE doc comment of `setBody` SHALL gain the falsy-value sentence. THERE SHALL be no other change in `types/`; in particular, the `toObject()` and `finalize()` return types SHALL NOT change (N3).
4. THE JSDoc examples SHALL be executable against the current API and SHALL use `new Response(clientRequest)` and existing methods only.
5. THE documentation validation tests in `test/documentation/` SHALL pass with the new method.

### Requirement 4: User documentation (I1, I2, I3, Q3 A, D5, D6, D11)

**User Story:** As a developer, I want the documentation to show how to send a bodiless response and what `setBody(null)` does, so that I do not copy a pattern that sends the template body.

#### Acceptance Criteria

1. `response-management.md` SHALL gain a section "Sending a response with no body" directly after "Overriding cache headers per response" and before "Reset and Reuse". IT SHALL contain a 202 example and a 204 example, both calling `setBodyToNull()`, and the 202 example SHALL also add `Cache-Control: no-store` and `Expires: 0`.
2. THE section SHALL state, each in one sentence:
   1. `setBody(null)`, `setBody(undefined)`, `setBody('')`, `setBody(0)`, and `setBody(false)` are ignored and leave the previous body, so `setBodyToNull()` is the call that sends no body.
   2. `finalize()` still adds `Cache-Control: max-age` to a bodiless 2xx response when `routeExpirationInSeconds` is above 0, so pair `setBodyToNull()` with an explicit `Cache-Control` for a 202 or 204 (Q3 A).
   3. `Content-Type` stays on the response; API Gateway REST API keeps it on a 202 and removes it, and any body, from a 204 (O12).
   4. `reset()` after `setBodyToNull()` restores a template body, and `addToJsonBody()` and `setMessage()` build a new body from a null body.
   5. The check that API Gateway accepts a null body covered Regional and edge-optimized REST API only; HTTP API, Application Load Balancer, and Lambda function URLs were not checked (PLAN.md Section 2, Limits).
3. THE section SHALL link to the new notes file for O9 to O12 and SHALL NOT repeat the evidence table.
4. THE delete handler in `routing-patterns.md` (the `else` branch with `setStatusCode(204)`) SHALL call `response.setBodyToNull()` instead of `response.setBody(null)`, and SHALL add a one-line comment or adjacent sentence saying so. (I1, C9)
5. THE "Response Class" sample in `docs/features/tools/README.md` SHALL be replaced by a sample that uses `new Response(clientRequest)`, `setStatusCode()`, `setBody()`, and `finalize()`, and SHALL mention `setBodyToNull()` with a link to the section in criterion 1. IT SHALL NOT call `new Response()` with no argument, `setHeader()`, or `get()`. (D6, I3, G7)
6. THE examples in criteria 1, 4, and 5 SHALL follow `.kiro/steering/documentation-standards-markdown.md`: a language on every code block and realistic names.
7. THE documentation set SHALL NOT, after this feature, show `setBody(null)` as a way to send no body. A search of `docs/` and `README.md` for `setBody(null)` SHALL return only text that says the call is ignored.
8. THE user documentation SHALL NOT mention `_body` or `TestHarness`.

### Requirement 5: Tests (D7, I5)

**User Story:** As a maintainer, I want tests that pin `setBodyToNull()` and the unchanged falsy-value behavior, so that a later change to either is deliberate.

#### Acceptance Criteria

1. A new file `test/response/response-set-body-to-null-unit-tests.jest.mjs` SHALL contain tests that assert, for a `Response` built with `Response.init` and the helpers in `test/helpers/`:
   1. after `setBodyToNull()` on a 202 response, the status code is 202 and `finalize()` returns `body: null`.
   2. `getBody()` and `toObject().body` return `null`.
   3. `Content-Type` is kept.
   4. `reset()` after `setBodyToNull()` restores a template body.
   5. `setMessage()` on a null body creates a body.
   6. an application-set `Cache-Control` and `Expires` survive `finalize()`.
   7. the `RESPONSE` log line reports 0 bytes.
   8. `setBodyToNull()` called twice, and called on a fresh response, both give a null body.
   9. with `routeExpirationInSeconds` above 0 and no application-set cache headers, `finalize()` adds `Cache-Control: max-age=<routeExpirationInSeconds>` to a bodiless 202, which is the behavior the documentation tells developers to pair with an explicit `Cache-Control` (Q3).
2. THE same file SHALL contain characterization tests that assert that `setBody(null)`, `setBody(undefined)`, `setBody('')`, `setBody(0)`, and `setBody(false)` each leave a previously set body unchanged, and that `reset({ statusCode: 200, body: null })` and `new Response(clientRequest, { statusCode: 200, body: null })` yield the 200 template body. (Status 200 keeps these tests independent of the templates for unlisted statuses, spin-off S2.) Their names and a comment SHALL say that they pin the compatibility decision (Q1, Q2).
3. A new file `test/response/response-set-body-to-null-property-tests.jest.mjs` SHALL use fast-check to assert: for every status code in 200 to 599 and every prior JSON object body, `setBodyToNull()` followed by `finalize()` yields `body: null` and the same status code; and, as a second property, for every prior JSON object body and every value in `null`, `undefined`, `''`, `0`, and `false`, `setBody(value)` leaves the body unchanged. THE tests SHALL use the default 100 runs, SHALL NOT pass a `seed` to `fc.assert`, SHALL NOT spawn child processes, and SHALL build its generators so that every draw is a valid input (no filtering by the asserted predicate).
4. A case that needs a `routeExpirationInSeconds` different from the file's single `Response.init` SHALL run in a subprocess started with `execFileSync` (not `exec`, not `npm test`), an explicit timeout, and the Jest binary or `node` directly, per `.kiro/steering/test-execution-monitoring.md`.
5. `test/types/consumer-tools.ts` SHALL gain a type-only use of the new method (for example `declare const typedResponse: InstanceType<typeof tools.Response>; typedResponse.setBodyToNull();`), and `npm run test:types` SHALL pass.
6. EXISTING tests SHALL NOT change.
7. Tests SHALL restore mocks and `process.env` in `afterEach`, SHALL NOT call real AWS services, and SHALL use `@jest/globals` imports.
8. THE full suite (`npm test`) SHALL pass, and `npm test -- test/documentation/` SHALL pass.
9. Modified files SHALL NOT gain ESLint errors relative to the repository baseline (`Response.class.js` has 0), and new `.mjs` files SHALL report none. (`npm run lint:ci` already fails on the baseline, which is outside this spec.)

### Requirement 6: API Gateway observations (C15, D9, D11, Q4, Q6)

**User Story:** As a developer who sends a bodiless response, and as a maintainer who builds further features on API Gateway behavior, I want a dated record of what API Gateway does with a null body, so that the documentation states its basis and the behavior can be re-checked.

#### Acceptance Criteria

1. THE repository SHALL contain a new notes file `docs/cloudfront-notes/lambda-proxy-response-body.md`, linked from `docs/cloudfront-notes/README.md` (as that page's convention requires for a new topic) and from the new section in `response-management.md`. THE file SHALL follow `.kiro/steering/documentation-standards-markdown.md`: one H1, ATX headers without skipped levels, code blocks with a language, tables with header separators, relative links for internal references.
2. THE file SHALL begin with a purpose statement and the same status vocabulary as `docs/cloudfront-notes/README.md` ("Documented by AWS" with a link, or "Not documented by AWS"), and SHALL say that AWS can change behavior it does not document, with a pointer to the method.
3. THE file SHALL record these observations with the fields of `docs/cloudfront-notes/README.md` ("Adding an observation"), numbered O9 to O12 so the IDs continue that page's sequence:
   - O9. A Lambda proxy result with `body: null`, with the `body` key omitted, or with `body: ""` produced the status code the function set, no 502, and no content, on a Regional REST API (T4) and an edge-optimized REST API (T1). Dated 2026-11-10. The AWS page on the proxy output format shows `body` as a string and states that another format returns 502, and does not mention `null` or an omitted body; the status is "Not documented by AWS".
   - O10. An application-set `Cache-Control: no-store` in the proxy result reached the client on every bodiless 202 and 204 response, including through the CloudFront distribution of the edge-optimized API (T1). Dated 2026-11-10. "Not documented by AWS".
   - O11. On a 202, the `Content-Type` header set by the function reached the client with `content-length: 0` and no body (T1, T4). Dated 2026-11-10. "Not documented by AWS".
   - O12. On a 204, API Gateway removed the body and the `Content-Type` header even when the function returned a body (T1, T4). Dated 2026-11-10. "Not documented by AWS".
4. THE file SHALL describe the method: a temporary stack of one Node.js Lambda function returning the proxy result shape that `finalize()` produces, behind one Regional and one edge-optimized REST API with a Lambda proxy integration and a `test` stage; one `GET` per combination of body variant (`null`, omitted, `""`, JSON string as control) and status (202, 204) to each API, 16 requests; and that the stack was deleted afterwards. THE file SHALL state the limits: REST API only (no HTTP API, Application Load Balancer, or Lambda function URL), one client, IPv4, and a 128 MB Node.js 22 function.
5. THE file SHALL state the effect of each observation on this package: `finalize()` returns `body: null` unchanged (D4, D11), and the documentation tells developers to pair `setBodyToNull()` with an explicit `Cache-Control`.
6. THE file SHALL contain no real IP address, account ID, endpoint ID, distribution domain, stack name, function name, request ID, or CloudFront edge address range, and SHALL NOT name the AWS profile or account.
7. THE file SHALL NOT claim as measured anything the observations do not record as measured.
8. EVERY link in the new file, and every link added to `docs/cloudfront-notes/README.md` and `response-management.md`, SHALL resolve, so that the tests in `test/documentation/` pass.

### Requirement 7: Changelog (Q1, D1)

**User Story:** As an existing user, I want the release notes to describe the new method and the corrected example, so that I find them in v1.4.1.

#### Acceptance Criteria

1. THE changes SHALL be recorded under `## v1.4.1 (unreleased)` in `CHANGELOG.md` per `.kiro/steering/changelog-convention.md`, each entry linking `[Spec: 1-4-1-response-setbody-null-is-ignored-so-a-response](.kiro/specs/1-4-1-response-setbody-null-is-ignored-so-a-response/)` and, where the entry addresses the issue, `addresses [#252](https://github.com/63Klabs/cache-data/issues/252)`.
2. EACH row of [Consumer-visible behavior changes](#consumer-visible-behavior-changes) SHALL appear under the category that table assigns it.
3. THE entries SHALL be added to the existing `### Added` and `### Fixed` sections of v1.4.1. NO existing line SHALL be edited, and no entry SHALL be added to a released version.
4. IF the `## v1.4.1 (unreleased)` heading or the `1.4.1` version in `package.json` is missing when the changelog task runs, THEN the task SHALL stop and ask the developer, rather than create either.

### Requirement 8: Backwards compatibility and release (D1)

**User Story:** As an existing user of @63klabs/cache-data, I want to upgrade to v1.4.1 without changing my code.

#### Acceptance Criteria

1. THE package exports SHALL keep their names and kinds, and no export SHALL be added. `setBodyToNull` is a method of the already exported `Response` class.
2. NO public method SHALL change its name, signature, return type, default, or observable behavior (Requirement 2).
3. FOR every call sequence that does not use `setBodyToNull()`, `finalize()` SHALL return the same status code, headers, and body as v1.4.0.
4. THE change SHALL ship in v1.4.1, which is unreleased. THE `package.json` version SHALL stay `1.4.1`. A strict reading of AGENTS.md section 2.2 would class a new method as MINOR; the decision to ship it as a patch follows the precedent of `1-4-1-trusted-client-ip` (D1).
5. THE spec directory name SHALL stay `1-4-1-response-setbody-null-is-ignored-so-a-response`.

### Requirement 9: Accuracy and consistency of the documentation set (G1, G7, G9)

**User Story:** As a reader, I want every file to give the same answer on how to send no body, so that I do not find one file using `setBody(null)` and another `setBodyToNull()`.

#### Acceptance Criteria

1. A SEARCH of the documentation set for `setBodyToNull` SHALL show only text that agrees with Requirements 1, 3, and 4.
2. A SEARCH of the documentation set for `setBody(null)` SHALL show only text that says the call is ignored.
3. EVERY statement about what API Gateway does with a bodiless response SHALL be traceable to an observation O9 to O12.
4. User documentation SHALL describe behavior rather than internals, and the modified JSDoc and Markdown SHALL pass the validation tests in `test/documentation/`.

## Consumer-visible behavior changes

Relative to v1.4.0, the last release. The "Category" column is the CHANGELOG category (Requirement 7.2).

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | New `Response.setBodyToNull()` sets the body to `null`, so `finalize()` returns `body: null` and API Gateway REST API sends no content. Nothing else about `Response` changes | Developers who need a 202 or 204 with no body. Everyone else sees no change | Added | Q1, Q7, D2 |
| 2 | New `docs/cloudfront-notes/lambda-proxy-response-body.md` records what API Gateway REST API does with a null, omitted, or empty body (O9 to O12) | Everyone reading the docs | Added | C15, D11 |
| 3 | The delete handler in the routing documentation no longer shows `setBody(null)`, which sent the template body, and the `Response` sample in the tools README uses methods that exist | Developers who copied either example | Fixed | C9, D6 |

The JSDoc and type comments of `setBody` and `set` now state that falsy values are ignored. That is documentation of existing behavior and has no changelog entry of its own.

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. `Response.setBodyToNull()` | Q1, Q7, D2, D3, D4, D5, C7, C8, C11, N4 |
| 2. Existing behavior unchanged | Q1, Q2, Q3, D4, D5, C1, C2, C5, C6 |
| 3. JSDoc and type declarations | D2, I2, I4, N3 |
| 4. User documentation | I1, I2, I3, Q3, D5, D6, C9, G1, G7 |
| 5. Tests | D7, I5 |
| 6. API Gateway observations | Q4, Q6, C15, D8, D9, D11 |
| 7. Changelog | Q1, D1 |
| 8. Backwards compatibility and release | D1 |
| 9. Accuracy and consistency | G1, G7, G9 |

## Additions beyond PLAN.md

These choices were made while writing this document and the design, and are open to veto. Each is recorded here and nowhere else yet.

- **A1.** The observations go in a new file `docs/cloudfront-notes/lambda-proxy-response-body.md` with IDs O9 to O12, not in the existing table, because the notes page asks for a new file for a new topic. PLAN.md D9 and D11 required recording the result with placeholders but did not name the file.
- **A2.** The notes page records the result as four observations (null/omitted/empty body, `Cache-Control`, 202 `Content-Type`, 204 stripping) instead of the single paragraph in PLAN.md Section 2.
- **A3.** The characterization tests also pin `reset({ statusCode: 202, body: null })` and the constructor with `body: null` (Q2 A), not only `setBody()`.
- **A4.** The `ResponseDataModel` sample in `docs/features/tools/README.md` (it also calls `new Response()` with no argument) is not changed; D6 covers the `Response` sample only.
- **A5.** The changelog gets one Added entry for `setBodyToNull()`, one Added entry for the notes file, and one Fixed entry for the two documentation examples. The falsy-value documentation has no entry of its own.
- **A6.** The type test uses a type-only `declare const` so that it does not need a runtime `ClientRequest`.
- **A7.** A unit test pins that `finalize()` adds `Cache-Control: max-age` to a bodiless 202 when nothing is set (Requirement 5.1.9), because the documentation states it.
- **A8.** The property file holds a second property (falsy bodies never replace a body), the property form of the characterization tests.
- **A9.** The characterization tests for `reset()` and the constructor use status 200, not 202 or 204, so that they do not depend on spin-off S2.

## Out of scope

- Any change to `set()`, `setBody()`, `reset()`, the constructor, or `finalize()` (Q1 A, Q2 A, Q3 A, D4).
- Skipping config-derived cache headers for bodiless, 202, or 204 responses (Q3 A; S5 is note-only).
- The spin-offs confirmed in Q5, each an `ISSUE.md` under the `1-4-2` prefix: `1-4-2-response-init-xmlresponses-overwrites-html-templates` (S1), `1-4-2-generic-responses-for-unlisted-status-codes` (S2), `1-4-2-response-set-status-code-resets-content-type-to-json` (S3). S4 (`reset()` ignores a falsy body) is dropped.
- Note-only findings N1 to N5 of PLAN.md Section 7, including the wrong `toObject()` and `finalize()` types in `types/` and the `atlantis-mcp` change to `setBodyToNull()` after 1.4.1 is published.
- A runtime check on HTTP API, Application Load Balancer, or Lambda function URLs.
- A programmatic option or environment variable for bodiless responses.
