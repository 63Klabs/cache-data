# Implementation Plan

## Overview

Ordering follows [design.md](design.md). This spec changes four source files (`generic.response.js`, `generic.response.xml.js`, `generic.response.rss.js`, and one line in `Response.class.js`), the type declarations, two documentation files, and the tests. The CHANGELOG is the last task, as `AGENTS.md` section 7.2 and `.kiro/steering/changelog-convention-package.md` require.

- **Task 1 records baselines** before anything changes, including the read-only CHANGELOG version lookup.
- **Task 2 changes the source and the types**, then probes the result and runs the existing response tests, where only the tests that pin the old list or the 500 fallback may fail.
- **Task 3 writes and updates the tests**, runs them, and proves the new ones fail on the unchanged source.
- **Task 4 is the first checkpoint:** documentation tests, type test, export-surface snapshot, and the full suite, with code and tests complete.
- **Task 5 is the documentation:** the new section, the README rewrite, a probe that runs every snippet, and the documentation tests.
- **Task 6 searches the documentation set** for the consistency rules of Requirement 12.
- **Task 7 is the final task:** the CHANGELOG entries, the final checks, and the report to the user.

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, or `npm test` for the suite, each under `timeout` (a file or directory: `timeout 300`; the full suite: `timeout 900`). A bare `npx jest` fails on ESM. Never call `npm test` from inside a test file. Before and after each run check `ps aux | grep jest | grep -v grep` (`.kiro/steering/test-execution-monitoring.md`). Only the deprecation test file in task 3.9 spawns child processes, and it spawns `process.execPath` directly, never `npm`.

**Probes:** run a throwaway probe as one plain `node --input-type=module -e '<script>'` command. Use `createRequire(import.meta.url)` to load `./src/lib/tools/index.js`. Call `ClientRequest.init({ validations: testValidationsA })` and `Response.init(...)` once per process (it takes effect only once), silence `console.log`, and replace `DebugAndLog.log` when you need the `RESPONSE` line. The fixtures are `test/helpers/test-event.js`, `test-context.js` and `test-validations.js`. Delete nothing in the working tree because of a probe: probes write no file.

**Linting:** the repository isn't lint-clean, so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec touches with `npx eslint <files>` and compare with the baseline in task 1.2. `.md` and `.ts` files aren't linted. New `.mjs` files import Jest globals from `@jest/globals` and use no undeclared global.

**No AWS access and no network in tests.** The only network call in this spec is the read-only `npm view` in task 7.1.

**Constraints from existing tests and standards:**

- The `test/documentation/` tests scan the JSDoc in `src/lib/tools/` (except `generic.response*` files) and the `javascript` code fences and relative links in `docs/`. Keep `@returns` and `@example` in every JSDoc block you edit or add.
- JSDoc and types name `docs/...` paths in plain text and add no link, because `docs/` is excluded from the npm package.
- The user documentation, JSDoc and types never mention `STATUS_CODE_MAP`, `NO_BODY_STATUS_CODES`, the module-level flag, `_body` or `TestHarness` (Requirement 8.3).
- Code style: tabs, double quotes, semicolons, camelCase variables, UPPER_SNAKE_CASE for module-level constants, `#` for private class fields, no emoji.
- Property tests: build each generator from a range and filter out the listed codes by a constant list held in the test. Never filter by the predicate the property asserts. Never pass `seed` to `fc.assert`; the `FC_SEED` hook seeds every call.
- `Response.init()` takes effect once per test file. Put every custom template for a file in one call, and put no template in `xmlResponses` (it is merged into the HTML slot, spin-off S1).
- A reset to a non-JSON template needs an explicit content type argument (spin-off S3).
- Edit by searching for text, not by line number. Do not use `str_replace` to write non-ASCII characters.

**Commits:** do not commit, tag, publish or push without explicit instruction. Open no GitHub issue or comment. Do not edit `AGENTS.md` or any steering file (Decision 10). Create no new spin-off folder.

## Tasks

