/**
 * Property 10: Operation Latency Metric Accuracy
 * 
 * Property-based tests verifying that for any operation (cache read, cache write,
 * or endpoint request) with a measured duration d > 0, the emitted latency metric
 * value equals Math.round(d).
 * 
 * **Validates: Requirements 8.3, 8.4, 9.1**
 * 
 * Properties Tested:
 * - For recordCacheHit(d), ReadLatency value equals Math.round(d)
 * - For recordCacheMiss(d), ReadLatency value equals Math.round(d)
 * - For recordCacheWrite(d), WriteLatency value equals Math.round(d)
 * - For recordEndpointRequest(d, statusCode), EndpointLatency value equals Math.round(d)
 * 
 * @private
 * @module test/powertools/property/latency-metric-accuracy-property-tests
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import fc from "fast-check";

// Import MetricsHelper
const MetricsHelperModule = await import("../../../src/lib/utils/MetricsHelper.js");
const { MetricsHelper } = MetricsHelperModule;

describe("Property 10: Operation Latency Metric Accuracy", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("recordCacheHit latency accuracy", () => {

		/**
		 * **Validates: Requirements 8.3**
		 * 
		 * For any duration d > 0, recordCacheHit(d) emits ReadLatency = Math.round(d).
		 */
		it("Property: recordCacheHit(d) emits ReadLatency equal to Math.round(d)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
					(duration) => {
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordCacheHit(duration);

						// Find the ReadLatency call
						const readLatencyCall = addMetricSpy.mock.calls.find(
							(call) => call[0] === "ReadLatency"
						);

						expect(readLatencyCall).toBeDefined();
						expect(readLatencyCall[2]).toBe(Math.round(duration));

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordCacheMiss latency accuracy", () => {

		/**
		 * **Validates: Requirements 8.3**
		 * 
		 * For any duration d > 0, recordCacheMiss(d) emits ReadLatency = Math.round(d).
		 */
		it("Property: recordCacheMiss(d) emits ReadLatency equal to Math.round(d)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
					(duration) => {
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordCacheMiss(duration);

						// Find the ReadLatency call
						const readLatencyCall = addMetricSpy.mock.calls.find(
							(call) => call[0] === "ReadLatency"
						);

						expect(readLatencyCall).toBeDefined();
						expect(readLatencyCall[2]).toBe(Math.round(duration));

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordCacheWrite latency accuracy", () => {

		/**
		 * **Validates: Requirements 8.4**
		 * 
		 * For any duration d > 0, recordCacheWrite(d) emits WriteLatency = Math.round(d).
		 */
		it("Property: recordCacheWrite(d) emits WriteLatency equal to Math.round(d)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
					(duration) => {
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordCacheWrite(duration);

						// Find the WriteLatency call
						const writeLatencyCall = addMetricSpy.mock.calls.find(
							(call) => call[0] === "WriteLatency"
						);

						expect(writeLatencyCall).toBeDefined();
						expect(writeLatencyCall[2]).toBe(Math.round(duration));

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordEndpointRequest latency accuracy", () => {

		/**
		 * **Validates: Requirements 9.1**
		 * 
		 * For any duration d > 0 and any status code, recordEndpointRequest(d, statusCode)
		 * emits EndpointLatency = Math.round(d).
		 */
		it("Property: recordEndpointRequest(d, statusCode) emits EndpointLatency equal to Math.round(d)", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
					fc.integer({ min: 100, max: 599 }),
					(duration, statusCode) => {
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordEndpointRequest(duration, statusCode);

						// Find the EndpointLatency call
						const endpointLatencyCall = addMetricSpy.mock.calls.find(
							(call) => call[0] === "EndpointLatency"
						);

						expect(endpointLatencyCall).toBeDefined();
						expect(endpointLatencyCall[2]).toBe(Math.round(duration));

						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
