# Response.setBody(null) is ignored, so a response cannot be sent with no body (e.g. 202 Accepted)

> **Status**: Locked on 2026-11-10 (UTC); reopened and re-locked the same day for Q7 (method name)
> **Issue**: [ISSUE.md](ISSUE.md) (GitHub [#252](https://github.com/63Klabs/cache-data/issues/252))
> **Reviewed against**: `dev` at `f746cde` on 2026-11-08
> **Release**: v1.4.1 (not yet published; npm `latest` is 1.4.0), see D1

## 1. Summary

`Response.set()` assigns a body only when it is truthy (`src/lib/tools/Response.class.js:247`), and `reset()` fills the body from a generic status template whenever none is supplied (`:219`). Every new `Response` therefore holds a template body (`{"message":"Success"}` for 200), and no public call can replace it with `null`, although `finalize()` already returns `body: null` for a null body (`:663`). A handler cannot send a bodiless 202 or 204. The reporter works around it by writing the private `_body` field in `atlantis-mcp`.

The repository's own routing example shows the pattern the issue asks for. `docs/01-advanced-implementation-for-web-service/routing-patterns.md:250` calls `response.setBody(null)` after `setStatusCode(204)`. Today that example sends the template body with a 204. The issue says the docs never suggest this, so that claim is not accurate (C9).

Recommended fix: add a public `setBodyToNull()` that sets the body to `null` (the issue's option 2, which the issue names `clearBody()`; renamed in Q7), and leave `set()`, `setBody()`, `reset()` and the constructor unchanged. Existing callers see no difference. The same change corrects the 204 example, documents that `setBody()` ignores falsy values, and shows `setBodyToNull()` paired with an explicit `Cache-Control`, because `finalize()` still adds `max-age` to a bodiless 2xx when `routeExpirationInSeconds` is set. One thing cannot be settled by reading: AWS does not document how API Gateway treats `body: null` (Q4).

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
| C15 | API Gateway accepts `body: null` from the Lambda proxy response | **Confirmed by runtime check** (2026-11-10 UTC) | AWS shows `body` as a string and says other output formats return 502 ([proxy output format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html)). It does not mention `null` or an omitted body. The temporary test stack (Q4 C, Q6 B) showed no 502 for `null`, omitted or `""` bodies on a Regional and an edge-optimized REST API; see "Result of the API Gateway check" below the table |
| C16 | `atlantis-mcp` ships the `_body = null` workaround and a test that breaks if the field is renamed | Unverifiable here | Other repository. Consistent with C7 and C11 |

**Result of the API Gateway check (C15).** On 2026-11-10 (UTC) I deployed a temporary stack in the test account: one Node.js 22 Lambda function that returns the proxy response shape `finalize()` produces, behind a Regional REST API and an edge-optimized REST API (both with a Lambda proxy integration and a `test` stage). I sent one `GET` per combination of body variant (`null`, omitted, `""`, JSON string as control) and status (202, 204) to each API, 16 requests in all. The Lambda always set `Content-Type: application/json` and `Cache-Control: no-store`. Endpoint IDs and the account are left out of this file.

| Lambda `body` | 202 on Regional and edge | 204 on Regional and edge |
|---------------|--------------------------|--------------------------|
| `null` | 202, `content-length: 0`, empty body | 204, empty body, no `Content-Type` |
| omitted | same as `null` | same as `null` |
| `""` | same as `null` | same as `null` |
| `{"message":"control"}` | 202, 21-byte body | 204, empty body, no `Content-Type` |

- No request returned a 502. `null`, an omitted body and `""` are indistinguishable at the client.
- `Cache-Control: no-store` set by the application reached the client on every response, including through CloudFront on the edge-optimized API.
- On a 202 the `Content-Type` header is kept even with no body, which matches D5.
- On a 204, API Gateway removes both the body and the `Content-Type` header even when the Lambda returns a body (the string control). A 204 sent through REST API from this package therefore never carries the template JSON to the client; the template body only matters for non-gateway consumers and for `toObject()`/`finalize()` output. This softens the 204 impact stated in 4.3 and in the S2 spin-off.
- Cleanup: the stack was deleted and I confirmed that no stack, REST API, Lambda function, log group or role with the probe name remains. The template folder in the workspace was removed.
- Not covered: HTTP API, ALB and Lambda function URLs (Q6 option C was not chosen).

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

- **Trust boundary.** `setBodyToNull()` takes no input. The caller is the application, so there is no new attacker-controlled surface, no injection path, and no change to IAM or logging.
- **Silent retention is fail-open.** Because `setBody(null)` is ignored, a handler that fills a body with user data and then calls `setStatusCode(403); setBody(null)` to discard it still sends the data. Probe: the pre-populated body is returned with the 403. Two safe ways to discard a body already exist or are planned: `reset()` (documented) and `setBodyToNull()` (this spec). Documenting that `setBody(null)` does nothing closes the gap in documentation but not in behavior for code that already relies on it; this is the security argument for Q1 option B or C, weighed against the compatibility risk there.
- **Sensitive-data logging.** No change. The `RESPONSE` log line logs only byte count, not body content.
- **Cache metadata on bodiless responses.** A 2xx with `max-age` set from config is not harmful on its own, but a 202 is not meant to be cached, and the docs should show the explicit header (Q3).
- **Disclosure.** This is an enhancement on a public issue, not a vulnerability. The plan can stay published.

### 4.2 Software engineering

- **Backward compatibility (highest priority, AGENTS.md 2.1).** Making `set()` assign `null`, or any falsy value, changes what existing callers get. An application that does `response.setBody(maybeNull)` receives `{"message":"Success"}` today and would receive an empty body after the change. That is a client-visible change on 200 responses, not only on 202 and 204. A new method changes nothing for existing callers.
- **Semver.** AGENTS.md 2.2 classes a new function as MINOR. The unpublished 1.4.1 already contains a new environment variable (`CACHE_DATA_TRUSTED_PROXY_HOPS`), and the sibling spec decided to ship it as a patch. This spec follows that precedent (D1).
- **Fit with existing patterns.** The class uses small one-line setters that return `void` (`setBody`, `setStatusCode`, `setHeaders`) as arrow-function properties. `setBodyToNull` belongs beside `setBody` and follows the same shape. No new class or layer is needed.
- **Interactions with a null body (now reachable through the public API).**
  - `addToJsonBody()` and `setMessage()` treat `null` as an object (`typeof null === 'object'`, `:549-552`), so they build a new body from it. Probe: `{"message":"hello"}` after `setMessage` on a null body. This contradicts the `setMessage` JSDoc ("no-op if the body is not a JSON object", `:557`). It is existing behavior and rarely hit; the plan documents it rather than changing it (N4).
  - `reset()` after `setBodyToNull()` restores a template body. This is the documented meaning of `reset()` and needs one sentence in the docs.
  - `setStatusCode()` after `setBodyToNull()` leaves the body null; it only changes `statusCode` and `Content-Type`.
  - The `Content-Type` header stays `application/json` on a bodiless response, because `set()` always writes it and `finalize()` re-adds it when missing (`:654-656`). RFC 9110 allows headers on a 204, so this is acceptable; the docs mention it.
- **Same root cause, different place.** `set()` drops falsy values in `reset()` too (probe: `reset({ statusCode: 202, body: '' })` keeps the old body). Fixing it means changing `set()` or `reset()` semantics, so it is listed as S4.
- **Tests and docs that change.** New: unit tests for `setBodyToNull()`, a property test, and characterization tests that pin today's "falsy is ignored" behavior so any later change is deliberate. Docs: `routing-patterns.md:249-251`, a new section in `response-management.md`, `Response` JSDoc, `types/lib/tools/index.d.ts`, CHANGELOG.
- **Lint.** `Response.class.js` has 0 ESLint errors today (recorded baseline), so the changed file should stay at 0.

### 4.3 Cloud engineering

- **Where it lands.** Lambda handler (proxy integration) to API Gateway REST, optionally behind CloudFront. This package builds the proxy response object. The only infrastructure-facing question is what API Gateway does with `"body": null`.
- **Documented contract.** AWS specifies `body` as a string and says a response in another format produces a 502. It does not address `null` or an omitted body (C15). The runtime check in section 2 shows that REST API (Regional and edge-optimized) accepts `null`, an omitted body and `""` and sends no body, with the application's `Cache-Control` intact. The same check showed that API Gateway strips the body and `Content-Type` from any 204.
- **HTTP semantics.** A 204 response is terminated by the header section and cannot contain content ([RFC 9110 section 15.3.5](https://www.rfc-editor.org/rfc/rfc9110.html#name-204-no-content)). Today the `Response` object for a 204 carries the template JSON, which is outside that rule. Behind REST API the client does not see it, because API Gateway removes the body of a 204 (section 2).
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
- **G8.** Two assumptions need confirming with the user: that `setBodyToNull` is an acceptable name (D2), and that 1.4.1 is the right release for a new public method (D1).
- **G9.** Affected tests: none must change. Added tests are listed in 6.4. Affected docs: `routing-patterns.md`, `response-management.md`, `docs/features/tools/README.md`, `types/`, CHANGELOG.

## 6. Proposed approach

Locked: mechanism (Q1 A), `reset()` and constructor handling of `body: null` (Q2 A), cache headers (Q3 A). The API Gateway check (Q4 C, Q6 B) passed, so `finalize()` stays unchanged (D4). The text below describes the locked path.

### 6.1 `Response.setBodyToNull()`

- Add `setBodyToNull = () => { this._body = null; }` directly after `setBody` (`Response.class.js:492-495`). No arguments, returns `void`, like its neighbors.
- It changes only the body. Status code, headers (including `Content-Type`) and cache headers are untouched.
- `finalize()` needs no change. It already returns `body: null`, keeps the `Content-Type`, applies or preserves cache headers, and logs 0 bytes.
- The private field name `_body` stays as it is and is not documented as API (D3).
- JSDoc follows the project standard: description, `@returns {void}`, and two `@example` blocks (a 204 delete handler, and a 202 with `Cache-Control: no-store`). It states that `reset()` afterwards restores a template body and that `addToJsonBody()` and `setMessage()` on a null body build a new body.

### 6.2 Make the existing behavior accurate in docs and JSDoc

- `setBody()` and `set()` JSDoc: say that a falsy value (`null`, `undefined`, `''`, `0`, `false`) is not assigned and the previous body stays; use `setBodyToNull()` to send no body and `reset()` to restore the template.
- `routing-patterns.md:249-251`: replace `setBody(null)` with `setBodyToNull()`, and add the `Cache-Control: no-store` pairing.
- `response-management.md`: add a "Sending a response with no body" section after "Overriding cache headers per response" (`:222-283`), covering 202, 204, the `Content-Type` that remains on a 202 (API Gateway removes it, and any body, from a 204), the cache-header pairing, the `reset()` interaction, and a note that the no-502 check covered REST API only.
- `docs/features/tools/README.md:1242-1247`: replace the sample with calls that exist (D6).
- `types/lib/tools/index.d.ts`: declare `setBodyToNull(): void;` beside `setBody` (`:1638`) with matching JSDoc.

### 6.3 Release notes

CHANGELOG `v1.4.1 (unreleased)`, under Added: `Response.setBodyToNull()`, with the spec link and `addresses [#252](https://github.com/63Klabs/cache-data/issues/252)`. Under Fixed: the 204 example in the routing documentation. Existing text is not edited.

### 6.4 Tests

- `test/response/response-set-body-to-null-unit-tests.jest.mjs`: after `setBodyToNull()` the status code is unchanged and `finalize()` returns `body: null`; `getBody()` and `toObject()` return `null`; `Content-Type` is kept; `reset()` restores a template; `setMessage()` on a null body creates one; an application-set `Cache-Control` and `Expires` survive; the log line reports 0 bytes.
- `test/response/response-set-body-to-null-property-tests.jest.mjs` (fast-check, no explicit `seed`, default 100 runs, no child processes): for any status code in 200 to 599 and any prior JSON body, `setBodyToNull()` then `finalize()` yields `body: null` and the same status code.
- Characterization tests: `setBody(null | undefined | '' | 0 | false)` leave the prior body unchanged. These pin the compatibility decision in Q1.
- Type check: add a `setBodyToNull()` call to `test/types/consumer-tools.ts` (compiled with `tsc --noEmit`).
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
| I4. Declare `setBodyToNull()` in `types/` and add it to the consumer type test | Include | TypeScript consumers | S | Low |
| I5. Characterization tests for falsy `setBody()` | Include | Makes any later change to Q1 deliberate | S | Low |
| S1. `Response.init()` merges `xmlResponses` into the HTML slot (`Response.class.js:163` assigns to `#htmlResponses`) | Spin off (confirmed, Q5) | Separate root cause. Probe: a custom XML 200 template replaced the HTML 200 template. Fixing it changes which templates XML and HTML users get | S | Med |
| S2. Generic templates for 201, 202, 204 and other unlisted statuses (today they return the 500 body, `generic.response.js:67`) | Spin off (confirmed, Q5) | Issue option 3. Needs the pinned ten-code tests, five modules and the type updated | M | Med |
| S3. `setStatusCode()`/`setHeaders()` flip an HTML or text `Content-Type` to JSON because `inspectBodyContentType(undefined)` returns JSON (`:352-353`) | Spin off (confirmed, Q5) | Probe: HTML body, then `setStatusCode(404)`, finalizes as `application/json` with body `["<html>..."]`. Separate root cause | S | Med |
| S4. `reset()` ignores a falsy supplied body and keeps the previous one | Note only (dropped, Q5) | Same truthiness check as the issue, but fixing it changes `set()`/`reset()` semantics, which Q1 A avoids | S | Low to Med |
| S5. `finalize()` adds route `max-age` to 202, 204 and 3xx regardless of method or body | Note only (Q3) | Default behavior change; the application can already override per response | M | Med |
| N1. `reset()` and `set()` with no argument throw `TypeError` (`Response.inspectContentType(obj)` reads `obj.headers`) | Note only | Declared as required in `types/`; no reported use | S | Low |
| N2. Status `427` is labeled "Too Many Requests"; IANA lists 427 as unassigned and 429 as Too Many Requests ([registry](https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml)) | Note only | Public `response427` export pinned by tests; a fix would add 429 and keep 427 | S | Med |
| N3. `types/lib/tools/index.d.ts`: `toObject()` body type and `finalize()` return type are wrong | Note only | Widening a return type can break consumer compilation | S | Med |
| N4. `addToJsonBody()`/`setMessage()` build an object from a `null` body | Note only | Documented in the `setBodyToNull()` JSDoc | S | Low |
| N5. After 1.4.1 is published, `atlantis-mcp` can replace `response._body = null` with `setBodyToNull()` | Note only | Other repository; nothing to file until the release exists | S | Low |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| API Gateway rejects `body: null` with a 502 | Checked on Regional and edge-optimized REST APIs: no 502 (section 2). Not checked on HTTP API, ALB or Lambda function URLs; the docs say the verification covered REST API only |
| Users call `setBodyToNull()` on a 202 or 204 and still get `max-age` from config | The docs and both examples set `Cache-Control: no-store`; revisit with S5 (Q3) |
| A later change to `set()` silently alters falsy-body behavior | Characterization tests (I5) |
| `setMessage()` after `setBodyToNull()` re-creates a body on a 204 | Stated in the JSDoc and docs (N4) |
| `reset()` after `setBodyToNull()` restores the template | Stated in the JSDoc and docs |
| Documentation or type tests fail on the new method | Complete JSDoc (`@returns`, two `@example`); declare the type; run `test/documentation/` and the type tests |
| Code that calls `setBody(null)` expecting to discard data keeps sending it (Q1 A leaves this unchanged) | The docs state that `setBody()` ignores falsy values and point to `setBodyToNull()` and `reset()`; characterization tests pin the behavior (I5) |
| Users on HTTP API, ALB or Lambda function URLs get different behavior for `body: null` | The docs for `setBodyToNull()` state that the check covered REST API; those integrations are untested |
| `.kiro` spec text is published | No exploit detail in this plan; it describes an API gap |

## 9. Locked decisions

Rows Q1 to Q7 record your answers. Rows D1 to D9 were decided in this plan without asking; veto any of them.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | The spec stays under the `1-4-1` prefix and the change ships in v1.4.1 | 1.4.1 is unpublished (npm `latest` is 1.4.0, CHANGELOG says "unreleased"). Precedent: `1-4-1-trusted-client-ip` shipped a new environment variable in this version. A strict reading of AGENTS.md 2.2 would make a new method MINOR, so say so if you want 1.5.0 |
| D2 | The method is `setBodyToNull()`: no arguments, returns `void`, sets `_body = null` and nothing else. The name was first `clearBody()`, which is the name the issue uses; see Q7 | Matches the `setX` shape of the class and sorts next to `setBody` (Q7) |
| D3 | `_body` keeps its name and stays undocumented | Downstream tests depend on it today; making it API would freeze it |
| D4 | `finalize()` is not modified for the null-body path | It already handles `null` correctly (C7) |
| D5 | No change to the `Content-Type` header on a bodiless response | `finalize()` re-adds it anyway; RFC 9110 allows it |
| D6 | Fix the invalid `Response` sample in `docs/features/tools/README.md` as part of this change | Docs only; it is where `setBodyToNull()` would be mentioned |
| D7 | Tests: unit, property, characterization, and a type check, no change to existing tests | Per AGENTS.md 2.3 and `test-requirements` |
| D8 | The API Gateway check (Q4, Q6) runs before `requirements.md` is written, not after implementation | A 502 for `body: null` would change what `finalize()` emits, and requirements and design would have to follow. Checking first avoids rewriting them |
| D9 | Results of the check are recorded in this PLAN.md with placeholders (`<api-id>`, `<distribution>`) for endpoint IDs, domains and the account ID, and the profile name is left out | Spec files are published on GitHub |
| Q1 | Add `setBodyToNull()` only (option A). `set()`, `setBody()`, `reset()` and the constructor are unchanged | Backwards compatibility is the highest priority (AGENTS.md 2.1). Existing callers see no change. `setBody(null)` can be revisited in a major version. Residual risk: code that calls `setBody(null)` to discard data still keeps the data; `reset()` and `setBodyToNull()` are the supported ways, and the docs say so (4.1) |
| Q2 | `reset()` and the constructor keep treating a missing or `null` `body` as "use the template" (option A) | Same compatibility reason as Q1. To get a bodiless response, call `setBodyToNull()` after `reset()` or construction |
| Q3 | No code change to cache headers (option A). Document the `Cache-Control: no-store` pairing | The application can already set both headers (#223). The general rule for 202, 204 and 3xx is tracked as note-only S5 |
| Q4 | Verify API Gateway behavior by deploying a small temporary test function (option C) | Most complete: tests `null`, an omitted body and `''` on a real proxy integration. Writes spelled out and confirmed in Q6 before anything is created |
| Q5 | S1, S2 and S3 are spun off. S4 is dropped (note only) | S1 and S3 have their own root causes. S2 is the issue's option 3 and is larger than this fix. S4 only matters if `set()` changes, which Q1 A avoids |
| Q6 | The temporary test stack is a Regional REST API plus an edge-optimized REST API (option B), with the resources and cleanup listed in Q6. Approval to create and delete them is given | Covers the proxy contract and the edge topology used by deployed apps for little extra time. Run and cleaned up on 2026-11-10 UTC; results in section 2 |
| Q7 | The method is named `setBodyToNull()` (option B), replacing `clearBody()`. Exactly one name ships; there is no `clearBody` alias | It sorts directly under `setBody` in autocomplete, where a developer who tried `setBody(null)` looks, and says what it does. `Null` is already public contract through `getBody()`, `toObject()` and `finalize()`. The method is unpublished, so the rename costs only edits to the spec documents. Residual risk: if a later release changes how a bodiless response is sent, the name describes the old representation |
| D11 | `finalize()` stays unchanged; the API Gateway check passed on REST API (C15). The docs state that only REST API was checked | Result in section 2: no 502 for `null`, omitted or `""` bodies, `Cache-Control` preserved, API Gateway strips body and `Content-Type` from a 204 |
| D10 | Spin-offs S1, S2 and S3 became `ISSUE.md`-only spec folders under the `1-4-2` prefix (next version after the unpublished 1.4.1): `1-4-2-response-init-xmlresponses-overwrites-html-templates`, `1-4-2-generic-responses-for-unlisted-status-codes`, `1-4-2-response-set-status-code-resets-content-type-to-json`. There is no `TODO.md` in this repository, so nothing was added to one | Same folder shape as earlier spin-offs. Rename the prefix if you want them in 1.4.1 or 1.5.0. During the write-up S3 was re-probed and also affects `setHeaders()`, and S2 was extended to 301, 304, 409, 422, 429 and 503 |


## 10. Open questions and recommendations

No open questions. Q1 to Q7 and their answers are recorded in section 9.
