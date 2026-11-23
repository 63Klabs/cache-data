# A custom generic template's `Content-Type` header is not used, and a constructor `Content-Type` header must be one of five exact values

> **Status**: Locked 2026-11-19
> **Issue**: [ISSUE.md](ISSUE.md)
> **Reviewed against**: `dev` at `2335d1b` (package version 1.4.2) on 2026-11-19

## 1. Summary

`Response.reset()`, and therefore the constructor, builds a response from a generic template and then calls `set(newObj, contentType)`. `set()` ends with `addHeader('Content-Type', contentType)`, so the template's own `Content-Type` is replaced by the `Response.CONTENT_TYPE` value for the format (`src/lib/tools/Response.class.js:208-226`, `:245-258`). A `Content-Type` in the `headers` of the constructor or `reset()` object is read as a format selector and passed to `getGenericResponses()`, which accepts only the five `CONTENT_TYPE` strings and the codes `"JSON"`, `"HTML"`, `"XML"`, `"RSS"` and `"TEXT"`. Anything else throws (`:555`).

The issue is accurate. Reading the code and running probes adds three facts the issue does not state, and they shape the fix:

1. **`finalize()` only stringifies a JSON body when the header equals `Response.CONTENT_TYPE.JSON` exactly** (`:714`). Honoring a template header such as `application/problem+json` without changing `finalize()` would send `[object Object]` as the body. A probe confirmed this for a header set with `addHeader()` after `setBody()`, so the flaw exists today and the fix would make it reachable from templates.
2. **`set()` overwrites `Content-Type` on every call that has a body** (`:245-258`). A custom header, whether from a template or from `addHeader()`, is replaced by the body-inferred type on the next `setBody()`. Only `reset()` and the constructor can be fixed here without touching the sibling spec that owns `set()`.
3. **`getContentTypeCode()` returns `undefined` for any other header** (`:454`), and `_log()` writes that into the CloudWatch response log (`:810`).

Recommended fix, all inside `reset()` plus two small helpers: (a) the `Content-Type` of the response is the supplied header, else the template header, else the format constant; (b) a header value that is not a known format no longer throws and no longer selects the template, so format selection behaves as if the header were absent; (c) `finalize()` treats `application/json` and `+json` media types as JSON; (d) `getContentTypeCode()` and the docs follow. No export, signature or constant changes. Applications that do not customize a template `Content-Type` see no difference.

## 2. Assessment of the issue

Probes were read-only `node` runs on 2026-11-19 against `2335d1b`, from a temporary script outside the repository (deleted afterwards). `git status` is clean. Each probe ran `Response.init()` once with a custom RSS `response200` (`application/atom+xml`) and a custom JSON `response404` (`application/problem+json`, plus `contentType: "application/problem+json"` on the module).

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | A template's `Content-Type` is replaced by the format constant when a `Response` is built | Confirmed | `:257`. `new Response(req, { statusCode: 200 }, Response.CONTENT_TYPE.RSS)` carried `application/rss+xml`. The JSON 404 template with `application/problem+json` carried `application/json`. The template object itself still held the custom value |
| C2 | `Response.CONTENT_TYPE` ignores a custom template's `contentType` | Confirmed | `:70-77` is computed at class load. After `init({ jsonResponses: { contentType: "application/problem+json" } })`, `Response.CONTENT_TYPE.JSON` was still `application/json` |
| C3 | A header value other than the five constants throws in the constructor and `reset()` | Confirmed | `text/html`, `application/atom+xml` and `application/javascript` all threw `Content Type: ... is not implemented for getResponses`. A header plus body also threw |
| C4 | The five codes are accepted as header values | Confirmed, with a defect the issue does not state | `headers: { "Content-Type": "JSON" }` did not throw, and the response header became the literal string `JSON`, because `set()` writes whatever `reset()` passed as `contentType` |
| C5 | `addHeader()` or `setHeaders()` after building keeps a custom type, and `finalize()` keeps it | Partially confirmed | True after the body is set. `addHeader("Content-Type", "application/problem+json")` before `setBody({...})` was overwritten with `application/json`; `setStatusCode(404)` after it also reset the header to `application/json` |
| C6 | `setHeaders({ "Content-Type": "text/html" })` on an existing response works | Confirmed | `set()` does not look up a template when `obj.headers` carries the type (`:245-258`) |
| C7 | `JAVASCRIPT`, `CSS` and `CSV` cannot be used as a constructor header | Confirmed | `application/javascript` threw. `getGenericResponses()` has no branch for them (`:555-569`) |
| C8 | Applications that set headers after building from a body are unaffected | Confirmed | No template lookup on that path |
| C9 | The docs use `text/html` in an HTML template and the constant is `text/html; charset=utf-8` | Confirmed | `docs/01-advanced-implementation-for-web-service/configuration-options.md:79`; `generic.response.html.js:14` |
| C10 | Line references | Partially confirmed | `:71-77`, `:208-226`, `:245-258` are current. `inspectContentType` is at `:344`, `getGenericResponses` at `:555` |
| C11 | Unverified in the issue: other code reads `Response.CONTENT_TYPE` as the truth for what a response sends | Confirmed, and wider than stated | In `Response.class.js` only: `finalize()` (`:714`, JSON stringify), `getContentTypeCode()` (`:454`, used by `_log()` at `:810`), `inspectBodyContentType()` (`:360`) and `getGenericResponses()`. No other file in `src/` reads it (`grep` of `src/`) |
| C12 | Unverified in the issue: how many applications rely on the current result | Unverifiable by reading | Needs a downstream check. The Atlantis starters were checked for XML in the sibling spec; a check for template `Content-Type` values that differ from the constants is Q9 |

