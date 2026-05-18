/**
 * TracingProvider interface and implementations.
 * 
 * Provides a unified abstraction for tracing so that cache/endpoint code
 * does not duplicate logic for raw X-Ray vs Powertools Tracer.
 * 
 * Three implementations:
 * - NoOpTracingProvider: All methods are no-ops (tracing disabled)
 * - RawXRayProvider: Wraps aws-xray-sdk-core directly
 * - PowertoolsTracerProvider: Wraps @aws-lambda-powertools/tracer
 * 
 * All provider methods catch and swallow errors (log warning only, never throw).
 * This module is safe to require even if neither aws-xray-sdk-core nor
 * @aws-lambda-powertools/tracer is installed.
 * 
 * @private
 * @module src/lib/utils/TracingProvider
 */

/**
 * No-op tracing provider used when tracing is disabled.
 * All methods are safe no-ops that never throw.
 * 
 * @example
 * // Used internally when no tracing backend is available
 * const provider = new NoOpTracingProvider();
 * const client = provider.instrumentClient(myClient); // returns myClient unchanged
 * 
 * @private
 */
class NoOpTracingProvider {
	/**
	 * Provider identifier for diagnostics.
	 * 
	 * @returns {string} Provider name
	 */
	get name() { return "none"; }

	/**
	 * No-op: returns client unchanged.
	 * 
	 * @param {Object} client - AWS SDK v3 client instance
	 * @returns {Object} The same client, uninstrumented
	 */
	instrumentClient(client) { return client; }

	/**
	 * No-op: does nothing.
	 */
	captureHttp() {}

	/**
	 * No-op: returns null.
	 * 
	 * @param {string} _name - Subsegment name (ignored)
	 * @returns {null} Always returns null
	 */
	openSubsegment(_name) { return null; }

	/**
	 * No-op: does nothing.
	 * 
	 * @param {Object|null} _subsegment - Subsegment to close (ignored)
	 */
	closeSubsegment(_subsegment) {}

	/**
	 * No-op: does nothing.
	 * 
	 * @param {Error} _error - Error to record (ignored)
	 * @param {Object|null} _subsegment - Subsegment to record error on (ignored)
	 */
	addError(_error, _subsegment) {}
}

/**
 * RawXRayProvider wraps aws-xray-sdk-core directly.
 * Mirrors the existing X-Ray behavior in AWS.classes.js.
 * 
 * All methods catch and swallow errors, logging a warning via console.warn.
 * If aws-xray-sdk-core is not installed, the constructor will not throw;
 * the provider will simply have a null internal reference and methods will
 * return gracefully.
 * 
 * @example
 * // Used internally when Powertools Tracer is not available but X-Ray is enabled
 * const provider = new RawXRayProvider();
 * if (provider.name === "raw-xray") {
 *   const client = provider.instrumentClient(dynamoClient);
 * }
 * 
 * @private
 */
class RawXRayProvider {
	#xray = null;

	constructor() {
		try {
			this.#xray = require("aws-xray-sdk-core");
		} catch (error) {
			// aws-xray-sdk-core not available; provider won't be selected if import fails
			this.#xray = null;
		}
	}

	/**
	 * Provider identifier for diagnostics.
	 * 
	 * @returns {string} Provider name
	 */
	get name() { return "raw-xray"; }

	/**
	 * Instrument an AWS SDK v3 client for X-Ray tracing.
	 * 
	 * @param {Object} client - AWS SDK v3 client instance
	 * @returns {Object} Instrumented client, or original client on error
	 */
	instrumentClient(client) {
		try {
			return this.#xray.captureAWSv3Client(client);
		} catch (error) {
			console.warn(`[WARN] RawXRayProvider.instrumentClient failed: ${error.message}`);
			return client;
		}
	}

	/**
	 * Enable HTTP/HTTPS request tracing via aws-xray-sdk-core.
	 */
	captureHttp() {
		try {
			const captureOptions = {
				captureRequestInit: true,
				captureResponse: true,
				generateUniqueId: true
			};
			this.#xray.captureHTTPsGlobal(require("http"), captureOptions);
			this.#xray.captureHTTPsGlobal(require("https"), captureOptions);
		} catch (error) {
			console.warn(`[WARN] RawXRayProvider.captureHttp failed: ${error.message}`);
		}
	}

	/**
	 * Open a named subsegment for tracing a specific operation.
	 * 
	 * @param {string} name - Subsegment name (e.g., "cache-read")
	 * @returns {Object|null} The subsegment object, or null on error
	 */
	openSubsegment(name) {
		try {
			const segment = this.#xray.getSegment();
			if (segment) {
				return segment.addNewSubsegment(name);
			}
		} catch (error) {
			console.warn(`[WARN] RawXRayProvider.openSubsegment failed: ${error.message}`);
		}
		return null;
	}

	/**
	 * Close the given subsegment.
	 * 
	 * @param {Object|null} subsegment - Subsegment to close
	 */
	closeSubsegment(subsegment) {
		try {
			if (subsegment) {
				subsegment.close();
			}
		} catch (error) {
			console.warn(`[WARN] RawXRayProvider.closeSubsegment failed: ${error.message}`);
		}
	}

