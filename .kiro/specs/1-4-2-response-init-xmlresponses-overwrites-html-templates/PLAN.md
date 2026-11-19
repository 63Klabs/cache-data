# Response.init() writes `xmlResponses` into the HTML template slot

> **Status**: Locked 2026-11-18
> **Issue**: [ISSUE.md](ISSUE.md)
> **Reviewed against**: `dev` at `9a7f3a5` (package version 1.4.2) on 2026-11-18

## 1. Summary

`Response.init()` has one branch per template option. The `xmlResponses` branch assigns to `Response.#htmlResponses` instead of `Response.#xmlResponses` (`src/lib/tools/Response.class.js:163`). An application that passes `xmlResponses` therefore loses its XML customization, and its HTML slot becomes the built-in XML templates plus its XML overrides. Any `htmlResponses` in the same call are discarded, because the XML branch runs after the HTML branch.

The issue is accurate. Reading the history adds one fact it does not state: the line was correct when written and became wrong in a later commit (`1beabd6`, 2024-11-18), so it is a typo from a refactor, not a design choice. The bug is in every published version (checked in the 1.2.2 tarball, the oldest on npm). Applications that do not pass `xmlResponses` are not affected.

Recommended fix: change the assignment target on line 163 to `Response.#xmlResponses`, add one new test file that covers all five template slots, correct the CHANGELOG, and add a short `xmlResponses` example to the docs. No API, type or default changes.

## 2. Assessment of the issue

Probes were read-only `node` runs on 2026-11-18 against `9a7f3a5`, each with a single `Response.init()` call. Probe 1 is the issue's own command (XML 200 only). Probe 2 passes an HTML 404 and an XML 200 together. Probe 3 passes a custom 200 for each of html, rss, text and xml. Probe 3 ran from a temporary script written to the repository root and deleted afterwards. `git status` is clean.

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | The `xmlResponses` branch assigns to `#htmlResponses` | Confirmed | `Response.class.js:163`. The commented-out line above it (`:162`) targets `#xmlResponses` |
| C2 | The HTML, RSS and text branches write to their own slots | Confirmed | `:157`, `:169`, `:175`. JSON at `:149` also reads correct |
| C3 | Custom XML templates are never used | Confirmed | Probe 1: `Response.getGenericResponses("XML").response(200)` returned the built-in `<hello>Success</hello>` after init with a custom XML 200 |
| C4 | The HTML slot returns XML content | Confirmed | Probe 1: `getGenericResponses("HTML").response(200)` returned `<custom>xml</custom>` with `Content-Type: application/xml`, and `response(404)` returned `<error>Not Found</error>` as XML |
| C5 | `htmlResponses` in the same call are lost | Confirmed | Probe 2: `htmlResponses.response404` plus `xmlResponses.response200` in one `init()`. The HTML 404 came back as the built-in XML error body, not the custom HTML |
| C6 | RSS and text branches are correct | Confirmed by probe | Probe 3: all four of html, rss, text and xml given a custom 200. RSS and text returned their own templates. HTML returned the XML template (the bug). XML returned the default |
| C7 | No test passes `xmlResponses` to `Response.init()` | Confirmed | Search of `test/`: the only hit is an empty object in `test/types/consumer-appconfig-extend.ts:80`, a type test that does not call `init()`. `response-generic-templates-custom-unit-tests.jest.mjs` states "Nothing in xmlResponses" |
| C8 | No user documentation mentions `xmlResponses` | Confirmed | Search of `docs/` and `README.md`: no hit. `docs/01-advanced-implementation-for-web-service/configuration-options.md:76` and `response-management.md` show `jsonResponses` and `htmlResponses` only |
| C9 | `Response.init()` takes effect once per process | Confirmed | `:140-143`: `if (!Response.#isInitialized)`. A later call is silently ignored |
| C10 | Downstream apps (Atlantis starters) may pass `xmlResponses` | Resolved by the maintainer (Decision 3) | The maintainer states that no Atlantis starter uses XML. The Atlantis search index also returned no `xmlResponses` hit. Applications outside the starters remain unknown |
| C11 | The issue's line references are current | Partially confirmed | `:163` and `types/lib/tools/index.d.ts:33` are correct. The issue cites `getGenericResponses()` at `:515`; it is now at about `:557-563` |

## 3. Current state