New findings from the probes (not claims in the issue):

| # | Finding | Evidence |
|---|---------|----------|
| F1 | With `Content-Type: application/problem+json` and an object body, `finalize()` returns body `[object Object]` | Probe: `addHeader` after `setBody({a:1})`. Cause: `:714` compares to the exact JSON constant, and the `else` branch does `${this._body}` |
| F2 | `getContentTypeCode()` returns `undefined` for `application/atom+xml` and for `text/html` | Probe. `_log()` writes `undefined` as the content-type field |
| F3 | `reset()` and the constructor choose JSON for an object with no body and no header, even when `settings.contentType` is `HTML` | Probe with `settings.contentType: HTML`: `new Response(req, { statusCode: 404 })` and `new Response(req, {})` both carried `application/json`. Cause: `inspectBodyContentType(undefined)` returns JSON (`:360`), the same cause as the sibling spec |
| F4 | A lowercase `content-type` key is not seen as the content type | Probe: headers `{ "content-type": "text/html" }` produced both `content-type` and `Content-Type: application/json` |
| F5 | `reset(null)` throws `TypeError` (`obj.headers` on null in `inspectContentType`); `new Response(req, null)` too | Probe. `undefined` is fine through the constructor default |

## 3. Current state

- **Templates.** `createGenericResponseModule()` gives each module a `contentType` string, one shared `headers` object (`{ "Content-Type": contentType }`), and every `response<code>` pointing at that same `headers` object (`src/lib/tools/generic.response.js:121-131`). An application template replaces `response<code>` with its own `headers`.
- **Constants.** `Response.CONTENT_TYPE` copies the five module `contentType` values at class load (`:70-77`). They are public, typed (`types/lib/tools/index.d.ts:1511`) and asserted by `test/response/response-tests.jest.mjs:60-67`.
- **Build.** `reset()` picks a format (argument, else `inspectContentType(obj)` which prefers the header over the body, else `settings.contentType`), loads the template, copies `obj.headers ?? template.headers` and `obj.body ?? template.body`, then calls `set(newObj, contentType)` (`:208-226`). The copy means `set()` never mutates the shared template headers.
- **Set.** `set()` computes `contentType = inspectContentType(obj) || this.inspectContentType() || settings.contentType` when no argument is given, assigns the supplied parts, and always ends with `addHeader('Content-Type', contentType)` (`:245-258`).
- **Finalize.** `finalize()` sets `Content-Type` from `getContentType()` only if the key is absent, then stringifies when the header equals the JSON constant, and otherwise does `${body}` (`:714-731`).
- **Docs.** `response-management.md:207-214` documents the current behavior added by the sibling spec `1-4-2-response-init-xmlresponses-overwrites-html-templates` ("carries the `Content-Type` of `Response.CONTENT_TYPE.XML`, not the `Content-Type` in the template's `headers`"). This spec must rewrite that paragraph.
- **History.** `53629b9` (2024-11-15, "updating Response class") introduced `reset()`, `set()` and `getGenericResponses()` in this shape, including the final `addHeader('Content-Type', contentType)` line. Nothing in the history or in the comments gives a reason for replacing the template header, and the module `contentType` and the template `headers` carry the same value in every default module, so the replacement was invisible until `init()` allowed custom templates. No later commit changed it deliberately. It is a side effect, not a decision.
- **Related specs.** `1-4-2-response-set-status-code-resets-content-type-to-json` (ISSUE only, no PLAN yet) changes how `set()` picks a type. `1-4-2-response-init-xmlresponses-overwrites-html-templates` is implemented and locked; it spun this issue off (its Q5).

## 4. Review

### 4.1 Security

