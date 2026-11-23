# Design Document

## Overview

`Response.reset()`, and therefore the constructor, builds a response from a generic template and ends with `this.set(newObj, contentType)`. `set()` finishes with `addHeader('Content-Type', contentType)`, so the template's `Content-Type` is replaced by the `Response.CONTENT_TYPE` value for the format. A `Content-Type` in the `headers` of the constructor or `reset()` object is passed to `getGenericResponses()` as a format selector and throws for anything but the five constants and five codes. `finalize()` stringifies a JSON body only when the header equals `application/json` exactly, and `getContentTypeCode()` returns `undefined` for any other type (`src/lib/tools/Response.class.js`).

This design covers the requirements in [requirements.md](requirements.md). Decisions are in [PLAN.md](PLAN.md); references such as (Decision 2) and (F1) point there. The change is confined to `Response.class.js`: one rewritten method (`reset()`), one changed condition in `finalize()`, one extended method (`getContentTypeCode()`), and a small set of private static helpers with one module-level warning flag. `set()`, `getGenericResponses()`, `Response.CONTENT_TYPE`, the generic modules, `init()`, the public exports and the types are not touched (Requirement 5).

## Design goals

1. A response built from a template carries the supplied header, else the template header, else the format constant (Decision 1).
2. A `Content-Type` header value never makes the constructor or `reset()` throw (Decision 2).
3. A control character cannot enter a response through a supplied or template `Content-Type` (Decision 11).
4. `finalize()` and the response log understand JSON media types and `text/html` (Decisions 3 and 4).
5. No new export, no signature change, no new dependency, no new class.
6. Helpers run in linear time and hold no state, except the one warning flag.
7. Tests fail on the old code for the reasons in the plan and pass on the new code. The documentation tells the truth about which calls re-infer the type (Decision 8).

## Pre-design measurements

Read-only probes on 2026-11-19 against `2335d1b` (commands and tables in PLAN.md Section 2). They fix the expected values in the tests.

| Measurement | Result |
|-------------|--------|
| `new Response(req, { statusCode: 200 }, RSS)` with a custom RSS `response200` carrying `application/atom+xml` | `application/rss+xml`. The template object still holds `application/atom+xml` |
| `new Response(req, { statusCode: 404 }, JSON)` with a custom JSON `response404` carrying `application/problem+json` | `application/json` |
| Constructor with `headers: { "Content-Type": "text/html" }` and no `contentType` argument | Throws `Content Type: text/html is not implemented for getResponses`. Same for `application/atom+xml`, `application/javascript` |
| Constructor with `headers: { "Content-Type": "JSON" }` | No throw. The response header is the literal `JSON` |
| `addHeader("Content-Type", "application/problem+json")` after `setBody({ a: 1 })`, then `finalize()` | Body `[object Object]` |
| `getContentTypeCode()` for `application/atom+xml` and for `text/html` | `undefined` for both |
| `Response.CONTENT_TYPE.JSON` after `init({ jsonResponses: { contentType: "application/problem+json" } })` | `application/json` (unchanged) |
| `addHeader()`, `setHeaders()` and `set()` with `"v\r\nX-Injected: 1"` | Kept (tracked in the spin-off `1-4-2-response-headers-accept-control-characters`) |
| `Object.keys(Response.CONTENT_TYPE)` | `JSON`, `HTML`, `XML`, `RSS`, `TEXT`, `JAVASCRIPT`, `CSS`, `CSV`, in that order |
| `DebugAndLog.warn(message)` | Static, async, returns a promise (`DebugAndLog.class.js:685`). `generic.response.js` already uses a once-per-container `warn` with a `.catch(() => {})` guard for `response427` |

## Architecture

### Current

```
new Response(req, obj, contentType) / reset(obj, contentType)
  ├─ contentType null  → inspectContentType(obj): header value if the key exists, else body type
  │                      (a header value that is not one of the five throws in getGenericResponses)
  ├─ template = getGenericResponses(contentType).response(status)
  ├─ headers  = copy of (obj.headers ?? template.headers)
  └─ set(newObj, contentType)  → addHeader('Content-Type', contentType)   ← overwrites any header
finalize(): JSON stringify only when header === CONTENT_TYPE.JSON
getContentTypeCode(): exact match with the 8 constants, else undefined
```

### New

```
reset(obj, contentType)
  ├─ supplied = usable(obj.headers["Content-Type"])      string, non-blank, no control character
  │             (a control character → warn once per container, treat as absent)
  ├─ contentType null → selectFormat(supplied)            code, constant, or media type of a constant
  │                      else body type, else settings.contentType     (as when the header is absent)
  ├─ template = getGenericResponses(contentType).response(status)
  ├─ headers  = copy of (obj.headers ?? template.headers)
  ├─ set(newObj, contentType)                              unchanged
  └─ addHeader('Content-Type', resolve(supplied ?? usable(template header) ?? constant of the format))
finalize(): JSON stringify when the media type of the header is a JSON media type
getContentTypeCode(): exact match, else media-type match, else JSON for a JSON media type, else undefined
```

