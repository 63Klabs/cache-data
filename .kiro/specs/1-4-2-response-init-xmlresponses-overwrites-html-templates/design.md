# Design Document

## Overview

`Response.init()` merges each `*Responses` option into its own private template slot. The `xmlResponses` branch writes to `Response.#htmlResponses` instead of `Response.#xmlResponses` (`src/lib/tools/Response.class.js:163`). The fix changes that one assignment. The rest of the work is tests that read all five slots, a documentation example, and a CHANGELOG entry.

This design covers the requirements in [requirements.md](requirements.md). Decisions are in [PLAN.md](PLAN.md); references such as (Decision 2) and (C5) point there. The `Content-Type` behavior of template-built responses is out of scope and tracked in [1-4-2-response-generic-template-content-type-header-is-ignored](../1-4-2-response-generic-template-content-type-header-is-ignored/ISSUE.md).

## Design goals

1. Change the fewest lines of source: one assignment, no new function, no new export.
2. Make the XML branch identical in shape to the HTML, RSS, text and JSON branches.
3. Tests that fail before the fix and pass after it, and that would also catch the same typo in any of the other four branches.
4. Documentation that tells the truth about `Content-Type` today.

## Pre-design measurements

Read-only probes on 2026-11-18 against `9a7f3a5` (the commands are in PLAN.md Section 2). They fix the expected values in the tests.

| Measurement | Result |
|-------------|--------|
| `Response.init({ xmlResponses })`, then `getGenericResponses("HTML")` | Not the built-in `htmlGenericResponse` (identity check false). It is `{ ...xmlGenericResponse, ...xmlResponses }` |
| Same call, JSON, RSS and text slots | Identical (`===`) to `jsonGenericResponse`, `rssGenericResponse`, `textGenericResponse` |
| `Response.init({ htmlResponses: { response404 }, xmlResponses: { response200 } })`, then HTML `response(404)` | Built-in XML error body (`<error>Not Found</error>`, XML content type). The custom HTML 404 is lost |
| Custom `response200` in the RSS slot, then `response(206)` | The custom body. The class fallback reads the merged object |
| `htmlGenericResponse`, `xmlGenericResponse` and the other modules | Exported from `src/lib/tools/index.js:630-634`, and the same objects the slots hold before `init()` |
| `JSON.parse('{"__proto__":{"polluted":true}}')` passed as `xmlResponses` | Not testable before the fix, because the XML branch writes to the HTML slot. `Object.prototype` and the slot prototype were not changed by the merge into the HTML slot |
| `DebugAndLog` static log methods | `debug`, `log`, `warn`, `error` (`DebugAndLog.class.js:587, 666, 685, 718`). There is no `info` |

## Architecture

### Current

```
Response.init(options)
  ├─ settings        → #settings
  ├─ jsonResponses   → #jsonResponses
  ├─ htmlResponses   → #htmlResponses
  ├─ xmlResponses    → #htmlResponses   ← defect: overwrites the HTML slot
  ├─ rssResponses    → #rssResponses
  └─ textResponses   → #textResponses
#xmlResponses never changes
```

### New

```
  ├─ xmlResponses    → #xmlResponses    ← { ...#xmlResponses, ...options.xmlResponses }
```

Nothing else in the data flow changes. `getGenericResponses()`, `reset()`, the constructor and `AppConfig.init({ responses })` read the slots exactly as before.

### Files

| File | Change |
|------|--------|
| `src/lib/tools/Response.class.js` | One assignment target and left operand in the `xmlResponses` branch of `init()` |
| `test/response/response-init-all-slots-unit-tests.jest.mjs` | New (file A) |
| `test/response/response-init-xml-only-unit-tests.jest.mjs` | New (file B) |
| `docs/01-advanced-implementation-for-web-service/response-management.md` | New XML example and `Content-Type` note in "Custom Response Templates" |
| `docs/01-advanced-implementation-for-web-service/configuration-options.md` | `xmlResponses` in the `Response.init` example |
| `CHANGELOG.md` | One entry under `### Fixed` in `## v1.4.2 (unreleased)` |

Not changed: `types/`, `src/lib/tools/index.js`, the generic response modules, the `Response.init` JSDoc, `package.json` and `package-lock.json` (Requirements 3.4, 7.5).

## Components and interfaces

### `Response.init`, `xmlResponses` branch

Before (`Response.class.js:160-165`):

```javascript
if ( options?.xmlResponses ) {
	// merge settings using assign object
	//Response.#xmlResponses = Object.assign({}, Response.#xmlResponses, options.xmlResponses);
	Response.#htmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };
}
```

After:

