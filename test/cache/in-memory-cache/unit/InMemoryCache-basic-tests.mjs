/**
 * Unit tests for InMemoryCache basic operations
 * Tests get() method functionality including cache hits, misses, and expiration
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js';

describe('InMemoryCache - Basic Operations', () => {
  let cache;

  beforeEach(() => {
    cache = new InMemoryCache({ maxEntries: 10 });
  });

  describe('get() method', () => {
    it('should return cache miss (status 0) for non-existent key', () => {
      const result = cache.get('non-existent-key');
      
      assert.strictEqual(result.cache, 0, 'Cache status should be 0 for miss');
      assert.strictEqual(result.data, null, 'Data should be null for miss');
    });

    it('should return cache hit (status 1) for valid entry', () => {
      const key = 'test-key';
      const mockData = {
        cache: {
          body: JSON.stringify({ test: 'data' }),
          headers: { 'content-type': 'application/json' },
          expires: Math.floor(Date.now() / 1000) + 3600,
          statusCode: '200'
        }
      };
      const expiresAt = Date.now() + 10000; // 10 seconds from now

      cache.set(key, mockData, expiresAt);
      const result = cache.get(key);

      assert.strictEqual(result.cache, 1, 'Cache status should be 1 for hit');
      assert.deepStrictEqual(result.data, mockData, 'Data should match stored value');
    });

    it('should return expired status (status -1) for expired entry', () => {
      const key = 'expired-key';
      const mockData = {
        cache: {
          body: JSON.stringify({ test: 'expired' }),
          headers: { 'content-type': 'application/json' },
          expires: Math.floor(Date.now() / 1000) - 3600,
          statusCode: '200'
        }
      };
      const expiresAt = Date.now() - 1000; // 1 second in the past

      cache.set(key, mockData, expiresAt);
      const result = cache.get(key);

      assert.strictEqual(result.cache, -1, 'Cache status should be -1 for expired');
      assert.deepStrictEqual(result.data, mockData, 'Data should be returned even when expired');
    });

    it('should delete expired entry after retrieval', () => {
      const key = 'expired-key';
      const mockData = {
        cache: {
          body: JSON.stringify({ test: 'expired' }),
          headers: {},
          expires: Math.floor(Date.now() / 1000) - 3600,
          statusCode: '200'
        }
      };
      const expiresAt = Date.now() - 1000;

      cache.set(key, mockData, expiresAt);
      
      // First get returns expired
      const firstResult = cache.get(key);
      assert.strictEqual(firstResult.cache, -1, 'First get should return expired status');

      // Second get should return miss (entry was deleted)
      const secondResult = cache.get(key);
      assert.strictEqual(secondResult.cache, 0, 'Second get should return miss status');
      assert.strictEqual(secondResult.data, null, 'Data should be null after deletion');
    });

    it('should update LRU position on cache hit', () => {
      const key1 = 'key1';
      const key2 = 'key2';
      const mockData1 = { cache: { body: 'data1', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const mockData2 = { cache: { body: 'data2', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      // Create cache with max 2 entries
      const smallCache = new InMemoryCache({ maxEntries: 2 });

      // Add two entries
      smallCache.set(key1, mockData1, expiresAt);
      smallCache.set(key2, mockData2, expiresAt);

      // Access key1 (should move it to most recent)
      smallCache.get(key1);

      // Add a third entry (should evict key2, not key1)
      const key3 = 'key3';
      const mockData3 = { cache: { body: 'data3', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      smallCache.set(key3, mockData3, expiresAt);

      // key1 should still exist (was accessed)
      const result1 = smallCache.get(key1);
      assert.strictEqual(result1.cache, 1, 'key1 should still be in cache');

      // key2 should be evicted (was oldest)
      const result2 = smallCache.get(key2);
      assert.strictEqual(result2.cache, 0, 'key2 should be evicted');
    });
  });

  describe('set() method', () => {
    it('should store entry successfully', () => {
      const key = 'test-key';
      const mockData = {
        cache: {
          body: JSON.stringify({ test: 'data' }),
          headers: {},
          expires: Math.floor(Date.now() / 1000) + 3600,
          statusCode: '200'
        }
      };
      const expiresAt = Date.now() + 10000;

      cache.set(key, mockData, expiresAt);
      const result = cache.get(key);

      assert.strictEqual(result.cache, 1, 'Entry should be retrievable');
      assert.deepStrictEqual(result.data, mockData, 'Data should match');
    });

    it('should update existing entry', () => {
      const key = 'test-key';
      const mockData1 = { cache: { body: 'data1', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const mockData2 = { cache: { body: 'data2', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      cache.set(key, mockData1, expiresAt);
      cache.set(key, mockData2, expiresAt);

      const result = cache.get(key);
      assert.deepStrictEqual(result.data, mockData2, 'Data should be updated');
    });
  });

  describe('info() method', () => {
    it('should return cache information', () => {
      const info = cache.info();

      assert.strictEqual(typeof info.size, 'number', 'size should be a number');
      assert.strictEqual(typeof info.maxEntries, 'number', 'maxEntries should be a number');
      assert.strictEqual(info.size, 0, 'Initial size should be 0');
      assert.strictEqual(info.maxEntries, 10, 'maxEntries should match constructor');
    });

    it('should update size after adding entries', () => {
      const mockData = { cache: { body: 'data', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      cache.set('key1', mockData, expiresAt);
      cache.set('key2', mockData, expiresAt);

      const info = cache.info();
      assert.strictEqual(info.size, 2, 'Size should reflect number of entries');
    });
  });

  describe('clear() method', () => {
    it('should clear all entries', () => {
      const mockData = { cache: { body: 'data', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      cache.set('key1', mockData, expiresAt);
      cache.set('key2', mockData, expiresAt);

      cache.clear();

      const info = cache.info();
      assert.strictEqual(info.size, 0, 'Size should be 0 after clear');

      const result = cache.get('key1');
      assert.strictEqual(result.cache, 0, 'Entries should be gone after clear');
    });
  });
});
