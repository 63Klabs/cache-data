import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Response, ClientRequest, jsonGenericResponse, xmlGenericResponse, rssGenericResponse, textGenericResponse, htmlGenericResponse } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

describe("Response Class", () => {
	// Create a fresh copy of test event for each test
	let REQ;
	let options;
	let logStub;

	ClientRequest.init({ validations: testValidationsA });

	beforeEach(() => {
		// Ensure any previous stubs are cleaned up
		logStub = jest.spyOn(console, 'log').mockImplementation();

		options = {
			jsonResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value" },
					body: { message: "Hello World" }
				}
			},
			htmlResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value HTML" },
					body: "<html><head><title>Hello</title></head><body><h1>Hello World</h1></body></html>"
				}
			},
			settings: {
				errorExpirationInSeconds: 422,
				routeExpirationInSeconds: 922
			}
		};

		// Initialize with fresh options for each test
		Response.init(options);
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		// Clean up after each test
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("Test Response Class init", () => {

		it("Check Response Class init", () => {
			expect(Response.getContentType()).toBe("application/json");
			expect(Response.getErrorExpirationInSeconds()).toBe(options.settings.errorExpirationInSeconds);
			expect(Response.getRouteExpirationInSeconds()).toBe(options.settings.routeExpirationInSeconds);
		});

		it("Check Response class static variables", () => {
			expect(Response.CONTENT_TYPE.JSON).toBe(jsonGenericResponse.contentType);
			expect(Response.CONTENT_TYPE.HTML).toBe(htmlGenericResponse.contentType);
			expect(Response.CONTENT_TYPE.RSS).toBe(rssGenericResponse.contentType);
			expect(Response.CONTENT_TYPE.XML).toBe(xmlGenericResponse.contentType);
			expect(Response.CONTENT_TYPE.TEXT).toBe(textGenericResponse.contentType);
			expect(Response.CONTENT_TYPE.CSS).toBe("text/css");
			expect(Response.CONTENT_TYPE.CSV).toBe("text/csv");
			expect(Response.CONTENT_TYPE.JAVASCRIPT).toBe("application/javascript");
		});

		it("Check Response class static methods ContentType inspections", () => {
			expect(Response.inspectBodyContentType(jsonGenericResponse.response200.body)).toBe(Response.CONTENT_TYPE.JSON);
			expect(Response.inspectBodyContentType(htmlGenericResponse.response200.body)).toBe(Response.CONTENT_TYPE.HTML);
			expect(Response.inspectBodyContentType(xmlGenericResponse.response200.body)).toBe(Response.CONTENT_TYPE.XML);
			expect(Response.inspectBodyContentType(rssGenericResponse.response200.body)).toBe(Response.CONTENT_TYPE.RSS);
			expect(Response.inspectBodyContentType(textGenericResponse.response200.body)).toBe(Response.CONTENT_TYPE.TEXT);
		});
	});

	describe("Set response with an object then update portions of the response (JSON)", () => {
		it("Test set and add methods", () => {

			const obj = {
				statusCode: 200,
				headers: { "X-Api-Header": "MyAPI-World" },
				body: { "message": "Hello Saturn!" }
			};
			const RESPONSE = new Response(REQ, obj);

			expect(RESPONSE.getStatusCode()).toBe(200);
			expect(RESPONSE.getHeaders()).toEqual({ "X-Api-Header": "MyAPI-World", "Content-Type": "application/json" });
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello Saturn!" });

			RESPONSE.setBody({ "message": "Hello Mars!" });
			expect(RESPONSE.getStatusCode()).toBe(200);
			expect(RESPONSE.getHeaders()).toEqual({ "X-Api-Header": "MyAPI-World", "Content-Type": "application/json" });
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello Mars!" });

			RESPONSE.setHeaders({ "X-Api-Header": "MyAPI-Mars" });
			expect(RESPONSE.getStatusCode()).toBe(200);
			expect(RESPONSE.getHeaders()).toEqual({ "X-Api-Header": "MyAPI-Mars", "Content-Type": "application/json" });
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello Mars!" });

			RESPONSE.addHeader("X-Api-Header2", "MyAPI-Mars2");
			expect(RESPONSE.getStatusCode()).toBe(200);
			expect(RESPONSE.getHeaders()).toEqual({ "X-Api-Header": "MyAPI-Mars", "X-Api-Header2": "MyAPI-Mars2", "Content-Type": "application/json" });
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello Mars!" });

			RESPONSE.setHeaders({ "X-Api-Header": "MyAPI-Mars" });
			expect(RESPONSE.getStatusCode()).toBe(200);
			expect(RESPONSE.getHeaders()).toEqual({ "X-Api-Header": "MyAPI-Mars", "Content-Type": "application/json" });
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello Mars!" });
		});
	});

	describe("Test finalize and log", () => {
		it("Test finalize and log", () => {

			const RESPONSE = new Response(REQ);

			const resp = RESPONSE.finalize();

			// Your existing expectations
			expect(resp.statusCode).toBe(200);
			expect(resp.headers['Cache-Control']).toBe("max-age=922");
			expect(resp.headers['Content-Type']).toBe("application/json");
			expect(resp.headers['X-Custom-Header']).toBe("Custom Value");
			expect(resp.headers['x-exec-ms']).toBe(`${REQ.getFinalExecutionTime()}`);

			// Expires header validation
			const expires = resp.headers['Expires'];
			const maxAge = resp.headers['Cache-Control'];
			const maxAgeSeconds = parseInt(maxAge.split('=')[1]);
			const maxAgeMS = maxAgeSeconds * 1000;
			const expiresDate = new Date(expires);
			const now = new Date();
			const diff = expiresDate.getTime() - now.getTime();
			expect(diff).toBeLessThan(maxAgeMS + 1000);

			expect(resp.body).toBe(JSON.stringify({ "message": "Hello World" }));
			expect(RESPONSE.getBody()).toEqual({ "message": "Hello World" });

			// Verify log was called
			expect(logStub).toHaveBeenCalled();

			// Verify log content
			expect(logStub.mock.calls[0][0]).toContain(`[RESPONSE] 200 | 25 | JSON | ${REQ.getFinalExecutionTime()} | 192.168.100.1 | Mozilla/5.0 | - | https://internal.example.com/dev | GET:employees/{employeeId}/profile | format=detailed&include=contact,department&version=2 | - | - | -`);
		});
	});
});

