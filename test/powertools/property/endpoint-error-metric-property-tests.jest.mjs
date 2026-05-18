/**
 * Property 11: Endpoint Error Metric Correctness
 * 
 * Property-based tests verifying that MetricsHelper.recordEndpointRequest()
 * emits an EndpointError count metric if and only if the HTTP status code
 * is >= 400. For status codes < 400 (success/redirect), no EndpointError
 * metric is emitted.
 * 
 * **Validates: Requirements 9.2, 9.4**
 * 
 * Properties Tested:
 * - For any statusCode >= 400, EndpointError IS emitted with value 1
 * - For any statusCode < 400, EndpointError is NOT emitted
 * - EndpointLatency is always emitted regardless of status code
 * 
 * @private
 * @module test/powertools/property/endpoint-error-metric-property-tests
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import fc from "fast-check";

// Import MetricsHelper
const MetricsHelperModule = await import("../../../src/lib/utils/MetricsHelper.js");
const { MetricsHelper } = MetricsHelperModule;

describe("Property 11: Endpoint Error Metric Correctness", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("EndpointError emitted for error status codes (>= 400)", () => {

		/**
		 * **Validates: Requirements 9.2, 9.4**
		 * 
		 * For any endpoint request that completes with HTTP status code >= 400,
		 * an EndpointError count metric with value 1 SHALL be emitted.
		 */
		it("Property: recordEndpointRequest(d, statusCode) emits EndpointError when statusCode >= 400", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");

			// Since @aws-lambda-powertools/metrics IS installed as devDependency, helper should be active
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.1, max: 10000, noNaN: true }),
					fc.integer({ min: 400, max: 599 }),
					(duration, statusCode) => {
						// Spy on the Metrics instance's addMetric method
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						const addDimensionSpy = jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						const publishSpy = jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordEndpointRequest(duration, statusCode);

						// Verify EndpointError was emitted
						const endpointErrorCalls = addMetricSpy.mock.calls.filter(
							(call) => call[0] === "EndpointError"
						);
						expect(endpointErrorCalls.length).toBe(1);
						expect(endpointErrorCalls[0][2]).toBe(1); // value = 1

						addMetricSpy.mockRestore();
						addDimensionSpy.mockRestore();
						publishSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("EndpointError NOT emitted for success status codes (< 400)", () => {

		/**
		 * **Validates: Requirements 9.2, 9.4**
		 * 
		 * For any endpoint request that completes with HTTP status code < 400
		 * (2xx or 3xx), no EndpointError count metric SHALL be emitted.
		 */
		it("Property: recordEndpointRequest(d, statusCode) does NOT emit EndpointError when statusCode < 400", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.1, max: 10000, noNaN: true }),
					fc.integer({ min: 100, max: 399 }),
					(duration, statusCode) => {
						// Spy on the Metrics instance's addMetric method
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						const addDimensionSpy = jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						const publishSpy = jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordEndpointRequest(duration, statusCode);

						// Verify EndpointError was NOT emitted
						const endpointErrorCalls = addMetricSpy.mock.calls.filter(
							(call) => call[0] === "EndpointError"
						);
						expect(endpointErrorCalls.length).toBe(0);

						addMetricSpy.mockRestore();
						addDimensionSpy.mockRestore();
						publishSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("EndpointLatency always emitted regardless of status code", () => {

		/**
		 * **Validates: Requirements 9.2, 9.4**
		 * 
		 * For any endpoint request, EndpointLatency is always emitted
		 * regardless of whether the status code indicates success or error.
		 */
		it("Property: recordEndpointRequest(d, statusCode) always emits EndpointLatency", () => {
			const helper = new MetricsHelper("TestNamespace", "test-service");
			expect(helper.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.double({ min: 0.1, max: 10000, noNaN: true }),
					fc.integer({ min: 100, max: 599 }),
					(duration, statusCode) => {
						// Spy on the Metrics instance's addMetric method
						const addMetricSpy = jest.spyOn(helper.instance, "addMetric").mockImplementation(() => {});
						const addDimensionSpy = jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
						const publishSpy = jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});

						helper.recordEndpointRequest(duration, statusCode);

						// Verify EndpointLatency was emitted
						const endpointLatencyCalls = addMetricSpy.mock.calls.filter(
							(call) => call[0] === "EndpointLatency"
						);
						expect(endpointLatencyCalls.length).toBe(1);
						expect(endpointLatencyCalls[0][2]).toBe(Math.round(duration));

						addMetricSpy.mockRestore();
						addDimensionSpy.mockRestore();
						publishSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
