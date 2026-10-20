/**
 * Property-based tests for CacheableDataAccess.getData connection handling (X2).
 *
 * Spec: 1-4-0-cache-key-generation-docs (Requirement 7, code change X2).
 *
 * As of X2, getData deep-clones the caller's `connection` via `tools.safeClone` and
 * performs ALL header preparation (headers default, invalid-value sanitation,
 * `if-none-match` / `if-modified-since` assignment) on the clone. The id_hash is still
 * computed from the caller's ORIGINAL connection before the clone exists.
 *
 * This file asserts two correctness properties from design.md over generated connection
 * shapes:
 *
 *   Property 1 (No caller mutation): for any generated `connection`, getData leaves the
 *   caller's object structurally equal to its pre-call snapshot (same keys, nested
 *   values, and headers presence/absence).
 *
 *   Property 3 (No key change for fresh objects): the id_hash getData uses equals the
 *   hash the pre-fix code produced for that same input. The pre-fix hash of the same
 *   input is exactly `Cache.generateIdHash({ data, connection, cachePolicy })` for the
 *   ORIGINAL connection, because the hash input was never the mutated object. So the
 *   returned `cache.getIdHash()` must equal that directly-computed hash.
 *
 * The refresh branch is driven in-process using the getter-mock pattern for
 * `tools.AWS.dynamo` (see steering: test-harness-for-private-classes-and-methods). No
 * child processes are spawned, so the standard numRuns of 100 is appropriate.
 *
 * Property-test rules (steering: test-execution-monitoring):
 *   - Rely on the global `FC_SEED` hook; do NOT pass `seed` at the `fc.assert` call site.
 *   - The asserted properties (no-mutation, hash-equivalence) are downstream behaviors,
 *     not a predicate on the connection shape, so the generator produces varied shapes
 *     freely. The only precondition is JSON-serializability (hashing requires it); that
 *     is guaranteed by construction — every generated leaf is a string, number, boolean,
 *     or null, and the generator emits no functions, symbols, or undefined.
 *
 * Validates: Requirements 7.5, 10.3, 10.5 (Correctness Properties 1 and 3)
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { randomBytes } from 'crypto';

// Import tools first so we can spy on the AWS.dynamo getter
const tools = await import('../../src/lib/tools/index.js');

// Initialize cache once before all tests (Cache.init is once-only global state)
const testKey = randomBytes(32).toString('hex');
const dataKey = Buffer.from(testKey, 'hex');

const cacheInit = {
	dynamoDbTable: "test-table-prop-jest",
	s3Bucket: "test-bucket-prop-jest",
	secureDataKey: dataKey,
	idHashAlgorithm: "sha256"
};

const cache = await import('../../src/lib/dao-cache.js');
cache.Cache.init(cacheInit);

/**
 * Arbitrary for JSON-serializable leaf values. Deliberately mixes value TYPES
 * (string vs number vs boolean vs null) so the generator exercises the hash's
 * type sensitivity and the clone's handling of mixed types. No `undefined`,
 * functions, or symbols are produced, so every generated connection is
 * JSON-serializable and clones/hashes cleanly.
 *
 * @type {fc.Arbitrary<string|number|boolean|null>}
 */
const leafValueArb = fc.oneof(
	fc.string({ maxLength: 20 }),
	fc.integer({ min: -10000, max: 10000 }),
	fc.double({ noNaN: true, noDefaultInfinity: true }),
	fc.boolean(),
	fc.constant(null)
);

/**
 * Arbitrary for a small, possibly-nested serializable object. Values are leaf
 * values or one level of nested record/array, giving varied connection shapes
 * (nested objects and arrays with mixed value types) without risking circular
 * references or excessive depth.
 *
 * @type {fc.Arbitrary<Object>}
 */
const nestedObjectArb = fc.dictionary(
	fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/),
	fc.oneof(
		leafValueArb,
		fc.array(leafValueArb, { maxLength: 4 }),
		fc.dictionary(
			fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/),
			leafValueArb,
			{ maxKeys: 4 }
		)
	),
	{ maxKeys: 5 }
);

/**
 * Arbitrary for a headers object with string values (the realistic header shape).
 * Keys avoid the conditional-request markers so a generated header can never
 * collide with the markers getData injects on the clone.
 *
 * @type {fc.Arbitrary<Object.<string, string>>}
 */
