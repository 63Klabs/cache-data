# Endpoint Feature Documentation

## Overview

The endpoint module provides a simple, flexible interface for making HTTP requests to external APIs and services. It handles connection configuration, parameter merging, automatic JSON parsing, and provides a clean abstraction for API communication.

## Key Features

- **Simple request interface**: Make HTTP requests with minimal configuration
- **Flexible connection specification**: Use complete URIs or separate protocol/host/path components
- **Automatic JSON parsing**: Response bodies are automatically parsed when possible
- **Query parameter merging**: Seamlessly combine connection and query parameters
- **Custom headers and options**: Full control over request configuration including timeouts
- **Error handling**: Graceful error handling with formatted error responses

## Basic Usage

### Making a GET Request

```javascript
const { endpoint } = require('@63klabs/cache-data');

// Using separate host and path
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/data'
});

console.log(response.body);
```

### Using Complete URI

```javascript
const { endpoint } = require('@63klabs/cache-data');

const response = await endpoint.get({
  uri: 'https://api.example.com/data'
});

console.log(response.body);
```

### Adding Query Parameters

```javascript
const { endpoint } = require('@63klabs/cache-data');

// Parameters in connection object
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/search',
  parameters: { q: 'javascript', limit: 10 }
});

// Or pass as second argument
const response2 = await endpoint.get(
  { host: 'api.example.com', path: '/search' },
  { parameters: { q: 'javascript', limit: 10 } }
);
```

## Connection Object

The connection object configures the HTTP request. All properties are optional with sensible defaults.

### Connection Properties

#### `method` (string, optional)

HTTP method to use for the request.

- **Default**: `"GET"`
- **Options**: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`, etc.

```javascript
const response = await endpoint.get({
  method: 'POST',
  uri: 'https://api.example.com/submit'
});
```

#### `uri` (string, optional)

Complete URI including protocol, host, and path. When provided, overrides `protocol`, `host`, and `path` properties.

```javascript
const response = await endpoint.get({
  uri: 'https://api.example.com/data?key=value'
});
```

#### `protocol` (string, optional)

Protocol to use for the request.

- **Default**: `"https"`
- **Options**: `"http"`, `"https"`

```javascript
const response = await endpoint.get({
  protocol: 'https',
  host: 'api.example.com',
  path: '/data'
});
```

#### `host` (string, optional)

Hostname or IP address of the endpoint.

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/data'
});
```

#### `path` (string, optional)

Path portion of the URL.

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/api/v1/users'
});
```

#### `body` (string, optional)

Request body for POST/PUT requests. Should be a string (use `JSON.stringify()` for objects).

- **Default**: `null`

```javascript
const response = await endpoint.get({
  method: 'POST',
  uri: 'https://api.example.com/submit',
  body: JSON.stringify({ name: 'John', age: 30 })
});
```

#### `parameters` (Object, optional)

Query string parameters as key-value pairs. Automatically encoded and appended to the URL.

- **Default**: `null`

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/search',
  parameters: {
    q: 'javascript',
    limit: 10,
    offset: 0
  }
});
// Results in: https://api.example.com/search?q=javascript&limit=10&offset=0
```

#### `headers` (Object, optional)

HTTP headers as key-value pairs.

- **Default**: `null`

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/secure/data',
  headers: {
    'Authorization': 'Bearer token123',
    'Content-Type': 'application/json'
  }
});
```

#### `options` (Object, optional)

Additional request options.

- **Default**: `null`

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/data',
  options: {
    timeout: 5000  // 5 second timeout
  }
});
```

##### `options.timeout` (number, optional)

Request timeout in milliseconds. If the request takes longer than this, it will be aborted.

```javascript
options: {
  timeout: 10000  // 10 second timeout
}
```

#### `note` (string, optional)

Descriptive note for logging purposes. Helps identify requests in logs.

- **Default**: `"Get data from endpoint"`

```javascript
const response = await endpoint.get({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetching user profile data'
});
```

## Response Object

The response object contains the HTTP response details.

### Response Properties

#### `success` (boolean)

Indicates whether the request was successful (status code 200-299).

```javascript
const response = await endpoint.get({ uri: 'https://api.example.com/data' });
if (response.success) {
  console.log('Request succeeded');
}
```

#### `statusCode` (number)

HTTP status code from the response.

```javascript
const response = await endpoint.get({ uri: 'https://api.example.com/data' });
console.log(`Status: ${response.statusCode}`); // e.g., 200, 404, 500
```

#### `body` (Object|string|null)

Response body. Automatically parsed as JSON if possible, otherwise returned as text.

```javascript
const response = await endpoint.get({ uri: 'https://api.example.com/data' });
console.log(response.body); // Parsed JSON object or text string
```

#### `headers` (Object)

Response headers as key-value pairs.

```javascript
const response = await endpoint.get({ uri: 'https://api.example.com/data' });
console.log(response.headers['content-type']);
```

## Usage Examples

### POST Request with JSON Body

```javascript
const { endpoint } = require('@63klabs/cache-data');

const response = await endpoint.get({
  method: 'POST',
  uri: 'https://api.example.com/users',
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  }),
  headers: {
    'Content-Type': 'application/json'
  }
});

if (response.success) {
  console.log('User created:', response.body);
}
```

### Authenticated Request

