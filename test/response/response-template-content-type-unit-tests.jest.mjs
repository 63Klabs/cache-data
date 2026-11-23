/**
 * Test: Content-Type of a Response built from custom generic response templates (unit tests)
 *
 * Feature: 1-4-2-response-generic-template-content-type-header-is-ignored
 *
 * Purpose: Verify that a Response built by the constructor or reset() from a template carries
 * the Content-Type of the template (Requirement 2): the header supplied in the first argument
 * wins, then the template header, then the Response.CONTENT_TYPE constant of the format. Covers
 * all five formats, the code "TEXT" in a template header, a template header that contains a
 * line feed (ignored), separate headers objects per response, agreement of getContentType()
 * and getHeaders(), and the Content-Type after finalize() resets an Error body to a 500.
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Exactly one Response.init() call at module level (Response.init takes effect once per
 *   test file, so every case shares these templates). It is never called in beforeEach.
 *   Custom templates, each with a Content-Type that differs from the format constant where the
 *   constant is not the value under test:
 *   - jsonResponses: response200 (application/problem+json), response400 (headers: {})
 *   - htmlResponses: response200 (text/html)
 *   - xmlResponses: response200 (application/atom+xml)
 *   - rssResponses: response200 (application/x-rss-custom)
 *   - textResponses: response200 (text/plain; charset=utf-8), response404 (a value that
 *     contains a line feed), response418 (the code TEXT), response500 (no headers property)
 * - DebugAndLog.log and DebugAndLog.warn are spied on and silenced in beforeEach
 * - Fixed string values only. No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Related Tests:
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs
 * - test/response/response-content-type-header-unit-tests.jest.mjs (default templates)
 * - test/response/response-finalize-json-media-type-unit-tests.jest.mjs
 * - test/response/response-template-content-type-property-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

// The format constants as fixed strings
const CONSTANTS = {
	JSON: "application/json",
	HTML: "text/html; charset=utf-8",
	XML: "application/xml",
	RSS: "application/rss+xml",
	TEXT: "text/plain"
};

// The Content-Type of the custom response200 template of each format
const TEMPLATE_VALUES = {
	JSON: "application/problem+json",
	HTML: "text/html",
	XML: "application/atom+xml",
	RSS: "application/x-rss-custom",
	TEXT: "text/plain; charset=utf-8"
};

const FORMATS = ["JSON", "HTML", "XML", "RSS", "TEXT"];

// Template headers objects kept by reference so the tests can prove they are never written
const JSON_200_HEADERS = { "Content-Type": "application/problem+json" };
const JSON_400_HEADERS = {};
const HTML_200_HEADERS = { "Content-Type": "text/html" };
const XML_200_HEADERS = { "Content-Type": "application/atom+xml" };
const RSS_200_HEADERS = { "Content-Type": "application/x-rss-custom" };
const TEXT_200_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };
const TEXT_404_HEADERS = { "Content-Type": "text/plain\nX-Injected: 1" };
const TEXT_418_HEADERS = { "Content-Type": "TEXT" };

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file.
Response.init({
	settings: {
		errorExpirationInSeconds: 180,
		routeExpirationInSeconds: 0
	},
	jsonResponses: {
		response200: { statusCode: 200, headers: JSON_200_HEADERS, body: { marker: "json200" } },
		response400: { statusCode: 400, headers: JSON_400_HEADERS, body: { marker: "json400" } }
	},
	htmlResponses: {
		response200: { statusCode: 200, headers: HTML_200_HEADERS, body: "<html><body>html200</body></html>" }
	},
	xmlResponses: {
		response200: { statusCode: 200, headers: XML_200_HEADERS, body: "<feed>xml200</feed>" }
	},
	rssResponses: {
		response200: { statusCode: 200, headers: RSS_200_HEADERS, body: "<rss><channel>rss200</channel></rss>" }
	},
	textResponses: {
		response200: { statusCode: 200, headers: TEXT_200_HEADERS, body: "text200" },
		response404: { statusCode: 404, headers: TEXT_404_HEADERS, body: "text404" },
		response418: { statusCode: 418, headers: TEXT_418_HEADERS, body: "text418" },
		response500: { statusCode: 500, body: "text500" }
	}
});

/**
 * Assert that no header name or string header value contains a character from U+0000 to U+001F.
 *
 * @param {Object} headers - Headers object returned by Response.getHeaders()
 */
function expectNoControlCharacters(headers) {
	for (const [name, value] of Object.entries(headers)) {
		for (const text of [name, value]) {
			if (typeof text === "string") {
				for (let i = 0; i < text.length; i++) {
					expect(text.charCodeAt(i)).toBeGreaterThan(0x1F);
				}
			}
		}
	}
}

