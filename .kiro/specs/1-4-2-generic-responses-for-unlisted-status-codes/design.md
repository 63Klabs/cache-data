# Design Document

## Overview

This feature changes what the generic response modules return for status codes that have no template, and adds the templates people most often need. Four source files change in behavior: `src/lib/tools/generic.response.js` (templates, bodiless template, class fallback, deprecation warning), `src/lib/tools/generic.response.xml.js` and `generic.response.rss.js` (2xx renders as success), and `src/lib/tools/Response.class.js` (one line in `reset()`). The other three format modules do not change.

The rest is type declarations, JSDoc, two documentation changes (a new section and a corrected section), CHANGELOG entries written in the final task, and tests: updated pinned lists, a shared helper for the status list, unit and property tests for the templates and the fallback, `Response` tests for `reset()`, a custom-template test file, and subprocess tests for the one-time deprecation warning.

Requirement numbers refer to [requirements.md](requirements.md). Q, C, N, I, S and Decision numbers refer to [PLAN.md](PLAN.md). Where this document names a decision as "Decision n" it is the locked decision table in PLAN.md section 9.

## Design goals

1. **No change for callers that supply a body.** `Response` returns what it returned in v1.4.1 for every call that passes a non-nullish `body` (Requirement 11.3). The ten existing templates stay byte for byte the same (Requirement 1.7).
2. **One place for the status list and one rule for unlisted codes.** `STATUS_CODE_MAP` and the class fallback live in `generic.response.js`. The five format modules keep only their formatters, as the 1.3.10 refactor intended.
3. **The smallest `Response` change.** One assignment in `reset()`. `set()`, `setBody()`, `setBodyToNull()` and `finalize()` stay as they are (Requirement 4.2).
4. **The fallback reads from `this`.** Templates merged by `Response.init()` must apply to the class fallback (Requirement 3.4).
5. **The deprecation warning cannot hurt a response.** It logs once, never throws, and never changes the returned template (Requirement 5.4).
6. **Tests pin each rule and cannot drift.** One shared status list is imported by the old and new tests, and a drift guard compares it with the keys of every module (Requirement 10.3).
7. **No claim without a check.** The documentation examples are run in a probe before they are written into the docs (Verification, step 7).

## Pre-design measurements

Taken on 2026-11-13 on the `dev` branch at `125c03f` with Node.js and the repository's installed tools. Probes are read-only.

| Measurement | Result | Used for |
|---|---|---|
| `response(201, 202, 204, 301, 304, 409, 429, 503)` on `jsonGenericResponse` | Each returned `statusCode 500`, body `{"message":"Internal Server Error"}` | Baseline for Requirement 3 |
| `new Response(req, { statusCode: 204 })` | Status 204, body `{"message":"Internal Server Error"}`, headers `{"Content-Type":"application/json"}` | Baseline for Requirement 4.3 |
| `Response.init({ jsonResponses: { response500: { ..., body: { custom: "app500" } } } })` then `new Response(req, { statusCode: 201 })` | Body `{"custom":"app500"}` | N1; Requirement 3.4 test |
| `new Response(req, {}, "TEXT")` | Body `"Success"`, status 200 | Content-type argument pattern for non-JSON tests |
| `parseInt(x, 10)` for `undefined`, `null`, `NaN`, `true`, `[]`, `{}`, `""` | `NaN` | These fall to `response500` |
| `parseInt` for `"410abc"`, `" 410"`, `404.7`, `"404.7"`, `[410]`, `1n` | `410`, `410`, `404`, `404`, `410`, `1` | A3: the range check runs on the parsed integer |
| `parseInt("0x1A4", 10)`, `parseInt("2e2", 10)` | `0`, `2` | Both fall outside every class range, so `response500` |
| `parseInt(Symbol("x"), 10)` and `parseInt({ toString() { throw ... } }, 10)` | Both throw (`TypeError`, `Error`) | Requirement 3.7 promises no new throw path, not "never throws" |
| `DebugAndLog.warn("probe")` in a plain Node process | One `[WARN] probe` line at the default level | Requirement 5.2 is observable without a log-level setting |
| `DebugAndLog.warn` is `static async` (`DebugAndLog.class.js:685`) | Returns a promise | A2: a rejected promise must be caught |
| Require cost: `generic.response.json.js` alone | 0.7 ms, 2 modules; `DebugAndLog.class.js` adds 3 modules (`utils.js`, `DataHasher.class.js`) in 3.1 ms | Cold-start impact of Requirement 5.7 |
| `DebugAndLog.class.js` requires `./utils` and `util`; `utils.js` requires `DataHasher.class.js`; `PowertoolsInit` and `LoggerBridge` are loaded lazily inside functions (`DebugAndLog.class.js:16,36`) | No path back to `generic.response*` or `Response.class` | No require cycle (Requirement 5.7) |
| `npm run test:response` before the change | 19 suites, 284 tests, all pass | Baseline for Requirement 10.9 |
| `npm run test:types` (`tsc --noEmit -p test/types/tsconfig.json`) before the change | Exit 0 | Baseline for Requirement 6.4 |
| `eslint` on the seven touched source files before the change | 0 problems | Baseline for Requirement 10.9 |
| Tags in this clone | `v1.3.16`, `v1.3.17`, `v1.4.0`, `v1.4.1`, `v1.4.2` only | The fallback entered the code at `b566abd` (2024-11-18, `package.json` 1.1.0), so the affected-version range for the CHANGELOG cannot come from tags alone (see CHANGELOG design) |
| Test layout | `*.jest.mjs` under `test/response/`; fixtures `test/helpers/test-event.js`, `test-context.js`, `test-validations.js`; `Response.init()` takes effect once per test file | Test design |
| `docs/` and `.kiro/` are excluded from the npm package | JSDoc and types name doc paths in text, not links | Requirement 7 |

