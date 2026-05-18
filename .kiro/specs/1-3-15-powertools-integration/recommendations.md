# Recommendations: AWS Lambda Powertools Integration

## Integration Strategy Options

### Option A: Powertools as Backend for Existing API (Recommended)

**Approach:** Keep `DebugAndLog` and `AWS.XRay` as the public API, but use Powertools internally when available.

**How it works:**
- DebugAndLog detects if `@aws-lambda-powertools/logger` is installed
- If present, DebugAndLog delegates to Powertools Logger (structured JSON output)
- If absent, DebugAndLog continues with current `console.*` behavior
- Same pattern for Tracer: if `@aws-lambda-powertools/tracer` is installed, use it instead of raw X-Ray SDK
- New `AWS.PowerTools` getter (similar to `AWS.XRay`) exposes the instances for advanced users

**Pros:**
- Zero breaking changes — existing API surface unchanged
- Existing users get Powertools benefits by just installing the packages
- Gradual adoption — users can add one package at a time
- Follows existing opt-in pattern (like X-Ray)

**Cons:**
- Dual code paths to maintain
- DebugAndLog output format changes when Powertools is present (could surprise users)
- More complex initialization logic

**Implementation sketch:**
```javascript
// In DebugAndLog.class.js
let powertoolsLogger = null;
try {
    const { Logger } = require('@aws-lambda-powertools/logger');
    powertoolsLogger = new Logger({ serviceName: 'cache-data' });
} catch { /* not installed, use console */ }

static async writeLog(tag, message, obj = null) {
    if (powertoolsLogger) {
        // Delegate to Powertools Logger
        powertoolsLogger[mapTagToLevel(tag)](message, obj ? { details: obj } : {});
    } else {
        // Current console-based implementation
    }
}
```

---

### Option B: Parallel API Surface

**Approach:** Add a new `PowerTools` class alongside existing classes. Users explicitly choose which to use.

**How it works:**
- New `tools.PowerTools` export with `.logger`, `.tracer`, `.metrics` properties
- Existing `DebugAndLog` and `AWS.XRay` remain unchanged
- Users choose which API to use in their application code
- Package provides helper methods to initialize Powertools with sensible defaults

**Pros:**
- No risk to existing behavior whatsoever
- Clean separation of concerns
- Users have full control over Powertools configuration
- Easier to document and test

**Cons:**
- Users must change their code to adopt Powertools
- Two logging systems in the same app could be confusing
- Internal cache-data code still uses DebugAndLog (no structured logs for internal operations)

**Implementation sketch:**
```javascript
// New: src/lib/tools/PowerTools.class.js
class PowerTools {
    static #logger = null;
    static #tracer = null;
    static #metrics = null;

    static init(options = {}) {
        // Similar to X-Ray: lazy load, env-var driven
    }

    static get logger() { return this.#logger; }
    static get tracer() { return this.#tracer; }
    static get metrics() { return this.#metrics; }
}
```

---

### Option C: Full Replacement (Major Version)

**Approach:** Replace DebugAndLog with Powertools Logger, replace X-Ray with Powertools Tracer, add Metrics. Ship as v2.0.0.

**How it works:**
- DebugAndLog becomes a thin wrapper around Powertools Logger
- X-Ray integration replaced entirely by Powertools Tracer
- Metrics added as first-class feature
- Breaking changes documented with migration guide

**Pros:**
- Cleanest architecture long-term
- Single source of truth for logging/tracing/metrics
- Full Powertools feature set available
- Reduced maintenance burden (no dual paths)

**Cons:**
- Major version bump required
- All existing users must update their code/config
- Powertools becomes a hard dependency (bundle size increase)
- Users who don't want Powertools are forced into it

---

### Option D: Plugin/Adapter Architecture

**Approach:** Create a plugin system where Powertools is one possible adapter.

**How it works:**
- Define interfaces for Logger, Tracer, Metrics
- Default implementations use current behavior (console, raw X-Ray)
- Powertools adapter implements these interfaces
- Users register adapters at init time

**Pros:**
- Maximum flexibility
- Could support other tools (Datadog, New Relic, etc.)
- Clean architecture

**Cons:**
- Over-engineered for current needs
- Significant development effort
- More complex for users to configure
- Abstraction may not map cleanly to all tools

---

## Recommendation

**Option A (Powertools as Backend)** is recommended for the following reasons:

1. **Zero breaking changes** — existing users are unaffected
2. **Follows established pattern** — mirrors how X-Ray is already integrated
3. **Incremental adoption** — users install packages as needed
4. **Internal benefit** — cache-data's own operations get structured logging/tracing
5. **Minimal API surface change** — maybe just a new `AWS.PowerTools` getter

---

## Implementation Approach (if Option A)

### Phase 1: Tracer (replaces raw X-Ray)

Since Powertools Tracer wraps `aws-xray-sdk-core`, this is the most natural first step:

1. Detect if `@aws-lambda-powertools/tracer` is installed
2. If yes, use Tracer instead of raw X-Ray SDK for client instrumentation
3. Add custom subsegments for cache operations and endpoint requests
4. Keep `CacheData_AWSXRayOn` / `CACHE_DATA_AWS_X_RAY_ON` env vars working
5. Add new env var: `CACHE_DATA_POWERTOOLS_TRACER=true` (or auto-detect)

### Phase 2: Logger (enhances DebugAndLog)

