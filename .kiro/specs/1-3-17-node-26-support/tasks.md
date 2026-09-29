# Implementation Plan: Node.js 26 Support + Node.js 20 Deprecation

## Overview

This plan implements Node.js 26 support and a formal Node.js 20 deprecation for `@63klabs/cache-data` as a PATCH release (v1.3.17). The implementation language is **JavaScript (Node.js >= 22.0.0)**, matching the existing package source and the design document — no language-selection step is required.

Work proceeds runtime-first: the data-driven deprecation notice registry and updated hard floor land with their property and subprocess tests before the declarative CI, packaging, documentation, and steering-runbook changes. The final tasks run the full Jest suite on Node.js 26 to satisfy Requirement 1 and close with a green full-suite check.

All tests are `*.jest.mjs`, use `expect`/`jest.spyOn`, and run via direct Jest binary invocation (`node --experimental-vm-modules node_modules/jest/bin/jest.js <file>`) per the test-execution-monitoring steering. No test invokes `npm test`, uses a shell string for subprocess spawning, or runs the full suite recursively. Subprocess-isolated tests use `execFile`-style array arguments (`process.execPath`, `['-e', script]`) with an explicit timeout and `maxBuffer`.

## Tasks

- [x] 1. Update the hard version floor in `src/lib/tools/vars.js`
  - Change the module-load floor check threshold from `< 16` to `< 20`, keeping it as `console.error` + `process.exit(1)` before any other code runs
  - Replace the stale "16 required, 18 preferred" message with text stating minimum Node.js 20 (22 or later recommended), including the detected version
  - Add the documenting comment noting Node 20 is NOT rejected here in v1.3.17 (it only warns) and that the floor rises to `< 22` in the future v1.4.0 removal spec
  - Verify Node 20 passes the floor (`20 < 20` is false) and Node 22/24/26 pass unchanged
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 1.1 Write property test for the hard floor predicate
  - Mirror/extract the `m < 20` threshold predicate and assert exit-triggering iff `m < 20` across a wide generated integer range of majors
  - fast-check, >=100 iterations; tag `// Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20`
  - _Requirements: 5.1, 5.3, 5.5 (Property 5)_

- [x] 2. Add the deprecation notice registry and walker to `src/lib/tools/index.js`
  - [x] 2.1 Add the `NODE_DEPRECATION_NOTICES` registry constant
    - Ordered array with exactly one initial entry: `{ version: 20, active: true, message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later." }`
    - Add the documenting comment explaining the `active: false`-rather-than-delete audit convention and referencing the runbook (`.kiro/steering/cache-data-node-support.md`) as the source of future entries
    - Add the `@typedef {Object} NodeDeprecationNotice` JSDoc (version/active/message) per repo documentation standards
    - _Requirements: 3.2, 4.1, 4.4, 4.5, 4.6_

  - [x] 2.2 Add the `checkNodeDeprecationNotices(runningMajor = nodeVerMajor)` helper
    - Module-internal (not exported); walk the registry once, warn via `DebugAndLog.warn()` for any `active` entry whose `version` matches `runningMajor`
    - Reuse the existing `_deprecationNoticed` Set with a namespaced guard key (`node-major-${notice.version}`) so it emits at most once per process and cannot collide with existing method-name keys
    - Keep the walk free of I/O, `process.env`, shell, and any throwing operation so it never affects module initialization or exports
    - Full JSDoc including `@private`, `@param`, `@returns`, `@example` per repo standards
    - _Requirements: 3.1, 3.3, 3.4, 3.6, 4.2, 4.3_

  - [x] 2.3 Invoke the walker exactly once at module load
    - Call `checkNodeDeprecationNotices()` once during module load of `tools/index.js`, after `DebugAndLog` and `nodeVerMajor` are available and after the `vars.js` floor has run
    - Confirm no change to the set/identities of exported names
    - _Requirements: 3.1, 4.2, 8.1, 8.4_

  - [x] 2.4 Write property test — warning fires at most once per process (Property 1)
    - Drive `checkNodeDeprecationNotices(runningMajor)` repeatedly in-process; spy on `DebugAndLog.warn` with `jest.spyOn`; assert at most one warning per entry version regardless of invocation count; `jest.restoreAllMocks()` in `afterEach`
    - fast-check, >=100 iterations; tag `// Feature: 1-3-17-node-26-support, Property 1: Deprecation warning fires at most once per process`
    - _Requirements: 3.3, 4.2, 4.3 (Property 1)_

  - [x] 2.5 Write property test — warns iff a matching active entry exists, with exact text (Property 2)
    - Generate synthetic registries (varying `active`, `version`, `message`) and majors; assert a warning is emitted iff an active entry matches the running major, and the logged text equals that entry's `message`
    - fast-check, >=100 iterations; tag `// Feature: 1-3-17-node-26-support, Property 2: Warning fires only for a matching active entry`
    - _Requirements: 3.1, 3.2, 4.1 (Property 2)_

  - [x] 2.6 Write property test — inactive/non-matching entries never warn (Property 3)
    - Generate entries that are `active: false` or whose `version` differs from the running major; assert no warning is attributable to those entries
    - fast-check, >=100 iterations; tag `// Feature: 1-3-17-node-26-support, Property 3: Inactive and non-matching entries never warn`
    - _Requirements: 3.5, 4.4 (Property 3)_

  - [x] 2.7 Write property test — only Node 20 warns under the initial registry (Property 4)
    - Using the real initial single-entry registry, drive majors across a wide range; assert a warning is emitted when and only when the running major is exactly 20
    - fast-check, >=100 iterations; tag `// Feature: 1-3-17-node-26-support, Property 4: Only Node 20 warns under the initial registry`
    - _Requirements: 3.1, 3.5, 4.5, 8.3 (Property 4)_

