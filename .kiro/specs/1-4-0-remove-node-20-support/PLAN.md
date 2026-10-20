# Remove Node 20 Support

v1.3.17 implemented a deprecation notice for Node 20 and set some standards for removing support and updating documentation and steering documents for changeovers of this type.

Updating example documentation for template Lambda Node Runtimes to `nodejs26.x` or requiring 26 is out of scope as it is not yet generally available for production use on AWS Lambda.

v1.3.17 should have fully ensured 26 is compatible with code existing code, so we do not need to implement 26.

Please generate a plan to move forward.

---

## 1. Goal

Complete the Node.js 20 removal that v1.3.17 deliberately deferred to v1.4.0: stop testing and warning-for Node 20, raise the hard runtime floor to Node 22, and bring the deprecation registry, CI matrix, and support-matrix steering doc into a consistent "Node 20 removed" state — without adding Node 26 as a requirement or changing example Lambda runtimes.

This is a MINOR release (`1.4.0`) following the removal pattern defined in `.kiro/steering/cache-data-node-support.md` (the removal-sweep: flip the registry entry to `active: false`, raise the hard floor in `src/lib/tools/vars.js`, drop the retired CI leg).

## 2. Current state (verified)

I read the actual files rather than trusting the summary. The removal is **partially done already** — the version and the advisory floor were reconciled in v1.3.17, but the hard floor, the registry, the CI matrix, and the steering matrix still carry Node 20.

| Artifact | Current state | Needs change? |
|---|---|---|
| `package.json` `version` | `1.4.0` | No — already the target version. |
| `package.json` `engines.node` | `">=22.0.0"` | No — already reconciled in v1.3.17. |
| `README.md` "Requirements" | `Node.js >=22.0.0` (both spots) + example note `>=22.0.0` | No — already reconciled in v1.3.17. The old `>=20.0.0` second spot is gone. |
| `src/lib/tools/vars.js` hard floor | `if (nodeVerMajor < 20)` with a "Node 20 required / 22 recommended" message; comment says "floor rises to `< 22` in the v1.4.0 removal spec" | **Yes** — raise to `< 22`, update message, update comment. |
| `src/lib/tools/index.js` `NODE_DEPRECATION_NOTICES` | Node 20 entry `active: true`; comment says "flips to false in the v1.4.0 removal spec, not deleted" | **Yes** — flip to `active: false` (keep the entry and message for audit history). |
| `.github/workflows/test.yml` matrix | `['20', '22', '24', '26']`; `'20'` is a required leg; `continue-on-error` only for `'26'` | **Yes** — drop the `'20'` leg. |
| `.kiro/steering/cache-data-node-support.md` Part A matrix | `nodejs20.x` row = `Deprecated (warn), as of v1.3.17` | **Yes (report-only doc)** — update Package Policy to reflect removal in v1.4.0. See Q4 on how/whether this spec edits a report-only runbook. |
| `CHANGELOG.md` `v1.4.0 (unreleased)` | Section exists with several unrelated 1.4.0 entries; no Node 20 removal entry yet | **Yes** — add `Removed` / `Changed` entries. |
| `scripts/review-documentation-files.mjs` | Flags docs referencing `Node.js NN.x` against `>=20.0.0` | **Maybe** — the hardcoded `>=20.0.0` note string is now stale (engines is `>=22`). See Q5. |
| `.github/workflows/npm-publish.yml` | Publishes on Node `'24'`; guard requires Node `>= 22.14.0` | No — unaffected by dropping the 20 test leg. |
| `package-lock.json` transitive `engines.node: >=20` entries | Third-party dependency metadata | No — these are dependencies' own constraints, not ours. Do not edit. |

### 2.1 The decoupling that makes this safe

Three different "minimums" exist and they are intentionally independent:

1. **Advisory floor** — `engines.node` (`>=22.0.0`). npm warns but does not block install. Already at 22.
2. **Hard floor** — `vars.js` `process.exit(1)`. This is the one that actually refuses to run. Still at 20.
3. **Deprecation warning** — the registry entry that logs once per process for a matching major. Still active for 20.

After this spec: advisory 22, hard floor 22, and the 20 warning retired (because 20 can no longer reach the warn path — the hard floor exits first). The registry entry stays in the file as `active: false` for audit history per Req 4.4 of the runbook.

## 3. Design options to iterate

### 3.1 Hard-floor behavior for Node 21 (odd, EOL, never on Lambda)

The floor is a `< N` major check. Options for the new floor value:

