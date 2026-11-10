# Design Document

## Overview

This feature corrects a safety statement in the v1.4.1 client IP documentation, moves the default `CACHE_DATA_TRUSTED_PROXY_HOPS` from `2` to `0`, rewrites the scenario guidance around that default, and records the AWS behavior the guidance rests on in a new `docs/cloudfront-notes/README.md`.

The code change is one constant (`DEFAULT_TRUSTED_PROXY_HOPS` in `src/lib/utils/ClientIpResolver.class.js`) plus comments. Everything else is documentation: the tools README, the JSDoc and type comments, the CHANGELOG, the draft security advisory, and the new notes. No test is added (Q3); five existing test files change because they assert the old default or rely on it.

Requirement numbers refer to [requirements.md](requirements.md). Q, U, D, C, G, and R numbers refer to [PLAN.md](PLAN.md) (R1 to R4 are the re-measurement cases in PLAN.md Section 3.1; "Requirement 4" is spelled out in full below to avoid confusion). O1 to O8 are the observations in Requirement 6.

## Design goals

1. **No client can choose the IP at the default** on any of the four topologies (PLAN.md Section 4.3). The default returns `identity.sourceIp`, which no header changed in any measurement.
2. **One statement of each fact.** The measured facts live in `docs/cloudfront-notes/README.md`. The tools README states instructions and links to the observation (D14).
3. **Every file in the documentation set agrees** (Requirement 10). The set is small enough to check with a few searches (Verification, below).
4. **The only behavior change is the default.** Parsing, gating, memoization, selection, and the debug line are untouched (Requirement 2.6).
5. **No claim without a measurement or an AWS document** (Requirements 4.11, 6.8, 10.3).

## Pre-design measurements

Taken on 2026-11-09 on the `dev` branch at `f746cde`, with Node.js and the repository's installed tools.

| Measurement | Result | Used for |
|---|---|---|
| `ClientIpResolver.resolve` on `192.0.2.1, 198.51.100.10, 203.0.113.30` with `sourceIp` `203.0.113.30` at counts 1, 2, 3, 4 | `203.0.113.30`, `198.51.100.10`, `192.0.2.1`, `203.0.113.30` (count 4 fell through to `sourceIp`) | README example (Requirement 1.2) |
| Same header with a T4-shaped chain `192.0.2.1, 198.51.100.10` at counts 0, 1, 2 | `198.51.100.10`, `198.51.100.10`, `192.0.2.1` | The 1.4.1 unit test `returns the forged entry at N = 2` stays valid |
| Same T3-shaped chain with a forwarded `CloudFront-Viewer-Address` at counts 0, 1, 2, 3 | `sourceIp`, `sourceIp`, the header value, the header value | Confirms the viewer-address step starts at 2 |
| Re-measurement of four topologies (PLAN.md Section 3.1) | `sourceIp` is the client in T1, T3, T4 and an edge address in T2; no forged header changed it | Requirements 4 and 6 |
| ESLint errors per file before the change | `ClientIpResolver.class.js` 0, `RequestInfo.class.js` **1**, `ClientRequest.class.js` 0, the five edited test files 0 | Requirement 3.7 |
| `RequestInfo.class.js` source must not contain the lowercase text `x-forwarded-for` | Asserted by `request-info-client-ip-tests.jest.mjs` ("source no longer contains x-forwarded-for") | JSDoc edits use `X-Forwarded-For` only |
| No file under `types/`, and not `src/index.js` or `src/lib/tools/index.js`, may contain `ClientIpResolver` | Asserted by the same file | Type comment edits do not name the class |
| Tests that depend on the default of 2 | The five client-ip and bug-exploration files listed under Test changes. `client-request-request-log-tests.jest.mjs` sets only `sourceIp` and unsets the variable, so it keeps passing. The `request-info-forwarded-for-preservation-tests` events carry no usable `X-Forwarded-For`, so they keep passing | Requirement 3.1 |
| Migration property tests fail on uncommitted edits to six named files | None of this feature's files is on the list (memory: migration tests) | Full-suite gate |
| Documentation link test strips `#fragments` and checks that the file exists; it skips code blocks | Anchors are not checked, but headings that other text links to keep their text | Requirement 4.12 |
| `docs/` is excluded from the npm package (`.npmignore`) | JSDoc and types name doc paths in text, no links | Requirement 5.5 |
| Header `CloudFront-Viewer-Address` arrived through the managed `AllViewerExceptHostHeader` policy to a Regional origin | The policy's configuration is "all headers except `Host`" (`aws cloudfront get-origin-request-policy`); AWS also documents it as including extra CloudFront headers | O7 |

## Architecture

### Current

```
RequestInfo._clientRequestInfo(event)
  └─ ClientIpResolver.resolve(headers, identity)
        hop count N = env CACHE_DATA_TRUSTED_PROXY_HOPS, default 2
        1. cloudfront-viewer-address   (N >= 2)
        2. x-forwarded-for[length - N] (N >= 1)
        3. identity.sourceIp
```

### New

```
RequestInfo._clientRequestInfo(event)
  └─ ClientIpResolver.resolve(headers, identity)
        hop count N = env CACHE_DATA_TRUSTED_PROXY_HOPS, default 0     <- only code change
        1. cloudfront-viewer-address   (N >= 2)     unchanged
        2. x-forwarded-for[length - N] (N >= 1)     unchanged
        3. identity.sourceIp                         unchanged; the only step at the default
```

### Files

