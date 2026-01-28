# Quick-Start Implementation

Get started quickly with the essential features of @63klabs/cache-data: debugging, endpoint requests, and caching.

## Contents

- [Installation](#installation)
- [Debug and Logging](#debug-and-logging)
- [Making Endpoint Requests](#making-endpoint-requests)
- [Caching Endpoint Data](#caching-endpoint-data)
- [Next Steps](#next-steps)

For advanced features like web service routing, request validation, and custom data access objects, see [Advanced Implementation for Providing a Web Service](../01-advanced-implementation-for-web-service/README.md).

## Installation

```bash
npm install @63klabs/cache-data
```

**Prerequisites:**
- Node.js >= 20.0.0
- AWS account with access to S3, DynamoDB, and SSM Parameter Store (for caching features)
- AWS SDK v3 packages (installed as peer dependencies)

## Debug and Logging

Use `DebugAndLog` and `Timer` for debugging and performance monitoring:

```javascript
const { tools } = require('@63klabs/cache-data');
const { DebugAndLog, Timer } = tools;

// Start a timer
const timer = new Timer("My Operation");

// Log messages at different levels
DebugAndLog.debug("Verbose debug message"); // Only shows when log level is 5
DebugAndLog.log("General log message");
DebugAndLog.warn("Warning message");
DebugAndLog.error("Error message");

// Stop timer and log elapsed time
timer.stop();
```

**Best practice with try/catch:**

```javascript
const { tools } = require('@63klabs/cache-data');
const { DebugAndLog, Timer } = tools;

const timer = new Timer("Data Processing");

try {
  DebugAndLog.debug("Starting data processing");
  // ... your code here
} catch (error) {
  DebugAndLog.error(`Error: ${error.message}`, error.stack);
} finally {
  timer.stop();
}
```

For more details, see [tools.DebugAndLog](../features/tools/README.md#toolsdebugandlog) and [tools.Timer](../features/tools/README.md#toolstimer) in the features documentation.

## Making Endpoint Requests

Make HTTP requests to external APIs using `endpoint.get()`:

```javascript
const { endpoint } = require('@63klabs/cache-data');

// Simple GET request with complete URI
const data = await endpoint.get({ 
  uri: "https://api.example.com/data?q=Chicago" 
});

// Separate query parameters
const data2 = await endpoint.get(
  { uri: "https://api.example.com/data" },
  { parameters: { q: "Chicago" } }
);

// Separate host and path
const data3 = await endpoint.get(
  { host: "api.example.com", path: "/data" },
  { parameters: { q: "Chicago" } }
);

// POST request with body
const data4 = await endpoint.get({
  method: "POST",
  uri: "https://api.example.com/submit",
  body: JSON.stringify({ name: "John", age: 30 }),
  headers: { "Content-Type": "application/json" }
});

// Response structure
console.log(data.success);    // boolean
console.log(data.statusCode); // HTTP status code
console.log(data.body);       // parsed JSON or text
console.log(data.headers);    // response headers
```

**Connection options:**

```javascript
const data = await endpoint.get({
  host: "api.example.com",
  path: "/data",
  headers: { "Authorization": "Bearer token123" },
  options: { timeout: 5000 } // timeout in milliseconds
});
```

For more details, see [endpoint module documentation](../features/endpoint/README.md).

## Caching Endpoint Data

Cache API responses in S3 and DynamoDB to improve performance and reduce API calls.

### Prerequisites

1. **S3 Bucket**: Create a bucket for cache storage (data stored in `/cache` prefix)
2. **DynamoDB Table**: Create a table with `id_hash` as the primary key (String)
3. **SSM Parameter**: Create a parameter with a 64-character hex encryption key
   - Example path: `/apps/my-app/crypt_secureDataKey`
   - Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **IAM Permissions**: Grant your Lambda function access to S3, DynamoDB, and SSM

### Basic Setup

Create a configuration class that initializes the cache:

```javascript
const { tools, cache, endpoint } = require('@63klabs/cache-data');

class Config extends tools._ConfigSuperClass {
  static async init() {
    tools._ConfigSuperClass._promise = new Promise(async (resolve, reject) => {
      try {
        // Get encryption key from SSM Parameter Store
        const params = await this._initParameters([
          {
            group: "app",
            path: "/apps/my-app/" // Your SSM parameter path
          }
        ]);

        // Define connections with cache profiles
        const connections = new tools.Connections();
        connections.add({
          name: "api",
          host: "api.example.com",
          path: "/data",
          headers: { "User-Agent": "MyApp/1.0" },
          cache: [{
            profile: "api-data",
            defaultExpirationInSeconds: 600, // 10 minutes
            overrideOriginHeaderExpiration: true,
            expiresIsOnInterval: false,
            hostId: "example",
            pathId: "data",
            encrypt: false
          }]
        });

        tools._ConfigSuperClass._connections = connections;

        // Initialize cache
        cache.Cache.init({
          dynamoDbTable: "my-cache-table",
          s3Bucket: "my-cache-bucket",
          secureDataAlgorithm: "aes-256-cbc",
          secureDataKey: Buffer.from(params.app.crypt_secureDataKey, "hex"),
          DynamoDbMaxCacheSize_kb: 20,
          purgeExpiredCacheEntriesAfterXHours: 24,
          defaultExpirationExtensionOnErrorInSeconds: 300,
          timeZoneForInterval: "America/Chicago"
        });

        resolve(true);
      } catch (error) {
        tools.DebugAndLog.error("Config initialization failed", error);
        reject(false);
      }
    });
  }
}

// Initialize configuration
Config.init();

// Lambda handler
exports.handler = async (event, context) => {
  // Wait for configuration to complete
  await Config.promise();

  // Your application logic here
  const response = await getData();

  return response;
};
```

### Using the Cache

Once configured, retrieve data through the cache:

```javascript
const { tools, cache, endpoint } = require('@63klabs/cache-data');

async function getData() {
  // Get connection configuration
  const connection = Config.getConnection("api");
  const conn = connection.toObject();
  const cacheProfile = connection.getCacheProfile("api-data");

  // Get data (from cache if available, otherwise from endpoint)
  const cacheObj = await cache.CacheableDataAccess.getData(
    cacheProfile,
    endpoint.get,
    conn,
    null
  );

  // Extract the data
  const data = cacheObj.getBody(true); // true = parse as JSON

  return data;
}
```

### Cache Configuration Options

**Cache Profile Settings:**
- `defaultExpirationInSeconds`: How long to cache data (in seconds)
- `overrideOriginHeaderExpiration`: Ignore endpoint's cache headers
- `expiresIsOnInterval`: Align expiration to time intervals (e.g., top of hour)
- `encrypt`: Encrypt data at rest in S3 and DynamoDB
- `hostId` / `pathId`: Identifiers for logging

**Cache.init() Settings:**
- `dynamoDbTable`: DynamoDB table name for cache storage
- `s3Bucket`: S3 bucket name for large cached items
- `secureDataKey`: Encryption key (Buffer or CachedSSMParameter)
- `secureDataAlgorithm`: Encryption algorithm (default: "aes-256-cbc")
- `DynamoDbMaxCacheSize_kb`: Max size for DynamoDB (larger items go to S3)
- `purgeExpiredCacheEntriesAfterXHours`: Retention time for expired entries
- `timeZoneForInterval`: Timezone for interval-based expiration

### Using Environment Variables

You can use Lambda environment variables instead of hardcoding values:

```javascript
cache.Cache.init({
  dynamoDbTable: process.env.CACHE_TABLE,
  s3Bucket: process.env.CACHE_BUCKET,
  secureDataKey: Buffer.from(params.app.crypt_secureDataKey, "hex"),
  secureDataAlgorithm: process.env.CACHE_ALGORITHM || "aes-256-cbc"
});
```

### Using AWS Parameter and Secrets Lambda Extension

For automatic secret rotation, use the AWS Parameter and Secrets Lambda Extension:

1. **Add Lambda Layer** to your CloudFormation template:

```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Layers:
        - !Sub "arn:aws:lambda:${AWS::Region}:590474943231:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11"
```

2. **Use CachedSSMParameter** in your code:

```javascript
const { tools, cache } = require('@63klabs/cache-data');

// Create cached parameter reference
const secureKey = new tools.CachedSSMParameter(
  '/apps/my-app/crypt_secureDataKey',
  { refreshAfter: 1600 } // seconds
);

// Initialize cache with cached parameter
cache.Cache.init({
  dynamoDbTable: process.env.CACHE_TABLE,
  s3Bucket: process.env.CACHE_BUCKET,
  secureDataKey: secureKey, // Pass CachedSSMParameter directly
  secureDataAlgorithm: "aes-256-cbc"
});
```

The extension automatically refreshes parameter values every 5 minutes (or your specified interval).

## Next Steps

- **Advanced Features**: See [Advanced Implementation for Web Service](../01-advanced-implementation-for-web-service/README.md) for request validation, routing, and custom data access objects
- **Feature Documentation**: Explore detailed documentation in [docs/features/](../features/README.md)
- **Examples**: Review complete examples in [docs/00-example-implementation/](../00-example-implementation/README.md)
- **Lambda Optimization**: Learn optimization techniques in [docs/lambda-optimization/](../lambda-optimization/README.md)
