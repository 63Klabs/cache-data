/**
 * Bug Condition Tests: Batching and Pagination Defects
 * 
 * Task 2 — written BEFORE the fix is implemented.
 * 
 * IMPORTANT: These tests MUST FAIL on unfixed code. Failure confirms the defects exist.
 * DO NOT attempt to fix the test or the code when it fails.
 * These tests encode expected behavior and will validate the fix when they pass later.
 * 
 * Defect 2 — Path pagination: GetParametersByPath has a hard MaxResults ceiling of 10.
 * The current code ignores NextToken, so more than 10 parameters under a path are
 * silently truncated to the first 10. No error, no warning — just missing data.
 * 
 * Defect 3 — Name batching: GetParameters rejects when Names.length > 10 with a
 * ValidationException. The current code pushes all names into a single query, so
 * calling _getParametersFromStore with > 10 enumerated names throws.
 * 
 * Defect 4 — Path mismatch TypeError: the groupPath derivation strips the last segment
 * and appends "/", so a caller who supplies a path without a trailing slash causes the
 * find() to return undefined and obj.group to throw TypeError.
 * 
 * Related: requirements.md Req 4.1, 4.2, 5.2, 5.3, 3.1, 3.2; design.md Properties 6, 7, 10
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog } = tools.default;

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

// ---------------------------------------------------------------------------
// Defect 2 — Path pagination
// ---------------------------------------------------------------------------

describe('Bug condition: path pagination truncation (Property 7, Req 5.2-5.5)', () => {

	/**
	 * EXPECTED TO FAIL on unfixed code:
	 * Mock getByPath to return 10 items + NextToken, then 5 more.
	 * Without NextToken following, only the first 10 are stored.
	 */
	it('[Bug] >10 parameters under a path: all must be returned', async () => {
		const page1Params = Array.from({ length: 10 }, (_, i) => ({
			Name: `/test/params/param${i}`,
			Value: `value${i}`
		}));
		const page2Params = Array.from({ length: 5 }, (_, i) => ({
			Name: `/test/params/param${i + 10}`,
			Value: `value${i + 10}`
		}));

		const mockGetByPath = jest.fn()
			.mockResolvedValueOnce({ Parameters: page1Params, NextToken: 'page2token' })
			.mockResolvedValueOnce({ Parameters: page2Params });

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({ Parameters: [] }),
			getByPath: mockGetByPath,
			sdk: {}
		});

		const store = await AppConfig._getParametersFromStore([
			{ group: 'app', path: '/test/params/' }
		]);

		// All 15 parameters must be stored
		const stored = Object.keys(store.app || {});
		expect(stored.length).toBe(15);
		// Check the first page is there
		expect(store.app?.param0).toBe('value0');
		// Check page 2 is there — this is what the bug breaks
		expect(store.app?.param10).toBe('value10');
		expect(store.app?.param14).toBe('value14');
	});

	/**
	 * Property: for any N parameters (split across pages), all N must be stored.
	 */
	it('Property [Bug]: all paginated parameters are stored regardless of page count', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 11, max: 30 }), // force multi-page
				async (totalCount) => {
					const allParams = Array.from({ length: totalCount }, (_, i) => ({
						Name: `/test/paged/p${i}`,
						Value: `val${i}`
					}));

					// Split into pages of up to 10
					const pages = [];
					for (let i = 0; i < allParams.length; i += 10) {
						pages.push(allParams.slice(i, i + 10));
					}

					const mockGetByPath = jest.fn();
					pages.forEach((page, idx) => {
						const nextToken = idx < pages.length - 1 ? `token${idx}` : undefined;
						const response = { Parameters: page };
						if (nextToken) response.NextToken = nextToken;
						mockGetByPath.mockResolvedValueOnce(response);
					});

					jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
						client: {},
						getByName: jest.fn().mockResolvedValue({ Parameters: [] }),
						getByPath: mockGetByPath,
						sdk: {}
					});

					const store = await AppConfig._getParametersFromStore([
						{ group: 'app', path: '/test/paged/' }
					]);

					const stored = Object.keys(store.app || {});
					// Bug: without pagination, only 10 are stored
					expect(stored.length).toBe(totalCount);

					return true;
				}
			),
			{ numRuns: 10 }
		);
	});

});

// ---------------------------------------------------------------------------
// Defect 3 — Name batching
// ---------------------------------------------------------------------------

