# Implementation Plan: Powertools Integration

## Overview

This plan implements AWS Lambda Powertools for TypeScript (v2.x) integration into @63klabs/cache-data as a transparent backend enhancement. The implementation follows three phases: Tracer (TracingProvider interface + providers + AWS.classes.js modification), Logger (LoggerBridge + DebugAndLog modification), and Metrics (MetricsHelper + cache/endpoint instrumentation). All changes are backwards-compatible and opt-in via optional peer dependencies.

## Tasks

- [x] 1. Set up project structure and core interfaces
  - [x] 1.1 Add optional peer dependencies to package.json
    - Add `@aws-lambda-powertools/tracer`, `@aws-lambda-powertools/logger`, `@aws-lambda-powertools/metrics` as optional peerDependencies with version range `^2.0.0`
    - Add `peerDependenciesMeta` section marking each as `optional: true`
    - Add Powertools packages to devDependencies for testing
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.5, 12.6_

  - [x] 1.2 Create PowertoolsInit module with env var parsing and detection
    - Create `src/lib/tools/PowertoolsInit.js`
    - Implement `parseEnvFlag()` function for CACHE_DATA_POWERTOOLS* env vars
    - Implement `isCapabilityEnabled()` logic (global flag, individual flag, importable)
    - Implement `tryImport()` for safe package detection
    - Implement `initPowertools()` with initialization guard
    - Implement `getState()` for programmatic querying
    - Export `initPowertools`, `getState`, `getActiveTracingProvider`, `getLoggerBridge`, `getMetricsHelper`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 1.3 Create TracingProvider interface and implementations
    - Create `src/lib/utils/TracingProvider.js`
    - Implement `NoOpTracingProvider` class (all methods are no-ops)
    - Implement `RawXRayProvider` class wrapping aws-xray-sdk-core
    - Implement `PowertoolsTracerProvider` class wrapping @aws-lambda-powertools/tracer
    - All provider methods must catch and swallow errors (log warning only)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 1.4 Create test directory structure and test helpers
    - Create `test/powertools/unit/`, `test/powertools/property/`, `test/powertools/integration/` directories
    - Create test helper for mocking Powertools package imports
    - Create test helper for environment variable save/restore
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement Phase 1 — Tracer integration
  - [x] 2.1 Implement tracer precedence logic in PowertoolsInit
    - Add `initTracer()` function that selects provider based on precedence rules
    - PowertoolsTracerProvider when tracer importable and not disabled
    - RawXRayProvider when tracer not available but CacheData_AWSXRayOn is true
    - NoOpTracingProvider otherwise
    - Log diagnostic message indicating which provider was selected
    - Handle PowertoolsTracerProvider init failure with fallback
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Modify AWS.classes.js to use TracingProvider
    - Import `getActiveTracingProvider` from PowertoolsInit
    - Replace direct `AWSXRay.captureAWSv3Client()` calls with `provider.instrumentClient()`
    - Replace direct `AWSXRay.captureHTTPsGlobal()` calls with `provider.captureHttp()`
    - Maintain existing `USE_XRAY` and `AWSXRay` exports for backwards compatibility
    - Ensure `initializeXRay()` still works when Powertools is not available
    - _Requirements: 5.1, 5.2, 5.3, 12.1, 12.2, 12.3, 12.4_

  - [x] 2.3 Write property tests for detection independence (Property 1)
    - **Property 1: Detection Independence and No-Throw Guarantee**
    - Test all 8 combinations of 3 packages being available/unavailable
    - Verify `initPowertools()` never throws
    - Verify each package detection is independent
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

  - [x] 2.4 Write property tests for env var parsing (Property 2)
    - **Property 2: Environment Variable Parsing Correctness**
    - Test `parseEnvFlag` with arbitrary string inputs
    - Verify "0", "false", "no" → false; undefined/null/"" → null; all others → true
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8**

  - [x] 2.5 Write property tests for capability enablement (Property 3)
    - **Property 3: Capability Enablement Logic**
    - Test all combinations of (globalFlag, individualFlag, isImportable)
    - Verify globalFlag=false always disables, individualFlag=false disables, otherwise returns isImportable
    - **Validates: Requirements 2.5, 2.6, 2.7**

  - [x] 2.6 Write property tests for tracer provider selection (Property 4)
    - **Property 4: Tracer Provider Selection Precedence**
    - Test all combinations of (xrayEnvOn, tracerImportable, tracerDisabledByEnv)
    - Verify exactly one provider is selected per the precedence rules
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [x] 2.7 Write property tests for error resilience (Property 5)
    - **Property 5: TracingProvider Error Resilience**
    - Test that provider methods never propagate exceptions
    - Mock underlying libraries to throw various errors
    - **Validates: Requirements 3.6, 3.7**

  - [x] 2.8 Write property tests for initialization idempotence (Property 13)
    - **Property 13: Initialization Idempotence**
    - Call `initPowertools()` N times (N >= 1), verify state is identical to calling once
    - **Validates: Requirements 13.1, 13.4**

  - [x] 2.9 Write unit tests for TracingProvider implementations
    - Test NoOpTracingProvider returns client unchanged
    - Test RawXRayProvider wraps clients correctly (mocked aws-xray-sdk-core)
    - Test PowertoolsTracerProvider wraps clients correctly (mocked @aws-lambda-powertools/tracer)
    - Test subsegment open/close/error lifecycle
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4, 5.5, 5.6, 5.7_