describe("Response Content-Type from custom generic templates", () => {
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

	describe("setup", () => {
		it("applied the custom templates from the single Response.init() call", () => {
			expect(Response.info().isInitialized).toBe(true);
			expect(Response.getGenericResponses("JSON").response200.headers["Content-Type"]).toBe("application/problem+json");
			expect(Response.getGenericResponses("HTML").response200.headers["Content-Type"]).toBe("text/html");
			expect(Response.getGenericResponses("XML").response200.headers["Content-Type"]).toBe("application/atom+xml");
			expect(Response.getGenericResponses("RSS").response200.headers["Content-Type"]).toBe("application/x-rss-custom");
			expect(Response.getGenericResponses("TEXT").response200.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
		});

		it("leaves the Response.CONTENT_TYPE constants as fixed strings", () => {
			for (const format of FORMATS) {
				expect(Response.CONTENT_TYPE[format]).toBe(CONSTANTS[format]);
			}
		});
	});

	describe("template header (Requirement 2, criteria 2 and 4)", () => {
		it.each(FORMATS)("constructor carries the %s template Content-Type", (format) => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE[format]);

			expect(response.getHeaders()["Content-Type"]).toBe(TEMPLATE_VALUES[format]);
			expectNoControlCharacters(response.getHeaders());
		});

		it.each(FORMATS)("reset() carries the %s template Content-Type", (format) => {
			const response = new Response(REQ, { statusCode: 404 });

			response.reset({ statusCode: 200 }, Response.CONTENT_TYPE[format]);

			expect(response.getHeaders()["Content-Type"]).toBe(TEMPLATE_VALUES[format]);
			expect(response.getStatusCode()).toBe(200);
			expectNoControlCharacters(response.getHeaders());
		});

		it("constructor without a contentType argument carries the JSON template Content-Type", () => {
			const response = new Response(REQ, { statusCode: 200 });

			expect(response.getHeaders()["Content-Type"]).toBe("application/problem+json");
		});

		it("reset() without a contentType argument carries the JSON template Content-Type", () => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.TEXT);

			response.reset({ statusCode: 200 });

			expect(response.getHeaders()["Content-Type"]).toBe("application/problem+json");
		});

		it("keeps the template body and status code", () => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.XML);

			expect(response.getStatusCode()).toBe(200);
			expect(response.getBody()).toBe("<feed>xml200</feed>");
		});
	});

	describe("first-argument headers without a Content-Type (Requirement 2, criteria 2 and 10)", () => {
		it("takes the template value and keeps the other supplied header (explicit format)", () => {
			const response = new Response(REQ, { statusCode: 200, headers: { "X-A": "1" } }, Response.CONTENT_TYPE.HTML);

			expect(response.getHeaders()).toEqual({ "X-A": "1", "Content-Type": "text/html" });
		});

		it("takes the template value and keeps the other supplied header (RSS)", () => {
			const response = new Response(REQ, { statusCode: 200, headers: { "X-A": "1" } }, Response.CONTENT_TYPE.RSS);

			expect(response.getHeaders()).toEqual({ "X-A": "1", "Content-Type": "application/x-rss-custom" });
		});

		it("takes the template value and keeps the other supplied header (no format argument)", () => {
			const response = new Response(REQ, { statusCode: 200, headers: { "X-A": "1" } });

			expect(response.getHeaders()).toEqual({ "X-A": "1", "Content-Type": "application/problem+json" });
		});

		it("takes the template value and keeps the other supplied header through reset()", () => {
			const response = new Response(REQ, { statusCode: 404 });

			response.reset({ statusCode: 200, headers: { "X-A": "1" } }, Response.CONTENT_TYPE.XML);

			expect(response.getHeaders()).toEqual({ "X-A": "1", "Content-Type": "application/atom+xml" });
		});

		it("does not merge the other headers of the template into the supplied headers", () => {
			const response = new Response(REQ, { statusCode: 200, headers: { "X-A": "1" } }, Response.CONTENT_TYPE.TEXT);

			expect(Object.keys(response.getHeaders()).sort()).toEqual(["Content-Type", "X-A"]);
		});

		it("leaves the supplied headers object unmodified", () => {
			const supplied = { "X-A": "1" };

			const response = new Response(REQ, { statusCode: 200, headers: supplied }, Response.CONTENT_TYPE.HTML);

			expect(supplied).toEqual({ "X-A": "1" });
			expect(response.getHeaders()).not.toBe(supplied);
		});
	});

	describe("format constant when the template has no Content-Type (Requirement 2, criterion 3)", () => {
		it("JSON response400 with headers {} carries the JSON constant (constructor)", () => {
			const response = new Response(REQ, { statusCode: 400 }, Response.CONTENT_TYPE.JSON);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.JSON);
			expect(response.getBody()).toEqual({ marker: "json400" });
		});

		it("JSON response400 with headers {} carries the JSON constant (no format argument)", () => {
			const response = new Response(REQ, { statusCode: 400 });

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.JSON);
		});

		it("JSON response400 with headers {} carries the JSON constant (reset)", () => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.HTML);

			response.reset({ statusCode: 400 }, Response.CONTENT_TYPE.JSON);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.JSON);
		});

		it("TEXT response500 with no headers property carries the TEXT constant (constructor)", () => {
			const response = new Response(REQ, { statusCode: 500 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
			expect(response.getBody()).toBe("text500");
			expectNoControlCharacters(response.getHeaders());
		});

		it("TEXT response500 with no headers property carries the TEXT constant (reset)", () => {
			const response = new Response(REQ, { statusCode: 200 });

			response.reset({ statusCode: 500 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
		});

		it("does not write a Content-Type into the template that had none", () => {
			new Response(REQ, { statusCode: 500 }, Response.CONTENT_TYPE.TEXT);
			new Response(REQ, { statusCode: 400 }, Response.CONTENT_TYPE.JSON);

			expect(Response.getGenericResponses("TEXT").response500.headers).toBeUndefined();
			expect(JSON_400_HEADERS).toEqual({});
		});
	});

	describe("a supplied Content-Type beats the template (Requirement 2, criteria 1 and 4)", () => {
		it("application/vnd.api+json with a JSON format argument", () => {
			const response = new Response(
				REQ,
				{ statusCode: 200, headers: { "Content-Type": "application/vnd.api+json" } },
				Response.CONTENT_TYPE.JSON
			);

			expect(response.getHeaders()["Content-Type"]).toBe("application/vnd.api+json");
		});

		it("application/vnd.api+json without a format argument", () => {
			const response = new Response(
				REQ,
				{ statusCode: 200, headers: { "Content-Type": "application/vnd.api+json" } }
			);

			expect(response.getHeaders()["Content-Type"]).toBe("application/vnd.api+json");
		});

		it("application/vnd.api+json through reset() with a JSON format argument", () => {
			const response = new Response(REQ, { statusCode: 404 });

			response.reset(
				{ statusCode: 200, headers: { "Content-Type": "application/vnd.api+json" } },
				Response.CONTENT_TYPE.JSON
			);

			expect(response.getHeaders()["Content-Type"]).toBe("application/vnd.api+json");
		});

		it("application/vnd.api+json through reset() without a format argument", () => {
			const response = new Response(REQ, { statusCode: 404 });

			response.reset({ statusCode: 200, headers: { "Content-Type": "application/vnd.api+json" } });

			expect(response.getHeaders()["Content-Type"]).toBe("application/vnd.api+json");
		});

		it("text/html; charset=utf-8 over the HTML template text/html", () => {
			const response = new Response(
				REQ,
				{ statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
				Response.CONTENT_TYPE.HTML
			);

			expect(response.getHeaders()["Content-Type"]).toBe("text/html; charset=utf-8");
		});
	});

	describe("a template header that is a format code (Requirement 2, criterion 5)", () => {
		it("TEXT response418 builds a response with text/plain (constructor)", () => {
			const response = new Response(REQ, { statusCode: 418 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
			expect(response.getBody()).toBe("text418");
		});

		it("TEXT response418 builds a response with text/plain (reset)", () => {
			const response = new Response(REQ, { statusCode: 200 });

			response.reset({ statusCode: 418 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
		});

		it("does not write the resolved value into the template", () => {
			new Response(REQ, { statusCode: 418 }, Response.CONTENT_TYPE.TEXT);

			expect(TEXT_418_HEADERS).toEqual({ "Content-Type": "TEXT" });
		});
	});

	describe("a template header with a line feed is ignored (Requirement 2, criterion 7; Requirement 6, criterion 23)", () => {
		it("constructor carries the TEXT constant and no line feed", () => {
			const response = new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.TEXT);
			const value = response.getHeaders()["Content-Type"];

			expect(value).toBe(CONSTANTS.TEXT);
			expect(value.includes("\n")).toBe(false);
			expectNoControlCharacters(response.getHeaders());
		});

		it("reset() carries the TEXT constant and no line feed", () => {
			const response = new Response(REQ, { statusCode: 200 });

			response.reset({ statusCode: 404 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
			expectNoControlCharacters(response.getHeaders());
		});

		it("adds no injected header", () => {
			const response = new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.TEXT);

			expect(Object.keys(response.getHeaders())).toEqual(["Content-Type"]);
		});

		it("leaves the template headers object unmodified", () => {
			new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.TEXT);

			expect(TEXT_404_HEADERS).toEqual({ "Content-Type": "text/plain\nX-Injected: 1" });
		});
	});

	describe("isolation between responses and templates (Requirement 2, criteria 12 and 13)", () => {
		it("two responses from one template do not share headers", () => {
			const first = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.JSON);
			const second = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.JSON);

			first.addHeader("X-Custom", "1");

			expect(first.getHeaders()["X-Custom"]).toBe("1");
			expect(second.getHeaders()["X-Custom"]).toBeUndefined();
			expect(second.getHeaders()).not.toBe(first.getHeaders());
		});

		it("two responses from one template do not share headers through reset()", () => {
			const first = new Response(REQ, { statusCode: 404 });
			const second = new Response(REQ, { statusCode: 404 });

			first.reset({ statusCode: 200 }, Response.CONTENT_TYPE.RSS);
			second.reset({ statusCode: 200 }, Response.CONTENT_TYPE.RSS);
			first.addHeader("X-Custom", "1");

			expect(second.getHeaders()["X-Custom"]).toBeUndefined();
		});

		it("the template headers object is not the response headers object", () => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.JSON);

			expect(response.getHeaders()).not.toBe(JSON_200_HEADERS);
			expect(response.getHeaders()).not.toBe(Response.getGenericResponses("JSON").response200.headers);
		});

		it("the template headers object is unchanged after construction", () => {
			for (const format of FORMATS) {
				new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE[format]);
			}

			expect(JSON_200_HEADERS).toEqual({ "Content-Type": "application/problem+json" });
			expect(HTML_200_HEADERS).toEqual({ "Content-Type": "text/html" });
			expect(XML_200_HEADERS).toEqual({ "Content-Type": "application/atom+xml" });
			expect(RSS_200_HEADERS).toEqual({ "Content-Type": "application/x-rss-custom" });
			expect(TEXT_200_HEADERS).toEqual({ "Content-Type": "text/plain; charset=utf-8" });
		});

		it("the template headers object is unchanged after addHeader on a response", () => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.JSON);

			response.addHeader("Content-Type", "x/y");
			response.addHeader("X-Custom", "1");

			expect(JSON_200_HEADERS).toEqual({ "Content-Type": "application/problem+json" });
			expect(Response.getGenericResponses("JSON").response200.headers).toEqual({ "Content-Type": "application/problem+json" });
			expect(new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.JSON).getHeaders()).toEqual({ "Content-Type": "application/problem+json" });
		});
	});

	describe("accessors agree (Requirement 2, criterion 15)", () => {
		it.each(FORMATS)("getContentType() and getHeaders() agree for %s (constructor)", (format) => {
			const response = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE[format]);

			expect(response.getContentType()).toBe(TEMPLATE_VALUES[format]);
			expect(response.getHeaders()["Content-Type"]).toBe(TEMPLATE_VALUES[format]);
			expect(response.getContentType()).toBe(response.getHeaders()["Content-Type"]);
		});

		it.each(FORMATS)("getContentType() and getHeaders() agree for %s (reset)", (format) => {
			const response = new Response(REQ, { statusCode: 404 });

			response.reset({ statusCode: 200 }, Response.CONTENT_TYPE[format]);

			expect(response.getContentType()).toBe(TEMPLATE_VALUES[format]);
			expect(response.getContentType()).toBe(response.getHeaders()["Content-Type"]);
		});

		it("agree on the format constant when the template has no Content-Type", () => {
			const response = new Response(REQ, { statusCode: 500 }, Response.CONTENT_TYPE.TEXT);

			expect(response.getContentType()).toBe(CONSTANTS.TEXT);
			expect(response.getHeaders()["Content-Type"]).toBe(CONSTANTS.TEXT);
		});
	});

	describe("finalize() with an Error body (Requirement 2, criterion 16)", () => {
		it("returns status 500 with the Content-Type of the JSON response500 template", () => {
			const response = new Response(REQ, { statusCode: 200 });

			response.setBody(new Error("x"));
			const result = response.finalize();

			expect(result.statusCode).toBe(500);
			expect(result.headers["Content-Type"]).toBe(Response.getGenericResponses("JSON").response500.headers["Content-Type"]);
			expect(result.headers["Content-Type"]).toBe("application/json");
			expectNoControlCharacters(result.headers);
		});

		it("returns a JSON string body for the 500 template", () => {
			const response = new Response(REQ, { statusCode: 200 });

			response.setBody(new Error("x"));
			const result = response.finalize();

			expect(typeof result.body).toBe("string");
			expect(JSON.parse(result.body)).toEqual(Response.getGenericResponses("JSON").response500.body);
		});
	});
});
