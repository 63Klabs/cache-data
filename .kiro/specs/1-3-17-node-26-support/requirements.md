# Requirements Document

## Introduction

This feature adds Node.js 26 support and formally deprecates Node.js 20, consistent with the current AWS Lambda runtime landscape: Node 20 has reached upstream end-of-life and no longer appears in AWS Lambda's supported runtimes table, while Node 26 is available on Lambda only as a public preview runtime with no SLA. It also creates a reusable steering runbook, `cache-data-node-support.md`, that codifies the runtime-support decisions made during this planning cycle so that future Node/Lambda lifecycle events (new versions, approaching EOL, GA transitions) can be triaged mechanically instead of re-researched from scratch.

This is a PATCH release (v1.3.17). No public API signature changes, no runtime behavior changes for any currently-supported Node version, and Node 20 remains fully functional — it is marked deprecated and warns, but is not removed. Removal of Node 20 support is deferred to a future MINOR release (v1.4.0), gated on AWS Lambda's `nodejs26.x` runtime reaching general availability, and is out of scope for this spec except where this spec's design must anticipate it (the deprecation-notice registry and the CI transition window).

## Glossary

- **Package Policy**: this repository's own stance on a Node major version (`Supported`, `Deprecated (warn)`, or removed), which may intentionally lag AWS's own timeline
- **AWS Lambda Status**: the live status of a `nodejsNN.x` runtime per AWS's published documentation (`Preview`, `GA`, or absent/deprecated)
- **Block-Update Date**: the date after which AWS Lambda no longer permits updating an existing function's code/configuration on a given runtime; treated as the effective forcing function for "EOL passed"
- **Deprecation notice registry**: the data-driven list of Node major versions this package has warned about, keyed by version number, each with an `active` flag and message text
- **Hard floor**: the Node major version below which the package calls `process.exit(1)` at module load, currently implemented in `src/lib/tools/vars.js`
- **Runbook**: the manually-triggered steering document `.kiro/steering/cache-data-node-support.md` that maintains the support matrix and recommends follow-up specs
- **Support matrix**: the table of Node/Lambda runtimes and their dates maintained inside the runbook

## Requirements

### Requirement 1: Node.js 26 CI Verification

**User Story:** As a maintainer, I want the test suite verified against Node.js 26, so that I know the package works on it before any user asks.

#### Acceptance Criteria

1. THE full Jest test suite SHALL be executed against Node.js 26 at least once during implementation of this spec, using the existing direct Jest binary invocation pattern (`node --experimental-vm-modules node_modules/jest/bin/jest.js`)
2. WHEN the suite run against Node.js 26 produces failures not present on Node 22 or 24, THE failures SHALL be triaged and fixed as part of this spec before it is considered complete
3. WHEN the suite run against Node.js 26 passes with no changes required, THE plan's static-analysis conclusion (no deprecated-API usage in `src/`) SHALL be considered confirmed and documented as such

### Requirement 2: CI Matrix Update for Node 26 and Node 20

**User Story:** As a maintainer, I want CI to test Node 26 as an early-warning signal without blocking merges on a preview runtime, and to keep testing Node 20 for one release as a visible transition signal.

#### Acceptance Criteria

1. THE `.github/workflows/test.yml` matrix SHALL include `'26'` in addition to the existing `'20'`, `'22'`, `'24'` entries
2. THE Node 26 matrix leg SHALL be configured with `continue-on-error: true` so that a Node 26 failure does not block the workflow or fail the check
3. THE Node 20 matrix leg SHALL be retained for this release, unchanged in behavior (not `continue-on-error`), as the transition-window signal ahead of its removal in v1.4.0
4. THE coverage job SHALL continue to run only on the Node 24 matrix leg; it SHALL NOT run on Node 26 in this release
5. THE `.github/workflows/npm-publish.yml` workflow SHALL remain on Node 24 and SHALL NOT be changed by this spec

### Requirement 3: Node.js 20 Deprecation Warning

**User Story:** As a Lambda function developer still running Node.js 20, I want a clear, one-time notice that my runtime is deprecated by this package, so that I have time to upgrade before support is removed.

#### Acceptance Criteria

1. THE system SHALL log a warning, via `DebugAndLog.warn()`, when the running Node.js major version is exactly 20
2. THE warning message SHALL read: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later."
3. THE warning SHALL be logged at most once per process
4. THE warning logic SHALL be implemented as data in a deprecation notice registry (see Requirement 4), not as a standalone conditional specific to version 20
5. THE warning SHALL NOT be logged for any Node major version other than 20 as part of this spec
6. Logging the warning SHALL have no effect on module initialization, exported values, or any other runtime behavior

### Requirement 4: Deprecation Notice Registry

**User Story:** As a maintainer, I want future Node-version deprecation notices to be a one-line data addition instead of new bespoke conditional logic, so that this planning cycle's decisions do not have to be rediscovered for the next deprecation.