- **Slots.** Five private statics hold the templates: `#jsonResponses`, `#htmlResponses`, `#rssResponses`, `#xmlResponses`, `#textResponses` (`Response.class.js:64-69`). Each starts as the built-in module object.
- **Merge.** `init()` merges each option over its slot with a spread, so the built-in module objects are not mutated (`:149-175`). The spread keeps `response(n)` and every `response<code>` the application does not override.
- **Readers.** `getGenericResponses(contentType)` maps `"HTML"` or `Response.CONTENT_TYPE.HTML` to `#htmlResponses`, and `"XML"` to `#xmlResponses` (`:557-563`). `reset()`, and therefore the constructor, call it (`:219`).
- **Entry points.** `AppConfig.init({ responses })` forwards `options.responses` to `Response.init()` (`src/lib/tools/index.js:289`). The `responses.xmlResponses` option is declared in the JSDoc (`index.js:195`) and the types (`types/lib/tools/index.d.ts:33`), so TypeScript consumers are told it works.
- **History.** `53629b9` (2024-11-15) had `Response.#xmlResponses = Object.assign(Response.#xmlResponses, options.xmlResponses)`. `1beabd6` (2024-11-18, "updated generic responses") replaced the `Object.assign` calls with spreads in every branch and, in the XML branch only, changed the target to `#htmlResponses` and the left operand to `#xmlResponses`. The commented-out `Object.assign` line the commit left behind still names `#xmlResponses`. Nothing in the history suggests a reason. The 1.4.2 generic-response work (`1-4-2-generic-responses-for-unlisted-status-codes`) reads templates through `this.response200` and similar on the merged object, so a custom XML template starts affecting the XML class fallback once the slot is written correctly. That is the same behavior as the other four formats.
- **Content-Type.** `Response.CONTENT_TYPE` is computed once at class load (`:71-77`). When `reset()` or the constructor builds a response from a generic template, it passes the format's `CONTENT_TYPE` value to `set()`, which ends with `addHeader('Content-Type', contentType)` (`:257`). The template's own `Content-Type` header is therefore replaced by the `CONTENT_TYPE` value on that response. An application can still set another type afterwards. Probe 4 used a custom `rssResponses.response200` with `Content-Type: application/atom+xml` (the RSS slot works, so it tests the mechanism without the XML bug):
  - The template itself holds `application/atom+xml`.
  - `new Response(req, { statusCode: 200 }, Response.CONTENT_TYPE.RSS)` carries `application/rss+xml`. The template header is not used.
  - Adding `response.addHeader("Content-Type", "application/atom+xml")` or `response.setHeaders({ "Content-Type": "application/atom+xml" })` afterwards gives `application/atom+xml`, and `finalize()` keeps it.
  - Passing `headers: { "Content-Type": "application/atom+xml" }` in the constructor object throws `Content Type: application/atom+xml is not implemented for getResponses` when no content type argument is given, because `reset()` looks the header up as a format. With the RSS argument it is replaced by `application/rss+xml`.
  
  This is existing behavior for every format and is not caused by this bug. See Decision 5.

## 4. Review

### 4.1 Security

- **Not a vulnerability.** Nothing attacker-controlled reaches the slot assignment. The inputs come from application code at start-up. No disclosure handling is needed and the spec directory can stay as is.
- **Content mix-up.** Before the fix, an application that passed `xmlResponses` served XML bodies with an XML `Content-Type` on HTML routes. That is a correctness fault with no practical escalation: the templates are static, application-supplied strings. The generic HTML, XML and RSS formatters do not escape the status message, and the messages stay constants. This fix adds no new input to them.
- **Fail-open/closed.** `init()` silently ignores a second call and does not validate the options. Out of scope; noted in Section 7.
- **Logging.** The fix writes no new log lines and exposes no new value.

### 4.2 Software engineering

