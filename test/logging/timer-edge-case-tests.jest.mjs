/**
 * Jest edge case tests for Timer class
 * Tests timer edge cases, behavior with very short intervals, and state transitions
 * 
 * Tests cover:
 * - Timer edge cases (negative elapsed times, timer not started)
 * - Timer behavior with very short intervals
 * - Timer state transitions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Timer, DebugAndLog } from '../../src/lib/tools/index.js';
import { sleep } from '../helpers/utils.mjs';

let originalEnv = { ...process.env };

const beforeEachEnvVars = function() {
	// Clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	jest.spyOn(console, 'log').mockImplementation(() => {});
	jest.spyOn(console, 'warn').mockImplementation(() => {});
	jest.spyOn(console, 'error').mockImplementation(() => {});
	jest.spyOn(console, 'info').mockImplementation(() => {});
	jest.spyOn(console, 'debug').mockImplementation(() => {});
}

const afterEachEnvVars = function() {
	// Clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	// Restore the original environment variables
	process.env = originalEnv;

	jest.restoreAllMocks();
}

describe("Timer Edge Case Tests", () => {

	beforeEach(() => {
		beforeEachEnvVars();	
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	describe("Timer Not Started Edge Cases", () => {

		it("should handle elapsed() when timer not started", () => {
			const timer = new Timer("test-not-started", false);
			const elapsed = timer.elapsed();
			// Should return negative value or handle gracefully
			expect(typeof elapsed).toBe('number');
		});


		it("should handle elapsedSinceStart() when timer not started", () => {
			const timer = new Timer("test-not-started-since", false);
			const elapsed = timer.elapsedSinceStart();
			// Should return negative value or handle gracefully
			expect(typeof elapsed).toBe('number');
		});

		it("should handle elapsedSinceStop() when timer not started", () => {
			const timer = new Timer("test-not-started-stop", false);
			const elapsed = timer.elapsedSinceStop();
			// Returns a timestamp value when not started
			expect(typeof elapsed).toBe('number');
			expect(elapsed).toBeGreaterThan(0);
		});

		it("should handle stop() when timer not started", () => {
			const timer = new Timer("test-stop-not-started", false);
			const result = timer.stop();
			// Should handle gracefully
			expect(typeof result).toBe('number');
		});

		it("should handle multiple start() calls", async () => {
			const timer = new Timer("test-multiple-start", false);
			await timer.start();
			const firstStart = timer.startTime;
			
			await sleep(50);
			await timer.start(); // Second start should be ignored
			
			// Start time should not change
			expect(timer.startTime).toBe(firstStart);
		});

		it("should handle multiple stop() calls", () => {
			const timer = new Timer("test-multiple-stop", true);
			timer.stop();
			const firstStop = timer.stopTime;
			
			timer.stop(); // Second stop should be ignored
			
			// Stop time should not change
			expect(timer.stopTime).toBe(firstStop);
		});

	});

	describe("Very Short Intervals", () => {

		it("should handle timer with zero elapsed time", async () => {
			const timer = new Timer("test-zero-elapsed", true);
			const elapsed = timer.stop();
			
			// Elapsed should be >= 0 (may be 0 or very small)
			expect(elapsed).toBeGreaterThanOrEqual(0);
		});

		it("should handle timer with sub-millisecond intervals", async () => {
			const timer = new Timer("test-sub-ms", true);
			// Stop immediately
			const elapsed = timer.stop();
			
			// Should handle very small intervals
			expect(elapsed).toBeGreaterThanOrEqual(0);
			expect(elapsed).toBeLessThan(10); // Should be very small
		});

		it("should handle rapid start-stop cycles", async () => {
			for (let i = 0; i < 100; i++) {
				const timer = new Timer(`test-rapid-${i}`, true);
				const elapsed = timer.stop();
				expect(elapsed).toBeGreaterThanOrEqual(0);
			}
		});

		it("should handle timer with 1ms interval", async () => {
			const timer = new Timer("test-1ms", true);
			await sleep(1);
			const elapsed = timer.stop();
			
			expect(elapsed).toBeGreaterThanOrEqual(1);
			expect(elapsed).toBeLessThan(50); // Should be close to 1ms
		});

	});


	describe("State Transitions", () => {

		it("should transition from NOT_STARTED to IS_RUNNING", async () => {
			const timer = new Timer("test-transition-1", false);
			expect(timer.status()).toBe("NOT_STARTED");
			
			await timer.start();
			expect(timer.status()).toBe("IS_RUNNING");
		});

		it("should transition from IS_RUNNING to IS_STOPPED", () => {
			const timer = new Timer("test-transition-2", true);
			expect(timer.status()).toBe("IS_RUNNING");
			
			timer.stop();
			expect(timer.status()).toBe("IS_STOPPED");
		});

		it("should not transition from IS_STOPPED back to IS_RUNNING", async () => {
			const timer = new Timer("test-transition-3", true);
			timer.stop();
			expect(timer.status()).toBe("IS_STOPPED");
			
			await timer.start(); // Should be ignored
			expect(timer.status()).toBe("IS_STOPPED");
		});

		it("should maintain state consistency across method calls", () => {
			const timer = new Timer("test-consistency", false);
			
			expect(timer.notStarted()).toBe(true);
			expect(timer.wasStarted()).toBe(false);
			expect(timer.isRunning()).toBe(false);
			expect(timer.wasStopped()).toBe(false);
		});

		it("should maintain state consistency after start", async () => {
			const timer = new Timer("test-consistency-start", false);
			await timer.start();
			
			expect(timer.notStarted()).toBe(false);
			expect(timer.wasStarted()).toBe(true);
			expect(timer.isRunning()).toBe(true);
			expect(timer.wasStopped()).toBe(false);
		});

		it("should maintain state consistency after stop", () => {
			const timer = new Timer("test-consistency-stop", true);
			timer.stop();
			
			expect(timer.notStarted()).toBe(false);
			expect(timer.wasStarted()).toBe(true);
			expect(timer.isRunning()).toBe(false);
			expect(timer.wasStopped()).toBe(true);
		});

	});

	describe("Edge Cases with Timer Name", () => {

		it("should handle empty string name", () => {
			const timer = new Timer("", true);
			expect(timer.name).toBe("");
			expect(timer.isRunning()).toBe(true);
		});

		it("should handle very long name", () => {
			const longName = "a".repeat(1000);
			const timer = new Timer(longName, true);
			expect(timer.name).toBe(longName);
		});

		it("should handle name with special characters", () => {
			const specialName = "test\n\r\t\0timer";
			const timer = new Timer(specialName, true);
			expect(timer.name).toBe(specialName);
		});

		it("should handle null name", () => {
			const timer = new Timer(null, true);
			expect(timer.name).toBe(null);
		});

		it("should handle undefined name", () => {
			const timer = new Timer(undefined, true);
			expect(timer.name).toBe(undefined);
		});

	});


	describe("Elapsed Time Edge Cases", () => {

		it("should handle elapsed() returning consistent value after stop", async () => {
			const timer = new Timer("test-consistent-elapsed", true);
			await sleep(100);
			timer.stop();
			
			const elapsed1 = timer.elapsed();
			await sleep(50);
			const elapsed2 = timer.elapsed();
			
			// Elapsed should remain constant after stop
			expect(elapsed1).toBe(elapsed2);
		});

		it("should handle elapsedSinceStart() continuing to increase after stop", async () => {
			const timer = new Timer("test-since-start-increase", true);
			await sleep(50);
			timer.stop();
			
			const elapsed1 = timer.elapsedSinceStart();
			await sleep(50);
			const elapsed2 = timer.elapsedSinceStart();
			
			// ElapsedSinceStart should continue to increase
			expect(elapsed2).toBeGreaterThan(elapsed1);
		});

		it("should handle elapsedSinceStop() increasing after stop", async () => {
			const timer = new Timer("test-since-stop-increase", true);
			await sleep(50);
			timer.stop();
			
			const elapsed1 = timer.elapsedSinceStop();
			await sleep(50);
			const elapsed2 = timer.elapsedSinceStop();
			
			// ElapsedSinceStop should increase
			expect(elapsed2).toBeGreaterThan(elapsed1);
		});

		it("should handle now() returning increasing values", async () => {
			const timer = new Timer("test-now-increase", true);
			const now1 = timer.now();
			await sleep(10);
			const now2 = timer.now();
			
			expect(now2).toBeGreaterThan(now1);
		});

	});

	describe("Details Method Edge Cases", () => {

		it("should return complete details object", () => {
			const timer = new Timer("test-details", true);
			const details = timer.details();
			
			expect(details).toHaveProperty('name');
			expect(details).toHaveProperty('status');
			expect(details).toHaveProperty('started');
			expect(details).toHaveProperty('running');
			expect(details).toHaveProperty('stopped');
			expect(details).toHaveProperty('start');
			expect(details).toHaveProperty('stop');
			expect(details).toHaveProperty('elapsed');
			expect(details).toHaveProperty('now');
			expect(details).toHaveProperty('elapsedSinceStart');
			expect(details).toHaveProperty('elapsedSinceStop');
			expect(details).toHaveProperty('latestMessage');
		});

		it("should handle details() with sendToLog=true", () => {
			const timer = new Timer("test-details-log", true);
			const details = timer.details(true);
			
			expect(details).toBeDefined();
			// Should not throw when logging
		});

		it("should handle details() on not started timer", () => {
			const timer = new Timer("test-details-not-started", false);
			const details = timer.details();
			
			expect(details.status).toBe("NOT_STARTED");
			expect(details.started).toBe(false);
			expect(details.running).toBe(false);
			expect(details.stopped).toBe(false);
		});

	});

});