- [x] 1. Record the baselines (BEFORE any change)
  - [x] 1.1 Record the suite baseline
    - Run `timeout 900 npm test` on the unchanged tree. Record pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing and is left for task 4
    - `git status` shows only the spec directory (`PLAN.md`, `requirements.md`, `design.md`, `tasks.md`, `ISSUE.md`), the other `1-4-2-*` spec folders, and the steering, skill, `AGENTS.md` and `scripts/` changes you didn't make
    - _Requirements: 10.9_
  - [x] 1.2 Record the lint and type baselines
    - Run `npx eslint src/lib/tools/generic.response.js src/lib/tools/generic.response.json.js src/lib/tools/generic.response.html.js src/lib/tools/generic.response.xml.js src/lib/tools/generic.response.rss.js src/lib/tools/generic.response.text.js src/lib/tools/Response.class.js` and `npm run test:types`
    - **EXPECTED OUTCOME:** 0 ESLint problems and exit 0 for the type test, matching design.md "Pre-design measurements". Record any difference
    - _Requirements: 6.4, 10.9_
  - [x] 1.3 Record the current behavior
    - Probe: `Response.getGenericResponses("JSON").response(n)` for 201, 202, 204, 301, 304, 409, 410, 429, 502, 503; `new Response(req, { statusCode: 204 })` and then `reset({ statusCode: 204 })` on a response holding `{ a: 1 }`; `Response.init({ jsonResponses: { response500: { statusCode: 500, headers: { "Content-Type": "application/json" }, body: { custom: "app500" } } } })` then `new Response(req, { statusCode: 201 })`
    - **EXPECTED OUTCOME:** every `response(n)` is `statusCode 500` with `{"message":"Internal Server Error"}`; the 204 response has that same body, and the reset keeps `{ a: 1 }`; the 201 response has `{"custom":"app500"}`. This is the defect (PLAN.md C2, C3, C6, N1)
    - _Requirements: 3.1, 4.3, 4.4_
  - [x] 1.4 Read-only CHANGELOG version lookup
    - Read `version` from `package.json` and look in `CHANGELOG.md` for a heading that starts with `## v<version> `. Do not create or edit anything
    - **EXPECTED OUTCOME:** `1.4.2` and no `## v1.4.2` heading, so the heading is created in task 7.1. If a dated `## v1.4.2 (...)` heading exists, STOP and tell the user to run `npm version [major|minor|patch]` on a clean working tree. If more than one `(unreleased)` heading exists, STOP and ask
    - _Requirements: 9.1, 9.2_