`set()` is called as before. `reset()` writes the resolved value after it, so the rule for `set()` stays with the sibling spec (Decision 8). Nothing else in the data flow changes: `AppConfig.init({ responses })`, `Response.init()`, `getGenericResponses()` and every setter read and write exactly what they did.

### Files

| File | Change |
|------|--------|
| `src/lib/tools/Response.class.js` | New private helpers and warning flag; `reset()` rewritten; one condition in `finalize()`; `getContentTypeCode()` extended; JSDoc for the constructor, `reset()`, `getContentTypeCode()` and `finalize()` |
| `test/response/response-template-content-type-unit-tests.jest.mjs` | New (file A) |
| `test/response/response-content-type-header-unit-tests.jest.mjs` | New (file B) |
| `test/response/response-finalize-json-media-type-unit-tests.jest.mjs` | New (file C) |
| `test/response/response-template-content-type-property-tests.jest.mjs` | New (file D) |
| `docs/01-advanced-implementation-for-web-service/response-management.md` | Rewrite the `Content-Type` paragraph in "Custom Response Templates"; add a "Content-Type of a response" section |
| `docs/01-advanced-implementation-for-web-service/configuration-options.md` | `htmlResponses` example uses `text/html; charset=utf-8` |
| `docs/features/tools/README.md` | Only if it describes the changed behavior (Requirement 7, criterion 15). The current text (`:1472-1480`, `:1621`) does not |
| `CHANGELOG.md` | One entry under `### Fixed` in `## v1.4.2 (unreleased)` |

Not changed: `types/`, `src/lib/tools/index.js`, `src/index.js`, the generic response modules, `Response.init()`, `set()`, `getGenericResponses()`, `package.json`, `package-lock.json`, any existing test (Requirement 5).

## Components and interfaces

### Private helpers in `Response.class.js`

Module level, next to the requires:

```javascript
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const CONTROL_CHARACTER_WARNING = "Response: a Content-Type value that contains a control character (U+0000 to U+001F, U+007F) was ignored. The next value in the order supplied header, template header, format constant is used.";
let controlCharacterWarningLogged = false;
```

`CONTROL_CHARACTER` is a single character class with no quantifier, so one `test()` is linear in the length of the string and cannot backtrack (Requirement 5, criterion 7; `SEC-REQ-5.7-SEM-1333-1`). The warning text names the rule and carries no header value (Requirement 2, criterion 8).

Inside the class, after `static CONTENT_TYPE` (private static methods are installed before static field initializers run, and the class already reads `Response.#jsonResponses` in an initializer):

```javascript
static #FORMAT_CODES = ["JSON", "HTML", "XML", "RSS", "TEXT"];
static #MEDIA_TYPES = Object.fromEntries(
	Object.entries(Response.CONTENT_TYPE).map(([code, value]) => [code, Response.#mediaTypeOf(value)])
);
```

| Helper | Input and result | Notes |
|--------|------------------|-------|
| `static #mediaTypeOf(value)` | string to `value.split(";", 1)[0].trim().toLowerCase()` | Pure, linear. `split` with a limit of 1 stops at the first `;` |
| `static #isJsonMediaType(mediaType)` | string to boolean | `application/json`, or `type/subtype+json` with a non-empty type, no second `/`, and at least one character before `+json`: `slash > 0 && endsWith("+json") && length > slash + 6 && indexOf("/", slash + 1) === -1` |
| `static #isJsonContentType(value)` | any to boolean | `typeof value === "string" && #isJsonMediaType(#mediaTypeOf(value))`. A non-string is not JSON and never throws (Requirement 3, criterion 5) |
| `static #usableContentType(value)` | any to string or `null` | `null` when not a string. If `CONTROL_CHARACTER.test(value)`, calls `#warnControlCharacter()` and returns `null`. `null` when `value.trim() === ""`. Otherwise the value as given |
| `static #formatCodeOf(contentType)` | string to code or `null` | The code whose name or constant equals `contentType` |
| `static #selectFormat(value)` | usable string or `null` to code or `null` | Equal to a code or constant (through `#formatCodeOf`), else the code whose `#MEDIA_TYPES` entry equals `#mediaTypeOf(value)`, limited to the five formats; `null` for `null` or no match |
| `static #resolve(value)` | string to string | `Response.CONTENT_TYPE[value]` when `value` is one of the five codes, else `value` (Requirement 2, criterion 5) |
| `static #warnControlCharacter()` | none | Once per container: sets the flag, calls `DebugAndLog.warn(CONTROL_CHARACTER_WARNING)`, attaches `.catch(() => {})` to a returned promise, wraps the call in `try/catch`. A logging failure never reaches the caller (Requirement 2, criterion 9). Same pattern as `warnDeprecated427()` in `generic.response.js` |

