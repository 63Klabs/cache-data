# APIRequest X-Ray Tracking Guide

## Overview

The APIRequest class provides enhanced AWS X-Ray tracing for monitoring and debugging API requests in Lambda functions. X-Ray subsegments track individual API calls with detailed metadata about retries, pagination, and request/response information, enabling comprehensive observability of external API interactions.

## What is AWS X-Ray?

AWS X-Ray is a distributed tracing service that helps you analyze and debug distributed applications. It provides:

- **Request tracing**: Track requests as they flow through your application
- **Performance analysis**: Identify bottlenecks and latency issues
- **Error detection**: Quickly identify and diagnose errors
- **Service maps**: Visualize application architecture and dependencies
- **Subsegments**: Track individual operations within a request

## X-Ray in APIRequest

APIRequest automatically creates X-Ray subsegments for each API request when running in a Lambda environment with X-Ray enabled. These subsegments include:

- **Unique naming**: Each request gets a unique subsegment name
- **Request metadata**: Method, host, path, and custom notes
- **Response metadata**: Status code and timing information
- **Retry tracking**: Number of retry attempts and outcomes
- **Pagination tracking**: Number of pages and items retrieved
- **Timing information**: Duration of the complete request including retries and pagination

## Basic Usage

### Automatic X-Ray Tracking

X-Ray tracking is automatic when your Lambda function has X-Ray enabled:

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch user data'  // Appears in X-Ray subsegment
});

const response = await request.send();

// X-Ray subsegment automatically created with:
// - Unique name: APIRequest/api.example.com/1234567890
// - Annotations: method, host, path, note, status code
// - Timing: Request duration
```

### Enabling X-Ray in Lambda

Enable X-Ray tracing in your CloudFormation template:

```yaml
Resources:
  MyFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: my-function
      Runtime: nodejs20.x
      Handler: index.handler
      TracingConfig:
        Mode: Active  # Enable X-Ray tracing
      # ... other properties
```

Or using AWS SAM:

```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: my-function
      Runtime: nodejs20.x
      Handler: index.handler
      Tracing: Active  # Enable X-Ray tracing
      # ... other properties
```

## Subsegment Naming

### Unique Subsegment Names

Each APIRequest creates a unique subsegment name to distinguish multiple requests to the same endpoint:

```javascript
const request1 = new tools.APIRequest({
  host: 'api.example.com',
  path: '/users'
});

const request2 = new tools.APIRequest({
  host: 'api.example.com',
  path: '/users'
});

await request1.send();  // Subsegment: APIRequest/api.example.com/1234567890
await request2.send();  // Subsegment: APIRequest/api.example.com/1234567891

// Different timestamps ensure unique names
```

### Subsegment Name Format

```
APIRequest/{host}/{timestamp}
```

Example: `APIRequest/api.example.com/1705234567890`

This ensures that:
- Multiple requests to the same endpoint are tracked separately
- Requests can be correlated by timestamp
- X-Ray service map shows all API dependencies

## Annotations

Annotations are indexed fields that can be used to filter and search traces in X-Ray.

### Standard Annotations

Every APIRequest subsegment includes these annotations:

```javascript
const request = new tools.APIRequest({
  method: 'GET',
  host: 'api.example.com',
  path: '/users',
  note: 'Fetch all users'
});

const response = await request.send();

// X-Ray annotations:
// - request_method: "GET"
// - request_host: "api.example.com"
// - request_uri: "https://api.example.com/users"
// - request_note: "Fetch all users"
// - response_status: 200
```

### Retry Annotations

When retries occur, additional annotations are added:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// If retries occurred:
// - retry_attempts: 3  (total attempts made)
```

### Pagination Annotations

When pagination occurs, additional annotations are added:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// If pagination occurred:
// - pagination_pages: 5   (total pages retrieved)
// - pagination_items: 523 (total items returned)
```

### Searching by Annotations

Use annotations to filter traces in X-Ray console:

```
annotation.request_host = "api.example.com"
annotation.response_status >= 500
annotation.retry_attempts > 1
annotation.pagination_pages > 10
```

## Metadata

Metadata provides detailed information about the request but is not indexed for searching.

### Configuration Metadata

When retry or pagination is enabled, configuration is stored in metadata:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  retry: {
    enabled: true,
    maxRetries: 3,
    retryOn: {
      serverError: true,
      clientError: false
    }
  },
  pagination: {
    enabled: true,
    batchSize: 10
  }
});

const response = await request.send();

// X-Ray metadata includes:
// - retry_config: { enabled: true, maxRetries: 3, retryOn: {...} }
// - pagination_config: { enabled: true, batchSize: 10, ... }
```

### Retry Metadata

Detailed retry information is stored in metadata:

```javascript
// X-Ray metadata when retries occur:
// - retry_details: {
//     occurred: true,
//     attempts: 3,
//     finalAttempt: 3
//   }
```

