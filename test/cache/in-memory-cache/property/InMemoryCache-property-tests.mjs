/**
 * Property-based tests for InMemoryCache
 * Uses fast-check to validate universal correctness properties
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js';

describe('InMemoryCache - Property-Based Tests', () => {
  describe('Property 1: Cache Entry Round-Trip Preservation', () => {
    // Feature: in-memory-cache, Property 1: Cache Entry Round-Trip Preservation
    // Validates: Requirements 1.2, 3.5, 7.3
    it('should preserve all fields of CacheDataFormat object when storing and retrieving before expiration', () => {
      fc.assert(
        fc.property(
          // Generate random cache key
          fc.string({ minLength: 1, maxLength: 100 }),
          // Generate random CacheDataFormat object with all possible field variations
          fc.record({
            cache: fc.record({
              body: fc.string(),
              headers: fc.dictionary(fc.string(), fc.string()),
              expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
              statusCode: fc.string()
            })
          }),
          // Generate future expiration timestamp (in milliseconds)
          fc.integer({ min: Date.now() + 1000, max: Date.now() + 86400000 }),
          (key, cacheData, expiresAt) => {
            const cache = new InMemoryCache({ maxEntries: 100 });
            
            // Store the entry
            cache.set(key, cacheData, expiresAt);
            
            // Retrieve the entry immediately (before expiration)
            const result = cache.get(key);
            
            // Verify cache hit status
            assert.strictEqual(result.cache, 1, `Expected cache hit (status 1) for key: ${key}`);
            
            // Verify exact round-trip preservation - all fields must match exactly
            assert.deepStrictEqual(
              result.data,
              cacheData,
              'Retrieved CacheDataFormat should exactly match stored CacheDataFormat with all fields preserved'
            );
            
            // Verify individual field preservation for clarity
            assert.deepStrictEqual(result.data.cache.body, cacheData.cache.body, 'Body field should be preserved');
            assert.deepStrictEqual(result.data.cache.headers, cacheData.cache.headers, 'Headers field should be preserved');
            assert.strictEqual(result.data.cache.expires, cacheData.cache.expires, 'Expires field should be preserved');
            assert.strictEqual(result.data.cache.statusCode, cacheData.cache.statusCode, 'StatusCode field should be preserved');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Valid Entry Returns Hit Status', () => {
    // Feature: in-memory-cache, Property 2: Valid Entry Returns Hit Status
    // Validates: Requirements 2.1
    it('should return cache hit (status 1) for any valid stored entry', () => {
      fc.assert(
        fc.property(
          // Generate random cache key
          fc.string({ minLength: 1, maxLength: 100 }),
          // Generate random CacheDataFormat object
          fc.record({
            cache: fc.record({
              body: fc.string(),
              headers: fc.dictionary(fc.string(), fc.string()),
              expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
              statusCode: fc.string()
            })
          }),
          // Generate future expiration timestamp (in milliseconds)
          fc.integer({ min: Date.now() + 1000, max: Date.now() + 86400000 }),
          (key, cacheData, expiresAt) => {
            const cache = new InMemoryCache({ maxEntries: 100 });
            
            // Store the entry
            cache.set(key, cacheData, expiresAt);
            
            // Retrieve the entry
            const result = cache.get(key);
            
            // Verify cache hit status
            assert.strictEqual(result.cache, 1, `Expected cache hit (status 1) for key: ${key}`);
            
            // Verify data is returned
            assert.notStrictEqual(result.data, null, 'Data should not be null for cache hit');
            
            // Verify data matches what was stored
            assert.deepStrictEqual(result.data, cacheData, 'Returned data should match stored data');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Missing Key Returns Miss Status', () => {
    // Feature: in-memory-cache, Property 3: Missing Key Returns Miss Status
    // Validates: Requirements 2.2
    it('should return cache miss (status 0) with null data for any key that has never been stored', () => {
      fc.assert(
        fc.property(
          // Generate random cache key that will not be stored
          fc.string({ minLength: 1, maxLength: 100 }),
          // Generate some keys to store (to ensure cache is not empty)
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.record({
                cache: fc.record({
                  body: fc.string(),
                  headers: fc.dictionary(fc.string(), fc.string()),
                  expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
                  statusCode: fc.string()
                })
              }),
              fc.integer({ min: Date.now() + 1000, max: Date.now() + 86400000 })
            ),
            { minLength: 0, maxLength: 10 }
          ),
          (missingKey, storedEntries) => {
            const cache = new InMemoryCache({ maxEntries: 100 });
            
            // Store some entries (but not the missing key)
            const storedKeys = new Set();
            for (const [key, cacheData, expiresAt] of storedEntries) {
              // Only store if key is different from missingKey
              if (key !== missingKey) {
                cache.set(key, cacheData, expiresAt);
                storedKeys.add(key);
              }
            }
            
            // Ensure missingKey was not accidentally stored
            fc.pre(!storedKeys.has(missingKey));
            
            // Retrieve the missing key
            const result = cache.get(missingKey);
            
            // Verify cache miss status
            assert.strictEqual(result.cache, 0, `Expected cache miss (status 0) for missing key: ${missingKey}`);
            
            // Verify data is null
            assert.strictEqual(result.data, null, 'Data should be null for cache miss');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Expired Entry Returns Expired Status and Deletes', () => {
    // Feature: in-memory-cache, Property 4: Expired Entry Returns Expired Status and Deletes
    // Validates: Requirements 2.3, 6.3
    it('should return expired status (status -1) with expired data, then delete the entry', () => {
      fc.assert(
        fc.property(
          // Generate random cache key
          fc.string({ minLength: 1, maxLength: 100 }),
          // Generate random CacheDataFormat object
          fc.record({
            cache: fc.record({
              body: fc.string(),
              headers: fc.dictionary(fc.string(), fc.string()),
              expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
              statusCode: fc.string()
            })
          }),
          // Generate past expiration timestamp (in milliseconds) - expired between 1ms and 10 seconds ago
          fc.integer({ min: Date.now() - 10000, max: Date.now() - 1 }),
          (key, cacheData, expiresAt) => {
            const cache = new InMemoryCache({ maxEntries: 100 });
            
            // Store the entry with past expiration
            cache.set(key, cacheData, expiresAt);
            
            // First retrieval should return expired status
            const firstResult = cache.get(key);
            
            // Verify expired status
            assert.strictEqual(firstResult.cache, -1, `Expected expired status (status -1) for key: ${key}`);
            
            // Verify expired data is returned
            assert.notStrictEqual(firstResult.data, null, 'Expired data should not be null');
            
            // Verify data matches what was stored
            assert.deepStrictEqual(firstResult.data, cacheData, 'Returned expired data should match stored data');
            
            // Second retrieval should return miss status (entry was deleted)
            const secondResult = cache.get(key);
            
            // Verify cache miss status after deletion
            assert.strictEqual(secondResult.cache, 0, `Expected cache miss (status 0) after deletion for key: ${key}`);
            
            // Verify data is null after deletion
            assert.strictEqual(secondResult.data, null, 'Data should be null after expired entry is deleted');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Storing Existing Key Updates Entry', () => {
    // Feature: in-memory-cache, Property 5: Storing Existing Key Updates Entry
    // Validates: Requirements 3.3
    it('should replace old value when storing a new value with an existing key', () => {
      fc.assert(
        fc.property(
          // Generate random cache key
          fc.string({ minLength: 1, maxLength: 100 }),
          // Generate first CacheDataFormat object (old value)
          fc.record({
            cache: fc.record({
              body: fc.string(),
              headers: fc.dictionary(fc.string(), fc.string()),
              expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
              statusCode: fc.string()
            })
          }),
          // Generate second CacheDataFormat object (new value)
          fc.record({
            cache: fc.record({
              body: fc.string(),
              headers: fc.dictionary(fc.string(), fc.string()),
              expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
              statusCode: fc.string()
            })
          }),
          // Generate expiration timestamps for both entries
          fc.integer({ min: Date.now() + 1000, max: Date.now() + 86400000 }),
          fc.integer({ min: Date.now() + 1000, max: Date.now() + 86400000 }),
          (key, oldCacheData, newCacheData, oldExpiresAt, newExpiresAt) => {
            // Ensure old and new data are different
            fc.pre(JSON.stringify(oldCacheData) !== JSON.stringify(newCacheData));
            
            const cache = new InMemoryCache({ maxEntries: 100 });
            
            // Store the first entry
            cache.set(key, oldCacheData, oldExpiresAt);
            
            // Verify first entry is stored
            const firstResult = cache.get(key);
            assert.strictEqual(firstResult.cache, 1, 'First entry should be a cache hit');
            assert.deepStrictEqual(firstResult.data, oldCacheData, 'First retrieval should return old data');
            
            // Store the second entry with the same key
            cache.set(key, newCacheData, newExpiresAt);
            
            // Retrieve the entry again
            const secondResult = cache.get(key);
            
            // Verify cache hit status
            assert.strictEqual(secondResult.cache, 1, `Expected cache hit (status 1) for updated key: ${key}`);
            
            // Verify new data is returned (not old data)
            assert.deepStrictEqual(secondResult.data, newCacheData, 'Second retrieval should return new data');
            
            // Verify old data is NOT returned
            assert.notDeepStrictEqual(secondResult.data, oldCacheData, 'Old data should be replaced');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