- [x] 3. Add subprocess-isolated module-load tests for floor and warning behavior
  - [x] 3.1 Write subprocess-isolated test for supported-runtime module load (Property 6)
    - Spawn a child via `execFile(process.execPath, ['-e', script], { timeout, maxBuffer })` (no shell string) that requires the package; assert exit code 0
    - On the current runtime assert: major 20 emits the exact Requirement 3.2 warning text; majors 22/24/26 emit neither the floor message nor the deprecation warning
    - tag `// Feature: 1-3-17-node-26-support, Property 6: Supported versions neither exit nor warn beyond the Node 20 case`
    - _Requirements: 3.5, 5.5, 8.2 (Property 6)_

  - [x] 3.2 Write test for the floor exit-code-1 / process.exit wiring (Property 5)
    - Cover the sub-floor `process.exit(1)` + message path in isolation: spawn a sub-floor major where feasible via `execFile` array args, otherwise assert via a spy on `process.exit` in an isolated import that the message string and exit call are wired so the branch is exercised
    - tag `// Feature: 1-3-17-node-26-support, Property 5: Hard floor exits below 20 and only below 20`
    - _Requirements: 5.1, 5.2, 5.3 (Property 5)_

  - [x] 3.3 Write backwards-compatibility export-surface snapshot test (Property 7)
    - Snapshot the exported names/shape of the package and assert the export surface (names and value identities) is unchanged, independent of whether the warning is emitted
    - tag `// Feature: 1-3-17-node-26-support, Property 7: Emitting a warning does not alter module exports`
    - _Requirements: 8.1, 8.4 (Property 7)_

  - [x] 3.4 Write structural test for registry initial state and documenting comment
    - Assert `NODE_DEPRECATION_NOTICES` has exactly one entry `{version:20, active:true, message:<Req 3.2 text>}` and that the documenting comment referencing the runbook and the `active:false`-not-delete convention is present in `src/lib/tools/index.js`
    - _Requirements: 4.5, 4.6_

- [x] 4. Checkpoint - runtime code and its tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update the CI test matrix in `.github/workflows/test.yml`
  - Add `'26'` to the `node-version` matrix alongside `'20'`, `'22'`, `'24'`
  - Add `fail-fast: false` to the matrix strategy
  - Make only the `'26'` leg `continue-on-error` (via a per-matrix expression such as `continue-on-error: ${{ matrix.node-version == '26' }}`); keep `'20'` unchanged and not `continue-on-error`
  - Leave the coverage step gated on `'24'` only (do not run coverage on `'26'`)
  - Do NOT modify `.github/workflows/npm-publish.yml` (stays Node 24)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.1 Write structural test for the CI matrix
    - Parse `test.yml`; assert the matrix includes `'26'`, the `'26'` leg is `continue-on-error`, `'20'` is present and not `continue-on-error`, `fail-fast: false` is set, and coverage stays gated on `'24'`
    - Assert `npm-publish.yml` is unchanged (still Node 24)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Reconcile `engines.node` and README minimum Node version
  - Update `package.json` `engines.node` from `">=20.0.0"` to `">=22.0.0"`
  - Reconcile the README "Requirements" section to a single minimum matching `engines.node`, removing the residual `>=20.0.0`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.1 Write structural test for engines.node and README
    - Assert `package.json` `engines.node === ">=22.0.0"` and the README Requirements section states a single minimum matching it with no residual `>=20.0.0`
    - _Requirements: 6.1, 6.2_

