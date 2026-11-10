# Lambda proxy response body observations

This page records how API Gateway REST API treats the `body` of a Lambda proxy result when the body is `null`, missing, or empty, as observed on deployed REST APIs. `Response.setBodyToNull()` in `@63klabs/cache-data` depends on that behavior and cites the observation it relies on.

Each observation has a date and a status: "Documented by AWS" (with a link) or "Not documented by AWS". AWS can change behavior that it does not document. To check an observation again, repeat the [method](#method). The format of this page follows [CloudFront and API Gateway observations](README.md), and the observation numbers continue that page's sequence.

## Topologies

The observations use topologies T1 and T4 from [CloudFront and API Gateway observations](README.md#topologies): an edge-optimized REST API (T1) and a Regional REST API (T4), neither with a CloudFront distribution of your own.

## Observations

| ID | Date | Topology | What was sent | What was seen | AWS documents it? | Effect on this package |
|----|------|----------|---------------|---------------|-------------------|------------------------|
| O9 | 2026-11-10 | T1, T4 | A Lambda proxy result with `statusCode` 202 or 204 and `body: null`, no `body` key, or `body: ""` | The status code the function set, no 502, and no content (`content-length: 0` on a 202). The three forms were indistinguishable | Not documented by AWS. The [proxy output format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html) shows `body` as a string and says other formats return 502. It does not mention `null` or a missing `body` | `finalize()` returns `body: null` unchanged, and `setBodyToNull()` relies on it |
| O10 | 2026-11-10 | T1, T4 | A bodiless 202 or 204 result with `Cache-Control: no-store` | The header reached the client on every response, including through the CloudFront distribution that AWS manages for an edge-optimized API | Not documented by AWS | An application-set `Cache-Control` is the way to keep a bodiless response out of caches. The documentation pairs `setBodyToNull()` with an explicit `Cache-Control` |
| O11 | 2026-11-10 | T1, T4 | A bodiless 202 result with `Content-Type: application/json` | The `Content-Type` header reached the client with `content-length: 0` | Not documented by AWS | `Content-Type` stays on a bodiless response |
| O12 | 2026-11-10 | T1, T4 | A 204 result with `Content-Type: application/json`, once with no body and once with a JSON string body | The response had no body and no `Content-Type` header in both cases | Not documented by AWS | A 204 sent through REST API never shows the template body of the `Response` object to the client |

## Method

### 2026-11-10 checks

The checks used one temporary stack. The stack held one Node.js 22 Lambda function with 128 MB of memory, and two REST APIs, one Regional and one edge-optimized. Each API had the resource `GET /{variant}/{status}`, a Lambda proxy integration, and a `test` stage.

The function returned the proxy result shape that `Response.finalize()` produces, with `Content-Type: application/json` and `Cache-Control: no-store`. The first path segment chose the body, and the second chose the status code:

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

The variants were:

- `null`: `body` is `null`.
- `omitted`: the result has no `body` key.
- `empty`: `body` is an empty string.
- `string`: `body` is a JSON string, as a control.

The statuses were 202 and 204. One `GET` was sent for each of the 8 combinations of variant and status to each API, 16 requests in all. The stack was deleted afterwards.

### Limits

- Only REST API was tested. HTTP API, Application Load Balancer, and Lambda function URLs were not.
- The function returned the shape that `finalize()` produces. It did not run this package.
- Requests came from one client address.
- Only IPv4 was tested.
- Each request was sent once.
- The function used Node.js 22 with 128 MB of memory.

## Adding an observation

Record each new observation with the fields described in [Adding an observation](README.md#adding-an-observation). The next free ID is O13.

## Related documentation

- [Sending a response with no body](../01-advanced-implementation-for-web-service/response-management.md#sending-a-response-with-no-body) - How to send a 202 or 204 without a body using `Response.setBodyToNull()`, and which observations on this page it relies on
