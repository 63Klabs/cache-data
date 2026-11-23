# Requirements Document

## Introduction

`Response.init()` accepts a template per status code for each of five formats, and each template carries a `headers` object with a `Content-Type`. When the `Response` constructor or `Response.reset()` builds a response from a template, it passes the format to `set()`, whose last line writes `Response.CONTENT_TYPE` for that format over the template's `Content-Type` (`src/lib/tools/Response.class.js`, `reset` and `set`). A `Content-Type` in the `headers` of the constructor or `reset()` object is read as a format selector, and any value other than the five `CONTENT_TYPE` strings and the codes `"JSON"`, `"HTML"`, `"XML"`, `"RSS"` and `"TEXT"` throws from `getGenericResponses()`. Two further behaviors block a fix that only keeps the template header: `finalize()` stringifies a JSON body only when the header equals `application/json` exactly, so `application/problem+json` with an object body is sent as `[object Object]`; and `getContentTypeCode()` returns `undefined` for any other type, which `_log()` writes into the CloudWatch response log (PLAN.md C1 to C11, F1, F2).

This feature (1) makes a response built by the constructor or `reset()` carry the supplied header, else the template header, else the format constant; (2) stops the constructor and `reset()` from throwing for a `Content-Type` header that is not one of the five, and matches such a header to a format by media type; (3) ignores a supplied or template `Content-Type` that contains a control character, so the wider set of accepted values cannot carry a line break into a response header (Decision 11); (4) makes `finalize()` stringify bodies for `application/json` and `+json` media types; (5) makes `getContentTypeCode()` match by media type; (6) adds tests, JSDoc and documentation; and (7) records the change in `CHANGELOG.md`. It does not change any exported name, signature, type declaration, constant or template.

The change ships in v1.4.2, which is unreleased, as a PATCH, a documented exception to AGENTS.md section 2.2 (Decision 9). Decisions are recorded in [PLAN.md](PLAN.md); references such as (Decision 2) or (C5) point there. All decisions are locked. Not in scope (Decisions 5, 8, 10 and 11):

- `set()`, `setBody()`, `setStatusCode()` and `setHeaders()`. They keep re-inferring `Content-Type`. The sibling spec [1-4-2-response-set-status-code-resets-content-type-to-json](../1-4-2-response-set-status-code-resets-content-type-to-json/ISSUE.md) decides that rule.
- Control characters in a value passed to `addHeader()`, `setHeaders()` or `set()`, and in any header other than the two named in Requirement 2. They are not checked today and stay unchecked here. They are tracked in [1-4-2-response-headers-accept-control-characters](../1-4-2-response-headers-accept-control-characters/ISSUE.md).
- `Response.CONTENT_TYPE` and the module `contentType` properties.
- Case-insensitive header names, tracked in [1-4-2-response-header-names-are-matched-case-sensitively](../1-4-2-response-header-names-are-matched-case-sensitively/ISSUE.md).
- A `null` object passed to `reset()` or `set()`, tracked in [1-4-2-response-reset-and-set-throw-on-a-null-object](../1-4-2-response-reset-and-set-throw-on-a-null-object/ISSUE.md).
- `settings.contentType` not being used for an object without a body. It is carried into the sibling spec named above.

## Glossary