### Pagination Metadata

Detailed pagination information is stored in metadata:

```javascript
// X-Ray metadata when pagination occurs:
// - pagination_details: {
//     occurred: true,
//     totalPages: 5,
//     totalItems: 523,
//     incomplete: false,
//     error: null
//   }
```

## Examples

### Example 1: Basic X-Ray Tracking

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/users',
  note: 'Fetch users for dashboard'
});

const response = await request.send();

// X-Ray subsegment created with:
// Name: APIRequest/api.example.com/1705234567890
// Annotations:
//   - request_method: GET
//   - request_host: api.example.com
//   - request_uri: https://api.example.com/users
//   - request_note: Fetch users for dashboard
//   - response_status: 200
// Duration: 245ms
```

### Example 2: X-Ray with Retry Tracking

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch analytics data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// If retries occurred, X-Ray subsegment includes:
// Annotations:
//   - retry_attempts: 3
// Metadata:
//   - retry_config: { enabled: true, maxRetries: 2, ... }
//   - retry_details: { occurred: true, attempts: 3, finalAttempt: 3 }
```

### Example 3: X-Ray with Pagination Tracking

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/orders',
  note: 'Fetch all orders',
  pagination: {
    enabled: true,
    batchSize: 5
  }
});

const response = await request.send();

// If pagination occurred, X-Ray subsegment includes:
// Annotations:
//   - pagination_pages: 8
//   - pagination_items: 1523
// Metadata:
//   - pagination_config: { enabled: true, batchSize: 5, ... }
//   - pagination_details: { occurred: true, totalPages: 8, totalItems: 1523, ... }
```

### Example 4: X-Ray with Retry + Pagination

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/logs',
  note: 'Fetch application logs',
  retry: {
    enabled: true,
    maxRetries: 2
  },
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// X-Ray subsegment includes both retry and pagination tracking:
// Annotations:
//   - retry_attempts: 2 (if retries occurred)
//   - pagination_pages: 12 (if pagination occurred)
//   - pagination_items: 2341
// Metadata:
//   - retry_config: {...}
//   - retry_details: {...}
//   - pagination_config: {...}
//   - pagination_details: {...}
```

### Example 5: Multiple Requests with Unique Subsegments

```javascript
// Make multiple requests to the same endpoint
const requests = [
  { path: '/users', note: 'Fetch users' },
  { path: '/users', note: 'Fetch users again' },
  { path: '/users', note: 'Fetch users third time' }
];

for (const config of requests) {
  const request = new tools.APIRequest({
    host: 'api.example.com',
    ...config
  });
  
  await request.send();
}

// X-Ray creates three unique subsegments:
// 1. APIRequest/api.example.com/1705234567890
// 2. APIRequest/api.example.com/1705234567891
// 3. APIRequest/api.example.com/1705234567892

// Each can be traced independently in X-Ray console
```

## Viewing X-Ray Traces

### X-Ray Console

1. Open AWS X-Ray console
2. Navigate to "Traces"
3. Filter by service name (your Lambda function)
4. Click on a trace to see details
5. Expand subsegments to see APIRequest details

### Filtering Traces

Use the X-Ray filter expression syntax:

```
# Find traces with API errors
annotation.response_status >= 400

# Find traces with retries
annotation.retry_attempts > 1

# Find traces with pagination
annotation.pagination_pages > 1

# Find traces to specific host
annotation.request_host = "api.example.com"

# Find slow requests
duration > 1000

# Combine filters
annotation.request_host = "api.example.com" AND annotation.response_status >= 500
```

### Service Map

The X-Ray service map shows:
- Your Lambda function
- External API dependencies (from APIRequest subsegments)
- Request volume and error rates
- Average latency

## Subsegments for Paginated Requests

When pagination occurs, each page request creates its own subsegment:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch all data',
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// X-Ray trace structure:
// └─ APIRequest/api.example.com/1705234567890 (main request)
//    ├─ APIRequest/api.example.com/1705234567891 [Offset 200]
//    ├─ APIRequest/api.example.com/1705234567892 [Offset 400]
//    ├─ APIRequest/api.example.com/1705234567893 [Offset 600]
//    └─ APIRequest/api.example.com/1705234567894 [Offset 800]

// Each subsegment includes:
// - Unique timestamp
// - Offset in note
// - Individual timing
```

This allows you to:
- See timing for each page request
- Identify slow pages
- Track errors on specific pages
- Understand pagination performance

## Performance Analysis

### Identifying Slow Requests

Use X-Ray to identify slow API requests:

```
# Find requests taking > 1 second
duration > 1000

# Find requests with many retries
annotation.retry_attempts > 2

# Find requests with many pages
annotation.pagination_pages > 10
```

### Analyzing Retry Impact

Compare request duration with and without retries:

```javascript
// Request without retries: 250ms
// Request with 2 retries: 750ms (250ms × 3 attempts)

