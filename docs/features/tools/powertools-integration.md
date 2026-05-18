# AWS Lambda Powertools Integration

## Overview

Starting with v1.3.15, @63klabs/cache-data integrates with [AWS Lambda Powertools for TypeScript](https://docs.powertools.aws.dev/lambda/typescript/latest/) to provide structured JSON logging, enhanced X-Ray tracing with custom subsegments, and CloudWatch EMF metrics. The integration is completely transparent and opt-in — existing users are unaffected unless they install Powertools packages.

The easiest way to enable Powertools is to add the AWS Lambda Powertools Layer to your function or install the packages as dependencies. Once detected, @63klabs/cache-data automatically uses Powertools as the backend for its existing logging, tracing, and metrics capabilities.

## Installation

### Option 1: AWS Lambda Powertools Layer (recommended)

Add the Powertools Lambda Layer to your function. This is the simplest approach — no code changes or dependency management required.

```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: my-function
      Runtime: nodejs24.x
      Handler: index.handler
      Layers:
        - !Sub arn:aws:lambda:${AWS::Region}:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:22
```

That's it. When your function starts, @63klabs/cache-data detects the Powertools packages from the layer and enables structured logging, tracing, and metrics automatically.

### Option 2: Install as dependencies

```bash
npm install @aws-lambda-powertools/tracer @aws-lambda-powertools/logger @aws-lambda-powertools/metrics
```

You can install all three or any subset. Each capability works independently.

### Option 3: Install a subset

Only want structured logging? Install just the logger:

```bash
npm install @aws-lambda-powertools/logger
```

Only want metrics? Install just metrics:

```bash
npm install @aws-lambda-powertools/metrics
```

## What you get

Once Powertools packages are available, @63klabs/cache-data automatically provides:

| Capability | What it does | Requires |
|-----------|-------------|----------|
| Structured Logging | JSON log output with Lambda context, trace IDs, and log levels | @aws-lambda-powertools/logger |
| Enhanced Tracing | Custom X-Ray subsegments for cache-read, cache-write, and endpoint-request operations | @aws-lambda-powertools/tracer |
| CloudWatch Metrics | EMF metrics for cache hits/misses, latency, endpoint errors, and cold starts | @aws-lambda-powertools/metrics |

## Quick start

No code changes are needed. Install the packages (or add the layer) and your existing @63klabs/cache-data usage gains observability features:

```javascript
const { tools, cache, endpoint } = require("@63klabs/cache-data");

// Your existing code works exactly the same
// But now produces structured JSON logs, X-Ray subsegments, and CloudWatch metrics
const response = await endpoint.send({
  host: "api.example.com",
  path: "/data"
});
```

### Recommended environment variables

Set these in your Lambda function configuration for best results:

```yaml
Environment:
  Variables:
    POWERTOOLS_SERVICE_NAME: my-service
    POWERTOOLS_METRICS_NAMESPACE: MyApplication
```

## Configuration

### Environment variables

Control Powertools integration via environment variables. No code changes needed.

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `CACHE_DATA_POWERTOOLS` | `0`, `false`, `no` to disable | unset (auto-detect) | Master switch for all Powertools features |
| `CACHE_DATA_POWERTOOLS_TRACER` | `0`, `false`, `no` to disable | unset (auto-detect) | Individual tracer control |
| `CACHE_DATA_POWERTOOLS_LOGGER` | `0`, `false`, `no` to disable | unset (auto-detect) | Individual logger control |
| `CACHE_DATA_POWERTOOLS_METRICS` | `0`, `false`, `no` to disable | unset (auto-detect) | Individual metrics control |
| `POWERTOOLS_SERVICE_NAME` | any string | `@63klabs/cache-data` | Service name for logs and metrics |
| `POWERTOOLS_METRICS_NAMESPACE` | any string | service name | CloudWatch metrics namespace |

### Disabling specific capabilities

Disable individual capabilities while keeping others active:

```yaml
Environment:
  Variables:
    CACHE_DATA_POWERTOOLS_METRICS: "false"  # Disable metrics only
    # Tracer and Logger remain active
```

### Disabling all Powertools features

```yaml
Environment:
  Variables:
    CACHE_DATA_POWERTOOLS: "false"  # Disable everything
```

## Structured logging

When @aws-lambda-powertools/logger is available, all DebugAndLog output becomes structured JSON:

### Before (plain text)

```
INFO  Cache hit for key abc123
ERROR Request failed: Connection timeout
```

### After (structured JSON)

```json
{
  "level": "INFO",
  "message": "Cache hit for key abc123",
  "service": "my-service",
  "timestamp": "2026-05-20T14:30:00.000Z",
  "xray_trace_id": "Root=1-abc123-def456;Parent=ghi789;Sampled=1"
}
```

```json
{
  "level": "ERROR",
  "message": "Request failed: Connection timeout",
  "service": "my-service",
  "timestamp": "2026-05-20T14:30:01.000Z",
  "details": { "statusCode": 500, "url": "/api/data" },
  "xray_trace_id": "Root=1-abc123-def456;Parent=ghi789;Sampled=1"
}
```

### Log level mapping

DebugAndLog levels map to Powertools Logger levels:

| DebugAndLog Level | Powertools Level |
|-------------------|-----------------|
| ERROR | error |
| WARN | warn |
| INFO | info |
| MSG | info |
| DIAG | debug |
| DEBUG | debug |

Existing log level filtering is preserved. The same messages are suppressed or emitted regardless of whether Powertools Logger is active.

## Enhanced tracing

When @aws-lambda-powertools/tracer is available, @63klabs/cache-data creates custom X-Ray subsegments for key operations:

- **cache-read** — Wraps cache read operations (DynamoDB/S3 lookups)
- **cache-write** — Wraps cache write operations
- **endpoint-request** — Wraps outbound HTTP requests

These subsegments appear in your X-Ray traces alongside the automatic AWS SDK call tracing that Powertools provides.

### Tracer precedence

If you previously used `CacheData_AWSXRayOn=true` for raw X-Ray integration, Powertools Tracer takes over seamlessly:

| Scenario | Provider selected |
|----------|-----------------|
| Powertools Tracer installed and enabled | PowertoolsTracerProvider |
| Powertools Tracer disabled, `CacheData_AWSXRayOn=true` | RawXRayProvider (existing behavior) |
| Neither available | No tracing |

No double-instrumentation occurs. Powertools Tracer replaces raw X-Ray when available.

## CloudWatch metrics

When @aws-lambda-powertools/metrics is available, @63klabs/cache-data emits CloudWatch metrics using Embedded Metric Format (EMF). Metrics are written to stdout as structured JSON — no CloudWatch API calls are made.

### Emitted metrics

| Metric | Unit | When emitted | Operation dimension |
|--------|------|-------------|-------------------|
| CacheHit | Count | Cache read finds data | cache-read |
| CacheMiss | Count | Cache read finds no data | cache-read |
| ReadLatency | Milliseconds | Every cache read | cache-read |
| WriteLatency | Milliseconds | Every cache write | cache-write |
| EndpointLatency | Milliseconds | Every endpoint request | endpoint-request |
| EndpointError | Count | Endpoint returns status >= 400 | endpoint-request |
| ColdStart | Count | First invocation of Lambda instance | endpoint-request |

### Viewing metrics in CloudWatch

Metrics appear in CloudWatch under the namespace you configure (default: your service name). Filter by the `operation` dimension to see cache vs endpoint performance:

```
Namespace: MyApplication
Dimensions: operation = cache-read
Metrics: CacheHit, CacheMiss, ReadLatency
```

### Automatic flush

Metrics are automatically flushed when `Response.finalize()` is called (the standard end-of-invocation method). For handlers that don't use the Response class, call `flushMetrics()` manually:

```javascript
const { tools } = require("@63klabs/cache-data");

exports.handler = async (event) => {
  // ... your handler logic ...

  tools.flushMetrics();
  return result;
};
```

## Programmatic access

Query the Powertools state programmatically:

```javascript
const { tools } = require("@63klabs/cache-data");

const state = tools.PowertoolsInit.getState();
console.log(state);
// { tracer: true, logger: true, metrics: false }
```

## CloudFormation example

Complete SAM template with Powertools enabled:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-handler
      Runtime: nodejs24.x
      Handler: index.handler
      Tracing: Active
      Layers:
        - !Sub arn:aws:lambda:${AWS::Region}:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:22
      Environment:
        Variables:
          POWERTOOLS_SERVICE_NAME: !Sub ${AWS::StackName}
          POWERTOOLS_METRICS_NAMESPACE: !Sub ${AWS::StackName}
          LOG_LEVEL: info
```

## Backwards compatibility

This integration is fully backwards-compatible:

- No new required dependencies added
- All existing exports, function signatures, and behaviors are unchanged
- When no Powertools packages are installed, the package behaves identically to v1.3.14
- Existing `CacheData_AWSXRayOn` environment variable still works
- All deprecated aliases remain available

## Troubleshooting

### Powertools not detected

Verify the packages are importable in your Lambda environment:

```javascript
try {
  require("@aws-lambda-powertools/logger");
  console.log("Logger available");
} catch {
  console.log("Logger not available");
}
```

### Disable Powertools temporarily

Set `CACHE_DATA_POWERTOOLS=false` in your environment variables to disable all Powertools features without removing the packages.

### Check which capabilities are active

```javascript
const { tools } = require("@63klabs/cache-data");
console.log(tools.PowertoolsInit.getState());
```

### Metrics not appearing in CloudWatch

- Verify `@aws-lambda-powertools/metrics` is installed
- Check that `CACHE_DATA_POWERTOOLS_METRICS` is not set to `false`
- Ensure `POWERTOOLS_METRICS_NAMESPACE` is a valid CloudWatch namespace (1-256 chars, alphanumeric/hyphens/underscores/periods/slashes)
- Confirm `Response.finalize()` or `tools.flushMetrics()` is called at the end of your handler

## Related documentation

- [ApiRequest X-Ray Tracking](./api-request-xray.md) — Existing X-Ray integration for API requests
- [AWS Lambda Powertools for TypeScript](https://docs.powertools.aws.dev/lambda/typescript/latest/) — Official Powertools documentation
- [CloudWatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html) — EMF specification
