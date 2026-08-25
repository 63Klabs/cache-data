/**
 * Unit tests for ExtensionAvailability
 * Req 9.1-9.10; design.md Properties 16, 17
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const ExtensionAvailability = (await import('../../src/lib/utils/ExtensionAvailability.class.js')).default;

// Save and restore the env variable across tests
const ORIGINAL_TOKEN   = process.env.AWS_SESSION_TOKEN;
const ORIGINAL_PORT    = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;

beforeEach(() => {
	ExtensionAvailability.reset();
	// Reset env to a clean state (token present by default)
	process.env.AWS_SESSION_TOKEN = 'test-token';
	delete process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
});

afterEach(() => {
	jest.restoreAllMocks();
	// Restore original env
	if (ORIGINAL_TOKEN === undefined) delete process.env.AWS_SESSION_TOKEN;
	else process.env.AWS_SESSION_TOKEN = ORIGINAL_TOKEN;
	if (ORIGINAL_PORT === undefined) delete process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
	else process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = ORIGINAL_PORT;
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: initial state', () => {

	it('starts UNKNOWN after reset()', () => {
		expect(ExtensionAvailability.toObject().state).toBe('unknown');
	});

	it('STATE constants are correct', () => {
		expect(ExtensionAvailability.STATE.UNKNOWN).toBe('unknown');
		expect(ExtensionAvailability.STATE.AVAILABLE).toBe('available');
		expect(ExtensionAvailability.STATE.UNAVAILABLE).toBe('unavailable');
	});

});

// ---------------------------------------------------------------------------
// evaluate() — heuristic
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: evaluate() (Req 9.3-9.5)', () => {

	it('returns UNKNOWN when token present and no override (Req 9.7)', () => {
		const state = ExtensionAvailability.evaluate();
		expect(state).toBe('unknown');
	});

	it('returns UNAVAILABLE when AWS_SESSION_TOKEN is absent (Req 9.4)', () => {
		delete process.env.AWS_SESSION_TOKEN;
		const state = ExtensionAvailability.evaluate();
		expect(state).toBe('unavailable');
		expect(ExtensionAvailability.toObject().reason).toBe('no-session-token');
	});

	it('returns UNAVAILABLE when AWS_SESSION_TOKEN is empty string (Req 9.4)', () => {
		process.env.AWS_SESSION_TOKEN = '';
		expect(ExtensionAvailability.evaluate()).toBe('unavailable');
	});

	it('setOverride(true) forces AVAILABLE before any heuristic (Req 9.2)', () => {
		delete process.env.AWS_SESSION_TOKEN;   // heuristic would say unavailable
		ExtensionAvailability.setOverride(true);
		expect(ExtensionAvailability.toObject().state).toBe('available');
		expect(ExtensionAvailability.toObject().reason).toBe('override');
	});

	it('setOverride(false) forces UNAVAILABLE regardless of token (Req 9.2)', () => {
		process.env.AWS_SESSION_TOKEN = 'token';
		ExtensionAvailability.setOverride(false);
		expect(ExtensionAvailability.toObject().state).toBe('unavailable');
		expect(ExtensionAvailability.toObject().reason).toBe('override');
	});

	it('setOverride(null) clears the override and re-evaluates', () => {
		ExtensionAvailability.setOverride(false);
		expect(ExtensionAvailability.toObject().state).toBe('unavailable');
		ExtensionAvailability.setOverride(null);
		// With token present, now UNKNOWN again
		expect(ExtensionAvailability.toObject().state).toBe('unknown');
	});

});

// ---------------------------------------------------------------------------
// markAvailable / markUnavailable transitions
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: state transitions (Req 9.8, 9.9)', () => {

	it('markAvailable transitions UNKNOWN → AVAILABLE', () => {
		ExtensionAvailability.evaluate();
		ExtensionAvailability.markAvailable('probed-ok');
		expect(ExtensionAvailability.toObject().state).toBe('available');
	});

	it('markUnavailable transitions UNKNOWN → UNAVAILABLE (Req 9.8)', () => {
		ExtensionAvailability.evaluate();
		ExtensionAvailability.markUnavailable('connection-refused');
		expect(ExtensionAvailability.toObject().state).toBe('unavailable');
		expect(ExtensionAvailability.toObject().reason).toBe('connection-refused');
	});

	it('markUnavailable does NOT override AVAILABLE (Req 9.9)', () => {
		ExtensionAvailability.markAvailable('probed-ok');
		ExtensionAvailability.markUnavailable('connection-refused');
		expect(ExtensionAvailability.toObject().state).toBe('available');
	});

	it('markAvailable does NOT override UNAVAILABLE (Req 9.9)', () => {
		ExtensionAvailability.markUnavailable('connection-refused');
		ExtensionAvailability.markAvailable('probed-ok');
		expect(ExtensionAvailability.toObject().state).toBe('unavailable');
	});

});

// ---------------------------------------------------------------------------
// transportForRetrieval
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: transportForRetrieval (Req 9.10)', () => {

	it('returns "layer" when UNKNOWN (optimistic)', () => {
		ExtensionAvailability.evaluate();
		expect(ExtensionAvailability.transportForRetrieval()).toBe('layer');
	});

	it('returns "layer" when AVAILABLE', () => {
		ExtensionAvailability.markAvailable();
		expect(ExtensionAvailability.transportForRetrieval()).toBe('layer');
	});

	it('returns "sdk" when UNAVAILABLE', () => {
		ExtensionAvailability.markUnavailable('connection-refused');
		expect(ExtensionAvailability.transportForRetrieval()).toBe('sdk');
	});

	it('returns "sdk" when no-session-token heuristic fires', () => {
		delete process.env.AWS_SESSION_TOKEN;
		ExtensionAvailability.evaluate();
		expect(ExtensionAvailability.transportForRetrieval()).toBe('sdk');
	});

	it('Property 16: transport never changes after state is resolved', () => {
		ExtensionAvailability.evaluate();
		ExtensionAvailability.markAvailable();
		const t1 = ExtensionAvailability.transportForRetrieval();
		// Call many more times
		for (let i = 0; i < 100; i++) {
			expect(ExtensionAvailability.transportForRetrieval()).toBe(t1);
		}
	});

});

// ---------------------------------------------------------------------------
// Port resolution (Req 9.5, 9.6)
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: port() (Req 9.5, 9.6)', () => {

	it('uses PARAMETERS_SECRETS_EXTENSION_HTTP_PORT env var when set (Req 9.5)', () => {
		process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = '9999';
		expect(ExtensionAvailability.port()).toBe('9999');
	});

	it('falls back to CachedParameterSecret.port when env var absent (Req 9.6)', () => {
		const port = ExtensionAvailability.port();
		expect(typeof port).toBe('string');
		expect(port.length).toBeGreaterThan(0);
		// Default is "2773"
		expect(port).toBe('2773');
	});

});

// ---------------------------------------------------------------------------
// toObject inspection
// ---------------------------------------------------------------------------

describe('ExtensionAvailability: toObject() (Req 13.2-13.4)', () => {

	it('returns all required fields', () => {
		const info = ExtensionAvailability.toObject();
		expect(info).toHaveProperty('state');
		expect(info).toHaveProperty('reason');
		expect(info).toHaveProperty('hostname');
		expect(info).toHaveProperty('port');
		expect(info).toHaveProperty('transport');
	});

	it('does not include any secret or parameter values', () => {
		ExtensionAvailability.markAvailable();
		const info = ExtensionAvailability.toObject();
		const keys = Object.keys(info);
		expect(keys).not.toContain('value');
		expect(keys).not.toContain('secret');
		expect(keys).not.toContain('parameter');
	});

});
