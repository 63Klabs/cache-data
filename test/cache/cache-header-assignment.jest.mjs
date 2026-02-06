/**
 * Jest integration tests for CacheableDataAccess header assignment with AWS mocks
 * Tests the full integration between DynamoDbCache, Cache, and CacheableDataAccess
 * to verify that undefined headers are not assigned to connection objects
 * 
 * Validates: Requirements 5.4, 5.5
 */

import { jest } from '@jest/globals';

describe('CacheableDataAccess - Header Assignment with AWS Mocks', () => {
	let cache;
	let DynamoDbCache;
	let S3Cache;
	let CacheData;
	let originalDynamoGet;
	let originalS3Get;

	beforeEach(async () => {
		// Clear module cache to get fresh instances
		jest.resetModules();
		
		// Import the cache module
		cache = await import('../../src/lib/dao-cache.js');
		
		// Get references to the classes
		const daoCache = await import('../../src/lib/dao-cache.js');
		
		// Store original methods for restoration
		const tools = await import('../../src/lib/tools/index.js');
		originalDynamoGet = tools.default.AWS.dynamo.get;
		originalS3Get = tools.default.AWS.s3.get;
	});

	afterEach(() => {
		// Restore original methods
		jest.restoreAllMocks();
	});

	describe('DynamoDbCache with undefined headers', () => {
		
		it('should not assign if-modified-since when DynamoDbCache returns undefined last-modified', async () => {
			// Mock DynamoDbCache.read() to return headers with undefined last-modified
			const tools = await import('../../src/lib/tools/index.js');
			
			tools.default.AWS.dynamo.get = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash',
					expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
					data: {
						body: '{"test":"data"}',
						headers: {
							'last-modified': undefined, // Undefined header value
							'etag': '"valid-etag"'
						},
						statusCode: '200',
						info: {
							classification: 'public',
							objInS3: false
						}
					}
				}
			});

			// Initialize cache
			const { Cache, CacheableDataAccess } = cache;
			
			// Create a mock API function that returns 304 Not Modified
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			// Create connection object
			const connection = {
				host: 'api.example.com',
				path: '/test',
				headers: {}
			};

			// Create cache policy
			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test',
				profile: 'default',
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: '',
				hostEncryption: 'public'
			};

			// Call CacheableDataAccess.getData()
			const cacheObj = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiFunction,
				connection,
				null,
				{ path: 'test', id: 'jest-test-1' }
			);

			// Verify that if-modified-since was NOT assigned (should be undefined)
			expect(connection.headers['if-modified-since']).toBeUndefined();
			
			// Verify that if-none-match WAS assigned (valid etag)
			expect(connection.headers['if-none-match']).toBe('"valid-etag"');
		});

		it('should not assign if-none-match when DynamoDbCache returns undefined etag', async () => {
			const tools = await import('../../src/lib/tools/index.js');
			
			tools.default.AWS.dynamo.get = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash',
					expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
					data: {
						body: '{"test":"data"}',
						headers: {
							'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
							'etag': undefined // Undefined header value
						},
						statusCode: '200',
						info: {
							classification: 'public',
							objInS3: false
						}
					}
				}
			});

			const { Cache, CacheableDataAccess } = cache;
			
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			const connection = {
				host: 'api.example.com',
				path: '/test',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test',
				profile: 'default',
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: '',
				hostEncryption: 'public'
			};

			const cacheObj = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiFunction,
				connection,
				null,
				{ path: 'test', id: 'jest-test-2' }
			);

			// Verify that if-none-match was NOT assigned (should be undefined)
			expect(connection.headers['if-none-match']).toBeUndefined();
			
			// Verify that if-modified-since WAS assigned (valid last-modified)
			expect(connection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
		});

		it('should not assign either header when both are undefined', async () => {
			const tools = await import('../../src/lib/tools/index.js');
			
			tools.default.AWS.dynamo.get = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash',
					expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
					data: {
						body: '{"test":"data"}',
						headers: {
							'last-modified': undefined,
							'etag': undefined
						},
						statusCode: '200',
						info: {
							classification: 'public',
							objInS3: false
						}
					}
				}
			});

			const { Cache, CacheableDataAccess } = cache;
			
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			const connection = {
				host: 'api.example.com',
				path: '/test',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test',
				profile: 'default',
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: '',
				hostEncryption: 'public'
			};

			const cacheObj = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiFunction,
				connection,
				null,
				{ path: 'test', id: 'jest-test-3' }
			);

			// Verify that neither header was assigned
			expect(connection.headers['if-modified-since']).toBeUndefined();
			expect(connection.headers['if-none-match']).toBeUndefined();
		});

		it('should assign both headers when both are valid', async () => {
			const tools = await import('../../src/lib/tools/index.js');
			
			tools.default.AWS.dynamo.get = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash',
					expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
					data: {
						body: '{"test":"data"}',
						headers: {
							'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
							'etag': '"valid-etag"'
						},
						statusCode: '200',
						info: {
							classification: 'public',
							objInS3: false
						}
					}
				}
			});

			const { Cache, CacheableDataAccess } = cache;
			
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			const connection = {
				host: 'api.example.com',
				path: '/test',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test',
				profile: 'default',
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: '',
				hostEncryption: 'public'
			};

			const cacheObj = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiFunction,
				connection,
				null,
				{ path: 'test', id: 'jest-test-4' }
			);

			// Verify that both headers were assigned correctly
			expect(connection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
			expect(connection.headers['if-none-match']).toBe('"valid-etag"');
		});

		it('should not assign headers when values are null', async () => {
			const tools = await import('../../src/lib/tools/index.js');
			
			tools.default.AWS.dynamo.get = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash',
					expires: Math.floor(Date.now() / 1000) - 1, // Expired to force refresh
					data: {
						body: '{"test":"data"}',
						headers: {
							'last-modified': null,
							'etag': null
						},
						statusCode: '200',
						info: {
							classification: 'public',
							objInS3: false
						}
					}
				}
			});

			const { Cache, CacheableDataAccess } = cache;
			
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			const connection = {
				host: 'api.example.com',
				path: '/test',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test',
				profile: 'default',
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: '',
				hostEncryption: 'public'
			};

			const cacheObj = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiFunction,
				connection,
				null,
				{ path: 'test', id: 'jest-test-5' }
			);

			// Verify that neither header was assigned
			expect(connection.headers['if-modified-since']).toBeUndefined();
			expect(connection.headers['if-none-match']).toBeUndefined();
		});
	});
});
