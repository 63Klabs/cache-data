# Generic responses fall back to the 500 template for 201, 202, 204 and other unlisted status codes

Found while planning [1-4-1-response-setbody-null-is-ignored-so-a-response](../1-4-1-response-setbody-null-is-ignored-so-a-response/PLAN.md) (finding S2, spun off in Q5). It is option 3 of GitHub issue #252. Re-checked by reading the code and running a read-only probe on 2026-11-09 against commit `045decb`. No files were changed and no AWS resource was touched.

## Summary

The generic response templates exist for ten status codes only: 200, 400, 401, 403, 404, 405, 408, 418, 427 and 500. For every other status, `response(n)` returns the 500 template. A response reset to 201, 202, 204, 301, 302, 304, 409, 422, 429 or 503 therefore carries `{"message":"Internal Server Error"}` (or the HTML, XML, RSS or text equivalent) while its status code stays what the caller asked for.

## How it happens

- `src/lib/tools/generic.response.js:16-28` defines `STATUS_CODE_MAP` with the ten codes.
- `:55-64` builds one `response<code>` object per entry.
- `:65-69` defines `response(statusCode)`, which parses the code and returns `this["response" + statusCode] || this.response500`.
- `Response.reset()` (`src/lib/tools/Response.class.js:219`) takes `obj?.body ?? genericResponses.response(statusCode).body`, and the constructor calls `reset()`. The statuses are the caller's, only the body comes from the 500 template.
- Five format modules (`generic.response.json.js`, `.html.js`, `.rss.js`, `.text.js`, `.xml.js`) pass a body formatter to the factory, so each would need the new entries to render correctly.

Local reproduction (read-only, run from the repository root):

```bash
node --input-type=module -e 'import { createRequire } from "module"; const require = createRequire(import.meta.url); const out = console.log.bind(console); const { Response } = require("./src/lib/tools/index.js"); const mod = Response.getGenericResponses("JSON"); const result = {}; for (const code of [201, 202, 204, 301, 304, 409, 422, 429, 503]) { result[code] = mod.response(code); } out(JSON.stringify(result, null, 1));'
```

Observed on 2026-11-09: every code returned `{ statusCode: 500, body: { message: "Internal Server Error" } }`.

## Impact

- A handler that calls `reset({ statusCode: 201 })` or builds `new Response(req, { statusCode: 202 })` without a body sends a 2xx status with an "Internal Server Error" message.
- The `Response` object for a 204 carries a body, which RFC 9110 section 15.3.5 does not allow. A runtime check on 2026-11-10 (UTC) against REST API (Regional and edge-optimized) showed that API Gateway removes the body and `Content-Type` of a 204 itself, so clients behind REST API do not see it. Other integrations (HTTP API, ALB, Lambda function URL) were not checked.
- Applications that always supply their own body are not affected.

## Verified and unverified

- Verified by code reading and the probe above.
- Tests that pin the current list and fallback:
  - `test/response/generic-response-module-tests.jest.mjs` (`KNOWN_STATUS_CODES` at line 23, "all 10 response objects" at line 44, the "any integer outside the known set returns response500" property at about lines 192-202, and the per-format `EXPECTED_OUTPUTS`)
  - `test/response/generic-response-{json,xml,rss,html,text}-tests.jest.mjs` (`response(999)` returns 500)
  - `test/response/generic-response-module-property-tests.jest.mjs` (its own `KNOWN_STATUS_CODES` at line 14)
- Adding codes changes `response(n)` output for any status that is added. An application that reads `response(201).statusCode` expecting 500 would change, though that use is unlikely.
- Not verified: how the Atlantis starter apps use `response(n)` directly.

## Expected behavior

Common success and redirect statuses return a sensible template, or the documentation states clearly that only the ten listed codes have templates. A 204 template has no body.

## Possible fix

Add entries for the statuses the project chooses (at least 201, 202 and 204) to `STATUS_CODE_MAP` and extend each format's body formatter. Update the pinned test lists and the `GenericResponseModule` type in `types/lib/tools/index.d.ts`.

## Open points for planning

- Which statuses to add. 201, 202 and 204 are the minimum for #252. 301, 302, 304, 409, 422, 429 and 503 are common.
- What a 204 template looks like. `Response.reset()` and `set()` ignore a falsy `body` (`Response.class.js:219`, `:247`), so a template with `body: null` would not clear a previous body on an existing instance. It works on a fresh instance only because `_body` starts as `null` (`:90`). The sibling spec adds `Response.setBodyToNull()`; decide whether a 204 template depends on it or on a change to `set()`.
- Option 3 of #252 alone does not fix `setStatusCode(202); setBody(null)`, because `setStatusCode()` never swaps the body. It only helps `reset()` and the constructor.
- Status 427 is labeled "Too Many Requests" (`generic.response.js:26`), but IANA lists 427 as unassigned and 429 as Too Many Requests. `response427` is a public export. Adding 429 while keeping 427 avoids a break.
- Whether the templates for redirect statuses should carry a `Location` header, which the factory cannot supply today.
- Release type. Adding templates changes output for the added codes, so decide between a MINOR bump and PATCH with a CHANGELOG entry under Changed.

## Related documentation

- `src/lib/tools/generic.response.js`
- `src/lib/tools/Response.class.js:205-223` (`reset`)
- `types/lib/tools/index.d.ts` (`GenericResponseModule`)
- [1-3-10-clean-up-generic-responses](../1-3-10-clean-up-generic-responses/) (centralized the factory without adding statuses)