- **Response**: the `Response` class in `src/lib/tools/Response.class.js`, including its constructor and its static and instance methods. Requirements name it as the actor for every behavior of that file.
- **Implementation**, **Documentation**, **Changelog Entry** and **Final Task**: the code, docs, `CHANGELOG.md` entry and last task of `tasks.md` that this feature produces. **Test File** is any one of the four new test files, and **Tests** are all of them.
- **Format**: one of `JSON`, `HTML`, `XML`, `RSS` and `TEXT`. Each has a **format code** (the same word), a **constant** (`Response.CONTENT_TYPE[format]`) and a template slot read by `Response.getGenericResponses(format)`.
- **Media type** of a value: the text before the first `;`, trimmed of whitespace and converted to lower case. The media type of `text/html; charset=utf-8` is `text/html`.
- **Control character**: a character from U+0000 to U+001F, or U+007F. A line feed, a carriage return and a horizontal tab are control characters.
- **Selecting value**: a string that selects format F because it equals the format code of F, equals the constant of F, or has the same media type as the constant of F. The media types of the five constants are `application/json`, `text/html`, `application/xml`, `application/rss+xml` and `text/plain`. A value that is not a string, an empty or all-whitespace string, or a string that contains a Control character selects nothing.
- **JSON media type**: a media type that is `application/json`, or has the form `type/subtype` where `subtype` ends with `+json` and has at least one character before `+json`.
- **Supplied header**: the property `"Content-Type"` (exact key, case-sensitive, as today) of the `headers` object passed in the first argument of the constructor or `reset()`, when it is a string that contains at least one non-whitespace character and no Control character.
- **Template header**: the property `"Content-Type"` of the `headers` object of the template that `getGenericResponses(format).response(statusCode)` returns, when it is a string that contains at least one non-whitespace character and no Control character.
- **Resolved value**: a Supplied header or Template header value, except that a value equal to a format code is replaced by the constant of that format. Otherwise the value is used exactly as given: no parameter is added or removed and the case is not changed.
- **Template-built response**: a `Response` produced by the constructor or by `reset()`, which load a template for the status code.
- **Once-per-process rule**: `Response.init()` takes effect on the first call only. Each Jest test file has its own module registry, so a test file that customizes templates calls `init()` once at module level.
- **Affected application**: an application whose template `Content-Type` differs from the constant for its format, or that passes a constructor or `reset()` `Content-Type` header that is not one of the five values, or that sends a `+json` type.

## Requirements

### Requirement 1: Format selection from a `Content-Type` header (C3, Decisions 2, 6, 11)

**User Story:** As a developer, I want to pass `headers: { "Content-Type": "text/html" }` to the constructor or `reset()`, so that I get a response and not an exception.

#### Acceptance Criteria

1. WHEN the constructor or `reset()` is called with a non-null `contentType` argument, THE Response SHALL select the format by passing the argument to `Response.getGenericResponses()`.
2. IF `Response.getGenericResponses()` does not accept the `contentType` argument, THEN THE Response SHALL throw the same error as before this change. This includes `Response.CONTENT_TYPE.JAVASCRIPT`, `CSS` and `CSV`.
3. WHEN the `contentType` argument is `null` and the Supplied header is a Selecting value for format F, THE Response SHALL use the templates of F.
4. WHEN the `contentType` argument is `null` and the object has no Supplied header, THE Response SHALL select the format from `Response.inspectBodyContentType(obj.body)`, with the `settings.contentType` value (`Response.getContentType()`) as the fallback when that returns `null`.
5. WHEN the `contentType` argument is `null` and the `Content-Type` property of `headers` is not a Selecting value for any format, THE Response SHALL select the format as it does under criterion 4.
6. WHEN the `Content-Type` property of `headers` is present but is not a Supplied header, THE Response SHALL treat the property as absent. Examples are `undefined`, `""`, a number and a string that contains a Control character. Before this change `undefined`, `""` and a number threw, and `null` was already treated as absent.
7. WHEN the `contentType` argument is `null`, THE Response SHALL accept any value of the `Content-Type` property of `headers` without throwing. This includes `text/html`, `application/atom+xml`, `application/problem+json`, `application/javascript` and `text/html; charset=utf-8`.
8. THE Response SHALL select, for every value that selected a format before this change, the same format.

### Requirement 2: The `Content-Type` of a template-built response (C1, Decisions 1, 2a, 7, 11)

**User Story:** As a developer who customizes a template, I want a response built from it to carry the template's `Content-Type`, so that I can send `application/problem+json` or `application/atom+xml` without calling `addHeader()` afterwards.

#### Acceptance Criteria

1. WHEN a Template-built response is created and a Supplied header exists, THE Response SHALL set the `Content-Type` of the response to the Resolved value of the Supplied header.
2. WHEN a Template-built response is created, no Supplied header exists, and a Template header exists, THE Response SHALL set the `Content-Type` of the response to the Resolved value of the Template header. This includes the case where the first argument carries a `headers` object without a `Content-Type`.
3. WHEN a Template-built response is created and neither a Supplied header nor a Template header exists, THE Response SHALL set the `Content-Type` of the response to `Response.CONTENT_TYPE` for the selected format.
4. THE Response SHALL apply criteria 1 to 3 to the constructor and to `reset()`, with and without a `contentType` argument, and to every format.
5. WHEN a Supplied header or Template header equals a format code (`"JSON"`, `"HTML"`, `"XML"`, `"RSS"` or `"TEXT"`), THE Response SHALL set the `Content-Type` of the response to the constant of that format. Before this change `headers: { "Content-Type": "JSON" }` produced the header value `JSON`.
6. THE Response SHALL write the Resolved value exactly as given. A template that carries `text/html` produces `text/html` with no `charset` added, and `application/problem+json` stays `application/problem+json`.
7. IF the `Content-Type` property of the supplied `headers` object or of the template's `headers` object is a string that contains a Control character, THEN THE Response SHALL set the `Content-Type` of the response as if that property were absent.
   7.1. SEC-REQ-2.7-SEM-113-1 [SECURITY: header-injection-prevention] THE Response SHALL NOT place a Control character in the `Content-Type` header of a Template-built response.