## Architecture

### Current

```
Response constructor / reset(obj, contentType)
  -> Response.getGenericResponses(contentType)          returns the (possibly merged) module
  -> module.response(statusCode)
       parseInt, then this["response" + code] || this.response500
  -> headers and body copied from that template
  -> set(newObj)                                         ignores falsy body
```

Ten templates exist (`STATUS_CODE_MAP`, `generic.response.js:16-27`). Every other code resolves to `this.response500`, which is the application's template when `Response.init()` supplied one.

### New

```
module.response(statusCode)
  code = parseInt(statusCode, 10)
  direct = this["response" + code]
  if direct:
      if code === 427: warn once per container (never throws, never changes the result)
      return direct
  name = fallbackTemplateName(code)
         100-199, 205, 300-399 -> "response204"
         200-299               -> "response200"
         400-499               -> "response400"
         anything else         -> "response500"
  return this[name] || this.response500

Response.reset(obj, contentType)
  ... unchanged ...
  this.set(newObj, contentType)
  if (newObj.body === null) this._body = null           new: a null template body clears the body
```

The factory builds seventeen templates. `response204` has `body: null` and the formatter is not called for it.

### Files

| File | Change |
|---|---|
| `src/lib/tools/generic.response.js` | Add seven entries to `STATUS_CODE_MAP`, `NO_BODY_STATUS_CODES`, `fallbackTemplateName`, `warnDeprecated427`, the new `response()`, JSDoc |
| `src/lib/tools/generic.response.xml.js`, `generic.response.rss.js` | `statusCode === 200` becomes a 2xx test |
| `src/lib/tools/Response.class.js` | One assignment in `reset()`, `reset()` JSDoc |
| `types/lib/tools/index.d.ts` | Seven members, `@deprecated` on `response427`, descriptions of `response()` and `GenericResponseObject.body` |
| `test/types/consumer-tools.ts` | Read three new members |
| `docs/01-advanced-implementation-for-web-service/response-management.md` | New "Generic Response Templates" section |
| `docs/features/tools/README.md` | Rewrite "Generic Response Generators" |
| `CHANGELOG.md` | Entries, final task only |
| `test/helpers/generic-response-status-codes.mjs` (new) | Shared status list, messages, formatter expectations |
| `test/response/generic-response-module-tests.jest.mjs`, `generic-response-module-property-tests.jest.mjs` | Updated lists, titles, expected outputs, Property 3 replaced |
| `test/response/generic-response-{json,html,rss,text,xml}-tests.jest.mjs` | New-code tests, silence the 427 warning |
| `test/response/generic-response-class-fallback-tests.jest.mjs` (new) | Unit tests for the class fallback and null-body templates |
| `test/response/generic-response-class-fallback-property-tests.jest.mjs` (new) | Properties P1 to P6 |
| `test/response/response-generic-templates-unit-tests.jest.mjs` (new) | `Response` behavior with the default templates |
| `test/response/response-generic-templates-custom-unit-tests.jest.mjs` (new) | `Response` behavior with custom templates (one `Response.init()` call) |
| `test/response/generic-response-deprecation-427-tests.jest.mjs` (new) | Subprocess tests for the warning |

`src/index.js`, `src/lib/tools/index.js`, `generic.response.json.js`, `generic.response.html.js` and `generic.response.text.js` do not change.

## Components and interfaces

### `generic.response.js`

```javascript
const DebugAndLog = require("./DebugAndLog.class");

/**
 * Map of HTTP status codes to their default message strings.
 *
 * @type {Object.<number, string>}
 */
const STATUS_CODE_MAP = {
	200: "Success",
	201: "Created",
	202: "Accepted",
	204: "No Content",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	408: "Request Timeout",
	409: "Conflict",
	418: "I'm a teapot",
	422: "Unprocessable Content",
	427: "Too Many Requests",
	429: "Too Many Requests",
	500: "Internal Server Error",
	503: "Service Unavailable"
};

/**
 * Status codes whose template has a null body. The body formatter is not called for them.
 * RFC 9110 sections 15.3.5 and 15.4.5 say a 204 and a 304 cannot contain content.
 *
 * @type {Set<number>}
 */
const NO_BODY_STATUS_CODES = new Set([204]);

const DEPRECATED_427_MESSAGE = "response427 is deprecated: 427 is not a registered HTTP status. Use response429 (Too Many Requests). response427 is kept through all of v1.x.";

let deprecation427Logged = false;
```

`createGenericResponseModule` keeps its signature. The loop becomes:

```javascript
for (const code in STATUS_CODE_MAP) {
	const statusCode = parseInt(code, 10);
	const message = STATUS_CODE_MAP[code];
	mod["response" + statusCode] = {
		statusCode: statusCode,
		headers: headers,
		body: NO_BODY_STATUS_CODES.has(statusCode) ? null : bodyFormatter(statusCode, message)
	};
}
```

`response()` and its two helpers:

