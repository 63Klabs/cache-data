# Requirements Document

## Introduction

This document defines the requirements for integrating AWS Lambda Powertools for TypeScript into the @63klabs/cache-data NPM package (v1.3.15). The integration uses Powertools as a backend for the existing public API (Option A), providing structured logging, enhanced tracing, and CloudWatch EMF metrics without breaking changes. Existing users are completely unaffected unless they opt in by installing Powertools packages as optional peer dependencies.

GitHub Issue Reference: #228

## Glossary

- **Cache_Data_Package**: The @63klabs/cache-data NPM package providing distributed caching, endpoint requests, and utility tools for AWS Lambda Node.js applications
- **Powertools**: AWS Lambda Powertools for TypeScript (v2.x), a suite of utilities for structured logging, tracing, and metrics in Lambda functions
- **Tracer**: The @aws-lambda-powertools/tracer package that wraps aws-xray-sdk-core to provide enhanced X-Ray tracing with custom subsegments, annotations, and metadata
- **Logger**: The @aws-lambda-powertools/logger package that provides structured JSON logging with Lambda context enrichment and correlation IDs
- **Metrics**: The @aws-lambda-powertools/metrics package that emits CloudWatch metrics using Embedded Metric Format (EMF) via stdout without API calls
- **TracingProvider**: An internal interface abstraction that allows either raw X-Ray or Powertools Tracer to provide tracing capabilities without code duplication
- **DebugAndLog**: The existing static logging class in Cache_Data_Package that outputs plain text log entries at six severity levels (ERROR, WARN, INFO, MSG, DIAG, DEBUG)
- **AWS_XRay**: The existing X-Ray integration in Cache_Data_Package that instruments AWS SDK clients and HTTP requests via environment variable opt-in
- **EMF**: CloudWatch Embedded Metric Format, a JSON specification that allows publishing metrics by writing structured JSON to stdout
- **Auto_Detection**: The mechanism by which Cache_Data_Package determines whether a Powertools package is available by attempting to import it at module load time
- **Cold_Start**: The first invocation of a Lambda function instance where initialization code runs, resulting in higher latency

## Requirements

### Requirement 1: Powertools Package Auto-Detection

**User Story:** As a developer using @63klabs/cache-data, I want the package to automatically detect installed Powertools packages, so that I get enhanced observability without changing my application code.

#### Acceptance Criteria

1. WHEN the Cache_Data_Package module loads, THE Auto_Detection mechanism SHALL attempt to import each Powertools package (@aws-lambda-powertools/tracer, @aws-lambda-powertools/logger, @aws-lambda-powertools/metrics) independently, such that a failed import of one package does not prevent detection of the remaining packages
2. IF a Powertools package import fails, THEN THE Auto_Detection mechanism SHALL set that individual capability to disabled, log no error output, and continue detection of remaining packages
3. THE Auto_Detection mechanism SHALL complete without throwing exceptions regardless of which combination of Powertools packages are installed (none, any subset, or all three)
4. WHEN no Powertools packages are installed, THE Cache_Data_Package SHALL behave identically to version 1.3.14 in terms of public API signatures, exported names, environment variable behaviors, and log output
5. WHEN Auto_Detection completes, THE Cache_Data_Package SHALL expose a queryable state indicating which capabilities (tracer, logger, metrics) are enabled or disabled, so that detection results are programmatically verifiable
6. THE Auto_Detection mechanism SHALL add no more than 200 milliseconds of latency to the module load time when no Powertools packages are installed

### Requirement 2: Environment Variable Configuration

**User Story:** As a developer, I want to control Powertools integration via environment variables, so that I can enable or disable specific capabilities without code changes.

#### Acceptance Criteria

