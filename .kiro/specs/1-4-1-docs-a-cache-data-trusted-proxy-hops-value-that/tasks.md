# Implementation Plan

## Overview

Ordering follows [design.md](design.md). This spec changes one constant, edits comments, updates five existing test files, and writes documentation. It adds no test (Q3).

- **Task 1 records baselines** before anything changes.
- **Task 2 changes the default and the code comments**, then runs the five test files that depend on the old default. **They are expected to fail**; that proves they detect the change.
- **Task 3 updates those five test files** in place and re-runs them.
- **Task 4 is the first checkpoint:** the targeted directories, the type test, and the full suite, with the code and tests complete.
- **Tasks 5 to 7 are the documentation and release notes:** the tools README, the new CloudFront notes, the CHANGELOG, and the advisory draft. They can run in parallel after task 4.
- **Task 8 is the final check.**

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, or `npm test` from the terminal for the suite, each under `timeout` (the full suite: `timeout 900`). A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file. Nothing in this spec spawns a child process.

**Environment:** the client-ip tests depend on `CACHE_DATA_TRUSTED_PROXY_HOPS`. Check that your shell doesn't set it: `env | grep CACHE_DATA_TRUSTED_PROXY_HOPS` prints nothing.

**Runtimes:** `ls "$HOME/.nvm/versions/node"` lists the installed Node.js versions. To run a file on another version, call that version's binary: `"$HOME/.nvm/versions/node/<version>/bin/node" --experimental-vm-modules node_modules/jest/bin/jest.js <path>`.

**Linting:** the repository isn't lint-clean, so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec touches, with `npx eslint <files>`, and compare against the baselines in design.md "Lint". `.md` and `.ts` files aren't linted.