- **Option A — `< 22` (strict):** Node 20 **and** Node 21 are rejected. Node 21 is an odd release, already EOL upstream, and never existed as a Lambda runtime, so rejecting it is defensible and matches `engines.node: >=22`.
- **Option B — `< 21`:** rejects only 20, lets 21 run with no warning. Pointless — nobody runs 21 on Lambda, and it contradicts `engines`.
- **Recommendation: Option A.** It matches the advisory floor exactly (one mental model: "22 or later, period") and the runbook's "raise the hard floor" language. Message: require 22+, no "20 recommended" wording.

### 3.2 Registry entry: flip vs delete

- **Option A — flip `active: false`, keep entry + message (recommended).** This is exactly what Req 4.4 of the runbook and the in-file comment mandate: removal history and exact message text stay auditable. The `checkNodeDeprecationNotices` loop already skips `!notice.active`, so a flip is a one-field change with existing test coverage for the inactive path.
- **Option B — delete the entry.** Violates the append-only/audit rule. Rejected.
- **Recommendation: Option A.**

### 3.3 Does the Node 20 warning message need updating when flipped inactive?

Once `active: false`, the message never prints, so its text is now audit-only. Leave it verbatim (it already reads "no longer tested … upgrade to 22 or later") so the historical record matches what v1.3.17 actually emitted. No change.

### 3.4 CI matrix: drop vs keep-as-allowed-failure

- **Option A — drop the `'20'` leg entirely (recommended).** We no longer support or test 20; keeping it wastes a runner and implies support.
- **Option B — keep `'20'` as `continue-on-error`.** Misleading (signals "we still watch 20") and contradicts the "no longer tested" changelog language. Rejected.
- **Recommendation: Option A.** Resulting matrix: `['22', '24', '26']`. The `continue-on-error`/`fail-fast` comments that reference `'20'/'22'/'24' as required` need their wording updated to `'22'/'24'`. Coverage stays on `'24'`; the `if: matrix.node-version != '24'` / `== '24'` conditionals are unaffected.

### 3.5 Scope boundary for Node 26 (confirming the brief)

The brief says 26 stays out of scope: do **not** require 26, do **not** change example runtimes to `nodejs26.x`, do **not** promote the CI `'26'` leg out of `continue-on-error`. This spec only *removes* 20; it does not touch 26's status. Agreed and treated as a hard constraint. See Q1 on the gating tension.

### 3.6 Verification strategy

- Unit/behavior test: running major `< 22` triggers the hard-floor exit with the new message; major `>= 22` does not. The existing vars.js floor test (subprocess-isolated per the test-execution-monitoring steering) is the pattern — update its expectations.
- Registry test: there is already a property/unit test asserting "only Node 20 warns under the initial registry" (seen in `1-3-17-node-26-support/tasks.meta.json`, "Property 4"). After the flip, the correct assertion is "no active entry warns for 20" / "20 no longer warns". That test must be located and updated, not left asserting the old behavior.
- Full suite on Node 22 and 24 locally/CI must stay green.
- Confirm no remaining required CI leg references `'20'`.

## 4. Proposed task outline (for the eventual tasks.md)

1. Raise the hard floor in `src/lib/tools/vars.js` to `< 22`, rewrite the message (22+ required), and update the `>!` comment block to say the floor was raised in this spec.
2. Flip the Node 20 `NODE_DEPRECATION_NOTICES` entry to `active: false`; leave message and ordering intact; update the trailing comment.
3. Update the Node-20-warns test(s) to assert 20 no longer warns, and update the vars.js hard-floor test to expect rejection below 22.
4. Drop the `'20'` leg from `.github/workflows/test.yml` and fix the two explanatory comments to reference `'22'/'24'`.
5. Update the `cache-data-node-support.md` Part A matrix `nodejs20.x` row Package Policy to "Removed (v1.4.0)" (pending Q4).
6. Resolve the stale `>=20.0.0` string in `scripts/review-documentation-files.mjs` (pending Q5).
7. Add `CHANGELOG.md` entries under `v1.4.0 (unreleased)` (`Removed`: Node 20 support/testing; `Changed`: hard floor raised to 22). Reference this spec.
8. Run the full suite on Node 22 + 24; confirm green and no `'20'` references remain in required CI.

## 5. Out of scope

- Adding Node 26 as a requirement or default example runtime.
- Promoting the CI `'26'` leg to a required leg.
- Editing `package.json` `engines.node` or README minimums (already at 22).
- Editing `package-lock.json` transitive `engines` metadata.
- The lazy-loader and timezone items in `TODO.md` (separate v1.4.0 specs already scaffolded).

---

