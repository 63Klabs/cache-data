# Implementation Plan

## Overview

Ordering follows [design.md](design.md).

- **Task 1 records the baselines** before any source change.
- **Task 2 is the runtime check (V1)** on one temporary secret. It needs your approval for a write and a valid SSO session, so it runs early and alongside the code that does not depend on it. Task 4 (the readers) waits for its results.
- **Tasks 3, 4, and 5 build the secret side:** the one-method hook in `CachedParameterSecret` (with a preservation test written first), the three reader classes, and `IngressVerifier`. Each comes with its tests.
- **Task 6 adds `client.sourceIp`** to `RequestInfo`. It does not depend on tasks 3 to 5.
- **Task 7 wires the verifier into `ClientRequest`.**
- **Task 8 is the full-suite gate.**
- **Tasks 9 to 11 close out the release work:** types, documentation, then the CHANGELOG and the advisory sentence.
- **Task 12 is the final check.**

**Test execution:** use `node --experimental-vm-modules node_modules/jest/bin/jest.js <path>` for one file or directory, or `npm test` from the terminal for the suite. A bare `npx jest` fails on ESM. Never invoke `npm test` from inside a test file. Nothing in this spec spawns a child process.

**Environment:** tests that depend on the variables set them explicitly and delete them afterwards. Check that your shell sets neither: `env | grep CACHE_DATA_INGRESS` should print nothing.

**Runtimes:** nvm has Node.js 22.23.2, 24.15.0 (the default), and 26.10.0. To run a file on another version, call that version's binary: `"$HOME/.nvm/versions/node/v26.10.0/bin/node" --experimental-vm-modules node_modules/jest/bin/jest.js <path>`.

**Linting:** the repository isn't lint-clean, so `npm run lint:ci` fails for reasons outside this spec. Lint only the files this spec creates or touches, with `npx eslint <files>`, and compare against the baselines recorded in task 1.2. New files must have no errors.

**Test isolation:** `CachedParameterSecrets` has no reset and keeps every reader, so each test uses a secret id unique to it. Every test file that uses the verifier calls `IngressVerifier.reset()` and `ExtensionAvailability.reset()` in `beforeEach`, mocks `AWS.secrets` with `jest.spyOn(tools.default.AWS, "secrets", "get")`, forces the SDK path with `ExtensionAvailability.markUnavailable(ExtensionAvailability.REASON.OVERRIDE)` unless the test is about the extension, and mocks time with `jest.spyOn(Date, "now")`. Extension tests use `test/helpers/extension-mock.mjs`, as `test/config/sdk-fallback-tests.jest.mjs` does.

