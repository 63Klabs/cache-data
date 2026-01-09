# 63Klabs Cache-Data

A package for AWS Lambda Node.js applications to access and cache data from remote API endpoints (or other sources) utilizing AWS S3 and DynamoDb for the cache storage. Also provides a simple request handling, routing, and response logging framework for running a web service with minimal dependencies.

> Note: This repository and package has moved from chadkluck to 63Klabs but is still managed by the same developer.

- [@63klabs/cache-data on npmjs.com](https://www.npmjs.com/package/@63klabs/cache-data)
- [@63klabs/cache-data on GitHub](https://github.com/@63klabs/cache-data)

## Description

For AWS Lambda functions written in Node.js that require caching of data either of an internal process or external data source such as remote API endpoints. While out of the box it can fetch data from remote endpoint APIs, custom Data Access Objects can be written to provide caching of data from all sorts of sources including resource expensive database calls.

It has several utility functions such `DebugAndLog`, `Timer`, and SSM Parameter Store loaders.

It can be used in place of Express.js for simple web service applications as it also includes functions for handling and validating requests, routing, and client request logging.

This package has been used in production for web service applications receiving over 1 million requests per week with a 75% cache-hit rate lowering latency to less than 100ms in most cases. This is a considerable improvement when faced with resource intense processes, connection pools, API rate limits, and slow endpoints.

## Getting Started

### Requirements

- Node >20 runtime on Lambda
- AWS Lambda, S3 bucket, DynamoDb table, and SSM Parameter Store
- A basic understanding of CloudFormation, Lambda, S3, DynamoDb, and SSM Parameters
- A basic understanding of IAM policies, especially the Lambda Execution Role, that will allow Lambda to access S3, DynamoDb, and SSM Parameter Store
- Lambda function should have between 512MB and 2048MB of memory allocated. (>1024MB recommended). See [Lambda Optimization: Memory Allocation](./docs/lambda-optimization/README.md#lambda-memory-allocation).

### Installing

The simplest way to get started is to use the [63klabs Atlantis Templates and Script platform](hhttps://github.com/63Klabs/atlantis-cfn-configuration-repo-for-serverless-deployments) to deploy this and other ready-to-run solutions via CI/CD.

However, if you want to write your own templates and code, follow the following steps:

1. Generate Secret Key to Encrypt Cache:
   - Use the [key generation script](./docs/00-example-implementation/generate-put-ssm.py) during [the build](./docs/00-example-implementation/example-buildspec.yml) to establish a key to encrypt your data.
2. Lambda CloudFormation Template:
   - See [Lambda template example](./docs/00-example-implementation/example-template-lambda-function.yml) 
   - Node: AWS Lambda supported version of Node
   - Memory: Allocate at least 256MB (512-1024MB recommended)
   - Environment Variables: Add the cache-data environment variables to your Lambda function.
   - Execution Role: Include access to S3 and DynamoDb in your Lambda's execution role.
3. S3 and DynamoDb CloudFormation Template to store your cache:
   - See [S3 and DynamoDb Cache Store template example](./docs/00-example-implementation/example-template-s3-and-dynamodb-cache-store.yml)
   - Include in your application infrastructure template or as separate infrastructure.
4. Install the @63klabs/cache-data package:
   - `npm install @63klabs/cache-data`
5. Add code to your Lambda function to utilize caching and other cache-data utilities:
   - See [example code for index and handler](./docs/00-example-implementation/example-handler.js)
   - See [example code for config initialization](./docs/00-example-implementation/example-config.js)

It is recommended that you use the quick-start method when implementing for the first time. It comes with default values and requires less CloudFormation yaml and Node code.

- [Quick Start Implementation](./docs/00-quick-start-implementation/README.md)
- [Advanced Implementation for Providing a Web Service](./docs/01-advanced-implementation-for-web-service/README.md)
- [Additional Documentation](./docs/README.md)

## Help

Make sure you have your S3 bucket, DynamoDb table, and SSM Parameter store set up. Also make sure that you have IAM policies to allow your Lambda function access to these, and CodeBuild to read and write to SSM Parameter store.

Review the [Documentation](./docs/README.md) which includes implementation guides, example code and templates, cache data features, and lambda optimization best practices.

A full implementation example and tutorial is provided as one of the Atlantis Application Starters available through the [Atlantis Tutorials repository](https://github.com/63klabs/atlantis-tutorials). (Atlantis is a collection of templates and deployment scripts to assist in starting and automating serverless deployments using AWS SAM and CloudFormation.)

## Security

See [SECURITY](./SECURITY.md) for information on reporting concerns.

## Change Log

See [Change Log](CHANGELOG.md) for version history and changes.

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
