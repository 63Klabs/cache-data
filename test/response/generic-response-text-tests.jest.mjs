/**
 * Jest tests for generic.response.text.js module
 * 
 * Tests the plain text generic response module which provides pre-configured
 * HTTP response templates for text/plain content type.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 1.3, 1.6, 1.7, 1.8, 1.9, 1.10
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import DebugAndLog from '../../src/lib/tools/DebugAndLog.class.js';
import textResponse from '../../src/lib/tools/generic.response.text.js';

describe('Generic Text Response Module', () => {
	beforeEach(() => {
		// response(427) logs a one-time deprecation warning; keep test output clean
		jest.spyOn(DebugAndLog, 'warn').mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('contentType property', () => {
		it('should match expected MIME type', () => {
			expect(textResponse.contentType).toBe('text/plain');
		});
	});

	describe('response() function', () => {
		it('should return response200 for status code 200', () => {
			const result = textResponse.response(200);
			
			expect(result.statusCode).toBe(200);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Success');
		});

		it('should return response400 for status code 400', () => {
			const result = textResponse.response(400);
			
			expect(result.statusCode).toBe(400);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Bad Request');
		});

		it('should return response401 for status code 401', () => {
			const result = textResponse.response(401);
			
			expect(result.statusCode).toBe(401);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Unauthorized');
		});

		it('should return response403 for status code 403', () => {
			const result = textResponse.response(403);
			
			expect(result.statusCode).toBe(403);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Forbidden');
		});

		it('should return response404 for status code 404', () => {
			const result = textResponse.response(404);
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Not Found');
		});

		it('should return response405 for status code 405', () => {
			const result = textResponse.response(405);
			
			expect(result.statusCode).toBe(405);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Method Not Allowed');
		});

		it('should return response408 for status code 408', () => {
			const result = textResponse.response(408);
			
			expect(result.statusCode).toBe(408);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Request Timeout');
		});

		it('should return response418 for status code 418', () => {
			const result = textResponse.response(418);
			
			expect(result.statusCode).toBe(418);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe("I'm a teapot");
		});

		it('should return response427 for status code 427', () => {
			const result = textResponse.response(427);
			
			expect(result.statusCode).toBe(427);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Too Many Requests');
		});

		it('should return response500 for status code 500', () => {
			const result = textResponse.response(500);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Internal Server Error');
		});

		it('should return response500 for invalid status code', () => {
			const result = textResponse.response(999);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Internal Server Error');
		});

		it('should handle string status codes', () => {
			const result = textResponse.response('404');
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Not Found');
		});
	});

	describe('response() function for added status codes', () => {
		it('should return response201 for status code 201', () => {
			const result = textResponse.response(201);

			expect(result.statusCode).toBe(201);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Created');
		});

		it('should return response202 for status code 202', () => {
			const result = textResponse.response(202);

			expect(result.statusCode).toBe(202);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Accepted');
		});

		it('should return response204 for status code 204', () => {
			const result = textResponse.response(204);

			expect(result.statusCode).toBe(204);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBeNull();
		});

		it('should return response409 for status code 409', () => {
			const result = textResponse.response(409);

			expect(result.statusCode).toBe(409);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Conflict');
		});

		it('should return response422 for status code 422', () => {
			const result = textResponse.response(422);

			expect(result.statusCode).toBe(422);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Unprocessable Content');
		});

		it('should return response429 for status code 429', () => {
			const result = textResponse.response(429);

			expect(result.statusCode).toBe(429);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Too Many Requests');
		});

		it('should return response503 for status code 503', () => {
			const result = textResponse.response(503);

			expect(result.statusCode).toBe(503);
			expect(result.headers['Content-Type']).toBe('text/plain');
			expect(result.body).toBe('Service Unavailable');
		});
	});

	describe('response objects', () => {
		it('should have correct structure for response200', () => {
			expect(textResponse.response200).toEqual({
				statusCode: 200,
				headers: { 'Content-Type': 'text/plain' },
				body: 'Success'
			});
		});

		it('should have correct structure for response404', () => {
			expect(textResponse.response404).toEqual({
				statusCode: 404,
				headers: { 'Content-Type': 'text/plain' },
				body: 'Not Found'
			});
		});

		it('should have correct structure for response500', () => {
			expect(textResponse.response500).toEqual({
				statusCode: 500,
				headers: { 'Content-Type': 'text/plain' },
				body: 'Internal Server Error'
			});
		});
	});
});
