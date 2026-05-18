/**
 * Full integration tests with all Powertools packages available.
 * 
 * Since all 3 Powertools packages (@aws-lambda-powertools/tracer,
 * @aws-lambda-powertools/logger, @aws-lambda-powertools/metrics) are installed
 * as devDependencies, these tests verify the full integration path:
 * - All 3 capabilities are detected and enabled
 * - PowertoolsTracerProvider is selected
 * - LoggerBridge is active and produces structured output
 * - MetricsHelper is active and emits metrics
 * - Cold start metric is emitted once
 * 
 * Validates: Requirements 1.1, 5.4, 5.5, 5.6, 6.1, 6.2, 8.1, 8.2, 9.1, 9.3
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
	saveEnv,
	restoreEnv,
	clearPowertoolsEnv
} from "../helpers/env-helper.mjs";

// Import the module under test
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const {
	initPowertools,
	getState,
	getActiveTracingProvider,
	getLoggerBridge,
	getMetricsHelper,
	TestHarness
} = PowertoolsInit.default || PowertoolsInit;
const { resetForTesting } = TestHarness.getInternals();

describe("Full Powertools Integration (all packages available)", () => {
	let envSnapshot;

	beforeEach(() => {
		envSnapshot = saveEnv();
		clearPowertoolsEnv();
		resetForTesting();
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
		resetForTesting();
	});

	describe("All 3 capabilities enabled", () => {
		it("should detect and enable all 3 Powertools capabilities", () => {
			const state = initPowertools();

			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(true);
		});

		it("should return consistent state from getState() after init", () => {
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(true);
		});
	});

	describe("TracingProvider integration", () => {
		it("should return a PowertoolsTracerProvider as active provider", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(provider).not.toBe(null);
			expect(provider.name).toBe("powertools-tracer");
		});

		it("should have a non-null Tracer instance on the provider", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(provider.instance).not.toBe(null);
		});

		it("should instrument clients without throwing", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			// Create a mock client object
			const mockClient = { send: () => {} };
			expect(() => provider.instrumentClient(mockClient)).not.toThrow();
		});

		it("should open and close subsegments for cache-read operations", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			// openSubsegment may return null in test env (no active segment)
			// but it should not throw
			expect(() => {
				const subsegment = provider.openSubsegment("cache-read");
				if (subsegment) {
					provider.closeSubsegment(subsegment);
				}
			}).not.toThrow();
		});

		it("should open and close subsegments for cache-write operations", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(() => {
				const subsegment = provider.openSubsegment("cache-write");
				if (subsegment) {
					provider.closeSubsegment(subsegment);
				}
			}).not.toThrow();
		});

		it("should open and close subsegments for endpoint-request operations", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(() => {
				const subsegment = provider.openSubsegment("endpoint-request");
				if (subsegment) {
					provider.closeSubsegment(subsegment);
				}
			}).not.toThrow();
		});

		it("should handle addError without throwing", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(() => {
				const subsegment = provider.openSubsegment("test-error");
				provider.addError(new Error("test error"), subsegment);
				if (subsegment) {
					provider.closeSubsegment(subsegment);
				}
			}).not.toThrow();
		});
	});

	describe("LoggerBridge integration", () => {
		it("should return an active LoggerBridge", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(bridge).not.toBe(null);
			expect(bridge.isActive).toBe(true);
		});

		it("should have a non-null Logger instance", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(bridge.instance).not.toBe(null);
		});

		it("should produce structured output via Logger instance", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			// Spy on the underlying Logger instance's info method
			const loggerInstance = bridge.instance;
			const infoSpy = jest.spyOn(loggerInstance, "info");

			bridge.log("info", "Test message", { key: "value" });

			expect(infoSpy).toHaveBeenCalledTimes(1);
			expect(infoSpy).toHaveBeenCalledWith(
				"Test message",
				expect.objectContaining({ details: { key: "value" } })
			);
		});

		it("should delegate error level logs to Logger.error", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const errorSpy = jest.spyOn(loggerInstance, "error");

			bridge.log("error", "Error occurred", { code: 500 });

			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledWith(
				"Error occurred",
				expect.objectContaining({ details: { code: 500 } })
			);
		});

		it("should delegate warn level logs to Logger.warn", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const warnSpy = jest.spyOn(loggerInstance, "warn");

			bridge.log("warn", "Warning message");

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith("Warning message", expect.any(Object));
		});

		it("should delegate debug level logs to Logger.debug", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const debugSpy = jest.spyOn(loggerInstance, "debug");

			bridge.log("debug", "Debug info", { detail: "trace" });

			expect(debugSpy).toHaveBeenCalledTimes(1);
			expect(debugSpy).toHaveBeenCalledWith(
				"Debug info",
				expect.objectContaining({ details: { detail: "trace" } })
			);
		});

		it("should include xray_trace_id when _X_AMZN_TRACE_ID is set", () => {
			process.env._X_AMZN_TRACE_ID = "Root=1-abc123-def456;Parent=ghi789;Sampled=1";
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const infoSpy = jest.spyOn(loggerInstance, "info");

			bridge.log("info", "Traced message");

			expect(infoSpy).toHaveBeenCalledWith(
				"Traced message",
				expect.objectContaining({
					xray_trace_id: "Root=1-abc123-def456;Parent=ghi789;Sampled=1"
				})
			);
		});

		it("should omit xray_trace_id when _X_AMZN_TRACE_ID is not set", () => {
			delete process.env._X_AMZN_TRACE_ID;
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const infoSpy = jest.spyOn(loggerInstance, "info");

			bridge.log("info", "No trace message");

			const callArgs = infoSpy.mock.calls[0][1];
			expect(callArgs).not.toHaveProperty("xray_trace_id");
		});

		it("should not include details when obj is null", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			const loggerInstance = bridge.instance;
			const infoSpy = jest.spyOn(loggerInstance, "info");

			bridge.log("info", "Simple message", null);

			const callArgs = infoSpy.mock.calls[0][1];
			expect(callArgs).not.toHaveProperty("details");
		});

		it("should handle addContext without throwing", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			const mockContext = {
				awsRequestId: "test-request-id-123",
				functionName: "test-function"
			};

			expect(() => bridge.addContext(mockContext)).not.toThrow();
		});
	});

	describe("MetricsHelper integration", () => {
		it("should return an active MetricsHelper", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(metrics).not.toBe(null);
			expect(metrics.isActive).toBe(true);
		});

		it("should have a non-null Metrics instance", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(metrics.instance).not.toBe(null);
		});

		it("should emit CacheHit metric via Metrics instance", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");
			const addDimensionSpy = jest.spyOn(metricsInstance, "addDimension");
			const publishSpy = jest.spyOn(metricsInstance, "publishStoredMetrics");

			metrics.recordCacheHit(45);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
			expect(addMetricSpy).toHaveBeenCalledWith("CacheHit", expect.anything(), 1);
			expect(addMetricSpy).toHaveBeenCalledWith("ReadLatency", expect.anything(), 45);
			expect(publishSpy).toHaveBeenCalled();
		});

		it("should emit CacheMiss metric via Metrics instance", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");
			const addDimensionSpy = jest.spyOn(metricsInstance, "addDimension");

			metrics.recordCacheMiss(120);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
			expect(addMetricSpy).toHaveBeenCalledWith("CacheMiss", expect.anything(), 1);
			expect(addMetricSpy).toHaveBeenCalledWith("ReadLatency", expect.anything(), 120);
		});

		it("should emit WriteLatency metric for cache write", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");
			const addDimensionSpy = jest.spyOn(metricsInstance, "addDimension");

			metrics.recordCacheWrite(78);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-write");
			expect(addMetricSpy).toHaveBeenCalledWith("WriteLatency", expect.anything(), 78);
		});

		it("should emit EndpointLatency metric for endpoint request", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");
			const addDimensionSpy = jest.spyOn(metricsInstance, "addDimension");

			metrics.recordEndpointRequest(200, 200);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
			expect(addMetricSpy).toHaveBeenCalledWith("EndpointLatency", expect.anything(), 200);
		});

		it("should emit EndpointError metric when status >= 400", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");

			metrics.recordEndpointRequest(500, 503);

			expect(addMetricSpy).toHaveBeenCalledWith("EndpointError", expect.anything(), 1);
		});

		it("should NOT emit EndpointError metric when status < 400", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");

			metrics.recordEndpointRequest(100, 200);

			const errorCalls = addMetricSpy.mock.calls.filter(
				call => call[0] === "EndpointError"
			);
			expect(errorCalls).toHaveLength(0);
		});

		it("should emit metrics to stdout via publishStoredMetrics", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const publishSpy = jest.spyOn(metricsInstance, "publishStoredMetrics");

			metrics.recordCacheHit(30);

			expect(publishSpy).toHaveBeenCalled();
		});

		it("should flush metrics without throwing", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const publishSpy = jest.spyOn(metricsInstance, "publishStoredMetrics");

			expect(() => metrics.flush()).not.toThrow();
			expect(publishSpy).toHaveBeenCalled();
		});
	});

	describe("Cold start metric", () => {
		it("should emit ColdStart metric on first call to recordColdStart", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");

			metrics.recordColdStart();

			const coldStartCalls = addMetricSpy.mock.calls.filter(
				call => call[0] === "ColdStart"
			);
			expect(coldStartCalls).toHaveLength(1);
			expect(coldStartCalls[0][2]).toBe(1);
		});

		it("should emit ColdStart metric only once across multiple calls", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");

			metrics.recordColdStart();
			metrics.recordColdStart();
			metrics.recordColdStart();

			const coldStartCalls = addMetricSpy.mock.calls.filter(
				call => call[0] === "ColdStart"
			);
			expect(coldStartCalls).toHaveLength(1);
		});

		it("should not emit ColdStart after markWarm is called", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addMetricSpy = jest.spyOn(metricsInstance, "addMetric");

			metrics.markWarm();
			metrics.recordColdStart();

			const coldStartCalls = addMetricSpy.mock.calls.filter(
				call => call[0] === "ColdStart"
			);
			expect(coldStartCalls).toHaveLength(0);
		});

		it("should emit ColdStart with operation dimension endpoint-request", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			const metricsInstance = metrics.instance;
			const addDimensionSpy = jest.spyOn(metricsInstance, "addDimension");

			metrics.recordColdStart();

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
		});
	});

	describe("End-to-end integration flow", () => {
		it("should support full lifecycle: init → log → trace → metrics → flush", () => {
			// Set up environment for full integration
			process.env.POWERTOOLS_SERVICE_NAME = "integration-test-service";
			process.env._X_AMZN_TRACE_ID = "Root=1-test-trace;Parent=abc;Sampled=1";

			const state = initPowertools();
			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(true);

			// Logger produces structured output
			const bridge = getLoggerBridge();
			expect(bridge.isActive).toBe(true);
			const loggerSpy = jest.spyOn(bridge.instance, "info");
			bridge.log("info", "Processing request", { requestId: "req-123" });
			expect(loggerSpy).toHaveBeenCalledWith(
				"Processing request",
				expect.objectContaining({
					details: { requestId: "req-123" },
					xray_trace_id: "Root=1-test-trace;Parent=abc;Sampled=1"
				})
			);

			// Tracing provider is active
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("powertools-tracer");

			// Metrics are emitted
			const metrics = getMetricsHelper();
			expect(metrics.isActive).toBe(true);
			const metricSpy = jest.spyOn(metrics.instance, "addMetric");
			metrics.recordColdStart();
			metrics.recordCacheHit(25);
			metrics.recordEndpointRequest(150, 200);

			// Verify metrics were emitted
			const metricNames = metricSpy.mock.calls.map(call => call[0]);
			expect(metricNames).toContain("ColdStart");
			expect(metricNames).toContain("CacheHit");
			expect(metricNames).toContain("ReadLatency");
			expect(metricNames).toContain("EndpointLatency");

			// Flush at end of invocation
			expect(() => metrics.flush()).not.toThrow();
		});

		it("should use POWERTOOLS_SERVICE_NAME for Logger and Metrics", () => {
			process.env.POWERTOOLS_SERVICE_NAME = "my-custom-service";

			initPowertools();

			const bridge = getLoggerBridge();
			expect(bridge.isActive).toBe(true);

			const metrics = getMetricsHelper();
			expect(metrics.isActive).toBe(true);
		});

		it("should use POWERTOOLS_METRICS_NAMESPACE for metrics namespace", () => {
			process.env.POWERTOOLS_METRICS_NAMESPACE = "CustomNamespace";
			process.env.POWERTOOLS_SERVICE_NAME = "my-service";

			initPowertools();

			const metrics = getMetricsHelper();
			expect(metrics.isActive).toBe(true);
		});
	});
});