1. THE Cache_Data_Package SHALL read the environment variable `CACHE_DATA_POWERTOOLS` at module load time to enable or disable all Powertools features, where the values "0", "false", and "no" (case-insensitive) are treated as disabled, the values "1", "true", and "yes" (case-insensitive) are treated as enabled, and an unset or empty string is treated as unset
2. THE Cache_Data_Package SHALL read the environment variable `CACHE_DATA_POWERTOOLS_TRACER` at module load time to enable or disable Tracer independently, using the same truthy/falsy value definitions as `CACHE_DATA_POWERTOOLS`
3. THE Cache_Data_Package SHALL read the environment variable `CACHE_DATA_POWERTOOLS_LOGGER` at module load time to enable or disable Logger independently, using the same truthy/falsy value definitions as `CACHE_DATA_POWERTOOLS`
4. THE Cache_Data_Package SHALL read the environment variable `CACHE_DATA_POWERTOOLS_METRICS` at module load time to enable or disable Metrics independently, using the same truthy/falsy value definitions as `CACHE_DATA_POWERTOOLS`
5. WHEN a Powertools package is importable and neither `CACHE_DATA_POWERTOOLS` nor the corresponding individual environment variable is set to a disabled value, THE Auto_Detection mechanism SHALL enable that capability automatically
6. WHEN `CACHE_DATA_POWERTOOLS` is set to a disabled value, THE Cache_Data_Package SHALL disable all Powertools features regardless of package availability or individual environment variable values
7. WHEN `CACHE_DATA_POWERTOOLS` is unset or set to an enabled value and an individual capability variable is set to a disabled value, THE Cache_Data_Package SHALL disable only that specific capability while leaving other capabilities unaffected
8. IF an environment variable is set to a value that is not recognized as enabled, disabled, or empty, THEN THE Cache_Data_Package SHALL treat that value as enabled

### Requirement 3: TracingProvider Interface

**User Story:** As a maintainer, I want a TracingProvider abstraction, so that tracing logic is not duplicated between raw X-Ray and Powertools Tracer implementations.

#### Acceptance Criteria

1. THE Cache_Data_Package SHALL define a TracingProvider interface with a method that accepts an AWS SDK v3 client instance and returns an instrumented client instance
2. THE Cache_Data_Package SHALL define a TracingProvider interface with a method that enables tracing on the Node.js http and https modules to record outbound requests as trace subsegments
3. THE Cache_Data_Package SHALL implement a RawXRayProvider that uses aws-xray-sdk-core directly
4. THE Cache_Data_Package SHALL implement a PowertoolsTracerProvider that uses @aws-lambda-powertools/tracer
5. THE TracingProvider interface SHALL expose a method to open a named subsegment and a method to close the current subsegment for cache and endpoint operations
6. THE RawXRayProvider and PowertoolsTracerProvider SHALL both implement all methods defined by the TracingProvider interface such that consuming code can use either implementation interchangeably
7. IF a TracingProvider method encounters an error during instrumentation or subsegment operations, THEN THE TracingProvider SHALL log a warning and return gracefully without throwing an exception

### Requirement 4: Tracer Precedence and Conflict Resolution

**User Story:** As a developer with existing X-Ray configuration, I want Powertools Tracer to take over seamlessly, so that I do not get double-instrumentation or need to change my code.

#### Acceptance Criteria

1. WHEN both `CacheData_AWSXRayOn` is set to true and @aws-lambda-powertools/tracer is importable and not disabled via `CACHE_DATA_POWERTOOLS_TRACER` or `CACHE_DATA_POWERTOOLS` environment variables, THE Cache_Data_Package SHALL use the PowertoolsTracerProvider
2. WHEN @aws-lambda-powertools/tracer is importable and not disabled via environment variables, THE Cache_Data_Package SHALL not initialize the RawXRayProvider and SHALL not instrument AWS SDK clients or HTTP requests through raw aws-xray-sdk-core
3. WHEN @aws-lambda-powertools/tracer is not importable and `CacheData_AWSXRayOn` is set to true, THE Cache_Data_Package SHALL use the RawXRayProvider
4. IF `CacheData_AWSXRayOn` is not set to true and @aws-lambda-powertools/tracer is not importable or is disabled via environment variables, THEN THE Cache_Data_Package SHALL not instrument AWS SDK clients or HTTP requests for tracing
5. THE Cache_Data_Package SHALL select exactly one TracingProvider per module load and SHALL log a diagnostic message indicating which TracingProvider was selected
6. IF the PowertoolsTracerProvider fails to initialize after import succeeds, THEN THE Cache_Data_Package SHALL fall back to the RawXRayProvider when `CacheData_AWSXRayOn` is set to true, or disable tracing otherwise, and SHALL log a warning indicating the initialization failure