- **Correctness.** One token changes: the assignment target. The right-hand side must also be corrected. The current line spreads `Response.#xmlResponses` into the HTML slot. The corrected line is `Response.#xmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };`, the same shape as the other four branches.
- **Backward compatibility (AGENTS.md 2.1).** No signature, export, type or default changes. Observable output changes only for applications that pass `xmlResponses`: their XML templates start applying, and their HTML templates (default, or from `htmlResponses`) stop being replaced by XML. Both are the documented intent. An application that worked around the bug by also passing XML bodies in `htmlResponses`, or by reading `getGenericResponses("HTML")` expecting XML, would see a change. That is unlikely and cannot be checked from here (C10).
- **Tests that change.** None. No existing test passes `xmlResponses` (C7). `response-generic-templates-custom-unit-tests.jest.mjs` passes only `jsonResponses`.
- **Tests to add.** `init()` runs once per module registry. The sibling spec's pattern is one `Response.init()` call at module level per test file (header of `response-generic-templates-custom-unit-tests.jest.mjs`: "takes effect once per test file"), so each new test file needs no subprocess. The issue suggests a subprocess; the file-per-init pattern is already used in `test/response/` and avoids spawning processes (`test-execution-monitoring.md`). Two files:
  - File A passes all five options in one `init()` call, each with a distinct custom 200 body, plus an `htmlResponses.response404`. It asserts each slot returns its own template, that no slot returns another format's template, and that the custom HTML 404 survives the XML option (the C5 regression). It also guards the other four branches against the same typo.
  - File B passes only `xmlResponses` and asserts the HTML slot is still the built-in HTML template and the XML slot is the custom one.
  - File A also holds one property over status codes (`fc.integer({ min: 100, max: 599 })`, no filter) asserting that `getGenericResponses("HTML").response(n).headers["Content-Type"]` never equals the XML content type. The generator is not filtered by the asserted predicate. `FC_SEED` is not passed at the call site (`test-execution-monitoring.md`).
- **Tests required by AGENTS.md 2.3.** Unit test: required. Property test: the init-once rule limits it to status-code inputs, as above. Integration test: the existing `Response` tests exercise the constructor and `reset()`. No new one is needed.
- **Documentation.** `Response.init` JSDoc already lists `xmlResponses` (`:120`). User docs show no example (C8). CHANGELOG needs a Fixed entry. `types/` needs no change.
- **Duplicated logic.** Five near-identical branches caused this bug. A loop over a map of option name to slot cannot assign to private static fields by name without a setter, so a refactor is not simple. Not recommended here. The all-slots test covers the risk.

### 4.3 Cloud engineering

- **Topology and IaC.** The package is code only. No template, IAM, KMS, parameter or stack changes. No resource is touched.
- **Request path.** Responses produced by `Response.finalize()` are returned through API Gateway or a Lambda function URL, optionally behind CloudFront. Neither hop reads the template slots. The visible effect for an affected application is a different body and `Content-Type` on generic HTML and XML responses.
- **Stages.** The configuration comes from the same `AppConfig.init({ responses })` call in every stage, so test, beta and prod behave the same after upgrading. An affected application sees the change in every stage at once.
- **Caching.** Generic responses are built per invocation and are not stored by this package. A CloudFront cache could hold an old wrong HTML or XML body until its TTL expires. This applies only to affected applications and clears on its own.
- **Rollout and rollback.** A normal npm patch release. Rollback is the previous version.
- **Observability.** The package logs no template selection. Nothing to add.

## 5. Gaps and observations

- The issue has no GitHub issue number. The CHANGELOG convention forbids guessing one (Q4).
- The issue says the bug affects "applications that pass `xmlResponses`", but gives no affected version range. Checked: the 1.2.2 tarball (oldest on npm, 2025-05-06) contains the same line. The CHANGELOG convention asks for the range: "Affects v1.2.2 through v1.4.1", which is every published version.
- The all-slots test also protects `settings` and `jsonResponses`; both read correct today.
- A custom `Content-Type` in a template's `headers` is not applied when a `Response` is built from the template. The application can set it afterwards with `addHeader()` or `setHeaders()` (Section 3). A user who reads the new XML example may expect the template header to apply. The docs example covers it (Decision 5).
- `Response.init()` ignores a second call silently. Not caused by this issue.

## 6. Proposed approach

