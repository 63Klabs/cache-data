/**
 * Bug Condition Tests: Prototype-Reachable Key Defects
 * 
 * Task 2 — written BEFORE the fix is implemented.
 * 
 * IMPORTANT: These tests MUST FAIL on unfixed code. Failure confirms the defects exist.
 * DO NOT attempt to fix the test or the code when it fails.
 * These tests encode expected behavior and will validate the fix when they pass later.
 * 
 * Bug condition: the `in` operator walks the prototype chain, so a group name that
 * matches an Object.prototype member (toString, valueOf, hasOwnProperty, etc.) causes
 * paramstore[group] to resolve to the inherited native function. The parameter value
 * is then written as a property on that process-wide shared function object, which:
 *   (a) leaks credentials to any object in the container via ({}).toString.secretValue
 *   (b) returns an empty Object.keys(paramstore) even though data was "stored"
 * 
 * Related: requirements.md Req 1.2, 1.3, 1.4; design.md Property 4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog } = tools.default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let originalInitParameters;
let originalWarn;

beforeEach(() => {
	AppConfig._promises = [];
	AppConfig._promise = null;
	AppConfig._settings = null;
	AppConfig._connections = null;
	AppConfig._ssmParameters = null;

	originalInitParameters = AppConfig._initParameters;
	originalWarn = DebugAndLog.warn;
});

afterEach(() => {
	jest.restoreAllMocks();
	AppConfig._initParameters = originalInitParameters;
	DebugAndLog.warn = originalWarn;
});

/**
 * Build a spy that simulates AWS.ssm.getByName returning one parameter
 * whose Name path places it in the given group.
 */
function mockSsmGetByName(group, paramName, value = 'secret-value') {
	const path = `/${group}/${paramName}`;
	jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
		client: {},
		getByName: jest.fn().mockResolvedValue({
			Parameters: [{ Name: path, Value: value }]
		}),
		getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
		sdk: {}
	});
	return { path, value };
}

/**
 * Record all own-property names added to Object.prototype during cb().
 */
async function detectPrototypeLeakage(cb) {
	const before = new Set(Object.getOwnPropertyNames(Object.prototype));
	await cb();
	const after = new Set(Object.getOwnPropertyNames(Object.prototype));
	const added = [];
	for (const k of after) {
		if (!before.has(k)) {
			added.push(k);
			// Clean up immediately so later tests are not poisoned
			delete Object.prototype[k];
		}
	}
	return added;
}

// ---------------------------------------------------------------------------
// Defect 1 — Prototype-reachable group key: value is written onto shared function
// ---------------------------------------------------------------------------

