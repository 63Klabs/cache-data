# Advanced Implementation for Providing a Web Service

> **Prerequisites**: This guide assumes you've completed the [Quick-Start Implementation](../00-quick-start-implementation/README.md) and are familiar with debugging, endpoint requests, and caching basics.

The @63klabs/cache-data package provides a complete framework for building serverless web services with AWS Lambda and API Gateway.


Beyond basic endpoint requests and caching, it offers request validation, routing, structured response handling, and comprehensive logging - similar to frameworks like Express.js but optimized for serverless environments.

## Contents

- [Overview](#overview)
- [Request Handling](#request-handling)
- [Request Validation](#request-validation)
- [Routing Patterns](#routing-patterns)
- [Response Management](#response-management)
- [Data Access Objects](#data-access-objects)
- [Complete Example](#complete-example)
- [Configuration Options](#configuration-options)
- [Best Practices](#best-practices)

## Overview

A typical web service implementation with cache-data includes:

1. **ClientRequest**: Parses and validates incoming Lambda events
2. **Routing**: Directs requests to appropriate handlers based on path and method
3. **Data Access**: Retrieves data from endpoints with caching
4. **Response**: Structures and formats responses with proper headers
5. **Logging**: Automatically logs requests and responses to CloudWatch

### Architecture Flow

```
API Gateway Event
    ↓
ClientRequest (parse & validate)
    ↓
Router (match path & method)
    ↓
Controller (business logic)
    ↓
Data Access (with caching)
    ↓
Response (format & finalize)
    ↓
CloudWatch Logs + Lambda Response
```

## Request Handling

The `ClientRequest` class extends `RequestInfo` to provide comprehensive request parsing and validation.

### Basic Setup

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

### Accessing Request Properties

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

### Helper Methods

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
```

### Request Logging

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


## Request Validation

Configure validation rules for path parameters, query strings, headers, and cookies.

### Setting Up Validation

Initialize `ClientRequest` with validation functions:

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest } = tools;

// Define validation functions
const validations = {
  referrers: ['example.com', 'subdomain.example.com'], // Allowed referrers
  parameters: {
    pathParameters: {
      id: (value) => /^[0-9]+$/.test(value), // Numeric IDs only
      slug: (value) => /^[a-z0-9-]+$/.test(value) // Lowercase alphanumeric with hyphens
    },
    queryStringParameters: {
      format: (value) => ['json', 'xml', 'html'].includes(value),
      limit: (value) => {
        const num = parseInt(value);
        return !isNaN(num) && num > 0 && num <= 100;
      },
      page: (value) => /^[0-9]+$/.test(value)
    },
    headerParameters: {
      authorization: (value) => value.startsWith('Bearer '),
      contentType: (value) => value.includes('application/json')
    }
  }
};

// Initialize ClientRequest with validations
ClientRequest.init({ validations });
```

### Validation Behavior

- **Automatic Validation**: `ClientRequest` constructor automatically validates all parameters
- **Invalid Requests**: `clientRequest.isValid()` returns `false` if any validation fails
- **Filtered Parameters**: Only validated parameters are included in `getPathParameters()`, `getQueryStringParameters()`, etc.
- **Security**: Invalid parameters are logged as warnings and excluded from the request

### Example with Validation

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest, Response } = tools;

// Initialize validation rules (do this once, outside the handler)
ClientRequest.init({
  validations: {
    referrers: ['example.com'],
    parameters: {
      pathParameters: {
        id: (value) => /^[0-9]+$/.test(value)
      },
      queryStringParameters: {
        format: (value) => ['json', 'xml'].includes(value)
      }
    }
  }
});

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event, context);
  const response = new Response(clientRequest);
  
  // Check if request passed validation
  if (!clientRequest.isValid()) {
    response.setStatusCode(400);
    response.setBody({ error: 'Invalid request parameters' });
    return response.finalize();
  }
  
  // Access validated parameters safely
  const { id } = clientRequest.getPathParameters();
  const { format } = clientRequest.getQueryStringParameters();
  
  // Process request...
  response.setBody({ id, format });
  return response.finalize();
};
```

### Referrer Validation

Control which domains can access your API:

```javascript
// Allow all referrers (default)
ClientRequest.init({
  validations: {
    referrers: ['*']
  }
});

// Allow specific domains (matches from right to left)
ClientRequest.init({
  validations: {
    referrers: ['example.com'] // Allows example.com and *.example.com
  }
});

// Check if referrer validation is required
if (ClientRequest.requiresValidReferrer()) {
  console.log('Referrer validation is enabled');
}
```


## Routing Patterns

Implement routing logic to direct requests to appropriate handlers based on HTTP method and path.

### Simple Routing

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest, Response } = tools;

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event, context);
  const response = new Response(clientRequest);
  
  if (!clientRequest.isValid()) {
    response.setStatusCode(400);
    response.setBody({ error: 'Invalid request' });
    return response.finalize();
  }
  
  const props = clientRequest.getProps();
  const method = props.method;
  const path = props.path;
  
  // Route based on method and path
  if (method === 'GET' && path === 'users') {
    return await getUsers(clientRequest, response);
  } else if (method === 'GET' && path.startsWith('users/')) {
    return await getUser(clientRequest, response);
  } else if (method === 'POST' && path === 'users') {
    return await createUser(clientRequest, response);
  } else {
    response.setStatusCode(404);
    response.setBody({ error: 'Route not found' });
    return response.finalize();
  }
};
```

### Path-Based Routing

Use path arrays for more flexible routing:

```javascript
async function route(clientRequest, response) {
  const props = clientRequest.getProps();
  const method = props.method;
  const pathArray = props.pathArray;
  
  // GET /users
  if (method === 'GET' && pathArray.length === 1 && pathArray[0] === 'users') {
    return await listUsers(clientRequest, response);
  }
  
  // GET /users/{id}
  if (method === 'GET' && pathArray.length === 2 && pathArray[0] === 'users') {
    const userId = pathArray[1];
    return await getUser(clientRequest, response, userId);
  }
  
  // GET /users/{id}/posts
  if (method === 'GET' && pathArray.length === 3 && pathArray[0] === 'users' && pathArray[2] === 'posts') {
    const userId = pathArray[1];
    return await getUserPosts(clientRequest, response, userId);
  }
  
  // POST /users
  if (method === 'POST' && pathArray.length === 1 && pathArray[0] === 'users') {
    return await createUser(clientRequest, response);
  }
  
  // Default: 404
  response.setStatusCode(404);
  response.setBody({ error: 'Route not found' });
  return response.finalize();
}
```

### Resource-Based Routing

Use resource patterns with path parameters:

```javascript
async function route(clientRequest, response) {
  const props = clientRequest.getProps();
  const method = props.method;
  const resource = props.resource;
  const pathParams = props.pathParameters;
  
  // Match resource patterns (from API Gateway)
  switch (`${method}:${resource}`) {
    case 'GET:users':
      return await listUsers(clientRequest, response);
      
    case 'GET:users/{id}':
      return await getUser(clientRequest, response, pathParams.id);
      
    case 'GET:users/{id}/posts':
      return await getUserPosts(clientRequest, response, pathParams.id);
      
    case 'POST:users':
      return await createUser(clientRequest, response);
      
    case 'PUT:users/{id}':
      return await updateUser(clientRequest, response, pathParams.id);
      
    case 'DELETE:users/{id}':
      return await deleteUser(clientRequest, response, pathParams.id);
      
    default:
      response.setStatusCode(404);
      response.setBody({ error: 'Route not found' });
      return response.finalize();
  }
}
```

### Controller Pattern

Organize routes into controller functions:

```javascript
// users.controller.js - Example 1: Basic controller
const { tools } = require('@63klabs/cache-data');

class UsersControllerBasic {
  
  static async list(clientRequest, response) {
    const queryParams = clientRequest.getQueryStringParameters();
    const limit = queryParams.limit || 10;
    const page = queryParams.page || 1;
    
    // Fetch users from database or API
    const users = await fetchUsers({ limit, page });
    
    response.setStatusCode(200);
    response.setBody({ users, page, limit });
    return response.finalize();
  }
  
  static async get(clientRequest, response) {
    const userId = clientRequest.getPathAt(1);
    
    // Fetch user by ID
    const user = await fetchUserById(userId);
    
    if (!user) {
      response.setStatusCode(404);
      response.setBody({ error: 'User not found' });
    } else {
      response.setStatusCode(200);
      response.setBody({ user });
    }
    
    return response.finalize();
  }
  
  static async create(clientRequest, response) {
    const props = clientRequest.getProps();
    const body = JSON.parse(props.bodyPayload);
    
    // Validate and create user
    const newUser = await createUser(body);
    
    response.setStatusCode(201);
    response.setBody({ user: newUser });
    return response.finalize();
  }
  
  static async update(clientRequest, response) {
    const userId = clientRequest.getPathAt(1);
    const props = clientRequest.getProps();
    const body = JSON.parse(props.bodyPayload);
    
    // Update user
    const updatedUser = await updateUser(userId, body);
    
    if (!updatedUser) {
      response.setStatusCode(404);
      response.setBody({ error: 'User not found' });
    } else {
      response.setStatusCode(200);
      response.setBody({ user: updatedUser });
    }
    
    return response.finalize();
  }
  
  static async delete(clientRequest, response) {
    const userId = clientRequest.getPathAt(1);
    
    // Delete user
    const deleted = await deleteUser(userId);
    
    if (!deleted) {
      response.setStatusCode(404);
      response.setBody({ error: 'User not found' });
    } else {
      response.setStatusCode(204);
      response.setBody(null);
    }
    
    return response.finalize();
  }
}

module.exports = UsersController;

// In your handler:
const UsersController = require('./users.controller');

exports.handler = async (event, context) => {
  const clientRequest = new ClientRequest(event, context);
  const response = new Response(clientRequest);
  
  if (!clientRequest.isValid()) {
    response.setStatusCode(400);
    response.setBody({ error: 'Invalid request' });
    return response.finalize();
  }
  
  const props = clientRequest.getProps();
  const route = `${props.method}:${props.resource}`;
  
  switch (route) {
    case 'GET:users':
      return await UsersController.list(clientRequest, response);
    case 'GET:users/{id}':
      return await UsersController.get(clientRequest, response);
    case 'POST:users':
      return await UsersController.create(clientRequest, response);
    case 'PUT:users/{id}':
      return await UsersController.update(clientRequest, response);
    case 'DELETE:users/{id}':
      return await UsersController.delete(clientRequest, response);
    default:
      response.setStatusCode(404);
      response.setBody({ error: 'Route not found' });
      return response.finalize();
  }
};
```


## Response Management

The `Response` class provides comprehensive response handling with support for multiple content types, headers, and automatic logging.

### Basic Response Operations

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

### Content Types

The Response class supports multiple content types:

```javascript
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

### Response Status Codes

```javascript
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

### Using ResponseDataModel

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

### Response with Nested Data

```javascript
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

### Error Handling

```javascript
async function handleRequest(clientRequest, response) {
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

### Custom Response Templates

Initialize Response with custom templates for different status codes:

```javascript
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

### Response Finalization

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

### Reset and Reuse

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


## Data Access Objects

Implement data access patterns with caching for external APIs and databases.

### Basic Data Access with Caching

```javascript
const { tools, cache, endpoint } = require('@63klabs/cache-data');

async function getUserData(userId) {
  // Get connection configuration
  const connection = Config.getConnection('users-api');
  const conn = connection.toObject();
  
  // Update path with user ID
  conn.path = `/users/${userId}`;
  
  // Get cache profile
  const cacheProfile = connection.getCacheProfile('user-data');
  
  // Fetch data (from cache if available, otherwise from endpoint)
  const cacheObj = await cache.CacheableDataAccess.getData(
    cacheProfile,
    endpoint.get,
    conn,
    null
  );
  
  // Extract and parse data
  const data = cacheObj.getBody(true); // true = parse as JSON
  
  return data;
}
```

### Custom Data Access Object

Create a custom DAO by extending the Endpoint class:

```javascript
const { tools, endpoint } = require('@63klabs/cache-data');

class UsersDAO {
  
  static async getUser(userId) {
    const connection = {
      host: 'api.example.com',
      path: `/users/${userId}`,
      headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` }
    };
    
    const response = await endpoint.get(connection);
    
    if (!response.success) {
      throw new Error(`Failed to fetch user: ${response.statusCode}`);
    }
    
    return response.body;
  }
  
  static async listUsers(options = {}) {
    const { limit = 10, page = 1 } = options;
    
    const connection = {
      host: 'api.example.com',
      path: '/users',
      parameters: { limit, page }
    };
    
    const response = await endpoint.get(connection);
    return response.body;
  }
  
  static async createUser(userData) {
    const connection = {
      method: 'POST',
      host: 'api.example.com',
      path: '/users',
      body: JSON.stringify(userData),
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_TOKEN}`
      }
    };
    
    const response = await endpoint.get(connection);
    
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create user: ${response.statusCode}`);
    }
    
    return response.body;
  }
}

module.exports = UsersDAO;
```

### Using Custom DAO in Controllers

```javascript
// Example 2: Controller with custom DAO
const UsersDAO = require('./users.dao');

class UsersControllerWithDAO {
  
  static async get(clientRequest, response) {
    try {
      const userId = clientRequest.getPathAt(1);
      const user = await UsersDAO.getUser(userId);
      
      response.setStatusCode(200);
      response.setBody({ user });
    } catch (error) {
      tools.DebugAndLog.error('Failed to get user', error);
      response.setStatusCode(500);
      response.setBody({ error: 'Failed to retrieve user' });
    }
    
    return response.finalize();
  }
  
  static async list(clientRequest, response) {
    try {
      const queryParams = clientRequest.getQueryStringParameters();
      const users = await UsersDAO.listUsers(queryParams);
      
      response.setStatusCode(200);
      response.setBody({ users });
    } catch (error) {
      tools.DebugAndLog.error('Failed to list users', error);
      response.setStatusCode(500);
      response.setBody({ error: 'Failed to retrieve users' });
    }
    
    return response.finalize();
  }
}
```

### Advanced DAO with Caching

```javascript
const { tools, cache, endpoint } = require('@63klabs/cache-data');

class CachedUsersDAO {
  
  static async getUser(userId, cacheProfile) {
    const connection = {
      host: 'api.example.com',
      path: `/users/${userId}`,
      headers: { 'Authorization': `Bearer ${process.env.API_TOKEN}` }
    };
    
    // Use CacheableDataAccess for automatic caching
    const cacheObj = await cache.CacheableDataAccess.getData(
      cacheProfile,
      endpoint.get,
      connection,
      null
    );
    
    return cacheObj.getBody(true);
  }
  
  static async listUsers(options, cacheProfile) {
    const { limit = 10, page = 1 } = options;
    
    const connection = {
      host: 'api.example.com',
      path: '/users'
    };
    
    const query = {
      parameters: { limit, page }
    };
    
    const cacheObj = await cache.CacheableDataAccess.getData(
      cacheProfile,
      endpoint.get,
      connection,
      query
    );
    
    return cacheObj.getBody(true);
  }
}

module.exports = CachedUsersDAO;
```

### Data Transformation

Transform data before returning to client:

```javascript
class UsersDAO {
  
  static async getUser(userId) {
    const rawUser = await this._fetchUser(userId);
    return this._transformUser(rawUser);
  }
  
  static async _fetchUser(userId) {
    const connection = {
      host: 'api.example.com',
      path: `/users/${userId}`
    };
    
    const response = await endpoint.get(connection);
    return response.body;
  }
  
  static _transformUser(rawUser) {
    return {
      id: rawUser.id,
      name: `${rawUser.first_name} ${rawUser.last_name}`,
      email: rawUser.email,
      createdAt: new Date(rawUser.created_at).toISOString(),
      profile: {
        avatar: rawUser.avatar_url,
        bio: rawUser.bio
      }
    };
  }
}
```


## Complete Example

A full web service implementation with routing, validation, caching, and error handling.

### Project Structure

```
my-service/
├── src/
│   ├── index.js              # Lambda handler
│   ├── config.js             # Configuration
│   ├── router.js             # Route definitions
│   ├── controllers/
│   │   ├── users.controller.js
│   │   └── posts.controller.js
│   ├── dao/
│   │   ├── users.dao.js
│   │   └── posts.dao.js
│   └── validations.js        # Validation rules
├── package.json
└── template.yml              # CloudFormation template
```

### Configuration (config.js)

```javascript
const { tools, cache } = require('@63klabs/cache-data');

class Config extends tools._ConfigSuperClass {
  
  static async init() {
    tools._ConfigSuperClass._promise = new Promise(async (resolve, reject) => {
      try {
        // Initialize parameters from SSM
        const params = await this._initParameters([
          {
            group: 'app',
            path: '/apps/my-service/'
          }
        ]);
        
        // Define API connections
        const connections = new tools.Connections();
        
        connections.add({
          name: 'users-api',
          host: 'api.example.com',
          path: '/users',
          headers: { 
            'User-Agent': 'MyService/1.0',
            'Authorization': `Bearer ${params.app.api_token}`
          },
          cache: [{
            profile: 'user-data',
            defaultExpirationInSeconds: 600,
            overrideOriginHeaderExpiration: true,
            expiresIsOnInterval: false,
            hostId: 'example',
            pathId: 'users',
            encrypt: false
          }]
        });
        
        connections.add({
          name: 'posts-api',
          host: 'api.example.com',
          path: '/posts',
          headers: { 
            'User-Agent': 'MyService/1.0',
            'Authorization': `Bearer ${params.app.api_token}`
          },
          cache: [{
            profile: 'post-data',
            defaultExpirationInSeconds: 300,
            overrideOriginHeaderExpiration: true,
            expiresIsOnInterval: false,
            hostId: 'example',
            pathId: 'posts',
            encrypt: false
          }]
        });
        
        tools._ConfigSuperClass._connections = connections;
        
        // Initialize cache
        cache.Cache.init({
          dynamoDbTable: process.env.CACHE_TABLE,
          s3Bucket: process.env.CACHE_BUCKET,
          secureDataAlgorithm: 'aes-256-cbc',
          secureDataKey: Buffer.from(params.app.crypt_secureDataKey, 'hex'),
          DynamoDbMaxCacheSize_kb: 20,
          purgeExpiredCacheEntriesAfterXHours: 24,
          timeZoneForInterval: 'America/Chicago'
        });
        
        // Initialize Response with custom settings
        tools.Response.init({
          settings: {
            errorExpirationInSeconds: 180,
            routeExpirationInSeconds: 3600,
            contentType: tools.Response.CONTENT_TYPE.JSON
          }
        });
        
        resolve(true);
      } catch (error) {
        tools.DebugAndLog.error('Config initialization failed', error);
        reject(false);
      }
    });
  }
}

module.exports = Config;
```

### Validations (validations.js)

```javascript
module.exports = {
  referrers: ['example.com'],
  parameters: {
    pathParameters: {
      id: (value) => /^[0-9]+$/.test(value),
      slug: (value) => /^[a-z0-9-]+$/.test(value)
    },
    queryStringParameters: {
      format: (value) => ['json', 'xml'].includes(value),
      limit: (value) => {
        const num = parseInt(value);
        return !isNaN(num) && num > 0 && num <= 100;
      },
      page: (value) => /^[0-9]+$/.test(value),
      sort: (value) => ['asc', 'desc'].includes(value)
    },
    headerParameters: {
      authorization: (value) => value.startsWith('Bearer ')
    }
  }
};
```

### Users DAO (dao/users.dao.js)

```javascript
const { cache, endpoint } = require('@63klabs/cache-data');
const Config = require('../config');

class UsersDAO {
  
  static async getUser(userId) {
    const connection = Config.getConnection('users-api');
    const conn = connection.toObject();
    conn.path = `/users/${userId}`;
    
    const cacheProfile = connection.getCacheProfile('user-data');
    
    const cacheObj = await cache.CacheableDataAccess.getData(
      cacheProfile,
      endpoint.get,
      conn,
      null
    );
    
    return cacheObj.getBody(true);
  }
  
  static async listUsers(options = {}) {
    const connection = Config.getConnection('users-api');
    const conn = connection.toObject();
    
    const query = {
      parameters: {
        limit: options.limit || 10,
        page: options.page || 1,
        sort: options.sort || 'asc'
      }
    };
    
    const cacheProfile = connection.getCacheProfile('user-data');
    
    const cacheObj = await cache.CacheableDataAccess.getData(
      cacheProfile,
      endpoint.get,
      conn,
      query
    );
    
    return cacheObj.getBody(true);
  }
}

module.exports = UsersDAO;
```

### Users Controller (controllers/users.controller.js)

```javascript
// Example 3: Full controller with DAO and logging
const { tools } = require('@63klabs/cache-data');
const UsersDAO = require('../dao/users.dao');

class UsersControllerFull {
  
  static async list(clientRequest, response) {
    try {
      const queryParams = clientRequest.getQueryStringParameters();
      const users = await UsersDAO.listUsers(queryParams);
      
      clientRequest.addPathLog('users');
      clientRequest.addQueryLog(`limit=${queryParams.limit || 10}`);
      
      response.setStatusCode(200);
      response.setBody({ users, count: users.length });
    } catch (error) {
      tools.DebugAndLog.error('Failed to list users', error);
      response.setStatusCode(500);
      response.setBody({ error: 'Failed to retrieve users' });
    }
    
    return response.finalize();
  }
  
  static async get(clientRequest, response) {
    try {
      const userId = clientRequest.getPathAt(1);
      const user = await UsersDAO.getUser(userId);
      
      if (!user) {
        response.setStatusCode(404);
        response.setBody({ error: 'User not found' });
      } else {
        clientRequest.addPathLog(`users/${userId}`);
        response.setStatusCode(200);
        response.setBody({ user });
      }
    } catch (error) {
      tools.DebugAndLog.error('Failed to get user', error);
      response.setStatusCode(500);
      response.setBody({ error: 'Failed to retrieve user' });
    }
    
    return response.finalize();
  }
}

module.exports = UsersController;
```

### Router (router.js)

```javascript
const UsersController = require('./controllers/users.controller');
const PostsController = require('./controllers/posts.controller');

async function route(clientRequest, response) {
  const props = clientRequest.getProps();
  const routeKey = `${props.method}:${props.resource}`;
  
  switch (routeKey) {
    // Users routes
    case 'GET:users':
      return await UsersController.list(clientRequest, response);
      
    case 'GET:users/{id}':
      return await UsersController.get(clientRequest, response);
      
    // Posts routes
    case 'GET:posts':
      return await PostsController.list(clientRequest, response);
      
    case 'GET:posts/{id}':
      return await PostsController.get(clientRequest, response);
      
    case 'GET:users/{id}/posts':
      return await PostsController.listByUser(clientRequest, response);
      
    // Default: 404
    default:
      response.setStatusCode(404);
      response.setBody({ error: 'Route not found', route: routeKey });
      return response.finalize();
  }
}

module.exports = { route };
```

### Lambda Handler (index.js)

```javascript
const { tools } = require('@63klabs/cache-data');
const { ClientRequest, Response } = tools;
const Config = require('./config');
const validations = require('./validations');
const { route } = require('./router');

// Initialize configuration (outside handler for container reuse)
Config.init();

// Initialize ClientRequest with validations
ClientRequest.init({ validations });

exports.handler = async (event, context) => {
  // Wait for configuration to complete
  await Config.promise();
  
  // Create request and response objects
  const clientRequest = new ClientRequest(event, context);
  const response = new Response(clientRequest);
  
  try {
    // Validate request
    if (!clientRequest.isValid()) {
      response.setStatusCode(400);
      response.setBody({ error: 'Invalid request parameters' });
      return response.finalize();
    }
    
    // Route request to appropriate controller
    return await route(clientRequest, response);
    
  } catch (error) {
    tools.DebugAndLog.error('Unhandled error in handler', error);
    response.setStatusCode(500);
    response.setBody({ error: 'Internal server error' });
    return response.finalize();
  }
};
```


## Configuration Options

Comprehensive configuration options for all components.

### ClientRequest Configuration

```javascript
const { ClientRequest } = tools;

ClientRequest.init({
  validations: {
    // Allowed referrers (matches from right to left)
    referrers: ['example.com', 'subdomain.example.com'],
    
    // Parameter validation functions
    parameters: {
      pathParameters: {
        id: (value) => /^[0-9]+$/.test(value),
        slug: (value) => /^[a-z0-9-]+$/.test(value)
      },
      queryStringParameters: {
        format: (value) => ['json', 'xml', 'html'].includes(value),
        limit: (value) => {
          const num = parseInt(value);
          return !isNaN(num) && num > 0 && num <= 100;
        }
      },
      headerParameters: {
        authorization: (value) => value.startsWith('Bearer ')
      },
      cookieParameters: {
        sessionId: (value) => /^[a-zA-Z0-9-_]+$/.test(value)
      }
    }
  }
});
```

### Response Configuration

```javascript
const { Response } = tools;

Response.init({
  settings: {
    // Cache expiration for error responses (seconds)
    errorExpirationInSeconds: 180,
    
    // Cache expiration for successful responses (seconds)
    routeExpirationInSeconds: 3600,
    
    // Default content type
    contentType: Response.CONTENT_TYPE.JSON
  },
  
  // Custom JSON response templates
  jsonResponses: {
    response200: {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true }
    },
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
  },
  
  // Custom HTML response templates
  htmlResponses: {
    response404: {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>404 Not Found</h1></body></html>'
    }
  }
});
```

### Cache Configuration

```javascript
const { cache } = require('@63klabs/cache-data');

cache.Cache.init({
  // DynamoDB table name for cache storage
  dynamoDbTable: process.env.CACHE_TABLE || 'my-cache-table',
  
  // S3 bucket name for large cached items
  s3Bucket: process.env.CACHE_BUCKET || 'my-cache-bucket',
  
  // Encryption algorithm for private data
  secureDataAlgorithm: 'aes-256-cbc',
  
  // Encryption key (Buffer, string, or CachedSSMParameter)
  secureDataKey: Buffer.from(params.app.crypt_secureDataKey, 'hex'),
  
  // Max size for DynamoDB storage (KB) - larger items go to S3
  DynamoDbMaxCacheSize_kb: 20,
  
  // Hours to retain expired cache entries before purging
  purgeExpiredCacheEntriesAfterXHours: 24,
  
  // Extension time for cache on error (seconds)
  defaultExpirationExtensionOnErrorInSeconds: 300,
  
  // Timezone for interval-based expiration
  timeZoneForInterval: 'America/Chicago'
});
```

### Connection Configuration

```javascript
const { Connections } = tools;

const connections = new Connections();

connections.add({
  // Connection name (used to retrieve connection)
  name: 'api-name',
  
  // HTTP method (default: GET)
  method: 'GET',
  
  // Host and path (or use uri for complete URL)
  host: 'api.example.com',
  path: '/data',
  
  // Alternative: complete URI
  // uri: 'https://api.example.com/data',
  
  // Protocol (default: https)
  protocol: 'https',
  
  // Request headers
  headers: {
    'User-Agent': 'MyApp/1.0',
    'Authorization': 'Bearer token123'
  },
  
  // Query parameters
  parameters: {
    format: 'json',
    limit: 10
  },
  
  // Request options
  options: {
    timeout: 5000 // milliseconds
  },
  
  // Cache profiles for this connection
  cache: [{
    // Profile name
    profile: 'api-data',
    
    // Default cache expiration (seconds)
    defaultExpirationInSeconds: 600,
    
    // Override endpoint's cache headers
    overrideOriginHeaderExpiration: true,
    
    // Align expiration to time intervals
    expiresIsOnInterval: false,
    
    // Interval duration (if expiresIsOnInterval is true)
    // intervalInMinutes: 60,
    
    // Encrypt cached data
    encrypt: false,
    
    // Identifiers for logging
    hostId: 'example',
    pathId: 'data'
  }]
});

// Set connections in Config
tools._ConfigSuperClass._connections = connections;

// Retrieve connection
const connection = Config.getConnection('api-name');
const conn = connection.toObject();
const cacheProfile = connection.getCacheProfile('api-data');
```

### DebugAndLog Configuration

```javascript
// Set via environment variables (recommended)
process.env.CACHE_DATA_LOG_LEVEL = '5'; // 0-5 (0=ERROR, 5=DEBUG)
process.env.CACHE_DATA_ENV = 'DEV'; // PROD, TEST, or DEV

// Or use numeric values
process.env.LOG_LEVEL = '5';

// Or use string values
process.env.LOG_LEVEL = 'DEBUG'; // ERROR, WARN, INFO, MSG, DIAG, DEBUG

// Check environment
if (tools.DebugAndLog.isDevelopment()) {
  // Development-specific logic
}

if (tools.DebugAndLog.isProduction()) {
  // Production-specific logic (log level capped at 2)
}
```

### Environment Variables

Common environment variables used by the package:

```bash
# Cache configuration
CACHE_DATA_DYNAMO_DB_TABLE=my-cache-table
CACHE_DATA_S3_BUCKET=my-cache-bucket
CACHE_DATA_SECURE_DATA_ALGORITHM=aes-256-cbc
CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB=20
CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS=24
CACHE_DATA_TIME_ZONE_FOR_INTERVAL=America/Chicago

# Logging configuration
CACHE_DATA_LOG_LEVEL=5
CACHE_DATA_ENV=DEV

# Alternative logging variables
LOG_LEVEL=DEBUG
AWS_LAMBDA_LOG_LEVEL=DEBUG
ENV=DEV
NODE_ENV=development
```


## Best Practices

### 1. Initialize Configuration Outside Handler

Initialize configuration outside the Lambda handler to take advantage of container reuse:

```javascript
const Config = require('./config');
const { ClientRequest } = tools;
const validations = require('./validations');

// Initialize once (outside handler)
Config.init();
ClientRequest.init({ validations });

exports.handler = async (event, context) => {
  // Wait for config to complete
  await Config.promise();
  
  // Handler logic...
};
```

### 2. Use Validation for Security

Always validate user input to prevent injection attacks and invalid data:

```javascript
// Define strict validation rules
const validations = {
  parameters: {
    pathParameters: {
      id: (value) => /^[0-9]+$/.test(value) // Only numeric IDs
    },
    queryStringParameters: {
      search: (value) => {
        // Sanitize search input
        return typeof value === 'string' && value.length <= 100;
      }
    }
  }
};

ClientRequest.init({ validations });
```

### 3. Handle Errors Gracefully

Implement comprehensive error handling:

```javascript
async function handleRequest(clientRequest, response) {
  try {
    const data = await fetchData();
    response.setStatusCode(200);
    response.setBody({ data });
  } catch (error) {
    // Log error with context
    tools.DebugAndLog.error('Request failed', {
      error: error.message,
      stack: error.stack,
      path: clientRequest.getPath()
    });
    
    // Return user-friendly error
    response.setStatusCode(500);
    response.setBody({ 
      error: 'An error occurred processing your request',
      requestId: context.requestId 
    });
  }
  
  return response.finalize();
}
```

### 4. Use Caching Strategically

Cache expensive operations and external API calls:

```javascript
// Cache frequently accessed data with longer expiration
cache: [{
  profile: 'static-data',
  defaultExpirationInSeconds: 3600, // 1 hour
  overrideOriginHeaderExpiration: true
}]

// Cache dynamic data with shorter expiration
cache: [{
  profile: 'dynamic-data',
  defaultExpirationInSeconds: 300, // 5 minutes
  overrideOriginHeaderExpiration: true
}]

// Use interval-based caching for batch updates
cache: [{
  profile: 'batch-data',
  defaultExpirationInSeconds: 3600,
  expiresIsOnInterval: true,
  intervalInMinutes: 60, // Expires at top of hour
  timeZoneForInterval: 'America/Chicago'
}]
```

### 5. Implement Proper Logging

Use appropriate log levels and add context:

```javascript
// Use debug for verbose information (only in development)
tools.DebugAndLog.debug('Processing request', { userId, action });

// Use info for general information
tools.DebugAndLog.info('User authenticated successfully');

// Use warn for handled errors
tools.DebugAndLog.warn('Invalid parameter provided', { param, value });

// Use error for unhandled errors
tools.DebugAndLog.error('Database connection failed', error);

// Add custom logging for monitoring
clientRequest.addPathLog('users/{id}/profile');
clientRequest.addQueryLog('format=json');
```

### 6. Optimize Lambda Performance

- **Minimize cold starts**: Keep dependencies small and initialize outside handler
- **Reuse connections**: Initialize database and API connections outside handler
- **Use appropriate memory**: Test different memory settings for optimal performance
- **Set timeouts**: Configure appropriate timeouts for external API calls

```javascript
// Set timeout for external requests
const connection = {
  host: 'api.example.com',
  path: '/data',
  options: {
    timeout: clientRequest.calcRemainingTimeInMillis(1000) // Leave 1s headroom
  }
};
```

### 7. Structure Your Code

Organize code into logical modules:

```
src/
├── index.js              # Lambda handler
├── config.js             # Configuration
├── router.js             # Route definitions
├── validations.js        # Validation rules
├── controllers/          # Request handlers
│   ├── users.controller.js
│   └── posts.controller.js
├── dao/                  # Data access objects
│   ├── users.dao.js
│   └── posts.dao.js
└── utils/                # Utility functions
    ├── transforms.js
    └── validators.js
```

### 8. Use ResponseDataModel for Complex Responses

Build structured responses with ResponseDataModel:

```javascript
const { ResponseDataModel } = tools;

// Create skeleton
const response = new ResponseDataModel({
  users: [],
  metadata: { page: 1, total: 0, hasMore: false }
}, 'data');

// Add items
users.forEach(user => response.addItemByKey(user, 'users'));

// Add metadata
response.addItemByKey({
  page: currentPage,
  total: users.length,
  hasMore: hasMorePages
}, 'metadata');

// Set as response body
responseObj.setBody(response.toObject());
```

### 9. Implement Health Checks

Add a health check endpoint:

```javascript
// In router.js - inside your switch statement
async function handleRoute(route, response) {
  switch(route) {
    case 'GET:health':
      response.setStatusCode(200);
      response.setBody({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0'
      });
      return response.finalize();
    
    // ... other cases
  }
}
```

### 10. Monitor and Optimize

- **Use CloudWatch Logs**: Review logs regularly for errors and performance issues
- **Track execution time**: Monitor `x-exec-ms` header in responses
- **Set up alarms**: Create CloudWatch alarms for error rates and latency
- **Analyze cache hit rates**: Monitor cache effectiveness

```javascript
// Log cache hit/miss for monitoring
if (cacheObj.isCacheHit()) {
  tools.DebugAndLog.info('Cache hit', { key: cacheKey });
} else {
  tools.DebugAndLog.info('Cache miss', { key: cacheKey });
}
```

### 11. Secure Your API

- **Validate referrers**: Restrict access to known domains
- **Use authentication**: Implement proper authentication and authorization
- **Sanitize input**: Always validate and sanitize user input
- **Use HTTPS**: Ensure all external API calls use HTTPS
- **Encrypt sensitive data**: Use encryption for sensitive cached data

```javascript
// Enable referrer validation
ClientRequest.init({
  validations: {
    referrers: ['example.com'] // Only allow example.com and subdomains
  }
});

// Encrypt sensitive cached data
cache: [{
  profile: 'sensitive-data',
  encrypt: true, // Encrypt data at rest
  defaultExpirationInSeconds: 300
}]
```

### 12. Test Thoroughly

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test complete request/response flows
- **Load tests**: Test performance under load
- **Error scenarios**: Test error handling and edge cases

```javascript
// Example test structure
describe('UsersController', () => {
  it('should return user by ID', async () => {
    const mockRequest = createMockRequest({ pathArray: ['users', '123'] });
    const mockResponse = createMockResponse();
    
    await UsersController.get(mockRequest, mockResponse);
    
    expect(mockResponse.getStatusCode()).toBe(200);
    expect(mockResponse.getBody()).toHaveProperty('user');
  });
});
```

## Next Steps

- **Feature Documentation**: Explore detailed API documentation in [docs/features/](../features/README.md)
- **Example Implementation**: Review complete examples in [docs/00-example-implementation/](../00-example-implementation/README.md)
- **Lambda Optimization**: Learn optimization techniques in [docs/lambda-optimization/](../lambda-optimization/README.md)
- **Technical Documentation**: Understand internal architecture in [docs/technical/](../technical/in-memory-cache.md)

## Related Documentation

- [Quick-Start Implementation](../00-quick-start-implementation/README.md)
- [Cache Module Documentation](../features/cache/README.md)
- [Endpoint Module Documentation](../features/endpoint/README.md)
- [Tools Module Documentation](../features/tools/README.md)
- [Lambda Optimization Guide](../lambda-optimization/README.md)
