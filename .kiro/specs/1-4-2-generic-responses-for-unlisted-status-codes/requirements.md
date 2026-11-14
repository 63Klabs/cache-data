# Requirements Document

## Introduction

The generic response modules (`jsonGenericResponse`, `htmlGenericResponse`, `xmlGenericResponse`, `rssGenericResponse`, `textGenericResponse`) hold templates for ten status codes: 200, 400, 401, 403, 404, 405, 408, 418, 427 and 500. For every other code, `response(n)` returns the 500 template (`src/lib/tools/generic.response.js`, `createGenericResponseModule`). `Response.reset()` and the constructor take the headers and body from that template and keep the caller's status code, so `new Response(clientRequest, { statusCode: 201 })` sends a 201 with `{"message":"Internal Server Error"}`. An application with a custom `response500` sends its own 500 body on a 201 (PLAN.md C2, C3, N1). This is option 3 of GitHub issue [#252](https://github.com/63Klabs/cache-data/issues/252), spun off from the `Response.setBodyToNull()` work.

This feature (1) adds templates for 201, 202, 204, 409, 422, 429 and 503 to the five modules, with a `null` body for 204 (Decision 1), (2) makes the XML and RSS formatters render every 2xx as a success body (C4), (3) makes `response(n)` fall back by status class for statuses without a template: 2xx to the 200 template, 4xx to the 400 template, 5xx to the 500 template, 1xx, 3xx and 205 to the bodiless 204 template, anything else to the 500 template (Decisions 2 and 8), (4) makes `Response.reset()` assign `null` when the resolved body is `null` so that a bodiless template clears the body of an existing instance (Decision 3, C6), (5) keeps `response427`, marks it deprecated in favour of `response429`, and logs one warning per container when `response()` resolves 427 (Decisions 4 and 9), (6) updates the JSDoc, the type declarations, the user documentation (including a rewrite of the incorrect "Generic Response Generators" section) and the CHANGELOG (Decision 7), and (7) adds unit, property and type tests.

The change ships in v1.4.2, which is unreleased, as a PATCH. That classification departs from AGENTS.md section 2.2, which classes new exports as MINOR and changed default behavior as MAJOR. The departure is recorded as an exception in the CHANGELOG entry, and AGENTS.md is not edited (Decisions 5 and 10). Decisions are recorded in [PLAN.md](PLAN.md); references such as (Decision 2), (C4) or (N1) point there. All decisions are locked.

## Glossary

- **Template**: a `{ statusCode, headers, body }` object named `response<code>` on a generic response module, for example `response404`.
- **Listed code**: a status code that has a template on the module after this change: 200, 201, 202, 204, 400, 401, 403, 404, 405, 408, 409, 418, 422, 427, 429, 500 and 503.
- **Unlisted code**: any other status code.
- **Direct lookup**: `this["response" + code]` in `response()`, where `code` is `parseInt(statusCode, 10)`. A custom template merged by `Response.init()` is found by direct lookup.
- **Class fallback**: the template `response()` returns for an unlisted code, chosen by the range of the code (Requirement 3).
- **Bodiless template**: a template whose `body` is `null`. After this change `response204` is the only built-in one.
- **Bodiless fallback**: the class fallback for 100-199, 300-399 and 205, which returns the object at `this.response204`.
- **Shared headers object**: the `headers` object of a module (`mod.headers`). Every template of the module refers to the same object (`test/response/generic-response-module-tests.jest.mjs`, "should share the same headers object across all response objects").
- **Deprecation warning**: the single `DebugAndLog.warn` call that `response()` makes the first time per container that it resolves 427.
- **Documentation set**: `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/features/tools/README.md`, the JSDoc of `src/lib/tools/generic.response.js` and `src/lib/tools/Response.class.js`, the doc comments of `types/lib/tools/index.d.ts`, and the v1.4.2 entries of `CHANGELOG.md`.
- **Format modules**: `src/lib/tools/generic.response.json.js`, `.html.js`, `.xml.js`, `.rss.js` and `.text.js`.

## Requirements

### Requirement 1: Templates for 201, 202, 204, 409, 422, 429 and 503 (Decision 1, C1, C2)

