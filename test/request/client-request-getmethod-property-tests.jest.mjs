import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { ClientRequest } from '../../src/lib/tools/index.js';

import { testValidationsA } from '../helpers/test-validations.js';
import { testContextA } from '../helpers/test-context.js';

ClientRequest.init({ validations: testValidationsA });

/**
 * Helper to create a minimal API Gateway event with a given httpMethod.
 * @param {string} httpMethod - The HTTP method to set on the event
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

describe("Feature: add-getmethod-to-clientrequest, Property 1: Uppercase Normalization and Accessor Consistency", () => {

	/**
	 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 5.5, 5.6**
	 *
	 * Property 1: For any arbitrary string as httpMethod, verify:
	 * - getMethod() === input.toUpperCase()
	 * - getProps().method === input.toUpperCase()
	 * - getMethod() === getProps().method
	 */
	it("Property 1: For any arbitrary string as httpMethod, getMethod() and getProps().method both equal input.toUpperCase() and are equal to each other", () => {
		fc.assert(
			fc.property(
				fc.string(),
				(httpMethod) => {
					const event = createEvent(httpMethod);
					const req = new ClientRequest(event, testContextA);

					const expected = httpMethod.toUpperCase();
					const methodResult = req.getMethod();
					const propsMethodResult = req.getProps().method;

					expect(methodResult).toBe(expected);
					expect(propsMethodResult).toBe(expected);
					expect(methodResult).toBe(propsMethodResult);
				}
			),
			{ numRuns: 100 }
		);
	});

});