| File | Change | Requirements |
|---|---|---|
| `src/lib/utils/ClientIpResolver.class.js` | `DEFAULT_TRUSTED_PROXY_HOPS = 0`; comments and JSDoc | 1, 2, 5.1 |
| `src/lib/tools/RequestInfo.class.js` | JSDoc of `getClientIp`, `getClientIP`, `_clientRequestInfo` | 5.2 |
| `src/lib/tools/ClientRequest.class.js` | Class JSDoc, "Client IP Resolution" paragraph | 5.2 |
| `types/lib/tools/index.d.ts` | Doc comments of `getClientIp`, `getClientIP` | 5.3 |
| `docs/features/tools/README.md` | Rewrite of the "Client IP resolution" subsection and the note at line 1092 | 1, 4 |
| `docs/cloudfront-notes/README.md` (new) | Topologies, observations O1 to O8, method, how to add | 6 |
| `docs/README.md` | One new entry | 6.1 |
| `CHANGELOG.md` | Three entries edited in place (Q5), one new entry | 7 |
| `.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md` | Draft rewritten to the new default | 8 |
| `test/request/client-ip/unit/client-ip-resolver-unit-tests.jest.mjs` | One test | 3 |
| `test/request/client-ip/unit/client-ip-resolver-config-tests.jest.mjs` | Default value, warning text, expectations | 3 |
| `test/request/client-ip/property/client-ip-resolver-property-tests.jest.mjs` | "Property 2" rewritten in place | 3.3 |
| `test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs` | Header comment, a `beforeEach` in one `describe`, one title | 3.2 |
| `test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs` | Header comment, `beforeEach` sets `2` | 3.2, 3.4 |

No other file changes. `package.json`, `src/index.js`, `src/lib/tools/index.js`, and every other test file stay as they are.

## Components and interfaces

### ClientIpResolver

Three kinds of edit, in `src/lib/utils/ClientIpResolver.class.js`.

**Constant and its comment (lines 8 to 9).**

```javascript
/** Hop count used when the environment variable is unset, empty, or invalid. 0 returns identity.sourceIp, which no header can change, so a missing or wrong setting is never forgeable. */
const DEFAULT_TRUSTED_PROXY_HOPS = 0;
```

Nothing else in the code reads a literal `2`. `memoHops` starts at the constant. `parseTrustedProxyHops` returns the constant for unset, empty, and invalid values. The warning text uses `${DEFAULT_TRUSTED_PROXY_HOPS}`, so it reads `Using the default of 0.` without an edit.

**Class comment (lines 18 to 56).** The paragraph at lines 33 to 42 becomes:

```javascript
 * The hop count N is the number of trusted proxies that append to `X-Forwarded-For`
 * between the client and the Lambda function. It comes from the environment variable
 * `CACHE_DATA_TRUSTED_PROXY_HOPS` and defaults to 0, which returns `identity.sourceIp`
 * and reads neither header. `identity.sourceIp` is the client for an edge-optimized REST
 * API with no CloudFront distribution of the user's own, for a Regional REST API, and for
 * the user's own CloudFront in front of a Regional REST API (measured 2026-11-09, see
 * docs/cloudfront-notes/README.md). Only the user's own CloudFront in front of an
 * edge-optimized REST API needs a count, 3.
 *
 * A wrong count is not equally safe in both directions. A count that is too low selects
 * the address of a trusted proxy, never an entry the client wrote. A count that is too
 * high selects an entry to the left of the real chain, which the client can write: with a
 * count k higher than the real chain, a client that sends k or more extra entries chooses
 * the result, and with fewer the header is shorter than the count and the result is
 * `identity.sourceIp`.
```

The example at the end of the class comment passes the hop count it describes:

```javascript
 * const ip = ClientIpResolver.resolve(
 *   { "x-forwarded-for": "198.51.100.10, 203.0.113.20" },
 *   { sourceIp: "203.0.113.20" },
 *   2
 * );
 * // ip === "198.51.100.10" with a hop count of 2
```

**Method JSDoc.** Text that says "(2 when unset)" or "or 2 when the variable is unset, empty, or invalid" becomes `0`; `getTrustedProxyHops` says "An invalid value gives the default of 0"; the `parseTrustedProxyHops` example becomes `ClientIpResolver.parseTrustedProxyHops("abc");   // { trustedProxyHops: 0, isValid: false }`. Parameter names, return types, and the other examples are unchanged. The `resolve` example (line 80) already passes `3`.

### RequestInfo and ClientRequest

JSDoc only. The text below avoids the lowercase string `x-forwarded-for` (Pre-design measurements).

`RequestInfo.getClientIp` (lines 145 to 159):

```javascript
	 * IP of client request.
	 * 
	 * By default (`CACHE_DATA_TRUSTED_PROXY_HOPS` unset or `0`) this is `identity.sourceIp`,
	 * the address of the connection API Gateway received. That is the client for an
	 * edge-optimized API with no CloudFront of your own, for a Regional API, and for your
	 * own CloudFront in front of a Regional API. With your own CloudFront in front of an
	 * edge-optimized API, set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`.
	 * 
	 * With a hop count of 1 or more, the IP is taken only from values written by a trusted
	 * proxy, in this order: the `CloudFront-Viewer-Address` header (used only when the hop
	 * count is 2 or more), then the `X-Forwarded-For` header read from the right by the hop
	 * count, then `identity.sourceIp`. A value that is missing or is not a valid IP address
	 * moves on to the next source. A hop count above the real number of proxies is not
	 * safe: a client that sends extra `X-Forwarded-For` entries can choose the result.
	 * See "Client IP resolution" in docs/features/tools/README.md and
	 * docs/cloudfront-notes/README.md.