**User Story:** As a Lambda function developer, I want `new Response(clientRequest, { statusCode: 201 })` to carry a "Created" body, so that a success status is not sent with "Internal Server Error".

#### Acceptance Criteria

1. EACH of the five generic response modules SHALL provide `response201`, `response202`, `response204`, `response409`, `response422`, `response429` and `response503`, each an object with exactly the properties `statusCode`, `headers` and `body`.
2. FOR each added template, `statusCode` SHALL equal the code in the property name, and `headers` SHALL be the module's shared headers object (same reference as `mod.headers`).
3. THE messages SHALL be: 201 "Created", 202 "Accepted", 204 "No Content", 409 "Conflict", 422 "Unprocessable Content", 429 "Too Many Requests", 503 "Service Unavailable".
4. FOR the codes other than 204, THE bodies SHALL be the output of the module's existing formatter for `(statusCode, message)`:
   1. JSON: `{ message }`.
   2. Text: the message string.
   3. HTML: `<html><head><title>{code} {message}</title></head><body><p>{message}</p></body></html>`.
   4. XML: for 201 and 202, `<?xml version="1.0" encoding="UTF-8" ?><hello>{message}</hello>`; for 409, 422, 429 and 503, `<?xml version="1.0" encoding="UTF-8" ?><error>{message}</error>`.
   5. RSS: for 201 and 202, `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><hello>{message}</hello></rss>`; for 409, 422, 429 and 503, `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>{message}</error></rss>`.
5. THE body of `response204` SHALL be `null` in every module, and THE formatter SHALL NOT be called for it.
6. THE messages SHALL be constants and no template SHALL contain a value taken from a request or from the caller (PLAN.md 4.1).
7. THE ten existing templates (200, 400, 401, 403, 404, 405, 408, 418, 427, 500) SHALL have byte-for-byte the same `statusCode`, `headers` and `body` as in v1.4.1 in all five modules.
8. NO template SHALL be added for any 1xx or 3xx code, and for 205. `response301`, `response302`, `response304` and `response205` SHALL NOT exist on any module (Decision 1).
9. `createGenericResponseModule(contentType, bodyFormatter)` SHALL keep its name, parameters, and return shape, and the format modules SHALL keep their exports (`{ ...mod, json }` and the equivalents). `STATUS_CODE_MAP` SHALL stay unexported.
10. THE package exports in `src/index.js` and `src/lib/tools/index.js` SHALL NOT change, and the export-surface snapshot (`test/config/property/__snapshots__/node-support-export-surface-property-tests.jest.mjs.snap`) SHALL NOT change.

### Requirement 2: XML and RSS render 2xx as success (C4, I2)

**User Story:** As a developer returning XML or RSS, I want a 201 or 202 to render as a success body, so that it is not wrapped in `<error>`.

#### Acceptance Criteria

1. THE XML and RSS formatters SHALL use the success element (`<hello>`) for every status code from 200 to 299 and the error element (`<error>`) for every other code.
2. THE output for 200 and for every code of 400 and above SHALL be identical to v1.4.1, including the "418 " prefix for 418.
3. THE JSON, text and HTML formatters SHALL NOT change.

### Requirement 3: Class fallback in `response()` (Decisions 2 and 8, N1, N2)

**User Story:** As a developer returning a status that has no template, I want a body of the right class, so that a 410 does not say "Internal Server Error" and a 301 carries no body.

#### Acceptance Criteria

1. `response(statusCode)` SHALL parse its argument with `parseInt(statusCode, 10)` as before, and SHALL return `this["response" + code]` when that property is truthy (direct lookup first).
2. WHEN the direct lookup finds nothing, `response()` SHALL return:
   1. `this.response204` for 100 to 199, for 205, and for 300 to 399;
   2. `this.response200` for 200 to 299 other than 205 and other than listed codes;
   3. `this.response400` for 400 to 499 other than listed codes;
   4. `this.response500` for 500 to 599 other than listed codes;
   5. `this.response500` for any other value, including `NaN`, values below 100, and values of 600 and above.
