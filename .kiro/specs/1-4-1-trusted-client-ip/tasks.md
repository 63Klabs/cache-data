# Implementation Plan

## Overview

Ordering follows [design.md](design.md).

- **Tasks 1 and 2 run before any source change:**
  - task 1 records the suite and lint baselines
  - task 2 writes behavior tests through the public API. Preservation tests pass on the current code; defect tests fail on it, which proves they detect each defect
- **Task 3 builds `ClientIpResolver` and its tests.** It's a new file, so it can run alongside task 2.
- **Tasks 4 to 6 integrate and verify.** Task 4 wires the resolver into `RequestInfo` and rewrites the 1.3.11 bug-exploration test and updates two expected strings in `response-tests.jest.mjs`, task 5 changes `Response` and `ClientRequest`, and task 6 re-runs everything from tasks 2 and 3 unmodified.
- **Task 7 is the full-suite gate.**
- **Tasks 8 to 10 close out the release work:** types, documentation, then the CHANGELOG and the advisory draft.
- **Task 11 is the final check.**

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, or `npm test` from the terminal for the suite. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file. Nothing in this spec spawns a child process.

**Environment:** tests that depend on the default hop count delete `CACHE_DATA_TRUSTED_PROXY_HOPS` first. Check that your shell doesn't set it: `env | grep CACHE_DATA_TRUSTED_PROXY_HOPS` should print nothing.

**Runtimes:** nvm has Node.js 22.23.2, 24.15.0 (the default), and 26.10.0. To run a file on another version, call that version's binary: `"$HOME/.nvm/versions/node/v26.10.0/bin/node" --experimental-vm-modules node_modules/jest/bin/jest.js <path>`.

**Linting:** the repository isn't lint-clean, so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baselines in design.md "Lint".

