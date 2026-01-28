# 63Klabs Cache-Data

A package for AWS Lambda Node.js applications to access and cache data from remote API endpoints (or other sources) utilizing AWS S3 and DynamoDb for the cache storage. Also provides a simple request handling, routing, and response logging framework for running a web service with minimal dependencies.

> Note: This repository and package has moved from chadkluck to 63Klabs but is still managed by the same developer.

- [@63klabs/cache-data on npmjs.com](https://www.npmjs.com/package/@63klabs/cache-data)
- [@63klabs/cache-data on GitHub](https://github.com/63Klabs/cache-data)

## Description

A distributed, serverless data caching solution for AWS Lambda Node.js functions. Cache data from internal processes or external data sources such as remote API endpoints to be shared among concurrent executions. Uses DynamoDb and S3 for caching.

It has several utility functions such `DebugAndLog`, `Timer`, and SSM Parameter Store loaders.

It can be used in place of Express.js for simple web service applications as it also includes functions for handling and validating requests, routing, and client request logging.

This package has been used in production environments for web service applications receiving over 1 million requests per week with a 75% cache-hit rate lowering latency to less than 100ms in most cases. This is a considerable improvement when faced with resource intense processes, connection pools, API rate limits, and slow endpoints.

## Features

The @63klabs/cache-data package provides three main modules:

### Cache Module
- **Distributed Caching**: Share cached data across concurrent Lambda executions using DynamoDb and S3
- **In-Memory Cache**: Optional in-memory caching layer for improved response times within a single execution
- **Flexible Storage**: Automatic storage selection based on data size (DynamoDb for small items, S3 for large items)
- **Data Encryption**: Secure your cached data with encryption keys stored in SSM Parameter Store
- **Cache Profiles**: Configure multiple cache profiles with different expiration policies

### Endpoint Module
- **HTTP/HTTPS Requests**: Make requests to external APIs and endpoints with built-in retry logic
- **Connection Management**: Define and manage multiple endpoint connections with authentication
- **Request Caching**: Automatically cache endpoint responses to reduce API calls and improve performance
- **Flexible Configuration**: Support for custom headers, query parameters, request bodies, and timeouts

### Tools Module
- **Logging and Debugging**: `DebugAndLog` class for structured logging with configurable log levels
- **Performance Timing**: `Timer` class for measuring execution time and performance metrics
- **Request Handling**: `ClientRequest` and `Response` classes for building web service applications
- **AWS Integration**: Direct access to AWS SDK v3 for DynamoDb, S3, and SSM Parameter Store
- **Parameter and Secret Caching**: `CachedParameterSecrets` classes for AWS Parameters and Secrets Lambda Extension
- **Utility Functions**: Data sanitization, obfuscation, hashing, and immutable object creation
- **Response Generators**: Built-in generators for JSON, HTML, XML, RSS, and text responses

## Getting Started

### Requirements

- Node.js >=20.0.0 runtime on Lambda
- AWS Services:
  - **AWS Lambda**: For running your serverless functions
  - **Amazon S3**: For storing large cached objects
  - **Amazon DynamoDB**: For storing cache metadata and small cached objects
  - **AWS Systems Manager (SSM) Parameter Store**: For storing configuration and encryption keys
- A basic understanding of CloudFormation, Lambda, S3, DynamoDB, and SSM Parameters
- A basic understanding of IAM policies, especially the Lambda Execution Role, that will allow Lambda to access S3, DynamoDB, and SSM Parameter Store
- Lambda function should have between 512MB and 2048MB of memory allocated (>1024MB recommended). See [Lambda Optimization: Memory Allocation](./docs/lambda-optimization/README.md#lambda-memory-allocation)

### Installing

Install the package using npm:

```bash
npm install @63klabs/cache-data
```

The simplest way to get started is to use the [63klabs Atlantis Templates and Script platform](https://github.com/63Klabs/atlantis-cfn-configuration-repo-for-serverless-deployments) to deploy this and other ready-to-run solutions via CI/CD.

However, if you want to write your own templates and code, follow the following steps:

1. Generate Secret Key to Encrypt Cache:
   - Use the [key generation script](./docs/00-example-implementation/generate-put-ssm.py) during [the build](./docs/00-example-implementation/example-buildspec.yml) to establish a key to encrypt your data.
2. Lambda CloudFormation Template:
   - See [Lambda template example](./docs/00-example-implementation/example-template-lambda-function.yml) 
   - Node: AWS Lambda supported version of Node (>=20.0.0)
   - Memory: Allocate at least 512MB (1024MB+ recommended)
   - Environment Variables: Add the cache-data environment variables to your Lambda function.
   - Execution Role: Include access to S3 and DynamoDB in your Lambda's execution role.
3. S3 and DynamoDB CloudFormation Template to store your cache:
   - See [S3 and DynamoDB Cache Store template example](./docs/00-example-implementation/example-template-s3-and-dynamodb-cache-store.yml)
   - Include in your application infrastructure template or as separate infrastructure.
4. Install the @63klabs/cache-data package:
   ```bash
   npm install @63klabs/cache-data
   ```
5. Add code to your Lambda function to utilize caching and other cache-data utilities:
   - See [example code for index and handler](./docs/00-example-implementation/example-handler.js)
   - See [example code for config initialization](./docs/00-example-implementation/example-config.js)

It is recommended that you use the quick-start method when implementing for the first time. It comes with default values and requires less CloudFormation yaml and Node code.

- [Quick Start Implementation](./docs/00-quick-start-implementation/README.md)
- [Advanced Implementation for Providing a Web Service](./docs/01-advanced-implementation-for-web-service/README.md)
- [Additional Documentation](./docs/README.md)

## Quick Start Examples

### Basic Caching Example

```javascript
const { cache } = require("@63klabs/cache-data");

// Initialize cache with your S3 bucket and DynamoDB table
cache.Cache.init({
  s3Bucket: process.env.CACHE_DATA_S3_BUCKET,
  dynamoDbTable: process.env.CACHE_DATA_DYNAMODB_TABLE,
  securityKey: process.env.CACHE_DATA_SECURITY_KEY
});

// Cache some data
const cacheKey = "my-data-key";
const dataToCache = { message: "Hello, World!", timestamp: Date.now() };

await cache.Cache.put(cacheKey, dataToCache, 3600); // Cache for 1 hour

// Retrieve cached data
const cachedData = await cache.Cache.get(cacheKey);
if (cachedData) {
  console.log("Retrieved from cache:", cachedData);
}
```

### Making Endpoint Requests

```javascript
const { endpoint } = require("@63klabs/cache-data");

// Make a simple GET request to an API
const response = await endpoint.get(
  { host: "api.example.com", path: "/data" },
  { parameters: { q: "search-term" } }
);

console.log("API Response:", response.body);
console.log("Status Code:", response.statusCode);
```

### Using Utility Tools

```javascript
const { tools } = require("@63klabs/cache-data");

// Create a timer to measure performance
const timer = new tools.Timer("my-operation");
timer.start();

// Your code here...

timer.stop();
console.log(`Operation took ${timer.elapsed()}ms`);

// Use the logger
const logger = new tools.DebugAndLog("MyApp");
logger.info("Application started");
logger.error("An error occurred", { details: "error info" });
```

## Help

Make sure you have your S3 bucket, DynamoDb table, and SSM Parameter store set up. Also make sure that you have IAM policies to allow your Lambda function access to these, and CodeBuild to read and write to SSM Parameter store.

Review the [Documentation](./docs/README.md) which includes implementation guides, example code and templates, cache data features, and lambda optimization best practices.

A full implementation example and tutorial is provided as one of the Atlantis Application Starters available through the [Atlantis Tutorials repository](https://github.com/63klabs/atlantis-tutorials). (Atlantis is a collection of templates and deployment scripts to assist in starting and automating serverless deployments using AWS SAM and CloudFormation.)

## Security

See [SECURITY](./SECURITY.md) for information on reporting concerns.

## Change Log

See [Change Log](./CHANGELOG.md) for version history and changes.

## Issues, Features, and Enhancements

Visit the [Issues section of the @63Klabs Cache-Data GitHub repository](https://github.com/63Klabs/cache-data/issues) for information on reported issues, upcoming fixes and enhancements, and to submit requests.

## License

This project is licensed under the MIT License - see the LICENSE.txt file for details

## Author

### Chad Kluck

- Software, DevOps, and Developer Experience Engineer
- [AWS Certified Developer - Associate](https://www.credly.com/users/chad-kluck/badges)
- [Website: chadkluck.me](https://chadkluck.me/)
- [GitHub: chadkluck](https://github.com/chadkluck)
- [GitHub: 63Klabs](https://github.com/63klabs)
- [Mastodon: @chadkluck@universeodon.com](https://universeodon.com/@chadkluck)
- [LinkedIn](https://www.linkedin.com/in/chadkluck/)
