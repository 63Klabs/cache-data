# Requirements: Remove Node 20 Support

## Introduction

v1.3.17 deprecated Node.js 20 (a one-time warning per process) and deferred its removal to a future MINOR release, v1.4.0. It also established the removal pattern in the `.kiro/steering/cache-data-node-support.md` runbook: flip the deprecation-registry entry to `active: false` (never delete), raise the hard runtime floor in `src/lib/tools/vars.js`, and drop the retired CI leg.

This spec completes that removal. As of the planning date (2026-10-20) the Node 20 AWS Lambda block-update date (the runbook's trigger #5, "EOL passed") has passed, which governs the decision and supersedes the original "gated on `nodejs26.x` GA" wording in the v1.3.17 changelog. Node 26 remains explicitly out of scope: this spec removes Node 20 and does not require, default to, or change the status of Node 26.

The removal is partially complete already. v1.3.17 reconciled `package.json` `engines.node` to `>=22.0.0` and the README "Requirements" minimums to `>=22.0.0`; those need no change. What remains is the hard floor, the deprecation registry, the CI matrix, the runbook support matrix, one stale script note, and the changelog.

This is a MINOR release (`1.4.0`). The hard-floor behavior change (a process on Node 20 now exits instead of warning) is not a breaking change in the semver sense for the supported platform, because AWS Lambda no longer lets Node 20 functions be created or updated.

### Decisions carried in from PLAN.md

- Q1 = Option A: proceed with removal now; note the block-update date as the governing condition superseding the "26 GA" gate.
- Q2: the new hard floor rejects any Node major below 22 (so both Node 20 and Node 21 are refused).
- Q3: the floor-breach message is `Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.`
- Q4 = Option A: this spec updates only the `nodejs20.x` row of the runbook Part A matrix (Package Policy, Notes, Last Checked) as a bookkeeping sync; it leaves AWS-sourced columns and all other rows untouched.
- Q5 = Option A: `scripts/review-documentation-files.mjs` reads the floor dynamically from `package.json` `engines.node` rather than hardcoding a version string.
- Q6: changelog uses `Removed` + `Changed`; not flagged as a breaking change; MINOR bump.
- Q7: scope is Node 20 removal only; the lazy-loader and timezone v1.4.0 items are separate specs and are not touched.

## Glossary

- **Hard floor** — the `process.exit(1)` guard in `src/lib/tools/vars.js` that refuses to run on a Node major below the minimum. This is the only mechanism that actually stops execution.
- **Advisory floor** — `package.json` `engines.node`. npm emits a warning but does not block install. Already `>=22.0.0`; unchanged by this spec.
- **Deprecation registry** — the append-only `NODE_DEPRECATION_NOTICES` array in `src/lib/tools/index.js`, consulted once per process by `checkNodeDeprecationNotices()` to emit a one-time warning for a matching active entry.
- **Runbook** — `.kiro/steering/cache-data-node-support.md`, the report-only Node.js support matrix and procedure.

## Requirements

### Requirement 1: Raise the hard runtime floor to Node 22

**User Story:** As a maintainer, I want the package to refuse to run on any Node.js major below 22, so that unsupported runtimes fail fast with a clear message instead of running untested.

#### Acceptance Criteria

1. WHEN the running Node.js major version is less than 22 THEN the hard floor in `src/lib/tools/vars.js` SHALL call `process.exit(1)` after writing an error message.
2. WHEN the running Node.js major version is 22 or greater THEN the hard floor SHALL NOT exit and module initialization SHALL proceed normally.
3. WHEN the hard floor rejects a runtime THEN the error message SHALL be exactly: `Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.` where `${nodeVer}` is the detected version string.
4. The hard-floor check SHALL reject Node major 20 and Node major 21 (the condition is `nodeVerMajor < 22`).
5. The `>!`-prefixed comment block above the hard floor SHALL be updated to state that the floor was raised to `< 22` in the v1.4.0 Node 20 removal spec, and SHALL no longer describe the raise as a future action.
6. The hard-floor message SHALL NOT contain "20" or any "Node 20 recommended/required" wording.

### Requirement 2: Retire the Node 20 deprecation notice

**User Story:** As a maintainer, I want the Node 20 deprecation-registry entry kept but marked inactive, so that the removal history and the exact message text stay auditable while the warning no longer fires.

#### Acceptance Criteria

1. The Node 20 entry in `NODE_DEPRECATION_NOTICES` (`src/lib/tools/index.js`) SHALL have `active: false`.
2. The Node 20 entry SHALL be retained in the array (not deleted) with its `version: 20` and its existing `message` text unchanged, preserving the append-only audit history required by the runbook.
3. The trailing `// flips to false in the v1.4.0 removal spec, not deleted` comment on the entry SHALL be updated to reflect that the flip has been made in this spec.
4. WHEN `checkNodeDeprecationNotices(20)` is invoked under the updated registry THEN it SHALL NOT emit any warning for Node major 20.
5. The ordering and structure of the registry array SHALL otherwise be unchanged, and no new entry SHALL be added by this spec.

### Requirement 3: Remove Node 20 from continuous integration

**User Story:** As a maintainer, I want CI to stop testing Node 20, so that the test matrix reflects the supported runtimes and does not imply continued Node 20 support.

#### Acceptance Criteria

1. The `node-version` matrix in `.github/workflows/test.yml` SHALL be `['22', '24', '26']` (the `'20'` leg removed).
2. The `'26'` leg SHALL remain the only `continue-on-error` leg; `'22'` and `'24'` SHALL remain required legs.
3. The explanatory comments in `.github/workflows/test.yml` that enumerate the required legs SHALL be updated to reference `'22'` and `'24'` (no longer `'20'`).
4. The coverage-job conditionals keyed on `matrix.node-version == '24'` / `!= '24'` SHALL be unchanged.
5. No required CI leg in `.github/workflows/test.yml` SHALL reference Node `'20'` after this change.
6. `.github/workflows/npm-publish.yml` SHALL be unchanged (it publishes on Node `'24'` and is unaffected by the test-matrix change).

### Requirement 4: Sync the runbook support matrix

**User Story:** As a maintainer, I want the Node support matrix to show Node 20 as removed, so that the runbook reflects the policy this release enacts.

#### Acceptance Criteria

1. The `nodejs20.x` row in Part A of `.kiro/steering/cache-data-node-support.md` SHALL have its Package Policy column updated to indicate removal in v1.4.0 (for example `Removed (v1.4.0)`).
2. The `nodejs20.x` row's Notes and Last Checked columns MAY be updated to reflect this bookkeeping sync.
3. The AWS-sourced columns of the `nodejs20.x` row (AWS Lambda Status, Upstream Node EOL, Lambda Deprecation Date, Lambda Block-Create, Lambda Block-Update) SHALL NOT be changed by this spec.
4. All other rows in the matrix (`nodejs22.x`, `nodejs24.x`, `nodejs26.x`) SHALL be unchanged.
5. No other section of the runbook (Part B procedure, column definitions, trigger table) SHALL be changed.

### Requirement 5: Fix the stale minimum-version note in the documentation review script

**User Story:** As a maintainer, I want the documentation review script to report the actual engines floor, so that its warnings cannot drift from `package.json` again.

#### Acceptance Criteria

1. `scripts/review-documentation-files.mjs` SHALL derive the minimum Node version it reports from `package.json` `engines.node` at runtime rather than from a hardcoded version string.
2. WHEN the script flags a document that references a specific `Node.js NN.x` version THEN the note SHALL state the engines floor currently declared in `package.json` (for example `>=22.0.0`), not a literal `>=20.0.0`.
3. The script SHALL continue to function for its existing purpose (flagging documents that reference specific Node runtime versions); no other behavior SHALL change.
4. IF `package.json` `engines.node` cannot be read or parsed THEN the script SHALL fail or report in a clearly defined way rather than silently emitting an incorrect version string.

### Requirement 6: Update tests to match the new behavior

**User Story:** As a maintainer, I want the test suite to assert the post-removal behavior, so that the removal is verified and the suite does not keep asserting the old Node 20 behavior.

#### Acceptance Criteria

1. The existing hard-floor test for `src/lib/tools/vars.js` SHALL be updated to assert that a Node major below 22 is rejected (exit code 1) and that a Node major of 22 or greater is accepted, using the subprocess-isolation pattern required by `.kiro/steering/test-execution-monitoring.md`.
2. The existing test that asserted "only Node 20 warns under the initial registry" (the v1.3.17 "Property 4" behavior) SHALL be updated to assert that Node major 20 no longer emits a deprecation warning under the updated registry.
3. Any test asserting the exact Node-20 floor message SHALL be updated to the new message text from Requirement 1.3.
4. WHEN the full Jest suite is run on Node.js 22 and on Node.js 24 THEN it SHALL pass with exit code 0.
5. No test SHALL be left asserting that Node 20 is accepted by the hard floor or that Node 20 emits a warning.
6. Tests that spawn child processes SHALL follow the timeout and direct-Jest-invocation rules in `.kiro/steering/test-execution-monitoring.md` (no recursive `npm test`).

### Requirement 7: Update the changelog

**User Story:** As a user, I want the changelog to record that Node 20 support was removed and the runtime floor raised, so that I understand the runtime impact of upgrading.

#### Acceptance Criteria

1. Entries SHALL be added only under the existing `## v1.4.0 (unreleased)` section of `CHANGELOG.md`; no released section SHALL be modified.
2. A `Removed` entry SHALL state that Node.js 20 support and CI testing were removed.
3. A `Changed` entry SHALL state that the hard runtime floor was raised to Node.js 22 (Node 20 and 21 now refuse to run).
4. The entries SHALL reference this spec using the convention `[Spec: 1-4-0-remove-node-20-support](.kiro/specs/1-4-0-remove-node-20-support/)`.
5. The change SHALL NOT be categorized under `Breaking Changes`, and no migration guide entry SHALL be added, consistent with the Q6 decision.
6. Existing `v1.4.0 (unreleased)` entries SHALL NOT be modified or reordered destructively; the new entries SHALL be added to the appropriate existing categories.

### Requirement 8: Preserve scope boundaries

**User Story:** As a maintainer, I want this spec to change only what Node 20 removal requires, so that unrelated behavior and other in-flight v1.4.0 work are not disturbed.

#### Acceptance Criteria

1. This spec SHALL NOT add Node.js 26 as a requirement, change any example Lambda runtime to `nodejs26.x`, or promote the CI `'26'` leg out of `continue-on-error`.
2. This spec SHALL NOT modify `package.json` `engines.node` (already `>=22.0.0`) or the README "Requirements" minimums (already `>=22.0.0`).
3. This spec SHALL NOT modify transitive `engines` metadata in `package-lock.json`.
4. This spec SHALL NOT modify the lazy-loader or timezone work tracked in separate v1.4.0 specs (`1-4-0-convert-aws-to-lazy-accessors`, `1-4-0-fully-implement-timezone`).
5. The public API surface (exported classes, functions, constants, and signatures) SHALL be unchanged by this spec.