```

`getClientIP` (lines 173 to 177): "Alias of getClientIp(). Returns `identity.sourceIp` by default; with a hop count (`CACHE_DATA_TRUSTED_PROXY_HOPS`) of 1 or more it resolves the IP from the `CloudFront-Viewer-Address` header (2 or more hops), then the `X-Forwarded-For` header read from the right, then `identity.sourceIp`." `_clientRequestInfo` (lines 298 to 311): the same two paragraphs shortened, ending with the pointer to the README. `ClientRequest` class comment (lines 21 to 24): "The client IP returned by getClientIp() is `identity.sourceIp` by default (CACHE_DATA_TRUSTED_PROXY_HOPS unset or 0). With a hop count of 1 or more it comes from the `CloudFront-Viewer-Address` header (2 or more), then the `X-Forwarded-For` header read from the right by the hop count, then `identity.sourceIp`. See docs/features/tools/README.md."

The `test/documentation/` JSDoc tests scan `src/lib/tools/`; every edited block keeps its `@returns` and `@example`.

### Types

`types/lib/tools/index.d.ts` lines 1190 to 1218: the `getClientIp` comment carries the same text as the `RequestInfo` JSDoc above; the `getClientIP` comment carries the alias text. Signatures stay `string | null`. The comments name no class other than `RequestInfo`'s methods.

## Documentation design

### `docs/features/tools/README.md`

Edits by line in the current file (line numbers from the file as of `f746cde`; apply from the bottom up so earlier numbers stay valid).

| Lines | Block | New content |
|---|---|---|
| 1182 | Marker paragraph | See "Marker paragraph" below |
| 1176 to 1182 | Marker command and explanation | Unchanged except line 1182 |
| 1155 to 1159 | Origin lock | See "Origin lock" below. Heading and warning box keep their text |
| 1147 to 1153 | About `CloudFront-Viewer-Address` | Rewritten, see below |
| 1141 to 1145 | Example, corporate proxy sentence, HTTP API sentence | Example for T2 kept (still correct at `3`); corporate-proxy sentence kept, with "when a hop count of 1 or more is set" added |
| 1130 to 1139 | Which value to set | Table rewritten; two paragraphs added after it |
| 1126 to 1128 | T4 warning and "default fails safe" | Replaced by one note |
| 1118 to 1124 | Value table | Rewritten |
| 1110 | Fail-safe paragraph | Replaced; example and table added |
| 1098 | Resolution order | One sentence added before the table |
| 1096 | Introduction | Rewritten |
| 1092 | Note under the `ClientRequest` example | Policy sentence replaced |

**Line 1092.** Replace "That policy does not forward `CloudFront-Viewer-Address`; see [Client IP resolution](#client-ip-resolution) for how the client IP is chosen and what to set for your deployment." with "See [Client IP resolution](#client-ip-resolution) for how the client IP is chosen and what to set for your deployment."

**Line 1096 (introduction).**

> `getClientIp()` (and `getProps().client.ip`, and the client IP in the `RESPONSE` log line) never returns a value that only the client chose. By default it is `identity.sourceIp`, the address of the connection API Gateway received, which no header changed in any of the measurements in [CloudFront and API Gateway observations](../../cloudfront-notes/README.md). CloudFront and API Gateway append to whatever `X-Forwarded-For` the client sends, so the first entry of that header can be forged. When you set a hop count, the address is taken from the right end of the header instead, counting the number of trusted proxies you configure. Only one deployment needs a hop count: your own CloudFront in front of an edge-optimized API (T2).

**Resolution order (before the table).** "At the default hop count of `0` only step 3 applies. The steps apply in order when you set a hop count of 1 or more." The table keeps its rows.

**Line 1110 replacement** (a paragraph, an example table, and a closing sentence):

> A hop count that is too low selects the address of one of your own proxies. That is the wrong address, but never one the client wrote, because every entry to the right of the client's entries was appended by a proxy. A hop count that is too high is not safe. It selects an entry to the left of your real proxy chain, and the client can write those. With a count that is `k` higher than the real number of proxies, a client that sends at least `k` extra `X-Forwarded-For` entries chooses the result. With fewer, the header is shorter than the count and resolution falls through to `identity.sourceIp`. A count of `0` never reads `X-Forwarded-For`, so it has no such risk.
>
> For example, an edge-optimized API with no CloudFront of your own (T1) has the real chain `C, M`, where `C` is the client and `M` is the AWS-managed edge. A client that adds one entry produces the header `192.0.2.1, 198.51.100.10, 203.0.113.30`, where `198.51.100.10` is `C` and `203.0.113.30` is `M`:
>
> | Hop count | Selected | Why |
> |-----------|----------|-----|
> | 2 (matches the chain) | `198.51.100.10` | The client's address |
> | 3 (one too high) | `192.0.2.1` | The entry the client wrote |
> | 1 (one too low) | `203.0.113.30` | A proxy's address, not written by the client |
> | 4 (two too high) | `identity.sourceIp` | The header has three entries, fewer than 4 |

The four rows are reproducible with `ClientIpResolver.resolve` and the pre-design probe (Verification).

**Lines 1118 to 1124 (value table).**

| Value | Meaning |
|-------|---------|
| Unset, empty, or only whitespace | `0`, the default |
| `0` | Use `identity.sourceIp` only. Ignore `X-Forwarded-For` and `CloudFront-Viewer-Address`. Correct for T1, T3, and T4. In T2 it returns your own distribution's edge address (wrong, but not forgeable) |
| `1` | One trusted proxy: the chain of a Regional REST API with no CloudFront (T4). For honest traffic the same address as `0`. `CloudFront-Viewer-Address` is ignored |
| `2` | Two trusted proxies: the chain of T1 and T3. For honest traffic the same address as `0`. Reads `CloudFront-Viewer-Address`. In T3, a request sent straight to the API's URL can choose the result |
| `3` | Three trusted proxies: your own CloudFront in front of an edge-optimized REST API (T2) |
| Any other run of digits, such as `4` | That many trusted proxies |
| Anything else, such as `abc`, `-1`, `1.5`, or `2 hops` | A warning is logged once for each distinct value, then the default of `0` is used |

**Lines 1126 to 1128 replacement (one note):**

> **Note:** At the default, no topology lets a client choose the address `getClientIp()` returns. A hop count above the real number of proxies does (see above), so set a count only when you know your chain, and confirm it with the [marker check](#check-your-deployment). In T2 the default returns your own distribution's edge address. That is the wrong address, but not a forged one, and setting `3` returns the viewer.

**Lines 1130 to 1139 (scenario table).** The legend paragraph at 1132 is kept. The table:

| | Endpoint type | Your own CloudFront in front? | Value to set | Chain in `X-Forwarded-For` at Lambda | `identity.sourceIp` | `getClientIp()` returns | Effect of leaving the default (`0`) | Evidence |
|---|---|---|---|---|---|---|---|---|
| T1 | Edge-optimized | No | `0` (the default; `2` also works) | `..., C, M` | `C` | `C` | None | Measured 2026-11-04 and 2026-11-09 (O1, O3) |
| T2 | Edge-optimized | Yes | `3` | `..., V, E, M` | `E` | `V` at `3` | Returns `E`, your distribution's edge address. Wrong, not forgeable. At `3`, a request sent straight to the API's URL can choose the result unless the origin is verified | Measured 2026-11-04 and 2026-11-09 (O1, O3, O4) |
| T3 | Regional | Yes | `0` | `..., V, E` | `V` | `V` | None | Measured 2026-11-09 (O1, O3, O6) |
| T4 | Regional | No | `0` (`1` also works) | `..., C` | `C` | `C` | None | Measured 2026-11-04 (chain) and 2026-11-09 (O1, O3, O5) |

The observation IDs link to `../../cloudfront-notes/README.md#observations`. After the table, three paragraphs follow (existing T2 example text moves here unchanged):

