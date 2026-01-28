# Lambda Optimizations

Get the most out of your Lambda function when using cache-data!

This guide provides AWS Lambda best practices specifically tailored for the cache-data package. Following these recommendations will help you achieve optimal performance, reduce costs, and minimize cold start times.

## Quick Recommendations

- **Memory Allocation**: 512MB to 1024MB (1024MB recommended for production)
- **Architecture**: Use arm64 for better performance and cost efficiency
- **Initialization**: Initialize cache-data components outside the handler function
- **Async Operations**: Leverage cache-data's async capabilities for parallel requests
- **Monitoring**: Enable X-Ray tracing and Lambda Insights

These recommendations are based on AWS best practices and real-world experience with cache-data in production Lambda environments. The cache-data package is designed for making external API calls and caching responses, which benefits significantly from increased memory allocation (faster CPU and network performance) and proper initialization patterns.

## Lambda Memory Allocation

Memory allocation is one of the most important performance factors for Lambda functions using cache-data. Lambda allocates CPU power proportionally to memory, which directly impacts:

- **Network request speed**: More CPU = faster HTTP requests to external endpoints
- **Data processing**: Faster JSON parsing, hashing, and cache operations
- **Concurrent connections**: Better handling of parallel endpoint requests
- **InMemoryCache performance**: More memory allows larger cache sizes for better hit rates

### Recommended Memory Settings

**For cache-data applications, we recommend 512MB to 1024MB:**

- **128MB (Default)**: Not recommended - insufficient for network-intensive operations
- **256MB**: Minimum viable for light usage with few concurrent requests
- **512MB**: Good starting point for most cache-data applications
- **1024MB**: Recommended for production workloads with high request volumes
- **1536MB+**: Consider for applications with very large cache requirements or heavy data processing

### Why More Memory Improves Performance