The `#usableContentType` order is deliberate: the control character test runs before the blank test, so a value that is only `"\n"` warns and is ignored. A `#selectFormat` match on a media type uses the media types of the five format constants only. `JAVASCRIPT`, `CSS` and `CSV` are never selectors, because there is no template for them (Decision 6); a header of `application/javascript` therefore selects no format and is kept as the response header (Requirement 1, criteria 5 and 7).

All helpers except `#warnControlCharacter()` are pure and hold no state (Requirement 5, criterion 7). They read the frozen-by-convention `Response.CONTENT_TYPE` and `#MEDIA_TYPES` and never write them. The flag belongs to the warning, not to the media-type, JSON and control-character helpers.

### `reset()`

Before (`Response.class.js:208-226`):

```javascript
reset = (obj, contentType = null) => {
	let newObj = {};
	newObj.statusCode = obj?.statusCode ?? 200;
	if (contentType === null) {
		const result = Response.inspectContentType(obj);
		contentType = (result !== null) ? result : Response.#settings.contentType;
	}
	const genericResponses = Response.getGenericResponses(contentType);
	newObj.headers = { ...(obj?.headers ?? genericResponses.response(newObj.statusCode).headers) };
	newObj.body = obj?.body ?? genericResponses.response(newObj.statusCode).body;
	this.set(newObj, contentType);
	if (newObj.body === null) {
		this._body = null;
	}
};
```

After:

```javascript
reset = (obj, contentType = null) => {
	let newObj = {};
	newObj.statusCode = obj?.statusCode ?? 200;
	const supplied = Response.#usableContentType(obj?.headers?.["Content-Type"]);
	if (contentType === null) {
		const code = Response.#selectFormat(supplied);
		if (code !== null) {
			contentType = Response.CONTENT_TYPE[code];
		} else {
			const result = Response.inspectBodyContentType(obj.body);
			contentType = (result !== null) ? result : Response.#settings.contentType;
		}
	}
	const genericResponses = Response.getGenericResponses(contentType);
	const template = genericResponses.response(newObj.statusCode);
	newObj.headers = { ...(obj?.headers ?? template.headers) };
	newObj.body = obj?.body ?? template.body;
	this.set(newObj, contentType);
	const templateValue = Response.#usableContentType(template.headers?.["Content-Type"]);
	this.addHeader('Content-Type', Response.#resolve(
		supplied ?? templateValue ?? Response.CONTENT_TYPE[Response.#formatCodeOf(contentType)]
	));
	if (newObj.body === null) {
		this._body = null;
	}
};
```

Points that follow from this shape:

- **Format selection.** An explicit `contentType` argument goes straight to `getGenericResponses()`, so an unknown argument, including `JAVASCRIPT`, `CSS` and `CSV`, throws as before (Requirement 1, criteria 1 and 2). With a `null` argument, a selecting supplied header wins. Anything else (no header, an unrecognized one, a blank one, one with a control character) falls to the body type and then `settings.contentType`, the same expression the code used when the header was absent (criteria 4 to 6). The body is read with `obj.body`, not `obj?.body`, so `reset(null)` and `reset()` still throw a `TypeError`, as the spin-off `1-4-2-response-reset-and-set-throw-on-a-null-object` records. Only the property named in the message changes from `headers` to `body`.
- **Precedence.** `supplied ?? templateValue ?? constant` implements Requirement 2, criteria 1 to 3. `??` is correct because `#usableContentType` returns `null`, never `""` or `undefined`, for an unusable value.
- **Both values are read every time.** The template value is read even when a supplied header exists. A template that carries a control character therefore warns once, as criterion 8 requires, and the cost is one character-class test.
- **Constant fallback.** `#formatCodeOf(contentType)` returns a code for every `contentType` that `getGenericResponses()` accepted. A custom template whose `headers` is missing or has no `Content-Type` therefore gets `Response.CONTENT_TYPE[code]`. The `Response.CONTENT_TYPE.JAVASCRIPT` family cannot reach this line, because `getGenericResponses()` would already have thrown.
- **Explicit code argument.** `new Response(req, {}, "JSON")` used to write the literal `JSON` through `set()`. The built-in template carries a header, so the response now carries `application/json`. That is the same correction as Requirement 2, criterion 5, and file B asserts it.
- **`set()` stays as it is.** It receives the constant and writes it, then `reset()` overwrites that one header with the resolved value. The overwrite is the only difference from today for a response whose resolved value equals the constant, which is every default response.
- **Other headers.** `newObj.headers` is a copy of the supplied headers, or of the template's headers when none were supplied (Requirement 2, criteria 10 to 13). `this.set()` assigns that copy to `this._headers`, so `addHeader()` writes the copy and never the shared template `headers` object. The template's other headers are not merged into supplied headers, as before. `resolve()` returns a string, so the template object is never written.
- **Body, status and null body** are untouched (criterion 14). `genericResponses.response(...)` is now called once instead of twice. The `427` deprecation warning is once per container either way.
- **`finalize()` → `reset({ statusCode: 500 })`.** The object has no headers, so `supplied` is `null`, the format is chosen from the body type of `undefined` (JSON), and the JSON template's own `Content-Type` is used (criterion 16). With the `finalize()` change below, a `+json` type in that template serializes correctly.

