# Configuration Options

Comprehensive configuration options for all components.

## ClientRequest Configuration

```javascript
const {tools: { ClientRequest }} = require('@63klabs/cache-data');

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

## Response Configuration

```javascript
const {tools: {Response}} = require('@63klabs/cache-data');

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

## Cache Configuration

```javascript
const { cache } = require('@63klabs/cache-data');

cache.Cache.init({
  // DynamoDB table name for cache storage
  dynamoDbTable: process.env.CACHE_TABLE || 'my-cache-table',
  
  // S3 bucket name for large cached items
  s3Bucket: process.env.CACHE_BUCKET || 'my-cache-bucket',
  
  // Encryption algorithm for private data
  secureDataAlgorithm: 'aes-256-cbc',
  
  // Encryption key (Buffer, string, or CachedSsmParameter)
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

## Connection Configuration

```javascript
const {tools: {Connections}} = require('@63klabs/cache-data');

const connections = new Connections();

connections.add({
  name: 'api-name', // Connection name (used to retrieve connection)
  method: 'GET', // HTTP method (default: GET)
  host: 'api.example.com', // Host and path (or use uri for complete URL)
  path: '/data',
  // uri: 'https://api.example.com/data', // Alternative: complete URI
  protocol: 'https', // Protocol (default: https)
  headers: { // Request headers
    'User-Agent': 'MyApp/1.0',
    'Authorization': 'Bearer token123'
  },
  parameters: { // Query parameters
    format: 'json',
    limit: 10
  },
  options: { // Request options
    timeout: 5000 // milliseconds
  },
  cache: [{ // Cache profiles for this connection
    profile: 'api-data', // Profile name
    defaultExpirationInSeconds: 600, // Default cache expiration (seconds)
    overrideOriginHeaderExpiration: true, // Override endpoint's cache headers
    expiresIsOnInterval: false, // Align expiration to time intervals
    encrypt: true, // Encrypt cached data
    hostId: 'example', // Identifiers for logging
    pathId: 'data'
  }]
});

// Retrieve connection
const connection = connections.get('api-name');
const conn = connection.toObject();
const cacheProfile = connection.getCacheProfile('api-data');
```

For large applications it is recommended you create a connections.js file with an array of connection objects, and perform an import during a Configuration Init.

```javascript
// connections.js

const { tools: {DebugAndLog} } = require("@63klabs/cache-data");

const connections = [
	{
		name: "games",
		host: "api.chadkluck.net",
		path: "/games",
		cache: [
			{
				profile: "default",
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: (DebugAndLog.isProduction() ? (24 * 60 * 60) : (5 * 60)),// , // 5 minutes for non-prod
				expirationIsOnInterval: true,
				headersToRetain: "",
				hostId: "chadkluck", // log entry label - only used for logging
				pathId: "games", // log entry label - only used for logging
				encrypt: true, // encrypt the data in the cache
			}
		]        
	}
]

module.exports = connections;
```

Import into a Config script and pass to AppConfig.init:

```javascript
// config.js
const { tools: {AppConfig}, cache: {Cache} } = require("@63klabs/cache-data");

const connections = require("./connections.js");

class Config extends AppConfig {
  static async init() {
    AppConfig.init({ connections });
    Cache.init( /* options */ )
    return AppConfig.promise();
  }
}

module.exports = {Config}
```

Use in your application with `endpoint.send`, `CacheableDataAccess.getData` or your own custom function:

```javascript
const { endpoint, cache: {CacheableDataAccess} } = require("@63klabs/cache-data");
const { Config } = require("./config.js");

const conn1 = Config.getConn("games");
const data1 = await endpoint.send(conn1);

const {conn, cacheProfile} = Config.getConnCacheProfile("games", "default");
const cacheObj = await CacheableDataAccess.getData(
  cacheProfile,
  endpoint.send,
  conn,
  null
)

const data = cacheObj.getBody(true);
```

For more on using `Cache` and `CacheableDataAccess` see [Cache Feature Documentation](../features/cache/README.md).

### DebugAndLog Configuration

```javascript
const {tools: {DebugAndLog}} = require('@63klabs/cache-data');

// Set via environment variables (recommended)
process.env.CACHE_DATA_LOG_LEVEL = '5'; // 0-5 (0=ERROR, 5=DEBUG)
process.env.CACHE_DATA_ENV = 'DEV'; // PROD, TEST, or DEV

// Or use numeric values
process.env.LOG_LEVEL = '5';

// Or use string values
process.env.LOG_LEVEL = 'DEBUG'; // ERROR, WARN, INFO, MSG, DIAG, DEBUG

// Check environment
if (DebugAndLog.isDevelopment()) {
  // Development-specific logic
}

if (DebugAndLog.isProduction()) {
  // Production-specific logic (log level capped at 2)
}
```

## Environment Variables

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

---

Next: [Best Practices](./best-practices.md)