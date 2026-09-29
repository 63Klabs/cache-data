---
inclusion: manual
description: "Manually-triggered runbook that checks AWS Lambda's current Node.js runtime support against a stored support matrix, refreshes the matrix, and reports any lifecycle triggers with recommended follow-up spec names. Report-only; never modifies code, specs, or CI."
---

# Node.js Runtime Support Runbook (`@63klabs/cache-data`)

This runbook codifies the Node.js / AWS Lambda runtime-support decisions made during the v1.3.17 planning cycle (`.kiro/specs/1-3-17-node-26-support`) so that future runtime lifecycle events (new versions, approaching end-of-life, preview-to-GA transitions) can be triaged mechanically instead of re-researched from scratch.

> **Report-only.** This runbook NEVER creates, modifies, or executes any spec, code file, or CI configuration. Its only output is a report for a human to act on: a diff of matrix changes, the triggers that fired, and recommended follow-up spec names each with a rationale. Refreshing Part A (the matrix) in place is the single exception, and only reflects data fetched from AWS during the run.

The runbook has two parts:

- **Part A: Support matrix** - a living table, edited in place on each run.
- **Part B: Procedure** - fixed steps to fetch AWS data, diff, refresh, evaluate triggers, and report, plus the standing trigger decision table.

## Part A: Support matrix

Package Policy and AWS Lambda Status are deliberately kept as separate columns: this repository's own support stance (`Supported`, `Deprecated (warn)`, or removed) may intentionally lag AWS's published timeline. Package Policy is set by this package's releases; AWS Lambda Status mirrors AWS's live documentation.

| Runtime | Node Major | Package Policy | AWS Lambda Status | Upstream Node EOL | Lambda Deprecation Date | Lambda Block-Create | Lambda Block-Update | Notes | Last Checked |
|---|---|---|---|---|---|---|---|---|---|
| `nodejs20.x` | 20 | Deprecated (warn), as of v1.3.17 | Absent from AWS live table | 2026-04-30 | 2026-04-30 | ~2026-08-31 (3rd-party) | ~2026-09-30 (3rd-party) | AWS runtimes page no longer lists 20; third-party dates unconfirmed against official source, re-verify next run. | 2026-09-25 |
| `nodejs22.x` | 22 | Supported | GA | 2027-04-30 | 2027-04-30 | 2027-06-01 | 2027-07-01 | Active LTS. | 2026-09-25 |
| `nodejs24.x` | 24 | Supported (coverage + example default) | GA | 2028-04-30 | 2028-04-30 | 2028-06-01 | 2028-07-01 | Current LTS; used for `npm-publish.yml`. | 2026-09-25 |
| `nodejs26.x` | 26 | Supported (CI `continue-on-error`) | Preview | Not yet LTS (upstream Current 2026-05-05, LTS 2026-10-28) | Not scheduled | Not scheduled | Not scheduled | Lambda preview only; no SLA/support. | 2026-09-25 |

### Column definitions

| Column | Meaning |
|---|---|
| Runtime | `nodejsNN.x` identifier as published by AWS Lambda. |
| Node Major | Integer Node.js major version. |
| Package Policy | This repository's stance: `Supported`, `Deprecated (warn)`, or removed. May lag AWS intentionally. |
| AWS Lambda Status | Live AWS status: `Preview`, `GA`, or absent/deprecated. |
| Upstream Node EOL | Upstream Node.js end-of-life date. |
| Lambda Deprecation Date | AWS Lambda deprecation date for the runtime. |
| Lambda Block-Create | Date after which AWS blocks creating new functions on the runtime. |
| Lambda Block-Update | Date after which AWS blocks updating existing functions on the runtime (the "EOL passed" forcing function). |
| Notes | Free text. |
| Last Checked | Date the row was last refreshed by this runbook. |

### Standing note: Node.js release cadence

Node.js ships one new major version per year (as of the v26 line). A new major is cut in April and promoted to Long Term Support (LTS) the following October. Even-numbered majors become LTS; odd-numbered majors do not and reach end-of-life sooner. Because this cadence is stable, it does not need to be re-researched on future runs: given a major's release year you can estimate its April release, its October LTS promotion, and its roughly 30-month support window.

## Part B: Procedure

Run these steps in order every time the runbook is invoked. Steps (a) through (c) always run; the AWS-sourced columns and the Last Checked date are refreshed on every run regardless of whether any trigger fires.

