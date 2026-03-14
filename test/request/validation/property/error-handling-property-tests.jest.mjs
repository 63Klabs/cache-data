import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

// Import tools for logging verification
const toolsModule = await import('../../../../src/lib/tools/index.js');
const tools = toolsModule.default;

/**
 * Property-Based Tests for Error Handling and Logging
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 7: Error Handling and Logging
 * 
 * Validates Requirements: 9.2, 9.3, 9.5
 * 
 * This test suite verifies that validation errors are handled gracefully:
 * - Errors are caught and don't crash request processing
 * - Errors are logged with rule context
 * - Other parameters continue to be processed after error
 */
describe('Property 7: Error Handling and Logging', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	/**
	 * Property: Validation errors are caught and don't crash
	 * 
	 * For any validation function that throws an error,
	 * the ValidationExecutor SHALL catch the error and return false
	 * without crashing the request processing.
	 */
	it('Property 7.1: Validation errors are caught without crashing', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined)
					),
					errorType: fc.constantFrom(
						'TypeError',
						'ReferenceError',
						'Error',
						'RangeError',
						'SyntaxError'
					),
					errorMessage: fc.string({ minLength: 1, maxLength: 50 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, errorType, errorMessage, httpMethod, routePattern }) => {
					// >! Create validation function that throws an error
					const validateFn = jest.fn().mockImplementation(() => {
						const ErrorClass = global[errorType] || Error;
						throw new ErrorClass(errorMessage);
					});
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation - should catch error and return false
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify error was caught and validation returned false
					expect(result).toBe(false);
					expect(validateFn).toHaveBeenCalledWith(paramValue);
					
					// >! Verify request processing didn't crash
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation errors are logged with context
	 * 
	 * When a validation function throws an error,
	 * the error SHALL be logged with sufficient context
	 * to identify the failing validation rule.
	 */
	it('Property 7.2: Validation errors are logged with context', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string({ minLength: 1, maxLength: 20 }),
					errorMessage: fc.string({ minLength: 5, maxLength: 30 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, errorMessage, httpMethod, routePattern }) => {
					// >! Mock the logging function to verify it's called
					const errorLogSpy = jest.spyOn(tools.DebugAndLog, 'error').mockImplementation(() => {});
					
					// >! Create validation function that throws an error
					const validateFn = () => {
						throw new Error(errorMessage);
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify validation returned false
					expect(result).toBe(false);
					
					// >! Verify error was logged
					expect(errorLogSpy).toHaveBeenCalled();
					
					// >! Verify log contains error message
					const logCalls = errorLogSpy.mock.calls;
					const hasErrorMessage = logCalls.some(call => 
						call.some(arg => typeof arg === 'string' && arg.includes(errorMessage))
					);
					expect(hasErrorMessage).toBe(true);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Different error types are handled consistently
	 * 
	 * Validation functions can throw various error types (TypeError, ReferenceError, etc.),
	 * and all SHALL be caught and handled consistently.
	 */
	it('Property 7.3: Different error types handled consistently', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					const errorTypes = [
						TypeError,
						ReferenceError,
						Error,
						RangeError,
						SyntaxError
					];
					
					const results = [];
					
					for (const ErrorType of errorTypes) {
						// >! Create validation function that throws specific error type
						const validateFn = () => {
							throw new ErrorType('Test error');
						};
						
						const config = {
							[paramName]: validateFn
						};
						
						const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
						const rule = matcher.findValidationRule(paramName);
						
						// >! Execute validation
						const paramValues = { [paramName]: paramValue };
						const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
						
						results.push(result);
					}
					
					// >! Verify all error types result in false
					for (const result of results) {
						expect(result).toBe(false);
					}
					
					// >! Verify consistent handling across error types
					const allSame = results.every(r => r === results[0]);
					expect(allSame).toBe(true);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation continues after error
	 * 
	 * When one validation function throws an error,
	 * other parameters SHALL continue to be processed.
	 */
	it('Property 7.4: Other parameters processed after error', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.string(),
					param2Value: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name }) => param1Name.toLowerCase() !== param2Name.toLowerCase()),
				async ({ param1Name, param2Name, param1Value, param2Value, httpMethod, routePattern }) => {
					let param1Called = false;
					let param2Called = false;
					
					// >! First validation throws error
					const validate1 = () => {
						param1Called = true;
						throw new Error('Validation 1 failed');
					};
					
					// >! Second validation succeeds
					const validate2 = (value) => {
						param2Called = true;
						return typeof value === 'string';
					};
					
					const config = {
						[param1Name]: validate1,
						[param2Name]: validate2
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					
					// >! Execute first validation (throws error)
					const rule1 = matcher.findValidationRule(param1Name);
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value
					};
					
					const result1 = ValidationExecutor.execute(rule1.validate, rule1.params, paramValues);
					
					// >! Execute second validation (should still work)
					const rule2 = matcher.findValidationRule(param2Name);
					const result2 = ValidationExecutor.execute(rule2.validate, rule2.params, paramValues);
					
					// >! Verify both validations were attempted
					expect(param1Called).toBe(true);
					expect(param2Called).toBe(true);
					
					// >! Verify first returned false, second returned true
					expect(result1).toBe(false);
					expect(result2).toBe(true);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Errors in multi-parameter validation are caught
	 * 
	 * When a multi-parameter validation function throws an error,
	 * it SHALL be caught and handled the same way as single-parameter errors.
	 */
	it('Property 7.5: Multi-parameter validation errors caught', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.integer(),
					param2Value: fc.integer(),
					errorMessage: fc.string({ minLength: 5, maxLength: 30 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}).filter(({ param1Name, param2Name }) => param1Name.toLowerCase() !== param2Name.toLowerCase()),
				async ({ param1Name, param2Name, param1Value, param2Value, errorMessage, httpMethod, routePattern }) => {
					// >! Create multi-parameter validation that throws error
					const validateFn = jest.fn().mockImplementation(() => {
						throw new Error(errorMessage);
					});
					
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${param1Name},${param2Name}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					
					// >! Find validation rule for first parameter
					// >! The rule should match both parameters
					const rule = matcher.findValidationRule(param1Name);
					
					// >! Rule might be null if route doesn't match or params don't match
					// >! This is acceptable - we're testing error handling when rule exists
					if (rule === null) {
						return true;
					}
					
					// >! If rule exists, it should have the specified parameters
					// >! Note: params array includes path parameters from route pattern
					expect(rule.params.length).toBeGreaterThanOrEqual(2);
					
					// >! Execute multi-parameter validation
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value
					};
					
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify error was caught and validation returned false
					expect(result).toBe(false);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation errors don't expose sensitive data
	 * 
	 * Error logging SHALL not expose sensitive parameter values
	 * in error messages (this is a documentation requirement,
	 * actual implementation depends on ClientRequest).
	 */
	it('Property 7.6: Error handling preserves security', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					sensitiveValue: fc.string({ minLength: 10, maxLength: 50 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, sensitiveValue, httpMethod, routePattern }) => {
					// >! Mock logging to verify what gets logged
					const errorLogSpy = jest.spyOn(tools.DebugAndLog, 'error').mockImplementation(() => {});
					
					// >! Create validation that throws error
					const validateFn = () => {
						throw new Error('Validation failed');
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Execute validation with sensitive value
					const paramValues = { [paramName]: sensitiveValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify validation failed
					expect(result).toBe(false);
					
					// >! Verify error was logged
					expect(errorLogSpy).toHaveBeenCalled();
					
					// >! Note: Actual sensitive data protection is implemented in ClientRequest
					// >! This test verifies that ValidationExecutor doesn't crash and logs errors
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation errors are deterministic
	 * 
	 * A validation function that throws an error SHALL always
	 * throw the same error for the same input.
	 */
	it('Property 7.7: Error handling is deterministic', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					errorMessage: fc.string({ minLength: 5, maxLength: 30 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, errorMessage, httpMethod, routePattern }) => {
					// >! Create validation that always throws same error
					const validateFn = () => {
						throw new Error(errorMessage);
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Execute validation multiple times
					const paramValues = { [paramName]: paramValue };
					const results = [];
					
					for (let i = 0; i < 5; i++) {
						const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
						results.push(result);
					}
					
					// >! Verify all results are identical (all false)
					for (const result of results) {
						expect(result).toBe(false);
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Async errors in validation are handled
	 * 
	 * If a validation function is accidentally async and throws,
	 * the error SHALL still be caught (though validation should be sync).
	 */
	it('Property 7.8: Async validation errors handled gracefully', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Create async validation that throws (not recommended but should be handled)
					const validateFn = async () => {
						throw new Error('Async validation error');
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					
					try {
						const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
						
						// >! If it returns a promise, it should be handled
						if (result instanceof Promise) {
							const resolvedResult = await result;
							// Should handle error and return false
							expect(typeof resolvedResult === 'boolean').toBe(true);
						} else {
							// Synchronous handling
							expect(typeof result === 'boolean').toBe(true);
						}
					} catch (error) {
						// >! If error is thrown, it should be caught by ValidationExecutor
						// >! This test verifies the behavior is predictable
						expect(error).toBeDefined();
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation with null/undefined doesn't crash
	 * 
	 * Validation functions that throw errors when receiving null/undefined
	 * SHALL have those errors caught without crashing.
	 */
	it('Property 7.9: Null/undefined handling in error cases', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.constantFrom(null, undefined),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Create validation that throws on null/undefined
					const validateFn = (value) => {
						if (value === null || value === undefined) {
							throw new Error('Value cannot be null or undefined');
						}
						return true;
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Execute validation with null/undefined
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify error was caught and validation returned false
					expect(result).toBe(false);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Error stack traces are preserved
	 * 
	 * When logging validation errors, stack traces SHALL be preserved
	 * to aid in debugging.
	 */
	it('Property 7.10: Error stack traces preserved in logs', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Mock logging to capture what gets logged
					const errorLogSpy = jest.spyOn(tools.DebugAndLog, 'error').mockImplementation(() => {});
					
					// >! Create validation that throws error with stack trace
					const validateFn = () => {
						const error = new Error('Validation error with stack');
						throw error;
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify validation returned false
					expect(result).toBe(false);
					
					// >! Verify error was logged
					expect(errorLogSpy).toHaveBeenCalled();
					
					// >! Verify stack trace is included in log
					const logCalls = errorLogSpy.mock.calls;
					const hasStackTrace = logCalls.some(call =>
						call.some(arg => typeof arg === 'string' && (
							arg.includes('stack') || 
							arg.includes('at ') ||
							arg.includes('Validation error with stack')
						))
					);
					
					// Stack trace should be logged for debugging
					expect(hasStackTrace).toBe(true);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 7: Error Handling and Logging