**Secrets and addresses:** tests and docs use made-up secret values and only documentation range addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`). No real IP, account ID, endpoint identifier, distribution domain, or secret value goes into any file. Record V1 results without identifiers.

**Names:** the package's own names use "ingress", never "origin" (PLAN.md U1). The only "origin" in new code is the platform's header `x-atlantis-origin-secret`.

**Commits:** don't commit, tag, publish, or push without explicit instruction.

## Tasks

- [x] 1. Record the baselines (BEFORE any source change)

  - [x] 1.1 Record the suite baseline
    - Run `npm test` on the unchanged code. Record the pass and fail counts, and every failing test, in this task's completion notes. A failure here is pre-existing; leave it for the checkpoint in task 8
    - _Requirements: 15.10_

  - [x] 1.2 Record the lint baseline
    - Run `npx eslint` on `src/lib/tools/CachedParametersSecrets.classes.js`, `src/lib/tools/RequestInfo.class.js`, and `src/lib/tools/ClientRequest.class.js`. Record the error count of each in the completion notes
    - _Requirements: 15.11_

  - [x] 1.3 Check the environment
    - `env | grep CACHE_DATA_INGRESS` prints nothing. `node --version` is recorded. `git status` shows only this spec directory and the `1-4-2-sanitize-...` directory as changes (plus the deleted `1-4-2-clientrequest-...` file from the earlier rename)
    - _Requirements: 15.1_

- [x] 2. Runtime check of the missing previous version (V1)
  - No file under `src/` changes in this task. Follow design.md "V1 check procedure". Profile `release`, region `us-east-2`. The temporary secret name starts with `kiro-probe-ingress-`. Record only results, never identifiers

  - [x] 2.1 Confirm the session
    - Run `aws sts get-caller-identity --profile release --region us-east-2` (read only). **If the token has expired, stop and ask the user to run `aws sso login --profile release`. Do not retry**
    - _Requirements: 14.3_

  - [x] 2.2 Missing and present previous version
    - `create-secret` (value `first`); `get-secret-value --version-stage AWSPREVIOUS` (expect a not-found error; record the error name and message exactly); `put-secret-value` (value `second`); `get-secret-value --version-stage AWSPREVIOUS` (expect `first`)
    - _Requirements: 14.1_

  - [x] 2.3 Label removal (needs approval for the write)
    - Tell the user the exact command, `aws secretsmanager update-secret-version-stage --secret-id <temporary secret> --version-stage AWSPREVIOUS --remove-from-version-id <version id of first> --profile release --region us-east-2`, and **wait for approval**. After approval, run it, then run `get-secret-value --version-stage AWSPREVIOUS` again. Record whether the label was removed and what the read returns
    - If the user declines, skip the command and record that the documentation must say "wait for the next rotation" (R12.5)
    - _Requirements: 14.2, 12.5_

  - [x] 2.4 Delete and confirm
    - `delete-secret --force-delete-without-recovery`, then `list-secrets --filters Key=name,Values=kiro-probe-` returns nothing. The check creates no other resource
    - _Requirements: 14.4_

  - [x] 2.5 Record the results
    - Append a "V1 results" section to design.md: the SDK error name and message for a missing stage, whether the label removal worked, and that the extension was or was not exercised (it is exercised only if a function with the layer already exists; do not create one). Decide and write down: the exact error `name` the previous reader maps to "no previous version" (design default: `ResourceNotFoundException`), and whether `PREVIOUS_MISSING_STATUS` stays "any non-2xx" (R14.6) or narrows to observed statuses
    - If a result contradicts a statement in requirements.md or design.md, stop and bring it to the user
    - _Requirements: 14.5, 14.6, 4.10_

- [x] 3. Add the base-class hook (preservation test first)

  - [x] 3.1 Write the preservation test
    - **File:** `test/request/ingress/unit/cached-secret-non2xx-hook-tests.jest.mjs` (new)
    - Using `test/helpers/extension-mock.mjs` (`nonTwoXxWithJson(jest, http, 403)`), assert that `new CachedSecret("<unique id>")._requestSecretsFromLambdaExtension()` resolves `{ ok: false, reason: "non-2xx" }` and writes exactly one `DebugAndLog.warn` whose message is `CachedParameterSecret http: Non-2xx 403 for /secretsmanager/get?secretId=<id>&withDecryption=true`. Add the same assertion for `CachedSsmParameter`
    - Run it on the unchanged code. **EXPECTED OUTCOME:** passes. A failure means the test misreads today's contract: fix the test
    - _Requirements: 4.2_

  - [x] 3.2 Add the hook
    - **File:** `src/lib/tools/CachedParametersSecrets.classes.js`
    - Add `_logNon2xxResponse(statusCode, path)` to `CachedParameterSecret` (design.md "The base-class hook"), with `@private` JSDoc, `@param`, `@returns`, and `@example`. Replace the `DebugAndLog.warn(...)` line in the non-2xx branch of `_requestSecretsFromLambdaExtension` with `this._logNon2xxResponse(res.statusCode, options.path);`. Change nothing else in the file
    - _Requirements: 4.2_

  - [x] 3.3 Re-run
    - Run 3.1's file and the existing cached-secret tests: `test/config/sdk-fallback-tests.jest.mjs`, `test/config/parameter-secret-tests.jest.mjs`, `test/config/parameter-secret-edge-case-tests.jest.mjs`, `test/config/cached-parameter-secrets-init-tests.jest.mjs`, `test/config/extension-availability-tests.jest.mjs`. **EXPECTED OUTCOME:** all pass with no edit to an existing test
    - _Requirements: 4.2, 11.3_

- [x] 4. Build the secret readers
  - Wait for task 2.5 and task 3.2

  - [x] 4.1 Write the classes
    - **File:** `src/lib/utils/IngressSecretReaders.classes.js` (new)
    - Implement design.md "Ingress secret readers": `IngressSecretReader` (extends `CachedSecret`, `getName`, `getNameTag`, `getPath` with `versionStage`, `hasSettled`, `secretValue`, `needsRefresh` with the 30-second wait, `refresh` with the stuck-state reset and outcome recording, `_requestFromSdk` with `VersionStage`), `IngressCurrentSecretReader` (`STAGE = "AWSCURRENT"`), and `IngressPreviousSecretReader` (`STAGE = "AWSPREVIOUS"`, `NO_PREVIOUS_VERSION`, `_logNon2xxResponse`, `_requestSecretsFromLambdaExtension`, the SDK not-found mapping). Use the error `name` and `PREVIOUS_MISSING_STATUS` decided in 2.5
    - Require `AWS` lazily inside the methods, as `CachedParametersSecrets.classes.js` does. Use `encodeURIComponent` for the secret id. Log no value. Mark every class `@private`; full JSDoc with `@example`. Do not export from `src/index.js` or `src/lib/tools/index.js`
    - _Requirements: 4.1, 4.3 to 4.9, 4.11, 10.2_

  - [x] 4.2 Write the reader tests
    - **File:** `test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs` (new)
    - Every item in design.md's list for this file. Cover both transports: SDK (mock `AWS.secrets`, assert `{ SecretId, VersionStage }`) and extension (mock `http.request`, assert the path contains `versionStage=AWSCURRENT` or `AWSPREVIOUS` and the encoded id)
    - _Requirements: 4.1 to 4.11, 15.1_

  - [x] 4.3 Run the reader tests
    - **EXPECTED OUTCOME:** pass. Also run the files from 3.3 again
    - _Requirements: 4.2, 15.10_

- [x] 5. Build `IngressVerifier`

  - [x] 5.1 Write the class
    - **File:** `src/lib/utils/IngressVerifier.class.js` (new)
    - Implement design.md "IngressVerifier": constants, frozen result objects, the memoized readers of both variables (`ParameterKeySafety.checkSecretName`, one error per distinct bad value, interval 60 to 86400 with one warning), `register()`, `evaluate()` in the order of R3.2 with the SHA-256 and `timingSafeEqual` comparison of both values, the episode log, `#startMismatchRefresh` with the 60-second cooldown, `prime()`, and `reset()` (marked "FOR TESTING ONLY"). Import `crypto` as `node:crypto`
    - No `await` in `evaluate()`. No log argument contains the header or a secret value. Full JSDoc with `@private`
    - _Requirements: 1, 3, 5, 6, 10_

  - [x] 5.2 Write the configuration tests
    - **File:** `test/request/ingress/unit/ingress-verifier-config-tests.jest.mjs` (new)
    - Every item in design.md's list for this file
    - _Requirements: 1.1 to 1.7_

  - [x] 5.3 Write the evaluation tests
    - **File:** `test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs` (new)
    - Every item in design.md's list for this file: one test per row of the R3.2 table, the previous reader cases, rotation, and the error-episode counts
    - _Requirements: 3.1 to 3.8, 10.1, 10.4_

  - [x] 5.4 Write the priming tests
    - **File:** `test/request/ingress/unit/ingress-verifier-prime-tests.jest.mjs` (new)
    - Every item in design.md's list for this file, including a never-rotated secret (assert no second read of the previous reader before R seconds, D16)
    - _Requirements: 5.1 to 5.4, 4.5_

  - [x] 5.5 Write the mismatch refresh tests
    - **File:** `test/request/ingress/unit/ingress-verifier-mismatch-refresh-tests.jest.mjs` (new)
    - Every item in design.md's list for this file, including Property 8 with `Date.now` mocked. `numRuns` 100. **Do NOT pass a `seed` option**
    - _Requirements: 6.1 to 6.6_

  - [x] 5.6 Write the property tests
    - **File:** `test/request/ingress/property/ingress-verifier-property-tests.jest.mjs` (new)
    - Properties 1 to 6 and 9, exactly as in design.md "Correctness properties", with the shared arbitraries. `numRuns` 100 or more. **Do NOT pass a `seed` option**, and do not filter a generator by the predicate a property asserts. Property 9's model is a plain ordered list of conditions written in the test
    - _Requirements: 3.2, 3.6, 10.1, 15.2_

  - [x] 5.7 Run the verifier tests
    - Run the files from 5.2 to 5.6 and the files from 4.2 and 3.1. **EXPECTED OUTCOME:** pass
    - _Requirements: 15.10_