- **Not a vulnerability.** No disclosure handling is needed and the spec directory can stay as is.
- **Content-type confusion.** Honoring a supplied header widens what an application can send from five values to any string. The five already include `text/html`, so reflecting an attacker-influenced value as a header was already possible. Applications must not build the `Content-Type` from request data. The docs should say so in one sentence.
- **Header injection (CWE-113).** Accepting any string widens what reaches a response header. A value with CR or LF could split the header if a gateway forwarded it as two headers; API Gateway and Lambda function URLs are not known to, but this was not verified. Decision 11 closes the new path: a supplied or template `Content-Type` that contains a control character (U+0000 to U+001F, U+007F) is ignored, as if absent, and one warning without the value is logged per container. `addHeader()`, `setHeaders()`, `set()` and every other header stay unchecked, as before; that residual gap is not part of this spec and is tracked in Section 7 (S4).
- **Sniffing.** The package sets no `X-Content-Type-Options`. Out of scope, note only.
- **Fail-open versus fail-closed.** The constructor currently fails closed on an unknown header by throwing. The proposal fails open to "ignore for format selection, keep as given". That is the intent of the issue, and the effect is limited to the application's own header value.
- **Logging.** `_log()` writes the content-type code, not the header value. No new value is logged (Q4).

### 4.2 Software engineering

- **Correctness and edge cases.**
  - Precedence: supplied `headers["Content-Type"]`, then the template's `headers["Content-Type"]`, then the format constant (Q1).
  - A supplied `headers` object without a `Content-Type` today replaces the template's headers wholesale, then gets the constant added. Under Q1 it would take the template's `Content-Type`.
  - A supplied header that is one of the five codes (`"JSON"`) must resolve to the constant, not be written literally (Q2a, C4).
  - A custom header with an object body needs `finalize()` to know it is JSON (F1, Q3).
  - Mixed-case key `content-type` (F4) is a separate pre-existing issue (Q10).
- **Fit with existing patterns.** The change is local to `reset()` plus one private resolver. `getGenericResponses()` is public, documented to throw, and tested; it stays as is. The constructor's third argument is explicit programmer input and keeps throwing for an unknown value (Q6).
- **Backward compatibility (AGENTS.md 2.1, 2.2).** No signature, export, constant or type changes. Observable changes:
  1. An application whose template `Content-Type` differs from the constant now sends the template value (the point of the issue).
  2. An application that passed a header that used to throw now gets a response.
  3. `finalize()` stringifies for `+json` types it used to send as `[object Object]`.
  4. An HTML template written as `text/html` (the form in `configuration-options.md:79`) now sends `text/html` without `; charset=utf-8` (Q7).
  Items 1 and 4 change a default for existing applications, so AGENTS.md 2.2 would class this as MAJOR. Decision 9 accepts PATCH as a documented exception.
- **Tests that change.** No existing test builds a `Response` from a template with a header that differs from the constant (checked in `test/response/`: `response-init-all-slots-unit-tests.jest.mjs` and `response-init-xml-only-unit-tests.jest.mjs` only read `getGenericResponses(...).response(n).headers`; `response-tests.jest.mjs:90-125` use JSON). To confirm when implementing: run `npm test -- test/response/`.
- **Tests to add.**
  - File A, one `Response.init()` at module level (the pattern in `response-generic-templates-custom-unit-tests.jest.mjs`): custom templates for all five formats with distinct `Content-Type` values; assert constructor and `reset()` carry the template value, supplied header wins, template wins over the constant, and the constant is used when the template has none (`headers: {}` or a missing `Content-Type`).
  - File B, default templates, a second module registry (no `init()` customization): headers that used to throw (`text/html`, `application/atom+xml`, `application/javascript`) do not throw and are kept; a code (`"JSON"`) yields the constant; no header gives the same output as today. Also: a supplied or template `Content-Type` with LF, CR, HT, U+0000 or U+007F is ignored, the constant is used when nothing else exists, one warning is logged per registry, the warning omits the value, and a logging failure does not stop the response (Decision 11).
  - File C, `finalize()`: `application/problem+json` object, array, string and number bodies; `application/json` unchanged; a non-JSON custom type with a string body unchanged.
  - Property tests (AGENTS.md 2.3): over generated header strings that are not one of the five and are not JSON media types, constructor never throws and the built header equals the input; over status codes 100-599, the built header equals the template header for a custom template. Generators must not be filtered by the predicate under test (`test-execution-monitoring.md`), and no `seed` option at `fc.assert`. The known-format resolver is the predicate in the first property, so the generator is safe by construction: strings that begin with `x-` plus a generated suffix, with a test that no known format contains that prefix.
  - Non-vacuous guard: a test that fails on the unfixed code (the unfixed constructor throws for `application/atom+xml` and replaces the template header).