- [x] 3. Checkpoint - Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Phase 2 — Logger integration
  - [x] 4.1 Create LoggerBridge module
    - Create `src/lib/utils/LoggerBridge.js`
    - Implement constructor with safe import of @aws-lambda-powertools/logger
    - Implement `isActive` getter
    - Implement `addContext(context)` for Lambda context enrichment
    - Implement `log(level, message, obj)` with X-Ray trace ID correlation
    - Implement static `mapLevel(tag)` for DebugAndLog → Powertools level mapping
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.2 Modify DebugAndLog.class.js to delegate to LoggerBridge
    - Import `getLoggerBridge` from PowertoolsInit
    - Add delegation logic at the start of `writeLog()` method
    - When LoggerBridge is active, delegate to it instead of console methods
    - Preserve existing log level filtering semantics
    - Maintain all existing behavior when LoggerBridge is not active
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 12.1, 12.2_

  - [x] 4.3 Wire LoggerBridge initialization into PowertoolsInit
    - Add `initLogger()` function in PowertoolsInit
    - Create LoggerBridge instance with service name from POWERTOOLS_SERVICE_NAME or package name
    - Store instance in powertoolsState for retrieval via `getLoggerBridge()`
    - _Requirements: 7.5, 7.6_

  - [x] 4.4 Write property tests for logger delegation (Property 6)
    - **Property 6: Logger Delegation with Structured Output**
    - Verify bridge.log invokes Powertools Logger at correct level
    - Verify obj is included as `details` property when non-null
    - **Validates: Requirements 6.1, 6.2**

  - [x] 4.5 Write property tests for log level mapping (Property 7)
    - **Property 7: Log Level Mapping Correctness**
    - Test all DebugAndLog tags map to correct Powertools levels
    - **Validates: Requirements 6.3**

  - [x] 4.6 Write property tests for log level filtering preservation (Property 8)
    - **Property 8: Log Level Filtering Preservation**
    - For any configured level and tag, same messages are filtered/passed regardless of Logger backend
    - **Validates: Requirements 6.5**

  - [x] 4.7 Write property tests for trace ID correlation (Property 15)
    - **Property 15: Trace ID Correlation**
    - When _X_AMZN_TRACE_ID is set, log entries include xray_trace_id field
    - When unset/empty, field is absent
    - **Validates: Requirements 6.6, 6.7**

  - [x] 4.8 Write unit tests for LoggerBridge
    - Test level mapping for all DebugAndLog tags
    - Test context enrichment with Lambda context
    - Test trace ID inclusion/exclusion
    - Test fallback when Logger not available
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4_

