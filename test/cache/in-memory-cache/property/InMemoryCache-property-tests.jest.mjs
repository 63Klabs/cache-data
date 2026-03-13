/**
 * Property-based tests for InMemoryCache
 * Uses fast-check to validate universal correctness properties
 */

import { describe, it, expect } from '@jest/globals';
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
            expect(result.cache).toBe(1);
            
            // Verify exact round-trip preservation - all fields must match exactly
            expect(result.data).toEqual(cacheData);
            
            // Verify individual field preservation for clarity
            expect(result.data.cache.body).toEqual(cacheData.cache.body);
            expect(result.data.cache.headers).toEqual(cacheData.cache.headers);
            expect(result.data.cache.expires).toBe(cacheData.cache.expires);
            expect(result.data.cache.statusCode).toBe(cacheData.cache.statusCode);
            
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
            expect(result.cache).toBe(1);
            
            // Verify data is returned
            expect(result.data).not.toBeNull();
            
            // Verify data matches what was stored
            expect(result.data).toEqual(cacheData);
            
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
            expect(result.cache).toBe(0);
            
            // Verify data is null
            expect(result.data).toBeNull();
            
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
            expect(firstResult.cache).toBe(-1);
            
            // Verify expired data is returned
            expect(firstResult.data).not.toBeNull();
            
            // Verify data matches what was stored
            expect(firstResult.data).toEqual(cacheData);
            
            // Second retrieval should return miss status (entry was deleted)
            const secondResult = cache.get(key);
            
            // Verify cache miss status after deletion
            expect(secondResult.cache).toBe(0);
            
            // Verify data is null after deletion
            expect(secondResult.data).toBeNull();
            
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
            expect(firstResult.cache).toBe(1);
            expect(firstResult.data).toEqual(oldCacheData);
            
            // Store the second entry with the same key
            cache.set(key, newCacheData, newExpiresAt);
            
            // Retrieve the entry again
            const secondResult = cache.get(key);
            
            // Verify cache hit status
            expect(secondResult.cache).toBe(1);
            
            // Verify new data is returned (not old data)
            expect(secondResult.data).toEqual(newCacheData);
            
            // Verify old data is NOT returned
            expect(secondResult.data).not.toEqual(oldCacheData);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: LRU Eviction When At Capacity', () => {
    // Feature: in-memory-cache, Property 6: LRU Eviction When At Capacity
    // Validates: Requirements 4.1
    it('should evict the least recently used entry when cache is at maximum capacity', () => {
      fc.assert(
        fc.property(
          // Generate random maxEntries between 2 and 20
          fc.integer({ min: 2, max: 20 }),
          // Generate array of unique keys (more than maxEntries to test eviction)
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 3, maxLength: 30 }),
          // Generate random CacheDataFormat objects
          fc.array(
            fc.record({
              cache: fc.record({
                body: fc.string(),
                headers: fc.dictionary(fc.string(), fc.string()),
                expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
                statusCode: fc.string()
              })
            }),
            { minLength: 3, maxLength: 30 }
          ),
          (maxEntries, keys, cacheDataArray) => {
            // Ensure we have unique keys
            const uniqueKeys = [...new Set(keys)];
            
            // Ensure we have at least maxEntries + 1 unique keys
            fc.pre(uniqueKeys.length >= maxEntries + 1);
            
            // Ensure we have enough cache data objects
            fc.pre(cacheDataArray.length >= maxEntries + 1);
            
            const cache = new InMemoryCache({ maxEntries });
            const expiresAt = Date.now() + 10000; // 10 seconds from now
            
            // Fill cache to capacity with first maxEntries keys
            for (let i = 0; i < maxEntries; i++) {
              cache.set(uniqueKeys[i], cacheDataArray[i], expiresAt);
            }
            
            // Verify cache is at capacity
            expect(cache.info().size).toBe(maxEntries);
            
            // Add one more entry - this should evict the first (oldest) key
            cache.set(uniqueKeys[maxEntries], cacheDataArray[maxEntries], expiresAt);
            
            // Verify cache is still at capacity (not over)
            expect(cache.info().size).toBe(maxEntries);
            
            // Verify first key (oldest) was evicted
            const afterEviction = cache.get(uniqueKeys[0]);
            expect(afterEviction.cache).toBe(0);
            expect(afterEviction.data).toBeNull();
            
            // Verify new key was added
            const newKeyResult = cache.get(uniqueKeys[maxEntries]);
            expect(newKeyResult.cache).toBe(1);
            expect(newKeyResult.data).toEqual(cacheDataArray[maxEntries]);
            
            // Verify other keys (not the first) are still present
            for (let i = 1; i < maxEntries; i++) {
              const result = cache.get(uniqueKeys[i]);
              expect(result.cache).toBe(1);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Access Updates LRU Position', () => {
    // Feature: in-memory-cache, Property 7: Access Updates LRU Position
    // Validates: Requirements 4.3
    it('should move accessed entry to most recently used position, preventing premature eviction', () => {
      fc.assert(
        fc.property(
          // Generate random maxEntries between 3 and 20 (need at least 3 for meaningful test)
          fc.integer({ min: 3, max: 20 }),
          // Generate array of unique keys
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 4, maxLength: 30 }),
          // Generate random CacheDataFormat objects
          fc.array(
            fc.record({
              cache: fc.record({
                body: fc.string(),
                headers: fc.dictionary(fc.string(), fc.string()),
                expires: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 }),
                statusCode: fc.string()
              })
            }),
            { minLength: 4, maxLength: 30 }
          ),
          (maxEntries, keys, cacheDataArray) => {
            // Ensure we have unique keys
            const uniqueKeys = [...new Set(keys)];
            
            // Ensure we have at least maxEntries + 1 unique keys
            fc.pre(uniqueKeys.length >= maxEntries + 1);
            
            // Ensure we have enough cache data objects
            fc.pre(cacheDataArray.length >= maxEntries + 1);
            
            const cache = new InMemoryCache({ maxEntries });
            const expiresAt = Date.now() + 10000; // 10 seconds from now
            
            // Fill cache to capacity
            for (let i = 0; i < maxEntries; i++) {
              cache.set(uniqueKeys[i], cacheDataArray[i], expiresAt);
            }
            
            // Access the first key (oldest) - this should move it to most recent position
            const accessResult = cache.get(uniqueKeys[0]);
            expect(accessResult.cache).toBe(1);
            
            // Add one more entry - this should evict the second key (now oldest), not the first
            cache.set(uniqueKeys[maxEntries], cacheDataArray[maxEntries], expiresAt);
            
            // Verify first key (which was accessed) still exists
            const firstKeyResult = cache.get(uniqueKeys[0]);
            expect(firstKeyResult.cache).toBe(1);
            expect(firstKeyResult.data).toEqual(cacheDataArray[0]);
            
            // Verify second key (now oldest after first was accessed) was evicted
            const secondKeyResult = cache.get(uniqueKeys[1]);
            expect(secondKeyResult.cache).toBe(0);
            expect(secondKeyResult.data).toBeNull();
            
            // Verify new key was added
            const newKeyResult = cache.get(uniqueKeys[maxEntries]);
            expect(newKeyResult.cache).toBe(1);
            
            // Verify cache is still at capacity
            expect(cache.info().size).toBe(maxEntries);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8: MAX_ENTRIES Calculation From Memory', () => {
    // Feature: in-memory-cache, Property 8: MAX_ENTRIES Calculation From Memory
    // Validates: Requirements 5.2
    it('should calculate maxEntries correctly from Lambda memory allocation using the formula (memoryMB / 1024) * entriesPerGB', () => {
      fc.assert(
        fc.property(
          // Generate random Lambda memory sizes (typical values: 128, 256, 512, 1024, 2048, 3008, etc.)
          fc.integer({ min: 128, max: 10240 }),
          // Generate random entriesPerGB heuristic
          fc.integer({ min: 1000, max: 20000 }),
          (memoryMB, entriesPerGB) => {
            // Save original environment variable
            const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
            
            try {
              // Set Lambda memory environment variable
              process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memoryMB.toString();
              
              // Create cache with the entriesPerGB heuristic
              const cache = new InMemoryCache({ entriesPerGB });
              const info = cache.info();
              
              // Calculate expected maxEntries: (memoryMB / 1024) * entriesPerGB
              const expectedMaxEntries = Math.floor((memoryMB / 1024) * entriesPerGB);
              
              // Verify maxEntries matches the calculation
              expect(info.maxEntries).toBe(expectedMaxEntries);
              
              // Verify memoryMB is stored correctly
              expect(info.memoryMB).toBe(memoryMB);
              
              // Verify maxEntries is at least 1 (even if calculation results in 0)
              expect(info.maxEntries).toBeGreaterThanOrEqual(1);
              
              return true;
            } finally {
              // Restore original environment variable
              if (originalMemory !== undefined) {
                process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
              } else {
                delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