### Resolution table

| Supplied header | `contentType` argument | Format | Response `Content-Type` |
|-----------------|------------------------|--------|-------------------------|
| absent | null, body `undefined` | JSON (body type of `undefined`) | template header, else constant |
| absent | `Response.CONTENT_TYPE.RSS` | RSS | template header, else `application/rss+xml` |
| `text/html` | null | HTML (media type) | `text/html` |
| `text/html; charset=utf-8` | null | HTML (media type) | `text/html; charset=utf-8` |
| `application/atom+xml` | null | from body, else JSON | `application/atom+xml` |
| `application/problem+json` | null | from body, else JSON | `application/problem+json` |
| `application/javascript` | null | from body, else JSON | `application/javascript` |
| `JSON` | null | JSON (code) | `application/json` |
| `JSON` | `Response.CONTENT_TYPE.HTML` | HTML | `application/json` (the supplied code resolves to its constant; the argument decides the template) |
| `application/atom+xml` | `Response.CONTENT_TYPE.RSS` | RSS | `application/atom+xml` |
| `""`, `"  "`, `undefined`, `42`, `null` | null | from body, else JSON | template header, else constant |
| contains a control character | any | from body (null argument) | template header, else constant, plus one warning |
| any | `Response.CONTENT_TYPE.JAVASCRIPT` | throws from `getGenericResponses()` | none |

### `finalize()`

One condition changes (`Response.class.js:714`):

```javascript
// before
if (this._headers['Content-Type'] === Response.CONTENT_TYPE.JSON) {
// after
if (Response.#isJsonContentType(this._headers['Content-Type'])) {
```

The branch body is unchanged: a string or number body is wrapped in an array (the existing `404` reset case stays), and the result goes through `JSON.stringify` (Requirement 3, criteria 1 and 2). The `else` branch still does `${this._body}` (criterion 3). `application/json; charset=utf-8` now takes the JSON branch (criterion 4). The key-absent assignment from `getContentType()` and everything after the `try` block are untouched (criterion 6). A non-string header cannot throw because `#isJsonContentType` tests the type first (criterion 5).

### `getContentTypeCode()`

```javascript
getContentTypeCode = () => {
	const contentTypeStr = this.getContentType();
	const contentTypeCodes = Object.keys(Response.CONTENT_TYPE);
	for (let i = 0; i < contentTypeCodes.length; i++) {
		if (Response.CONTENT_TYPE[contentTypeCodes[i]] === contentTypeStr) {
			return contentTypeCodes[i];
		}
	}
	if (typeof contentTypeStr !== "string") {
		return undefined;
	}
	const mediaType = Response.#mediaTypeOf(contentTypeStr);
	for (let i = 0; i < contentTypeCodes.length; i++) {
		if (Response.#MEDIA_TYPES[contentTypeCodes[i]] === mediaType) {
			return contentTypeCodes[i];
		}
	}
	return Response.#isJsonMediaType(mediaType) ? "JSON" : undefined;
}
```

The first loop is the existing loop, so every value that matched before returns the same key (Requirement 4, criteria 1 and 5). The second loop matches all eight constants by media type, so `text/css; charset=utf-8` returns `CSS` as well as `text/html` returning `HTML`. A JSON media type with no match returns `JSON`, anything else `undefined` (criteria 2 to 4). A non-string result returns `undefined` without throwing (`SEC-REQ-4.2-SEM-248-1` and `-2`). `_log()`, `getContentType()` and the `inspect*` methods are not touched (criteria 6 and 7).

### Types and exports

No change. `types/lib/tools/index.d.ts` declares `reset`, `set`, `getContentTypeCode` and `CONTENT_TYPE` with the same signatures. `npm run test:types` is run to confirm (Requirement 9).

## Error handling

| Situation | Behavior |
|-----------|----------|
| `contentType` argument not accepted by `getGenericResponses()` | Throws the existing error, unchanged |
| `Content-Type` header value of any kind, in the constructor or `reset()` | Never throws |
| Control character in a supplied or template `Content-Type` | Value ignored, next value in the order is used, one warning per container |
| `DebugAndLog.warn` throws or rejects | Swallowed. The response is built |
| Non-string header at `finalize()` or `getContentTypeCode()` | No throw; `${body}` and `undefined` |
| `reset(null)` and `reset()` | Still `TypeError` (spin-off) |

## Security design

