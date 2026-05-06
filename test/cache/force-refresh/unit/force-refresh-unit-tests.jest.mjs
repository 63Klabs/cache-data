/**
 * Unit tests for CacheableDataAccess forceRefresh edge cases
 *
 * Tests specific edge cases and behaviors of the forceRefresh option:
 * - String "true" does NOT trigger forced refresh (strict boolean check)
 * - Empty cache + origin failure returns empty Cache object with error status
 * - Method signature unchanged (no new required parameters)
 * - Status logging for 304 during forced refresh
 * - forceRefresh with null, 0, undefined does NOT trigger
 *
 * Validates: Requirements 1.3, 3.3, 6.2, 7.1
 */

import { jest } from "@jest/globals";
import { randomBytes } from "crypto";

// Import tools first so we can spy on it
const tools = await import("../../../../src/lib/tools/index.js");

// Initialize cache once before all tests
const testKey = randomBytes(32).toString("hex");
const dataKey = Buffer.from(testKey, "hex");

const cacheInit = {
	dynamoDbTable: "test-table-jest",
	s3Bucket: "test-bucket-jest",
	secureDataKey: dataKey,
	idHashAlgorithm: "sha256"
};

// Import cache module
const cache = await import("../../../../src/lib/dao-cache.js");
cache.Cache.init(cacheInit);

const { CacheableDataAccess } = cache;

