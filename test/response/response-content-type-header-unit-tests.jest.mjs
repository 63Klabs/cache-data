/**
 * Test: Response constructor with a Content-Type header in the first argument (unit tests)
 *
 * Feature: 1-4-2-response-generic-template-content-type-header-is-ignored
 *
 * Purpose: Verify what the Response constructor does with a "Content-Type" property of the
 * headers object it receives, with the built-in (uncustomized) templates. A header value that is
 * not one of the five Response.CONTENT_TYPE values must not make the constructor throw
 * (Requirement 1.7). A value that names or matches a format selects that format's templates
 * (1.3, 1.8). A value that selects nothing falls back to the body type (1.4, 1.5). A blank or
 * non-string value is treated as absent (1.6). The value is sent exactly as given, and a format
 * code resolves to its constant (2.1, 2.5, 2.6). A value that contains a control character is
 * not used, the template header is used, and one warning is logged per container without the
 * value (2.7, 2.8, 2.9, SEC-REQ-2.7-SEM-113-1). An explicit contentType argument that is not one
 * of the five formats still throws (1.1, 1.2). Other headers are copied and the template's are
 * not merged in (2.10, 2.11). A call with no Content-Type is unchanged, and Response.CONTENT_TYPE
 * keeps the values of the generic response modules (5.4).
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Response.init() is called once per file, at module level, with settings only. No template
 *   option is passed, so every template is the built-in one
 * - The first describe of the file is the warning group. The once-per-container warning flag
 *   lives in the Response module, so the control-character warning can be asserted only by the
 *   first control-character value this file sends. That group therefore runs before any other
 *   group, and its spy on DebugAndLog.warn throws so the swallowed logger failure is covered too.
 *   The spies are installed inside the single test, because restoreMocks: true in jest.config.mjs
 *   would restore a spy created in beforeAll before the test runs
 * - Every later group silences DebugAndLog.log and DebugAndLog.warn in beforeEach
 * - Fixed strings only. No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - The warning group has no teardown of its own. restoreMocks: true in jest.config.mjs restores
 *   its spies after the test
 * - jest.restoreAllMocks() in afterEach of the later groups
 *
 * Related Tests:
 * - test/response/response-template-content-type-unit-tests.jest.mjs (custom templates)
 * - test/response/response-finalize-json-media-type-unit-tests.jest.mjs
 * - test/response/response-template-content-type-property-tests.jest.mjs
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";
import jsonModule from "../../src/lib/tools/generic.response.json.js";
import htmlModule from "../../src/lib/tools/generic.response.html.js";
import xmlModule from "../../src/lib/tools/generic.response.xml.js";
import rssModule from "../../src/lib/tools/generic.response.rss.js";
import textModule from "../../src/lib/tools/generic.response.text.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

// The control characters are the point of this test, so the lint rule against them is off here.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const FORMAT_CODES = ["JSON", "HTML", "XML", "RSS", "TEXT"];

const JSON_CONSTANT = "application/json";
const HTML_CONSTANT = "text/html; charset=utf-8";

// The five control-character values of Requirement 2.7, each with a printable label for test names.
const CONTROL_VALUES = [
	["line feed (LF)", "text/html\nX-Injected: 1"],
	["carriage return (CR)", "text/html\rX-Injected: 1"],
	["horizontal tab (HT)", "text/html\tcharset"],
	["U+0000", "text/html\u0000charset"],
	["U+007F", "text/html\u007Fcharset"]
];

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file. Settings only: every template is the built-in one.
Response.init({
	settings: {
		errorExpirationInSeconds: 180,
		routeExpirationInSeconds: 0
	}
});

/**
 * Build a response whose first argument carries a Content-Type header value.
 *
 * @param {ClientRequest} clientRequest - Request to attach
 * @param {*} value - Value of the "Content-Type" property of headers
 * @param {Object} [extra] - Other properties of the first argument (body, statusCode)
 * @returns {Response} New response
 */
function withContentType(clientRequest, value, extra = {}) {
	return new Response(clientRequest, { ...extra, headers: { "Content-Type": value } });
}

/**
 * The built-in template body for a format and status 200.
 *
 * @param {string} code - Format code (JSON, HTML, XML, RSS or TEXT)
 * @returns {*} Template body
 */
