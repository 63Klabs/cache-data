# Implementation Plan: Remove Node 20 Support

Each source change is paired with its coupled test inversion in the same task, so the suite is never left asserting contradictory behavior (per design.md "Testing Strategy"). Run `npm test` only on a supported runtime (Node 22 or 24). Child-process tests use `execFile` with array args and explicit timeouts; never invoke `npm test` from within a test.

- [x] 1. Raise the hard runtime floor to Node 22 and invert its coupled tests
  - In `src/lib/tools/vars.js`, change the predicate `nodeVerMajor < 20` to `nodeVerMajor < 22`.
  - Replace the `console.error` message with exactly: `Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.` (preserve the `${nodeVer}` interpolation; leave `process.exit(1)` unchanged).
  - Rewrite the `>!` comment block above the floor to state the floor was raised to `< 22` in the v1.4.0 Node 20 removal spec (no longer a future action), and remove the "Node 20 only warns" sentence.
  - Invert T1 `test/config/property/node-support-hard-floor-property-tests.jest.mjs`: set `NODE_MAJOR_FLOOR = 22`; derived expectation becomes `major <= 21`; boundaries `19->true, 20->true, 21->true, 22->false`; range cases become "0..21 exit / 22..100 no-exit"; supported-majors case asserts no exit for `[22, 24, 26]` and adds explicit `floorWouldExit(20) === true` and `floorWouldExit(21) === true`; update the header comment to this spec and Requirement 1.
  - Invert T2 `test/config/integration/node-support-floor-exit-integration-tests.jest.mjs`: set `NODE_MAJOR_FLOOR = 22`; update `buildFloorMessage` to the new message text; update the source-drift guard to require `nodeVerMajor < 22` and the new exact message template (and NOT the old `< 20` / old message); update the in-process spy so the supported list is `22.0.0`, `24.1.0`, `26.0.0` and `20.11.0` now hits the floor; update the subprocess `childScript` and supported-case script to the `< 22` predicate and new message (keep the supported sample at `22.0.0`); update header and describe text.
  - Verify: `npm test -- test/config/property/node-support-hard-floor-property-tests.jest.mjs test/config/integration/node-support-floor-exit-integration-tests.jest.mjs` passes on Node 22+.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Retire the Node 20 deprecation notice and invert its coupled tests
  - In `src/lib/tools/index.js`, change the Node 20 `NODE_DEPRECATION_NOTICES` entry's `active: true` to `active: false`; keep `version: 20` and the `message` text byte-for-byte unchanged.
  - Update the entry's trailing comment from "flips to false in the v1.4.0 removal spec, not deleted" to state the flip has been made (e.g. "set inactive in the v1.4.0 removal spec; retained for audit history, not deleted").
  - Do not add any entry, change array ordering, change the `checkNodeDeprecationNotices` walker, or alter the documenting comment block that references the runbook and explains the `active:false`-rather-than-delete convention. Preserve the phrase matched by `/active:\s*false\s+rather than delet/i`, the word `auditable`, and the `.kiro/steering/cache-data-node-support.md` path.
  - Invert T3 `test/config/property/node-support-initial-registry-property-tests.jest.mjs`: set the seeded version-20 entry to `active: false`; change the property from "warn iff major === 20" to "never warns for any major"; the explicit 20 case asserts zero warn calls; keep the "no warning for 22/24/26" case; update header "Property 4: Only Node 20 warns" to "Node 20 no longer warns after v1.4.0 removal".
  - Invert T4 `test/config/node-support-registry-structure-tests.jest.mjs`: the version-20 entry block must now match `active: false` and must NOT match `active: true`; keep "exactly one entry", "version 20", "carries the exact message", and "does not seed any major other than 20"; keep the Requirement 4.6 documenting-comment assertions; update Req references to this spec.
  - Verify: `npm test -- test/config/property/node-support-initial-registry-property-tests.jest.mjs test/config/node-support-registry-structure-tests.jest.mjs` passes.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Reconcile the module-load and once-per-process integration tests
  - Invert T5 `test/config/integration/node-support-module-load-integration-tests.jest.mjs`: fold the Node 20 branch into the "below the floor -> non-zero exit, floor message" path (Node 20 no longer exits 0 and no longer emits the deprecation warning); leave the 22/24/26 branch unchanged (exit 0, no warning, `MODULE_LOAD_OK`); change the generic `major > 20` branch to `major >= 22` (so 21 is treated as below-floor); keep `DEPRECATION_MESSAGE_NODE_20` only as a negative assertion (never present for any running major); update header/Req references.
  - Review T6 `test/config/property/node-support-deprecation-once-property-tests.jest.mjs`: read the file in full; if any case seeds an ACTIVE version-20 entry and asserts a warn, update it to reflect the entry now being inactive (zero warns for 20); do NOT weaken the once-per-process invariant; update header/comment references only where needed.
  - Verify: `npm test -- test/config/integration/node-support-module-load-integration-tests.jest.mjs test/config/property/node-support-deprecation-once-property-tests.jest.mjs` passes on Node 22+.
  - _Requirements: 2.4, 6.2, 6.5, 6.6_

