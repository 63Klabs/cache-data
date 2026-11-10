# Response Management

The `Response` class provides comprehensive response handling with support for multiple content types, headers, and automatic logging.

## Basic Response Operations

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function handleRequest(clientRequest, results) {
  // Create response
  const response = new Response(clientRequest);

  // Set status code
  response.setStatusCode(200);

  // Set body (automatically detects content type)
  response.setBody({ message: 'Success', data: results });

  // Set headers
  response.setHeaders({ 'X-Custom-Header': 'value' });

  // Add individual header
  response.addHeader('Cache-Control', 'max-age=3600');

  // Finalize and return
  return response.finalize();
}
```

## Content Types

The Response class supports multiple content types:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

const response = new Response(clientRequest);

// JSON (default)
response.setBody({ data: 'value' });

// HTML
response.setBody('<html><body>Hello</body></html>');

// XML
response.setBody('<?xml version="1.0"?><root><item>value</item></root>');

// RSS
response.setBody('<?xml version="1.0"?><rss version="2.0">...</rss>');

// Plain text
response.setBody('Plain text response');

// Explicit content type
response.set({ 
  body: { data: 'value' } 
}, Response.CONTENT_TYPE.JSON);
```

## Response Status Codes

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

const response = new Response(clientRequest);

// Success responses
response.setStatusCode(200); // OK
response.setStatusCode(201); // Created
response.setStatusCode(204); // No Content

// Client error responses
response.setStatusCode(400); // Bad Request
response.setStatusCode(401); // Unauthorized
response.setStatusCode(403); // Forbidden
response.setStatusCode(404); // Not Found

// Server error responses
response.setStatusCode(500); // Internal Server Error
response.setStatusCode(503); // Service Unavailable
```

## Using ResponseDataModel

Build complex response structures with `ResponseDataModel`:

```javascript
const { tools } = require('@63klabs/cache-data');
const { ResponseDataModel, Response } = tools;

async function buildUserResponse(users, response) {
  // Create response model with skeleton
  const dataModel = new ResponseDataModel({ 
    users: [], 
    metadata: { page: 1, total: 0 } 
  }, 'data');

  // Add items to array
  users.forEach(user => {
    dataModel.addItemByKey(user, 'users');
  });

  // Add metadata
  dataModel.addItemByKey({ page: 1, total: users.length }, 'metadata');

  // Set as response body
  response.setBody(dataModel.toObject());
  return response.finalize();
}
```

## Response with Nested Data

```javascript
const { tools } = require('@63klabs/cache-data');
const { ResponseDataModel } = tools;

// Create main response
const responseData = new ResponseDataModel({}, 'data');

// Add user with posts
const user = { id: 1, name: 'John' };
const posts = [
  { id: 1, title: 'Post 1' },
  { id: 2, title: 'Post 2' }
];

responseData.addItemByKey(user, 'user');
responseData.addItemByKey(posts, 'posts');

// Result: { data: { user: {...}, posts: [...] } }
response.setBody(responseData.toObject());
```

## Error Handling

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function handleRequest(clientRequest) {
  const response = new Response(clientRequest);
  try {
    const data = await fetchData();
    response.setStatusCode(200);
    response.setBody({ data });
  } catch (error) {
    tools.DebugAndLog.error('Request failed', error);
    response.setStatusCode(500);
    response.setBody({ error: 'Internal server error' });
  }
  
  return response.finalize();
}
```

## Custom Response Templates

Initialize Response with custom templates for different status codes:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

Response.init({
  settings: {
    errorExpirationInSeconds: 300,
    routeExpirationInSeconds: 3600,
    contentType: Response.CONTENT_TYPE.JSON
  },
  jsonResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Resource not found', code: 'NOT_FOUND' }
    },
    response500: {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Internal server error', code: 'SERVER_ERROR' }
    }
  }
});
```

## Response Finalization

The `finalize()` method:
- Stringifies JSON bodies
- Sets CORS headers based on referrer validation
- Sets cache control headers
- Adds execution time header
- Logs the response to CloudWatch

```javascript
const {tools: {ClientRequest, Response}} = require('@63klabs/cache-data');

const request = new ClientRequest(event, context);
const response = new Response(request);

request.setBody( {user: "12345"});

return response.finalize();

// Returns:
// {
//   statusCode: 200,
//   headers: {
//     'Content-Type': 'application/json',
//     'Access-Control-Allow-Origin': '*',
//     'Cache-Control': 'max-age=3600',
//     'x-exec-ms': '45'
//   },
//   body: '{"user":"12345"}'
// }
```

## Overriding cache headers per response

By default, `finalize()` sets `Cache-Control` and `Expires` headers based on the `routeExpirationInSeconds` (for status < 400) and `errorExpirationInSeconds` (for status >= 400) config values. You can override these defaults on a per-response basis using `addHeader()`.

> **Note**: Application-set `Cache-Control` and `Expires` headers take precedence over `routeExpirationInSeconds` and `errorExpirationInSeconds` config defaults. If you set either header before calling `finalize()`, your value is preserved. Any header you do not set will still receive the config-derived default.

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function handleRequest(clientRequest) {
  const response = new Response(clientRequest);

  // Short-lived response: override the default cache duration
  response.setStatusCode(200);
  response.addHeader('Cache-Control', 'max-age=30');
  response.addHeader('Expires', new Date(Date.now() + 30000).toUTCString());
  response.setBody({ data: 'frequently changing content' });

  // finalize() preserves the Cache-Control and Expires values above
  return response.finalize();
}
```

You can also override cache headers for error responses:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function handleNotFound(clientRequest) {
  const response = new Response(clientRequest);

  // Prevent caching of this error response entirely
  response.setStatusCode(404);
  response.addHeader('Cache-Control', 'no-store');
  response.addHeader('Expires', '0');
  response.setBody({ error: 'Resource not found' });

  // finalize() preserves 'no-store' instead of applying errorExpirationInSeconds
  return response.finalize();
}
```

Setting only one of the two headers is also supported. The other will receive the config default:

```javascript
const { tools } = require('@63klabs/cache-data');
const { Response } = tools;

async function handleRequest(clientRequest) {
  const response = new Response(clientRequest);

  response.setStatusCode(200);
  // Override only Cache-Control; Expires will be set from routeExpirationInSeconds
  response.addHeader('Cache-Control', 'no-cache, must-revalidate');
  response.setBody({ data: 'validated on each request' });

  return response.finalize();
}
```

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

## Reset and Reuse

```javascript
// Reset response to defaults
response.reset({ statusCode: 200 });

// Set new values
response.set({ 
  statusCode: 201, 
  body: { created: true } 
});

// Get current values
const statusCode = response.getStatusCode();
const headers = response.getHeaders();
const body = response.getBody();
```

---

Next: [Data Access Objects](./data-access-objects.md)
