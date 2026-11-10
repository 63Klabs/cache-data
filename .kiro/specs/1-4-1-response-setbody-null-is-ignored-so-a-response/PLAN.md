# Response.setBody(null) is ignored, so a response cannot be sent with no body (e.g. 202 Accepted)

> **Status**: Draft, 5 open questions
> **Issue**: [ISSUE.md](ISSUE.md) (GitHub [#252](https://github.com/63Klabs/cache-data/issues/252))
> **Reviewed against**: `dev` at `f746cde` on 2026-11-08
> **Release**: v1.4.1 (not yet published; npm `latest` is 1.4.0), see D1

## 1. Summary

`Response.set()` assigns a body only when it is truthy (`src/lib/tools/Response.class.js:247`), and `reset()` fills the body from a generic status template whenever none is supplied (`:219`). Every new `Response` therefore holds a template body (`{"message":"Success"}` for 200), and no public call can replace it with `null`, although `finalize()` already returns `body: null` for a null body (`:663`). A handler cannot send a bodiless 202 or 204. The reporter works around it by writing the private `_body` field in `atlantis-mcp`.

The repository's own routing example shows the pattern the issue asks for. `docs/01-advanced-implementation-for-web-service/routing-patterns.md:250` calls `response.setBody(null)` after `setStatusCode(204)`. Today that example sends the template body with a 204. The issue says the docs never suggest this, so that claim is not accurate (C9).

Recommended fix: add a public `clearBody()` that sets the body to `null` (the issue's option 2), and leave `set()`, `setBody()`, `reset()` and the constructor unchanged. Existing callers see no difference. The same change corrects the 204 example, documents that `setBody()` ignores falsy values, and shows `clearBody()` paired with an explicit `Cache-Control`, because `finalize()` still adds `max-age` to a bodiless 2xx when `routeExpirationInSeconds` is set. One thing cannot be settled by reading: AWS does not document how API Gateway treats `body: null` (Q4).

## 2. Assessment of the issue

All "probe" evidence comes from read-only `node -e` runs on 2026-11-08 against `dev` at `f746cde`, using the test helpers in `test/helpers/`. Nothing was written and no AWS resource was touched. The probes set `routeExpirationInSeconds: 3600` to match the reporter's configuration.

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | `set()` assigns the body only when truthy | Confirmed | `Response.class.js:247` (`if (obj?.body) ...`). It sits beside the same check for `statusCode` and `headers` (`:245-246`) and dates from the first version of the class (commit `53629b9`, 2024-11-15), so it reads as a "was this property supplied" test, not a decision that `null` must not clear a body |
| C2 | A new `Response` starts with the 200 template body and `setBody(null)` leaves it | Confirmed | Constructor calls `reset()` (`:104-107`), which takes `obj?.body ?? template.body` (`:219`). Probe: `setStatusCode(202); setBody(null)` finalizes as `202 {"message":"Success"}` |
| C3 | Observed table for `setBody(null)`, `setBody(undefined)`, `setBody('')` | Confirmed row for row | Probe output matches the issue exactly, including `[object Object]` and `text/plain` for `''`. `''` switches the type because `inspectBodyContentType('')` returns TEXT (`:352-363`) while the body assignment is skipped |
| C4 | The `max-age=3600` comes from the response | Partially confirmed | It comes from the reporter's `routeExpirationInSeconds` setting. The default is `0` (`:83`) and adds no header for status below 400 (`:708`) |
| C5 | Falsy values other than `null`, `undefined`, `''` are also dropped | Confirmed, and wider than reported | Probe: `setBody(0)` and `setBody(false)` also leave the template. The issue does not mention them |
| C6 | `reset({ statusCode: 202, body: null })` falls back to the template | Confirmed, with a different template | The mechanism is `??` at `:219`. There is no 202 template, so `response()` falls back to the 500 template (`generic.response.js:67`). Probe: body is `{"message":"Internal Server Error"}`. `new Response(req, {statusCode: 204, body: null})` does the same |
| C7 | `finalize()` already supports a null body | Confirmed | `:663` skips stringifying, `:761` logs 0 bytes. Probe with `_body = null`: `204 null application/json` |
| C8 | `getBody()` and `toObject()` document `null` | Confirmed | JSDoc at `:279` and `:583`. The `setBody` param type excludes `null` (`:484`), and `types/lib/tools/index.d.ts:1667` declares `toObject()` as `body: string` |
| C9 | "The docs do not say `setBody(null)` clears the body" | **Contradicted in part** | `routing-patterns.md:249-251` shows `setStatusCode(204); setBody(null)` as the delete handler (added 2026-02-27 in `bc9d1d9`). It does not do what it implies |
| C10 | The `finalize()` null branch can only be reached through the private field | Mostly confirmed | A custom template with `body: null` works through the constructor on a fresh instance, by accident, because `_body` defaults to `null` (`:90`). Probe: `Response.init({jsonResponses:{response202:{body:null}}})` then `new Response(req,{statusCode:202})` gives `null`. The same template used through `reset()` on an existing instance does not |
| C11 | `finalize()` honors application-set `Cache-Control` and `Expires` (#223) | Confirmed | `:703-713`. Probe: `_body = null` plus `addHeader('Cache-Control','no-store')` finalizes as `202 null application/json no-store`. Covered by `test/response/cache-header-*-tests.jest.mjs` |
| C12 | Behavior is the same on the current branch as in 1.4.0 | Confirmed | `git diff v1.4.0 HEAD` on `Response.class.js` changes only the log-field sanitizer and the `_log` call sites |
| C13 | Option 3 (default 202/204 templates with a `null` body) fixes the reported sequence | **Not confirmed** | `setStatusCode()` calls `set({statusCode})` and never swaps the body (`:245`, `:466`). The reported `setStatusCode(202); setBody(null)` would still keep the 200 template. Templates only help `reset()` and the constructor |
| C14 | Option 1 (`'body' in obj && obj.body !== undefined`) makes `setBody('')` send no body | Not confirmed | It would assign `''`, which finalizes as an empty string with `text/plain`, not `null`. It would also assign `0` and `false` |
| C15 | API Gateway accepts `body: null` from the Lambda proxy response | **Needs runtime verification** | AWS shows `body` as a string and says other output formats return 502 ([proxy output format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html)). It does not mention `null` or an omitted body. Check described in Q4 |
| C16 | `atlantis-mcp` ships the `_body = null` workaround and a test that breaks if the field is renamed | Unverifiable here | Other repository. Consistent with C7 and C11 |

## 3. Current state

- **Fields and construction.** `_body` defaults to `null` (`Response.class.js:90`). The constructor always calls `reset(obj, contentType)` (`:104-107`).
- **`reset()`** (`:205-222`) resolves a content type, picks the generic module for it, then builds `{statusCode, headers, body}` with `??` fallbacks to the template for that status and passes it to `set()`. Because `set()` ignores falsy bodies, `reset({ body: '' })` leaves the previous body in place (probe: body stayed `{"a":1}`).
- **`set()`** (`:237-250`) assigns `statusCode`, `headers` and `body` only when truthy, then always writes the `Content-Type` header. `setStatusCode()`, `setHeaders()` and `setBody()` are one-line wrappers around it (`:466`, `:478`, `:492`).
- **`finalize()`** (`:648-745`) keeps a `null` body as `null` (`:663`), applies config-derived `Expires` and `Cache-Control` only when the application did not set them (`:701-715`), and logs 0 bytes for a null body (`:761`). It applies the route expiration to every status below 400, including 202 and 204.
- **Templates.** `STATUS_CODE_MAP` covers 200, 400, 401, 403, 404, 405, 408, 418, 427 and 500 (`generic.response.js:16-28`). Any other status resolves to the 500 template (`:67`). Probe: `reset({statusCode: 201})` yields `201 {"message":"Internal Server Error"}`. Ten-code lists are pinned in `test/response/generic-response-module-tests.jest.mjs` and `...-property-tests.jest.mjs`.
- **Why it is this way.** The truthiness checks come from the original class. The spec `1-3-10-clean-up-generic-responses` centralized the templates without adding statuses. The spec `1-3-12-fix-cache-response-headers` (#223) let the application override cache headers, which is what makes a bodiless response with `no-store` possible downstream.
- **Public surface.** `Response` is exported from `src/lib/tools/index.js` and declared in `types/lib/tools/index.d.ts` (`setBody` at `:1638`, `reset` at `:1553`, `set` at `:1561`). The documentation tests scan `src/lib/tools/` JSDoc, so a new method needs complete JSDoc.
- **Tests that touch this area.** No test asserts that falsy bodies are ignored, and none runs `finalize()` with a null body. `test/response/response-tests.jest.mjs` and `set-message-*` cover the happy path with truthy bodies. `Response.class.js` is not on either migration "source immutability" list, so editing it does not trip those tests.
- **Packaging.** `docs/`, `scripts/` and `.kiro/` are excluded from the npm package (`.npmignore`), so only `src/` JSDoc and `types/` ship.

## 4. Review

### 4.1 Security

- **Trust boundary.** `clearBody()` takes no input. The caller is the application, so there is no new attacker-controlled surface, no injection path, and no change to IAM or logging.
- **Silent retention is fail-open.** Because `setBody(null)` is ignored, a handler that fills a body with user data and then calls `setStatusCode(403); setBody(null)` to discard it still sends the data. Probe: the pre-populated body is returned with the 403. Two safe ways to discard a body already exist or are planned: `reset()` (documented) and `clearBody()` (this spec). Documenting that `setBody(null)` does nothing closes the gap in documentation but not in behavior for code that already relies on it; this is the security argument for Q1 option B or C, weighed against the compatibility risk there.
- **Sensitive-data logging.** No change. The `RESPONSE` log line logs only byte count, not body content.
- **Cache metadata on bodiless responses.** A 2xx with `max-age` set from config is not harmful on its own, but a 202 is not meant to be cached, and the docs should show the explicit header (Q3).
- **Disclosure.** This is an enhancement on a public issue, not a vulnerability. The plan can stay published.

### 4.2 Software engineering

- **Backward compatibility (highest priority, AGENTS.md 2.1).** Making `set()` assign `null`, or any falsy value, changes what existing callers get. An application that does `response.setBody(maybeNull)` receives `{"message":"Success"}` today and would receive an empty body after the change. That is a client-visible change on 200 responses, not only on 202 and 204. A new method changes nothing for existing callers.
- **Semver.** AGENTS.md 2.2 classes a new function as MINOR. The unpublished 1.4.1 already contains a new environment variable (`CACHE_DATA_TRUSTED_PROXY_HOPS`), and the sibling spec decided to ship it as a patch. This spec follows that precedent (D1).
- **Fit with existing patterns.** The class uses small one-line setters that return `void` (`setBody`, `setStatusCode`, `setHeaders`) as arrow-function properties. `clearBody` belongs beside `setBody` and follows the same shape. No new class or layer is needed.
- **Interactions with a null body (now reachable through the public API).**
  - `addToJsonBody()` and `setMessage()` treat `null` as an object (`typeof null === 'object'`, `:549-552`), so they build a new body from it. Probe: `{"message":"hello"}` after `setMessage` on a null body. This contradicts the `setMessage` JSDoc ("no-op if the body is not a JSON object", `:557`). It is existing behavior and rarely hit; the plan documents it rather than changing it (N4).
  - `reset()` after `clearBody()` restores a template body. This is the documented meaning of `reset()` and needs one sentence in the docs.
  - `setStatusCode()` after `clearBody()` leaves the body null; it only changes `statusCode` and `Content-Type`.
  - The `Content-Type` header stays `application/json` on a bodiless response, because `set()` always writes it and `finalize()` re-adds it when missing (`:654-656`). RFC 9110 allows headers on a 204, so this is acceptable; the docs mention it.
- **Same root cause, different place.** `set()` drops falsy values in `reset()` too (probe: `reset({ statusCode: 202, body: '' })` keeps the old body). Fixing it means changing `set()` or `reset()` semantics, so it is listed as S4.
- **Tests and docs that change.** New: unit tests for `clearBody()`, a property test, and characterization tests that pin today's "falsy is ignored" behavior so any later change is deliberate. Docs: `routing-patterns.md:249-251`, a new section in `response-management.md`, `Response` JSDoc, `types/lib/tools/index.d.ts`, CHANGELOG.
- **Lint.** `Response.class.js` has 0 ESLint errors today (recorded baseline), so the changed file should stay at 0.

### 4.3 Cloud engineering

- **Where it lands.** Lambda handler (proxy integration) to API Gateway REST, optionally behind CloudFront. This package builds the proxy response object. The only infrastructure-facing question is what API Gateway does with `"body": null`.
- **Documented contract.** AWS specifies `body` as a string and says a response in another format produces a 502. It does not address `null` or an omitted body (C15). The reporter reports this working in `atlantis-mcp`, but that is not a source I can cite here, so Q4 asks for a direct check on a test stage.
- **HTTP semantics.** A 204 response is terminated by the header section and cannot contain content ([RFC 9110 section 15.3.5](https://www.rfc-editor.org/rfc/rfc9110.html#name-204-no-content)). Today a 204 sent through this package carries the template JSON, which is outside that rule.
- **Infrastructure as code.** No template, parameter, IAM, KMS or stack change. The package is code only.
- **Stages.** Behavior does not depend on stage configuration. The only environment-dependent value is `routeExpirationInSeconds`, which `Response.init()` reads.
- **Observability.** The `RESPONSE` log line already writes 0 bytes for a null body. No new log line, metric or alarm. Dashboards that parse the line positionally are unaffected.
- **Rollout and rollback.** npm release, no deployment ordering. Rollback is a package downgrade. Downstream, `atlantis-mcp` can drop its private-field workaround after 1.4.1 is published (N5).
- **Cost and quotas.** None.

## 5. Gaps and observations

- **G1.** The issue says the docs never suggest `setBody(null)`. `routing-patterns.md:250` does (C9). The fix therefore also corrects documentation that is wrong today.
- **G2.** The issue lists option 3 as a way to avoid the "Success" body on 202 and 204. It would not change the reported call sequence (C13), and it would also change `response(n)` for three statuses that currently return the 500 template.
- **G3.** The issue's option 1 does not turn `setBody('')` into a null body (C14), and it would start assigning `0` and `false`.
- **G4.** The issue shows `max-age=3600` as a symptom but proposes nothing for it. After any fix, a bodiless 202 or 204 still gets `max-age` unless the application sets `Cache-Control` itself (Q3).
- **G5.** The issue does not say what `Content-Type` a bodiless response should carry. It stays `application/json` (4.2).
- **G6.** `types/lib/tools/index.d.ts` is already inaccurate for this area: `toObject()` declares `body: string` (`:1667`) and `finalize()` declares `void` (`:1686`) although it returns the response object. Neither is changed here (N3).
- **G7.** `docs/features/tools/README.md:1242-1247` shows `new Response()` with no arguments, `setHeader()` and `get()`. None of these exist. This is the section where a reader would look for the new method (I3).
- **G8.** Two assumptions need confirming with the user: that `clearBody` is an acceptable name (D2), and that 1.4.1 is the right release for a new public method (D1).
- **G9.** Affected tests: none must change. Added tests are listed in 6.4. Affected docs: `routing-patterns.md`, `response-management.md`, `docs/features/tools/README.md`, `types/`, CHANGELOG.

## 6. Proposed approach

Pending answers: mechanism (Q1), `reset()` and constructor handling of `body: null` (Q2), cache headers (Q3), runtime verification (Q4). The text below describes the recommended path (Q1 A, Q2 A, Q3 A).

### 6.1 `Response.clearBody()`

- Add `clearBody = () => { this._body = null; }` directly after `setBody` (`Response.class.js:492-495`). No arguments, returns `void`, like its neighbors.
- It changes only the body. Status code, headers (including `Content-Type`) and cache headers are untouched.
- `finalize()` needs no change. It already returns `body: null`, keeps the `Content-Type`, applies or preserves cache headers, and logs 0 bytes.
- The private field name `_body` stays as it is and is not documented as API (D3).
- JSDoc follows the project standard: description, `@returns {void}`, and two `@example` blocks (a 204 delete handler, and a 202 with `Cache-Control: no-store`). It states that `reset()` afterwards restores a template body and that `addToJsonBody()` and `setMessage()` on a null body build a new body.

### 6.2 Make the existing behavior accurate in docs and JSDoc

- `setBody()` and `set()` JSDoc: say that a falsy value (`null`, `undefined`, `''`, `0`, `false`) is not assigned and the previous body stays; use `clearBody()` to send no body and `reset()` to restore the template.
- `routing-patterns.md:249-251`: replace `setBody(null)` with `clearBody()`, and add the `Cache-Control: no-store` pairing.
- `response-management.md`: add a "Sending a response with no body" section after "Overriding cache headers per response" (`:222-283`), covering 202, 204, the `Content-Type` that remains, the cache-header pairing, and the `reset()` interaction.
- `docs/features/tools/README.md:1242-1247`: replace the sample with calls that exist (D6).
- `types/lib/tools/index.d.ts`: declare `clearBody(): void;` beside `setBody` (`:1638`) with matching JSDoc.

### 6.3 Release notes

CHANGELOG `v1.4.1 (unreleased)`, under Added: `Response.clearBody()`, with the spec link and `addresses [#252](https://github.com/63Klabs/cache-data/issues/252)`. Under Fixed: the 204 example in the routing documentation. Existing text is not edited.

### 6.4 Tests

- `test/response/response-clear-body-unit-tests.jest.mjs`: after `clearBody()` the status code is unchanged and `finalize()` returns `body: null`; `getBody()` and `toObject()` return `null`; `Content-Type` is kept; `reset()` restores a template; `setMessage()` on a null body creates one; an application-set `Cache-Control` and `Expires` survive; the log line reports 0 bytes.
- `test/response/response-clear-body-property-tests.jest.mjs` (fast-check, no explicit `seed`, default 100 runs, no child processes): for any status code in 200 to 599 and any prior JSON body, `clearBody()` then `finalize()` yields `body: null` and the same status code.
- Characterization tests: `setBody(null | undefined | '' | 0 | false)` leave the prior body unchanged. These pin the compatibility decision in Q1.
- Type check: add a `clearBody()` call to `test/types/consumer-tools.ts` (compiled with `tsc --noEmit`).
- Use the existing Jest setup pattern (`Response.init` once per process, helpers in `test/helpers/`). A case that needs `routeExpirationInSeconds: 0` uses subprocess isolation like `cache-header-preservation-property-tests.jest.mjs`.
- Lint only the changed files and compare error counts with the baseline.

### 6.5 Alternatives considered

| Alternative | Why not chosen |
|-------------|----------------|
| Issue option 1: `set()` assigns any value that is not `undefined` | Changes results for existing callers that pass `null`, `''`, `0` or `false` (empty 200 instead of the template). Does not make `''` null (C14) |
| Issue option 3: 202 and 204 templates with a `null` body | Does not change the reported call sequence (C13). Changes `response(n)` output for three statuses, touches five format modules and ten-code tests, and the declared `GenericResponseModule` type. Kept as spin-off S2 |
| Issue option 4: document only | No way to send no body through the public API. Its documentation part is already included in 6.2 |
| Treat only exactly `null` as "no body" in `set()` | Smaller than option 1 but still a behavior change for every caller passing a nullable value. Offered as Q1 option B |
| Document `_body` as a supported field | Exposes a private field and freezes its name |
| Stop adding `Content-Type` for a null body | `finalize()` re-adds it (`:654-656`); changing both is a larger behavior change than the issue needs |

## 7. Related improvements

| Item | Class | Rationale | Effort | Risk |
|------|-------|-----------|--------|------|
| I1. Correct the 204 example in `routing-patterns.md` | Include | The documented pattern is wrong today | S | Low |
| I2. State in JSDoc that `setBody()`/`set()` ignore falsy values | Include | Accuracy; closes the surprise the issue reports | S | Low |
| I3. Replace the invalid `Response` sample in `docs/features/tools/README.md` | Include (D6) | Docs-only, in the section a reader would use for the new method | S | Low |
| I4. Declare `clearBody()` in `types/` and add it to the consumer type test | Include | TypeScript consumers | S | Low |
| I5. Characterization tests for falsy `setBody()` | Include | Makes any later change to Q1 deliberate | S | Low |
| S1. `Response.init()` merges `xmlResponses` into the HTML slot (`Response.class.js:163` assigns to `#htmlResponses`) | Spin off | Separate root cause. Probe: a custom XML 200 template replaced the HTML 200 template. Fixing it changes which templates XML and HTML users get | S | Med |
| S2. Generic templates for 201, 202, 204 and other unlisted statuses (today they return the 500 body, `generic.response.js:67`) | Spin off | Issue option 3. Needs the pinned ten-code tests, five modules and the type updated | M | Med |
| S3. `setStatusCode()`/`setHeaders()` flip an HTML or text `Content-Type` to JSON because `inspectBodyContentType(undefined)` returns JSON (`:352-353`) | Spin off | Probe: HTML body, then `setStatusCode(404)`, finalizes as `application/json` with body `["<html>..."]`. Separate root cause | S | Med |
| S4. `reset()` ignores a falsy supplied body and keeps the previous one | Spin off or drop (Q5) | Same truthiness check as the issue, but fixing it changes `set()`/`reset()` semantics, which Q1 A avoids | S | Low to Med |
| S5. `finalize()` adds route `max-age` to 202, 204 and 3xx regardless of method or body | Note only (Q3) | Default behavior change; the application can already override per response | M | Med |
| N1. `reset()` and `set()` with no argument throw `TypeError` (`Response.inspectContentType(obj)` reads `obj.headers`) | Note only | Declared as required in `types/`; no reported use | S | Low |
| N2. Status `427` is labeled "Too Many Requests"; IANA lists 427 as unassigned and 429 as Too Many Requests ([registry](https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml)) | Note only | Public `response427` export pinned by tests; a fix would add 429 and keep 427 | S | Med |
| N3. `types/lib/tools/index.d.ts`: `toObject()` body type and `finalize()` return type are wrong | Note only | Widening a return type can break consumer compilation | S | Med |
| N4. `addToJsonBody()`/`setMessage()` build an object from a `null` body | Note only | Documented in the `clearBody()` JSDoc | S | Low |
| N5. After 1.4.1 is published, `atlantis-mcp` can replace `response._body = null` with `clearBody()` | Note only | Other repository; nothing to file until the release exists | S | Low |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| API Gateway rejects `body: null` with a 502 | Verify on a test stage before release (Q4). If it fails, `finalize()` would need to emit an empty string or omit `body`, which becomes a new decision |
| Users call `clearBody()` on a 202 or 204 and still get `max-age` from config | The docs and both examples set `Cache-Control: no-store`; revisit with S5 (Q3) |
| A later change to `set()` silently alters falsy-body behavior | Characterization tests (I5) |
| `setMessage()` after `clearBody()` re-creates a body on a 204 | Stated in the JSDoc and docs (N4) |
| `reset()` after `clearBody()` restores the template | Stated in the JSDoc and docs |
| Documentation or type tests fail on the new method | Complete JSDoc (`@returns`, two `@example`); declare the type; run `test/documentation/` and the type tests |
| Q1 option B, C or D chosen: empty 200 for apps passing nullable values | Record under Changed in the CHANGELOG; keep the characterization tests updated to the new rule |
| `.kiro` spec text is published | No exploit detail in this plan; it describes an API gap |

## 9. Locked decisions

No question has been answered yet. The items below were decided in this plan without asking. Veto any of them.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | The spec stays under the `1-4-1` prefix and the change ships in v1.4.1 | 1.4.1 is unpublished (npm `latest` is 1.4.0, CHANGELOG says "unreleased"). Precedent: `1-4-1-trusted-client-ip` shipped a new environment variable in this version. A strict reading of AGENTS.md 2.2 would make a new method MINOR, so say so if you want 1.5.0 |
| D2 | The method is `clearBody()`: no arguments, returns `void`, sets `_body = null` and nothing else | Matches the issue's wording and the `setX` / `addX` shape of the class |
| D3 | `_body` keeps its name and stays undocumented | Downstream tests depend on it today; making it API would freeze it |
| D4 | `finalize()` is not modified for the null-body path | It already handles `null` correctly (C7) |
| D5 | No change to the `Content-Type` header on a bodiless response | `finalize()` re-adds it anyway; RFC 9110 allows it |
| D6 | Fix the invalid `Response` sample in `docs/features/tools/README.md` as part of this change | Docs only; it is where `clearBody()` would be mentioned |
| D7 | Tests: unit, property, characterization, and a type check, no change to existing tests | Per AGENTS.md 2.3 and `test-requirements` |

## 10. Open questions and recommendations

### Q1. How should a handler send no body?
**Why it matters:** This is the core design choice. It decides whether existing callers see any change.
**Options:**
- **A. Add `clearBody()` only.** `set()`, `setBody()`, `reset()` and the constructor are unchanged. The issue's option 2. Zero change for existing callers; the new method is the only way to get a null body through `Response`.
- **B. Make `setBody(null)` clear the body, with no new method.** Only exactly `null` counts; `undefined`, `''`, `0` and `false` stay ignored. Matches the 204 example in the docs and the reporter's first expectation. Existing callers that pass a null value get an empty body instead of the template.
- **C. Do both A and B.** Explicit method plus the intuitive call. Same compatibility cost as B.
- **D. The issue's option 1 as written.** `set()` assigns any value that is not `undefined`, so `''`, `0` and `false` are assigned too. `''` becomes an empty text body, not `null`. Widest behavior change.
- **E. Other.**
**Recommendation:** A. Backwards compatibility is the highest priority for this package (AGENTS.md 2.1) and it runs in production at volume. B, C and D turn today's silent "Success" body into an empty 200 for any application that passes a nullable value, and the failure shows up in clients, not in tests. A delivers the capability, keeps the repro working with one added call, and `setBody(null)` can be revisited in a major version. The security lens favors B or C for code that already calls `setBody(null)` expecting to discard data (4.1); `reset()` already covers that case.
**Answer:** _pending_

### Q2. Should `reset()` and the constructor treat an explicit `body: null` as "no body"?
**Why it matters:** Today `new Response(req, { statusCode: 204, body: null })` sends `{"message":"Internal Server Error"}` with a 204, and `reset({ statusCode: 202, body: null })` does the same. The `??` fallback (`:219`) is how callers ask for "the template for this status".
**Options:**
- **A. No.** `null` or a missing body keeps meaning "use the template". Document it, and call `clearBody()` after `reset()` or the constructor.
- **B. Yes, when the `body` key is present and `null`.** One-step construction of a bodiless response. Changes the result for callers that pass objects with `body: null` (for example an `ApiRequest.format()` result) expecting the template.
- **C. Other.**
**Recommendation:** A, for the same compatibility reason as Q1. It also keeps `reset()` and the constructor from depending on how Q1 is answered.
**Answer:** _pending_

### Q3. Should a bodiless response skip the config-derived `Cache-Control` and `Expires`?
**Why it matters:** `finalize()` adds `max-age=routeExpirationInSeconds` to every status below 400 (`:708`), so a 202 or 204 gets caching headers when the application configures a route expiration. The reporter overrides it with `no-store`.
**Options:**
- **A. No code change.** Document the `Cache-Control: no-store` pairing in the JSDoc and docs. Track the general question as S5.
- **B. Skip the config-derived headers when the body is `null`.** Fixes the reported case without per-response code. Changes the headers of any existing response that ends with a null body.
- **C. Skip them for 202 and 204 regardless of body.** Targets the statuses in the issue. Changes headers for existing 202 and 204 responses that carry a body.
- **D. Other.**
**Recommendation:** A. The application can already set both headers (#223), which is what the reporter does. B and C change defaults for existing responses, and the right rule (status, method, or body) is a separate design question.
**Answer:** _pending_

### Q4. How do we verify that API Gateway accepts `body: null`?
**Why it matters:** AWS documents `body` as a string and does not mention `null` (C15). If REST API returns 502 for it, the design for `finalize()` changes before release.
**Options:**
- **A. One read-only check on a test stage.** You name a test-stage route that already returns the bodiless 202 (for example in `atlantis-mcp`), and I send a single `curl -i` request to it. Success means the expected status code, no 502, and no body in the response. Test stages only, nothing deployed or changed.
- **B. Rely on the reporter's use and verify after release.** No traffic now; confirm on a starter test stack once 1.4.1 is out. Leaves a risk that a rework lands in a later patch.
- **C. Deploy a small test function first.** A write to your account (costs a deployment) that tests both `null` and an omitted body. Most complete; needs your approval.
- **D. Other.**
**Recommendation:** A, if you can name the route and confirm it is safe to call. It answers the question in one request. Otherwise B.
**Answer:** _pending_

### Q5. What should happen to the related findings?
**Why it matters:** Each was verified by probe or code reading and is outside this fix. Per the project process I do not create spin-off issues here; confirmed ones can be handed to the issue-creation skill.
**Items:** S1 `xmlResponses` written into the HTML slot. S2 templates for 201, 202, 204 and other unlisted statuses. S3 `Content-Type` flips to JSON after `setStatusCode()` on an HTML or text body. S4 `reset()` keeps the previous body when the supplied body is falsy.
**Options (answer per item, for example "S1 A, S2 A, S3 A, S4 B"):**
- **A. Spin off** as a separate issue and spec.
- **B. Drop** (note only).
- **C. Fold in** to this spec (widens scope and, for S2 to S4, changes behavior for existing users).
- **D. Other.**
**Recommendation:** S1 A, S2 A, S3 A, S4 B. S1 and S3 are real defects with their own root causes; S2 is the issue's option 3 and is larger than this fix; S4 only matters if `set()` changes, which Q1 A avoids.
**Answer:** _pending_