- [x] 6. Add `client.sourceIp` to `RequestInfo`
  - Independent of tasks 3 to 5

  - [x] 6.1 Write the tests
    - **File:** `test/request/ingress/unit/request-info-source-ip-tests.jest.mjs` (new)
    - Present, missing `requestContext`, `null` identity, empty string, and non-string `sourceIp`; `client.ip` unchanged for the same events. Delete `CACHE_DATA_TRUSTED_PROXY_HOPS` in `beforeEach`
    - Run on the current code. **EXPECTED TO FAIL:** the `sourceIp` assertions; **EXPECTED TO PASS:** the `client.ip` preservation cases
    - _Requirements: 2.1 to 2.4_

  - [x] 6.2 Add the field
    - **File:** `src/lib/tools/RequestInfo.class.js`
    - Add `sourceIp: null` to the default `client` object in `_clientRequestInfo` and set it as in design.md "RequestInfo". Update the JSDoc `@returns` shape of `_clientRequestInfo`. Do not change `ClientIpResolver` or `client.ip`. The file must still contain no lowercase `x-forwarded-for`
    - _Requirements: 2.1 to 2.4, 12.7_

  - [x] 6.3 Run
    - Run 6.1's file and `test/request/` files for `RequestInfo` (`request-info-tests`, `request-info-property-tests`, `request-info-forwarded-for-*`, `client-ip/`). **EXPECTED OUTCOME:** pass, with no edit to an existing test
    - _Requirements: 2.4, 11.1_