**Addresses:** tests and docs use only documentation range addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`). No real IP, account ID, or endpoint identifier goes into any file.

**Commits:** don't commit, tag, publish, or push without explicit instruction.

## Tasks

- [ ] 1. Record the baselines (BEFORE any source change)

  - [x] 1.1 Record the suite baseline
    - Run `npm test` on the unchanged code. Record the pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 7
    - _Requirements: 10.1_

  - [x] 1.2 Record the lint baseline
    - Run `npx eslint` on `src/lib/tools/RequestInfo.class.js`, `src/lib/tools/Response.class.js`, `src/lib/tools/ClientRequest.class.js`, and `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`
    - **EXPECTED OUTCOME:** 1 (`no-constant-condition`), 0, 0, and 0 errors, matching design.md. Record any difference
    - _Requirements: 10.10_

- [x] 2. Write behavior tests through the public API (BEFORE any source change)
  - Import Jest globals from `@jest/globals` and CommonJS modules with `(await import(path)).default`. Save `process.env` in `beforeEach` and restore it in `afterEach`, and call `jest.restoreAllMocks()` in `afterEach`
  - **DO NOT change any file under `src/` in this task**

  - [x] 2.1 Write the `RequestInfo` client IP tests
    - **File:** `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs` (new)
    - Every item in design.md's list for this file except the `ClientIpResolver` export check, which is added in 3.4. Delete `CACHE_DATA_TRUSTED_PROXY_HOPS` in `beforeEach`
    - Put the user agent, origin, referrer, `ifModifiedSince`, `ifNoneMatch`, `accept`, and no-forwarded-for `sourceIp` cases in a `describe("preservation")` block, and the forged-entry, mixed-case `CloudFront-Viewer-Address`, and source-check cases in `describe("fixed behavior")`
    - _Requirements: 1.5, 2.1, 4.5, 5.1, 11.5_

  - [x] 2.2 Write the `RESPONSE` log example tests
    - **File:** `test/response/response-log-field-sanitization-tests.jest.mjs` (new)
    - Every item in design.md's list for this file. Spy on `DebugAndLog.log` from `src/lib/tools/DebugAndLog.class.js`, and on the `ClientRequest` getters to supply field values. Call `Response.init()` with the options `test/response/response-tests.jest.mjs` uses
    - Put the unchanged-field and clean-value cases in `describe("preservation")`, and the `|`, control-character, `null`-IP, and `|||` cases in `describe("fixed behavior")`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 11.4_

  - [x] 2.3 Write the `queryKeys` tests
    - **File:** `test/request/client-request-request-log-tests.jest.mjs` (new)
    - Initialize `ClientRequest` with `{ parameters: { excludeParamsWithNoValidationMatch: false } }`, then every item in design.md's list for this file
    - Put the no-parameters and other-fields cases in `describe("preservation")`, and the keys-only case in `describe("fixed behavior")`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.4 Write the log line property tests
    - **File:** `test/response/response-log-field-sanitization-property-tests.jest.mjs` (new)
    - Properties 7 and 8, exactly as in design.md "Correctness properties". `numRuns`: 500 for Property 7, 200 for Property 8. **Do NOT pass a `seed` option**. Generators aren't filtered on the asserted predicate
    - _Requirements: 8.1, 8.3, 8.6, 10.4, 10.7, 10.8_

  - [x] 2.5 Run the behavior tests on the current code
    - Run the four files from 2.1 to 2.4
    - **EXPECTED TO PASS:** every `preservation` block. A failure means the test misreads today's contract: fix the test, not `src/`
    - **EXPECTED TO FAIL**, recorded in the completion notes:
      - a forged leftmost `X-Forwarded-For` entry is returned by `getClientIp()` and `getProps().client.ip`
      - `CloudFront-Viewer-Address` is ignored
      - `RequestInfo.class.js` still contains `x-forwarded-for`
      - the user agent `Mozilla/5.0 | evil` is logged with its `|`
      - CR, LF, NUL, and DEL reach the log line
      - a `null` client IP logs an empty field instead of `-`
      - `queryKeys` contains `id=42&q=...`
      - Properties 7 and 8 fail, with a shrunk counterexample containing `|` or a control character
    - _Requirements: 10.1_

- [x] 3. Implement `ClientIpResolver` and its tests
  - It's a new file, so this task can run alongside task 2. Nothing here edits an existing file

  - [x] 3.1 Write the class
    - **File:** `src/lib/utils/ClientIpResolver.class.js` (new)
    - Implement design.md "ClientIpResolver" exactly:
      - module constants and state: `ENV_VAR`, `DEFAULT_TRUSTED_PROXY_HOPS`, `memoRaw`, `memoHops`, `warnedRawValues`
      - static constants `ENV_VAR` and `DEFAULT_TRUSTED_PROXY_HOPS`
      - `resolve()`, `resolveDetailed()`, `getTrustedProxyHops()`, `parseTrustedProxyHops()`, `parseViewerAddress()` (port-first, D13), and `selectForwardedFor()`
      - the debug line, built only when `DebugAndLog.getLogLevel() >= DebugAndLog.DEBUG_LEVEL_NUM`
      - the `try`/`catch` in `resolve()` that logs and returns `null`
    - Require only `node:net` and `../tools/DebugAndLog.class.js`. Call `DebugAndLog` methods through the class, not destructured, so Jest spies see them
    - JSDoc per Requirements 1.3 and 12.1: the class carries `@private`; every method has a description, `@param` names matching the signature, `@returns`, and an `@example`. Add `// >!` comments on the right-to-left selection, the step 1 gate, and the `JSON.stringify` in the warning
    - End with `module.exports = ClientIpResolver;`
    - Confirm `node -e "require('./src/lib/utils/ClientIpResolver.class.js')"` loads cleanly and `npx eslint` reports 0 errors
    - _Requirements: 1.1, 1.3, 1.4, 2, 3, 4.1 to 4.4, 5, 6, 7, 12.1_

  - [x] 3.2 Write the resolver unit tests
    - **File:** `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs` (new)
    - Every item in design.md's list for this file, including the T4 exposure at N = 2 and the static-property-name check
    - _Requirements: 2.1 to 2.6, 3.1 to 3.5, 4.1 to 4.4, 5.1, 10.3_

  - [x] 3.3 Write the configuration and logging tests
    - **File:** `test/request/client-ip/unit/client-ip-resolver-config-tests.jest.mjs` (new)
    - Every item in design.md's list for this file. Each warning case uses a raw value no other case in the file uses. Spy on `DebugAndLog.getLogLevel`, `DebugAndLog.warn`, and `DebugAndLog.debug`
    - _Requirements: 6.1 to 6.7, 7.1 to 7.3, 10.3, 10.5, 10.6_

  - [x] 3.4 Add the export check
    - Add to `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs`, in `describe("fixed behavior")`: `src/index.js`, `src/lib/tools/index.js`, and every file under `types/` don't mention `ClientIpResolver`
    - _Requirements: 1.2, 11.1_

  - [x] 3.5 Write the resolver property tests
    - **File:** `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs` (new)
    - Properties 1 to 6, exactly as in design.md "Correctness properties", with the shared arbitraries. Property 2 deletes `CACHE_DATA_TRUSTED_PROXY_HOPS` and restores it in `afterEach`
    - `numRuns`: 500 for Properties 1 and 2, 200 for the others. **Do NOT pass a `seed` option**. Use no `fc.pre`; every generator is valid by construction
    - _Requirements: 3.1 to 3.3, 4.5, 10.4, 10.7, 10.8_

  - [x] 3.6 Run the resolver tests
    - Run the files from 3.2, 3.3, and 3.5
    - **EXPECTED OUTCOME:** all PASS
    - Run the same three files on Node.js 22.23.2 and 26.10.0. **EXPECTED OUTCOME:** all PASS. A difference means `isIP()` or fast-check behaves differently on that runtime: record it and bring it to the user
    - `npx eslint` on the class and the three test files reports 0 errors
    - _Requirements: 10.3, 10.4, 10.10_

