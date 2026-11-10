# Response.setStatusCode() and setHeaders() switch an HTML or text body to `application/json`

Found while planning [1-4-1-response-setbody-null-is-ignored-so-a-response](../1-4-1-response-setbody-null-is-ignored-so-a-response/PLAN.md) (finding S3, spun off in Q5). Re-checked by reading the code and running read-only probes on 2026-11-09 against commit `045decb`. No files were changed and no AWS resource was touched.

## Summary

When a handler sets a non-JSON body and then calls `setStatusCode()` or `setHeaders()`, the `Content-Type` header changes to `application/json` and `finalize()` wraps the body in a JSON array. A body set as HTML or plain text is sent as `["<html>..."]` with a JSON content type. The order `setStatusCode()` then `setBody()` works, so the result depends on call order.

## How it happens

- `setStatusCode()` and `setHeaders()` are one-line wrappers that call `set({ statusCode })` or `set({ headers })` (`src/lib/tools/Response.class.js:465-468`, `:477-480`).
- `set()` (`:237-251`) works out the content type with `Response.inspectContentType(obj)` and uses it ahead of the content type of the body already on the response: `contentType = result || thisResult || Response.#settings.contentType`.
- `Response.inspectContentType(obj)` (`:336-341`) asks `inspectBodyContentType(obj.body)`. For a status-only or headers-only object, `obj.body` is `undefined`.
- `inspectBodyContentType()` (`:352-367`) tests `body !== null`, so `undefined` passes, is not a string, and returns JSON.
- The JSON result is truthy, so `thisResult` (the existing body's type) is never used, and `addHeader('Content-Type', contentType)` at `:250` overwrites the correct header.

Local reproduction (read-only, run from the repository root):

```bash
node --input-type=module -e 'import { createRequire } from "module"; const require = createRequire(import.meta.url); const out = console.log.bind(console); const { Response, ClientRequest } = require("./src/lib/tools/index.js"); const { testEventA } = await import("./test/helpers/test-event.js"); const { testContextA } = await import("./test/helpers/test-context.js"); const { testValidationsA } = await import("./test/helpers/test-validations.js"); ClientRequest.init({ validations: testValidationsA }); Response.init({ settings: { errorExpirationInSeconds: 180, routeExpirationInSeconds: 0 } }); console.log = () => {}; const html = "<html><body>Hello</body></html>"; const mk = () => new Response(new ClientRequest(testEventA, testContextA)); const a = mk(); a.setBody(html); a.setStatusCode(404); const fa = a.finalize(); const b = mk(); b.setStatusCode(404); b.setBody(html); const fb = b.finalize(); out(JSON.stringify({ bodyThenStatus: [fa.statusCode, fa.headers["Content-Type"], fa.body], statusThenBody: [fb.statusCode, fb.headers["Content-Type"], fb.body] }, null, 1));'
```

Observed on 2026-11-09:

| Call order | Status | Content-Type | Body |
|------------|--------|--------------|------|
| `setBody(html)`, `setStatusCode(404)` | 404 | `application/json` | `["<html><body>Hello</body></html>"]` |
| `setStatusCode(404)`, `setBody(html)` | 404 | `text/html; charset=utf-8` | `<html><body>Hello</body></html>` |
| `setBody(html)`, `setHeaders({ "X-Custom": "1" })` | 200 | `application/json` | `["<html><body>Hello</body></html>"]` |
| `setBody("plain text")`, `setStatusCode(201)` | 201 | `application/json` | `["plain text"]` |

## Impact

Any handler that builds a non-JSON body (HTML, text, XML, RSS) and then adjusts the status code or headers sends a JSON content type with a wrapped body. Clients that expect HTML or text receive an array. The failure depends only on call order, so it is easy to introduce when refactoring a handler. JSON bodies are unaffected.

A workaround by reading (not probed separately): call `setStatusCode()` and `setHeaders()` before `setBody()`, or call `reset()`/`set()` with an explicit `contentType` argument.

## Verified and unverified

- Verified by code reading and the probes above.
- No existing test covers a status or header change after a non-JSON body. Existing tests set the status first or use JSON bodies.
- Not verified: how the Atlantis starter apps order these calls.

## Expected behavior

`setStatusCode()` and `setHeaders()` leave the body and its content type alone. The `Content-Type` stays what the existing body implies, unless the caller supplies a `Content-Type` header.

## Possible fix

Candidates, smallest first:

1. In `set()`, inspect `obj.body` only when the caller supplied a body, and otherwise use the content type of the existing response (`this.inspectContentType()`).
2. Make `inspectBodyContentType()` return `null` for `undefined` as well as `null`. This changes a public static method, which is documented as returning `null` only for a `null` body.
3. Change `setStatusCode()` and `setHeaders()` to pass the current content type explicitly. Leaves `set()` itself with the flaw.

## Open points for planning

- Which candidate to use. Candidate 2 changes the result of `Response.inspectBodyContentType(undefined)` for external callers.
- What `set()` should do for a call such as `set({ headers: { "X-A": "1" } })` on a response whose existing `Content-Type` header was set by the application. Today the header is overwritten unconditionally at `:250`.
- The sibling spec adds `Response.setBodyToNull()`, which leaves `_body` as `null`. For a null body `inspectBodyContentType(null)` returns `null`, so the existing `Content-Type` is kept. Confirm the fix preserves that.
- Release type. This is a bug fix (PATCH) that changes the output of handlers that hit it. List it under Fixed in the CHANGELOG with the call-order example.

## Related documentation

- `src/lib/tools/Response.class.js:237-251` (`set`), `:336-367` (content type inspection), `:465-495` (setters)
- `docs/01-advanced-implementation-for-web-service/response-management.md`
- `docs/features/tools/README.md` (Response section)