3. THE returned value SHALL be the template object itself, not a copy. FOR example `response(410)` SHALL be `=== this.response400`, its `statusCode` SHALL be 400, and `response(301)` SHALL be `=== this.response204`, whose `body` is `null`.
4. `response()` SHALL read the fallback templates from `this`, so that templates merged into the module by `Response.init()` apply: an application's `response400` SHALL serve every unlisted 4xx, its `response200` every unlisted 2xx other than 205, its `response500` every unlisted 5xx and every non-status value, and its `response204` every 1xx, 3xx and 205.
5. AN application's `response<code>` for an unlisted code, supplied through `Response.init()`, SHALL be returned by direct lookup and SHALL win over every fallback.
6. THE results for these inputs SHALL remain as in v1.4.1: `response(404)`, `response("404")` (same object as `response(404)`), `response(999)`, `response(0)`, `response(-1)` and `response("abc")` (the last four return `response500`).
7. `response()` SHALL NOT add a way to throw and SHALL NOT allocate a new object. IT SHALL NOT throw for `undefined`, `null`, booleans, numbers, bigints, strings, arrays and plain objects. A `Symbol`, or an object whose `toString` throws, still throws from `parseInt`, exactly as in v1.4.1 (measured 2026-11-13; Design, Pre-design measurements).
8. WHEN the template that the class names is missing or falsy on `this` (for example an application passed `response200: undefined` to `Response.init()`), `response()` SHALL return `this.response500`.

### Requirement 4: `Response.reset()` clears the body for a `null` template (Decision 3, C6)

**User Story:** As a developer calling `response.reset({ statusCode: 204 })` on a response that already has a body, I want the body gone, so that a 204 does not carry a stale body.

#### Acceptance Criteria

1. AFTER `reset()` has resolved the body (`obj?.body ?? template.body`) and called `set()`, WHEN the resolved body is exactly `null`, THE `Response` SHALL set its body to `null`.
2. THE only executable change in `src/lib/tools/Response.class.js` SHALL be that assignment in `reset()`. THE executable code of `set()`, `setBody()`, `setBodyToNull()`, `setStatusCode()`, `setHeaders()`, `finalize()` and the constructor SHALL NOT change.
3. `new Response(clientRequest, { statusCode: 204 })` SHALL have status 204, a `null` body, and a `Content-Type` header.
4. `reset({ statusCode: 204 })` on a response that holds a body SHALL leave status 204 and a `null` body.
5. `reset({ statusCode: 204, body: x })` for a non-nullish `x` SHALL keep `x` as the body.
6. `reset({ statusCode: 301, headers: { Location: url } })` SHALL leave status 301, a `null` body, and the supplied headers plus `Content-Type`.
7. `new Response(clientRequest, { statusCode: 201 })` SHALL have status 201 and the 201 template body of the resolved content type. `new Response(clientRequest, { statusCode: 410 })` SHALL have status 410 and the 400 template body. `new Response(clientRequest, { statusCode: 203 })` SHALL have status 203 and the 200 template body.
8. A custom template with `body: null` supplied through `Response.init()` SHALL clear the body on `reset()` of an existing instance (before this change it kept the previous body).
9. WHEN `reset()` is given a supplied `body` that is falsy and not nullish (`''`, `0`, `false`), THE behavior SHALL be as in v1.4.1: the previous body stays.
10. `finalize()` on a response with status 204 and a `null` body SHALL return status 204, `body: null`, and keep `Content-Type`. `finalize()` SHALL continue to add config-derived cache headers under the same conditions as before.
11. THE characterization tests in `test/response/response-set-body-to-null-unit-tests.jest.mjs` for `setBody()` with falsy values and for `reset()` and the constructor with `body: null` at status 200 SHALL pass without change.

### Requirement 5: Deprecation of `response427` (Decisions 4 and 9, C9)

**User Story:** As a maintainer of an application that uses `response427`, I want to be told it is deprecated, so that I can move to `response429` before a future major version removes it.

#### Acceptance Criteria

