import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

/**
 * Property-Based Tests for Validation Function Interface Selection
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 4: Validation Function Interface Selection
 * 
 * Validates Requirements: 7.1, 7.2, 7.7, 13.4, 13.5, 14.1, 14.2, 14.3
 * 
 * This test suite verifies that validation functions receive the correct interface
 * based on the number of parameters specified in the route pattern:
 * - Single parameter: validation function receives the value directly
 * - Multiple parameters: validation function receives an object with parameter names as keys
 */
describe('Property 4: Validation Function Interface Selection', () => {
	/**
	 * Property: Single-parameter validations receive value directly
	 * 
	 * For any route pattern with a single parameter specification,
	 * the validation function SHALL receive the parameter value directly
	 * (not wrapped in an object).
	 */
	it('Property 4.1: Single-parameter validations receive value directly', async () => {
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
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					let receivedValue;
					let receivedType;
					let callCount = 0;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						callCount++;
						return true;
					};
					
					// >! Create configuration with single-parameter specification
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([paramName]);
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify single value was passed directly, not wrapped in object
					expect(callCount).toBe(1);
					expect(receivedValue).toBe(paramValue);
					
					// Should receive the value directly, not an object
					if (paramValue !== null && paramValue !== undefined) {
						expect(receivedType).not.toBe('object');
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multi-parameter validations receive object
	 * 
	 * For any route pattern with multiple parameter specifications,
	 * the validation function SHALL receive an object with parameter names
	 * as keys and parameter values as values.
	 */
	it('Property 4.2: Multi-parameter validations receive object', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.oneof(fc.string(), fc.integer()),
					param2Value: fc.oneof(fc.string(), fc.integer()),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name }) => param1Name !== param2Name),
				async ({ param1Name, param2Name, param1Value, param2Value, httpMethod, routePattern }) => {
					let receivedValue;
					let receivedType;
					let callCount = 0;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						callCount++;
						return true;
					};
					
					// >! Create configuration with multi-parameter specification
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${param1Name},${param2Name}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(param1Name);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([param1Name, param2Name]);
					
					// >! Execute validation
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value
					};
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify object was passed with both parameters
					expect(callCount).toBe(1);
					expect(receivedType).toBe('object');
					expect(receivedValue).toEqual({
						[param1Name]: param1Value,
						[param2Name]: param2Value
					});
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multi-parameter objects include all specified parameters
	 * 
	 * For any multi-parameter validation, the object passed to the validation
	 * function SHALL include ALL specified parameters with their correct names,
	 * even if some parameter values are undefined or null.
	 */
	it('Property 4.3: Multi-parameter objects include all specified parameters', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param3Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					// Some parameters may be undefined
					param1Value: fc.option(fc.string(), { nil: undefined }),
					param2Value: fc.option(fc.integer(), { nil: undefined }),
					param3Value: fc.option(fc.boolean(), { nil: undefined }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name, param3Name }) => {
					return param1Name !== param2Name && 
					       param1Name !== param3Name && 
					       param2Name !== param3Name;
				}),
				async ({ param1Name, param2Name, param3Name, param1Value, param2Value, param3Value, httpMethod, routePattern }) => {
					let receivedValue;
					
					// >! Validation function that captures the object
					const validateFn = (value) => {
						receivedValue = value;
						return true;
					};
					
					// >! Create configuration with three-parameter specification
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${param1Name},${param2Name},${param3Name}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(param1Name);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([param1Name, param2Name, param3Name]);
					
					// >! Execute validation with some parameters potentially undefined
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value,
						[param3Name]: param3Value
					};
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify all parameters are included in the object
					expect(receivedValue).toHaveProperty(param1Name);
					expect(receivedValue).toHaveProperty(param2Name);
					expect(receivedValue).toHaveProperty(param3Name);
					
					// >! Verify values match (including undefined)
					expect(receivedValue[param1Name]).toBe(param1Value);
					expect(receivedValue[param2Name]).toBe(param2Value);
					expect(receivedValue[param3Name]).toBe(param3Value);
					
					// >! Verify no extra properties
					const keys = Object.keys(receivedValue);
					expect(keys.length).toBe(3);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Interface selection is consistent across parameter types
	 * 
	 * The interface selection (single value vs object) should be consistent
	 * regardless of parameter types (query, path, mixed).
	 */
	it('Property 4.4: Interface selection consistent across parameter types', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					queryParam: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					pathParam: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					queryValue: fc.string(),
					pathValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePrefix: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ queryParam, pathParam }) => queryParam !== pathParam),
				async ({ queryParam, pathParam, queryValue, pathValue, httpMethod, routePrefix }) => {
					let receivedValue;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						return true;
					};
					
					// >! Create configuration with mixed parameter types (path + query)
					const routePattern = `${routePrefix}/{${pathParam}}`;
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${queryParam}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(queryParam);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([queryParam]);
					
					// >! Execute validation - should receive single value for single param
					const paramValues = {
						[queryParam]: queryValue,
						[pathParam]: pathValue
					};
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify single value interface (not object)
					expect(receivedValue).toBe(queryValue);
					expect(typeof receivedValue).not.toBe('object');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Parameter order preserved in multi-parameter object
	 * 
	 * For multi-parameter validations, the object keys should match the
	 * parameter specification order.
	 */
	it('Property 4.5: Parameter order preserved in multi-parameter object', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					// Generate 2-4 parameter names
					paramCount: fc.integer({ min: 2, max: 4 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramCount, httpMethod, routePattern }) => {
					// >! Generate unique parameter names
					const paramNames = [];
					for (let i = 0; i < paramCount; i++) {
						paramNames.push(`param${i}`);
					}
					
					let receivedValue;
					
					// >! Validation function that captures the object
					const validateFn = (value) => {
						receivedValue = value;
						return true;
					};
					
					// >! Create configuration with multiple parameters
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramNames.join(',')}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramNames[0]);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual(paramNames);
					
					// >! Execute validation
					const paramValues = {};
					paramNames.forEach((name, index) => {
						paramValues[name] = `value${index}`;
					});
					
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify all parameters are present in correct order
					const receivedKeys = Object.keys(receivedValue);
					expect(receivedKeys).toEqual(paramNames);
					
					// >! Verify values match
					paramNames.forEach((name, index) => {
						expect(receivedValue[name]).toBe(`value${index}`);
					});
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Empty parameter list results in empty object
	 * 
	 * When paramNames is an empty array, the validation function should
	 * receive an empty object (not a single value).
	 */
	it('Property 4.6: Empty parameter list results in empty object', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ httpMethod, routePattern }) => {
					let receivedValue;
					let receivedType;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						return true;
					};
					
					// >! Execute with empty parameter list
					const paramNames = [];
					const paramValues = { someParam: 'someValue' };
					
					ValidationExecutor.execute(validateFn, paramNames, paramValues);
					
					// >! Verify empty object is passed (not single value)
					expect(receivedType).toBe('object');
					expect(receivedValue).toEqual({});
					expect(Object.keys(receivedValue).length).toBe(0);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Interface selection deterministic for same parameter count
	 * 
	 * For the same number of parameters, the interface selection should
	 * always be the same (single value for 1 param, object for multiple).
	 */
	it('Property 4.7: Interface selection deterministic for same parameter count', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, routePattern }) => {
					const results = [];
					
					// >! Execute validation multiple times
					for (let i = 0; i < 3; i++) {
						let receivedValue;
						let receivedType;
						
						const validateFn = (value) => {
							receivedValue = value;
							receivedType = typeof value;
							return true;
						};
						
						const paramNames = [paramName];
						const paramValues = { [paramName]: paramValue };
						
						ValidationExecutor.execute(validateFn, paramNames, paramValues);
						
						results.push({ receivedValue, receivedType });
					}
					
					// >! Verify all executions produced identical results
					const firstResult = results[0];
					for (const result of results) {
						expect(result.receivedValue).toBe(firstResult.receivedValue);
						expect(result.receivedType).toBe(firstResult.receivedType);
					}
					
					// >! Verify single value interface was used
					expect(firstResult.receivedValue).toBe(paramValue);
					expect(firstResult.receivedType).not.toBe('object');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multi-parameter validation with missing values
	 * 
	 * When some parameters are missing from paramValues, they should still
	 * be included in the object passed to the validation function with
	 * undefined values.
	 */
	it('Property 4.8: Multi-parameter validation includes missing parameters as undefined', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.string(),
					// param2 will be missing from paramValues
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name }) => param1Name !== param2Name),
				async ({ param1Name, param2Name, param1Value, httpMethod, routePattern }) => {
					let receivedValue;
					
					// >! Validation function that captures the object
					const validateFn = (value) => {
						receivedValue = value;
						return true;
					};
					
					// >! Create configuration with two parameters
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${param1Name},${param2Name}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(param1Name);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([param1Name, param2Name]);
					
					// >! Execute validation with only param1 in paramValues
					const paramValues = {
						[param1Name]: param1Value
						// param2Name is missing
					};
					
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify both parameters are in the object
					expect(receivedValue).toHaveProperty(param1Name);
					expect(receivedValue).toHaveProperty(param2Name);
					
					// >! Verify param1 has correct value, param2 is undefined
					expect(receivedValue[param1Name]).toBe(param1Value);
					expect(receivedValue[param2Name]).toBeUndefined();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Single-parameter validation with null/undefined values
	 * 
	 * When a single parameter has null or undefined value, it should be
	 * passed directly to the validation function (not wrapped in object).
	 */
	it('Property 4.9: Single-parameter validation passes null/undefined directly', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.constantFrom(null, undefined),
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
					
					// >! Create configuration with single parameter
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([paramName]);
					
					// >! Execute validation
					const paramValues = { [paramName]: paramValue };
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify null/undefined was passed directly
					expect(callCount).toBe(1);
					expect(receivedValue).toBe(paramValue);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multi-parameter validation with all null/undefined values
	 * 
	 * When all parameters have null or undefined values, they should still
	 * be passed as an object with all parameter names as keys.
	 */
	it('Property 4.10: Multi-parameter validation with all null/undefined values', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
					param1Value: fc.constantFrom(null, undefined),
					param2Value: fc.constantFrom(null, undefined),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/)
				}).filter(({ param1Name, param2Name }) => param1Name !== param2Name),
				async ({ param1Name, param2Name, param1Value, param2Value, httpMethod, routePattern }) => {
					let receivedValue;
					let receivedType;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						return true;
					};
					
					// >! Create configuration with two parameters
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${param1Name},${param2Name}`,
								validate: validateFn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(param1Name);
					
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual([param1Name, param2Name]);
					
					// >! Execute validation with null/undefined values
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value
					};
					
					ValidationExecutor.execute(rule.validate, rule.params, paramValues);
					
					// >! Verify object was passed (not single value)
					expect(receivedType).toBe('object');
					expect(receivedValue).toHaveProperty(param1Name);
					expect(receivedValue).toHaveProperty(param2Name);
					expect(receivedValue[param1Name]).toBe(param1Value);
					expect(receivedValue[param2Name]).toBe(param2Value);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 4: Validation Function Interface Selection
