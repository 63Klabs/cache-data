# Implementation Plan: Node.js 26 Support + Node.js 20 Deprecation

**Version**: 1.3.17 (from `package.json`)
**Status**: Draft for review. Questions at the end must be answered before `requirements.md` is generated.

---

## 1. Purpose

Three goals, driven by the current Node.js/Lambda runtime landscape (as of 2026-09-25):

1. **Add Node.js 26 support** — verify the package works under Node.js 26, update CI to test against it, and update docs/examples that reference runtime versions.
2. **Identify deprecated functions/APIs** — scan `src/` for Node.js APIs that Node 26 removed, runtime-deprecated, or that behave differently, and scan `test/` for anything version-sensitive.
3. **Deprecate Node.js 20** — formally mark Node 20 as no longer supported/tested, per the constraints in `AGENTS.md` (backwards compatibility, semver, deprecation process).

---

## 2. Current state (researched)

### 2.1 Node.js / AWS Lambda runtime timeline

| Runtime | Status | Key dates |
|---|---|---|
| Node.js 20 / `nodejs20.x` | **EOL upstream** (Apr 30, 2026). Removed from AWS Lambda's "Supported runtimes" table entirely — it no longer appears alongside 22/24/26 in [Lambda runtimes docs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html). Third-party sources report function-create blocked Aug 31, 2026 and function-update blocked **Sep 30, 2026** — 5 days from today. | Deprecated Apr 30, 2026 |
| Node.js 22 / `nodejs22.x` | Active LTS, GA on Lambda | Deprecation Apr 30, 2027 |
| Node.js 24 / `nodejs24.x` | Current LTS, GA on Lambda, used for `npm-publish.yml` | Deprecation Apr 30, 2028 |
| Node.js 26 / `nodejs26.x` | Upstream: released as "Current" 2026-05-05, enters upstream LTS 2026-10-28. **On AWS Lambda it is in public preview** (announced 2026-08-15): "not covered by the Lambda SLA or Technical Support, and should not be used for production workloads." Deprecation: not scheduled. | Not GA on Lambda yet |