- [x] 7. Wire the verifier into `ClientRequest`
  - Wait for tasks 5.7 and 6.3

  - [x] 7.1 Edit the class
    - **File:** `src/lib/tools/ClientRequest.class.js`
    - Require `IngressVerifier` and call `IngressVerifier.register()` at module scope; add the private `#ingress`; in the constructor call `IngressVerifier.evaluate(this.getClientHeaders())` and add `sourceIp` and `ingress` to `#props.client`; write the `INGRESS_UNVERIFIED` line when unverified; add `isIngressVerified()` and `static prime()`. Do not touch `#validate()`, `isValid()`, or `getValidationReason()`. Do not touch `Response.class.js`
    - Full JSDoc for both new methods (`@returns`, `@example`; `prime` returns `Promise<boolean>`), the class comment, and the `getProps()` typedef (`sourceIp`, `ingress`). Name `docs/features/tools/README.md` by path, no link
    - _Requirements: 1.5, 2.3, 3.1, 5.1 to 5.5, 7.1 to 7.4, 8.1 to 8.5, 12.7_

  - [x] 7.2 Write the `ClientRequest` tests
    - **File:** `test/request/ingress/unit/client-request-ingress-tests.jest.mjs` (new)
    - Every item in design.md's list for this file, including `isIngressVerified()` staying `false` after `getProps().client.ingress` is overwritten, exactly one `INGRESS_UNVERIFIED` line with only `{"reason":"<code>"}`, no line for `direct` and `cloudfront`, `isValid()` unchanged, and the `RESPONSE` line still having 13 fields (spy on `DebugAndLog.log`, finalize a `Response`)
    - _Requirements: 2.3, 3.1, 5.2, 7.1 to 7.4, 8.1 to 8.5, 15.3, 15.6_

  - [x] 7.3 Write the secrecy test
    - **File:** `test/request/ingress/integration/ingress-log-secrecy-tests.jest.mjs` (new)
    - Property 7: capture every `DebugAndLog` call across full request sequences (including failures and recovery) and assert that no argument contains the secret or the header. Add the example test that no package message contains `"!"`. `numRuns` 100. **Do NOT pass a `seed` option**
    - _Requirements: 10.2, 15.7_

  - [x] 7.4 Write the export test
    - **File:** `test/request/ingress/unit/ingress-not-exported-tests.jest.mjs` (new)
    - Assert that `src/index.js`, `src/lib/tools/index.js`, and every file under `types/` do not contain `IngressVerifier`, `IngressSecretReader`, `IngressCurrentSecretReader`, or `IngressPreviousSecretReader`. Assert that the package exports gain no name
    - _Requirements: 11.2, 11.4, 15.8_

  - [x] 7.5 Run the affected directories
    - Run `test/request`, `test/response`, `test/config`, and `test/documentation`. **EXPECTED OUTCOME:** pass. If an existing test asserts the exact key set of `getProps().client` or `RequestInfo`'s client object, it fails by the two new keys: bring it to the user before editing it
    - _Requirements: 11.1, 15.10_

