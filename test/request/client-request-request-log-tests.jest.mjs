/**
 * Unit Tests: ClientRequest.getRequestLog()
 *
 * Purpose: Verify that getRequestLog().queryKeys contains query string keys only
 * (no values, no "="), and that the other fields returned by getRequestLog()
 * are unchanged.
 *
 * Spec: 1-4-1-trusted-client-ip
 * Requirements: 9.1, 9.2, 9.3
 *
 * Setup:
 * - ClientRequest.init() with excludeParamsWithNoValidationMatch: false, so that
 *   query parameters with no validation rule pass through to getProps()
 * - process.env is saved before each test and restored after each test
 *
 * Teardown:
 * - ClientRequest.init() is reset, mocks are restored, process.env is restored
 *
 * Notes:
 * - "preservation" tests describe behavior that must be identical before and after
 *   the change and pass on the current code.
 * - "fixed behavior" tests fail on the code before the queryKeys change (it logs
 *   "key=value" pairs) and pass after it.
 * - Only documentation range addresses (RFC 5737) and example.com values are used.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const ClientRequestModule = await import('../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

/**
 * Build an API Gateway REST event for GET /search.
 *
 * @param {Object|null} queryStringParameters - Query string parameters, or null for none
 * @returns {Object} Event
 */
function buildEvent(queryStringParameters) {
	return {
		httpMethod: 'GET',
		resource: '/search',
		path: '/search',
		pathParameters: null,
		queryStringParameters: queryStringParameters,
		headers: {},
		body: null,
		requestContext: {
			identity: {
				sourceIp: '203.0.113.20'
			}
		}
	};
}

describe('ClientRequest.getRequestLog()', () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;

		ClientRequest.init({
			referrers: ['*'],
			parameters: {
				excludeParamsWithNoValidationMatch: false
			}
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		process.env = originalEnv;
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('preservation', () => {
		it('should return an empty queryKeys string when there are no query string parameters', () => {
			const request = new ClientRequest(buildEvent(null), mockContext);

			expect(request.getRequestLog().queryKeys).toBe('');
		});

		it('should return an empty queryKeys string when the query string parameters object is empty', () => {
			const request = new ClientRequest(buildEvent({}), mockContext);

			expect(request.getRequestLog().queryKeys).toBe('');
		});

		it('should keep resource as the method and resource path without any query data', () => {
			const request = new ClientRequest(buildEvent({ q: 'jane%40example.com', id: '42' }), mockContext);

			expect(request.getRequestLog().resource).toBe('GET:search');
		});

		it('should keep routeLog empty until addPathLog() is called, then join entries with "/"', () => {
			const request = new ClientRequest(buildEvent({ id: '42' }), mockContext);

			expect(request.getRequestLog().routeLog).toBe('');

			request.addPathLog('search');
			request.addPathLog('byId');

			expect(request.getRequestLog().routeLog).toBe('search/byId');
		});

		it('should keep queryLog empty until addQueryLog() is called, then sort entries and join with "&"', () => {
			const request = new ClientRequest(buildEvent({ id: '42' }), mockContext);

			expect(request.getRequestLog().queryLog).toBe('');

			request.addQueryLog('limit:10');
			request.addQueryLog('city=Chicago');

			expect(request.getRequestLog().queryLog).toBe('city=Chicago&limit:10');
		});

		it('should keep apiKey null when no API key has been recorded', () => {
			const request = new ClientRequest(buildEvent({ id: '42' }), mockContext);

			expect(request.getRequestLog().apiKey).toBeNull();
		});

		it('should return exactly the five documented fields', () => {
			const request = new ClientRequest(buildEvent({ id: '42' }), mockContext);

			expect(Object.keys(request.getRequestLog()).sort()).toEqual(['apiKey', 'queryKeys', 'queryLog', 'resource', 'routeLog']);
		});
	});

	describe('fixed behavior', () => {
		it('should log query keys only, sorted and joined with "&", with no values and no "="', () => {
			const request = new ClientRequest(buildEvent({ q: 'jane%40example.com', id: '42' }), mockContext);

			const queryKeys = request.getRequestLog().queryKeys;

			expect(queryKeys).toBe('id&q');
			expect(queryKeys).not.toContain('=');
			expect(queryKeys).not.toContain('42');
			expect(queryKeys).not.toContain('jane');
			expect(queryKeys).not.toContain('example.com');
		});

		it('should log a single query key without a value', () => {
			const request = new ClientRequest(buildEvent({ token: 'abc123secret' }), mockContext);

			expect(request.getRequestLog().queryKeys).toBe('token');
		});
	});
});
