/**
 * Jest tests for generic.response.json.js module
 * 
 * Tests the JSON generic response module which provides pre-configured
 * HTTP response templates for JSON content type.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 1.1, 1.6, 1.7, 1.8, 1.9, 1.10
 */

import { describe, it, expect } from '@jest/globals';
import jsonResponse from '../../src/lib/tools/generic.response.json.js';

describe('Generic JSON Response Module', () => {
	describe('contentType property', () => {
		it('should match expected MIME type', () => {
			expect(jsonResponse.contentType).toBe('application/json');
		});
	});

	describe('response() function', () => {
		it('should return response200 for status code 200', () => {
			const result = jsonResponse.response(200);
			
			expect(result.statusCode).toBe(200);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Success' });
		});

		it('should return response400 for status code 400', () => {
			const result = jsonResponse.response(400);
			
			expect(result.statusCode).toBe(400);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Bad Request' });
		});

		it('should return response401 for status code 401', () => {
			const result = jsonResponse.response(401);
			
			expect(result.statusCode).toBe(401);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Unauthorized' });
		});

		it('should return response403 for status code 403', () => {
			const result = jsonResponse.response(403);
			
			expect(result.statusCode).toBe(403);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Forbidden' });
		});

		it('should return response404 for status code 404', () => {
			const result = jsonResponse.response(404);
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Not Found' });
		});

		it('should return response405 for status code 405', () => {
			const result = jsonResponse.response(405);
			
			expect(result.statusCode).toBe(405);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Method Not Allowed' });
		});

		it('should return response408 for status code 408', () => {
			const result = jsonResponse.response(408);
			
			expect(result.statusCode).toBe(408);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Request Timeout' });
		});

		it('should return response418 for status code 418', () => {
			const result = jsonResponse.response(418);
			
			expect(result.statusCode).toBe(418);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: "I'm a teapot" });
		});

		it('should return response427 for status code 427', () => {
			const result = jsonResponse.response(427);
			
			expect(result.statusCode).toBe(427);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Too Many Requests' });
		});

		it('should return response500 for status code 500', () => {
			const result = jsonResponse.response(500);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Internal Server Error' });
		});

		it('should return response500 for invalid status code', () => {
			const result = jsonResponse.response(999);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Internal Server Error' });
		});

		it('should handle string status codes', () => {
			const result = jsonResponse.response('404');
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/json');
			expect(result.body).toEqual({ message: 'Not Found' });
		});
	});

	describe('response objects', () => {
		it('should have correct structure for response200', () => {
			expect(jsonResponse.response200).toEqual({
				statusCode: 200,
				headers: { 'Content-Type': 'application/json' },
				body: { message: 'Success' }
			});
		});

		it('should have correct structure for response404', () => {
			expect(jsonResponse.response404).toEqual({
				statusCode: 404,
				headers: { 'Content-Type': 'application/json' },
				body: { message: 'Not Found' }
			});
		});

		it('should have correct structure for response500', () => {
			expect(jsonResponse.response500).toEqual({
				statusCode: 500,
				headers: { 'Content-Type': 'application/json' },
				body: { message: 'Internal Server Error' }
			});
		});
	});
});