- [x] 8. Checkpoint: full suite
  - Run `npm test`
  - **EXPECTED OUTCOME:** everything passes except failures recorded as pre-existing in 1.1
  - `git status`: the only modified existing files are `src/lib/tools/CachedParametersSecrets.classes.js`, `src/lib/tools/RequestInfo.class.js`, and `src/lib/tools/ClientRequest.class.js`. New files are the two under `src/lib/utils/` and the tests under `test/request/ingress/`
  - If another existing test fails, treat it as a design problem: stop and bring it to the user. Don't edit existing tests
  - Check for stray processes: `ps aux | grep jest | grep -v grep` prints nothing
  - _Requirements: 15.10, 11.1_

- [x] 9. Update the type declarations
  - **File:** `types/lib/tools/index.d.ts`
  - Add `isIngressVerified(): boolean` and `static prime(): Promise<boolean>` to `class ClientRequest`, with doc comments (description, `@returns`, `@example`) as in design.md "Types". Add nothing else. `getProps()` stays undeclared (D12)
  - Run `npm run test:types` and `test/types/` and `test/config/property/node-support-export-surface-property-tests.jest.mjs`. **EXPECTED OUTCOME:** pass
  - _Requirements: 5.5, 7.3, 11.5_

- [x] 10. Documentation
  - Follow `.kiro/steering/documentation-standards-markdown.md`: ATX headers, no skipped levels, a language on every code block, relative links, no real identifiers

  - [x] 10.1 Add the "Ingress verification" subsection
    - **File:** `docs/features/tools/README.md`
    - Directly after `##### Origin lock for your own CloudFront (T2 and T3)` and before `##### Check your deployment`, write the subsection outlined in design.md "Documentation design" items 1 to 7: what it proves, setup with the variable table and the IAM snippet, the handler example, the `ingress` and reason-code tables, the log line and the Logs Insights query with the monitor-first rollout, the rotation procedure (PLAN.md Section 6.3, including the 65-minute wait and what the mismatch refresh does and does not do), and the limits (REST events only, `sourceIp` caveats, never log the header, the `sanitize()` limits). State the label-removal command only if task 2.3 confirmed it
    - _Requirements: 12.1, 12.4, 12.5, 12.8, 9.1, 10.5, 6.7_

  - [x] 10.2 Update the warning and the `getProps()` listing
    - **File:** `docs/features/tools/README.md`
    - Add the third option and the link to the "Origin lock" warning (R12.2). Add `sourceIp` and `ingress` to the `getProps()` listing (R12.3). Keep the headings that other text links to
    - _Requirements: 12.2, 12.3, 12.9_

  - [x] 10.3 Add observation O9
    - **File:** `docs/cloudfront-notes/README.md`
    - Add the O9 row from design.md after O8. It cites the maintainer's measurement and the AWS documentation and claims no new measurement
    - _Requirements: 12.6_

  - [x] 10.4 Verify the documentation
    - Run `test/documentation/`. **EXPECTED OUTCOME:** pass
    - Search the documentation set and the new source files for forbidden content: `grep -rniE "[0-9]{12}|execute-api\.[a-z0-9-]+\.amazonaws\.com|cloudfront\.net|TestHarness"` over the files touched in tasks 3 to 10 prints nothing that is a real identifier. Check every IP address is in a documentation range
    - Search for the old names: `grep -rn "OriginVerifier\|isOriginVerified\|CACHE_DATA_ORIGIN" src docs test types CHANGELOG.md` prints nothing
    - _Requirements: 12.8, 12.9, 15.10_