8. WHEN criterion 7 applies, THE Response SHALL write one warning to the log per container that names the rule and does not contain the rejected value.
9. IF writing the warning of criterion 8 fails, THEN THE Response SHALL still build the response.
10. WHEN a Supplied `headers` object is given, THE Response SHALL set the other headers of the response to a copy of that object, and the other headers of the template are not merged in.
11. WHEN no `headers` object is given, THE Response SHALL set the other headers of the response to a copy of the template's `headers`.
12. THE Response SHALL leave the template objects and the `headers` object passed by the caller unmodified.
13. THE Response SHALL give two responses built from the same template separate `headers` objects, so that `addHeader()` on one does not change the other.
14. THE Response SHALL keep the status code, body and null-body handling of `reset()` as before this change: `obj?.statusCode ?? 200`, `obj?.body ?? template body`, and a `null` template body clears the body.
15. WHEN construction or `reset()` completes, THE Response SHALL return the Resolved value from `response.getContentType()` and from `response.getHeaders()["Content-Type"]`.
16. WHEN `finalize()` receives an `Error` body and calls `reset({ statusCode: 500 })`, THE Response SHALL set the `Content-Type` of the resulting response under criteria 1 to 3.

### Requirement 3: `finalize()` serializes JSON media types (F1, Decision 3)

**User Story:** As a developer whose template sends `application/problem+json`, I want `finalize()` to stringify an object body, so that the response body is JSON and not `[object Object]`.

#### Acceptance Criteria

1. WHEN `finalize()` runs and the `Content-Type` header is a string whose media type is a JSON media type, THE Response SHALL apply the existing JSON rules: a string or number body, other than the existing `404` reset case, is placed in an array, and the body is passed through `JSON.stringify`.
2. THE Response SHALL keep the existing JSON rules unchanged for a header equal to `Response.CONTENT_TYPE.JSON`, including that a `null` body stays `null`.
3. WHEN the `Content-Type` header is not a string, or its media type is not a JSON media type, THE Response SHALL send `${body}` as it does today.
4. WHEN the `Content-Type` header is `application/json; charset=utf-8`, THE Response SHALL serialize the body as JSON. Before this change a header with a parameter was sent as `${body}`.
5. THE Response SHALL NOT throw in `finalize()` because of the type of the `Content-Type` header value.
6. THE Response SHALL NOT change the `Content-Type` header value in `finalize()`, except by the existing rule that sets it from `getContentType()` when the key is absent.

### Requirement 4: `getContentTypeCode()` matches by media type (F2, Decision 4)

**User Story:** As an operator reading the response log, I want the content-type field to name the format of a `text/html` or `+json` response, so that it is not logged as `undefined`.

#### Acceptance Criteria

1. THE Response SHALL return from `getContentTypeCode()` the key of the first entry of `Response.CONTENT_TYPE` whose value equals the result of `getContentType()` exactly, as it does today.
2. WHEN no entry equals the result of `getContentType()` exactly, THE Response SHALL return from `getContentTypeCode()` the key of the first entry of `Response.CONTENT_TYPE` that has the same media type. So `text/html` returns `HTML` and `application/json; charset=utf-8` returns `JSON`.
   2.1. SEC-REQ-4.2-SEM-248-1 [SECURITY: input-type-tolerance] IF the result of `getContentType()` is not a string, THEN THE Response SHALL return `undefined` from `getContentTypeCode()`.
   2.2. SEC-REQ-4.2-SEM-248-2 [SECURITY: input-type-tolerance] IF the result of `getContentType()` is not a string, THEN THE Response SHALL NOT throw from `getContentTypeCode()`.
