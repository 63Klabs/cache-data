# Implementation Plan

## Overview

Ordering follows [design.md](design.md). This spec adds private helpers and a warning flag to `Response.class.js`, rewrites `reset()`, changes one condition in `finalize()`, extends `getContentTypeCode()`, adds JSDoc, adds four test files, updates two documentation files, and adds one CHANGELOG entry. The tests are written first and run red, so they prove they catch the defects.

- **Task 1 records baselines** before anything changes.
- **Task 2 adds the four test files** and runs them against the unchanged source. They must fail for the reasons in design.md "Fail-before checks".
- **Task 3 changes `Response.class.js`** in four small edits (helpers, `reset()`, `finalize()` and `getContentTypeCode()`, JSDoc), then runs the new tests green, the response suite, and lint.
- **Task 4 is a checkpoint:** the full suite, the type test and the documentation tests, with code and tests complete.
- **Task 5 writes the documentation** and runs the documentation tests.
- **Task 6 is the CHANGELOG and the final check.** The CHANGELOG is the last task of this spec (`AGENTS.md` 7.2), so the final hygiene checks sit inside it.

**Test execution:** use `timeout 120 node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, and `timeout 900 npm test` for the suite. Never write a test that runs `npm test`. Check for stray processes with `ps aux | grep jest | grep -v grep` before and after every run.

**Probes:** run a throwaway probe as one plain `node --input-type=module -e '<script>'` command, with no heredoc. Use `createRequire(import.meta.url)` to load `./src/lib/tools/index.js`. Write no probe file into the working tree.

**Linting:** the repository is not lint-clean (Jest globals are undeclared in `eslint.config.js`), so `npm run lint:ci` can fail for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baseline from task 1.2. Import `describe`, `it`, `expect`, `jest` and the other Jest names from `@jest/globals` in every new test file. Ignore the `MODULE_TYPELESS_PACKAGE_JSON` warning, and do not add `"type": "module"` to `package.json`.

**No AWS access:** no task calls AWS. No task changes `package.json` or `package-lock.json` (Requirement 5, criterion 12).

**Constraints that come from existing standards:**

- Each test file calls `Response.init()` once at module level. Never call it in `beforeEach`, and never use a child process (Requirement 6, criterion 20).
- Do not pass a `seed` option to `fc.assert`; the global `FC_SEED` hook seeds every call. Do not filter a property generator by the predicate it asserts (`test-execution-monitoring.md`).
- Do not edit any existing test file. If an existing test fails, stop and report it to the user (Requirement 5, criteria 10 and 11).
- Do not change `set()`, `getGenericResponses()`, `Response.CONTENT_TYPE`, `Response.init()`, the generic response modules, `types/`, `src/lib/tools/index.js` or `src/index.js` (Requirement 5).
- Edit `Response.class.js` by searching for text, not by line number, because earlier edits move the lines.
- Tabs for indentation, double quotes, semicolons (AGENTS.md 4.1). New private helpers use the `#` prefix and carry JSDoc with `@private`.
- Documentation never mentions `TestHarness`, a private field or a helper name. Code fences marked `javascript` must parse and every relative link must resolve.
- Never write a `Content-Type` value to a log or to a test failure message that CI would print for a real value. The test values are fixed strings.
- Do not commit, tag, publish or push without explicit instruction. Open no GitHub issue, advisory or comment. The four spin-off spec directories already exist: `1-4-2-response-header-names-are-matched-case-sensitively`, `1-4-2-response-reset-and-set-throw-on-a-null-object`, `1-4-2-response-headers-accept-control-characters`, and the sibling `1-4-2-response-set-status-code-resets-content-type-to-json`. Create no more, and do not edit their `ISSUE.md` files.

## Tasks

