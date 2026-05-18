/**
 * LoggerBridge - Delegation layer between DebugAndLog and Powertools Logger.
 * 
 * When @aws-lambda-powertools/logger is available and enabled, this bridge
 * outputs structured JSON via the Powertools Logger instance. When the Logger
 * is not available, the bridge is inactive and DebugAndLog falls back to its
 * existing console-based output.
 * 
 * Features:
 * - Safe import of @aws-lambda-powertools/logger (never throws)
 * - Lambda context enrichment via addContext()
 * - X-Ray trace ID correlation in log entries
 * - Level mapping from DebugAndLog tags to Powertools levels
 * - All methods catch and swallow errors (never throw)
 * 
 * @private
 * @module src/lib/utils/LoggerBridge
 */

"use strict";

/* =============================================================================
 * Level Mapping
 * -------------------------------------------------------------------------- */

/**
 * Mapping from DebugAndLog tags to Powertools Logger levels.
 * 
 * @type {Object.<string, string>}
 * @private
 */
const LEVEL_MAP = Object.create(null);
LEVEL_MAP["ERROR"] = "error";
LEVEL_MAP["WARN"] = "warn";
LEVEL_MAP["INFO"] = "info";
LEVEL_MAP["MSG"] = "info";
LEVEL_MAP["DIAG"] = "debug";
LEVEL_MAP["DEBUG"] = "debug";
LEVEL_MAP["LOG"] = "info";

/* =============================================================================
 * LoggerBridge Class
 * -------------------------------------------------------------------------- */

/**
 * LoggerBridge provides the delegation layer between DebugAndLog and
 * Powertools Logger. When Logger is available, it outputs structured JSON.
 * When absent, isActive returns false and DebugAndLog falls back to console.
 * 
 * All methods are safe — they catch and swallow errors to ensure logging
 * never interrupts business logic.
 * 
 * @example
 * // Used internally by PowertoolsInit
 * const bridge = new LoggerBridge("my-service");
 * if (bridge.isActive) {
 *   bridge.log("info", "Hello world", { key: "value" });
 * }
 * 
 * @private
 */
class LoggerBridge {
	#logger = null;

	/**
	 * Creates a new LoggerBridge instance.
	 * 
	 * Attempts to import @aws-lambda-powertools/logger and create a Logger
	 * instance with the given service name. If the import fails (package not
	 * installed), the bridge remains inactive and all methods are safe no-ops.
	 * 
	 * @param {string} serviceName - Service name for the Logger instance
	 * @example
	 * // Logger available
	 * const bridge = new LoggerBridge("my-service");
	 * bridge.isActive; // true
	 * 
	 * // Logger not installed
	 * const bridge = new LoggerBridge("my-service");
	 * bridge.isActive; // false
	 */
	constructor(serviceName) {
		try {
			const { Logger } = require("@aws-lambda-powertools/logger");
			this.#logger = new Logger({ serviceName });
		} catch {
			// @aws-lambda-powertools/logger not available — bridge stays inactive
			this.#logger = null;
		}
	}

	/**
	 * Whether the LoggerBridge is active (Logger is available and instantiated).
	 * 
	 * @returns {boolean} true if Powertools Logger is active, false otherwise
	 * @example
	 * const bridge = new LoggerBridge("my-service");
	 * if (bridge.isActive) {
	 *   bridge.log("info", "Structured logging enabled");
	 * }
	 */
	get isActive() {
		return this.#logger !== null;
	}

	/**
	 * Get the underlying Powertools Logger instance (for advanced usage or testing).
	 * 
	 * @returns {Object|null} The Powertools Logger instance, or null if unavailable
	 */
	get instance() {
		return this.#logger;
	}

	/**
	 * Inject Lambda context for log enrichment.
	 * 
	 * When the Logger is active, this adds Lambda context information
	 * (awsRequestId, functionName, etc.) to all subsequent log entries.
	 * When the Logger is inactive, this is a safe no-op.
	 * 
	 * @param {Object} context - Lambda context object
	 * @example
	 * // In Lambda handler
	 * exports.handler = async (event, context) => {
	 *   bridge.addContext(context);
	 *   // All subsequent logs include Lambda context
	 * };
	 */
	addContext(context) {
		try {
			if (this.#logger && context) {
				this.#logger.addContext(context);
			}
		} catch {
			// Swallow errors — context enrichment is best-effort
		}
	}