3. WHEN no entry matches by media type and the media type is a JSON media type, THE Response SHALL return `JSON` from `getContentTypeCode()`.
4. WHEN nothing matches, THE Response SHALL return `undefined` from `getContentTypeCode()`, as today. A custom type such as `application/atom+xml` still returns `undefined`.
5. THE Response SHALL return the same result from `getContentTypeCode()` as before this change for every value that matched before.
6. THE Response SHALL write the content-type field of the response log from the result of `getContentTypeCode()`, with the same field order and the same number of fields as before this change.
7. THE Response SHALL leave `getContentType()`, `inspectContentType()`, `inspectHeaderContentType()` and `inspectBodyContentType()`, static and instance, unchanged.

### Requirement 5: Everything else is unchanged (C2, Decisions 5, 6, 8, 11)

**User Story:** As an existing user, I want every other call on `Response` to behave as before, so that upgrading to v1.4.2 changes only the cases named in this document.

#### Acceptance Criteria

1. THE Response SHALL leave `set()`, `setBody()`, `setStatusCode()`, `setHeaders()`, `setBodyToNull()`, `addHeader()`, `addToJsonBody()` and `setMessage()` unchanged, including the final `addHeader('Content-Type', contentType)` in `set()`.
2. WHEN `reset()` has called `set()`, THE Response SHALL apply Requirement 2 to the headers of the response.
3. THE Response SHALL leave `Response.getGenericResponses()` unchanged, including its `Content Type: ... is not implemented for getResponses` error for an unknown value.
4. THE Response SHALL leave the values of `Response.CONTENT_TYPE` unchanged, whatever a `contentType` property or header in a custom template says.
5. THE Implementation SHALL leave the generic response modules (`generic.response*.js`), `Response.init()`, `src/lib/tools/index.js`, `src/index.js` and `types/lib/tools/index.d.ts` unchanged. No export, signature or type is added or removed.
6. THE Implementation SHALL keep every new helper private to `Response.class.js` (a `#` static member or an unexported function) and out of every `index.js`.
7. THE Implementation SHALL make the media-type, JSON-media-type and control-character helpers pure and stateless.
   7.1. SEC-REQ-5.7-SEM-1333-1 [SECURITY: bounded-input-processing] THE Response SHALL run the media-type, JSON-media-type and control-character helpers in time linear in the length of the value.
8. THE Response SHALL NOT validate or sanitize the `Content-Type` value in any way other than the Control character rule of Requirement 2, criterion 7.
9. THE Response SHALL NOT write a `Content-Type` header value to a log. The response log continues to carry the content-type code.
10. THE Implementation SHALL NOT modify an existing test file.
11. IF an existing test fails because of this change, THEN THE Implementation SHALL stop and report the failing test to the user, and SHALL NOT edit the test to pass.
12. THE Implementation SHALL NOT add, remove or update a dependency in `package.json` or `package-lock.json`.

### Requirement 6: Tests (Decisions 1 to 4, 6, 11; AGENTS.md 2.3)

**User Story:** As a maintainer, I want tests that fail on the old behavior and pin the new rules, so that the template header, the no-throw rule, the control character rule and the JSON media type rule cannot regress.

#### Acceptance Criteria