1. `response427` SHALL remain on all five modules with the same `statusCode`, `headers` and `body` as in v1.4.1 (Requirement 1.7). No template SHALL be removed or relabeled.
2. THE first time per container that `response()` resolves 427 by direct lookup, it SHALL call `DebugAndLog.warn` once with a message that contains `response427`, the word `deprecated`, `427 is not a registered HTTP status`, and `response429`. Later calls that resolve 427 SHALL NOT log.
3. THE flag that limits the warning to one per container SHALL be module-level in `generic.response.js` and SHALL be shared by the five modules.
4. `response()` SHALL return the same template for 427 whether or not it logs. A failure inside logging, including a rejected promise from `DebugAndLog.warn`, SHALL NOT change the returned value, SHALL NOT throw, and SHALL NOT produce an unhandled rejection.
5. `response()` SHALL NOT log for any code other than 427, and reading `mod.response427` directly SHALL NOT log.
6. THE warning message SHALL NOT contain a request value or any application data.
7. `generic.response.js` SHALL require `./DebugAndLog.class`, and loading `src/index.js` SHALL still succeed with no circular require involving `generic.response.js`.
8. THE type declaration of `response427` in `GenericResponseModule` SHALL carry an `@deprecated` tag that says 427 is not a registered HTTP status and names `response429` as the replacement.

### Requirement 6: Type declarations (Decisions 1 and 4, I3)

**User Story:** As a TypeScript developer, I want the new templates in the module type, so that `jsonGenericResponse.response201` compiles.

#### Acceptance Criteria

1. `GenericResponseModule` in `types/lib/tools/index.d.ts` SHALL declare `response201`, `response202`, `response204`, `response409`, `response422`, `response429` and `response503` as `GenericResponseObject`, each with a doc comment in the form of the existing members ("Pre-built response for HTTP 201"), in ascending status order with the existing members.
2. THE doc comment of `response()` in the type SHALL describe the class fallback of Requirement 3 and SHALL no longer say that it falls back to `response500` for unknown codes without qualification.
3. THE doc comment of `GenericResponseObject.body` SHALL state that the body is `null` for 204.
4. `test/types/consumer-tools.ts` SHALL read `response201`, `response204` and `response429` from a module, and the type tests (`test/types/`) SHALL pass.
5. THERE SHALL be no other change in `types/`.

### Requirement 7: JSDoc (I3)

**User Story:** As a developer reading source or IDE hints, I want the factory and `reset()` documented accurately.

#### Acceptance Criteria

1. THE JSDoc of `createGenericResponseModule` SHALL list all member names in `@returns`, state the class fallback, state that `response204` has a `null` body and is the fallback for 1xx, 3xx and 205, state that `response427` is deprecated, and include an `@example` for an unlisted code. THE `@param` names SHALL match the function parameters exactly.
2. THE JSDoc of `Response.reset` SHALL state that the template is chosen by `response(statusCode)` including the class fallback, and that a `null` template body clears the body. THE `@param` names and types SHALL NOT change.
3. THE JSDoc SHALL follow `.kiro/steering/documentation-standards-jsdoc.md`, and the examples SHALL run against the current API.
4. THE documentation validation tests in `test/documentation/` SHALL pass.

### Requirement 8: User documentation (Decisions 6 and 7, I1)

**User Story:** As a developer, I want the status templates, the fallback rule and the 204 behavior documented, so that I know what my application sends and how to customize it.

#### Acceptance Criteria

1. `docs/01-advanced-implementation-for-web-service/response-management.md` SHALL gain a "Generic response templates" section after "Custom Response Templates". It SHALL contain:
   1. a table of the listed codes and their messages;
   2. the class fallback rule, with the 1xx, 3xx and 205 bodiless case and a redirect example that passes `headers: { Location }` to `reset()`;
   3. that `response(n).statusCode` of a fallback is the template's, and that `Response` keeps the status the caller set;
   4. an example that customizes `response400` through `Response.init()` to change every unlisted 4xx, and a statement that an application's `response<code>` wins over any fallback;
   5. that a custom `response500` no longer serves unlisted 2xx and 4xx statuses;
   6. that 204 has no body, that API Gateway REST API removes the body and `Content-Type` of a 204 itself (`docs/cloudfront-notes/lambda-proxy-response-body.md`, observation O12), that only REST API was checked, and that a `null` body on 3xx and 205 has not been checked behind any integration (Decision 6);
   7. a pointer to `Cache-Control` for 2xx responses, since `finalize()` adds `max-age` from `routeExpirationInSeconds` to every status below 400 (PLAN.md S5);
   8. that 427 is not a registered HTTP status, that `response427` is deprecated, and that `response429` replaces it.
