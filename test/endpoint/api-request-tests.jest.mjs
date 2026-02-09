/**
 * Jest tests for APIRequest.class
 * Migrated from: test/endpoint/api-request-tests.mjs
 * 
 * Tests HTTP/HTTPS request handling, redirect management, timeout handling,
 * request/response formatting, and Connection/ConnectionAuthentication classes.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { jest } from '@jest/globals';
import { APIRequest, Connection, ConnectionAuthentication } from '../../src/lib/tools/index.js';

describe("Call test endpoint", () => {

	describe('Call test endpoint using tools APIRequest class', () => {
		
		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Passing uri results in success with a hidden game listed', async () => {
			let req = new APIRequest({uri: 'https://api.chadkluck.net/games/'})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe("Tic-Tac-Toe")
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Passing host and path results in success with a hidden game listed', async () => {
			let req = new APIRequest({host: 'api.chadkluck.net', path: '/games/'})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe("Tic-Tac-Toe")
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Headers were passed along', async () => {

			let headers = {
				Authorization: "Basic somerandomExampleKey",
				//'if-none-match': "528cd81ca4",
				//'if-modified-since': "Mon, 14 Feb 2022 03:44:00 GMT",
				'x-my-custom-header': "hello world",
				'User-Agent': "My User Agent"
			};
			let req = new APIRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: {}
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.requestInfo.headers.Authorization).toBe(headers.Authorization)
			//&& expect(obj.requestInfo.headers['if-none-match']).toBe(headers['if-none-match'])
			//&& expect(obj.requestInfo.headers['if-modified-since']).toBe(headers['if-modified-since']);
			expect(obj.requestInfo.headers['x-my-custom-header']).toBe(headers['x-my-custom-header']);
			expect(obj.requestInfo.userAgent).toBe(headers['User-Agent'])
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Parameters were passed along and duplicates were combined into CSV', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello",
				param2: "world",
				param3: ["hi","earth"],
				searchParam: "everything",
				keywords: "international+greetings"
			}

			let req = new APIRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.requestInfo.parameters.param1).toBe(parameters.param1);
			expect(obj.requestInfo.parameters.param2).toBe(parameters.param2);
			expect(obj.requestInfo.parameters.param3).toBe(parameters.param3.join(','))
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Parameters were passed along and duplicates were separate', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello",
				param2: "world",
				param3: ["hi","earth"],
				searchParam: "everything",
				keywords: "international+greetings"
			}

			let req = new APIRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters,
				options: {separateDuplicateParameters: true, separateDuplicateParametersAppendToKey: "0++"}
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.requestInfo.parameters.param1).toBe(parameters.param1);
			expect(obj.requestInfo.parameters.param2).toBe(parameters.param2);
			expect(obj.requestInfo.parameters.param30).toBe(parameters.param3[0]);
			expect(obj.requestInfo.parameters.param31).toBe(parameters.param3[1]);
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Body was passed along in a POST request', async () => {

			let headers = {
				'x-my-custom-header': "hello world",
				'Content-Type': "text/plain",
				'User-Agent': "My User Agent"
			};

			let parameters = {
				param1: "hello"
			};

			let body = "Hello, Earth!";

			let req = new APIRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: body,
				parameters: parameters
			})
			const result = await req.send()

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(result.body).toBe('"'+body+'"')
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('GET request', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello"
			}

			let req = new APIRequest({
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.requestInfo.method).toBe("GET")
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Passing host and path and an empty uri results in success with a hidden game listed', async () => {
			let req = new APIRequest({host: 'api.chadkluck.net', path: '/games/', uri: ''})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("SUCCESS");
			expect(obj.hiddengames.length).toBe(1);
			expect(obj.hiddengames[0]).toBe("Tic-Tac-Toe")
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Passing uri results in 404', async () => {
			let req = new APIRequest({uri: 'https://api.chadkluck.net/echo/?status=404'})
			const result = await req.send()
			expect(result.statusCode).toBe(404);
			expect(result.success).toBe(false);
			expect(typeof result.headers).toBe('object');
			expect(result.message).toBe("FAIL")
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Passing uri results in no redirect', async () => {
			let req = new APIRequest({uri: 'https://api.chadkluck.net/games/'})
			const result = await req.send()
			expect(result.statusCode).toBe(200);
			expect(req.toObject().redirects.length).toBe(0)
		})
		
	});

	describe('Test ConnectionAuthentication class', () => {

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Basic' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({basic: {username: "snoopy", password: "W00dstock1966"}}),
				body: null,
				})
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers.Authorization).toBe("Basic c25vb3B5OlcwMGRzdG9jazE5NjY=");
			expect(obj.headers.Authorization).toBe("Basic c25vb3B5OlcwMGRzdG9jazE5NjY=");
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Parameters' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({parameters: {apikey: "myExampleApiKeyForResource1234"}}),
				body: null,
			})
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.parameters.apikey).toBe("myExampleApiKeyForResource1234");
			expect(obj.parameters.apikey).toBe("myExampleApiKeyForResource1234");
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Parameters with Existing Parameters', async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				parameters: {empId: "B8472881993", format: "full"},
				authentication: new ConnectionAuthentication({parameters: {apikey: "myExampleApiKeyForResource5678"}}),
				body: null,
			})

			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.parameters.apikey).toBe("myExampleApiKeyForResource5678");
			expect(obj.parameters.apikey).toBe("myExampleApiKeyForResource5678");
			expect(obj.parameters.empId).toBe("B8472881993");
			expect(obj.parameters.format).toBe("full");
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Headers' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({headers: {'x-apikey': "myExampleApiKeyForResource1234"}}),
				body: null,
			});
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers['x-apikey']).toBe("myExampleApiKeyForResource1234");
			expect(obj.headers['x-apikey']).toBe("myExampleApiKeyForResource1234");
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Headers with Existing Headers', async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				headers: {'x-empid': "B8472881993", 'x-format': "full"},
				authentication: new ConnectionAuthentication({headers: {'x-apikey': "myExampleApiKeyForResource5678"}}),
				body: null,
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers['x-apikey']).toBe("myExampleApiKeyForResource5678");
			expect(obj.headers['x-apikey']).toBe("myExampleApiKeyForResource5678");
			expect(obj.headers['x-empid']).toBe("B8472881993");
			expect(obj.headers['x-format']).toBe("full");
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Body', async () => {
			let bodyValue = {apikey: "myExampleApiKeyForResource1234"};
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({body: bodyValue}),
				body: null,
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));
			let body = obj.body;
			try {
				body = JSON.parse(obj.body);
			} catch (error) {
				// nothing
			}

			expect(obj.authentication.body.apikey).toBe("myExampleApiKeyForResource1234");
			expect(obj.body).toBe(JSON.stringify(bodyValue));
			expect(body.apikey).toBe("myExampleApiKeyForResource1234");
		})

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('ConnectionAuthentication Body with Existing Body', async () => {
			let bodyValue = {empId: "B8472881993", format: "full"};
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				body: bodyValue,
				authentication: new ConnectionAuthentication({body: {apikey: "myExampleApiKeyForResource5678"}}),
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));
			let body = obj.body;
			try {
				body = JSON.parse(obj.body);
			} catch (error) {
				// nothing
			}

			expect(obj.authentication.body.apikey).toBe("myExampleApiKeyForResource5678");
			expect(obj.body).toBe(JSON.stringify({apikey: "myExampleApiKeyForResource5678"}));
			expect(body.apikey).toBe("myExampleApiKeyForResource5678");
		})

	});

	describe('Test APIRequest class', () => {

		afterEach(() => {
			jest.restoreAllMocks();
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Testing setter and getter functions of APIRequest without sending', async () => {
			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: { "My-Custom-Header": "my custom header value"},
				uri: "",
				protocol: "https",
				body: null,
				parameters: {q: "prime+numbers", limit: "5"},
				options: { timeout: 2000}
			};

			let req = new APIRequest(obj);

			expect(req.getMethod()).toBe(obj.method);
			expect(req.getBody()).toBe(obj.body);
			expect(req.getTimeOutInMilliseconds()).toBe(obj.options.timeout)
		});

		/**
		 * Validates: Requirements 1.2, 1.5
		 */
		it('Testing min value of timeOutInMilliseconds', () => {

			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: { "My-Custom-Header": "my custom header value"},
				uri: "",
				protocol: "https",
				body: null,
				parameters: {q: "prime+numbers", limit: "5"},
				options: { timeout: 0}
			};

			let req = new APIRequest(obj);

			expect(req.getMethod()).toBe(obj.method);
			expect(req.getBody()).toBe(obj.body);
			expect(req.getTimeOutInMilliseconds()).toBe(8000);
		});

		/**
		 * Validates: Requirements 1.2, 1.5, 8.3, 8.4, 8.7, 10.5
		 */
		it('Test timeout', async () => {

			jest.spyOn(console, 'error').mockImplementation(() => {});
			jest.spyOn(console, 'warn').mockImplementation(() => {});

			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: { "My-Custom-Header": "my custom header value"},
				uri: "",
				protocol: "https",
				body: null,
				parameters: {q: "prime+numbers", limit: "5"},
				options: { timeout: 2}
			};
		
			let req = new APIRequest(obj);
			const result = await req.send();
	
			// Separate the assertions
			expect(result.statusCode).toBe(504);
			expect(result.success).toBe(false);
			expect(result.message).toBe("https.request resulted in timeout");
			
			// Give some time for stderr to be captured
			await new Promise(resolve => setTimeout(resolve, 100));

			// Verify log was called
			expect(console.warn).toHaveBeenCalled();

			// If you need to verify specific log content
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining(`[WARN] Endpoint request timeout reached (${obj.options.timeout}ms) for host: ${obj.host}`)
			);
		
			// Give some time for stderr to be captured
			await new Promise(resolve => setTimeout(resolve, 100));
	
			// Verify error was properly mocked
			expect(console.error).toHaveBeenCalled();
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests edge case: null options should use defaults
		 */
		it('Testing null options uses default timeout', () => {
			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				body: null,
				parameters: {},
				options: null
			};

			let req = new APIRequest(obj);

			expect(req.getTimeOutInMilliseconds()).toBe(8000);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests edge case: negative timeout should use default
		 */
		it('Testing negative timeout uses default', () => {
			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				body: null,
				parameters: {},
				options: { timeout: -100 }
			};

			let req = new APIRequest(obj);

			expect(req.getTimeOutInMilliseconds()).toBe(8000);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests edge case: empty parameters object
		 */
		it('Testing empty parameters object', async () => {
			let req = new APIRequest({
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				body: null,
				parameters: {}
			});

			const result = await req.send();
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests edge case: null body in POST request
		 */
		it('Testing null body in POST request', async () => {
			let req = new APIRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				body: null,
				parameters: {}
			});

			const result = await req.send();
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests edge case: empty headers object
		 */
		it('Testing empty headers object', async () => {
			let req = new APIRequest({
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				headers: {},
				body: null,
				parameters: {}
			});

			const result = await req.send();
			expect(result.statusCode).toBe(200);
			expect(result.success).toBe(true);
		});

		/**
		 * Validates: Requirements 4.4, 4.5, 4.6
		 * Tests toObject() method returns proper structure
		 */
		it('Testing toObject() method', () => {
			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				uri: "",
				protocol: "https",
				body: null,
				parameters: {test: "value"}
			};

			let req = new APIRequest(obj);
			const reqObj = req.toObject();

			expect(reqObj).toHaveProperty('request');
			expect(reqObj).toHaveProperty('redirects');
			expect(reqObj.request).toHaveProperty('method');
			expect(reqObj.request).toHaveProperty('host');
			expect(reqObj.request).toHaveProperty('path');
			expect(reqObj.request).toHaveProperty('protocol');
			expect(reqObj.request).toHaveProperty('parameters');
			expect(reqObj.request.method).toBe(obj.method);
			expect(reqObj.redirects).toEqual([]);
		});
		
	});
	
});
