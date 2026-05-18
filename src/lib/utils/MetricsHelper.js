/**
 * MetricsHelper - CloudWatch EMF metrics emission for cache and endpoint operations.
 * 
 * When @aws-lambda-powertools/metrics is available and enabled, this helper
 * emits CloudWatch Embedded Metric Format (EMF) metrics via stdout for cache
 * hits, misses, writes, endpoint requests, and cold starts. When Metrics is
 * not available, all methods are safe no-ops.
 * 
 * Features:
 * - Safe import of @aws-lambda-powertools/metrics (never throws)
 * - Cache hit/miss/write latency metrics
 * - Endpoint request latency and error metrics
 * - Cold start detection (emitted once per Lambda instance)
 * - Operation dimension on every emitted metric
 * - All methods catch and swallow errors (never throw)
 * - Namespace validation (1-256 chars, CloudWatch-valid characters)
 * 
 * @private
 * @module src/lib/utils/MetricsHelper
 */

"use strict";

/* =============================================================================
 * Constants
 * -------------------------------------------------------------------------- */

/**
 * Regular expression for validating CloudWatch namespace characters.
 * Allows alphanumeric characters, hyphens, underscores, periods, forward slashes,
 * and the @ symbol (for scoped package names).
 * 
 * @type {RegExp}
 * @private
 */
const NAMESPACE_PATTERN = /^[a-zA-Z0-9_.\-/@]+$/;

/**
 * Maximum length for a CloudWatch namespace.
 * 
 * @type {number}
 * @private
 */
const NAMESPACE_MAX_LENGTH = 256;

/**
 * Minimum length for a CloudWatch namespace.
 * 
 * @type {number}
 * @private
 */
const NAMESPACE_MIN_LENGTH = 1;

/* =============================================================================
 * Namespace Validation
 * -------------------------------------------------------------------------- */

/**
 * Validate a CloudWatch metrics namespace.
 * 
 * A valid namespace must be 1-256 characters and contain only alphanumeric
 * characters, hyphens, underscores, periods, forward slashes, and the @ symbol.
 * 
 * @param {string} namespace - The namespace to validate
 * @returns {boolean} true if the namespace is valid, false otherwise
 * @example
 * isValidNamespace("CacheData");           // true
 * isValidNamespace("my-app/cache");        // true
 * isValidNamespace("@63klabs/cache-data"); // true
 * isValidNamespace("");                    // false (too short)
 * isValidNamespace("a".repeat(257));       // false (too long)
 * isValidNamespace("invalid namespace!");  // false (invalid chars)
 */
function isValidNamespace(namespace) {
	if (typeof namespace !== "string") {
		return false;
	}
	if (namespace.length < NAMESPACE_MIN_LENGTH || namespace.length > NAMESPACE_MAX_LENGTH) {
		return false;
	}
	return NAMESPACE_PATTERN.test(namespace);
}

/* =============================================================================
 * MetricsHelper Class
 * -------------------------------------------------------------------------- */

/**
 * MetricsHelper wraps @aws-lambda-powertools/metrics to emit CloudWatch EMF
 * metrics for cache and endpoint operations.
 * 
 * All methods are no-ops when Metrics is not available.
 * Errors during metric emission are logged and swallowed — they never
 * interrupt business logic.
 * 
 * @example
 * // Used internally by PowertoolsInit
 * const helper = new MetricsHelper("CacheData", "my-service");
 * if (helper.isActive) {
 *   helper.recordCacheHit(45);
 *   helper.recordEndpointRequest(120, 200);
 *   helper.flush();
 * }
 * 
 * @private
 */
class MetricsHelper {
	#metrics = null;
	#coldStart = true;
	#coldStartRecorded = false;
	#MetricUnit = null;