#### Acceptance Criteria

1. THE system SHALL maintain an ordered, data-driven list of Node major version deprecation notices, each entry specifying at minimum a version number, an `active` flag, and a message string
2. THE registry SHALL be walked by a single helper function, invoked once at module load, that emits a warning for any `active` entry whose version matches the running Node major version
3. THE helper SHALL reuse the existing "at most once per process" guard pattern already present in `src/lib/tools/index.js` (the `_deprecationNoticed` Set), or an equivalent mechanism local to the registry's own module if placed elsewhere
4. WHEN a Node major version's support is later removed (a future spec, out of scope here), THE corresponding registry entry SHALL be updated to `active: false` rather than deleted, preserving an auditable history of past deprecations
5. THE registry's initial contents, as of this spec, SHALL contain exactly one entry: version 20, matching Requirement 3
6. THE registry and its helper SHALL be documented with a code comment explaining the `active: false`-rather-than-delete convention and referencing the runbook (Requirement 9) as the source of future entries

### Requirement 5: Node.js Version Floor Enforcement

**User Story:** As a maintainer, I want the existing hard version-floor check to reflect the current support policy and stop citing stale version numbers, so that anyone reading a startup failure gets accurate guidance.

#### Acceptance Criteria

1. THE hard `process.exit(1)` floor check in `src/lib/tools/vars.js` SHALL trigger when the running Node.js major version is less than 20
2. THE floor check's error message SHALL be updated to reflect the current minimum (20) and SHALL NOT reference the prior stale text ("16 required, 18 preferred")
3. THE floor check SHALL NOT trigger for Node.js major version 20 itself; version 20 SHALL continue to run normally and receive only the Requirement 3 warning
4. THE floor check SHALL continue to execute at module load time, before any other package code runs, consistent with its current placement
5. THE floor check's behavior for Node.js major versions 22, 24, and 26 SHALL be unchanged (no exit, no warning)

### Requirement 6: `engines.node` and Documentation Reconciliation

**User Story:** As a developer evaluating this package, I want a single, accurate statement of the minimum supported Node.js version, so that I am not shown conflicting numbers in different files.

#### Acceptance Criteria

