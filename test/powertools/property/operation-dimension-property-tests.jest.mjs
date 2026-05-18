/**
 * Property 12: Operation Dimension Correctness
 * 
 * Property-based tests verifying that every emitted metric has an "operation"
 * dimension with the correct value corresponding to the operation type:
 * - recordCacheHit() → "cache-read"
 * - recordCacheMiss() → "cache-read"
 * - recordCacheWrite() → "cache-write"
 * - recordEndpointRequest() → "endpoint-request"
 * - recordColdStart() → "endpoint-request"
 * 
 * **Validates: Requirements 10.2**
 * 
 * @private
 * @module test/powertools/property/operation-dimension-property-tests
 */

import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import fc from "fast-check";

// Import MetricsHelper
const MetricsHelperModule = await import("../../../src/lib/utils/MetricsHelper.js");
const { MetricsHelper } = MetricsHelperModule;

describe("Property 12: Operation Dimension Correctness", () => {

	let helper;
	let addDimensionSpy;
	let addMetricSpy;
	let publishSpy;

	beforeEach(() => {
		helper = new MetricsHelper("TestNamespace", "test-service");
		expect(helper.isActive).toBe(true);

		// Spy on the Metrics instance methods
		addDimensionSpy = jest.spyOn(helper.instance, "addDimension");
		addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
		publishSpy = jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("recordCacheHit adds operation dimension 'cache-read'", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * For any duration, recordCacheHit() adds dimension "operation" = "cache-read".
		 */
		it("Property: recordCacheHit() always adds operation dimension 'cache-read'", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
					(durationMs) => {
						addDimensionSpy.mockClear();
						addMetricSpy.mockClear();
						publishSpy.mockClear();

						helper.recordCacheHit(durationMs);

						expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordCacheMiss adds operation dimension 'cache-read'", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * For any duration, recordCacheMiss() adds dimension "operation" = "cache-read".
		 */
		it("Property: recordCacheMiss() always adds operation dimension 'cache-read'", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
					(durationMs) => {
						addDimensionSpy.mockClear();
						addMetricSpy.mockClear();
						publishSpy.mockClear();

						helper.recordCacheMiss(durationMs);

						expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-read");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordCacheWrite adds operation dimension 'cache-write'", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * For any duration, recordCacheWrite() adds dimension "operation" = "cache-write".
		 */
		it("Property: recordCacheWrite() always adds operation dimension 'cache-write'", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
					(durationMs) => {
						addDimensionSpy.mockClear();
						addMetricSpy.mockClear();
						publishSpy.mockClear();

						helper.recordCacheWrite(durationMs);

						expect(addDimensionSpy).toHaveBeenCalledWith("operation", "cache-write");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordEndpointRequest adds operation dimension 'endpoint-request'", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * For any duration and status code, recordEndpointRequest() adds
		 * dimension "operation" = "endpoint-request".
		 */
		it("Property: recordEndpointRequest() always adds operation dimension 'endpoint-request'", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
					fc.integer({ min: 100, max: 599 }),
					(durationMs, statusCode) => {
						addDimensionSpy.mockClear();
						addMetricSpy.mockClear();
						publishSpy.mockClear();

						helper.recordEndpointRequest(durationMs, statusCode);

						expect(addDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("recordColdStart adds operation dimension 'endpoint-request'", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * recordColdStart() adds dimension "operation" = "endpoint-request".
		 * Since cold start is recorded only once, we create a fresh helper each iteration.
		 */
		it("Property: recordColdStart() always adds operation dimension 'endpoint-request'", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 100 }),
					(_arbitrary) => {
						// Create a fresh helper for each iteration since cold start is once-only
						const freshHelper = new MetricsHelper("TestNamespace", "test-service");
						expect(freshHelper.isActive).toBe(true);

						const freshAddDimensionSpy = jest.spyOn(freshHelper.instance, "addDimension");
						jest.spyOn(freshHelper.instance, "addMetric").mockImplementation(() => {});
						jest.spyOn(freshHelper.instance, "publishStoredMetrics").mockImplementation(() => {});

						freshHelper.recordColdStart();

						expect(freshAddDimensionSpy).toHaveBeenCalledWith("operation", "endpoint-request");

						freshAddDimensionSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Operation dimension is always present on every metric emission", () => {

		/**
		 * **Validates: Requirements 10.2**
		 * 
		 * For any operation method called, the "operation" dimension is always
		 * the first thing added before any metrics are recorded.
		 */
		it("Property: addDimension('operation', ...) is called before addMetric for every operation", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("cacheHit", "cacheMiss", "cacheWrite", "endpointRequest"),
					fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
					fc.integer({ min: 100, max: 599 }),
					(operation, durationMs, statusCode) => {
						addDimensionSpy.mockClear();
						addMetricSpy.mockClear();
						publishSpy.mockClear();

						// Track call order
						const callOrder = [];
						addDimensionSpy.mockImplementation(() => { callOrder.push("addDimension"); });
						addMetricSpy.mockImplementation(() => { callOrder.push("addMetric"); });
						publishSpy.mockImplementation(() => { callOrder.push("publish"); });

						switch (operation) {
						case "cacheHit":
							helper.recordCacheHit(durationMs);
							break;
						case "cacheMiss":
							helper.recordCacheMiss(durationMs);
							break;
						case "cacheWrite":
							helper.recordCacheWrite(durationMs);
							break;
						case "endpointRequest":
							helper.recordEndpointRequest(durationMs, statusCode);
							break;
						}

						// addDimension should be called first
						expect(callOrder[0]).toBe("addDimension");
						// addDimension should be called with "operation"
						expect(addDimensionSpy).toHaveBeenCalledWith("operation", expect.any(String));
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
