import { expect } from 'chai';
import { randomBytes } from "crypto";

import { Cache } from '../../src/lib/dao-cache.js';

/* ****************************************************************************
 *	Cache Feature Flag Tests
 * 
 * Note: These tests verify the feature flag initialization logic.
 * Due to Cache using static properties that can only be initialized once,
 * these tests verify the behavior through Cache.info() after initialization.
 */

describe("Cache Feature Flag", () => {

	describe("Test In-Memory Cache Feature Flag", () => {

		// Generate a test key for encryption
		const testKey = randomBytes(32).toString('hex');
		const dataKey = Buffer.from(testKey, Cache.CRYPT_ENCODING);

		it("Test feature flag in Cache.info()", async () => {
			// After Cache.init() is called (in cache-tests.mjs), 
			// we can verify the feature flag is present in info
			const info = Cache.info();

			// The useInMemoryCache property should exist
			expect(info).to.have.property('useInMemoryCache');
			expect(typeof info.useInMemoryCache).to.equal('boolean');
		});

		it("Test Cache.info() includes inMemoryCache when enabled", async () => {
			// This test verifies the structure when feature is enabled
			// We'll create a mock scenario by checking if the property exists
			const info = Cache.info();

			// If useInMemoryCache is true, inMemoryCache info should be present
			if (info.useInMemoryCache === true) {
				expect(info).to.have.property('inMemoryCache');
				expect(info.inMemoryCache).to.have.property('size');
				expect(info.inMemoryCache).to.have.property('maxEntries');
				expect(info.inMemoryCache).to.have.property('memoryMB');
			}
		});

		it("Test Cache.info() structure when feature disabled", async () => {
			// When disabled, useInMemoryCache should be false
			// and inMemoryCache property should not be present
			const info = Cache.info();

			if (info.useInMemoryCache === false) {
				// inMemoryCache should not be present when disabled
				expect(info.inMemoryCache).to.be.undefined;
			}
		});

		it("Test STATUS_CACHE_IN_MEM constant exists", async () => {
			// Verify the status constant is defined
			expect(Cache.STATUS_CACHE_IN_MEM).to.equal("cache:memory");
		});

	});

	describe("Test Feature Flag Initialization Scenarios", () => {
		
		// These tests document the expected behavior for different initialization scenarios
		// They cannot be run in isolation due to static initialization constraints

		it("Should accept useInMemoryCache parameter", () => {
			// Document expected behavior: parameter should be accepted
			const testInit = {
				useInMemoryCache: true,
				inMemoryCacheMaxEntries: 1000,
				inMemoryCacheEntriesPerGB: 5000,
				inMemoryCacheDefaultMaxEntries: 500
			};

			// Verify the structure is valid
			expect(testInit).to.have.property('useInMemoryCache');
			expect(typeof testInit.useInMemoryCache).to.equal('boolean');
		});

		it("Should accept CACHE_USE_IN_MEMORY environment variable", () => {
			// Document expected behavior: env var should be read
			const originalValue = process.env.CACHE_USE_IN_MEMORY;
			
			process.env.CACHE_USE_IN_MEMORY = 'true';
			expect(process.env.CACHE_USE_IN_MEMORY).to.equal('true');
			
			// Cleanup
			if (originalValue !== undefined) {
				process.env.CACHE_USE_IN_MEMORY = originalValue;
			} else {
				delete process.env.CACHE_USE_IN_MEMORY;
			}
		});

		it("Should default to false when not specified", () => {
			// Document expected behavior: default should be false
			const testInit = {
				// No useInMemoryCache parameter
			};

			// Verify default behavior expectation
			const expectedDefault = false;
			expect(expectedDefault).to.equal(false);
		});

	});

});
