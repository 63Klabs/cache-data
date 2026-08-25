/**
 * Property-based tests for ExtensionAvailability (Properties 16, 17)
 * Req 9.9, 9.10, 10.2-10.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

const ExtensionAvailability = (await import('../../../src/lib/utils/ExtensionAvailability.class.js')).default;

const ORIGINAL_TOKEN = process.env.AWS_SESSION_TOKEN;

beforeEach(() => {
	ExtensionAvailability.reset();
	process.env.AWS_SESSION_TOKEN = 'test-token';
});

afterEach(() => {
	if (ORIGINAL_TOKEN === undefined) delete process.env.AWS_SESSION_TOKEN;
	else process.env.AWS_SESSION_TOKEN = ORIGINAL_TOKEN;
});

describe('Property 16: availability is deterministic after resolution', () => {

	it('transport is identical on all subsequent calls after AVAILABLE', () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 99 }),
				(callCount) => {
					ExtensionAvailability.reset();
					process.env.AWS_SESSION_TOKEN = 'test-token';
					ExtensionAvailability.markAvailable('probed-ok');
					const first = ExtensionAvailability.transportForRetrieval();
					for (let i = 0; i < callCount; i++) {
						expect(ExtensionAvailability.transportForRetrieval()).toBe(first);
					}
				}
			),
			{ numRuns: 50 }
		);
	});

	it('transport is identical on all subsequent calls after UNAVAILABLE', () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 99 }),
				fc.constantFrom('connection-refused', 'timeout', 'no-session-token'),
				(callCount, reason) => {
					ExtensionAvailability.reset();
					process.env.AWS_SESSION_TOKEN = 'test-token';
					ExtensionAvailability.markUnavailable(reason);
					const first = ExtensionAvailability.transportForRetrieval();
					for (let i = 0; i < callCount; i++) {
						expect(ExtensionAvailability.transportForRetrieval()).toBe(first);
					}
				}
			),
			{ numRuns: 50 }
		);
	});

});

describe('Property 17: failure classification', () => {

	it('connection errors yield unavailable and permit SDK fallback', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(
					ExtensionAvailability.REASON.CONNECTION_REFUSED,
					ExtensionAvailability.REASON.TIMEOUT
				),
				(reason) => {
					ExtensionAvailability.reset();
					process.env.AWS_SESSION_TOKEN = 'test-token';
					ExtensionAvailability.evaluate();
					ExtensionAvailability.markUnavailable(reason);
					expect(ExtensionAvailability.toObject().state).toBe('unavailable');
					expect(ExtensionAvailability.transportForRetrieval()).toBe('sdk');
				}
			),
			{ numRuns: 2 }
		);
	});

	it('override always overrides heuristic regardless of token presence', () => {
		fc.assert(
			fc.property(
				fc.boolean(),  // has token
				fc.boolean(),  // override value
				(hasToken, overrideValue) => {
					ExtensionAvailability.reset();
					if (hasToken) process.env.AWS_SESSION_TOKEN = 'token';
					else delete process.env.AWS_SESSION_TOKEN;

					ExtensionAvailability.setOverride(overrideValue);
					const state = ExtensionAvailability.toObject().state;
					const expected = overrideValue ? 'available' : 'unavailable';
					expect(state).toBe(expected);
				}
			),
			{ numRuns: 50 }
		);
	});

});
