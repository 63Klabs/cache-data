# Cache Feature Documentation

## Overview

The Cache module provides a multi-tier caching system for AWS Lambda functions, combining in-memory, DynamoDB, and S3 storage to optimize data access and reduce latency.

There are 4 main concepts to implement when using the cache functionality of cache-data in order of execution:

1. Deploy DynamoDB and S3 stack (if not done already) and generate data secret key and store in SSM Parameter Store.
2. Use `Cache.init({/* options */})` to initialize during Cold Start followed by `await CacheableDataAccess.prime();` to ensure everything is ready.
3. Use `const cacheObj = await CacheableDataAccess.getData(cacheProfile, fetch, connection, options)` to send request and receive data.
4. Use `const body = const data = cacheObj.getBody(true);` to get the body of the response.

A complete, working example that can be used as reference code is available from the 63Klabs GitHub repository: [API Gateway with Lambda utilizing 63klabs/cache-data Written in Node.js](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs). It can be used as a reference or deployable example.

## Usage

We are going to review each of the 4 main concepts in reverse order of execution (due to the fact that you will be interacting with the top two concepts more frequently than the last 2 once your application is set up).

- Using a Cache Object (`cacheObj`) response
- Use `CacheableDataAccess.getData()` to send requests
- Configuring and Initializing the Cache using `Cache.init()`
- Deploying a Lambda function to use caching

### Using a Cache Object (`cacheObj`) response

When data is stored in the cache, it uses a standardized JSON structure with the following fields:

- `body`: The cached content as a string
- `headers`: HTTP headers object
- `statusCode`: HTTP status code (e.g., "200")
- `expires`: Unix timestamp for expiration

Example structure:

```javascript
const {endpoint, cache: {CacheableDataAccess}} = require('@63klabs/cache-data');

const cacheObj = await CacheableDataAccess( cacheProfile, endpoint.get, conn, null);
const response = cacheObj.getResponse(true); // true = parse JSON

console.log(response);
// {
//   "body": {user: "JaneDoe", id: 123445},
//   "headers": { "content-type": "application/json" },
//   "statusCode": "200",
//   "expires": 1234567890
// }
```

The `cacheObject.cache.body` is what you expect to get back from the response, all the other data is just something you can use or ignore.

To access the body from `cacheObject` use `cacheObject.getBody(true);` 

By using the `true` option you will receive it as an object (parsed from a JSON string). If you are not receiving JSON (HTML, XML, etc), or you do not want the JSON string to be parsed at this time, then set it to `false`.

```javascript
const {endpoint, cache: {CacheableDataObject}} = require('@63klabs/cache-data');

const cacheObject = await CacheableDataObject(cacheProfile, endpoint.get, conn, null);

const data = cacheObject.getBody(false); // leave data as string
const data2 = cacheObject.getBody(true); // parse JSON data
```

### Use `CacheableDataAccess.getData()` to send requests

The Connection, Cache Profile, and Getter function are sent through `CacheableDataAccess.getData()` which handles all the caching transparently.

```js
const {cache: {CacheableDataAccess}, endpoint} = require('@63klabs/cache-data');

const conn = { uri: "https://api.chadkluck.net/games" };
const cacheProfile = { defaultExpirationInSeconds: 60 };

const cacheObj = await CacheableDataAccess.getData(
  cacheProfile, 
	endpoint.get, // this is a provided function for simple API requests
	conn, 
	null
);

const data = cacheObj.getBody(true); // data is returned in a wrapper from CacheableDataAccess
```

#### CacheableDataAccess.getData Parameters

##### Cache Profile Parameter for `CacheableDataAccess.get()`

The cache profile is used to specify cache behavior for a particular request.