```javascript
if ( options?.xmlResponses ) {
	// merge settings using assign object
	//Response.#xmlResponses = Object.assign({}, Response.#xmlResponses, options.xmlResponses);
	Response.#xmlResponses = { ...Response.#xmlResponses, ...options.xmlResponses };
}
```

Only line 163 changes. The commented-out line stays, as in the other four branches. The spread keeps `response(n)` and every `response<code>` the application did not supply, and it copies into a new object, so the built-in module is not modified (Requirements 1.1, 1.5). The spread copies own enumerable properties through `CreateDataProperty`, so an own `__proto__` key becomes an own data property and the prototype of the new object is not changed (Requirement 1.2 security lines). The branch does not read, log or validate anything else, which matches the other four branches (Requirement 3.1). `Response.init` JSDoc already lists `xmlResponses`, so it is not edited (Requirement 3.4).

The constant `Response.CONTENT_TYPE.XML` is computed at class load from `xmlGenericResponse.contentType` and is not touched.

### Test file A: `response-init-all-slots-unit-tests.jest.mjs`

Covers Requirement 1 (criteria 2 to 4), Requirement 2 (criteria 2 and 3) and the property in Requirement 4.3.

Setup, at module level:
- `ClientRequest.init({ validations: testValidationsA })`.
- One `Response.init()` call with all five options. Each option has a `response200` whose body is a distinct marker and whose `Content-Type` header is distinct per format. `htmlResponses` also has a `response404`. `settings` is omitted.

| Option | `response200.body` | `Content-Type` header |
|--------|--------------------|-----------------------|
| `jsonResponses` | `{ marker: "json200" }` | `application/json` |
| `htmlResponses` | `"<html><body>html200</body></html>"` | `text/html` |
| `xmlResponses` | `"<?xml version=\"1.0\" encoding=\"UTF-8\" ?><marker>xml200</marker>"` | `application/x-xml-custom` |
| `rssResponses` | `"<rss><marker>rss200</marker></rss>"` | `application/rss+xml` |
| `textResponses` | `"text200"` | `text/plain` |

`htmlResponses.response404` is `{ statusCode: 404, headers: { "Content-Type": "text/html" }, body: "<html><body>html404</body></html>" }`.

Tests:

| Group | Case | Requirement |
|-------|------|-------------|
| slots | For each of the five formats, `getGenericResponses(format).response(200).body` equals its own marker | 1.2, 2.3 |
| slots | No format returns another format's marker (assert the four others are absent for each) | 2.3 |
| slots | `getGenericResponses("XML")` and `getGenericResponses(Response.CONTENT_TYPE.XML)` return the same object | 1.2 |
| xml | Built-in `response404` of the XML slot is kept when the application supplied only `response200` (`<error>Not Found</error>` body) | 1.2 |
| xml | `response(206)` returns the custom XML `response200` body (class fallback) | 1.3 |
| xml | `new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.XML)` has the custom XML body; `{ statusCode: 404 }` has the built-in XML 404 body | 1.4 |
| xml | `xmlGenericResponse.response200.body` is still the built-in `<hello>Success</hello>` and `getGenericResponses("XML")` is not `xmlGenericResponse` | 1.5 |
| html | The custom HTML `response404` survives the `xmlResponses` option (the C5 regression) | 2.2 |
| html | The HTML `response200` is the custom HTML marker, not an XML body | 2.2 |
| property | For `n` in 100 to 599, `getGenericResponses("HTML").response(n).headers["Content-Type"]` is neither `Response.CONTENT_TYPE.XML` nor the custom XML header value of the table | 2.1, 4.3 |

The property is:

```javascript
fc.assert(
	fc.property(fc.integer({ min: 100, max: 599 }), (statusCode) => {
		const contentType = Response.getGenericResponses("HTML").response(statusCode).headers["Content-Type"];
		return contentType !== Response.CONTENT_TYPE.XML && contentType !== XML_CUSTOM_CONTENT_TYPE;
	}),
	{ numRuns: 100 }
);
```

`XML_CUSTOM_CONTENT_TYPE` is the custom XML header in the table, `application/x-xml-custom`. The generator is a plain integer range with no filter, and no `seed` is passed (steering `test-execution-monitoring.md`). Before the fix, the HTML slot is `{ ...xmlGenericResponse, ...xmlResponses }`, so every `n` returns either `application/xml` or `application/x-xml-custom`, and the property fails.

Teardown: `jest.restoreAllMocks()` in `afterEach`, as in the sibling files. A header comment follows the format of `response-generic-templates-custom-unit-tests.jest.mjs` and states that `Response.init()` is called once per file (Requirement 4.4).

### Test file B: `response-init-xml-only-unit-tests.jest.mjs`

