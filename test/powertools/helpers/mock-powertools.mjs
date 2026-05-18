/**
 * Test helper for mocking AWS Lambda Powertools package imports.
 * 
 * Provides utilities to simulate Powertools packages being available or unavailable
 * for testing the auto-detection and initialization logic in PowertoolsInit.
 * 
 * WARNING: This module is for testing only and should NEVER be used in production code.
 * 
 * @private
 * @module test/powertools/helpers/mock-powertools
 */

/**
 * Create a mock Tracer instance that mimics @aws-lambda-powertools/tracer.
 * 
 * @returns {{Tracer: Function, mockTracer: Object}} Mock Tracer class and instance
 * @example
 * const { Tracer, mockTracer } = createMockTracer();
 * // mockTracer has all methods available for assertion
 * expect(mockTracer.captureAWSv3Client).toBeDefined();
 */
export function createMockTracer() {
	const mockTracer = {
		captureAWSv3Client: (client) => client,
		getSegment: () => ({
			addNewSubsegment: (name) => ({
				name,
				close: () => {},
				addError: () => {},
				parent: {}
			})
		}),
		setSegment: () => {},
		addAnnotation: () => {},
		addMetadata: () => {},
		addResponseAsMetadata: () => {},
		getRootXrayTraceId: () => "1-abc123-def456",
		isTracingEnabled: () => true
	};

	class Tracer {
		constructor(_options = {}) {
			Object.assign(this, mockTracer);
		}
	}

	// Attach methods to prototype so instanceof checks work
	Object.keys(mockTracer).forEach(key => {
		Tracer.prototype[key] = mockTracer[key];
	});

	return { Tracer, mockTracer };
}

/**
 * Create a mock Logger instance that mimics @aws-lambda-powertools/logger.
 * 
 * @returns {{Logger: Function, mockLogger: Object}} Mock Logger class and instance
 * @example
 * const { Logger, mockLogger } = createMockLogger();
 * // mockLogger has all log level methods
 * expect(mockLogger.info).toBeDefined();
 */
export function createMockLogger() {
	const logEntries = [];

	const mockLogger = {
		error: (message, extra) => logEntries.push({ level: "error", message, extra }),
		warn: (message, extra) => logEntries.push({ level: "warn", message, extra }),
		info: (message, extra) => logEntries.push({ level: "info", message, extra }),
		debug: (message, extra) => logEntries.push({ level: "debug", message, extra }),
		addContext: () => {},
		appendKeys: () => {},
		removeKeys: () => {},
		resetKeys: () => {},
		injectLambdaContext: () => (handler) => handler
	};

	class Logger {
		constructor(_options = {}) {
			Object.assign(this, mockLogger);
		}
	}

	Object.keys(mockLogger).forEach(key => {
		Logger.prototype[key] = mockLogger[key];
	});

	return { Logger, mockLogger, logEntries };
}

/**
 * Create a mock Metrics instance that mimics @aws-lambda-powertools/metrics.
 * 
 * @returns {{Metrics: Function, MetricUnit: Object, mockMetrics: Object, emittedMetrics: Array}} Mock Metrics class and utilities
 * @example
 * const { Metrics, MetricUnit, mockMetrics, emittedMetrics } = createMockMetrics();
 * // emittedMetrics collects all metrics for assertion
 */
export function createMockMetrics() {
	const emittedMetrics = [];

	const MetricUnit = {
		Count: "Count",
		Seconds: "Seconds",
		Milliseconds: "Milliseconds",
		Bytes: "Bytes",
		Kilobytes: "Kilobytes",
		Megabytes: "Megabytes",
		Percent: "Percent"
	};

	const mockMetrics = {
		addMetric: (name, unit, value) => emittedMetrics.push({ name, unit, value }),
		addDimension: (name, value) => emittedMetrics.push({ dimension: name, value }),
		publishStoredMetrics: () => {},
		captureColdStartMetric: () => {},
		logMetrics: () => (handler) => handler,
		setDefaultDimensions: () => {},
		clearDefaultDimensions: () => {},
		clearDimensions: () => {},
		clearMetrics: () => {}
	};

	class Metrics {
		constructor(_options = {}) {
			Object.assign(this, mockMetrics);
		}
	}

	Object.keys(mockMetrics).forEach(key => {
		Metrics.prototype[key] = mockMetrics[key];
	});

	return { Metrics, MetricUnit, mockMetrics, emittedMetrics };
}

/**
 * Configuration object for controlling which Powertools packages appear available.
 * 
 * @typedef {Object} PowertoolsAvailability
 * @property {boolean} tracer - Whether @aws-lambda-powertools/tracer is importable
 * @property {boolean} logger - Whether @aws-lambda-powertools/logger is importable
 * @property {boolean} metrics - Whether @aws-lambda-powertools/metrics is importable
 */

/**
 * Create a mock module resolver that simulates Powertools package availability.
 * Use with jest.mock() or manual module interception to control which packages
 * appear importable during tests.
 * 
 * @param {PowertoolsAvailability} availability - Which packages should be available
 * @returns {Object} Object with mock modules keyed by package name
 * @example
 * const mocks = createMockModules({ tracer: true, logger: false, metrics: true });
 * // mocks["@aws-lambda-powertools/tracer"] contains { Tracer }
 * // mocks["@aws-lambda-powertools/logger"] is undefined (simulates unavailable)
 * // mocks["@aws-lambda-powertools/metrics"] contains { Metrics, MetricUnit }
 */
export function createMockModules(availability = { tracer: true, logger: true, metrics: true }) {
	const modules = {};

	if (availability.tracer) {
		const { Tracer } = createMockTracer();
		modules["@aws-lambda-powertools/tracer"] = { Tracer };
	}

	if (availability.logger) {
		const { Logger } = createMockLogger();
		modules["@aws-lambda-powertools/logger"] = { Logger };
	}

	if (availability.metrics) {
		const { Metrics, MetricUnit } = createMockMetrics();
		modules["@aws-lambda-powertools/metrics"] = { Metrics, MetricUnit };
	}

	return modules;
}

/**
 * All 8 combinations of 3 Powertools packages being available or unavailable.
 * Useful for exhaustive testing of detection independence.
 * 
 * @type {Array<PowertoolsAvailability>}
 * @example
 * for (const combo of ALL_AVAILABILITY_COMBINATIONS) {
 *   // Test with this specific combination
 *   const mocks = createMockModules(combo);
 * }
 */
export const ALL_AVAILABILITY_COMBINATIONS = [
	{ tracer: false, logger: false, metrics: false },
	{ tracer: true,  logger: false, metrics: false },
	{ tracer: false, logger: true,  metrics: false },
	{ tracer: false, logger: false, metrics: true  },
	{ tracer: true,  logger: true,  metrics: false },
	{ tracer: true,  logger: false, metrics: true  },
	{ tracer: false, logger: true,  metrics: true  },
	{ tracer: true,  logger: true,  metrics: true  }
];