2. `docs/features/tools/README.md` SHALL replace the "Generic Response Generators" section so that it matches the real API: module objects with `response(n)`, `response<code>`, `contentType`, `headers`, and the helpers `json(data)`, `html(title, body)`, `xml(body)`, `rss(body)` and `text(text)`. IT SHALL NOT show a module called as a function.
3. USER documentation SHALL describe behavior and SHALL NOT describe internals (`STATUS_CODE_MAP`, the module-level flag, `_body`).
4. `docs/cloudfront-notes/lambda-proxy-response-body.md` and `docs/cloudfront-notes/README.md` SHALL NOT change (Decision 6).
5. EVERY code example SHALL be executable against the current API and SHALL use `Response`, `ClientRequest` and the generic response modules as exported from `@63klabs/cache-data` `tools`.
6. THE Markdown SHALL follow `.kiro/steering/documentation-standards-markdown.md` and the documentation validation tests SHALL pass.

### Requirement 9: Changelog (Decisions 5 and 10; `.kiro/steering/changelog-convention-package.md`)

**User Story:** As an upgrader, I want the changed output listed with old and new values, so that I can tell whether my application is affected.

#### Acceptance Criteria

1. THE CHANGELOG entries SHALL be added in the final task of this spec's `tasks.md`, and not before. The version lookup SHALL be repeated in that task, because `package.json` may have changed since the spec started.
2. THE entries SHALL go under the `## v<version> (unreleased)` heading for the `package.json` version, chosen as follows:
   1. WHEN the heading exists with `(unreleased)`, THE entries go there.
   2. WHEN no heading exists for that version, THE heading SHALL be created directly above the newest existing version heading and below any text at the top of the file. At the time of writing, `package.json` is `1.4.2` and `CHANGELOG.md` starts at `## v1.4.1 (2026-11-12)`, so the heading `## v1.4.2 (unreleased)` is created above it.
   3. WHEN the heading has a release date, THE task SHALL stop and tell the user to run `npm version [major|minor|patch]` first.
   4. WHEN there is more than one `(unreleased)` heading, or an `(unreleased)` version that differs from `package.json`, THE task SHALL stop and ask the user.
3. THE change SHALL NOT write a release date, SHALL NOT write intro prose under the version heading, and SHALL NOT edit any dated section. A correction to a released entry would be a new entry under `(unreleased)`.
4. THE categories SHALL appear in this order, and only those with entries SHALL be created: Fixed, Added, Changed, Deprecated. THE `Breaking Changes` category SHALL NOT be used (Additions beyond PLAN.md, A10).
5. EACH entry SHALL have the form `- **Title** - Description.` with a hyphen and spaces after the bold title, SHALL use backticks for identifiers, and SHALL end with the spec link `[Spec: 1-4-2-generic-responses-for-unlisted-status-codes](.kiro/specs/1-4-2-generic-responses-for-unlisted-status-codes/)` followed, where it applies, by `addresses [#252](<issues-url>/252)`. THE issues URL SHALL come from `bugs.url` in `package.json`. Secondary detail SHALL be in two-space-indented sub-bullets.
6. EACH entry SHALL say what changed in terms of observable behavior, who is affected, and what the reader should do. FOR an entry that corrects a defect, THE affected versions SHALL be stated, determined from git history when the entry is written.
7. THE section SHALL contain these entries:
   1. Fixed: the "Generic Response Generators" section of the tools documentation, which showed modules called as functions.
   2. Added: the seven templates on the five modules, naming the codes, stating that 204 has a `null` body, and stating that it addresses #252 (option 3).
   3. Changed: `response(n)`, the `Response` constructor and `reset()` for an unlisted code use the class fallback (old body "Internal Server Error", new body by class), with examples for 201 and 410. A sub-bullet SHALL state that this release ships the changes as a PATCH and that this departs from AGENTS.md section 2.2 (Decision 10).
   4. Changed: 1xx, 3xx and 205 return no body.
   5. Changed: a custom `response500` no longer serves unlisted 2xx and 4xx statuses, and a custom `response200`, `response400` or `response500` serves the unlisted statuses of its class.
   6. Changed: `reset()` clears the body when the resolved body is `null`.
   7. Changed: XML and RSS render 2xx as success.
   8. Deprecated: `response427`. THE entry SHALL name `response429` as the replacement, state that the `response427` template is kept through all of v1.x and will be removed no earlier than v2.0.0, and state that `response()` logs one `warn` line per container when it resolves 427.

