/**
 * Integration tests for CacheableDataAccess forceRefresh end-to-end flow
 *
 * Tests the interaction between Cache, CacheData, and CacheableDataAccess
 * with mocked AWS services (DynamoDB, S3) to verify end-to-end behavior.
 *
 * Validates: Requirements 7.2, 7.4
 */

import { jest } from "@jest/globals";
import { randomBytes } from "crypto";

// Import tools first so we can spy on it
const tools = await import("../../../../src/lib/tools/index.js");

// Initialize cache once before all tests
const testKey = randomBytes(32).toString("hex");
const dataKey = Buffer.from(testKey, "hex");

const cacheInit = {
	dynamoDbTable: "test-table-integration",
	s3Bucket: "test-bucket-integration",
	secureDataKey: dataKey,
	idHashAlgorithm: "sha256"
};

// Import cache module
const cache = await import("../../../../src/lib/dao-cache.js");
cache.Cache.init(cacheInit);

const { CacheableDataAccess } = cache;

describe("CacheableDataAccess - Force Refresh Integration Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Requirement 7.2: End-to-end flow: forceRefresh triggers origin fetch and updates cache", () => {
		it("should fetch from origin and update cache when forceRefresh is true with valid cache", async () => {
			const now = Math.floor(Date.now() / 1000);

			// Mock DynamoDB with valid (non-expired) cache
			const mockDynamoGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: "integration-hash-fresh-fetch",
					expires: now + 3600, // Valid: expires in 1 hour
					data: {
						body: "old-cached-body",
						headers: {
							"content-type": "application/json",
							"etag": "\"old-etag-value\""
						},
						statusCode: "200",
						info: {
							classification: "public",
							objInS3: false
						}
					}
				}
			});
			const mockDynamoPut = jest.fn().mockResolvedValue({});

			jest.spyOn(tools.default.AWS, "dynamo", "get").mockReturnValue({
				client: {},
				get: mockDynamoGet,
				put: mockDynamoPut,
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
			});

			jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
				get: jest.fn().mockResolvedValue({ Body: "" }),
				put: jest.fn().mockResolvedValue({}),
				sdk: {}
			});

			// Mock origin to return new data
			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "fresh-data-from-origin",
				headers: {
					"content-type": "application/json",
					"etag": "\"new-etag-value\""
				}
			});

			const connection = {
				host: "api.example.com",
				path: "/integration-test-fresh-fetch",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/integration-test-fresh-fetch",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			const result = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "integration-fresh-fetch", id: "int-1" }
			);

			// ASSERT: origin was called despite valid cache
			expect(mockApiCallFunction).toHaveBeenCalled();
			// ASSERT: cache was updated (DynamoDB put called)
			expect(mockDynamoPut).toHaveBeenCalled();
			// ASSERT: returned data is fresh from origin
			expect(result.getBody()).toBe("fresh-data-from-origin");
			// ASSERT: status reflects forced update
			expect(result.getStatus()).toBe("original:cache-update-forced");
		});
	});

	describe("Requirement 7.2: End-to-end flow: forceRefresh with 304 preserves cached data", () => {
		it("should preserve cached body and extend expiration when origin returns 304", async () => {
			const now = Math.floor(Date.now() / 1000);

			// Mock DynamoDB with valid cache containing ETag
			const mockDynamoGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: "integration-hash-304",
					expires: now + 3600,
					data: {
						body: "cached-body-should-be-preserved",
						headers: {
							"content-type": "application/json",
							"etag": "\"existing-etag\"",
							"last-modified": "Wed, 21 Oct 2015 07:28:00 GMT"
						},
						statusCode: "200",
						info: {
							classification: "public",
							objInS3: false
						}
					}
				}
			});
			const mockDynamoPut = jest.fn().mockResolvedValue({});

			jest.spyOn(tools.default.AWS, "dynamo", "get").mockReturnValue({
				client: {},
				get: mockDynamoGet,
				put: mockDynamoPut,
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
			});

			jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
				get: jest.fn().mockResolvedValue({ Body: "" }),
				put: jest.fn().mockResolvedValue({}),
				sdk: {}
			});

			// Mock origin to return 304 Not Modified
			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 304,
				body: "",
				headers: {}
			});

			const connection = {
				host: "api.example.com",
				path: "/integration-test-304",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/integration-test-304",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			const result = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "integration-304", id: "int-2" }
			);

			// ASSERT: origin was called (forceRefresh triggered)
			expect(mockApiCallFunction).toHaveBeenCalled();
			// ASSERT: cached body preserved (not overwritten by 304 empty body)
			expect(result.getBody()).toBe("cached-body-should-be-preserved");
			// ASSERT: expiration extended (DynamoDB put called for update)
			expect(mockDynamoPut).toHaveBeenCalled();
			// ASSERT: status reflects not-modified
			expect(result.getStatus()).toBe("cache:original-not-modified");
		});
	});

	describe("Requirement 7.2: End-to-end flow: forceRefresh with origin failure falls back to stale cache", () => {
		it("should return stale cached data and extend expiration when origin fails", async () => {
			const now = Math.floor(Date.now() / 1000);

			// Mock DynamoDB with valid cache
			const mockDynamoGet = jest.fn().mockResolvedValue({
				Item: {
					id_hash: "integration-hash-error-fallback",
					expires: now + 3600,
					data: {
						body: "stale-cached-data-fallback",
						headers: {
							"content-type": "application/json"
						},
						statusCode: "200",
						info: {
							classification: "public",
							objInS3: false
						}
					}
				}
			});
			const mockDynamoPut = jest.fn().mockResolvedValue({});

			jest.spyOn(tools.default.AWS, "dynamo", "get").mockReturnValue({
				client: {},
				get: mockDynamoGet,
				put: mockDynamoPut,
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
			});

			jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
				get: jest.fn().mockResolvedValue({ Body: "" }),
				put: jest.fn().mockResolvedValue({}),
				sdk: {}
			});

			// Mock origin to fail
			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: false,
				statusCode: 500,
				body: "Internal Server Error",
				headers: {}
			});

			const connection = {
				host: "api.example.com",
				path: "/integration-test-error-fallback",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/integration-test-error-fallback",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			const result = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "integration-error-fallback", id: "int-3" }
			);

			// ASSERT: origin was called (forceRefresh triggered)
			expect(mockApiCallFunction).toHaveBeenCalled();
			// ASSERT: stale cached data returned as fallback
			expect(result.getBody()).toBe("stale-cached-data-fallback");
			// ASSERT: expiration extended (DynamoDB put called)
			expect(mockDynamoPut).toHaveBeenCalled();
		});
	});

	describe("Requirement 7.4: Cache.init() works without forceRefresh-related configuration", () => {
		it("should verify Cache.init() does not require forceRefresh configuration", () => {
			// Cache.init() was already called at the top of this file with standard parameters
			// (dynamoDbTable, s3Bucket, secureDataKey, idHashAlgorithm)
			// No forceRefresh-related configuration was needed.
			// This test explicitly verifies that the init succeeded without any forceRefresh config.

			// ASSERT: Cache is functional (can generate hashes)
			const testConnection = {
				host: "api.example.com",
				path: "/init-test"
			};
			const testPolicy = {
				hostId: "api.example.com",
				pathId: "/init-test"
			};

			// If Cache.init() required forceRefresh config, this would throw
			const hash = cache.Cache.generateIdHash({ connection: testConnection, cachePolicy: testPolicy });
			expect(hash).toBeDefined();
			expect(typeof hash).toBe("string");
			expect(hash.length).toBeGreaterThan(0);
		});
	});

	describe("Requirement 7.2: Sequential calls - first with forceRefresh, second without", () => {
		it("should fetch from origin on first call with forceRefresh, then use cache on second call without", async () => {
			const now = Math.floor(Date.now() / 1000);

			// Track call count to return different results for first vs second call
			let dynamoGetCallCount = 0;
			const mockDynamoGet = jest.fn().mockImplementation(() => {
				dynamoGetCallCount++;
				if (dynamoGetCallCount === 1) {
					// First call: return existing cache (will be bypassed by forceRefresh)
					return Promise.resolve({
						Item: {
							id_hash: "integration-hash-sequential",
							expires: now + 3600,
							data: {
								body: "old-cached-body-sequential",
								headers: {
									"content-type": "application/json"
								},
								statusCode: "200",
								info: {
									classification: "public",
									objInS3: false
								}
							}
						}
					});
				}
				// Second call: return the updated cache (written by first call)
				return Promise.resolve({
					Item: {
						id_hash: "integration-hash-sequential",
						expires: now + 300,
						data: {
							body: "fresh-data-from-first-call",
							headers: {
								"content-type": "application/json"
							},
							statusCode: "200",
							info: {
								classification: "public",
								objInS3: false
							}
						}
					}
				});
			});
			const mockDynamoPut = jest.fn().mockResolvedValue({});

			jest.spyOn(tools.default.AWS, "dynamo", "get").mockReturnValue({
				client: {},
				get: mockDynamoGet,
				put: mockDynamoPut,
				scan: jest.fn(),
				delete: jest.fn(),
				update: jest.fn(),
				sdk: {}
			});

			jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
				get: jest.fn().mockResolvedValue({ Body: "" }),
				put: jest.fn().mockResolvedValue({}),
				sdk: {}
			});

			// Mock origin - should only be called once (first call)
			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "fresh-data-from-first-call",
				headers: {
					"content-type": "application/json"
				}
			});

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/integration-test-sequential",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			// First call: with forceRefresh
			const connectionFirst = {
				host: "api.example.com",
				path: "/integration-test-sequential",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const resultFirst = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connectionFirst,
				null,
				{ path: "integration-sequential", id: "int-4a" }
			);

			// ASSERT: first call hits origin
			expect(mockApiCallFunction).toHaveBeenCalledTimes(1);
			expect(resultFirst.getBody()).toBe("fresh-data-from-first-call");

			// Second call: without forceRefresh (should use cached data)
			const connectionSecond = {
				host: "api.example.com",
				path: "/integration-test-sequential",
				headers: {},
				options: {}
			};

			const resultSecond = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connectionSecond,
				null,
				{ path: "integration-sequential", id: "int-4b" }
			);

			// ASSERT: second call does NOT hit origin (uses cache)
			expect(mockApiCallFunction).toHaveBeenCalledTimes(1);
			// ASSERT: second call returns cached data
			expect(resultSecond.getBody()).toBe("fresh-data-from-first-call");
		});
	});
});
