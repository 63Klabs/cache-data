/**
 * Integration tests for header sanitization in CacheableDataAccess.getData()
 * Validates that invalid header values (including string "undefined") are removed
 * before making API calls to prevent HTTP errors.
 * 
 * Validates: Bug fix for "Invalid value 'undefined' for header" error
 */

import { describe, it, expect } from '@jest/globals';
import pkg from '../../src/lib/dao-cache.js';
const { CacheableDataAccess } = pkg;

describe('CacheableDataAccess - Header Sanitization Tests', () => {

	describe('Header sanitization before API call', () => {

		it('should remove headers with string "undefined" value', async () => {
			const cachePolicy = {
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: 60,
				expirationIsOnInterval: false,
				headersToRetain: [],
				hostId: 'api.example.com',
				pathId: '/test',
				encrypt: false
			};

			const connection = {
				method: 'GET',
				protocol: 'https',
				host: 'api.example.com',
				path: '/test',
				parameters: {},
				headers: {
					'if-modified-since': 'undefined', // String "undefined" should be removed
					'if-none-match': 'valid-etag',
					'user-agent': 'test-agent'
				},
				options: { timeout: 5000 }
			};

			let capturedConnection = null;
			const mockApiCall = async (conn, data) => {
				capturedConnection = conn;
				return {
					success: true,
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"test":"data"}'
				};
			};

			await CacheableDataAccess.getData(cachePolicy, mockApiCall, connection, null, { test: true });

			// Verify that the string "undefined" was removed
			expect('if-modified-since' in capturedConnection.headers).toBe(false);

			// Verify that valid headers remain
			expect(capturedConnection.headers['if-none-match']).toBe('valid-etag');
			expect(capturedConnection.headers['user-agent']).toBe('test-agent');
		});

		it('should remove headers with null value', async () => {
			const cachePolicy = {
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: 60,
				expirationIsOnInterval: false,
				headersToRetain: [],
				hostId: 'api.example.com',
				pathId: '/test',
				encrypt: false
			};

			const connection = {
				method: 'GET',
				protocol: 'https',
				host: 'api.example.com',
				path: '/test',
				parameters: {},
				headers: {
					'if-modified-since': null, // null should be removed
					'if-none-match': 'valid-etag'
				},
				options: { timeout: 5000 }
			};

			let capturedConnection = null;
			const mockApiCall = async (conn, data) => {
				capturedConnection = conn;
				return {
					success: true,
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"test":"data"}'
				};
			};

			await CacheableDataAccess.getData(cachePolicy, mockApiCall, connection, null, { test: true });

			// Verify that null was removed
			expect('if-modified-since' in capturedConnection.headers).toBe(false);

			// Verify that valid headers remain
			expect(capturedConnection.headers['if-none-match']).toBe('valid-etag');
		});

		it('should remove headers with undefined value', async () => {
			const cachePolicy = {
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: 60,
				expirationIsOnInterval: false,
				headersToRetain: [],
				hostId: 'api.example.com',
				pathId: '/test',
				encrypt: false
			};

			const connection = {
				method: 'GET',
				protocol: 'https',
				host: 'api.example.com',
				path: '/test',
				parameters: {},
				headers: {
					'if-modified-since': undefined, // undefined should be removed
					'if-none-match': 'valid-etag'
				},
				options: { timeout: 5000 }
			};

			let capturedConnection = null;
			const mockApiCall = async (conn, data) => {
				capturedConnection = conn;
				return {
					success: true,
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"test":"data"}'
				};
			};

			await CacheableDataAccess.getData(cachePolicy, mockApiCall, connection, null, { test: true });

			// Verify that undefined was removed
			expect('if-modified-since' in capturedConnection.headers).toBe(false);

			// Verify that valid headers remain
			expect(capturedConnection.headers['if-none-match']).toBe('valid-etag');
		});

		it('should remove headers with empty string value', async () => {
			const cachePolicy = {
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: 60,
				expirationIsOnInterval: false,
				headersToRetain: [],
				hostId: 'api.example.com',
				pathId: '/test',
				encrypt: false
			};

			const connection = {
				method: 'GET',
				protocol: 'https',
				host: 'api.example.com',
				path: '/test',
				parameters: {},
				headers: {
					'if-modified-since': '', // empty string should be removed
					'if-none-match': 'valid-etag'
				},
				options: { timeout: 5000 }
			};

			let capturedConnection = null;
			const mockApiCall = async (conn, data) => {
				capturedConnection = conn;
				return {
					success: true,
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"test":"data"}'
				};
			};

			await CacheableDataAccess.getData(cachePolicy, mockApiCall, connection, null, { test: true });

			// Verify that empty string was removed
			expect('if-modified-since' in capturedConnection.headers).toBe(false);

			// Verify that valid headers remain
			expect(capturedConnection.headers['if-none-match']).toBe('valid-etag');
		});

		it('should keep all valid headers', async () => {
			const cachePolicy = {
				overrideOriginHeaderExpiration: true,
				defaultExpirationInSeconds: 60,
				expirationIsOnInterval: false,
				headersToRetain: [],
				hostId: 'api.example.com',
				pathId: '/test',
				encrypt: false
			};

			const connection = {
				method: 'GET',
				protocol: 'https',
				host: 'api.example.com',
				path: '/test',
				parameters: {},
				headers: {
					'if-modified-since': 'Wed, 21 Oct 2015 07:28:00 GMT',
					'if-none-match': 'valid-etag',
					'user-agent': 'test-agent',
					'accept': 'application/json'
				},
				options: { timeout: 5000 }
			};

			let capturedConnection = null;
			const mockApiCall = async (conn, data) => {
				capturedConnection = conn;
				return {
					success: true,
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"test":"data"}'
				};
			};

			await CacheableDataAccess.getData(cachePolicy, mockApiCall, connection, null, { test: true });

			// Verify that all valid headers remain
			expect(capturedConnection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
			expect(capturedConnection.headers['if-none-match']).toBe('valid-etag');
			expect(capturedConnection.headers['user-agent']).toBe('test-agent');
			expect(capturedConnection.headers['accept']).toBe('application/json');
		});
	});
});