```javascript
/**
 * Name the template that stands in for a status code that has none. @private
 *
 * @param {number} code - Parsed status code (may be NaN)
 * @returns {string} Name of the template property
 */
function fallbackTemplateName(code) {
	if ((code >= 100 && code < 200) || code === 205 || (code >= 300 && code < 400)) {
		return "response204";
	}
	if (code >= 200 && code < 300) {
		return "response200";
	}
	if (code >= 400 && code < 500) {
		return "response400";
	}
	return "response500";
}

/**
 * Log the one-time deprecation warning for response427. Never throws. @private
 *
 * @returns {void}
 */
function warnDeprecated427() {
	if (deprecation427Logged) {
		return;
	}
	deprecation427Logged = true;
	try {
		const result = DebugAndLog.warn(DEPRECATED_427_MESSAGE);
		if (result && typeof result.catch === "function") {
			result.catch(() => {});
		}
	} catch {
		// A logging failure must not change the response that is returned
	}
}

mod.response = function (statusCode) {
	const code = parseInt(statusCode, 10);
	const direct = this["response" + code];
	if (direct) {
		if (code === 427) {
			warnDeprecated427();
		}
		return direct;
	}
	return this[fallbackTemplateName(code)] || this.response500;
};
```

Choices:

- **The flag is set before the call.** If `DebugAndLog.warn` throws or rejects, the warning is not retried on every call, and a re-entrant call cannot log twice.
- **`DebugAndLog.warn` is called as a method on the class.** `jest.spyOn(DebugAndLog, "warn")` and the child-process stub in the tests then both intercept it.
- **The `catch` block is empty on purpose.** AGENTS.md section 8.2 forbids silent failures in general. Here a failure of the logger must not become a failure of response building, and the logger cannot report its own failure. The comment says so. `catch {` without a binding is already used in `src/` (`DebugAndLog.class.js:17`, `AWS.classes.js:69`), and ESLint's recommended `no-unused-vars` flags an unused `catch (error)` binding.
- **A custom `response427` also warns.** `this["response427"]` is the application's template when it supplied one. The message names the member, so it applies to both.
- **The direct lookup runs first.** A built-in or custom `response<code>` always wins over any fallback (Requirement 3.5). A custom `response201` therefore needs no special handling.
- **`this[...] || this.response500`.** If an application overwrote a built-in key with `undefined`, `response()` still returns a template (Requirement 3.8, A12).
- **Range checks run only after a direct miss**, so listed codes cost one lookup, as before.
- **The returned object is the template, not a copy** (Requirement 3.3). `response(410).statusCode` is 400 and `response(301).statusCode` is 204. `Response.reset()` reads only `headers` and `body`.

JSDoc for `createGenericResponseModule` lists every member in `@returns` (`response200`, `response201`, ..., `response503`, `response`), describes the class fallback in the description, and has an `@example` for an unlisted code:

```javascript
const { createGenericResponseModule } = require("./generic.response");

const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));
console.log(mod.response201.body); // { message: "Created" }
console.log(mod.response204.body); // null
console.log(mod.response(410) === mod.response400); // true: no response410, so the 4xx template is used
console.log(mod.response(301) === mod.response204); // true: redirects have no template, so no body
```

The module-level JSDoc comment (`@module generic.response`) mentions the class fallback and the deprecated `response427`.

### XML and RSS formatters

```javascript
const xmlBodyFormatter = (statusCode, message) => {
	if (statusCode >= 200 && statusCode < 300) {
		return xml("<hello>" + message + "</hello>");
	}
	const msg = statusCode === 418 ? "418 " + message : message;
	return xml("<error>" + msg + "</error>");
};
```

The RSS formatter changes the same line. Output for 200 and for every code of 400 and above is identical to v1.4.1 (Requirement 2.2). The HTML formatter produces `<title>201 Created</title>` through its existing `statusCode + " " + (HTML_TITLE_MAP[statusCode] || message)`, and the JSON and text formatters return `{ message }` and the message. None of the three changes (A5).

### `Response.reset`

```javascript
reset = (obj, contentType = null) => {
	let newObj = {};
	newObj.statusCode = obj?.statusCode ?? 200;
	// ... unchanged ...
	newObj.body = obj?.body ?? genericResponses.response(newObj.statusCode).body;
	this.set(newObj, contentType);
	if (newObj.body === null) {
		this._body = null;
	}
};
```

`set()` ignores a falsy body, so the extra assignment is the only way the template's `null` reaches an existing instance. `newObj.body` is `null` only when the caller passed no body (or `null`) and the template body is `null`, or the caller passed `body: null` and the template is bodiless. A supplied `''`, `0` or `false` is not nullish, stays in `newObj.body`, is ignored by `set()`, and does not trigger the assignment (Requirement 4.9). A custom template without a `body` property gives `undefined`, which does not trigger it either.

The `reset()` JSDoc gains two sentences: the template is chosen by `response(statusCode)`, including the class fallback, and a `null` template body clears the body.

### Types

```typescript
export interface GenericResponseObject {
	/** HTTP status code */
	statusCode: number;
	/** Response headers including Content-Type */
	headers: Record<string, string>;
	/** Response body (format depends on the module). `null` for the 204 template. */
	body: any;
}
```

`GenericResponseModule` gains these members in ascending order with the existing ones:

```typescript
/** Pre-built response for HTTP 201 */
response201: GenericResponseObject;
/** Pre-built response for HTTP 202 */
response202: GenericResponseObject;
/** Pre-built response for HTTP 204. The body is `null`. */
response204: GenericResponseObject;
/** Pre-built response for HTTP 409 */
response409: GenericResponseObject;
/** Pre-built response for HTTP 422 */
response422: GenericResponseObject;
/**
 * Pre-built response for HTTP 427.
 * @deprecated 427 is not a registered HTTP status. Use `response429`.
 */
response427: GenericResponseObject;
/** Pre-built response for HTTP 429 */
response429: GenericResponseObject;
/** Pre-built response for HTTP 503 */
response503: GenericResponseObject;
```

