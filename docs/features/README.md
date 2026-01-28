# Cache-Data Features

The @63klabs/cache-data package provides three main feature modules that work together to enable efficient data caching and API request handling in AWS Lambda environments.

## Available Features

### [Cache Module](./cache/README.md)

The cache module provides a multi-tier caching system combining in-memory, DynamoDB, and S3 storage. It offers:

- **L0 In-Memory Cache**: Microsecond-level access for frequently accessed data within Lambda containers
- **L1 DynamoDB Cache**: Millisecond-level access for small to medium cached objects
- **L2 S3 Cache**: Storage for larger cached objects
- **Automatic tier management**: Seamlessly routes data between storage tiers based on size
- **Encryption support**: Secure storage for sensitive cached data
- **Interval-based expiration**: Align cache expiration with business schedules

[View Cache Documentation →](./cache/README.md)

### [Endpoint Module](./endpoint/README.md)

The endpoint module provides simple HTTP request functionality for calling external APIs and services. It offers:

- **Simple request interface**: Make GET, POST, PUT, DELETE requests with minimal configuration
- **Flexible connection options**: Support for URI-based or component-based (protocol/host/path) specifications
- **Automatic JSON parsing**: Response bodies are automatically parsed when possible
- **Query parameter merging**: Combine connection and query parameters seamlessly
- **Custom headers and timeouts**: Full control over request configuration

[View Endpoint Documentation →](./endpoint/README.md)

### [Tools Module](./tools/README.md)

The tools module provides utility classes and functions for logging, timing, AWS SDK integration, and data manipulation. It offers:

- **Logging and debugging**: Configurable log levels with environment-based controls
- **Performance timing**: Track execution time for operations
- **AWS SDK integration**: Simplified access to DynamoDB, S3, and SSM Parameter Store
- **Request/Response handling**: Classes for managing HTTP requests and responses
- **Data utilities**: Sanitization, obfuscation, hashing, and immutable objects
- **Connection management**: Configuration and authentication for external services

[View Tools Documentation →](./tools/README.md)

## Getting Started

Each feature module can be imported and used independently:

```javascript
const { cache, endpoint, tools } = require('@63klabs/cache-data');

// Use cache module
cache.Cache.init({ /* config */ });

// Use endpoint module
const response = await endpoint.get({ host: 'api.example.com', path: '/data' });

// Use tools module
tools.DebugAndLog.info('Application started');
```

For detailed usage examples and API reference, see the individual feature documentation linked above.