**Addresses:** tests and docs use only documentation range addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`). No real IP, account ID, profile name, endpoint, distribution domain, stack name, or CloudFront edge address range goes into any file.

**Constraints that come from existing tests:**
- `src/lib/tools/RequestInfo.class.js` must not contain the lowercase text `x-forwarded-for` (a test asserts it). JSDoc uses `X-Forwarded-For`.
- No file under `types/`, and not `src/index.js` or `src/lib/tools/index.js`, may contain `ClientIpResolver`.
- The `test/documentation/` tests scan the JSDoc in `src/lib/tools/`: keep `@returns` and `@example` in every block you edit.

**Changelog exception (Q5 = B):** task 6.1 edits three existing CHANGELOG entries in place. That is a recorded, one-time exception to `.kiro/steering/changelog-convention.md`. Edit nothing else in the file.

**Commits:** don't commit, tag, publish, or push without explicit instruction. Open no GitHub issue, comment, or advisory.

## Tasks

- [x] 1. Record the baselines (BEFORE any change)

  - [x] 1.1 Record the suite baseline
    - Run `timeout 900 npm test` on the unchanged tree. Record the pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 4
    - Note that `git status` shows only the untracked spec directories
    - _Requirements: 3.6_

  - [x] 1.2 Record the lint baseline
    - Run `npx eslint` on `src/lib/utils/ClientIpResolver.class.js`, `src/lib/tools/RequestInfo.class.js`, `src/lib/tools/ClientRequest.class.js`, and the five test files named in task 3
    - **EXPECTED OUTCOME:** 0, **1** (`no-constant-condition`), 0, and 0 errors for each test file, matching design.md "Lint". Record any difference
    - _Requirements: 3.7_

  - [x] 1.3 Record the resolver probe
    - Run the issue's table through the resolver: header `192.0.2.1, 198.51.100.10, 203.0.113.30`, `sourceIp` `203.0.113.30`, counts 1 to 4, via `node -e` with `require('./src/lib/utils/ClientIpResolver.class.js')`. Also run the same call with the variable unset and count omitted
    - **EXPECTED OUTCOME:** `203.0.113.30`, `198.51.100.10`, `192.0.2.1`, `203.0.113.30` for counts 1 to 4; with the count omitted, `198.51.100.10` (the old default of 2)
    - _Requirements: 1.5_

- [x] 2. Change the default and the code comments
  - Edit by searching for the text, not by line number; line numbers move as you edit. **Do not edit any test file in this task**

  - [x] 2.1 Change `ClientIpResolver`
    - **File:** `src/lib/utils/ClientIpResolver.class.js`, following design.md "ClientIpResolver"
    - `const DEFAULT_TRUSTED_PROXY_HOPS = 0;` with the new constant comment. Replace the class-comment paragraph that begins "The hop count N is the number of trusted proxies" and the paragraph "Fail-safe direction: ..." with the two paragraphs in the design. The class example passes a hop count of `2`
    - Replace "(2 when unset)" and "or 2 when the variable is unset, empty, or invalid" in the JSDoc of `resolve`, `resolveDetailed`, and `getTrustedProxyHops`; "gives the default of 2" becomes "gives the default of 0"; the `parseTrustedProxyHops("abc")` example returns `{ trustedProxyHops: 0, isValid: false }`
    - Change no code other than the constant. The warning text follows the constant
    - _Requirements: 2.1 to 2.7, 1.3, 5.1_

  - [x] 2.2 Update the `RequestInfo` and `ClientRequest` JSDoc
    - **Files:** `src/lib/tools/RequestInfo.class.js` (`getClientIp`, `getClientIP`, `_clientRequestInfo`) and `src/lib/tools/ClientRequest.class.js` (the "Client IP Resolution" paragraph of the class comment), with the text in design.md "RequestInfo and ClientRequest"
    - Do not write the lowercase text `x-forwarded-for` in `RequestInfo.class.js`. Keep every `@returns` and `@example`
    - Name `docs/features/tools/README.md` and `docs/cloudfront-notes/README.md` by path in text; add no link
    - _Requirements: 5.2, 5.4, 5.5, 1.3_

  - [x] 2.3 Update the type doc comments
    - **File:** `types/lib/tools/index.d.ts`: the doc comments of `getClientIp()` and `getClientIP()` carry the same text. No declaration changes; do not name `ClientIpResolver`
    - _Requirements: 5.3, 9.2_

  - [x] 2.4 Run the dependent tests on the new default
    - Run the five files named in task 3
    - **EXPECTED TO FAIL**, recorded in the completion notes: the default-value assertions in the unit and config tests (`toBe(2)`, `trustedProxyHops: 2`, "Using the default of 2."), "Property 2" in the property file, and the tests in `request-info-client-ip-tests` and `request-info-forwarded-for-bug-exploration-tests` that rely on the default of 2 (a chain that previously selected the entry 2 from the right now returns `identity.sourceIp`)
    - **EXPECTED TO PASS:** everything else in those files. A failure outside the list means the change reached something unexpected: stop and look before editing tests
    - Also run `test/request/client-request-request-log-tests.jest.mjs`. **EXPECTED OUTCOME:** PASS, which confirms it needs no edit (design.md "Test changes")
    - _Requirements: 3.1, 3.5_

- [x] 3. Update the existing tests in place
  - Change assertions, fixtures, names, and comments only. **Do not add a test file, `describe`, `it`, or property** (Q3, Requirement 3.5). Every file already saves and restores `process.env`; keep that

  - [x] 3.1 Update the configuration tests
    - **File:** `test/request/client-ip/unit/client-ip-resolver-config-tests.jest.mjs`, following the table in design.md "Test changes"
    - `EXPECTED_WARNING` and the literal warning string end "Using the default of 0."; valid cases for `undefined`, `""`, and `"  "` expect 0; invalid cases expect 0; every `getTrustedProxyHops()` expectation for unset, empty, and invalid values is 0; the debug-line case reads "reports the default hop count of 0" and expects `DEBUG_LINE("source-ip", 0, 0)`; update the titles to match
    - Keep every raw value reserved for warning tests exactly as listed in the header comment
    - _Requirements: 2.2, 2.4, 3.1, 3.2_

  - [x] 3.2 Update the unit tests
    - **File:** `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs`: "uses the default hop count of 2 when none is passed and the variable is unset" becomes the default-of-0 test in design.md (`DEFAULT_TRUSTED_PROXY_HOPS` is 0 and the three-entry header resolves to `SOURCE_IP`)
    - _Requirements: 2.1, 2.5, 3.2_

  - [x] 3.3 Rewrite "Property 2" in place
    - **File:** `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs`: rename the `describe` and `it`, rewrite the comment, and assert that with the variable unset the result is `identity.sourceIp` for any forged list and chain. Add one `ip` draw for the `sourceIp` argument to the existing property; no filter on the asserted predicate, no `fc.pre`, no `seed` option; keep `numRuns: 500`
    - Update the "Validates" line to cite Requirement 2.5 of this spec
    - _Requirements: 3.3_

  - [x] 3.4 Update the `RequestInfo` client IP tests
    - **File:** `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs`
    - Update the "Setup" comment; add `beforeEach(() => { process.env[HOPS_ENV_VAR] = "2"; })` at the top of `describe("fixed behavior")`; retitle "...(T1 chain, default hop count)" to "...(T1 chain, hop count 2)". Leave the `preservation` block and the tests that set their own count unchanged
    - _Requirements: 3.1, 3.2_

  - [x] 3.5 Update the bug-exploration test
    - **File:** `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs`
    - Rewrite the header comment (hop count of 2 is set in `beforeEach`; the default is 0, `identity.sourceIp`; remove the stale "default 1"); keep the `1-3-11-client-request-update-forwarded-for` feature tag and the "Updated by" line, and add a second "Updated by" line naming this spec. `beforeEach` sets `CACHE_DATA_TRUSTED_PROXY_HOPS` to `"2"` instead of deleting it; `afterEach` already restores the original value. The IP property's title and comment say "with a hop count of 2" instead of "by default". Leave the two user-agent tests unchanged
    - _Requirements: 3.2, 3.4_

  - [x] 3.6 Re-run the updated tests
    - Run the five files, then `test/request/` and `test/response/`
    - **EXPECTED OUTCOME:** all PASS
    - Run the five client-ip files on one other installed Node.js major (22 or 26). **EXPECTED OUTCOME:** all PASS; a difference means `isIP()` or fast-check behaves differently on that runtime: record it and bring it to the user
    - `git diff --stat -- test` shows exactly the five files; `git diff -- test | grep -E '^\+\s*(describe|it|test)\('` prints nothing except lines that only re-title an existing block
    - `npx eslint` on the five files reports 0 errors each
    - _Requirements: 3.1 to 3.7_

- [x] 4. Checkpoint: code and tests complete

  - [x] 4.1 Run the targeted checks
    - Run `test/documentation/`. **EXPECTED OUTCOME:** all PASS, including the JSDoc and parameter-name checks on the two edited files in `src/lib/tools/`
    - Run `npm run test:types`. **EXPECTED OUTCOME:** PASS
    - `npx eslint` on `ClientIpResolver.class.js` (0), `RequestInfo.class.js` (**1**, the same `no-constant-condition`), and `ClientRequest.class.js` (0)
    - _Requirements: 3.6, 3.7, 5.4_

  - [x] 4.2 Run the full suite
    - Run `timeout 900 npm test`
    - **EXPECTED OUTCOME:** everything passes except failures recorded as pre-existing in 1.1. If another existing test fails because of the new default, fix it the way task 3 does (set the count it needs, or assert the new default), and list it in the completion notes; do not weaken an assertion
    - A local failure of the migration property tests for uncommitted `src/` edits is an expected effect, not a code problem, and none of this spec's files is on their lists
    - `git status`: modified existing files are the three `src/lib/` files, `types/lib/tools/index.d.ts`, and the five test files
    - Check for stray processes: `ps aux | grep jest | grep -v grep` prints nothing
    - _Requirements: 3.6_

- [x] 5. Update the documentation
  - Apply the tools README edits from the bottom of the file upward, so the line numbers in design.md stay valid. Describe behavior, not resolver internals. Do not mention `TestHarness`. Every example uses documentation range addresses, and every external URL is one named in design.md

  - [x] 5.1 Rewrite the tools README, lower half
    - **File:** `docs/features/tools/README.md`, following design.md "`docs/features/tools/README.md`"
    - Marker paragraph (line 1182); "Origin lock" body (1157); "About `CloudFront-Viewer-Address`" (1147 to 1153); keep the headings and the warning box text
    - _Requirements: 4.6, 4.7, 4.8, 4.12_

  - [x] 5.2 Rewrite the tools README, middle
    - Scenario table and the three paragraphs after it (1130 to 1139, with the T2 example kept); the single note that replaces the T4 warning and "default fails safe" sentence (1126 to 1128); the value table (1118 to 1124). Add "when a hop count of 1 or more is set" to the corporate-proxy sentence
    - The Evidence column links to `../../cloudfront-notes/README.md#observations`. No row says "not measured"
    - _Requirements: 4.1 to 4.5, 4.9 to 4.11_

  - [x] 5.3 Rewrite the tools README, upper part
    - Replace the paragraph at line 1110 with the rule, the example, and the table of four counts; add the sentence before the resolution-order table (1098); rewrite the introduction (1096); replace the policy sentence in the note at line 1092
    - The four rows of the example must match the probe from 1.3 (counts 1 to 4)
    - _Requirements: 1.1, 1.2, 1.4, 4.7, 4.12, 4.13_

  - [x] 5.4 Write the CloudFront notes
    - **File:** `docs/cloudfront-notes/README.md` (new), following design.md "`docs/cloudfront-notes/README.md` (new)": purpose, topologies table, observations O1 to O8, method (both dates, the response template in a `text` block, the four header variants, the limits), how to add an observation, related documentation
    - Use the exact status wording "Documented by AWS" or "Not documented by AWS" for each observation. No account, endpoint, distribution, stack, or profile identifier; no edge address range
    - _Requirements: 6.1 to 6.9_

  - [x] 5.5 Add the documentation index entry
    - **File:** `docs/README.md`: the "Observed AWS Behavior" section from design.md, between "Features and API" and "Optimization and Best Practices"
    - _Requirements: 6.1_

  - [x] 5.6 Run the documentation validation tests
    - Run `test/documentation/`
    - **EXPECTED OUTCOME:** all PASS, including the link-validity tests over the new file and the edited index
    - _Requirements: 6.9, 10.4_