1. **(a) Fetch the current AWS Lambda supported-runtimes table.** Prefer the AWS documentation MCP tools (search the Lambda runtimes documentation, then read the supported-runtimes and runtime-deprecation-policy pages). If the MCP tools are unavailable, fall back to `web_fetch` against the AWS Lambda runtimes documentation page. Use a general web search ONLY to backfill upstream Node.js EOL/LTS dates for a runtime that is not yet in the matrix; do not use web search as a substitute for the authoritative AWS table.
2. **(b) Diff the fetched data against the stored matrix.** For each live `nodejsNN.x` runtime, compare AWS Lambda Status and every AWS-sourced date against the stored row. Note added runtimes, removed runtimes, and any changed values.
3. **(c) Refresh the matrix.** Rewrite every row's AWS-sourced columns (AWS Lambda Status, Lambda Deprecation Date, Lambda Block-Create, Lambda Block-Update, and upstream EOL where newly learned) and set Last Checked to today's date for every row that was checked. Do this whether or not a trigger fires. Never write guessed or stale data: if the fetch failed, refresh nothing and report the fetch failure instead.
4. **(d) Evaluate the trigger conditions** in the decision table below for each live runtime, in order.
5. **(e) Report** the diff from step (b), every trigger that fired, and for each trigger the recommended follow-up spec name with a one-paragraph rationale. Format the report so it can be pasted into a new planning conversation.

### Trigger decision table (Requirement 10)

Evaluate each live `nodejsNN.x` runtime against these conditions in order. `{current-version}` is the current `package.json` version with dots replaced by hyphens (per the spec-naming-convention steering). `{next-minor}` is the next MINOR version in that same hyphenated form. `{NN}` is the Node major version.

| # | Condition | Trigger | Recommendation |
|---|---|---|---|
| 1 | Runtime appears in AWS live data with no row in the stored matrix, AND AWS Lambda Status is `Preview` | New version detected (Preview) | Record the runtime in the matrix only. No follow-up spec. |
| 2 | Runtime appears in AWS live data with no row in the stored matrix, AND AWS Lambda Status is `GA` | New version detected (GA) | Recommend a PATCH-level spec named `{current-version}-node-{NN}-support`. |
| 3 | Runtime already in the matrix, AND AWS Lambda Status changed from `Preview` to `GA` | Version reached GA | Recommend a PATCH-level spec named `{current-version}-node-{NN}-support`, AND recommend that the follow-up spec update the example Lambda runtimes in documentation (for example `docs/00-example-implementation/example-template-lambda-function.yml`, `docs/features/tools/*.md`, `docs/lambda-optimization/README.md`, and any other CloudFormation templates or docs referencing a specific `nodejsNN.x` runtime) to the newly-GA version. |
| 4 | Package Policy is `Supported`, AND the earlier of (upstream Node EOL, Lambda Deprecation Date) falls within 6 months of the run date | EOL within 6 months | Recommend a PATCH-level spec named `{current-version}-node-{NN}-deprecation`. |
| 5 | Package Policy is `Supported` or `Deprecated (warn)`, AND the run date is past the runtime's Lambda Block-Update date | EOL passed | Recommend a MINOR-level spec named `{next-minor}-node-{NN}-removal`. |

If none of the conditions match a runtime, report no trigger for it and refresh its row only.

### Rationale requirement (Requirement 10.9)

Each recommended spec name in the report MUST be accompanied by a one-paragraph rationale that references the corresponding pattern established by the v1.3.17 spec:

- **Support (new GA / preview-to-GA)**: reference the CI matrix change pattern (add the `nodejsNN.x` leg to `.github/workflows/test.yml`, initially `continue-on-error` for a preview, promoted to a normal leg at GA) and, at GA, the example-docs runtime update. Cite that Node 26 was added as `continue-on-error` in v1.3.17 while it was a Lambda preview.
- **Deprecation (EOL within 6 months)**: reference the deprecation-notice registry data-addition pattern (append one `{ version: NN, active: true, message: ... }` entry to `NODE_DEPRECATION_NOTICES` in `src/lib/tools/index.js`, and add the matching CI transition-window leg) plus the `engines.node`/README reconciliation. Cite the Node 20 deprecation entry added in v1.3.17.
- **Removal (EOL passed)**: reference the removal-sweep pattern (flip the registry entry to `active: false` rather than deleting it, raise the hard floor in `src/lib/tools/vars.js`, drop the retired CI leg) as a MINOR release. Cite that v1.3.17 deferred Node 20 removal to a future MINOR (v1.4.0) gated on `nodejs26.x` reaching GA.

## Out of scope for this runbook

This runbook does not itself write specs, edit source, or change CI. It reports; a human runs the recommended spec workflow. It also does not decide release timing beyond naming the recommended spec level (PATCH or MINOR).
