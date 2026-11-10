# Implementation Plan

## Overview

Ordering follows [design.md](design.md). This spec adds one method to `Response`, JSDoc and a type declaration for it, two new test files and one type-check addition, and documentation. `finalize()`, `set()`, `reset()`, and the constructor do not change.

- **Task 1 records baselines** before anything changes.
- **Task 2 adds the method, its JSDoc, and the type declaration**, then probes it and re-runs the existing response tests.
- **Task 3 adds the tests** and runs them.
- **Task 4 is the first checkpoint:** the documentation tests, the type test, and the full suite, with code and tests complete.
- **Tasks 5 and 6 are the documentation and release notes:** the new notes file, the docs section, the two corrected examples, and the CHANGELOG. They can run in parallel after task 4, except that the docs link to the notes file (5.1 first).
- **Task 7 searches the documentation set.**
- **Task 8 is the final check.**

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, or `npm test` from the terminal for the suite, each under `timeout` (the full suite: `timeout 900`). A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file. Nothing in this spec spawns a child process.

**Probes:** run a throwaway probe as one plain `node --input-type=module -e '<script>'` command with no pipes and no heredocs. Use `createRequire(import.meta.url)` to load `./src/lib/tools/index.js`, call `ClientRequest.init({ validations: testValidationsA })` and `Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 3600 } })` once, silence `console.log`, and replace `DebugAndLog.log` when you need the `RESPONSE` line. The fixtures are `test/helpers/test-event.js`, `test-context.js`, and `test-validations.js`.

**Runtimes:** `ls "$HOME/.nvm/versions/node"` lists the installed Node.js versions. To run a file on another version, call that version's binary: `"$HOME/.nvm/versions/node/<version>/bin/node" --experimental-vm-modules node_modules/jest/bin/jest.js <path>`.

**Linting:** the repository isn't lint-clean, so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baselines in design.md "Lint". `.md` and `.ts` files aren't linted. New `.mjs` files import Jest globals from `@jest/globals` and use no undeclared global.

**No AWS access:** the observations were measured on 2026-11-10 and the test stack is already deleted. No task calls AWS. Documentation range addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) are the only addresses allowed in any file. No account ID, profile name, API or endpoint ID, distribution domain, stack name, function name, or request ID goes into any file.

**Constraints that come from existing tests and standards:**
- The `test/documentation/` tests scan the JSDoc in `src/lib/tools/`: keep `@returns` and `@example` in every block you edit or add.
- Code fences marked `javascript` in the docs must parse, and every relative link must resolve.
- JSDoc, types, and user documentation name `docs/...` paths in plain text and add no link to them, because `docs/` is excluded from the npm package (`.npmignore`).
- The user documentation, JSDoc, and types never mention the private field `_body` or `TestHarness`.
- The method name is exactly `setBodyToNull`. Don't add an alias such as `clearBody` anywhere in `src/`, `types/`, tests, or docs (the docs may say the issue called it `clearBody()`).
- Don't pass a `seed` option to `fc.assert`; the `FC_SEED` hook seeds every call.

**Commits:** don't commit, tag, publish, or push without explicit instruction. Open no GitHub issue or comment. The three spin-off folders already exist as `ISSUE.md` files; create no more.

## Tasks

- [x] 1. Record the baselines (BEFORE any change)

  - [x] 1.1 Record the suite baseline
    - Run `timeout 900 npm test` on the unchanged tree. Record the pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 4
    - `git status` shows only the spec directories (this one and the three `1-4-2-*` folders) and the other `1-4-1-*` spec changes you didn't make
    - _Requirements: 5.8_

  - [x] 1.2 Record the lint baseline
    - Run `npx eslint src/lib/tools/Response.class.js`
    - **EXPECTED OUTCOME:** 0 errors, matching design.md "Lint". Record any difference
    - _Requirements: 5.9_

  - [x] 1.3 Record the current behavior
    - Probe: build a `Response`, call `setStatusCode(202)`, `setBody(null)`, `finalize()`; also print `typeof response.setBodyToNull`
    - **EXPECTED OUTCOME:** status `202`, body `{"message":"Success"}` (as a string), `Content-Type: application/json`, and `typeof` is `undefined`
    - _Requirements: 2.1_

