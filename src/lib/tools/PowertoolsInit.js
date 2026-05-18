/**
 * PowertoolsInit - Auto-detection, environment variable parsing, and initialization
 * orchestration for AWS Lambda Powertools integration.
 * 
 * This module detects installed Powertools packages at module load time and configures
 * tracing, logging, and metrics capabilities based on environment variables and package
 * availability. It follows the same guarded initialization pattern as the existing
 * X-Ray integration in AWS.classes.js.
 * 
 * Environment Variables:
 * - CACHE_DATA_POWERTOOLS: Master switch for all Powertools features
 * - CACHE_DATA_POWERTOOLS_TRACER: Individual tracer control
 * - CACHE_DATA_POWERTOOLS_LOGGER: Individual logger control
 * - CACHE_DATA_POWERTOOLS_METRICS: Individual metrics control
 * 
 * @private
 * @module src/lib/tools/PowertoolsInit
 */

"use strict";

const { NoOpTracingProvider, RawXRayProvider, PowertoolsTracerProvider } = require("../utils/TracingProvider.js");
const LoggerBridge = require("../utils/LoggerBridge.js").LoggerBridge;
const MetricsHelper = require("../utils/MetricsHelper.js").MetricsHelper;

/* =============================================================================
 * Module State
 * -------------------------------------------------------------------------- */

/**
 * Guard flag ensuring initialization runs at most once.
 * @type {boolean}
 * @private
 */
let powertoolsInitialized = false;

/**
 * Internal state tracking availability and enablement of each capability.
 * @type {{tracer: {available: boolean, enabled: boolean, instance: Object|null}, logger: {available: boolean, enabled: boolean, instance: Object|null}, metrics: {available: boolean, enabled: boolean, instance: Object|null}}}
 * @private
 */
const powertoolsState = {
	tracer: { available: false, enabled: false, instance: null },
	logger: { available: false, enabled: false, instance: null },
	metrics: { available: false, enabled: false, instance: null }
};

/* =============================================================================
 * Environment Variable Parsing
 * -------------------------------------------------------------------------- */

/**
 * Parse a Powertools environment variable value into a boolean decision.
 * 
 * Values "0", "false", "no" (case-insensitive) are treated as disabled.
 * Unset, null, or empty string are treated as unset (null).
 * All other non-empty string values are treated as enabled.
 * 
 * @param {string|undefined|null} value - The environment variable value
 * @returns {boolean|null} true=enabled, false=disabled, null=unset
 * @example
 * parseEnvFlag("true")     // true
 * parseEnvFlag("1")        // true
 * parseEnvFlag("yes")      // true
 * parseEnvFlag("false")    // false
 * parseEnvFlag("0")        // false
 * parseEnvFlag("no")       // false
 * parseEnvFlag(undefined)  // null
 * parseEnvFlag("")         // null
 * parseEnvFlag("anything") // true
 */
function parseEnvFlag(value) {
	if (value === undefined || value === null || value === "") {
		return null;
	}
	const lower = value.toLowerCase();
	if (lower === "0" || lower === "false" || lower === "no") {
		return false;
	}
	return true;
}

/* =============================================================================
 * Capability Enablement Logic
 * -------------------------------------------------------------------------- */

/**
 * Determine if a specific capability is enabled based on environment variable flags
 * and package importability.
 * 
 * Logic:
 * - If globalFlag is false, capability is always disabled (master switch off)
 * - If individualFlag is false, capability is disabled regardless of importability
 * - Otherwise, capability is enabled if and only if the package is importable
 * 
 * @param {boolean|null} globalFlag - Parsed value of CACHE_DATA_POWERTOOLS
 * @param {boolean|null} individualFlag - Parsed value of individual capability env var
 * @param {boolean} isImportable - Whether the package was successfully imported
 * @returns {boolean} Whether the capability should be enabled
 * @example
 * isCapabilityEnabled(null, null, true)   // true (package available, no overrides)
 * isCapabilityEnabled(false, null, true)  // false (global disabled)
 * isCapabilityEnabled(null, false, true)  // false (individual disabled)
 * isCapabilityEnabled(null, null, false)  // false (package not available)
 */