> The chains and `identity.sourceIp` values above were measured on REST APIs of each type. AWS defines `identity.sourceIp` as the address of the immediate TCP connection to the API Gateway endpoint ([API Gateway variables](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html)). It does not document what a Regional API reports when your own CloudFront is in front of it (T3), so that row rests on the measurement of 2026-11-09. If AWS changes this behavior, set the variable explicitly for your deployment.
>
> With an edge-optimized API behind your own CloudFront, no single count is right for both paths to your function. Through your distribution the chain is `..., V, E, M` (count 3). A request sent straight to the API's `execute-api` URL has the chain `..., C, M` (count 2), so `3` can select an entry the client wrote. A Regional API behind your own CloudFront avoids the problem: `identity.sourceIp` is the viewer on both paths and the default `0` is correct. If you keep an edge-optimized API, set `3` and restrict the API to your distribution (see [Origin lock](#origin-lock-for-your-own-cloudfront-t2-and-t3)).

**Lines 1147 to 1153 (About `CloudFront-Viewer-Address`).**

> CloudFront can add a `CloudFront-Viewer-Address` header holding the viewer's IP address and port. It is sent to the origin only when the origin request policy includes it. The AWS managed `AllViewerExceptHostHeader` policy includes it: through a distribution that used it, the header reached a Regional API holding the real viewer address and port, and a value the viewer supplied was replaced (T3, measured 2026-11-09, observations [O6 and O7](../../cloudfront-notes/README.md#observations)). `getClientIp()` reads the header only when the hop count is 2 or more, so it does not read it at the default.
>
> Whether the header can be trusted depends on the path. The AWS-managed distribution of an edge-optimized API dropped a viewer-supplied value, with or without your own CloudFront in front (T1 and T2, measured 2026-11-04 and 2026-11-09, O4). A Regional API with no CloudFront delivered a viewer-supplied value unchanged (T4, O5), so do not set a hop count of 2 or more there. AWS does not document either behavior.
>
> Because the AWS-managed distribution drops the header in T2, forwarding it from your own CloudFront gives nothing there, and at `3` `getClientIp()` uses `X-Forwarded-For`. Use the [marker check](#check-your-deployment) to see whether the header arrives.

The sentence "This documentation doesn't recommend a specific header behavior" is removed with the paragraph it ended.

**Origin lock (lines 1157 to 1159).** Heading and the warning box unchanged. The body paragraph:

> The API Gateway endpoint stays reachable without going through your distribution. With an edge-optimized API and `3` set (T2), or any deployment that sets a count above the real chain, a request that skips your distribution can carry a forged `X-Forwarded-For` that `getClientIp()` selects. No code in this package can tell your CloudFront hop from a forged one. With a Regional API and the default `0`, a request that skips your distribution cannot change the address (measured 2026-11-09, O3 and O8), but it still bypasses your distribution's caching and web ACL.

**Marker paragraph (line 1182).** The first two sentences are kept. The rest:

> The only entry not written by a proxy is your marker, so the number of trusted proxies in front of your function is the entry count minus one. That is the count that matches the chain, and it is the value to set for T2. For example, `xForwardedForEntries=4` means three proxies appended entries after your marker, so set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`. For a Regional API, or an edge-optimized API with no CloudFront of your own, leave the default `0`: a count that matches the chain also works for honest traffic, but on another path to the same function a chain that is shorter or longer than the one you measured lets a client choose the result. When the step is `viewer-address`, the `CloudFront-Viewer-Address` header arrived and was used.

At the default the debug line reports `step=source-ip` and the entry count, so the marker check still works without setting a count.

### `docs/cloudfront-notes/README.md` (new)

Format: user documentation in the style of `docs/lambda-optimization/README.md`. One H1, then these H2 sections in order.

1. **`# CloudFront and API Gateway observations`** with a purpose paragraph: "This page records how API Gateway and CloudFront behave in front of a Lambda function, as observed on deployed REST APIs. Features of @63klabs/cache-data that depend on that behavior, such as client IP resolution, cite the observation they rely on. AWS can change behavior that it does not document, so each observation carries its date and says whether AWS documents it. To check one again, repeat the [method](#method)."
2. **`## Topologies`**: the table (Topology, Chain at the function, `identity.sourceIp`, Measured), the legend of `C`, `V`, `E`, `M`, and the statement that every address on this page is from the documentation ranges.

   | ID | Topology | Chain in `X-Forwarded-For` at the function | `identity.sourceIp` | Measured |
   |----|----------|--------------------------------------------|---------------------|----------|
   | T1 | Edge-optimized REST API, no CloudFront of your own | `..., C, M` | `C` | 2026-11-04 (two APIs), 2026-11-09 |
   | T2 | Your CloudFront in front of an edge-optimized REST API | `..., V, E, M` | `E` | 2026-11-04, 2026-11-09 |
   | T3 | Your CloudFront in front of a Regional REST API | `..., V, E` | `V` | 2026-11-09 |
   | T4 | Regional REST API, no CloudFront | `..., C` | `C` | 2026-11-04 (chain), 2026-11-09 |

3. **`## Observations`**: one table with columns ID, Date, Topology, What was sent, What was seen, AWS documents it?, Effect on this package.

   | ID | Date | Topology | Sent | Seen | AWS documents it? | Effect on this package |
   |----|------|----------|------|------|-------------------|------------------------|
   | O1 | 2026-11-04, 2026-11-09 | T1 to T4 | A request, with and without a forged `X-Forwarded-For` | Each CloudFront distribution appends the viewer address to the end of the header, and API Gateway appends the address that connected to it. Forged entries stay on the left | Yes for CloudFront ([request and response behavior for custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html)). Not for API Gateway's own entry | A hop count reads the entry `N` from the right |
   | O2 | 2026-11-04 | Through CloudFront | Two `X-Forwarded-For` headers from the viewer | CloudFront joined them into one comma-separated value, in order, in both `headers` and `multiValueHeaders` of the event | Not documented | The resolver reads the one `headers` value |
   | O3 | 2026-11-04 (T1, T2), 2026-11-09 (T1 to T4) | T1 to T4 | Forged `X-Forwarded-For` | `identity.sourceIp` was the client in T1, T3, and T4 and an edge address in T2. It never held a forged value | Defined as the immediate TCP connection ([API Gateway variables](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html)); the T3 result is not documented | The default hop count `0` returns it |
   | O4 | 2026-11-04, 2026-11-09 | T1, T2 | A viewer-supplied `CloudFront-Viewer-Address` | The header was absent at the function | Not documented | The viewer-address step is safe in T1 and T2, and gives nothing in T2 |
   | O5 | 2026-11-04, 2026-11-09 | T4 | A viewer-supplied `CloudFront-Viewer-Address` | The function received the value unchanged | Not documented | A hop count of 2 or more must not be set in T4 |
   | O6 | 2026-11-09 | T3 | A viewer-supplied `CloudFront-Viewer-Address` through a distribution using the managed `AllViewerExceptHostHeader` policy | The function received the real viewer address and port; the supplied value was replaced | Not documented | At a hop count of 2 or more the header is the viewer address in T3 |
   | O7 | 2026-11-09 | T3 | No forged header | The managed `AllViewerExceptHostHeader` origin request policy forwarded `CloudFront-Viewer-Address` to a Regional origin | The policy is documented as including extra CloudFront request headers for protocol, TLS version, device type, and viewer location ([managed origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)). The package's earlier statement that it did not forward the header was wrong | No custom policy is needed to receive the header on a Regional origin |
   | O8 | 2026-11-09 | T1 to T4 | Forged `Forwarded`, `X-Real-Ip`, and `X-Forwarded-For` | `identity.sourceIp` did not change | Not documented | None of those headers is read for the client IP |

   Links in the table use the same URLs as above. The "Sent" and "Seen" cells use documentation range addresses only.

4. **`## Method`**: two subsections.
   - *2026-11-04 captures.* Deployed REST API test stacks of each type (one with its own CloudFront in front), read from the Lambda event log or the API Gateway execution log. Requests carried a marker `X-Forwarded-For` and a marker `CloudFront-Viewer-Address`, each from a documentation range.
   - *2026-11-09 re-measurement.* One temporary stack: a Regional and an edge-optimized REST API, each with one `GET` method on the root resource using a mock integration (request template `{"statusCode": 200}`), each with a CloudFront distribution (managed `CachingDisabled` cache policy, managed `AllViewerExceptHostHeader` origin request policy, HTTPS to the origin). The integration response template returns the three values:

     ```text
     {"sourceIp":"$context.identity.sourceIp","xff":"$util.escapeJavaScript($input.params('X-Forwarded-For'))","viewerAddress":"$util.escapeJavaScript($input.params('CloudFront-Viewer-Address'))"}
     ```

     Four header variants were sent to the API directly and through its distribution: none; `X-Forwarded-For: 192.0.2.1`; `X-Forwarded-For: 192.0.2.1, 192.0.2.2`; and `X-Forwarded-For` together with `Forwarded: for=192.0.2.3`, `X-Real-Ip: 192.0.2.4`, and `CloudFront-Viewer-Address: 192.0.2.5:1234`. The stack was deleted afterwards.
   - *Limits.* The 2026-11-09 stack used mock integrations rather than a Lambda proxy integration (`$context.identity.sourceIp` is the field that fills `requestContext.identity.sourceIp`), one client address, and IPv4 only.
5. **`## Adding an observation`**: the fields of the table, one row per observation, the next free ID, never real addresses or identifiers, a new file in this directory for a new topic with a link from this page, and a link from the feature documentation that depends on it.
6. **`## Related documentation`**: link to the "Client IP resolution" subsection of the tools README.

The page contains no account, endpoint, distribution, or stack identifier, and no CloudFront edge address range.

### `docs/README.md`

A new section between "Features and API" and "Optimization and Best Practices":

```markdown
### Observed AWS Behavior

- **[CloudFront and API Gateway Observations](./cloudfront-notes/README.md)** - Dated observations of how API Gateway and CloudFront treat `X-Forwarded-For`, `CloudFront-Viewer-Address`, and `identity.sourceIp` in front of a Lambda function, and the features of cache-data that depend on them.
```

### CHANGELOG

Edits in `## v1.4.1 (unreleased)` (Q5 = B). Existing spec links stay; the edited entries add the new spec link and the issue reference.

**Line 16** (sub-bullet of the "Client IP can no longer be chosen by the client" entry) becomes:

```markdown
  - The default is `0`: the IP is `identity.sourceIp`, which is the client for an edge-optimized REST API with no CloudFront of your own, for a Regional REST API, and for your own CloudFront in front of a Regional REST API, and no topology lets a client choose it. With your own CloudFront in front of an edge-optimized REST API, set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`; until then the logged IP is your distribution's edge address, not a forged one.
```

**Line 17** is unchanged.

**Line 18** (the "Regional APIs without CloudFront stay forgeable..." bullet) is removed.

**Line 23** (the `CACHE_DATA_TRUSTED_PROXY_HOPS` entry) becomes:

```markdown
- **`CACHE_DATA_TRUSTED_PROXY_HOPS`** — The number of trusted proxies that append to `X-Forwarded-For` in front of the function. Defaults to `0`, which uses only `identity.sourceIp`; set `3` with your own CloudFront in front of an edge-optimized API. `CloudFront-Viewer-Address` is read only when the count is 2 or more. A count that is too high is not safe: a client that adds `X-Forwarded-For` entries can choose the selected entry, so set a count only when you know your chain. An invalid value logs one warning and uses `0`. [Spec: 1-4-1-trusted-client-ip](.kiro/specs/1-4-1-trusted-client-ip/), [Spec: 1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that](.kiro/specs/1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that/) addresses [#253](https://github.com/63Klabs/cache-data/issues/253)
```

**New entry** under `### Added`, after line 24:

```markdown
- **CloudFront and API Gateway observations** — `docs/cloudfront-notes/README.md` records how API Gateway and CloudFront treat `X-Forwarded-For`, `CloudFront-Viewer-Address`, and `identity.sourceIp`, with the date of each observation and whether AWS documents it. It replaces the ClientRequest documentation's statement that the AWS managed `AllViewerExceptHostHeader` policy does not forward CloudFront headers: it forwarded `CloudFront-Viewer-Address` when measured. [Spec: 1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that](.kiro/specs/1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that/) addresses [#253](https://github.com/63Klabs/cache-data/issues/253)
```

The "Own CloudFront in front of an edge-optimized API logs the edge address until you set `CACHE_DATA_TRUSTED_PROXY_HOPS=3`" entry (line 28) is still true and is not touched. Consumer-visible rows 1 to 5 map to: row 1, 3, 4 to the line 23 entry; row 2 to the line 16 sub-bullet; row 5 to the new entry (Requirement 7.2). The task checks the `## v1.4.1 (unreleased)` heading and the `1.4.1` version first (Requirement 7.5).

### Security advisory draft

`.kiro/specs/1-4-1-trusted-client-ip/security-advisory.md`. Edits by section, keeping the file's structure.

| Section | Change |
|---|---|
| Summary | "Some deployments must also set the new environment variable" becomes "Only deployments with their own CloudFront in front of an edge-optimized REST API must also set the new environment variable" |
| Patches | Last paragraph: the variable defaults to `0`, which returns `identity.sourceIp`; an invalid value logs one warning and uses `0`; a count above the real chain is not safe |
| Who must act | Intro unchanged. The table is replaced (below). The first note ("A T4 deployment is not fixed by upgrading alone...") is replaced by "A hop count above the real number of proxies lets a client choose the result. Set a count only for T2." The `0` note and the Atlantis note stay |
| Work out which topology you have | Unchanged commands. The last sentence becomes "The reported number of entries minus one is the count that matches your chain. Set it only for T2; leave the default in T1, T3, and T4" |
| Recommendation: lock the origin | First sentence limited to "In T2 at `3`". Keeps the AWS blog link |
| Workarounds | T1 unchanged. T4: "Read `event.requestContext.identity.sourceIp` directly. Measured 2026-11-09: it is the connecting client and forged headers did not change it." New T3 bullet with the same text. T2 bullet: read the `X-Forwarded-For` entry 3 from the right, or restrict the API to your distribution |
| Remediation steps | Step 3 becomes "For T2 set `CACHE_DATA_TRUSTED_PROXY_HOPS=3` as a Lambda function environment variable. T1, T3, and T4 need no setting." Step 4 adds "(T2)" and keeps the marker request. Step 5 unchanged |
| Behavior changes to expect | Third bullet unchanged ("In T2 with the variable unset..."). A new bullet: "`CloudFront-Viewer-Address` is read only when the count is 2 or more, so it is not read at the default" |
| Known limitations | The T4 bullet is replaced by "AWS does not document what `identity.sourceIp` holds on a Regional API behind your own CloudFront (T3). It was observed on 2026-11-09 (see `docs/cloudfront-notes/README.md`). If AWS changes it, set the variable explicitly." The viewer-address bullet ends "At the default the step is off." The T3 bullet ("T3 is described from AWS documentation, not measured") is removed |
| References | Adds `docs/cloudfront-notes/README.md` |

New "Who must act" table:

| Topology | Hop count to set | Chain at the function | `identity.sourceIp` | Result at the default (`0`) |
|---|---|---|---|---|
| **T1.** Edge-optimized REST API, no CloudFront distribution of your own | Nothing. The default `0` is correct (`2` also works) | Client address, then the AWS-managed distribution's address (measured 2026-11-04 and 2026-11-09) | The client | Correct. A forged entry is never read |
| **T2.** Your CloudFront distribution in front of an edge-optimized REST API | Set `CACHE_DATA_TRUSTED_PROXY_HOPS=3` | Viewer address, your distribution's edge address, then the AWS-managed distribution's address (measured 2026-11-04 and 2026-11-09) | Your distribution's edge address | Not forgeable, but the logged IP is your distribution's edge address instead of the viewer's, until you set `3` |
| **T3.** Your CloudFront distribution in front of a Regional REST API | Nothing. The default `0` is correct | Viewer address, then your distribution's edge address (measured 2026-11-09) | The viewer | Correct |
| **T4.** Regional REST API with no CloudFront | Nothing. The default `0` is correct (`1` also works) | Client address only (measured 2026-11-04 and 2026-11-09) | The client | Correct. Not forgeable |

The "Description", "Impact", "Severity", and "Weaknesses" sections are unchanged. The draft keeps its statement that it contains no real addresses or identifiers (Requirement 8.4).

## Test changes (existing tests only)

No test file, `describe`, `it`, or property is added (Q3). Each edit below changes an assertion, a fixture, a name, or a comment of an existing test. Every file already saves and restores `process.env` in `beforeEach` and `afterEach`.

**`client-ip-resolver-config-tests.jest.mjs`** (default and warning text):

| Location | Change |
|---|---|
| `EXPECTED_WARNING` | `Using the default of 0.` |
| `validCases` | `[undefined, 0]`, `["", 0]`, `["  ", 0]`; the other cases stay |
| `invalidCases` title and assertion | "as the default of 0", expects `trustedProxyHops: 0` |
| "is pure" test | final `toBe(0)` |
| `getTrustedProxyHops()` tests | unset returns 0 (title and value); the "sees a change" test expects 0 after `delete`; the invalid-value test expects 0 (title: "falls back to 0") |
| "invalid value warning" tests | the loop expects 0; the literal warning string in the first test ends "Using the default of 0." |
| "does not warn for valid, empty, whitespace-only, or unset values" | `""` and unset expect 0 |
| debug resolution line | "reports the default hop count of 0 when the variable is unset", expecting `DEBUG_LINE("source-ip", 0, 0)` |
| Header comment | Notes the default of 0 |

The set of raw values reserved for warning tests (header comment) does not change; the memo-keyed rule still holds.

**`client-ip-resolver-unit-tests.jest.mjs`** (one test, around lines 85 to 90): "uses the default hop count of 2 when none is passed and the variable is unset" becomes "uses the default hop count of 0 when none is passed and the variable is unset": it asserts `DEFAULT_TRUSTED_PROXY_HOPS` is 0 and that the same three-entry header resolves to `SOURCE_IP`. The header comment's "(T1, T2, and T4)" stays.

**`client-ip-resolver-property-tests.jest.mjs`** ("Property 2", lines 96 to 112): the `describe` becomes "Property 2: The default returns identity.sourceIp"; the comment says that with the variable unset, for any forged list `P` and IPs `v`, `e`, `m`, the chain `P ++ [v, e, m]` resolves to `identity.sourceIp`; the test is named "returns identity.sourceIp with the default hop count whatever the headers hold"; the assertion is `expect(ClientIpResolver.resolve(headers, { sourceIp: s })).toBe(s)`, with `s` an `ip` draw added to the property's arbitraries. The generator for `s` is valid by construction, not filtered. Run count (500) and the absence of a `seed` option are unchanged. The "Validates" line now cites Requirement 2.5 of this feature.

**`request-info-client-ip-tests.jest.mjs`**:
- The header "Setup" comment reads: `CACHE_DATA_TRUSTED_PROXY_HOPS is deleted before each test, so the default hop count (0) applies; tests of selection by count set the count they need.`
- The `describe("fixed behavior")` block gains a `beforeEach(() => { process.env[HOPS_ENV_VAR] = "2"; })`, so the existing tests keep their subject (selection with a count). Tests in that block that set their own count (`"1"`, `"3"`) override it. The block's `describe` comment is unchanged.
- The title "ignores a forged leftmost x-forwarded-for entry (T1 chain, default hop count)" becomes "... (T1 chain, hop count 2)".
- The `preservation` block is unchanged: those tests send no usable `X-Forwarded-For`, so they pass at the default and keep covering `sourceIp` as the result.

**`request-info-forwarded-for-bug-exploration-tests.jest.mjs`**:
- Header comment: rewritten to say the file runs with a hop count of 2 set in `beforeEach`, and that the default is 0 (identity.sourceIp); the stale "default 1" is removed (G10). The feature tags (`1-3-11-client-request-update-forwarded-for`, `Updated by: 1-4-1-trusted-client-ip`) stay; a second "Updated by" line names this spec.
- `beforeEach` sets `process.env.CACHE_DATA_TRUSTED_PROXY_HOPS = "2"` instead of deleting it. `afterEach` already restores the original value.
- The property's title and comment say "with a hop count of 2" instead of "by default".

**Not changed:** `client-request-request-log-tests.jest.mjs` (only `sourceIp` set; it passes at the default), `request-info-forwarded-for-preservation-tests.jest.mjs`, `request-info-tests`, `request-info-property-tests`, `client-request-tests`, and every `test/response/` file. If the full run shows another failure caused by the new default, it is fixed the same way (set the count the test needs, or assert the new default) and listed in the task record.

### Lint

| File | Errors before | Expected after |
|---|---|---|
| `src/lib/utils/ClientIpResolver.class.js` | 0 | 0 |
| `src/lib/tools/RequestInfo.class.js` | 1 (`no-constant-condition`) | 1 |
| `src/lib/tools/ClientRequest.class.js` | 0 | 0 |
| The five edited test files | 0 | 0 |

`npm run lint:ci` fails on the repository baseline before and after, so Requirement 3.7 is checked per file with `npx eslint <files>`. `.md` and `.ts` files are not linted.

### Full-suite gate

`npm test` must pass. Run the targeted directories first (`test/request`, `test/response`, `test/documentation`, then `npm run test:types`), each under `timeout`, then the full suite. Two known effects, not code problems: the migration property tests fail on uncommitted edits to six named files (none is touched here), and the documentation tests run on the working tree. Nothing in this feature spawns a child process or runs `npm test` from a test.

## Verification

No new test pins the corrected text (Q3), so these checks are run once by hand when the work is done, and again by the reviewer. Commands use `execFile`-style arguments and nothing from the network.

| Check | Command or action | Expected |
|---|---|---|
| Issue's table | `node -e` call of `ClientIpResolver.resolve` with the header `192.0.2.1, 198.51.100.10, 203.0.113.30`, `sourceIp` `203.0.113.30`, counts 1 to 4 (as in Pre-design measurements) | `203.0.113.30`, `198.51.100.10`, `192.0.2.1`, `203.0.113.30`; matches the README table |
| Default | `node -e` call with the variable unset and any headers | `identity.sourceIp` |
| Removed claims | Search `src`, `docs`, `types`, `CHANGELOG.md`, and the advisory for `unless the count is lower`, `falls through to \`identity.sourceIp\`` without the condition, `defaults to 2`, `(default 2)`, `default of \`2\``, `needs 1`, `does not forward`, and `doesn't include CloudFront headers` | No match, except as a valid value or as the matching count (Requirement 10.1) |
| Every mention | Search the documentation set for `PROXY_HOPS` and read each hit | Each agrees with Requirements 1, 2, 4, and 5 |
| `RequestInfo` source | Search `src/lib/tools/RequestInfo.class.js` for lowercase `x-forwarded-for` | No match |
| `types/` | Search `types/` for `ClientIpResolver` | No match |
| Links | `test/documentation/` link test | Passes; the new file's links resolve |
| Identifiers | Search the new and edited docs and the advisory for the account ID, the profile name, `execute-api` hostnames, `cloudfront.net` domains, and the edge address ranges recorded in the sibling plan | No match |
| Changelog | Diff of `CHANGELOG.md` | Only lines 16, 18 (removed), 23, and the new Added entry differ |
| Tests | Targeted directories, `npm run test:types`, then `npm test` | Pass |
| Lint | `npx eslint` on the eight source and test files edited | Error counts equal the table above |

## Execution flow

At runtime nothing changes except one value. A request with `CACHE_DATA_TRUSTED_PROXY_HOPS` unset now takes this path:

```
resolve(headers, identity)
  hops = getTrustedProxyHops()  -> 0  (memoized on the raw string)
  viewerIp  = null              (hops < 2)
  forwarded = selectForwardedFor(header, 0)  -> { ip: null, entryCount }   (entryCount is still computed)
  ip = identity.sourceIp, step "source-ip"
  debug line (debug level only): step=source-ip trustedProxyHops=0 xForwardedForEntries=<n>
```

Cost per request is unchanged, and the entry count in the debug line stays available for the marker check.

## Error handling

| Condition | Behavior | Requirements |
|---|---|---|
| Variable unset, empty, or whitespace | `0`, no warning | 2.2 |
| Variable is digits only | That number | 2.3 |
| Variable is anything else | `0` and one warning per distinct raw value (the previous behavior used `2`); `0` is the fail-safe value | 2.4, D8 |
| `identity.sourceIp` missing at the default | `null` | 2.5 |
| A method called with unexpected types | Unchanged: total, never throws | 2.6 |

## Correctness properties

This feature adds no property (Q3). The existing properties of the sibling spec keep their meaning for any count of 1 or more: Property 1 (right-to-left selection), Property 3 (short chains fall through), and Properties 4 to 6 (viewer address parsing and the gating) are unchanged and still run. Property 2 is rewritten to the default (Test changes). The statements that the documentation now makes about the direction of a wrong count follow from Property 1 and Property 3:

- A count R - j (j >= 1) on a real chain of R proxy-written entries selects an entry among the proxy-written ones, because the entries to the right of the client's are all proxy-written (Property 1 with the client's entries as the forged prefix).
- A count R + k selects index `length - R - k`, which is a client-written entry when the client sent `p >= k` extra entries, and falls through to `identity.sourceIp` when `p < k` (Property 3 and the selection rule).

## Backwards compatibility analysis

**Unchanged:** every export; every public signature and return type; the types apart from doc comments; the `RESPONSE` log line; requests with no `X-Forwarded-For` and no `CloudFront-Viewer-Address` (they return `identity.sourceIp`, as before).

**Changed relative to the unreleased draft only (never released):** the default hop count, the invalid-value fallback, and the guidance. Relative to v1.4.0 the honest-traffic client IP is unchanged in all four topologies (Requirement 9.3): T1 `C`, T2 `E` (the edge address, as for the earlier default), T3 `V`, T4 `C`.

**Deployments that set a value already:** unchanged. A deployment that set `1` in T4 or `3` in T2 keeps working. A deployment that set `2` keeps working.

## Known limitations

1. T3's `identity.sourceIp` behavior is observed, not documented by AWS. If AWS changes it, `0` in T3 would return the edge address (wrong, not forgeable), and the notes tell readers to set the variable explicitly.
2. The 2026-11-09 observations used a mock integration, one client address, and IPv4. IPv6 clients and Lambda proxy integrations were not repeated.
3. `3` in T2 stays forgeable on the raw `execute-api` URL until the origin is locked (README "Origin lock").
4. No test pins the new wording of the documentation (Q3); a later edit could reintroduce the old claim. The Verification searches catch it at review.
5. The `v1.4.1` tag sits one commit before the implementation commit (PLAN.md N1). Outside this spec.

## Follow-ups (outside this spec)

- Tell the owners of atlantis-starter-02 #14, atlantis-sam-templates #9 and #10, and `cache-data` #254 that the Regional premise is verified and that the managed policy forwards `CloudFront-Viewer-Address` (PLAN.md N3).
- Origin lock for the Atlantis starter and the origin-secret check of issue #254.
- Additional entries in `docs/cloudfront-notes/` as new CloudFront features are built.