### Requirement 5: Tracer SDK Client Instrumentation

**User Story:** As a developer, I want my AWS SDK clients (DynamoDB, S3, SSM) to be traced through the active TracingProvider, so that I get visibility into AWS service call latency and errors.

#### Acceptance Criteria

1. WHEN a TracingProvider is active, THE Cache_Data_Package SHALL instrument the DynamoDB client through the active TracingProvider at client creation time
2. WHEN a TracingProvider is active, THE Cache_Data_Package SHALL instrument the S3 client through the active TracingProvider at client creation time
3. WHEN a TracingProvider is active, THE Cache_Data_Package SHALL instrument the SSM client through the active TracingProvider at client creation time
4. WHEN the PowertoolsTracerProvider is active and a cache read operation is invoked, THE Tracer SHALL add a custom subsegment with a name that identifies the operation as a cache read
5. WHEN the PowertoolsTracerProvider is active and a cache write operation is invoked, THE Tracer SHALL add a custom subsegment with a name that identifies the operation as a cache write
6. WHEN the PowertoolsTracerProvider is active and an endpoint HTTP request is invoked, THE Tracer SHALL add a custom subsegment with a name that identifies the operation as an endpoint request
7. IF an AWS SDK call fails while a custom subsegment is open, THEN THE Tracer SHALL record the error on the subsegment before closing it

### Requirement 6: Logger Integration with DebugAndLog

**User Story:** As a developer, I want DebugAndLog to output structured JSON when Powertools Logger is available, so that my logs are machine-parseable and enriched with Lambda context.

#### Acceptance Criteria

1. WHEN @aws-lambda-powertools/logger is available and enabled, THE DebugAndLog class SHALL delegate all log output that passes the current log level filter to the Powertools Logger instance instead of console methods
2. WHEN @aws-lambda-powertools/logger is available and enabled, THE DebugAndLog class SHALL output structured JSON instead of plain text, including the log level, message, and any additional object data passed via the obj parameter as a nested property
3. THE DebugAndLog class SHALL map its log levels to Powertools Logger levels as follows: ERROR maps to error, WARN maps to warn, INFO maps to info, MSG maps to info, DIAG maps to debug, DEBUG maps to debug
4. WHEN @aws-lambda-powertools/logger is not available, THE DebugAndLog class SHALL continue using console-based plain text output
5. THE DebugAndLog class SHALL maintain its existing log level semantics and environment variable support regardless of Logger availability, including the production log level cap at level 2 and the environment variable priority order
6. WHEN the Powertools Logger is active, THE DebugAndLog class SHALL include the X-Ray trace ID as a correlation identifier in log entries
7. IF the Powertools Logger is active and no X-Ray trace ID is available, THEN THE DebugAndLog class SHALL omit the correlation identifier field from log entries without error

### Requirement 7: Logger Lambda Context Enrichment

**User Story:** As a developer, I want my logs to automatically include Lambda context information, so that I can correlate logs with specific invocations.

#### Acceptance Criteria

