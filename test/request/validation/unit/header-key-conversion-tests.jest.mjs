/**
 * Unit Tests: Header Key Conversion
 * 
 * Tests the convertHeaderKeyToCamelCase static method on ClientRequest class.
 * Validates conversion of HTTP header names from kebab-case to camelCase.
 */

import { describe, it, expect } from '@jest/globals';

// Import ClientRequest
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

describe('ClientRequest.convertHeaderKeyToCamelCase()', () => {
	describe('Common HTTP Headers', () => {
		it('should convert content-type to contentType', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('content-type');
			expect(result).toBe('contentType');
		});

		it('should convert Content-Type to contentType', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('Content-Type');
			expect(result).toBe('contentType');
		});

		it('should convert authorization to authorization', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('authorization');
			expect(result).toBe('authorization');
		});

		it('should convert Authorization to authorization', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('Authorization');
			expect(result).toBe('authorization');
		});

		it('should convert x-api-key to xApiKey', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-api-key');
			expect(result).toBe('xApiKey');
		});

		it('should convert X-API-Key to xApiKey', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('X-API-Key');
			expect(result).toBe('xApiKey');
		});

		it('should convert cache-control to cacheControl', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('cache-control');
			expect(result).toBe('cacheControl');
		});

		it('should convert if-modified-since to ifModifiedSince', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('if-modified-since');
			expect(result).toBe('ifModifiedSince');
		});

		it('should convert if-none-match to ifNoneMatch', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('if-none-match');
			expect(result).toBe('ifNoneMatch');
		});

		it('should convert user-agent to userAgent', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('user-agent');
			expect(result).toBe('userAgent');
		});

		it('should convert accept-encoding to acceptEncoding', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('accept-encoding');
			expect(result).toBe('acceptEncoding');
		});
	});

	describe('Multiple Hyphens', () => {
		it('should convert x-custom-header to xCustomHeader', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-custom-header');
			expect(result).toBe('xCustomHeader');
		});

		it('should convert x-custom-header-name to xCustomHeaderName', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-custom-header-name');
			expect(result).toBe('xCustomHeaderName');
		});

		it('should convert my-very-long-header-name to myVeryLongHeaderName', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('my-very-long-header-name');
			expect(result).toBe('myVeryLongHeaderName');
		});

		it('should convert a-b-c-d-e to aBCDE', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('a-b-c-d-e');
			expect(result).toBe('aBCDE');
		});
	});

	describe('Uppercase Input', () => {
		it('should convert CONTENT-TYPE to contentType', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('CONTENT-TYPE');
			expect(result).toBe('contentType');
		});

		it('should convert X-CUSTOM-HEADER to xCustomHeader', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('X-CUSTOM-HEADER');
			expect(result).toBe('xCustomHeader');
		});

		it('should convert X-API-KEY to xApiKey', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('X-API-KEY');
			expect(result).toBe('xApiKey');
		});
	});

	describe('Mixed Case Input', () => {
		it('should convert Content-Type to contentType', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('Content-Type');
			expect(result).toBe('contentType');
		});

		it('should convert X-Custom-Header to xCustomHeader', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('X-Custom-Header');
			expect(result).toBe('xCustomHeader');
		});

		it('should convert X-Api-Key to xApiKey', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('X-Api-Key');
			expect(result).toBe('xApiKey');
		});
	});

	describe('Edge Cases', () => {
		it('should return empty string for null input', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase(null);
			expect(result).toBe('');
		});

		it('should return empty string for undefined input', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase(undefined);
			expect(result).toBe('');
		});

		it('should return empty string for empty string input', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('');
			expect(result).toBe('');
		});

		it('should return empty string for non-string input (number)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase(123);
			expect(result).toBe('');
		});

		it('should return empty string for non-string input (object)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase({});
			expect(result).toBe('');
		});

		it('should return empty string for non-string input (array)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase([]);
			expect(result).toBe('');
		});
	});

	describe('No Hyphens', () => {
		it('should convert authorization to authorization (no change)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('authorization');
			expect(result).toBe('authorization');
		});

		it('should convert Authorization to authorization (lowercase)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('Authorization');
			expect(result).toBe('authorization');
		});

		it('should convert AUTHORIZATION to authorization (lowercase)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('AUTHORIZATION');
			expect(result).toBe('authorization');
		});

		it('should convert host to host', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('host');
			expect(result).toBe('host');
		});

		it('should convert Host to host', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('Host');
			expect(result).toBe('host');
		});
	});

	describe('Special Cases', () => {
		it('should handle single character before hyphen', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-test');
			expect(result).toBe('xTest');
		});

		it('should handle single character after hyphen', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('test-x');
			expect(result).toBe('testX');
		});

		it('should handle hyphen at start (edge case)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('-test');
			// Hyphen followed by letter gets converted to uppercase
			expect(result).toBe('Test');
		});

		it('should handle hyphen at end (edge case)', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('test-');
			expect(result).toBe('test');
		});

		it('should handle multiple consecutive hyphens', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('test--header');
			expect(result).toBe('testHeader');
		});

		it('should handle only hyphens', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('---');
			expect(result).toBe('');
		});
	});

	describe('Real-World AWS Headers', () => {
		it('should convert x-amz-request-id to xAmzRequestId', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-amz-request-id');
			expect(result).toBe('xAmzRequestId');
		});

		it('should convert x-amz-date to xAmzDate', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-amz-date');
			expect(result).toBe('xAmzDate');
		});

		it('should convert x-amz-security-token to xAmzSecurityToken', () => {
			const result = ClientRequest.convertHeaderKeyToCamelCase('x-amz-security-token');
			expect(result).toBe('xAmzSecurityToken');
		});
	});

	describe('Consistency', () => {
		it('should produce same result for same input called multiple times', () => {
			const input = 'x-custom-header';
			const result1 = ClientRequest.convertHeaderKeyToCamelCase(input);
			const result2 = ClientRequest.convertHeaderKeyToCamelCase(input);
			const result3 = ClientRequest.convertHeaderKeyToCamelCase(input);
			
			expect(result1).toBe(result2);
			expect(result2).toBe(result3);
			expect(result1).toBe('xCustomHeader');
		});

		it('should produce same result regardless of input case', () => {
			const lower = ClientRequest.convertHeaderKeyToCamelCase('content-type');
			const upper = ClientRequest.convertHeaderKeyToCamelCase('CONTENT-TYPE');
			const mixed = ClientRequest.convertHeaderKeyToCamelCase('Content-Type');
			
			expect(lower).toBe(upper);
			expect(upper).toBe(mixed);
			expect(lower).toBe('contentType');
		});
	});
});