function isCapabilityEnabled(globalFlag, individualFlag, isImportable) {
	if (globalFlag === false) {
		return false;
	}
	if (individualFlag === false) {
		return false;
	}
	return isImportable;
}

/* =============================================================================
 * Package Detection
 * -------------------------------------------------------------------------- */

/**
 * Attempt to require a package. Returns true if the package is importable,
 * false otherwise. Errors are silently caught.
 * 
 * @param {string} packageName - The npm package name to attempt importing
 * @returns {boolean} true if require() succeeded, false otherwise
 * @example
 * tryImport("@aws-lambda-powertools/tracer")  // true if installed
 * tryImport("nonexistent-package")            // false
 */
function tryImport(packageName) {
	try {
		require(packageName);
		return true;
	} catch {
		return false;
	}
}

/* =============================================================================
 * Capability Initialization Stubs
 * -------------------------------------------------------------------------- */

/**
 * Determine if X-Ray is enabled via the existing environment variables.
 * Checks both `CacheData_AWSXRayOn` and `CACHE_DATA_AWS_X_RAY_ON`.
 * 
 * @returns {boolean} True if either X-Ray env var is truthy
 * @private
 */
function isXRayEnvOn() {
	const val1 = process.env.CacheData_AWSXRayOn;
	const val2 = process.env.CACHE_DATA_AWS_X_RAY_ON;
	return isTruthyEnvValue(val1) || isTruthyEnvValue(val2);
}

/**
 * Check if an environment variable value is truthy.
 * Values "true", "1" (case-insensitive) are truthy.
 * 
 * @param {string|undefined|null} value - The environment variable value
 * @returns {boolean} True if the value is truthy
 * @private
 */
function isTruthyEnvValue(value) {
	if (value === undefined || value === null || value === "") {
		return false;
	}
	const lower = value.toLowerCase();
	return lower === "true" || lower === "1";
}

/**
 * Initialize the Tracer capability.
 * Selects a TracingProvider based on the following precedence rules:
 * 1. PowertoolsTracerProvider when tracer is importable and not disabled
 * 2. RawXRayProvider when tracer is not available but CacheData_AWSXRayOn is true
 * 3. NoOpTracingProvider otherwise
 * 
 * If PowertoolsTracerProvider construction fails (instance is null after construction),
 * falls back to RawXRayProvider if X-Ray is on, or NoOpTracingProvider otherwise.
 * 
 * Stores the selected provider in powertoolsState.tracer.instance.
 * 
 * @private
 */
function initTracer() {
	try {
		const xrayOn = isXRayEnvOn();
		const serviceName = process.env.POWERTOOLS_SERVICE_NAME || "@63klabs/cache-data";

		if (powertoolsState.tracer.enabled) {
			// Attempt PowertoolsTracerProvider
			const provider = new PowertoolsTracerProvider(serviceName);

			if (provider.instance !== null) {
				powertoolsState.tracer.instance = provider;
				console.warn("[PowertoolsInit] Tracer provider selected: powertools-tracer");
				return;
			}

			// PowertoolsTracerProvider construction failed (instance is null)
			console.warn("[PowertoolsInit] PowertoolsTracerProvider initialization failed, falling back");

			if (xrayOn) {
				powertoolsState.tracer.instance = new RawXRayProvider();
				console.warn("[PowertoolsInit] Tracer provider selected: raw-xray (fallback)");
			} else {
				powertoolsState.tracer.instance = new NoOpTracingProvider();
				powertoolsState.tracer.enabled = false;
				console.warn("[PowertoolsInit] Tracer provider selected: none (fallback)");
			}
			return;
		}

		// Tracer not enabled via Powertools - check X-Ray env vars
		if (xrayOn) {
			powertoolsState.tracer.instance = new RawXRayProvider();
			console.warn("[PowertoolsInit] Tracer provider selected: raw-xray");
		} else {
			powertoolsState.tracer.instance = new NoOpTracingProvider();
			console.warn("[PowertoolsInit] Tracer provider selected: none");
		}
	} catch (error) {
		console.warn(`[WARN] PowertoolsInit.initTracer failed: ${error?.message || "Unknown error"}`);
		powertoolsState.tracer.instance = new NoOpTracingProvider();
		powertoolsState.tracer.enabled = false;
	}
}

