
# Request Handling

The `ClientRequest` class extends `RequestInfo` to provide comprehensive request parsing and validation.

## Basic Setup

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest, Response } = tools;

exports.handler = async (event, context) => {
  // Create client request object
  const clientRequest = new ClientRequest(event, context);
  
  // Create response object
  const response = new Response(clientRequest);
  
  // Check if request is valid
  if (!clientRequest.isValid()) {
    response.setStatusCode(400);
    response.setBody({ error: 'Invalid request' });
    return response.finalize();
  }
  
  // Your routing and business logic here
  
  return response.finalize();
};
```

## Accessing Request Properties

`ClientRequest` provides structured access to all request data:

```javascript
const props = clientRequest.getProps();

// HTTP method
console.log(props.method); // 'GET', 'POST', etc.

// Path information
console.log(props.path); // 'users/123/profile'
console.log(props.pathArray); // ['users', '123', 'profile']
console.log(props.resource); // 'users/{id}/profile'
console.log(props.resourceArray); // ['users', '{id}', 'profile']

// Parameters (validated)
console.log(props.pathParameters); // { id: '123' }
console.log(props.queryStringParameters); // { format: 'json' }
console.log(props.headerParameters); // { authorization: 'Bearer ...' }
console.log(props.bodyPayload); // Request body as string

// Client information
console.log(props.client.isAuthenticated); // boolean
console.log(props.client.authorizations); // ['read', 'write']
console.log(props.client.roles); // ['user', 'admin']

// Timing
console.log(props.deadline); // Timestamp when Lambda times out
console.log(props.calcMsToDeadline(props.deadline)); // Milliseconds remaining
```

## Helper Methods

```javascript
// Get specific path elements
const userId = clientRequest.getPathAt(1); // '123' from /users/123/profile
const lastElement = clientRequest.getPathAt(-1); // 'profile'

// Get path segments
const firstTwo = clientRequest.getPath(2); // 'users/123'
const lastTwo = clientRequest.getPath(-2); // '123/profile'

// Get resource elements (with parameter placeholders)
const resourcePath = clientRequest.getResource(); // 'users/{id}/profile'
const resourceId = clientRequest.getResourceAt(1); // '{id}'

// Get validated parameters
const pathParams = clientRequest.getPathParameters(); // { id: '123' }
const queryParams = clientRequest.getQueryStringParameters(); // { format: 'json' }
const headerParams = clientRequest.getHeaderParameters(); // { authorization: 'Bearer ...' }
const bodyParams = clientRequest.getBodyParameters(); // { name: 'John', email: 'john@example.com' }
```

## Request Logging

Add custom logging for monitoring and debugging:

```javascript
// Add path notation for logging (use placeholders for sensitive data)
clientRequest.addPathLog('users/{id}/profile');

// Add query notation for logging
clientRequest.addQueryLog('format=json');

// Get request log for CloudWatch
const log = clientRequest.getRequestLog();
console.log(log.resource);   // 'GET:users/{id}/profile'
console.log(log.routeLog);   // 'users/{id}/profile'
console.log(log.queryLog);   // 'format=json'
```

---

Next: [Request Validation](./request-validation.md)