- [x] 7. Add the CHANGELOG entry in `CHANGELOG.md`
  - Add a new `## v1.3.17 (unreleased)` section (latest existing is v1.3.16)
  - Record Node.js 26 support under `Added`; record the Node.js 20 deprecation under `Deprecated` using the project's plain "deprecated, no fixed sunset date" format (matching the v1.3.16 `AppConfig._initParameters()` precedent), not the CloudFormation 24-month-sunset format
  - Reference this spec directory (`.kiro/specs/1-3-17-node-26-support`)
  - Add the note that the changelog-convention steering document has a stray CloudFormation 24-month-sunset reference to review for npm applicability as a Phase 2 / v1.4.0 follow-up
  - Optionally add a short note that Node.js 26 is available on Lambda as a public preview runtime; leave `nodejs24.x` example templates unchanged
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 7.1 Write structural test for the CHANGELOG entry
    - Assert a `## v1.3.17 (unreleased)` section exists with a Node 26 `Added` entry, a Node 20 `Deprecated` entry in the plain no-sunset format, a reference to this spec directory, and the changelog-steering follow-up note
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

- [x] 8. Create the `.kiro/steering/cache-data-node-support.md` runbook
  - Add `inclusion: manual` + `description` front matter, matching the pattern of `automation-assign-github-issues.md` / `automation-check-dependency-updates.md`
  - Part A: seeded support matrix with the exact columns and seed values from design.md Data Models (`nodejs20.x`–`nodejs26.x`), keeping Package Policy and AWS Lambda Status as distinct columns
  - Add the standing Node release cadence note (one major/year, released April, LTS October)
  - Part B procedure: fetch the AWS Lambda runtimes table preferring the AWS docs MCP tools with `web_fetch` fallback (web search only to backfill upstream EOL/LTS for a runtime not yet in the matrix); diff against the stored matrix; refresh all AWS-sourced columns + last-checked every run regardless of triggers; evaluate triggers; report
  - Encode the exact Requirement 10 trigger decision logic: new version detected (Preview → record only, no spec; GA → PATCH `{current-version}-node-{NN}-support`); Preview→GA → PATCH support spec + recommend updating example docs runtimes; EOL within 6 months → PATCH `{current-version}-node-{NN}-deprecation`; EOL passed (past Lambda block-update) → MINOR `{next-minor}-node-{NN}-removal`; each recommendation carries a one-paragraph rationale referencing this spec's patterns
  - State that the runbook is report-only and never creates/modifies/executes code, specs, or CI
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 8.1 Write structural test for the runbook document
    - Assert the file exists with `inclusion: manual` front matter and a `description`; contains the matrix with the required columns seeded with `nodejs20.x`–`nodejs26.x`; keeps Package Policy and AWS Lambda Status as distinct columns; includes the Node cadence note; and describes the Part B procedure and the Requirement 10 trigger table
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6_

- [x] 9. Checkpoint - config, docs, and runbook
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Verify the full suite on Node.js 26 (Requirement 1)
  - Run the full Jest suite once on Node.js 26 via direct binary invocation (`node --experimental-vm-modules node_modules/jest/bin/jest.js`)
  - If failures appear only on Node 26 (not on 22/24), triage and fix them as part of this spec
  - If the suite passes unchanged, document the static-analysis conclusion (no deprecated-API usage in `src/`) as confirmed in the CHANGELOG / implementation notes
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 11. Final checkpoint - full suite green
  - Run the complete test suite on the supported runtime and confirm all tests pass; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster path; core implementation and configuration tasks are never optional.
- Each task references the specific requirements (granular sub-requirements) it satisfies for traceability.
- Property test sub-tasks each reference a single design property and are tagged `// Feature: 1-3-17-node-26-support, Property {n}: {text}` per the design Testing Strategy.
- Subprocess-isolated tests use `execFile`-style array arguments with timeout + maxBuffer, never a shell string and never `npm test`, per the test-execution-monitoring and secure-coding steering.
- Runtime code (floor + registry) and its tests land before the declarative CI/packaging/docs/runbook changes; the plan ends with the one-time Node 26 verification and a final full-suite green check.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["1.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["5", "6", "7", "8"] },
    { "id": 5, "tasks": ["5.1", "6.1", "7.1", "8.1"] }
  ]
}
```