describe("Response Class Finalize", () => {
	// Create a fresh copy of test event for each test
	let REQ;
	let options;
	let logStub;

	ClientRequest.init({ validations: testValidationsA });

	beforeEach(() => {
		// Ensure any previous stubs are cleaned up
		logStub = jest.spyOn(console, 'log').mockImplementation();

		options = {
			jsonResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value" },
					body: { message: "Hello World" }
				}
			},
			htmlResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value HTML" },
					body: "<html><head><title>Hello</title></head><body><h1>Hello World</h1></body></html>"
				}
			},
			settings: {
				errorExpirationInSeconds: 422,
				routeExpirationInSeconds: 922
			}
		};

		// Initialize with fresh options for each test
		Response.init(options);
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		// Clean up after each test
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("Test finalize and log", () => {
		it("Test finalize and log", () => {

			const RESPONSE = new Response(REQ);
			const resp = RESPONSE.finalize();

			expect(resp.statusCode).toBe(200);
			expect(resp.headers['Cache-Control']).toBe("max-age=922");
			expect(resp.headers['Content-Type']).toBe("application/json");
			expect(resp.headers['X-Custom-Header']).toBe("Custom Value");
			expect(resp.headers['x-exec-ms']).toBe(`${REQ.getFinalExecutionTime()}`);

			const expectedLogMessage = `[RESPONSE] 200 | 25 | JSON | ${REQ.getFinalExecutionTime()} | 192.168.100.1 | Mozilla/5.0 | - | https://internal.example.com/dev | GET:employees/{employeeId}/profile | format=detailed&include=contact,department&version=2 | - | - | -`;

			expect(logStub.mock.calls[0][0]).toBe(expectedLogMessage);
		});
	});
});