1. WHEN the Powertools Logger is active and the Lambda context object contains an `awsRequestId` property, THE Logger SHALL include the AWS request ID value in each structured log entry
2. WHEN the Powertools Logger is active and the Lambda context object contains a `functionName` property, THE Logger SHALL include the function name value in each structured log entry
3. IF the Powertools Logger is active and the Lambda context object is not provided or does not contain `awsRequestId` or `functionName`, THEN THE Logger SHALL omit the missing context fields from log entries without producing an error
4. WHEN the Powertools Logger is active, THE Logger SHALL include a boolean Cold_Start indicator in log entries that is true for the first invocation of a Lambda function instance and false for subsequent invocations
5. IF the `POWERTOOLS_SERVICE_NAME` environment variable is set to a non-empty string, THEN THE Logger SHALL use its value as the service name in log entries
6. IF the `POWERTOOLS_SERVICE_NAME` environment variable is not set or is empty, THEN THE Logger SHALL derive the service name from the `name` field in the package.json of the consuming application

### Requirement 8: Metrics Emission for Cache Operations

**User Story:** As a developer, I want automatic CloudWatch metrics for cache operations, so that I can monitor cache performance without writing custom instrumentation.

#### Acceptance Criteria

1. WHEN @aws-lambda-powertools/metrics is available and enabled and a cache read operation finds data in the cache, THE Metrics component SHALL emit a count metric with value 1 for the cache hit event
2. WHEN @aws-lambda-powertools/metrics is available and enabled and a cache read operation does not find data in the cache, THE Metrics component SHALL emit a count metric with value 1 for the cache miss event
3. WHEN @aws-lambda-powertools/metrics is available and enabled and a cache read operation completes, THE Metrics component SHALL emit a metric recording the elapsed duration of the read operation in milliseconds
4. WHEN @aws-lambda-powertools/metrics is available and enabled and a cache write operation completes, THE Metrics component SHALL emit a metric recording the elapsed duration of the write operation in milliseconds
5. WHILE @aws-lambda-powertools/metrics is available and enabled, THE Metrics component SHALL use CloudWatch EMF format to emit metrics via stdout without making CloudWatch API calls
6. WHEN @aws-lambda-powertools/metrics is not available, THE Cache_Data_Package SHALL not emit any metrics
7. IF the Metrics component encounters an error during metric emission, THEN THE Cache_Data_Package SHALL log a warning and continue the cache operation without interruption

### Requirement 9: Metrics Emission for Endpoint Operations

**User Story:** As a developer, I want automatic CloudWatch metrics for endpoint requests, so that I can monitor API dependency health.

#### Acceptance Criteria

1. WHEN @aws-lambda-powertools/metrics is available and enabled and an endpoint request completes, THE Metrics component SHALL emit a latency metric recording the duration of the endpoint request in integer milliseconds, measured from the start of the HTTP request to receipt of the response
2. WHEN @aws-lambda-powertools/metrics is available and enabled and an endpoint request results in a non-success HTTP status code (4xx or 5xx) or throws an exception, THE Metrics component SHALL emit an error count metric with a value of 1 for that request
3. IF @aws-lambda-powertools/metrics is available and enabled and the current invocation is the first invocation of the Lambda instance, THEN THE Metrics component SHALL emit a Cold_Start count metric with a value of 1
4. WHEN @aws-lambda-powertools/metrics is available and enabled and an endpoint request completes successfully with a 2xx or 3xx HTTP status code, THE Metrics component SHALL NOT emit an error count metric for that request

### Requirement 10: Metrics Dimensions and Namespace

**User Story:** As a developer, I want metrics organized with meaningful dimensions, so that I can filter and aggregate metrics in CloudWatch dashboards.

#### Acceptance Criteria

1. THE Metrics component SHALL use a namespace configured via the `POWERTOOLS_METRICS_NAMESPACE` environment variable, defaulting to the service name derived from the package name or the `POWERTOOLS_SERVICE_NAME` environment variable
2. THE Metrics component SHALL include a dimension named "operation" with one of the values "cache-read", "cache-write", or "endpoint-request" on every emitted metric corresponding to the operation that produced it
3. WHEN a Lambda invocation handler returns or throws, THE Metrics component SHALL flush all buffered metrics for that invocation
4. IF the Metrics component fails to flush metrics, THEN THE Metrics component SHALL log a warning via DebugAndLog and continue without throwing an exception to the caller
5. THE Metrics component SHALL restrict the namespace to between 1 and 256 characters conforming to CloudWatch namespace validation rules