- **Documentation (AGENTS.md 2.4).** JSDoc for `Response.reset()`, the constructor, `getContentTypeCode()`, and `finalize()`; `response-management.md` ("Custom Response Templates" and "Content Types"), `configuration-options.md`, and `docs/features/tools/README.md` if it describes the constructor `contentType` argument. Documentation tests live in `test/documentation/`.
- **Types.** `types/lib/tools/index.d.ts` declares `reset`, `set` and `getContentTypeCode`. No signature change is expected, so no type change. Only the comments change.
- **Duplicated logic.** The five-way format match is written twice in `getGenericResponses()` and in the `CONTENT_TYPE` constants. A small private resolver `format from header value` is the only new code that Q2 needs.

### 4.3 Cloud engineering

- **Topology and IaC.** Code only. No template, IAM, KMS, parameter or stack changes. No resource touched.
- **Request path.** `finalize()` output goes through API Gateway (REST or HTTP API) or a Lambda function URL, optionally behind CloudFront. None reads the package's templates. An application that now sends a different `Content-Type` can see different downstream behavior: API Gateway REST API matches `binaryMediaTypes` and compression settings on `Content-Type`, and CloudFront compresses by type. Not verified for a custom type; an application that moves to a custom type should check its gateway configuration. State this in the docs, not in code.
- **Stages.** The same `AppConfig.init({ responses })` runs in every stage, so test, beta and prod change together when the package is upgraded.
- **Observability.** The response log has a content-type field (`_log()`, `:810`) that a CloudWatch dashboard parses by position (comment at `:787`). A new value in that field does not shift positions, but a dashboard that groups by it will show a new group (Q4). Dashboard templates live outside this package.
- **Caching.** CloudFront and API Gateway caches could hold the old header until the TTL; applies only to applications that customize the header.
- **Rollout and rollback.** npm release. Rollback is the previous version. Applications that adopt the new behavior must remove nothing to roll back.

## 5. Gaps and observations

- The issue asks whether to keep the behavior and document it. The behavior replaces an explicit application setting with a package constant, and the package's own docs show custom `Content-Type` values in templates (`configuration-options.md:79`, `:88`; `response-management.md:200`), so the intent is that they apply. The sibling spec's docs paragraph (`response-management.md:207-214`) states the opposite as a workaround.
- Setting a `Content-Type` through a template is only useful for flows that use the template body or headers as built. Calling `setBody()`, `setStatusCode()` or `setHeaders()` afterwards re-infers the type from the body (C5, F3). The issue's possible fix does not cover that; `set()` belongs to the sibling spec (Q8).
- `getContentType()` (instance) already returns the header as given (`:435`), so only `getContentTypeCode()` and `finalize()` consult the five constants.
- The issue says `inspectContentType()` should be reconsidered for a header outside the five. It already returns the header as given. The thing that fails is the lookup in `reset()`, not the inspect methods.
- The "possible fix" in the issue says to use the "configured default format" when the header is unknown. That is `settings.contentType`, but `reset()` does not reach it for an object without a body (F3). Q2 recommends the same selection as when the header is absent, which is the current rule, so no new reliance on that setting.
- Affected tests and docs are listed in 4.2. `CHANGELOG.md` already holds a `1.4.2 (unreleased)` section with a PATCH departure note (`CHANGELOG.md`, Changed section). No GitHub issue number exists for this issue; the CHANGELOG convention forbids guessing one (Q9).

## 6. Proposed approach

All decisions are locked in Section 9. Each step names the decision it implements.

1. **`reset()` (`Response.class.js:208-226`).**
   1. If a `contentType` argument is given, use it as today; an unknown value still throws from `getGenericResponses()`.
   2. Otherwise resolve the format from the supplied header value with a private helper that returns one of the five formats or `null` (an exact constant, one of the five codes, or a media-type match: the text before `;`, trimmed and lower case, equal to the media type of one of the five constants; Decisions 2 and 2a). If it returns `null`, select the format from the body as when the header is absent (`inspectBodyContentType(obj.body)`, else `settings.contentType`).
   3. Load the template, copy headers and body as today.
   4. After `this.set(newObj, format)`, set `Content-Type` to: the supplied header value if present and not a bare code; else the template's `Content-Type` if present; else the format constant. A code resolves to the constant.
   5. Ignore a supplied or template `Content-Type` that contains a control character: treat it as absent for format selection and for the precedence in step 4, and log one warning per container that names the rule and omits the value; a logging failure does not stop the response (Decision 11).
   6. Leave `set()` unchanged (Decision 8). `finalize()` calls `reset({ statusCode: 500 })` for an `Error` body, which now takes the JSON template's `Content-Type`; the `finalize()` change in step 2 makes a `+json` type from that template stringify correctly.
