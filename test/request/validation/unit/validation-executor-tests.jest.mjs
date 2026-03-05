import { describe, it, expect, jest, afterEach } from '@jest/globals';

// Import ValidationExecutor
const ValidationExecutor = (await import('../../../../src/lib/utils/ValidationExecutor.class.js')).default;

// Import tools for mocking DebugAndLog
const tools = await import('../../../../src/lib/tools/index.js');

describe('ValidationExecutor', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Single-parameter validation', () => {
		it('should pass single value directly to validation function', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith('123');
			expect(mockValidate).toHaveBeenCalledTimes(1);
			expect(result).toBe(true);
		});

		it('should handle undefined single parameter value', () => {
			const mockValidate = jest.fn().mockReturnValue(false);
			const paramNames = ['id'];
			const paramValues = { otherId: '123' }; // id is undefined

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith(undefined);
			expect(result).toBe(false);
		});

		it('should handle null single parameter value', () => {
			const mockValidate = jest.fn().mockReturnValue(false);
			const paramNames = ['id'];
			const paramValues = { id: null };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith(null);
			expect(result).toBe(false);
		});
	});

	describe('Multi-parameter validation', () => {
		it('should pass object with all parameters to validation function', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith({ page: 1, limit: 10 });
			expect(mockValidate).toHaveBeenCalledTimes(1);
			expect(result).toBe(true);
		});

		it('should include all specified parameters even if undefined', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['page', 'limit', 'sort'];
			const paramValues = { page: 1, limit: 10 }; // sort is undefined

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith({
				page: 1,
				limit: 10,
				sort: undefined
			});
			expect(result).toBe(true);
		});

		it('should handle all parameters being undefined', () => {
			const mockValidate = jest.fn().mockReturnValue(false);
			const paramNames = ['page', 'limit'];
			const paramValues = {}; // Both undefined

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith({
				page: undefined,
				limit: undefined
			});
			expect(result).toBe(false);
		});

		it('should handle parameters with null values', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['page', 'limit'];
			const paramValues = { page: null, limit: null };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith({
				page: null,
				limit: null
			});
			expect(result).toBe(true);
		});

		it('should preserve parameter order in object', () => {
			const mockValidate = jest.fn((params) => {
				// Verify object has correct properties
				return 'query' in params && 'limit' in params && 'offset' in params;
			});
			const paramNames = ['query', 'limit', 'offset'];
			const paramValues = { query: 'test', limit: 10, offset: 0 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(mockValidate).toHaveBeenCalledWith({
				query: 'test',
				limit: 10,
				offset: 0
			});
			expect(result).toBe(true);
		});
	});

	describe('Validation function returning true', () => {
		it('should return true when validation function returns true', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should return true for multi-parameter validation returning true', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});
	});

	describe('Validation function returning false', () => {
		it('should return false when validation function returns false', () => {
			const mockValidate = jest.fn().mockReturnValue(false);
			const paramNames = ['id'];
			const paramValues = { id: 'invalid' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});

		it('should return false for multi-parameter validation returning false', () => {
			const mockValidate = jest.fn().mockReturnValue(false);
			const paramNames = ['page', 'limit'];
			const paramValues = { page: -1, limit: 1000 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});
	});

	describe('Validation function throwing error', () => {
		it('should catch error and return false', () => {
			const mockValidate = jest.fn(() => {
				throw new Error('Validation error');
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});

		it('should catch TypeError and return false', () => {
			const mockValidate = jest.fn(() => {
				throw new TypeError('Type error in validation');
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});

		it('should catch ReferenceError and return false', () => {
			const mockValidate = jest.fn(() => {
				throw new ReferenceError('Reference error');
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});

		it('should catch error in multi-parameter validation', () => {
			const mockValidate = jest.fn(() => {
				throw new Error('Multi-param validation error');
			});
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(false);
		});
	});

	describe('Error logging when validation throws', () => {
		it('should log error with parameter names when validation throws', () => {
			// >! Spy on DebugAndLog.error to verify logging
			const errorSpy = jest.spyOn(tools.default.DebugAndLog, 'error').mockImplementation(() => {});

			const mockValidate = jest.fn(() => {
				throw new Error('Validation failed');
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Validation function threw error for parameters [id]'),
				expect.any(String)
			);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Validation failed'),
				expect.any(String)
			);
		});

		it('should log error with multiple parameter names', () => {
			const errorSpy = jest.spyOn(tools.default.DebugAndLog, 'error').mockImplementation(() => {});

			const mockValidate = jest.fn(() => {
				throw new Error('Multi-param error');
			});
			const paramNames = ['page', 'limit', 'sort'];
			const paramValues = { page: 1, limit: 10, sort: 'asc' };

			ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Validation function threw error for parameters [page, limit, sort]'),
				expect.any(String)
			);
		});

		it('should log error message from thrown error', () => {
			const errorSpy = jest.spyOn(tools.default.DebugAndLog, 'error').mockImplementation(() => {});

			const mockValidate = jest.fn(() => {
				throw new Error('Custom error message');
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Custom error message'),
				expect.any(String)
			);
		});

		it('should log stack trace when error is thrown', () => {
			const errorSpy = jest.spyOn(tools.default.DebugAndLog, 'error').mockImplementation(() => {});

			const mockValidate = jest.fn(() => {
				const error = new Error('Error with stack');
				throw error;
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(errorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining('Error: Error with stack')
			);
		});

		it('should handle error without message gracefully', () => {
			const errorSpy = jest.spyOn(tools.default.DebugAndLog, 'error').mockImplementation(() => {});

			const mockValidate = jest.fn(() => {
				throw new Error();
			});
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(errorSpy).toHaveBeenCalledTimes(1);
			// Should still log even with empty error message
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Validation function threw error'),
				expect.any(String)
			);
		});
	});

	describe('Multi-parameter object structure', () => {
		it('should create object with exact parameter names as keys', () => {
			const mockValidate = jest.fn((params) => {
				// Verify keys match parameter names
				const keys = Object.keys(params);
				return keys.includes('userId') && keys.includes('sessionId');
			});
			const paramNames = ['userId', 'sessionId'];
			const paramValues = { userId: '123', sessionId: 'abc' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should include parameters with falsy values', () => {
			const mockValidate = jest.fn((params) => {
				return params.count === 0 && params.enabled === false && params.name === '';
			});
			const paramNames = ['count', 'enabled', 'name'];
			const paramValues = { count: 0, enabled: false, name: '' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should not include extra parameters not in paramNames', () => {
			const mockValidate = jest.fn((params) => {
				const keys = Object.keys(params);
				return keys.length === 2 && !keys.includes('extra');
			});
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10, extra: 'should not be included' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should handle empty paramNames array', () => {
			const mockValidate = jest.fn((params) => {
				return Object.keys(params).length === 0;
			});
			const paramNames = [];
			const paramValues = { page: 1, limit: 10 };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(true);
		});
	});

	describe('Edge cases', () => {
		it('should handle validation function that returns truthy non-boolean', () => {
			const mockValidate = jest.fn().mockReturnValue('truthy string');
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			// Should return the truthy value as-is
			expect(result).toBe('truthy string');
		});

		it('should handle validation function that returns falsy non-boolean', () => {
			const mockValidate = jest.fn().mockReturnValue(0);
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			// Should return the falsy value as-is
			expect(result).toBe(0);
		});

		it('should handle validation function that returns undefined', () => {
			const mockValidate = jest.fn().mockReturnValue(undefined);
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(undefined);
		});

		it('should handle validation function that returns null', () => {
			const mockValidate = jest.fn().mockReturnValue(null);
			const paramNames = ['id'];
			const paramValues = { id: '123' };

			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);

			expect(result).toBe(null);
		});

		it('should handle paramValues being null', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['id'];
			const paramValues = null;

			// Should catch error and return false
			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);
			expect(result).toBe(false);
		});

		it('should handle paramValues being undefined', () => {
			const mockValidate = jest.fn().mockReturnValue(true);
			const paramNames = ['id'];
			const paramValues = undefined;

			// Should catch error and return false
			const result = ValidationExecutor.execute(mockValidate, paramNames, paramValues);
			expect(result).toBe(false);
		});
	});

	describe('Real-world validation scenarios', () => {
		it('should validate single ID parameter', () => {
			const validateId = (id) => typeof id === 'string' && id.length > 0;
			const paramNames = ['id'];
			const paramValues = { id: 'P-123' };

			const result = ValidationExecutor.execute(validateId, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should validate pagination parameters', () => {
			const validatePagination = ({ page, limit }) => {
				return page >= 1 && limit >= 1 && limit <= 100;
			};
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 1, limit: 10 };

			const result = ValidationExecutor.execute(validatePagination, paramNames, paramValues);

			expect(result).toBe(true);
		});

		it('should reject invalid pagination parameters', () => {
			const validatePagination = ({ page, limit }) => {
				return page >= 1 && limit >= 1 && limit <= 100;
			};
			const paramNames = ['page', 'limit'];
			const paramValues = { page: 0, limit: 200 };

			const result = ValidationExecutor.execute(validatePagination, paramNames, paramValues);

			expect(result).toBe(false);
		});

		it('should validate search query with multiple parameters', () => {
			const validateSearch = ({ query, limit, offset }) => {
				return query && query.length > 0 && limit > 0 && offset >= 0;
			};
			const paramNames = ['query', 'limit', 'offset'];
			const paramValues = { query: 'test', limit: 10, offset: 0 };

			const result = ValidationExecutor.execute(validateSearch, paramNames, paramValues);

			expect(result).toBe(true);
		});
	});
});
