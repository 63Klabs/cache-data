/**
 * Property-Based Test: Header Key Conversion Correctness
 * 
 * Feature: body-validation-and-header-format-fix
 * Property 4: For any valid HTTP header name in kebab-case, converting it to camelCase
 * using convertHeaderKeyToCamelCase() SHALL produce a valid JavaScript property name
 * that can be used in validation rules.
 * 
 * @tag Feature: body-validation-and-header-format-fix, Property 4: Header Key Conversion Correctness
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

describe('Property 4: Header Key Conversion Correctness', () => {
	it('should convert any kebab-case header name to valid camelCase', () => {
		fc.assert(
			fc.property(
				// Generate kebab-case header names
				fc.array(
					fc.stringMatching(/^[a-z]+$/),
					{ minLength: 1, maxLength: 5 }
				).map(parts => parts.join('-')),
				(kebabCaseHeader) => {
					// Convert to camelCase
					const camelCaseHeader = ClientRequest.convertHeaderKeyToCamelCase(kebabCaseHeader);
					
					// Property 1: Result should be a valid JavaScript identifier
					// (starts with letter, contains only letters)
					const isValidIdentifier = /^[a-z][a-zA-Z]*$/.test(camelCaseHeader);
					expect(isValidIdentifier).toBe(true);
					
					// Property 2: Result should not contain hyphens
					expect(camelCaseHeader).not.toContain('-');
					
					// Property 3: Result should be all lowercase except for camelCase capitals
					const hasOnlyValidChars = /^[a-zA-Z]+$/.test(camelCaseHeader);
					expect(hasOnlyValidChars).toBe(true);
					
					// Property 4: First character should be lowercase
					expect(camelCaseHeader[0]).toBe(camelCaseHeader[0].toLowerCase());
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should handle uppercase input consistently', () => {
		fc.assert(
			fc.property(
				// Generate header names with mixed case
				fc.array(
					fc.stringMatching(/^[a-zA-Z]+$/),
					{ minLength: 1, maxLength: 5 }
				).map(parts => parts.join('-')),
				(headerName) => {
					// Convert both uppercase and lowercase versions
					const fromLower = ClientRequest.convertHeaderKeyToCamelCase(headerName.toLowerCase());
					const fromUpper = ClientRequest.convertHeaderKeyToCamelCase(headerName.toUpperCase());
					const fromMixed = ClientRequest.convertHeaderKeyToCamelCase(headerName);
					
					// Property: All should produce the same result
					expect(fromLower).toBe(fromUpper);
					expect(fromLower).toBe(fromMixed);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should handle multiple consecutive hyphens correctly', () => {
		fc.assert(
			fc.property(
				// Generate header names with multiple hyphens
				fc.array(
					fc.stringMatching(/^[a-z]+$/),
					{ minLength: 2, maxLength: 5 }
				).map(parts => parts.join('--')),  // Double hyphens
				(headerName) => {
					const result = ClientRequest.convertHeaderKeyToCamelCase(headerName);
					
					// Property: Result should not contain any hyphens
					expect(result).not.toContain('-');
					
					// Property: Result should be a valid identifier
					const isValidIdentifier = /^[a-z][a-zA-Z]*$/.test(result);
					expect(isValidIdentifier).toBe(true);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should be idempotent for already camelCase input', () => {
		fc.assert(
			fc.property(
				// Generate camelCase strings (no hyphens)
				fc.stringMatching(/^[a-z][a-zA-Z]*$/),
				(camelCaseInput) => {
					const result = ClientRequest.convertHeaderKeyToCamelCase(camelCaseInput);
					
					// Property: Converting camelCase input should return lowercase version
					expect(result).toBe(camelCaseInput.toLowerCase());
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should handle edge cases gracefully', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.constant(''),
					fc.constant(null),
					fc.constant(undefined),
					fc.constant('-'),
					fc.constant('--'),
					fc.constant('a-'),
					fc.constant('-a')
				),
				(edgeCase) => {
					// Should not throw
					const result = ClientRequest.convertHeaderKeyToCamelCase(edgeCase);
					
					// Property: Result should always be a string
					expect(typeof result).toBe('string');
					
					// Property: Empty/null/undefined should return empty string
					if (!edgeCase || edgeCase === '') {
						expect(result).toBe('');
					}
					
					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it('should preserve word boundaries correctly', () => {
		fc.assert(
			fc.property(
				// Generate header names with known word boundaries
				fc.tuple(
					fc.stringMatching(/^[a-z]{2,5}$/),
					fc.stringMatching(/^[a-z]{2,5}$/),
					fc.stringMatching(/^[a-z]{2,5}$/)
				).map(([word1, word2, word3]) => `${word1}-${word2}-${word3}`),
				(kebabCase) => {
					const result = ClientRequest.convertHeaderKeyToCamelCase(kebabCase);
					const parts = kebabCase.split('-');
					
					// Property: First word should be all lowercase
					expect(result.startsWith(parts[0])).toBe(true);
					
					// Property: Subsequent words should start with uppercase
					// Count uppercase letters - should equal number of hyphens
					const uppercaseCount = (result.match(/[A-Z]/g) || []).length;
					const hyphenCount = (kebabCase.match(/-/g) || []).length;
					expect(uppercaseCount).toBe(hyphenCount);
					
					return true;
				}
			),
			{ numRuns: 100 }
		);
	});
});