- [x] 6. Record the release notes

  - [x] 6.1 Update `CHANGELOG.md`
    - **Precondition:** `package.json` reads `1.4.1` and `CHANGELOG.md` has a `## v1.4.1 (unreleased)` heading. If either is missing, **STOP and ask the developer**. Don't create the heading or bump the version
    - Make exactly the edits in design.md "CHANGELOG": replace the sub-bullet that begins "The default counts two proxies"; remove the bullet "Regional APIs without CloudFront stay forgeable until you set ..."; replace the `CACHE_DATA_TRUSTED_PROXY_HOPS` entry; add the "CloudFront and API Gateway observations" entry under `### Added`. This edits three existing entries in place by the Q5 exception
    - `git diff -- CHANGELOG.md` shows changes only in those four places. Leave the "Own CloudFront in front of an edge-optimized API ..." entry and every other line untouched
    - _Requirements: 7.1 to 7.5_

  - [x] 6.2 Update the security advisory draft
    - **File:** `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`, following the table in design.md "Security advisory draft", including the new "Who must act" table
    - Keep the "Description", "Impact", "Severity", and "Weaknesses" sections. Remove the statements named in Requirement 8.2. No real address, account ID, or endpoint identifier. Don't publish or open an advisory
    - Do not edit the sibling spec's `PLAN.md`, `requirements.md`, `design.md`, or `tasks.md`
    - _Requirements: 8.1 to 8.5_