2. **`finalize()`.** Treat a header as JSON when its media type (text before `;`, trimmed, lower case) is `application/json` or ends with `+json`. Same stringify and wrap rules as today. Other types unchanged.
3. **`getContentTypeCode()` and `_log()`.** Match by media type, parameters ignored, so `text/html` gives `HTML`; JSON family gives `JSON`; anything else stays `undefined` (Decision 4).
4. **Constants.** `Response.CONTENT_TYPE` and the module `contentType` properties stay fixed, and a custom module `contentType` property has no effect on the constants (Decision 5).
5. **Unsupported constants.** `JAVASCRIPT`, `CSS` and `CSV` become usable as header values through step 1.2; no new templates, and an unknown `contentType` argument still throws (Decision 6).
6. **Docs, JSDoc, CHANGELOG.** Rewrite `response-management.md:207-214`, add a "Content-Type of a template" paragraph and the HTML charset note (Decision 7), update `configuration-options.md` examples, JSDoc for the touched methods, and a CHANGELOG entry under `### Fixed` with the range "Affects v1.2.2 through v1.4.1" and no issue link (Decision 9).
7. **Tests.** Files A, B, C and the properties in 4.2.

**Alternatives considered**

| Alternative | Why not |
|-------------|---------|
| Document only (issue candidate 2) | Leaves the docs' own template examples ineffective and forces an application to call `addHeader()` after every template build |
| Change `set()` to stop overwriting `Content-Type` | Breaks auto-detect on `setBody()` and collides with the sibling spec that owns `set()` (Q8) |
| Make `Response.CONTENT_TYPE` follow custom templates in `init()` | Mutates public constants that applications read before `init()`, and `init()` runs after class load (Q5) |
| Add generic templates for JavaScript, CSS and CSV | New public surface in a PATCH, no demand shown (Q6) |
| Validate every header value or reject unknown types | Out of scope. Only the new path this spec opens (a supplied or template `Content-Type`) is checked for control characters (Decision 11); `addHeader()` and other headers stay as before |
| Throw on a `Content-Type` with a control character | The constructor is meant not to throw for a header value (Q2). Ignoring the value falls back to the template header or the constant, and the response is still built |
| Strip the control characters and keep the rest | Silently changes what the application wrote and can leave a misleading value |

## 7. Related improvements

| Item | Class (Include / Spin off / Note) | Rationale | Effort | Risk |
|------|-----------------------------------|-----------|--------|------|
| I1. `finalize()` stringifies JSON-family types | Include (Decision 3) | Without it, honoring a `+json` template header sends `[object Object]` (F1) | S | Low |
| I2. `getContentTypeCode()` matches by media type | Include (Decision 4) | Keeps the log field meaningful for `text/html` and `+json` | S | Low |
| I3. A code (`"JSON"`) in a header resolves to the constant | Include (Decision 2a) | Today it writes the literal `JSON` as the header (C4) | S | Low |
| I4. Rewrite the docs paragraph at `response-management.md:207-214` and update examples | Include | It states the behavior this spec changes | S | Low |
| S1. Header lookups are case-sensitive; `content-type` adds a second header (F4) | Spin off (confirmed, Decision 10). Not created by this plan | Separate root cause, touches `inspectHeaderContentType` and `set()` | M | Med |
| S2. `reset(null)` and `new Response(req, null)` throw `TypeError` (F5) | Spin off (confirmed, Decision 10). Not created by this plan | Same function, unrelated to the header | S | Low |
| S3. `inspectBodyContentType(undefined)` returns JSON, so `settings.contentType` is never used for an object without a body (F3) | Fold into `1-4-2-response-set-status-code-resets-content-type-to-json` as a finding (confirmed, Decision 10). Carry it into that spec's PLAN when it starts; its ISSUE.md is not edited here | Same root cause as that issue's candidate 2; touches the ctor as well as `set()` | S | Med |
| I5. Ignore a supplied or template `Content-Type` that contains a control character, with one warning per container (Decision 11) | Include | Closes header-injection exposure of the widened accepted set (4.1) | S | Low |
| N1. `Response.init()` ignores a second call without a log line | Note only | Already noted in the sibling spec | S | Low |
| S4. `addHeader()`, `setHeaders()`, `set()` and every other header accept control characters without a check | Spin off (created: [1-4-2-response-headers-accept-control-characters](../1-4-2-response-headers-accept-control-characters/ISSUE.md), planned for 1.4.2). Decision 11 limits this spec to the `Content-Type` path | Pre-existing and wider than `Content-Type` | M | Med |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| An application's template has a `Content-Type` that differs from the constant, and its clients depended on the constant | CHANGELOG entry with the version range, the rule (supplied, then template, then constant), and the one-line fix (remove or correct the template header) |
| An HTML template written as `text/html` now loses `; charset=utf-8` | Docs examples change to `text/html; charset=utf-8`; CHANGELOG calls this out (Q7) |
| A `+json` header with an object body would send `[object Object]` | `finalize()` change (Q3) and file C tests |
| A custom header is overwritten by the next `setBody()` call, so the fix looks ineffective | Docs state which calls re-infer the type; sibling spec decides `set()` (Q8) |
| Both specs edit `Response.class.js` near `set()` and `reset()` and their tests | Implement the sibling spec or this one first; rebase the second. Neither changes the other's lines if Q8 option A is chosen |
| New `Content-Type` values change API Gateway or CloudFront handling | Docs note; not verified (Section 4.3) |
| Applications outside the Atlantis starters rely on a template `Content-Type` that differs from the constant, and the number is unknown (C12). No downstream check was requested (Decision 9) | The CHANGELOG entry states the rule and the one-line fix. Residual risk accepted |
| A legitimate `Content-Type` that contains a control character (for example a horizontal tab) is ignored | None expected; no real media type needs one. Documented, and the constant or template header is used instead (Decision 11) |
| Control characters still reach a response through `addHeader()`, `setHeaders()` or another header | Out of scope; stated in the docs and tracked in Section 7 (S4) |
| A property test generator draws a known format by accident and makes the property fail at random | Safe-by-construction generator plus a test of the premise (`test-execution-monitoring.md`) |

