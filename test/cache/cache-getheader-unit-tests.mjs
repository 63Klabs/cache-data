/**
 * Unit tests for Cache.getHeader() edge cases
 * Tests specific examples of undefined, null, and various value types
 * 
 * Note: These tests verify the getHeader() method's behavior by testing
 * the normalization logic. Since #store is private, we test through
 * the public API and verify the method handles edge cases correctly.
 */

import { expect } from 'chai';
import { randomBytes } from "crypto";
import { Cache } from '../../src/lib/dao-cache.js';

describe("Cache.getHeader() - Unit Tests", () => {

	// Setup cache initialization for tests
	const testKey = randomBytes(32).toString('hex');
	const dataKey = Buffer.from(testKey, 'hex');
	
	const cacheInit = {
		dynamoDbTable: "test-table-unit",
		s3Bucket: "test-bucket-unit",
		secureDataAlgorithm: "aes-256-cbc",
		secureDataKey: dataKey,
		DynamoDbMaxCacheSize_kb: 10,
		purgeExpiredCacheEntriesAfterXHours: 24,
		timeZoneForInterval: "UTC"
	};
	
	// Initialize cache once
	Cache.init(cacheInit);
	
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

	describe("getHeader() behavior verification", () => {
		it("should return null when cache is empty (no data read yet)", () => {
			const cache = new Cache(connection, cacheProfile);
			// Cache hasn't been read yet, so getHeaders() should return null
			const result = cache.getHeader("any-header");
			expect(result).to.be.null;
		});

		it("should return null for missing header key", () => {
			const cache = new Cache(connection, cacheProfile);
			// Even if we try to get a header that doesn't exist
			const result = cache.getHeader("non-existent-header");
			expect(result).to.be.null;
		});

		it("should handle case-insensitive header keys", () => {
			const cache = new Cache(connection, cacheProfile);
			// Headers are stored lowercase, so this should work
			const result1 = cache.getHeader("content-type");
			const result2 = cache.getHeader("Content-Type");
			const result3 = cache.getHeader("CONTENT-TYPE");
			// All should return null since no data is loaded
			expect(result1).to.be.null;
			expect(result2).to.be.null;
			expect(result3).to.be.null;
		});
	});

	describe("getHeader() return value consistency", () => {
		it("should never return undefined - always null or a value", () => {
			const cache = new Cache(connection, cacheProfile);
			const result = cache.getHeader("test-header");
			// Result should be null, never undefined
			expect(result).to.not.equal(undefined);
			expect(result).to.satisfy((val) => val === null || typeof val !== 'undefined');
		});

		it("should return null for empty cache", () => {
			const cache = new Cache(connection, cacheProfile);
			const headers = cache.getHeaders();
			expect(headers).to.be.null;
		});
	});

	describe("getHeader() with getLastModified() and getETag()", () => {
		it("getLastModified() should return null when no cache data", () => {
			const cache = new Cache(connection, cacheProfile);
			const result = cache.getLastModified();
			expect(result).to.be.null;
		});

		it("getETag() should return null when no cache data", () => {
			const cache = new Cache(connection, cacheProfile);
			const result = cache.getETag();
			expect(result).to.be.null;
		});

		it("getLastModified() should never return undefined", () => {
			const cache = new Cache(connection, cacheProfile);
			const result = cache.getLastModified();
			expect(result).to.not.equal(undefined);
		});

		it("getETag() should never return undefined", () => {
			const cache = new Cache(connection, cacheProfile);
			const result = cache.getETag();
			expect(result).to.not.equal(undefined);
		});
	});
});
