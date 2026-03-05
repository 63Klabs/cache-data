import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

/**
 * Property-Based Tests for Additional Validation Properties (9-15)
 * 
 * Feature: 1-3-9-improve-validations-object
 * Properties: 9-15
 * 
 * Validates Requirements: 4.5, 5.4, 5.5, 6.3, 6.4, 11.4, 11.5, 13.1-13.3, 13.6, 14.3-14.5
 * 
 * This test suite verifies additional correctness properties including route normalization,
 * parameter specification parsing, multi-parameter validation, method matching, exclude flag
 * behavior, validation timing, and absent parameter skipping.
 */
describe('Properties 9-15: Additional Validation Properties', () => {
	/**
	 * Property 9: Route Normalization Consistency
	 * 
	 * For any two route patterns that differ only in leading/trailing slashes or letter casing,
	 * the ValidationMatcher SHALL treat them as equivalent after normalization.
	 * 
	 * Validates Requirements: 6.3, 6.4
	 */
	it('Property 9: Route normalization treats slash/case variations as equivalent', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					segment1: fc.stringMatching(/^[a-z]{3,8}$/),
					segment2: fc.stringMatching(/^[a-z]{3,8}$/),
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					// Generate different slash/case combinations
					patternVariation: fc.constantFrom('none', 'leading', 'trailing', 'both', 'upper', 'mixed'),
					routeVariation: fc.constantFrom('none', 'leading', 'trailing', 'both', 'upper', 'mixed')
				}),
				async ({ segment1, segment2, paramName, httpMethod, patternVariation, routeVariation }) => {
					// >! Create base route pattern
					let basePattern = `${segment1}/${segment2}`;
					let baseRoute = `${segment1}/${segment2}`;
					
					// >! Apply slash variations to pattern
					if (patternVariation === 'leading') basePattern = `/${basePattern}`;
					else if (patternVariation === 'trailing') basePattern = `${basePattern}/`;
					else if (patternVariation === 'both') basePattern = `/${basePattern}/`;
					else if (patternVariation === 'upper') basePattern = basePattern.toUpperCase();
					else if (patternVariation === 'mixed') {
						basePattern = basePattern.charAt(0).toUpperCase() + basePattern.slice(1);
					}
					
					// >! Apply slash variations to route
					if (routeVariation === 'leading') baseRoute = `/${baseRoute}`;
					else if (routeVariation === 'trailing') baseRoute = `${baseRoute}/`;
					else if (routeVariation === 'both') baseRoute = `/${baseRoute}/`;
					else if (routeVariation === 'upper') baseRoute = baseRoute.toUpperCase();
					else if (routeVariation === 'mixed') {
						baseRoute = baseRoute.charAt(0).toUpperCase() + baseRoute.slice(1);
					}
					
					const config = {
						BY_ROUTE: [
							{
								route: `${basePattern}?${paramName}`,
								validate: () => true
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, baseRoute);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Normalization should make them equivalent
					expect(rule).not.toBeNull();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 10: Parameter Specification Parsing
	 * 
	 * For any route pattern with parameter specifications (query parameters with ?,
	 * path parameters with {}, or comma-separated lists), the ValidationMatcher SHALL
	 * correctly extract all parameter names and use them to determine the validation
	 * function interface.
	 * 
	 * Validates Requirements: 13.1, 13.2, 13.3, 13.6
	 */
	it('Property 10: Parameter specification parsing extracts all parameter names', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					// Generate route with various parameter specifications
					routePrefix: fc.stringMatching(/^[a-z]{3,8}$/),
					pathParam1: fc.stringMatching(/^[a-z]{2,6}$/),
					pathParam2: fc.stringMatching(/^[a-z]{2,6}$/),
					queryParam1: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					queryParam2: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					// Choose parameter specification type
					specType: fc.constantFrom('single-path', 'multi-path', 'single-query', 'multi-query', 'mixed')
				}),
				async ({ routePrefix, pathParam1, pathParam2, queryParam1, queryParam2, httpMethod, specType }) => {
					let routePattern;
					let expectedParams;
					let actualRoute;
					
					// >! Build route pattern based on specification type
					if (specType === 'single-path') {
						routePattern = `${routePrefix}/{${pathParam1}}`;
						expectedParams = [pathParam1];
						actualRoute = `/${routePrefix}/value1`;
					} else if (specType === 'multi-path') {
						routePattern = `${routePrefix}/{${pathParam1}}/{${pathParam2}}`;
						expectedParams = [pathParam1, pathParam2];
						actualRoute = `/${routePrefix}/value1/value2`;
					} else if (specType === 'single-query') {
						routePattern = `${routePrefix}?${queryParam1}`;
						expectedParams = [queryParam1];
						actualRoute = `/${routePrefix}`;
					} else if (specType === 'multi-query') {
						routePattern = `${routePrefix}?${queryParam1},${queryParam2}`;
						expectedParams = [queryParam1, queryParam2];
						actualRoute = `/${routePrefix}`;
					} else { // mixed
						routePattern = `${routePrefix}/{${pathParam1}}?${queryParam1}`;
						expectedParams = [pathParam1, queryParam1];
						actualRoute = `/${routePrefix}/value1`;
					}
					
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}`,
								validate: () => true
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, actualRoute);
					
					// >! Find rule for first parameter
					const rule = matcher.findValidationRule(expectedParams[0]);
					
					// >! Verify rule was found and has correct parameter list
					expect(rule).not.toBeNull();
					expect(rule.params).toEqual(expectedParams);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 11: Multi-Parameter Validation Object Structure
	 * 
	 * For any multi-parameter validation with specified parameter names, the ValidationMatcher
	 * SHALL pass an object to the validation function that includes all specified parameters
	 * as properties, even if some parameter values are undefined or null.
	 * 
	 * Validates Requirements: 14.3, 14.4, 14.5
	 */
	it('Property 11: Multi-parameter validation includes all specified params', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					param3Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					// Generate values, some may be undefined
					param1Value: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.constant(undefined),
						fc.constant(null)
					),
					param2Value: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.constant(undefined),
						fc.constant(null)
					),
					param3Value: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.constant(undefined),
						fc.constant(null)
					)
				}).filter(({ param1Name, param2Name, param3Name }) => 
					// Ensure parameter names are unique
					param1Name !== param2Name && param2Name !== param3Name && param1Name !== param3Name
				),
				async ({ param1Name, param2Name, param3Name, param1Value, param2Value, param3Value }) => {
					let receivedObject;
					
					// >! Validation function that captures the object it receives
					const validateFn = (obj) => {
						receivedObject = obj;
						return true;
					};
					
					// >! Execute with multiple parameters
					const paramNames = [param1Name, param2Name, param3Name];
					const paramValues = {
						[param1Name]: param1Value,
						[param2Name]: param2Value,
						[param3Name]: param3Value
					};
					
					ValidationExecutor.execute(validateFn, paramNames, paramValues);
					
					// >! Verify object includes all specified parameters
					expect(receivedObject).toBeDefined();
					expect(typeof receivedObject).toBe('object');
					expect(receivedObject).toHaveProperty(param1Name);
					expect(receivedObject).toHaveProperty(param2Name);
					expect(receivedObject).toHaveProperty(param3Name);
					
					// >! Verify values match (including undefined/null)
					expect(receivedObject[param1Name]).toBe(param1Value);
					expect(receivedObject[param2Name]).toBe(param2Value);
					expect(receivedObject[param3Name]).toBe(param3Value);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 12: Method Matching Case-Insensitivity
	 * 
	 * For any HTTP method specified in validation rules (in BY_METHOD or METHOD:route patterns),
	 * the ValidationMatcher SHALL match the method case-insensitively against the request method.
	 * 
	 * Validates Requirements: 4.5
	 */
	it('Property 12: Method matching is case-insensitive', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'),
					// Generate method in various cases
					methodCase: fc.constantFrom('lower', 'upper', 'mixed', 'original'),
					routePattern: fc.stringMatching(/^[a-z]{3,8}\/\{[a-z]{2,6}\}$/),
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					// Test both BY_METHOD and METHOD:route patterns
					patternType: fc.constantFrom('by-method', 'method-route')
				}),
				async ({ httpMethod, methodCase, routePattern, paramName, patternType }) => {
					// >! Convert method to different cases
					let configMethod = httpMethod;
					if (methodCase === 'lower') {
						configMethod = httpMethod.toLowerCase();
					} else if (methodCase === 'upper') {
						configMethod = httpMethod.toUpperCase();
					} else if (methodCase === 'mixed') {
						configMethod = httpMethod.charAt(0) + httpMethod.slice(1).toLowerCase();
					}
					
					let config;
					if (patternType === 'by-method') {
						// >! Test BY_METHOD with different method cases
						config = {
							BY_METHOD: [
								{
									method: configMethod,
									validate: () => true
								}
							]
						};
					} else {
						// >! Test METHOD:route with different method cases
						config = {
							BY_ROUTE: [
								{
									route: `${configMethod}:${routePattern}?${paramName}`,
									validate: () => true
								}
							]
						};
					}
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern.replace(/\{[^}]+\}/g, 'value')}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Method matching should be case-insensitive
					expect(rule).not.toBeNull();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 13: Exclude Flag Behavior
	 * 
	 * For any parameter without a matching validation rule, the ValidationMatcher SHALL
	 * return null, allowing the caller to decide whether to exclude the parameter based
	 * on the excludeParamsWithNoValidationMatch flag.
	 * 
	 * Validates Requirements: 5.4, 5.5
	 */
	it('Property 13: Returns null for parameters without validation rules', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					// Parameters with rules
					validatedParam1: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					validatedParam2: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					// Parameters without rules
					unvalidatedParam1: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					unvalidatedParam2: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					resourcePath: fc.stringMatching(/^\/[a-z]{3,8}$/)
				}).filter(({ validatedParam1, validatedParam2, unvalidatedParam1, unvalidatedParam2 }) => {
					// Ensure all parameter names are unique
					const names = [validatedParam1, validatedParam2, unvalidatedParam1, unvalidatedParam2];
					return new Set(names).size === names.length;
				}),
				async ({ validatedParam1, validatedParam2, unvalidatedParam1, unvalidatedParam2, httpMethod, resourcePath }) => {
					// >! Create config with rules only for validated parameters
					const config = {
						[validatedParam1]: () => true,
						[validatedParam2]: () => true
						// No rules for unvalidatedParam1 or unvalidatedParam2
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					
					// >! Validated parameters should have rules
					const rule1 = matcher.findValidationRule(validatedParam1);
					const rule2 = matcher.findValidationRule(validatedParam2);
					expect(rule1).not.toBeNull();
					expect(rule2).not.toBeNull();
					
					// >! Unvalidated parameters should return null
					const rule3 = matcher.findValidationRule(unvalidatedParam1);
					const rule4 = matcher.findValidationRule(unvalidatedParam2);
					expect(rule3).toBeNull();
					expect(rule4).toBeNull();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 14: Validation Timing
	 * 
	 * For all requests, validation SHALL occur during ValidationMatcher initialization,
	 * ensuring that validation rules are resolved and ready before any validation execution.
	 * 
	 * Validates Requirements: 11.4
	 */
	it('Property 14: Validation matcher initializes during construction', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					resourcePath: fc.stringMatching(/^\/[a-z]{3,8}\/\{[a-z]{2,6}\}$/),
					// Generate validation config with various rule types
					hasGlobal: fc.boolean(),
					hasByRoute: fc.boolean(),
					hasByMethod: fc.boolean()
				}),
				async ({ paramName, httpMethod, resourcePath, hasGlobal, hasByRoute, hasByMethod }) => {
					const config = {};
					
					// >! Add global validation if specified
					if (hasGlobal) {
						config[paramName] = () => true;
					}
					
					// >! Add BY_ROUTE validation if specified
					if (hasByRoute) {
						const routePattern = resourcePath.replace(/^\//, '').replace(/\{[^}]+\}/g, '{id}');
						config.BY_ROUTE = [
							{
								route: `${routePattern}?${paramName}`,
								validate: () => true
							}
						];
					}
					
					// >! Add BY_METHOD validation if specified
					if (hasByMethod) {
						config.BY_METHOD = [
							{
								method: httpMethod,
								validate: () => true
							}
						];
					}
					
					// >! Measure initialization time
					const startTime = Date.now();
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const initTime = Date.now() - startTime;
					
					// >! Verify matcher is ready immediately after construction
					expect(matcher).toBeDefined();
					
					// >! Verify initialization is fast (< 5ms for typical config)
					expect(initTime).toBeLessThan(5);
					
					// >! Verify matcher can find rules immediately
					const rule = matcher.findValidationRule(paramName);
					
					// If any validation was configured, rule should be found
					if (hasGlobal || hasByRoute || hasByMethod) {
						expect(rule).not.toBeNull();
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 15: Absent Parameter Skipping
	 * 
	 * For any validation rule, the ValidationMatcher SHALL NOT execute the validation
	 * function if the parameter is not present in the request, avoiding unnecessary
	 * validation overhead.
	 * 
	 * Note: This property tests that ValidationMatcher returns rules correctly.
	 * The actual skipping logic is in ClientRequest, which checks parameter existence
	 * before calling ValidationExecutor.
	 * 
	 * Validates Requirements: 11.5
	 */
	it('Property 15: Validation rules are available for present parameters only', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					presentParam: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					absentParam: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					presentValue: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					resourcePath: fc.stringMatching(/^\/[a-z]{3,8}$/)
				}).filter(({ presentParam, absentParam }) => presentParam !== absentParam),
				async ({ presentParam, absentParam, presentValue, httpMethod, resourcePath }) => {
					let presentParamCallCount = 0;
					let absentParamCallCount = 0;
					
					// >! Create validation functions that track calls
					const presentValidateFn = (value) => {
						presentParamCallCount++;
						return true;
					};
					
					const absentValidateFn = (value) => {
						absentParamCallCount++;
						return true;
					};
					
					// >! Create config with rules for both parameters
					const config = {
						[presentParam]: presentValidateFn,
						[absentParam]: absentValidateFn
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					
					// >! Simulate ClientRequest behavior: only validate present parameters
					const requestParams = {
						[presentParam]: presentValue
						// absentParam is not in request
					};
					
					// >! Only call validation for parameters that exist in request
					for (const [key, value] of Object.entries(requestParams)) {
						const rule = matcher.findValidationRule(key);
						if (rule) {
							ValidationExecutor.execute(rule.validate, rule.params, requestParams);
						}
					}
					
					// >! Verify only present parameter's validation was called
					expect(presentParamCallCount).toBe(1);
					expect(absentParamCallCount).toBe(0);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property 15.1: Validation executor handles missing parameter values gracefully
	 * 
	 * When a multi-parameter validation references parameters that don't exist in
	 * the request, ValidationExecutor SHALL include them in the object with undefined values.
	 */
	it('Property 15.1: Multi-parameter validation includes undefined for missing params', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					param1Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					param2Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					param3Name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					param1Value: fc.string(),
					// param2 and param3 will be missing
					includeParam2: fc.boolean(),
					includeParam3: fc.boolean()
				}).filter(({ param1Name, param2Name, param3Name }) => 
					param1Name !== param2Name && param2Name !== param3Name && param1Name !== param3Name
				),
				async ({ param1Name, param2Name, param3Name, param1Value, includeParam2, includeParam3 }) => {
					let receivedObject;
					
					// >! Validation function that captures what it receives
					const validateFn = (obj) => {
						receivedObject = obj;
						return true;
					};
					
					// >! Build parameter values with some missing
					const paramNames = [param1Name, param2Name, param3Name];
					const paramValues = {
						[param1Name]: param1Value
					};
					
					if (includeParam2) {
						paramValues[param2Name] = 'value2';
					}
					
					if (includeParam3) {
						paramValues[param3Name] = 'value3';
					}
					
					// >! Execute validation
					ValidationExecutor.execute(validateFn, paramNames, paramValues);
					
					// >! Verify all parameters are in object, even if undefined
					expect(receivedObject).toHaveProperty(param1Name);
					expect(receivedObject).toHaveProperty(param2Name);
					expect(receivedObject).toHaveProperty(param3Name);
					
					// >! Verify values are correct (undefined for missing)
					expect(receivedObject[param1Name]).toBe(param1Value);
					
					if (includeParam2) {
						expect(receivedObject[param2Name]).toBe('value2');
					} else {
						expect(receivedObject[param2Name]).toBeUndefined();
					}
					
					if (includeParam3) {
						expect(receivedObject[param3Name]).toBe('value3');
					} else {
						expect(receivedObject[param3Name]).toBeUndefined();
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Properties 9-15: Additional Validation Properties