- [x] 2. Add the method, its JSDoc, and the type declaration
  - Edit by searching for the text, not by line number; line numbers move as you edit. **Do not edit any existing test file in this task**

  - [x] 2.1 Add `setBodyToNull`
    - **File:** `src/lib/tools/Response.class.js`, directly after the `setBody` property, with the JSDoc and code from design.md "Response.setBodyToNull" (tabs, an arrow-function class property)
    - The JSDoc has a description, `@returns {void}`, and two `@example` blocks. It names `docs/01-advanced-implementation-for-web-service/response-management.md` in text only, and doesn't mention `_body`
    - Change no other code in the file
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 1.8, 1.9, 3.1_

  - [x] 2.2 Update the `setBody` and `set` JSDoc
    - **File:** `src/lib/tools/Response.class.js`: add the falsy-value sentences from design.md "setBody and set (JSDoc only)" to the JSDoc of `setBody` and `set`
    - Don't change a `@param` type, an example, or any line of code
    - _Requirements: 3.2, 2.3_

  - [x] 2.3 Add the type declaration
    - **File:** `types/lib/tools/index.d.ts`: `setBodyToNull(): void;` with the doc comment from design.md "Types" directly after `setBody(body: any): void;`, and the added sentence in the `setBody` comment
    - Change nothing else in `types/`; in particular leave the `toObject()` and `finalize()` return types
    - _Requirements: 3.3, 1.9_

  - [x] 2.4 Probe the new method and re-run the response tests
    - Probe (same recipe as 1.3, plus a `DebugAndLog.log` replacement): `setStatusCode(202)`, `setBodyToNull()`, `finalize()`; then `setBody(null)` on a fresh response
    - **EXPECTED OUTCOME:** the first gives status `202`, `body: null`, `Content-Type: application/json`, `Cache-Control: max-age=3600`, and a `RESPONSE` line whose field 1 is `0`; the second still gives the template body (the compatibility decision)
    - Run `test/response/`. **EXPECTED OUTCOME:** all PASS. No existing test changed
    - `git diff -- src/lib/tools/Response.class.js` shows only comment lines and the added property: nothing inside `finalize`, `set`, `reset`, or the constructor
    - _Requirements: 1.3, 1.4, 2.1 to 2.3, 8.3_

- [x] 3. Add the tests
  - New files only, plus the two lines in `consumer-tools.ts`. **Don't change an existing test.** Follow design.md "Test design" and the patterns of `test/response/set-message-unit-tests.jest.mjs` and `response-log-field-sanitization-tests.jest.mjs`

  - [x] 3.1 Write the unit and characterization tests
    - **File:** `test/response/response-set-body-to-null-unit-tests.jest.mjs` (new), with a header comment (Purpose, Setup, Related Tests)
    - Shared setup: imports from `@jest/globals`; `ClientRequest.init` once at the top; `Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 3600 } })` and a `DebugAndLog.log` spy (`mockImplementation(() => Promise.resolve())`) in `beforeEach`; `jest.restoreAllMocks()` in `afterEach`
    - The `describe` blocks and cases are the table in design.md: the method itself (including the call twice and on a fresh response, `undefined` return, and status/headers unchanged via `toObject()` before `finalize()`); interactions (`reset({ statusCode: 200 })` restores `Response.getGenericResponses("JSON").response(200).body`, `setMessage`, `addToJsonBody`, `setBody`, `setStatusCode`, `setHeaders`); cache headers (application-set `no-store` and `0` survive; unset gives `max-age=3600`); the `RESPONSE` line (status `"202"`, byte count `"0"`, read from the `DebugAndLog.log` spy calls tagged `"RESPONSE"` and split on `" | "`); the characterization of `setBody(null | undefined | "" | 0 | false)` via `it.each`; and `reset`/constructor with `body: null` at status 200
    - The characterization `describe` names and a header comment say that they pin the compatibility decisions Q1 and Q2
    - No `process.env` change, no real AWS call, no child process
    - _Requirements: 5.1, 5.2, 5.7, 1.2 to 1.6, 2.1, 2.2_

  - [x] 3.2 Write the property tests
    - **File:** `test/response/response-set-body-to-null-property-tests.jest.mjs` (new), with the same setup
    - Property 1: for `fc.integer({ min: 200, max: 599 })` and `fc.record({ id: fc.integer(), name: fc.string({ maxLength: 20 }), tags: fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }) })`, `setStatusCode`, `setBody`, `setBodyToNull`, `finalize` give `body: null` and the same status
    - Property 2: for `fc.constantFrom(null, undefined, "", 0, false)` and the same record, `setBody(record)` then `setBody(value)` leaves `getBody()` equal to the record
    - Each uses `{ numRuns: 100 }`, no `seed`, no filter on the asserted predicate, and no child process
    - _Requirements: 5.3, 5.7_

  - [x] 3.3 Add the type check
    - **File:** `test/types/consumer-tools.ts`, in the "Response class" section after the `isInit` line: `declare const typedResponse: InstanceType<typeof tools.Response>;` and `typedResponse.setBodyToNull();`
    - If `npm run test:types` rejects the `InstanceType` form, use the fallback in design.md "Type check" and record which form was used
    - _Requirements: 5.5_

  - [x] 3.4 Run the new tests and their neighbors
    - Run the two new files, then `test/response/`, then `test/request/`. **EXPECTED OUTCOME:** all PASS
    - Run `npm run test:types`. **EXPECTED OUTCOME:** PASS
    - Run the two new files on one other installed Node.js major (22 or 26). **EXPECTED OUTCOME:** PASS; a difference means fast-check or Jest behaves differently on that runtime: record it and bring it to the user
    - Check: `git status` lists the two new test files and `consumer-tools.ts` as the only test changes; `ps aux | grep jest | grep -v grep` prints nothing
    - _Requirements: 5.1 to 5.8_

  - [x] 3.5 Lint the changed and new files
    - `npx eslint src/lib/tools/Response.class.js test/response/response-set-body-to-null-unit-tests.jest.mjs test/response/response-set-body-to-null-property-tests.jest.mjs`
    - **EXPECTED OUTCOME:** 0 errors in each file. Fix a new file; if `Response.class.js` reports any, compare with 1.2
    - _Requirements: 5.9_

