# Design Document

## Overview

This feature adds one public method, `Response.setBodyToNull()`, so a handler can send a response with no body (202 Accepted, 204 No Content). The method sets the private body field to `null` and nothing else. `finalize()` already returns `body: null` for a null body, so it does not change, and neither do `set()`, `setBody()`, `reset()`, or the constructor.

The rest is documentation and tests: JSDoc and type comments for the new method and the existing falsy-value rule, a new "Sending a response with no body" section, two corrected examples, a new notes file that records what API Gateway REST API does with a null, omitted, or empty body (observations O9 to O12), a unit test file, a property test file, one type-check line, and three CHANGELOG entries.

Requirement numbers refer to [requirements.md](requirements.md). Q, D, C, G, I, N, and S numbers refer to [PLAN.md](PLAN.md). O9 to O12 are the observations in Requirement 6; O1 to O8 already exist in `docs/cloudfront-notes/README.md`.

## Design goals

1. **No change for existing callers.** Every call sequence that does not use `setBodyToNull()` returns what it returned in v1.4.0 (Requirement 8.3).
2. **The smallest code change.** One class property in `src/lib/tools/Response.class.js`. `finalize()` is untouched, because it already handles `null` (PLAN.md C7).
3. **Say why the new method exists.** `setBody(null)` is silently ignored. The JSDoc, the types, and the documentation section state that, next to the method that fixes it (Q7).
4. **One statement of each measured fact.** The API Gateway behavior lives in the notes file as observations. The documentation links to the observation and does not repeat the evidence (Requirement 4.3).
5. **Tests pin the compatibility decision.** The characterization tests make any later change to `setBody()`, `reset()`, or the constructor deliberate (PLAN.md I5).
6. **No claim without a measurement.** Each statement about API Gateway rests on O9 to O12 or on an AWS document (Requirement 9.3).

## Pre-design measurements

Taken on 2026-11-10 on the `dev` branch with Node.js and the repository's installed tools. The null body was produced with the private field (`_body = null`), which is what `setBodyToNull()` will do. `routeExpirationInSeconds` was 3600 and `errorExpirationInSeconds` 180.

| Measurement | Result | Used for |
|---|---|---|
| `setStatusCode(202)`, `_body = null`, `finalize()` | `202`, `body: null`, `Content-Type: application/json`, `Cache-Control: max-age=3600`, an `Expires` header | Tests 1.1, 1.3, 1.4; the cache-header statement in the docs |
| `getBody()` and `toObject().body` after `_body = null` | `null` and `null` | Tests |
| `toObject()` called after `finalize()` | Its `headers` already hold the headers `finalize()` added (`Cache-Control`, `Expires`, `x-exec-ms`, and others) | Tests call `toObject()` before `finalize()` when they compare headers |
| `addHeader('Cache-Control', 'no-store')` and `addHeader('Expires', '0')` before `finalize()` | Both preserved (`no-store`, `0`) | Test 1.4; the 202 example |
| `DebugAndLog.log` spy, `RESPONSE` message split on ` \| ` | `["202", "0", "JSON", ...]`: field 0 is the status, field 1 is the byte count (`0`) | Log test |
| `reset({ statusCode: 202 })` after `_body = null` | Body `{"message":"Internal Server Error"}` (a 202 has no template, so the 500 template is used; spin-off S2) | The reset test uses status 200 to avoid S2 |
| `setMessage("hi")` and `addToJsonBody({ k: 1 })` after `_body = null` | `{"message":"hi"}` and `{"k":1}` | Test and docs statement (N4) |
| `setStatusCode(204)` and `setHeaders({ "X-A": "1" })` after `_body = null` | Body still `null`, status 204 | Test 1.6.3 |
| `setBody({ a: 1 })` after `_body = null` | `{"a":1}` | Test 1.6.2 |
| API Gateway REST API (Regional and edge-optimized), 16 requests | No 502; empty content for `null`, omitted, and `""`; `Cache-Control` preserved; `Content-Type` kept on 202; body and `Content-Type` removed on 204 (PLAN.md Section 2) | Notes file, docs section |
| `Response.class.js` ESLint errors before the change | 0 (recorded baseline) | Requirement 5.9 |
| `Response.class.js` is not among the files checked by the two migration "source immutability" tests | Editing it does not trip them (memory: migration tests list six other files) | Full-suite gate |
| Documentation tests scan `src/lib/tools/` JSDoc, markdown `javascript` code fences, and relative links | New JSDoc needs `@returns` and `@example`; code fences must parse; links must resolve | Requirements 3.5, 4.6, 6.8 |
| `docs/` and `.kiro/` are excluded from the npm package (`.npmignore`) | JSDoc and types name doc paths in text, no links | Requirement 3.1 |
| `test/types/consumer-tools.ts` binds `const tools = cacheData.tools` and compiles with `tsc --noEmit` | `tools` is a value, so the type test uses `InstanceType<typeof tools.Response>` | Requirement 5.5 |

