/**
 * Test: Response with custom generic response templates (unit tests)
 *
 * Feature: 1-4-2-generic-responses-for-unlisted-status-codes
 *
 * Purpose: Verify that templates an application passes to Response.init() in jsonResponses
 * are found by the class fallback of the generic response module (Requirement 3.4), that an
 * application's response<code> wins over the built-in template and over any fallback
 * (Requirement 3.5), and that reset() clears the body when the custom template resolved for
 * the status has a null body (Requirement 4.8). Also pins that a custom response500 no longer
 * serves unlisted 2xx and 4xx statuses or listed statuses that have their own template.
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Exactly one Response.init() call at module level (Response.init takes effect once per
 *   test file, so every case shares these templates): jsonResponses with response200,
 *   response201, response202 (body null), response204, response400 and response500, each
 *   with a custom body. Nothing in xmlResponses.
 * - DebugAndLog.log and DebugAndLog.warn are spied on and silenced in beforeEach
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Related Tests:
 * - test/response/response-generic-templates-unit-tests.jest.mjs (default templates)
 * - test/response/generic-response-class-fallback-tests.jest.mjs
 * - test/response/response-set-body-to-null-unit-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

const JSON_HEADERS = { "Content-Type": "application/json" };

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file. Custom templates only, nothing in xmlResponses.
Response.init({
	settings: {
		errorExpirationInSeconds: 180,
		routeExpirationInSeconds: 3600
	},
	jsonResponses: {
		response200: { statusCode: 200, headers: JSON_HEADERS, body: { custom: "app200" } },
		response201: { statusCode: 201, headers: JSON_HEADERS, body: { custom: "app201" } },
		response202: { statusCode: 202, headers: JSON_HEADERS, body: null },
		response204: { statusCode: 204, headers: JSON_HEADERS, body: { custom: "app204" } },
		response400: { statusCode: 400, headers: JSON_HEADERS, body: { custom: "app400" } },
		response500: { statusCode: 500, headers: JSON_HEADERS, body: { custom: "app500" } }
	}
});

describe("Response with custom generic templates", () => {
	let REQ;

	/**
	 * Build a response with the given status code through the constructor.
	 *
	 * @param {number|string} statusCode - Status code to set
	 * @returns {Response} New response
	 */
	function newResponse(statusCode) {
		return new Response(REQ, { statusCode });
	}

	beforeEach(() => {
		jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("setup", () => {
		it("applied the custom templates from the single Response.init() call", () => {
			const json = Response.getGenericResponses("JSON");

			expect(Response.info().isInitialized).toBe(true);
			expect(json.response200.body).toEqual({ custom: "app200" });
			expect(json.response202.body).toBeNull();
		});

		it("left the built-in templates that the application did not replace", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response404.body).toEqual({ message: "Not Found" });
			expect(json.response429.body).toEqual({ message: "Too Many Requests" });
		});

		it("did not customize the XML templates", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response201.body).toContain("<hello>Created</hello>");
		});
	});

	describe("precedence of an application's response<code> (Requirement 3.5)", () => {
		it("serves the custom response201 for status 201, not the built-in", () => {
			const response = newResponse(201);

			expect(response.getStatusCode()).toBe(201);
			expect(response.getBody()).toEqual({ custom: "app201" });
			expect(response.getBody()).not.toEqual(Response.getGenericResponses("JSON").response(404).body);
		});

		it("returns the custom response201 object by direct lookup", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response(201)).toBe(json.response201);
			expect(json.response(201).body).toEqual({ custom: "app201" });
		});

		it("accepts the status code as a string", () => {
			const response = newResponse("201");

			expect(response.getStatusCode()).toBe(201);
			expect(response.getBody()).toEqual({ custom: "app201" });
		});

		it("serves the custom response201 and response202 rather than the custom response200 fallback", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response(201)).not.toBe(json.response200);
			expect(newResponse(201).getBody()).toEqual({ custom: "app201" });
			expect(json.response(202)).toBe(json.response202);
			expect(json.response(202)).not.toBe(json.response200);
		});

		it("serves the custom response400 and response500 for their own statuses", () => {
			expect(newResponse(400).getBody()).toEqual({ custom: "app400" });
			expect(newResponse(500).getBody()).toEqual({ custom: "app500" });
		});

		it("serves the built-in template for a listed status the application did not replace", () => {
			const response = newResponse(404);

			expect(response.getStatusCode()).toBe(404);
			expect(response.getBody()).toEqual({ message: "Not Found" });
		});
	});

	describe("custom class templates serve unlisted statuses (Requirement 3.4)", () => {
		it("serves an unlisted 2xx (203) from the custom response200", () => {
			const response = newResponse(203);

			expect(response.getStatusCode()).toBe(203);
			expect(response.getBody()).toEqual({ custom: "app200" });
		});

		it("serves an unlisted 4xx (410) from the custom response400", () => {
			const response = newResponse(410);

			expect(response.getStatusCode()).toBe(410);
			expect(response.getBody()).toEqual({ custom: "app400" });
		});

		it("serves an unlisted 5xx (502) from the custom response500", () => {
			const response = newResponse(502);

			expect(response.getStatusCode()).toBe(502);
			expect(response.getBody()).toEqual({ custom: "app500" });
		});

		it("serves 301, 205 and 100 from the custom response204", () => {
			for (const statusCode of [301, 205, 100]) {
				const response = newResponse(statusCode);

				expect(response.getStatusCode()).toBe(statusCode);
				expect(response.getBody()).toEqual({ custom: "app204" });
			}
		});

		it("serves the custom response204 for a redirect built with reset() and a Location header", () => {
			const response = new Response(REQ);

			response.reset({ statusCode: 301, headers: { Location: "https://example.com/x" } });

			expect(response.getStatusCode()).toBe(301);
			expect(response.getBody()).toEqual({ custom: "app204" });
			expect(response.getHeaders().Location).toBe("https://example.com/x");
		});

		it("resolves the class templates through response() and returns the template objects", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response(203)).toBe(json.response200);
			expect(json.response(410)).toBe(json.response400);
			expect(json.response(502)).toBe(json.response500);
			expect(json.response(301)).toBe(json.response204);
		});
	});

	describe("custom response500 serves only 5xx and non-status values", () => {
		it("serves 502 and response(999) from the custom response500", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response(502).body).toEqual({ custom: "app500" });
			expect(json.response(999).body).toEqual({ custom: "app500" });
			expect(newResponse(999).getBody()).toEqual({ custom: "app500" });
		});

		it("serves a non-numeric status value from the custom response500", () => {
			const json = Response.getGenericResponses("JSON");

			expect(json.response("abc")).toBe(json.response500);
			expect(json.response(undefined)).toBe(json.response500);
		});

		it("does not serve 201 from the custom response500", () => {
			expect(newResponse(201).getBody()).not.toEqual({ custom: "app500" });
			expect(newResponse(201).getBody()).toEqual({ custom: "app201" });
		});

		it("does not serve 410 from the custom response500", () => {
			expect(newResponse(410).getBody()).not.toEqual({ custom: "app500" });
			expect(newResponse(410).getBody()).toEqual({ custom: "app400" });
		});

		it("does not serve 203 from the custom response500", () => {
			expect(newResponse(203).getBody()).not.toEqual({ custom: "app500" });
		});
	});

	describe("reset() with a custom null-body template (Requirement 4.8)", () => {
		it("clears an existing body on reset({ statusCode: 202 })", () => {
			const response = newResponse(200);
			response.setBody({ a: 1 });
			expect(response.getBody()).toEqual({ a: 1 });

			response.reset({ statusCode: 202 });

			expect(response.getStatusCode()).toBe(202);
			expect(response.getBody()).toBeNull();
		});

		it("finalizes the cleared 202 with a null body", () => {
			const response = newResponse(200);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 202 });
			const result = response.finalize();

			expect(result.statusCode).toBe(202);
			expect(result.body).toBeNull();
		});

		it("creates a 202 with a null body through the constructor", () => {
			const response = newResponse(202);

			expect(response.getStatusCode()).toBe(202);
			expect(response.getBody()).toBeNull();
		});

		it("keeps a body passed to reset() for a 202", () => {
			const response = newResponse(200);

			response.reset({ statusCode: 202, body: { a: 1 } });

			expect(response.getBody()).toEqual({ a: 1 });
		});

		it("replaces a null body with the custom response200 body on reset({ statusCode: 200 })", () => {
			const response = newResponse(202);
			expect(response.getBody()).toBeNull();

			response.reset({ statusCode: 200 });

			expect(response.getBody()).toEqual({ custom: "app200" });
		});
	});
});