/**
 * Initialize the Logger capability.
 * Creates a LoggerBridge instance with the service name derived from:
 * 1. POWERTOOLS_SERVICE_NAME environment variable (if set and non-empty)
 * 2. Default package name "@63klabs/cache-data"
 * 
 * Stores the instance in powertoolsState.logger.instance for retrieval
 * via getLoggerBridge().
 * 
 * If LoggerBridge construction fails, logs a warning and disables the logger.
 * 
 * @private
 */
function initLogger() {
	try {
		const serviceName = process.env.POWERTOOLS_SERVICE_NAME || "@63klabs/cache-data";
		const bridge = new LoggerBridge(serviceName);
		powertoolsState.logger.instance = bridge;
		console.warn("[PowertoolsInit] Logger initialized with service name: " + serviceName);
	} catch (error) {
		console.warn(`[WARN] PowertoolsInit.initLogger failed: ${error?.message || "Unknown error"}`);
		powertoolsState.logger.enabled = false;
	}
}

/**
 * Validate a CloudWatch metrics namespace string.
 * CloudWatch namespace rules: 1-256 characters, containing only alphanumeric characters,
 * hyphens, underscores, periods, forward slashes, and the @ symbol.
 * 
 * @param {string} namespace - The namespace string to validate
 * @returns {boolean} True if the namespace is valid, false otherwise
 * @private
 */
function isValidNamespace(namespace) {
	if (typeof namespace !== "string" || namespace.length === 0 || namespace.length > 256) {
		return false;
	}
	// CloudWatch namespace valid characters: alphanumeric, hyphens, underscores, periods,
	// forward slashes, and @ symbol (for scoped package names)
	return /^[a-zA-Z0-9._\-/@]+$/.test(namespace);
}

/**
 * Initialize the Metrics capability.
 * Creates a MetricsHelper instance with namespace derived from:
 * 1. POWERTOOLS_METRICS_NAMESPACE environment variable (if set and non-empty)
 * 2. POWERTOOLS_SERVICE_NAME environment variable (if set and non-empty)
 * 3. Default package name "@63klabs/cache-data"
 * 
 * The service name is derived from:
 * 1. POWERTOOLS_SERVICE_NAME environment variable (if set and non-empty)
 * 2. Default package name "@63klabs/cache-data"
 * 
 * Validates the namespace (1-256 chars, CloudWatch-valid characters).
 * If validation fails or MetricsHelper construction fails, logs a warning and disables metrics.
 * 
 * Stores the instance in powertoolsState.metrics.instance for retrieval via getMetricsHelper().
 * 
 * @private
 */
function initMetrics() {
	try {
		const defaultName = "@63klabs/cache-data";
		const serviceName = process.env.POWERTOOLS_SERVICE_NAME || defaultName;
		const namespace = process.env.POWERTOOLS_METRICS_NAMESPACE || serviceName;

		// Validate namespace (1-256 chars, CloudWatch-valid characters)
		if (!isValidNamespace(namespace)) {
			console.warn(`[WARN] PowertoolsInit.initMetrics: Invalid namespace "${namespace}" (must be 1-256 chars, alphanumeric/hyphens/underscores/periods/slashes/@). Metrics disabled.`);
			powertoolsState.metrics.enabled = false;
			return;
		}

		const helper = new MetricsHelper(namespace, serviceName);
		powertoolsState.metrics.instance = helper;
		console.warn("[PowertoolsInit] Metrics initialized with namespace: " + namespace);
	} catch (error) {
		console.warn(`[WARN] PowertoolsInit.initMetrics failed: ${error?.message || "Unknown error"}`);
		powertoolsState.metrics.enabled = false;
	}
}