describe('Bug condition: name batching limit (Property 6, Req 4.1-4.3)', () => {

	/**
	 * EXPECTED TO FAIL on unfixed code:
	 * Providing >10 enumerated names in a single entry currently throws because
	 * the code puts all names into one GetParameters call which has a 10-item limit.
	 */
	it('[Bug] 15 enumerated names must succeed (no ValidationException)', async () => {
		const names = Array.from({ length: 15 }, (_, i) => `param${i}`);
		const mockGetByName = jest.fn().mockImplementation(({ Names }) => {
			// Simulate the real AWS ValidationException for > 10 names
			if (Names.length > 10) {
				return Promise.reject(new Error('ValidationException: Maximum number of 10 items'));
			}
			return Promise.resolve({
				Parameters: Names.map(n => ({ Name: n, Value: 'v' }))
			});
		});

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: mockGetByName,
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		// With the bug, this throws. With the fix, it succeeds.
		await expect(
			AppConfig._getParametersFromStore([
				{ group: 'app', path: '/test/params/', names }
			])
		).resolves.toBeDefined();
	});

	/**
	 * Property: for any N names, all N are returned and N chunks of ≤10 are used.
	 */
	it('Property [Bug]: >10 names are retrieved via multiple calls, not rejected', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 11, max: 50 }),
				async (nameCount) => {
					const names = Array.from({ length: nameCount }, (_, i) => `key${i}`);
					// Full SSM paths as the loader will construct them
					const fullPaths = names.map(n => `/test/params/${n}`);

					const mockGetByName = jest.fn().mockImplementation(({ Names }) => {
						if (Names.length > 10) {
							return Promise.reject(new Error('ValidationException: Maximum number of 10 items'));
						}
						// Return the exact Names passed in as parameters
						return Promise.resolve({
							Parameters: Names.map(n => ({ Name: n, Value: 'v' })),
							InvalidParameters: []
						});
					});

					jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
						client: {},
						getByName: mockGetByName,
						getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
						sdk: {}
					});

					// Should not reject
					const store = await AppConfig._getParametersFromStore([
						{ group: 'app', path: '/test/params/', names }
					]);

					// All names should be stored
					const storedCount = Object.keys(store.app || {}).length;
					expect(storedCount).toBe(nameCount);

					return true;
				}
			),
			{ numRuns: 5 }
		);
	});

});

// ---------------------------------------------------------------------------
// Defect 4 — Path mismatch TypeError
// ---------------------------------------------------------------------------

describe('Bug condition: path mismatch TypeError (Property 10, Req 3.1-3.2)', () => {

	/**
	 * EXPECTED TO FAIL on unfixed code:
	 * A path without a trailing slash causes the groupPath to not match any
	 * configured entry, so find() returns undefined and obj.group throws.
	 */
	it('[Bug] path without trailing slash: must not throw TypeError', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				// The path in the response will be /myapp/prod/authUsername
				// groupPath derived will be /myapp/prod/ — but config has /myapp/prod (no slash)
				Parameters: [{ Name: '/myapp/prod/authUsername', Value: 'user' }]
			}),
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		// Path without trailing slash — currently causes obj.group to throw
		await expect(
			AppConfig._getParametersFromStore([
				{ group: 'app', path: '/myapp/prod', names: ['authUsername'] }
			])
		).resolves.toBeDefined(); // Should not throw
	});

	it('[Bug] path without trailing slash: parameters are stored correctly', async () => {
		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/myapp/prod/authUsername', Value: 'myUser' }]
			}),
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		const store = await AppConfig._getParametersFromStore([
			{ group: 'app', path: '/myapp/prod', names: ['authUsername'] }
		]);

		// Even with the buggy path, the parameter should be stored
		expect(store?.app?.authUsername).toBe('myUser');
	});

	/**
	 * Unmatched path: when SSM returns a parameter name that derives to a
	 * groupPath not in the configured entries, it should warn-and-skip, not throw.
	 */
	it('[Bug] unmatched path in results: must warn and skip, not throw', async () => {
		const warns = [];
		DebugAndLog.warn = jest.fn((msg) => warns.push(msg));

		jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
			client: {},
			getByName: jest.fn().mockResolvedValue({
				Parameters: [
					// This path matches the configured entry
					{ Name: '/test/params/goodParam', Value: 'good' },
					// This path does NOT match — different path
					{ Name: '/other/path/badParam', Value: 'bad' }
				]
			}),
			getByPath: jest.fn().mockResolvedValue({ Parameters: [] }),
			sdk: {}
		});

		// Should not throw even with the unmatched parameter
		const store = await AppConfig._getParametersFromStore([
			{ group: 'app', path: '/test/params/', names: ['goodParam', 'otherParam'] }
		]);

		// The matched parameter should still be stored
		expect(store?.app?.goodParam).toBe('good');
		// The unmatched should not appear
		expect(store?.app?.badParam).toBeUndefined();
	});

});