The `response()` description becomes: "Get a response object by status code. A code with no template gets the template of its class: 2xx the 200 template, 4xx the 400 template, 5xx the 500 template, 100-199, 205 and 300-399 the 204 template (no body). Anything else gets `response500`. The returned object's `statusCode` is the template's, not the requested code."

`test/types/consumer-tools.ts` adds:

```typescript
const json201 = jsonResp.response201;
const json204Body: any = jsonResp.response204.body;
const json429 = jsonResp.response429;
```

## Documentation design

### `response-management.md` (new section)

Placed after "Custom Response Templates" and before "Response Finalization". The file's other headings are in title case (`## Custom Response Templates`, `## Response Finalization`), so the new heading follows that (naming-conventions: follow the majority in the file). The section is user documentation: behavior, no internals (Requirement 8.3).

````markdown
## Generic Response Templates

`new Response(clientRequest, { statusCode })` and `response.reset({ statusCode })` fill the body from a generic template when you do not pass one. These statuses have a template in every format (JSON, HTML, XML, RSS and text):

| Status | Message |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted |
| 204 | No Content (no body) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 408 | Request Timeout |
| 409 | Conflict |
| 418 | I'm a teapot |
| 422 | Unprocessable Content |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

// 201 Created, body {"message":"Created"}
const response = new Response(clientRequest, { statusCode: 201 });
return response.finalize();
```

### Statuses without a template

A status that is not in the table uses the template for its class:

| Status | Template used | Body |
|--------|---------------|------|
| 200-299 (except 205) | 200 | `{"message":"Success"}` |
| 400-499 | 400 | `{"message":"Bad Request"}` |
| 500-599 | 500 | `{"message":"Internal Server Error"}` |
| 100-199, 205, 300-399 | 204 | none |
| Anything else (not a status) | 500 | `{"message":"Internal Server Error"}` |

`Response` keeps the status you set. `new Response(clientRequest, { statusCode: 410 })` is sent as a 410 with the 400 body, "Bad Request". A redirect has no body. Pass the `Location` header yourself:

```javascript
const response = new Response(clientRequest, {
  statusCode: 301,
  headers: { Location: 'https://example.com/new-path' }
});
return response.finalize();
```

To change the body for every status of a class, replace its template when you initialize `Response`. A template you add for a specific status always wins:

```javascript
Response.init({
  jsonResponses: {
    response400: {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Request not accepted', code: 'CLIENT_ERROR' }
    },
    response410: {
      statusCode: 410,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Gone' }
    }
  }
});
```

Before v1.4.2, every status without a template used the 500 template, so a custom `response500` was also sent with a 201 or a 410. It now applies only to 5xx statuses without a template and to values that are not statuses.

### 204 and other responses without a body

The 204 template has no body, and `reset({ statusCode: 204 })` removes any body already on the response. API Gateway REST API removes the body and `Content-Type` of a 204 itself (see [observation O12](../cloudfront-notes/lambda-proxy-response-body.md)). Only REST API was checked. A response with no body on a 3xx or a 205 was not checked behind API Gateway, CloudFront or any other integration.

`finalize()` adds `Cache-Control: max-age` from `routeExpirationInSeconds` to every status below 400 unless you set `Cache-Control` yourself. Set it on a 201, 202 or 204 that must not be cached.

### Status 427

`response427` is deprecated. 427 is not a registered HTTP status. Use `response429` for Too Many Requests. `response427` is kept through all of v1.x, and a one-time warning is logged the first time a status of 427 is resolved.
````

The relative link to the notes file is checked by the documentation tests. The file lives in the same `docs/` tree one level up (`../cloudfront-notes/`), as other links in this file do (verified in Verification, step 6).

### `docs/features/tools/README.md` (rewrite)

The "Generic Response Generators" heading and its table-of-contents entry stay. The body is replaced:

````markdown
## Generic Response Generators

`jsonGenericResponse`, `htmlGenericResponse`, `xmlGenericResponse`, `rssGenericResponse` and `textGenericResponse` are objects, not functions. Each holds a template per status (`response200`, `response404`, and so on), a `response(statusCode)` lookup, its `contentType` and `headers`, and a helper that formats a body. `Response` uses them to fill in a body when you do not pass one. See [Generic Response Templates](../../01-advanced-implementation-for-web-service/response-management.md#generic-response-templates) for the statuses and the rule for statuses without a template.

### JSON

```javascript
const { tools: { jsonGenericResponse } } = require('@63klabs/cache-data');

const notFound = jsonGenericResponse.response(404);
// { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: { message: 'Not Found' } }

const data = jsonGenericResponse.json({ items: [] }); // returns the data, or {} when none is passed
```

### HTML

```javascript
const { tools: { htmlGenericResponse } } = require('@63klabs/cache-data');

const page = htmlGenericResponse.html('Hello', '<p>Hello World</p>');
// '<html><head><title>Hello</title></head><body><p>Hello World</p></body></html>'

const notFound = htmlGenericResponse.response(404);
```

### XML

```javascript
const { tools: { xmlGenericResponse } } = require('@63klabs/cache-data');

const doc = xmlGenericResponse.xml('<root><item>value</item></root>');
// '<?xml version="1.0" encoding="UTF-8" ?><root><item>value</item></root>'

const notFound = xmlGenericResponse.response(404);
```

### RSS

```javascript
const { tools: { rssGenericResponse } } = require('@63klabs/cache-data');

const feed = rssGenericResponse.rss('<channel><title>News</title></channel>');
// '<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>News</title></channel></rss>'
```

### Text

```javascript
const { tools: { textGenericResponse } } = require('@63klabs/cache-data');

