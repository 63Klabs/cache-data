/**
 * Unit tests for Cache._isValidHeaderValue() helper function
 * Tests specific examples of various value types to verify validation logic
 * 
 * Validates Requirements 1.4, 1.5, 3.4
 */

import { expect } from 'chai';
import { Cache } from '../../src/lib/dao-cache.js';

describe("Cache._isValidHeaderValue() - Unit Tests", () => {

	describe("Invalid values (should return false)", () => {
		it("should return false for null", () => {
			const result = Cache._isValidHeaderValue(null);
			expect(result).to.be.false;
		});

		it("should return false for undefined", () => {
			const result = Cache._isValidHeaderValue(undefined);
			expect(result).to.be.false;
		});

		it("should return false for empty string", () => {
			const result = Cache._isValidHeaderValue('');
			expect(result).to.be.false;
		});

		it("should return false for NaN", () => {
			const result = Cache._isValidHeaderValue(NaN);
			expect(result).to.be.false;
		});

		it("should return false for boolean true", () => {
			const result = Cache._isValidHeaderValue(true);
			expect(result).to.be.false;
		});

		it("should return false for boolean false", () => {
			const result = Cache._isValidHeaderValue(false);
			expect(result).to.be.false;
		});

		it("should return false for object", () => {
			const result = Cache._isValidHeaderValue({ key: 'value' });
			expect(result).to.be.false;
		});

		it("should return false for array", () => {
			const result = Cache._isValidHeaderValue(['item1', 'item2']);
			expect(result).to.be.false;
		});

		it("should return false for empty object", () => {
			const result = Cache._isValidHeaderValue({});
			expect(result).to.be.false;
		});

		it("should return false for empty array", () => {
			const result = Cache._isValidHeaderValue([]);
			expect(result).to.be.false;
		});
	});

	describe("Valid values (should return true)", () => {
		it("should return true for non-empty string", () => {
			const result = Cache._isValidHeaderValue('valid-header-value');
			expect(result).to.be.true;
		});

		it("should return true for single character string", () => {
			const result = Cache._isValidHeaderValue('a');
			expect(result).to.be.true;
		});

		it("should return true for string with spaces", () => {
			const result = Cache._isValidHeaderValue('value with spaces');
			expect(result).to.be.true;
		});

		it("should return true for positive number", () => {
			const result = Cache._isValidHeaderValue(123);
			expect(result).to.be.true;
		});

		it("should return true for negative number", () => {
			const result = Cache._isValidHeaderValue(-456);
			expect(result).to.be.true;
		});

		it("should return true for zero", () => {
			const result = Cache._isValidHeaderValue(0);
			expect(result).to.be.true;
		});

		it("should return true for decimal number", () => {
			const result = Cache._isValidHeaderValue(3.14);
			expect(result).to.be.true;
		});
	});

	describe("Edge cases", () => {
		it("should return false for function", () => {
			const result = Cache._isValidHeaderValue(() => {});
			expect(result).to.be.false;
		});

		it("should return false for Symbol", () => {
			const result = Cache._isValidHeaderValue(Symbol('test'));
			expect(result).to.be.false;
		});

		it("should return true for string '0'", () => {
			const result = Cache._isValidHeaderValue('0');
			expect(result).to.be.true;
		});

		it("should return true for string 'false'", () => {
			const result = Cache._isValidHeaderValue('false');
			expect(result).to.be.true;
		});

		it("should return true for string 'null'", () => {
			const result = Cache._isValidHeaderValue('null');
			expect(result).to.be.true;
		});

		it("should return false for string 'undefined'", () => {
			const result = Cache._isValidHeaderValue('undefined');
			expect(result).to.be.false;
		});
	});
});