- [x] 4. Checkpoint: code and tests complete

  - [x] 4.1 Run the targeted checks
    - Run `test/documentation/`. **EXPECTED OUTCOME:** all PASS, including the JSDoc completeness and parameter-name checks over `src/lib/tools/Response.class.js`
    - Run `npm run test:types`. **EXPECTED OUTCOME:** PASS
    - _Requirements: 3.5, 5.5, 5.8_

  - [x] 4.2 Run the full suite
    - Run `timeout 900 npm test`
    - **EXPECTED OUTCOME:** everything passes except failures recorded as pre-existing in 1.1. If another existing test fails because of this change, stop and investigate: the change should not alter existing behavior (Requirement 8.3). Don't weaken an assertion
    - A local failure of the migration property tests for uncommitted `src/` edits is an expected effect, not a code problem; `Response.class.js` is not one of the files they check
    - `git status`: modified existing files are `src/lib/tools/Response.class.js`, `types/lib/tools/index.d.ts`, and `test/types/consumer-tools.ts`
    - Check for stray processes: `ps aux | grep jest | grep -v grep` prints nothing
    - _Requirements: 5.8, 8.3_

- [x] 5. Update the documentation
  - Describe behavior, not internals. Don't mention `_body` or `TestHarness`. Examples have a language on every code block and complete, parseable JavaScript. Every external URL is one named in design.md

  - [x] 5.1 Write the notes file
    - **File:** `docs/cloudfront-notes/lambda-proxy-response-body.md` (new), following design.md "`docs/cloudfront-notes/lambda-proxy-response-body.md` (new)": purpose and status vocabulary, topologies (T1 and T4 from the sibling page), the observations table with O9 to O12, the method with the Lambda function code and the 16-request matrix, limits, adding an observation (next ID O13), related documentation
    - Use the exact status wording "Documented by AWS" or "Not documented by AWS". Describe the requests; copy no response header block, request ID, host, or identifier
    - _Requirements: 6.1 to 6.7_

  - [x] 5.2 Link the notes file from the notes page
    - **File:** `docs/cloudfront-notes/README.md`: add the one bullet from design.md to "Related documentation". Change no other line; leave O1 to O8 as they are
    - _Requirements: 6.1_

  - [x] 5.3 Add the docs section
    - **File:** `docs/01-advanced-implementation-for-web-service/response-management.md`: add "Sending a response with no body" from design.md after "Overriding cache headers per response" and before "Reset and Reuse". Two examples, the note about `setBody(null)`, and the four "Things to know" bullets, each linking to `../cloudfront-notes/lambda-proxy-response-body.md#observations`
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.8_

  - [x] 5.4 Correct the routing example
    - **File:** `docs/01-advanced-implementation-for-web-service/routing-patterns.md`: in the `else` branch of `UsersController.delete`, replace `response.setBody(null);` with `response.setBodyToNull(); // setBody(null) is ignored; this sends no body`. Change nothing else
    - _Requirements: 4.4_

  - [x] 5.5 Replace the invalid Response sample
    - **File:** `docs/features/tools/README.md`: replace the "Response Class" sample with the one in design.md and add the sentence that links to the new section (`../../01-advanced-implementation-for-web-service/response-management.md#sending-a-response-with-no-body`). Leave the `ResponseDataModel` sample below it as it is
    - _Requirements: 4.5, 4.6_

  - [x] 5.6 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the link-validity tests over the new file and the new links, and the example-syntax tests over the new code fences
    - _Requirements: 6.8, 9.4_