- [x] 1. Record the baselines (BEFORE any change)
  - [x] 1.1 Record the suite baseline
    - Run `ps aux | grep jest | grep -v grep` (expect nothing), then `timeout 900 npm test` on the unchanged tree
    - Record the pass and fail counts and every failing test in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 4
    - `git status` shows only the five spec directories named in Constraints
    - _Requirements: 9.1_
  - [x] 1.2 Record the lint baseline
    - Run `npx eslint src/lib/tools/Response.class.js`
    - Record the error and warning counts. Task 3.5 compares against them
    - _Requirements: 5.1_
  - [x] 1.3 Record the current behavior
    - Probe with one `node --input-type=module -e` command. It loads `./src/lib/tools/index.js`, calls `ClientRequest.init({ validations: testValidationsA })` (helpers from `./test/helpers/`), then `Response.init()` once with `rssResponses.response200` (`Content-Type: application/atom+xml`, body `<feed></feed>`) and `jsonResponses.response404` (`Content-Type: application/problem+json`), and silences `console.log`
    - Print: the header of `new Response(req, { statusCode: 200 }, Response.CONTENT_TYPE.RSS)` and of `new Response(req, { statusCode: 404 }, Response.CONTENT_TYPE.JSON)`; whether `new Response(req, { statusCode: 200, headers: { "Content-Type": "text/html" } })` throws; the header of `headers: { "Content-Type": "JSON" }`; the `finalize()` body for an `application/problem+json` header with `setBody({ a: 1 })` set first; and `getContentTypeCode()` for `text/html` and `application/atom+xml`
    - **EXPECTED OUTCOME:** `application/rss+xml`; `application/json`; throws `Content Type: text/html is not implemented for getResponses`; the literal `JSON`; `[object Object]`; `undefined` for both
    - _Requirements: 1.7, 2.1, 2.5, 3.1, 4.4_
