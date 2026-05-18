import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import fc from "fast-check";
import { LoggerBridge } from "../../../src/lib/utils/LoggerBridge.js";
import { withEnv, saveEnv, restoreEnv, POWERTOOLS_ENV_VARS } from "../helpers/env-helper.mjs";

/**
 * Property 15: Trace ID Correlation
 * 
 * For any log entry emitted when the Powertools Logger is active, if the
 * _X_AMZN_TRACE_ID environment variable contains a non-empty string, the log
 * entry SHALL include an xray_trace_id field with that value. If the variable
 * is unset or empty, the field SHALL be absent.
 * 
 * **Validates: Requirements 6.6, 6.7**
 */
describe("Property 15: Trace ID Correlation", () => {

	let envSnapshot;

	beforeEach(() => {
		envSnapshot = saveEnv();
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
		jest.restoreAllMocks();
	});

	describe("When _X_AMZN_TRACE_ID is set to a non-empty string, bridge.log() includes xray_trace_id in the extra data", () => {
		it("should include xray_trace_id for any non-empty trace ID string", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(traceId) => {
						const bridge = new LoggerBridge("test-service");

						if (!bridge.isActive) {
							// Logger not available, skip property check
							return true;
						}

						// Spy on the underlying logger instance
						const loggerInstance = bridge.instance;
						const infoSpy = jest.spyOn(loggerInstance, "info").mockImplementation(() => {});

						// Set the trace ID env var
						process.env._X_AMZN_TRACE_ID = traceId;

						// Call bridge.log
						bridge.log("info", "test message", null);

						// Verify xray_trace_id is included in the extra object
						expect(infoSpy).toHaveBeenCalledTimes(1);
						const [, extraArg] = infoSpy.mock.calls[0];
						expect(extraArg).toBeDefined();
						expect(extraArg.xray_trace_id).toBe(traceId);

						// Cleanup spy
						infoSpy.mockRestore();
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("When _X_AMZN_TRACE_ID is unset or empty, bridge.log() does NOT include xray_trace_id", () => {
		it("should not include xray_trace_id when env var is unset or empty", () => {
			fc.assert(
				fc.property(
					fc.oneof(fc.constant(undefined), fc.constant("")),
					(traceIdValue) => {
						const bridge = new LoggerBridge("test-service");

						if (!bridge.isActive) {
							// Logger not available, skip property check
							return true;
						}

						// Spy on the underlying logger instance
						const loggerInstance = bridge.instance;
						const infoSpy = jest.spyOn(loggerInstance, "info").mockImplementation(() => {});

						// Set or unset the trace ID env var
						if (traceIdValue === undefined) {
							delete process.env._X_AMZN_TRACE_ID;
						} else {
							process.env._X_AMZN_TRACE_ID = traceIdValue;
						}

						// Call bridge.log
						bridge.log("info", "test message", null);

						// Verify xray_trace_id is NOT included in the extra object
						expect(infoSpy).toHaveBeenCalledTimes(1);
						const [, extraArg] = infoSpy.mock.calls[0];
						expect(extraArg).toBeDefined();
						expect(extraArg).not.toHaveProperty("xray_trace_id");

						// Cleanup spy
						infoSpy.mockRestore();
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("The xray_trace_id value matches exactly what is in the env var", () => {
		it("should have xray_trace_id value that exactly matches _X_AMZN_TRACE_ID", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(traceId) => {
						const bridge = new LoggerBridge("test-service");

						if (!bridge.isActive) {
							// Logger not available, skip property check
							return true;
						}

						// Spy on the underlying logger instance
						const loggerInstance = bridge.instance;
						const infoSpy = jest.spyOn(loggerInstance, "info").mockImplementation(() => {});

						// Set the trace ID env var
						process.env._X_AMZN_TRACE_ID = traceId;

						// Call bridge.log with some extra data
						bridge.log("info", "test message", { key: "value" });

						// Verify xray_trace_id matches exactly
						expect(infoSpy).toHaveBeenCalledTimes(1);
						const [, extraArg] = infoSpy.mock.calls[0];
						expect(extraArg.xray_trace_id).toStrictEqual(traceId);

						// Cleanup spy
						infoSpy.mockRestore();
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});
});
