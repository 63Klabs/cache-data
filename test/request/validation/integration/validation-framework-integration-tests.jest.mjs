/**
 * Integration Tests: Validation Framework for Body Parameters
 * 
 * Tests the integration between ValidationMatcher and ValidationExecutor for body parameter validation.
 * Validates that the 4-tier priority system works correctly and that validation rules are properly
 * matched and executed.
 * 
 * Feature: body-validation-and-header-format-fix
 * Requirements: 1.1
 * 
 * Test Coverage:
 * - ValidationMatcher finds correct rules for body parameters
 * - ValidationExecutor executes body validation correctly
 * - 4-tier priority system works for body parameters
 * - BY_METHOD_AND_ROUTE, BY_ROUTE, BY_METHOD, and global rules
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import ValidationMatcher and ValidationExecutor
const ValidationMatcherModule = await import('../../../../src/lib/utils/ValidationMatcher.class.js');
const ValidationExecutor = (await import('../../../../src/lib/utils/ValidationExecutor.class.js')).default;
const ValidationMatcher = ValidationMatcherModule.default;

describe('Validation Framework Integration Tests', () => {
	describe('ValidationMatcher - Body Parameter Rule Matching', () => {
		it('should find global validation rule for body parameter', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string' && value.includes('@'),
				age: (value) => typeof value === 'number' && value >= 0
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// Find rule for email parameter
			const emailRule = matcher.findValidationRule('email');
			expect(emailRule).not.toBeNull();
			expect(emailRule.validate).toBe(paramValidations.email);
			expect(emailRule.params).toEqual(['email']);

			// Find rule for age parameter
			const ageRule = matcher.findValidationRule('age');
			expect(ageRule).not.toBeNull();
			expect(ageRule.validate).toBe(paramValidations.age);
			expect(ageRule.params).toEqual(['age']);
		});

		it('should find BY_METHOD validation rule for body parameter', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string',
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => value && value.length > 0
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// BY_METHOD rule should take priority over global rule
			const rule = matcher.findValidationRule('email');
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_METHOD[0].validate);
			expect(rule.params).toEqual(['email']);
		});

		it('should find BY_ROUTE validation rule for body parameter', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string',
				BY_ROUTE: [
					{
						route: 'users?email,password',  // Specify parameters in route
						validate: ({email, password}) => email && password && email.includes('@')
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// BY_ROUTE rule should take priority over global rule
			const rule = matcher.findValidationRule('email');
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_ROUTE[0].validate);
			expect(rule.params).toEqual(['email', 'password']);
		});

		it('should find BY_METHOD_AND_ROUTE validation rule for body parameter', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string',
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => value.length > 0
					}
				],
				BY_ROUTE: [
					{
						route: 'users',
						validate: (value) => value.includes('@')
					},
					{
						route: 'POST:users?email,password',  // Specify parameters
						validate: ({email, password}) => {
							return email && password && 
								   email.includes('@') && 
								   password.length >= 8;
						}
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// BY_METHOD_AND_ROUTE rule should take highest priority
			const rule = matcher.findValidationRule('email');
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_ROUTE[1].validate);
			expect(rule.params).toEqual(['email', 'password']);
		});
	});

	describe('ValidationExecutor - Body Parameter Validation Execution', () => {
		it('should execute single-parameter validation correctly', () => {
			const validateFn = (value) => typeof value === 'string' && value.includes('@');
			const paramNames = ['email'];
			const paramValues = { email: 'user@example.com' };

			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBe(true);
		});

		it('should execute multi-parameter validation correctly', () => {
			const validateFn = ({email, password}) => {
				return email && password && 
					   email.includes('@') && 
					   password.length >= 8;
			};
			const paramNames = ['email', 'password'];
			const paramValues = { 
				email: 'user@example.com', 
				password: 'securePass123' 
			};

			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBe(true);
		});

		it('should return false when single-parameter validation fails', () => {
			const validateFn = (value) => typeof value === 'string' && value.includes('@');
			const paramNames = ['email'];
			const paramValues = { email: 'invalid-email' };

			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBe(false);
		});

		it('should return false when multi-parameter validation fails', () => {
			const validateFn = ({email, password}) => {
				return email && password && 
					   email.includes('@') && 
					   password.length >= 8;
			};
			const paramNames = ['email', 'password'];
			const paramValues = { 
				email: 'user@example.com', 
				password: 'short' 
			};

			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBe(false);
		});

		it('should handle validation function exceptions gracefully', () => {
			const validateFn = (value) => {
				throw new Error('Validation error');
			};
			const paramNames = ['email'];
			const paramValues = { email: 'user@example.com' };

			// Should catch exception and return false
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBe(false);
		});
	});

	describe('4-Tier Priority System for Body Parameters', () => {
		it('should prioritize BY_METHOD_AND_ROUTE over BY_ROUTE', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'users',
						validate: (value) => value.length > 5  // Less strict
					},
					{
						route: 'POST:users',
						validate: (value) => value.length > 10  // More strict
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			// Should find POST:users rule (more specific)
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_ROUTE[1].validate);

			// Verify it's the more strict validation
			const shortValue = 'short';
			const longValue = 'this-is-a-long-value';

			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: shortValue })).toBe(false);
			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: longValue })).toBe(true);
		});

		it('should prioritize BY_ROUTE over BY_METHOD', () => {
			const paramValidations = {
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => value.length > 0
					}
				],
				BY_ROUTE: [
					{
						route: 'users',
						validate: (value) => value.includes('@')
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			// Should find BY_ROUTE rule (higher priority)
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_ROUTE[0].validate);

			// Verify it's the route-specific validation
			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: 'noatsign' })).toBe(false);
			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: 'has@sign' })).toBe(true);
		});

		it('should prioritize BY_METHOD over global', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string',  // Global
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => value && value.includes('@')  // Method-specific
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			// Should find BY_METHOD rule (higher priority)
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.BY_METHOD[0].validate);

			// Verify it's the method-specific validation
			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: 'noatsign' })).toBe(false);
			expect(ValidationExecutor.execute(rule.validate, rule.params, { email: 'has@sign' })).toBe(true);
		});

		it('should use global validation when no higher priority rules match', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string' && value.includes('@'),
				BY_METHOD: [
					{
						method: 'PUT',  // Different method
						validate: (value) => value.length > 0
					}
				],
				BY_ROUTE: [
					{
						route: 'products',  // Different route
						validate: (value) => value.includes('@')
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			// Should find global rule (no higher priority matches)
			expect(rule).not.toBeNull();
			expect(rule.validate).toBe(paramValidations.email);
			expect(rule.params).toEqual(['email']);
		});
	});

	describe('Complete Validation Workflow Integration', () => {
		it('should validate body parameters using complete workflow', () => {
			// Setup: Create validation configuration
			const paramValidations = {
				email: (value) => typeof value === 'string' && value.includes('@'),
				password: (value) => typeof value === 'string' && value.length >= 8,
				BY_ROUTE: [
					{
						route: 'POST:users?email,password,confirmPassword',
						validate: ({email, password, confirmPassword}) => {
							return !!(email && password && confirmPassword &&
								   email.includes('@') &&
								   password === confirmPassword &&
								   password.length >= 8);
						}
					}
				]
			};

			// Step 1: Create ValidationMatcher
			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// Step 2: Find validation rule
			const rule = matcher.findValidationRule('email');
			expect(rule).not.toBeNull();

			// Step 3: Execute validation with ValidationExecutor
			const validParams = {
				email: 'user@example.com',
				password: 'securePass123',
				confirmPassword: 'securePass123'
			};

			const result = ValidationExecutor.execute(rule.validate, rule.params, validParams);
			expect(result).toBe(true);

			// Step 4: Test with invalid parameters
			const invalidParams = {
				email: 'user@example.com',
				password: 'securePass123',
				confirmPassword: 'differentPass'
			};

			const invalidResult = ValidationExecutor.execute(rule.validate, rule.params, invalidParams);
			expect(invalidResult).toBe(false);
		});

		it('should handle multiple body parameters with different priority rules', () => {
			const paramValidations = {
				// Global rules
				email: (value) => typeof value === 'string',
				username: (value) => typeof value === 'string',
				age: (value) => typeof value === 'number',

				// Route-specific rules
				BY_ROUTE: [
					{
						route: 'users?email',
						validate: ({email}) => !!(email && email.includes('@'))
					}
				],

				// Method-specific rules (applies to username but not age)
				BY_METHOD: [
					{
						method: 'POST',
						validate: (value) => !!(value && typeof value === 'string' && value.length > 0)
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');

			// Email should use BY_ROUTE rule (highest priority that matches)
			const emailRule = matcher.findValidationRule('email');
			expect(emailRule).not.toBeNull();
			expect(emailRule.validate).toBe(paramValidations.BY_ROUTE[0].validate);

			// Username should use BY_METHOD rule
			const usernameRule = matcher.findValidationRule('username');
			expect(usernameRule).not.toBeNull();
			// BY_METHOD rule is used for username since no route-specific rule exists
			expect(usernameRule.validate).toBe(paramValidations.BY_METHOD[0].validate);

			// Age should also use BY_METHOD rule (it applies to all parameters for POST method)
			// Note: BY_METHOD has higher priority than global rules
			const ageRule = matcher.findValidationRule('age');
			expect(ageRule).not.toBeNull();
			expect(ageRule.validate).toBe(paramValidations.BY_METHOD[0].validate);
		});

		it('should validate nested route patterns correctly', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'users/{userId}/posts?title,content',
						validate: ({title, content}) => {
							return !!(title && content &&
								   title.length > 0 &&
								   content.length > 10);
						}
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users/123/posts');
			const rule = matcher.findValidationRule('title');

			expect(rule).not.toBeNull();
			// Note: ValidationMatcher extracts both path parameters and query parameters
			// So params will include userId (from path) plus title and content (from query spec)
			expect(rule.params).toEqual(['userId', 'title', 'content']);

			// Valid parameters (validation function only checks title and content)
			const validParams = {
				userId: '123',
				title: 'My Post',
				content: 'This is a long enough content'
			};
			expect(ValidationExecutor.execute(rule.validate, rule.params, validParams)).toBe(true);

			// Invalid parameters (content too short)
			const invalidParams = {
				userId: '123',
				title: 'My Post',
				content: 'Short'
			};
			expect(ValidationExecutor.execute(rule.validate, rule.params, invalidParams)).toBe(false);
		});

		it('should handle validation with missing parameters gracefully', () => {
			const paramValidations = {
				BY_ROUTE: [
					{
						route: 'POST:users?email,password',
						validate: ({email, password}) => {
							// Handle missing parameters
							return !!(email && password &&
								   email.includes('@') &&
								   password.length >= 8);
						}
					}
				]
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			// Missing password parameter
			const paramsWithMissing = {
				email: 'user@example.com'
				// password is missing
			};

			const result = ValidationExecutor.execute(rule.validate, rule.params, paramsWithMissing);
			expect(result).toBe(false);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should return null when no validation rule matches', () => {
			const paramValidations = {
				email: (value) => typeof value === 'string'
			};

			const matcher = new ValidationMatcher(paramValidations, 'POST', '/users');
			const rule = matcher.findValidationRule('nonexistent');

			expect(rule).toBeNull();
		});

		it('should handle empty validation configuration', () => {
			const matcher = new ValidationMatcher({}, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			expect(rule).toBeNull();
		});

		it('should handle null validation configuration', () => {
			const matcher = new ValidationMatcher(null, 'POST', '/users');
			const rule = matcher.findValidationRule('email');

			expect(rule).toBeNull();
		});

		it('should handle validation functions that return non-boolean values', () => {
			const validateFn = (value) => value.length;  // Returns number, not boolean
			const paramNames = ['email'];
			const paramValues = { email: 'test' };

			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			// JavaScript truthy/falsy conversion
			expect(typeof result).toBe('number');
		});

		it('should handle async validation functions (treated as promises)', () => {
			const validateFn = async (value) => {
				return value.includes('@');
			};
			const paramNames = ['email'];
			const paramValues = { email: 'user@example.com' };

			// ValidationExecutor doesn't await, so this returns a Promise
			const result = ValidationExecutor.execute(validateFn, paramNames, paramValues);
			expect(result).toBeInstanceOf(Promise);
		});
	});
});
