# Implementation Plan

## Overview

Ordering follows [design.md](design.md). This spec changes one line of `Response.class.js`, adds two test files, adds an `xmlResponses` example to two documentation files, and adds one CHANGELOG entry. The tests are written first and run red, so they prove they catch the defect.

- **Task 1 records baselines** before anything changes.
- **Task 2 adds the two test files** and runs them against the unchanged source. They must fail for the reason in PLAN.md.
- **Task 3 changes line 163** and runs the new tests green, then the response suite.
- **Task 4 is a checkpoint:** the full suite and the type test, with code and tests complete.
- **Task 5 writes the documentation** and runs the documentation tests.
- **Task 6 is the CHANGELOG and the final check.** The CHANGELOG is the last task of this spec (`AGENTS.md` 7.2), so the final hygiene checks sit inside it.

**Test execution:** use `timeout 120 node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, and `timeout 900 npm test` for the suite. Never write a test that runs `npm test`. Check for stray processes with `ps aux | grep jest | grep -v grep` before and after the suite (`test-execution-monitoring.md`).

**Probes:** run a throwaway probe as one plain `node --input-type=module -e '<script>'` command, with no heredoc. Use `createRequire(import.meta.url)` to load `./src/lib/tools/index.js`. Write no probe file into the working tree.

**Linting:** the repository is not lint-clean, so `npm run lint:ci` can fail for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baseline from task 1.2.

**No AWS access:** no task calls AWS. No task changes `package.json` or `package-lock.json`.

**Constraints that come from existing standards:**
- Each test file calls `Response.init()` once at module level. Never call it in `beforeEach`, and never use a child process (Requirement 4.5).
- Do not pass a `seed` option to `fc.assert`; the global `FC_SEED` hook seeds every call. Do not filter the property generator by the asserted predicate (`test-execution-monitoring.md`).
- Do not edit any existing test file (Requirement 3.5), `types/`, `src/lib/tools/index.js`, the generic response modules, or the `Response.init` JSDoc (Requirement 3.4).
- Documentation never mentions `TestHarness` or a private field. Code fences marked `javascript` must parse and every relative link must resolve.
- Do not commit, tag, publish or push without explicit instruction. Open no GitHub issue or comment. The spin-off spec directory `1-4-2-response-generic-template-content-type-header-is-ignored` already exists; create no more.

## Tasks

- [x] 1. Record the baselines (BEFORE any change)
  - [x] 1.1 Record the suite baseline
    - Run `ps aux | grep jest | grep -v grep` (expect nothing), then `timeout 900 npm test` on the unchanged tree
    - Record the pass and fail counts and every failing test in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 4
    - `git status` shows only this spec directory and the spin-off spec directory
    - _Requirements: 7.1_
  - [x] 1.2 Record the lint baseline
    - Run `npx eslint src/lib/tools/Response.class.js`
    - Record the error and warning counts. Task 3.3 compares against them
    - _Requirements: 3.1_
  - [x] 1.3 Record the current behavior
    - Probe: `Response.init({ htmlResponses: { response404: { statusCode: 404, headers: { "Content-Type": "text/html" }, body: "<html>custom404</html>" } }, xmlResponses: { response200: { statusCode: 200, headers: { "Content-Type": "application/xml" }, body: "<custom>xml</custom>" } } })`, then print `getGenericResponses("HTML").response(404)`, `getGenericResponses("XML").response(200).body`, and `getGenericResponses("HTML") === htmlGenericResponse`
    - **EXPECTED OUTCOME:** the HTML 404 is the built-in XML error body (`<error>Not Found</error>`) with `Content-Type: application/xml`, the XML 200 body is the built-in `<hello>Success</hello>`, and the identity check is `false`
    - _Requirements: 1.2, 2.2_

- [x] 2. Add the tests (red)
  - **Do not edit the source or any existing test file in this task**
  - [x] 2.1 Add file A
    - **File:** `test/response/response-init-all-slots-unit-tests.jest.mjs`, following design.md "Test file A"
    - Header comment in the format of `test/response/response-generic-templates-custom-unit-tests.jest.mjs` (purpose, setup, teardown, related tests, `Validates` line), stating that `Response.init()` is called once per file
    - Module level: `ClientRequest.init({ validations: testValidationsA })`, then one `Response.init()` call with the five options from the design table (distinct marker bodies; custom XML `Content-Type` `application/x-xml-custom`; an HTML `response404`)
    - Cases: each slot returns its own marker; no slot returns another's; `"XML"` and `Response.CONTENT_TYPE.XML` return the same object; the built-in XML 404 survives a custom XML `response200`; `response(206)` returns the custom XML 200 body; the constructor with `Response.CONTENT_TYPE.XML` carries the custom body for 200 and the built-in body for 404; `xmlGenericResponse.response200.body` is unchanged and not the slot; the custom HTML 404 and HTML 200 survive the XML option
    - Property: `fc.integer({ min: 100, max: 599 })`, no filter, `numRuns: 100`, no `seed`; the HTML slot's `Content-Type` is neither `Response.CONTENT_TYPE.XML` nor `application/x-xml-custom`
    - `jest.restoreAllMocks()` in `afterEach`. No child process, no `npm test`, no AWS call
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 4.1, 4.3, 4.4, 4.5_
  - [x] 2.2 Add file B
    - **File:** `test/response/response-init-xml-only-unit-tests.jest.mjs`, following design.md "Test file B"
    - Same header format
    - Module level, in this order: `ClientRequest.init(...)`; spies on `DebugAndLog.debug`, `.log`, `.warn` and `.error` with `mockImplementation(() => Promise.resolve())`, restored in `afterAll`; one `Response.init({ xmlResponses })` call where `xmlResponses` comes from `JSON.parse` of the string in design.md (own `__proto__` key, custom `response200` and `response404`)
    - Cases: custom XML 200 and 404; built-in `response(201)` still contains `<hello>Created</hello>`; the constructor with `Response.CONTENT_TYPE.XML` carries `<only>xml404</only>`; the HTML, JSON, RSS and text slots are identical (`toBe`) to `htmlGenericResponse`, `jsonGenericResponse`, `rssGenericResponse`, `textGenericResponse`; the HTML slot's `Content-Type` is not the XML type for 200, 404 and 500; `xmlGenericResponse.response200.body` is unchanged; `Object.prototype.polluted`, `({}).polluted` and the XML slot's `polluted` are `undefined` and the slot's prototype is `Object.prototype`; none of the four spies was called with an argument containing `xml200`, `xml404` or `polluted`
    - Import `DebugAndLog` and the generic response modules from `../../src/lib/tools/index.js` (all are exported there)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 4.2, 4.4, 4.5; security lines under 1.1 and 4.2_
  - [x] 2.3 Run both files against the unchanged source
    - Run `timeout 120 node --experimental-vm-modules node_modules/jest/bin/jest.js test/response/response-init-all-slots-unit-tests.jest.mjs test/response/response-init-xml-only-unit-tests.jest.mjs`
    - **EXPECTED OUTCOME:** both files fail. In file A the XML, HTML and property cases fail. In file B the XML cases and the HTML identity case fail. The prototype and logging cases pass; that is expected, they guard a later change (design.md "Why the prototype test passes before the fix"). A failure for any other reason (import error, `ClientRequest` not initialized) is a test bug: fix the test, do not touch the source
    - Record the failing case names in the completion notes
    - _Requirements: 4.6_

- [x] 3. Fix the assignment (green)
  - [x] 3.1 Change `init()`
    - **File:** `src/lib/tools/Response.class.js`. Edit by searching for the text, not by line number
    - In the `xmlResponses` branch, change `Response.#htmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };` to `Response.#xmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };`
    - Change no other line, and leave the commented-out `Object.assign` lines alone
    - `git diff src/lib/tools/Response.class.js` shows exactly one changed line
    - _Requirements: 1.1, 3.1, 3.4_
  - [x] 3.2 Run the new tests and the response suite
    - Re-run the command from 2.3. **EXPECTED OUTCOME:** both files pass
    - Run `timeout 300 npm run test:response`. **EXPECTED OUTCOME:** passes, with no existing test changed
    - _Requirements: 3.5, 4.6_
  - [x] 3.3 Lint
    - Run `npx eslint src/lib/tools/Response.class.js test/response/response-init-all-slots-unit-tests.jest.mjs test/response/response-init-xml-only-unit-tests.jest.mjs`
    - **EXPECTED OUTCOME:** no more errors than the baseline in 1.2 for the source file, and 0 errors in the two new files
    - _Requirements: 3.1_

