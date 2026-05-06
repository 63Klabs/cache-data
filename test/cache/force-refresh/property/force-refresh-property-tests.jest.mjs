/**
 * Property-based tests for CacheableDataAccess forceRefresh option
 * Uses fast-check to validate universal correctness properties
 *
 * Property 1: Force refresh always fetches from origin
 * Validates: Requirements 1.1
 */

// Feature: force-refresh-option, Property 1: Force refresh always fetches from origin

import { jest } from "@jest/globals";
import fc from "fast-check";
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

const { CacheableDataAccess, TestHarness } = cache;
const { CacheData } = TestHarness.getInternals();

describe("CacheableDataAccess - Force Refresh Property Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Property 1: Force refresh always fetches from origin", () => {
		// Feature: force-refresh-option, Property 1: Force refresh always fetches from origin
		// **Validates: Requirements 1.1**
		it("should always invoke apiCallFunction when forceRefresh is true, regardless of cache state", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random cache states: expired, valid, or empty
					fc.oneof(
						// Valid (non-expired) cache
						fc.record({
							type: fc.constant("valid"),
							body: fc.string({ minLength: 1, maxLength: 200 }),
							statusCode: fc.constantFrom("200", "201", "202"),
							etag: fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: undefined }),
							lastModified: fc.option(fc.constant("Wed, 21 Oct 2015 07:28:00 GMT"), { nil: undefined })
						}),
						// Expired cache
						fc.record({
							type: fc.constant("expired"),
							body: fc.string({ minLength: 1, maxLength: 200 }),
							statusCode: fc.constantFrom("200", "201", "202"),
							etag: fc.option(fc.string({ minLength: 3, maxLength: 30 }), { nil: undefined }),
							lastModified: fc.option(fc.constant("Mon, 01 Jan 2024 00:00:00 GMT"), { nil: undefined })
						}),
						// Empty cache (no item)
						fc.record({
							type: fc.constant("empty")
						})
					),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate random origin response body
					fc.string({ minLength: 1, maxLength: 100 }),
					async (cacheState, pathSegment, originBody) => {
						// Setup DynamoDB mock based on cache state
						const now = Math.floor(Date.now() / 1000);
						let mockGetResult;

						if (cacheState.type === "empty") {
							mockGetResult = {}; // No Item property
						} else {
							const expires = cacheState.type === "valid"
								? now + 3600 // Valid: expires in 1 hour
								: now - 3600; // Expired: expired 1 hour ago

							mockGetResult = {
								Item: {
									id_hash: `test-hash-${pathSegment}`,
									expires: expires,
									data: {
										body: cacheState.body,
										headers: {
											"content-type": "application/json",
											...(cacheState.etag ? { "etag": cacheState.etag } : {}),
											...(cacheState.lastModified ? { "last-modified": cacheState.lastModified } : {})
										},
										statusCode: cacheState.statusCode,
										info: {
											classification: "public",
											objInS3: false
										}
									}
								}
							};
						}

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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Create mock apiCallFunction that tracks invocations
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: 200,
							body: originBody,
							headers: {
								"content-type": "application/json",
								"etag": "\"new-etag-value\""
							}
						});

						// Connection with forceRefresh: true
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop1-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop1-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true
						await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop1-${pathSegment}`, id: "pbt-1" }
						);

						// ASSERT: apiCallFunction must ALWAYS be invoked when forceRefresh is true
						expect(mockApiCallFunction).toHaveBeenCalled();

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 4: Forced refresh writes to cache with STATUS_FORCED
	describe("Property 4: Forced refresh writes to cache with STATUS_FORCED", () => {
		// **Validates: Requirements 2.1, 2.3, 6.1**
		it("should set cache status to STATUS_FORCED when forceRefresh is true and cache is valid", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate random origin response body
					fc.string({ minLength: 1, maxLength: 200 }),
					// Generate random origin status code (non-304 success)
					fc.constantFrom(200, 201, 202),
					// Generate random cached body content
					fc.string({ minLength: 1, maxLength: 200 }),
					async (pathSegment, originBody, originStatusCode, cachedBody) => {
						// Setup DynamoDB mock with VALID (non-expired) cache
						const now = Math.floor(Date.now() / 1000);
						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop4-${pathSegment}`,
								expires: now + 3600, // Valid: expires in 1 hour
								data: {
									body: cachedBody,
									headers: {
										"content-type": "application/json",
										"etag": "\"existing-etag\""
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Mock apiCallFunction to return successful non-304 response
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: originStatusCode,
							body: originBody,
							headers: {
								"content-type": "application/json",
								"etag": "\"new-etag-value\""
							}
						});

						// Connection with forceRefresh: true
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop4-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop4-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true
						const result = await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop4-${pathSegment}`, id: "pbt-4" }
						);

						// ASSERT: cache status must be STATUS_FORCED ("original:cache-update-forced")
						expect(result.getStatus()).toBe("original:cache-update-forced");

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 2: Absence of forceRefresh preserves cache-first behavior
	describe("Property 2: Absence of forceRefresh preserves cache-first behavior", () => {
		// **Validates: Requirements 1.2, 1.3, 6.3, 7.2**
		it("should NOT invoke apiCallFunction when forceRefresh is absent/falsy and cache is valid", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate forceRefresh values that should NOT trigger forced refresh
					fc.constantFrom(false, undefined, null, 0),
					// Generate whether options property is present at all
					fc.boolean(),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate random cached body content
					fc.string({ minLength: 1, maxLength: 200 }),
					async (forceRefreshValue, includeOptions, pathSegment, cachedBody) => {
						// Setup DynamoDB mock with VALID (non-expired) cache
						const now = Math.floor(Date.now() / 1000);
						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop2-${pathSegment}`,
								expires: now + 3600, // Valid: expires in 1 hour
								data: {
									body: cachedBody,
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Create mock apiCallFunction that tracks invocations
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: 200,
							body: "should-not-be-called",
							headers: { "content-type": "application/json" }
						});

						// Build connection object based on generated values
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop2-${pathSegment}`,
							headers: {}
						};

						if (includeOptions) {
							// Include options with the generated forceRefresh value
							connection.options = { forceRefresh: forceRefreshValue };
						}
						// When includeOptions is false, options property is completely absent

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop2-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData without forceRefresh (or with falsy value)
						await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop2-${pathSegment}`, id: "pbt-2" }
						);

						// ASSERT: apiCallFunction must NOT be invoked when cache is valid and forceRefresh is not true
						expect(mockApiCallFunction).not.toHaveBeenCalled();

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 3: Cache hash stability under forceRefresh variation
	describe("Property 3: Cache hash stability under forceRefresh variation", () => {
		// **Validates: Requirements 4.1, 4.2, 4.3**
		it("should generate identical hashes regardless of forceRefresh value in connection.options", () => {
			fc.assert(
				fc.property(
					// Generate random host
					fc.string({ minLength: 3, maxLength: 30, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9.-]+$/.test(s)),
					// Generate random path
					fc.string({ minLength: 1, maxLength: 50, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9/._-]+$/.test(s)).map(s => `/${s}`),
					// Generate random headers (key-value pairs)
					fc.dictionary(
						fc.string({ minLength: 1, maxLength: 15, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
						fc.string({ minLength: 1, maxLength: 30 }),
						{ minKeys: 0, maxKeys: 5 }
					),
					// Generate random data (can be null, string, or object)
					fc.oneof(
						fc.constant(null),
						fc.string({ minLength: 0, maxLength: 100 }),
						fc.dictionary(
							fc.string({ minLength: 1, maxLength: 10, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z]+$/.test(s)),
							fc.string({ minLength: 0, maxLength: 50 }),
							{ minKeys: 0, maxKeys: 5 }
						)
					),
					// Generate random cachePolicy fields
					fc.string({ minLength: 3, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9.-]+$/.test(s)),
					fc.string({ minLength: 1, maxLength: 30, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9/._-]+$/.test(s)),
					(host, path, headers, data, hostId, pathId) => {
						// Build the cachePolicy
						const cachePolicy = {
							hostId: hostId,
							pathId: pathId,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// 1. Hash with forceRefresh: true
						const idToHashWithTrue = {
							data: data,
							connection: { host, path, headers: { ...headers }, options: { forceRefresh: true } },
							cachePolicy: cachePolicy
						};
						const hashWithTrue = cache.Cache.generateIdHash(idToHashWithTrue);

						// 2. Hash with forceRefresh: false
						const idToHashWithFalse = {
							data: data,
							connection: { host, path, headers: { ...headers }, options: { forceRefresh: false } },
							cachePolicy: cachePolicy
						};
						const hashWithFalse = cache.Cache.generateIdHash(idToHashWithFalse);

						// 3. Hash with forceRefresh: undefined
						const idToHashWithUndefined = {
							data: data,
							connection: { host, path, headers: { ...headers }, options: { forceRefresh: undefined } },
							cachePolicy: cachePolicy
						};
						const hashWithUndefined = cache.Cache.generateIdHash(idToHashWithUndefined);

						// 4. Hash without options property
						const idToHashWithoutOptions = {
							data: data,
							connection: { host, path, headers: { ...headers } },
							cachePolicy: cachePolicy
						};
						const hashWithoutOptions = cache.Cache.generateIdHash(idToHashWithoutOptions);

						// ASSERT: All four hashes are identical
						expect(hashWithTrue).toBe(hashWithFalse);
						expect(hashWithTrue).toBe(hashWithUndefined);
						expect(hashWithTrue).toBe(hashWithoutOptions);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 5: Conditional headers sent during forced refresh
	describe("Property 5: Conditional headers sent during forced refresh", () => {
		// **Validates: Requirements 5.1, 5.2**
		it("should include if-none-match and/or if-modified-since headers when forceRefresh is true and cache has ETag/Last-Modified", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random ETag values (with quotes, as ETags typically have quotes)
					fc.string({ minLength: 3, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)).map(s => `"etag-value-${s}"`),
					// Generate Last-Modified date strings
					fc.constantFrom(
						"Wed, 21 Oct 2015 07:28:00 GMT",
						"Mon, 01 Jan 2024 00:00:00 GMT",
						"Fri, 15 Mar 2024 12:30:00 GMT",
						"Tue, 10 Sep 2019 14:45:00 GMT",
						"Sun, 25 Dec 2022 08:00:00 GMT"
					),
					// Generate whether cache is valid or expired
					fc.boolean(),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate random cached body content
					fc.string({ minLength: 1, maxLength: 200 }),
					async (etag, lastModified, isCacheValid, pathSegment, cachedBody) => {
						// Setup DynamoDB mock with cache containing ETag and Last-Modified
						const now = Math.floor(Date.now() / 1000);
						const expires = isCacheValid
							? now + 3600 // Valid: expires in 1 hour
							: now - 3600; // Expired: expired 1 hour ago

						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop5-${pathSegment}`,
								expires: expires,
								data: {
									body: cachedBody,
									headers: {
										"content-type": "application/json",
										"etag": etag,
										"last-modified": lastModified
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Create mock apiCallFunction that tracks invocations
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: 200,
							body: "fresh-data",
							headers: {
								"content-type": "application/json",
								"etag": "\"new-etag\""
							}
						});

						// Connection with forceRefresh: true
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop5-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop5-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true
						await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop5-${pathSegment}`, id: "pbt-5" }
						);

						// ASSERT: apiCallFunction must have been called
						expect(mockApiCallFunction).toHaveBeenCalled();

						// Capture the connection object passed to apiCallFunction
						const passedConnection = mockApiCallFunction.mock.calls[0][0];

						// ASSERT: if-none-match header matches the cached ETag
						expect(passedConnection.headers["if-none-match"]).toBe(etag);

						// ASSERT: if-modified-since header matches the cached Last-Modified
						expect(passedConnection.headers["if-modified-since"]).toBe(lastModified);

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 6: 304 during forced refresh extends expiration without overwriting body
	describe("Property 6: 304 during forced refresh extends expiration without overwriting body", () => {
		// **Validates: Requirements 5.3**
		it("should preserve cached body and extend expiration when origin returns 304 during forced refresh", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random cached body content
					fc.string({ minLength: 1, maxLength: 200 }),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate random ETag values
					fc.string({ minLength: 3, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)).map(s => `"etag-${s}"`),
					// Generate random expiration offset (valid cache, expires in future)
					fc.integer({ min: 60, max: 7200 }),
					async (cachedBody, pathSegment, etag, expiresOffset) => {
						// Setup DynamoDB mock with valid cache containing body and expiration
						const now = Math.floor(Date.now() / 1000);
						const originalExpires = now + expiresOffset;

						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop6-${pathSegment}`,
								expires: originalExpires,
								data: {
									body: cachedBody,
									headers: {
										"content-type": "application/json",
										"etag": etag,
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Mock apiCallFunction to return 304 Not Modified
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: 304,
							body: "",
							headers: {}
						});

						// Connection with forceRefresh: true
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop6-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop6-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true
						const result = await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop6-${pathSegment}`, id: "pbt-6" }
						);

						// ASSERT: The cached body remains unchanged (not overwritten by 304 empty body)
						expect(result.getBody()).toBe(cachedBody);

						// ASSERT: DynamoDB put was called to extend expiration
						expect(mockDynamoPut).toHaveBeenCalled();

						// ASSERT: The new expiration is in the future (extended from current time)
						const putCall = mockDynamoPut.mock.calls[0][0];
						const nowAfterCall = Math.floor(Date.now() / 1000);
						expect(putCall.Item.expires).toBeGreaterThan(nowAfterCall);

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 7: Error fallback returns stale cached data
	describe("Property 7: Error fallback returns stale cached data", () => {
		// **Validates: Requirements 3.1, 3.2**
		it("should return stale cached data and extend expiration when origin fails during forced refresh", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random cached body content (stale data)
					fc.string({ minLength: 1, maxLength: 200 }),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					// Generate various error status codes
					fc.constantFrom(500, 502, 503, 504, 408, 429),
					// Generate whether cache is valid or expired (both should work as fallback)
					fc.boolean(),
					// Generate random expiration offset
					fc.integer({ min: 60, max: 7200 }),
					async (cachedBody, pathSegment, errorStatusCode, isCacheValid, expiresOffset) => {
						// Setup DynamoDB mock with cache data (can be valid or expired)
						const now = Math.floor(Date.now() / 1000);
						const expires = isCacheValid
							? now + expiresOffset // Valid: expires in future
							: now - expiresOffset; // Expired: expired in past

						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop7-${pathSegment}`,
								expires: expires,
								data: {
									body: cachedBody,
									headers: {
										"content-type": "application/json",
										"etag": "\"some-etag-value\""
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Mock apiCallFunction to return a FAILED response
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: false,
							statusCode: errorStatusCode,
							body: "error",
							headers: {}
						});

						// Connection with forceRefresh: true
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop7-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop7-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true
						const result = await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop7-${pathSegment}`, id: "pbt-7" }
						);

						// ASSERT: The returned cache object's body matches the original stale cached body
						expect(result.getBody()).toBe(cachedBody);

						// ASSERT: DynamoDB put was called (expiration extended)
						expect(mockDynamoPut).toHaveBeenCalled();

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// Feature: force-refresh-option, Property 8: Other connection options are not affected by forceRefresh
	describe("Property 8: Other connection options are not affected by forceRefresh", () => {
		// **Validates: Requirements 7.3**
		it("should preserve all other connection options and pass them unchanged to apiCallFunction", async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random timeout values (integers between 1000-30000)
					fc.integer({ min: 1000, max: 30000 }),
					// Generate random maxRetries values
					fc.integer({ min: 0, max: 10 }),
					// Generate random retry boolean
					fc.boolean(),
					// Generate random pagination object
					fc.record({
						page: fc.integer({ min: 1, max: 100 }),
						pageSize: fc.integer({ min: 10, max: 500 })
					}),
					// Generate random connection path segments for uniqueness
					fc.string({ minLength: 1, maxLength: 20, unit: "grapheme-ascii" }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
					async (timeout, maxRetries, retry, pagination, pathSegment) => {
						// Setup DynamoDB mock with expired cache so apiCallFunction is always called
						const now = Math.floor(Date.now() / 1000);
						const mockGetResult = {
							Item: {
								id_hash: `test-hash-prop8-${pathSegment}`,
								expires: now - 3600, // Expired: expired 1 hour ago
								data: {
									body: "cached-body",
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

						// Mock S3 in case large objects are involved
						jest.spyOn(tools.default.AWS, "s3", "get").mockReturnValue({
							get: jest.fn().mockResolvedValue({ Body: "" }),
							put: jest.fn().mockResolvedValue({}),
							sdk: {}
						});

						// Mock apiCallFunction to return successful response
						const mockApiCallFunction = jest.fn().mockResolvedValue({
							success: true,
							statusCode: 200,
							body: "fresh-data",
							headers: {
								"content-type": "application/json",
								"etag": "\"new-etag\""
							}
						});

						// Connection with forceRefresh: true AND other options
						const connection = {
							host: "api.example.com",
							path: `/force-refresh-prop8-${pathSegment}`,
							headers: {},
							options: {
								forceRefresh: true,
								timeout: timeout,
								maxRetries: maxRetries,
								retry: retry,
								pagination: pagination
							}
						};

						const cachePolicy = {
							hostId: "api.example.com",
							pathId: `/force-refresh-prop8-${pathSegment}`,
							profile: "default",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: "",
							hostEncryption: "public"
						};

						// Execute getData with forceRefresh: true and other options
						await CacheableDataAccess.getData(
							cachePolicy,
							mockApiCallFunction,
							connection,
							null,
							{ path: `force-refresh-prop8-${pathSegment}`, id: "pbt-8" }
						);

						// ASSERT: apiCallFunction was called
						expect(mockApiCallFunction).toHaveBeenCalled();

						// Capture the connection object passed to apiCallFunction
						const passedConnection = mockApiCallFunction.mock.calls[0][0];

						// ASSERT: Other options are preserved unchanged
						expect(passedConnection.options.timeout).toBe(timeout);
						expect(passedConnection.options.maxRetries).toBe(maxRetries);
						expect(passedConnection.options.retry).toBe(retry);
						expect(passedConnection.options.pagination).toEqual(pagination);

						// ASSERT: forceRefresh is also still present (not stripped)
						expect(passedConnection.options.forceRefresh).toBe(true);

						// Cleanup mocks for next iteration
						jest.restoreAllMocks();
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