const message = textGenericResponse.text('Plain text response'); // returns the text unchanged
const notFound = textGenericResponse.response(404);
```
````

Every snippet is executed in a probe against the implementation before it goes into the file (Verification, step 7). The outputs shown in comments come from that probe.

### JSDoc

Covered in Components and interfaces: `createGenericResponseModule`, the `@module` comment, and `Response.reset`. `src/lib/tools/generic.response.js` is skipped by the documentation tests (`jsdoc-no-hallucination` and `jsdoc-throws-completeness` filter `generic.response*`), so the JSDoc here is checked by review, and the member list in `@returns` is checked by the drift guard in the tests.

### CHANGELOG (final task)

Written in the final task of `tasks.md`, after repeating the version lookup (Requirement 9.1). Today's lookup: `package.json` is `1.4.2`; `CHANGELOG.md` starts at `## v1.4.1 (2026-11-12)`; no `v1.4.2` heading exists. The heading `## v1.4.2 (unreleased)` is created above `v1.4.1`. No intro prose and no date. Entries, in category order:

```markdown
## v1.4.2 (unreleased)

### Fixed
- **Generic Response Generators documentation** - The "Generic Response Generators" section of the tools documentation showed `jsonGenericResponse(200, ...)` and the other four modules called as functions. They are objects with `response(statusCode)`, `response<code>` templates and a format helper. The section now shows the real API. Documentation only. [Spec: 1-4-2-generic-responses-for-unlisted-status-codes](.kiro/specs/1-4-2-generic-responses-for-unlisted-status-codes/)

### Added
- **Generic response templates for 201, 202, 204, 409, 422, 429 and 503** - `jsonGenericResponse`, `htmlGenericResponse`, `xmlGenericResponse`, `rssGenericResponse` and `textGenericResponse` now provide `response201`, `response202`, `response204`, `response409`, `response422`, `response429` and `response503`. A `Response` built or reset with one of these statuses and no body now carries "Created", "Accepted", "Conflict" and so on, where it used to carry "Internal Server Error". `response204` has a `null` body. Applications that pass their own body see no change. [Spec: ...](.kiro/specs/.../) addresses [#252](<bugs.url>/252)
  - `GenericResponseModule` declares the new members.

### Changed
- **Statuses without a template use the template of their class** - ...
  - Old and new bodies for 201 and 410.
  - This release ships these changes as a PATCH. That departs from AGENTS.md section 2.2, which classes new exports as MINOR and changed default behavior as MAJOR.
- **1xx, 3xx and 205 return no body** - ...
- **A custom `response500` no longer serves unlisted 2xx and 4xx statuses** - ...
- **`reset()` clears the body for a template with a `null` body** - ...
- **XML and RSS render 2xx as success** - ...

### Deprecated
- **`response427`** - 427 is not a registered HTTP status. Use `response429`. The `response427` template is kept through all of v1.x and will be removed no earlier than v2.0.0. `response()` logs one `warn` line per container the first time it resolves 427. ...
```

The "..." marks text written in the final task from the then-current facts. Rules from `changelog-convention-package.md` that the entries follow: hyphen separator after the bold title, spec link then issue reference at the end, backticks for identifiers, no exploit-style detail, no existing text edited.

Affected versions for the Changed entries: the fallback entered the code at `b566abd` (2024-11-18, `package.json` 1.1.0), and the tags in this clone start at v1.3.16. The final task states the range only after checking the published versions (`npm view @63klabs/cache-data versions`, read-only) against `git log -S"this.response500" -- src/lib/tools/`, and otherwise words the entry without a range ("every release that includes the generic response modules"). The entries carry no `Breaking Changes` category (A10).

## Test design

All tests are Jest (`*.jest.mjs`). No test calls a real AWS service or the network. No `fc.assert` call passes a `seed`. Generators are built from a range with a constant list filtered out; none is filtered by the predicate its property asserts (`.kiro/steering/test-execution-monitoring.md`).

### Shared helper: `test/helpers/generic-response-status-codes.mjs`

```javascript
export const LISTED_STATUS_CODES = [200, 201, 202, 204, 400, 401, 403, 404, 405, 408, 409, 418, 422, 427, 429, 500, 503];
export const NO_BODY_CODES = [204];
export const STATUS_CODE_MESSAGES = { 200: "Success", 201: "Created", /* ... all seventeen ... */ };
export const SUCCESS_CODES = LISTED_STATUS_CODES.filter((code) => code >= 200 && code < 300);
export const ERROR_CODES = LISTED_STATUS_CODES.filter((code) => code >= 400);
export const BODILESS_FALLBACK_RANGES = [[100, 199], [300, 399]];  // plus 205
```

The updated `generic-response-module-tests.jest.mjs` and `generic-response-module-property-tests.jest.mjs` import these instead of their own `KNOWN_STATUS_CODES` constants. The per-format `EXPECTED_OUTPUTS` tables (hand-written expected strings per format, which are the pinned v1.4.1 output) stay in the test files and gain rows for the seven new codes. The old ten rows are not edited.

### Updated existing tests

| File | Change |
|---|---|
| `generic-response-module-tests.jest.mjs` | Import the helper. Title "all 10" becomes "all listed". Property 3 ("response500 for any integer outside the known set") is removed and replaced by the class-fallback property file. `response(999)`, `response(0)`, `response(-1)`, `response("abc")` tests stay. |
| `generic-response-module-property-tests.jest.mjs` | Import the helper. Property 4 (backwards compatibility of the ten existing outputs) is kept as is and still checks those ten. A new property compares all seventeen with `EXPECTED_OUTPUTS`. |
| `generic-response-{json,html,rss,text,xml}-tests.jest.mjs` | One `it` per new code with the exact expected body of that format. A `beforeEach` spy on `DebugAndLog.warn` (`mockImplementation(() => Promise.resolve())`) and `afterEach` `jest.restoreAllMocks()` so the 427 tests do not print a warning. `response(999)` stays. |

