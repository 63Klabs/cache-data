# Routing Patterns

Implement routing logic to direct requests to appropriate handlers based on HTTP method and path.

## Simple Routing

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

## Path-Based Routing

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
  
  // GET /users/{userId}/posts/{postId}
  if (method === 'GET' && pathArray.length === 4 && pathArray[0] === 'users' && pathArray[2] === 'posts') {
    const userId = pathArray[1];
    const postId = pathArray[3];
    return await getUserPost(clientRequest, response, userId, postId);
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

## Resource-Based Routing

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
      
    case 'GET:users/{userId}/posts/{postId}':
      return await getUserPost(clientRequest, response, pathParams.userId, pathParams.postId);
      
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

## Controller Pattern

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

---

Next: [Response Management](./response-management.md)
