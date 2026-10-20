/**
 * Jest unit tests for CacheableDataAccess.getData connection no-mutation behavior.
 *
 * As of spec 1-4-0-cache-key-generation-docs (Requirement 7, code change X2), getData
 * deep-clones the caller's `connection` via `tools.safeClone` and performs ALL header
 * preparation (headers default, invalid-value sanitation, `if-none-match` /
 * `if-modified-since` assignment) on the clone. The clone is passed to `apiCallFunction`.
 * The id_hash is still computed from the caller's ORIGINAL connection before the clone
 * exists, so a caller passing a fresh connection per request sees no key change, and a
 * caller reusing a single reference across calls gets a stable key.
 *
 * These tests drive the refresh branch using the getter-mock pattern for
 * `tools.AWS.dynamo` (see steering: test-harness-for-private-classes-and-methods) and
 * assert against both the connection `apiCallFunction` receives (the clone) and the
 * caller's own object (which must be left untouched).
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.6, 10.2 (Correctness Properties 1 and 2)
 */

import { jest } from '@jest/globals';
import { randomBytes } from 'crypto';

// Import tools first so we can spy on the AWS.dynamo getter
const tools = await import('../../src/lib/tools/index.js');

// Initialize cache once before all tests (Cache.init is once-only global state)
const testKey = randomBytes(32).toString('hex');
const dataKey = Buffer.from(testKey, 'hex');

const cacheInit = {
	dynamoDbTable: "test-table-jest",
	s3Bucket: "test-bucket-jest",
	secureDataKey: dataKey,
	idHashAlgorithm: "sha256"
};

// Import cache module and initialize
const cache = await import('../../src/lib/dao-cache.js');
cache.Cache.init(cacheInit);

/**
 * Build a getter-mock for tools.AWS.dynamo whose get() returns an expired cache Item,
 * forcing getData into the refresh branch.
 *
 * @param {Object} headers - headers object to embed in the cached data
 * @param {string} idHash - the id_hash to return on the mocked Item
 * @returns {jest.Mock} the mock get function (for call assertions)
 */
function mockExpiredDynamo(headers, idHash) {
	const mockGet = jest.fn().mockResolvedValue({
		Item: {
			id_hash: idHash,
			expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
			data: {
				body: '{"test":"data"}',
				headers,
				statusCode: '200',
				info: {
					classification: 'public',
					objInS3: false
				}
			}
		}
	});

	jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
		client: {},
		get: mockGet,
		put: jest.fn(),
		scan: jest.fn(),
		delete: jest.fn(),
		update: jest.fn(),
		sdk: {}
	});

	return mockGet;
}