- **CWE-113 (header injection).** The new path that lets any string reach a response header is closed for `Content-Type` with `CONTROL_CHARACTER` (Decision 11). `addHeader()`, `setHeaders()`, `set()` and the other headers are tracked in the spin-off `1-4-2-response-headers-accept-control-characters`.
- **CWE-1333 (ReDoS and super-linear work).** One character class and `split`, `trim`, `toLowerCase`, `indexOf` and `endsWith`. No regular expression with a quantifier or alternation touches the header value. File D feeds a 100,000-character value through the constructor and `finalize()`.
- **CWE-532 (sensitive data in logs).** The warning is a constant string. The header value is never logged and `_log()` still writes the code, not the value (Requirement 5, criterion 9).
- **CWE-248 (uncaught exception).** Every helper accepts any input type. The warning call is guarded.
- **Content-type confusion.** A header can now be any string. The documentation says an application must not build it from request data (Requirement 7, criterion 11).
- **Referrer finding.** Not part of this design. It was reported separately as a private advisory.

## Performance

`reset()` runs once per `Response` and now does two `#usableContentType` calls (one character-class test and one `trim` each), at most five string comparisons for a header value, and one `addHeader()`. `finalize()` does one `split`, `trim` and `toLowerCase` on a short string instead of one `===`. `getContentTypeCode()` runs the second loop only when no exact match exists. `#MEDIA_TYPES` is built once at class load. No AWS call, no allocation per request beyond the `split` array. The warning fires once per container.

## Documentation design

### `response-management.md`, "Custom Response Templates"

Replace the paragraph after the `xmlResponses` example (currently `:207-214`, "A `Response` built from a template ... carries the `Content-Type` of `Response.CONTENT_TYPE.XML` ...") and the `addHeader()` example under it with:

````markdown
A `Response` built from a template, by the constructor or `reset()`, carries the first of these `Content-Type` values that exists:

1. A `Content-Type` in the `headers` object you pass to the constructor or `reset()`.
2. The `Content-Type` in the `headers` of the template.
3. The `Response.CONTENT_TYPE` value for the format.

The value is sent exactly as written. This template sends Atom from the RSS slot and a problem document from the JSON slot:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

Response.init({
  rssResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'application/atom+xml' },
      body: '<?xml version="1.0" encoding="UTF-8" ?><feed><title>Not found</title></feed>'
    }
  },
  jsonResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'application/problem+json' },
      body: { type: 'about:blank', title: 'Not Found', status: 404 }
    }
  }
});
```
````

Followed by short paragraphs (each one a requirement criterion):

- A `+json` type, such as `application/problem+json`, is serialized as JSON by `finalize()`, as `application/json` is.
- A `Content-Type` value in `headers` that is not one of the five `Response.CONTENT_TYPE` values no longer throws. `text/html`, and `text/html; charset=utf-8`, select the HTML templates. Another value, such as `application/atom+xml`, selects the template from the body type (JSON when there is no body) and is sent as written.
- A `Content-Type` that contains a control character such as a line feed or carriage return is ignored in a supplied header and in a template, and the next value in the order above is used. A warning is logged once. Other values are not validated. Do not build a `Content-Type` from request data.
- A template that carries `text/html` sends `text/html` with no charset. Use `text/html; charset=utf-8` for HTML.
- `setBody()`, `setStatusCode()` and `setHeaders()` can set `Content-Type` again from the body or headers they receive. Call `addHeader('Content-Type', ...)` after the last of them to keep a custom type. The rule for these calls is being decided in `1-4-2-response-set-status-code-resets-content-type-to-json`.
- A custom `contentType` property on a template module does not change `Response.CONTENT_TYPE`.
- A type outside the five can change how API Gateway (`binaryMediaTypes`, compression) and CloudFront (compression) handle a response. This was not verified.

The new text names no private field, no `TestHarness` and no helper.

### `configuration-options.md`

Change the `htmlResponses` example `'Content-Type': 'text/html'` (line 79) to `'text/html; charset=utf-8'`. The JSON and XML examples already equal the constants and stay.

### JSDoc

| Method | Change |
|--------|--------|
| Constructor | `@param {string} [contentType=null]` text: "Format to use (a `Response.CONTENT_TYPE` value or code). When `null`, the format comes from a `Content-Type` in `obj.headers` that names or matches a format, else from the body, else from settings." `@throws {Error}` when `contentType` is not a supported format; a `Content-Type` header value never throws |
| `reset()` | Same text, plus the order supplied header, template header, format constant, the control-character rule, and the existing null-body note |
| `getContentTypeCode()` | Exact match, then media type, then `JSON` for a JSON media type, else `undefined`. Examples for `text/html` and `application/atom+xml` |
| `finalize()` | "For JSON responses" becomes "For a JSON media type (`application/json` or `+json`)" in the description |
| Private helpers | JSDoc with `@private` and `@example`, `@param` names matching exactly. The documentation tests skip `#` members, and the text is for maintainers |

`@param`, `@returns`, `@example` and `@throws` stay in agreement with the code (Requirement 7, criterion 2). The tests under `test/documentation/` and `node scripts/audit-documentation.mjs` are run.

### CHANGELOG (final task)