### Requirement 11: Optional Peer Dependencies

**User Story:** As a developer, I want Powertools packages declared as optional peer dependencies, so that I can install them separately or use the Lambda Layer without increasing the default bundle size.

#### Acceptance Criteria

1. THE Cache_Data_Package package.json SHALL declare @aws-lambda-powertools/tracer as an optional peer dependency with version range ^2.0.0
2. THE Cache_Data_Package package.json SHALL declare @aws-lambda-powertools/logger as an optional peer dependency with version range ^2.0.0
3. THE Cache_Data_Package package.json SHALL declare @aws-lambda-powertools/metrics as an optional peer dependency with version range ^2.0.0
4. THE Cache_Data_Package package.json SHALL include a peerDependenciesMeta section marking each Powertools package as optional so that npm install does not produce warnings or errors when those packages are absent
5. WHEN no Powertools packages are installed, THE Cache_Data_Package SHALL install without peer dependency warnings and SHALL function without errors related to missing Powertools packages

### Requirement 12: Zero Breaking Changes

**User Story:** As an existing user of @63klabs/cache-data, I want the v1.3.15 upgrade to be completely transparent, so that my application continues to work without any modifications.

#### Acceptance Criteria

1. THE Cache_Data_Package SHALL maintain all existing public API signatures exported from `src/index.js` (tools, cache, endpoint) and their sub-modules without modification to function names, parameter order, parameter types, or return types
2. THE Cache_Data_Package SHALL maintain all existing environment variable behaviors such that environment variables recognized in v1.3.14 produce the same observable effects in v1.3.15 when no Powertools packages are installed
3. THE Cache_Data_Package SHALL maintain all existing export names and structures including deprecated aliases (e.g., APIRequest, _ConfigSuperClass, CachedSSMParameter, Aws, AwsXRay)
4. WHEN no Powertools packages are installed, THE Cache_Data_Package SHALL produce identical observable outputs (return values, error types, log output, and side effects) to version 1.3.14 for the same inputs and environment configuration
5. THE Cache_Data_Package SHALL not add any required dependencies to the dependencies field in package.json
6. THE Cache_Data_Package SHALL declare Powertools packages in peerDependenciesMeta with optional set to true so that npm install does not produce warnings or errors when those packages are absent
7. THE Cache_Data_Package SHALL maintain backward-compatible TypeScript type definitions such that existing code compiling against v1.3.14 type definitions compiles without errors against v1.3.15 type definitions

### Requirement 13: Initialization at Module Load

**User Story:** As a developer, I want Powertools integration to initialize automatically at module load, so that I get observability benefits without adding initialization code.

#### Acceptance Criteria

1. WHEN the Cache_Data_Package module is first imported, THE Auto_Detection mechanism SHALL execute Powertools detection and configuration using a guarded initialization function that runs at most once, consistent with the existing X-Ray lazy-loading pattern in AWS.classes.js
2. THE Cache_Data_Package SHALL complete Powertools initialization without requiring user code to call an init method
3. IF Powertools initialization encounters an error, THEN THE Cache_Data_Package SHALL log a warning via DebugAndLog and continue operating identically to version 1.3.14 behavior where no Powertools packages are installed
4. THE Cache_Data_Package SHALL use an initialization guard flag to ensure the Auto_Detection mechanism executes only once regardless of how many times the module is accessed
5. THE Cache_Data_Package SHALL not add synchronous blocking operations during module import that would increase Cold_Start latency beyond the time required to attempt dynamic imports of the three Powertools packages