- [x] 4. Checkpoint: code and tests complete
  - [x] 4.1 Run the type test
    - Run `npm run test:types`. **EXPECTED OUTCOME:** passes (no type declaration changed)
    - _Requirements: 7.2_
  - [x] 4.2 Run the full suite
    - Run `ps aux | grep jest | grep -v grep`, then `timeout 900 npm test`
    - **EXPECTED OUTCOME:** exit code 0, or only the failures recorded in 1.1. Any new failure blocks the documentation work. Fix the code or the test; do not skip a test
    - Run the two new files alone once more (task 2.3 command) to confirm they pass when run in isolation
    - _Requirements: 7.1, 7.3_

- [x] 5. Documentation
  - [x] 5.1 Update `response-management.md`
    - **File:** `docs/01-advanced-implementation-for-web-service/response-management.md`, section "Custom Response Templates"
    - Add the paragraph, the `xmlResponses` example, the `Content-Type` paragraph and the `addHeader()` example from design.md "response-management.md", after the existing JSON example. Keep the text of the existing example
    - The text says a `Response` built from a template carries `Response.CONTENT_TYPE.XML`, names `addHeader()` and `setHeaders()`, and does not say the template header applies. It mentions no private field or `TestHarness`
    - Check that the `../../CHANGELOG.md` link resolves from this directory
    - _Requirements: 5.1, 5.3, 5.4, 5.5; security lines under 5.4_
  - [x] 5.2 Update `configuration-options.md`
    - **File:** `docs/01-advanced-implementation-for-web-service/configuration-options.md`, the `Response.init` example
    - Add `xmlResponses` after `htmlResponses` as in design.md "configuration-options.md", adding the trailing comma after the `htmlResponses` block. No other line changes
    - _Requirements: 5.2, 5.4, 5.5; security lines under 5.4_
  - [x] 5.3 Check the documentation set
    - Re-read both examples: static string bodies only, no credential, account ID or real host name, no request-derived value in any body
    - Run `timeout 300 npm test -- test/documentation/` and `node scripts/audit-documentation.mjs`
    - **EXPECTED OUTCOME:** both pass. If a fence does not parse, fix the example
    - _Requirements: 5.4, 5.6_

