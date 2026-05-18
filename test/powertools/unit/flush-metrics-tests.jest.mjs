/**
 * Unit tests for flushMetrics() function in PowertoolsInit.
 * 
 * Tests that flushMetrics() calls metricsHelper.flush() when metrics are active,
 * handles errors gracefully (logs warning, doesn't throw), and is a no-op when
 * metrics are not active.
 * 
 * Requirements: 10.3, 10.4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const PowertoolsInitModule = await import("../../../src/lib/tools/PowertoolsInit.js");
const { flushMetrics, getMetricsHelper, TestHarness } = PowertoolsInitModule;

describe("flushMetrics()", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("should never throw even when getMetricsHelper returns null", () => {
		// Before initPowertools is called, getMetricsHelper returns null
		const { resetForTesting } = TestHarness.getInternals();
		resetForTesting();

		expect(() => flushMetrics()).not.toThrow();
	});

	it("should never throw even when metricsHelper.flush() throws", () => {
		const { powertoolsState } = TestHarness.getInternals();

		// Create a mock metrics helper that throws on flush
		const mockHelper = {
			isActive: true,
			flush: () => { throw new Error("Flush exploded"); }
		};
		powertoolsState.metrics.instance = mockHelper;

		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

		expect(() => flushMetrics()).not.toThrow();
		expect(warnSpy).toHaveBeenCalled();
		expect(warnSpy.mock.calls[0][0]).toContain("flushMetrics failed");

		// Clean up
		powertoolsState.metrics.instance = null;
	});

	it("should call metricsHelper.flush() when metrics are active", () => {
		const { powertoolsState } = TestHarness.getInternals();

		// Create a mock metrics helper
		const mockFlush = jest.fn();
		const mockHelper = {
			isActive: true,
			flush: mockFlush
		};
		powertoolsState.metrics.instance = mockHelper;

		flushMetrics();

		expect(mockFlush).toHaveBeenCalledTimes(1);

		// Clean up
		powertoolsState.metrics.instance = null;
	});

	it("should be a no-op when metricsHelper is not active", () => {
		const { powertoolsState } = TestHarness.getInternals();

		// Create a mock metrics helper that is not active
		const mockFlush = jest.fn();
		const mockHelper = {
			isActive: false,
			flush: mockFlush
		};
		powertoolsState.metrics.instance = mockHelper;

		flushMetrics();

		expect(mockFlush).not.toHaveBeenCalled();

		// Clean up
		powertoolsState.metrics.instance = null;
	});

	it("should be a no-op when metricsHelper instance is null", () => {
		const { powertoolsState } = TestHarness.getInternals();
		powertoolsState.metrics.instance = null;

		// Should not throw
		expect(() => flushMetrics()).not.toThrow();
	});

	it("should log a warning when flush fails", () => {
		const { powertoolsState } = TestHarness.getInternals();

		const mockHelper = {
			isActive: true,
			flush: () => { throw new Error("Network timeout"); }
		};
		powertoolsState.metrics.instance = mockHelper;

		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

		flushMetrics();

		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0][0]).toContain("Network timeout");

		// Clean up
		powertoolsState.metrics.instance = null;
	});
});