1. THE Test File `test/response/response-template-content-type-unit-tests.jest.mjs` (file A) SHALL call `Response.init()` once at module level with custom templates for all five formats. Each custom template carries a distinct `Content-Type` that differs from the format constant, and one carries `application/problem+json`.
2. THE Test File A SHALL assert Requirement 2 criteria 1 to 4 and 12 to 16, for the constructor and `reset()`, with and without a `contentType` argument, including a template whose `headers` has no `Content-Type` and a template with no `headers`.
3. THE Test File `test/response/response-content-type-header-unit-tests.jest.mjs` (file B) SHALL leave the templates uncustomized: it calls `Response.init()` with `settings` only, or not at all.
4. THE Test File B SHALL assert Requirement 1, including `text/html`, `application/atom+xml`, `application/javascript`, `application/json; charset=utf-8`, a non-string value, an empty string, and an unknown `contentType` argument that still throws.
5. THE Test File B SHALL assert Requirement 2 criteria 5, 6, 10 and 11: codes, exact value, and other headers. It SHALL also assert that a call with no `Content-Type` header gives the same headers as before this change.
6. THE Test File B SHALL assert Requirement 2 criteria 7 to 9: a supplied value containing a line feed, a carriage return, a horizontal tab, U+0000 or U+007F is not used, the format constant is used when no other value exists, one warning is logged per module registry, the warning does not contain the value, and a failing logger does not stop the response.
7. THE Test File `test/response/response-finalize-json-media-type-unit-tests.jest.mjs` (file C) SHALL assert Requirement 3 for `application/problem+json`, `application/vnd.api+json` and `application/json; charset=utf-8` with object, array, string and number bodies, for `application/json` unchanged, and for `application/atom+xml` and a non-string header with a string body.
8. THE Test File C SHALL assert Requirement 4 for `getContentTypeCode()`, including a non-string `getContentType()` result, and SHALL check that `_log()` still emits the same number of fields.
9. THE Test File `test/response/response-template-content-type-property-tests.jest.mjs` (file D) SHALL call `Response.init()` once at module level with custom templates for all five formats.
10. THE Test File D SHALL include a property over every integer status code from 100 to 599 and every format, asserting that a Template-built response carries the `Content-Type` of the template that `getGenericResponses(format).response(statusCode)` returns, resolved as in Requirement 2.
11. THE Test File D SHALL include a property over generated header values that are not Selecting values and contain no Control character, asserting that the constructor does not throw and the response carries the value exactly as given. The generator builds `application/x-` followed by a string drawn from `[a-z0-9.+-]`, and file D contains a test that no format constant has a media type beginning `application/x-`. The generator is not filtered by the predicate the property asserts.
12. THE Test File D SHALL include a property over generated header values that contain a Control character, asserting that the constructor does not throw and the response `Content-Type` does not contain a Control character. The generator builds a prefix, one character drawn from U+0000 to U+001F and U+007F, and a suffix, so that no draw is filtered.
13. THE Test File D SHALL include a property over generated plain-object bodies and generated `+json` media types, asserting that `finalize()` returns `JSON.stringify` of the body. The generator builds the subtype as a non-empty string drawn from `[a-z0-9.-]` followed by `+json`.
14. THE Test File D SHALL use `numRuns` of at least 100 in each property.
15. THE Test File D SHALL NOT pass a `seed` option to `fc.assert`.
16. THE Test File D SHALL include a test that passes a `Content-Type` value of 100,000 characters, made of repeated `;`, `+`, space and `json` characters, to the constructor and to `finalize()`, and that completes within the default Jest timeout.
17. THE Test File SHALL carry a header comment in the format of `test/response/response-generic-templates-custom-unit-tests.jest.mjs` (purpose, setup, teardown, related tests) and SHALL state that `Response.init()` is called once per file.
18. THE Test File SHALL be named `*-unit-tests.jest.mjs` or `*-property-tests.jest.mjs`.
19. THE Test File SHALL call `jest.restoreAllMocks()` in `afterEach` when it uses a spy.
20. THE Test File SHALL NOT start a child process, call `npm test` or call AWS.
21. WHEN the new tests run before the code change, THE Tests SHALL fail for Requirement 1 criteria 5, 6 and 7, Requirement 2 criteria 1, 2 and 5, and Requirement 3 criterion 1, for the reasons in PLAN.md. Those reasons are that the constructor throws, the template header is replaced, the code is written literally, and the body is `[object Object]`.
22. WHEN the new tests run after the code change, THE Tests SHALL pass.
23. THE Test File A SHALL assert Requirement 2 criteria 7 and 8 for a template `Content-Type` that contains a line feed: the value is not used and the format constant is used.

### Requirement 7: JSDoc and documentation (I4, Decisions 7, 8, 11)

**User Story:** As a developer, I want the documentation to describe which `Content-Type` a template-built response carries and which calls re-infer it, so that I do not have to read the source.

#### Acceptance Criteria

