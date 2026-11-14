/**
 * Test: Response with the default generic templates (unit and property tests)
 *
 * Feature: 1-4-2-generic-responses-for-unlisted-status-codes
 *
 * Purpose: Verify what Response builds from the default generic response templates when the
 * caller supplies no body: the templates added for 201, 202, 204 and others, the class
 * fallback for statuses without a template (410 uses the 400 template, 203 the 200 template,
 * 301 the bodiless 204 template), and the rule in reset() that a null template body clears
 * the body of an existing instance. Also pin the unchanged behavior for a supplied body and
 * for a supplied falsy non-nullish body.
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Response.init() in beforeEach with errorExpirationInSeconds 180 and
 *   routeExpirationInSeconds 3600 (Response.init takes effect once per test file, so every
 *   case shares these settings). No custom templates are supplied, so the defaults apply.
 * - DebugAndLog.log and DebugAndLog.warn are spied on, so nothing is written
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Related Tests:
 * - test/response/response-set-body-to-null-unit-tests.jest.mjs (status 200 characterization)
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs (custom templates)
 * - test/response/generic-response-class-fallback-tests.jest.mjs (the modules themselves)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

ClientRequest.init({ validations: testValidationsA });

const REDIRECT_URL = "https://example.com/new-path";

describe("Response with the default generic templates", () => {
	let REQ;

	beforeEach(() => {
		jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
		Response.init({
			settings: {
				errorExpirationInSeconds: 180,
				routeExpirationInSeconds: 3600
			}
		});
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("204 No Content", () => {
		it("new Response(req, { statusCode: 204 }) has status 204, a null body and a Content-Type header", () => {
			const response = new Response(REQ, { statusCode: 204 });

			expect(response.getStatusCode()).toBe(204);
			expect(response.getBody()).toBeNull();
			expect(response.toObject().headers["Content-Type"]).toBe("application/json");
		});

		it("reset({ statusCode: 204 }) on a response holding a body leaves a null body", () => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });
			expect(response.getBody()).toEqual({ a: 1 });

			response.reset({ statusCode: 204 });

			expect(response.getStatusCode()).toBe(204);
			expect(response.getBody()).toBeNull();
		});

		it("reset({ statusCode: 204, body }) with a non-nullish body keeps that body", () => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 204, body: { b: 2 } });

			expect(response.getStatusCode()).toBe(204);
			expect(response.getBody()).toEqual({ b: 2 });
		});

		it("finalize() returns status 204, body null and keeps Content-Type", () => {
			const response = new Response(REQ, { statusCode: 204 });

			const result = response.finalize();

			expect(result.statusCode).toBe(204);
			expect(result.body).toBeNull();
			expect(result.headers["Content-Type"]).toBe("application/json");
		});

		it("finalize() adds Cache-Control max-age from routeExpirationInSeconds", () => {
			const response = new Response(REQ, { statusCode: 204 });

			const result = response.finalize();

			expect(result.headers["Cache-Control"]).toBe("max-age=3600");
		});

		it("finalize() keeps an application-set Cache-Control", () => {
			const response = new Response(REQ, { statusCode: 204 });
			response.addHeader("Cache-Control", "no-store");

			const result = response.finalize();

			expect(result.body).toBeNull();
			expect(result.headers["Cache-Control"]).toBe("no-store");
		});
	});

	describe("redirect without a body", () => {
		it("reset({ statusCode: 301, headers: { Location } }) has status 301, a null body, Location and Content-Type", () => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 301, headers: { Location: REDIRECT_URL } });
			const headers = response.toObject().headers;

			expect(response.getStatusCode()).toBe(301);
			expect(response.getBody()).toBeNull();
			expect(headers.Location).toBe(REDIRECT_URL);
			expect(headers["Content-Type"]).toBe("application/json");
		});

		it("new Response(req, { statusCode: 301, headers: { Location } }) keeps Location through finalize()", () => {
			const response = new Response(REQ, { statusCode: 301, headers: { Location: REDIRECT_URL } });

			const result = response.finalize();

			expect(result.statusCode).toBe(301);
			expect(result.body).toBeNull();
			expect(result.headers.Location).toBe(REDIRECT_URL);
			expect(result.headers["Content-Type"]).toBe("application/json");
		});
	});

	describe("templates added for listed statuses", () => {
		it("201 has status 201 and the 201 template body", () => {
			const response = new Response(REQ, { statusCode: 201 });

			expect(response.getStatusCode()).toBe(201);
			expect(response.getBody()).toEqual({ message: "Created" });
		});

		it("202 has status 202 and the 202 template body", () => {
			const response = new Response(REQ, { statusCode: 202 });

			expect(response.getStatusCode()).toBe(202);
			expect(response.getBody()).toEqual({ message: "Accepted" });
		});

		it("a non-JSON content type given explicitly gets the XML 201 body", () => {
			const response = new Response(REQ, { statusCode: 201 }, Response.CONTENT_TYPE.XML);

			expect(response.getStatusCode()).toBe(201);
			expect(response.getBody()).toContain("<hello>Created</hello>");
		});
	});

	describe("statuses without a template use the template of their class", () => {
		it("410 has status 410 and the 400 template body", () => {
			const response = new Response(REQ, { statusCode: 410 });

			expect(response.getStatusCode()).toBe(410);
			expect(response.getBody()).toEqual({ message: "Bad Request" });
		});

		it("203 has status 203 and the 200 template body", () => {
			const response = new Response(REQ, { statusCode: 203 });

			expect(response.getStatusCode()).toBe(203);
			expect(response.getBody()).toEqual({ message: "Success" });
		});

		it("502 has status 502 and the 500 template body", () => {
			const response = new Response(REQ, { statusCode: 502 });

			expect(response.getStatusCode()).toBe(502);
			expect(response.getBody()).toEqual({ message: "Internal Server Error" });
		});

		it("reset({ statusCode: 410 }) on a response holding a body gives the 400 template body", () => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 410 });

			expect(response.getStatusCode()).toBe(410);
			expect(response.getBody()).toEqual({ message: "Bad Request" });
		});
	});

	describe("a supplied body is not replaced by a template", () => {
		it("a supplied body at an unlisted status is kept", () => {
			const response = new Response(REQ, { statusCode: 410, body: { gone: true } });

			expect(response.getStatusCode()).toBe(410);
			expect(response.getBody()).toEqual({ gone: true });
		});

		it.each([
			["an empty string", ""],
			["0", 0],
			["false", false]
		])("reset() with a supplied body of %s keeps the previous body (as in v1.4.1)", (label, value) => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 200, body: value });

			// set() ignores a falsy body, so the previous body stays
			expect(response.getBody()).toEqual({ a: 1 });
		});

		it.each([
			["an empty string", ""],
			["0", 0],
			["false", false]
		])("reset({ statusCode: 204, body: %s }) keeps the previous body rather than clearing it", (label, value) => {
			const response = new Response(REQ);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 204, body: value });

			expect(response.getStatusCode()).toBe(204);
			expect(response.getBody()).toEqual({ a: 1 });
		});
	});

	describe("Property 8: a null template body clears the body and a supplied body is kept", () => {
		// Codes that resolve to the bodiless 204 template: 204 itself and the bodiless fallback
		const BODILESS_CODES = [204, 301, 304, 205, 100];

		// Prior and supplied bodies are truthy and non-nullish by construction (minLength 1,
		// min 1, constant true, arrays and objects), so setBody() always takes them and no
		// filter on the asserted result is needed.
		const truthyBodyArbitrary = fc.oneof(
			fc.string({ minLength: 1, maxLength: 20 }),
			fc.integer({ min: 1, max: 1000 }),
			fc.constant(true),
			fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 5 }),
			fc.dictionary(
				fc.stringMatching(/^[a-z]{1,8}$/),
				fc.integer({ min: 0, max: 100 }),
				{ maxKeys: 4 }
			)
		);

		it("reset({ statusCode }) on an instance holding any prior body ends with a null body", () => {
			fc.assert(
				fc.property(
					fc.constantFrom(...BODILESS_CODES),
					truthyBodyArbitrary,
					(statusCode, priorBody) => {
						const response = new Response(REQ);
						response.setBody(priorBody);
						expect(response.getBody()).toEqual(priorBody);

						response.reset({ statusCode });

						expect(response.getStatusCode()).toBe(statusCode);
						expect(response.getBody()).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("reset({ statusCode, body: x }) for any non-nullish truthy x ends with body x", () => {
			fc.assert(
				fc.property(
					fc.constantFrom(...BODILESS_CODES),
					truthyBodyArbitrary,
					truthyBodyArbitrary,
					(statusCode, priorBody, suppliedBody) => {
						const response = new Response(REQ);
						response.setBody(priorBody);

						response.reset({ statusCode, body: suppliedBody });

						expect(response.getStatusCode()).toBe(statusCode);
						expect(response.getBody()).toEqual(suppliedBody);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