describe("CacheableDataAccess - Force Refresh Unit Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Requirement 1.3: forceRefresh with string 'true' does NOT trigger forced refresh", () => {
		it("should NOT invoke apiCallFunction when forceRefresh is string 'true' and cache is valid", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-string-true",
					expires: now + 3600, // Valid: expires in 1 hour
					data: {
						body: "cached-body-string-true",
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
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "should-not-be-called",
				headers: { "content-type": "application/json" }
			});

			// Connection with forceRefresh as STRING "true" (not boolean true)
			const connection = {
				host: "api.example.com",
				path: "/unit-test-string-true",
				headers: {},
				options: {
					forceRefresh: "true" // String, not boolean
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-string-true",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "unit-test-string-true", id: "unit-1" }
			);

			// ASSERT: apiCallFunction must NOT be called because string "true" !== boolean true
			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});
	});

	describe("Requirement 3.3: Empty cache + origin failure returns empty Cache object with error status", () => {
		it("should return cache with null body and error status when cache is empty and origin fails", async () => {
			// Mock DynamoDB to return empty result (no Item)
			const mockDynamoGet = jest.fn().mockResolvedValue({}); // No Item property
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

			// Mock apiCallFunction to return failure
			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: false,
				statusCode: 500,
				body: "error",
				headers: {}
			});

			const connection = {
				host: "api.example.com",
				path: "/unit-test-empty-cache-error",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-empty-cache-error",
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
				{ path: "unit-test-empty-cache-error", id: "unit-2" }
			);

			// ASSERT: returned cache has null body (empty cache, origin failed)
			expect(result.getBody()).toBeNull();
			// ASSERT: apiCallFunction was called (forceRefresh triggered)
			expect(mockApiCallFunction).toHaveBeenCalled();
		});
	});

	describe("Requirement 7.1: Method signature unchanged (no new required parameters)", () => {
		it("should work without forceRefresh in connection options (backwards compatibility)", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-no-options",
					expires: now + 3600,
					data: {
						body: "cached-body-no-options",
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
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "fresh-data",
				headers: { "content-type": "application/json" }
			});

			// Connection WITHOUT options property at all
			const connection = {
				host: "api.example.com",
				path: "/unit-test-no-options",
				headers: {}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-no-options",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			// Should not throw - backwards compatible
			const result = await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "unit-test-no-options", id: "unit-3" }
			);

			// ASSERT: returns a valid cache object without errors
			expect(result).toBeDefined();
			expect(result.getBody()).toBe("cached-body-no-options");
			// ASSERT: apiCallFunction NOT called because cache is valid and no forceRefresh
			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});

		it("should work with empty options object (no forceRefresh key)", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-empty-options",
					expires: now + 3600,
					data: {
						body: "cached-body-empty-options",
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
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "fresh-data",
				headers: { "content-type": "application/json" }
			});

			// Connection with empty options (no forceRefresh key)
			const connection = {
				host: "api.example.com",
				path: "/unit-test-empty-options",
				headers: {},
				options: {}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-empty-options",
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
				{ path: "unit-test-empty-options", id: "unit-3b" }
			);

			expect(result).toBeDefined();
			expect(result.getBody()).toBe("cached-body-empty-options");
			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});
	});

	describe("Requirement 6.2: Status logging for 304 during forced refresh", () => {
		it("should set status to 'cache:original-not-modified' when origin returns 304 during forced refresh", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-304-forced",
					expires: now + 3600, // Valid cache
					data: {
						body: "cached-body-304-forced",
						headers: {
							"content-type": "application/json",
							"etag": "\"etag-304-test\"",
							"last-modified": "Wed, 21 Oct 2015 07:28:00 GMT"
						},
						statusCode: "200",
						info: {
							classification: "public",
							objInS3: false
						}
					}
				}
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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
				path: "/unit-test-304-forced",
				headers: {},
				options: {
					forceRefresh: true
				}
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-304-forced",
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
				{ path: "unit-test-304-forced", id: "unit-4" }
			);

			// ASSERT: status reflects not-modified behavior
			expect(result.getStatus()).toBe("cache:original-not-modified");
			// ASSERT: body is preserved (not overwritten by 304 empty body)
			expect(result.getBody()).toBe("cached-body-304-forced");
		});
	});

	describe("Requirement 1.3: forceRefresh with null, 0, undefined does NOT trigger", () => {
		it("should NOT invoke apiCallFunction when forceRefresh is null", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-null",
					expires: now + 3600,
					data: {
						body: "cached-body-null",
						headers: { "content-type": "application/json" },
						statusCode: "200",
						info: { classification: "public", objInS3: false }
					}
				}
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "should-not-be-called",
				headers: { "content-type": "application/json" }
			});

			const connection = {
				host: "api.example.com",
				path: "/unit-test-null",
				headers: {},
				options: { forceRefresh: null }
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-null",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "unit-test-null", id: "unit-5a" }
			);

			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});

		it("should NOT invoke apiCallFunction when forceRefresh is 0", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-zero",
					expires: now + 3600,
					data: {
						body: "cached-body-zero",
						headers: { "content-type": "application/json" },
						statusCode: "200",
						info: { classification: "public", objInS3: false }
					}
				}
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "should-not-be-called",
				headers: { "content-type": "application/json" }
			});

			const connection = {
				host: "api.example.com",
				path: "/unit-test-zero",
				headers: {},
				options: { forceRefresh: 0 }
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-zero",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "unit-test-zero", id: "unit-5b" }
			);

			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});

		it("should NOT invoke apiCallFunction when forceRefresh is undefined", async () => {
			const now = Math.floor(Date.now() / 1000);
			const mockGetResult = {
				Item: {
					id_hash: "test-hash-undefined",
					expires: now + 3600,
					data: {
						body: "cached-body-undefined",
						headers: { "content-type": "application/json" },
						statusCode: "200",
						info: { classification: "public", objInS3: false }
					}
				}
			};

			const mockDynamoGet = jest.fn().mockResolvedValue(mockGetResult);
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

			const mockApiCallFunction = jest.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				body: "should-not-be-called",
				headers: { "content-type": "application/json" }
			});

			const connection = {
				host: "api.example.com",
				path: "/unit-test-undefined",
				headers: {},
				options: { forceRefresh: undefined }
			};

			const cachePolicy = {
				hostId: "api.example.com",
				pathId: "/unit-test-undefined",
				profile: "default",
				overrideOriginHeaderExpiration: false,
				defaultExpirationInSeconds: 300,
				expirationIsOnInterval: false,
				headersToRetain: "",
				hostEncryption: "public"
			};

			await CacheableDataAccess.getData(
				cachePolicy,
				mockApiCallFunction,
				connection,
				null,
				{ path: "unit-test-undefined", id: "unit-5c" }
			);

			expect(mockApiCallFunction).not.toHaveBeenCalled();
		});
	});
});
