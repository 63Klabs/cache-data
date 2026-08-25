/**
 * Preservation Baseline Tests for the Legacy SSM Seam
 * 
 * Task 1 (observation-first, written BEFORE any source changes).
 * 
 * These tests lock the observable contracts of _initParameters(), _getParameters(),
 * and _getParametersFromStore() so that any violation introduced by the refactor
 * fails loudly. They must pass on the CURRENT unmodified code.
 * 
 * When the implementation is later delegated to ParameterStoreLoader:
 *   - The same contracts still apply (Req 18.1-18.8, 18.11)
 *   - These tests must pass WITHOUT any modification to this file
 *   - If editing this file is required, the seam design has been violated
 * 
 * Related: requirements.md Req 17, 18; design.md Property 18
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog } = tools.default;

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

/** Baseline mock paramstore that tests encode as the expected shape. */
const MOCK_PARAMSTORE = Object.freeze({ app: { param1: 'value1', param2: 'value2' } });

/** Entry array for "by name" style (has names array). */
const BY_NAME_ENTRIES = Object.freeze([
	{ group: 'app', path: '/test/params/', names: ['param1', 'param2'] }
]);

/** Entry array for "by path" style (no names array). */
const BY_PATH_ENTRIES = Object.freeze([
	{ group: 'app', path: '/test/params/' }
]);

/** Multi-group entries. */
const MULTI_GROUP_ENTRIES = Object.freeze([
	{ group: 'app', path: '/test/app/', names: ['host', 'port'] },
	{ group: 'db', path: '/test/db/', names: ['password'] }
]);

let originalInitParameters;
let originalDebugError;

beforeEach(() => {
	// Reset AppConfig state before each test
	AppConfig._promises = [];
	AppConfig._promise = null;
	AppConfig._settings = null;
	AppConfig._connections = null;
	AppConfig._ssmParameters = null;
	AppConfig._parametersResolved = null;
	AppConfig._secretsResolved = null;

	// Save originals so they can be restored
	originalInitParameters = AppConfig._initParameters;
	originalDebugError = DebugAndLog.error;
});

afterEach(() => {
	jest.restoreAllMocks();
	// Restore _initParameters in case a test replaced it
	AppConfig._initParameters = originalInitParameters;
	DebugAndLog.error = originalDebugError;
});

// ---------------------------------------------------------------------------
// 1. Return-shape contract
// ---------------------------------------------------------------------------

describe('Legacy seam: return shape (Property 18)', () => {

	it('_initParameters resolves to the paramstore object, NOT a boolean', async () => {
		// Observation: calling the real method chain with mocked AWS returns the store
		const mockStore = { app: { key: 'val' } };
		AppConfig._initParameters = jest.fn().mockResolvedValue(mockStore);

		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		const resolved = await AppConfig._ssmParameters;
		expect(typeof resolved).toBe('object');
		expect(resolved).toEqual(mockStore);
		// NOT a boolean — this is the contract that differs from the other init options
		expect(typeof resolved).not.toBe('boolean');
	});

	it('_ssmParameters holds the Promise immediately after init() returns', () => {
		AppConfig._initParameters = jest.fn().mockResolvedValue(MOCK_PARAMSTORE);
		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });

		// Immediately — before any await — it must be a thenable (Promise)
		expect(AppConfig._ssmParameters).not.toBeNull();
		expect(typeof AppConfig._ssmParameters.then).toBe('function');
	});

	it('await _ssmParameters equals the paramstore after promise() resolves', async () => {
		AppConfig._initParameters = jest.fn().mockResolvedValue(MOCK_PARAMSTORE);
		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		const resolved = await AppConfig._ssmParameters;
		expect(resolved).toEqual(MOCK_PARAMSTORE);
	});

	it('_initParameters returns a Promise (async function)', async () => {
		// Called directly without going through init()
		AppConfig._initParameters = originalInitParameters;

		// Mock AWS call so we don't need live credentials
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/params/param1', Value: 'v1' }]
			}),
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		const result = AppConfig._initParameters(BY_NAME_ENTRIES);
		expect(typeof result.then).toBe('function');
		const store = await result;
		expect(typeof store).toBe('object');
		expect(store.app.param1).toBe('v1');
	});

	it('empty entries array resolves to empty object {}', async () => {
		AppConfig._initParameters = originalInitParameters;
		const result = await AppConfig._initParameters([]);
		expect(result).toEqual({});
	});

	it('_getParameters and _initParameters resolve to the same shape', async () => {
		AppConfig._initParameters = originalInitParameters;

		const mockGetByName = jest.fn().mockResolvedValue({
			Parameters: [
				{ Name: '/test/app/host', Value: 'db.example.com' },
				{ Name: '/test/app/port', Value: '5432' }
			]
		});
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {}, getByName: mockGetByName,
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }), sdk: {}
		});

		const fromInit = await AppConfig._initParameters(MULTI_GROUP_ENTRIES.slice(0, 1));
		const fromGet = await AppConfig._getParameters(MULTI_GROUP_ENTRIES.slice(0, 1));
		expect(fromInit).toEqual(fromGet);
	});

	it('_getParametersFromStore returns the paramstore object directly', async () => {
		AppConfig._initParameters = originalInitParameters;

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/params/param1', Value: 'hello' }]
			}),
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		const result = await AppConfig._getParametersFromStore(BY_NAME_ENTRIES);
		expect(result).toMatchObject({ app: { param1: 'hello' } });
		// It is a plain object, not a boolean, array, or other type
		expect(typeof result).toBe('object');
		expect(!Array.isArray(result)).toBe(true);
	});

});