- [x] 4. Integrate the resolver into `RequestInfo`

  - [x] 4.1 Replace the IP selection
    - **File:** `src/lib/tools/RequestInfo.class.js`, following design.md "`RequestInfo._clientRequestInfo()`"
    - Add `const ClientIpResolver = require("../utils/ClientIpResolver.class.js");`. Replace lines 312–324 with the single `ClientIpResolver.resolve(headers, identity)` call and its `// >!` comment. Leave the user-agent block and the `if ( false )` block untouched
    - Update the JSDoc of `_clientRequestInfo()`, `getClientIp()`, and `getClientIP()` per design.md "JSDoc", with `@returns {string|null}`
    - _Requirements: 1.5, 11.5, 12.2_

  - [x] 4.2 Rewrite the 1.3.11 bug-exploration test
    - **File:** `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`, following the table in design.md "Changes to existing tests"
    - Keep the `1-3-11-client-request-update-forwarded-for` feature tag and add the line naming this spec. Add the `beforeEach`/`afterEach` that deletes and restores `CACHE_DATA_TRUSTED_PROXY_HOPS`. Leave the two user-agent tests unchanged
    - Also in `test/response/response-tests.jest.mjs`, change the expected `queryKeys` in the two "Test finalize and log" assertions from `format=detailed&include=contact,department&version=2` to `format&include&version` (Req 9). Change nothing else in that file
    - These are the only edits to existing test files
    - _Requirements: 10.2_

  - [x] 4.3 Run the `RequestInfo` tests
    - Run `test/request/`
    - **EXPECTED OUTCOME:** all PASS, including both `describe` blocks of 2.1, the rewritten file, and `request-info-forwarded-for-preservation-tests.jest.mjs` unmodified
    - _Requirements: 1.5, 2.1, 10.2, 11.5_

- [x] 5. Change `Response` and `ClientRequest`

  - [x] 5.1 Add the log field sanitizer
    - **File:** `src/lib/tools/Response.class.js`, following design.md "`Response._log()`"
    - Add `sanitizeLogField()` as a module-level function above the class, not exported, filtering by character code (not a regex, which `no-control-regex` rejects), with its `// >!` comment
    - In `_log()`, pass the nine request-derived fields through it, replacing the per-field `"-"` ternaries and the `/|/g` replace. Leave `statusCode`, `bytes`, `contentType`, and `execms`, and the field order, as they are
    - _Requirements: 8.1 to 8.6, 11.4_

  - [x] 5.2 Log query keys only
    - **File:** `src/lib/tools/ClientRequest.class.js`, following design.md "`ClientRequest.getRequestLog()`"
    - `queryKeys` becomes `Object.keys(...).sort().join('&')`, with its `// >!` comment. Update the `getRequestLog()` `@returns` description, and add the client IP sentence to the class JSDoc
    - _Requirements: 9.1 to 9.3, 12.2, 12.3_

  - [x] 5.3 Lint the changed source files
    - `npx eslint src/lib/tools/RequestInfo.class.js src/lib/tools/Response.class.js src/lib/tools/ClientRequest.class.js`
    - **EXPECTED OUTCOME:** 1, 0, and 0 errors; the one in `RequestInfo.class.js` is the same `no-constant-condition`
    - _Requirements: 10.10_