1. Detect if `@aws-lambda-powertools/logger` is installed
2. If yes, DebugAndLog delegates to Logger for structured JSON output
3. Add Lambda context injection (requestId, functionName, cold start)
4. Add correlation ID support (X-Ray trace ID in logs)
5. Maintain existing log level semantics and env var support

### Phase 3: Metrics (new capability)

1. Detect if `@aws-lambda-powertools/metrics` is installed
2. Add automatic metrics for: cache hit/miss, endpoint latency, error rates
3. Expose metrics API for users to add custom metrics
4. Use CloudWatch EMF format (zero API calls, just stdout)

---

## Dependency Strategy

### Recommended: Optional Peer Dependencies

```json
{
  "peerDependencies": {
    "@aws-lambda-powertools/logger": "^2.0.0",
    "@aws-lambda-powertools/tracer": "^2.0.0",
    "@aws-lambda-powertools/metrics": "^2.0.0"
  },
  "peerDependenciesMeta": {
    "@aws-lambda-powertools/logger": { "optional": true },
    "@aws-lambda-powertools/tracer": { "optional": true },
    "@aws-lambda-powertools/metrics": { "optional": true }
  }
}
```

This mirrors the current `aws-xray-sdk-core` pattern (devDependency for testing, optional for users).

---

## Environment Variable Design

Following existing patterns:

| Variable | Purpose | Default |
|----------|---------|---------|
| `CACHE_DATA_POWERTOOLS` | Enable all Powertools features | `false` |
| `CACHE_DATA_POWERTOOLS_LOGGER` | Enable Logger only | `false` |
| `CACHE_DATA_POWERTOOLS_TRACER` | Enable Tracer only | `false` |
| `CACHE_DATA_POWERTOOLS_METRICS` | Enable Metrics only | `false` |
| `POWERTOOLS_SERVICE_NAME` | Service name for all Powertools | (from package name) |
| `POWERTOOLS_LOG_LEVEL` | Powertools log level | (from existing env vars) |

**Auto-detection alternative:** If any `@aws-lambda-powertools/*` package is importable, automatically use it (no env var needed). The env vars would only be needed to *disable* auto-detected Powertools.

---

## Clarifying Questions

Before proceeding with implementation, I need your input on these decisions:

### Q1: Output Format Change

When Powertools Logger is active, DebugAndLog output changes from:
```
[INFO] Cache hit for key abc123
```
to:
```json
{"level":"INFO","message":"Cache hit for key abc123","service":"cache-data","timestamp":"2026-05-17T...","xray_trace_id":"..."}
```

**Is this acceptable as automatic behavior when the user installs Powertools Logger?** Or should there be an explicit opt-in even after installation?

**Answer** This is acceptable

### Q2: X-Ray SDK Conflict

Powertools Tracer internally uses `aws-xray-sdk-core`. If a user currently has X-Ray enabled via `CacheData_AWSXRayOn=true` AND installs Powertools Tracer, there could be a conflict (double-instrumentation).

**Preferred resolution:**
- (a) Powertools Tracer takes precedence, raw X-Ray disabled automatically
- (b) User must explicitly choose one or the other via env vars
- (c) Both can coexist (Powertools wraps what X-Ray already wrapped)

**Answer**: I think a but am unsure of c. I only want one enabled at a time, Powertools should take precedence if enabled. Can it use an interface? Ensuring code is not duplicated too much, and if the user already has XRay instrumentation are we able to instead use Powertools without the user making code changes?

### Q3: Dependency Philosophy

**Which approach do you prefer for Powertools packages?**
- (a) Optional peer dependencies (user installs separately, auto-detected)
- (b) Bundled dependencies (always included, increases package size ~200KB)
- (c) Separate companion package (`@63klabs/cache-data-powertools`)

**Answer**: Use a - Optional peer dependencies. This is what we use for AWS-Parameters-and-Secrets-Lambda-Extension. User can either install the power tools layer or the package in their dependencies. We'll provide documentation for both.

### Q4: Metrics Scope

**What metrics would be most valuable to emit automatically?**
- Cache hit/miss ratio
- Cache read/write latency
- Endpoint request latency
- Endpoint error rate
- Cold start indicator
- Cache expiration events
- Other: ___

**Answer**: I think all the above examples would be good with the exception of Cache expiration events.

### Q5: Initialization Pattern

**How should Powertools be initialized?**
- (a) Automatically at module load (like current X-Ray) — zero user code needed
- (b) Explicitly via `tools.PowerTools.init(options)` — user controls config
- (c) Hybrid: auto-init with defaults, optional explicit init for customization

**Answer**: (a) Automatically at module load (like current X-Ray) — zero user code needed

### Q6: Which option (A, B, C, D) do you prefer?

**Answer** Use option A

Or is there a hybrid approach you'd like to explore?

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bundle size increase | Medium | Low | Optional peer deps |
| Log format breaking existing parsers | High | Medium | Opt-in or clear docs |
| X-Ray double-instrumentation | Medium | Medium | Auto-detect and disable |
| Powertools version conflicts | Low | High | Pin peer dep range |
| Performance overhead | Low | Medium | Lazy init, zero-cost when off |
| Maintenance burden of dual paths | Medium | Medium | Clear abstraction layer |

---

## Next Steps

1. Get answers to clarifying questions above
2. Choose integration option (A/B/C/D)
3. If proceeding: create formal spec (requirements → design → tasks)
4. Prototype Phase 1 (Tracer) to validate approach
5. Measure performance impact