## 6. Clarifying questions (please answer before we write requirements.md)

### Q1. The GA gate vs. "remove now" (most important)

The v1.3.17 CHANGELOG states Node 20 removal is **"gated on AWS Lambda's `nodejs26.x` runtime reaching general availability."** But:
- The steering matrix (checked 2026-09-25) still lists `nodejs26.x` as **Preview**, not GA.
- Separately, the runbook's own trigger #5 ("EOL passed") fires on the Node 20 **Block-Update** date (third-party ~2026-09-30), which is now past as of today (2026-10-20), and recommends exactly this MINOR removal spec regardless of 26's status.

So two rules point in opposite directions. Options:

- **Option A (recommended):** Proceed with removal now, treating the Node 20 Block-Update date having passed (trigger #5) as the governing condition, and note in the spec that the original "26 GA" gate is superseded because 20 is now past Lambda's update-block. Rationale: the real-world forcing function (can't even update a Node 20 Lambda) has arrived; waiting on 26 GA to drop a runtime that AWS itself no longer lets you deploy is backwards.
- **Option B:** Hold removal until `nodejs26.x` reaches GA (honor the literal v1.3.17 gate). This likely means pausing this spec until the runbook's next run shows 26 as GA.
- **Option C:** Proceed, and first re-run the `cache-data-node-support.md` runbook to refresh the matrix with live AWS data (confirm 26 status and the real Node 20 Block-Update date) so the decision rests on fresh data rather than the 2026-09-25 snapshot.

My recommendation is **A**, optionally preceded by the **C** refresh if you want the matrix current before we commit. Which do you want? **Answer:** A

### Q2. Hard-floor value — confirm `< 22` (reject 20 and 21)?

Per §3.1 I recommend rejecting anything below 22 (so Node 21 is also refused). Confirm, or do you specifically want to let 21 through (Option B)? **Answer:** Confirmed, reject anything below 22

### Q3. Floor-breach message wording

Proposed new `vars.js` message:
> `Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.`

Good as-is, or do you want it to also name 24 as the recommended/LTS target? **Answer:** Good as-is

### Q4. May this spec edit the report-only runbook matrix?

`.kiro/steering/cache-data-node-support.md` is explicitly **report-only** ("NEVER creates, modifies, or executes any spec, code file, or CI configuration"), yet Part A is "edited in place on each run." Updating the `nodejs20.x` Package Policy to "Removed" is a factual sync with what this release does. Options:

- **Option A (recommended):** This spec updates **only** the `nodejs20.x` row's Package Policy column to `Removed (v1.4.0)` (and its Last Checked / Notes), as a bookkeeping sync — not a report run. Leave AWS-sourced columns untouched.
- **Option B:** Leave the runbook entirely alone and let the next runbook invocation refresh it. Keeps the report-only boundary pristine but leaves the matrix stating "Deprecated (warn)" for a release that removed 20.

Which boundary do you prefer? **Answer:** Option A

### Q5. The stale `>=20.0.0` note in `scripts/review-documentation-files.mjs`

That script hardcodes the note text ``References Node.js ${major}.x, but package.json requires >=20.0.0``, which is now wrong (engines is `>=22`). Options:

- **Option A (recommended):** Read the floor dynamically from `package.json` `engines.node` so the note can never drift again, and fix it as part of this spec.
- **Option B:** Just change the literal `>=20.0.0` to `>=22.0.0`.
- **Option C:** Out of scope for this spec; track separately.

Recommendation **A** (durable), but **B** is the minimal fix if you want to keep this spec tight. **Answer:** Option A

### Q6. Changelog categorization

I plan `Removed: Node.js 20 support/testing` plus `Changed: hard runtime floor raised to Node 22`. Is a `Breaking Changes` entry warranted? The hard floor change *is* a behavior change for anyone still launching on Node 20 (they now get `exit 1` instead of a warning), but Node 20 can no longer run on Lambda anyway. My read: **not a breaking change** in the semver sense for the supported platform, so `Removed` + `Changed` is right and a MINOR bump is appropriate. Confirm, or do you want it flagged under `Breaking Changes` with a migration note?

**Answer:** Not a breaking change. Confirmed

### Q7. Anything else in TODO.md to fold in?

`TODO.md` lists v1.4.0 items: Documentation (done), **Remove 20** (this spec), Lazy loader, Timezone. Those last two already have their own spec directories (`1-4-0-convert-aws-to-lazy-accessors`, `1-4-0-fully-implement-timezone`). Confirm this spec stays scoped to *only* Node 20 removal and does not touch those.
**Answer:** Stay scoped to Node 20 removal