- [x] 2. Change the source and the types
  - Do not edit any existing test file in this task
  - [x] 2.1 Templates, bodiless template, class fallback and deprecation warning
    - **File:** `src/lib/tools/generic.response.js`. Use the code in design.md "generic.response.js": add `const DebugAndLog = require("./DebugAndLog.class");`, the seventeen-entry `STATUS_CODE_MAP`, `NO_BODY_STATUS_CODES`, `DEPRECATED_427_MESSAGE`, the module-level flag, `fallbackTemplateName`, `warnDeprecated427`, the null-body branch in the factory loop, and the new `response()`
    - `DebugAndLog.warn` is called as a method on the class (not destructured). The flag is set before the call. The `catch {` block is empty with a comment
    - Update the JSDoc: `@module` comment, the `createGenericResponseModule` description (class fallback, `response204` null body, deprecated `response427`), the full `@returns` member list, and an `@example` for an unlisted code. `@param` names match the function parameters exactly. Keep the module exports as `{ createGenericResponseModule }`
    - _Requirements: 1.1 to 1.10, 3.1 to 3.8, 5.1 to 5.7, 7.1, 11.4_
  - [x] 2.2 XML and RSS success element
    - **Files:** `src/lib/tools/generic.response.xml.js` and `generic.response.rss.js`: replace `statusCode === 200` with `statusCode >= 200 && statusCode < 300`. Change nothing else. Do not touch `generic.response.json.js`, `.html.js` or `.text.js`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.3 `Response.reset()` and its JSDoc
    - **File:** `src/lib/tools/Response.class.js`: after `this.set(newObj, contentType);` in `reset`, add `if (newObj.body === null) { this._body = null; }`. Add the two JSDoc sentences from design.md "Response.reset". Change no `@param`
    - `git diff -- src/lib/tools/Response.class.js` shows only the added lines and the JSDoc change, nothing inside `set`, `setBody`, `setBodyToNull`, `setStatusCode`, `setHeaders`, `finalize` or the constructor
    - _Requirements: 4.1, 4.2, 7.2_
  - [x] 2.4 Type declarations
    - **File:** `types/lib/tools/index.d.ts`: add `response201`, `response202`, `response204`, `response409`, `response422`, `response429`, `response503` to `GenericResponseModule` in ascending order with doc comments; add the `@deprecated` tag to `response427`; rewrite the `response()` description; update the `GenericResponseObject.body` comment. Use the text in design.md "Types". Change nothing else in `types/`
    - **File:** `test/types/consumer-tools.ts`: add the three reads from design.md "Types"
    - _Requirements: 5.8, 6.1 to 6.5_
  - [x] 2.5 Probe the result and re-run the existing response tests
    - Repeat the probe of 1.3. **EXPECTED OUTCOME:** 201, 202, 204, 409, 429 and 503 return their own templates; 410 returns the 400 template (`statusCode 400`, `{"message":"Bad Request"}`); 502 returns the 500 template; 301, 304, 100 and 205 return `response204` (`body: null`); `new Response(req, { statusCode: 204 })` has a null body; `reset({ statusCode: 204 })` on a response holding `{ a: 1 }` ends with a null body; the custom-500 probe gives 201 the built-in `{"message":"Created"}`
    - Probe the warning: in a fresh process stub `DebugAndLog.warn` to push into an array, call `response(427)` on two modules and `response(429)`. **EXPECTED OUTCOME:** exactly one recorded message containing `response427`, `deprecated`, `427 is not a registered HTTP status` and `response429`
    - Probe `require("./src/index.js")` in a plain Node process. **EXPECTED OUTCOME:** loads with no error (no require cycle)
    - Run `timeout 300 npm run test:response`. **EXPECTED OUTCOME:** the only failures are tests that pin the old ten-code list or the 500 fallback (Property 3 of `generic-response-module-tests.jest.mjs`, and any property in `generic-response-module-property-tests.jest.mjs` that enumerates the list). Record each failure. Any other failure is a regression to fix in the source, not the test
    - `npm run test:types` **EXPECTED OUTCOME:** exit 0
    - _Requirements: 1.1 to 1.5, 3.2 to 3.4, 4.3, 4.4, 5.2, 5.7, 6.4, 11.3_