- [x] 6. Verify the integration

  - [x] 6.1 Re-run the behavior tests
    - **IMPORTANT:** re-run the SAME files from task 2. Do NOT modify them
    - **EXPECTED OUTCOME:** all PASS, both `preservation` and `fixed behavior`. A `preservation` test that needs editing means the public contract broke: stop and reassess
    - _Requirements: 8, 9, 11.4, 11.5_

  - [x] 6.2 Re-run the resolver tests
    - Every file from task 3
    - **EXPECTED OUTCOME:** all PASS
    - _Requirements: 10.3, 10.4_

  - [x] 6.3 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the JSDoc and parameter-name checks on the three edited files in `src/lib/tools/`
    - _Requirements: 12.8_

- [x] 7. Checkpoint: full suite
  - Run `npm test`
  - **EXPECTED OUTCOME:** everything passes except failures recorded as pre-existing in 1.1
  - `git status`: the only modified existing files are the three `src/lib/tools/` files, the bug-exploration test, and `test/response/response-tests.jest.mjs` (two expected `queryKeys` strings)
  - If another existing test fails, treat it as a design problem: stop and bring it to the user. Don't edit existing tests
  - Check for stray processes: `ps aux | grep jest | grep -v grep` prints nothing
  - _Requirements: 10.1, 10.2_

- [x] 8. Update the type doc comments
  - **File:** `types/lib/tools/index.d.ts`: the doc comments for `getClientIp()` and `getClientIP()` describe the resolution order, `CACHE_DATA_TRUSTED_PROXY_HOPS`, and the `null` return, matching the JSDoc. No declaration changes
  - Run `npm run test:types`
  - **EXPECTED OUTCOME:** PASS
  - _Requirements: 11.3, 12.4_

- [x] 9. Update the documentation

  - [x] 9.1 Write the "Client IP resolution" subsection
    - **File:** `docs/features/tools/README.md`, following design.md "`docs/features/tools/README.md`", items 1 to 7
    - The scenario table labels T1, T2, and T4 as measured on 2026-11-04 and T3 as from AWS documentation. The T4 warning appears both in the table and next to the default
    - The CLI examples use `<id>` placeholders, and every address is in a documentation range
    - Update the note at line 1092 and the `ip` comment at line 1128
    - Describe behavior, not resolver internals. Don't mention `TestHarness`
    - _Requirements: 12.5, 12.6, 12.7_

  - [x] 9.2 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the example and link tests
    - _Requirements: 12.8_

- [x] 10. Record the release notes

  - [x] 10.1 Update `CHANGELOG.md`
    - **Precondition:** `package.json` reads `1.4.1` and `CHANGELOG.md` has a `## v1.4.1 (unreleased)` heading. If either is missing, **STOP and ask the developer**. Don't create the heading or bump the version
    - Add the entries from design.md "CHANGELOG" under `### Security`, `### Added`, and `### Fixed` in that section, each linking the spec. Modify no existing text. Add no entry for test-only changes
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 10.2 Write the security advisory draft
    - **File:** `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` (new), following design.md "Security advisory draft"
    - Affected `>= 1.3.11, <= 1.4.0`, patched `1.4.1`. No real addresses, account IDs, or endpoint identifiers
    - Publishing it is the developer's step. Don't open an advisory or any GitHub item
    - _Requirements: 13.4, 13.5_

