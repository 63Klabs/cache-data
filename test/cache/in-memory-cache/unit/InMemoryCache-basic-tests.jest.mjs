/**
 * Unit tests for InMemoryCache basic operations
 * Tests get() method functionality including cache hits, misses, and expiration
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js';

describe('InMemoryCache - Basic Operations', () => {
  let cache;

  beforeEach(() => {
    cache = new InMemoryCache({ maxEntries: 10 });
  });

  describe('get() method', () => {
    it('should return cache miss (status 0) for non-existent key', () => {
      const result = cache.get('non-existent-key');
      
      expect(result.cache).toBe(0);
      expect(result.data).toBeNull();
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

      expect(result.cache).toBe(1);
      expect(result.data).toEqual(mockData);
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

      expect(result.cache).toBe(-1);
      expect(result.data).toEqual(mockData);
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
      expect(firstResult.cache).toBe(-1);

      // Second get should return miss (entry was deleted)
      const secondResult = cache.get(key);
      expect(secondResult.cache).toBe(0);
      expect(secondResult.data).toBeNull();
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
      expect(result1.cache).toBe(1);

      // key2 should be evicted (was oldest)
      const result2 = smallCache.get(key2);
      expect(result2.cache).toBe(0);
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

      expect(result.cache).toBe(1);
      expect(result.data).toEqual(mockData);
    });

    it('should update existing entry', () => {
      const key = 'test-key';
      const mockData1 = { cache: { body: 'data1', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const mockData2 = { cache: { body: 'data2', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      cache.set(key, mockData1, expiresAt);
      cache.set(key, mockData2, expiresAt);

      const result = cache.get(key);
      expect(result.data).toEqual(mockData2);
    });
  });

  describe('info() method', () => {
    it('should return cache information', () => {
      const info = cache.info();

      expect(typeof info.size).toBe('number');
      expect(typeof info.maxEntries).toBe('number');
      expect(info.size).toBe(0);
      expect(info.maxEntries).toBe(10);
    });

    it('should update size after adding entries', () => {
      const mockData = { cache: { body: 'data', headers: {}, expires: Date.now() / 1000 + 3600, statusCode: '200' } };
      const expiresAt = Date.now() + 10000;

      cache.set('key1', mockData, expiresAt);
      cache.set('key2', mockData, expiresAt);

      const info = cache.info();
      expect(info.size).toBe(2);
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
      expect(info.size).toBe(0);

      const result = cache.get('key1');
      expect(result.cache).toBe(0);
    });
  });
});