const headersArb = fc.dictionary(
	fc.stringMatching(/^[a-z][a-z0-9-]{0,14}$/).filter(
		(key) => key !== 'if-none-match' && key !== 'if-modified-since'
	),
	fc.string({ minLength: 1, maxLength: 20 }),
	{ maxKeys: 5 }
);

/**
 * Arbitrary for connection objects of varied shape. `host`/`path` are always
 * present (getData/cachePolicy rely on string ids), while `headers`,
 * `parameters`, `authentication`, and `options` each appear or are absent
 * independently — so the generator covers the with-headers and without-headers
 * cases, nested objects, and the `connection.options` exclusion path. Produced
 * objects are always JSON-serializable by construction.
 *
 * @type {fc.Arbitrary<Object>}
 */
const connectionArb = fc.record(
	{
		host: fc.stringMatching(/^[a-z][a-z0-9.]{0,29}$/),
		path: fc.stringMatching(/^\/[a-z0-9/]{0,29}$/),
		method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
		headers: headersArb,
		parameters: nestedObjectArb,
		authentication: nestedObjectArb,
		options: fc.record({
			timeout: fc.integer({ min: 0, max: 30000 }),
			forceRefresh: fc.constant(false)
		})
	},
	{
		// host/path are always present; everything else is optional so the generator
		// emits both with-headers and without-headers connections, with and without
		// the excluded `options` key.
		requiredKeys: ['host', 'path']
	}
);

/**
 * Build a getter-mock for tools.AWS.dynamo whose get() returns an expired cache Item,
 * forcing getData into the refresh branch. Each call re-arms the spy, so callers
 * must restore mocks between generated iterations.
 *
 * @param {string} idHash - the id_hash to place on the mocked Item
 * @returns {jest.Mock} the mock get function
 */
function mockExpiredDynamo(idHash) {
	const mockGet = jest.fn().mockResolvedValue({
		Item: {
			id_hash: idHash,
			expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
			data: {
				body: '{"test":"data"}',
				headers: { 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT', 'etag': '"valid-etag"' },
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

describe('CacheableDataAccess.getData - property tests (X2: no mutation, stable key)', () => {

	afterEach(() => {
		// CRITICAL: restore all mocks after each test to prevent cross-test pollution
		jest.restoreAllMocks();
	});

	it('Property 1 & 3: leaves the caller connection unchanged and uses the pre-fix id_hash', async () => {
		await fc.assert(
			fc.asyncProperty(
				connectionArb,
				async (connection) => {
					// Arm the refresh branch for this iteration.
					mockExpiredDynamo('prop-test-hash');

					const { CacheableDataAccess } = cache;

					const mockApiFunction = jest.fn().mockResolvedValue({
						success: true,
						statusCode: 304,
						body: '',
						headers: {}
					});

					const cachePolicy = {
						hostId: connection.host,
						pathId: connection.path,
						profile: 'default',
						overrideOriginHeaderExpiration: false,
						defaultExpirationInSeconds: 300,
						expirationIsOnInterval: false,
						headersToRetain: '',
						hostEncryption: 'public'
					};

					// Deep snapshot of the caller's connection BEFORE the call.
					const before = structuredClone(connection);

					// Expected id_hash is the pre-fix hash of the SAME input: getData hashes
					// { data, connection, cachePolicy }, and the hash input is the original
					// (unmutated) connection. Compute it before the call for clarity.
					const expectedIdHash = cache.Cache.generateIdHash({
						data: null,
						connection,
						cachePolicy
					});

					const resultCache = await CacheableDataAccess.getData(
						cachePolicy,
						mockApiFunction,
						connection,
						null,
						{ path: 'prop', id: 'prop-iter' }
					);

					// The refresh branch must have run so the (potentially) mutating code path
					// is actually exercised for this input.
					expect(mockApiFunction).toHaveBeenCalled();

					// Property 1: the caller's connection is deep-equal to its pre-call state.
					expect(connection).toEqual(before);

					// Property 3: the id_hash getData used equals the pre-fix hash of the same
					// input. The clone/mutation never touched the hash input, so these match.
					expect(resultCache.getIdHash()).toBe(expectedIdHash);

					// Restore mocks between generated iterations (afterEach only runs per `it`).
					jest.restoreAllMocks();
				}
			),
			{ numRuns: 100 }
		);
	}, 60000);
});
