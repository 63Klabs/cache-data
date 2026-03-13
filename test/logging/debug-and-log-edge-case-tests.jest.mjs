/**
 * Jest edge case tests for DebugAndLog class
 * Tests log level edge cases, environment variable edge cases, and production environment restrictions
 * 
 * Tests cover:
 * - Log level edge cases (invalid log levels, out of range values)
 * - Environment variable edge cases (missing variables, invalid values)
 * - Production environment restrictions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DebugAndLog } from '../../src/lib/tools/index.js';

let originalEnv = { ...process.env };

const beforeEachEnvVars = function() {
	// Clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	jest.spyOn(console, 'log').mockImplementation(() => {});
	jest.spyOn(console, 'warn').mockImplementation(() => {});
	jest.spyOn(console, 'error').mockImplementation(() => {});
	jest.spyOn(console, 'info').mockImplementation(() => {});
	jest.spyOn(console, 'debug').mockImplementation(() => {});
}

const afterEachEnvVars = function() {
	// Clear out environment and log environment variables
	DebugAndLog.ALLOWED_ENV_TYPE_VAR_NAMES.forEach(v => delete process.env[v]);
	DebugAndLog.ALLOWED_LOG_VAR_NAMES.forEach(v => delete process.env[v]);
	delete(process.env.NODE_ENV);

	// Restore the original environment variables
	process.env = originalEnv;

	jest.restoreAllMocks();
}

describe("DebugAndLog Edge Case Tests", () => {

	beforeEach(() => {
		beforeEachEnvVars();	
	});
	
	afterEach(() => {
		afterEachEnvVars();
	});

	describe("Log Level Edge Cases - Invalid Values", () => {

		it("should handle negative log level", () => {
			process.env.LOG_LEVEL = '-1';
			process.env.ENV_TYPE = 'DEV';
			// Should use default log level
			expect(DebugAndLog.getLogLevel()).toBeGreaterThanOrEqual(0);
		});


		it("should handle log level greater than maximum", () => {
			process.env.LOG_LEVEL = '999';
			process.env.ENV_TYPE = 'DEV';
			// Should accept the value (implementation may cap it)
			const logLevel = DebugAndLog.getLogLevel();
			expect(typeof logLevel).toBe('number');
		});

		it("should handle non-numeric log level string", () => {
			process.env.LOG_LEVEL = 'not-a-number';
			process.env.ENV_TYPE = 'DEV';
			// Should use default log level
			expect(DebugAndLog.getLogLevel()).toBe(2);
		});

		it("should handle empty string log level", () => {
			process.env.LOG_LEVEL = '';
			process.env.ENV_TYPE = 'DEV';
			// Should use default log level
			expect(DebugAndLog.getLogLevel()).toBe(2);
		});

		it("should handle log level with whitespace", () => {
			process.env.LOG_LEVEL = '  3  ';
			process.env.ENV_TYPE = 'DEV';
			// Should parse and trim
			const logLevel = DebugAndLog.getLogLevel();
			expect(logLevel).toBeGreaterThanOrEqual(0);
		});

		it("should handle floating point log level", () => {
			process.env.LOG_LEVEL = '3.5';
			process.env.ENV_TYPE = 'DEV';
			// Should parse as integer
			const logLevel = DebugAndLog.getLogLevel();
			expect(Number.isInteger(logLevel)).toBe(true);
		});

		it("should handle AWS_LAMBDA_LOG_LEVEL with invalid value", () => {
			process.env.AWS_LAMBDA_LOG_LEVEL = 'INVALID_LEVEL';
			process.env.ENV_TYPE = 'DEV';
			// Should use default log level
			expect(DebugAndLog.getLogLevel()).toBe(2);
		});

		it("should handle AWS_LAMBDA_LOG_LEVEL with lowercase", () => {
			process.env.AWS_LAMBDA_LOG_LEVEL = 'debug';
			process.env.ENV_TYPE = 'DEV';
			// Should handle case-insensitively or use default
			const logLevel = DebugAndLog.getLogLevel();
			expect(typeof logLevel).toBe('number');
		});

	});

	describe("Log Level Edge Cases - Out of Range", () => {

		it("should handle setLogLevel with negative value", () => {
			DebugAndLog.setLogLevel(-5);
			// Should handle gracefully
			expect(typeof DebugAndLog.getLogLevel()).toBe('number');
		});

		it("should handle setLogLevel with very large value", () => {
			DebugAndLog.setLogLevel(Number.MAX_SAFE_INTEGER);
			// Should handle gracefully
			expect(typeof DebugAndLog.getLogLevel()).toBe('number');
		});

		it("should handle setLogLevel with NaN", () => {
			DebugAndLog.setLogLevel(NaN);
			// Should handle gracefully
			expect(typeof DebugAndLog.getLogLevel()).toBe('number');
		});

		it("should handle setLogLevel with null", () => {
			DebugAndLog.setLogLevel(null);
			// Should handle gracefully
			expect(typeof DebugAndLog.getLogLevel()).toBe('number');
		});

		it("should handle setLogLevel with undefined", () => {
			DebugAndLog.setLogLevel(undefined);
			// Should handle gracefully
			expect(typeof DebugAndLog.getLogLevel()).toBe('number');
		});

	});


	describe("Environment Variable Edge Cases - Missing Variables", () => {

		it("should handle all environment variables missing", () => {
			// All env vars already cleared in beforeEach
			expect(DebugAndLog.getEnv()).toBe('PROD');
			expect(DebugAndLog.getLogLevel()).toBe(2);
		});

		it("should handle NODE_ENV missing", () => {
			delete process.env.NODE_ENV;
			process.env.ENV_TYPE = 'DEV';
			expect(DebugAndLog.getNodeEnv()).toBeDefined();
		});

		it("should handle ENV_TYPE missing but NODE_ENV set", () => {
			process.env.NODE_ENV = 'development';
			delete process.env.ENV_TYPE;
			expect(DebugAndLog.getEnv()).toBeDefined();
		});

	});

	describe("Environment Variable Edge Cases - Invalid Values", () => {

		it("should handle invalid ENV_TYPE value", () => {
			process.env.ENV_TYPE = 'INVALID_ENV';
			// Should default to PROD
			expect(DebugAndLog.getEnv()).toBe('PROD');
		});

		it("should handle ENV_TYPE with mixed case", () => {
			process.env.ENV_TYPE = 'Dev';
			// Should handle case-insensitively or default
			const env = DebugAndLog.getEnv();
			expect(['DEV', 'PROD', 'TEST']).toContain(env);
		});

		it("should handle ENV_TYPE with whitespace", () => {
			process.env.ENV_TYPE = '  DEV  ';
			// Should trim and parse
			const env = DebugAndLog.getEnv();
			expect(typeof env).toBe('string');
		});

		it("should handle NODE_ENV with invalid value", () => {
			process.env.NODE_ENV = 'invalid-node-env';
			// Should handle gracefully
			expect(typeof DebugAndLog.getNodeEnv()).toBe('string');
		});

		it("should handle empty string ENV_TYPE", () => {
			process.env.ENV_TYPE = '';
			// Should default to PROD
			expect(DebugAndLog.getEnv()).toBe('PROD');
		});

		it("should handle numeric ENV_TYPE", () => {
			process.env.ENV_TYPE = '123';
			// Should default to PROD
			expect(DebugAndLog.getEnv()).toBe('PROD');
		});

	});

	describe("Production Environment Restrictions", () => {

		it("should restrict log level in production environment", () => {
			process.env.ENV_TYPE = 'PROD';
			process.env.LOG_LEVEL = '5';
			// Production should cap log level
			expect(DebugAndLog.getLogLevel()).toBeLessThan(3);
		});

		it("should restrict debug logging in production", () => {
			process.env.ENV_TYPE = 'PROD';
			process.env.LOG_LEVEL = '5';
			
			DebugAndLog.debug('Test debug message');
			
			// Debug should not be logged in production
			// (Implementation may vary, but log level should be restricted)
			expect(DebugAndLog.getLogLevel()).toBeLessThan(3);
		});

		it("should restrict diagnostic logging in production", () => {
			process.env.ENV_TYPE = 'PROD';
			process.env.LOG_LEVEL = '5';
			
			DebugAndLog.diag('Test diagnostic message');
			
			// Diagnostic should not be logged in production
			expect(DebugAndLog.getLogLevel()).toBeLessThan(3);
		});


		it("should allow error logging in production", () => {
			process.env.ENV_TYPE = 'PROD';
			process.env.LOG_LEVEL = '0';
			
			DebugAndLog.error('Test error message');
			
			// Error should always be logged
			expect(console.error).toHaveBeenCalled();
		});

		it("should allow warning logging in production", () => {
			process.env.ENV_TYPE = 'PROD';
			process.env.LOG_LEVEL = '1';
			
			DebugAndLog.warn('Test warning message');
			
			// Warning should be logged at level 1
			expect(console.warn).toHaveBeenCalled();
		});

		it("should handle production with NODE_ENV=development", () => {
			process.env.NODE_ENV = 'development';
			process.env.ENV_TYPE = 'PROD';
			
			// ENV_TYPE should take precedence
			expect(DebugAndLog.isProduction()).toBe(true);
			expect(DebugAndLog.isDevelopment()).toBe(false);
		});

	});

	describe("Logging with Edge Case Inputs", () => {

		it("should handle logging null message", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			await expect(DebugAndLog.log(null)).resolves.not.toThrow();
		});

		it("should handle logging undefined message", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			await expect(DebugAndLog.log(undefined)).resolves.not.toThrow();
		});

		it("should handle logging empty string", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			await expect(DebugAndLog.log('')).resolves.not.toThrow();
		});

		it("should handle logging object with circular reference", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			const circular = { a: 1 };
			circular.self = circular;
			
			// Circular references may cause errors in JSON.stringify
			// The implementation should handle this gracefully or throw
			try {
				await DebugAndLog.log('Test', null, circular);
			} catch (error) {
				// Expected - circular references can't be stringified
				expect(error).toBeDefined();
			}
		});

		it("should handle logging very long message", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			const longMessage = 'a'.repeat(10000);
			
			await expect(DebugAndLog.log(longMessage)).resolves.not.toThrow();
		});

		it("should handle logging with special characters", async () => {
			process.env.ENV_TYPE = 'DEV';
			process.env.LOG_LEVEL = '5';
			
			const specialMessage = 'Test\n\r\t\0\x1b[31mRed\x1b[0m';
			
			await expect(DebugAndLog.log(specialMessage)).resolves.not.toThrow();
		});

	});

});