- [x] 6. Record the release notes

  - [x] 6.1 Update `CHANGELOG.md`
    - **Precondition:** `package.json` reads `1.4.1` and `CHANGELOG.md` has a `## v1.4.1 (unreleased)` heading. If either is missing, **STOP and ask the developer**. Don't create the heading or bump the version
    - Add exactly the three entries in design.md "CHANGELOG": the `Response.setBodyToNull()` entry first in `### Added`, the notes entry after the existing "CloudFront and API Gateway observations" entry, and the documentation-examples entry at the end of `### Fixed`
    - `git diff -- CHANGELOG.md` shows only added lines. No existing line is edited or removed
    - _Requirements: 7.1 to 7.4_

- [x] 7. Check the documentation set

  - [x] 7.1 Search for the method name and the removed pattern
    - Search `src`, `types`, `test`, `docs`, `README.md`, and `CHANGELOG.md` for `clearBody`. **EXPECTED OUTCOME:** no hit, except a sentence that says the issue called the method `clearBody()`
    - Search `docs/` and `README.md` for `setBody(null)`. **EXPECTED OUTCOME:** only text that says the call is ignored
    - Search the "Response Class" section of `docs/features/tools/README.md` for `setHeader(`, `response.get(`, and `new Response()`. **EXPECTED OUTCOME:** no hit
    - _Requirements: 1.9, 4.5, 4.7, 9.1, 9.2_

  - [x] 7.2 Search for private names and identifiers
    - Search `docs/`, the JSDoc and types you edited, and `CHANGELOG.md` for `_body` and `TestHarness`. **EXPECTED OUTCOME:** no hit in user documentation, JSDoc, or types
    - Search the new and edited docs for: the AWS account ID, the AWS profile name (search for `--profile` and `AWS_PROFILE`), `execute-api` hostnames, `cloudfront.net` domains, the stack name `kiro-probe`, and the function name `kiro-probe`. Search every new and changed file for IPv4 addresses outside the documentation ranges. **EXPECTED OUTCOME:** no hit, except `127.0.0.1` in `test/helpers/test-event.js` (unchanged) and `<id>.execute-api.` style placeholders
    - _Requirements: 1.7, 4.8, 6.6_

  - [x] 7.3 Trace the measured claims
    - For each statement about API Gateway in `response-management.md`, the JSDoc, the type comment, and the CHANGELOG, confirm it appears as one of O9 to O12 (or in PLAN.md Section 2) with the same date and topology, and that the "REST API only" limit is stated where the no-502 result is
    - Re-run the 2.4 probe. **EXPECTED OUTCOME:** the same result as before
    - _Requirements: 4.2, 6.7, 9.3_

