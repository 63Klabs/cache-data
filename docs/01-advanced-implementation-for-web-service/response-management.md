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
async function finalizeResponse(response) {
  // Finalize automatically handles:
  // - Content-Type detection
  // - CORS headers
  // - Cache-Control headers
  // - Execution time tracking
  // - CloudWatch logging
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
  //   body: '{"data":"value"}'
  // }
}
```

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
