/**
 * Property-based tests for Cache.getHeader() valid header passthrough
 * Uses fast-check to validate that valid values are returned without modification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import { randomBytes } from "crypto";
import daoCache from '../../src/lib/dao-cache.js';
const { Cache, TestHarness } = daoCache;
const { CacheData } = TestHarness.getInternals();

describe('Cache.getHeader() - Valid Header Passthrough Property Tests', () => {
	
	// Setup cache initialization for tests
	const testKey = randomBytes(32).toString('hex');
	const dataKey = Buffer.from(testKey, 'hex');
	
	const cacheInit = {
		dynamoDbTable: "test-table",
		s3Bucket: "test-bucket",
		secureDataAlgorithm: "aes-256-cbc",
		secureDataKey: dataKey,
		DynamoDbMaxCacheSize_kb: 10,
		purgeExpiredCacheEntriesAfterXHours: 24,
		timeZoneForInterval: "UTC"
	};
	
	// Initialize cache once
	Cache.init(cacheInit);
	
	describe('Property 4: Valid Header Passthrough', () => {
		// Feature: cache-dao-fix, Property 4: Valid Header Passthrough
		// Validates: Requirements 2.4
		it('should return exact value without modification for valid header values', async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate random header keys (non-empty, non-whitespace-only strings)
					fc.array(
						fc.string({ minLength: 1, maxLength: 20 })
							.filter(s => s.trim().length > 0), // Ensure non-whitespace-only keys
						{ minLength: 1, maxLength: 10 }
					),
					// Generate only VALID header values (non-empty strings and numbers)
					fc.array(
						fc.oneof(
							fc.string({ minLength: 1, maxLength: 100 })
								.filter(s => s.trim().length > 0), // Ensure non-empty strings
							fc.integer(),
							fc.double({ noNaN: true })
						),
						{ minLength: 1, maxLength: 10 }
					),
					async (keys, values) => {
						// Create headers object with valid values only
						// Normalize keys to lowercase to match Cache behavior
						const headers = {};
						keys.forEach((key, index) => {
							headers[key.toLowerCase()] = values[index % values.length];
						});
						
						// Create a minimal connection and cache profile
						const connection = {
							name: 'test',
							host: 'test.example.com',
							path: '/test',
							parameters: {},
							headers: {},
							options: {}
						};
						
						const cacheProfile = {
							profile: "test",
							overrideOriginHeaderExpiration: false,
							defaultExpirationInSeconds: 300,
							expirationIsOnInterval: false,
							headersToRetain: [],
							hostId: "test.example.com",
							pathId: "test",
							encrypt: false
						};
						
						// Create cache instance
						const cache = new Cache(connection, cacheProfile);
						
						// Mock CacheData.read to return our test headers
						const originalRead = CacheData.read;
						CacheData.read = async () => {
							return {
								cache: {
									body: "test",
									headers: headers,
									expires: Math.floor(Date.now() / 1000) + 300,
									statusCode: "200"
								}
							};
						};
						
						try {
							// Read the cache to populate the internal store
							await cache.read();
							
							// Test each header key (use lowercase for lookup)
							keys.forEach(key => {
								const normalizedKey = key.toLowerCase();
								const originalValue = headers[normalizedKey];
								const result = cache.getHeader(normalizedKey);
								
								// CRITICAL: getHeader() must return the exact value without modification
								assert.strictEqual(
									result,
									originalValue,
									`getHeader('${normalizedKey}') should return exact value ${originalValue}, but returned ${result}`
								);
								
								// Verify the value is not null or undefined
								assert.notStrictEqual(
									result,
									null,
									`getHeader('${normalizedKey}') should not return null for valid value ${originalValue}`
								);
								
								assert.notStrictEqual(
									result,
									undefined,
									`getHeader('${normalizedKey}') should not return undefined for valid value ${originalValue}`
								);
							});
						} finally {
							// Restore original method
							CacheData.read = originalRead;
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