- [x] 8. Final checkpoint

  - [x] 8.1 Run the full verification
    - Run `timeout 900 npm test` and `npm run test:types` on the default Node.js version
    - Run `npx eslint` on `Response.class.js` and the two new test files: 0 errors each
    - Confirm the export names of `src/index.js` and `src/lib/tools/index.js` are unchanged and `package.json` still reads `1.4.1`
    - _Requirements: 5.8, 5.9, 8.1, 8.2, 8.4_

  - [x] 8.2 Check the package contents
    - `npm pack --dry-run` includes `src/lib/tools/Response.class.js` and `types/lib/tools/index.d.ts`, and lists no `.kiro/`, `test/`, `docs/`, or `scripts/` path (the new notes are read on GitHub, not in the package)
    - _Requirements: 3.1_

  - [x] 8.3 Check hygiene
    - No stray jest processes: `ps aux | grep jest | grep -v grep`. No temp file or probe script left in the working tree
    - `git status` shows only: `src/lib/tools/Response.class.js`, `types/lib/tools/index.d.ts`, `test/types/consumer-tools.ts`, the two new test files, `CHANGELOG.md`, `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/01-advanced-implementation-for-web-service/routing-patterns.md`, `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md`, `docs/cloudfront-notes/lambda-proxy-response-body.md`, and the spec directories. Report anything else to the user rather than reverting it
    - _Requirements: 8.5_

  - [x] 8.4 Report to the user, and ask before any commit, tag, or publish
    - Summarize what changed and the residual limits: REST API only was checked; `setBody(null)` stays a no-op; `finalize()` still adds `max-age` to a bodiless 2xx unless the application sets `Cache-Control`
    - Remind the user of the follow-ups outside this change: the three `1-4-2-*` spin-off folders, and that `63Klabs/atlantis-mcp` can replace `response._body = null` with `response.setBodyToNull()` after 1.4.1 is published (PLAN.md N5). Take neither action
    - Don't commit, tag, publish, or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4"] },
    { "id": 6, "tasks": ["3.5"] },
    { "id": 7, "tasks": ["4.1"] },
    { "id": 8, "tasks": ["4.2"] },
    { "id": 9, "tasks": ["5.1", "6.1"] },
    { "id": 10, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 11, "tasks": ["5.6", "7.1", "7.2", "7.3"] },
    { "id": 12, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 13, "tasks": ["8.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baselines (suite, lint, current behavior)
        v
2  method + JSDoc + types ──> 2.4 probe, response tests PASS
        v
3  new unit + property tests, type check ──> 3.4 PASS ──> 3.5 lint
        v
4  CHECKPOINT: documentation tests, types, full suite
        v
5.1 notes file ─┬─ 6.1 CHANGELOG                 (parallel)
                v
5.2 notes link, 5.3 docs section, 5.4 routing fix, 5.5 tools sample   (parallel, different files)
        v
5.6 doc tests ─ 7 searches and traces
        v
8  final checkpoint ──> 8.4 report, ask before commit
```

**Critical path:** 1 → 2 → 3 → 4 → 5.1 → 5.3 → 5.6 → 8.

**Ordering constraints:**

- Task 1 must finish before anything changes, so the baselines describe the current tree.
- Task 2.2 follows 2.1 because both edit `Response.class.js`.
- Task 2.4 runs before the tests are written, so the unchanged existing tests prove that the method added nothing else.
- Task 4.2 is a hard gate: the full suite must be green before the documentation work, because the documentation tests and the JSDoc scan run against the edited source.
- Task 5.1 comes before 5.2 to 5.5 because they link to the notes file.
- Task 6.1 stops if the `v1.4.1 (unreleased)` heading or the `package.json` version is missing.
- Task 7 runs after all documentation is written; the final checkpoint after that.

## Notes

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. `Response.setBodyToNull()` | 2.1, 2.4, 3.1, 7.1, 7.2 |
| 2. Existing behavior unchanged | 1.3, 2.2, 2.4, 3.1 |
| 3. JSDoc and type declarations | 2.1, 2.2, 2.3, 4.1, 8.2 |
| 4. User documentation | 5.3, 5.4, 5.5, 7.1, 7.2, 7.3 |
| 5. Tests | 1.1, 1.2, 3.1 to 3.5, 4.1, 4.2, 8.1 |
| 6. API Gateway observations | 5.1, 5.2, 5.6, 7.2, 7.3 |
| 7. Changelog | 6.1 |
| 8. Backwards compatibility and release | 2.4, 4.2, 8.1, 8.3 |
| 9. Accuracy and consistency | 5.6, 7.1, 7.3 |

### Decision to task map

| Decision | Tasks |
|---|---|
| Q1 (add the method only) | 2.1, 2.4, 3.1, 3.2 |
| Q2 (`reset()` and constructor unchanged) | 2.4, 3.1 |
| Q3 (no cache-header change; document the pairing) | 3.1, 5.3, 6.1 |
| Q4, Q6 (API Gateway check) | 5.1, 7.3 |
| Q5 (spin-offs) | 8.4 |
| Q7 (method name `setBodyToNull`) | 2.1, 2.3, 7.1 |
| D1 (ships in 1.4.1) | 6.1, 8.1 |
| D6 (fix the invalid sample) | 5.5 |
| D7 (tests) | 3 |
| D9, D11 (record the check without identifiers; REST API only) | 5.1, 7.2, 7.3 |

### Related documentation

- [requirements.md](requirements.md) - the 9 requirements these tasks satisfy
- [design.md](design.md) - the code, the documentation text, the test design, and the verification table
- [PLAN.md](PLAN.md) - the Decision Log (Q1 to Q7, D1 to D11) and the API Gateway check in Section 2