	/**
	 * Log a message at the specified level with optional additional data.
	 * 
	 * When the Logger is active:
	 * - Invokes the Powertools Logger at the specified level
	 * - Includes obj as a `details` property when non-null
	 * - Includes X-Ray trace ID from process.env._X_AMZN_TRACE_ID when available
	 * 
	 * When the Logger is inactive, this is a safe no-op.
	 * 
	 * @param {string} level - Powertools log level ("error", "warn", "info", or "debug")
	 * @param {string} message - Log message
	 * @param {Object|null} [obj=null] - Additional data to include as `details` property
	 * @example
	 * // Simple message
	 * bridge.log("info", "Cache hit for key abc123");
	 * 
	 * // Message with additional data
	 * bridge.log("error", "Request failed", { statusCode: 500, url: "/api/data" });
	 * 
	 * // With X-Ray trace ID (automatically included when env var is set)
	 * // process.env._X_AMZN_TRACE_ID = "Root=1-abc-def;Parent=ghi;Sampled=1"
	 * bridge.log("info", "Processing request");
	 * // Output includes: { xray_trace_id: "Root=1-abc-def;Parent=ghi;Sampled=1" }
	 */
	log(level, message, obj = null) {
		try {
			if (!this.#logger) {
				return;
			}

			const extra = {};

			// Include additional data as `details` property when non-null
			if (obj !== null && obj !== undefined) {
				extra.details = obj;
			}

			// Include X-Ray trace ID if available
			const traceId = process.env._X_AMZN_TRACE_ID || null;
			if (traceId) {
				extra.xray_trace_id = traceId;
			}

			this.#logger[level](message, extra);
		} catch {
			// Swallow errors — logging must never interrupt business logic
		}
	}

	/**
	 * Map a DebugAndLog tag to the corresponding Powertools Logger level.
	 * 
	 * Mapping:
	 * - ERROR → error
	 * - WARN → warn
	 * - INFO → info
	 * - MSG → info
	 * - DIAG → debug
	 * - DEBUG → debug
	 * - LOG → info
	 * 
	 * Unknown tags default to "info".
	 * 
	 * @param {string} tag - DebugAndLog tag (e.g., "ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG", "LOG")
	 * @returns {string} Powertools Logger level ("error", "warn", "info", or "debug")
	 * @example
	 * LoggerBridge.mapLevel("ERROR");  // "error"
	 * LoggerBridge.mapLevel("WARN");   // "warn"
	 * LoggerBridge.mapLevel("INFO");   // "info"
	 * LoggerBridge.mapLevel("MSG");    // "info"
	 * LoggerBridge.mapLevel("DIAG");   // "debug"
	 * LoggerBridge.mapLevel("DEBUG");  // "debug"
	 * LoggerBridge.mapLevel("LOG");    // "info"
	 */
	static mapLevel(tag) {
		return LEVEL_MAP[tag] || "info";
	}
}

/* =============================================================================
 * Test Harness
 * -------------------------------------------------------------------------- */

/**
 * Test harness for accessing internal classes and constants for testing purposes.
 * WARNING: This class is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
class TestHarness {
	/**
	 * Get access to internal classes and constants for testing purposes.
	 * WARNING: This method is for testing only and should never be used in production.
	 * 
	 * @returns {{LoggerBridge: typeof LoggerBridge, LEVEL_MAP: Object}} Object containing internal classes and constants
	 * @private
	 * @example
	 * // In tests only - DO NOT use in production
	 * const { LoggerBridge, LEVEL_MAP } = TestHarness.getInternals();
	 * const bridge = new LoggerBridge("test-service");
	 * expect(bridge.isActive).toBe(false); // when Logger not installed
	 */
	static getInternals() {
		return {
			LoggerBridge,
			LEVEL_MAP
		};
	}
}

/* =============================================================================
 * Module Exports
 * -------------------------------------------------------------------------- */

module.exports = {
	LoggerBridge,
	TestHarness
};