/* =============================================================================
 * Main Initialization
 * -------------------------------------------------------------------------- */

/**
 * Initialize Powertools integration. Runs at most once due to initialization guard.
 * Called from tools/index.js at module load time.
 * 
 * Performs the following steps:
 * 1. Reads CACHE_DATA_POWERTOOLS* environment variables
 * 2. Attempts to import each Powertools package independently
 * 3. Determines enabled state for each capability
 * 4. Initializes enabled capabilities (tracer, logger, metrics)
 * 
 * This function never throws. All errors are caught and logged as warnings.
 * 
 * @returns {{tracer: boolean, logger: boolean, metrics: boolean}} Current enabled state
 * @example
 * const state = initPowertools();
 * // state.tracer === true if @aws-lambda-powertools/tracer is installed and enabled
 * // state.logger === true if @aws-lambda-powertools/logger is installed and enabled
 * // state.metrics === true if @aws-lambda-powertools/metrics is installed and enabled
 */
function initPowertools() {
	if (powertoolsInitialized) {
		return getState();
	}

	try {
		// Read environment variable flags
		const globalFlag = parseEnvFlag(process.env.CACHE_DATA_POWERTOOLS);
		const tracerFlag = parseEnvFlag(process.env.CACHE_DATA_POWERTOOLS_TRACER);
		const loggerFlag = parseEnvFlag(process.env.CACHE_DATA_POWERTOOLS_LOGGER);
		const metricsFlag = parseEnvFlag(process.env.CACHE_DATA_POWERTOOLS_METRICS);

		// Attempt imports independently - each detection is isolated
		powertoolsState.tracer.available = tryImport("@aws-lambda-powertools/tracer");
		powertoolsState.logger.available = tryImport("@aws-lambda-powertools/logger");
		powertoolsState.metrics.available = tryImport("@aws-lambda-powertools/metrics");

		// Determine enabled state using capability enablement logic
		powertoolsState.tracer.enabled = isCapabilityEnabled(
			globalFlag, tracerFlag, powertoolsState.tracer.available
		);
		powertoolsState.logger.enabled = isCapabilityEnabled(
			globalFlag, loggerFlag, powertoolsState.logger.available
		);
		powertoolsState.metrics.enabled = isCapabilityEnabled(
			globalFlag, metricsFlag, powertoolsState.metrics.available
		);

		// Initialize tracer (always runs - handles Powertools, X-Ray, or NoOp selection)
		initTracer();

		// Initialize other enabled capabilities
		if (powertoolsState.logger.enabled) {
			initLogger();
		}
		if (powertoolsState.metrics.enabled) {
			initMetrics();
		}
	} catch (error) {
		// Never throw from initialization - log warning and continue
		console.warn(`[WARN] PowertoolsInit.initPowertools failed: ${error?.message || "Unknown error"}`);
	}

	powertoolsInitialized = true;
	return getState();
}

/* =============================================================================
 * State Accessors
 * -------------------------------------------------------------------------- */

/**
 * Get the current Powertools state for programmatic querying.
 * Returns which capabilities are currently enabled.
 * 
 * @returns {{tracer: boolean, logger: boolean, metrics: boolean}} Enabled state for each capability
 * @example
 * const state = getState();
 * if (state.tracer) {
 *   console.log("Tracer is active");
 * }
 */
function getState() {
	return {
		tracer: powertoolsState.tracer.enabled,
		logger: powertoolsState.logger.enabled,
		metrics: powertoolsState.metrics.enabled
	};
}

/**
 * Get the active TracingProvider instance.
 * Returns the provider selected during initialization based on precedence rules:
 * PowertoolsTracerProvider > RawXRayProvider > NoOpTracingProvider.
 * 
 * @returns {Object|null} The active TracingProvider instance, or null if not yet initialized
 * @example
 * const provider = getActiveTracingProvider();
 * if (provider) {
 *   provider.instrumentClient(client);
 * }
 */