Covers Requirement 1 (criteria 2 to 5), Requirement 2 (criterion 1), Requirement 4.2, and the security constraints on logging and prototype integrity.

Setup, at module level, in this order:
1. `ClientRequest.init({ validations: testValidationsA })`.
2. Spies on `DebugAndLog.debug`, `.log`, `.warn` and `.error`, each with a `mockImplementation(() => Promise.resolve())`. They are created before `init()` so a log written by the merge would be captured. They are restored in `afterAll`.
3. One `Response.init()` call with only `xmlResponses`, built so it exercises the prototype constraint:

```javascript
const xmlResponses = JSON.parse(
	'{"__proto__":{"polluted":true},"response200":{"statusCode":200,"headers":{"Content-Type":"application/xml"},"body":"<only>xml200</only>"},"response404":{"statusCode":404,"headers":{"Content-Type":"application/xml"},"body":"<only>xml404</only>"}}'
);
```

`JSON.parse` creates a real own `__proto__` data key. An object literal would set the prototype instead and prove nothing. The `polluted` name is not a key of any real template.

Tests:

| Group | Case | Requirement |
|-------|------|-------------|
| xml | `response(200)` and `response(404)` return the custom bodies | 1.2 |
| xml | `response(201)` still returns the built-in body containing `<hello>Created</hello>` | 1.2 |
| xml | `new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.XML)` carries `<only>xml404</only>` | 1.4 |
| other slots | `getGenericResponses("HTML")` is `htmlGenericResponse` (identity), and likewise JSON, RSS, text with their modules | 2.1, 1.1 |
| other slots | For `n` in a fixed list (200, 404, 500), the HTML slot's `Content-Type` is not the XML content type | 2.1 |
| built-in | `xmlGenericResponse.response200.body` is unchanged and is not the custom body | 1.5 |
| prototype | `Object.prototype.polluted` and `({}).polluted` are `undefined`, `Object.getPrototypeOf(getGenericResponses("XML"))` is `Object.prototype`, and `getGenericResponses("XML").polluted` is `undefined` | Security 1.2, 4.2 |
| logging | None of the four spies was called with an argument that contains `xml200`, `xml404` or `polluted` | Security 1.1 |

The `Response.init()` return value is `undefined` and a second `init()` call is ignored; neither case is asserted in B. The sibling files already assert `Response.info().isInitialized`.

Neither new file starts a process, calls `npm test`, or touches AWS (Requirement 4.5).

### Why the prototype test passes before the fix

Before the fix, the `__proto__` key goes into the HTML slot, and the prototype is also unchanged. That assertion is a guard against a later move to a recursive merge. Requirement 4.6 (both files fail before the fix) is met by the XML assertions in the same file.

## Documentation design

### `response-management.md`, "Custom Response Templates"

Add, after the existing JSON example, a short paragraph and an example:

````markdown
Each format has its own option: `jsonResponses`, `htmlResponses`, `xmlResponses`, `rssResponses` and `textResponses`. An option changes only its own format. This example replaces the XML 404 template and leaves every other XML template and every other format as it is:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

Response.init({
  xmlResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0" encoding="UTF-8" ?><error><code>NOT_FOUND</code><message>Resource not found</message></error>'
    }
  }
});
```

A `Response` built from a template, such as `new Response(clientRequest, { statusCode: 404 }, Response.CONTENT_TYPE.XML)`, carries the `Content-Type` of `Response.CONTENT_TYPE.XML` (`application/xml`), not the `Content-Type` in the template's `headers`. To send another type, set it after the response is built:

```javascript
const response = new Response(clientRequest, { statusCode: 404 }, Response.CONTENT_TYPE.XML);
response.addHeader('Content-Type', 'application/atom+xml');
```

`setHeaders({ 'Content-Type': 'application/atom+xml' })` works the same way. Before v1.4.2, `xmlResponses` was applied to the HTML templates by mistake; see the [CHANGELOG](../../CHANGELOG.md).
````

The template body is a static string and the example contains no credential, account ID, host name or request value (Requirements 5.4 and the Security lines under it). The relative CHANGELOG link is `../../CHANGELOG.md` from this directory. The example uses `addHeader` and `setHeaders` as in Requirement 5.3, and it does not say that the template header is applied.

### `configuration-options.md`, `Response.init` example

Add `xmlResponses` after `htmlResponses` in the existing example block:

```javascript
  // Custom XML response templates
  xmlResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0" encoding="UTF-8" ?><error>Resource not found</error>'
    }
  }
```

The `htmlResponses` block gains a trailing comma. No other text in that file changes.

### CHANGELOG

Under `## v1.4.2 (unreleased)`, in `### Fixed`, after the existing entry:

