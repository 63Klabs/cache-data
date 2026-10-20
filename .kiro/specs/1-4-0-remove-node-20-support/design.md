# Design: Remove Node 20 Support

## Overview

This design completes the Node.js 20 removal deferred from v1.3.17 to v1.4.0. The change set is small and almost entirely mechanical, but it is tightly coupled to a web of v1.3.17 tests that deliberately pin the *old* Node 20 behavior (hard floor `< 20`, Node 20 warns, registry entry `active: true`). Those tests carry source-drift guards (they `readFileSync` `vars.js` / `index.js` and assert exact strings) and in-file mirror constants. Changing the source without inverting those tests in lockstep will break the suite. The core difficulty of this spec is therefore not the source edit; it is enumerating and inverting every pinned test so the suite asserts the post-removal behavior.

This design maps each source change to the exact tests it breaks and specifies the new assertion each test must make. It follows the removal-sweep pattern in `.kiro/steering/cache-data-node-support.md`: raise the hard floor, flip the registry entry to `active: false` (never delete), drop the retired CI leg, and sync the runbook matrix.

All decisions trace to requirements.md (Requirements 1-8) and the PLAN.md answers (Q1=A proceed now; Q2 reject `< 22`; Q3 exact message; Q4=A runbook row sync only; Q5=A dynamic floor in the script; Q6 not breaking; Q7 scope Node 20 only).

### Verified current state

Read from source, not assumed:

- `src/lib/tools/vars.js` — hard floor is `if (nodeVerMajor < 20)`; message is `Node.js version 20 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install at least Node.js 20 (22 or later recommended) in your environment.`; a `>!` comment block says the floor "rises to `< 22` in the v1.4.0 removal spec". `nodeVerMajor` comes from `AWS.NODE_VER_MAJOR`, derived from `process.versions.node` at module load.
- `src/lib/tools/index.js` — `NODE_DEPRECATION_NOTICES` holds exactly one entry `{ version: 20, active: true, message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later." }`, with a trailing comment `// flips to false in the v1.4.0 removal spec, not deleted`. `checkNodeDeprecationNotices()` skips `!notice.active`, so flipping `active` to `false` silences the Node 20 warning with no logic change.
- `.github/workflows/test.yml` — matrix `node-version: ['20', '22', '24', '26']`; `continue-on-error` only for `'26'`; `fail-fast: false`; coverage conditionals keyed on `matrix.node-version == '24'` / `!= '24'`.
- `.kiro/steering/cache-data-node-support.md` — Part A `nodejs20.x` row Package Policy = `Deprecated (warn), as of v1.3.17`.
- `scripts/review-documentation-files.mjs` — note string hardcodes `References Node.js ${major}.x, but package.json requires >=20.0.0`.
- `package.json` `engines.node` = `">=22.0.0"` and README minimums = `>=22.0.0` — already reconciled in v1.3.17; NOT changed here.

## Architecture

Three independent "minimum Node version" mechanisms exist and are intentionally decoupled; this spec moves two of them and leaves the third as-is:

1. **Advisory floor** — `package.json` `engines.node` (`>=22.0.0`). npm warns, does not block. Already at 22; unchanged.
2. **Hard floor** — the `process.exit(1)` guard in `src/lib/tools/vars.js`. The only mechanism that actually refuses to run. Moves from `< 20` to `< 22` (Change 1).
3. **Deprecation warning** — the `NODE_DEPRECATION_NOTICES` registry in `src/lib/tools/index.js`, walked once per process by `checkNodeDeprecationNotices()`. The Node 20 entry moves from `active: true` to `active: false` (Change 2).

After this spec the three are consistent: advisory 22, hard floor 22, and no active warning for 20 (a Node 20 process now exits at the hard floor before any warning path is reachable). Surrounding this core are three satellite artifacts kept in sync: the CI matrix (Change 3), the report-only runbook matrix row (Change 4), and a documentation-review script note (Change 5), plus the changelog (Change 6). No module boundaries, exports, or call graphs change; the registry and its walker remain module-internal to `tools/index.js`.

## Components and Interfaces

### Change 1 - Hard floor (Requirement 1)

File: `src/lib/tools/vars.js`.

- Replace the predicate `nodeVerMajor < 20` with `nodeVerMajor < 22`.
- Replace the `console.error` message with exactly: `Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.` (template literal preserving the `${nodeVer}` interpolation).
- Rewrite the `>!` comment block so it states the floor was raised to `< 22` in the v1.4.0 Node 20 removal spec and no longer describes the raise as a future action. Remove the sentence about Node 20 only warning (no longer true once the floor is 22).
- `process.exit(1)` and the surrounding structure are unchanged.