	/**
	 * Creates a new MetricsHelper instance.
	 * 
	 * Attempts to import @aws-lambda-powertools/metrics and create a Metrics
	 * instance with the given namespace and service name. If the import fails
	 * (package not installed) or the namespace is invalid, the helper remains
	 * inactive and all methods are safe no-ops.
	 * 
	 * @param {string} namespace - CloudWatch metrics namespace (1-256 chars, alphanumeric/hyphens/underscores/periods/slashes/@)
	 * @param {string} serviceName - Service name for the Metrics instance
	 * @example
	 * // Metrics available
	 * const helper = new MetricsHelper("CacheData", "my-service");
	 * helper.isActive; // true
	 * 
	 * // Metrics not installed
	 * const helper = new MetricsHelper("CacheData", "my-service");
	 * helper.isActive; // false
	 * 
	 * // Invalid namespace
	 * const helper = new MetricsHelper("", "my-service");
	 * helper.isActive; // false
	 */
	constructor(namespace, serviceName) {
		try {
			// Validate namespace before attempting import
			const resolvedNamespace = namespace || serviceName;
			if (!isValidNamespace(resolvedNamespace)) {
				console.warn(`[WARN] MetricsHelper: Invalid namespace "${resolvedNamespace}" — must be 1-256 chars of alphanumeric, hyphens, underscores, periods, forward slashes, or @`);
				return;
			}

			const { Metrics, MetricUnit } = require("@aws-lambda-powertools/metrics");
			this.#metrics = new Metrics({
				namespace: resolvedNamespace,
				serviceName
			});
			this.#MetricUnit = MetricUnit;
		} catch {
			// @aws-lambda-powertools/metrics not available — helper stays inactive
			this.#metrics = null;
			this.#MetricUnit = null;
		}
	}

	/**
	 * Whether the MetricsHelper is active (Metrics is available and instantiated).
	 * 
	 * @returns {boolean} true if Powertools Metrics is active, false otherwise
	 * @example
	 * const helper = new MetricsHelper("CacheData", "my-service");
	 * if (helper.isActive) {
	 *   helper.recordCacheHit(45);
	 * }
	 */
	get isActive() {
		return this.#metrics !== null;
	}

	/**
	 * Get the underlying Powertools Metrics instance (for advanced usage or testing).
	 * 
	 * @returns {Object|null} The Powertools Metrics instance, or null if unavailable
	 */
	get instance() {
		return this.#metrics;
	}

	/**
	 * Record a cache hit with read latency.
	 * 
	 * Emits:
	 * - CacheHit (Count, 1)
	 * - ReadLatency (Milliseconds, Math.round(durationMs))
	 * 
	 * Operation dimension: "cache-read"
	 * 
	 * @param {number} durationMs - Read operation duration in milliseconds
	 * @example
	 * helper.recordCacheHit(12.5); // Emits CacheHit=1, ReadLatency=13
	 */
	recordCacheHit(durationMs) {
		this._emit("cache-read", (m) => {
			m.addMetric("CacheHit", this.#MetricUnit.Count, 1);
			m.addMetric("ReadLatency", this.#MetricUnit.Milliseconds, Math.round(durationMs));
		});
	}

	/**
	 * Record a cache miss with read latency.
	 * 
	 * Emits:
	 * - CacheMiss (Count, 1)
	 * - ReadLatency (Milliseconds, Math.round(durationMs))
	 * 
	 * Operation dimension: "cache-read"
	 * 
	 * @param {number} durationMs - Read operation duration in milliseconds
	 * @example
	 * helper.recordCacheMiss(45.7); // Emits CacheMiss=1, ReadLatency=46
	 */
	recordCacheMiss(durationMs) {
		this._emit("cache-read", (m) => {
			m.addMetric("CacheMiss", this.#MetricUnit.Count, 1);
			m.addMetric("ReadLatency", this.#MetricUnit.Milliseconds, Math.round(durationMs));
		});
	}

	/**
	 * Record a cache write with write latency.
	 * 
	 * Emits:
	 * - WriteLatency (Milliseconds, Math.round(durationMs))
	 * 
	 * Operation dimension: "cache-write"
	 * 
	 * @param {number} durationMs - Write operation duration in milliseconds
	 * @example
	 * helper.recordCacheWrite(78.2); // Emits WriteLatency=78
	 */
	recordCacheWrite(durationMs) {
		this._emit("cache-write", (m) => {
			m.addMetric("WriteLatency", this.#MetricUnit.Milliseconds, Math.round(durationMs));
		});
	}

	/**
	 * Record an endpoint request completion with latency and optional error.
	 * 
	 * Emits:
	 * - EndpointLatency (Milliseconds, Math.round(durationMs))
	 * - EndpointError (Count, 1) — only when statusCode >= 400
	 * 
	 * Operation dimension: "endpoint-request"
	 * 
	 * @param {number} durationMs - Request duration in milliseconds
	 * @param {number} statusCode - HTTP status code of the response
	 * @example
	 * helper.recordEndpointRequest(120, 200); // Emits EndpointLatency=120
	 * helper.recordEndpointRequest(500, 503); // Emits EndpointLatency=500, EndpointError=1
	 */
	recordEndpointRequest(durationMs, statusCode) {
		this._emit("endpoint-request", (m) => {
			m.addMetric("EndpointLatency", this.#MetricUnit.Milliseconds, Math.round(durationMs));
			if (statusCode >= 400) {
				m.addMetric("EndpointError", this.#MetricUnit.Count, 1);
			}
		});
	}

	/**
	 * Record cold start metric (once per Lambda instance).
	 * 
	 * This method emits a ColdStart count metric exactly once. Subsequent calls
	 * are no-ops. After markWarm() is called, this method also becomes a no-op.
	 * 
	 * Emits:
	 * - ColdStart (Count, 1) — only on first call when #coldStart is true
	 * 
	 * Operation dimension: "endpoint-request"
	 * 
	 * @example
	 * helper.recordColdStart(); // Emits ColdStart=1
	 * helper.recordColdStart(); // No-op (already recorded)
	 */
	recordColdStart() {
		if (this.#coldStartRecorded || !this.#coldStart) {
			return;
		}
		this._emit("endpoint-request", (m) => {
			m.addMetric("ColdStart", this.#MetricUnit.Count, 1);
		});
		this.#coldStartRecorded = true;
	}

	/**
	 * Mark that the cold start phase is over.
	 * 
	 * After calling this method, recordColdStart() becomes a no-op even if
	 * it was never called. This is used to indicate that the Lambda instance
	 * has completed its first invocation.
	 * 
	 * @example
	 * helper.markWarm();
	 * helper.recordColdStart(); // No-op — instance is warm
	 */
	markWarm() {
		this.#coldStart = false;
	}

	/**
	 * Flush all buffered metrics.
	 * 
	 * Calls publishStoredMetrics() on the underlying Metrics instance to emit
	 * any buffered metrics. Should be called at the end of each Lambda invocation.
	 * 
	 * If flush fails, a warning is logged and no exception is thrown.
	 * 
	 * @example
	 * // At end of Lambda handler
	 * helper.flush();
	 */
	flush() {
		if (!this.#metrics) {
			return;
		}
		try {
			this.#metrics.publishStoredMetrics();
		} catch (error) {
			console.warn(`[WARN] MetricsHelper.flush failed: ${error?.message || "Unknown error"}`);
		}
	}

	/**
	 * Internal: emit metrics with an operation dimension.
	 * 
	 * Adds the "operation" dimension with the given value, calls the provided
	 * function to add metrics, then flushes via publishStoredMetrics().
	 * 
	 * All errors are caught and logged — metric emission never interrupts
	 * business logic.
	 * 
	 * @param {string} operation - Dimension value (e.g., "cache-read", "cache-write", "endpoint-request")
	 * @param {function} fn - Function that receives the Metrics instance and adds metrics
	 * @private
	 * @example
	 * // Internal usage
	 * this._emit("cache-read", (m) => {
	 *   m.addMetric("CacheHit", MetricUnit.Count, 1);
	 * });
	 */
	_emit(operation, fn) {
		if (!this.#metrics) {
			return;
		}
		try {
			this.#metrics.addDimension("operation", operation);
			fn(this.#metrics);
			this.#metrics.publishStoredMetrics();
		} catch (error) {
			console.warn(`[WARN] MetricsHelper._emit failed: ${error?.message || "Unknown error"}`);
		}
	}
}

/* =============================================================================
 * Test Harness
 * -------------------------------------------------------------------------- */

/**
 * Test harness for accessing internal classes and functions for testing purposes.
 * WARNING: This class is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
class TestHarness {
	/**
	 * Get access to internal classes and functions for testing purposes.
	 * WARNING: This method is for testing only and should never be used in production.
	 * 
	 * @returns {{MetricsHelper: typeof MetricsHelper, isValidNamespace: Function, NAMESPACE_PATTERN: RegExp, NAMESPACE_MAX_LENGTH: number, NAMESPACE_MIN_LENGTH: number}} Object containing internal classes and functions
	 * @private
	 * @example
	 * // In tests only - DO NOT use in production
	 * const { MetricsHelper, isValidNamespace } = TestHarness.getInternals();
	 * const helper = new MetricsHelper("TestNamespace", "test-service");
	 * expect(helper.isActive).toBe(false); // when Metrics not installed
	 * expect(isValidNamespace("valid-ns")).toBe(true);
	 */
	static getInternals() {
		return {
			MetricsHelper,
			isValidNamespace,
			NAMESPACE_PATTERN,
			NAMESPACE_MAX_LENGTH,
			NAMESPACE_MIN_LENGTH
		};
	}
}

/* =============================================================================
 * Module Exports
 * -------------------------------------------------------------------------- */

module.exports = {
	MetricsHelper,
	TestHarness
};