- [x] 11. CHANGELOG and draft advisory

  - [x] 11.1 Add the CHANGELOG entry
    - **File:** `CHANGELOG.md`
    - **STOP and ask the developer** if `## v1.4.1 (unreleased)` is missing or `package.json` is not `1.4.1`. Otherwise add the "Ingress verification" entry from design.md under `### Added` of v1.4.1. Change no existing line
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 11.2 Add the advisory sentence
    - **File:** `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`
    - Add the one sentence from design.md "Security advisory draft" to the origin-lock recommendation. Change nothing else in this file and no other file of that spec. Publishing stays the developer's step
    - _Requirements: 13.4_

- [x] 12. Final checkpoint
  - [x] 12.1 Full suite on the default runtime
    - `npm test`. **EXPECTED OUTCOME:** all pass except failures recorded as pre-existing in 1.1
    - _Requirements: 15.10_

  - [x] 12.2 New tests on the other runtimes
    - Run `test/request/ingress` and `test/config` on Node.js 22.23.2 and 26.10.0 with the commands in the Overview
    - _Requirements: 15.10_

  - [x] 12.3 Lint the touched files
    - `npx eslint` on the two new `src/lib/utils/` files and the new test files: no errors. The three modified `src/lib/tools/` files: no more errors than recorded in 1.2
    - _Requirements: 15.11_

  - [x] 12.4 Check the scope
    - `git status` and `git diff --stat`: only the files listed in design.md "Files" changed, plus the V1 results in design.md. `package.json` is still `1.4.1`. `grep -rn "x-atlantis-origin-secret" src` shows only the constant in `IngressVerifier`. No temporary file remains in `/tmp` from this work
    - Confirm V1's temporary secret no longer exists (task 2.4)
    - `ps aux | grep jest | grep -v grep` prints nothing
    - _Requirements: 11.2, 11.7, 14.4_

  - [x] 12.5 Report
    - Summarize what changed, the V1 results, any open item, and the two spin-offs already filed (`1-4-2-sanitize-masks-only-part-of-a-secret-value` and atlantis-sam-templates #11). Suggest retitling GitHub issue #254 to say "ingress". Don't commit, tag, publish, or push without explicit instruction
    - _Requirements: 13_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "6.2"] },
    { "id": 3, "tasks": ["2.3", "3.3", "6.3"] },
    { "id": 4, "tasks": ["2.4"] },
    { "id": 5, "tasks": ["2.5"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2", "5.1"] },
    { "id": 8, "tasks": ["4.3", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 9, "tasks": ["5.7"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 12, "tasks": ["7.5"] },
    { "id": 13, "tasks": ["8"] },
    { "id": 14, "tasks": ["9", "10.1", "10.3", "11.1", "11.2"] },
    { "id": 15, "tasks": ["10.2"] },
    { "id": 16, "tasks": ["10.4"] },
    { "id": 17, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 18, "tasks": ["12.5"] }
  ]
}
```

Rendered view of the same ordering:

```
1  baselines ─┬─> 2  V1 check (SSO, one approval) ─────────────────┐
              ├─> 3  hook: test PASS now ─> edit ─> re-run ────────┤
              └─> 6  RequestInfo.sourceIp (tests FAIL now ─> PASS) ┤
                                                                   v
                     4  readers ─> 5  IngressVerifier + tests (PASS)
                                                                   v
                     7  ClientRequest wiring + tests
                                                                   v
                     8  CHECKPOINT: npm test
                                                                   v
                     9 types ─ 10 docs ─ 11 CHANGELOG + advisory   (parallel; 10.2 after 10.1, 10.4 after all)
                                                                   v
                     12 final checkpoint
```

**Critical path:** 1 → 2 → 4 → 5 → 7 → 8 → 10 → 12.

**Ordering constraints:**

- Task 1 must finish before anything under `src/` changes, so the baselines describe the current code.
- Task 3.1 must run before 3.2, so the hook's preservation test is observed passing on the current code.
- Task 2.5 must finish before 4.1, so the previous reader uses the observed error name and status. Task 2.3 needs the user's approval and a valid SSO session; if either is missing, the rest of task 2 waits and tasks 3 and 6 continue.
- Task 4.1 needs 3.2, because the previous reader overrides the hook.
- Task 7.1 needs 5.7 and 6.3, so the wiring is built on a verifier and a field that already pass their tests.
- Task 8 is a hard gate: the full suite must be green with no existing test edited before the release work in tasks 9 to 11.
- Task 10.1 needs 2.5 (whether the label-removal command can be documented). Task 10.4 needs 10.1 to 10.3. Task 11.1 stops if the `v1.4.1 (unreleased)` heading or the `package.json` version is missing.

## Notes

### Property to task map

| Property | Written in | Verified in |
|---|---|---|
| P1 — A wrong header never verifies | 5.6 | 5.7, 12.1 |
| P2 — The header name is case-insensitive | 5.6 | 5.7, 12.1 |
| P3 — Current and previous verify; older does not | 5.6 | 5.7, 12.1 |
| P4 — Non-strings and empty headers never verify | 5.6 | 5.7, 12.1 |
| P5 — An unusable secret never verifies | 5.6 | 5.7, 12.1 |
| P6 — Total | 5.6 | 5.7, 12.1 |
| P7 — The secret is never logged | 7.3 | 7.5, 12.1 |
| P8 — The mismatch refresh is rate-limited | 5.5 | 5.7, 12.1 |
| P9 — Decision table | 5.6 | 5.7, 12.1 |

### Requirement to task map

| Requirement | Tasks |
|---|---|
| 1. Configuration | 5.1, 5.2 |
| 2. `client.sourceIp` | 6.1, 6.2, 6.3, 7.1, 7.2 |
| 3. `client.ingress` and reason codes | 5.1, 5.3, 5.6, 7.1, 7.2 |
| 4. Reading the secret | 2, 3, 4 |
| 5. Priming | 5.1, 5.4, 7.1, 7.2, 9 |
| 6. Mismatch refresh | 5.1, 5.5, 10.1 |
| 7. `isIngressVerified()` | 7.1, 7.2, 9 |
| 8. Log line `INGRESS_UNVERIFIED` | 7.1, 7.2 |
| 9. Reason codes | 10.1 |
| 10. Fail-closed behavior and secrecy | 4.1, 5.1, 5.3, 5.6, 7.3, 10.1 |
| 11. Backwards compatibility | 3.3, 6.3, 7.4, 7.5, 8, 9, 12.4 |
| 12. Documentation | 7.1, 10, 12 |
| 13. Changelog and draft advisory | 11, 12.5 |
| 14. Runtime check of the missing previous version | 2, 12.4 |
| 15. Tests | 1, 4.2, 5.2 to 5.7, 7.2 to 7.5, 8, 12 |

### Related documentation

- [requirements.md](requirements.md) - the 15 requirements these tasks satisfy
- [design.md](design.md) - components, flows, the nine correctness properties, the test design, and the V1 procedure
- [PLAN.md](PLAN.md) - the locked decisions (Decisions 1 to 10, D1 to D20, U1)
- [Spin-off: sanitize partial masking](../1-4-2-sanitize-masks-only-part-of-a-secret-value/ISSUE.md) and [atlantis-sam-templates #11](https://github.com/63Klabs/atlantis-sam-templates/issues/11)