### Change 2 - Deprecation registry (Requirement 2)

File: `src/lib/tools/index.js`.

- Change the Node 20 entry's `active: true` to `active: false`.
- Keep `version: 20` and the `message` text byte-for-byte unchanged (audit history; it is the exact text v1.3.17 emitted).
- Update the entry's trailing comment from "flips to false in the v1.4.0 removal spec, not deleted" to state the flip has been made in v1.4.0 (e.g. "set inactive in the v1.4.0 removal spec; retained for audit history, not deleted").
- Do not add any new entry. Do not change array ordering, the walker `checkNodeDeprecationNotices`, the once-per-process guard, or the documenting comment block that references the runbook and explains the `active:false`-rather-than-delete convention (the registry-structure test still asserts that comment exists).

### Change 3 - CI matrix (Requirement 3)

File: `.github/workflows/test.yml`.

- Change `node-version: ['20', '22', '24', '26']` to `node-version: ['22', '24', '26']`.
- Update the two explanatory comment blocks that currently enumerate "'20', '22', and '24' legs remain required" / "the required '20'/'22'/'24' legs" so they reference `'22'` and `'24'` as the required legs (drop `'20'`).
- Leave `continue-on-error: ${{ matrix.node-version == '26' }}`, `fail-fast: false`, and the `== '24'` / `!= '24'` coverage conditionals unchanged.
- Do not touch `.github/workflows/npm-publish.yml`.

### Change 4 - Runbook matrix sync (Requirement 4)

File: `.kiro/steering/cache-data-node-support.md`, Part A, `nodejs20.x` row only.

- Change the Package Policy cell to `Removed (v1.4.0)`.
- Optionally update the Notes cell to note removal in v1.4.0 and the Last Checked cell to the implementation date.
- Do NOT change the AWS-sourced columns (AWS Lambda Status, Upstream Node EOL, Lambda Deprecation Date, Lambda Block-Create, Lambda Block-Update) of this row, and do NOT change any other row or any other section (Part B, column definitions, trigger table). This is a bookkeeping sync, not a runbook report run (Q4 = Option A).

### Change 5 - Documentation review script (Requirement 5)

File: `scripts/review-documentation-files.mjs`.

- Read `engines.node` from `package.json` at runtime (resolve the path relative to the script, parse JSON) and use that value in the note string in place of the hardcoded `>=20.0.0`, so the note reads `References Node.js ${major}.x, but package.json requires ${enginesNode}` (or equivalent) and tracks `package.json` automatically.
- If `package.json` cannot be read or `engines.node` is missing/unparseable, fail loudly (throw or exit non-zero with a clear message) rather than emitting an incorrect or empty version string (Requirement 5.4).
- Preserve all other behavior of the script (it still flags docs referencing specific `Node.js NN.x` versions).

### Change 6 - Changelog (Requirement 7)

File: `CHANGELOG.md`, under the existing `## v1.4.0 (unreleased)` section only.

- Add a `Removed` entry: Node.js 20 support and CI testing removed.
- Add a `Changed` entry: hard runtime floor raised to Node.js 22 (Node 20 and 21 now refuse to run with a clear message).
- Reference `[Spec: 1-4-0-remove-node-20-support](.kiro/specs/1-4-0-remove-node-20-support/)`.
- Add to the appropriate existing category blocks without modifying or destructively reordering existing v1.4.0 entries. Do not add a `Breaking Changes` entry (Q6).

## Data Models

The one structured datum this spec touches is the deprecation-notice registry entry in `src/lib/tools/index.js`. Its shape is unchanged; only the `active` field flips.

Entry shape (unchanged):

```
{ version: number, active: boolean, message: string }
```

Node 20 entry, before -> after:

```
{ version: 20, active: true,  message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later." }
{ version: 20, active: false, message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later." }
```

The array stays a single-entry, append-only, ordered list. No field is added, renamed, or removed; the `message` is retained verbatim for audit history. No other data model, schema, config shape, or exported constant changes.

## Error Handling

- **Hard floor (vars.js)**: a Node major below 22 results in `console.error(<new message>)` followed by `process.exit(1)` at module load — fail-fast, before any other initialization. A major of 22+ takes no action. This is existing behavior with a raised threshold and new message, not a new error path.
- **Documentation review script (Change 5)**: reading `engines.node` from `package.json` introduces one new failure mode. If `package.json` is unreadable or `engines.node` is missing/unparseable, the script must fail loudly (throw or non-zero exit with a clear message) rather than emit an incorrect or empty version string (Requirement 5.4). This keeps a drifted or broken manifest from silently producing a misleading note.
- No new runtime error handling is introduced in the package's request/cache/endpoint paths; this spec does not touch them.

## Testing Strategy

