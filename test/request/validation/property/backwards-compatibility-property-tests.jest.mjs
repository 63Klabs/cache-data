import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

const ValidationExecutorModule = await import('../../../../src/lib/utils/ValidationExecutor.class.js');
const ValidationExecutor = ValidationExecutorModule.default;

/**
 * Property-Based Tests for Backwards Compatibility Preservation
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 1: Backwards Compatibility Preservation
 * 
 * Validates Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 12.1-12.7
 * 
 * This test suite verifies that legacy validation configurations (without BY_ROUTE or BY_METHOD)
 * continue to work exactly as before the enhancement. The ValidationMatcher should treat legacy
 * configurations correctly by only checking global parameter validations.
 */
describe('Property 1: Backwards Compatibility Preservation', () => {
	/**
	 * Property: Legacy validation configurations work unchanged
	 * 
	 * For any legacy validation configuration (without BY_ROUTE/BY_METHOD properties),
	 * the ValidationMatcher SHALL process parameters exactly as before, applying only
	 * global parameter validations.
	 */
	it('Property 1: Legacy configurations without BY_ROUTE/BY_METHOD work unchanged', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate legacy validation configuration
				fc.record({
					// Generate 1-5 parameter validations
					paramValidations: fc.dictionary(
						// Parameter names: alphanumeric strings
						fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/),
						// Validation functions that return boolean
						fc.constantFrom(
							(value) => typeof value === 'string',
							(value) => typeof value === 'number',
							(value) => value !== null && value !== undefined,
							(value) => true,
							(value) => false,
							(value) => typeof value === 'string' && value.length > 0,
							(value) => typeof value === 'number' && value > 0
						),
						{ minKeys: 1, maxKeys: 5 }
					),
					// HTTP method
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
					// Resource path
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/),
					// Parameter to test
					testParamName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/)
				}),
				async ({ paramValidations, httpMethod, resourcePath, testParamName }) => {
					// >! Create legacy configuration without BY_ROUTE or BY_METHOD
					// >! This simulates existing validation configurations before the enhancement
					const legacyConfig = { ...paramValidations };
					
					// Ensure no BY_ROUTE or BY_METHOD properties exist
					delete legacyConfig.BY_ROUTE;
					delete legacyConfig.BY_METHOD;
					
					// Create ValidationMatcher with legacy configuration
					const matcher = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					
					// Find validation rule for test parameter
					const rule = matcher.findValidationRule(testParamName);
					
					// >! Verify backwards compatibility: only global validations are checked
					if (legacyConfig[testParamName] && typeof legacyConfig[testParamName] === 'function') {
						// Parameter has global validation - should find it
						expect(rule).not.toBeNull();
						expect(rule.validate).toBe(legacyConfig[testParamName]);
						expect(rule.params).toEqual([testParamName]);
					} else {
						// Parameter has no global validation - should return null
						expect(rule).toBeNull();
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Legacy configurations ignore BY_ROUTE/BY_METHOD if accidentally present
	 * 
	 * Even if BY_ROUTE or BY_METHOD properties exist but are not arrays or are empty,
	 * the system should fall back to global parameter validations gracefully.
	 */
	it('Property 1.1: Legacy configurations with invalid BY_ROUTE/BY_METHOD fall back to global', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramValidations: fc.dictionary(
						fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/),
						fc.constantFrom(
							(value) => typeof value === 'string',
							(value) => value !== null
						),
						{ minKeys: 1, maxKeys: 3 }
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/),
					testParamName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/),
					// Invalid BY_ROUTE/BY_METHOD values
					invalidByRoute: fc.constantFrom(null, undefined, 'not-an-array', 123, {}, []),
					invalidByMethod: fc.constantFrom(null, undefined, 'not-an-array', 456, {}, [])
				}),
				async ({ paramValidations, httpMethod, resourcePath, testParamName, invalidByRoute, invalidByMethod }) => {
					// >! Create configuration with invalid BY_ROUTE/BY_METHOD
					const config = {
						...paramValidations,
						BY_ROUTE: invalidByRoute,
						BY_METHOD: invalidByMethod
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(testParamName);
					
					// >! Should fall back to global validation
					if (paramValidations[testParamName] && typeof paramValidations[testParamName] === 'function') {
						expect(rule).not.toBeNull();
						expect(rule.validate).toBe(paramValidations[testParamName]);
					} else {
						expect(rule).toBeNull();
					}
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: ValidationExecutor handles legacy single-parameter interface
	 * 
	 * For legacy configurations, validation functions receive a single parameter value
	 * (not an object), maintaining the original interface.
	 */
	it('Property 1.2: ValidationExecutor maintains single-parameter interface for legacy configs', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/),
					paramValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined)
					)
				}),
				async ({ paramName, paramValue }) => {
					let receivedValue;
					let receivedType;
					
					// >! Validation function that captures what it receives
					const validateFn = (value) => {
						receivedValue = value;
						receivedType = typeof value;
						return true;
					};
					
					// >! Execute with single parameter (legacy interface)
					const paramNames = [paramName];
					const paramValues = { [paramName]: paramValue };
					
					const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
					
					// >! Verify single value was passed, not an object
					expect(result).toBe(true);
					expect(receivedValue).toBe(paramValue);
					
					// Should receive the value directly, not wrapped in an object
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
	 * Property: Legacy validation results are consistent
	 * 
	 * For the same input, legacy validation should produce the same result
	 * every time (deterministic behavior).
	 */
	it('Property 1.3: Legacy validation results are deterministic', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string({ minLength: 1, maxLength: 20 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, resourcePath }) => {
					// >! Create legacy validation function
					const validateFn = (value) => typeof value === 'string' && value.length > 0;
					
					const legacyConfig = {
						[paramName]: validateFn
					};
					
					// >! Execute validation multiple times
					const matcher1 = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					const rule1 = matcher1.findValidationRule(paramName);
					
					const matcher2 = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					const rule2 = matcher2.findValidationRule(paramName);
					
					const matcher3 = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					const rule3 = matcher3.findValidationRule(paramName);
					
					// >! All executions should produce identical results
					expect(rule1).not.toBeNull();
					expect(rule2).not.toBeNull();
					expect(rule3).not.toBeNull();
					
					expect(rule1.validate).toBe(validateFn);
					expect(rule2.validate).toBe(validateFn);
					expect(rule3.validate).toBe(validateFn);
					
					// Execute validation
					const result1 = ValidationExecutor.execute(rule1.validate, rule1.params, { [paramName]: paramValue });
					const result2 = ValidationExecutor.execute(rule2.validate, rule2.params, { [paramName]: paramValue });
					const result3 = ValidationExecutor.execute(rule3.validate, rule3.params, { [paramName]: paramValue });
					
					// All results should be identical
					expect(result1).toBe(result2);
					expect(result2).toBe(result3);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Legacy configurations work across all HTTP methods
	 * 
	 * Global parameter validations should work identically regardless of HTTP method,
	 * maintaining backwards compatibility across all request types.
	 */
	it('Property 1.4: Legacy validations work identically across all HTTP methods', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.string(),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, paramValue, resourcePath }) => {
					// >! Create legacy validation
					const validateFn = (value) => typeof value === 'string';
					const legacyConfig = {
						[paramName]: validateFn
					};
					
					// >! Test across all standard HTTP methods
					const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
					const results = [];
					
					for (const method of methods) {
						const matcher = new ValidationMatcher(legacyConfig, method, resourcePath);
						const rule = matcher.findValidationRule(paramName);
						
						expect(rule).not.toBeNull();
						expect(rule.validate).toBe(validateFn);
						
						const result = ValidationExecutor.execute(rule.validate, rule.params, { [paramName]: paramValue });
						results.push(result);
					}
					
					// >! All methods should produce identical results
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
	 * Property: Legacy configurations work across all route patterns
	 * 
	 * Global parameter validations should work identically regardless of route pattern,
	 * since they don't depend on route matching.
	 */
	it('Property 1.5: Legacy validations work identically across all route patterns', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.integer({ min: 1, max: 100 }),
					httpMethod: fc.constantFrom('GET', 'POST'),
					// Generate different route patterns
					routePatterns: fc.array(
						fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/),
						{ minLength: 3, maxLength: 5 }
					)
				}),
				async ({ paramName, paramValue, httpMethod, routePatterns }) => {
					// >! Create legacy validation
					const validateFn = (value) => typeof value === 'number' && value > 0;
					const legacyConfig = {
						[paramName]: validateFn
					};
					
					const results = [];
					
					// >! Test across different route patterns
					for (const routePattern of routePatterns) {
						const matcher = new ValidationMatcher(legacyConfig, httpMethod, routePattern);
						const rule = matcher.findValidationRule(paramName);
						
						expect(rule).not.toBeNull();
						expect(rule.validate).toBe(validateFn);
						
						const result = ValidationExecutor.execute(rule.validate, rule.params, { [paramName]: paramValue });
						results.push(result);
					}
					
					// >! All routes should produce identical results
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
	 * Property: Legacy validation functions are called with correct context
	 * 
	 * Validation functions should be called with the parameter value as the first argument,
	 * maintaining the original calling convention.
	 */
	it('Property 1.6: Legacy validation functions receive correct parameter values', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramValue: fc.oneof(
						fc.string({ minLength: 1, maxLength: 50 }),
						fc.integer({ min: -1000, max: 1000 }),
						fc.boolean()
					),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, paramValue, httpMethod, resourcePath }) => {
					let capturedValue;
					let callCount = 0;
					
					// >! Validation function that captures its argument
					const validateFn = (value) => {
						capturedValue = value;
						callCount++;
						return true;
					};
					
					const legacyConfig = {
						[paramName]: validateFn
					};
					
					const matcher = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					expect(rule).not.toBeNull();
					
					// >! Execute validation
					ValidationExecutor.execute(rule.validate, rule.params, { [paramName]: paramValue });
					
					// >! Verify function was called exactly once with correct value
					expect(callCount).toBe(1);
					expect(capturedValue).toBe(paramValue);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Legacy configurations handle missing parameters correctly
	 * 
	 * When a parameter is not present in the request, legacy validation should
	 * return null (no validation rule found), maintaining original behavior.
	 */
	it('Property 1.7: Legacy configurations return null for non-existent parameters', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					existingParamName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					missingParamName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}).filter(({ existingParamName, missingParamName }) => existingParamName !== missingParamName),
				async ({ existingParamName, missingParamName, httpMethod, resourcePath }) => {
					// >! Create legacy config with only one parameter
					const legacyConfig = {
						[existingParamName]: (value) => true
					};
					
					const matcher = new ValidationMatcher(legacyConfig, httpMethod, resourcePath);
					
					// >! Existing parameter should have validation
					const existingRule = matcher.findValidationRule(existingParamName);
					expect(existingRule).not.toBeNull();
					
					// >! Missing parameter should return null
					const missingRule = matcher.findValidationRule(missingParamName);
					expect(missingRule).toBeNull();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 1: Backwards Compatibility Preservation
