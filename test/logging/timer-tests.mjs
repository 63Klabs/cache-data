import { expect } from 'chai';
import { Timer } from '../../src/lib/tools/index.js'
import { DebugAndLog } from '../../src/lib/tools/index.js'

import { sleep } from '../helpers/utils.mjs';

import sinon from 'sinon';

let originalEnv = { ...process.env };
let logStub, warnStub, errorStub, msgStub, debugStub;

const beforeEachEnvVars = function() {
	// clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	logStub = sinon.stub(console, 'log');
	warnStub = sinon.stub(console, 'warn');
	errorStub = sinon.stub(console, 'error');
	msgStub = sinon.stub(console, 'info');
	debugStub = sinon.stub(console, 'debug');
}

const afterEachEnvVars = function() {
	// clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	// Restore the original environment variables
	process.env = originalEnv;

	logStub.restore();
	warnStub.restore();
	errorStub.restore();
	msgStub.restore();
	debugStub.restore();
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
			expect(t1.isRunning()).to.equal(true);
			expect(t1.wasStarted()).to.equal(true);
			expect(t1.notStarted()).to.equal(false);
			expect(t1.wasStopped()).to.equal(false);
			expect(t1.status()).to.equal("IS_RUNNING")
		})

		it('Check if timer 2 not started', async () => {
			expect(t2.isRunning()).to.equal(false);
			expect(t2.wasStarted()).to.equal(false);
			expect(t2.notStarted()).to.equal(true);
			expect(t2.wasStopped()).to.equal(false);
			expect(t2.status()).to.equal("NOT_STARTED")
		})

		it('Check if timer 3 not started', async () => {
			expect(t3.isRunning()).to.equal(false);
			expect(t3.wasStarted()).to.equal(false);
			expect(t3.notStarted()).to.equal(true);
			expect(t3.wasStopped()).to.equal(false);
			expect(t3.status()).to.equal("NOT_STARTED")
		})

		const t4 = new Timer("Timer 1 start", true);
		const t5 = new Timer("Timer 2 no start", false);
		const t6 = new Timer("Timer 3 default start");
		t4.start();
		t4.stop();
		t5.start();
		t6.start();

		it('Check if timer 4 stopped', async () => {
			expect(t4.isRunning()).to.equal(false);
			expect(t4.wasStarted()).to.equal(true);
			expect(t4.notStarted()).to.equal(false);
			expect(t4.wasStopped()).to.equal(true);
			expect(t4.status()).to.equal("IS_STOPPED")
		})

		it('Check if timer 5 started', async () => {
			expect(t5.isRunning()).to.equal(true);
			expect(t5.wasStarted()).to.equal(true);
			expect(t5.notStarted()).to.equal(false);
			expect(t5.wasStopped()).to.equal(false);
			expect(t5.status()).to.equal("IS_RUNNING")
		})

		it('Check if timer 6 started', async () => {
			expect(t6.isRunning()).to.equal(true);
			expect(t6.wasStarted()).to.equal(true);
			expect(t6.notStarted()).to.equal(false);
			expect(t6.wasStopped()).to.equal(false);
			expect(t6.status()).to.equal("IS_RUNNING")
		})

	})

	describe('Check Timer calc functions', () => {

		it('Check elapsed() no stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			let a = t.elapsed();
			await sleep(100);
			expect(t.elapsed()).to.greaterThan(a)
		})

		it('Check elapsedSinceStart() no stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			let a = t.elapsedSinceStart();
			await sleep(100);
			expect(t.elapsedSinceStart()).to.greaterThan(a);
		})

		it('Check elapsedSinceStop() no stop - should be -1', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			expect(t.elapsedSinceStop()).to.equal(-1);
		})

		it('Check elapsed() after stop - should remain same', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsed();
			await sleep(100);
			expect(t.elapsed()).to.equal(a)
		})

		it('Check elapsedSinceStart() after stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsedSinceStart();
			await sleep(100);
			expect(t.elapsedSinceStart()).to.greaterThan(a);
		})

		it('Check elapsedSinceStop() after stop - should continue to increase', async () => {
			const t = new Timer("Timer", true);
			await sleep(340);
			t.stop();
			let a = t.elapsedSinceStop();
			await sleep(100);
			expect(t.elapsedSinceStop()).to.greaterThan(a);
		})


	})
});