- [x] 3. Write and update the tests
  - [x] 3.1 Shared helper
    - **File (new):** `test/helpers/generic-response-status-codes.mjs` with `LISTED_STATUS_CODES`, `NO_BODY_CODES`, `STATUS_CODE_MESSAGES`, `SUCCESS_CODES`, `ERROR_CODES` as in design.md "Shared helper". The list is a literal, not derived from the source, so it is an independent oracle
    - _Requirements: 10.3, 10.4_
  - [x] 3.2 Update `generic-response-module-tests.jest.mjs`
    - Import the helper in place of `KNOWN_STATUS_CODES` and `STATUS_CODE_MESSAGES`. Change the title "all 10" to "all listed". Remove Property 3 (it is replaced by the class-fallback property file). Keep the `response(999)`, `0`, `-1` and `"abc"` tests and the string `"404"` test. Add: `response204.body` is `null` in a module built with a formatter spy, and the spy is called once per listed code except 204
    - _Requirements: 1.2, 1.5, 3.6, 10.1_
  - [x] 3.3 Update `generic-response-module-property-tests.jest.mjs`
    - Import the helper. Keep Property 4 for the ten v1.4.1 codes unchanged and add one property that checks all seventeen codes against the expected outputs
    - _Requirements: 1.7, 10.1, 11.4_
  - [x] 3.4 Update the five per-format test files
    - **Files:** `test/response/generic-response-{json,html,rss,text,xml}-tests.jest.mjs`: add one `it` per new code with that format's exact expected body (HTML `<html><head><title>201 Created</title></head><body><p>Created</p></body></html>`; XML and RSS `<hello>` for 201 and 202 and `<error>` for 409, 422, 429, 503; `null` for 204). Add a `beforeEach` spy `jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve())` and `jest.restoreAllMocks()` in `afterEach`, so the existing 427 tests print nothing. Edit no existing assertion
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 10.2_
  - [x] 3.5 Class-fallback unit tests
    - **File (new):** `test/response/generic-response-class-fallback-tests.jest.mjs`, covering the cases listed in design.md "generic-response-class-fallback-tests.jest.mjs" for each of the five modules
    - _Requirements: 1.1 to 1.8, 3.1 to 3.8, 10.2_
  - [x] 3.6 Class-fallback property tests
    - **File (new):** `test/response/generic-response-class-fallback-property-tests.jest.mjs`: properties P1 to P7 of design.md, each with `numRuns` of 100 or fewer and the generators described there. No `seed` option
    - _Requirements: 1.1, 1.8, 2.1, 3.1, 3.2, 10.3, 10.4_
  - [x] 3.7 `Response` tests with the default templates
    - **File (new):** `test/response/response-generic-templates-unit-tests.jest.mjs`, set up like `response-set-body-to-null-unit-tests.jest.mjs` (`ClientRequest.init` once, `Response.init` settings in `beforeEach`, `DebugAndLog.log` and `DebugAndLog.warn` spied, `jest.restoreAllMocks()` in `afterEach`). Cases and property P8 as in design.md "response-generic-templates-unit-tests.jest.mjs"
    - Use status 200 only in the existing characterization file; do not edit `response-set-body-to-null-unit-tests.jest.mjs`
    - _Requirements: 4.3 to 4.7, 4.9, 4.10, 10.5_
  - [x] 3.8 `Response` tests with custom templates
    - **File (new):** `test/response/response-generic-templates-custom-unit-tests.jest.mjs`: one `Response.init` call with `response200`, `response201`, `response202` (null body), `response204`, `response400` and `response500` in `jsonResponses` and nothing in `xmlResponses`. Cases as in design.md "response-generic-templates-custom-unit-tests.jest.mjs"
    - _Requirements: 3.4, 3.5, 4.8, 10.5_
  - [x] 3.9 Deprecation tests in child processes
    - **File (new):** `test/response/generic-response-deprecation-427-tests.jest.mjs`: the cases in design.md "generic-response-deprecation-427-tests.jest.mjs". Each case runs `spawnSync(process.execPath, ["-e", script, projectRoot], { encoding: "utf8", timeout: 30000 })` with no shell, reads the root from `process.argv[1]` and builds paths with `path.join`, and asserts on captured stdout and stderr. The child stubs `DebugAndLog.warn` to record calls, except the "real logger" case
    - Run only this file after writing it and check `ps aux | grep jest` afterwards
    - _Requirements: 5.2 to 5.7, 10.6_
  - [x] 3.10 Run every new and updated test file
    - Run each file in 3.2 to 3.9 on its own. **EXPECTED OUTCOME:** all PASS. Run `timeout 300 npm run test:response`. **EXPECTED OUTCOME:** all PASS, including `response-set-body-to-null-unit-tests.jest.mjs` and every other pre-existing file in `test/response/` that this task list does not edit (19 suites passed at baseline)
    - _Requirements: 4.11, 10.1 to 10.7_
  - [x] 3.11 Vacuity check against the unchanged source
    - Back up first: `git diff -- src types > /tmp/spec-1-4-2-src.patch` (outside the working tree). Then `git stash push -- src/lib/tools/generic.response.js src/lib/tools/generic.response.xml.js src/lib/tools/generic.response.rss.js src/lib/tools/Response.class.js types/lib/tools/index.d.ts`. Run the new test files (3.5 to 3.9) and the updated per-format files. **EXPECTED OUTCOME:** the class-fallback, template, `reset`, XML/RSS and deprecation tests FAIL. A new test that passes here asserts nothing and must be fixed
    - Then `git stash pop` and confirm `git diff --stat -- src types` matches what it was before. If the pop conflicts, apply `/tmp/spec-1-4-2-src.patch` instead and tell the user. Re-run 3.10 once the source is back
    - _Requirements: 10.1 to 10.7_
  - [x] 3.12 Lint the touched files
    - `npx eslint` on the seven source files of 1.2 and every new or updated test and helper file. **EXPECTED OUTCOME:** 0 problems on the source files (baseline) and on the new files. Do not fix problems in untouched files
    - _Requirements: 10.9_