As documented in [AWS's computing power guide](https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html), Lambda functions benefit significantly from increased memory allocation when using network resources and processing data. See also [Lower AWS Lambda bill by increasing memory by Taavi Rehemägi](https://dashbird.io/blog/lower-aws-lambda-bill-increasing-memory/).

**Real-world example**: The charts below reflect 1 million requests over a seven-day period. When memory was increased from 128MB to 512MB:
- Execution time dropped dramatically
- Latency improved significantly  
- Concurrent executions decreased (better throughput per invocation)
- Overall cost remained minimal due to faster execution times

![Metrics before and after upgrade to 512MB with 1M invocations over a 7 day period](https://github.com/63klabs/cache-data/assets/17443749/0ec98af5-edcf-4e2a-8017-dd17b9c7a11c)

**Cost impact**: A Lambda function handling 4.6 million requests per month, averaging 46ms execution time, totals 211,000 seconds per month - still within the 400,000 second free tier. Without free tier, the cost would be approximately $2.00 USD per month.

### Cache-Data Specific Considerations

**InMemoryCache sizing**: The InMemoryCache automatically calculates its maximum entries based on Lambda memory allocation using the formula: `(memoryMB / 1024) * entriesPerGB`. With 1024MB Lambda memory and default settings (5000 entries per GB), you get approximately 5000 cache entries. More memory = larger cache = better hit rates.

**Connection pooling**: Higher memory allocations provide more CPU for managing concurrent HTTP connections to external endpoints, improving throughput when making multiple parallel requests.

## Use arm64 Architecture

AWS Graviton ARM architecture processors provide better performance and cost efficiency compared to x86 processors. Amazon recommends using arm64 for Lambda functions, and real-world testing with cache-data confirms measurable performance improvements.

### Benefits for cache-data

- **Faster execution**: Improved CPU performance for JSON parsing, hashing, and data processing
- **Better network performance**: Enhanced throughput for HTTP requests to external endpoints
- **Lower cost**: arm64 functions are 20% cheaper than x86 equivalents
- **Energy efficiency**: Better performance per watt

### Implementation Notes

**Layer compatibility**: If you're using AWS Lambda Layers (such as Lambda Insights or X-Ray), ensure you specify the arm64-compatible version:

```yaml
# CloudFormation example
Layers:
  # arm64 version of Lambda Insights
  - !Sub "arn:aws:lambda:${AWS::Region}:580247275435:layer:LambdaInsightsExtension-Arm64:2"
```

**Package compatibility**: The cache-data package and its dependencies are fully compatible with arm64. If you use additional npm packages, verify they support arm64 or provide precompiled binaries for the architecture.

**Migration**: Switching from x86 to arm64 requires redeploying your function with the new architecture setting. Test thoroughly in a non-production environment first.

## Initialize Outside of Handler (Critical for Cold Starts)

Proper initialization is crucial for minimizing Lambda cold start impact when using cache-data. All initialization code should run outside the handler function so it executes only once during cold starts, not on every invocation.

### What to Initialize Outside the Handler

**Cache-data components that should be initialized outside the handler:**

1. **Configuration objects**: Config class instances with connection settings
2. **Cache instances**: S3Cache, DynamoDbCache, or CacheData initialization
3. **Parameter/Secret loading**: CachedParametersSecrets for loading from AWS Systems Manager
4. **Connection configurations**: Endpoint connection objects and authentication settings
5. **Utility instances**: Timer, DebugAndLog, or other tool classes

### Cold Start vs. Warm Invocation

**Cold start** (first invocation or after idle period):
- Lambda loads your code and initializes the execution environment
- Code outside the handler runs once
- Handler function executes
- Total time: initialization + handler execution (typically 200-500ms for cache-data apps)

**Warm invocation** (subsequent invocations):
- Execution environment is reused
- Code outside handler does NOT run again
- Only handler function executes
- Total time: handler execution only (typically 20-100ms for cache-data apps)

### Cache-Data Initialization Pattern

The recommended pattern for cache-data is to implement initialization in a separate configuration module that is imported at the top of your handler file:

**Configuration module** (`config.js`):
```javascript
const { tools, cache } = require('@63klabs/cache-data');

// Initialize configuration
const Config = new tools._ConfigSuperClass({
  // Your configuration options
});

// Initialize cache
cache.S3Cache.init('my-cache-bucket');
cache.DynamoDbCache.init('my-cache-table');

// Load parameters/secrets asynchronously
const initPromise = (async () => {
  await Config.loadParameters();
  // Other async initialization
})();

module.exports = {
  Config,
  initPromise
};
```

**Handler module** (`index.js`):
```javascript
const { Config, initPromise } = require('./config');
const { cache, endpoint } = require('@63klabs/cache-data');

// Handler function
exports.handler = async (event, context) => {
  // Ensure initialization is complete before proceeding
  await initPromise;
  
  // Now use cache-data components
  const result = await endpoint.get(Config.getConnection('myApi'));
  
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

### Benefits of This Pattern

1. **Faster warm invocations**: Initialization runs only during cold starts
2. **Parallel initialization**: Async operations start immediately when the module loads
3. **Reusable connections**: HTTP agents and cache instances persist across invocations
4. **Better InMemoryCache utilization**: Cache persists between invocations in the same container

### What NOT to Initialize Outside the Handler

- **Request-specific data**: Event data, request IDs, user context
- **Temporary state**: Data that should not persist between invocations
- **Time-sensitive values**: Current timestamps, expiration checks

### Example Files

For complete working examples of this initialization pattern:
- [Handler example](../00-example-implementation/example-handler.js)
- [Configuration example](../00-example-implementation/example-config.js)

## Multi-task with Async Operations

The cache-data package is built for asynchronous operations, allowing your Lambda function to perform multiple tasks concurrently without blocking. This is especially important when making multiple endpoint requests or performing cache operations.

### Understanding Async in cache-data

Think of async operations like doing laundry: you don't sit and watch the washing machine - you start the load and do other tasks while it runs. Similarly, cache-data lets you start multiple API requests and continue with other work while they complete.

**Key difference**: Cache-data is like a laundromat with many washers and dryers - you can run multiple operations simultaneously and wait for all to complete.

### Parallel Endpoint Requests

When you need data from multiple endpoints and the requests are independent, dispatch them all at once:

```javascript
// ❌ Sequential (slow) - each request waits for the previous
const user = await endpoint.get(userConnection);
const orders = await endpoint.get(ordersConnection);
const inventory = await endpoint.get(inventoryConnection);
// Total time: sum of all three requests

// ✅ Parallel (fast) - all requests run simultaneously
const [user, orders, inventory] = await Promise.all([
  endpoint.get(userConnection),
  endpoint.get(ordersConnection),
  endpoint.get(inventoryConnection)
]);
// Total time: longest single request
```

### Async Initialization Pattern

Start initialization early and check completion later, allowing other work to proceed:

```javascript
// Start initialization immediately (doesn't block)
const { Config, initPromise } = require('./config');

exports.handler = async (event, context) => {
  // Do other work that doesn't need Config
  const requestId = context.requestId;
  const timestamp = Date.now();
  
  // Now wait for initialization to complete
  await initPromise;
  
  // Use initialized components
  const result = await endpoint.get(Config.getConnection('api'));
  
  return result;
};
```

### Cache Operations

Cache-data's cache operations are also async, allowing you to check cache while preparing other data:

```javascript
// Start cache lookup immediately
const cachePromise = cache.CacheData.get(cacheKey);

// Prepare request while cache lookup runs
const connection = Config.getConnection('api');
const headers = prepareHeaders(event);

// Wait for cache result
const cached = await cachePromise;

if (cached.cache === 1) {
  return cached.data; // Cache hit
}

// Cache miss - make request
const result = await endpoint.get(connection);
await cache.CacheData.set(cacheKey, result, ttl);

return result;
```

### Best Practices for Async Operations

1. **Use Promise.all() for independent operations**: When requests don't depend on each other
2. **Use Promise.allSettled() for optional operations**: When some failures are acceptable
3. **Avoid sequential awaits**: Don't await immediately unless you need the result
4. **Start long operations early**: Begin async work as soon as possible
5. **Group related operations**: Batch similar operations together for efficiency

### Performance Impact

Parallel async operations can reduce Lambda execution time by 50-80% when making multiple endpoint requests, directly reducing costs and improving response times.

## Reduce Package Size for Faster Cold Starts

Lambda function package size directly impacts cold start time. Smaller packages load faster, reducing initialization latency. This is especially important for cache-data applications where cold starts can affect user-facing API response times.

### Exclude devDependencies from Deployment

When you deploy your Lambda function, only include production dependencies. Development dependencies (testing frameworks, linters, build tools) should never be deployed to Lambda.

**Why this matters:**
- Even 5 devDependencies can pull in hundreds of sub-dependencies
- Larger packages increase cold start time
- May exceed Lambda's code viewing limit in the console
- Introduces unnecessary security vulnerabilities
- Wastes storage and deployment time

### Deployment Methods

**Method 1: Set NODE_ENV to production**

In your CI/CD environment (GitHub Actions, AWS CodeBuild), set the NODE_ENV environment variable:

```bash
export NODE_ENV=production
npm install
```

This automatically excludes devDependencies.

**Method 2: Use npm install flags**

```bash
npm install --omit=dev
```

**Method 3: Install, test, then prune**

If you need to run tests during the build process:

```yaml
# buildspec.yml example
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: latest

  pre_build:
    commands:
      # Install all dependencies including dev for testing
      - npm install --include=dev
      
      # Run tests
      - npm test
      
      # Remove dev dependencies, keep only production
      - npm prune --omit=dev

  build:
    commands:
      - aws cloudformation package --template template.yml --s3-bucket $S3_ARTIFACTS_BUCKET --output-template template-export.yml
```

### Cache-Data Specific Considerations

The cache-data package has minimal production dependencies, which helps keep your Lambda package small. However, your application may add additional dependencies. Regularly audit your dependencies:

```bash
# Check production dependency tree
npm list --omit=dev --depth=0

# Check package size
du -sh node_modules/
```

### Additional Size Optimization Tips

1. **Avoid large dependencies**: Choose lightweight alternatives when possible
2. **Use Lambda Layers**: Move common dependencies to layers shared across functions
3. **Tree shaking**: Use modern bundlers (webpack, esbuild) to eliminate unused code
4. **Compress**: Lambda automatically decompresses .zip files, so compress your deployment package

### Target Package Size

- **Excellent**: < 5 MB (very fast cold starts)
- **Good**: 5-10 MB (acceptable cold starts)
- **Acceptable**: 10-25 MB (noticeable cold start delay)
- **Poor**: > 25 MB (significant cold start impact)

## Enable X-Ray and Lambda Insights for Monitoring

The cache-data package integrates seamlessly with AWS X-Ray and Lambda Insights, providing comprehensive monitoring and performance insights for your Lambda functions.

### AWS X-Ray Tracing

X-Ray provides distributed tracing across your application resources, showing how requests flow through API Gateway, Lambda, S3, DynamoDB, and external endpoints.

**Benefits for cache-data applications:**
- **Request flow visualization**: See the complete path of each request through your system
- **Performance bottlenecks**: Identify slow external endpoint calls or cache operations
- **Error tracking**: Pinpoint where failures occur in the request chain
- **Cache effectiveness**: Monitor cache hit/miss patterns and their impact on performance

**Enable X-Ray in cache-data:**

1. Enable tracing on your Lambda function and API Gateway
2. Set the environment variable in your Lambda configuration:
   ```yaml
   Environment:
     Variables:
       CACHE_DATA_AWS_X_RAY_ON: true
   ```
3. Grant X-Ray permissions to your Lambda execution role

When enabled, cache-data automatically instruments:
- Endpoint requests to external APIs
- S3 cache read/write operations
- DynamoDB cache operations
- AWS service calls (Parameter Store, Secrets Manager)

### Lambda Insights

Lambda Insights provides enhanced metrics and logs for your Lambda function, including:
- CPU and memory utilization
- Network performance
- Cold start frequency and duration
- Detailed execution metrics

**Enable Lambda Insights:**

Add the Lambda Insights layer to your function definition:

```yaml
# For x86 architecture
Layers:
  - !Sub "arn:aws:lambda:${AWS::Region}:580247275435:layer:LambdaInsightsExtension:21"

# For arm64 architecture
Layers:
  - !Sub "arn:aws:lambda:${AWS::Region}:580247275435:layer:LambdaInsightsExtension-Arm64:2"
```

Grant Lambda Insights permissions to your execution role (see CloudFormation example below).

### Cache-Data Logging Tools

In addition to X-Ray and Lambda Insights, cache-data provides built-in logging utilities:

**Timer class**: Measure execution time for specific operations
```javascript
const { tools } = require('@63klabs/cache-data');
const timer = new tools.Timer();

timer.start('apiCall');
const result = await endpoint.get(connection);
timer.stop('apiCall');

console.log(timer.report()); // Logs execution time
```

**DebugAndLog class**: Structured logging with configurable log levels
```javascript
const logger = new tools.DebugAndLog({ level: 5 });

logger.info('Processing request', { requestId: event.requestId });
logger.debug('Cache lookup', { key: cacheKey });
logger.error('API call failed', { error: err.message });
```

**Automatic request/response logging**: When using ClientRequest and Response objects, cache-data automatically logs request and response details that can be used in CloudWatch Dashboards.

For detailed information on logging tools, see [Features: Tools](../features/tools/README.md).

### Monitoring Best Practices

1. **Enable X-Ray in non-production first**: Test tracing overhead before enabling in production
2. **Use appropriate log levels**: Set LOG_LEVEL=0 in production, 2-5 in development
3. **Monitor cold start frequency**: High cold start rates may indicate need for provisioned concurrency
4. **Track cache hit rates**: Use X-Ray to monitor cache effectiveness
5. **Set up CloudWatch alarms**: Alert on error rates, duration, and throttling

## Cache-Data Specific Optimizations

Beyond general Lambda best practices, these optimizations are specific to cache-data usage patterns and can significantly improve performance.

### Optimize InMemoryCache Usage

The InMemoryCache provides microsecond-level cache access for frequently requested data. To maximize its effectiveness:

**1. Size appropriately**: InMemoryCache automatically sizes based on Lambda memory allocation. With 1024MB Lambda memory, you get ~5000 cache entries by default. Adjust if needed:

```javascript
const { InMemoryCache } = require('@63klabs/cache-data/src/lib/utils/InMemoryCache');

// Custom sizing
const cache = new InMemoryCache({ 
  maxEntries: 10000  // Override automatic calculation
});
```

**2. Cache hot data**: Store frequently accessed data in InMemoryCache for ultra-fast retrieval:
- User session data
- Configuration values
- Frequently requested API responses
- Authentication tokens

**3. Leverage container reuse**: InMemoryCache persists across warm invocations in the same container, providing cache hits without S3/DynamoDB access.

### Optimize Cache Strategy

Choose the right caching layer for your data:

**InMemoryCache (L0)**: Microsecond access, container-specific
- Best for: Hot data, session data, frequently accessed items
- Limitation: Not shared across containers, lost on cold start

**DynamoDB (L1)**: Millisecond access, shared across all invocations
- Best for: Shared cache, high read/write throughput, small items
- Limitation: 400KB item size limit, costs per request

**S3 (L2)**: Sub-second access, unlimited size, lowest cost
- Best for: Large responses, infrequently accessed data, long TTL items
- Limitation: Higher latency than DynamoDB

**Multi-tier strategy**: Use InMemoryCache → DynamoDB → S3 for optimal performance and cost.

### Optimize Endpoint Requests

**1. Use connection pooling**: Initialize connections outside the handler to reuse HTTP agents:

```javascript
// Outside handler - reuses connections across invocations
const connection = {
  host: 'api.example.com',
  path: '/data',
  options: {
    keepAlive: true,  // Reuse TCP connections
    timeout: 5000
  }
};

exports.handler = async (event) => {
  // Reuses connection from previous invocations
  const result = await endpoint.get(connection);
  return result;
};
```

**2. Set appropriate timeouts**: Prevent slow endpoints from blocking your function:

```javascript
const connection = {
  host: 'api.example.com',
  options: {
    timeout: 3000  // 3 second timeout
  }
};
```

**3. Implement circuit breakers**: For unreliable endpoints, implement retry logic with exponential backoff or circuit breaker patterns to fail fast.

### Optimize Cache Keys

Efficient cache key design improves cache hit rates and reduces storage:

**1. Use consistent key formats**: Standardize key generation across your application
```javascript
const cacheKey = `user:${userId}:profile:v1`;
```

**2. Include version in keys**: Allow cache invalidation by version bump
```javascript
const cacheKey = `api:${endpoint}:${hashParams}:v2`;
```

**3. Hash large keys**: Keep keys under 256 characters for DynamoDB efficiency
```javascript
const { tools } = require('@63klabs/cache-data');
const cacheKey = tools.hashThisData(largeKeyData);
```

### Optimize TTL Settings

Set cache TTL based on data volatility:

- **Static data**: 24 hours or more (configuration, reference data)
- **Semi-static data**: 1-6 hours (user profiles, product catalogs)
- **Dynamic data**: 5-30 minutes (real-time prices, inventory)
- **Volatile data**: 1-5 minutes or no cache (live sports scores, stock tickers)

Longer TTLs reduce endpoint calls and Lambda execution time, but may serve stale data.

### Monitor and Tune

Use CloudWatch metrics and X-Ray to identify optimization opportunities:

1. **Track cache hit rates**: Low hit rates may indicate poor key design or TTL settings
2. **Monitor endpoint latency**: Slow endpoints benefit most from caching
3. **Analyze cold start frequency**: High frequency may justify provisioned concurrency
4. **Review memory utilization**: Underutilized memory is wasted cost; over-utilized causes throttling

## CloudFormation Template Example

Below is an example CloudFormation template demonstrating key Lambda optimization settings for cache-data applications. This includes memory allocation, architecture, X-Ray tracing, Lambda Insights, and proper IAM permissions.

### Key Configuration Elements

1. **Memory allocation**: 1024MB for optimal performance
2. **Architecture**: arm64 for better performance and cost
3. **X-Ray tracing**: Enabled on API Gateway and Lambda
4. **Lambda Insights**: Layer included for enhanced monitoring
5. **Environment variables**: CACHE_DATA_AWS_X_RAY_ON enabled
6. **IAM permissions**: Grants for Lambda Insights and X-Ray

### Template Example

```yaml
# template.yml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
  
  LambdaInsightsLayerArn:
    Type: String
    Description: Lambda Insights Layer ARN for arm64
    Default: arn:aws:lambda:us-east-1:580247275435:layer:LambdaInsightsExtension-Arm64:2

Resources:

  # API Gateway with X-Ray tracing enabled
  WebApi:
    Type: AWS::Serverless::Api
    Properties:
      Name: !Sub '${AWS::StackName}-api'
      StageName: !Ref Environment
      TracingEnabled: true  # Enable X-Ray tracing
      Cors:
        AllowOrigin: "'*'"
        AllowHeaders: "'*'"
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"

  # Lambda Function with optimizations
  AppFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub '${AWS::StackName}-function'
      Handler: src/index.handler
      Runtime: nodejs20.x
      
      # Optimization settings
      MemorySize: 1024  # Recommended for cache-data
      Timeout: 30
      Architectures:
        - arm64  # Use Graviton processor
      
      # Enable X-Ray tracing
      Tracing: Active
      
      # Lambda Insights layer for monitoring
      Layers:
        - !Ref LambdaInsightsLayerArn
      
      # Environment variables
      Environment:
        Variables:
          NODE_ENV: production
          LOG_LEVEL: !If [IsProd, 0, 5]  # 0 for prod, 5 for dev
          CACHE_DATA_AWS_X_RAY_ON: true  # Enable X-Ray in cache-data
          CACHE_BUCKET: !Ref CacheBucket
          CACHE_TABLE: !Ref CacheTable
      
      # IAM role
      Role: !GetAtt LambdaExecutionRole.Arn
      
      # API Gateway event
      Events:
        ApiEvent:
          Type: Api
          Properties:
            RestApiId: !Ref WebApi
            Path: /{proxy+}
            Method: ANY

  # S3 bucket for cache storage
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '${AWS::StackName}-cache-${AWS::AccountId}'
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldCache
            Status: Enabled
            ExpirationInDays: 7  # Auto-delete old cache files

  # DynamoDB table for cache metadata
  CacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub '${AWS::StackName}-cache'
      BillingMode: PAY_PER_REQUEST  # On-demand pricing
      AttributeDefinitions:
        - AttributeName: cacheKey
          AttributeType: S
      KeySchema:
        - AttributeName: cacheKey
          KeyType: HASH
      TimeToLiveSpecification:
        Enabled: true
        AttributeName: ttl  # Auto-delete expired items

  # Lambda execution role with necessary permissions
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub '${AWS::StackName}-lambda-role'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      
      # Managed policies for monitoring
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        - arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy  # Lambda Insights
        - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess  # X-Ray tracing
      
      # Inline policies for cache-data resources
      Policies:
        - PolicyName: CacheDataAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              # S3 cache access
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                  - s3:DeleteObject
                Resource: !Sub '${CacheBucket.Arn}/*'
              
              # DynamoDB cache access
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:Scan
                Resource: !GetAtt CacheTable.Arn
              
              # SSM Parameter Store access (for configuration)
              - Effect: Allow
                Action:
                  - ssm:GetParameter
                  - ssm:GetParameters
                  - ssm:GetParametersByPath
                Resource: !Sub 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${AWS::StackName}/*'
              
              # Secrets Manager access (optional)
              - Effect: Allow
                Action:
                  - secretsmanager:GetSecretValue
                Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${AWS::StackName}/*'

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Outputs:
  ApiUrl:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${WebApi}.execute-api.${AWS::Region}.amazonaws.com/${Environment}'
  
  FunctionArn:
    Description: Lambda function ARN
    Value: !GetAtt AppFunction.Arn
  
  CacheBucketName:
    Description: S3 cache bucket name
    Value: !Ref CacheBucket
  
  CacheTableName:
    Description: DynamoDB cache table name
    Value: !Ref CacheTable
```

### Additional Optimization Settings

**Provisioned Concurrency** (for high-traffic applications):
```yaml
AppFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... other properties
    ProvisionedConcurrencyConfig:
      ProvisionedConcurrentExecutions: 5  # Keep 5 instances warm
```

**Reserved Concurrent Executions** (to prevent throttling other functions):
```yaml
AppFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... other properties
    ReservedConcurrentExecutions: 100  # Limit to 100 concurrent executions
```

### Complete Examples

For more complete examples:
- [Complete Lambda function template](../00-example-implementation/example-template-lambda-function.yml)
- [S3 and DynamoDB cache store template](../00-example-implementation/example-template-s3-and-dynamodb-cache-store.yml)
- [Full application starter templates](https://github.com/63Klabs) - Production-ready templates implementing cache-data as an API web service

## Summary

Optimizing Lambda functions for cache-data involves:

1. **Memory**: Allocate 512MB-1024MB for optimal network and CPU performance
2. **Architecture**: Use arm64 for better performance and lower cost
3. **Initialization**: Move cache-data setup outside the handler to minimize cold start impact
4. **Async operations**: Leverage parallel requests to reduce execution time
5. **Package size**: Exclude devDependencies to speed up cold starts
6. **Monitoring**: Enable X-Ray and Lambda Insights to track performance
7. **Cache strategy**: Use InMemoryCache for hot data, DynamoDB for shared cache, S3 for large items
8. **Connection pooling**: Reuse HTTP connections across invocations

Following these practices will help you achieve fast, cost-effective Lambda functions with cache-data.