	/**
	 * Record an error on the given subsegment.
	 * 
	 * @param {Error} error - Error to record
	 * @param {Object|null} subsegment - Subsegment to record error on
	 */
	addError(error, subsegment) {
		try {
			if (subsegment) {
				subsegment.addError(error);
			}
		} catch (err) {
			console.warn(`[WARN] RawXRayProvider.addError failed: ${err.message}`);
		}
	}
}

/**
 * PowertoolsTracerProvider wraps @aws-lambda-powertools/tracer.
 * Provides enhanced tracing with custom subsegments, annotations, and metadata.
 * 
 * All methods catch and swallow errors, logging a warning via console.warn.
 * If @aws-lambda-powertools/tracer is not installed, the constructor will not throw;
 * the provider will simply have a null internal reference and methods will
 * return gracefully.
 * 
 * @example
 * // Used internally when Powertools Tracer is available and enabled
 * const provider = new PowertoolsTracerProvider("my-service");
 * const client = provider.instrumentClient(dynamoClient);
 * 
 * @private
 */
class PowertoolsTracerProvider {
	#tracer = null;

	/**
	 * Creates a new PowertoolsTracerProvider instance.
	 * 
	 * @param {string} [serviceName] - Service name for the Tracer instance
	 */
	constructor(serviceName) {
		try {
			const { Tracer } = require("@aws-lambda-powertools/tracer");
			this.#tracer = new Tracer({ serviceName });
		} catch (error) {
			// @aws-lambda-powertools/tracer not available
			this.#tracer = null;
		}
	}

	/**
	 * Provider identifier for diagnostics.
	 * 
	 * @returns {string} Provider name
	 */
	get name() { return "powertools-tracer"; }

	/**
	 * Get the underlying Tracer instance (for advanced usage).
	 * 
	 * @returns {Object|null} The Powertools Tracer instance, or null if unavailable
	 */
	get instance() { return this.#tracer; }

	/**
	 * Instrument an AWS SDK v3 client for Powertools tracing.
	 * 
	 * @param {Object} client - AWS SDK v3 client instance
	 * @returns {Object} Instrumented client, or original client on error
	 */
	instrumentClient(client) {
		try {
			return this.#tracer.captureAWSv3Client(client);
		} catch (error) {
			console.warn(`[WARN] PowertoolsTracerProvider.instrumentClient failed: ${error.message}`);
			return client;
		}
	}

	/**
	 * Enable HTTP/HTTPS request tracing.
	 * Powertools Tracer captures HTTP automatically when the provider is active,
	 * so this is a no-op for this provider.
	 */
	captureHttp() {
		// Powertools Tracer captures HTTP automatically when provider is active.
		// No explicit captureHTTPsGlobal needed.
	}

	/**
	 * Open a named subsegment for tracing a specific operation.
	 * 
	 * @param {string} name - Subsegment name (e.g., "cache-read")
	 * @returns {Object|null} The subsegment object, or null on error
	 */
	openSubsegment(name) {
		try {
			const segment = this.#tracer.getSegment();
			const subsegment = segment.addNewSubsegment(name);
			this.#tracer.setSegment(subsegment);
			return subsegment;
		} catch (error) {
			console.warn(`[WARN] PowertoolsTracerProvider.openSubsegment failed: ${error.message}`);
			return null;
		}
	}

	/**
	 * Close the given subsegment and restore the parent segment.
	 * 
	 * @param {Object|null} subsegment - Subsegment to close
	 */
	closeSubsegment(subsegment) {
		try {
			if (subsegment) {
				subsegment.close();
				this.#tracer.setSegment(subsegment.parent);
			}
		} catch (error) {
			console.warn(`[WARN] PowertoolsTracerProvider.closeSubsegment failed: ${error.message}`);
		}
	}

	/**
	 * Record an error on the given subsegment.
	 * 
	 * @param {Error} error - Error to record
	 * @param {Object|null} subsegment - Subsegment to record error on
	 */
	addError(error, subsegment) {
		try {
			if (subsegment) {
				subsegment.addError(error);
			}
		} catch (err) {
			console.warn(`[WARN] PowertoolsTracerProvider.addError failed: ${err.message}`);
		}
	}
}

/**
 * Test harness for accessing internal classes for testing purposes.
 * WARNING: This class is for testing only and should NEVER be used in production code.
 * 
 * @private
 */
class TestHarness {
	/**
	 * Get access to internal classes for testing purposes.
	 * WARNING: This method is for testing only and should never be used in production.
	 * 
	 * @returns {{NoOpTracingProvider: typeof NoOpTracingProvider, RawXRayProvider: typeof RawXRayProvider, PowertoolsTracerProvider: typeof PowertoolsTracerProvider}} Object containing internal classes
	 * @private
	 * @example
	 * // In tests only - DO NOT use in production
	 * const { NoOpTracingProvider, RawXRayProvider, PowertoolsTracerProvider } = TestHarness.getInternals();
	 */
	static getInternals() {
		return {
			NoOpTracingProvider,
			RawXRayProvider,
			PowertoolsTracerProvider
		};
	}
}

module.exports = {
	NoOpTracingProvider,
	RawXRayProvider,
	PowertoolsTracerProvider,
	TestHarness
};