- [x] 2. Add the tests (red)
  - **Do not edit the source or any existing test file in this task**
  - [x] 2.1 Add file A
    - **File:** `test/response/response-template-content-type-unit-tests.jest.mjs`, following design.md "File A"
    - Header comment in the format of `test/response/response-generic-templates-custom-unit-tests.jest.mjs` (purpose, setup, teardown, related tests), stating that `Response.init()` is called once per file
    - Module level: `ClientRequest.init({ validations: testValidationsA })`, spies on `DebugAndLog.log` and `DebugAndLog.warn` silenced in `beforeEach`, then one `Response.init()` with the eight custom templates of the design table (the problem+json JSON 200, a JSON 400 with `headers: {}`, the HTML `text/html` 200, the XML `application/atom+xml` 200, the RSS `application/x-rss-custom` 200, the TEXT `text/plain; charset=utf-8` 200, a TEXT 404 whose `Content-Type` is `"text/plain\nX-Injected: 1"`, a TEXT 500 with no `headers`, a TEXT 418 with `Content-Type: TEXT`)
    - Cases: every row of the design table "File A" (template header for all five formats through the constructor and `reset()`; first-argument `headers` without a `Content-Type` still takes the template value and keeps its other header; the constant when `headers` is `{}` or missing; a supplied header beats the template; the code `TEXT` resolves to `text/plain`; the line-feed template is ignored; two responses from one template do not share headers and the template `headers` object is unchanged after `addHeader`; `getContentType()` and `getHeaders()` agree; an `Error` body finalizes to 500 with the JSON `response500` template's `Content-Type`)
    - Use fixed string values. Assert that no returned header contains a character from U+0000 to U+001F
    - No child process, no `npm test`, no AWS call
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.10, 2.12, 2.13, 2.15, 2.16, 6.1, 6.2, 6.17, 6.18, 6.19, 6.20, 6.23; `SEC-REQ-2.7-SEM-113-1`_
  - [x] 2.2 Add file B
    - **File:** `test/response/response-content-type-header-unit-tests.jest.mjs`, following design.md "File B". Same header format
    - Module level: `ClientRequest.init(...)`, one `Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 0 } })` with no template option
    - **The first `describe` of the file is the warning group** and its comment says why: the once-per-container flag lives in the module, so it must run before any other control-character value. Install a `DebugAndLog.warn` spy whose implementation throws, construct with a control-character `Content-Type`, and assert that the response exists, that `warn` was called once, that no argument contains the value, and that a second construction leaves the count at one. Restore in `afterAll`
    - Later groups, each with a silenced `warn` spy: no throw for `text/html`, `application/atom+xml`, `application/problem+json`, `application/javascript` and `text/html; charset=utf-8`, with the header equal to the input; media type selection (`text/html`, `TEXT/HTML; charset=utf-8`, `application/json; charset=utf-8`, `application/xml`, `application/rss+xml`, `text/plain`); an unrecognized value selects the body type (JSON with no body, HTML for a body containing `</html>`); blank values (`undefined`, `""`, `"   "`, `42`, `null`) use the template header; the five codes and an explicit code argument give the constant, and a supplied `JSON` with an `HTML` argument gives the HTML template with `application/json`; an explicit `JAVASCRIPT`, `CSS`, `CSV` or unknown string argument still throws the existing message; the exact value is kept (no charset added, case kept); other headers are copied and the template's are not merged; a call with no `Content-Type` is unchanged; the five control-character values (LF, CR, HT, U+0000, U+007F) are not used and the template header is used; `Response.CONTENT_TYPE` values equal the module constants
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 5.4, 6.3, 6.4, 6.5, 6.6, 6.17, 6.18, 6.19, 6.20; `SEC-REQ-2.7-SEM-113-1`_
  - [x] 2.3 Add file C
    - **File:** `test/response/response-finalize-json-media-type-unit-tests.jest.mjs`, following design.md "File C". Same header format
    - Default templates, `Response.init({ settings })` once. Spy `DebugAndLog.log` so the response log line can be read
    - Cases: the JSON family (`application/problem+json`, `application/vnd.api+json`, `application/json; charset=utf-8`, `APPLICATION/JSON`) with object, array, string and number bodies; `application/json` unchanged, including a `null` body; `application/atom+xml`, `text/html` and `application/xml` send `${body}`; a non-string header (`42`, `null`) with a string body does not throw; the header value returned equals the value given; a body of `404` with a `+json` header resets to the 404 template; `getContentTypeCode()` for `application/json`, `application/json; charset=utf-8`, `application/problem+json`, `text/html`, `text/html; charset=utf-8`, `text/css`, `application/atom+xml` and a number header; the response log message split on ` | ` has 13 fields and the third is `HTML` for `text/html`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.7, 6.8, 6.17, 6.18, 6.19, 6.20; `SEC-REQ-4.2-SEM-248-1`, `SEC-REQ-4.2-SEM-248-2`_
  - [x] 2.4 Add file D
    - **File:** `test/response/response-template-content-type-property-tests.jest.mjs`, following design.md "File D". Same header format
    - One `Response.init()` with a custom `response200` for each of the five formats (distinct `Content-Type`, no control character, none blank). `numRuns: 100` on each property, no `seed`, silenced `DebugAndLog` spies
    - P1: `fc.integer({ min: 100, max: 599 })` with `fc.constantFrom("JSON", "HTML", "XML", "RSS", "TEXT")`; the constructor's header equals `getGenericResponses(format).response(statusCode).headers["Content-Type"]`
    - P2: `"application/x-" + fc.stringMatching(/^[a-z0-9.+-]{1,20}$/)`; no throw and the header equals the value. Add the premise test: no value of `Response.CONTENT_TYPE` has a media type starting `application/x-`
    - P3: a prefix, one of the 32 characters U+0000 to U+001F plus U+007F, and a suffix, each part from `fc.stringMatching(/^[a-z0-9/+.-]{0,12}$/)` or `fc.constantFrom(...)`; no throw and the header contains no control character
    - P4: a plain object from `fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), fc.oneof(fc.integer(), fc.boolean(), fc.stringMatching(/^[a-z ]{0,10}$/)), { maxKeys: 5 })` and `"application/" + fc.stringMatching(/^[a-z0-9.-]{1,10}$/) + "+json"`; `finalize().body` equals `JSON.stringify(body)`
    - The long-value test: `";+ json".repeat(14286)` as a supplied header to the constructor and as the header of a response with an object body to `finalize()`, under the default Jest timeout
    - No generator is filtered by the predicate its property asserts
    - _Requirements: 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15, 6.16, 6.17, 6.18, 6.19, 6.20; `SEC-REQ-5.7-SEM-1333-1`_
  - [x] 2.5 Run the four files against the unchanged source
    - Run `timeout 300 node --experimental-vm-modules node_modules/jest/bin/jest.js test/response/response-template-content-type-unit-tests.jest.mjs test/response/response-content-type-header-unit-tests.jest.mjs test/response/response-finalize-json-media-type-unit-tests.jest.mjs test/response/response-template-content-type-property-tests.jest.mjs`
    - **EXPECTED OUTCOME:** the files fail. Failures are expected for the reasons in design.md "Fail-before checks": the constructor throws for a header that is not one of the five (B "no throw", "blank", "control character"; D P2 and P3, long value); the template header is replaced (A "template header", D P1); the code is written literally (B "code"); the body is `[object Object]` (C "JSON family", D P4). Cases that document today's behavior (explicit argument still throws, non-JSON bodies, unchanged defaults) may pass
    - A file that fails to load, or a failure for any other reason, is a defect in the test. Fix the test, not the source
    - Record the failing case names in the completion notes
    - _Requirements: 6.21_
- [x] 3. Change `Response.class.js` (green)
  - [x] 3.1 Add the private helpers and the warning flag
    - **File:** `src/lib/tools/Response.class.js`
    - At module level, below the requires: `CONTROL_CHARACTER`, `CONTROL_CHARACTER_WARNING` and `let controlCharacterWarningLogged = false`, exactly as in design.md "Private helpers"
    - In the class, directly after `static CONTENT_TYPE`: `static #FORMAT_CODES`, `static #MEDIA_TYPES`, and the static private methods `#mediaTypeOf`, `#isJsonMediaType`, `#isJsonContentType`, `#usableContentType`, `#formatCodeOf`, `#selectFormat`, `#resolve` and `#warnControlCharacter`. Each carries JSDoc with `@private`, `@param`, `@returns` and `@example`
    - `#usableContentType` runs the control-character test before the blank test. `#warnControlCharacter` sets the flag, calls `DebugAndLog.warn`, attaches `.catch(() => {})` to a returned promise, and wraps the call in `try/catch`, as `warnDeprecated427()` does in `generic.response.js`
    - No regular expression other than `CONTROL_CHARACTER` touches a header value. The warning text contains no header value
    - Add no export. Change no existing method in this task
    - _Requirements: 2.7, 2.8, 2.9, 5.6, 5.7, 5.9; `SEC-REQ-2.7-SEM-113-1`, `SEC-REQ-5.7-SEM-1333-1`_
  - [x] 3.2 Rewrite `reset()`
    - **File:** `src/lib/tools/Response.class.js`. Replace the body of `reset` with the "After" code in design.md "`reset()`"
    - Keep the property name `obj.body` (not `obj?.body`) in the format selection branch, so `reset(null)` still throws `TypeError`
    - Do not change `set()`. The final `this.addHeader('Content-Type', ...)` call is the only new write
    - `git diff` for this task touches only `reset`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 5.1, 5.2_
  - [x] 3.3 Change `finalize()` and `getContentTypeCode()`
    - **File:** `src/lib/tools/Response.class.js`
    - In `finalize()`, change the condition `this._headers['Content-Type'] === Response.CONTENT_TYPE.JSON` to `Response.#isJsonContentType(this._headers['Content-Type'])`. Change nothing else in the method
    - Extend `getContentTypeCode()` as in design.md "`getContentTypeCode()`": keep the exact-match loop, return `undefined` for a non-string, then match by media type, then `JSON` for a JSON media type
    - Do not change `_log()`, `getContentType()`, `inspectContentType()`, `inspectHeaderContentType()` or `inspectBodyContentType()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7; `SEC-REQ-4.2-SEM-248-1`, `SEC-REQ-4.2-SEM-248-2`_
  - [x] 3.4 Update the JSDoc
    - **File:** `src/lib/tools/Response.class.js`
    - Constructor, `reset()`, `getContentTypeCode()` and `finalize()` as in design.md "JSDoc". Keep every `@param` name equal to the signature. The constructor and `reset()` `@throws` say that an unknown `contentType` argument throws and that a `Content-Type` header value does not. `finalize()` says "JSON media type" where it said "JSON responses"
    - Examples must run: add one for `text/html` and one for `application/atom+xml`
    - Do not use a getter or a `#` method to hold the only copy of a public description (the documentation tests skip them)
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 3.5 Run the new tests, the response suite, and lint
    - Re-run the command from 2.5. **EXPECTED OUTCOME:** all four files pass
    - Run `timeout 300 npm run test:response`. **EXPECTED OUTCOME:** passes with no existing test changed
    - Run `npx eslint src/lib/tools/Response.class.js test/response/response-template-content-type-unit-tests.jest.mjs test/response/response-content-type-header-unit-tests.jest.mjs test/response/response-finalize-json-media-type-unit-tests.jest.mjs test/response/response-template-content-type-property-tests.jest.mjs`
    - **EXPECTED OUTCOME:** no more errors for the source file than the baseline in 1.2, and 0 errors in the four new files
    - Check `git diff --stat`: only `src/lib/tools/Response.class.js` and the four new test files
    - _Requirements: 5.7, 5.10, 6.22_
- [x] 4. Checkpoint: code and tests complete
  - [x] 4.1 Run the type test
    - Run `npm run test:types`. **EXPECTED OUTCOME:** passes (no type declaration changed)
    - _Requirements: 9.2_
  - [x] 4.2 Run the documentation tests
    - Run `timeout 300 npm test -- test/documentation/` and `node scripts/audit-documentation.mjs`
    - **EXPECTED OUTCOME:** both pass. The JSDoc validation reads the changed methods. If it fails, fix the JSDoc, not the test
    - _Requirements: 7.2, 7.18_
  - [x] 4.3 Run the full suite
    - Run `ps aux | grep jest | grep -v grep`, then `timeout 900 npm test`
    - **EXPECTED OUTCOME:** exit code 0, or only the failures recorded in 1.1. Any new failure blocks the documentation work. A failure in an existing test goes to the user (Requirement 5, criterion 11); do not edit or skip it
    - Run each new test file alone once more to confirm it passes in isolation
    - _Requirements: 9.1, 9.3_
- [x] 5. Documentation
  - [x] 5.1 Update `response-management.md`
    - **File:** `docs/01-advanced-implementation-for-web-service/response-management.md`, section "Custom Response Templates"
    - Replace the paragraph that begins "A `Response` built from a template, such as `new Response(clientRequest, { statusCode: 404 }, Response.CONTENT_TYPE.XML)`, carries the `Content-Type` of ..." and the `addHeader()` example and `setHeaders()` sentence under it, with the text of design.md "response-management.md": the three-step order, the Atom and problem+json example, and the short paragraphs on `+json` serialization, header values that no longer throw, control characters, `text/html` without a charset, `setBody()` / `setStatusCode()` / `setHeaders()` re-inferring the type (naming `1-4-2-response-set-status-code-resets-content-type-to-json`), custom `contentType` on a module, and the API Gateway and CloudFront note marked not verified
    - Keep the `xmlResponses` example and the sentence "Before v1.4.2, `xmlResponses` was applied to the HTML templates by mistake; see the CHANGELOG" that follow or precede it
    - The text says a template header applies; it must not say `setBody()`, `setStatusCode()` or `setHeaders()` keep it. It mentions no private field, no `TestHarness` and no helper name
    - Check that the links resolve from this directory
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 7.8, 7.10, 7.11, 7.12, 7.13, 7.14, 7.16, 7.17_
  - [x] 5.2 Update `configuration-options.md`
    - **File:** `docs/01-advanced-implementation-for-web-service/configuration-options.md`
    - In the `htmlResponses` example, change `'Content-Type': 'text/html'` to `'Content-Type': 'text/html; charset=utf-8'`. No other line changes
    - _Requirements: 7.9, 7.16_
  - [x] 5.3 Check `docs/features/tools/README.md`
    - Read the Response section. If it describes which `Content-Type` a template-built response carries, whether the constructor throws for a header, `finalize()` JSON handling or `getContentTypeCode()`, update that text to match. If not, change nothing and record "no change needed" in the completion notes
    - _Requirements: 7.15_
  - [x] 5.4 Check the documentation set
    - Re-read the edited examples: static string bodies only, no credential, account ID or real host name, no request-derived value in any body or `Content-Type`
    - Run `timeout 300 npm test -- test/documentation/` and `node scripts/audit-documentation.mjs`
    - **EXPECTED OUTCOME:** both pass. If a fence does not parse, fix the example
    - _Requirements: 7.16, 7.17, 7.18_
- [x] 6. CHANGELOG and final check (last task)
  - [x] 6.1 Add the CHANGELOG entry
    - Repeat the version lookup in `.kiro/steering/changelog-convention-package.md` now, not from earlier notes: read `version` in `package.json` (expected `1.4.2`) and find the heading that starts `## v1.4.2 ` in `CHANGELOG.md`
    - **Stop and tell the user** if that heading has a date, if there is more than one `(unreleased)` heading, or if the `(unreleased)` version differs from `package.json`. Do not write the entry anywhere else
    - Otherwise add the entry from design.md "CHANGELOG (final task)" under `### Fixed` of `## v1.4.2 (unreleased)`, after the existing entries of that category. Change no dated section, no heading, no intro text and no existing entry
    - Check: separator is ` - `, the spec link is at the end and its directory exists, there is no `addresses [#N]` reference, it states "Affects v1.2.2 through v1.4.1", it names the PATCH exception in a sub-bullet, it tells applications with a differing template `Content-Type` (including `text/html`) to review the header, it mentions the control-character rule, and it does not say `setBody()`, `setStatusCode()` or `setHeaders()` keep a custom type
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13_
  - [x] 6.2 Run the final verification
    - Re-run `timeout 300 npm test -- test/documentation/` (the CHANGELOG link is scanned), `node scripts/audit-documentation.mjs` and `npm run test:types`
    - Run `timeout 900 npm test`. **EXPECTED OUTCOME:** same result as task 4.3
    - Confirm `package.json` still reads `1.4.2`, `package-lock.json` is unchanged, and the export names of `src/lib/tools/index.js` are unchanged
    - _Requirements: 5.5, 5.12, 9.1, 9.2_
  - [x] 6.3 Check hygiene
    - `ps aux | grep jest | grep -v grep` returns nothing. No probe file or temp file is left in the working tree
    - `git status` shows only: `src/lib/tools/Response.class.js`, the four new test files, `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/01-advanced-implementation-for-web-service/configuration-options.md`, optionally `docs/features/tools/README.md`, `CHANGELOG.md`, this spec directory, and the three spin-off spec directories created by this spec
    - _Requirements: 9.4, 9.5_
  - [x] 6.4 Report to the user, and ask before any commit, tag, or publish
    - Summarize what changed, the red and green results from 2.5 and 3.5, and the suite result
    - State the residual limits: `setBody()`, `setStatusCode()` and `setHeaders()` still re-infer `Content-Type`, so a custom type from a template survives only until the next such call (Decision 8, sibling spec); control characters in `addHeader()`, `setHeaders()`, `set()` and other headers are still not checked (spin-off `1-4-2-response-headers-accept-control-characters`); the guard on a rejected `DebugAndLog.warn` promise is not asserted in the tests; the `reset(null)` error message now names `body`; an explicit code argument such as `"JSON"` now yields `application/json` where it used to yield the literal `JSON`; no downstream check of template `Content-Type` values was made (Decision 9); the API Gateway and CloudFront effect of a custom type was not verified; and requirements 1 to 9 passed `harden-spec --check`
    - Don't commit, tag, publish, or push without explicit instruction
    - _Requirements: 9.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["3.4"] },
    { "id": 7, "tasks": ["3.5"] },
    { "id": 8, "tasks": ["4.1", "4.2"] },
    { "id": 9, "tasks": ["4.3"] },
    { "id": 10, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 11, "tasks": ["5.4"] },
    { "id": 12, "tasks": ["6.1"] },
    { "id": 13, "tasks": ["6.2", "6.3"] },
    { "id": 14, "tasks": ["6.4"] }
  ]
}
```

**Critical path:** 1 → 2 → 3 → 4 → 5 → 6.

**Ordering constraints:**

- Task 1 finishes before anything changes, so the baselines describe the current tree.
- Task 2.5 runs before task 3.1. A test that passes before the change does not prove the change, so the red run is a gate.
- Tasks 3.1 to 3.4 each edit `Response.class.js`, so they run one after another, one per wave.
- Task 4.3 is a hard gate: the suite must be green before the documentation work, because the documentation tests scan the edited source and docs.
- Task 6.1 stops if the version lookup fails. It is the last task that writes a file.

## Notes

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Format selection | 1.3, 2.2, 3.2, 3.5 |
| 2. `Content-Type` of a template-built response | 1.3, 2.1, 2.2, 2.4, 3.1, 3.2, 3.5 |
| 3. `finalize()` JSON media types | 1.3, 2.3, 2.4, 3.3, 3.5 |
| 4. `getContentTypeCode()` | 1.3, 2.3, 3.3, 3.5 |
| 5. Everything else unchanged | 1.2, 3.1, 3.2, 3.3, 3.5, 6.2 |
| 6. Tests | 2.1, 2.2, 2.3, 2.4, 2.5, 3.5 |
| 7. JSDoc and documentation | 3.4, 4.2, 5.1, 5.2, 5.3, 5.4 |
| 8. CHANGELOG | 6.1 |
| 9. Validation | 1.1, 4.1, 4.3, 6.2, 6.3, 6.4 |

### Security constraint to task map

| Constraint | Tasks |
|---|---|
| `SEC-REQ-2.7-SEM-113-1` (no control character in a template-built `Content-Type`) | 2.1, 2.2, 3.1 |
| `SEC-REQ-4.2-SEM-248-1`, `-2` (non-string `getContentType()`) | 2.3, 3.3 |
| `SEC-REQ-5.7-SEM-1333-1` (linear-time helpers) | 2.4, 3.1 |

### Decision to task map

| Decision | Tasks |
|---|---|
| 1 (precedence) | 2.1, 3.2 |
| 2 and 2a (format selection, codes) | 2.2, 3.1, 3.2 |
| 3 (JSON media types in `finalize()`) | 2.3, 2.4, 3.3 |
| 4 (`getContentTypeCode()`) | 2.3, 3.3 |
| 5 (`Response.CONTENT_TYPE` fixed) | 3.2, 5.1 |
| 6 (no new templates, explicit argument throws) | 2.2, 3.2 |
| 7 (`text/html` kept as written) | 5.1, 5.2 |
| 8 (`set()` and setters unchanged) | 3.2, 5.1, 6.4 |
| 9 (PATCH, Fixed entry, no downstream check) | 6.1, 6.4 |
| 10 (spin-offs) | 6.3, 6.4 |
| 11 (control characters) | 2.1, 2.2, 2.4, 3.1, 3.2, 5.1, 6.1 |

### Related documentation

- [requirements.md](requirements.md) - the 9 requirements these tasks satisfy
- [design.md](design.md) - the code change, test design, documentation text and verification table
- [PLAN.md](PLAN.md) - the assessment, probes and Decisions 1 to 11
- [ISSUE.md](ISSUE.md) - the original report