describe('Bug condition: prototype-reachable group keys (Property 4)', () => {

	/**
	 * After the fix: "toString" is in PROTOTYPE_KEYS so it is rejected.
	 * The parameter is warned-and-skipped. Object.prototype is unmodified.
	 * Object.keys(store) does NOT contain "toString" (it was never added).
	 */
	it('[Bug fixed] group="toString": parameter is rejected — Object.prototype is unmodified', async () => {
		const { path } = mockSsmGetByName('toString', 'authPassword');

		// Use path-discovery (no names array) → warn-and-skip rather than throw
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/toString/authPassword', Value: 'secret-value' }]
			}),
			sdk: {}
		});

		const nativeToString = Object.prototype.toString;
		const store = await AppConfig._getParametersFromStore([
			{ group: 'toString', path: '/toString/' }  // path-discovery, no names
		]);

		// Fixed: Object.prototype.toString is unmodified
		expect(Object.prototype.toString).toBe(nativeToString);
		// Fixed: the value was not stored (the group key is unsafe)
		expect(Object.keys(store)).not.toContain('toString');
	});

	it('[Bug fixed] group="valueOf": Object.prototype.valueOf is NOT mutated', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/valueOf/secretKey', Value: 'secret' }]
			}),
			sdk: {}
		});

		const leaks = await detectPrototypeLeakage(async () => {
			await AppConfig._getParametersFromStore([
				{ group: 'valueOf', path: '/valueOf/' }
			]);
		});

		expect(leaks).toHaveLength(0);
	});

	it('[Bug fixed] group="hasOwnProperty": Object.prototype is NOT mutated', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/hasOwnProperty/key', Value: 'v' }]
			}),
			sdk: {}
		});

		const nativeHOP = Object.prototype.hasOwnProperty;

		await AppConfig._getParametersFromStore([
			{ group: 'hasOwnProperty', path: '/hasOwnProperty/' }
		]);

		// Fixed: the native hasOwnProperty function is unchanged
		expect(Object.prototype.hasOwnProperty).toBe(nativeHOP);
		// Fixed: no parameter values were written onto the function as own properties
		// (functions always have 'length' and 'name' as own props — those are expected)
		const addedToFunc = Object.getOwnPropertyNames(Object.prototype.hasOwnProperty)
			.filter(k => k !== 'length' && k !== 'name');
		expect(addedToFunc).toHaveLength(0);
	});

	it('[Bug fixed] group="isPrototypeOf": value does NOT leak via ({}).isPrototypeOf', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/isPrototypeOf/apiKey', Value: 'SHOULD-NOT-APPEAR' }]
			}),
			sdk: {}
		});

		await AppConfig._getParametersFromStore([
			{ group: 'isPrototypeOf', path: '/isPrototypeOf/' }
		]);

		expect(({}).isPrototypeOf.apiKey).toBeUndefined();
	});

	/**
	 * Property-based: for ALL Object.prototype own-property names that aren't
	 * already in DANGEROUS_KEYS, loading completes without prototype mutation.
	 */
	it('Property [Bug fixed]: all prototype-reachable groups are rejected safely (Property 4)', async () => {
		const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
		const protoKeys = Object.getOwnPropertyNames(Object.prototype).filter(
			k => !DANGEROUS_KEYS.has(k) && /^[a-zA-Z][a-zA-Z0-9]*$/.test(k)
		);

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...protoKeys),
				async (group) => {
					jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
						client: {},
						getByName: jest.fn(),
						getByPath: jest.fn().mockResolvedValue({
							Parameters: [{ Name: `/${group}/testParam`, Value: 'value' }]
						}),
						sdk: {}
					});

					const before = Object.getOwnPropertyNames(Object.prototype);

					// Use path-discovery (no names) to get warn-and-skip not throw
					const store = await AppConfig._getParametersFromStore([
						{ group, path: `/${group}/` }
					]);

					const after = Object.getOwnPropertyNames(Object.prototype);

					const added = after.filter(k => !before.includes(k));
					added.forEach(k => delete Object.prototype[k]);
					expect(added).toHaveLength(0);

					// The unsafe group should NOT appear in the returned store
					expect(Object.keys(store)).not.toContain(group);

					return true;
				}
			),
			{ numRuns: protoKeys.length }
		);
	});

	/**
	 * The native toString must be unchanged after any retrieval attempt.
	 */
	it('[Bug fixed] group="toString": ({}).toString is still the native function', async () => {
		const nativeToString = Object.prototype.toString;

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/toString/credential', Value: 'anything' }]
			}),
			sdk: {}
		});

		await AppConfig._getParametersFromStore([
			{ group: 'toString', path: '/toString/' }
		]);

		expect(({}).toString).toBe(nativeToString);
	});

});

// ---------------------------------------------------------------------------
// Dangerous keys (already handled in v1.3.10 — regression check)
// ---------------------------------------------------------------------------

describe('Dangerous keys regression (Property 2): __proto__, constructor, prototype skipped', () => {

	it('group="__proto__": Object.prototype is NOT modified', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/__proto__/toString', Value: 'polluted' }]
			}),
			sdk: {}
		});

		const nativeToString = Object.prototype.toString;

		await AppConfig._getParametersFromStore([
			{ group: '__proto__', path: '/__proto__/' }
		]);

		expect(({}).toString).toBe(nativeToString);
	});

	it('group="constructor": constructor param is skipped', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn(),
			getByPath: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/constructor/key', Value: 'v' }]
			}),
			sdk: {}
		});

		const store = await AppConfig._getParametersFromStore([
			{ group: 'constructor', path: '/constructor/' }
		]);

		// The dangerous key guard skips it; the store should be empty
		expect(Object.keys(store)).toHaveLength(0);
	});

	it('Property: all dangerous keys produce an empty store', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom('__proto__', 'constructor', 'prototype'),
				async (dangerousKey) => {
					jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
						client: {},
						getByName: jest.fn(),
						getByPath: jest.fn().mockResolvedValue({
							Parameters: [{ Name: `/${dangerousKey}/param`, Value: 'v' }]
						}),
						sdk: {}
					});

					const before = Object.getOwnPropertyNames(Object.prototype);
					const store = await AppConfig._getParametersFromStore([
						{ group: dangerousKey, path: `/${dangerousKey}/` }
					]);
					const after = Object.getOwnPropertyNames(Object.prototype);
					const added = after.filter(k => !before.includes(k));
					added.forEach(k => delete Object.prototype[k]);

					expect(added).toHaveLength(0);
					expect(Object.keys(store)).not.toContain(dangerousKey);
					return true;
				}
			),
			{ numRuns: 3 }
		);
	});

});