### `generic-response-class-fallback-tests.jest.mjs` (unit)

- 2xx without a template (203, 206, 299) is `=== response200` in each module; 205 is `=== response204`.
- 4xx without a template (410, 413, 499) is `=== response400`; 5xx without a template (501, 502, 504, 599) is `=== response500`.
- 100, 101, 199, 301, 302, 304, 399 are `=== response204` and their `body` is `null`.
- 0, -1, 99, 600, 999, `NaN`, `"abc"`, `undefined`, `null`, `{}`, `[]`, `true`, `"0x1A4"` are `=== response500` (Requirement 3.2.5).
- `"410"`, `" 410"`, `"410abc"`, `410.7` resolve like 410 (A3). `"404"` is `=== response404`.
- Listed codes are returned by identity: `response(code) === mod["response" + code]` for the seventeen codes.
- A custom module built with `createGenericResponseModule` and then given `response200: undefined` returns `response500` for 203 (Requirement 3.8).
- `response204.body` is `null` in all five modules and the formatter is not called for 204 (a formatter spy counts calls: 16 for the seventeen codes minus 204).
- `headers` of every template is the module's `headers` object.
- No `response205`, `response301`, `response302`, `response304` member exists (Requirement 1.8).
- Each new template's `statusCode` equals its code, per module, with the messages of Requirement 1.3.

### `generic-response-class-fallback-property-tests.jest.mjs`

| Property | Statement | Requirement |
|---|---|---|
| P1 Drift guard | For each module, the sorted keys matching `/^response\d+$/` equal `LISTED_STATUS_CODES` mapped to `"response" + code` | 1.1, 1.8, 10.3.1 |
| P2 Listed identity | For each module and each listed code, `response(code) === mod["response" + code]` and `.statusCode === code` | 10.3.2 |
| P3 Class fallback | For `n` from `fc.integer({min:200,max:299})` excluding 205 and listed codes, `response(n) === response200`; from 400-499 excluding listed, `=== response400`; from 500-599 excluding listed, `=== response500` | 3.2 |
| P4 Bodiless fallback | For `n` in 100-199, 300-399, and for 205, `response(n) === response204` and `.body === null` | 3.2.1, 10.3.4 |
| P5 Out of range | For integers below 100 or at or above 600, and for strings with no leading digits, `response(n) === response500` | 3.2.5, 10.3.5 |
| P6 Success element | For each XML and RSS module and each listed code, the body contains `<hello>` when the code is 2xx and `<error>` otherwise | 2.1, 10.3.6 |
| P7 String and number agree | For integers `n`, `response(String(n)) === response(n)` | 3.1 |

Each uses `numRuns: 100` or fewer (the pure functions are fast). The generators for P3 and P4 are ranges with `LISTED_STATUS_CODES` and 205 filtered out by a constant list, so the filter is a precondition on a test constant, not the predicate under test.

### `response-generic-templates-unit-tests.jest.mjs` (default templates)

Setup follows `response-set-body-to-null-unit-tests.jest.mjs`: `ClientRequest.init({ validations: testValidationsA })` once, `Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 3600 } })` in `beforeEach`, `DebugAndLog.log` and `DebugAndLog.warn` spied, `jest.restoreAllMocks()` in `afterEach`. No custom templates in this file, so the defaults apply.

- Requirement 4.3: `new Response(REQ, { statusCode: 204 })` has status 204, `getBody()` null, a `Content-Type` header.
- 4.4: a response with a body, then `reset({ statusCode: 204 })`, has a null body.
- 4.5: `reset({ statusCode: 204, body: { a: 1 } })` keeps `{ a: 1 }`.
- 4.6: `reset({ statusCode: 301, headers: { Location: "https://example.com/x" } })` has status 301, a null body, `Location` and `Content-Type`.
- 4.7: 201 has the 201 body, 410 is sent as 410 with `{ message: "Bad Request" }`, 203 as 203 with `{ message: "Success" }`, 502 as 502 with `{ message: "Internal Server Error" }`.
- 4.9: `reset({ body: "" })`, `reset({ body: 0 })` leave the previous body.
- 4.10: `finalize()` on a 204 returns status 204, `body: null`, `Content-Type`; `max-age` is added from `routeExpirationInSeconds` (S5 note), and an application-set `Cache-Control` is kept.
- Format: `new Response(REQ, { statusCode: 201 }, Response.CONTENT_TYPE.XML)` has the XML `<hello>Created</hello>` body (explicit content type, S3).
- 4.11 is covered by the existing file, which is not edited.

### `response-generic-templates-custom-unit-tests.jest.mjs` (custom templates)

One `Response.init` call at file level (it takes effect once per file) with `jsonResponses` containing `response200` (body `{ custom: "200" }`), `response201` (`{ custom: "201" }`), `response202` (body `null`), `response204` (body `{ custom: "204" }`), `response400` (`{ custom: "400" }`) and `response500` (`{ custom: "500" }`). No `xmlResponses` (S1).

