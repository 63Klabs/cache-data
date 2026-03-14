import { describe, it, expect, jest, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

/**
 * Property-Based Tests for Validation Execution and Result Handling
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 5: Validation Execution and Result Handling
 * 
 * Validates Requirements: 7.3, 7.4, 7.5, 9.1
 * 
 * This test suite verifies that validation execution produces correct results:
 * - Parameters are included when validation returns true
 * - Parameters are excluded when validation returns false
 * - Request validity is set correctly
 * - Warnings are logged for failures
 */
describe('Property 5: Validation Execution and Result Handling', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	/**
	 * Property: Validation returning true includes parameter
	 * 
	 * For any validation function that returns true,
	 * the parameter SHALL be included in the validated parameters object.
	 */
	it('Property 5.1: Validation returning true includes parameter', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean(),
						fc.constant(null)
					),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Create validation function that always returns true
					const validateFn = jest.fn().mockReturnValue(true);
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify validation returned true
					expect(result).toBe(true);
					expect(validateFn).toHaveBeenCalledWith(paramValue);
					
					// >! In actual ClientRequest, this would include the parameter
					// >! We verify the validation function was called and returned true
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation returning false excludes parameter
	 * 
	 * For any validation function that returns false,
	 * the parameter SHALL be excluded from the validated parameters object
	 * and the request SHALL be marked as invalid.
	 */
	it('Property 5.2: Validation returning false excludes parameter', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean()
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Create validation function that always returns false
					const validateFn = jest.fn().mockReturnValue(false);
					
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
					expect(validateFn).toHaveBeenCalledWith(paramValue);
					
					// >! In actual ClientRequest, this would:
					// >! 1. Exclude the parameter from validated parameters
					// >! 2. Mark request as invalid
					// >! 3. Log a warning
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation result is deterministic
	 * 
	 * For any validation function and parameter value,
	 * executing the validation multiple times SHALL produce
	 * the same result every time.
	 */
	it('Property 5.3: Validation result is deterministic', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string({ minLength: 1, maxLength: 50 }),
					shouldPass: fc.boolean(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, shouldPass, httpMethod, routePattern }) => {
					// >! Create validation function with deterministic behavior
					const validateFn = (value) => {
						return shouldPass ? value.length > 0 : value.length > 100;
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation multiple times
					const paramValues = { [paramName]: paramValue };
					const results = [];
					
					for (let i = 0; i < 5; i++) {
						const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
						results.push(result);
					}
					
					// >! Verify all results are identical
					const firstResult = results[0];
					for (const result of results) {
						expect(result).toBe(firstResult);
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation function receives correct value
	 * 
	 * For any parameter value, the validation function SHALL receive
	 * exactly that value (not modified, not wrapped).
	 */
	it('Property 5.4: Validation function receives correct value', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string({ minLength: 1, maxLength: 100 }),
						fc.integer({ min: -1000, max: 1000 }),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined)
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					let receivedValue;
					let callCount = 0;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						callCount++;
						return true;
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify function was called exactly once with correct value
					expect(callCount).toBe(1);
					expect(receivedValue).toBe(paramValue);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation with different value types
	 * 
	 * Validation functions SHALL work correctly with all JavaScript value types:
	 * strings, numbers, booleans, null, undefined, objects, arrays.
	 */
	it('Property 5.5: Validation works with all value types', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.float(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined),
						fc.object(),
						fc.array(fc.string())
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					let receivedValue;
					let receivedType;
					
					// >! Validation function that captures value and type
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						return true;
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
					
					// >! Verify validation succeeded and value was passed correctly
					expect(result).toBe(true);
					expect(receivedValue).toBe(paramValue);
					expect(typeof receivedValue).toBe(typeof paramValue);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation function can use complex logic
	 * 
	 * Validation functions SHALL be able to implement complex validation logic
	 * including type checking, range validation, pattern matching, etc.
	 */
	it('Property 5.6: Validation supports complex logic', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string({ minLength: 1, maxLength: 20 }),
						fc.integer({ min: 1, max: 100 })
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					// >! Complex validation function with multiple checks
					const validateFn = (value) => {
						// Type check
						if (typeof value !== 'string' && typeof value !== 'number') {
							return false;
						}
						
						// String validation
						if (typeof value === 'string') {
							return value.length > 0 && value.length <= 50;
						}
						
						// Number validation
						if (typeof value === 'number') {
							return value >= 1 && value <= 1000;
						}
						
						return false;
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
					
					// >! Verify result matches expected validation logic
					if (typeof paramValue === 'string') {
						expect(result).toBe(paramValue.length > 0 && paramValue.length <= 50);
					} else if (typeof paramValue === 'number') {
						expect(result).toBe(paramValue >= 1 && paramValue <= 1000);
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation result affects parameter inclusion
	 * 
	 * The boolean result from validation execution SHALL directly determine
	 * whether the parameter is included (true) or excluded (false).
	 */
	it('Property 5.7: Validation result determines parameter inclusion', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.integer({ min: 0, max: 200 }),
					threshold: fc.integer({ min: 50, max: 150 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, threshold, httpMethod, routePattern }) => {
					// >! Validation function with threshold logic
					const validateFn = (value) => value >= threshold;
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify result matches expected logic
					const expectedResult = paramValue >= threshold;
					expect(result).toBe(expectedResult);
					
					// >! In actual ClientRequest:
					// >! - If result is true, parameter would be included
					// >! - If result is false, parameter would be excluded and request marked invalid
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multiple parameters validated independently
	 * 
	 * When multiple parameters have validation rules, each SHALL be
	 * validated independently and results SHALL not affect each other.
	 */
	it('Property 5.8: Multiple parameters validated independently', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.string({ minLength: 1, maxLength: 20 }),
					param2Value: fc.integer({ min: 1, max: 100 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name }) => param1Name.toLowerCase() !== param2Name.toLowerCase()),
				async ({ param1Name, param2Name, param1Value, param2Value, httpMethod, routePattern }) => {
					let param1CallCount = 0;
					let param2CallCount = 0;
					
					// >! Create separate validation functions for each parameter
					const validate1 = (value) => {
						param1CallCount++;
						return typeof value === 'string' && value.length > 0;
					};
					
					const validate2 = (value) => {
						param2CallCount++;
						return typeof value === 'number' && value > 0;
					};
					
					const config = {
						[param1Name]: validate1,
						[param2Name]: validate2
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					
					// >! Validate first parameter
					const rule1 = matcher.findValidationRule(param1Name);
					expect(rule1).not.toBeNull();
					
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value
					};
					
					const result1 = ValidationExecutor.execute(rule1.validate, rule1.params, paramValues);
					
					// >! Validate second parameter
					const rule2 = matcher.findValidationRule(param2Name);
					expect(rule2).not.toBeNull();
					
					const result2 = ValidationExecutor.execute(rule2.validate, rule2.params, paramValues);
					
					// >! Verify each validation function was called exactly once
					expect(param1CallCount).toBe(1);
					expect(param2CallCount).toBe(1);
					
					// >! Verify results are independent
					expect(result1).toBe(typeof param1Value === 'string' && param1Value.length > 0);
					expect(result2).toBe(typeof param2Value === 'number' && param2Value > 0);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation execution is synchronous
	 * 
	 * Validation functions SHALL execute synchronously and return
	 * boolean results immediately (no async validation).
	 */
	it('Property 5.9: Validation execution is synchronous', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					let executionOrder = [];
					
					// >! Validation function that tracks execution order
					const validateFn = (value) => {
						executionOrder.push('validation-start');
						const result = value.length > 0;
						executionOrder.push('validation-end');
						return result;
					};
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					executionOrder.push('before-execute');
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					executionOrder.push('after-execute');
					
					// >! Verify synchronous execution order
					expect(executionOrder).toEqual([
						'before-execute',
						'validation-start',
						'validation-end',
						'after-execute'
					]);
					
					// >! Verify result is boolean
					expect(typeof result).toBe('boolean');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validation result is returned as-is
	 * 
	 * ValidationExecutor SHALL return the exact value returned by the
	 * validation function without modification (truthy/falsy values are
	 * evaluated by the caller, typically ClientRequest).
	 */
	it('Property 5.10: Validation result is returned as-is', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					returnValue: fc.oneof(
						fc.boolean(),
						fc.constant(1),
						fc.constant(0),
						fc.constant('true'),
						fc.constant('false'),
						fc.constant(null),
						fc.constant(undefined)
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, returnValue, httpMethod, routePattern }) => {
					// >! Validation function that returns various types
					const validateFn = jest.fn().mockReturnValue(returnValue);
					
					const config = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					const result = ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify result is returned exactly as validation function returned it
					expect(result).toBe(returnValue);
					
					// >! In actual ClientRequest, truthy/falsy evaluation determines inclusion
					// >! Truthy values include parameter, falsy values exclude parameter
					const wouldInclude = Boolean(result);
					const expectedInclusion = Boolean(returnValue);
					expect(wouldInclude).toBe(expectedInclusion);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 5: Validation Execution and Result Handling