Every item below asserts the OLD Node 20 behavior today and must be inverted. All are under `test/config/`. Child-process tests must keep using `execFile` with array args and explicit timeouts per the secure-coding and test-execution-monitoring steering; none may invoke `npm test`.

### T1 - `test/config/property/node-support-hard-floor-property-tests.jest.mjs`

Pure-predicate mirror. Currently `NODE_MAJOR_FLOOR = 20` and asserts exit iff `major <= 19`, with boundary assertions `floorWouldExit(20) === false` and the "supported majors 20, 22, 24, 26" case.

- Change `NODE_MAJOR_FLOOR` to `22`.
- Invert the derived expectation to `major <= 21`.
- Boundary cases become: `19 -> true`, `20 -> true`, `21 -> true`, `22 -> false`.
- The supported-majors case drops 20 and asserts no exit for `[22, 24, 26]`; add explicit `floorWouldExit(20) === true` and `floorWouldExit(21) === true`.
- Update the "0..19 exit / 20..100 no-exit" ranges to "0..21 exit / 22..100 no-exit".
- Update the header comment (currently cites "Hard floor exits below 20 and only below 20" and Req 5.x of the 1-3-17 spec) to the new floor and this spec's Requirement 1.

### T2 - `test/config/integration/node-support-floor-exit-integration-tests.jest.mjs`

Exit-wiring integration test with three parts: a SOURCE-DRIFT GUARD that `readFileSync`s `vars.js` and asserts it contains `nodeVerMajor < 20` and the exact old message; an in-process `process.exit`/`console.error` spy; and a subprocess exit-code test. The `buildFloorMessage` helper and the embedded `childScript` both hardcode the old message and the `< 20` predicate.

- `NODE_MAJOR_FLOOR` -> `22`.
- `buildFloorMessage` -> the new message text (Requirement 1.3).
- Source-drift guard -> assert `vars.js` contains `nodeVerMajor < 22` and the new exact message template; it must NOT still require the old `< 20` string or old message.
- In-process spy: a sub-floor sample such as `18.19.1` still exits; update the "does NOT exit for supported major (>= 20)" case to use `>= 22` and to assert that `20.11.0` now DOES hit the floor (move it out of the supported list; the supported list becomes `22.0.0`, `24.1.0`, `26.0.0`).
- Subprocess `childScript` and the supported-case script: update the embedded predicate to `< 22` and the embedded message to the new text; keep the supported sample at `22.0.0`.
- Update the header comment and the "Property 5 ... below 20" describe text to the new floor and this spec.

### T3 - `test/config/property/node-support-initial-registry-property-tests.jest.mjs`

Mirrors the registry walker against a copy of the registry seeded `{ version: 20, active: true, ... }` and asserts "warn iff running major === 20".

- Change the seeded `INITIAL_NODE_DEPRECATION_NOTICES` copy to `active: false` for the version-20 entry so the mirror matches the new source of truth.
- Invert the property: with the entry inactive, the walker warns for NO major, including 20. Replace "warn iff major === 20" with "never warns for any major" and update the explicit 20 case to assert zero warn calls.
- Keep (or restate) the "no warning for 22/24/26" case; the message constant may remain as documentation of the retained (now inactive) text.
- Update the header "Property 4: Only Node 20 warns" to reflect "Node 20 no longer warns after v1.4.0 removal".

### T4 - `test/config/node-support-registry-structure-tests.jest.mjs`

Structural guard that `readFileSync`s `index.js` and asserts the single entry is `version: 20`, `active: true`, and NOT `active: false`, plus the documenting-comment assertions.

- Invert the active assertions: the version-20 entry block must now match `active: false` and must NOT match `active: true`.
- Keep "exactly one entry", "version 20", "carries the exact Req 3.2 message", and "does not seed any major other than 20" (all still true — the entry is retained).
- Keep the Requirement 4.6 documenting-comment assertions (runbook reference, `active:false`-rather-than-delete convention text, "auditable" rationale, comment placed before the declaration). The source comment edit in Change 2 must preserve the phrase the test matches (`/active:\s*false\s+rather than delet/i`) and the `auditable` mention and the runbook path.
- Update header/Req references to this spec.

### T5 - `test/config/integration/node-support-module-load-integration-tests.jest.mjs`

Module-load integration ("Property 6"): loads the package in a child on the running major and branches on `RUNNING_MAJOR`. Today: if running major is 20, expect exit 0 AND the exact Node 20 deprecation warning on stderr; if 22/24/26, expect exit 0 and NO warning; below floor, expect non-zero.