- 3.5: `new Response(REQ, { statusCode: 201 })` gets `{ custom: "201" }`, not the built-in.
- 3.4: 203 gets `{ custom: "200" }`; 410 gets `{ custom: "400" }`; 502 gets `{ custom: "500" }`; 301 gets `{ custom: "204" }`.
- N1: 201 and 410 do not get `{ custom: "500" }`; 502 and `response(999)` do.
- 4.8: a response holding a body, then `reset({ statusCode: 202 })` with the custom null-body template, has a null body.
- 3.8 is covered in the unit file.

### `generic-response-deprecation-427-tests.jest.mjs` (subprocess)

The flag is module-level, so each case runs in its own child process, started with `spawnSync(process.execPath, ["-e", script, projectRoot], { encoding: "utf8", timeout: 30000 })`. No shell and no string interpolation of paths: the script reads `process.argv[1]` and uses `require(path.join(root, "src/lib/tools/..."))`. The child replaces `DebugAndLog.warn` with a function that records its argument and prints a JSON summary to stdout. One case does not stub it and reads stderr instead.

| Case | Script does | Asserts |
|---|---|---|
| First and second resolve | `response(427)` twice, via `jsonGenericResponse` and then `xmlGenericResponse` | One recorded call, with `response427`, `deprecated`, `427 is not a registered HTTP status`, `response429` in the message (shared flag, Requirement 5.2, 5.3) |
| Other codes | `response(429)`, `response(404)`, `response(410)`, `response(999)` | Zero calls |
| Direct read | `jsonGenericResponse.response427` | Zero calls, template unchanged |
| Result unchanged | `response(427)` | Same object as `mod.response427`, `statusCode` 427 |
| Rejecting logger | `DebugAndLog.warn = () => Promise.reject(new Error("x"))`, `process.on("unhandledRejection", ...)` counts, call `response(427)`, wait a tick | Returns the 427 template, zero unhandled rejections (Requirement 5.4) |
| Throwing logger | `DebugAndLog.warn = () => { throw new Error("x"); }` | Returns the 427 template, no throw |
| Through `Response` | Initialize `ClientRequest`, `new Response(req, { statusCode: 427 })` | One recorded call; the body is the 427 template body |
| Real logger | No stub, `response(427)` twice | stderr contains exactly one `[WARN]` line containing `response427` |
| Load | `require` of `src/index.js` | Exits 0 (no cycle, Requirement 5.7) |

Stdout and stderr are both captured (memory note: `execFileSync` drops stderr on success). Timeouts: 30 s per child, below the 120 s ceiling in `test-execution-monitoring.md`. Nothing here runs `npm test`.

### Type check

`test/types/consumer-tools.ts` gets the three reads in Components and interfaces. `npm run test:types` must exit 0. `test/types/property/type-definitions-property-tests.jest.mjs` already lists the five module exports; it is run to confirm it does not enumerate `GenericResponseModule` members (checked in Verification, step 4).

### Lint

`eslint` on the touched source files and the new test files. The repository baseline for `npm run lint:ci` is not clean, so the criterion is no new problem in the touched files.

### Full-suite gate

`npm test` before the change is called done. The two migration "source immutability" tests list specific source files; `generic.response*.js` and `Response.class.js` are not among them (memory: migration tests fail on uncommitted edits only to other files), and the full run is the check.

### Vacuity check

Before the tests are accepted, each new test file is run against the unchanged source (`git stash push <src files>`, run, `git stash pop`) to confirm the new assertions fail there. The deprecation tests in particular must fail without the warning, since a log-absence assertion is easy to leave vacuous.

## Verification

1. `npm run test:response` then the new test files individually, with `ps aux | grep jest` checked before and after (`test-execution-monitoring.md`).
2. `npm test` (full suite) with a 600 s timeout.
3. `npx eslint` on the touched source and test files, including the empty `catch {` block in `warnDeprecated427` (`no-empty` accepts a block that holds a comment).
4. `npm run test:types`, and `npm test -- test/types` and `test/config`, so the type property tests and the export-surface snapshot run.
5. `npm test -- test/documentation/` and `node scripts/audit-documentation.mjs`.
6. Link check: the documentation tests resolve the relative links in the new section and in the README rewrite.
7. Executable-docs probe: every `javascript` snippet in the new documentation section and the README rewrite is run once in a throwaway `node --input-type=module -e` probe (memory recipe: `createRequire`, `ClientRequest.init({ validations: testValidationsA })`, `Response.init(...)` once, `DebugAndLog.log` replaced). The outputs shown in comments are the probe's outputs. The probe uses the repository sources, not a published package.
8. The 427 warning: one real run of `new Response(req, { statusCode: 427 })` twice in a plain Node process and a look at stderr.
9. `git diff --stat` shows only the files in the Files table.

## Execution flow

Creating a 410 response with no body:

1. `new Response(req, { statusCode: 410 })` calls `reset()`.
2. `reset()` resolves the content type (JSON when no body or header is given, because `inspectBodyContentType(undefined)` returns JSON; S3), then `Response.getGenericResponses` returns the JSON module, merged with any `Response.init()` templates.
3. `module.response(410)` parses 410, finds no `response410`, and `fallbackTemplateName(410)` returns `"response400"`.
4. `reset()` copies the template's headers and body into `newObj` with the status 410 the caller passed, and calls `set()`.
5. `newObj.body` is `{ message: "Bad Request" }`, not `null`, so the new assignment does nothing.
6. `finalize()` sends 410 with that body and adds the error cache headers (`statusCode >= 400`).

Resetting an existing response to 204:

1. `response.reset({ statusCode: 204 })`, body currently `{ a: 1 }`.
2. `response(204)` finds `response204`; its `headers` and `body: null` are copied.
3. `newObj.body` is `null` after `obj?.body ?? null`; `set()` assigns status and headers and ignores the body.
4. `reset()` then sets `this._body = null`. `finalize()` returns `body: null`.