- [x] 7. Check the documentation set

  - [x] 7.1 Search for removed claims
    - Search `src`, `docs`, `types`, `CHANGELOG.md`, and the advisory draft for: `unless the count is lower`, `falls through to` (read each hit), `defaults to 2`, `(default 2)`, `default of` followed by `2`, `needs 1`, `does not forward`, `doesn't include CloudFront headers`
    - **EXPECTED OUTCOME:** no hit, except `2` as a valid value or as the count that matches T1 and T3, and the sentence in the notes that says the earlier statement was wrong
    - _Requirements: 1.3, 10.1_

  - [x] 7.2 Read every mention of the variable
    - Search the documentation set for `PROXY_HOPS`. Read each hit and confirm it agrees with Requirements 1, 2, 4, and 5
    - Search `src/lib/tools/RequestInfo.class.js` for lowercase `x-forwarded-for` (no hit) and `types/` for `ClientIpResolver` (no hit)
    - _Requirements: 10.2, 5.3_

  - [x] 7.3 Search for identifiers
    - Search the new and edited docs, the advisory draft, and the edited tests for: the AWS account ID, the profile name `release`, `execute-api` hostnames, `cloudfront.net` domains, the stack name `kiro-probe`, and the edge address ranges recorded in the sibling plan (`15.158.`, `18.68.`)
    - Search every changed and new file for IPv4 addresses outside the documentation ranges
    - **EXPECTED OUTCOME:** no hit, except `127.0.0.1`, the existing `test/helpers/test-event.js` value, and `<id>.execute-api.` placeholders
    - _Requirements: 4.10, 6.7, 8.4_

  - [x] 7.4 Trace the measured claims
    - For each measured statement in the tools README and the notes, confirm it appears in PLAN.md Section 3.1 or in a 2026-11-04 observation of the sibling spec, and that its date and topology match
    - Re-run the probe from 1.3. **EXPECTED OUTCOME:** counts 1 to 4 give the same four values as before; the call with no count and no variable gives `identity.sourceIp`
    - _Requirements: 4.11, 6.8, 10.3_

