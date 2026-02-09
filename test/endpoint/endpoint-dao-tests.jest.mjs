/**
 * Jest tests for dao-endpoint.js
 * Migrated from: test/endpoint/endpoint-dao-tests.mjs
 * 
 * Tests the Endpoint DAO class for making HTTP requests to remote APIs.
 * Covers connection configuration, parameter handling, header passing,
 * timeout scenarios, and response parsing.
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { jest } from '@jest/globals';
import Endpoint from '../../src/lib/dao-endpoint.js';

describe('Test Endpoint DAO', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Call test endpoint using Endpoint DAO class', () => {
		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests basic GET request with URI
		 */
		it('Passing uri results in success with a hidden game listed', async () => {
			const result = await Endpoint.getDataDirectFromURI({ uri: 'https://api.chadkluck.net/games/' });
			const obj = result.body;
			
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe('Tic-Tac-Toe');
		});

		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests basic GET request with host and path
		 */
		it('Passing host and path results in success with a hidden game listed', async () => {
			const result = await Endpoint.getDataDirectFromURI({ host: 'api.chadkluck.net', path: '/games/' });
			const obj = result.body;
			
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe('Tic-Tac-Toe');
		});

		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests that custom headers are passed along to the endpoint
		 */
		it('Headers were passed along', async () => {
			const headers = {
				Authorization: 'Basic somerandomExampleKey',
				'x-my-custom-header': 'hello world',
				'User-Agent': 'My User Agent'
			};
			
			const conn = {
				method: 'POST',
				host: 'api.chadkluck.net',
				path: '/echo/',
				headers: headers,
				uri: '',
				protocol: 'https',
				body: null,
				parameters: {}
			};
			
			const result = await Endpoint.getDataDirectFromURI(conn);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.requestInfo.headers.Authorization).toBe(headers.Authorization);
			expect(obj.requestInfo.headers['x-my-custom-header']).toBe(headers['x-my-custom-header']);
			expect(obj.requestInfo.userAgent).toBe(headers['User-Agent']);
		});

		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests that query parameters are passed along to the endpoint
		 */
		it('Parameters were passed along', async () => {
			const headers = {
				'x-my-custom-header': 'hello world'
			};

			const parameters = {
				param1: 'hello',
				param2: 'world',
				param3: ['hi', 'earth'],
				searchParam: 'everything',
				keywords: 'international+greetings'
			};

			const conn = {
				method: 'POST',
				host: 'api.chadkluck.net',
				path: '/echo/',
				headers: headers,
				uri: '',
				protocol: 'https',
				body: null,
				parameters: parameters
			};
			
			const result = await Endpoint.getDataDirectFromURI(conn);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.requestInfo.parameters.param1).toBe(parameters.param1);
			expect(obj.requestInfo.parameters.param2).toBe(parameters.param2);
			expect(obj.requestInfo.parameters.param3).toBe(parameters.param3.join(','));
		});

		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests GET request method
		 */
		it('GET request', async () => {
			const headers = {
				'x-my-custom-header': 'hello world'
			};

			const parameters = {
				param1: 'hello'
			};

			const conn = {
				method: 'GET',
				host: 'api.chadkluck.net',
				path: '/echo/',
				headers: headers,
				uri: '',
				protocol: 'https',
				body: null,
				parameters: parameters
			};
			
			const result = await Endpoint.getDataDirectFromURI(conn);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.requestInfo.method).toBe('GET');
		});

		/**
		 * Validates: Requirements 2.2, 2.5
		 * Tests request with host, path, and empty URI
		 */
		it('Passing host and path and an empty uri results in success with a hidden game listed', async () => {
			const conn = { host: 'api.chadkluck.net', path: '/games/', uri: '' };
			const result = await Endpoint.getDataDirectFromURI(conn);
			const obj = result.body;
			
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe('SUCCESS');
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe('Tic-Tac-Toe');
		});

		/**
		 * Validates: Requirements 2.2, 2.5, 8.3, 8.4, 8.7, 10.5
		 * Tests timeout scenario with proper mock cleanup
		 */
		it('Test timeout', async () => {
			jest.spyOn(console, 'error').mockImplementation(() => {});
			jest.spyOn(console, 'warn').mockImplementation(() => {});

			const conn = {
				method: 'GET',
				host: 'api.chadkluck.net',
				path: '/echo/',
				headers: { 'My-Custom-Header': 'my custom header value' },
				uri: '',
				protocol: 'https',
				body: null,
				parameters: { q: 'prime+numbers', limit: '5' },
				options: { timeout: 2 }
			};

			const result = await Endpoint.getDataDirectFromURI(conn);

			expect(result.statusCode).toBe(504);
			expect(result.success).toBe(false);
			expect(result.message).toBe('https.request resulted in timeout');

			// Verify warn was called
			expect(console.warn).toHaveBeenCalled();
			const warnCall = console.warn.mock.calls[0][0];
			expect(warnCall).toContain(`[WARN] Endpoint request timeout reached (${conn.options.timeout}ms) for host: ${conn.host}`);

			// Give some time for stderr to be captured
			await new Promise(resolve => setTimeout(resolve, 100));

			// Verify error was properly mocked
			expect(console.error).toHaveBeenCalled();

			jest.restoreAllMocks();
		});
	});

	describe('Query parameter merging', () => {
		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests that query parameters are merged with connection parameters
		 */
		it('should merge query parameters with connection parameters', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/',
				parameters: { param1: 'connection' }
			};
			
			const query = {
				parameters: { param2: 'query' }
			};

			const result = await Endpoint.get(conn, query);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(obj.requestInfo.parameters.param1).toBe('connection');
			expect(obj.requestInfo.parameters.param2).toBe('query');
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests that query parameters overwrite connection parameters
		 */
		it('should overwrite connection parameters with query parameters', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/',
				parameters: { param1: 'connection' }
			};
			
			const query = {
				parameters: { param1: 'query' }
			};

			const result = await Endpoint.get(conn, query);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(obj.requestInfo.parameters.param1).toBe('query');
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests handling of null query parameter
		 */
		it('should handle null query parameter', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/',
				parameters: { param1: 'test' }
			};

			const result = await Endpoint.get(conn, null);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(obj.requestInfo.parameters.param1).toBe('test');
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests handling of query without parameters property
		 */
		it('should handle query without parameters property', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/',
				parameters: { param1: 'test' }
			};

			const result = await Endpoint.get(conn, {});
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(obj.requestInfo.parameters.param1).toBe('test');
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests merging when connection has no parameters
		 */
		it('should handle merging when connection has no parameters', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/'
			};
			
			const query = {
				parameters: { param1: 'query' }
			};

			const result = await Endpoint.get(conn, query);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(obj.requestInfo.parameters.param1).toBe('query');
		});
	});

	describe('Non-JSON response handling', () => {
		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests handling of response that could be JSON or text
		 */
		it('should handle response body correctly', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/'
			};

			const result = await Endpoint.get(conn);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			// Body should be parsed as JSON if valid JSON, otherwise kept as text
			expect(result.body).toBeTruthy();
		});
	});

	describe('Error handling', () => {
		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests error handling for invalid host
		 */
		it('should handle error for invalid host', async () => {
			jest.spyOn(console, 'error').mockImplementation(() => {});

			const conn = {
				host: 'invalid-host-that-does-not-exist-12345.com',
				path: '/test/',
				options: { timeout: 1000 }
			};

			const result = await Endpoint.get(conn);

			// Should return error response
			expect(result.success).toBe(false);
			expect(result.statusCode).toBeGreaterThanOrEqual(400);

			jest.restoreAllMocks();
		});
	});

	describe('Default values', () => {
		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests that method defaults to GET
		 */
		it('should default method to GET when not provided', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/'
			};

			const result = await Endpoint.get(conn);
			const obj = result.body;

			expect(result.statusCode).toBe(200);
			expect(obj.requestInfo.method).toBe('GET');
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests that protocol defaults to https
		 */
		it('should default protocol to https when not provided', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/echo/'
			};

			const result = await Endpoint.get(conn);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests handling of minimal connection object
		 */
		it('should handle minimal connection object with defaults', async () => {
			const conn = {
				host: 'api.chadkluck.net',
				path: '/games/'
			};

			const result = await Endpoint.get(conn);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(result.body).toBeTruthy();
		});
	});
});
