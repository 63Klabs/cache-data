/**
 * Jest tests for Timer class
 * Migrated from Mocha (timer-tests.mjs)
 * 
 * Tests cover:
 * - Timer state methods (isRunning, wasStarted, notStarted, wasStopped, status)
 * - Timer control methods (start, stop)
 * - Timer calculation methods (elapsed, elapsedSinceStart, elapsedSinceStop, now)
 * - Timer construction with auto-start enabled and disabled
 * - Timer behavior after stop
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Timer } from '../../src/lib/tools/index.js';
import { DebugAndLog } from '../../src/lib/tools/index.js';

import { sleep } from '../helpers/utils.mjs';

let originalEnv = { ...process.env };

const beforeEachEnvVars = function() {
	// clear out environment and log environment variables
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
	// clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	// Restore the original environment variables
	process.env = originalEnv;

	jest.restoreAllMocks();
}

describe("Timer tests", () => {

	beforeEach(() => {
		beforeEachEnvVars();	
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	const t1 = new Timer("Timer 1 start", true);
	const t2 = new Timer("Timer 2 no start", false);
	const t3 = new Timer("Timer 3 default start");

	describe('Check Starts: construct, isRunning(), wasStarted(), notStarted() wasStopped()', () => {
		it('Check if timer 1 started', async () => {
			expect(t1.isRunning()).toBe(true);
			expect(t1.wasStarted()).toBe(true);
			expect(t1.notStarted()).toBe(false);
			expect(t1.wasStopped()).toBe(false);
			expect(t1.status()).toBe("IS_RUNNING")
		})

		it('Check if timer 2 not started', async () => {
			expect(t2.isRunning()).toBe(false);
			expect(t2.wasStarted()).toBe(false);
			expect(t2.notStarted()).toBe(true);
			expect(t2.wasStopped()).toBe(false);
			expect(t2.status()).toBe("NOT_STARTED")
		})

		it('Check if timer 3 not started', async () => {
			expect(t3.isRunning()).toBe(false);
			expect(t3.wasStarted()).toBe(false);
			expect(t3.notStarted()).toBe(true);
			expect(t3.wasStopped()).toBe(false);
			expect(t3.status()).toBe("NOT_STARTED")
		})

		const t4 = new Timer("Timer 1 start", true);
		const t5 = new Timer("Timer 2 no start", false);
		const t6 = new Timer("Timer 3 default start");
		t4.start();
		t4.stop();
		t5.start();
		t6.start();

		it('Check if timer 4 stopped', async () => {
			expect(t4.isRunning()).toBe(false);
			expect(t4.wasStarted()).toBe(true);
			expect(t4.notStarted()).toBe(false);
			expect(t4.wasStopped()).toBe(true);
			expect(t4.status()).toBe("IS_STOPPED")
		})

		it('Check if timer 5 started', async () => {
			expect(t5.isRunning()).toBe(true);
			expect(t5.wasStarted()).toBe(true);
			expect(t5.notStarted()).toBe(false);
			expect(t5.wasStopped()).toBe(false);
			expect(t5.status()).toBe("IS_RUNNING")
		})

		it('Check if timer 6 started', async () => {
			expect(t6.isRunning()).toBe(true);
			expect(t6.wasStarted()).toBe(true);
			expect(t6.notStarted()).toBe(false);
			expect(t6.wasStopped()).toBe(false);
			expect(t6.status()).toBe("IS_RUNNING")
		})

	})

	describe('Check Timer calc functions', () => {

		it('Check elapsed() no stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			let a = t.elapsed();
			await sleep(100);
			expect(t.elapsed()).toBeGreaterThan(a)
		})

		it('Check elapsedSinceStart() no stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			let a = t.elapsedSinceStart();
			await sleep(100);
			expect(t.elapsedSinceStart()).toBeGreaterThan(a);
		})

		it('Check elapsedSinceStop() no stop - should be -1', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			expect(t.elapsedSinceStop()).toBe(-1);
		})

		it('Check elapsed() after stop - should remain same', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsed();
			await sleep(100);
			expect(t.elapsed()).toBe(a)
		})

		it('Check elapsedSinceStart() after stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsedSinceStart();
			await sleep(100);
			expect(t.elapsedSinceStart()).toBeGreaterThan(a);
		})

		it('Check elapsedSinceStop() after stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsedSinceStop();
			await sleep(100);
			expect(t.elapsedSinceStop()).toBeGreaterThan(a);
		})


	})
});
