/**
 * Jest integration tests for CacheableDataAccess header assignment with AWS mocks
 * Tests the full integration between DynamoDbCache, Cache, and CacheableDataAccess
 * to verify that undefined headers are not assigned to connection objects
 * 
 * Validates: Requirements 5.4, 5.5
 */

import { jest } from '@jest/globals';
import { randomBytes } from 'crypto';

// Import tools first so we can spy on it
const tools = await import('../../src/lib/tools/index.js');

// Initialize cache once before all tests
const testKey = randomBytes(32).toString('hex');
const dataKey = Buffer.from(testKey, 'hex');

const cacheInit = {
	dynamoDbTable: "test-table-jest",
	s3Bucket: "test-bucket-jest",
	secureDataKey: dataKey,
	idHashAlgorithm: "sha256"
};

// Import cache module
const cache = await import('../../src/lib/dao-cache.js');
cache.Cache.init(cacheInit);

describe('CacheableDataAccess - Header Assignment with AWS Mocks', () => {

	afterEach(() => {
		// Restore all mocks after each test
		jest.restoreAllMocks();
	});

	describe('DynamoDbCache with undefined headers', () => {
		
		it('should not assign if-modified-since when DynamoDbCache returns undefined last-modified', async () => {
			// Mock the entire dynamo getter to return our mocked functions
			const mockGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash-unique-1',
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
			
			// Spy on the dynamo getter and return our mocked get function
			jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
				client: {},
				get: mockGet,
				put: jest.fn(),
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
			});

			// Use the imported cache module
			const { Cache, CacheableDataAccess } = cache;
			
			// Create a mock API function that returns 304 Not Modified
			const mockApiFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: '',
				headers: {}
			});

			// Create connection object with unique path to avoid cache collision
			const connection = {
				host: 'api.example.com',
				path: '/test-unique-1',
				headers: {}
			};

			// Create cache policy
			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test-unique-1',
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
				{ path: 'test-unique-1', id: 'jest-test-1' }
			);

			// Verify the mock was called
			expect(mockGet).toHaveBeenCalled();
			
			// Verify that if-modified-since was NOT assigned (should be undefined)
			expect(connection.headers['if-modified-since']).toBeUndefined();
			
			// Verify that if-none-match WAS assigned (valid etag)
			expect(connection.headers['if-none-match']).toBe('"valid-etag"');
		});

		it('should not assign if-none-match when DynamoDbCache returns undefined etag', async () => {
			// Mock the entire dynamo getter to return our mocked functions
			const mockGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash-unique-2',
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
			
			// Spy on the dynamo getter and return our mocked get function
			jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
				client: {},
				get: mockGet,
				put: jest.fn(),
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
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
				path: '/test-unique-2',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test-unique-2',
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
				{ path: 'test-unique-2', id: 'jest-test-2' }
			);

			// Verify the mock was called
			expect(mockGet).toHaveBeenCalled();
			
			// Verify that if-none-match was NOT assigned (should be undefined)
			expect(connection.headers['if-none-match']).toBeUndefined();
			
			// Verify that if-modified-since WAS assigned (valid last-modified)
			expect(connection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
		});

		it('should not assign either header when both are undefined', async () => {
			// Mock the entire dynamo getter to return our mocked functions
			const mockGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash-unique-3',
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
			
			// Spy on the dynamo getter and return our mocked get function
			jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
				client: {},
				get: mockGet,
				put: jest.fn(),
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
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
				path: '/test-unique-3',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test-unique-3',
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
				{ path: 'test-unique-3', id: 'jest-test-3' }
			);

			// Verify the mock was called
			expect(mockGet).toHaveBeenCalled();
			
			// Verify that neither header was assigned
			expect(connection.headers['if-modified-since']).toBeUndefined();
			expect(connection.headers['if-none-match']).toBeUndefined();
		});

		it('should assign both headers when both are valid', async () => {
			// Mock the entire dynamo getter to return our mocked functions
			const mockGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash-unique-4',
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
			
			// Spy on the dynamo getter and return our mocked get function
			jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
				client: {},
				get: mockGet,
				put: jest.fn(),
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
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
				path: '/test-unique-4',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test-unique-4',
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
				{ path: 'test-unique-4', id: 'jest-test-4' }
			);

			// Verify the mock was called
			expect(mockGet).toHaveBeenCalled();
			
			// Verify that both headers were assigned correctly
			expect(connection.headers['if-modified-since']).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
			expect(connection.headers['if-none-match']).toBe('"valid-etag"');
		});

		it('should not assign headers when values are null', async () => {
			// Mock the entire dynamo getter to return our mocked functions
			const mockGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: 'test-hash-unique-5',
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
			
			// Spy on the dynamo getter and return our mocked get function
			jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
				client: {},
				get: mockGet,
				put: jest.fn(),
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
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
				path: '/test-unique-5',
				headers: {}
			};

			const cachePolicy = {
				hostId: 'api.example.com',
				pathId: '/test-unique-5',
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
				{ path: 'test-unique-5', id: 'jest-test-5' }
			);

			// Verify the mock was called
			expect(mockGet).toHaveBeenCalled();
			
			// Verify that neither header was assigned
			expect(connection.headers['if-modified-since']).toBeUndefined();
			expect(connection.headers['if-none-match']).toBeUndefined();
		});
	});
});
