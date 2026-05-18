/**
 * Unit tests for PowertoolsInit module.
 * Tests env var parsing, capability enablement logic, initialization guard,
 * and state accessors.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
	saveEnv,
	restoreEnv,
	clearPowertoolsEnv
} from "../helpers/env-helper.mjs";

// Import the module under test
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const { initPowertools, getState, getActiveTracingProvider, getLoggerBridge, getMetricsHelper, TestHarness } = PowertoolsInit.default || PowertoolsInit;
const { parseEnvFlag, isCapabilityEnabled, tryImport, resetForTesting } = TestHarness.getInternals();

describe("PowertoolsInit", () => {
	let envSnapshot;

	beforeEach(() => {
		envSnapshot = saveEnv();
		clearPowertoolsEnv();
		resetForTesting();
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
		resetForTesting();
	});

	describe("parseEnvFlag()", () => {
		it("should return null for undefined", () => {
			expect(parseEnvFlag(undefined)).toBe(null);
		});

		it("should return null for null", () => {
			expect(parseEnvFlag(null)).toBe(null);
		});

		it("should return null for empty string", () => {
			expect(parseEnvFlag("")).toBe(null);
		});

		it('should return false for "0"', () => {
			expect(parseEnvFlag("0")).toBe(false);
		});

		it('should return false for "false"', () => {
			expect(parseEnvFlag("false")).toBe(false);
		});

		it('should return false for "no"', () => {
			expect(parseEnvFlag("no")).toBe(false);
		});

		it('should return false for "FALSE" (case-insensitive)', () => {
			expect(parseEnvFlag("FALSE")).toBe(false);
		});

		it('should return false for "No" (case-insensitive)', () => {
			expect(parseEnvFlag("No")).toBe(false);
		});

		it('should return false for "False" (mixed case)', () => {
			expect(parseEnvFlag("False")).toBe(false);
		});

		it('should return true for "1"', () => {
			expect(parseEnvFlag("1")).toBe(true);
		});

		it('should return true for "true"', () => {
			expect(parseEnvFlag("true")).toBe(true);
		});

		it('should return true for "yes"', () => {
			expect(parseEnvFlag("yes")).toBe(true);
		});

		it('should return true for "TRUE" (case-insensitive)', () => {
			expect(parseEnvFlag("TRUE")).toBe(true);
		});

		it('should return true for "Yes" (case-insensitive)', () => {
			expect(parseEnvFlag("Yes")).toBe(true);
		});

		it("should return true for unrecognized non-empty values", () => {
			expect(parseEnvFlag("enabled")).toBe(true);
			expect(parseEnvFlag("on")).toBe(true);
			expect(parseEnvFlag("anything")).toBe(true);
			expect(parseEnvFlag("2")).toBe(true);
			expect(parseEnvFlag("xyz")).toBe(true);
		});
	});

	describe("isCapabilityEnabled()", () => {
		it("should return false when globalFlag is false regardless of other inputs", () => {
			expect(isCapabilityEnabled(false, null, true)).toBe(false);
			expect(isCapabilityEnabled(false, true, true)).toBe(false);
			expect(isCapabilityEnabled(false, null, false)).toBe(false);
			expect(isCapabilityEnabled(false, false, true)).toBe(false);
		});

		it("should return false when individualFlag is false regardless of importability", () => {
			expect(isCapabilityEnabled(null, false, true)).toBe(false);
			expect(isCapabilityEnabled(true, false, true)).toBe(false);
			expect(isCapabilityEnabled(null, false, false)).toBe(false);
		});

		it("should return isImportable when neither flag is false", () => {
			expect(isCapabilityEnabled(null, null, true)).toBe(true);
			expect(isCapabilityEnabled(null, null, false)).toBe(false);
			expect(isCapabilityEnabled(true, null, true)).toBe(true);
			expect(isCapabilityEnabled(true, true, true)).toBe(true);
			expect(isCapabilityEnabled(null, true, false)).toBe(false);
		});
	});

	describe("tryImport()", () => {
		it("should return true for an importable package", () => {
			// 'path' is a built-in Node.js module, always available
			expect(tryImport("path")).toBe(true);
		});

		it("should return false for a non-existent package", () => {
			expect(tryImport("@nonexistent/package-that-does-not-exist-xyz")).toBe(false);
		});

		it("should not throw for any package name", () => {
			expect(() => tryImport("totally-fake-package")).not.toThrow();
		});
	});

	describe("initPowertools()", () => {
		it("should return state object with tracer, logger, metrics booleans", () => {
			const state = initPowertools();
			expect(state).toHaveProperty("tracer");
			expect(state).toHaveProperty("logger");
			expect(state).toHaveProperty("metrics");
			expect(typeof state.tracer).toBe("boolean");
			expect(typeof state.logger).toBe("boolean");
			expect(typeof state.metrics).toBe("boolean");
		});

		it("should never throw regardless of environment", () => {
			process.env.CACHE_DATA_POWERTOOLS = "invalid-value";
			expect(() => initPowertools()).not.toThrow();
		});

		it("should run only once (initialization guard)", () => {
			const state1 = initPowertools();
			// Modify env after first init - should not affect result
			process.env.CACHE_DATA_POWERTOOLS = "false";
			const state2 = initPowertools();
			expect(state1).toEqual(state2);
		});

		it("should disable all capabilities when CACHE_DATA_POWERTOOLS is false", () => {
			process.env.CACHE_DATA_POWERTOOLS = "false";
			const state = initPowertools();
			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(false);
		});

		it("should disable all capabilities when CACHE_DATA_POWERTOOLS is 0", () => {
			process.env.CACHE_DATA_POWERTOOLS = "0";
			const state = initPowertools();
			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(false);
		});

		it("should disable individual capability when its env var is false", () => {
			process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
			const state = initPowertools();
			expect(state.tracer).toBe(false);
		});

		it("should detect Powertools packages when installed (devDependencies)", () => {
			// Powertools packages are in devDependencies, so they should be importable
			const state = initPowertools();
			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(true);
		});
	});

	describe("getState()", () => {
		it("should return same state as initPowertools()", () => {
			const initState = initPowertools();
			const queryState = getState();
			expect(queryState).toEqual(initState);
		});

		it("should return all false before initialization when packages are disabled", () => {
			process.env.CACHE_DATA_POWERTOOLS = "no";
			initPowertools();
			const state = getState();
			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(false);
		});
	});

	describe("getActiveTracingProvider()", () => {
		it("should return a TracingProvider instance after initialization", () => {
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider).not.toBe(null);
			expect(provider.name).toBeDefined();
		});

		it("should return PowertoolsTracerProvider when tracer is available and enabled", () => {
			// Powertools packages are in devDependencies, so tracer is available
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("powertools-tracer");
		});

		it("should return NoOpTracingProvider when all tracing is disabled", () => {
			process.env.CACHE_DATA_POWERTOOLS = "false";
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("none");
		});

		it("should return RawXRayProvider when tracer disabled but X-Ray env is on", () => {
			process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
			process.env.CacheData_AWSXRayOn = "true";
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("raw-xray");
		});

		it("should return RawXRayProvider when CACHE_DATA_AWS_X_RAY_ON is set and tracer disabled", () => {
			process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
			process.env.CACHE_DATA_AWS_X_RAY_ON = "1";
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("raw-xray");
		});

		it("should return NoOpTracingProvider when tracer disabled and X-Ray off", () => {
			process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("none");
		});

		it("should prefer PowertoolsTracerProvider over RawXRayProvider when both available", () => {
			// Both tracer importable and X-Ray env on
			process.env.CacheData_AWSXRayOn = "true";
			initPowertools();
			const provider = getActiveTracingProvider();
			expect(provider.name).toBe("powertools-tracer");
		});
	});

	describe("getLoggerBridge()", () => {
		it("should return a LoggerBridge instance when logger is enabled", () => {
			initPowertools();
			const bridge = getLoggerBridge();
			expect(bridge).not.toBe(null);
			expect(bridge.isActive).toBe(true);
		});
	});

	describe("getMetricsHelper()", () => {
		it("should return a MetricsHelper instance when metrics is enabled", () => {
			initPowertools();
			const metrics = getMetricsHelper();
			expect(metrics).not.toBe(null);
			expect(metrics.isActive).toBe(true);
		});
	});

	describe("TestHarness", () => {
		it("should expose internal functions for testing", () => {
			const internals = TestHarness.getInternals();
			expect(typeof internals.parseEnvFlag).toBe("function");
			expect(typeof internals.isCapabilityEnabled).toBe("function");
			expect(typeof internals.tryImport).toBe("function");
			expect(typeof internals.resetForTesting).toBe("function");
			expect(internals.powertoolsState).toBeDefined();
		});

		it("resetForTesting should reset all state", () => {
			initPowertools();
			const internals = TestHarness.getInternals();
			internals.resetForTesting();

			expect(internals.powertoolsState.tracer.available).toBe(false);
			expect(internals.powertoolsState.tracer.enabled).toBe(false);
			expect(internals.powertoolsState.logger.available).toBe(false);
			expect(internals.powertoolsState.logger.enabled).toBe(false);
			expect(internals.powertoolsState.metrics.available).toBe(false);
			expect(internals.powertoolsState.metrics.enabled).toBe(false);
		});
	});
});