### ### Requirement 10: Tests (Decisions 1 to 4, 8 and 9, I4)

**User Story:** As a maintainer, I want tests that pin each rule, so that a later change to the status list, the fallback or the deprecation fails loudly.

#### Acceptance Criteria

1. THE existing tests SHALL be updated: `KNOWN_STATUS_CODES` and the message table in `generic-response-module-tests.jest.mjs` and `generic-response-module-property-tests.jest.mjs`, the count in the "all N response objects" test title, the `EXPECTED_OUTPUTS` of each format, and Property 3 of `generic-response-module-tests.jest.mjs`, which is replaced by the properties in item 3.
2. UNIT tests SHALL cover, for each of the five modules: every added template (status, headers identity, body per Requirement 1.4), the `null` body of `response204`, the XML and RSS `<hello>` form for 201 and 202 and the `<error>` form for 409, 422, 429 and 503, and the unchanged output for 200 and the existing error codes.
3. PROPERTY tests (fast-check) SHALL cover:
   1. a drift guard: for each module, the set of keys matching `^response\d+$` equals one shared list of listed codes;
   2. FOR every listed code, `response(code)` is `mod["response" + code]` and its `statusCode` equals the code;
   3. FOR integers in 200 to 299 other than 205 and other than listed codes, `response(n)` is `=== response200`; in 400 to 499 other than listed codes, `=== response400`; in 500 to 599 other than listed codes, `=== response500`;
   4. FOR integers in 100 to 199, 300 to 399, and 205, `response(n)` is `=== response204` and its `body` is `null`;
   5. FOR integers below 100 or at or above 600, and for non-numeric strings, `response(n)` is `=== response500`;
   6. FOR every 2xx listed code, the XML and RSS bodies contain `<hello>`, and for every other listed code they contain `<error>`.
4. GENERATORS SHALL be built from the range with the listed codes filtered out by a constant list held in the test. No generator SHALL be filtered by the predicate the property asserts, and no `fc.assert` call SHALL pass a `seed` option (`.kiro/steering/test-execution-monitoring.md`).
5. `Response` tests SHALL cover Requirement 4.3 to 4.10, the precedence of an application's `response<code>` (Requirement 3.5), and the class templates under `Response.init()` customization (Requirement 3.4). BECAUSE `Response.init()` is one-shot, tests that depend on it SHALL use subprocess isolation or the isolation pattern of the existing `Response` tests. Subprocess tests SHALL invoke the Jest binary or Node directly, never `npm test`, and SHALL capture stderr when asserting on log output.
6. DEPRECATION tests SHALL cover Requirement 5.2 to 5.5: the first `response(427)` logs once, the second does not, other codes do not, direct property reads do not, the returned value is unchanged, and a rejected `DebugAndLog.warn` does not propagate. EACH case that depends on the module-level flag SHALL run in its own child process started with `spawnSync(process.execPath, [...])` and no shell, with stdout and stderr captured. In-process tests that resolve 427 SHALL silence `DebugAndLog.warn` with a spy and SHALL NOT assert on the one-time behavior.
7. THE existing characterization tests named in Requirement 4.11 SHALL pass without change.
8. THE type tests SHALL cover Requirement 6.4.
9. `npm test` SHALL pass, `npm test -- test/documentation/` SHALL pass, and `npm run lint` SHALL report no new problem in the files this change touches (`npm run lint:ci` fails on the repository baseline and is not the criterion).
10. NO test SHALL use real AWS services or the network.

### Requirement 11: Backwards compatibility and release (Decisions 5 and 10)

**User Story:** As an existing user, I want every call that already supplies its own body to behave as before.

#### Acceptance Criteria

