# Complete Example

A full web service implementation with routing, validation, caching, and error handling.

## Project Structure

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


## Configuration (config.js)

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

## Validations (validations.js)

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

## Users DAO (dao/users.dao.js)

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

## Users Controller (controllers/users.controller.js)

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

## Router (router.js)

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

## Lambda Handler (index.js)

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

---

Next: [Configuration Options](./configuration-options.md)