function templateBody(code) {
	return Response.getGenericResponses(code).response(200).body;
}

// This group must stay first in the file. See the Setup note in the header comment.
describe("Response Content-Type header: control-character warning (must run first)", () => {
	const warnedValue = "application/x-warning-check\nX-Injected: 1";

	// The spies are installed inside the test body. jest.config.mjs sets restoreMocks: true, which
	// restores any spy created in beforeAll before the test body runs. The restore after the test
	// is done by that same setting, so there is no afterAll.
	it("builds the response, logs one warning without the value, and logs nothing more for a second value", () => {
		jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		// The logger fails. The response must still be built (Requirement 2.9).
		const warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {
			throw new Error("logger failure");
		});
		const REQ = new ClientRequest(testEventA, testContextA);

		const first = withContentType(REQ, warnedValue);

		expect(first).toBeInstanceOf(Response);
		expect(warnSpy).toHaveBeenCalledTimes(1);
		for (const call of warnSpy.mock.calls) {
			for (const arg of call) {
				expect(String(arg).includes(warnedValue)).toBe(false);
				expect(String(arg).includes("X-Injected")).toBe(false);
			}
		}

		const second = withContentType(REQ, warnedValue);

		expect(second).toBeInstanceOf(Response);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});
});

describe("Response Content-Type header", () => {
	let REQ;

	beforeEach(() => {
		jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("a header that is not one of the five values does not throw (Requirements 1.7, 2.1, 2.6)", () => {
		it.each([
			"text/html",
			"application/atom+xml",
			"application/problem+json",
			"application/javascript",
			"text/html; charset=utf-8"
		])("accepts %s and sends it as the response Content-Type", (value) => {
			let response;

			expect(() => {
				response = withContentType(REQ, value);
			}).not.toThrow();
			expect(response.getHeaders()["Content-Type"]).toBe(value);
			expect(response.getContentType()).toBe(value);
		});

		it("accepts the same values through reset()", () => {
			const response = new Response(REQ, {});

			expect(() => response.reset({ headers: { "Content-Type": "application/atom+xml" } })).not.toThrow();
			expect(response.getHeaders()["Content-Type"]).toBe("application/atom+xml");
		});
	});

	describe("a header that matches a format by media type selects its templates (Requirements 1.3, 1.8)", () => {
		it.each([
			["text/html", "HTML"],
			["TEXT/HTML; charset=utf-8", "HTML"],
			["application/json; charset=utf-8", "JSON"],
			["application/xml", "XML"],
			["application/rss+xml", "RSS"],
			["text/plain", "TEXT"]
		])("%s selects the %s template and is sent as given", (value, code) => {
			const response = withContentType(REQ, value);

			expect(response.getBody()).toEqual(templateBody(code));
			expect(response.getHeaders()["Content-Type"]).toBe(value);
		});

		it("selects the same format for each of the five constants as before", () => {
			for (const code of FORMAT_CODES) {
				const response = withContentType(REQ, Response.CONTENT_TYPE[code]);

				expect(response.getBody()).toEqual(templateBody(code));
				expect(response.getHeaders()["Content-Type"]).toBe(Response.CONTENT_TYPE[code]);
			}
		});
	});

	describe("a header that selects no format falls back to the body type (Requirements 1.4, 1.5)", () => {
		it("selects the JSON template when there is no body", () => {
			const response = withContentType(REQ, "application/atom+xml");

			expect(response.getBody()).toEqual({ message: "Success" });
			expect(response.getHeaders()["Content-Type"]).toBe("application/atom+xml");
		});

		it("keeps a body that contains </html> and sends the header as given", () => {
			const response = withContentType(REQ, "application/atom+xml", { body: "<html></html>" });

			expect(response.getBody()).toBe("<html></html>");
			expect(response.getHeaders()["Content-Type"]).toBe("application/atom+xml");
		});

		it("uses the HTML template when the body type is HTML and the header is blank", () => {
			const response = withContentType(REQ, "", { body: "<html></html>" });

			expect(response.getHeaders()["Content-Type"]).toBe(HTML_CONSTANT);
		});

		it("falls back to the body type through reset() as well", () => {
			const response = new Response(REQ, {});

			response.reset({ headers: { "Content-Type": "application/atom+xml" } });

			expect(response.getBody()).toEqual({ message: "Success" });
		});
	});

	describe("a blank or non-string header is treated as absent (Requirement 1.6)", () => {
		it.each([
			["undefined", undefined],
			["an empty string", ""],
			["spaces only", "   "],
			["a number", 42],
			["null", null]
		])("%s does not throw and the template header is used", (_label, value) => {
			let response;

			expect(() => {
				response = withContentType(REQ, value);
			}).not.toThrow();
			expect(response.getBody()).toEqual({ message: "Success" });
			expect(response.getHeaders()["Content-Type"]).toBe(JSON_CONSTANT);
			expect(response.getContentType()).toBe(JSON_CONSTANT);
		});
	});

	describe("a format code resolves to its constant (Requirement 2.5)", () => {
		it.each(FORMAT_CODES)("a supplied Content-Type of %s gives the constant and that format's template", (code) => {
			const response = withContentType(REQ, code);

			expect(response.getHeaders()["Content-Type"]).toBe(Response.CONTENT_TYPE[code]);
			expect(response.getBody()).toEqual(templateBody(code));
		});

		it.each(FORMAT_CODES)("an explicit contentType argument of %s gives the constant", (code) => {
			const response = new Response(REQ, {}, code);

			expect(response.getHeaders()["Content-Type"]).toBe(Response.CONTENT_TYPE[code]);
			expect(response.getBody()).toEqual(templateBody(code));
		});

		it("a supplied JSON with an HTML argument gives the HTML template with application/json", () => {
			const response = new Response(REQ, { headers: { "Content-Type": "JSON" } }, Response.CONTENT_TYPE.HTML);

			expect(response.getBody()).toEqual(templateBody("HTML"));
			expect(response.getBody()).toContain("</html>");
			expect(response.getHeaders()["Content-Type"]).toBe(JSON_CONSTANT);
		});
	});

	describe("an explicit contentType argument that is not a format still throws (Requirements 1.1, 1.2)", () => {
		it.each([
			["JAVASCRIPT", Response.CONTENT_TYPE.JAVASCRIPT],
			["CSS", Response.CONTENT_TYPE.CSS],
			["CSV", Response.CONTENT_TYPE.CSV],
			["an unknown string", "NOT-A-FORMAT"]
		])("%s throws the existing message", (_label, argument) => {
			expect(() => new Response(REQ, {}, argument))
				.toThrow(`Content Type: ${argument} is not implemented for getResponses`);
		});

		it("throws for an unknown argument even when the header is a value that is accepted", () => {
			expect(() => new Response(REQ, { headers: { "Content-Type": "text/html" } }, Response.CONTENT_TYPE.CSS))
				.toThrow("is not implemented for getResponses");
		});

		it("throws through reset() for an unknown argument", () => {
			const response = new Response(REQ, {});

			expect(() => response.reset({}, "NOT-A-FORMAT")).toThrow("is not implemented for getResponses");
		});
	});

	describe("the exact value is kept (Requirement 2.6)", () => {
		it("adds no charset to text/html", () => {
			const response = withContentType(REQ, "text/html");

			expect(response.getHeaders()["Content-Type"]).toBe("text/html");
		});

		it("keeps the case of the value", () => {
			const response = withContentType(REQ, "Application/Atom+XML");

			expect(response.getHeaders()["Content-Type"]).toBe("Application/Atom+XML");
		});

		it("keeps the parameters of the value", () => {
			const response = withContentType(REQ, "application/problem+json; charset=utf-8");

			expect(response.getHeaders()["Content-Type"]).toBe("application/problem+json; charset=utf-8");
		});
	});

	describe("other headers (Requirements 2.10, 2.11)", () => {
		it("copies the supplied headers and does not merge in the template's", () => {
			const supplied = { "Content-Type": "application/atom+xml", "X-Custom": "1" };
			const response = new Response(REQ, { headers: supplied });

			expect(response.getHeaders()).toEqual({ "Content-Type": "application/atom+xml", "X-Custom": "1" });
			expect(response.getHeaders()).not.toBe(supplied);
			expect(supplied).toEqual({ "Content-Type": "application/atom+xml", "X-Custom": "1" });
		});

		it("keeps another supplied header when the supplied headers have no Content-Type", () => {
			const supplied = { "X-Custom": "1" };
			const response = new Response(REQ, { headers: supplied });

			expect(response.getHeaders()).toEqual({ "X-Custom": "1", "Content-Type": JSON_CONSTANT });
			expect(supplied).toEqual({ "X-Custom": "1" });
		});

		it("gives a copy of the template's headers when no headers are supplied", () => {
			const template = Response.getGenericResponses("JSON").response(200).headers;
			const response = new Response(REQ, {});

			expect(response.getHeaders()).toEqual({ "Content-Type": JSON_CONSTANT });
			expect(response.getHeaders()).not.toBe(template);

			response.addHeader("X-Custom", "1");

			expect(Response.getGenericResponses("JSON").response(200).headers).toEqual({ "Content-Type": JSON_CONSTANT });
		});
	});

	describe("a call with no Content-Type is unchanged (Requirement 5.4)", () => {
		it("gives the JSON template and its headers by default", () => {
			const response = new Response(REQ);

			expect(response.getStatusCode()).toBe(200);
			expect(response.getHeaders()).toEqual({ "Content-Type": JSON_CONSTANT });
			expect(response.getBody()).toEqual({ message: "Success" });
		});

		it("gives the template of the status code when only a status code is given", () => {
			const response = new Response(REQ, { statusCode: 404 });

			expect(response.getStatusCode()).toBe(404);
			expect(response.getHeaders()).toEqual({ "Content-Type": JSON_CONSTANT });
			expect(response.getBody()).toEqual({ message: "Not Found" });
		});

		it("takes the format from the body when there is no header", () => {
			const response = new Response(REQ, { body: "<html></html>" });

			expect(response.getHeaders()).toEqual({ "Content-Type": HTML_CONSTANT });
		});

		it("keeps the values of the generic response modules in Response.CONTENT_TYPE", () => {
			expect(Response.CONTENT_TYPE.JSON).toBe(jsonModule.contentType);
			expect(Response.CONTENT_TYPE.HTML).toBe(htmlModule.contentType);
			expect(Response.CONTENT_TYPE.XML).toBe(xmlModule.contentType);
			expect(Response.CONTENT_TYPE.RSS).toBe(rssModule.contentType);
			expect(Response.CONTENT_TYPE.TEXT).toBe(textModule.contentType);
			expect(Response.CONTENT_TYPE.JAVASCRIPT).toBe("application/javascript");
			expect(Response.CONTENT_TYPE.CSS).toBe("text/css");
			expect(Response.CONTENT_TYPE.CSV).toBe("text/csv");
		});
	});

	describe("a value that contains a control character is not used (Requirement 2.7, SEC-REQ-2.7-SEM-113-1)", () => {
		it.each(CONTROL_VALUES)("%s: does not throw, and the template header is used", (_label, value) => {
			let response;

			expect(() => {
				response = withContentType(REQ, value);
			}).not.toThrow();
			expect(response.getHeaders()["Content-Type"]).toBe(JSON_CONSTANT);
			expect(CONTROL_CHARACTER.test(response.getHeaders()["Content-Type"])).toBe(false);
		});

		it.each(CONTROL_VALUES)("%s: the format comes from the body", (_label, value) => {
			const response = withContentType(REQ, value, { body: "<html></html>" });

			expect(response.getHeaders()["Content-Type"]).toBe(HTML_CONSTANT);
			expect(CONTROL_CHARACTER.test(response.getHeaders()["Content-Type"])).toBe(false);
		});

		it.each(CONTROL_VALUES)("%s: an explicit contentType argument still decides the template", (_label, value) => {
			const response = new Response(REQ, { headers: { "Content-Type": value } }, Response.CONTENT_TYPE.XML);

			expect(response.getBody()).toEqual(templateBody("XML"));
			expect(response.getHeaders()["Content-Type"]).toBe(Response.CONTENT_TYPE.XML);
		});

		it("is not used through reset() either", () => {
			const response = new Response(REQ, {});

			response.reset({ headers: { "Content-Type": CONTROL_VALUES[0][1] } });

			expect(response.getHeaders()["Content-Type"]).toBe(JSON_CONSTANT);
		});
	});
});