Run the lookup in `.kiro/steering/changelog-convention-package.md` again. Add under `### Fixed` in `## v1.4.2 (unreleased)`, after the existing `Response.init()` entry:

```markdown
- **A template's `Content-Type` header is used, and a `Content-Type` header no longer throws** - A `Response` built from a template, by the constructor or `reset()`, replaced the template's `Content-Type` with the `Response.CONTENT_TYPE` value for the format, and a `Content-Type` in the constructor or `reset()` headers threw unless it was one of the five `CONTENT_TYPE` values. It now carries the supplied header, else the template header, else the format constant, and a header such as `text/html` or `application/atom+xml` is accepted and sent as written. `finalize()` serializes `+json` types and `application/json; charset=utf-8` as JSON, where it sent `[object Object]` for an object body, and `getContentTypeCode()` and the response log report `HTML` for `text/html` and `JSON` for a JSON media type. A `Content-Type` that contains a control character is ignored and logged once. Affects v1.2.2 through v1.4.1. If your template's `Content-Type` differs from the default for its format, including an HTML template written as `text/html`, review the header you now send. [Spec: 1-4-2-response-generic-template-content-type-header-is-ignored](.kiro/specs/1-4-2-response-generic-template-content-type-header-is-ignored/)
  - This release ships these changes as a PATCH. That departs from AGENTS.md section 2.2, as the other entries of this release do.
```

No `addresses [#N]` (Requirement 8, criterion 12). No sentence says that `setBody()`, `setStatusCode()` or `setHeaders()` keep a custom type.

## Test design

All files follow `test/response/response-generic-templates-custom-unit-tests.jest.mjs`: a header comment (purpose, setup, teardown, related tests), `ClientRequest.init({ validations: testValidationsA })`, one `Response.init()` at module level, `jest.restoreAllMocks()` in `afterEach` when a spy is used, and `DebugAndLog.log` and `DebugAndLog.warn` silenced. No file starts a process, runs `npm test` or calls AWS. `REQ` is `new ClientRequest(testEventA, testContextA)`, created per test where `finalize()` is called.

### File A: `response-template-content-type-unit-tests.jest.mjs` (custom templates)

One `Response.init()` with these templates (custom headers that differ from the constants):

| Slot | Template | `headers` | Body |
|------|----------|-----------|------|
| `jsonResponses` | `response200` | `Content-Type: application/problem+json` | `{ marker: "json200" }` |
| `jsonResponses` | `response400` | `{}` (no `Content-Type`) | `{ marker: "json400" }` |
| `htmlResponses` | `response200` | `Content-Type: text/html` | HTML marker |
| `xmlResponses` | `response200` | `Content-Type: application/atom+xml` | XML marker |
| `rssResponses` | `response200` | `Content-Type: application/x-rss-custom` | RSS marker |
| `textResponses` | `response200` | `Content-Type: text/plain; charset=utf-8` | text marker |
| `textResponses` | `response404` | `Content-Type: "text/plain\nX-Injected: 1"` | text 404 marker |
| `textResponses` | `response500` | no `headers` property | text 500 marker |
| `textResponses` | `response418` | `Content-Type: TEXT` (a format code) | text 418 marker |

| Group | Case | Requirement |
|-------|------|-------------|
| template header | For each of the five formats, `new Response(REQ, { statusCode: 200 }, CONTENT_TYPE[f])` carries the template value of the table | 2.2, 2.4 |
| template header | Same through `reset({ statusCode: 200 }, CONTENT_TYPE[f])` on an existing response | 2.4 |
| template header | A `headers` object without a `Content-Type` in the first argument still takes the template value (`{ "X-A": "1" }`), and `X-A` is kept | 2.2, 2.10 |
| constant | `response400` with `headers: {}` and `response500` with no `headers` carry `Response.CONTENT_TYPE.JSON` and `.TEXT` | 2.3 |
| precedence | A supplied `Content-Type` of `application/vnd.api+json` beats the template value, with and without a `contentType` argument | 2.1, 2.4 |
| code | The text `response418` template, whose header is the code `TEXT`, builds a response with `text/plain` | 2.5 |
| control character | The text `response404` with a line feed is not used: the response carries `text/plain` and the header has no `\n` | 2.7, 6.23 |
| isolation | `addHeader("X-Custom", "1")` on one response leaves a second response from the same template without it; the template's `headers` object is unchanged after construction and after `addHeader("Content-Type", "x/y")` | 2.12, 2.13 |
| accessors | `getContentType()` and `getHeaders()["Content-Type"]` return the resolved value | 2.15 |
| finalize | A response with `setBody(new Error("x"))`: `finalize()` returns status 500 and the `Content-Type` of the JSON `response500` template | 2.16 |

### File B: `response-content-type-header-unit-tests.jest.mjs` (default templates)

`Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 0 } })`, no template options.

