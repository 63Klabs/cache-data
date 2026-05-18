/**
 * Unit tests for MetricsHelper module.
 * 
 * Tests cache hit/miss/write metric emission, endpoint request metrics,
 * cold start recording, flush behavior, no-op behavior when Metrics
 * is not available, and error swallowing during emission.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Import MetricsHelper via TestHarness
const MetricsHelperModule = await import("../../../src/lib/utils/MetricsHelper.js");
const { MetricsHelper } = MetricsHelperModule;

describe("MetricsHelper", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Constructor and isActive", () => {

		it("should create an active helper when @aws-lambda-powertools/metrics is available", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);
		});

		it("isActive should return true when Metrics is available", () => {
			const helper = new MetricsHelper("CacheData", "my-service");
			expect(helper.isActive).toBe(true);
		});

		it("should create an inactive helper when namespace is invalid (empty string)", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			const helper = new MetricsHelper("", "");
			expect(helper.isActive).toBe(false);
			warnSpy.mockRestore();
		});

		it("should create an inactive helper when namespace contains invalid characters", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			const helper = new MetricsHelper("invalid namespace!", "test-service");
			expect(helper.isActive).toBe(false);
			warnSpy.mockRestore();
		});
	});

	describe("instance getter", () => {

		it("should return the Metrics instance when active", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.instance).not.toBe(null);
			expect(helper.instance).toBeDefined();
		});

		it("should return an object with Metrics methods", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;
			expect(typeof metrics.addMetric).toBe("function");
			expect(typeof metrics.addDimension).toBe("function");
			expect(typeof metrics.publishStoredMetrics).toBe("function");
		});
	});

	describe("recordCacheHit(duration)", () => {

		it("should emit CacheHit count and ReadLatency metrics", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordCacheHit(45.7);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
			expect(addMetricSpy).toHaveBeenCalledWith("CacheHit", expect.anything(), 1);
			expect(addMetricSpy).toHaveBeenCalledWith("ReadLatency", expect.anything(), 46);
			expect(publishSpy).toHaveBeenCalledTimes(1);
		});

		it("should round duration to nearest integer", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordCacheHit(12.3);

			expect(addMetricSpy).toHaveBeenCalledWith("ReadLatency", expect.anything(), 12);
		});
	});

	describe("recordCacheMiss(duration)", () => {

		it("should emit CacheMiss count and ReadLatency metrics", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordCacheMiss(100.9);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
			expect(addMetricSpy).toHaveBeenCalledWith("CacheMiss", expect.anything(), 1);
			expect(addMetricSpy).toHaveBeenCalledWith("ReadLatency", expect.anything(), 101);
			expect(publishSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("recordCacheWrite(duration)", () => {

		it("should emit WriteLatency metric", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordCacheWrite(78.2);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-write");
			expect(addMetricSpy).toHaveBeenCalledWith("WriteLatency", expect.anything(), 78);
			expect(publishSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("recordEndpointRequest(duration, statusCode)", () => {

		it("should emit EndpointLatency only for status 200 (no error)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(120, 200);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
			expect(addMetricSpy).toHaveBeenCalledWith("EndpointLatency", expect.anything(), 120);
			expect(addMetricSpy).not.toHaveBeenCalledWith("EndpointError", expect.anything(), expect.anything());
			expect(publishSpy).toHaveBeenCalledTimes(1);
		});

		it("should emit EndpointLatency only for status 301 (no error)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(50, 301);

			expect(addMetricSpy).toHaveBeenCalledWith("EndpointLatency", expect.anything(), 50);
			expect(addMetricSpy).not.toHaveBeenCalledWith("EndpointError", expect.anything(), expect.anything());
		});

		it("should emit EndpointLatency and EndpointError for status 500", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(500, 500);

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
			expect(addMetricSpy).toHaveBeenCalledWith("EndpointLatency", expect.anything(), 500);
			expect(addMetricSpy).toHaveBeenCalledWith("EndpointError", expect.anything(), 1);
		});

		it("should emit EndpointError for status 400", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(200, 400);

			expect(addMetricSpy).toHaveBeenCalledWith("EndpointError", expect.anything(), 1);
		});

		it("should emit EndpointError for status 503", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(1000, 503);

			expect(addMetricSpy).toHaveBeenCalledWith("EndpointLatency", expect.anything(), 1000);
			expect(addMetricSpy).toHaveBeenCalledWith("EndpointError", expect.anything(), 1);
		});

		it("should NOT emit EndpointError for status 399", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordEndpointRequest(80, 399);

			expect(addMetricSpy).not.toHaveBeenCalledWith("EndpointError", expect.anything(), expect.anything());
		});
	});

	describe("recordColdStart()", () => {

		it("should emit ColdStart count once", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordColdStart();

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
			expect(addMetricSpy).toHaveBeenCalledWith("ColdStart", expect.anything(), 1);
		});

		it("should be a no-op on second call", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.recordColdStart();
			addMetricSpy.mockClear();

			helper.recordColdStart();

			expect(addMetricSpy).not.toHaveBeenCalled();
		});
	});

	describe("markWarm()", () => {

		it("should prevent future cold start recording", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addMetricSpy = jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.markWarm();
			helper.recordColdStart();

			expect(addMetricSpy).not.toHaveBeenCalled();
		});
	});

	describe("flush()", () => {

		it("should call publishStoredMetrics()", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper.flush();

			expect(publishSpy).toHaveBeenCalledTimes(1);
		});

		it("should handle errors gracefully (never throws)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {
				throw new Error("Flush exploded");
			});
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => helper.flush()).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe("No-op behavior when helper is not active", () => {

		it("all methods are no-ops when helper is not active", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			// Create an inactive helper by providing an invalid namespace
			const helper = new MetricsHelper("", "");
			warnSpy.mockRestore();

			expect(helper.isActive).toBe(false);

			// None of these should throw
			expect(() => helper.recordCacheHit(10)).not.toThrow();
			expect(() => helper.recordCacheMiss(20)).not.toThrow();
			expect(() => helper.recordCacheWrite(30)).not.toThrow();
			expect(() => helper.recordEndpointRequest(40, 200)).not.toThrow();
			expect(() => helper.recordEndpointRequest(50, 500)).not.toThrow();
			expect(() => helper.recordColdStart()).not.toThrow();
			expect(() => helper.markWarm()).not.toThrow();
			expect(() => helper.flush()).not.toThrow();
		});

		it("flush is a no-op when helper is not active", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			const helper = new MetricsHelper("", "");
			warnSpy.mockRestore();

			// Should not throw and should not call any Metrics methods
			expect(() => helper.flush()).not.toThrow();
		});
	});

	describe("_emit() adds 'operation' dimension correctly", () => {

		it("should add 'operation' dimension with the provided value", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			const addDimensionSpy = jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper._emit("custom-operation", (m) => {
				m.addMetric("TestMetric", "Count", 1);
			});

			expect(addDimensionSpy).toHaveBeenCalledWith("operation", "custom-operation");
		});

		it("should call publishStoredMetrics after adding metrics", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			const publishSpy = jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {});

			helper._emit("test-op", (m) => {
				m.addMetric("TestMetric", "Count", 1);
			});

			expect(publishSpy).toHaveBeenCalledTimes(1);
		});

		it("should be a no-op when helper is not active", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			const helper = new MetricsHelper("", "");
			warnSpy.mockRestore();

			const fnSpy = jest.fn();
			helper._emit("test-op", fnSpy);

			expect(fnSpy).not.toHaveBeenCalled();
		});
	});

	describe("Error during emission is caught and logged", () => {

		it("should catch errors from addDimension and log a warning", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			jest.spyOn(metrics, "addDimension").mockImplementation(() => {
				throw new Error("addDimension failed");
			});
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => helper.recordCacheHit(10)).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
		});

		it("should catch errors from addMetric and log a warning", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "addMetric").mockImplementation(() => {
				throw new Error("addMetric failed");
			});
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => helper.recordCacheMiss(20)).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
		});

		it("should catch errors from publishStoredMetrics in _emit and log a warning", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			jest.spyOn(metrics, "addDimension").mockImplementation(() => {});
			jest.spyOn(metrics, "addMetric").mockImplementation(() => {});
			jest.spyOn(metrics, "publishStoredMetrics").mockImplementation(() => {
				throw new Error("publish failed");
			});
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => helper.recordCacheWrite(30)).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
		});

		it("should never propagate exceptions to the caller", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			const metrics = helper.instance;

			// Make everything throw
			jest.spyOn(metrics, "addDimension").mockImplementation(() => {
				throw new TypeError("type error");
			});
			jest.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => helper.recordCacheHit(1)).not.toThrow();
			expect(() => helper.recordCacheMiss(2)).not.toThrow();
			expect(() => helper.recordCacheWrite(3)).not.toThrow();
			expect(() => helper.recordEndpointRequest(4, 200)).not.toThrow();
			expect(() => helper.recordEndpointRequest(5, 500)).not.toThrow();
			expect(() => helper.recordColdStart()).not.toThrow();
		});
	});
});
