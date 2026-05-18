/**
 * Property 13: Initialization Idempotence
 * 
 * Property-based tests verifying that calling initPowertools() N times (N >= 1)
 * produces the same state and side effects as calling it exactly once. The
 * initialization guard ensures detection logic executes only on the first call.
 * 
 * **Validates: Requirements 13.1, 13.4**
 * 
 * Properties Tested:
 * - For any N >= 1, calling initPowertools() N times returns the same state as calling it once
 * - The initialization guard ensures detection logic executes only on the first call
 * - Changing env vars between calls does not affect the result (guard prevents re-execution)
 * - getState() returns consistent results regardless of how many times initPowertools() was called
 * 
 * @private
 * @module test/powertools/property/initialization-idempotence-property-tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { createEnvContext } from "../helpers/env-helper.mjs";

// Import the module under test
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const { initPowertools, getState, TestHarness } = PowertoolsInit.default || PowertoolsInit;
const { resetForTesting } = TestHarness.getInternals();

// Environment context for clean test isolation
const envContext = createEnvContext();

describe("Property 13: Initialization Idempotence", () => {

	beforeEach(() => {
		envContext.setup();
		resetForTesting();
	});

	afterEach(() => {
		envContext.teardown();
	});

	describe("Idempotent state: calling initPowertools() N times returns same state as once", () => {

		/**
		 * **Validates: Requirements 13.1, 13.4**
		 * 
		 * For any N >= 1, calling initPowertools() N times SHALL return the same
		 * state as calling it exactly once. The initialization guard ensures the
		 * detection logic executes only on the first call.
		 */
		it("Property: initPowertools() called N times returns identical state to calling once", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					(n) => {
						resetForTesting();
						envContext.clear();

						// Call once and capture the reference state
						const firstCallState = initPowertools();

						// Call N-1 more times and verify each returns the same state
						for (let i = 1; i < n; i++) {
							const subsequentState = initPowertools();
							expect(subsequentState).toEqual(firstCallState);
						}

						// Final getState() should also match
						const finalState = getState();
						expect(finalState).toEqual(firstCallState);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 13.1, 13.4**
		 * 
		 * For any N >= 1 and any initial env var configuration, calling
		 * initPowertools() N times produces the same result as calling it once.
		 */
		it("Property: idempotence holds for any initial env var configuration", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					fc.option(fc.constantFrom("true", "false", "0", "1", "yes", "no"), { nil: undefined }),
					fc.option(fc.constantFrom("true", "false", "0", "1", "yes", "no"), { nil: undefined }),
					fc.option(fc.constantFrom("true", "false", "0", "1", "yes", "no"), { nil: undefined }),
					fc.option(fc.constantFrom("true", "false", "0", "1", "yes", "no"), { nil: undefined }),
					(n, globalVal, tracerVal, loggerVal, metricsVal) => {
						resetForTesting();
						envContext.clear();

						// Set initial env var configuration
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

						// Call once and capture reference state
						const firstCallState = initPowertools();

						// Call N-1 more times
						for (let i = 1; i < n; i++) {
							const subsequentState = initPowertools();
							expect(subsequentState).toEqual(firstCallState);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Guard prevents re-execution: env var changes between calls have no effect", () => {

		/**
		 * **Validates: Requirements 13.4**
		 * 
		 * Changing environment variables between calls to initPowertools() does not
		 * affect the result because the initialization guard prevents re-execution
		 * of the detection logic after the first call.
		 */
		it("Property: changing env vars between calls does not affect the result", () => {
			fc.assert(
				fc.property(
					fc.option(fc.string(), { nil: undefined }),
					fc.option(fc.string(), { nil: undefined }),
					fc.option(fc.string(), { nil: undefined }),
					(newGlobalVal, newTracerVal, newLoggerVal) => {
						resetForTesting();
						envContext.clear();

						// First call establishes the state
						const firstCallState = initPowertools();

						// Change env vars after initialization
						if (newGlobalVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS = newGlobalVal;
						} else {
							delete process.env.CACHE_DATA_POWERTOOLS;
						}
						if (newTracerVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = newTracerVal;
						} else {
							delete process.env.CACHE_DATA_POWERTOOLS_TRACER;
						}
						if (newLoggerVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS_LOGGER = newLoggerVal;
						} else {
							delete process.env.CACHE_DATA_POWERTOOLS_LOGGER;
						}

						// Second call should return the same state despite env var changes
						const secondCallState = initPowertools();
						expect(secondCallState).toEqual(firstCallState);

						// getState() should also be unchanged
						const currentState = getState();
						expect(currentState).toEqual(firstCallState);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 13.4**
		 * 
		 * Even when env vars are toggled between enabled and disabled values
		 * between multiple calls, the guard ensures only the first call's
		 * configuration takes effect.
		 */
		it("Property: toggling env vars between enabled/disabled between calls has no effect", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 2, max: 10 }),
					fc.boolean(), // initial global enabled?
					(n, initialEnabled) => {
						resetForTesting();
						envContext.clear();

						// Set initial configuration
						if (!initialEnabled) {
							process.env.CACHE_DATA_POWERTOOLS = "false";
						}

						// First call establishes the state
						const firstCallState = initPowertools();

						// Toggle env vars between subsequent calls
						for (let i = 1; i < n; i++) {
							// Flip the global flag
							process.env.CACHE_DATA_POWERTOOLS = (i % 2 === 0) ? "true" : "false";

							const state = initPowertools();
							expect(state).toEqual(firstCallState);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("getState() consistency: returns same results regardless of call count", () => {

		/**
		 * **Validates: Requirements 13.1, 13.4**
		 * 
		 * getState() returns consistent results regardless of how many times
		 * initPowertools() was called. The state is set once and remains stable.
		 */
		it("Property: getState() returns consistent results after N calls to initPowertools()", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					(n) => {
						resetForTesting();
						envContext.clear();

						// Call initPowertools() N times
						let lastReturnedState = null;
						for (let i = 0; i < n; i++) {
							lastReturnedState = initPowertools();
						}

						// getState() should match the returned state
						const queriedState = getState();
						expect(queriedState).toEqual(lastReturnedState);

						// Call getState() multiple times - should always be consistent
						const state1 = getState();
						const state2 = getState();
						const state3 = getState();
						expect(state1).toEqual(state2);
						expect(state2).toEqual(state3);
						expect(state3).toEqual(lastReturnedState);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 13.1, 13.4**
		 * 
		 * The return value of initPowertools() and getState() are always
		 * structurally identical objects with boolean values.
		 */
		it("Property: initPowertools() return value always matches getState()", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					fc.option(fc.constantFrom("true", "false", "0", "1"), { nil: undefined }),
					(n, globalVal) => {
						resetForTesting();
						envContext.clear();

						if (globalVal !== undefined) {
							process.env.CACHE_DATA_POWERTOOLS = globalVal;
						}

						// Each call to initPowertools() should return same as getState()
						for (let i = 0; i < n; i++) {
							const returnedState = initPowertools();
							const queriedState = getState();
							expect(returnedState).toEqual(queriedState);
							expect(typeof returnedState.tracer).toBe("boolean");
							expect(typeof returnedState.logger).toBe("boolean");
							expect(typeof returnedState.metrics).toBe("boolean");
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