## 9. Locked decisions
| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Q1, option A: the `Content-Type` is the supplied header, then the template header, then the format constant. A supplied `headers` object without a `Content-Type` takes the template's. | The docs' own template examples carry `Content-Type`, and the replacement was a 2024 side effect, not a decision. |
| 2 | Q2, option B: a header value that is not one of the five no longer throws. It is matched by media type (text before `;`, trimmed, lower case) to select a template, so `text/html` selects HTML. Unrecognized values do not select a template; the format comes from the body as when the header is absent. The value is kept as the header. | Removes the throw, keeps every value that selected a format selecting the same one. |
| 2a | Q2a, option A: one of the five codes (`"JSON"`, `"HTML"`, ...) in a header selects that format and the header becomes the constant. | No application can want the literal `JSON` as a `Content-Type`. |
| 3 | Q3, option A: `finalize()` treats `application/json` and `*+json` media types as JSON (stringify, wrap a string or number in an array). | Honoring a `+json` template header would otherwise send `[object Object]` (F1). |
| 4 | Q4, option A: `getContentTypeCode()` matches by media type, the JSON family gives `JSON`, anything else stays `undefined`. | Keeps the log field meaningful and avoids changing the logged value for existing unknown types. |
| 5 | Q5, option A: `Response.CONTENT_TYPE` and the module `contentType` stay fixed. A custom template changes the header through its `headers` only. | The constants are public, typed and read before `init()` runs. |
| 6 | Q6, option A: no templates for `JAVASCRIPT`, `CSS` or `CSV`. They work as header values. An unknown `contentType` argument still throws. | No demand shown, and the throw for the explicit argument is documented and tested. |
| 7 | Q7, option A: a template `text/html` is kept as given. The docs examples change to `text/html; charset=utf-8` and the CHANGELOG states the change. | Adding a charset would make the header differ from what the application wrote. |
| 8 | Q8, option A: only `reset()` and the constructor change. `set()`, `setBody()`, `setStatusCode()` and `setHeaders()` keep re-inferring the type. The docs say so. The sibling spec `1-4-2-response-set-status-code-resets-content-type-to-json` decides the `set()` rule. | Error responses built from a template and sent as built work, and `set()` needs the sibling plan first. |
| 9 | Q9, option A: PATCH in 1.4.2 as a documented exception to AGENTS.md 2.2, with a `### Fixed` CHANGELOG entry, "Affects v1.2.2 through v1.4.1", and no issue link. No downstream check of template `Content-Type` values is made; C12 stays unverified and is covered by the CHANGELOG note. | Consistent with the other 1.4.2 specs and their existing PATCH note in the CHANGELOG. |
| 10 | Q10, option A: S1 (case-sensitive `Content-Type` lookup) and S2 (`reset(null)` throws) are spin-offs to be created as separate issues. S3 (`settings.contentType` unused for body-less objects) goes to the sibling spec as a finding. | Separate root causes, none needed for this fix. |
| 11 | Added on the user's instruction after Q1 to Q10 were answered (2026-11-19), not a numbered question. A supplied or template `Content-Type` that contains a control character (U+0000 to U+001F, U+007F) is ignored, as if absent, so the response takes the next value in the order supplied header, template header, format constant. One warning that names the rule and omits the value is logged per container, and a logging failure does not stop the response. `addHeader()`, `setHeaders()`, `set()` and other headers are not checked. | Closes the header-injection exposure created by accepting any string (CWE-113) without throwing, which Q2 rules out. The ignore-and-warn mechanics and the control character set were chosen when writing the requirements; they were not an option in a question. |
## 10. Open questions and recommendations
No open questions.

### Question log
Decision 11 has no question here: it was added on the user's instruction after the answers below.
The answered questions are kept as the record of the options considered. Each answer is recorded in Section 9.

