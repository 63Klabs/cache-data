/**
 * Test: Response.init() with only xmlResponses (unit tests)
 *
 * Feature: 1-4-2-response-init-xmlresponses-overwrites-html-templates
 *
 * Purpose: Verify that an xmlResponses option passed to Response.init() is merged into the
 * XML template slot and into no other slot (Requirements 1.2, 1.4, 1.5 and 2.1), that the
 * HTML, JSON, RSS and text slots stay the built-in modules, that the built-in
 * xmlGenericResponse module is not modified, and that merging an xmlResponses object with an
 * own __proto__ key neither pollutes Object.prototype nor changes the prototype of the XML
 * slot, nor writes template content to any log (Requirements 4.2 and the security constraints
 * under 1.1 and 4.2).
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - DebugAndLog.debug, .log, .warn and .error are spied on and silenced at module level,
 *   before Response.init(), so a log written by the merge would be captured
 * - Response.init() is called exactly once per file, at module level, with only xmlResponses
 *   (Response.init takes effect once per test file, so every case shares these templates).
 *   Response.init() is never called in beforeEach.
 * - xmlResponses is built with JSON.parse so that __proto__ is a real own data key
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterAll. The module-level spies must stay in place until the
 *   logging assertions have run, so they are not restored in afterEach.
 *
 * Related Tests:
 * - test/response/response-init-all-slots-unit-tests.jest.mjs (all five options together)
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs
 * - test/response/response-generic-templates-unit-tests.jest.mjs (default templates)
 */

import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";
import {
	Response,
	ClientRequest,
	DebugAndLog,
	jsonGenericResponse,
	htmlGenericResponse,
	rssGenericResponse,
	xmlGenericResponse,
	textGenericResponse
} from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

ClientRequest.init({ validations: testValidationsA });

// Module-level spies, created before Response.init() so a log written by the merge is captured.
const debugSpy = jest.spyOn(DebugAndLog, "debug").mockImplementation(() => Promise.resolve());
const logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
const warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => Promise.resolve());

// >! JSON.parse creates a real own "__proto__" data key. An object literal would set the
// >! prototype instead and prove nothing about prototype integrity.
const xmlResponses = JSON.parse(
	'{"__proto__":{"polluted":true},"response200":{"statusCode":200,"headers":{"Content-Type":"application/xml"},"body":"<only>xml200</only>"},"response404":{"statusCode":404,"headers":{"Content-Type":"application/xml"},"body":"<only>xml404</only>"}}'
);

// The single Response.init() call of this file. Only xmlResponses, nothing else.
Response.init({ xmlResponses });

describe("Response.init() with only xmlResponses", () => {
	let REQ;

	beforeEach(() => {
		REQ = new ClientRequest(testEventA, testContextA);
	});

	describe("setup", () => {
		it("built the option with an own __proto__ key", () => {
			expect(Object.prototype.hasOwnProperty.call(xmlResponses, "__proto__")).toBe(true);
		});

		it("applied the single Response.init() call", () => {
			expect(Response.info().isInitialized).toBe(true);
		});
	});

	describe("XML slot (Requirements 1.2, 1.4)", () => {
		it("returns the custom body for response(200)", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response(200).body).toBe("<only>xml200</only>");
		});

		it("returns the custom body for response(404)", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response(404).body).toBe("<only>xml404</only>");
		});

		it("returns the same slot for the format name and for Response.CONTENT_TYPE.XML", () => {
			expect(Response.getGenericResponses(Response.CONTENT_TYPE.XML)).toBe(Response.getGenericResponses("XML"));
		});

		it("keeps the built-in body for a status the application did not supply", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response(201).body).toContain("<hello>Created</hello>");
		});

		it("carries the custom 404 body on a Response built for XML", () => {
			const response = new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.XML);

			expect(response.getStatusCode()).toBe(404);
			expect(response.getBody()).toContain("<only>xml404</only>");
		});

		it("carries the built-in 201 body on a Response built for XML", () => {
			const response = new Response(REQ, { statusCode: 201 }, Response.CONTENT_TYPE.XML);

			expect(response.getBody()).toContain("<hello>Created</hello>");
		});
	});

	describe("other slots stay built-in (Requirements 2.1, 1.1)", () => {
		it("leaves the HTML slot as htmlGenericResponse", () => {
			expect(Response.getGenericResponses("HTML")).toBe(htmlGenericResponse);
		});

		it("leaves the JSON slot as jsonGenericResponse", () => {
			expect(Response.getGenericResponses("JSON")).toBe(jsonGenericResponse);
		});

		it("leaves the RSS slot as rssGenericResponse", () => {
			expect(Response.getGenericResponses("RSS")).toBe(rssGenericResponse);
		});

		it("leaves the text slot as textGenericResponse", () => {
			expect(Response.getGenericResponses("TEXT")).toBe(textGenericResponse);
		});

		it("does not give the HTML slot the XML content type for 200, 404 and 500", () => {
			const html = Response.getGenericResponses("HTML");

			for (const statusCode of [200, 404, 500]) {
				expect(html.response(statusCode).headers["Content-Type"]).not.toBe(Response.CONTENT_TYPE.XML);
			}
		});
	});

	describe("built-in XML module is not modified (Requirement 1.5)", () => {
		it("keeps the built-in response200 body", () => {
			expect(xmlGenericResponse.response200.body).toContain("<hello>Success</hello>");
			expect(xmlGenericResponse.response200.body).not.toBe("<only>xml200</only>");
		});

		it("does not return the built-in module object for the XML slot", () => {
			expect(Response.getGenericResponses("XML")).not.toBe(xmlGenericResponse);
		});
	});

	describe("prototype integrity (SEC-REQ-4.2-SEM-1321-1)", () => {
		it("leaves Object.prototype and plain objects without a polluted property", () => {
			expect(Object.prototype.polluted).toBeUndefined();
			expect({}.polluted).toBeUndefined();
		});

		it("keeps Object.prototype as the prototype of the XML slot", () => {
			const xml = Response.getGenericResponses("XML");

			expect(Object.getPrototypeOf(xml)).toBe(Object.prototype);
			expect(xml.polluted).toBeUndefined();
		});
	});

	describe("no template content in logs (SEC-REQ-1.1-SEM-532-1)", () => {
		it("never passes xml200, xml404 or polluted to DebugAndLog.debug, log, warn or error", () => {
			const forbidden = ["xml200", "xml404", "polluted"];

			for (const spy of [debugSpy, logSpy, warnSpy, errorSpy]) {
				for (const args of spy.mock.calls) {
					for (const arg of args) {
						const text = typeof arg === "string" ? arg : JSON.stringify(arg) ?? String(arg);
						for (const word of forbidden) {
							expect(text).not.toContain(word);
						}
					}
				}
			}
		});
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});
});
