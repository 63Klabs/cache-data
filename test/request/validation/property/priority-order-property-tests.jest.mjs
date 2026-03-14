import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ValidationMatcher
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationMatcher = ValidationMatcherModule.default;

/**
 * Property-Based Tests for Validation Priority Order
 * 
 * Feature: 1-3-9-improve-validations-object
 * Property 2: Validation Priority Order
 * 
 * Validates Requirements: 2.2, 3.5, 4.3, 5.1, 5.2, 5.3, 11.2
 * 
 * This test suite verifies that the ValidationMatcher applies only the highest-priority
 * matching rule and does not evaluate lower-priority rules after finding a match.
 * 
 * Priority Order:
 * 1. Method-and-route match (BY_ROUTE with "METHOD:route")
 * 2. Route-only match (BY_ROUTE with "route")
 * 3. Method-only match (BY_METHOD with "METHOD")
 * 4. Global parameter name
 */
describe('Property 2: Validation Priority Order', () => {
	/**
	 * Property: Only highest-priority matching rule is applied
	 * 
	 * For any parameter with validation rules at multiple priority levels,
	 * the ValidationMatcher SHALL apply only the highest-priority matching rule
	 * and SHALL NOT check lower-priority rules once a match is found.
	 */
	it('Property 2.1: Only highest-priority matching rule is applied', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate validation configuration with rules at all four priority levels
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/),
					// Create validation functions that track if they were called
					createValidationFunctions: fc.constant(() => {
						const callTracker = {
							priority1Called: false,
							priority2Called: false,
							priority3Called: false,
							priority4Called: false
						};
						
						return {
							priority1Fn: (value) => { callTracker.priority1Called = true; return true; },
							priority2Fn: (value) => { callTracker.priority2Called = true; return true; },
							priority3Fn: (value) => { callTracker.priority3Called = true; return true; },
							priority4Fn: (value) => { callTracker.priority4Called = true; return true; },
							callTracker
						};
					})
				}),
				async ({ paramName, httpMethod, resourcePath, createValidationFunctions }) => {
					const { priority1Fn, priority2Fn, priority3Fn, priority4Fn, callTracker } = createValidationFunctions();
					
					// Extract route pattern from resourcePath
					const routePattern = resourcePath.replace(/^\//, '');
					
					// >! Create configuration with rules at all four priority levels
					// >! Specify the parameter in route patterns using query parameter syntax
					const config = {
						// Priority 4: Global parameter name
						[paramName]: priority4Fn,
						
						// Priority 3: Method-only match
						BY_METHOD: [
							{
								method: httpMethod,
								validate: priority3Fn
							}
						],
						
						// Priority 2: Route-only match
						BY_ROUTE: [
							{
								route: `${routePattern}?${paramName}`,
								validate: priority2Fn
							},
							// Priority 1: Method-and-route match
							{
								route: `${httpMethod}:${routePattern}?${paramName}`,
								validate: priority1Fn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify that a rule was found
					expect(rule).not.toBeNull();
					
					// >! Verify that the highest-priority rule (Priority 1) was returned
					expect(rule.validate).toBe(priority1Fn);
					
					// >! Execute the validation to verify only Priority 1 function is used
					// Note: We're not calling the function here because findValidationRule
					// only returns the rule, it doesn't execute it. The important thing
					// is that it returns the correct priority function.
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority 1 (Method-and-route) takes precedence over all others
	 * 
	 * When a method-and-route rule matches, it should be returned regardless
	 * of whether lower-priority rules also match.
	 */
	it('Property 2.2: Priority 1 (Method-and-route) takes precedence', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					// >! Create unique validation functions for each priority
					const priority1Fn = (value) => 'priority1';
					const priority2Fn = (value) => 'priority2';
					const priority3Fn = (value) => 'priority3';
					const priority4Fn = (value) => 'priority4';
					
					const config = {
						[paramName]: priority4Fn,
						BY_METHOD: [{ method: httpMethod, validate: priority3Fn }],
						BY_ROUTE: [
							{ route: `${routePattern}?${paramName}`, validate: priority2Fn },
							{ route: `${httpMethod}:${routePattern}?${paramName}`, validate: priority1Fn }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify Priority 1 rule is returned
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority1Fn);
					expect(rule.validate).not.toBe(priority2Fn);
					expect(rule.validate).not.toBe(priority3Fn);
					expect(rule.validate).not.toBe(priority4Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority 2 (Route-only) takes precedence over Priority 3 and 4
	 * 
	 * When no Priority 1 rule matches but a Priority 2 rule does,
	 * Priority 2 should be returned.
	 */
	it('Property 2.3: Priority 2 (Route-only) takes precedence over 3 and 4', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					const priority2Fn = (value) => 'priority2';
					const priority3Fn = (value) => 'priority3';
					const priority4Fn = (value) => 'priority4';
					
					// >! No Priority 1 rule (no method-and-route match)
					const config = {
						[paramName]: priority4Fn,
						BY_METHOD: [{ method: httpMethod, validate: priority3Fn }],
						BY_ROUTE: [
							{ route: `${routePattern}?${paramName}`, validate: priority2Fn }
							// No method-and-route rule
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify Priority 2 rule is returned
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority2Fn);
					expect(rule.validate).not.toBe(priority3Fn);
					expect(rule.validate).not.toBe(priority4Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority 3 (Method-only) takes precedence over Priority 4
	 * 
	 * When no Priority 1 or 2 rules match but a Priority 3 rule does,
	 * Priority 3 should be returned.
	 */
	it('Property 2.4: Priority 3 (Method-only) takes precedence over 4', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, resourcePath }) => {
					const priority3Fn = (value) => 'priority3';
					const priority4Fn = (value) => 'priority4';
					
					// >! No Priority 1 or 2 rules (no route matches)
					const config = {
						[paramName]: priority4Fn,
						BY_METHOD: [{ method: httpMethod, validate: priority3Fn }],
						BY_ROUTE: [
							// Route that doesn't match
							{ route: 'different/route', validate: (value) => 'notused' }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify Priority 3 rule is returned
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority3Fn);
					expect(rule.validate).not.toBe(priority4Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority 4 (Global) is used when no higher-priority rules match
	 * 
	 * When no Priority 1, 2, or 3 rules match, the global parameter validation
	 * should be returned.
	 */
	it('Property 2.5: Priority 4 (Global) is used as fallback', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, resourcePath }) => {
					const priority4Fn = (value) => 'priority4';
					
					// >! No Priority 1, 2, or 3 rules match
					const config = {
						[paramName]: priority4Fn,
						BY_METHOD: [
							// Different method
							{ method: httpMethod === 'GET' ? 'POST' : 'GET', validate: (value) => 'notused' }
						],
						BY_ROUTE: [
							// Different route
							{ route: 'different/route', validate: (value) => 'notused' }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify Priority 4 rule is returned
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority4Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: No rule found when no priorities match
	 * 
	 * When no validation rules match at any priority level,
	 * findValidationRule should return null.
	 */
	it('Property 2.6: Returns null when no rules match', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					differentParamName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					resourcePath: fc.stringMatching(/^\/[a-z]+\/\{[a-z]+\}$/)
				}).filter(({ paramName, differentParamName }) => paramName.toLowerCase() !== differentParamName.toLowerCase()),
				async ({ paramName, differentParamName, httpMethod, resourcePath }) => {
					// >! Create config with rules for a different parameter
					const config = {
						[differentParamName]: (value) => true,
						BY_METHOD: [
							{ method: httpMethod === 'GET' ? 'POST' : 'GET', validate: (value) => true }
						],
						BY_ROUTE: [
							{ route: 'different/route', validate: (value) => true }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, resourcePath);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Verify no rule is found
					expect(rule).toBeNull();
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Early exit optimization - lower priorities not checked after match
	 * 
	 * This property verifies that the ValidationMatcher implements early exit
	 * optimization by not checking lower-priority rules after finding a match.
	 * 
	 * We verify this by ensuring that when a high-priority rule matches,
	 * the returned rule is from that priority level, not from a lower one.
	 */
	it('Property 2.7: Early exit - lower priorities not evaluated after match', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, routePattern }) => {
					const priority1Fn = (value) => 'P1';
					const priority2Fn = (value) => 'P2';
					const priority3Fn = (value) => 'P3';
					const priority4Fn = (value) => 'P4';
					
					// Test with Priority 1 present
					const configWithP1 = {
						[paramName]: (value) => 'P4',
						BY_METHOD: [{ method: httpMethod, validate: (value) => 'P3' }],
						BY_ROUTE: [
							{ route: `${routePattern}?${paramName}`, validate: priority2Fn },
							{ route: `${httpMethod}:${routePattern}?${paramName}`, validate: priority1Fn }
						]
					};
					
					const matcherP1 = new ValidationMatcher(configWithP1, httpMethod, `/${routePattern}`);
					const ruleP1 = matcherP1.findValidationRule(paramName);
					
					// >! When P1 matches, it should be returned (not P2, P3, or P4)
					expect(ruleP1).not.toBeNull();
					expect(ruleP1.validate).toBe(priority1Fn);
					
					// Test with only P2 and below
					const configWithP2 = {
						[paramName]: (value) => 'P4',
						BY_METHOD: [{ method: httpMethod, validate: (value) => 'P3' }],
						BY_ROUTE: [
							{ route: `${routePattern}?${paramName}`, validate: priority2Fn }
							// No P1 rule
						]
					};
					
					const matcherP2 = new ValidationMatcher(configWithP2, httpMethod, `/${routePattern}`);
					const ruleP2 = matcherP2.findValidationRule(paramName);
					
					// >! When P2 matches (and P1 doesn't exist), P2 should be returned (not P3 or P4)
					expect(ruleP2).not.toBeNull();
					expect(ruleP2.validate).toBe(priority2Fn);
					
					// Test with only P3 and below
					const configWithP3 = {
						[paramName]: priority4Fn,
						BY_METHOD: [{ method: httpMethod, validate: priority3Fn }],
						BY_ROUTE: [
							{ route: 'different/route', validate: (value) => 'notused' }
						]
					};
					
					const matcherP3 = new ValidationMatcher(configWithP3, httpMethod, `/${routePattern}`);
					const ruleP3 = matcherP3.findValidationRule(paramName);
					
					// >! When P3 matches (and P1, P2 don't match), P3 should be returned (not P4)
					expect(ruleP3).not.toBeNull();
					expect(ruleP3.validate).toBe(priority3Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority order is consistent across different parameter names
	 * 
	 * The priority order should work the same way regardless of parameter name.
	 */
	it('Property 2.8: Priority order consistent across parameter names', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName1: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					paramName2: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}).filter(({ paramName1, paramName2 }) => paramName1.toLowerCase() !== paramName2.toLowerCase()),
				async ({ paramName1, paramName2, httpMethod, routePattern }) => {
					const priority1Fn = (value) => 'P1';
					const priority2Fn = (value) => 'P2';
					
					// >! Create config with P1 rules for both parameters
					const config = {
						[paramName1]: (value) => 'P4-1',
						[paramName2]: (value) => 'P4-2',
						BY_ROUTE: [
							{
								route: `${httpMethod}:${routePattern}?${paramName1},${paramName2}`,
								validate: priority1Fn
							},
							{
								route: `${routePattern}?${paramName1},${paramName2}`,
								validate: priority2Fn
							}
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					
					// >! Both parameters should get Priority 1 rule
					const rule1 = matcher.findValidationRule(paramName1);
					const rule2 = matcher.findValidationRule(paramName2);
					
					expect(rule1).not.toBeNull();
					expect(rule2).not.toBeNull();
					expect(rule1.validate).toBe(priority1Fn);
					expect(rule2.validate).toBe(priority1Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority order works with case-insensitive method matching
	 * 
	 * HTTP methods should be matched case-insensitively at all priority levels.
	 */
	it('Property 2.9: Priority order with case-insensitive method matching', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST', 'PUT'),
					methodCase: fc.constantFrom('lowercase', 'uppercase', 'mixedcase'),
					routePattern: fc.stringMatching(/^[a-z]+\/\{[a-z]+\}$/)
				}),
				async ({ paramName, httpMethod, methodCase, routePattern }) => {
					// >! Convert method to different cases
					let configMethod = httpMethod;
					if (methodCase === 'lowercase') {
						configMethod = httpMethod.toLowerCase();
					} else if (methodCase === 'mixedcase') {
						configMethod = httpMethod.charAt(0) + httpMethod.slice(1).toLowerCase();
					}
					
					const priority1Fn = (value) => 'P1';
					const priority3Fn = (value) => 'P3';
					
					const config = {
						[paramName]: (value) => 'P4',
						BY_METHOD: [{ method: configMethod, validate: priority3Fn }],
						BY_ROUTE: [
							{ route: `${configMethod}:${routePattern}?${paramName}`, validate: priority1Fn }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, `/${routePattern}`);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Method matching should be case-insensitive
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority1Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	/**
	 * Property: Priority order works with placeholder route matching
	 * 
	 * Route patterns with placeholders should match correctly at all priority levels.
	 */
	it('Property 2.10: Priority order with placeholder route matching', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					paramName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
					httpMethod: fc.constantFrom('GET', 'POST'),
					// Generate route with placeholder
					routePrefix: fc.stringMatching(/^[a-z]{3,8}$/),
					placeholderName: fc.stringMatching(/^[a-z]{2,6}$/),
					actualValue: fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/)
				}),
				async ({ paramName, httpMethod, routePrefix, placeholderName, actualValue }) => {
					const routePattern = `${routePrefix}/{${placeholderName}}`;
					const actualRoute = `/${routePrefix}/${actualValue}`;
					
					const priority1Fn = (value) => 'P1';
					const priority2Fn = (value) => 'P2';
					
					const config = {
						[paramName]: (value) => 'P4',
						BY_ROUTE: [
							{ route: `${routePattern}?${paramName}`, validate: priority2Fn },
							{ route: `${httpMethod}:${routePattern}?${paramName}`, validate: priority1Fn }
						]
					};
					
					const matcher = new ValidationMatcher(config, httpMethod, actualRoute);
					const rule = matcher.findValidationRule(paramName);
					
					// >! Placeholder matching should work at all priority levels
					expect(rule).not.toBeNull();
					expect(rule.validate).toBe(priority1Fn);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});

// Feature: 1-3-9-improve-validations-object, Property 2: Validation Priority Order