1. THE JSDoc of the `Response` constructor, `reset()`, `getContentTypeCode()` and `finalize()` SHALL describe the rules of Requirements 1 to 4.
2. THE JSDoc of each method named in criterion 1 SHALL keep its `@param` names, `@returns`, `@example` and `@throws` tags in agreement with the implementation.
3. THE JSDoc `@throws` of the constructor and `reset()` SHALL state that an unknown `contentType` argument throws and that a `Content-Type` header value does not.
4. THE Documentation `docs/01-advanced-implementation-for-web-service/response-management.md` SHALL replace the paragraph that says a template-built response carries `Response.CONTENT_TYPE.XML` and not the template's `Content-Type`. That paragraph follows the `xmlResponses` example in "Custom Response Templates".
5. THE new text of criterion 4 SHALL give the order supplied header, template header, format constant, and SHALL show a template that sends `application/problem+json` or `application/atom+xml`.
6. THE Documentation SHALL state that `setBody()`, `setStatusCode()` and `setHeaders()` can set `Content-Type` again from the body or headers they receive, so that `addHeader('Content-Type', ...)` after the last of them keeps a custom type.
7. THE Documentation SHALL name the sibling spec `1-4-2-response-set-status-code-resets-content-type-to-json` as the place that decides the rule of criterion 6, and SHALL NOT state that a template header survives those calls.
8. THE Documentation SHALL state that a template `Content-Type` is sent exactly as written, so an HTML template should use `text/html; charset=utf-8`.
9. THE Documentation `docs/01-advanced-implementation-for-web-service/configuration-options.md` SHALL change its `htmlResponses` example from `text/html` to `text/html; charset=utf-8`.
10. THE Documentation SHALL state that a `Content-Type` value that contains a control character, such as a line feed or carriage return, is ignored in a supplied header or a template header, and that other values are not validated.
11. THE Documentation SHALL state that an application must not build a `Content-Type` value from request data.
12. THE Documentation SHALL state that a custom `contentType` property of a template module does not change `Response.CONTENT_TYPE`.
13. THE Documentation SHALL state that a `Content-Type` header with a `+json` type is serialized as JSON.
14. THE Documentation SHALL note that a type outside the five can affect API Gateway `binaryMediaTypes` and compression settings and CloudFront compression, and that this was not verified.
15. THE Documentation SHALL change `docs/features/tools/README.md` only if it describes the behavior that changes.
16. THE Documentation examples SHALL follow `documentation-standards-markdown.md` (language-tagged blocks, `const { tools } = require('@63klabs/cache-data')`, realistic values) and SHALL run as written.
17. THE Documentation examples SHALL use static template bodies and SHALL contain no credentials, account identifiers or real host names.
18. THE documentation tests under `test/documentation/` and `node scripts/audit-documentation.mjs` SHALL pass.

### Requirement 8: CHANGELOG (Decision 9)

**User Story:** As a developer who upgrades, I want to know that template `Content-Type` headers now apply, so that I can review templates whose header differs from the format default.

#### Acceptance Criteria

1. THE Final Task of `tasks.md` SHALL repeat the version lookup in `.kiro/steering/changelog-convention-package.md` (`package.json` is 1.4.2 and `CHANGELOG.md` has `## v1.4.2 (unreleased)`).
2. IF the `## v1.4.2` heading of `CHANGELOG.md` carries a date, THEN THE Final Task SHALL stop and tell the user to run `npm version [major|minor|patch]`.
3. THE Changelog Entry SHALL be one entry under `### Fixed` in `## v1.4.2 (unreleased)`, in the format `- **Title** - Description. [Spec: ...](...)`.
4. THE Implementation SHALL leave every heading, dated section, intro text and existing entry of `CHANGELOG.md` unchanged.
5. THE Changelog Entry SHALL say that a `Response` built from a template or by the constructor carries the supplied header, else the template header, else the format constant.
6. THE Changelog Entry SHALL say that a `Content-Type` header that is not one of the five values no longer throws, and that a value containing a control character is ignored.
7. THE Changelog Entry SHALL say that `finalize()` now serializes `+json` types and `application/json` with parameters as JSON, and that `getContentTypeCode()` and the response log now report `HTML` for `text/html` and `JSON` for a JSON media type.
8. THE Changelog Entry SHALL state "Affects v1.2.2 through v1.4.1".
9. THE Changelog Entry SHALL tell applications whose template `Content-Type` differs from the format default, including an HTML template written as `text/html`, to review the header they now send.
10. THE Changelog Entry SHALL state in a sub-bullet that it ships as a PATCH and departs from AGENTS.md section 2.2, as the existing entries of this release do.
11. THE Changelog Entry SHALL link `[Spec: 1-4-2-response-generic-template-content-type-header-is-ignored](.kiro/specs/1-4-2-response-generic-template-content-type-header-is-ignored/)`.
12. THE Changelog Entry SHALL NOT contain an `addresses [#N]` reference, because no GitHub issue exists.
13. THE Changelog Entry SHALL NOT claim that `setBody()`, `setStatusCode()` or `setHeaders()` preserve a custom `Content-Type`.