## Architecture

### Current

```
Response
  set({ body })            assigns body only if truthy         (setBody(null) is a no-op)
  reset({ body })          body = supplied ?? template         (null selects the template)
  finalize()               keeps a null body as null           (reachable only through _body)
```

### New

```
Response
  set / setBody / reset / constructor / finalize    unchanged
  setBodyToNull()          this._body = null                  <- the only code change
```

`setBodyToNull` bypasses `set()` on purpose: `set()` ignores falsy values (Q1 A), so the method writes the field the way `reset()` and the constructor initialize it (`_body` defaults to `null`, `Response.class.js` line 90).

### Files

| File | Change | Requirements |
|---|---|---|
| `src/lib/tools/Response.class.js` | New `setBodyToNull` property after `setBody`; JSDoc for `setBodyToNull`, `setBody`, and `set` | 1, 2, 3 |
| `types/lib/tools/index.d.ts` | `setBodyToNull(): void;` after `setBody`; sentence added to the `setBody` comment | 3.3 |
| `docs/01-advanced-implementation-for-web-service/response-management.md` | New section "Sending a response with no body" | 4.1 to 4.3 |
| `docs/01-advanced-implementation-for-web-service/routing-patterns.md` | Delete handler uses `setBodyToNull()` | 4.4 |
| `docs/features/tools/README.md` | "Response Class" sample replaced | 4.5 |
| `docs/cloudfront-notes/lambda-proxy-response-body.md` (new) | Observations O9 to O12, method, limits | 6 |
| `docs/cloudfront-notes/README.md` | One link to the new file | 6.1 |
| `CHANGELOG.md` | Three new entries under v1.4.1; no existing line changes | 7 |
| `test/response/response-set-body-to-null-unit-tests.jest.mjs` (new) | Unit and characterization tests | 5.1, 5.2 |
| `test/response/response-set-body-to-null-property-tests.jest.mjs` (new) | Two properties | 5.3 |
| `test/types/consumer-tools.ts` | Two lines | 5.5 |

No other file changes. `package.json`, `src/index.js`, `src/lib/tools/index.js`, the generic response modules, and every existing test stay as they are.

## Components and interfaces

### Response.setBodyToNull

In `src/lib/tools/Response.class.js`, directly after `setBody` (currently lines 492 to 495), in the style of its neighbors (tabs, arrow-function class property):

```javascript
	/**
	 * Removes the body from the response by setting it to null, so the response is sent
	 * with no content. Use it for a 202 Accepted or a 204 No Content.
	 *
	 * setBody(null) cannot do this: setBody() ignores null and other falsy values and
	 * leaves the previous body in place, which for a new response is the template body
	 * such as {"message":"Success"}.
	 *
	 * Only the body changes. The status code and the headers, including Content-Type, stay as
	 * they are, and finalize() returns body: null. finalize() still adds Cache-Control and
	 * Expires from routeExpirationInSeconds to a status below 400 unless you set them, so
	 * set Cache-Control yourself on a 202 or 204 that must not be cached.
	 *
	 * After this call, reset() restores a template body, setBody() with a truthy value assigns
	 * that value, and addToJsonBody() and setMessage() build a new JSON body.
	 *
	 * See docs/01-advanced-implementation-for-web-service/response-management.md.
	 *
	 * @returns {void}
	 * @example
	 * // 204 No Content after a delete
	 * response.setStatusCode(204);
	 * response.setBodyToNull();
	 * return response.finalize();
	 *
	 * @example
	 * // 202 Accepted that must not be cached
	 * response.setStatusCode(202);
	 * response.setBodyToNull();
	 * response.addHeader('Cache-Control', 'no-store');
	 * response.addHeader('Expires', '0');
	 * return response.finalize();
	 */
	setBodyToNull = () => {
		this._body = null;
	};
```