Resolving 427:

1. `response(427)` finds `response427`.
2. `warnDeprecated427()` sets the flag, calls `DebugAndLog.warn(...)` once, and attaches a `.catch` to the returned promise.
3. The template is returned. Later calls skip the logging.

## Error handling

- `response()` adds no throw path. `parseInt` of a `Symbol` or of an object with a throwing `toString` throws, as in v1.4.1 (measured).
- A failure in `DebugAndLog.warn`, thrown or rejected, is swallowed: the warning is lost, the template is returned, and no unhandled rejection occurs. This is the one place in the package where an error is dropped without a log, because the logger is what failed.
- A missing class template falls through to `this.response500`. If `response500` itself is missing (an application removed it), `response()` returns `undefined`, as in v1.4.1.
- `reset()` does not change its error behavior. `Response.getGenericResponses` still throws for an unimplemented content type.

## Correctness properties

For all five modules unless stated:

- **P1** The set of `response<digits>` keys equals the listed codes (no template for 205, 3xx or 1xx).
- **P2** For every listed code, `response(code)` is the module's own template and its `statusCode` equals the code.
- **P3** For every unlisted 2xx other than 205, 4xx and 5xx, `response(n)` is the 200, 400 and 500 template respectively.
- **P4** For every code in 100-199, 300-399, and for 205, `response(n)` is `response204` and its `body` is `null`.
- **P5** For every integer below 100 or at or above 600, and every string with no leading digit, `response(n)` is `response500`.
- **P6** For XML and RSS, a listed code's body contains `<hello>` if and only if the code is 2xx.
- **P7** `response(String(n))` and `response(n)` are the same object.
- **P8** For every code that resolves to a template with a `null` body and every prior non-null body, `reset({ statusCode })` on an instance ends with a `null` body. For every non-nullish truthy `x`, `reset({ statusCode, body: x })` ends with body `x`. (`Response` property test in `response-generic-templates-unit-tests.jest.mjs`, using `fc.constantFrom(204, 301, 304, 205, 100)` and `fc.jsonValue` filtered to truthy non-null values by a constant predicate on the prior body, not on the asserted result.)
- **P9** The ten v1.4.1 templates equal the pinned v1.4.1 outputs in every format (existing Property 4, unchanged).
- **P10** `response()` logs at most once per process, whatever the sequence of codes (subprocess test).

## Backwards compatibility analysis

| Aspect | Impact |
|--------|--------|
| Package exports | None added or removed. The new templates are properties of already exported objects |
| Existing ten templates | Byte for byte the same in all five formats (P9) |
| `response(n)` for a listed v1.4.1 code | The same object contents |
| `response(n)` for the seven added codes | New template instead of the 500 template |
| `response(n)` for other 2xx, 4xx | 200 and 400 template instead of the 500 template |
| `response(n)` for 1xx, 3xx, 205 | `response204` (null body) instead of the 500 template |
| `response(n)` for 5xx and non-statuses | Unchanged: the 500 template |
| Application custom `response500` | No longer serves unlisted 2xx and 4xx. Custom `response200`, `response400`, `response204` now serve their classes |
| `Response` with a non-nullish `body` | Unchanged |
| `Response.reset()` with a `null` template body | Clears the body (was: kept the previous body) |
| XML and RSS 2xx other than 200 | `<hello>` instead of `<error>`. Reachable only through the new 201 and 202 templates, since no other 2xx template exists |
| `response427` | Same template, a one-time warning, a `@deprecated` tag |
| TypeScript consumers | New required members on `GenericResponseModule`. Breaks only a hand-built object of that type |
| Dependency footprint | `generic.response.js` requires `DebugAndLog.class`, already loaded by `index.js` (3 modules, 3.1 ms when loaded alone) |
| Version | PATCH 1.4.2, recorded as an exception to AGENTS.md section 2.2 (Decisions 5 and 10) |

## Known limitations

- `response(410).statusCode` is 400, and `response(301).statusCode` is 204, because the fallback returns the class template. `Response` keeps the status the caller set. A caller who reads the returned object's `statusCode` for a fallback gets the template's code, as it was 500 before.
- The body of a fallback names the class, not the status: a 410 is described as "Bad Request". An application sets `response400` or adds `response410` through `Response.init()`.
- Applications that read `response(n).body` directly for a 3xx now get `null` where they used to get a message.
- A `null` body on a 3xx or 205, and on a 204 behind HTTP API, ALB or Lambda function URLs, was not checked against a deployed stack (Decision 6). Only REST API was checked, for 202 and 204.
- Direct reads of `response427` do not warn (Decision 9).
- A reset to a non-JSON template needs an explicit content type argument until the S3 spin-off is fixed, because `reset({ statusCode })` resolves to JSON when it has no body or header to inspect.
- `finalize()` adds `Cache-Control: max-age` to a bodiless 204 or 3xx when `routeExpirationInSeconds` is above 0 (S5, note only).
- `AGENTS.md` section 2.2 and its stale "Current version: 1.3.6" line are not changed by this feature (Decision 10).

## Follow-ups (outside this spec)

No new issues are created. The existing 1.4.2 spin-offs stay in their folders: `1-4-2-response-init-xmlresponses-overwrites-html-templates` (S1) and `1-4-2-response-set-status-code-resets-content-type-to-json` (S3). S5 (`max-age` on 2xx and 3xx) remains a note. A later release can add 3xx templates and, in a major version, remove `response427`.
