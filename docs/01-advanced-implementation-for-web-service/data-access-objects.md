# Data Access Objects

Implement data access patterns with caching for external APIs and databases.

## Basic Data Access with Caching

```javascript
const { tools, cache: {CacheableDataAccess}, endpoint } = require('@63klabs/cache-data');

async function getUserData(userId) {
  // Get connection configuration
  const {conn, cacheProfile} = Config.getConnCacheProfile('users-api', 'user-data');
  
  // Update path with user ID
  conn.path = `/users/${userId}`;
    
  // Fetch data (from cache if available, otherwise from endpoint)
  const cacheObj = await CacheableDataAccess.getData(
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

## Custom Data Access Object

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

## Using Custom DAO in Controllers

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

## Advanced DAO with Caching

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

## Data Transformation

Transform data before returning to client:

```javascript
const {endpoint} = require('@63klabs/cache-data');

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

---

Next: [Complete Example](./complete-example.md)
