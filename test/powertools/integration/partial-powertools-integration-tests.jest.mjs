/**
 * Partial Powertools Integration Tests
 * 
 * Tests that each Powertools capability (Tracer, Logger, Metrics) works
 * independently when the other two are disabled via environment variables.
 * 
 * Since all 3 Powertools packages ARE installed as devDependencies, we simulate
 * "only one available" by disabling the others via env vars:
 * - Only Tracer: CACHE_DATA_POWERTOOLS_LOGGER=false, CACHE_DATA_POWERTOOLS_METRICS=false
 * - Only Logger: CACHE_DATA_POWERTOOLS_TRACER=false, CACHE_DATA_POWERTOOLS_METRICS=false
 * - Only Metrics: CACHE_DATA_POWERTOOLS_TRACER=false, CACHE_DATA_POWERTOOLS_LOGGER=false
 * 
 * Validates: Requirements 1.1, 1.2, 2.7
 * 
 * @private
 * @module test/powertools/integration/partial-powertools-integration-tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createEnvContext } from "../helpers/env-helper.mjs";

// Import PowertoolsInit module
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const {
	initPowertools,
	getState,
	getActiveTracingProvider,
	getLoggerBridge,
	getMetricsHelper,
	TestHarness
} = PowertoolsInit.default || PowertoolsInit;
const { resetForTesting } = TestHarness.getInternals();

// Environment context for clean test isolation
const envContext = createEnvContext();

describe("Partial Powertools Integration Tests", () => {

	beforeEach(() => {
		envContext.setup();
		resetForTesting();
	});

	afterEach(() => {
		envContext.teardown();
		resetForTesting();
	});

	describe("Only Tracer enabled (Logger and Metrics disabled)", () => {

		beforeEach(() => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_LOGGER: "false",
				CACHE_DATA_POWERTOOLS_METRICS: "false"
			});
		});

		it("should enable only tracer in getState()", () => {
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(false);
		});

		it("should return a valid TracingProvider instance", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(provider).not.toBeNull();
			expect(provider.name).toBe("powertools-tracer");
		});

		it("should return null for LoggerBridge", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(bridge).toBeNull();
		});

		it("should return null for MetricsHelper", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(metrics).toBeNull();
		});

		it("should not throw during initialization", () => {
			expect(() => initPowertools()).not.toThrow();
		});

		it("TracingProvider should have functional instrumentClient method", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			// instrumentClient should accept a client and return it (or instrumented version)
			const mockClient = { send: () => {} };
			const result = provider.instrumentClient(mockClient);
			expect(result).toBeDefined();
		});
	});

	describe("Only Logger enabled (Tracer and Metrics disabled)", () => {

		beforeEach(() => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_TRACER: "false",
				CACHE_DATA_POWERTOOLS_METRICS: "false"
			});
		});

		it("should enable only logger in getState()", () => {
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(false);
		});

		it("should return a valid LoggerBridge instance", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(bridge).not.toBeNull();
			expect(bridge.isActive).toBe(true);
		});

		it("should return null for MetricsHelper", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(metrics).toBeNull();
		});

		it("TracingProvider should be NoOp or RawXRay (not PowertoolsTracer)", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			// Tracer is disabled, so provider should NOT be powertools-tracer
			expect(provider).not.toBeNull();
			expect(provider.name).not.toBe("powertools-tracer");
		});

		it("should not throw during initialization", () => {
			expect(() => initPowertools()).not.toThrow();
		});

		it("LoggerBridge should support log method without throwing", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(() => bridge.log("info", "test message", { key: "value" })).not.toThrow();
			expect(() => bridge.log("error", "error message")).not.toThrow();
			expect(() => bridge.log("debug", "debug message", null)).not.toThrow();
		});
	});

	describe("Only Metrics enabled (Tracer and Logger disabled)", () => {

		beforeEach(() => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_TRACER: "false",
				CACHE_DATA_POWERTOOLS_LOGGER: "false",
				POWERTOOLS_METRICS_NAMESPACE: "TestNamespace"
			});
		});

		it("should enable only metrics in getState()", () => {
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(true);
		});

		it("should return a valid MetricsHelper instance", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(metrics).not.toBeNull();
			expect(metrics.isActive).toBe(true);
		});

		it("should return null for LoggerBridge", () => {
			initPowertools();
			const bridge = getLoggerBridge();

			expect(bridge).toBeNull();
		});

		it("TracingProvider should be NoOp or RawXRay (not PowertoolsTracer)", () => {
			initPowertools();
			const provider = getActiveTracingProvider();

			expect(provider).not.toBeNull();
			expect(provider.name).not.toBe("powertools-tracer");
		});

		it("should not throw during initialization", () => {
			expect(() => initPowertools()).not.toThrow();
		});

		it("MetricsHelper should support recording methods without throwing", () => {
			initPowertools();
			const metrics = getMetricsHelper();

			expect(() => metrics.recordCacheHit(45)).not.toThrow();
			expect(() => metrics.recordCacheMiss(12)).not.toThrow();
			expect(() => metrics.recordCacheWrite(30)).not.toThrow();
			expect(() => metrics.recordEndpointRequest(100, 200)).not.toThrow();
			expect(() => metrics.recordEndpointRequest(200, 500)).not.toThrow();
			expect(() => metrics.flush()).not.toThrow();
		});
	});

	describe("Cross-scenario: capabilities are truly independent", () => {

		it("disabling tracer does not affect logger detection", () => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_TRACER: "false"
			});
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(false);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(true);
		});

		it("disabling logger does not affect metrics detection", () => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_LOGGER: "false"
			});
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(false);
			expect(state.metrics).toBe(true);
		});

		it("disabling metrics does not affect tracer detection", () => {
			envContext.set({
				CACHE_DATA_POWERTOOLS_METRICS: "false"
			});
			initPowertools();
			const state = getState();

			expect(state.tracer).toBe(true);
			expect(state.logger).toBe(true);
			expect(state.metrics).toBe(false);
		});

		it("each disabled capability returns null accessor while enabled ones return instances", () => {
			// Disable only logger
			envContext.set({
				CACHE_DATA_POWERTOOLS_LOGGER: "false"
			});
			initPowertools();

			expect(getActiveTracingProvider()).not.toBeNull();
			expect(getLoggerBridge()).toBeNull();
			expect(getMetricsHelper()).not.toBeNull();
		});
	});
});