1. THE `engines.node` field in `package.json` SHALL be updated from `>=20.0.0` to `>=22.0.0`
2. THE `README.md` "Requirements" section SHALL state a single consistent minimum Node.js version matching `engines.node`, resolving the existing inconsistency between its two current statements (`>=22.0.0` and `>=20.0.0`)
3. THE `engines.node` bump SHALL be understood as advisory (per npm's default behavior) and SHALL NOT cause `npm install` to fail on Node 20; it SHALL at most produce an install-time notice
4. THIS reconciliation SHALL NOT be interpreted as removing Node 20 support in this release; Requirement 3's warning and Requirement 2's CI leg remain the operative statement that Node 20 still runs

### Requirement 7: CHANGELOG and Documentation Updates

**User Story:** As a consumer of this package, I want the CHANGELOG and documentation to clearly state what changed regarding Node.js version support, so that I can plan my own upgrade timeline.

#### Acceptance Criteria

1. THE `CHANGELOG.md` SHALL gain a new entry under the current unreleased version section for this release
2. THE CHANGELOG entry SHALL record Node.js 26 support under `Added`
3. THE CHANGELOG entry SHALL record the Node.js 20 deprecation under `Deprecated`, using the plain "deprecated, no fixed sunset date" format already established by this project's own precedent (e.g., the v1.3.16 `AppConfig._initParameters()` entry), and SHALL NOT use the CloudFormation-template 24-month-sunset format
4. THE CHANGELOG entry SHALL reference this spec directory
5. Documentation and example CloudFormation templates referencing `nodejs24.x` (e.g., `docs/00-example-implementation/example-template-lambda-function.yml`, `docs/features/tools/*.md`, `docs/lambda-optimization/README.md`) SHALL remain unchanged as the primary example; a short note MAY be added stating that Node.js 26 is available on Lambda as a public preview runtime, without changing the example default
6. THE CHANGELOG SHALL note that the changelog-convention steering document contains a reference to CloudFormation-specific 24-month-sunset language that should be reviewed for applicability to npm package releases as a follow-up item (tracked for Phase 2 / v1.4.0 planning, not resolved in this spec)

### Requirement 8: Backwards Compatibility

**User Story:** As an existing user of @63klabs/cache-data, I want this release to change nothing about my application's behavior on any currently-supported Node.js version, so that upgrading is risk-free.

#### Acceptance Criteria

1. THE public signatures of all currently exported classes, functions, and constants SHALL remain unchanged
2. THE package SHALL continue to run without modification on Node.js versions 20, 22, and 24
3. THE only new user-visible runtime effect SHALL be the one-time warning defined in Requirement 3, which SHALL only appear when running on Node.js major version 20
4. No default behavior, return value, or error type SHALL change for any existing public API as a result of this spec

### Requirement 9: `cache-data-node-support` Steering Runbook

**User Story:** As a maintainer, I want a manually-triggered steering document that checks AWS's current Node.js Lambda runtime support and tells me exactly what to do next, so that I do not have to re-derive EOL dates, GA status, and response policy from scratch on every future runtime lifecycle event.

#### Acceptance Criteria

1. THE system SHALL create `.kiro/steering/cache-data-node-support.md` with `inclusion: manual` front matter and a `description` field, following the pattern established by `automation-assign-github-issues.md` and `automation-check-dependency-updates.md`
2. THE runbook SHALL NOT be auto-included in any session; it SHALL only take effect when explicitly invoked
3. THE runbook SHALL contain a support matrix table with, at minimum, columns for runtime identifier, Node major version, Package Policy, AWS Lambda Status, upstream Node EOL date, Lambda deprecation date, Lambda block-create date, Lambda block-update date, notes, and a last-checked date
4. THE support matrix SHALL be seeded with the four runtimes researched during this spec's planning (`nodejs20.x` through `nodejs26.x`) and their researched values as of this spec's planning date
5. THE support matrix SHALL keep Package Policy and AWS Lambda Status as distinct columns, reflecting that this repository's own support stance may intentionally lag AWS's published timeline
6. THE runbook SHALL contain a standing note documenting Node.js's release cadence (one major release per year as of the v26 line, released in April, promoted to LTS in October), so that cadence does not need to be re-researched on future runs
7. THE runbook SHALL define a procedure that, when run: (a) fetches the current AWS Lambda supported-runtimes table, preferring the AWS documentation MCP tools with `web_fetch` as fallback, using web search only to backfill upstream Node.js EOL/LTS dates for a runtime not yet in the matrix; (b) diffs the fetched data against the stored matrix; (c) refreshes every row's AWS-sourced columns and last-checked date regardless of whether a trigger fired; (d) evaluates trigger conditions per Requirement 10; (e) reports the diff, any triggers fired, and any recommended follow-up spec names with rationale
8. THE runbook SHALL NOT create, modify, or execute any spec, code file, or CI configuration on its own; its output SHALL be a report only, for a human to act on
9. THE runbook SHALL be included as part of this spec's implementation task list, not split into a separate spec

### Requirement 10: Runbook Trigger Conditions

**User Story:** As a maintainer, I want the runbook's triggers to be exact and unambiguous, so that the same inputs always produce the same recommendation regardless of who or what runs it.

#### Acceptance Criteria

1. WHEN a `nodejsNN.x` runtime appears in AWS's live data with no corresponding row in the stored matrix, THE runbook SHALL report a "new version detected" trigger for that runtime
2. WHEN a runtime already in the matrix shows AWS Lambda Status changing from `Preview` to `GA`, THE runbook SHALL report a "version reached GA" trigger for that runtime
3. WHEN a runtime's Package Policy is `Supported` AND the earlier of (upstream Node EOL date, Lambda deprecation date) falls within 6 months of the date the runbook is run, THE runbook SHALL report an "EOL within 6 months" trigger for that runtime
4. WHEN a runtime's Package Policy is `Supported` or `Deprecated (warn)` AND the date the runbook is run is past that runtime's Lambda block-update date, THE runbook SHALL report an "EOL passed" trigger for that runtime
5. FOR a "new version detected" trigger where the runtime's AWS Lambda Status is `Preview`, THE runbook SHALL recommend recording the runtime in the matrix only, with no follow-up spec
6. FOR a "new version detected" or "version reached GA" trigger where status is `GA`, THE runbook SHALL recommend a PATCH-level spec named following the pattern `{current-version}-node-{NN}-support`
7. FOR an "EOL within 6 months" trigger, THE runbook SHALL recommend a PATCH-level spec named following the pattern `{current-version}-node-{NN}-deprecation`
8. FOR an "EOL passed" trigger, THE runbook SHALL recommend a MINOR-level spec named following the pattern `{next-minor}-node-{NN}-removal`
9. EACH recommended spec name SHALL be accompanied by a one-paragraph rationale referencing the corresponding pattern established by this spec (deprecation-notice registry data addition, CI matrix change, `engines.node`/floor policy, or removal sweep, as applicable)

## Out of Scope

- Removal of Node.js 20 support (deferred to a future v1.4.0 spec, gated on AWS Lambda `nodejs26.x` reaching GA)
- Raising the hard floor to `<22` (a v1.4.0 change)
- Making Node.js 26 the default example runtime or coverage leg (deferred until Lambda's `nodejs26.x` reaches GA)
- Any change to the `changelog-convention.md` steering document itself (noted as a follow-up per Requirement 7.6, not executed here)
- Any Lambda-runtime-specific code path that behaves differently per Node major version (no evidence any is needed)