- `profile`: Used when storing in a `Connections` class.
- `overrideOriginHeaderExpiration`: If the origin provides an expiration, should we ignore and apply our own instead (set to true when the origin has a shorter expiration than you'd like)
- `defaultExpirationInSeconds`: In seconds, how long is the default expiration? Default: 60 (60 seconds)
- `defaultExpirationExtensionOnErrorInSeconds`: In seconds, if there is an error, how long until the error expires from cache? Default: 3600 (5 minutes)
- `expirationIsOnInterval`: Does the cache expires timer reset on first request, or is the expires set to the clock? (ex. every 10 seconds, every hour, etc) Default: false
- `headersToRetain`: Array or comma deliminated string of header keys to keep from the original source to cache and pass to client. 
- `hostId`: Only used for logging, helps identify connection using a short id without sensitive info
- `pathId`: Only used for logging, helps identify connection using a short id without sensitive info
- `encrypt`: Encrypt the data in the cache (set to true, unless debugging in non-prod)

```js
const cacheProfile = {
  profile: "default",
	overrideOriginHeaderExpiration: true,
	defaultExpirationInSeconds: (5 * 60), // 5 minutes
	expirationIsOnInterval: true,
	headersToRetain: "x-server",
	hostId: "chadkluck", // log entry label - only used for logging
	pathId: "games", // log entry label - only used for logging
	encrypt: true, // encrypt the data in the cache
}
```

##### Fetch Function parameter for `CacheableDataAccess.getData()`

The cache-data package supplies a simple `endpoint.get` method for performing basic HTTP requests.

However, for more complex requests, or if you are performing database access, AWS SDK queries, or more, you can create your own fetch function to wrap your official request in.

Since the fetch function is used by CacheableDataAccess on a miss, it need to be simple for it to use and only assumes 2 parameters: `connection` and `options`.

You can then decompose the `connection` and `options` within your custom fetch function to supply the required parameters and options to your data get function.

For example, if you have a function that queries the AWS SDK and filters a list of S3 objects based on tag values:

```js
const {cache: {CacheableDataAccess}} = require('@63klabs/cache-data');

// this fetch method wraps myOtherFunctionThatQueriesS3() for use by CacheableDataAccess.getData()
const fetch = function(connection, options) {
  return myOtherFunctionThatQueriesS3(
    {
      bucket: connection.host,
      key: connection.path,
      tagValues: connection.parameters,
      format: options.format
    });
};

// Access data through cache
const cacheObj = await CacheableDataAccess.getData(
	cacheProfile, 
	fetch,
	conn,
	options // extra data that doesn't affect the request or never changes from request to request
);

// obtain body from cachd object wrapper
data = cacheObj.getBody(true);
```

With this, you can use CacheableDataAccess to cache ANY data, even data used internally to your application.

For example, large dataset processing. Grab 1,000 records from the source, parse, heavily transform and filter, and cache the parsed data so you don't need to re-parse, filter, and transform on every request.

##### Connection Object Parameter for `CacheableDataAccess.get()`

The connection object used for cache key generation can include:
- `host`: The target host for the cached request
- `path`: The URL path for the cached request
- `uri`: Can be used as a complete host, path, and query string instead of separating out (https://api.chadkluck.net/games?new=yes)
- `method`: HTTP method (GET, POST, etc.)
- `parameters`: Query parameters or request parameters
- `headers`: Request headers
- `body`: Request body content

These connection parameters are hashed together to create a unique cache identifier.

##### Options parameter for `CacheableDataAccess.get()`

Most of the time you will want to send all your request information in the `connection` parameter as it is what is used to provide the cache key.

However, there may be times you need to send additional information that is used to process the request, but does not affect the response. For example, the database username and password, application wide API key, standard, static parameters, a function that calculates time remaining.

### Configuring and Initializing the Cache using `Cache.init()`

In order to use the cache functions you must first initialize it outside of your Lambda handler (This is done so that it is only initialized during a cold start and can be reused on subsequent invocations.)

This is typically performed in an Configuration initialization function grouped with other init tasks.

#### Configuration Options

The Cache system accepts the following configuration options via `Cache.init()`:

| Option | Type | Default | Required | Description |
|--------|------|---------|----------|-------------|
| `dynamoDbTable` | string | `CACHE_DATA_DYNAMO_DB_TABLE` env var | Yes | DynamoDB table name for cache storage. Used for small cached objects (< 10 KB by default). |
| `s3Bucket` | string | `CACHE_DATA_S3_BUCKET` env var | Yes | S3 bucket name for cache storage. Used for large cached objects (>= 10 KB by default). |
| `secureDataKey` | string\|Buffer\|CachedParameterSecret | None | Yes | Encryption key for private/sensitive cached data. Must be appropriate length for the chosen algorithm (e.g., 32 bytes for aes-256-cbc). |
| `secureDataAlgorithm` | string | `'aes-256-cbc'` | No | Encryption algorithm for private data. Can also be set via `CACHE_DATA_SECURE_DATA_ALGORITHM` env var. |
| `idHashAlgorithm` | string | `'RSA-SHA256'` | No | Hash algorithm for generating cache key identifiers. Can also be set via `CACHE_DATA_ID_HASH_ALGORITHM` env var. |
| `DynamoDbMaxCacheSize_kb` | number | `10` | No | Maximum size in KB for storing cache entries in DynamoDB. Entries larger than this are stored in S3. Can also be set via `CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB` env var. |
| `purgeExpiredCacheEntriesAfterXHours` | number | `24` | No | Number of hours after expiration to keep entries before purging. Can also be set via `CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS` env var. |
| `timeZoneForInterval` | string | `'Etc/UTC'` | No | TZ database timezone name for interval-based cache expiration calculations. Aligns cache intervals with local time rather than UTC. Can also be set via `CACHE_DATA_TIME_ZONE_FOR_INTERVAL` env var. |
| `useInMemoryCache` | boolean | `false` | No | Enable in-memory L0 cache for ultra-fast access. Can also be set via `CACHE_USE_IN_MEMORY=true` env var. |
| `inMemoryCacheMaxEntries` | number | Auto-calculated | No | Override automatic capacity calculation for in-memory cache. When set, ignores `entriesPerGB` heuristic. |
| `inMemoryCacheEntriesPerGB` | number | `5000` | No | Heuristic for calculating max entries from Lambda memory allocation. Formula: `(lambdaMemoryMB / 1024) * entriesPerGB`. |
| `inMemoryCacheDefaultMaxEntries` | number | `1000` | No | Fallback capacity when Lambda memory allocation cannot be determined (when `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` env var is unavailable). |
| `useToolsHash` | boolean | `false` | No | Use tools.hash() method instead of object-hash for cache key generation. Can also be set via `CACHE_DATA_USE_TOOLS_HASH` env var. |
| `idHashAlgorithm` | string | `'RSA-SHA256'` | No | Hash algorithm for generating cache key identifiers from connection and cacheProfile objects. Can also be set via `CACHE_DATA_ID_HASH_ALGORITHM` env var. |

#### Basic Configuration

```javascript
const { cache } = require('@63klabs/cache-data');

cache.Cache.init({
  secureDataKey: Buffer.from('my-32-byte-encryption-key-here', 'hex')
}); // Use SSM Parameter store or Secrets Manager to load the key! See tools.CachedParameterSecrets
```

Using `tools.CachedSSMParameter`:

```javascript
const { cache, tools } = require('@63klabs/cache-data');

cache.Cache.init({
  secureDataKey: new CachedSSMParameter('/param/store/path/CacheData_SecureDataKey')
});
```

#### Advanced Configuration

Cache.init() allows many options, however most can use default settings or Cache.init() will automatically check Lambda Environment variables.

Below are all the options. The environment variable Cache.init() automatically checks for is in the comment.

```javascript
const {cache: {Cache}} = require('@63klabs/cache-data');

Cache.init({
  // Required parameters
  secureDataKey: new CachedSSMParameter('/param/store/path/CacheData_SecureDataKey'), // no environment var

  // Required parameters if no corresponding environment variable set
  dynamoDbTable: 'some_table', // CACHE_DATA_DYNAMO_DB_TABLE
  s3Bucket: 'somebucket', // CACHE_DATA_S3_BUCKET,
  
  // Storage and encryption (default values listed)
  secureDataAlgorithm: 'aes-256-cbc', // CACHE_DATA_SECURE_DATA_ALGORITHM
  idHashAlgorithm: 'RSA-SHA256', // CACHE_DATA_ID_HASH_ALGORITHM
  DynamoDbMaxCacheSize_kb: 10, // CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB
  
  // Expiration and timezone (default values listed)
  purgeExpiredCacheEntriesAfterXHours: 24, // CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS
  timeZoneForInterval: 'Etc/UTC', // CACHE_DATA_TIME_ZONE_FOR_INTERVAL

  // hashing method
  useToolsHash: false, // CACHE_DATA_USE_TOOLS_HASH_METHOD - default will switch to true in future
  
  // In-memory cache
  useInMemoryCache: true, // CACHE_USE_IN_MEMORY
  inMemoryCacheMaxEntries: 8000, // no environment var
  inMemoryCacheEntriesPerGB: 4000, // no environment var
  inMemoryCacheDefaultMaxEntries: 1500 // no environment var
});
```

#### Configure using Environment Variables

You can configure many options via environment variables instead of parameters:

```bash
# Required (if not provided as parameters)
CACHE_DATA_DYNAMO_DB_TABLE=my-cache-table
CACHE_DATA_S3_BUCKET=my-cache-bucket

# Optional
CACHE_DATA_SECURE_DATA_ALGORITHM=aes-256-cbc
CACHE_DATA_ID_HASH_ALGORITHM=RSA-SHA256
CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB=10
CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS=24
CACHE_DATA_TIME_ZONE_FOR_INTERVAL=Etc/UTC
CACHE_USE_IN_MEMORY=false
CACHE_DATA_USE_TOOLS_HASH=false
```

> **Note**: Parameters passed to `Cache.init()` take precedence over environment variables.

By default, In-Memory Caching is disabled. To enable it, or to learn more about it, refer to the [In-Memory Cache documentation](./In-Memory-Cache.md).

### Deploying a Lambda function to use caching

1. Set up DynamoDB and S3
2. Generate a secret key and store in Parameter Store
3. Set Lambda environment variables

#### Set up DynamoDB and S3

You have a few options, and if you use a shared cache among all your application stacks (don't worry, each application generates a different cache key and you can encrypt your data with an application-specific secret key) you only need to do this once.

##### Deploy a Cache Storage Stack using 63Klabs Atlantis Platform

If you are familiar with the Atlantis Platform and you are using it to deploy your serverless infrasture, this is the way to go. Even if you aren't currently using Atlantis, you will want to check it out. It may be the easiest way to deploy and manage CloudFormation stacks using native SAM deployment strategies.

If you are still struggling with samconfig.toml files, or you gave up on them a long time ago and still do not have a good method of deployment, check out [Atlantis Configuration Repository for Serverless Deployments using AWS SAM](https://github.com/63Klabs/atlantis-cfn-configuration-repo-for-serverless-deployments).

Once you have the SAM Config repo set up, run the config script:

```bash
source .ve/bin/activate # or however your start your python virtual environment
./cli/config.py storage acme cache-data --profile default
```

Be sure to replace `acme` and `default` with the correct values. (If you set up the SAM Config repo, you'll know what these are. If and administrator set it up, check with them.)

The config script will then have you choose a storage template to deploy, choose the one for `cache-data`.

Deploy when asked, or do it later:

```bash
source .ve/bin/activate # or however your start your python virtual environment
./cli/deploy.py storage acme cache-data --profile default
```

Once the stack deploys there will be Stack export variables for S3, DyanmoDB, and Managed policy for your Lambda execution role that you can use in your application stacks.

See an implementation example on the [63Klabs Atlantis Starter 02 GitHub repository](https://github.com/63Klabs/atlantis-starter-02-apigw-lambda-cache-data-nodejs/blob/main/application-infrastructure/template.yml).

##### Deploy on your own

Use the [example template for S3 and DynamoDB](../../00-example-implementation/example-template-s3-and-dynamodb-cache-store.yml)

#### Set-Up Lambda Environment Variables

Use the [example template lambda function](../../00-example-implementation/example-template-lambda-function.yml)

#### SSM Parameter Store

During the execution of CodeBuild, use the [generate-put-ssm.py](../../00-example-implementation/generate-put-ssm.py) script to check for the existence of a `CacheData_SecureDataKey` for your application and generate and store one if not found.

You can see examples in the [example buildspec.yml](../../00-example-implementation/example-buildspec.yml).

## Additional Information

### Cache Key Generation

Cache keys are generated by hashing the connection object (`host`, `path`, `parameters`, `headers`) along with the Lambda Application Identifer. This hash ensures that identical requests produce the same cache key and are only returned to the application that made the original request.

Because the Application ID is included, and applications use their own encryption key, you can safely store multiple caches in a single DynamoDB/S3 cache store.

### Expiration Handling

The `expires` timestamp determines when cached data becomes stale. After expiration:
- DynamoDB entries are marked for purging after `purgeExpiredCacheEntriesAfterXHours`
- S3 objects can be cleaned up using lifecycle policies
- In-memory cache entries are immediately deleted on access

### Basic Usage

Once enabled, the in-memory cache works automatically with no code changes required:

```javascript
const {cache, endpoint} = require('@63klabs/cache-data');

// Initialize with in-memory cache enabled
cache.Cache.init({
  secureDataKey: Buffer.from(params.app.crypt_secureDataKey, cache.Cache.CRYPT_ENCODING),
  useInMemoryCache: true  // Enable in-memory cache
});

// Use cache as normal - in-memory cache is transparent
const conn = { uri: "https://api.chadkluck.net/games" };
const cacheProfile = { defaultExpirationInSeconds: 60 };

const cacheObj = await cache.CacheableDataAccess.getData(
  cacheProfile, 
	endpoint.get,
	conn, 
	null
);

const data = cacheObj.getBody(true); // data is returned in a wrapper from CacheableDataAccess
```

### Checking Cache Status

The cached object has a status code to identify where the data came from:

```javascript
// ... use CacheableDataAccess to get a cacheObj

const status = cacheObj.getStatus();

switch (status) {
  case cache.Cache.STATUS_CACHE_IN_MEM:
    console.log('Data from in-memory cache (microseconds)');
    break;
  case cache.Cache.STATUS_CACHE:
    console.log('Data from DynamoDB/S3 (milliseconds)');
    break;
  case cache.Cache.STATUS_NO_CACHE:
    console.log('No cached data available');
    break;
  case cache.Cache.STATUS_CACHE_ERROR:
    console.log('Error occurred, stale data returned');
    break;
}
```

### Status Codes

- **`STATUS_CACHE_IN_MEM`** (`"cache:memory"`): Data served from in-memory cache
- **`STATUS_CACHE`** (`"cache"`): Data served from DynamoDB/S3
- **`STATUS_NO_CACHE`** (`"original"`): No cached data available
- **`STATUS_CACHE_ERROR`** (`"error:cache"`): Error occurred, stale data returned if available

### Response Headers

The cache status is also included in the response headers via `x-cprxy-data-source`:

```javascript
const {endpoint, cache: {CacheableDataAccess}} = require('@63klabs/cache-data');

const cacheObj = await CacheableDataAccess(cacheProfile, endpoint.get, conn, null);
const response = cacheObj.getResponse();
console.log(response.headers['x-cprxy-data-source']); // "cache:memory"
```

### Cache Flow

All of this is transparent when using `CacheableDataAccess.getData()` so developers do not have to manage the cache.

From a developer standpoint, request goes into `CacheableDataAccess.getData()` and data comes back.

When you call `CacheableDataAccess.getData()`:

1. **Check in-memory cache** (if enabled)
   - **Hit**: Return data immediately (microseconds)
   - **Miss**: Continue to step 2
   - **Expired**: Retain data for potential fallback, continue to step 2

2. **Fetch from DynamoDB/S3**
   - **Hit**: Store in in-memory cache, return data (milliseconds)
   - **Miss**: Continue to step 3
   - **Error**: Use expired in-memory data if available (with extended expiration)
   - **Notes**: To retain DynamoDB efficency, large data objects are stored in S3 with a marker placed in the DynamoDB record. This may add a few milliseconds. Again, this mangement is transparent to the developer implemeting `CacheableDataAccess`

3. **Fetch from Original Source**
   - **Fetch**: Using the fetch function passed to `CacheableDataAccess` along with `connection` and `options`, perform request.
   - **Success**: Store in DynamoDB/S3 and in-memory cache, return data
   - **Error**: Use expired cache data if available (with extended expiration)

## Reference

> **Note:** For caching, the only two methods developers need to know are `Cache.init()` (with configuration options) and `CacheableDataAccess.getData()` (with connection, cache profile, fetch function, and options).

For detailed API documentation including all methods, parameters, and return types, refer to the JSDoc comments in the source code: see `src/lib/dao-cache.js`.

You can use the package code as reference, but any use of methods and classes outside of `Cache.init()` and `CacheableDataAccess.getData()` is unsupported.
