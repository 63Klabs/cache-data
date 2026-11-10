/**
 * Test: Response.setBodyToNull() (unit and characterization tests)
 *
 * Feature: 1-4-1-response-setbody-null-is-ignored-so-a-response
 *
 * Purpose: Verify that Response.setBodyToNull() sets the body to null and changes nothing
 * else, so finalize() returns body: null with the same status code and the Content-Type
 * header kept. Also pin the existing behavior around it: setBody() ignores falsy values
 * (compatibility decision Q1), and reset() and the constructor take the template body
 * when body is null (compatibility decision Q2). The characterization blocks pin
 * compatibility decisions Q1 and Q2; changing what they assert is a deliberate, versioned
 * change to the public behavior of Response, not a test fix.
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Response.init() in beforeEach with errorExpirationInSeconds 180 and
 *   routeExpirationInSeconds 3600 (Response.init takes effect once per test file, so
 *   every case shares these settings)
 * - DebugAndLog.log is spied on, so nothing is written and the RESPONSE message can be read
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Blocks:
 * - "setBodyToNull()": the method itself
 * - "interactions after setBodyToNull()": existing methods called after it
 * - "cache headers on a bodiless response": application-set and config-derived headers
 * - "RESPONSE log line": the logged byte count
 * - "characterization (pins compatibility decisions Q1 and Q2)": unchanged falsy-value behavior
 *
 * Status 200 is used for the reset() and constructor characterization so that these tests
 * do not depend on the templates for unlisted statuses.
 *
 * Related Tests:
 * - test/response/response-set-body-to-null-property-tests.jest.mjs
 * - test/response/set-message-unit-tests.jest.mjs
 * - test/response/response-log-field-sanitization-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

ClientRequest.init({ validations: testValidationsA });

describe("Response.setBodyToNull() unit tests", () => {
	let REQ;
	let logSpy;

	/**
	 * Build a response with the given status code.
	 *
	 * @param {number} statusCode - Status code to set
	 * @returns {Response} New response with the status code set
	 */
	function newResponse(statusCode) {
		const response = new Response(REQ);
		response.setStatusCode(statusCode);
		return response;
	}

	/**
	 * Return the template body for the status code, from the generic JSON responses.
	 *
	 * @param {number} statusCode - Status code of the template
	 * @returns {Object} Template body
	 */
	function templateBody(statusCode) {
		return Response.getGenericResponses("JSON").response(statusCode).body;
	}

	/**
	 * Return the RESPONSE message that Response passed to DebugAndLog.log.
	 *
	 * @returns {string} The RESPONSE log message
	 */
	function loggedResponseLine() {
		const responseCalls = logSpy.mock.calls.filter((call) => call[1] === "RESPONSE");
		expect(responseCalls).toHaveLength(1);
		return responseCalls[0][0];
	}

	beforeEach(() => {
		logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
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

	describe("setBodyToNull()", () => {
		it("keeps the status code 202 and finalize() returns body null", () => {
			const response = newResponse(202);

			response.setBodyToNull();
			const result = response.finalize();

			expect(response.getStatusCode()).toBe(202);
			expect(result.statusCode).toBe(202);
			expect(result.body).toBeNull();
		});

		it("makes getBody() and toObject().body return null", () => {
			const response = newResponse(202);

			response.setBodyToNull();

			expect(response.getBody()).toBeNull();
			expect(response.toObject().body).toBeNull();
		});

		it("keeps the Content-Type header through finalize()", () => {
			const response = newResponse(202);

			response.setBodyToNull();
			const result = response.finalize();

			expect(result.headers["Content-Type"]).toBe("application/json");
		});

		it("leaves the status code and headers as they were before the call", () => {
			const response = newResponse(202);
			response.addHeader("X-Custom-Header", "custom");
			const before = response.toObject();
			const headersBefore = { ...before.headers };

			response.setBodyToNull();
			const after = response.toObject();

			expect(after.body).toBeNull();
			expect(after.statusCode).toBe(before.statusCode);
			expect(after.headers).toEqual(headersBefore);
		});

		it("returns undefined", () => {
			const response = newResponse(202);

			expect(response.setBodyToNull()).toBeUndefined();
		});

		it("gives a null body when called twice", () => {
			const response = newResponse(202);

			response.setBodyToNull();
			response.setBodyToNull();

			expect(response.getBody()).toBeNull();
			expect(response.finalize().body).toBeNull();
		});

		it("gives a null body when called on a fresh response", () => {
			const response = new Response(REQ);
			expect(response.getBody()).not.toBeNull();

			response.setBodyToNull();

			expect(response.getBody()).toBeNull();
			expect(response.getStatusCode()).toBe(200);
		});
	});

	describe("interactions after setBodyToNull()", () => {
		it("reset({ statusCode: 200 }) restores the 200 template body", () => {
			const response = newResponse(200);
			response.setBodyToNull();

			response.reset({ statusCode: 200 });

			expect(response.getBody()).toEqual(templateBody(200));
		});

		it("setMessage() builds a new JSON body from the null body", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.setMessage("hello");

			expect(response.getBody()).toEqual({ message: "hello" });
		});

		it("addToJsonBody() builds a new JSON body from the null body", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.addToJsonBody({ k: 1 });

			expect(response.getBody()).toEqual({ k: 1 });
		});

		it("setBody() with a truthy value assigns that value", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.setBody({ a: 1 });

			expect(response.getBody()).toEqual({ a: 1 });
		});

		it("setStatusCode(204) leaves the body null", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.setStatusCode(204);

			expect(response.getStatusCode()).toBe(204);
			expect(response.getBody()).toBeNull();
		});

		it("setHeaders() leaves the body null", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.setHeaders({ "X-A": "1" });

			expect(response.getBody()).toBeNull();
		});
	});

	describe("cache headers on a bodiless response", () => {
		it("keeps an application-set Cache-Control and Expires through finalize()", () => {
			const response = newResponse(202);
			response.setBodyToNull();
			response.addHeader("Cache-Control", "no-store");
			response.addHeader("Expires", "0");

			const result = response.finalize();

			expect(result.body).toBeNull();
			expect(result.headers["Cache-Control"]).toBe("no-store");
			expect(result.headers["Expires"]).toBe("0");
		});

		it("adds Cache-Control max-age from routeExpirationInSeconds when none is set", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			const result = response.finalize();

			expect(result.body).toBeNull();
			expect(result.headers["Cache-Control"]).toBe("max-age=3600");
			expect(result.headers["Expires"]).toBeDefined();
		});
	});

	describe("RESPONSE log line", () => {
		it("reports status 202 and a body size of 0 bytes", () => {
			const response = newResponse(202);
			response.setBodyToNull();

			response.finalize();
			const fields = loggedResponseLine().split(" | ");

			expect(fields[0]).toBe("202");
			expect(fields[1]).toBe("0");
		});
	});

	describe("characterization of setBody() with falsy values (pins compatibility decision Q1)", () => {
		it.each([
			["null", null],
			["undefined", undefined],
			["an empty string", ""],
			["0", 0],
			["false", false]
		])("setBody(%s) leaves the previous body unchanged", (label, value) => {
			const response = newResponse(200);
			response.setBody({ a: 1 });

			response.setBody(value);

			expect(response.getBody()).toEqual({ a: 1 });
		});

		it.each([
			["null", null],
			["undefined", undefined],
			["an empty string", ""],
			["0", 0],
			["false", false]
		])("setBody(%s) on a fresh response keeps the template body", (label, value) => {
			const response = new Response(REQ);

			response.setBody(value);

			expect(response.getBody()).toEqual(templateBody(200));
		});
	});

	describe("characterization of reset() and the constructor with body null (pins compatibility decision Q2)", () => {
		it("reset({ statusCode: 200, body: null }) yields the 200 template body", () => {
			const response = newResponse(200);
			response.setBody({ a: 1 });

			response.reset({ statusCode: 200, body: null });

			expect(response.getBody()).toEqual(templateBody(200));
		});

		it("new Response(clientRequest, { statusCode: 200, body: null }) yields the 200 template body", () => {
			const response = new Response(REQ, { statusCode: 200, body: null });

			expect(response.getBody()).toEqual(templateBody(200));
		});
	});
});
