/**
 * Unit tests for InMemoryCache constructor and initialization
 * Tests memory-based MAX_ENTRIES calculation and info() method
 */

import { describe, it, expect } from '@jest/globals';
import InMemoryCache from '../../../../src/lib/utils/InMemoryCache.js';

describe('InMemoryCache - Constructor and Initialization', () => {
  describe('Constructor with explicit maxEntries', () => {
    it('should use explicit maxEntries parameter', () => {
      const cache = new InMemoryCache({ maxEntries: 100 });
      const info = cache.info();

      expect(info.maxEntries).toBe(100);
      expect(info.memoryMB).toBeNull();
    });

    it('should initialize with size 0', () => {
      const cache = new InMemoryCache({ maxEntries: 50 });
      const info = cache.info();

      expect(info.size).toBe(0);
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
      expect(info.maxEntries).toBe(5000);
      expect(info.memoryMB).toBe(1024);

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
      expect(info.maxEntries).toBe(2500);
      expect(info.memoryMB).toBe(512);

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
      expect(info.maxEntries).toBe(20000);

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

      expect(info.maxEntries).toBe(1000);
      expect(info.memoryMB).toBeNull();

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      }
    });

    it('should use default defaultMaxEntries (1000) when not specified', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

      const cache = new InMemoryCache();
      const info = cache.info();

      expect(info.maxEntries).toBe(1000);

      if (originalMemory !== undefined) {
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = originalMemory;
      }
    });

    it('should handle invalid Lambda memory value', () => {
      const originalMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = 'invalid';

      const cache = new InMemoryCache({ defaultMaxEntries: 500 });
      const info = cache.info();

      expect(info.maxEntries).toBe(500);
      expect(info.memoryMB).toBeNull();

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

      expect(typeof info).toBe('object');
      expect('size' in info).toBe(true);
      expect('maxEntries' in info).toBe(true);
      expect('memoryMB' in info).toBe(true);
    });

    it('should return correct types', () => {
      const cache = new InMemoryCache({ maxEntries: 100 });
      const info = cache.info();

      expect(typeof info.size).toBe('number');
      expect(typeof info.maxEntries).toBe('number');
      expect(info.memoryMB === null || typeof info.memoryMB === 'number').toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should ensure maxEntries is at least 1', () => {
      const cache = new InMemoryCache({ maxEntries: 0 });
      const info = cache.info();

      expect(info.maxEntries).toBe(1);
    });

    it('should ensure maxEntries is at least 1 for negative values', () => {
      const cache = new InMemoryCache({ maxEntries: -10 });
      const info = cache.info();

      expect(info.maxEntries).toBe(1);
    });
  });
});