// ---------------------------------------------------------------------------
// 2. Mocking via direct assignment to _initParameters still works
// ---------------------------------------------------------------------------

describe('Legacy seam: _initParameters direct-assignment mock (Property 18, Req 18.11)', () => {

	it('direct assignment intercepts the init() path correctly', async () => {
		const mockStore = { cache: { ttl: '300' } };
		const mockFn = jest.fn().mockResolvedValue(mockStore);
		AppConfig._initParameters = mockFn;

		AppConfig.init({ ssmParameters: BY_PATH_ENTRIES });
		await AppConfig.promise();

		expect(mockFn).toHaveBeenCalledTimes(1);
		expect(mockFn).toHaveBeenCalledWith(BY_PATH_ENTRIES);
		expect(await AppConfig._ssmParameters).toEqual(mockStore);
	});

	it('_ssmParameters is defined after init when ssmParameters option provided', async () => {
		AppConfig._initParameters = jest.fn().mockResolvedValue(MOCK_PARAMSTORE);
		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });

		expect(AppConfig._ssmParameters).toBeDefined();
		expect(AppConfig._ssmParameters).not.toBeNull();
	});

	it('_ssmParameters remains null when ssmParameters option is not provided', async () => {
		AppConfig.init({ settings: { x: 1 } });
		await AppConfig.promise();

		expect(AppConfig._ssmParameters).toBeNull();
	});

});

// ---------------------------------------------------------------------------
// 3. Property-based: shape is preserved for any valid paramstore
// ---------------------------------------------------------------------------

describe('Legacy seam: property-based shape invariant (Property 18)', () => {

	/**
	 * For any mock paramstore object returned by _initParameters,
	 * await AppConfig._ssmParameters equals that object.
	 * The shape must survive the init() wrapper unchanged.
	 */
	it('Property: _ssmParameters resolves to whatever _initParameters resolves to', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.dictionary(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_.-]+$/.test(s)),
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_.-]+$/.test(s)),
						fc.string({ minLength: 0, maxLength: 100 })
					)
				),
				async (mockStore) => {
					// Reset state
					AppConfig._promises = [];
					AppConfig._ssmParameters = null;

					AppConfig._initParameters = jest.fn().mockResolvedValue(mockStore);
					AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
					await AppConfig.promise();

					const resolved = await AppConfig._ssmParameters;
					expect(resolved).toEqual(mockStore);
					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	/**
	 * For any valid entry array, _initParameters() resolves to an object
	 * (never a boolean, string, or other primitive). The group is always
	 * accessible via Object.keys().
	 */
	it('Property: _initParameters always resolves to a plain object', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						group: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
						path: fc.constant('/test/path/'),
						names: fc.array(
							fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
							{ minLength: 1, maxLength: 5 }
						)
					}),
					{ minLength: 1, maxLength: 3 }
				),
				async (entries) => {
					// Mock _initParameters so we don't make real AWS calls;
					// we're testing the wrapper contract, not the AWS call
					const storeFromEntries = {};
					entries.forEach(e => {
						storeFromEntries[e.group] = {};
						e.names.forEach(n => { storeFromEntries[e.group][n] = 'mocked'; });
					});

					AppConfig._initParameters = jest.fn().mockResolvedValue(storeFromEntries);
					AppConfig._promises = [];
					AppConfig._ssmParameters = null;

					AppConfig.init({ ssmParameters: entries });
					await AppConfig.promise();

					const resolved = await AppConfig._ssmParameters;

					// Contract: must be a plain object
					expect(typeof resolved).toBe('object');
					expect(resolved).not.toBeNull();
					expect(Array.isArray(resolved)).toBe(false);

					// Contract: keys appear in Object.keys
					Object.keys(storeFromEntries).forEach(group => {
						expect(Object.keys(resolved)).toContain(group);
					});

					return true;
				}
			),
			{ numRuns: 30 }
		);
	});

});

