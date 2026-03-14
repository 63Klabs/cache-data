import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

/* ****************************************************************************
 * Setup
 * --------------------------------------------------------------------------
 * Initialize ClientRequest and Response once for the test suite.
 *************************************************************************** */

ClientRequest.init({ validations: testValidationsA });

/* ****************************************************************************
 * Generators
 * --------------------------------------------------------------------------
 * Reusable fast-check arbitraries for building Response instances and
 * generating random strings/arrays for setMessage property tests.
 *************************************************************************** */

/**
 * Generate a non-empty printable string suitable for a message.
 * Excludes control characters to keep assertions straightforward.
 *
 * @returns {fc.Arbitrary<string>} A non-empty string
 */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })
	.filter((s) => s.trim().length > 0);

/**
 * Generate a non-empty array of non-empty strings suitable for messages.
 *
 * @returns {fc.Arbitrary<Array<string>>} A non-empty array of strings
 */
const nonEmptyStringArrayArb = fc.array(
	fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
	{ minLength: 1, maxLength: 10 }
);

/**
 * Generate a random JSON-safe status code from common HTTP codes.
 *
 * @returns {fc.Arbitrary<number>} An HTTP status code
 */
const statusCodeArb = fc.constantFrom(200, 201, 400, 401, 403, 404, 500);

/**
 * Generate a random JSON object body with arbitrary key-value pairs.
 * The body always starts as a plain object so addToJsonBody can merge into it.
 *
 * @returns {fc.Arbitrary<Object>} A plain JSON object
 */
const jsonObjectBodyArb = fc.record({
	data: fc.string(),
	count: fc.integer({ min: 0, max: 1000 })
});

/* ****************************************************************************
 * Property-Based Tests
 * Feature: enhance-invalid-request-messaging
 *************************************************************************** */
describe("Response setMessage() - Property-Based Tests", () => {
	let REQ;
	let logStub;

	beforeEach(() => {
		logStub = jest.spyOn(console, "log").mockImplementation();

		Response.init({
			jsonResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value" },
					body: { message: "Hello World" }
				}
			},
			settings: {
				errorExpirationInSeconds: 300,
				routeExpirationInSeconds: 600
			}
		});

		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("Property 10: setMessage with string merges message property", () => {
		// Feature: enhance-invalid-request-messaging, Property 10: setMessage with string merges message property

		it("for any Response with JSON object body and any non-empty string s, setMessage(s) results in getBody().message === s without altering status code or headers", () => {
			fc.assert(
				fc.property(
					statusCodeArb,
					jsonObjectBodyArb,
					nonEmptyStringArb,
					(statusCode, bodyObj, messageStr) => {
						const response = new Response(REQ, {
							statusCode,
							body: { ...bodyObj }
						});

						const statusBefore = response.getStatusCode();
						const headersBefore = { ...response.getHeaders() };

						response.setMessage(messageStr);

						const body = response.getBody();

						// Message property is set to the provided string
						expect(body.message).toBe(messageStr);

						// Status code is not altered
						expect(response.getStatusCode()).toBe(statusBefore);

						// Headers are not altered
						expect(response.getHeaders()).toEqual(headersBefore);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 11: setMessage with array merges messages property", () => {
		// Feature: enhance-invalid-request-messaging, Property 11: setMessage with array merges messages property

		it("for any Response with JSON object body and any non-empty array of strings, setMessage(arr) results in getBody().messages deep-equal to arr without altering status code or headers", () => {
			fc.assert(
				fc.property(
					statusCodeArb,
					jsonObjectBodyArb,
					nonEmptyStringArrayArb,
					(statusCode, bodyObj, messagesArr) => {
						const response = new Response(REQ, {
							statusCode,
							body: { ...bodyObj }
						});

						const statusBefore = response.getStatusCode();
						const headersBefore = { ...response.getHeaders() };

						response.setMessage(messagesArr);

						const body = response.getBody();

						// Messages property is set to the provided array
						expect(body.messages).toEqual(messagesArr);

						// Status code is not altered
						expect(response.getStatusCode()).toBe(statusBefore);

						// Headers are not altered
						expect(response.getHeaders()).toEqual(headersBefore);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