- [x] 4. Remove Node 20 from the CI test matrix
  - In `.github/workflows/test.yml`, change `node-version: ['20', '22', '24', '26']` to `node-version: ['22', '24', '26']`.
  - Update the two explanatory comment blocks that enumerate the required legs to reference `'22'` and `'24'` (drop `'20'`).
  - Leave `continue-on-error: ${{ matrix.node-version == '26' }}`, `fail-fast: false`, and the `== '24'` / `!= '24'` coverage conditionals unchanged. Do not touch `.github/workflows/npm-publish.yml`.
  - Verify: `grep -n "'20'" .github/workflows/test.yml` returns nothing; the YAML still lists `'22'`, `'24'`, `'26'`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Sync the runbook support matrix row for Node 20
  - In `.kiro/steering/cache-data-node-support.md` Part A, change only the `nodejs20.x` row's Package Policy cell to `Removed (v1.4.0)`; optionally update that row's Notes and Last Checked cells.
  - Do NOT change the AWS-sourced columns of that row, any other row, or any other section (Part B, column definitions, trigger table).
  - Verify: `git diff .kiro/steering/cache-data-node-support.md` shows edits confined to the `nodejs20.x` row.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Make the documentation review script read the engines floor dynamically
  - In `scripts/review-documentation-files.mjs`, read `engines.node` from `package.json` at runtime (resolve path relative to the script, parse JSON) and use that value in the note string in place of the hardcoded `>=20.0.0`, so it reads e.g. `References Node.js ${major}.x, but package.json requires ${enginesNode}`.
  - If `package.json` cannot be read or `engines.node` is missing/unparseable, fail loudly (throw or non-zero exit with a clear message) rather than emit an incorrect or empty version string.
  - Preserve all other behavior of the script.
  - Verify: run the script and confirm it reports the `>=22.0.0` floor sourced from `package.json` and still runs cleanly.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Sweep for any remaining pinned Node 20 references in tests
  - Grep `test/` for `nodeVerMajor < 20`, for the old floor fragment `Please install at least Node.js 20`, and for `active: true` seeds tied to version 20.
  - Invert any hit that asserts old behavior; leave or strengthen hits that are negative assertions (old behavior must NOT appear).
  - Confirm `test/config/node-support-engines-readme-structure-tests.jest.mjs` needs no change (it is the regression guard for the already-reconciled advisory floor).
  - Verify: the three greps return only negative-assertion or audit-history matches, no live assertion of old behavior.
  - _Requirements: 6.3, 6.5, 8.2_

- [x] 8. Full-suite verification on supported runtimes
  - Run `npm test` on Node 22 and on Node 24; both must exit 0.
  - Grep `src/` and `test/` to confirm no remaining `nodeVerMajor < 20` and no `Please install at least Node.js 20`.
  - Confirm no required CI leg references Node `'20'`.
  - Clean up any temporary files created during verification.
  - _Requirements: 1.1, 6.1, 6.4, 8.5_

- [x] 9. Update the changelog
  - Under the existing `## v1.4.0 (unreleased)` section of `CHANGELOG.md` only, add a `Removed` entry (Node.js 20 support and CI testing removed) and a `Changed` entry (hard runtime floor raised to Node.js 22; Node 20 and 21 now refuse to run with a clear message).
  - Reference `[Spec: 1-4-0-remove-node-20-support](.kiro/specs/1-4-0-remove-node-20-support/)`.
  - Add to the appropriate existing category blocks without modifying or destructively reordering existing v1.4.0 entries. Do not add a `Breaking Changes` entry.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