- [x] 6. CHANGELOG and final check (last task)
  - [x] 6.1 Add the CHANGELOG entry
    - Repeat the version lookup in `.kiro/steering/changelog-convention-package.md` now, not from earlier notes: read `version` in `package.json` (expected `1.4.2`) and find the heading that starts `## v1.4.2 ` in `CHANGELOG.md`
    - **Stop and tell the user** if that heading has a date, if there is more than one `(unreleased)` heading, or if the `(unreleased)` version differs from `package.json`. Do not write the entry anywhere else
    - Otherwise add the entry from design.md "CHANGELOG" under the existing `### Fixed` category of `## v1.4.2 (unreleased)`, after the existing entry. Change no dated section and no intro text
    - Check: separator is ` - `, the spec link is at the end, there is no `addresses [#N]` reference, no exploit detail, it states "Affects v1.2.2 through v1.4.1", and it does not say the template `Content-Type` is fixed. The spec link points to a directory that exists
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 6.2 Run the final verification
    - Re-run `timeout 300 npm test -- test/documentation/` (the CHANGELOG link is scanned) and `npm run test:types`
    - Run `timeout 900 npm test`. **EXPECTED OUTCOME:** same result as task 4.2
    - Confirm `package.json` still reads `1.4.2`, `package-lock.json` is unchanged, and the export names of `src/lib/tools/index.js` are unchanged
    - _Requirements: 7.1, 7.2; security line under 7.5_
  - [x] 6.3 Check hygiene
    - `ps aux | grep jest | grep -v grep` returns nothing. No probe file or temp file is left in the working tree
    - `git status` shows only: `src/lib/tools/Response.class.js`, the two new test files, `docs/01-advanced-implementation-for-web-service/response-management.md`, `docs/01-advanced-implementation-for-web-service/configuration-options.md`, `CHANGELOG.md`, this spec directory, and `1-4-2-response-generic-template-content-type-header-is-ignored`
    - _Requirements: 7.4, 7.5_
  - [x] 6.4 Report to the user, and ask before any commit, tag, or publish
    - Summarize what changed, the red and green results from 2.3 and 3.2, and the suite result
    - State the residual limits: a template's `Content-Type` header is still not used by a `Response` built from it (spin-off spec, Decision 5); applications outside the Atlantis starters that pass `xmlResponses` cannot be checked here (Decision 3); the 7 requirements reported as not strict EARS were left as written
    - Don't commit, tag, publish, or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1", "4.2"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["6.2", "6.3"] },
    { "id": 10, "tasks": ["6.4"] }
  ]
}
```

**Critical path:** 1 → 2 → 3 → 4 → 5 → 6.

**Ordering constraints:**
- Task 1 finishes before anything changes, so the baselines describe the current tree.
- Task 2.3 runs before task 3.1. A test that passes before the fix does not prove the fix, so the red run is a gate.
- Task 4.2 is a hard gate: the suite must be green before the documentation work, because the documentation tests scan the edited source.
- Task 6.1 stops if the version lookup fails. It is the last task that writes a file.

## Notes

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. `xmlResponses` merges into the XML slot | 1.3, 2.1, 2.2, 3.1, 3.2 |
| 2. Other slots independent of `xmlResponses` | 1.3, 2.1, 2.2, 3.2 |
| 3. Everything else unchanged | 1.2, 3.1, 3.2, 3.3 |
| 4. Tests | 2.1, 2.2, 2.3, 3.2, 4.2 |
| 5. Documentation | 5.1, 5.2, 5.3 |
| 6. CHANGELOG | 6.1 |
| 7. Validation | 1.1, 4.1, 4.2, 6.2, 6.3 |

### Security constraint to task map

| Constraint | Tasks |
|---|---|
| `SEC-REQ-1.1-SEM-532-1` (no template content in logs) | 2.2 |
| `SEC-REQ-1.1-SEM-1321-1` and `SEC-REQ-4.2-SEM-1321-1` (prototype integrity) | 2.2, 3.1 |
| `SEC-REQ-5.4-SEM-79-1`, `-79-2` (static template bodies) | 5.1, 5.2, 5.3 |
| `SEC-REQ-5.4-SEM-798-1` (no sensitive values in examples) | 5.1, 5.2, 5.3 |
| `SEC-REQ-7.5-SEM-1104-1` (no dependency change) | 6.2 |

### Decision to task map

| Decision | Tasks |
|---|---|
| 1 (PATCH, entry under Fixed) | 6.1 |
| 2 (docs example) | 5.1, 5.2 |
| 3 (no starters use XML) | 6.4 |
| 4 (no issue link) | 6.1 |
| 5 (Content-Type spin-off) | 5.1, 6.4 |

### Related documentation

- [requirements.md](requirements.md) - the 7 requirements these tasks satisfy
- [design.md](design.md) - the code change, test design, documentation text and verification table
- [PLAN.md](PLAN.md) - the assessment, probes and Decisions 1 to 5
- [ISSUE.md](ISSUE.md) - the original report
