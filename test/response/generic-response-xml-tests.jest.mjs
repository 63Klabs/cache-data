/**
 * Jest tests for generic.response.xml.js module
 * 
 * Tests the XML generic response module which provides pre-configured
 * HTTP response templates for XML content type.
 * 
 * Feature: 1-3-10-test-migration-phase-5
 * Requirements: 1.4, 1.6, 1.7, 1.8, 1.9, 1.10
 */

import { describe, it, expect } from '@jest/globals';
import xmlResponse from '../../src/lib/tools/generic.response.xml.js';

describe('Generic XML Response Module', () => {
	describe('contentType property', () => {
		it('should match expected MIME type', () => {
			expect(xmlResponse.contentType).toBe('application/xml');
		});
	});

	describe('response() function', () => {
		it('should return response200 for status code 200', () => {
			const result = xmlResponse.response(200);
			
			expect(result.statusCode).toBe(200);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><hello>Success</hello>');
		});

		it('should return response400 for status code 400', () => {
			const result = xmlResponse.response(400);
			
			expect(result.statusCode).toBe(400);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Bad Request</error>');
		});

		it('should return response401 for status code 401', () => {
			const result = xmlResponse.response(401);
			
			expect(result.statusCode).toBe(401);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Unauthorized</error>');
		});

		it('should return response403 for status code 403', () => {
			const result = xmlResponse.response(403);
			
			expect(result.statusCode).toBe(403);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Forbidden</error>');
		});

		it('should return response404 for status code 404', () => {
			const result = xmlResponse.response(404);
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Not Found</error>');
		});

		it('should return response405 for status code 405', () => {
			const result = xmlResponse.response(405);
			
			expect(result.statusCode).toBe(405);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Method Not Allowed</error>');
		});

		it('should return response408 for status code 408', () => {
			const result = xmlResponse.response(408);
			
			expect(result.statusCode).toBe(408);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Request Timeout</error>');
		});

		it('should return response418 for status code 418', () => {
			const result = xmlResponse.response(418);
			
			expect(result.statusCode).toBe(418);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\" ?><error>418 I'm a teapot</error>");
		});

		it('should return response427 for status code 427', () => {
			const result = xmlResponse.response(427);
			
			expect(result.statusCode).toBe(427);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Too Many Requests</error>');
		});

		it('should return response500 for status code 500', () => {
			const result = xmlResponse.response(500);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Internal Server Error</error>');
		});

		it('should return response500 for invalid status code', () => {
			const result = xmlResponse.response(999);
			
			expect(result.statusCode).toBe(500);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Internal Server Error</error>');
		});

		it('should handle string status codes', () => {
			const result = xmlResponse.response('404');
			
			expect(result.statusCode).toBe(404);
			expect(result.headers['Content-Type']).toBe('application/xml');
			expect(result.body).toBe('<?xml version="1.0" encoding="UTF-8" ?><error>Not Found</error>');
		});
	});

	describe('response objects', () => {
		it('should have correct structure for response200', () => {
			expect(xmlResponse.response200.statusCode).toBe(200);
			expect(xmlResponse.response200.headers['Content-Type']).toBe('application/xml');
			expect(xmlResponse.response200.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(xmlResponse.response200.body).toContain('Success');
		});

		it('should have correct structure for response404', () => {
			expect(xmlResponse.response404.statusCode).toBe(404);
			expect(xmlResponse.response404.headers['Content-Type']).toBe('application/xml');
			expect(xmlResponse.response404.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(xmlResponse.response404.body).toContain('Not Found');
		});

		it('should have correct structure for response500', () => {
			expect(xmlResponse.response500.statusCode).toBe(500);
			expect(xmlResponse.response500.headers['Content-Type']).toBe('application/xml');
			expect(xmlResponse.response500.body).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
			expect(xmlResponse.response500.body).toContain('Internal Server Error');
		});
	});
});