// X-Ray shows:
// - Total duration: 750ms
// - Retry attempts: 3
// - Each attempt visible in timeline
```

### Analyzing Pagination Impact

Compare request duration with and without pagination:

```javascript
// Single page request: 200ms
// Paginated request (5 pages): 1000ms (200ms × 5 pages)

// X-Ray shows:
// - Total duration: 1000ms
// - Pagination pages: 5
// - Each page request visible as subsegment
```

## Troubleshooting with X-Ray

### Debugging Failed Requests

When a request fails, X-Ray provides:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch data',
  retry: {
    enabled: true,
    maxRetries: 2
  }
});

const response = await request.send();

// If request fails after retries, X-Ray shows:
// - response_status: 503
// - retry_attempts: 3
// - retry_details: { occurred: true, attempts: 3, finalAttempt: 3 }
// - Error flag on subsegment
// - Duration of all attempts
```

### Debugging Incomplete Pagination

When pagination fails partway through:

```javascript
const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  pagination: {
    enabled: true
  }
});

const response = await request.send();

// If pagination fails, X-Ray shows:
// - pagination_pages: 3 (pages retrieved before error)
// - pagination_details: { incomplete: true, error: "Network error on page 4" }
// - Subsegments for successful pages
// - Error on failed page subsegment
```

### Identifying Bottlenecks

Use X-Ray timeline to identify bottlenecks:

```
1. Open trace in X-Ray console
2. View timeline of subsegments
3. Identify longest-running subsegments
4. Check if retries or pagination are causing delays
5. Optimize based on findings
```

## Best Practices

1. **Use descriptive notes**: Include meaningful information in the `note` field
2. **Enable X-Ray in production**: Get visibility into production API behavior
3. **Monitor retry rates**: High retry rates indicate API reliability issues
4. **Monitor pagination performance**: Large page counts may indicate inefficient queries
5. **Set up X-Ray alarms**: Alert on high error rates or slow requests
6. **Use X-Ray sampling**: Configure sampling rules to control costs
7. **Correlate with CloudWatch**: Use X-Ray trace IDs in CloudWatch logs
8. **Review service map regularly**: Understand API dependencies
9. **Filter by annotations**: Use annotations to find specific request types
10. **Analyze trends over time**: Track API performance trends

## X-Ray Sampling

Control X-Ray sampling to manage costs:

```yaml
# In CloudFormation template
Resources:
  MySamplingRule:
    Type: AWS::XRay::SamplingRule
    Properties:
      RuleName: APIRequestSampling
      Priority: 1000
      Version: 1
      ReservoirSize: 1
      FixedRate: 0.05  # Sample 5% of requests
      URLPath: "*"
      Host: "*"
      HTTPMethod: "*"
      ServiceType: "*"
      ServiceName: "*"
      ResourceARN: "*"
```

## X-Ray and CloudWatch Integration

Correlate X-Ray traces with CloudWatch logs:

```javascript
const { tools } = require('@63klabs/cache-data');

const request = new tools.APIRequest({
  host: 'api.example.com',
  path: '/data',
  note: 'Fetch data'
});

// Log before request
tools.DebugAndLog.info('Making API request', {
  host: request.getHost(),
  path: request.getPath()
});

const response = await request.send();

// Log after request with metadata
tools.DebugAndLog.info('API request completed', {
  statusCode: response.statusCode,
  retries: response.metadata?.retries?.attempts,
  pagination: response.metadata?.pagination?.totalPages
});

// CloudWatch logs will include X-Ray trace ID
// Use trace ID to find corresponding X-Ray trace
```

## X-Ray Costs

X-Ray pricing is based on:
- **Traces recorded**: $5.00 per 1 million traces recorded
- **Traces retrieved**: $0.50 per 1 million traces retrieved
- **Traces scanned**: $0.50 per 1 million traces scanned

**Cost optimization:**
- Use sampling rules to reduce trace volume
- Set appropriate retention periods
- Use filters to reduce trace retrieval
- Monitor X-Ray usage in AWS Cost Explorer

## Limitations

1. **X-Ray not available locally**: X-Ray subsegments are only created in Lambda environments
2. **Sampling may skip traces**: Not all requests are traced (configurable)
3. **Retention period**: Traces are retained for 30 days by default
4. **Annotation limits**: Maximum 50 annotations per subsegment
5. **Metadata size**: Maximum 64 KB per subsegment

## Related Documentation

- [APIRequest Pagination Guide](./api-request-pagination.md) - Automatic pagination functionality
- [APIRequest Retry Guide](./api-request-retry.md) - Automatic retry functionality
- [Tools Module](./README.md) - Complete tools documentation
- [AWS X-Ray Documentation](https://docs.aws.amazon.com/xray/) - Official AWS X-Ray docs
- [X-Ray SDK for Node.js](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-nodejs.html) - X-Ray SDK documentation