### Q1. Which `Content-Type` does a template-built response carry?
**Why it matters:** This is the issue's main decision, and it decides the release type (Q9).
**Options:**
- **A. Supplied header, then the template header, then the format constant.** A `Content-Type` in `obj.headers` wins; otherwise the template's; otherwise `Response.CONTENT_TYPE` for the format. A supplied `headers` object without a `Content-Type` takes the template's. Matches the issue's candidate 1.
- **B. Template header only when the handler supplies no `headers`.** A supplied `headers` object without a `Content-Type` gets the constant, as it does today. Smaller change, but the same template yields different types depending on an unrelated header.
- **C. Leave the behavior and document it (issue candidate 2).** No code change; the existing docs paragraph stays.
- **D. Other**: describe.
**Recommendation:** A. The docs' own template examples carry `Content-Type`, and the replacement came from a 2024 side effect, not a decision (Section 3). B makes the result depend on whether a handler passes `X-` headers.
**Answer:** A
**Status:** Locked, see Section 9

### Q2. What does the constructor and `reset()` do with a `Content-Type` header that is not one of the five?
**Why it matters:** Removes the throw (C3) and decides which template is loaded. The throw is in `getGenericResponses()`, which is public and documented.
**Options:**
- **A. Ignore it for format selection, keep it as the header.** Select the format from the body as when the header is absent. `text/html` is not recognized as HTML, so an HTML template is chosen only if the body looks like HTML or the `contentType` argument says so.
- **B. Match by media type, then A.** Compare the part before `;`, trimmed and lower case, with the five constants' media types, so `text/html` selects the HTML template. `application/atom+xml`, `application/javascript` and others fall through to A. Case-insensitive on the value, not on the header name (that is Q10).
- **C. Keep throwing, with a clearer message.** Smallest change. Leaves C3 unresolved.
- **D. Other**: describe.
**Recommendation:** B. It makes the repo's own `text/html` template form work without a format argument, and every value that used to select a format still selects the same one.
**Answer:** B
**Status:** Locked, see Section 9

### Q2a. What happens when the header value is one of the five codes (`"JSON"`, `"HTML"`, ...)?
**Why it matters:** The code is accepted today and written literally as the header (C4).
**Options:**
- **A. Resolve the code to the format and write the constant.** The header becomes `application/json`. A visible fix to an existing bug.
- **B. Treat it as any other value.** Keep the literal `JSON` as the header and choose the format from the body. Honest to "keep as given", and still broken output.
- **C. Keep today's behavior** (selects the format and writes the literal code).
**Recommendation:** A. No application can want the literal `JSON` as a `Content-Type`.
**Answer:** A
**Status:** Locked, see Section 9

### Q3. Should `finalize()` stringify JSON bodies for `+json` content types?
**Why it matters:** Honoring `application/problem+json` from a template sends `[object Object]` otherwise (F1). The flaw exists today for `addHeader()`.
**Options:**
- **A. JSON family stringifies.** A header whose media type is `application/json` or ends in `+json` follows today's JSON rules (stringify, wrap a string or number in an array).
- **B. Exact `application/json` only.** Document that a custom JSON type needs a string body. The `[object Object]` trap stays.
- **C. Stringify any object or array body, whatever the header.** Also fixes `application/x-custom` with an object, but changes output for any non-JSON header with an object body.
- **D. Other**: describe.
**Recommendation:** A. `+json` is the standard structured-syntax suffix (RFC 6839) and C changes more than the issue needs. Wrapping a string in an array for `problem+json` matches the existing JSON rule, so no second rule is added.
**Answer:** A
**Status:** Locked, see Section 9

### Q4. What does `getContentTypeCode()` return, and so what does the response log carry, for a header outside the five?
**Why it matters:** `_log()` writes it into a position-parsed CloudWatch log line (`:810`, F2).
**Options:**
- **A. Match by media type; JSON family gives `JSON`; anything else stays `undefined`.** `text/html` now logs `HTML`. `application/atom+xml` still logs `undefined`.
- **B. Match by media type only (no `+json` rule).** `application/problem+json` logs `undefined`.
- **C. No change.** `text/html` and every custom type log `undefined`.
- **D. Other**: for example a fixed `OTHER` for unknown values.
**Recommendation:** A, consistent with Q2 and Q3. Not changing the `undefined` for others avoids a surprise in dashboards. Option D is cleaner but changes the logged value for existing unknown types.
**Answer:** A
**Status:** Locked, see Section 9

### Q5. Should `Response.CONTENT_TYPE` follow a custom template's `contentType`?
**Why it matters:** The constants are public, typed, computed at class load, and read by applications before `init()` runs (C2).
**Options:**
- **A. No.** Constants stay fixed. A custom template changes the header through its `headers`, and a custom module `contentType` property has no effect. Document both.
- **B. Update the constants in `init()`.** Applications that captured a value earlier keep a stale one, and body detection by `inspectBodyContentType()` changes with it.
- **C. Other**: describe.
**Recommendation:** A.
**Answer:** A
**Status:** Locked, see Section 9