```javascript
const { endpoint } = require('@63klabs/cache-data');

const response = await endpoint.get({
  host: 'api.example.com',
  path: '/secure/data',
  headers: {
    'Authorization': 'Bearer your-token-here'
  }
});

console.log(response.body);
```

### Request with Timeout

```javascript
const { endpoint } = require('@63klabs/cache-data');

try {
  const response = await endpoint.get({
    uri: 'https://slow-api.example.com/data',
    options: {
      timeout: 3000  // 3 second timeout
    }
  });
  console.log(response.body);
} catch (error) {
  console.error('Request timed out or failed:', error.message);
}
```

### Combining Connection and Query Parameters

```javascript
const { endpoint } = require('@63klabs/cache-data');

// Connection has some parameters
const connection = {
  host: 'api.example.com',
  path: '/search',
  parameters: {
    apiKey: 'your-api-key'
  }
};

// Add more parameters via query argument
const response = await endpoint.get(
  connection,
  { parameters: { q: 'javascript', limit: 10 } }
);

// Results in: https://api.example.com/search?apiKey=your-api-key&q=javascript&limit=10
```

### Error Handling

```javascript
const { endpoint } = require('@63klabs/cache-data');

try {
  const response = await endpoint.get({
    uri: 'https://api.example.com/data'
  });
  
  if (response.success) {
    console.log('Data:', response.body);
  } else {
    console.error(`Request failed with status ${response.statusCode}`);
  }
} catch (error) {
  console.error('Request error:', error.message);
}
```

## Advanced Usage

### Extending the Endpoint Class

The `Endpoint` class can be extended to add custom pre-processing or post-processing logic:

```javascript
const { endpoint } = require('@63klabs/cache-data');

class CustomEndpoint extends endpoint.Endpoint {
  async get() {
    // Custom pre-processing
    console.log('Making request to:', this.request.host);
    
    // Call parent get() method
    const response = await super.get();
    
    // Custom post-processing
    if (response.body && response.body.data) {
      response.body.data = response.body.data.map(item => ({
        ...item,
        processed: true
      }));
    }
    
    return response;
  }
}

// Use custom endpoint
const customEndpoint = new CustomEndpoint({ host: 'api.example.com', path: '/data' });
const response = await customEndpoint.get();
```

### Using with Cache Module

The endpoint module works seamlessly with the cache module:

```javascript
const { cache, endpoint } = require('@63klabs/cache-data');

// Initialize cache
cache.Cache.init({ /* config */ });

// Define connection and cache profile
const connection = {
  host: 'api.example.com',
  path: '/data'
};

const cacheProfile = {
  defaultExpirationInSeconds: 300,
  hostId: 'api.example.com',
  pathId: '/data'
};

// Use CacheableDataAccess to fetch with caching
const cacheObj = await cache.CacheableDataAccess.getData(
  cacheProfile,
  endpoint.get,
  connection
);

const response = cacheObj.getResponse();
console.log('Cache status:', cacheObj.getStatus());
console.log('Data:', response.body);
```

## Configuration Best Practices

### 1. Use Environment Variables for Base URLs

```javascript
const connection = {
  host: process.env.API_HOST || 'api.example.com',
  path: '/data'
};
```

### 2. Centralize Connection Configuration

```javascript
// config.js
module.exports = {
  apiConnection: {
    host: process.env.API_HOST,
    headers: {
      'Authorization': `Bearer ${process.env.API_TOKEN}`
    },
    options: {
      timeout: 5000
    }
  }
};

// usage.js
const { endpoint } = require('@63klabs/cache-data');
const config = require('./config');

const response = await endpoint.get({
  ...config.apiConnection,
  path: '/specific/endpoint'
});
```

### 3. Handle Errors Gracefully

```javascript
async function fetchData(path) {
  try {
    const response = await endpoint.get({
      host: 'api.example.com',
      path: path,
      options: { timeout: 5000 }
    });
    
    if (!response.success) {
      throw new Error(`API returned status ${response.statusCode}`);
    }
    
    return response.body;
  } catch (error) {
    console.error('Failed to fetch data:', error.message);
    return null;
  }
}
```

## API Reference

For detailed API documentation including all methods, parameters, and return types, refer to the JSDoc comments in the source code:

- **endpoint.get() function**: Main entry point for making requests - see `src/lib/dao-endpoint.js`
- **Endpoint class**: Request handler class - see `src/lib/dao-endpoint.js`
- **ConnectionObject typedef**: Connection configuration type definition - see `src/lib/dao-endpoint.js`

### Key Methods

#### endpoint.get(connection, query)

Makes an HTTP request to a remote endpoint with the specified configuration.

**Parameters:**
- `connection` (ConnectionObject): Connection configuration object
- `query` (Object, optional): Additional query data to merge with connection parameters

**Returns:** Promise resolving to response object with `success`, `statusCode`, `body`, and `headers` properties

See JSDoc in `src/lib/dao-endpoint.js` for complete method signatures, parameters, return types, and usage examples.

## Related Documentation

- [Cache Module](../cache/README.md) - Use endpoint with caching
- [Tools Module](../tools/README.md) - Utilities for request handling
- [Quick Start Guide](../../00-quick-start-implementation/README.md) - Getting started
- [Advanced Implementation](../../01-advanced-implementation-for-web-service/README.md) - Web service patterns