describe('CacheableDataAccess.getData - caller connection is not mutated (X2)', () => {

	afterEach(() => {
		// CRITICAL: restore all mocks after each test to prevent cross-test pollution
		jest.restoreAllMocks();
	});

	it('leaves the caller connection structurally unchanged after a refresh', async () => {
		const mockGet = mockExpiredDynamo(
			{ 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
			'test-hash-no-mutation-1'
		);

		const { CacheableDataAccess } = cache;

		const mockApiFunction = jest.fn().mockResolvedValue({
			success: true,
			statusCode: 304,
			body: '',
			headers: {}
		});

		// Connection with a nested object and pre-existing headers to prove deep equality
		const connection = {
			host: 'api.example.com',
			path: '/no-mutation-1',
			headers: { 'accept': 'application/json' },
			parameters: { nested: { a: 1, b: [2, 3] } }
		};

		// Deep snapshot of the caller's object before the call
		const before = structuredClone(connection);

		const cachePolicy = {
			hostId: 'api.example.com',
			pathId: '/no-mutation-1',
			profile: 'default',
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			expirationIsOnInterval: false,
			headersToRetain: '',
			hostEncryption: 'public'
		};

		await CacheableDataAccess.getData(
			cachePolicy,
			mockApiFunction,
			connection,
			null,
			{ path: 'no-mutation-1', id: 'jest-no-mutation-1' }
		);

		// The refresh branch ran and apiCallFunction was invoked
		expect(mockGet).toHaveBeenCalled();
		expect(mockApiFunction).toHaveBeenCalled();

		// Caller's connection is deep-equal to its pre-call state: same keys, nested
		// values, and headers presence/contents are all preserved.
		expect(connection).toEqual(before);

		// The conditional-request markers were NOT injected onto the caller's object
		expect(connection.headers['if-none-match']).toBeUndefined();
		expect(connection.headers['if-modified-since']).toBeUndefined();

		// Original headers are intact
		expect(connection.headers['accept']).toBe('application/json');
		expect(Object.keys(connection.headers)).toEqual(['accept']);
	});

	it('does not add a headers property when the caller connection has none', async () => {
		const mockGet = mockExpiredDynamo(
			{ 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
			'test-hash-no-mutation-2'
		);

		const { CacheableDataAccess } = cache;

		let receivedConnection = null;
		const mockApiFunction = jest.fn().mockImplementation(async (conn) => {
			receivedConnection = conn;
			return { success: true, statusCode: 304, body: '', headers: {} };
		});

		// Connection WITHOUT a headers property
		const connection = {
			host: 'api.example.com',
			path: '/no-mutation-2'
		};

		const cachePolicy = {
			hostId: 'api.example.com',
			pathId: '/no-mutation-2',
			profile: 'default',
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			expirationIsOnInterval: false,
			headersToRetain: '',
			hostEncryption: 'public'
		};

		await CacheableDataAccess.getData(
			cachePolicy,
			mockApiFunction,
			connection,
			null,
			{ path: 'no-mutation-2', id: 'jest-no-mutation-2' }
		);

		expect(mockGet).toHaveBeenCalled();
		expect(mockApiFunction).toHaveBeenCalled();

		// The caller's object still has NO headers property after the call returns
		expect('headers' in connection).toBe(false);
		expect(connection.headers).toBeUndefined();

		// The clone passed to apiCallFunction DID get a headers object (the markers live there)
		expect(receivedConnection).not.toBeNull();
		expect(receivedConnection.headers).toBeDefined();
	});

	it('yields an equal id_hash across two getData calls with a reused connection reference', async () => {
		const { CacheableDataAccess } = cache;

		const mockApiFunction = jest.fn().mockResolvedValue({
			success: true,
			statusCode: 304,
			body: '',
			headers: {}
		});

		// A single connection reference reused across both calls (no fresh object per call)
		const connection = {
			host: 'api.example.com',
			path: '/no-mutation-3',
			headers: {}
		};

		const cachePolicy = {
			hostId: 'api.example.com',
			pathId: '/no-mutation-3',
			profile: 'default',
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			expirationIsOnInterval: false,
			headersToRetain: '',
			hostEncryption: 'public'
		};

		// First call
		mockExpiredDynamo(
			{ 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
			'test-hash-no-mutation-3'
		);
		const firstCache = await CacheableDataAccess.getData(
			cachePolicy,
			mockApiFunction,
			connection,
			null,
			{ path: 'no-mutation-3', id: 'jest-no-mutation-3a' }
		);
		const firstIdHash = firstCache.getIdHash();

		// Restore and re-arm the mock for the second call (same reused connection reference)
		jest.restoreAllMocks();
		mockExpiredDynamo(
			{ 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
			'test-hash-no-mutation-3'
		);
		const secondCache = await CacheableDataAccess.getData(
			cachePolicy,
			mockApiFunction,
			connection,
			null,
			{ path: 'no-mutation-3', id: 'jest-no-mutation-3b' }
		);
		const secondIdHash = secondCache.getIdHash();

		// The key is stable across reuse because getData never mutated the shared reference
		expect(firstIdHash).toBe(secondIdHash);

		// Cross-check against a directly computed hash for the same (unmutated) connection.
		// getData hashes the full { data, connection, cachePolicy } shape, so mirror it here.
		const directHash = cache.Cache.generateIdHash({ data: null, connection, cachePolicy });
		expect(firstIdHash).toBe(directHash);
	});

	it('gives apiCallFunction the conditional-request markers while the caller connection has none', async () => {
		const mockGet = mockExpiredDynamo(
			{ 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
			'test-hash-no-mutation-4'
		);

		const { CacheableDataAccess } = cache;

		let receivedConnection = null;
		const mockApiFunction = jest.fn().mockImplementation(async (conn) => {
			receivedConnection = conn;
			return { success: true, statusCode: 304, body: '', headers: {} };
		});

		const connection = {
			host: 'api.example.com',
			path: '/no-mutation-4',
			headers: {}
		};

		const cachePolicy = {
			hostId: 'api.example.com',
			pathId: '/no-mutation-4',
			profile: 'default',
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			expirationIsOnInterval: false,
			headersToRetain: '',
			hostEncryption: 'public'
		};

		await CacheableDataAccess.getData(
			cachePolicy,
			mockApiFunction,
			connection,
			null,
			{ path: 'no-mutation-4', id: 'jest-no-mutation-4' }
		);

		expect(mockGet).toHaveBeenCalled();
		expect(receivedConnection).not.toBeNull();

		// The ARGUMENT apiCallFunction received (the clone) carries both markers
		expect(receivedConnection.headers['if-none-match']).toBe('"valid-etag"');
		expect(receivedConnection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');

		// The clone is a distinct object from the caller's connection
		expect(receivedConnection).not.toBe(connection);

		// The caller's OWN connection does NOT have the markers
		expect(connection.headers['if-none-match']).toBeUndefined();
		expect(connection.headers['if-modified-since']).toBeUndefined();
		expect(Object.keys(connection.headers)).toEqual([]);
	});
});
