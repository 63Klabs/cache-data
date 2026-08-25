/**
 * Unit tests for ParameterStoreLoader
 *
 * Covers requirements.md Req 4.1-4.5, 5.1-5.5, 6.1-6.6
 * and design.md Properties 4, 5, 6, 7, 10, 11
 *
 * The bug-condition property tests in test/utils/property/batching-pagination-property-tests.jest.mjs
 * also cover Properties 6 and 7 against _getParametersFromStore. These unit tests target the
 * loader directly and add InvalidParameters, collision, and path-mismatch coverage.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');
const ParameterStoreLoader = (await import('../../src/lib/utils/ParameterStoreLoader.class.js')).default;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeSsmSpy({ getByNameImpl, getByPathImpl } = {}) {
	const defaultGetByName = jest.fn().mockResolvedValue({ Parameters: [], InvalidParameters: [] });
	const defaultGetByPath = jest.fn().mockResolvedValue({ Parameters: [] });

	return jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
		client: {},
		getByName: getByNameImpl ?? defaultGetByName,
		getByPath: getByPathImpl ?? defaultGetByPath,
		sdk: {}
	});
}

function makeParams(path, names) {
	return names.map(n => ({ Name: path + n, Value: 'v_' + n }));
}

afterEach(() => {
	jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Empty and trivial inputs
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: empty inputs', () => {

	it('returns empty store for no entries', async () => {
		const result = await ParameterStoreLoader.load([]);
		expect(result.store).toEqual({});
		expect(result.skipped).toHaveLength(0);
	});

	it('returns empty store for null entries', async () => {
		const result = await ParameterStoreLoader.load(null);
		expect(result.store).toEqual({});
	});

	it('returns empty store when all entries have no names and no path data', async () => {
		makeSsmSpy({
			getByPathImpl: jest.fn().mockResolvedValue({ Parameters: [] })
		});
		const result = await ParameterStoreLoader.load([{ group: 'app', path: '/test/' }]);
		expect(result.store).toEqual({});
	});

});

// ---------------------------------------------------------------------------
// 2. Enumerated names — basic grouping
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: enumerated names (Req 4)', () => {

	it('stores parameters from a single entry', async () => {
		makeSsmSpy({
			getByNameImpl: jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/test/app/host', Value: 'db.example.com' },
					{ Name: '/test/app/port', Value: '5432' }
				],
				InvalidParameters: []
			})
		});

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/', names: ['host', 'port'] }
		]);

		expect(result.store.app.host).toBe('db.example.com');
		expect(result.store.app.port).toBe('5432');
	});

	it('stores parameters from multiple groups', async () => {
		makeSsmSpy({
			getByNameImpl: jest.fn().mockResolvedValue({
				Parameters: [
					{ Name: '/test/app/host', Value: 'app.example.com' },
					{ Name: '/test/db/pass', Value: 'secret' }
				],
				InvalidParameters: []
			})
		});

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/', names: ['host'] },
			{ group: 'db', path: '/test/db/', names: ['pass'] }
		]);

		expect(result.store.app.host).toBe('app.example.com');
		expect(result.store.db.pass).toBe('secret');
	});

	it('single call is issued when names <= 10 (Req 4.1)', async () => {
		const mockFn = jest.fn().mockResolvedValue({ Parameters: [], InvalidParameters: [] });
		makeSsmSpy({ getByNameImpl: mockFn });

		await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/', names: ['a', 'b', 'c'] }
		]);

		expect(mockFn).toHaveBeenCalledTimes(1);
	});

	it('multiple calls are issued when names > 10 (Req 4.1, 4.2)', async () => {
		const names = Array.from({ length: 15 }, (_, i) => `param${i}`);
		const params = names.map(n => ({ Name: '/test/' + n, Value: 'v' }));

		// Return up to 10 per call
		const mockFn = jest.fn()
			.mockResolvedValueOnce({ Parameters: params.slice(0, 10), InvalidParameters: [] })
			.mockResolvedValueOnce({ Parameters: params.slice(10), InvalidParameters: [] });

		makeSsmSpy({ getByNameImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/', names }
		]);

		// Two chunks of 10 and 5
		expect(mockFn).toHaveBeenCalledTimes(2);
		// All 15 stored
		expect(Object.keys(result.store.app)).toHaveLength(15);
	});

	it('stores all N names for N > 10 (Property 6)', async () => {
		const N = 25;
		const names = Array.from({ length: N }, (_, i) => `key${i}`);
		const params = names.map(n => ({ Name: '/test/' + n, Value: 'x' }));

		const mockFn = jest.fn().mockImplementation(({ Names }) =>
			Promise.resolve({ Parameters: Names.map(n => ({ Name: n, Value: 'x' })), InvalidParameters: [] })
		);
		makeSsmSpy({ getByNameImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/', names }
		]);

		expect(Object.keys(result.store.app)).toHaveLength(N);
	});

});

// ---------------------------------------------------------------------------
// 3. InvalidParameters handling (Req 4.5)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: InvalidParameters (Req 4.5)', () => {

	it('records invalid parameters without throwing', async () => {
		makeSsmSpy({
			getByNameImpl: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/app/host', Value: 'good' }],
				InvalidParameters: ['/test/app/missing']
			})
		});

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/', names: ['host', 'missing'] }
		]);

		expect(result.store.app.host).toBe('good');
		expect(result.store.app.missing).toBeUndefined();
		expect(result.invalid).toHaveLength(1);
		expect(result.invalid[0].name).toBe('/test/app/missing');
	});

});

// ---------------------------------------------------------------------------
// 4. Path discovery with pagination (Req 5, Property 7)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: path pagination (Req 5, Property 7)', () => {

	it('follows NextToken and returns all parameters', async () => {
		const page1 = makeParams('/test/app/', ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
		const page2 = makeParams('/test/app/', ['p10', 'p11', 'p12', 'p13', 'p14']);

		const mockFn = jest.fn()
			.mockResolvedValueOnce({ Parameters: page1, NextToken: 'token1' })
			.mockResolvedValueOnce({ Parameters: page2 });

		makeSsmSpy({ getByPathImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/' }
		]);

		expect(mockFn).toHaveBeenCalledTimes(2);
		expect(Object.keys(result.store.app)).toHaveLength(15);
		expect(result.store.app.p0).toBe('v_p0');
		expect(result.store.app.p14).toBe('v_p14');
		expect(result.pages).toBe(2);
	});

	it('sets MaxResults: 10 explicitly on every GetParametersByPath call (Req 5.1)', async () => {
		const mockFn = jest.fn().mockResolvedValue({ Parameters: [] });
		makeSsmSpy({ getByPathImpl: mockFn });

		await ParameterStoreLoader.load([{ group: 'app', path: '/test/' }]);

		expect(mockFn).toHaveBeenCalledWith(
			expect.objectContaining({ MaxResults: 10 })
		);
	});

	it('stores all N params for N > 10 under a path (Property 7)', async () => {
		const N = 23;
		const allParams = Array.from({ length: N }, (_, i) => ({
			Name: `/test/app/param${i}`, Value: `val${i}`
		}));

		// Split into pages of 10
		const mockFn = jest.fn()
			.mockResolvedValueOnce({ Parameters: allParams.slice(0, 10), NextToken: 't1' })
			.mockResolvedValueOnce({ Parameters: allParams.slice(10, 20), NextToken: 't2' })
			.mockResolvedValueOnce({ Parameters: allParams.slice(20) });

		makeSsmSpy({ getByPathImpl: mockFn });

		const result = await ParameterStoreLoader.load([{ group: 'app', path: '/test/app/' }]);

		expect(Object.keys(result.store.app)).toHaveLength(N);
	});

});

// ---------------------------------------------------------------------------
// 5. Recursive path retrieval (Req 6)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: recursive paths (Req 6)', () => {

	it('does NOT set Recursive when entry.recursive is false (default)', async () => {
		const mockFn = jest.fn().mockResolvedValue({ Parameters: [] });
		makeSsmSpy({ getByPathImpl: mockFn });

		await ParameterStoreLoader.load([{ group: 'app', path: '/test/' }]);

		expect(mockFn).not.toHaveBeenCalledWith(
			expect.objectContaining({ Recursive: true })
		);
	});

	it('sets Recursive: true when entry.recursive is true', async () => {
		const mockFn = jest.fn().mockResolvedValue({ Parameters: [] });
		makeSsmSpy({ getByPathImpl: mockFn });

		await ParameterStoreLoader.load([{ group: 'app', path: '/test/', recursive: true }]);

		expect(mockFn).toHaveBeenCalledWith(
			expect.objectContaining({ Recursive: true })
		);
	});

	it('stores nested recursive parameters via setGroupedPath', async () => {
		const mockFn = jest.fn().mockResolvedValue({
			Parameters: [
				{ Name: '/app/host', Value: 'server.example.com' },
				{ Name: '/app/db/host', Value: 'db.example.com' },
				{ Name: '/app/db/port', Value: '5432' }
			]
		});
		makeSsmSpy({ getByPathImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/app/', recursive: true }
		]);

		expect(result.store.app.host).toBe('server.example.com');
		expect(result.store.app.db.host).toBe('db.example.com');
		expect(result.store.app.db.port).toBe('5432');
	});

});

// ---------------------------------------------------------------------------
// 6. Path mismatch (Req 3, Property 10)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: path mismatch (Req 3, Property 10)', () => {

	it('path without trailing slash: does not throw, normalises path (Req 3.3-3.4)', async () => {
		const mockFn = jest.fn().mockResolvedValue({
			Parameters: [{ Name: '/myapp/prod/authUsername', Value: 'alice' }]
		});
		makeSsmSpy({ getByNameImpl: mockFn });

		// No trailing slash
		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/myapp/prod', names: ['authUsername'] }
		]);

		expect(result.store.app?.authUsername).toBe('alice');
	});

	it('unmatched response parameter is warned and skipped (Req 3.2)', async () => {
		const mockFn = jest.fn().mockResolvedValue({
			Parameters: [
				{ Name: '/test/app/host', Value: 'h' },
				{ Name: '/unrelated/param', Value: 'x' }   // matches no configured entry
			]
		});
		makeSsmSpy({ getByNameImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/', names: ['host', 'extra'] }
		]);

		// Matched parameter stored
		expect(result.store.app?.host).toBe('h');
		// Unmatched parameter reported in skipped
		const unmatched = result.skipped.find(s => s.name === '/unrelated/param');
		expect(unmatched).toBeDefined();
		expect(unmatched.reason).toBe('unmatched-path');
	});

});

// ---------------------------------------------------------------------------
// 7. Shadow collision detection (Req 6.6, Property 11)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: shadow collisions (Req 6.6)', () => {

	it('keeps shallower scalar, skips deeper colliding paths', async () => {
		const mockFn = jest.fn().mockResolvedValue({
			Parameters: [
				{ Name: '/app/db', Value: 'scalar' },
				{ Name: '/app/db/host', Value: 'deep' }     // shadowed by /app/db
			]
		});
		makeSsmSpy({ getByPathImpl: mockFn });

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/app/', recursive: true }
		]);

		// Shallower scalar is stored
		expect(result.store.app?.db).toBe('scalar');
		// Deeper path is skipped
		expect(result.store.app?.db?.host).toBeUndefined();
		// Collision is reported
		expect(result.collisions).toHaveLength(1);
		expect(result.collisions[0]).toEqual({ name: '/app/db/host', shadowedBy: '/app/db' });
		// Skipped list also contains it
		const s = result.skipped.find(e => e.name === '/app/db/host');
		expect(s?.reason).toBe('shadow-collision');
	});

});

// ---------------------------------------------------------------------------
// 8. Key safety integration (Req 1, 2)
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: key safety (Req 1, 2)', () => {

	it('prototype-reachable group key (toString): parameter skipped, Object.prototype unmodified', async () => {
		// Use path-discovery (no names array) so the proto-key group is treated as
		// a discovered (warn-and-skip) rather than enumerated (throw) parameter
		const mockFn = jest.fn().mockResolvedValue({
			Parameters: [{ Name: '/toString/secretKey', Value: 'LEAKED' }]
		});
		makeSsmSpy({ getByPathImpl: mockFn });

		const before = Object.getOwnPropertyNames(Object.prototype);

		// Path-discovery entry with group="toString" — loader warns and skips
		await ParameterStoreLoader.load([
			{ group: 'toString', path: '/toString/' }
		]);

		const after = Object.getOwnPropertyNames(Object.prototype);
		expect(after.filter(k => !before.includes(k))).toHaveLength(0);
	});

	it('Object.prototype is unmodified after loading any combination of groups (path-discovery)', async () => {
		const protoNames = Object.getOwnPropertyNames(Object.prototype)
			.filter(k => /^[a-zA-Z][a-zA-Z0-9]*$/.test(k))
			.slice(0, 5);  // test a representative sample

		for (const group of protoNames) {
			const mockFn = jest.fn().mockResolvedValue({
				Parameters: [{ Name: `/${group}/param`, Value: 'v' }]
			});
			jest.spyOn(tools.default.AWS, 'ssm', 'get').mockReturnValue({
				client: {}, getByName: jest.fn().mockResolvedValue({ Parameters: [], InvalidParameters: [] }),
				getByPath: mockFn, sdk: {}
			});

			const before = Object.getOwnPropertyNames(Object.prototype);
			// Path-discovery (no names) → warn-and-skip, no throw
			await ParameterStoreLoader.load([{ group, path: `/${group}/` }]);
			const after = Object.getOwnPropertyNames(Object.prototype);
			expect(after.filter(k => !before.includes(k))).toHaveLength(0);
			jest.restoreAllMocks();
		}
	});

});

// ---------------------------------------------------------------------------
// 9. Return structure shape
// ---------------------------------------------------------------------------

describe('ParameterStoreLoader: return structure', () => {

	it('always returns {store, skipped, invalid, collisions, pages}', async () => {
		makeSsmSpy({
			getByNameImpl: jest.fn().mockResolvedValue({ Parameters: [], InvalidParameters: [] })
		});

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/', names: ['x'] }
		]);

		expect(result).toHaveProperty('store');
		expect(result).toHaveProperty('skipped');
		expect(result).toHaveProperty('invalid');
		expect(result).toHaveProperty('collisions');
		expect(result).toHaveProperty('pages');
		expect(typeof result.store).toBe('object');
		expect(Array.isArray(result.skipped)).toBe(true);
		expect(Array.isArray(result.invalid)).toBe(true);
		expect(Array.isArray(result.collisions)).toBe(true);
		expect(typeof result.pages).toBe('number');
	});

	it('store uses plain {} groups so consumers keep inherited methods (Req 7.5)', async () => {
		makeSsmSpy({
			getByNameImpl: jest.fn().mockResolvedValue({
				Parameters: [{ Name: '/test/app/host', Value: 'h' }],
				InvalidParameters: []
			})
		});

		const result = await ParameterStoreLoader.load([
			{ group: 'app', path: '/test/app/', names: ['host'] }
		]);

		// Group is a plain object, not null-prototype
		expect(Object.getPrototypeOf(result.store.app)).toBe(Object.prototype);
	});

});
