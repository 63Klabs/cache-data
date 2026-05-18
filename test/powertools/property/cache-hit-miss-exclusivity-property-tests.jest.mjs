/**
 * Property 9: Cache Hit/Miss Metric Exclusivity
 * 
 * Property-based tests verifying that for any cache read operation when Metrics
 * is active, exactly one of CacheHit or CacheMiss is emitted (never both, never
 * neither). CacheHit is emitted when recordCacheHit(duration) is called; CacheMiss
 * is emitted when recordCacheMiss(duration) is called.
 * 
 * **Validates: Requirements 8.1, 8.2**
 * 
 * Properties Tested:
 * - When recordCacheHit(duration) is called, CacheHit is emitted but NOT CacheMiss
 * - When recordCacheMiss(duration) is called, CacheMiss is emitted but NOT CacheHit
 * - For any positive duration, exactly one of CacheHit or CacheMiss is emitted per call
 * 
 * @private
 * @module test/powertools/property/cache-hit-miss-exclusivity-property-tests
 */

import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import fc from "fast-check";

// Import MetricsHelper
const MetricsHelperModule = await import("../../../src/lib/utils/MetricsHelper.js");
const { MetricsHelper } = MetricsHelperModule;

describe("Property 9: Cache Hit/Miss Metric Exclusivity", () => {

	let helper;
	let addMetricSpy;

	beforeEach(() => {
		helper = new MetricsHelper("TestNamespace", "test-service");
		// MetricsHelper should be active since @aws-lambda-powertools/metrics is installed as devDependency
		expect(helper.isActive).toBe(true);

		// Spy on the underlying Metrics instance's addMetric method
		addMetricSpy = jest.spyOn(helper.instance, "addMetric");
		// Also spy on publishStoredMetrics to prevent actual emission
		jest.spyOn(helper.instance, "publishStoredMetrics").mockImplementation(() => {});
		// Spy on addDimension to prevent side effects
		jest.spyOn(helper.instance, "addDimension").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("CacheHit exclusivity", () => {

		/**
		 * **Validates: Requirements 8.1, 8.2**
		 * 
		 * When recordCacheHit(duration) is called, CacheHit is emitted but NOT CacheMiss.
		 */
		it("Property: recordCacheHit emits CacheHit but NOT CacheMiss for any positive duration", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 100000, noNaN: true, noDefaultInfinity: true }),
					(duration) => {
						addMetricSpy.mockClear();

						helper.recordCacheHit(duration);

						// Collect all metric names emitted
						const metricNames = addMetricSpy.mock.calls.map(call => call[0]);

						// CacheHit MUST be emitted
						expect(metricNames).toContain("CacheHit");

						// CacheMiss MUST NOT be emitted
						expect(metricNames).not.toContain("CacheMiss");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("CacheMiss exclusivity", () => {

		/**
		 * **Validates: Requirements 8.1, 8.2**
		 * 
		 * When recordCacheMiss(duration) is called, CacheMiss is emitted but NOT CacheHit.
		 */
		it("Property: recordCacheMiss emits CacheMiss but NOT CacheHit for any positive duration", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 100000, noNaN: true, noDefaultInfinity: true }),
					(duration) => {
						addMetricSpy.mockClear();

						helper.recordCacheMiss(duration);

						// Collect all metric names emitted
						const metricNames = addMetricSpy.mock.calls.map(call => call[0]);

						// CacheMiss MUST be emitted
						expect(metricNames).toContain("CacheMiss");

						// CacheHit MUST NOT be emitted
						expect(metricNames).not.toContain("CacheHit");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Exactly one of CacheHit or CacheMiss per call", () => {

		/**
		 * **Validates: Requirements 8.1, 8.2**
		 * 
		 * For any positive duration and any cache read method (hit or miss),
		 * exactly one of CacheHit or CacheMiss is emitted per call — never both,
		 * never neither.
		 */
		it("Property: exactly one of CacheHit or CacheMiss is emitted per cache read call", () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0.001, max: 100000, noNaN: true, noDefaultInfinity: true }),
					fc.boolean(),
					(duration, isHit) => {
						addMetricSpy.mockClear();

						// Call either recordCacheHit or recordCacheMiss
						if (isHit) {
							helper.recordCacheHit(duration);
						} else {
							helper.recordCacheMiss(duration);
						}

						// Collect all metric names emitted
						const metricNames = addMetricSpy.mock.calls.map(call => call[0]);

						// Count CacheHit and CacheMiss occurrences
						const cacheHitCount = metricNames.filter(name => name === "CacheHit").length;
						const cacheMissCount = metricNames.filter(name => name === "CacheMiss").length;

						// Exactly one of CacheHit or CacheMiss must be emitted
						const totalHitMiss = cacheHitCount + cacheMissCount;
						expect(totalHitMiss).toBe(1);

						// Verify the correct one was emitted
						if (isHit) {
							expect(cacheHitCount).toBe(1);
							expect(cacheMissCount).toBe(0);
						} else {
							expect(cacheHitCount).toBe(0);
							expect(cacheMissCount).toBe(1);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
