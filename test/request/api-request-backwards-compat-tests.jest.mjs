import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import APIRequest from '../../src/lib/tools/APIRequest.class.js';

describe('APIRequest Backwards Compatibility', () => {
	
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Constructor Compatibility', () => {
		it('should accept old parameters without pagination or retry', () => {
			const request = {
				method: 'GET',
				host: 'api.example.com',
				path: '/users',
				parameters: { id: '123' },
				headers: { 'Authorization': 'Bearer token' },
				body: null,
				note: 'Test request',
				options: {
					timeout: 5000
				}
			};
			
			expect(() => new APIRequest(request)).not.toThrow();
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.method).toBe('GET');
			expect(requestObj.request.uri).toContain('api.example.com');
			expect(requestObj.request.uri).toContain('/users');
			expect(requestObj.request.note).toBe('Test request');
			expect(requestObj.request.options.timeout).toBe(5000);
		});

		it('should accept minimal request object', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			expect(() => new APIRequest(request)).not.toThrow();
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.method).toBe('GET');
			expect(requestObj.request.uri).toContain('api.example.com');
		});

		it('should accept request with uri instead of host/path', () => {
			const request = {
				uri: 'https://api.example.com/users?id=123'
			};
			
			expect(() => new APIRequest(request)).not.toThrow();
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.uri).toBe('https://api.example.com/users?id=123');
		});

		it('should accept request with POST method and body', () => {
			const request = {
				method: 'POST',
				host: 'api.example.com',
				path: '/users',
				body: JSON.stringify({ name: 'John' }),
				headers: { 'Content-Type': 'application/json' }
			};
			
			expect(() => new APIRequest(request)).not.toThrow();
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.method).toBe('POST');
			expect(requestObj.request.body).toBe(JSON.stringify({ name: 'John' }));
		});

		it('should accept request with array parameters', () => {
			const request = {
				host: 'api.example.com',
				path: '/search',
				parameters: {
					tags: ['javascript', 'nodejs', 'testing']
				},
				options: {
					separateDuplicateParameters: false,
					combinedDuplicateParameterDelimiter: ','
				}
			};
			
			expect(() => new APIRequest(request)).not.toThrow();
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.uri).toContain('tags=');
		});
	});

	describe('Response Format Compatibility', () => {
		it('should return old format without new features', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/status/200',
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			// Old format fields
			expect(response).toHaveProperty('success');
			expect(response).toHaveProperty('statusCode');
			expect(response).toHaveProperty('headers');
			expect(response).toHaveProperty('body');
			expect(response).toHaveProperty('message');
			
			// Should NOT have metadata when features not used
			expect(response).not.toHaveProperty('metadata');
			
			// Verify types
			expect(typeof response.success).toBe('boolean');
			expect(typeof response.statusCode).toBe('number');
			expect(typeof response.message).toBe('string');
		});

		it('should return response without metadata when pagination disabled', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/get',
				pagination: { enabled: false },
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response).toHaveProperty('success');
			expect(response).toHaveProperty('statusCode');
			expect(response).not.toHaveProperty('metadata');
		});

		it('should return response without metadata when retry disabled', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/get',
				retry: { enabled: false },
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response).toHaveProperty('success');
			expect(response).toHaveProperty('statusCode');
			expect(response).not.toHaveProperty('metadata');
		});
	});

	describe('Static Method Compatibility', () => {
		it('should have responseFormat static method unchanged', () => {
			expect(typeof APIRequest.responseFormat).toBe('function');
			
			const response = APIRequest.responseFormat(
				true,
				200,
				'SUCCESS',
				{ 'content-type': 'application/json' },
				'{"data": "test"}'
			);
			
			expect(response).toEqual({
				success: true,
				statusCode: 200,
				message: 'SUCCESS',
				headers: { 'content-type': 'application/json' },
				body: '{"data": "test"}'
			});
		});

		it('should handle responseFormat with minimal parameters', () => {
			const response = APIRequest.responseFormat(false, 500);
			
			expect(response).toEqual({
				success: false,
				statusCode: 500,
				message: null,
				headers: null,
				body: null
			});
		});

		it('should have MAX_REDIRECTS static property', () => {
			expect(APIRequest.MAX_REDIRECTS).toBeDefined();
			expect(typeof APIRequest.MAX_REDIRECTS).toBe('number');
			expect(APIRequest.MAX_REDIRECTS).toBe(5);
		});
	});

	describe('Public API Compatibility', () => {
		it('should have all existing public methods', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				note: 'Test note'
			};
			
			const apiRequest = new APIRequest(request);
			
			// Check all public methods exist
			expect(typeof apiRequest.send).toBe('function');
			expect(typeof apiRequest.send_get).toBe('function');
			expect(typeof apiRequest.resetRequest).toBe('function');
			expect(typeof apiRequest.updateRequestURI).toBe('function');
			expect(typeof apiRequest.addRedirect).toBe('function');
			expect(typeof apiRequest.getNumberOfRedirects).toBe('function');
			expect(typeof apiRequest.setResponse).toBe('function');
			expect(typeof apiRequest.getURI).toBe('function');
			expect(typeof apiRequest.getBody).toBe('function');
			expect(typeof apiRequest.getMethod).toBe('function');
			expect(typeof apiRequest.getNote).toBe('function');
			expect(typeof apiRequest.getTimeOutInMilliseconds).toBe('function');
			expect(typeof apiRequest.getHost).toBe('function');
			expect(typeof apiRequest.toObject).toBe('function');
		});

		it('should have getURI method work as before', () => {
			const request = {
				uri: 'https://api.example.com/users?id=123&token=secret'
			};
			
			const apiRequest = new APIRequest(request);
			
			// With query string
			expect(apiRequest.getURI(true)).toBe('https://api.example.com/users?id=123&token=secret');
			
			// Without query string
			expect(apiRequest.getURI(false)).toBe('https://api.example.com/users');
		});

		it('should have getMethod return correct method', () => {
			const getRequest = new APIRequest({ host: 'api.example.com', path: '/test' });
			expect(getRequest.getMethod()).toBe('GET');
			
			const postRequest = new APIRequest({ 
				method: 'POST', 
				host: 'api.example.com', 
				path: '/test' 
			});
			expect(postRequest.getMethod()).toBe('POST');
		});

		it('should have getHost return correct host', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			expect(apiRequest.getHost()).toBe('api.example.com');
		});

		it('should have getNote return correct note', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				note: 'My test note'
			};
			
			const apiRequest = new APIRequest(request);
			expect(apiRequest.getNote()).toBe('My test note');
		});

		it('should have getTimeOutInMilliseconds return correct timeout', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				options: { timeout: 10000 }
			};
			
			const apiRequest = new APIRequest(request);
			expect(apiRequest.getTimeOutInMilliseconds()).toBe(10000);
		});

		it('should have getBody return correct body', () => {
			const body = JSON.stringify({ name: 'John' });
			const request = {
				method: 'POST',
				host: 'api.example.com',
				path: '/test',
				body: body
			};
			
			const apiRequest = new APIRequest(request);
			expect(apiRequest.getBody()).toBe(body);
		});

		it('should have toObject return request information', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				note: 'Test'
			};
			
			const apiRequest = new APIRequest(request);
			const obj = apiRequest.toObject();
			
			expect(obj).toHaveProperty('MAX_REDIRECTS');
			expect(obj).toHaveProperty('request');
			expect(obj).toHaveProperty('requestComplete');
			expect(obj).toHaveProperty('redirects');
			expect(obj).toHaveProperty('response');
			
			expect(obj.MAX_REDIRECTS).toBe(5);
			expect(Array.isArray(obj.redirects)).toBe(true);
		});
	});

	describe('Requests Without Pagination Behave Identically', () => {
		it('should make simple GET request without pagination', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/get',
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
			expect(response).not.toHaveProperty('metadata');
		});

		it('should handle query parameters without pagination', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/get',
				parameters: {
					param1: 'value1',
					param2: 'value2'
				},
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(true);
			expect(response).not.toHaveProperty('metadata');
		});

		it('should handle headers without pagination', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/headers',
				headers: {
					'X-Custom-Header': 'test-value'
				},
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(true);
			expect(response).not.toHaveProperty('metadata');
		});
	});

	describe('Requests Without Retry Behave Identically', () => {
		it('should make single attempt without retry', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/status/200',
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(true);
			expect(response.statusCode).toBe(200);
			expect(response).not.toHaveProperty('metadata');
		});

		it('should fail immediately on error without retry', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/status/500',
				options: { timeout: 5000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(false);
			expect(response.statusCode).toBe(500);
			expect(response).not.toHaveProperty('metadata');
		});

		it('should handle timeout without retry', async () => {
			const request = {
				host: 'httpbin.org',
				path: '/delay/10',
				options: { timeout: 1000 }
			};
			
			const apiRequest = new APIRequest(request);
			const response = await apiRequest.send();
			
			expect(response.success).toBe(false);
			expect(response.statusCode).toBe(504);
			expect(response).not.toHaveProperty('metadata');
		}, 15000);
	});

	describe('Query String Building Compatibility', () => {
		it('should build query string with simple parameters', () => {
			const request = {
				host: 'api.example.com',
				path: '/search',
				parameters: {
					q: 'test query',
					limit: 10
				}
			};
			
			const apiRequest = new APIRequest(request);
			const uri = apiRequest.getURI();
			
			expect(uri).toContain('q=test%20query');
			expect(uri).toContain('limit=10');
		});

		it('should build query string with array parameters (combined)', () => {
			const request = {
				host: 'api.example.com',
				path: '/search',
				parameters: {
					tags: ['javascript', 'nodejs']
				},
				options: {
					separateDuplicateParameters: false,
					combinedDuplicateParameterDelimiter: ','
				}
			};
			
			const apiRequest = new APIRequest(request);
			const uri = apiRequest.getURI();
			
			expect(uri).toContain('tags=javascript,nodejs');
		});

		it('should build query string with array parameters (separate)', () => {
			const request = {
				host: 'api.example.com',
				path: '/search',
				parameters: {
					tags: ['javascript', 'nodejs']
				},
				options: {
					separateDuplicateParameters: true
				}
			};
			
			const apiRequest = new APIRequest(request);
			const uri = apiRequest.getURI();
			
			expect(uri).toContain('tags=javascript');
			expect(uri).toContain('tags=nodejs');
		});

		it('should encode special characters in parameters', () => {
			const request = {
				host: 'api.example.com',
				path: '/search',
				parameters: {
					q: 'test & special = chars'
				}
			};
			
			const apiRequest = new APIRequest(request);
			const uri = apiRequest.getURI();
			
			expect(uri).toContain('q=test%20%26%20special%20%3D%20chars');
		});
	});

	describe('Redirect Handling Compatibility', () => {
		it('should track redirects correctly', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			
			expect(apiRequest.getNumberOfRedirects()).toBe(0);
			
			apiRequest.addRedirect('https://api.example.com/redirect1');
			expect(apiRequest.getNumberOfRedirects()).toBe(1);
			
			apiRequest.addRedirect('https://api.example.com/redirect2');
			expect(apiRequest.getNumberOfRedirects()).toBe(2);
		});

		it('should update URI on redirect', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			const originalUri = apiRequest.getURI();
			
			const newUri = 'https://api.example.com/redirected';
			apiRequest.addRedirect(newUri);
			
			expect(apiRequest.getURI()).toBe(newUri);
			expect(apiRequest.getURI()).not.toBe(originalUri);
		});
	});

	describe('Options Merging Compatibility', () => {
		it('should merge custom options with defaults', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				options: {
					timeout: 15000,
					separateDuplicateParameters: true
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.options.timeout).toBe(15000);
			expect(requestObj.request.options.separateDuplicateParameters).toBe(true);
			expect(requestObj.request.options.combinedDuplicateParameterDelimiter).toBe(',');
		});

		it('should use default timeout when not provided', () => {
			const request = {
				host: 'api.example.com',
				path: '/test'
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.options.timeout).toBe(8000);
		});

		it('should override default timeout when provided', () => {
			const request = {
				host: 'api.example.com',
				path: '/test',
				options: {
					timeout: 3000
				}
			};
			
			const apiRequest = new APIRequest(request);
			const requestObj = apiRequest.toObject();
			
			expect(requestObj.request.options.timeout).toBe(3000);
		});
	});
});