function getActiveTracingProvider() {
	return powertoolsState.tracer.instance;
}

/**
 * Get the active LoggerBridge instance.
 * Returns the LoggerBridge created during initialization, or null if logger is disabled.
 * 
 * @returns {Object|null} The active LoggerBridge instance, or null if logger is disabled
 * @example
 * const bridge = getLoggerBridge();
 * if (bridge && bridge.isActive) {
 *   bridge.log("info", "Hello", { key: "value" });
 * }
 */
function getLoggerBridge() {
	return powertoolsState.logger.instance;
}

/**
 * Get the active MetricsHelper instance.
 * Returns the MetricsHelper created during initialization, or null if metrics is disabled.
 * 
 * @returns {Object|null} The active MetricsHelper instance, or null if metrics is disabled
 * @example
 * const metrics = getMetricsHelper();
 * if (metrics && metrics.isActive) {
 *   metrics.recordCacheHit(45);
 * }
 */
function getMetricsHelper() {
	return powertoolsState.metrics.instance;
}

/* =============================================================================
 * Test Harness
 * -------------------------------------------------------------------------- */

/**
 * Test harness for accessing internal functions for testing purposes.
 * WARNING: This class is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
class TestHarness {
	/**
	 * Get access to internal functions for testing purposes.
	 * WARNING: This method is for testing only and should never be used in production.
	 * 
	 * @returns {{parseEnvFlag: Function, isCapabilityEnabled: Function, tryImport: Function, powertoolsState: Object, resetForTesting: Function}} Object containing internal functions
	 * @private
	 * @example
	 * // In tests only - DO NOT use in production
	 * const { parseEnvFlag, isCapabilityEnabled } = TestHarness.getInternals();
	 * expect(parseEnvFlag("false")).toBe(false);
	 */
	static getInternals() {
		return {
			parseEnvFlag,
			isCapabilityEnabled,
			tryImport,
			isValidNamespace,
			powertoolsState,
			/**
			 * Reset initialization state for testing. Allows initPowertools() to run again.
			 * WARNING: For testing only.
			 * @private
			 */
			resetForTesting() {
				powertoolsInitialized = false;
				powertoolsState.tracer.available = false;
				powertoolsState.tracer.enabled = false;
				powertoolsState.tracer.instance = null;
				powertoolsState.logger.available = false;
				powertoolsState.logger.enabled = false;
				powertoolsState.logger.instance = null;
				powertoolsState.metrics.available = false;
				powertoolsState.metrics.enabled = false;
				powertoolsState.metrics.instance = null;
			}
		};
	}
}

/* =============================================================================
 * Metrics Flush
 * -------------------------------------------------------------------------- */

/**
 * Flush all buffered Powertools metrics for the current invocation.
 * 
 * This function should be called at the end of each Lambda invocation to ensure
 * all buffered metrics are emitted. It is automatically called by Response.finalize(),
 * but can also be called manually for handlers that don't use the Response class.
 * 
 * This function never throws. If flush fails, a warning is logged and execution
 * continues normally.
 * 
 * @returns {void}
 * @example
 * // At end of Lambda handler (if not using Response.finalize())
 * const { flushMetrics } = require("@63klabs/cache-data").tools;
 * 
 * exports.handler = async (event) => {
 *   // ... handler logic ...
 *   flushMetrics();
 *   return result;
 * };
 */
function flushMetrics() {
	try {
		const metricsHelper = getMetricsHelper();
		if (metricsHelper && metricsHelper.isActive) {
			metricsHelper.flush();
		}
	} catch (error) {
		// Never throw from flush — log warning and continue
		console.warn(`[WARN] PowertoolsInit.flushMetrics failed: ${error?.message || "Unknown error"}`);
	}
}

/* =============================================================================
 * Module Exports
 * -------------------------------------------------------------------------- */

module.exports = {
	initPowertools,
	getState,
	getActiveTracingProvider,
	getLoggerBridge,
	getMetricsHelper,
	flushMetrics,
	TestHarness
};