- [x] 4. Checkpoint: code and tests complete
  - [x] 4.1 Documentation tests, types and export surface
    - `timeout 300 node --experimental-vm-modules node_modules/jest/bin/jest.js test/documentation`, `npm run test:types`, and `timeout 300 node --experimental-vm-modules node_modules/jest/bin/jest.js test/config test/types`. **EXPECTED OUTCOME:** all PASS and the export-surface snapshot unchanged (`git status` shows no `.snap` change)
    - `node scripts/audit-documentation.mjs` reports no new finding in the files this spec edited
    - _Requirements: 1.10, 6.4, 7.4, 10.9_
  - [x] 4.2 Full suite
    - `timeout 900 npm test`. **EXPECTED OUTCOME:** the same pass and fail set as task 1.1, plus the new tests. Any new failure is fixed before task 5. A failure in `test/migration/` caused only by uncommitted edits to the six files named in the repository notes is expected on a dirty tree; none of this spec's files is among them, so report any such failure rather than ignoring it
    - Confirm `package.json` still reads `1.4.2` and the exports of `src/index.js` and `src/lib/tools/index.js` are unchanged
    - _Requirements: 10.9, 11.1, 11.5_

- [x] 5. Documentation
  - [x] 5.1 New section in `response-management.md`
    - **File:** `docs/01-advanced-implementation-for-web-service/response-management.md`: add "Generic Response Templates" after "Custom Response Templates" and before "Response Finalization", from design.md "response-management.md (new section)". Cover every point in Requirement 8.1 (items 1 to 8). Use the file's own heading style
    - The link to observation O12 is `../cloudfront-notes/lambda-proxy-response-body.md`. Do not edit the notes files
    - _Requirements: 8.1, 8.3, 8.4, 8.6_
  - [x] 5.2 Rewrite "Generic Response Generators" in the tools README
    - **File:** `docs/features/tools/README.md`: replace the body of the section from design.md "docs/features/tools/README.md (rewrite)". Keep the heading, its table-of-contents entry and the text after the section. Show no module called as a function
    - _Requirements: 8.2, 8.3, 8.6, 12.4_
  - [x] 5.3 Run every documentation snippet
    - Probe each `javascript` snippet from 5.1 and 5.2 against the repository sources (same recipe as 1.3; `clientRequest` is a `ClientRequest` built from the fixtures). Compare each commented output with the probe's output and correct the comment, never the probe. Include: `new Response(req, { statusCode: 201 })`, the 301 redirect with `Location`, the `response400` and `response410` `Response.init` example (410 uses its own template, an unlisted 4xx uses the custom 400), and each README helper call
    - Record each snippet and its output in the completion notes. No account, endpoint or host identifier appears in any doc: `example.com` is the only host
    - _Requirements: 8.5, 12.1_
  - [x] 5.4 Documentation tests
    - `timeout 300 node --experimental-vm-modules node_modules/jest/bin/jest.js test/documentation` and `node scripts/audit-documentation.mjs`. **EXPECTED OUTCOME:** PASS, with all relative links resolving and all `javascript` fences parsing
    - _Requirements: 8.6, 10.9_

- [x] 6. Consistency searches
  - [x] 6.1 `response427`
    - Search `docs/`, `README.md`, `types/` and `src/` for `response427`. **EXPECTED OUTCOME:** each hit says it is deprecated and names `response429`, apart from the factory code itself, the pinned tests and earlier CHANGELOG entries
    - _Requirements: 12.1_
  - [x] 6.2 Fallback statements
    - Search `docs/`, `README.md`, `types/` and the JSDoc of `src/lib/tools/` for `Internal Server Error`, `response500` and `falls back`. **EXPECTED OUTCOME:** no statement contradicts the class fallback. Fix any that does
    - _Requirements: 12.2_
  - [x] 6.3 One list of listed codes
    - Compare the code list in the `createGenericResponseModule` JSDoc, `types/lib/tools/index.d.ts`, the `response-management.md` table and `test/helpers/generic-response-status-codes.mjs`. **EXPECTED OUTCOME:** the same seventeen codes in each
    - _Requirements: 12.3_
  - [x] 6.4 No function-style calls
    - Search the documentation set for `jsonGenericResponse(`, `htmlGenericResponse(`, `xmlGenericResponse(`, `rssGenericResponse(` and `textGenericResponse(`. **EXPECTED OUTCOME:** no hit
    - _Requirements: 12.4_

