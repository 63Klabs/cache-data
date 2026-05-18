/**
 * Property 1: Detection Independence and No-Throw Guarantee
 * 
 * Property-based tests verifying that initPowertools() never throws and that
 * each package detection is independent of the others.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
 * 
 * Properties Tested:
 * - initPowertools() never throws for any env var combination
 * - tryImport() returns boolean and never throws for arbitrary package names
 * - Detection of each package is independent (disabling one doesn't affect others via env vars)
 * - All 8 combinations of 3 packages being available/unavailable are handled
 * 
 * @private
 * @module test/powertools/property/detection-independence-property-tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { createEnvContext } from "../helpers/env-helper.mjs";
import { ALL_AVAILABILITY_COMBINATIONS } from "../helpers/mock-powertools.mjs";

// Import the module under test
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const { initPowertools, getState, TestHarness } = PowertoolsInit.default || PowertoolsInit;
const { parseEnvFlag, isCapabilityEnabled, tryImport, resetForTesting } = TestHarness.getInternals();

// Environment context for clean test isolation
const envContext = createEnvContext();

describe("Property 1: Detection Independence and No-Throw Guarantee", () => {

	beforeEach(() => {
		envContext.setup();
		resetForTesting();
	});

	afterEach(() => {
		envContext.teardown();
	});

	describe("No-Throw Guarantee: initPowertools() never throws for any env var combination", () => {

		/**
		 * **Validates: Requirements 1.3, 1.5**
		 * 
		 * For any arbitrary string values assigned to CACHE_DATA_POWERTOOLS* env vars,
		 * initPowertools() SHALL complete without throwing an exception.
		 */
		it("Property: initPowertools() never throws for arbitrary env var values", () => {
			fc.assert(
				fc.property(
					fc.option(fc.string(), { nil: undefined }),
					fc.option(fc.string(), { nil: undefined }),
					fc.option(fc.string(), { nil: undefined }),
					fc.option(fc.string(), { nil: undefined }),
					(globalVal, tracerVal, loggerVal, metricsVal) => {
						resetForTesting();
						envContext.clear();

						// Set env vars to arbitrary values (or leave unset)
						if (globalVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS = globalVal;
						}
						if (tracerVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = tracerVal;
						}
						if (loggerVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS_LOGGER = loggerVal;
						}
						if (metricsVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS_METRICS = metricsVal;
						}

						// initPowertools must never throw
						expect(() => initPowertools()).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 1.3**
		 * 
		 * initPowertools() must never throw even with known edge-case env var values
		 * including empty strings, whitespace, special characters, and very long strings.
		 */
		it("Property: initPowertools() never throws for edge-case env var values", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(""),
						fc.constant("0"),
						fc.constant("1"),
						fc.constant("true"),
						fc.constant("false"),
						fc.constant("yes"),
						fc.constant("no"),
						fc.constant("TRUE"),
						fc.constant("FALSE"),
						fc.constant("  "),
						fc.constant("null"),
						fc.constant("undefined"),
						fc.string({ minLength: 0, maxLength: 500 })
					),
					(envValue) => {
						resetForTesting();
						envContext.clear();

						process.env.CACHE_DATA_POWERTOOLS = envValue;
						process.env.CACHE_DATA_POWERTOOLS_TRACER = envValue;
						process.env.CACHE_DATA_POWERTOOLS_LOGGER = envValue;
						process.env.CACHE_DATA_POWERTOOLS_METRICS = envValue;

						expect(() => initPowertools()).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("tryImport() returns boolean and never throws", () => {

		/**
		 * **Validates: Requirements 1.1, 1.2**
		 * 
		 * For any arbitrary package name string, tryImport() SHALL return a boolean
		 * and SHALL NOT throw an exception.
		 */
		it("Property: tryImport() returns boolean for arbitrary package names", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 100 }),
					(packageName) => {
						const result = tryImport(packageName);
						expect(typeof result).toBe("boolean");
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 1.1, 1.2**
		 * 
		 * tryImport() returns true for known installed packages and false for
		 * non-existent packages, and never throws in either case.
		 */
		it("Property: tryImport() returns correct boolean for known packages", () => {
			// These packages are installed as devDependencies
			const installedPackages = [
				"@aws-lambda-powertools/tracer",
				"@aws-lambda-powertools/logger",
				"@aws-lambda-powertools/metrics"
			];

			for (const pkg of installedPackages) {
				expect(() => {
					const result = tryImport(pkg);
					expect(typeof result).toBe("boolean");
					expect(result).toBe(true);
				}).not.toThrow();
			}

			// Non-existent packages should return false
			const nonExistentPackages = [
				"@nonexistent/package-xyz-123",
				"totally-fake-package-name",
				"@aws-lambda-powertools/nonexistent"
			];

			for (const pkg of nonExistentPackages) {
				expect(() => {
					const result = tryImport(pkg);
					expect(typeof result).toBe("boolean");
					expect(result).toBe(false);
				}).not.toThrow();
			}
		});
	});

	describe("Detection Independence: each package detection is independent", () => {

		/**
		 * **Validates: Requirements 1.1, 1.2, 1.5**
		 * 
		 * For all 8 combinations of env var settings that disable individual capabilities,
		 * disabling one capability via env vars does not affect the detection/enablement
		 * of other capabilities.
		 */
		it("Property: disabling one capability via env var does not affect others", () => {
			const capabilities = ["TRACER", "LOGGER", "METRICS"];
			const stateKeys = ["tracer", "logger", "metrics"];

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 2 }), // which capability to disable
					(disableIndex) => {
						resetForTesting();
						envContext.clear();

						// Disable one specific capability
						const disabledCapability = capabilities[disableIndex];
						process.env[`CACHE_DATA_POWERTOOLS_${disabledCapability}`] = "false";

						const state = initPowertools();

						// The disabled capability should be false
						expect(state[stateKeys[disableIndex]]).toBe(false);

						// The other capabilities should still be enabled
						// (since packages are installed as devDependencies)
						for (let i = 0; i < stateKeys.length; i++) {
							if (i !== disableIndex) {
								expect(state[stateKeys[i]]).toBe(true);
							}
						}
					}
				),
				{ numRuns: 10 } // Only 3 possible values, but run a few times for confidence
			);
		});

		/**
		 * **Validates: Requirements 1.1, 1.2, 1.5**
		 * 
		 * For any subset of capabilities disabled via env vars, only those specific
		 * capabilities are disabled while the rest remain enabled.
		 */
		it("Property: any subset of capabilities can be independently disabled", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // disable tracer?
					fc.boolean(), // disable logger?
					fc.boolean(), // disable metrics?
					(disableTracer, disableLogger, disableMetrics) => {
						resetForTesting();
						envContext.clear();

						if (disableTracer) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						}
						if (disableLogger) {
							process.env.CACHE_DATA_POWERTOOLS_LOGGER = "false";
						}
						if (disableMetrics) {
							process.env.CACHE_DATA_POWERTOOLS_METRICS = "false";
						}

						const state = initPowertools();

						// Each capability's state should match its individual disable flag
						// Since packages ARE installed, enabled = !disabled
						expect(state.tracer).toBe(!disableTracer);
						expect(state.logger).toBe(!disableLogger);
						expect(state.metrics).toBe(!disableMetrics);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 1.1, 1.3, 1.5**
		 * 
		 * All 8 combinations of package availability are handled without error.
		 * Since packages are installed as devDependencies, we verify the concept
		 * by testing all combinations of env var disabling (which simulates
		 * unavailability from the user's perspective).
		 */
		it("Property: all 8 combinations of capability enablement are valid states", () => {
			// ALL_AVAILABILITY_COMBINATIONS represents all 8 boolean combos
			for (const combo of ALL_AVAILABILITY_COMBINATIONS) {
				resetForTesting();
				envContext.clear();

				// Simulate availability by using env vars to disable
				if (!combo.tracer) {
					process.env.CACHE_DATA_POWERTOOLS_TRACER = "0";
				}
				if (!combo.logger) {
					process.env.CACHE_DATA_POWERTOOLS_LOGGER = "0";
				}
				if (!combo.metrics) {
					process.env.CACHE_DATA_POWERTOOLS_METRICS = "0";
				}

				// Must never throw
				expect(() => initPowertools()).not.toThrow();

				// State must be queryable
				const state = getState();
				expect(typeof state.tracer).toBe("boolean");
				expect(typeof state.logger).toBe("boolean");
				expect(typeof state.metrics).toBe("boolean");

				// State should match what we configured
				expect(state.tracer).toBe(combo.tracer);
				expect(state.logger).toBe(combo.logger);
				expect(state.metrics).toBe(combo.metrics);
			}
		});
	});

	describe("State queryability after initialization", () => {

		/**
		 * **Validates: Requirements 1.5**
		 * 
		 * After initPowertools() completes, getState() always returns an object
		 * with boolean values for tracer, logger, and metrics.
		 */
		it("Property: getState() always returns well-formed state object", () => {
			fc.assert(
				fc.property(
					fc.option(fc.constantFrom("true", "false", "0", "1", "yes", "no"), { nil: undefined }),
					(globalVal) => {
						resetForTesting();
						envContext.clear();

						if (globalVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS = globalVal;
						}

						initPowertools();
						const state = getState();

						// State must always have these three boolean properties
						expect(state).toHaveProperty("tracer");
						expect(state).toHaveProperty("logger");
						expect(state).toHaveProperty("metrics");
						expect(typeof state.tracer).toBe("boolean");
						expect(typeof state.logger).toBe("boolean");
						expect(typeof state.metrics).toBe("boolean");
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