1. THE package exports SHALL keep their names and kinds, and no export SHALL be added to `src/index.js` or `src/lib/tools/index.js`. The new templates are properties of already exported module objects.
2. NO public method SHALL change its name, signature, return type, or parameter order.
3. FOR every call that supplies a non-nullish `body`, `Response` SHALL return the same status code, headers and body as v1.4.1.
4. FOR every listed code of v1.4.1, `response(n)` SHALL return an equal template to v1.4.1.
5. THE change SHALL ship in v1.4.2, which is unreleased. THE `package.json` version SHALL stay `1.4.2`. THE classification as a PATCH is a recorded exception to AGENTS.md section 2.2 (Decision 10). `AGENTS.md` SHALL NOT be edited by this change.
6. THE spec directory name SHALL stay `1-4-2-generic-responses-for-unlisted-status-codes`.

### Requirement 12: Accuracy and consistency of the documentation set (Decision 7)

**User Story:** As a reader, I want every file to give the same answer on which statuses have templates and what the fallback does.

#### Acceptance Criteria

1. A SEARCH of the documentation set for `response427` SHALL show only text that says it is deprecated and names `response429`, apart from the CHANGELOG entries of earlier versions.
2. A SEARCH of the documentation set for `Internal Server Error` and `response500` SHALL show no statement that contradicts the class fallback.
3. THE list of listed codes SHALL be the same in the JSDoc of `createGenericResponseModule`, the type declarations, `response-management.md`, and the CHANGELOG.
4. NO file in the documentation set SHALL show `jsonGenericResponse`, `htmlGenericResponse`, `xmlGenericResponse`, `rssGenericResponse` or `textGenericResponse` called as a function.

## Consumer-visible behavior changes

Relative to v1.4.1, the last release. The "Category" column is the CHANGELOG category (Requirement 9.7).

| # | Change | Who is affected | Category | Decisions |
|---|--------|-----------------|----------|-----------|
| 1 | Seven new templates (201, 202, 204, 409, 422, 429, 503) on the five modules. A `Response` built for one of them without a body gets its template instead of the 500 body. 204 has a `null` body | Developers who create these statuses without a body. Applications that supply their own body see no change | Added | 1 |
| 2 | `response(n)`, the constructor and `reset()` for an unlisted 2xx now give the 200 body, and for an unlisted 4xx the 400 body, instead of the 500 body. An unlisted 5xx and a non-status value still give the 500 body | Developers who send an unlisted status without a body | Changed | 2 |
| 3 | 1xx, 3xx and 205 now give no body instead of the 500 body | Developers who send a redirect or 304 without a body | Changed | 8 |
| 4 | A custom `response500` no longer serves unlisted 2xx and 4xx statuses. A custom `response200`, `response400` or `response500` serves the unlisted statuses of its class | Applications that customized `response500` through `Response.init()` | Changed | 2, N1, N2 |
| 5 | `reset()` clears the body when the resolved body is `null` | Applications with a custom template whose body is `null`, and everyone using the 204 template on an existing instance | Changed | 3 |
| 6 | XML and RSS render 2xx as `<hello>` | Applications that return XML or RSS with a 2xx other than 200 | Changed | C4 |
| 7 | `response427` is deprecated; `response()` logs one `warn` line per container when it resolves 427; `response429` is the replacement | Applications that use `response427` or `Response` with status 427 | Deprecated | 4, 9 |
| 8 | The "Generic Response Generators" section of the tools documentation shows the real API | Developers who copied the old examples | Fixed | 7 |

The JSDoc and type comments, and the new documentation section, describe behavior and have no changelog entry of their own.

## Traceability

| Requirement | Decision Log |
|---|---|
| 1. Templates | Decision 1, C1, C2, C10, Section 4.1 |
| 2. XML and RSS 2xx | C4, I2 |
| 3. Class fallback | Decisions 2 and 8, N1, N2, RFC 9110 sections 15.3.5, 15.3.6, 15.4.5 |
| 4. `reset()` | Decision 3, C6, C8 |
| 5. Deprecation of `response427` | Decisions 4 and 9, C9, I5 |
| 6. Type declarations | Decisions 1 and 4, I3 |
| 7. JSDoc | I3 |
| 8. User documentation | Decisions 6 and 7, I1, S5, N2 |
| 9. Changelog | Decisions 5 and 10, `.kiro/steering/changelog-convention-package.md` |
| 10. Tests | Decisions 1 to 4, 8, 9, I4, C10, gap 7 |
| 11. Backwards compatibility and release | Decisions 5 and 10 |
| 12. Accuracy and consistency | Decision 7, I1 |