- [x] 7. Final task: CHANGELOG, final checks and report
  - [x] 7.1 Add the CHANGELOG entries
    - Follow `.kiro/steering/changelog-convention-package.md`. Repeat the version lookup of 1.4 now: `package.json` version, then the matching heading. Create `## v1.4.2 (unreleased)` directly above `## v1.4.1 (2026-11-12)` if it does not exist, with no date and no intro. If the heading has a date, STOP and tell the user to run `npm version`. If the classification as a PATCH is questioned, STOP and ask before logging anything
    - Add the entries from design.md "CHANGELOG (final task)" in the order Fixed, Added, Changed, Deprecated, with ` - ` after each bold title, the spec link at the end, and `addresses [#252](https://github.com/63klabs/cache-data/issues/252)` (from `bugs.url` in `package.json`) on the Added entry. Do not use `Breaking Changes`. Do not edit any dated section
    - Establish the affected versions for the Changed entries: run `npm view @63klabs/cache-data versions --json` (read-only) and `git log --format='%h %ad %s' --date=short -S'this.response500' -- src/lib/tools/` and state the range only if the first published version containing the fallback can be confirmed. Otherwise write "every release that includes the generic response modules" and tell the user
    - Check every spec link points to a directory that exists, and the Changed entry has the sub-bullet that the release ships as a PATCH and departs from AGENTS.md 2.2
    - _Requirements: 9.1 to 9.7, 11.5_
  - [x] 7.2 Final checks
    - `timeout 900 npm test`, `npm run test:types`, and `npx eslint` on the touched source and test files, each as in tasks 3.12 and 4. **EXPECTED OUTCOME:** same as task 4
    - `git diff --stat` and `git status` show only: `src/lib/tools/generic.response.js`, `generic.response.xml.js`, `generic.response.rss.js`, `Response.class.js`, `types/lib/tools/index.d.ts`, `test/types/consumer-tools.ts`, `test/helpers/generic-response-status-codes.mjs`, the updated and new files under `test/response/`, `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/features/tools/README.md`, `CHANGELOG.md`, and this spec directory. Report anything else to the user rather than reverting it
    - `npm pack --dry-run` includes `src/lib/tools/generic.response.js` and `types/lib/tools/index.d.ts`, and lists no `.kiro/`, `test/`, `docs/` or `scripts/` path
    - `package.json` reads `1.4.2`; `src/index.js` and `src/lib/tools/index.js` exports are unchanged; `AGENTS.md` and the steering files are unchanged by this spec
    - _Requirements: 1.10, 10.9, 11.1, 11.2, 11.5, 11.6_
  - [x] 7.3 Hygiene
    - No stray jest or child node processes: `ps aux | grep -E "jest|node.*-e" | grep -v grep`. `/tmp/spec-1-4-2-src.patch` removed after the stash round trip is confirmed. No temp file or probe script in the working tree
    - _Requirements: 10.9_
  - [x] 7.4 Report to the user, and ask before any commit, tag or publish
    - Summarize what changed and the residual limits: `response(n).statusCode` of a fallback is the template's; a 410 body says "Bad Request"; a `null` body on 3xx, 205 and on a 204 behind HTTP API, ALB or function URLs is unverified (only REST API was checked for 202 and 204); direct reads of `response427` do not warn; `finalize()` still adds `max-age` to a bodiless 2xx or 3xx unless the application sets `Cache-Control`
    - Remind the user of the items outside this change: the two 1.4.2 spin-off folders (`Response.init()` XML slot, `setStatusCode()` content type), the AGENTS.md stale version line and 2.2 wording (Decision 10), and the removal of `response427` as a major-version decision. Take no action on any of them
    - Do not commit, tag, publish or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9"] },
    { "id": 5, "tasks": ["3.10"] },
    { "id": 6, "tasks": ["3.11"] },
    { "id": 7, "tasks": ["3.12"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["5.1", "5.2"] },
    { "id": 11, "tasks": ["5.3"] },
    { "id": 12, "tasks": ["5.4"] },
    { "id": 13, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 14, "tasks": ["7.1"] },
    { "id": 15, "tasks": ["7.2"] },
    { "id": 16, "tasks": ["7.3"] },
    { "id": 17, "tasks": ["7.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baselines (suite, lint and types, current behavior, CHANGELOG lookup)
        v
2  source + types (2.1 to 2.4, different files) ──> 2.5 probe, response tests: only list-pinning tests fail
        v
3  3.1 helper ──> 3.2 to 3.9 tests (different files) ──> 3.10 PASS ──> 3.11 vacuity check ──> 3.12 lint
        v
4  CHECKPOINT: documentation tests, types, export surface, full suite
        v
5  5.1 section, 5.2 README (parallel) ──> 5.3 run snippets ──> 5.4 doc tests
        v
6  searches (6.1 to 6.4)
        v
7  CHANGELOG ──> final checks ──> hygiene ──> report, ask before commit
```

**Critical path:** 1 → 2 → 3.1 → 3.9 → 3.10 → 3.11 → 4 → 5.1 → 5.3 → 5.4 → 7.

**Ordering constraints:**

- Task 1 must finish before anything changes, so the baselines describe the current tree.
- Tasks 2.1 to 2.4 edit different files and can run together. Task 2.5 runs before the tests are written, so the unchanged existing tests show that only the list-pinning tests are affected.
- Task 3.1 comes before the tests that import the helper (3.2, 3.3, 3.5 to 3.8).
- Task 3.11 needs 3.10 green first, and it restores the source before anything else runs.
- Task 4.2 is a hard gate: the full suite must be green before the documentation work, because the documentation tests scan the edited source.
- Task 5.3 runs after 5.1 and 5.2 and before 5.4, so the documented outputs come from a real run.
- Task 7.1 stops if the `(unreleased)` heading rules in `changelog-convention-package.md` cannot be satisfied. It is the last task that changes a file.

## Notes

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Templates | 2.1, 2.5, 3.2 to 3.6, 4.1 |
| 2. XML and RSS success element | 2.2, 3.4, 3.6 |
| 3. Class fallback | 1.3, 2.1, 2.5, 3.5, 3.6, 3.8 |
| 4. `reset()` | 1.3, 2.3, 2.5, 3.7, 3.8, 3.10 |
| 5. Deprecation of `response427` | 2.1, 2.4, 2.5, 3.9, 6.1 |
| 6. Type declarations | 2.4, 4.1 |
| 7. JSDoc | 2.1, 2.3, 4.1 |
| 8. User documentation | 5.1 to 5.4 |
| 9. Changelog | 1.4, 7.1 |
| 10. Tests | 1.1, 1.2, 3.1 to 3.12, 4.1, 4.2, 7.2 |
| 11. Backwards compatibility and release | 2.5, 4.2, 7.1, 7.2 |
| 12. Accuracy and consistency | 5.2, 5.3, 6.1 to 6.4 |

### Decision to task map

| Decision | Tasks |
|---|---|
| 1 (seven templates, no 3xx) | 2.1, 3.1, 3.5, 3.6 |
| 2 (class fallback) | 2.1, 3.5, 3.6, 3.8, 5.1 |
| 3 (`reset()` assigns `null`) | 2.3, 3.7, 3.8 |
| 4 (keep and deprecate `response427`) | 2.1, 2.4, 5.1, 6.1, 7.1 |
| 5 (PATCH in 1.4.2) | 1.4, 4.2, 7.1, 7.2 |
| 6 (no new runtime verification, documented) | 5.1, 7.4 |
| 7 (related items) | 5.2, 6.4 |
| 8 (bodiless 1xx, 3xx, 205) | 2.1, 3.5, 3.6, 5.1 |
| 9 (one-time warning from `response()`) | 2.1, 2.5, 3.9 |
| 10 (exception recorded, AGENTS.md unedited) | 7.1, 7.2, 7.4 |

### Related documentation

- [requirements.md](requirements.md) - the 12 requirements these tasks satisfy
- [design.md](design.md) - the code, the documentation text, the test design, the CHANGELOG draft and the verification list
- [PLAN.md](PLAN.md) - the locked decisions (1 to 10) and the review that led to them