- The Node 20 branch must change: under the new floor, a Node 20 runtime now hits the hard floor and exits non-zero with the new floor message; it no longer exits 0 and no longer emits the deprecation warning. Fold Node 20 into the "below the floor -> non-zero exit, floor message" path.
- The 22/24/26 branch is unchanged (exit 0, no warning, `MODULE_LOAD_OK`).
- The `major > 20` generic branch should become `major >= 22` (or be reconciled so 21 is treated as below-floor).
- `DEPRECATION_MESSAGE_NODE_20` may remain as a constant used in a negative assertion (never appears for supported majors); it must no longer be asserted as present for any running major.
- CI relevance: because the test matrix no longer includes `'20'`, the Node 20 branch will not execute in CI, but the test must still be internally correct for the case it describes. Update header/Req references.

### T6 - `test/config/property/node-support-deprecation-once-property-tests.jest.mjs`

"At most once per process" property. Mirrors the walker and drives it against the real `DebugAndLog.warn`, anchored with `NODE_20_MESSAGE`.

- The once-per-process invariant is intact and should still pass. Review whether any case seeds an ACTIVE version-20 entry and asserts a warn; if so, update it to reflect the entry now being inactive (zero warns for 20). If the test parameterizes activeness generically, it may need only a header/comment update. The agent must read this file in full and change only what asserts an active Node 20 warn; do not weaken the once-per-process assertion.

### T7 - sweep for any other pinned references

Before finishing, grep `test/` for the old floor string `nodeVerMajor < 20`, the old floor message fragment `Please install at least Node.js 20`, and `active: true` seeds tied to version 20, to catch any assertion not listed above. Any hit that asserts old behavior must be inverted; any hit that is a negative assertion (old behavior must NOT appear) is fine to keep or strengthen.

Note: `test/config/node-support-engines-readme-structure-tests.jest.mjs` already asserts `engines.node === ">=22.0.0"` and no residual `>=20.0.0` in the README. It needs NO change and serves as a regression guard that this spec does not touch the already-reconciled advisory floor.

## Correctness Properties

### Property 1: Floor monotonic

For every integer Node major `m`, the hard floor exits if and only if `m < 22`. Verified by T1 across majors 0..100 with boundary cases 19/20/21/22.

**Validates: Requirements 1.1, 1.2, 1.4**

### Property 2: Message exactness

The floor's `console.error` argument equals the Requirement 1.3 string with `${nodeVer}` substituted. Verified by T2 (in-process spy, subprocess stderr, source-drift guard).

**Validates: Requirements 1.3, 1.6**

### Property 3: No Node 20 warning

Under the updated registry, `checkNodeDeprecationNotices(m)` emits nothing for every `m`, including 20. Verified by T3 and the inverted T4 structural guard.

**Validates: Requirements 2.4**

### Property 4: Audit retention

The Node 20 registry entry still exists with `version: 20` and its original message; only `active` changed. Verified by T4.

**Validates: Requirements 2.1, 2.2**

### Property 5: Once-per-process preserved

The warning guard still fires at most once per version per process. Verified by T6.

**Validates: Requirements 6.6**

### Property 6: Export surface unchanged

No change to exported classes, functions, or constants of `tools/index.js`; the registry and walker remain module-internal. Verified by the existing export-surface property test (`test/config/property/node-support-export-surface-property-tests.jest.mjs`) continuing to pass unchanged.

**Validates: Requirements 8.5**

### Property 7: Scope containment

`package.json` `engines.node`, README minimums, `package-lock.json`, example Lambda runtimes, and the Node 26 CI leg status are all unchanged. Verified by the regression guard (`node-support-engines-readme-structure-tests.jest.mjs`) and by inspection of the diff.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Verification steps

1. Make source Changes 1-5 and invert tests T1-T7 in the same change set so the suite is never left asserting contradictory behavior.
2. Run the full Jest suite on Node 22 and on Node 24 locally (`npm test`); both must exit 0. The runner is already on a supported major, so T5's "running major" branch exercises the 22/24 path.
3. Grep `test/` and `src/` to confirm no remaining `nodeVerMajor < 20`, no `Please install at least Node.js 20`, and no `active: true` tied to version 20.
4. Grep the required CI legs to confirm no `'20'` remains in `.github/workflows/test.yml`.
5. Run `scripts/review-documentation-files.mjs` to confirm it reports the `>=22.0.0` floor sourced from `package.json` and still runs cleanly.
6. Add the changelog entries last (Change 6).

## Out of scope

Unchanged by this spec: `package.json` `engines.node`; README minimums; `package-lock.json` transitive `engines`; example Lambda runtimes (`nodejs24.x` stays); Node 26 status and its `continue-on-error` CI leg; `.github/workflows/npm-publish.yml`; the lazy-loader and timezone v1.4.0 specs; the public API surface.