- [x] 5. Checkpoint - Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Phase 3 — Metrics integration
  - [x] 6.1 Create MetricsHelper module
    - Create `src/lib/utils/MetricsHelper.js`
    - Implement constructor with safe import of @aws-lambda-powertools/metrics
    - Implement `recordCacheHit(durationMs)`, `recordCacheMiss(durationMs)`, `recordCacheWrite(durationMs)`
    - Implement `recordEndpointRequest(durationMs, statusCode)`
    - Implement `recordColdStart()` (once per Lambda instance)
    - Implement `markWarm()` and `flush()`
    - Implement `_emit(operation, fn)` with operation dimension
    - All methods are no-ops when Metrics is not available
    - All methods catch and log errors without propagating
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.2 Wire MetricsHelper initialization into PowertoolsInit
    - Add `initMetrics()` function in PowertoolsInit
    - Create MetricsHelper instance with namespace from POWERTOOLS_METRICS_NAMESPACE or service name
    - Validate namespace (1-256 chars, CloudWatch-valid characters)
    - Store instance in powertoolsState for retrieval via `getMetricsHelper()`
    - _Requirements: 10.1, 10.5_

  - [x] 6.3 Instrument dao-cache.js with metrics and tracing subsegments
    - Import `getMetricsHelper` and `getActiveTracingProvider` from PowertoolsInit
    - Add subsegment and metrics recording to cache read operations (hit/miss + latency)
    - Add subsegment and metrics recording to cache write operations (latency)
    - Ensure metrics/tracing errors never interrupt cache operations
    - _Requirements: 5.4, 5.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 6.4 Instrument dao-endpoint.js with metrics and tracing subsegments
    - Import `getMetricsHelper` and `getActiveTracingProvider` from PowertoolsInit
    - Add subsegment and metrics recording to endpoint requests (latency + error count)
    - Record cold start metric on first invocation
    - Ensure metrics/tracing errors never interrupt endpoint operations
    - _Requirements: 5.6, 5.7, 9.1, 9.2, 9.3, 9.4_

  - [x] 6.5 Write property tests for cache hit/miss exclusivity (Property 9)
    - **Property 9: Cache Hit/Miss Metric Exclusivity**
    - For any cache read, exactly one of CacheHit or CacheMiss is emitted
    - **Validates: Requirements 8.1, 8.2**

  - [x] 6.6 Write property tests for latency metric accuracy (Property 10)
    - **Property 10: Operation Latency Metric Accuracy**
    - For any duration d > 0, emitted latency equals Math.round(d)
    - **Validates: Requirements 8.3, 8.4, 9.1**

  - [x] 6.7 Write property tests for endpoint error metric (Property 11)
    - **Property 11: Endpoint Error Metric Correctness**
    - EndpointError emitted iff status >= 400 or exception thrown
    - **Validates: Requirements 9.2, 9.4**

  - [x] 6.8 Write property tests for operation dimension (Property 12)
    - **Property 12: Operation Dimension Correctness**
    - Every emitted metric has "operation" dimension with correct value
    - **Validates: Requirements 10.2**

  - [x] 6.9 Write property tests for namespace validation (Property 14)
    - **Property 14: Namespace Validation**
    - Accept strings 1-256 chars matching CloudWatch namespace rules; reject others
    - **Validates: Requirements 10.5**

  - [x] 6.10 Write unit tests for MetricsHelper
    - Test cache hit/miss/write metric emission
    - Test endpoint request metric emission with various status codes
    - Test cold start recording (once only)
    - Test flush behavior
    - Test no-op behavior when Metrics not available
    - Test error swallowing during emission
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4_

- [x] 7. Checkpoint - Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integration wiring and final validation
  - [x] 8.1 Wire initPowertools() into tools/index.js module load
    - Import and call `initPowertools()` from PowertoolsInit at module load time
    - Ensure it runs after existing `initializeXRay()` pattern
    - Ensure it runs at most once (guarded)
    - Export PowertoolsInit state via tools module for programmatic access
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 8.2 Add metrics flush to invocation lifecycle
    - Ensure `metricsHelper.flush()` is called at end of Lambda invocation
    - Handle flush errors gracefully (log warning, don't throw)
    - _Requirements: 10.3, 10.4_

  - [x] 8.3 Write backwards compatibility integration tests
    - Run with no Powertools packages mocked — verify identical behavior to v1.3.14
    - Verify all existing exports unchanged
    - Verify all existing environment variable behaviors preserved
    - Verify no new required dependencies added
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 8.4 Write full integration tests with all Powertools mocked
    - Mock all 3 Powertools packages as available
    - Verify structured JSON log output
    - Verify tracing subsegments created for cache/endpoint operations
    - Verify EMF metrics emitted to stdout
    - Verify cold start metric emitted once
    - _Requirements: 1.1, 5.4, 5.5, 5.6, 6.1, 6.2, 8.1, 8.2, 9.1, 9.3_

  - [x] 8.5 Write partial integration tests (subset of Powertools)
    - Test with only Tracer available (Logger and Metrics disabled)
    - Test with only Logger available (Tracer and Metrics disabled)
    - Test with only Metrics available (Tracer and Logger disabled)
    - Verify each capability works independently
    - _Requirements: 1.1, 1.2, 2.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All Powertools errors are caught and swallowed — never interrupt business logic
- The existing test suite must continue to pass unchanged (backwards compatibility)
- File pattern for tests: `*.jest.mjs` using Jest with fast-check for property tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.2", "2.6", "2.7", "2.8", "2.9"] },
    { "id": 4, "tasks": ["4.1", "4.3"] },
    { "id": 5, "tasks": ["4.2", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3", "8.4", "8.5"] }
  ]
}
```
