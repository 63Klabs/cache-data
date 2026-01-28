# Implementation Examples

This directory contains complete working examples for implementing the @63klabs/cache-data package in an AWS Lambda environment with CloudFormation templates. These examples demonstrate real-world deployment patterns and best practices.

## Overview

The cache-data package requires AWS infrastructure (DynamoDB table and S3 bucket) to store cached data. This directory provides:

- CloudFormation templates for creating required AWS resources
- Lambda function configuration examples with proper IAM permissions
- Build scripts for generating encryption keys
- Example validation code patterns

> **Note:** A full implementation tutorial is available through the [Atlantis Tutorials repository](https://github.com/63klabs/atlantis-tutorials) as [Tutorial #2](https://github.com/63Klabs/atlantis-tutorials/blob/main/tutorials/02-s3-dynamo-api-gateway-lambda-cache-data-node/README.md).

## Example Files

### CloudFormation Templates

#### [example-template-s3-and-dynamodb-cache-store.yml](./example-template-s3-and-dynamodb-cache-store.yml)

**Purpose:** Creates the DynamoDB table and S3 bucket required for cache storage.

**What it includes:**
- DynamoDB table with Time-To-Live (TTL) enabled for automatic cache expiration
- S3 bucket with encryption, lifecycle policies, and security configurations
- Bucket policy enforcing secure transport (HTTPS)

**Deployment options:**
- Create a centrally-shared DynamoDB table and S3 bucket for use across multiple Lambda functions (recommended for cost efficiency)
- Include these resources in each application's template individually (simpler but creates more resources to manage)

Each Lambda instance uses its own encryption key, preventing cache sharing between applications even when using shared storage.

#### [example-template-lambda-function.yml](./example-template-lambda-function.yml)

**Purpose:** Demonstrates Lambda function configuration with cache-data integration.

**What it includes:**
- Lambda function properties (runtime, memory, tracing)
- Environment variables for cache-data configuration
- IAM execution role with required permissions:
  - CloudWatch Logs access for logging
  - SSM Parameter Store access for encryption keys
  - DynamoDB read/write permissions
  - S3 read/write permissions
- Lambda Insights and X-Ray tracing configuration
- API Gateway integration example

**Key configuration:**
- Minimum 512MB memory recommended (256MB minimum, 1024MB optimal)
- X-Ray tracing enabled for observability
- Lambda Insights layer for enhanced monitoring
- Parameters and Secrets Lambda Extension layer for efficient parameter access

#### [example-template-parameters.yml](./example-template-parameters.yml)

**Purpose:** Shows how to parameterize cache-data settings for flexible deployments.

**What it includes:**
- CloudFormation parameters for all cache-data configuration options
- Parameter descriptions, constraints, and default values
- Conditional logic for using imported values from other stacks
- Examples of passing parameters to Lambda environment variables

**Use cases:**
- Different cache settings per environment (dev, test, prod)
- Reusing the same template across multiple deployments
- Understanding available configuration options and their valid values

### Build Scripts

#### [generate-put-ssm.py](./generate-put-ssm.py)

**Purpose:** Generates and stores encryption keys in AWS Systems Manager Parameter Store during the build process.

**What it does:**
- Generates cryptographically secure random keys (e.g., 256-bit hex keys)
- Stores parameters in SSM Parameter Store with proper tagging
- Reads [template-configuration.json](./template-configuration.json) for tag values
- Replaces environment variable placeholders in tag values

**Usage examples:**
```bash
# Generate a 256-bit encryption key for cache-data
generate-put-ssm.py /webservice/app-name/CacheData_SecureDataKey --generate 256

# Store a parameter with a specific value
generate-put-ssm.py /webservice/app-name/ApiKey --value "your-api-key"

# Create a placeholder parameter to fill in later
generate-put-ssm.py /webservice/app-name/DatabasePassword
```

#### [example-buildspec.yml](./example-buildspec.yml)

**Purpose:** Demonstrates integrating the SSM parameter generation script into AWS CodeBuild.

**What it includes:**
- Pre-build phase commands for generating encryption keys
- Examples of creating parameters with generated values, preset values, and placeholders
- Integration with CodeBuild environment variables

### Code Examples

#### [example-validations.js](./example-validations.js)

**Purpose:** Demonstrates validation patterns for request parameters when using cache-data with API endpoints.

**What it includes:**
- Parameter validation functions for path, query, header, cookie, and body parameters
- Examples of validating string formats, numeric ranges, and custom business logic
- Integration with the cache-data Request object for automatic validation
- Referrer validation for security

**Key patterns:**
- Export validation functions with names matching the parameter names
- The Request object automatically validates parameters using these functions
- Only validated parameters are included in the request object

#### example-config.js and example-handler.js

**Note:** These files are referenced but not currently present in the repository. They would typically contain:
- **example-config.js:** Configuration class extending cache-data's `_ConfigSuperClass`
- **example-handler.js:** Lambda handler implementation using cache-data for caching API responses

## How the Examples Fit Together

### Deployment Workflow

1. **Infrastructure Setup:**
   - Deploy [example-template-s3-and-dynamodb-cache-store.yml](./example-template-s3-and-dynamodb-cache-store.yml) to create cache storage resources
   - Note the DynamoDB table name and S3 bucket name from stack outputs

2. **Build Process:**
   - Use [generate-put-ssm.py](./generate-put-ssm.py) in your build pipeline (see [example-buildspec.yml](./example-buildspec.yml))
   - Generate encryption key: `/your-app/CacheData_SecureDataKey`
   - Store any other required parameters (API keys, configuration values)

3. **Application Deployment:**
   - Deploy [example-template-lambda-function.yml](./example-template-lambda-function.yml) with your application code
   - Configure environment variables with DynamoDB table and S3 bucket names
   - Optionally use [example-template-parameters.yml](./example-template-parameters.yml) for parameterized deployments

4. **Application Code:**
   - Implement validation logic (see [example-validations.js](./example-validations.js))
   - Use cache-data modules in your Lambda handler:
     ```javascript
     const { cache, endpoint, tools } = require('@63klabs/cache-data');
     ```

### Resource Dependencies

```
SSM Parameter Store (encryption key)
         ↓
Lambda Function ← Environment Variables ← CloudFormation Parameters (optional)
         ↓
    IAM Role (execution permissions)
         ↓
DynamoDB Table + S3 Bucket (cache storage)
```

## Deployment Instructions

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI (for serverless deployments)
- Python 3.x (for build scripts)
- Node.js 18.x or later

### Step 1: Deploy Cache Storage

```bash
aws cloudformation deploy \
  --template-file example-template-s3-and-dynamodb-cache-store.yml \
  --stack-name my-app-cache-storage \
  --parameter-overrides \
    YOUR-DYNAMODB-TABLE=my-app \
    YOUR-BUCKET-NAME=my-app
```

### Step 2: Generate Encryption Key

```bash
# During build process or manually
python generate-put-ssm.py /my-app/CacheData_SecureDataKey --generate 256
```

### Step 3: Deploy Lambda Function

```bash
sam deploy \
  --template-file example-template-lambda-function.yml \
  --stack-name my-app-function \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    CacheDataDynamoDbTableName=my-app-CacheData \
    CacheDataS3BucketName=my-app-cachedata
```

### Step 4: Verify Deployment

- Check Lambda function environment variables are set correctly
- Verify IAM role has required permissions
- Test Lambda function invocation
- Monitor CloudWatch Logs and X-Ray traces

## Configuration Reference

### Required Environment Variables

- `CACHE_DATA_DYNAMO_DB_TABLE`: DynamoDB table name for cache storage
- `CACHE_DATA_S3_BUCKET`: S3 bucket name for cache storage

### Optional Environment Variables

See [example-template-lambda-function.yml](./example-template-lambda-function.yml) for complete list with defaults:
- `CACHE_DATA_SECURE_DATA_ALGORITHM`: Encryption algorithm (default: "aes-256-cbc")
- `CACHE_DATA_ID_HASH_ALGORITHM`: Hash algorithm for cache keys (default: "RSA-SHA256")
- `CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB`: Size threshold for S3 storage (default: 10)
- `CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS`: Retention period for expired cache (default: 24)
- `CACHE_DATA_ERROR_EXP_IN_SECONDS`: Error cache duration (default: 300)
- `CACHE_DATA_TIME_ZONE_FOR_INTERVAL`: Timezone for interval calculations (default: "Etc/UTC")
- `CACHE_DATA_AWS_X_RAY_ON`: Enable X-Ray tracing (default: false)
- `CACHE_DATA_USE_TOOLS_HASH_METHOD`: Use tools.hash method (default: false)

## Related Documentation

- [Quick Start Guide](../00-quick-start-implementation/README.md) - Minimal setup instructions
- [Advanced Implementation Guide](../01-advanced-implementation-for-web-service/README.md) - Comprehensive web service setup
- [Lambda Optimization Guide](../lambda-optimization/README.md) - Performance tuning tips
- [Features Documentation](../features/README.md) - Detailed API documentation