## Additions beyond PLAN.md

These choices were made while writing this document and are open to veto. Each is recorded here and nowhere else yet.

- **A1.** The deprecation message text is fixed in Requirement 5.2 (it must contain `response427`, `deprecated`, `427 is not a registered HTTP status` and `response429`). PLAN.md Section 6 gave an example sentence only.
- **A2.** A failure in `DebugAndLog.warn`, including a rejected promise, must not change the return value or surface as an unhandled rejection (Requirement 5.4). `DebugAndLog.warn` is `async`, so an error inside it is a rejected promise.
- **A3.** The class ranges apply to the integer produced by `parseInt`, so `response("404.7")` still resolves to 404 as before and `response("410abc")` resolves to the 400 fallback (Requirement 3.1).
- **A4.** `response()` adds no throw path and allocates nothing (Requirement 3.7), so a hot path in `Response.reset()` costs a lookup and at most a range check. A `Symbol` argument still throws from `parseInt`, as before; the requirement does not promise more than v1.4.1 did.
- **A5.** The HTML titles of the new templates follow the existing pattern `{code} {message}`; `HTML_TITLE_MAP` (200 and 500 only) does not change (Requirement 1.4.3).
- **A6.** The export-surface snapshot must stay unchanged (Requirement 1.10), because the new templates are not new exports.
- **A7.** The CHANGELOG gets one Fixed, one Added, five Changed and one Deprecated entry (Requirement 9.7), not one entry per code. Categories follow the order in `changelog-convention-package.md` (Fixed before Added).
- **A8.** The documentation example for customizing `response400` is a required part of the new section (Requirement 8.1.4), because it is the supported way to change the body of every unlisted 4xx.
- **A9.** The property for unlisted 2xx excludes 205 because 205 takes the bodiless fallback (Requirement 10.3.3 and 10.3.4).
- **A10.** The changed output is logged under Changed, not Breaking Changes. No call that supplies its own body changes, and Decision 5 classes the release as a PATCH. The convention says to stop and ask the user if a Breaking Changes entry is logged without a major bump, so the final task asks first if the classification is questioned.
- **A11.** The CHANGELOG heading is created in the final task, not while writing the spec. The read-only version check at spec start found `package.json` 1.4.2 and no `## v1.4.2` heading, which the convention allows.
- **A12.** A missing class template falls through to `response500` (Requirement 3.8). `{ ...base, ...custom }` in `Response.init()` lets an application overwrite a built-in key with `undefined`, which would otherwise make `response()` return `undefined`.

## Out of scope

- Templates for any 1xx or 3xx status, and for 205 (Decision 1).
- A redirect helper or a template `Location` header. The caller passes `headers` to `reset()` (PLAN.md 4.1).
- Any change to `set()`, `setBody()`, `setBodyToNull()`, `setStatusCode()`, `setHeaders()` or `finalize()`, other than the one `reset()` line (Requirement 4.2).
- Skipping config-derived cache headers for 2xx, 202, 204 or 3xx responses (S5, note only).
- The `Response.init()` XML-slot defect (S1, `1-4-2-response-init-xmlresponses-overwrites-html-templates`) and the `setStatusCode()` content-type defect (S3, `1-4-2-response-set-status-code-resets-content-type-to-json`). Tests here must not put templates in the XML slot of `Response.init()`, and must pass an explicit content type where a non-JSON template is expected from `reset({ statusCode })`.
- A runtime check on HTTP API, Application Load Balancer, Lambda function URLs, CloudFront, or on a `null` body for 3xx and 205 (Decision 6).
- Editing `AGENTS.md` or creating an issue to review its versioning rules (Decision 10). `AGENTS.md` section 2.2 and the stale `Current version: 1.3.6` line were still as before when the user updated AGENTS.md on 2026-11-13.
- Creating the `## v1.4.2 (unreleased)` heading before the final task, writing a release date or intro prose (done by the `release-changelog-package` skill, which only the user runs).
- Removing or relabeling `response427`, which is a major-version decision.
- Runtime warnings for direct reads of `response427` (Decision 9).