- [x] 11. Final checkpoint

  - [x] 11.1 Run the full verification
    - Run `npm test` and `npm run test:types` on Node.js 24.15.0
    - Run `npx eslint` on each file:
      - `RequestInfo.class.js`: 1
      - `Response.class.js`, `ClientRequest.class.js`, and the bug-exploration test: 0
      - `ClientIpResolver.class.js` and the seven new test files: 0
    - Confirm the export names of `src/index.js` and `src/lib/tools/index.js` are unchanged
    - _Requirements: 10.1, 10.10, 11.1, 11.2_

  - [x] 11.2 Check the package contents
    - `npm pack --dry-run` includes `src/lib/utils/ClientIpResolver.class.js` and lists no `.kiro/`, `test/`, `docs/`, or `scripts/` paths
    - _Requirements: 1.1_

  - [x] 11.3 Check hygiene
    - No stray node processes: `ps aux | grep jest | grep -v grep`. No temp files left behind
    - `git status` shows only the files in design.md's file table. Report anything else to the user rather than reverting it
    - `grep -rnE` over the changed and new files finds no IPv4 address outside the documentation ranges, `127.0.0.1`, and the existing `test/helpers/test-event.js` value
    - Every new test file is under `test/request/client-ip/unit/`, `test/request/client-ip/property/`, `test/response/`, or `test/request/`, and is named `*-tests.jest.mjs` or `*-property-tests.jest.mjs`
    - _Requirements: 10.9, 13.5_

  - [x] 11.4 Ask the user before any commit, tag, or publish
    - Don't commit, tag, publish, or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "3.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "3.2", "3.3", "3.5"] },
    { "id": 2, "tasks": ["2.5", "3.4", "3.6"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1", "6.2", "6.3"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8", "9.1", "10.1", "10.2"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 10, "tasks": ["11.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baselines ─┬─> 2  behavior tests (preservation PASS, fixed behavior FAIL now) ─┐
              │                                                                    │
3.1 resolver ─┴─> 3  resolver unit, config, property tests (PASS) ────────────────┤
                                                                                   v
                     4  RequestInfo integration + bug-exploration rewrite
                     5  Response sanitizer + queryKeys
                                                                                   v
                     6  re-run 2 and 3 unmodified; documentation tests
                                                                                   v
                     7  CHECKPOINT: npm test
                                                                                   v
                     8 types ─ 9 docs ─ 10 CHANGELOG + advisory   (parallel)
                                                                                   v
                     11 final checkpoint
```

**Critical path:** 1 → 2 → 4 → 6 → 7 → 11.

**Ordering constraints:**

- Task 1 must finish before anything under `src/` changes, so the baselines describe the current code.
- Task 2.5 must run before tasks 4 and 5, so the defects are observed on the current code.
- Task 3 depends only on 3.1 and can run alongside task 2. Task 3.4 adds a block to the file from 2.1, so it follows 2.1.
- Task 4.1 must come before 4.3. Tasks 4.2 and 4.1 can run in either order, but 4.3 needs both.
- Task 7 is a hard gate: the full suite must be green, with the bug-exploration rewrite and the two `queryKeys` string updates in `response-tests.jest.mjs` as the only edits to existing tests, before the release work in tasks 8 to 10.
- Task 10.1 stops if the `v1.4.1 (unreleased)` heading or the `package.json` version is missing.

## Notes

### Property to task map

| Property | Written in | Verified in |
|---|---|---|
| P1 — Right-to-left selection | 3.5 | 3.6, 6.2 |
| P2 — Fail-safe at the default | 3.5 | 3.6, 6.2 |
| P3 — Short chains fall through | 3.5 | 3.6, 6.2 |
| P4 — Viewer address with a port | 3.5 | 3.6, 6.2 |
| P5 — Step 1 gating | 3.5 | 3.6, 6.2 |
| P6 — Total and well-typed | 3.5 | 3.6, 6.2 |
| P7 — Thirteen fields | 2.4 | Fails in 2.5; passes in 6.1 |
| P8 — The sanitizer removes exactly the listed characters | 2.4 | Fails in 2.5; passes in 6.1 |

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Internal ClientIpResolver class | 3.1, 3.4, 4.1, 11.2 |
| 2. Resolution order | 2.1, 3.1, 3.2, 3.5, 4.3 |
| 3. CloudFront-Viewer-Address | 3.1, 3.2, 3.5 |
| 4. X-Forwarded-For from the right | 2.1, 3.1, 3.2, 3.5 |
| 5. identity.sourceIp | 2.1, 3.1, 3.2 |
| 6. Hop count configuration | 3.1, 3.3 |
| 7. Debug resolution line | 3.1, 3.3 |
| 8. RESPONSE log line fields | 2.2, 2.4, 5.1, 6.1 |
| 9. queryKeys without values | 2.3, 5.2, 6.1 |
| 10. Verification and tests | 1, 2, 3, 4.2, 4.3, 5.3, 6, 7, 11 |
| 11. Backwards compatibility | 2.1, 2.2, 3.4, 4.1, 5.1, 8, 11.1 |
| 12. Documentation | 3.1, 4.1, 5.2, 6.3, 8, 9 |
| 13. Changelog and advisory | 10, 11.3 |

### Related documentation

- [requirements.md](requirements.md) - the 13 requirements these tasks satisfy
- [design.md](design.md) - components, the test design, and the eight correctness properties
- [PLAN.md](PLAN.md) - the Decision Log (Q1 to Q16, D1 to D13, U1 to U5, Round 4)