### Q6. What about `JAVASCRIPT`, `CSS` and `CSV`, and an unknown `contentType` argument?
**Why it matters:** C7. Q2 already makes them usable as header values.
**Options:**
- **A. No new templates; usable as header values; an unknown `contentType` argument still throws.** The argument is explicit programmer input, and `getGenericResponses()` is documented to throw.
- **B. Add generic templates for the three.** New public exports in a PATCH.
- **C. Also stop throwing for an unknown `contentType` argument and fall back to header or body.** Wider behavior change.
- **D. Other**: describe.
**Recommendation:** A. Nobody asked for templates, and the throw for the explicit argument is documented and tested.
**Answer:** A
**Status:** Locked, see Section 9

### Q7. How to handle the HTML charset when a template says `text/html`?
**Why it matters:** `configuration-options.md:79` shows `text/html`. Under Q1 A, an application that copied it would send `text/html` where it sent `text/html; charset=utf-8` before.
**Options:**
- **A. Keep the header as given and fix the docs.** Examples change to `text/html; charset=utf-8`; the CHANGELOG states the change.
- **B. Add `; charset=utf-8` to a template `text/html` that has no charset.** Keeps output stable, but changes a header the application set explicitly.
- **C. Other**: describe.
**Recommendation:** A. B makes the header differ from what the application wrote, which is the behavior this spec removes.
**Answer:** A
**Status:** Locked, see Section 9

### Q8. What is the scope for `set()`, `setBody()`, `setStatusCode()` and `setHeaders()`?
**Why it matters:** These calls overwrite `Content-Type` with the type inferred from the body (C5, F3), so a custom type from a template survives only until the next such call. The sibling spec `1-4-2-response-set-status-code-resets-content-type-to-json` owns this code.
**Options:**
- **A. This spec changes `reset()` and the constructor only.** `set()` stays as is. Document that `setBody()` and the other setters re-infer the type, and that `addHeader()` after the last setter keeps it. The sibling spec decides the `set()` rule, including whether an application-set header survives.
- **B. Also make a template-derived or application-set `Content-Type` survive `set()` with a private flag.** Larger, and must be designed with the sibling spec's open point on app-set headers.
- **C. Merge the two specs.** One plan, one change set.
- **D. Other**: describe.
**Recommendation:** A. The most common template use, error responses built from a template and sent as built, works with A. B and C need the sibling plan first.
**Answer:** A
**Status:** Locked, see Section 9

### Q9. What release type, and what does the CHANGELOG say?
**Why it matters:** Q1 A changes headers for any application whose template `Content-Type` differs from the constant, and a `text/html` template changes (Q7). AGENTS.md 2.2 classes changed default behavior as MAJOR. Also affects the spec directory name only if the version changes.
**Options:**
- **A. PATCH in 1.4.2 as a documented exception.** Same as the sibling specs in this release. The CHANGELOG Fixed entry names the old and new rule, "Affects v1.2.2 through v1.4.1", and the review step for an application whose template header differs. No GitHub issue link, because none exists. The existing "ships as a PATCH" note in `CHANGELOG.md` then covers this too.
- **B. MINOR (1.5.0).** Needs `npm version minor` on a clean tree; this spec directory and its siblings are named 1-4-2.
- **C. MAJOR (2.0.0).** The strict reading of AGENTS.md 2.2. Not proportionate.
- **D. Other**: describe. Also state here whether a downstream check of template `Content-Type` values is wanted (C12); the Atlantis starters can be searched, other applications cannot.
**Recommendation:** A. The behavior is not documented anywhere as intended, the docs' examples contradict it, and the release already ships other changed defaults as PATCH with an explicit note. Choose B if you want the version number to signal it.
**Answer:** A
**Status:** Locked, see Section 9

### Q10. Confirm the dispositions of the spin-off items.
**Why it matters:** Scope control. None is needed for this fix to work.
**Options:**
- **A. S1 (case-sensitive `Content-Type` lookup, F4): create a separate issue. S2 (`reset(null)` throws, F5): create a separate issue. S3 (`settings.contentType` unused for body-less objects, F3): add it to the sibling spec `1-4-2-response-set-status-code-resets-content-type-to-json` as a finding.**
- **B. Fold S2 into this spec** (a one-line null guard in `reset()`), others as in A.
- **C. Drop all three.**
- **D. Other**: describe per item.
**Recommendation:** A. S1 changes how every header lookup works, S3 shares a root cause with the sibling, and S2 is unrelated to `Content-Type`. This plan does not create the issues; it can hand them to the issue-creation skill after you confirm.
**Answer:** A
**Status:** Locked, see Section 9