- The JSDoc has a description, `@returns {void}`, and two `@example` blocks, as the JSDoc standard and the documentation tests require. There are no parameters, so no `@param`.
- The path in the description is plain text (Requirement 3.1).
- The field name `_body` appears only in the implementation, never in the JSDoc (Requirement 1.7).
- Nothing is logged and nothing can throw (Requirement 1.5).

### setBody and set (JSDoc only)

`setBody` gains two sentences after its first line, and its `@param` type and examples are unchanged:

```javascript
	/**
	 * Sets the body of the response, overwriting the current body.
	 * A falsy body (null, undefined, '', 0, or false) is not assigned and the previous body
	 * stays. To send a response with no body use setBodyToNull(); to restore the template
	 * body use reset().
	 * ...
```

`set` gains the same statement about its `body` property after its first paragraph:

```javascript
	 * Sets properties of the response, overwriting only the supplied properties.
	 * A falsy statusCode, headers, or body is not assigned and the current value stays.
	 * Use reset() to clear all properties, setBodyToNull() to send no body. ClientRequest cannot be set.
```

### Types

`types/lib/tools/index.d.ts`, in `class Response` directly after `setBody(body: any): void;` (currently line 1646):

```typescript
	/**
	 * Sets the response body to null so the response is sent with no content, for example a
	 * 202 Accepted or a 204 No Content. setBody(null) cannot do this because setBody() ignores
	 * null and other falsy values. Only the body changes: the status code and headers stay,
	 * and finalize() returns body: null. After this call, reset() restores a template body and
	 * addToJsonBody() and setMessage() build a new JSON body.
	 */
	setBodyToNull(): void;
```

The `setBody` comment gets one added sentence: "A falsy body (null, undefined, '', 0, false) is ignored and the previous body stays; use setBodyToNull() to send no body." Nothing else in `types/` changes: `toObject()` and `finalize()` keep their declared return types (N3).

## Documentation design

### `response-management.md` (new section)

Placed after "Overriding cache headers per response" and before "Reset and Reuse". The anchor is `#sending-a-response-with-no-body`.

````markdown
## Sending a response with no body

Use `setBodyToNull()` to send a response with no content, such as `202 Accepted` for work you queued for later or `204 No Content` after a delete.

> **Note**: `setBody(null)` does not do this. `setBody()` ignores `null`, `undefined`, `''`, `0`, and `false` and leaves the previous body in place, which for a new response is the template body such as `{"message":"Success"}`. Call `setBodyToNull()` instead.

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function acceptJob(clientRequest) {
  const response = new Response(clientRequest);

  response.setStatusCode(202);
  response.setBodyToNull();

  // A bodiless 202 should not be cached
  response.addHeader('Cache-Control', 'no-store');
  response.addHeader('Expires', '0');

  return response.finalize();
}
```

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function deleteItem(clientRequest) {
  const response = new Response(clientRequest);

  response.setStatusCode(204);
  response.setBodyToNull();

  return response.finalize();
}
```

Things to know:

