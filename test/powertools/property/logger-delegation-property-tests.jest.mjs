/**
 * Property 6: Logger Delegation with Structured Output
 * 
 * Property-based tests verifying that LoggerBridge correctly delegates log
 * calls to the Powertools Logger at the correct level, includes obj as a
 * `details` property when non-null, omits `details` when obj is null, and
 * never throws for any input combination.
 * 
 * **Validates: Requirements 6.1, 6.2**
 * 
 * Properties Tested:
 * - For any valid level and message, bridge.log(level, message) invokes the Logger at that level
 * - When obj is non-null, it appears as `details` property in the log output
 * - When obj is null, no `details` property is included
 * - bridge.log() never throws for any input combination
 * 
 * @private
 * @module test/powertools/property/logger-delegation-property-tests
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import fc from "fast-check";

// Import LoggerBridge
const LoggerBridgeModule = await import("../../../src/lib/utils/LoggerBridge.js");
const { LoggerBridge } = LoggerBridgeModule;

describe("Property 6: Logger Delegation with Structured Output", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Logger invocation at correct level", () => {

		/**
		 * **Validates: Requirements 6.1, 6.2**
		 * 
		 * For any valid level and message, bridge.log(level, message) invokes
		 * the Powertools Logger at that exact level.
		 */
		it("Property: bridge.log(level, message) invokes the Logger at the specified level", () => {
			const bridge = new LoggerBridge("test-service");

			// Since @aws-lambda-powertools/logger IS installed as devDependency, bridge should be active
			expect(bridge.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.constantFrom("error", "warn", "info", "debug"),
					fc.string({ minLength: 0, maxLength: 500 }),
					(level, message) => {
						// Spy on the Logger instance method for this level
						const spy = jest.spyOn(bridge.instance, level).mockImplementation(() => {});

						bridge.log(level, message);

						expect(spy).toHaveBeenCalledTimes(1);
						// First argument should be the message
						expect(spy.mock.calls[0][0]).toBe(message);

						spy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Details property inclusion when obj is non-null", () => {

		/**
		 * **Validates: Requirements 6.1, 6.2**
		 * 
		 * When obj is non-null, it appears as `details` property in the structured output.
		 */
		it("Property: when obj is non-null, it is included as `details` in the log call", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.constantFrom("error", "warn", "info", "debug"),
					fc.string({ minLength: 0, maxLength: 200 }),
					fc.record({ key: fc.string() }),
					(level, message, obj) => {
						const spy = jest.spyOn(bridge.instance, level).mockImplementation(() => {});

						bridge.log(level, message, obj);

						expect(spy).toHaveBeenCalledTimes(1);
						// Second argument should be an object containing `details`
						const extraArg = spy.mock.calls[0][1];
						expect(extraArg).toBeDefined();
						expect(extraArg.details).toBe(obj);

						spy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Details property omission when obj is null", () => {

		/**
		 * **Validates: Requirements 6.1, 6.2**
		 * 
		 * When obj is null, no `details` property is included in the log call.
		 */
		it("Property: when obj is null, no `details` property is included", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);

			// Clear any trace ID env var to isolate the test
			const originalTraceId = process.env._X_AMZN_TRACE_ID;
			delete process.env._X_AMZN_TRACE_ID;

			try {
				fc.assert(
					fc.property(
						fc.constantFrom("error", "warn", "info", "debug"),
						fc.string({ minLength: 0, maxLength: 200 }),
						(level, message) => {
							const spy = jest.spyOn(bridge.instance, level).mockImplementation(() => {});

							bridge.log(level, message, null);

							expect(spy).toHaveBeenCalledTimes(1);
							// Second argument should be an object without `details`
							const extraArg = spy.mock.calls[0][1];
							expect(extraArg).toBeDefined();
							expect(extraArg).not.toHaveProperty("details");

							spy.mockRestore();
						}
					),
					{ numRuns: 100 }
				);
			} finally {
				// Restore env var
				if (originalTraceId !== undefined) {
					process.env._X_AMZN_TRACE_ID = originalTraceId;
				}
			}
		});
	});

	describe("No-throw guarantee", () => {

		/**
		 * **Validates: Requirements 6.1, 6.2**
		 * 
		 * bridge.log() never throws for any input combination, including
		 * arbitrary levels, messages, and obj values.
		 */
		it("Property: bridge.log() never throws for any input combination", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.constantFrom("error", "warn", "info", "debug"),
					fc.string({ minLength: 0, maxLength: 500 }),
					fc.oneof(
						fc.constant(null),
						fc.record({ key: fc.string() }),
						fc.constant({ nested: { deep: "value" } }),
						fc.constant([1, 2, 3]),
						fc.constant("string-obj")
					),
					(level, message, obj) => {
						// Even if the Logger throws internally, bridge.log should not throw
						expect(() => bridge.log(level, message, obj)).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 6.1, 6.2**
		 * 
		 * bridge.log() never throws even when the underlying Logger method throws.
		 */
		it("Property: bridge.log() never throws even when Logger method throws", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);

			fc.assert(
				fc.property(
					fc.constantFrom("error", "warn", "info", "debug"),
					fc.string({ minLength: 0, maxLength: 200 }),
					fc.oneof(fc.constant(null), fc.record({ key: fc.string() })),
					(level, message, obj) => {
						// Make the Logger method throw
						const spy = jest.spyOn(bridge.instance, level).mockImplementation(() => {
							throw new Error("Logger exploded");
						});

						// bridge.log should still not throw
						expect(() => bridge.log(level, message, obj)).not.toThrow();

						spy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
