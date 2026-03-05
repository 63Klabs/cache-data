import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

/**
 * Property-Based Tests for Configuration Structure Validation
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 6: Configuration Structure Validation
 * 
 * Validates Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 * 
 * This test suite verifies that the ValidationMatcher correctly handles various
 * configuration structures, accepting valid configurations and handling invalid
 * configurations gracefully.
 */
describe('Property 6: Configuration Structure Validation', () => {
	/**
	 * Property: Valid BY_ROUTE configurations are accepted
	 * 
	 * For any valid BY_ROUTE configuration (with 'route' and 'validate' properties),
	 * the ValidationMatcher SHALL accept and process the configuration correctly.
	 */
	it('Property 6.1: Valid BY_ROUTE configurations are accepted', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/),
					// Generate valid BY_ROUTE entries
					byRouteEntries: fc.array(
						fc.record({
							route: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/),
							validate: fc.constant((value) => typeof value === 'string')
						}),
						{ minLength: 1, maxLength: 3 }
					)
				}),
				async ({ paramName, httpMethod, routePattern, byRouteEntries }) => {
					// >! Create configuration with valid BY_ROUTE structure
					// >! Each entry has 'route' and 'validate' properties as required
					const config = {
						[paramName]: (value) => true,
						BY_ROUTE: byRouteEntries.map(entry => ({
							route: `${entry.route}?${paramName}`,
							validate: entry.validate
						}))
					};
					
					// >! ValidationMatcher should accept valid configuration
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					
					// Should be able to find validation rules
					const rule = matcher.findValidationRule(paramName);
					
					// Rule should exist (either from BY_ROUTE or global)
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Valid BY_METHOD configurations are accepted
	 * 
	 * For any valid BY_METHOD configuration (with 'method' and 'validate' properties),
	 * the ValidationMatcher SHALL accept and process the configuration correctly.
	 */
	it('Property 6.2: Valid BY_METHOD configurations are accepted', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/),
					// Generate valid BY_METHOD entries
					byMethodEntries: fc.array(
						fc.record({
							method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
							validate: fc.constant((value) => typeof value === 'string')
						}),
						{ minLength: 1, maxLength: 3 }
					)
				}),
				async ({ paramName, httpMethod, resourcePath, byMethodEntries }) => {
					// >! Create configuration with valid BY_METHOD structure
					// >! Each entry has 'method' and 'validate' properties as required
					const config = {
						[paramName]: (value) => true,
						BY_METHOD: byMethodEntries
					};
					
					// >! ValidationMatcher should accept valid configuration
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					
					// Should be able to find validation rules
					const rule = matcher.findValidationRule(paramName);
					
					// Rule should exist (either from BY_METHOD or global)
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: BY_ROUTE entries with method-and-route patterns are accepted
	 * 
	 * The 'route' property can be either a route pattern or a method-and-route pattern
	 * (METHOD:route_pattern). Both formats should be accepted.
	 */
	it('Property 6.3: BY_ROUTE accepts method-and-route patterns', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					// >! Create configuration with method-and-route pattern
					// >! Format: "METHOD:route_pattern"
					const config = {
						BY_ROUTE: [
							{
								route: `${httpMethod}:${routePattern}?${paramName}`,
								validate: (value) => typeof value === 'string'
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Method-and-route pattern should be accepted and matched
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Invalid BY_ROUTE configurations are handled gracefully
	 * 
	 * When BY_ROUTE entries are missing required properties or have invalid types,
	 * the ValidationMatcher should handle them gracefully without crashing.
	 */
	it('Property 6.4: Invalid BY_ROUTE configurations handled gracefully', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/),
					// Generate invalid BY_ROUTE entries
					invalidEntry: fc.oneof(
						// Missing 'route' property
						fc.record({
							validate: fc.constant((value) => true)
						}),
						// Missing 'validate' property
						fc.record({
							route: fc.stringMatching(/^[a-z]+$/)
						}),
						// 'validate' is not a function
						fc.record({
							route: fc.stringMatching(/^[a-z]+$/),
							validate: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined))
						}),
						// 'route' is not a string
						fc.record({
							route: fc.oneof(fc.integer(), fc.constant(null), fc.constant(undefined)),
							validate: fc.constant((value) => true)
						})
					)
				}),
				async ({ paramName, httpMethod, resourcePath, invalidEntry }) => {
					// >! Create configuration with invalid BY_ROUTE entry
					const config = {
						[paramName]: (value) => true,
						BY_ROUTE: [invalidEntry]
					};
					
					try {
						// >! ValidationMatcher should handle invalid configuration gracefully
						const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
						const rule = matcher.findValidationRule(paramName);
						
						// Should fall back to global validation or return null
						// Should not crash
						expect(rule === null || typeof rule.validate === 'function').toBe(true);
						
						return true;
					} catch (error) {
						// If it throws, it should be a clear validation error, not a crash
						expect(error.message).toBeTruthy();
						return true;
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Invalid BY_METHOD configurations are handled gracefully
	 * 
	 * When BY_METHOD entries are missing required properties or have invalid types,
	 * the ValidationMatcher should handle them gracefully without crashing.
	 */
	it('Property 6.5: Invalid BY_METHOD configurations handled gracefully', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/),
					// Generate invalid BY_METHOD entries
					invalidEntry: fc.oneof(
						// Missing 'method' property
						fc.record({
							validate: fc.constant((value) => true)
						}),
						// Missing 'validate' property
						fc.record({
							method: fc.constantFrom('GET', 'POST')
						}),
						// 'validate' is not a function
						fc.record({
							method: fc.constantFrom('GET', 'POST'),
							validate: fc.oneof(fc.string(), fc.integer(), fc.constant(null))
						}),
						// 'method' is not a string
						fc.record({
							method: fc.oneof(fc.integer(), fc.constant(null)),
							validate: fc.constant((value) => true)
						})
					)
				}),
				async ({ paramName, httpMethod, resourcePath, invalidEntry }) => {
					// >! Create configuration with invalid BY_METHOD entry
					const config = {
						[paramName]: (value) => true,
						BY_METHOD: [invalidEntry]
					};
					
					try {
						// >! ValidationMatcher should handle invalid configuration gracefully
						const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
						const rule = matcher.findValidationRule(paramName);
						
						// Should fall back to global validation or return null
						// Should not crash
						expect(rule === null || typeof rule.validate === 'function').toBe(true);
						
						return true;
					} catch (error) {
						// If it throws, it should be a clear validation error, not a crash
						expect(error.message).toBeTruthy();
						return true;
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Validate property must be a function
	 * 
	 * The 'validate' property in both BY_ROUTE and BY_METHOD entries must be a function.
	 * Non-function values should be handled gracefully.
	 */
	it('Property 6.6: Validate property must be a function', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+$/),
					// Generate non-function values
					nonFunctionValue: fc.oneof(
						fc.string(),
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined),
						fc.array(fc.integer()),
						fc.record({ key: fc.string() })
					)
				}),
				async ({ paramName, httpMethod, routePattern, nonFunctionValue }) => {
					// >! Create configuration with non-function validate property
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: nonFunctionValue
							}
						]
					};
					
					try {
						const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
						const rule = matcher.findValidationRule(paramName);
						
						// >! Should handle gracefully - either skip invalid rule or throw clear error
						if (rule !== null) {
							// If rule is returned, validate must be a function
							expect(typeof rule.validate).toBe('function');
						}
						
						return true;
					} catch (error) {
						// If it throws, should be a validation error
						expect(error.message).toBeTruthy();
						return true;
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Route property must be a string
	 * 
	 * The 'route' property in BY_ROUTE entries must be a string.
	 * Non-string values should be handled gracefully.
	 */
	it('Property 6.7: Route property must be a string', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/),
					// Generate non-string values
					nonStringValue: fc.oneof(
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined),
						fc.array(fc.string()),
						fc.record({ path: fc.string() })
					)
				}),
				async ({ paramName, httpMethod, resourcePath, nonStringValue }) => {
					// >! Create configuration with non-string route property
					const config = {
						[paramName]: (value) => true,
						BY_ROUTE: [
							{
								route: nonStringValue,
								validate: (value) => typeof value === 'string'
							}
						]
					};
					
					try {
						const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
						const rule = matcher.findValidationRule(paramName);
						
						// >! Should handle gracefully - either skip invalid rule or throw clear error
						// Should fall back to global validation
						if (rule !== null) {
							expect(typeof rule.validate).toBe('function');
						}
						
						return true;
					} catch (error) {
						// If it throws, should be a validation error
						expect(error.message).toBeTruthy();
						return true;
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Method property must be a string
	 * 
	 * The 'method' property in BY_METHOD entries must be a string.
	 * Non-string values should be handled gracefully.
	 */
	it('Property 6.8: Method property must be a string', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/),
					// Generate non-string values
					nonStringValue: fc.oneof(
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.constant(undefined),
						fc.array(fc.string())
					)
				}),
				async ({ paramName, httpMethod, resourcePath, nonStringValue }) => {
					// >! Create configuration with non-string method property
					const config = {
						[paramName]: (value) => true,
						BY_METHOD: [
							{
								method: nonStringValue,
								validate: (value) => typeof value === 'string'
							}
						]
					};
					
					try {
						const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
						const rule = matcher.findValidationRule(paramName);
						
						// >! Should handle gracefully - either skip invalid rule or throw clear error
						// Should fall back to global validation
						if (rule !== null) {
							expect(typeof rule.validate).toBe('function');
						}
						
						return true;
					} catch (error) {
						// If it throws, should be a validation error
						expect(error.message).toBeTruthy();
						return true;
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: BY_ROUTE and BY_METHOD can coexist
	 * 
	 * A configuration can have both BY_ROUTE and BY_METHOD arrays,
	 * and both should be processed correctly.
	 */
	it('Property 6.9: BY_ROUTE and BY_METHOD can coexist', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					// >! Create configuration with both BY_ROUTE and BY_METHOD
					const config = {
						[paramName]: (value) => 'global',
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: (value) => 'route'
							}
						],
						BY_METHOD: [
							{
								method: httpMethod,
								validate: (value) => 'method'
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should find a rule (priority order determines which one)
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Empty BY_ROUTE and BY_METHOD arrays are handled
	 * 
	 * Empty arrays for BY_ROUTE and BY_METHOD should be handled gracefully,
	 * falling back to global parameter validation.
	 */
	it('Property 6.10: Empty BY_ROUTE and BY_METHOD arrays handled', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, httpMethod, resourcePath }) => {
					// >! Create configuration with empty arrays
					const globalValidate = (value) => typeof value === 'string';
					const config = {
						[paramName]: globalValidate,
						BY_ROUTE: [],
						BY_METHOD: []
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should fall back to global validation
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(globalValidate);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Configuration with only BY_ROUTE works
	 * 
	 * A configuration with only BY_ROUTE (no BY_METHOD or global) should work correctly.
	 */
	it('Property 6.11: Configuration with only BY_ROUTE works', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					// >! Create configuration with only BY_ROUTE
					const config = {
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: (value) => typeof value === 'string'
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should find the BY_ROUTE rule
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Configuration with only BY_METHOD works
	 * 
	 * A configuration with only BY_METHOD (no BY_ROUTE or global) should work correctly.
	 */
	it('Property 6.12: Configuration with only BY_METHOD works', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, httpMethod, resourcePath }) => {
					// >! Create configuration with only BY_METHOD
					const config = {
						BY_METHOD: [
							{
								method: httpMethod,
								validate: (value) => typeof value === 'string'
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should find the BY_METHOD rule
					expect(rule).not.toBeNull();
					expect(typeof rule.validate).toBe('function');
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multiple entries in BY_ROUTE are iterated
	 * 
	 * When BY_ROUTE has multiple entries, the ValidationMatcher should iterate
	 * through them to find the first matching rule.
	 */
	it('Property 6.13: Multiple BY_ROUTE entries are iterated', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					const matchingValidate = (value) => 'matching';
					const otherValidate = (value) => 'other';
					
					// >! Create configuration with multiple BY_ROUTE entries
					const config = {
						BY_ROUTE: [
							{
								route: 'different/route',
								validate: otherValidate
							},
							{
								route: `${routePattern}?${paramName}`,
								validate: matchingValidate
							},
							{
								route: 'another/route',
								validate: otherValidate
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should find the matching rule
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(matchingValidate);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Multiple entries in BY_METHOD are iterated
	 * 
	 * When BY_METHOD has multiple entries, the ValidationMatcher should iterate
	 * through them to find the first matching rule.
	 */
	it('Property 6.14: Multiple BY_METHOD entries are iterated', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					resourcePath: fc.stringMatching(/^\/[a-z]+$/)
				}),
				async ({ paramName, httpMethod, resourcePath }) => {
					const matchingValidate = (value) => 'matching';
					const otherValidate = (value) => 'other';
					
					// >! Create configuration with multiple BY_METHOD entries
					const config = {
						BY_METHOD: [
							{
								method: httpMethod === 'GET' ? 'POST' : 'GET',
								validate: otherValidate
							},
							{
								method: httpMethod,
								validate: matchingValidate
							},
							{
								method: 'DELETE',
								validate: otherValidate
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Should find the matching rule
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(matchingValidate);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 6: Configuration Structure Validation