// ---------------------------------------------------------------------------
// 4. Seam method signatures are stable
// ---------------------------------------------------------------------------

describe('Legacy seam: method signature stability (Req 18.1, 18.3, 18.4)', () => {

	it('_initParameters exists as a function on AppConfig', () => {
		expect(typeof AppConfig._initParameters).toBe('function');
	});

	it('_getParameters exists as a function on AppConfig', () => {
		expect(typeof AppConfig._getParameters).toBe('function');
	});

	it('_getParametersFromStore exists as a function on AppConfig', () => {
		expect(typeof AppConfig._getParametersFromStore).toBe('function');
	});

	it('_initParameters accepts an array argument', async () => {
		AppConfig._initParameters = originalInitParameters;
		// Empty array → empty object, no throw
		const result = await AppConfig._initParameters([]);
		expect(result).toEqual({});
	});

	it('_getParameters accepts an array argument', async () => {
		AppConfig._initParameters = originalInitParameters;
		const result = await AppConfig._getParameters([]);
		expect(result).toEqual({});
	});

	it('_getParametersFromStore accepts an array argument', async () => {
		AppConfig._initParameters = originalInitParameters;
		const result = await AppConfig._getParametersFromStore([]);
		expect(result).toEqual({});
	});

});

// ---------------------------------------------------------------------------
// 5. Error containment and resolved-value accessors (Task 12, Req 15, 16, 18.10)
// ---------------------------------------------------------------------------

describe('Resolved-value accessors (Req 15)', () => {

	it('parameters() returns null before init', () => {
		expect(AppConfig.parameters()).toBeNull();
	});

	it('secrets() returns null before init', () => {
		expect(AppConfig.secrets()).toBeNull();
	});

	it('parameters() returns the paramstore after promise() settles', async () => {
		const mockStore = { db: { host: 'db.example.com' } };
		AppConfig._initParameters = jest.fn().mockResolvedValue(mockStore);

		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		expect(AppConfig.parameters()).toEqual(mockStore);
	});

	it('_ssmParameters still resolves to paramstore (Req 18.8)', async () => {
		const mockStore = { app: { key: 'value' } };
		AppConfig._initParameters = jest.fn().mockResolvedValue(mockStore);

		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		// _ssmParameters must resolve to the paramstore, NOT a boolean (Req 18.2)
		const resolved = await AppConfig._ssmParameters;
		expect(resolved).toEqual(mockStore);
		expect(typeof resolved).not.toBe('boolean');
	});

});

describe('Error containment (Req 16, 18.10)', () => {

	it('promise() resolves even when _initParameters rejects (Req 16.1-16.5)', async () => {
		AppConfig._initParameters = jest.fn().mockRejectedValue(new Error('SSM failure'));

		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });

		// Must not reject — Req 16.5
		await expect(AppConfig.promise()).resolves.toBeDefined();
	});

	it('parameters() returns null when init fails (Req 16.1)', async () => {
		AppConfig._initParameters = jest.fn().mockRejectedValue(new Error('SSM failure'));

		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		// Accessor returns null — data was not resolved
		expect(AppConfig.parameters()).toBeNull();
	});

	it('no unhandled rejection emitted when init fails (Req 18.10)', async () => {
		const unhandled = [];
		const listener = (reason) => unhandled.push(reason);
		process.on('unhandledRejection', listener);

		AppConfig._initParameters = jest.fn().mockRejectedValue(new Error('SSM failure'));
		AppConfig.init({ ssmParameters: BY_NAME_ENTRIES });
		await AppConfig.promise();

		// Give the event loop a tick to surface any unhandled rejections
		await new Promise(resolve => setTimeout(resolve, 10));

		process.off('unhandledRejection', listener);
		expect(unhandled).toHaveLength(0);
	});

	it('settings init still succeeds when ssmParameters fails (Req 16.5)', async () => {
		AppConfig._initParameters = jest.fn().mockRejectedValue(new Error('SSM failure'));

		AppConfig.init({
			settings: { limit: 100 },
			ssmParameters: BY_NAME_ENTRIES
		});
		await AppConfig.promise();

		expect(AppConfig._settings).toEqual({ limit: 100 });
	});

});
