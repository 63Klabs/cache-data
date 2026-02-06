/**
 * Property-based tests for Cache.getHeader() undefined normalization
 * Uses fast-check to validate universal correctness properties
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import { randomBytes } from "crypto";
import { Cache } from '../../src/lib/dao-cache.js';

describe('Cache.getHeader() - Property-Based Tests', () => {
	
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
	
	describe('Property 1: getHeader Undefined Normalization', () => {
		// Feature: cache-dao-fix, Property 1: getHeader Undefined Normalization
		// Validates: Requirements 1.3, 2.2, 2.5
		it('should never return undefined - always return null for undefined header values', () => {
			fc.assert(
				fc.property(
					// Generate random header keys
					fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
					// Generate random header values including undefined
					fc.array(
						fc.oneof(
							fc.constant(undefined),
							fc.constant(null),
							fc.string(),
							fc.integer()
						),
						{ minLength: 1, maxLength: 10 }
					),
					(keys, values) => {
						// Create headers object with some undefined values
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
						
						// Manually set the cache data with our test headers
						cache._cacheData = {
							body: "test",
							headers: headers,
							expires: Math.floor(Date.now() / 1000) + 300,
							statusCode: "200"
						};
						
						// Test each header key
						keys.forEach(key => {
							const result = cache.getHeader(key.toLowerCase());
							
							// CRITICAL: getHeader() must NEVER return undefined
							assert.notStrictEqual(
								result,
								undefined,
								`getHeader('${key}') returned undefined, but should return null`
							);
							
							// If the original value was undefined, result must be null
							if (headers[key.toLowerCase()] === undefined) {
								assert.strictEqual(
									result,
									null,
									`getHeader('${key}') should return null when header value is undefined`
								);
							}
						});
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