### Requirement 9: Validation

**User Story:** As a maintainer, I want the full suite to pass before this change is committed, so that the npm publish pipeline is not blocked.

#### Acceptance Criteria

1. WHEN the change is complete, THE Implementation SHALL pass `npm test` with exit code 0.
2. WHEN the change is complete, THE Implementation SHALL pass `npm run test:types`. No type declaration changes (Requirement 5, criterion 5).
3. WHEN a new test file is run alone with `node --experimental-vm-modules ./node_modules/jest/bin/jest.js <file>`, THE Test File SHALL pass.
4. WHEN a test run ends, THE Implementation SHALL leave no test process running (`ps aux | grep jest`).
5. WHEN the change is complete, THE Implementation SHALL show changes in `git status` only in `src/lib/tools/Response.class.js`, the four new test files, `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/01-advanced-implementation-for-web-service/configuration-options.md`, optionally `docs/features/tools/README.md`, `CHANGELOG.md`, this spec directory and the two spin-off spec directories.

## Traceability

| Requirement | Plan decisions and findings |
|-------------|-----------------------------|
| 1 Format selection | Decision 2 (Q2 B), Decision 6 (Q6 A), Decision 11, C3, C7 |
| 2 `Content-Type` of a template-built response | Decision 1 (Q1 A), Decision 2a (Q2a A), Decision 7 (Q7 A), Decision 11, C1, C4 |
| 3 `finalize()` JSON media types | Decision 3 (Q3 A), F1 |
| 4 `getContentTypeCode()` | Decision 4 (Q4 A), F2 |
| 5 Unchanged surface | Decision 5 (Q5 A), Decision 6, Decision 8 (Q8 A), Decision 11, C2 |
| 6 Tests | Decisions 1 to 4, 6 and 11, Section 4.2 "Tests to add" |
| 7 JSDoc and documentation | Decisions 5, 7, 8 and 11, Sections 4.1 and 4.3 |
| 8 CHANGELOG | Decision 9 (Q9 A) |
| 9 Validation | Sections 4.2 and 8 |
| Spin-offs, not requirements | Decision 10 (Q10 A): case-insensitive header names, `reset(null)`, `settings.contentType` for body-less objects |

<!-- spec-it-safe:reviewed v1
Requirements already hardened by Specification Hardening Engine, as hashes of their text.
A re-run hardens only requirements whose hash is missing here.
9961f1e8d1a5 2d89efe7c5ef f135ac3c2924 28b30b8f143e a8ff2b7c56df 22cb7bdf29d2 c23eec10ac4b b99e381e13e2
59a2966c6ca5 12847255aba0 ab5556e6be87 acfedc5016e9 9ff04627a738 5e1a33cb43d5 ad23b1b07995 f558f5f10f2d
c2f38c565a8d 65f9c2ae5878 3e7c0e8d3cd4 251df3e60841 6562e68bd7ef c42e05d46cc1 4c9575865349 6db99bbbfdc0
bc2de83e0967 6f0eebfa59b2 75b65b315c4e 00360b63cff6 7729a9dd0014 8dcae81af209 1e8ca2ba9cdc c39d70e5ed8d
8be077555956 33a5e45da2d9 7ad3c35bb63b b2e0194987aa 4bbdb727a702 f2a7513a2635 d0e76d23e5ca eaf8d64c1ad4
9d307cb0ab55 eb34874bcec4 3cc79a833027 cb6918d0440f 9ddece65f236 ec669a048800 4aa61b053d72 95f44dd707e2
638a4321bcde 23863a0b6543 83a19e6b2638 fc6411e5982e 7256eac142b6 1a5d0dafa200 2bc86121a24e 5d04f318da8f
1ed5ce5a0ef9 f47c920053dd 3f2bf1406626 a9d98cd5c008 dc7fd6da98f3 ecf4f7a63276 3c6b2f64be2c f17f1883e728
5543045234d3 bc8f061eca8e 33d914a1ff67 f1151983f97a 6049bc0d563e 0384fbaa4e9d
-->