```markdown
- **`Response.init()` applies `xmlResponses` to the XML templates** - `Response.init()` merged `xmlResponses` into the HTML template slot instead of the XML slot. Custom XML templates were never used, and generic HTML responses came back with an XML `Content-Type` and XML bodies. Any `htmlResponses` passed in the same call were replaced. `xmlResponses` now applies to XML responses, and the HTML templates are no longer replaced. Affects v1.2.2 through v1.4.1. Applications that do not pass `xmlResponses` are not affected. If you pass `xmlResponses`, review any code or test that expected the old HTML or XML output. [Spec: 1-4-2-response-init-xmlresponses-overwrites-html-templates](.kiro/specs/1-4-2-response-init-xmlresponses-overwrites-html-templates/)
```

The entry has no `addresses` reference (Decision 4), no exploit detail, and does not claim that the template `Content-Type` is fixed (Requirement 6.5). The final task re-checks the version heading before writing (Requirement 6.1).

## Verification

Run in this order. Each command is one that already exists in `package.json` or the repository.

| Step | Command | Expected |
|------|---------|----------|
| 1. Red | `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/response/response-init-all-slots-unit-tests.jest.mjs test/response/response-init-xml-only-unit-tests.jest.mjs` before the code change | Both files fail on the XML and HTML assertions (Requirement 4.6) |
| 2. Green | The same command after the code change | Both pass |
| 3. Response suite | `npm run test:response` | Passes unchanged |
| 4. Types | `npm run test:types` | Passes |
| 5. Docs | `npm test -- test/documentation/` and `node scripts/audit-documentation.mjs` | Pass |
| 6. Full suite | `npm test` | Exit code 0 |
| 7. Processes | `ps aux \| grep jest \| grep -v grep` | Nothing left running |
| 8. Scope | `git status` | Only the files listed under Files, this spec directory and the spin-off spec directory (Requirement 7.5) |

`npm test` runs under a timeout and process check as in `test-execution-monitoring.md`.

## Execution flow

1. Add both test files and run them (red).
2. Change line 163.
3. Run both files (green), then `npm run test:response`.
4. Edit the two docs files.
5. Run the documentation tests and audit.
6. Add the CHANGELOG entry after repeating the version lookup.
7. Run `npm run test:types` and `npm test`, then check processes and `git status`.

## Error handling

The branch adds no error path. An `xmlResponses` value that is not an object behaves as in the other four branches: a non-object spreads to no keys, and no validation is added (PLAN.md Section 4.1). A second `init()` call is ignored as before.

## Correctness properties

1. **Slot independence.** After one `init()` call with any subset of the five format options, each slot is its built-in module when its option is absent, and `{ ...builtin, ...option }` when present. File A checks this for the full set and file B for the XML-only subset.
2. **No cross-format output.** For every status code from 100 to 599 the HTML slot never returns the XML content type (property in file A).
3. **Built-in immutability.** No `init()` call changes a built-in module object.
4. **Prototype integrity.** Merging an `xmlResponses` object with an own `__proto__` key changes no prototype.
5. **Log silence.** The merge writes nothing to `DebugAndLog` that contains template content.

## Backwards compatibility analysis

| Item | Before | After | Impact |
|------|--------|-------|--------|
| Applications that do not pass `xmlResponses` | All five slots as configured | Same | None |
| Applications that pass `xmlResponses` | XML templates ignored. HTML slot replaced | XML templates applied. HTML slot not replaced | Intended. Stated in the CHANGELOG |
| `htmlResponses` passed with `xmlResponses` | Lost | Applied | Intended |
| `getGenericResponses("HTML")` for such applications | XML templates | HTML templates | Intended |
| Exports, signatures, types, defaults, environment variables | | | None |
| `Response.CONTENT_TYPE` | | | None |

PATCH, per Decision 1. The CHANGELOG states the behavior change and the affected range. No deprecation is needed because no public name changes.

## Known limitations

- A template's `Content-Type` header is not used by a `Response` built from it. This is documented and tracked in the spin-off spec (Decision 5).
- `Response.init()` still ignores a second call without a log line, and does not validate its options (PLAN.md N1).
- Applications outside the Atlantis starters that read `getGenericResponses("HTML")` and expected XML cannot be checked from this repository (Decision 3).
- The 7 requirements that the hardening engine reported as not strict EARS were left as written.

## Follow-ups (outside this spec)

- [1-4-2-response-generic-template-content-type-header-is-ignored](../1-4-2-response-generic-template-content-type-header-is-ignored/ISSUE.md): needs its own plan.
- `Response.info()` JSDoc `@returns` has an unclosed `{` (PLAN.md N2).
