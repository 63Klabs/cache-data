/**
 * Unit tests for InMemoryCache constructor and initialization
 * Tests memory-based MAX_ENTRIES calculation and info() method
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js';

describe('InMemoryCache - Constructor and Initialization', () => {
  describe('Constructor with explicit maxEntries', () => {
    it('should use explicit maxEntries parameter', () => {
      const cache = new InMemoryCache({ maxEntries: 100 });
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 100, 'maxEntries should match parameter');
      assert.strictEqual(info.memoryMB, null, 'memoryMB should be null when explicit maxEntries used');
    });

    it('should initialize with size 0', () => {
      const cache = new InMemoryCache({ maxEntries: 50 });
      const info = cache.info();

      assert.strictEqual(info.size, 0, 'Initial size should be 0');
    });
  });

  describe('Constructor with Lambda memory calculation', () => {
    it('should calculate maxEntries from AWS_LAMBDA_FUNCTION_MEMORY_SIZE', () => {
      // Set Lambda memory to 1024 MB
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '1024';

      const cache = new InMemoryCache({ entriesPerGB: 5000 });
      const info = cache.info();

      // Expected: (1024 / 1024) * 5000 = 5000
      assert.strictEqual(info.maxEntries, 5000, 'maxEntries should be calculated from memory');
      assert.strictEqual(info.memoryMB, 1024, 'memoryMB should be stored');

      // Restore original value
      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      } else {
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      }
    });

    it('should calculate maxEntries for 512 MB Lambda', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '512';

      const cache = new InMemoryCache({ entriesPerGB: 5000 });
      const info = cache.info();

      // Expected: (512 / 1024) * 5000 = 2500
      assert.strictEqual(info.maxEntries, 2500, 'maxEntries should be calculated correctly');
      assert.strictEqual(info.memoryMB, 512, 'memoryMB should be stored');

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      } else {
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      }
    });

    it('should use custom entriesPerGB heuristic', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '2048';

      const cache = new InMemoryCache({ entriesPerGB: 10000 });
      const info = cache.info();

      // Expected: (2048 / 1024) * 10000 = 20000
      assert.strictEqual(info.maxEntries, 20000, 'maxEntries should use custom entriesPerGB');

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      } else {
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      }
    });
  });

  describe('Constructor with fallback to defaultMaxEntries', () => {
    it('should use defaultMaxEntries when Lambda memory unavailable', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

      const cache = new InMemoryCache({ defaultMaxEntries: 1000 });
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 1000, 'maxEntries should use defaultMaxEntries');
      assert.strictEqual(info.memoryMB, null, 'memoryMB should be null');

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      }
    });

    it('should use default defaultMaxEntries (1000) when not specified', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

      const cache = new InMemoryCache();
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 1000, 'maxEntries should use default 1000');

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      }
    });

    it('should handle invalid Lambda memory value', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = 'invalid';

      const cache = new InMemoryCache({ defaultMaxEntries: 500 });
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 500, 'maxEntries should fallback to defaultMaxEntries');
      assert.strictEqual(info.memoryMB, null, 'memoryMB should be null for invalid value');

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      } else {
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      }
    });
  });

  describe('info() method', () => {
    it('should return correct structure', () => {
      const cache = new InMemoryCache({ maxEntries: 100 });
      const info = cache.info();

      assert.strictEqual(typeof info, 'object', 'info should return an object');
      assert.ok('size' in info, 'info should have size property');
      assert.ok('maxEntries' in info, 'info should have maxEntries property');
      assert.ok('memoryMB' in info, 'info should have memoryMB property');
    });

    it('should return correct types', () => {
      const cache = new InMemoryCache({ maxEntries: 100 });
      const info = cache.info();

      assert.strictEqual(typeof info.size, 'number', 'size should be a number');
      assert.strictEqual(typeof info.maxEntries, 'number', 'maxEntries should be a number');
      assert.ok(info.memoryMB === null || typeof info.memoryMB === 'number', 'memoryMB should be null or number');
    });
  });

  describe('Edge cases', () => {
    it('should ensure maxEntries is at least 1', () => {
      const cache = new InMemoryCache({ maxEntries: 0 });
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 1, 'maxEntries should be at least 1');
    });

    it('should ensure maxEntries is at least 1 for negative values', () => {
      const cache = new InMemoryCache({ maxEntries: -10 });
      const info = cache.info();

      assert.strictEqual(info.maxEntries, 1, 'maxEntries should be at least 1');
    });
  });
});
