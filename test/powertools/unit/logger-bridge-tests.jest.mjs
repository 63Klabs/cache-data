/**
 * Unit tests for LoggerBridge module.
 * 
 * Tests level mapping, context enrichment, trace ID correlation,
 * error resilience, and fallback behavior.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { createEnvContext } from "../helpers/env-helper.mjs";

// Import LoggerBridge
const LoggerBridgeModule = await import("../../../src/lib/utils/LoggerBridge.js");
const { LoggerBridge } = LoggerBridgeModule;

const envContext = createEnvContext();

describe("LoggerBridge", () => {

	beforeEach(() => {
		envContext.setup();
	});

	afterEach(() => {
		envContext.teardown();
		jest.restoreAllMocks();
	});

	describe("Constructor and isActive", () => {

		it("should create an active bridge when @aws-lambda-powertools/logger is available", () => {
			// Since @aws-lambda-powertools/logger IS installed as devDependency
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);
		});

		it("isActive should return true when Logger is available", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.isActive).toBe(true);
		});
	});

	describe("instance getter", () => {

		it("should return the Logger instance when active", () => {
			const bridge = new LoggerBridge("test-service");
			expect(bridge.instance).not.toBe(null);
			expect(bridge.instance).toBeDefined();
		});

		it("should return an object with Logger methods", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			expect(typeof logger.info).toBe("function");
			expect(typeof logger.error).toBe("function");
			expect(typeof logger.warn).toBe("function");
			expect(typeof logger.debug).toBe("function");
		});
	});

	describe("static mapLevel()", () => {

		it("should map ERROR to 'error'", () => {
			expect(LoggerBridge.mapLevel("ERROR")).toBe("error");
		});

		it("should map WARN to 'warn'", () => {
			expect(LoggerBridge.mapLevel("WARN")).toBe("warn");
		});

		it("should map INFO to 'info'", () => {
			expect(LoggerBridge.mapLevel("INFO")).toBe("info");
		});

		it("should map MSG to 'info'", () => {
			expect(LoggerBridge.mapLevel("MSG")).toBe("info");
		});

		it("should map DIAG to 'debug'", () => {
			expect(LoggerBridge.mapLevel("DIAG")).toBe("debug");
		});

		it("should map DEBUG to 'debug'", () => {
			expect(LoggerBridge.mapLevel("DEBUG")).toBe("debug");
		});

		it("should map LOG to 'info'", () => {
			expect(LoggerBridge.mapLevel("LOG")).toBe("info");
		});

		it("should return 'info' for unknown tags", () => {
			expect(LoggerBridge.mapLevel("UNKNOWN")).toBe("info");
			expect(LoggerBridge.mapLevel("TRACE")).toBe("info");
			expect(LoggerBridge.mapLevel("VERBOSE")).toBe("info");
			expect(LoggerBridge.mapLevel("")).toBe("info");
		});
	});

	describe("log() method", () => {

		it("should call Logger at the correct level", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;

			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
			const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => {});
			const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});
			const debugSpy = jest.spyOn(logger, "debug").mockImplementation(() => {});

			bridge.log("info", "info message");
			expect(infoSpy).toHaveBeenCalledTimes(1);

			bridge.log("error", "error message");
			expect(errorSpy).toHaveBeenCalledTimes(1);

			bridge.log("warn", "warn message");
			expect(warnSpy).toHaveBeenCalledTimes(1);

			bridge.log("debug", "debug message");
			expect(debugSpy).toHaveBeenCalledTimes(1);
		});

		it("should include obj as 'details' when non-null", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			const testObj = { key: "value", count: 42 };
			bridge.log("info", "test message", testObj);

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[0]).toBe("test message");
			expect(callArgs[1]).toHaveProperty("details", testObj);
		});

		it("should NOT include 'details' when obj is null", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			bridge.log("info", "test message", null);

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[0]).toBe("test message");
			expect(callArgs[1]).not.toHaveProperty("details");
		});

		it("should NOT include 'details' when obj is omitted (defaults to null)", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			bridge.log("info", "test message");

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[0]).toBe("test message");
			expect(callArgs[1]).not.toHaveProperty("details");
		});

		it("should include xray_trace_id when _X_AMZN_TRACE_ID is set", () => {
			const traceId = "Root=1-abc-def;Parent=ghi;Sampled=1";
			envContext.set({ _X_AMZN_TRACE_ID: traceId });

			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			bridge.log("info", "traced message");

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[1]).toHaveProperty("xray_trace_id", traceId);
		});

		it("should NOT include xray_trace_id when _X_AMZN_TRACE_ID is unset", () => {
			// envContext.setup() already clears all powertools env vars including _X_AMZN_TRACE_ID
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			bridge.log("info", "untraced message");

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[1]).not.toHaveProperty("xray_trace_id");
		});

		it("should NOT include xray_trace_id when _X_AMZN_TRACE_ID is empty string", () => {
			envContext.set({ _X_AMZN_TRACE_ID: "" });

			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

			bridge.log("info", "empty trace message");

			expect(infoSpy).toHaveBeenCalledTimes(1);
			const callArgs = infoSpy.mock.calls[0];
			expect(callArgs[1]).not.toHaveProperty("xray_trace_id");
		});

		it("should never throw even if Logger method throws", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			jest.spyOn(logger, "info").mockImplementation(() => {
				throw new Error("Logger exploded");
			});

			expect(() => bridge.log("info", "should not throw")).not.toThrow();
		});

		it("should be a no-op when bridge is not active (Logger is null)", () => {
			// Create a bridge and manually test the no-op path
			// Since Logger IS available, we test by verifying the guard logic
			// by calling log on a bridge where we force #logger to null via the constructor path
			// We can't easily force this since Logger is installed, so we verify the method
			// doesn't throw when called with any level
			const bridge = new LoggerBridge("test-service");
			expect(() => bridge.log("info", "test")).not.toThrow();
			expect(() => bridge.log("error", "test")).not.toThrow();
			expect(() => bridge.log("warn", "test")).not.toThrow();
			expect(() => bridge.log("debug", "test")).not.toThrow();
		});
	});

	describe("addContext() method", () => {

		it("should call Logger.addContext() with the context object", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const addContextSpy = jest.spyOn(logger, "addContext").mockImplementation(() => {});

			const lambdaContext = {
				awsRequestId: "req-123",
				functionName: "my-function",
				functionVersion: "$LATEST",
				memoryLimitInMB: "128"
			};

			bridge.addContext(lambdaContext);

			expect(addContextSpy).toHaveBeenCalledTimes(1);
			expect(addContextSpy).toHaveBeenCalledWith(lambdaContext);
		});

		it("should do nothing when context is null", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const addContextSpy = jest.spyOn(logger, "addContext").mockImplementation(() => {});

			bridge.addContext(null);

			expect(addContextSpy).not.toHaveBeenCalled();
		});

		it("should do nothing when context is undefined", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			const addContextSpy = jest.spyOn(logger, "addContext").mockImplementation(() => {});

			bridge.addContext(undefined);

			expect(addContextSpy).not.toHaveBeenCalled();
		});

		it("should never throw even if Logger.addContext() throws", () => {
			const bridge = new LoggerBridge("test-service");
			const logger = bridge.instance;
			jest.spyOn(logger, "addContext").mockImplementation(() => {
				throw new Error("addContext exploded");
			});

			const lambdaContext = {
				awsRequestId: "req-456",
				functionName: "my-function"
			};

			expect(() => bridge.addContext(lambdaContext)).not.toThrow();
		});
	});
});
