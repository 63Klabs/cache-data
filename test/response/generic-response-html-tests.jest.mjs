/**
 * Jest tests for generic.response.html.js module
 * 
 * Tests the HTML generic response module which provides pre-configured
 * HTTP response templates for HTML content type.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 1.2, 1.6, 1.7, 1.8, 1.9, 1.10
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import DebugAndLog from '../../src/lib/tools/DebugAndLog.class.js';
import htmlResponse from '../../src/lib/tools/generic.response.html.js';

describe('Generic HTML Response Module', () => {
	beforeEach(() => {
		// response(427) logs a one-time deprecation warning; keep test output clean
		jest.spyOn(DebugAndLog, 'warn').mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('contentType property', () => {
		it('should match expected MIME type', () => {
			expect(htmlResponse.contentType).toBe('text/html; charset=utf-8');
		});
	});

	describe('response() function', () => {
		it('should return response200 for status code 200', () => {
			const result = htmlResponse.response(200);
			
			expect(result.statusCode).toBe(200);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>200 OK</title></head><body><p>Success</p></body></html>');
		});

		it('should return response400 for status code 400', () => {
			const result = htmlResponse.response(400);
			
			expect(result.statusCode).toBe(400);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>400 Bad Request</title></head><body><p>Bad Request</p></body></html>');
		});

		it('should return response401 for status code 401', () => {
			const result = htmlResponse.response(401);
			
			expect(result.statusCode).toBe(401);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>401 Unauthorized</title></head><body><p>Unauthorized</p></body></html>');
		});

		it('should return response403 for status code 403', () => {
			const result = htmlResponse.response(403);
			
			expect(result.statusCode).toBe(403);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>403 Forbidden</title></head><body><p>Forbidden</p></body></html>');
		});

		it('should return response404 for status code 404', () => {
			const result = htmlResponse.response(404);
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>404 Not Found</title></head><body><p>Not Found</p></body></html>');
		});

		it('should return response405 for status code 405', () => {
			const result = htmlResponse.response(405);
			
			expect(result.statusCode).toBe(405);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>405 Method Not Allowed</title></head><body><p>Method Not Allowed</p></body></html>');
		});

		it('should return response408 for status code 408', () => {
			const result = htmlResponse.response(408);
			
			expect(result.statusCode).toBe(408);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>408 Request Timeout</title></head><body><p>Request Timeout</p></body></html>');
		});

		it('should return response418 for status code 418', () => {
			const result = htmlResponse.response(418);
			
			expect(result.statusCode).toBe(418);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe("<html><head><title>418 I'm a teapot</title></head><body><p>I'm a teapot</p></body></html>");
		});

		it('should return response427 for status code 427', () => {
			const result = htmlResponse.response(427);
			
			expect(result.statusCode).toBe(427);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>427 Too Many Requests</title></head><body><p>Too Many Requests</p></body></html>');
		});

		it('should return response500 for status code 500', () => {
			const result = htmlResponse.response(500);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>500 Error</title></head><body><p>Internal Server Error</p></body></html>');
		});

		it('should return response500 for invalid status code', () => {
			const result = htmlResponse.response(999);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>500 Error</title></head><body><p>Internal Server Error</p></body></html>');
		});

		it('should handle string status codes', () => {
			const result = htmlResponse.response('404');
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>404 Not Found</title></head><body><p>Not Found</p></body></html>');
		});
	});

	describe('response() function for added status codes', () => {
		it('should return response201 for status code 201', () => {
			const result = htmlResponse.response(201);

			expect(result.statusCode).toBe(201);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>201 Created</title></head><body><p>Created</p></body></html>');
		});

		it('should return response202 for status code 202', () => {
			const result = htmlResponse.response(202);

			expect(result.statusCode).toBe(202);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>202 Accepted</title></head><body><p>Accepted</p></body></html>');
		});

		it('should return response204 for status code 204', () => {
			const result = htmlResponse.response(204);

			expect(result.statusCode).toBe(204);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBeNull();
		});

		it('should return response409 for status code 409', () => {
			const result = htmlResponse.response(409);

			expect(result.statusCode).toBe(409);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>409 Conflict</title></head><body><p>Conflict</p></body></html>');
		});

		it('should return response422 for status code 422', () => {
			const result = htmlResponse.response(422);

			expect(result.statusCode).toBe(422);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>422 Unprocessable Content</title></head><body><p>Unprocessable Content</p></body></html>');
		});

		it('should return response429 for status code 429', () => {
			const result = htmlResponse.response(429);

			expect(result.statusCode).toBe(429);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>429 Too Many Requests</title></head><body><p>Too Many Requests</p></body></html>');
		});

		it('should return response503 for status code 503', () => {
			const result = htmlResponse.response(503);

			expect(result.statusCode).toBe(503);
			expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(result.body).toBe('<html><head><title>503 Service Unavailable</title></head><body><p>Service Unavailable</p></body></html>');
		});
	});

	describe('response objects', () => {
		it('should have correct structure for response200', () => {
			expect(htmlResponse.response200.statusCode).toBe(200);
			expect(htmlResponse.response200.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(htmlResponse.response200.body).toContain('<html>');
			expect(htmlResponse.response200.body).toContain('Success');
		});

		it('should have correct structure for response404', () => {
			expect(htmlResponse.response404.statusCode).toBe(404);
			expect(htmlResponse.response404.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(htmlResponse.response404.body).toContain('<html>');
			expect(htmlResponse.response404.body).toContain('Not Found');
		});

		it('should have correct structure for response500', () => {
			expect(htmlResponse.response500.statusCode).toBe(500);
			expect(htmlResponse.response500.headers['Content-Type']).toBe('text/html; charset=utf-8');
			expect(htmlResponse.response500.body).toContain('<html>');
			expect(htmlResponse.response500.body).toContain('Internal Server Error');
		});
	});
});