Source: [AWS Lambda runtimes doc](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html), [AWS blog: public preview runtimes](https://aws.amazon.com/blogs/compute/introducing-public-preview-runtimes-on-aws-lambda-starting-with-node-js-26-and-python-3-15/), [Node.js 26.0.0 release notes](https://nodejs.org/en/blog/release/v26.0.0).

This matters because "add Node 26 support" for a Lambda-targeted package currently means "support a preview runtime with no SLA," not a GA runtime. See Q2.

### 2.2 Repo state today

- `package.json` `engines.node`: `">=20.0.0"`.
- `README.md` "Requirements" section: `Node.js >=22.0.0 runtime on Lambda` — **already inconsistent** with `engines.node`. A second spot further down still says `>=20.0.0`. This predates this spec and should be reconciled regardless of what we decide for 26 (see Q7).
- `.github/workflows/test.yml`: matrix `node-version: ['20', '22', '24']`; coverage job runs only on `'24'`.
- `.github/workflows/npm-publish.yml`: publishes using Node `'24'`.
- `.github/dependabot.yml`: covers `npm` and `github-actions` ecosystems weekly; no runtime-specific config.
- Dev toolchain: Jest `^30.2.0` (requires Node ≥18, so 26 is fine), `fast-check ^4.5.3`, `typescript ^7.0.2`, `eslint ^10.0.1`, AWS SDK v3 packages `^3.995.0` (devDependencies only, per `AGENTS.md` C5 pattern — no SDK in runtime `dependencies`).

### 2.3 Deprecated/removed Node.js API scan (Node 26 release notes cross-referenced against `src/`)

Node 26's release notes list these semver-major removals/deprecations: `http.Server.prototype.writeHeader` (removed), legacy `_stream_*` internal modules (removed), `crypto` DEP0182 (end-of-life), DEP0203/DEP0204 (runtime-deprecated), stream DEP0201 (runtime-deprecated), `module.register()` (runtime-deprecated), `--experimental-transform-types` (removed).

Searched `src/**/*.js` for all of the above plus other historically-deprecated patterns (`util.isArray`, `new Buffer()`, `url.parse`, `crypto.createCipher`/`createDecipher`, `process.binding`, `domain.create`, `punycode`): **no matches found anywhere in `src/`.**

- `src/lib/dao-cache.js` already uses `crypto.createCipheriv`/`createDecipheriv` (the non-deprecated API), and `structuredClone()` (native since Node 17, already required per `engines.node`).
- `src/lib/tools/CachedParametersSecrets.classes.js` uses `require('http')` for the Lambda extension transport — not the deprecated `writeHeader` API, just a normal client request.
- `src/lib/tools/AWS.classes.js` exposes `AWS.NODE_VER` via `process.versions.node` — no changes needed, this just reports whatever runtime it's on.

**Conclusion: no source-level deprecated-API remediation appears necessary for Node 26.** This is good news but needs to be confirmed by actually running the suite on Node 26 rather than static analysis alone (see Workstream 2).

### 2.4 Test suite scan

No test files reference `node-version`, hardcoded Node version strings, or version-gated behavior (`process.version` branching) that would need updating for 26. Test execution already follows the steering rules in `test-execution-monitoring` (direct Jest binary invocation, no `npm test` spawned from within tests).

---

## 3. Goals and non-goals

### Goals

- G1. Run the full test suite on Node.js 26 and fix anything that actually breaks (expected to be minimal or none per §2.3).
- G2. Add Node 26 to the CI test matrix (`.github/workflows/test.yml`).
- G3. Decide and implement a Node 20 deprecation notice consistent with the `AGENTS.md` deprecation process (§2.2 of `AGENTS.md`): log a runtime warning and/or documentation notice, without silently breaking anyone still on Node 20.
- G4. Reconcile the `engines.node` / README inconsistency uncovered in §2.2 (pre-existing bug, adjacent to this work).
- G5. Update CHANGELOG.md, docs, and example templates that reference specific runtime versions where relevant.

### Non-goals

- Making Lambda-runtime-specific code paths that behave differently per Node major version (no evidence this is needed — §2.3).
- Dropping Node 22 or 24 support.
- Chasing AWS Lambda's `nodejs26.x` GA date — that's on AWS's timeline, not ours (see Q2 for how we handle the preview status).

---

## 4. Constraints (from AGENTS.md / steering)

- **Backwards compatibility is highest priority.** Adding Node 26 support is additive and low-risk. Deprecating Node 20 is the sensitive part — per `AGENTS.md` §2.1, deprecation requires a `@deprecated`-style notice, a logged warning, and a migration path, not an abrupt drop. A hard `engines.node` bump that would make `npm install` fail/warn on Node 20 is arguably a **breaking change** and needs explicit confirmation (Q1).
- **Semver**: per `AGENTS.md` §2.2, "Changed default behaviors" = MAJOR, "Bug fixes / docs" = PATCH. Where a CI-only + docs-only Node 20 deprecation falls depends on whether `engines.node` changes (Q1, Q7).
- **Testing**: per `AGENTS.md` §2.3, all changes need tests; existing suite must keep passing on all still-supported Node versions.
- **Changelog convention**: entries go under an `## vX.Y.Z (unreleased)` heading once work starts; existing entries are never edited.
- **Spec naming convention**: this directory (`1-3-16-node-26-support`) follows `{version}-{feature-name}` using the current `package.json` version.

---

## 5. Proposed workstreams (pending answers below)

1. **WS-1: CI matrix update.** Add `'26'` to `test.yml`'s matrix. Decide Node 20's fate in the matrix (remove vs. keep as `continue-on-error` during a transition window — Q4).
2. **WS-2: Run and fix.** Execute the full suite locally/CI on Node 26 (`node --experimental-vm-modules node_modules/jest/bin/jest.js`) and address any real failures found (expected to be small given §2.3).
3. **WS-3: Node 20 deprecation notice.** Depending on Q1/Q3 answers: add a boot-time warning (pattern already used elsewhere, e.g. `DebugAndLog` deprecation notices logged at most once per process) and/or `engines.node` bump, plus CHANGELOG/README updates.
4. **WS-4: Reconcile `engines.node` vs README.** Make the two consistent (currently `>=20.0.0` in `package.json`, mixed `>=20.0.0`/`>=22.0.0` in README).
5. **WS-5: Docs/example sweep.** Runtime references in `docs/00-example-implementation/example-template-lambda-function.yml`, `docs/features/tools/*.md`, `docs/lambda-optimization/README.md`, etc. already say `nodejs24.x` — decide if any should be bumped to mention 26 as an option (Q6).
6. **WS-6: CHANGELOG entry.** Under `Unreleased`, categorized per the changelog convention (likely `Added` for Node 26 support, `Deprecated` for Node 20).

---

## 6. Open questions

**Q1. How hard should the Node 20 "deprecation" be?**
Options: (a) documentation/CHANGELOG notice only, no code or `engines` change; (b) add a one-time logged runtime warning (via `DebugAndLog`-style pattern) when `AWS.NODE_VER` / `process.versions.node` indicates major version 20, no `engines` change; (c) bump `engines.node` to `>=22.0.0`, which npm treats as an install-time warning (not a hard failure, since `engines` is advisory by default) — this most directly reflects reality since Lambda itself blocks Node 20 function updates in ~5 days.
*My recommendation: (b) + (c) together — bump `engines.node` to `>=22.0.0` (fixing the README inconsistency at the same time) and add a one-time warning for anyone actually running on 20.*

**Answer:** Go with recommendation (b) + (c) together

**Q2. How do we handle `nodejs26.x` being a Lambda public preview, not GA?**
Options: (a) test against Node 26 in CI as informational/`continue-on-error` until AWS marks it GA, still claim "Node 26 compatible" for the runtime itself (not the AWS preview); (b) treat it as fully supported now since the upstream language runtime is what the package depends on, not AWS's preview labeling; (c) wait until Lambda GA to add it to CI at all.
*My recommendation: (a) — test now as continue-on-error (catches regressions early, doesn't block CI on a preview runtime's AWS-side instability), and document that AWS's `nodejs26.x` Lambda runtime is still in preview.*

**Answer:** Go with recommendation (a)

**Q3. What should the Node 20 deprecation notice actually say / where should it live?**
E.g., "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested; upgrade to Node 22 or later" — logged via `DebugAndLog.warn()` once per process, plus a CHANGELOG `Deprecated` entry, plus a README callout. Confirm this is the right shape, or if you want it silent (docs-only).

**Answer:** Yes, go with your example

**Q4. Should Node 20 be removed from the CI matrix immediately, or kept for a transition window?**
Options: (a) remove immediately, since Lambda itself blocks Node 20 updates by Sep 30, 2026; (b) keep for one more release with `continue-on-error: true` to give consumers a visible signal before fully dropping.
*My recommendation: (a), given Lambda's own timeline has effectively already ended.*

**Answer:** We will go with option (b) and on the next release we will move cache-data to 1.4.x

**Q5. Should the coverage job move off Node 24?**
Currently coverage only runs on the `'24'` matrix leg. Move it to `'26'` (newest), keep on `'24'` (current GA, most representative of production), or run coverage on both?
*My recommendation: keep coverage on `'24'` (GA/production-representative) until Node 26 reaches Lambda GA, per Q2.*

**Answer:** go with your recommendation

**Q6. Should any docs/example CloudFormation templates be updated to reference `nodejs26.x`?**
Current examples all use `Runtime: nodejs24.x`. Given the preview status (Q2), should we leave these as-is, add a note that 26 is available in preview, or add a second example?
*My recommendation: leave `nodejs24.x` as the example default; add a short doc note about 26 preview availability rather than changing example templates.*

**Answer:** Go with your recommendation.

**Q7. Does this spec also fix the pre-existing `engines.node` vs. README inconsistency, or is that out of scope / a separate spec?**
It's directly adjacent (same files, same "what Node versions do we support" question) but is technically a pre-existing bug unrelated to Node 26/20. Confirm you want it folded in here rather than filed separately.

**Answer:** That is in scope

**Q8. Version bump for this spec.**
Given `AGENTS.md`'s semver guidance, does an `engines.node` bump (if Q1 confirms it) plus CI/docs changes constitute a MINOR release, or do you consider it PATCH since no runtime API behavior changes? This determines whether the CHANGELOG entry needs a `Breaking Changes` section per the changelog convention's deprecation-with-sunset-date format.

**Answer:** We will keep this a patch release as we are not removing support for 20, just marking it is deprecated, and we are not changing anything except ensuring we are compatible across the node 20-26 versions. We will perform a minor release when we remove 20 all-together

---

## 7. Additional findings from reviewing your answers, and new questions

Re-reading the code with your Q1 answer in mind (bump `engines.node` to `>=22.0.0` + one-time runtime warning), I found a third, more aggressive version check that your answers didn't yet account for:

**`src/lib/tools/vars.js` (lines 24-27)** runs at module load time — before `DebugAndLog` or anything else is wired up — and does this:

```javascript
if (nodeVerMajor < 16) {
	console.error(`Node.js version 16 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install at least Node version 16 (>18 preferred) in your environment.`);
	process.exit(1);
}
```

This is a **hard `process.exit(1)`**, not a warning, and it's a third stale version reference (says "16 required, 18 preferred") alongside the two already noted in §2.2 (`package.json` says `>=20.0.0`, `README.md` says both `>=20.0.0` and `>=22.0.0`). It currently has no effect on Node 20 (20 > 16, so it passes silently) but it's the natural home for a boot-time deprecation warning, since it already runs on every `require('@63klabs/cache-data')` and already contains the version-gate logic your Q1(b) answer calls for.

**Q9. Where should the Node 20 runtime warning live, and should the existing `<16` hard-exit floor be updated?**
Options:
- (a) Add the Node-20 warning as a new `else if (nodeVerMajor === 20)` branch right in `vars.js`, using `console.warn()` to match the existing `console.error` pattern in that file (keeps it dependency-free — `vars.js` currently only requires `AWS.classes`, not `DebugAndLog`).
- (b) Move the warning into `DebugAndLog.warn()` instead, called from `index.js` (`tools/index.js`) after `DebugAndLog` is available, using the existing `_deprecationNoticed` Set pattern (lines 43-45) for "at most once per process."
- (c) Both: keep the hard floor check in `vars.js` as-is (just fix the stale "16/18" message text to reflect reality), and add the Node-20-specific warning via `DebugAndLog` per (b).

Separately: should the hard-exit floor itself move from `<16` to `<22` (matching the new `engines.node` floor), so that Node 18/19 also gets *rejected* rather than silently passing? Currently anything ≥16 runs with no message at all — Node 18/19 users get no signal today.
*My recommendation: (c) for warning placement — fix the stale message in `vars.js` regardless, and put the "once per process" Node-20-specific deprecation notice through `DebugAndLog.warn()` since that's the established pattern (`_deprecationNoticed` Set) other deprecations in this codebase already use. For the floor itself, raise the hard-exit threshold from `<16` to `<20` (reject anything Lambda/upstream no longer supports at all) while keeping the 'warning' (not exit) at exactly `=== 20`. This avoids a surprise `process.exit(1)` for anyone currently on 20 while still refusing to run on genuinely unsupported ancient versions.*

**Answer:** go with recommendation, however shouldn't the hard exit be if less than 20? In this version we are just deprecating and warning, not removing support for 20. Removal occurs in 1.4.x

**Q10. Confirm the exact warning message text, now that we're also touching `vars.js`.**
Proposed: `Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.` — logged once via `DebugAndLog.warn()`. Confirm wording, or amend.

**Answer:** Approved

---

## 8. Phase 2 (target v1.4.0): Remove Node.js 20 support

This is a forward-looking outline only, per your request, so this plan can carry directly into a `1-4-0-*` spec later without re-researching the landscape. **Nothing in this section is scheduled or approved for implementation now** — it documents intent and open questions for when v1.4.0 planning starts, consistent with your Q4/Q8 answers (v1.3.17 stays a PATCH; the actual removal is a MINOR bump to 1.4.0).

### 8.1 Trigger condition

Per Q2's answer, v1.3.17 tests Node 26 as `continue-on-error` because AWS Lambda's `nodejs26.x` is still public preview. Phase 2's "make 26 the main example and coverage" goal (your wording) implies a dependency: **AWS Lambda must GA the `nodejs26.x` runtime before Phase 2's coverage/example changes make sense** — otherwise we'd be pointing users at a runtime AWS itself says not to use in production.

**Q11. Should Phase 2 be strictly gated on Lambda `nodejs26.x` reaching GA, or on some other trigger (e.g., a fixed date, or simply "whenever we decide to cut 1.4.0 regardless of GA status")?**
*My recommendation: gate it on GA. Check `https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html` at 1.4.0 planning time — if `nodejs26.x` still shows "preview" in that table, hold Phase 2's coverage-job and example-default changes (items 8.3.3/8.3.4 below) until it clears, but the Node 20 'removal' itself (8.3.1/8.3.2) doesn't need to wait on that — it's independent of 26's GA status.*

**Answer:** Go with your recommendation, but we will end Node 20 at the same time of 1.4.x release (when 26 is GA). We don't need exact dates. Releasing when 26 is GA is more important than an additional release when 20 is no longer available. Even though 20 won't be available in Lambda, and 26 isn't in GA, we want local runs to still work so the dev can move forward.

### 8.2 Goals

- G1. Remove Node 20 from the CI test matrix entirely (drop the `continue-on-error` leg added in v1.3.17).
- G2. Raise `engines.node` again if warranted (e.g., to `>=22.0.0` was already done in 1.3.17 — Phase 2 likely keeps that floor unless there's a reason to raise it further; see Q12).
- G3. Remove the Node-20-specific deprecation warning code added in v1.3.17 (the warning becomes moot once 20 isn't supported at all — continuing to special-case it would be dead code).
- G4. Sweep docs/README/examples to remove Node 20 mentions entirely (not just reconcile inconsistencies — actually drop the version from any "supported versions" list).
- G5. Make Node 26 the default/primary example in CloudFormation templates and documentation (`docs/00-example-implementation/example-template-lambda-function.yml`, `docs/features/tools/*.md`, `docs/lambda-optimization/README.md`, etc.) — contingent on 8.1's GA gate.
- G6. Move the coverage job from Node 24 to Node 26 (again contingent on GA per 8.1), or keep both 24 and 26 covered — needs a decision (Q13).
- G7. `CHANGELOG.md` **Breaking Changes** entry per the changelog convention, since dropping a previously-supported Node version is a breaking change for anyone still on it.

### 8.3 Open questions for Phase 2 (to be revisited, not answered now)

**Q12. Does removing Node 20 support also mean removing the `<20` fallback logic this spec adds (per Q9), or just the Node-20-specific warning?**
E.g., if Q9 lands on raising the hard-exit floor to `<20`, does Phase 2 raise it again to `<22` to match the new `engines.node` floor?

**Answer:** Yes, Phase 2 raises it again to `<22` Let's make all messaging consistent and all checks consistent. Phase one raises to `<20` to exit, `=== 20` warn, and phase 2 `<22` exit. We can keep `=== 20` as a warning but noop. We can plumb something for future deprecation logic. Phase 2 will not have a deprecation at time of launch, but there will be one eventually and we should keep some plumbing for it so that these are made easier in the future.

**Q13. Coverage job in Phase 2 — keep dual coverage (24 + 26) or move to 26-only?**
Your original request said "coverage after GA," which I'm reading as "move coverage to run on 26 once 26 is GA," fully replacing 24. Confirm, or should 24 remain the coverage leg with 26 added alongside?

**Answer:** Let's run coverage for 24 and 26. 

**Q14. "Remove tests" — which tests specifically?**
You mentioned removing tests as part of Phase 2. My scan (§2.4 of this plan) found **no existing tests that hardcode or specifically target Node 20** — the CI matrix drives version testing externally, not the test files themselves. Do you mean:
- (a) Any new test(s) added in v1.3.17 to verify the Node-20 deprecation-warning behavior (these would indeed become dead weight once 20 support is fully removed and should be deleted in Phase 2), or
- (b) Something else you're anticipating that isn't yet visible in the current test suite?
*Assuming (a) unless told otherwise — this will be confirmed once v1.3.17's actual test additions exist.*

**Answer:** I'm referring to the github/workflow/tests

**Q15. Should the Phase 2 CHANGELOG "Breaking Changes" entry follow the same 24-month-sunset format used for CloudFormation template deprecations (per the changelog-convention steering), or is that format specific to infrastructure templates and not applicable to an npm package's own version-support policy?**
Looking at prior entries in this CHANGELOG (e.g., v1.3.16's `AppConfig._initParameters()` deprecation), this project's own precedent is a plain "deprecated in favor of X" note with no fixed sunset date — not the 24-month CFN convention. *My recommendation: follow this project's own precedent (no fixed sunset period), not the CFN-specific 24-month convention, since that convention was written for infrastructure templates with different upgrade cadences than an npm library tracking upstream Node.js EOL dates.*

**Answer:** Follow this project's own precedent. That reference to CloudFormation must have been left in on a copy/paste. Make a note to have the changelog steering reviewed and updated in Phase 2

---

## 9. New Phase 1 workstream: `cache-data-node-support` steering runbook

This whole spec has been us re-deriving Node/Lambda runtime facts (EOL dates, GA/preview status, block-create/block-update dates) from scratch, plus re-deciding *how* this package should react to them (warning shape, `engines.node` floor policy, CI transition windows, changelog conventions). That's exactly the kind of thing that should be written down once as a repeatable runbook, not re-litigated next year. This adds it to Phase 1 as **WS-7**.

### 9.1 Placement

New file: `.kiro/steering/cache-data-node-support.md`, following the same `inclusion: manual` front-matter pattern already used by `automation-assign-github-issues.md` and `automation-check-dependency-updates.md` (both single manually-triggered runbooks with a `description` for the picker). It is not auto-included in any session — it only runs when explicitly invoked.

The file has two parts: **(A)** a living support matrix that gets edited in place every run, and **(B)** the fixed procedure that does the editing. This mirrors how this very plan accumulated a table (§2.1) and then a set of decision rules (§6-8) — the runbook just makes that repeatable.

### 9.2 Part A — the support matrix

Seeded from this plan's own §2.1 research:

| Runtime | Node Major | Package Policy | AWS Lambda Status | Upstream Node EOL | Lambda Deprecation Date | Lambda Block-Create | Lambda Block-Update | Notes | Last Checked |
|---|---|---|---|---|---|---|---|---|---|
| `nodejs20.x` | 20 | Deprecated (warn) — as of v1.3.17 | Removed from AWS's live table (see note) | 2026-04-30 | 2026-04-30 | ~2026-08-31 (3rd-party) | ~2026-09-30 (3rd-party) | AWS's own runtimes page no longer lists 20 at all as of this check — third-party dates are unconfirmed against an official source and should be re-verified next run. | 2026-09-25 |
| `nodejs22.x` | 22 | Supported | GA | 2027-04-30 | 2027-04-30 | 2027-06-01 | 2027-07-01 | Active LTS. | 2026-09-25 |
| `nodejs24.x` | 24 | Supported (coverage + example default) | GA | 2028-04-30 | 2028-04-30 | 2028-06-01 | 2028-07-01 | Current LTS; used for `npm-publish.yml`. | 2026-09-25 |
| `nodejs26.x` | 26 | Supported (CI `continue-on-error`) | **Preview** | Not yet LTS (upstream "Current" since 2026-05-05, upstream LTS from 2026-10-28) | Not scheduled | Not scheduled | Not scheduled | Lambda preview only — "not covered by the Lambda SLA or Technical Support." | 2026-09-25 |

Two columns are deliberately separate: **Package Policy** (this repo's own stance, which can lag AWS on purpose — e.g. we keep 20 in CI with `continue-on-error` past its own EOL by design, per §6 Q4) versus **AWS Lambda Status** (what AWS's docs say right now, no lag). The runbook always refreshes the AWS column; it only proposes changes to the Package Policy column, per a human confirming a follow-up spec.

### 9.3 Part B — the procedure, run each time this file is invoked

**Step 1 — Fetch current AWS data.** Read the "Supported runtimes" table at `https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html` (via the AWS documentation MCP tools if available in-session, else `web_fetch`), extract every `nodejsNN.x` row with its Deprecation/Block-create/Block-update dates. For any major version not yet in the matrix, cross-check its upstream Node.js EOL/LTS dates via web search (e.g. `nodejs/Release` on GitHub, or endoflife.date) since Lambda's table doesn't carry that.

**Step 2 — Diff against the stored matrix**, checking each live `nodejsNN.x` row against these conditions in order:

- Not present in our matrix at all → **NEW VERSION DETECTED**.
- Present, and its AWS Lambda Status flipped from `Preview` to `GA` → **VERSION REACHED GA**.
- Present, Package Policy is `Supported`, and `min(Upstream Node EOL, Lambda Deprecation Date)` falls within 6 months of today → **EOL WITHIN 6 MONTHS**.
- Present, Package Policy is `Supported` or `Deprecated (warn)`, and today is past its **Lambda Block-Update Date** → **EOL PASSED**. (Block-Update, not Deprecation Date, because that's the actual moment a Lambda-targeting user can no longer deploy on that runtime at all — the real forcing function, consistent with how this plan treated Node 20.)

**Step 3 — Refresh the matrix.** Update every row's AWS-sourced columns and "Last Checked" regardless of whether any trigger fired, so the table stays accurate even on quiet runs.

**Step 4 — Recommend a follow-up spec per trigger** (the runbook never creates the spec itself — see Q16 below):

| Trigger | Recommended spec | Pattern to follow |
|---|---|---|
| NEW VERSION DETECTED, `Preview` | none yet — just record it | Matches this plan's Q2: preview runtimes get recorded, not adopted. |
| NEW VERSION DETECTED, `GA` (or VERSION REACHED GA) | PATCH: `{current-version}-node-{NN}-support` | Mirrors this spec: add to CI matrix, run full suite, docs mention, decide coverage/example-default separately (don't default until the package maintainer is comfortable, same as 24 staying primary over 26 today). |
| EOL WITHIN 6 MONTHS | PATCH: `{current-version}-node-{NN}-deprecation` | Mirrors §6/§7 of this plan exactly: one-time `DebugAndLog.warn()` via the deprecation-notice registry (§9.4 below), `engines.node` bump only if NN is already below the floor, CI kept with `continue-on-error` for one release, README/CHANGELOG `Deprecated` entry with no fixed sunset date (this project's own precedent, not the CFN 24-month convention — see Q15's note that the changelog steering doc has a stray CFN-specific reference to fix in Phase 2). |
| EOL PASSED | MINOR: `{next-minor}-node-{NN}-removal` | Mirrors §8 of this plan: drop from CI matrix, raise `engines.node`/hard floor past NN, flip (not delete) its registry entry to `active: false`, sweep docs, `Breaking Changes` CHANGELOG entry, promote next GA runtime as default example/coverage if not already. |

**Step 5 — Report.** Output the matrix diffs, which triggers fired, and the exact recommended spec name(s) with a one-paragraph rationale each — formatted so it can be pasted straight into a new planning conversation. Stop there.

### 9.4 The reusable "deprecation notice registry" (answers Q12's plumbing request)

Rather than one-off `if (nodeVerMajor === 20)` branches added and removed release after release, the actual runtime code (landing in `vars.js` or wherever Q9's design settles) should hold a small ordered, data-driven list:

```javascript
// >! Ordered record of every Node major version this package has warned
// >! about. `active: false` means the version has since been fully removed
// >! (see .kiro/steering/cache-data-node-support.md) — kept, not deleted,
// >! so the removal history and message text stay auditable.
const NODE_DEPRECATION_NOTICES = [
	{
		version: 20,
		active: true, // flips to false in the v1.4.0 removal spec
		message: "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later."
	}
	// Future cycles append here, e.g.:
	// { version: 22, active: true, message: "..." }
];
```

A single helper, called once at module load, walks this list and warns once-per-process (reusing the existing `_deprecationNoticed`-style guard already in `tools/index.js`) for any `active` entry matching the running major version. The next deprecation cycle then becomes a one-line data addition instead of new bespoke logic — this is what actually prevents "tackling the same questions in a year." The exact file location and helper name are a `design.md`-level detail once this spec reaches that stage; this plan only fixes that the *pattern* is a data-driven list, per your Phase-2 answer to Q12.

### 9.5 Workstream addition

**WS-7: Create `.kiro/steering/cache-data-node-support.md`.** Seeded with the §9.2 matrix and §9.3 procedure. This ships alongside the v1.3.17 code changes but is repo tooling, not package code — it doesn't touch the npm package's version number or its own CHANGELOG.md (same category as the existing `automation-check-dependency-updates.md`).

### 9.6 Open questions to finalize this design

**Q16. Should the runbook ever auto-create a spec directory, or only recommend one for a human to create?**
*My recommendation: recommend only.* The trigger conditions are mechanical, but the follow-up decisions (whether a new GA version becomes the coverage/example default, exact transition-window length, wording tweaks) have needed your judgment every time in this session. A manually-triggered runbook that ends in "here's the exact spec name and rationale, ready to paste into a planning session" keeps a human in the loop for those calls without losing the research/drafting effort.

**Answer:** recommend only

**Q17. Confirm the two date thresholds used in Step 2:** 6-month warning trigger = earliest of (upstream Node EOL, Lambda Deprecation Date); EOL-passed trigger = Lambda's **Block-Update Date** specifically (not Deprecation Date or Block-Create Date). This is what the Node 20 timeline in §2.1 already implicitly used — confirming it as the codified rule rather than something re-decided per run.

**Answer:** 6-month warning trigger = earliest of (upstream Node EOL, Lambda Deprecation Date)

**Q18. Data source priority.** OK to rely primarily on the AWS documentation MCP tools (or `web_fetch` fallback) against the Lambda runtimes page as the single source of truth for AWS-side dates, using web search only to backfill upstream Node.js EOL dates for a brand-new major version's first appearance in the matrix?

**Answer:** Yes, OK to rely primarily on the AWS documentation MCP tools (or `web_fetch` fallback)

**Q19. Should the matrix carry an explicit note about Node's cadence change?** Node moved from two majors/year to one major/year (April release, October LTS promotion) starting around the v26 line, per this session's research. Worth a standing note in the matrix so "when should I expect a NEW VERSION DETECTED trigger" doesn't require re-researching the cadence itself next time.

**Answer:** Yes

**Q20. Does WS-7 ship as part of v1.3.17's task list, or as its own tiny standalone spec?**
*My recommendation: bundle it into 1.3.17's tasks*, called out as its own task group, since it was born directly from this planning session and splitting it off risks losing that context — but it's a fair question since it's tooling rather than "Node 26 support" per se.

**Answer:** bundle it into 1.3.17's tasks

---

## 10. What I have NOT yet done (deliberately, per your instructions)

- No `requirements.md`, `design.md`, or `tasks.md` yet — this is planning-only.
- No CI file edits, no `engines.node` edits, no CHANGELOG edits, no `vars.js` edits.
- No `.kiro/steering/cache-data-node-support.md` file created yet — §9's design is drafted for review; Q16-Q20 should be answered first since Q16 in particular affects what the runbook is allowed to do.
- No test run against Node 26 yet (WS-2 is proposed, not executed) — recommend doing this as the first implementation task once questions are answered, since it will either confirm §2.3's static-analysis conclusion or surface something the scan missed.
- Phase 2 (§8) is intentionally unscheduled outline only — no work should start on it until v1.3.17 ships and Q11's GA gate is checked.