| Group | Case | Requirement |
|-------|------|-------------|
| no throw | `text/html`, `application/atom+xml`, `application/problem+json`, `application/javascript`, `text/html; charset=utf-8` in `headers` with no `contentType` argument do not throw and are the response header exactly | 1.7, 2.1, 2.6 |
| media type | `text/html` and `TEXT/HTML; charset=utf-8` select the HTML template (body contains `</html>`); `application/json; charset=utf-8` selects JSON; `application/xml` selects XML; `application/rss+xml` selects RSS; `text/plain` selects TEXT | 1.3, 1.8 |
| unrecognized | `application/atom+xml` with no body selects the JSON template (body `{"message":"Success"}`); with body `"<html></html>"` it selects HTML | 1.4, 1.5 |
| blank | `undefined`, `""`, `"   "`, `42` as the value: no throw, the template header | 1.6 |
| `null` | `Content-Type: null` behaves as before: template header | 1.6 |
| code | `{ "Content-Type": "JSON" }`, `"HTML"`, `"XML"`, `"RSS"`, `"TEXT"` give the matching constant; `new Response(REQ, {}, "JSON")` gives `application/json`; `{ "Content-Type": "JSON" }` with `HTML` argument gives the HTML template with `application/json` | 2.5 |
| explicit argument | `new Response(REQ, {}, Response.CONTENT_TYPE.JAVASCRIPT)` and `CSS`, `CSV` still throw the existing message; an unknown string argument throws | 1.1, 1.2 |
| exact value | `text/html` is not given a charset; `Application/Atom+XML` keeps its case | 2.6 |
| other headers | Supplied headers are copied and the template's other headers are not merged; no `headers` gives a copy of the template's `headers` | 2.10, 2.11 |
| unchanged | A call with no `Content-Type` and no `contentType` argument gives the same headers as the default call did before (`{ "Content-Type": "application/json" }`), and `Response.CONTENT_TYPE` values equal the module constants | 5.4 |
| control character | A supplied value with LF, CR, HT, U+0000 or U+007F (five cases) is not used: the response carries the template header and no control character; the format comes from the body | 2.7 |
| warning | In the first `describe` of the file, `DebugAndLog.warn` is spied with an implementation that throws. Constructing with a control character builds the response (the logger failure is swallowed), `warn` was called once, and its arguments do not contain the value. A second construction in the same test leaves the call count at one | 2.8, 2.9 |

The warning flag lives in the module, so the "warning" group is the first `describe` in the file and its spy is installed before any control-character value is used, and the file says so in a comment. Later groups use silenced spies and assert nothing about `warn`. This keeps the once-per-registry assertion deterministic without `jest.resetModules()`, which does not isolate CommonJS modules loaded through `import` under `--experimental-vm-modules`. The guard on a rejected promise (`.catch(() => {})`) is the same line as in `generic.response.js` and is not asserted separately, because the flag fires only once per file.

### File C: `response-finalize-json-media-type-unit-tests.jest.mjs`

Default templates, `Response.init({ settings })`.

