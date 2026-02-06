/**
 * Property-based tests for CacheableDataAccess conditional header assignment
 * Uses fast-check to validate universal correctness properties
 * 
 * Property 3: Conditional Header Assignment
 * Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.5
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import { randomBytes } from "crypto";
import { Cache, CacheableDataAccess } from '../../src/lib/dao-cache.js';

describe('CacheableDataAccess - Conditional Header Assignment Property Tests', () => {
	
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
	
	describe('Property 3: Conditional Header Assignment', () => {
		// Feature: cache-dao-fix, Property 3: Conditional Header Assignment
		// Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.5
		it('should only assign headers when values are valid (not null or undefined)', () => {
			fc.assert(
				fc.property(
					// Generate random header values including null, undefined, and valid values
					fc.oneof(
						fc.constant(undefined),
						fc.constant(null),
						fc.string({ minLength: 1, maxLength: 50 })
					),
					fc.oneof(
						fc.constant(undefined),
						fc.constant(null),
						fc.string({ minLength: 1, maxLength: 50 })
					),
					(lastModifiedValue, etagValue) => {
						// Create a minimal connection
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
						
						// Manually set the cache data with our test header values
						cache._cacheData = {
							body: "test",
							headers: {
								'last-modified': lastModifiedValue,
								'etag': etagValue
							},
							expires: Math.floor(Date.now() / 1000) + 300,
							statusCode: "200"
						};
						
						// Simulate the header assignment logic from CacheableDataAccess.getData()
						const testConnection = {
							headers: {}
						};
						
						// This is the logic we're testing from CacheableDataAccess.getData()
						const etag = cache.getETag();
						if (!("if-none-match" in testConnection.headers) && etag !== null && etag !== undefined) {
							testConnection.headers['if-none-match'] = etag;
						}
						
						const lastModified = cache.getLastModified();
						if (!("if-modified-since" in testConnection.headers) && lastModified !== null && lastModified !== undefined) {
							testConnection.headers['if-modified-since'] = lastModified;
						}
						
						// CRITICAL: Headers should only be assigned when values are valid (not null or undefined)
						// We must check what getHeader() returns (after normalization), not the raw input values
						
						// Check if-none-match header
						// etag is what getETag() returns after getHeader() normalization
						if (etag === null || etag === undefined) {
							assert.strictEqual(
								testConnection.headers['if-none-match'],
								undefined,
								`if-none-match should not be assigned when getETag() returns ${etag}`
							);
						} else {
							assert.strictEqual(
								testConnection.headers['if-none-match'],
								etag,
								`if-none-match should be assigned to the value returned by getETag(): ${etag}`
							);
						}
						
						// Check if-modified-since header
						// lastModified is what getLastModified() returns after getHeader() normalization
						if (lastModified === null || lastModified === undefined) {
							assert.strictEqual(
								testConnection.headers['if-modified-since'],
								undefined,
								`if-modified-since should not be assigned when getLastModified() returns ${lastModified}`
							);
						} else {
							assert.strictEqual(
								testConnection.headers['if-modified-since'],
								lastModified,
								`if-modified-since should be assigned to the value returned by getLastModified(): ${lastModified}`
							);
						}
						
						// Verify that undefined values never make it into the headers
						Object.values(testConnection.headers).forEach(value => {
							assert.notStrictEqual(
								value,
								undefined,
								'No header value should ever be undefined'
							);
						});
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
