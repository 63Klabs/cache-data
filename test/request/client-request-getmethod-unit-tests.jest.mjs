import { describe, it, expect } from '@jest/globals';
import { ClientRequest } from '../../src/lib/tools/index.js';

import { testValidationsA } from '../helpers/test-validations.js';
import { testContextA } from '../helpers/test-context.js';

ClientRequest.init({ validations: testValidationsA });

/**
 * Helper to create a minimal API Gateway event with a given httpMethod.
 * @param {string|undefined|null} httpMethod - The HTTP method to set on the event
 * @returns {Object} A minimal API Gateway event object
 */
function createEvent(httpMethod) {
	return {
		httpMethod,
		path: "/test/resource",
		resource: "/test/resource",
		pathParameters: null,
		queryStringParameters: null,
		headers: {
			"User-Agent": "TestAgent/1.0",
			"Referer": "https://example.com/test"
		},
		body: null,
		requestContext: {
			accountId: "123456789012",
			resourceId: "abc123",
			stage: "test",
			requestId: "test-request-id",
			identity: {
				sourceIp: "127.0.0.1",
				userAgent: "TestAgent/1.0"
			},
			resourcePath: "/test/resource",
			httpMethod: httpMethod || "GET",
			apiId: "testapi"
		},
		isBase64Encoded: false
	};
}

describe("ClientRequest getMethod() Unit Tests", () => {

	it("getMethod() returns 'GET' for a standard GET event", () => {
		const event = createEvent("GET");
		const req = new ClientRequest(event, testContextA);
		expect(req.getMethod()).toBe("GET");
	});

	it("getMethod() returns 'POST' for lowercase 'post' input", () => {
		const event = createEvent("post");
		const req = new ClientRequest(event, testContextA);
		expect(req.getMethod()).toBe("POST");
	});

	it("getMethod() returns 'DELETE' for mixed-case 'DeLeTe' input", () => {
		const event = createEvent("DeLeTe");
		const req = new ClientRequest(event, testContextA);
		expect(req.getMethod()).toBe("DELETE");
	});

	it("getProps().method is 'GET' for lowercase 'get' input", () => {
		const event = createEvent("get");
		const req = new ClientRequest(event, testContextA);
		expect(req.getProps().method).toBe("GET");
	});

	it("getMethod() returns empty string when httpMethod is undefined", () => {
		const event = createEvent(undefined);
		const req = new ClientRequest(event, testContextA);
		expect(req.getMethod()).toBe("");
	});

	it("getMethod() returns empty string when httpMethod is null", () => {
		const event = createEvent(null);
		const req = new ClientRequest(event, testContextA);
		expect(req.getMethod()).toBe("");
	});

});
