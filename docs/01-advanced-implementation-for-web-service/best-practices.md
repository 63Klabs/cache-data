# Best Practices

## 1. Initialize Configuration Outside Handler

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

## 2. Use Validation for Security

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

## 3. Handle Errors Gracefully

Implement comprehensive error handling:

```javascript
const {tools: {DebugAndLog}} = require('@63klabs/cache-data');

async function handleRequest(clientRequest, response) {
  try {
    const data = await fetchData();
    response.setStatusCode(200);
    response.setBody({ data });
  } catch (error) {
    // Log error with context
    DebugAndLog.error('Request failed', {
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

## 4. Use Caching Strategically

Cache expensive operations and external API calls:

```javascript
// Cache frequently accessed data with longer expiration
const cacheProfile1 = {
  profile: 'static-data',
  defaultExpirationInSeconds: 3600, // 1 hour
  overrideOriginHeaderExpiration: true
};

// Cache dynamic data with shorter expiration
const cacheProfile2 = {
  profile: 'dynamic-data',
  defaultExpirationInSeconds: 300, // 5 minutes
  overrideOriginHeaderExpiration: true
};

// Use interval-based caching for batch updates
const cacheProfile3 = {
  profile: 'batch-data',
  defaultExpirationInSeconds: 3600,
  expiresIsOnInterval: true,
  intervalInMinutes: 60, // Expires at top of hour
  timeZoneForInterval: 'America/Chicago'
};
```

## 5. Implement Proper Logging

Use appropriate log levels and add context:

```javascript
const {tools: {DebugAndLog}} = require('@63klabs/cache-data');

// Use debug for verbose information (only in development)
DebugAndLog.debug('Processing request', { userId, action });

// Use info for general information
DebugAndLog.info('User authenticated successfully');

// Use warn for handled errors
DebugAndLog.warn('Invalid parameter provided', { param, value });

// Use error for unhandled errors
DebugAndLog.error('Database connection failed', error);

// Add custom logging for monitoring
clientRequest.addPathLog('users/{id}/profile');
clientRequest.addQueryLog('format=json');
```

## 6. Optimize Lambda Performance

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

## 7. Structure Your Code

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

## 8. Use ResponseDataModel for Complex Responses

Build structured responses with ResponseDataModel:

```javascript
const {tools: {ResponseDataModel}} = require('@63klabs/cache-data');

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

## 9. Implement Health Checks

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

## 10. Monitor and Optimize

- **Use CloudWatch Logs**: Review logs regularly for errors and performance issues
- **Track execution time**: Monitor `x-exec-ms` header in responses
- **Set up alarms**: Create CloudWatch alarms for error rates and latency
- **Analyze cache hit rates**: Monitor cache effectiveness

## 11. Secure Your API

- **Validate referrers**: Restrict access to known domains
- **Use authentication**: Implement proper authentication and authorization
- **Sanitize input**: Always validate and sanitize user input
- **Use HTTPS**: Ensure all external API calls use HTTPS
- **Encrypt sensitive data**: Use encryption for sensitive cached data

```javascript
const {tools: { ClientRequest }} = require('@63klabs/cache-data');

// Enable referrer validation
ClientRequest.init({
  validations: {
    referrers: ['example.com'] // Only allow example.com and subdomains
  }
});

// Encrypt sensitive cached data
const cacheProfile = {
  profile: 'sensitive-data',
  encrypt: true, // Encrypt data at rest
  defaultExpirationInSeconds: 300
};
```

## 12. Test Thoroughly

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

---

Next: [Additional Information, Tutorials, and Code](./additional-information.md)