- [x] 8. Final checkpoint

  - [x] 8.1 Run the full verification
    - Run `timeout 900 npm test` and `npm run test:types` on the default Node.js version
    - Run `npx eslint` on the eight source and test files: `RequestInfo.class.js` **1**, every other file 0
    - Confirm the export names of `src/index.js` and `src/lib/tools/index.js` are unchanged and `package.json` still reads `1.4.1`
    - _Requirements: 3.6, 3.7, 9.1, 9.2, 9.4_

  - [x] 8.2 Check the package contents
    - `npm pack --dry-run` includes `src/lib/utils/ClientIpResolver.class.js` and lists no `.kiro/`, `test/`, `docs/`, or `scripts/` path (so the new notes are read on GitHub, not in the package)
    - _Requirements: 5.5_

  - [x] 8.3 Check hygiene
    - No stray jest processes: `ps aux | grep jest | grep -v grep`. No temp files, and no `tmp-probe-*` directory, left in the working tree
    - `git status` shows only: the three `src/lib/` files, `types/lib/tools/index.d.ts`, the five test files, `CHANGELOG.md`, `docs/README.md`, `docs/features/tools/README.md`, `docs/cloudfront-notes/README.md`, the sibling advisory draft, and this spec's directory. Report anything else to the user rather than reverting it
    - _Requirements: 3.5, 9.5_

  - [x] 8.4 Report to the user, and ask before any commit, tag, or publish
    - Summarize what changed. Remind the user of the two follow-ups outside this repository (PLAN.md N1 and N3): confirm the `v1.4.1` tag points at the final commit before creating the release, and tell the owners of `cache-data` #254 and Atlantis starter-02 #14 and templates #9 and #10 that the Regional premise is verified and that the managed policy forwards `CloudFront-Viewer-Address`. Take neither action
    - Don't commit, tag, publish, or push without explicit instruction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2"] },
    { "id": 7, "tasks": ["5.4", "6.1", "6.2"] },
    { "id": 8, "tasks": ["5.1", "5.5"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["5.3"] },
    { "id": 11, "tasks": ["5.6", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 12, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 13, "tasks": ["8.4"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baselines (suite, lint, probe)
        v
2  default + comments ──> 2.4 dependent tests FAIL as listed
        v
3  update five tests in place ──> 3.6 PASS
        v
4  CHECKPOINT: documentation tests, types, full suite
        v
5.4 notes ─┬─ 6.1 CHANGELOG ─┬─ 6.2 advisory        (parallel)
           v                  v
5.1 -> 5.2 -> 5.3 tools README (bottom to top), 5.5 index
        v
5.6 doc tests ─ 7 searches and traces
        v
8  final checkpoint ──> 8.4 report, ask before commit
```

**Critical path:** 1 → 2 → 3 → 4 → 5.1 → 5.2 → 5.3 → 5.6 → 8.

**Ordering constraints:**

- Task 1 must finish before anything changes, so the baselines describe the current tree.
- Task 2.4 must run before task 3, so the effect of the new default on the tests is observed before the tests are edited.
- Task 4.2 is a hard gate: the full suite must be green before the documentation work, because the documentation tests and the JSDoc scan run against the edited source.
- Tasks 5.1, 5.2, and 5.3 edit one file from the bottom up and run in that order. Task 5.4 comes first because the README links to it.
- Task 6.1 stops if the `v1.4.1 (unreleased)` heading or the `package.json` version is missing.
- Task 7 runs after all documentation is written; the final checkpoint after that.

## Notes

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Corrected safety statement | 1.3, 2.1, 5.3, 7.1 |
| 2. Default hop count of 0 | 2.1, 2.4, 3.1, 3.2, 3.3 |
| 3. Existing tests updated, none added | 1.1, 1.2, 2.4, 3, 4, 8.1, 8.3 |
| 4. Scenario guidance in the tools README | 5.1, 5.2, 5.3, 7.3, 7.4 |
| 5. JSDoc and type comments | 2.1, 2.2, 2.3, 4.1, 7.2 |
| 6. CloudFront notes | 5.4, 5.5, 5.6, 7.3, 7.4 |
| 7. Changelog | 6.1 |
| 8. Draft security advisory | 6.2, 7.3 |
| 9. Backwards compatibility and release | 2.3, 8.1, 8.3 |
| 10. Accuracy and consistency | 5.6, 7.1, 7.2, 7.4 |

### Decision to task map

| Decision | Tasks |
|---|---|
| Q1 (re-measurement, done 2026-11-09) | 5.2, 5.4, 7.4 |
| Q2 (default 0) | 2.1, 3, 5.2, 6.1, 6.2 |
| Q3 (no tests) | 3 (no additions), 3.6 |
| Q4 (citation) | 5.2, 5.4 |
| Q5 (edit the CHANGELOG in place) | 6.1 |
| U1 (CloudFront notes) | 5.4, 5.5, 6.1 |

### Related documentation

- [requirements.md](requirements.md) - the 10 requirements these tasks satisfy
- [design.md](design.md) - components, the documentation text, the test edits, and the verification table
- [PLAN.md](PLAN.md) - the Decision Log (Q1 to Q5, D1 to D14, U1) and the re-measurement in Section 3.1