- **Cache headers.** `finalize()` adds `Cache-Control: max-age` and `Expires` from `routeExpirationInSeconds` to every status below 400, including a 202 or 204 with no body. Set `Cache-Control` yourself, as in the first example, when the response must not be cached.
- **Content-Type.** The `Content-Type` header stays on the response. Behind API Gateway REST API it reaches the client on a 202, and API Gateway removes it, and any body, from a 204 ([O11 and O12](../cloudfront-notes/lambda-proxy-response-body.md#observations)).
- **Order.** `reset()` and the constructor use a template body when none is supplied, so call `setBodyToNull()` after them. `addToJsonBody()` and `setMessage()` build a new body from a null body.
- **What was checked.** A null, omitted, or empty body returned no error and no content on Regional and edge-optimized REST APIs ([O9](../cloudfront-notes/lambda-proxy-response-body.md#observations)). HTTP API, Application Load Balancer, and Lambda function URLs were not checked.
````

Statements and their basis: first and second bullets rest on the pre-design measurements (cache headers) and O10 to O12; "What was checked" on O9 and its limits. The text names no private field and no `TestHarness`.

### `routing-patterns.md`

The `else` branch of `UsersController.delete` (currently lines 249 to 252) becomes:

```javascript
    } else {
      response.setStatusCode(204);
      response.setBodyToNull(); // setBody(null) is ignored; this sends no body
    }
```

The surrounding code is unchanged. The comment is the "adjacent statement" of Requirement 4.4.

### `docs/features/tools/README.md`

The "Response Class" sample (currently lines 1247 to 1259) is replaced by a sample that exists in the API:

````markdown
### Response Class

Format Lambda responses:

```javascript
const { tools: {Response} } = require('@63klabs/cache-data');

async function createResponse(clientRequest, results) {
  const response = new Response(clientRequest);
  response.setStatusCode(200);
  response.setBody({ message: 'Success', data: results });
  response.addHeader('X-Custom-Header', 'value');

  return response.finalize();
}
```

To send a response with no body, such as a `202 Accepted` or `204 No Content`, call `setBodyToNull()`; `setBody(null)` is ignored. See [Sending a response with no body](../../01-advanced-implementation-for-web-service/response-management.md#sending-a-response-with-no-body).
````

The `ResponseDataModel` sample below it (which also calls `new Response()` with no argument) is not changed (A4 in requirements.md).

### `docs/cloudfront-notes/lambda-proxy-response-body.md` (new)

Follows the layout of `docs/cloudfront-notes/README.md`: purpose, topologies, observations, method, limits, adding, related documentation.

````markdown
# Lambda proxy response body observations

This page records how API Gateway REST API treats the `body` of a Lambda proxy result when the body is `null`, missing, or empty, as observed on deployed REST APIs. `Response.setBodyToNull()` in `@63klabs/cache-data` depends on that behavior and cites the observation it relies on.

Each observation has a date and a status: "Documented by AWS" (with a link) or "Not documented by AWS". AWS can change behavior that it does not document. To check an observation again, repeat the [method](#method). The format of this page follows [CloudFront and API Gateway observations](README.md), and the observation numbers continue that page's sequence.

## Topologies

The observations use topologies T1 and T4 from [CloudFront and API Gateway observations](README.md#topologies): an edge-optimized REST API (T1) and a Regional REST API (T4), neither with a CloudFront distribution of your own.

## Observations

| ID | Date | Topology | What was sent | What was seen | AWS documents it? | Effect on this package |
|----|------|----------|---------------|---------------|-------------------|------------------------|
| O9 | 2026-11-10 | T1, T4 | A Lambda proxy result with `statusCode` 202 or 204 and `body: null`, no `body` key, or `body: ""` | The status code the function set, no 502, and no content (`content-length: 0` on a 202). The three forms were indistinguishable | Not documented by AWS. The [proxy output format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html) shows `body` as a string and says other formats return 502; it does not mention `null` or a missing `body` | `finalize()` returns `body: null` unchanged, and `setBodyToNull()` relies on it |
| O10 | 2026-11-10 | T1, T4 | A bodiless 202 or 204 result with `Cache-Control: no-store` | The header reached the client every time, including through the CloudFront distribution that AWS manages for an edge-optimized API | Not documented by AWS | An application-set `Cache-Control` is the way to keep a bodiless response out of caches; the documentation says so |
| O11 | 2026-11-10 | T1, T4 | A bodiless 202 result with `Content-Type: application/json` | The `Content-Type` header reached the client with `content-length: 0` | Not documented by AWS | `Content-Type` stays on a bodiless response |
| O12 | 2026-11-10 | T1, T4 | A 204 result with `Content-Type: application/json`, once with no body and once with a JSON string body | The response had no body and no `Content-Type` header in both cases | Not documented by AWS | A 204 sent through REST API never shows the template body of the `Response` object to the client |

````

The page continues with the sections below, written in the neutral voice of the sibling page ("The check used one temporary stack ..."), not in the first person.

**Method** (`## Method`, subsections by date as in the sibling page; here one date, 2026-11-10):

- One Node.js 22 Lambda function (128 MB) returning the proxy result that `finalize()` produces, with `Content-Type: application/json` and `Cache-Control: no-store`, and a body chosen by the first path segment:

```javascript
exports.handler = async (event) => {
  const variant = event.pathParameters.variant;
  const status = parseInt(event.pathParameters.status, 10);
  const res = {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  };
  if (variant === "null") {
    res.body = null;
  } else if (variant === "empty") {
    res.body = "";
  } else if (variant === "string") {
    res.body = JSON.stringify({ message: "control" });
  }
  return res;
};
```

- One Regional and one edge-optimized REST API, each with `GET /{variant}/{status}`, a Lambda proxy integration, and a `test` stage. Variants: `null`, `omitted` (no `body` key), `empty`, `string` (control). Statuses: 202 and 204. One `GET` for each of the 8 combinations on each API, 16 requests.
- The stack was deleted afterwards.

Limits (a bulleted list): REST API only (no HTTP API, no Application Load Balancer, no Lambda function URL); the function returned the shape that `finalize()` produces and did not run this package; one client and IPv4; requests were sent once each; Node.js 22 and 128 MB.

Adding an observation: a short paragraph pointing to [the convention](README.md#adding-an-observation) and saying the next free ID is O13.

Related documentation: [Sending a response with no body](../01-advanced-implementation-for-web-service/response-management.md#sending-a-response-with-no-body).

The file contains no account ID, API ID, endpoint host, stack name, function name, request ID, CloudFront edge address range, or AWS profile name (Requirement 6.6). The 202 and 204 request lines in the evidence are described, not copied.

### `docs/cloudfront-notes/README.md`

One bullet is added to "Related documentation":

```markdown
- [Lambda proxy response body observations](lambda-proxy-response-body.md) - What API Gateway REST API does with a `null`, missing, or empty `body`, and the feature of `Response` that depends on it
```

No other line of that page changes, and the observation IDs O1 to O8 stay as they are.

### CHANGELOG

Three new entries under `## v1.4.1 (unreleased)`; no existing line changes. The Added entry for the method goes first in `### Added` (the broadest user-facing addition), and the notes entry goes after the existing "CloudFront and API Gateway observations" entry.

```markdown
- **`Response.setBodyToNull()`** — Sends a response with no body, such as a `202 Accepted` or `204 No Content`. `setBody(null)` cannot do this: `setBody()` ignores `null`, `undefined`, `''`, `0`, and `false`, so a new response always kept its template body (`{"message":"Success"}` for a 200). `setBodyToNull()` sets the body to `null` and `finalize()` returns `body: null`. Nothing else about `Response` changes. `finalize()` still adds `Cache-Control: max-age` to a bodiless 2xx response when `routeExpirationInSeconds` is above 0, so set `Cache-Control` yourself when the response must not be cached. [Spec: 1-4-1-response-setbody-null-is-ignored-so-a-response](.kiro/specs/1-4-1-response-setbody-null-is-ignored-so-a-response/) addresses [#252](https://github.com/63Klabs/cache-data/issues/252)
```

```markdown
- **Lambda proxy response body observations** — `docs/cloudfront-notes/lambda-proxy-response-body.md` records what API Gateway REST API does with a `null`, missing, or empty `body` and with `Cache-Control` and `Content-Type` on a bodiless 202 or 204, with the date of each observation and whether AWS documents it. [Spec: 1-4-1-response-setbody-null-is-ignored-so-a-response](.kiro/specs/1-4-1-response-setbody-null-is-ignored-so-a-response/) addresses [#252](https://github.com/63Klabs/cache-data/issues/252)
```

```markdown
- **`Response` examples in the documentation** — The delete handler in the routing patterns documentation called `response.setBody(null)`, which sent the template body, and the `Response` sample in the tools documentation used methods that do not exist. Both now use methods that exist. [Spec: 1-4-1-response-setbody-null-is-ignored-so-a-response](.kiro/specs/1-4-1-response-setbody-null-is-ignored-so-a-response/) addresses [#252](https://github.com/63Klabs/cache-data/issues/252)
```

The last entry goes at the end of `### Fixed`. Before editing, the task checks that `## v1.4.1 (unreleased)` exists and that `package.json` says `1.4.1` (Requirement 7.4).

## Test design

Two new test files and one type-check addition. No existing test changes (Requirement 5.6). Both new files follow the patterns of `test/response/set-message-unit-tests.jest.mjs` and `response-log-field-sanitization-tests.jest.mjs`.

### Shared setup

- Imports from `@jest/globals` (`describe`, `it`, `expect`, `jest`, `beforeEach`, `afterEach`) and `fast-check` where needed; `Response`, `ClientRequest`, `DebugAndLog` from `../../src/lib/tools/index.js`; `testEventA`, `testContextA`, `testValidationsA` from `../helpers/`.
- `ClientRequest.init({ validations: testValidationsA })` once at the top of the file.
- `Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 3600 } })` in `beforeEach`. `Response.init` takes effect once per process (here, per test file, because Jest isolates modules), so every case in a file shares these settings.
- `DebugAndLog.log` is replaced with `jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve())` in `beforeEach`, so nothing is written and the `RESPONSE` message can be read. `jest.restoreAllMocks()` runs in `afterEach`.
- No test touches `process.env`, a real AWS service, or a child process. A case that needs a different `routeExpirationInSeconds` would need a subprocess (Requirement 5.4); this design adds none, because the 3600 setting covers both the config-derived and the application-set header cases.
- Each file starts with a header comment (Purpose, Setup, Related Tests) as in `response-log-field-sanitization-tests.jest.mjs`.

### `response-set-body-to-null-unit-tests.jest.mjs`

A helper `newResponse(statusCode)` builds `new Response(REQ)` and sets the status code. A helper `loggedLine(RESPONSE)` returns the `RESPONSE` message from the `DebugAndLog.log` spy, as `logResponse` does in `response-log-field-sanitization-tests.jest.mjs`.

| `describe` | Tests (Requirement) |
|---|---|
| `setBodyToNull()` | after the call on a 202 response `finalize()` returns `statusCode` 202 and `body: null` (5.1.1); `getBody()` is `null` and `toObject().body` is `null` (5.1.2); the `Content-Type` header is `application/json` after `finalize()` (5.1.3); `toObject().headers` before `finalize()` equal the headers before the call, and the status code is unchanged (1.2); the method returns `undefined` (1.1); called twice, and called on a fresh response, the body is `null` (5.1.8) |
| interactions after `setBodyToNull()` | `reset({ statusCode: 200 })` restores `Response.getGenericResponses("JSON").response(200).body` (5.1.4); `setMessage("hello")` gives `{ message: "hello" }` (5.1.5); `addToJsonBody({ k: 1 })` gives `{ k: 1 }`; `setBody({ a: 1 })` assigns it; `setStatusCode(204)` and `setHeaders({ "X-A": "1" })` leave the body `null` (1.6) |
| cache headers on a bodiless response | an application-set `Cache-Control: no-store` and `Expires: 0` survive `finalize()` (5.1.6); with none set, `finalize()` adds `Cache-Control: max-age=3600` to the 202 (5.1.9; documents the pairing stated in the docs, Q3 A) |
| `RESPONSE` log line | the message splits on ` \| ` into a status of `"202"` and a byte count of `"0"` (5.1.7) |
| falsy values stay ignored by `setBody()` (characterization, Q1) | `it.each([null, undefined, "", 0, false])`: after `setBody({ a: 1 })`, `setBody(value)` leaves `{ a: 1 }`; on a fresh response `setBody(null)` leaves the template body (5.2) |
| `reset()` and the constructor keep the template for `body: null` (characterization, Q2) | `reset({ statusCode: 200, body: null })` and `new Response(REQ, { statusCode: 200, body: null })` give the 200 template body (5.2) |

The characterization tests use status 200 so that they do not depend on spin-off S2 (templates for unlisted statuses). Their `describe` names and a header comment say that they pin the compatibility decisions Q1 and Q2 and that changing them is a deliberate, versioned change.

### `response-set-body-to-null-property-tests.jest.mjs`

Two properties, each with `{ numRuns: 100 }` and no `seed` option (the `FC_SEED` hook covers replay). Neither spawns a process.

| Property | Statement | Generators |
|---|---|---|
| 1. A null body survives finalization | For every status code `s` in 200 to 599 and every prior JSON object body `b`: `setStatusCode(s)`, `setBody(b)`, `setBodyToNull()`, `finalize()` returns `body: null` and `statusCode` `s` | `fc.integer({ min: 200, max: 599 })`; `fc.record({ id: fc.integer(), name: fc.string({ maxLength: 20 }), tags: fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }) })`. Every draw is a valid input and nothing is filtered by the asserted predicate |
| 2. Falsy bodies never replace a body | For every prior JSON object body `b` and every `v` in `{ null, undefined, "", 0, false }`: `setBody(b)`, `setBody(v)` leaves `getBody()` equal to `b` | `fc.constantFrom(null, undefined, "", 0, false)`; the same record arbitrary |

The record arbitrary uses fixed keys, so no draw can be a prototype-polluting key. Property 2 is the property form of the characterization tests and pins the same compatibility decision.

### Type check

In `test/types/consumer-tools.ts`, in the "Response class" section after the `responseInfo` lines:

```typescript
declare const typedResponse: InstanceType<typeof tools.Response>;
typedResponse.setBodyToNull();
```

`tools` is a value, so `InstanceType<typeof tools.Response>` supplies the instance type. `declare const` emits nothing and `tsc --noEmit` never runs it, so no `ClientRequest` is needed. If `InstanceType` does not resolve for the declared constructor signature, the fallback is `new tools.Response({} as any)` inside a function that is never called. `npm run test:types` decides.

### Lint

| File | Errors before | Expected after |
|---|---|---|
| `src/lib/tools/Response.class.js` | 0 | 0 |
| The two new `.mjs` test files | not applicable | 0 |

`npm run lint:ci` fails on the repository baseline before and after, so Requirement 5.9 is checked per file with `npx eslint <files>`. The new files import Jest globals from `@jest/globals` and use no undeclared global. `.ts` and `.md` files are not linted.

### Full-suite gate

`npm test` must pass. Run the targeted directories first (`test/response`, `test/documentation`, then `npm run test:types`), each under `timeout`, then the full suite. Two known effects, neither a code problem: the migration property tests fail on uncommitted edits to six named files (`Response.class.js` is not one of them), and the documentation tests read the working tree. The new tests spawn no child process and none runs `npm test`.

## Verification

Besides the tests, these checks run once by hand when the work is done and again by the reviewer. No command touches the network or AWS.

| Check | Command or action | Expected |
|---|---|---|
| Method exists, one name | Search `src/` and `types/` for `setBodyToNull` and for `clearBody` | One class property and one declaration for `setBodyToNull`; no `clearBody` |
| Behavior | `node -e` probe: new `Response`, `setStatusCode(202)`, `setBodyToNull()`, `finalize()` (recipe in the repository's probing memory) | `202`, `body: null`, `Content-Type: application/json` |
| Unchanged executable code | `git diff` of `Response.class.js` | Only the added property and JSDoc comment lines differ; no change inside `finalize`, `set`, `reset`, or the constructor |
| Compatibility | Run `test/response/` and `test/request/` before and after | Same pass/fail results apart from the new files |
| Removed pattern | Search `docs/` and `README.md` for `setBody(null)` | Only the sentences that say the call is ignored |
| Samples | Search `docs/features/tools/README.md` for `setHeader(` and `response.get(` and `new Response()` in the Response Class section | No match in that section |
| Links | `npm test -- test/documentation/` | Passes; the new notes file and the new links resolve |
| Identifiers | Search the new and edited docs and the notes file for the account ID, the profile name, `execute-api` hostnames, `cloudfront.net` domains, stack and function names | No match |
| Changelog | `git diff CHANGELOG.md` | Only added lines; no line removed or edited |
| Tests | Targeted directories, `npm run test:types`, then `npm test` | Pass |
| Lint | `npx eslint` on `Response.class.js` and the two new test files | 0 errors each |

## Execution flow

At runtime nothing changes for existing code. A handler that uses the new method takes this path:

```
setStatusCode(202)        set({ statusCode })          status = 202, Content-Type header re-written
setBodyToNull()           this._body = null            nothing else touched
addHeader(...)            optional                     Cache-Control / Expires preserved by finalize()
finalize()                _body === null               bodyAsString stays null, body: null returned,
                                                       cache headers applied if not set, RESPONSE log: bytes = 0
API Gateway               body null -> no content      202 keeps Content-Type; 204 loses body and Content-Type
```

Cost per call is one property write.

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| `setBodyToNull()` called with arguments | Ignored | 1.1 |
| Called twice, or before any other call | Body is `null`; no error | 1.5 |
| Called before `finalize()` on a response whose `Content-Type` is not JSON | Body `null`; `Content-Type` unchanged | 1.2 |
| API Gateway given `body: null` | No 502 on REST API (O9); not checked on HTTP API, ALB, or function URLs | 6.3, 6.4 |
| `finalize()` after the method | Unchanged; its own error handling and `RESPONSE` log are as before | 2.3 |

## Correctness properties

The two properties under Test design are the executable form of these statements:

- **P1.** For every status `s` in 200 to 599 and every prior body, `setBodyToNull()` then `finalize()` yields `body: null` and status `s` (Requirement 1.3).
- **P2.** For every body and every falsy `v`, `setBody(v)` leaves the body unchanged (Requirement 2.1). It follows from the truthiness test in `set()`.
- **P3.** `setBodyToNull()` changes only the body: the status code and the header values before the call equal those after it (Requirement 1.2). It is checked by the unit test, because header equality needs `toObject()` before `finalize()`.

## Backwards compatibility analysis

**Unchanged:** every export; every public signature and return type; every default; the behavior of `set()`, `setBody()`, `reset()`, the constructor, and `finalize()`; the `RESPONSE` log line; `types/` apart from one added declaration and comment text.

**Added:** the instance property `setBodyToNull`. It is an arrow-function class property like `setBody`, so it appears in `Object.keys(response)`; a test or tool that enumerates the instance's own keys sees one more entry. `toObject()` and `finalize()` outputs are unaffected.

**Changed:** documentation and comments only. The 204 example in the routing documentation now shows a call that sends no body; copies of the old example continue to send the template body, as before.

**Versioning:** a new method is MINOR under AGENTS.md section 2.2. The decision to ship it in the unreleased v1.4.1 follows the precedent of `1-4-1-trusted-client-ip` (D1).

## Known limitations

1. The no-502 result covers Regional and edge-optimized REST API only. HTTP API (payload 1.0 and 2.0), Application Load Balancer, and Lambda function URLs were not checked, and the documentation says so.
2. `setBody(null)` stays a silent no-op (Q1 A). Code that calls it expecting to discard data keeps sending that data. `setBodyToNull()` and `reset()` are the supported ways, and the JSDoc and docs say so.
3. The `Null` in the method name follows the current representation. If a later release changes how a bodiless response is sent, the name describes the old one (Q7).
4. `finalize()` still adds `Cache-Control: max-age` to a bodiless 2xx response when `routeExpirationInSeconds` is above 0 (Q3 A). Developers must set `Cache-Control` themselves; the docs and both JSDoc examples show how. The general rule for 202, 204, and 3xx is note-only S5.
5. `reset({ statusCode: 202 })` and the constructor for 201, 202, and 204 use the 500 template body (spin-off S2). The tests avoid depending on that.
6. The observations come from a function that returns the shape `finalize()` produces, not from a function that runs this package. `finalize()` output was probed separately.
7. No test pins the new wording of the documentation (existing documentation tests check syntax, links, and JSDoc structure only). The Verification searches catch a regression at review.

## Follow-ups (outside this spec)

- Spin-offs: `1-4-2-response-init-xmlresponses-overwrites-html-templates` (S1), `1-4-2-generic-responses-for-unlisted-status-codes` (S2), `1-4-2-response-set-status-code-resets-content-type-to-json` (S3).
- After v1.4.1 is published, `63Klabs/atlantis-mcp` can replace `response._body = null` with `response.setBodyToNull()` (N5).
- Note-only items N1 to N4 of PLAN.md Section 7, including the wrong `toObject()` and `finalize()` types in `types/`.
- Observations for HTTP API, Application Load Balancer, and Lambda function URLs, as new files or rows in `docs/cloudfront-notes/` if those integrations matter.