| Group | Case | Requirement |
|-------|------|-------------|
| JSON family | For `application/problem+json`, `application/vnd.api+json`, `application/json; charset=utf-8`, `APPLICATION/JSON`: an object body gives `JSON.stringify(body)`, an array body too, a string body `"x"` gives `["x"]`, a number `5` gives `[5]` | 3.1, 3.4 |
| unchanged | `application/json`: same four bodies; `null` body gives `body: null` | 3.2 |
| non-JSON | `application/atom+xml`, `text/html`, `application/xml` with a string body give the string; with an object body give `[object Object]` (documents today's behavior) | 3.3 |
| non-string | `addHeader("Content-Type", 42)` and `addHeader("Content-Type", null)` with a string body: `finalize()` does not throw and returns the body as a string | 3.3, 3.5 |
| unchanged header | `finalize()` returns the header value it was given (`application/problem+json`) and adds the key only when absent | 3.6 |
| 404 | A body of `404` with a `+json` header resets to the 404 template, as with `application/json` | 3.1 |
| code | `getContentTypeCode()` returns `JSON` for `application/json`, `application/json; charset=utf-8` and `application/problem+json`; `HTML` for `text/html` and `text/html; charset=utf-8`; `CSS` for `text/css`; `undefined` for `application/atom+xml`; `undefined` for header `42` | 4.1 to 4.5, SEC 4.2 |
| log | With `DebugAndLog.log` spied, the response log message split on ` | ` has 13 fields before and after, and the third field is `HTML` for `text/html` | 4.6 |

### File D: `response-template-content-type-property-tests.jest.mjs`

One `Response.init()` with custom templates for all five formats (each `response200` with a distinct custom `Content-Type`, no control characters, no blanks), `numRuns: 100`, no `seed`, no process, spies silenced.

| Property | Generator | Assertion | Requirement |
|----------|-----------|-----------|-------------|
| P1 | `fc.integer({ min: 100, max: 599 })` and `fc.constantFrom("JSON", "HTML", "XML", "RSS", "TEXT")` | `new Response(REQ, { statusCode }, CONTENT_TYPE[format]).getHeaders()["Content-Type"]` equals `getGenericResponses(format).response(statusCode).headers["Content-Type"]` | 2.1 to 2.4 |
| P2 | `fc.stringMatching(/^[a-z0-9.+-]{1,20}$/)` mapped to `"application/x-" + s` | The constructor does not throw and the header equals the value | 1.7, 2.1, 2.6 |
| P3 | `fc.tuple(prefix, fc.constantFrom(...controlCharacters), suffix)` with prefix and suffix `fc.stringMatching(/^[a-z0-9/+.-]{0,12}$/)` and `controlCharacters` the 32 characters U+0000 to U+001F plus U+007F, joined | The constructor does not throw and the header does not match `/[\u0000-\u001F\u007F]/` | 2.7 |
| P4 | A plain object from `fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), fc.oneof(fc.integer(), fc.boolean(), fc.stringMatching(/^[a-z ]{0,10}$/)), { maxKeys: 5 })` and a media type `"application/" + fc.stringMatching(/^[a-z0-9.-]{1,10}$/) + "+json"` | `finalize().body === JSON.stringify(body)` | 3.1 |

Generator rules (`test-execution-monitoring.md`):

- P2 draws are non-selecting by construction. Premise test in the same file: no value of `Response.CONTENT_TYPE` has a media type that starts with `application/x-`, so a value built as `application/x-…` can never equal a code, a constant or the media type of a constant.
- P3 contains a control character by construction. No draw is filtered and nothing is filtered by the predicate the property asserts.
- P4's subtype is non-empty and ends in `+json`, so it is a JSON media type by construction.
- No `seed` is passed, so the global `FC_SEED` hook applies.

Plus one test, 100,000 characters: `";+ json".repeat(14286)` (100,002 characters) as a supplied header to the constructor and as a header on a response with an object body to `finalize()`, run under the default Jest timeout (`SEC-REQ-5.7-SEM-1333-1`, Requirement 6, criterion 16).

### Fail-before checks (Requirement 6, criterion 21)

| Test | Fails on `2335d1b` because |
|------|---------------------------|
| File B "no throw" and "blank" | The constructor throws `Content Type: ... is not implemented for getResponses` |
| File A "template header" | The template header is replaced by the constant |
| File B "code" | The header is written as the literal `JSON` |
| File C "JSON family" | The body is `[object Object]` |
| File B "control character" | The constructor throws, or the control character reaches the header |

The first run of the new tests is done against the unfixed `Response.class.js` (in the working tree, before step 1 of `tasks.md`) and the failures are recorded in the task notes.

### Existing tests

No existing test file is edited. After the change, `npm test -- test/response/` and the full `npm test` are run. A failure in an existing test stops the work and goes to the user (Requirement 5, criterion 11). The ones that read the constants or the default templates (`response-tests.jest.mjs:60-125`, `generic-response-*-tests.jest.mjs`) are expected to pass because every default template carries the constant and the resolution then returns the same value.

## Correctness properties

| # | Property | Requirements | Checked by |
|---|----------|--------------|------------|
| P1 | For every status 100 to 599 and every format, a template-built response carries the template's `Content-Type` | 2.1 to 2.4 | File D P1 |
| P2 | For every string that selects no format and contains no control character, the constructor does not throw and the response header equals the string | 1.7, 2.6 | File D P2 |
| P3 | For every string that contains a control character, the constructor does not throw and the response header contains none | 2.7 | File D P3 |
| P4 | For every plain-object body and every `+json` media type, `finalize()` returns `JSON.stringify(body)` | 3.1 | File D P4 |
| P5 | A default response (no `Content-Type` input, default templates) carries the same headers as before the change | 2.3, 5.4 | File B "unchanged", the existing `response-tests.jest.mjs` |
| P6 | A value that matched an entry of `Response.CONTENT_TYPE` before the change returns the same code from `getContentTypeCode()` | 4.5 | File C "code" |
| P7 | Helpers finish for a 100,000-character value within the default test timeout | 5.7 | File D long-value test |

## Requirement coverage

| Requirement | Design section |
|-------------|----------------|
| 1 Format selection | `reset()`, Resolution table, `#selectFormat`, File B |
| 2 `Content-Type` of a template-built response | `reset()`, `#usableContentType`, `#resolve`, `#warnControlCharacter`, Files A, B and D |
| 3 `finalize()` | `finalize()`, File C, File D P4 |
| 4 `getContentTypeCode()` | `getContentTypeCode()`, File C |
| 5 Unchanged surface | Files, Types and exports, Security design, "Existing tests" |
| 6 Tests | Test design |
| 7 JSDoc and documentation | Documentation design, JSDoc |
| 8 CHANGELOG | CHANGELOG (final task) |
| 9 Validation | Types and exports, Test design (`npm test`, `npm run test:types`, documentation audit, `git status` limited to the files in "Files") |
