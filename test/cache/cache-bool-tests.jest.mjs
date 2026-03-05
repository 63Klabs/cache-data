/**
 * Unit tests for Cache.bool() method
 * Tests the strict boolean conversion logic for environment variables and configuration
 */

import { describe, it, expect } from '@jest/globals';
import { Cache } from '../../src/lib/dao-cache.js';

describe('Cache.bool() - Unit Tests', () => {
	describe('Truthy values', () => {
		it('should return true for boolean true', () => {
			expect(Cache.bool(true)).toBe(true);
		});

		it('should return true for string "true" (lowercase)', () => {
			expect(Cache.bool('true')).toBe(true);
		});

		it('should return true for string "TRUE" (uppercase)', () => {
			expect(Cache.bool('TRUE')).toBe(true);
		});

		it('should return true for string "True" (mixed case)', () => {
			expect(Cache.bool('True')).toBe(true);
		});

		it('should return true for string "1"', () => {
			expect(Cache.bool('1')).toBe(true);
		});

		it('should return true for number 1', () => {
			expect(Cache.bool(1)).toBe(true);
		});

		it('should return true for string "true" with leading whitespace', () => {
			expect(Cache.bool('  true')).toBe(true);
		});

		it('should return true for string "true" with trailing whitespace', () => {
			expect(Cache.bool('true  ')).toBe(true);
		});

		it('should return true for string "true" with surrounding whitespace', () => {
			expect(Cache.bool('  true  ')).toBe(true);
		});
	});

	describe('Falsy values', () => {
		it('should return false for boolean false', () => {
			expect(Cache.bool(false)).toBe(false);
		});

		it('should return false for string "false" (lowercase)', () => {
			expect(Cache.bool('false')).toBe(false);
		});

		it('should return false for string "FALSE" (uppercase)', () => {
			expect(Cache.bool('FALSE')).toBe(false);
		});

		it('should return false for string "0"', () => {
			expect(Cache.bool('0')).toBe(false);
		});

		it('should return false for number 0', () => {
			expect(Cache.bool(0)).toBe(false);
		});

		it('should return false for string "no"', () => {
			expect(Cache.bool('no')).toBe(false);
		});

		it('should return false for string "NO"', () => {
			expect(Cache.bool('NO')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(Cache.bool('')).toBe(false);
		});

		it('should return false for whitespace-only string (single space)', () => {
			expect(Cache.bool(' ')).toBe(false);
		});

		it('should return false for whitespace-only string (multiple spaces)', () => {
			expect(Cache.bool('   ')).toBe(false);
		});

		it('should return false for whitespace-only string (tabs)', () => {
			expect(Cache.bool('\t')).toBe(false);
		});

		it('should return false for whitespace-only string (newlines)', () => {
			expect(Cache.bool('\n')).toBe(false);
		});

		it('should return false for null', () => {
			expect(Cache.bool(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(Cache.bool(undefined)).toBe(false);
		});

		it('should return false for NaN', () => {
			expect(Cache.bool(NaN)).toBe(false);
		});

		it('should return false for random string "random"', () => {
			expect(Cache.bool('random')).toBe(false);
		});

		it('should return false for random string "yes"', () => {
			expect(Cache.bool('yes')).toBe(false);
		});

		it('should return false for random string "on"', () => {
			expect(Cache.bool('on')).toBe(false);
		});
	});

	describe('Edge cases', () => {
		it('should return true for objects (standard Boolean behavior)', () => {
			expect(Cache.bool({})).toBe(true);
		});

		it('should return true for arrays (standard Boolean behavior)', () => {
			expect(Cache.bool([])).toBe(true);
		});

		it('should return true for functions (standard Boolean behavior)', () => {
			expect(Cache.bool(() => {})).toBe(true);
		});

		it('should return true for non-zero numbers', () => {
			expect(Cache.bool(42)).toBe(true);
			expect(Cache.bool(-1)).toBe(true);
			expect(Cache.bool(0.1)).toBe(true);
		});
	});

	describe('Environment variable use cases', () => {
		it('should handle typical environment variable values correctly', () => {
			// Truthy environment variables
			expect(Cache.bool('true')).toBe(true);
			expect(Cache.bool('TRUE')).toBe(true);
			expect(Cache.bool('1')).toBe(true);

			// Falsy environment variables
			expect(Cache.bool('false')).toBe(false);
			expect(Cache.bool('FALSE')).toBe(false);
			expect(Cache.bool('0')).toBe(false);
			expect(Cache.bool('')).toBe(false);
			expect(Cache.bool(undefined)).toBe(false);
		});

		it('should treat unset environment variables (undefined) as false', () => {
			const unsetVar = process.env.NONEXISTENT_VAR;
			expect(Cache.bool(unsetVar)).toBe(false);
		});

		it('should treat empty environment variables as false', () => {
			expect(Cache.bool('')).toBe(false);
		});
	});
});