1. **Code.** In `src/lib/tools/Response.class.js`, change the XML branch to `Response.#xmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };`. Remove nothing else. Leave the commented-out `Object.assign` lines alone (not this issue's change).
2. **Tests.** Add `test/response/response-init-all-slots-unit-tests.jest.mjs` (file A) and `test/response/response-init-xml-only-unit-tests.jest.mjs` (file B), each with one module-level `Response.init()` call, as described in 4.2. File A includes the status-code property test. No subprocess. Existing test files are not changed.
3. **Docs.** Add an `xmlResponses` example next to the existing `htmlResponses` example in `docs/01-advanced-implementation-for-web-service/configuration-options.md` and to "Custom Response Templates" in `response-management.md` (Decision 2). The example does not claim the template `Content-Type` applies. It states the Section 3 behavior: a `Response` built from the template carries `Response.CONTENT_TYPE.XML`, and `addHeader()` or `setHeaders()` sets another type such as `application/atom+xml`.
4. **CHANGELOG.** Under `## v1.4.2 (unreleased)`, in `### Fixed`: a titled entry that names `Response.init()` and `xmlResponses`, says XML templates now apply and the HTML slot is no longer replaced, gives the range "Affects v1.2.2 through v1.4.1", and tells affected applications to review any code that expected the old HTML or XML output. Spec link `[Spec: 1-4-2-response-init-xmlresponses-overwrites-html-templates](.kiro/specs/1-4-2-response-init-xmlresponses-overwrites-html-templates/)`. No issue link, because no GitHub issue exists (Decision 4). The existing `### Fixed` list in `1.4.2` already has the documentation fix, so this entry goes in the same category.
5. **Version.** PATCH, no bump (package is already 1.4.2) (Decision 1).

**Alternatives considered**

| Alternative | Why not |
|-------------|---------|
| Refactor all five branches into a loop over a slot map | Private statics cannot be assigned by name without extra accessors. More code than the bug needs |
| Restore the original `Object.assign` form | It mutates the shared built-in module object, so one test file or one `init()` would leak into other users of the module in the same process. The spread merge is the safer form |
| Subprocess test, as the issue suggests | Slower and needs `execFileSync` plumbing. One `init()` per test file is already used in `test/response/` |
| Ship as MINOR because output changes | The change is a bug fix that makes the documented option work (Decision 1) |

## 7. Related improvements

| Item | Class (Include / Spin off / Note) | Rationale | Effort | Risk |
|------|-----------------------------------|-----------|--------|------|
| I1. Test that covers all five slots in one init | Include | Guards the other four branches against the same typo | S | Low |
| I2. `xmlResponses` example in the docs | Include (Decision 2) | The option has no example anywhere | S | Low |
| I3. Property test over status codes | Include | AGENTS.md 2.3 asks for property tests on core logic | S | Low |
| S1. A template's `Content-Type` header is not used when a `Response` is built from it (`Response.CONTENT_TYPE` wins), and the constants are fixed at class load | Spin off (confirmed, Decision 5). Created as [1-4-2-response-generic-template-content-type-header-is-ignored](../1-4-2-response-generic-template-content-type-header-is-ignored/ISSUE.md) | Separate root cause, affects all five formats, and fixing it changes headers for existing users | M | Med |
| N1. `Response.init()` ignores a second call without a log line | Note only | Useful to know, no action proposed | S | Low |
| N2. `Response.info()` JSDoc has an unclosed `{` in its `@returns` type | Note only | Cosmetic and unrelated | S | Low |
| N3. Five repeated merge branches | Note only | Covered by I1; refactor not worth the cost | M | Low |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| An application relied on the bug (for example it reads the HTML slot expecting XML, or built HTML routes around the XML defaults) | CHANGELOG entry states the old and new behavior and the version range. No Atlantis starter uses XML (Decision 3) |
| An affected application's CloudFront cache holds an old wrong body | Clears at the TTL. Mention in the CHANGELOG detail only if a user reports it; no action |
| The new tests conflict with other tests through the once-per-process rule | One `init()` per test file, same pattern as the sibling spec. Jest gives each file its own module registry |
| A new XML example misleads users about `Content-Type` | The docs example states that a `Response` built from the template carries `Response.CONTENT_TYPE.XML` and shows `addHeader()` for another type (the Content-Type fix is a separate spin-off, Decision 5) |

## 9. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Release type (Q1, option A): PATCH in 1.4.2, entry under Fixed. | The option is declared in the JSDoc and types and never worked, so the fix restores documented behavior. The CHANGELOG carries the migration note. |
| 2 | Docs (Q2, option A): add an `xmlResponses` example to `response-management.md` and `configuration-options.md`. | Only place users learn the template shape. Must describe the `Content-Type` behavior accurately (Section 3). |
| 3 | Downstream check (Q3, option A): maintainer reports that no Atlantis starter uses XML. No further check. | Closes C10 for the starters. Other applications remain unknown and are covered by the CHANGELOG note. |
| 4 | Issue number (Q4, option B): no GitHub issue; the CHANGELOG entry links the spec only. | The convention forbids guessing a number. |
| 5 | Template `Content-Type` (Q5, option A): spin off a separate issue. This fix leaves `set()` and `Response.CONTENT_TYPE` alone. The docs example describes the current behavior. | Different root cause, changes headers for all five formats, and needs its own plan and tests. Residual risk: users who read the new XML example may still expect a template header to apply, handled by the docs text. |

## 10. Open questions and recommendations

No open questions.
