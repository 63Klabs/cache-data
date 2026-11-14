/**
 * Jest tests for generic.response.rss.js module
 * 
 * Tests the RSS generic response module which provides pre-configured
 * HTTP response templates for RSS feed content type.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import DebugAndLog from '../../src/lib/tools/DebugAndLog.class.js';
import rssResponse from '../../src/lib/tools/generic.response.rss.js';

describe('Generic RSS Response Module', () => {
	beforeEach(() => {
		// response(427) logs a one-time deprecation warning; keep test output clean
		jest.spyOn(DebugAndLog, 'warn').mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('contentType property', () => {
		it('should match expected MIME type', () => {
			expect(rssResponse.contentType).toBe('application/rss+xml');
		});
	});

	describe('response() function', () => {
		it('should return response200 for status code 200', () => {
			const result = rssResponse.response(200);
			
			expect(result.statusCode).toBe(200);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><hello>Success</hello></rss>');
		});

		it('should return response400 for status code 400', () => {
			const result = rssResponse.response(400);
			
			expect(result.statusCode).toBe(400);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Bad Request</error></rss>');
		});

		it('should return response401 for status code 401', () => {
			const result = rssResponse.response(401);
			
			expect(result.statusCode).toBe(401);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Unauthorized</error></rss>');
		});

		it('should return response403 for status code 403', () => {
			const result = rssResponse.response(403);
			
			expect(result.statusCode).toBe(403);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Forbidden</error></rss>');
		});

		it('should return response404 for status code 404', () => {
			const result = rssResponse.response(404);
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Not Found</error></rss>');
		});

		it('should return response405 for status code 405', () => {
			const result = rssResponse.response(405);
			
			expect(result.statusCode).toBe(405);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Method Not Allowed</error></rss>');
		});

		it('should return response408 for status code 408', () => {
			const result = rssResponse.response(408);
			
			expect(result.statusCode).toBe(408);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Request Timeout</error></rss>');
		});

		it('should return response418 for status code 418', () => {
			const result = rssResponse.response(418);
			
			expect(result.statusCode).toBe(418);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\" ?><rss version=\"2.0\"><error>418 I'm a teapot</error></rss>");
		});

		it('should return response427 for status code 427', () => {
			const result = rssResponse.response(427);
			
			expect(result.statusCode).toBe(427);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Too Many Requests</error></rss>');
		});

		it('should return response500 for status code 500', () => {
			const result = rssResponse.response(500);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Internal Server Error</error></rss>');
		});

		it('should return response500 for invalid status code', () => {
			const result = rssResponse.response(999);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Internal Server Error</error></rss>');
		});

		it('should handle string status codes', () => {
			const result = rssResponse.response('404');
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Not Found</error></rss>');
		});
	});

	describe('response() function for added status codes', () => {
		it('should return response201 for status code 201', () => {
			const result = rssResponse.response(201);

			expect(result.statusCode).toBe(201);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><hello>Created</hello></rss>');
		});

		it('should return response202 for status code 202', () => {
			const result = rssResponse.response(202);

			expect(result.statusCode).toBe(202);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><hello>Accepted</hello></rss>');
		});

		it('should return response204 for status code 204', () => {
			const result = rssResponse.response(204);

			expect(result.statusCode).toBe(204);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBeNull();
		});

		it('should return response409 for status code 409', () => {
			const result = rssResponse.response(409);

			expect(result.statusCode).toBe(409);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Conflict</error></rss>');
		});

		it('should return response422 for status code 422', () => {
			const result = rssResponse.response(422);

			expect(result.statusCode).toBe(422);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Unprocessable Content</error></rss>');
		});

		it('should return response429 for status code 429', () => {
			const result = rssResponse.response(429);

			expect(result.statusCode).toBe(429);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Too Many Requests</error></rss>');
		});

		it('should return response503 for status code 503', () => {
			const result = rssResponse.response(503);

			expect(result.statusCode).toBe(503);
			expect(result.headers['Content-Type']).toBe('application/rss+xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><error>Service Unavailable</error></rss>');
		});
	});

	describe('response objects', () => {
		it('should have correct structure for response200', () => {
			expect(rssResponse.response200.statusCode).toBe(200);
			expect(rssResponse.response200.headers['Content-Type']).toBe('application/rss+xml');
			expect(rssResponse.response200.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(rssResponse.response200.body).toContain('<rss version="2.0">');
			expect(rssResponse.response200.body).toContain('Success');
		});

		it('should have correct structure for response404', () => {
			expect(rssResponse.response404.statusCode).toBe(404);
			expect(rssResponse.response404.headers['Content-Type']).toBe('application/rss+xml');
			expect(rssResponse.response404.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(rssResponse.response404.body).toContain('<rss version="2.0">');
			expect(rssResponse.response404.body).toContain('Not Found');
		});

		it('should have correct structure for response500', () => {
			expect(rssResponse.response500.statusCode).toBe(500);
			expect(rssResponse.response500.headers['Content-Type']).toBe('application/rss+xml');
			expect(rssResponse.response500.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(rssResponse.response500.body).toContain('<rss version="2.0">');
			expect(rssResponse.response500.body).toContain('Internal Server Error');
		});
	});
});
