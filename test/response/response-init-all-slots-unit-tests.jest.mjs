/**
 * Test: Response.init() writes each format option to its own template slot (unit tests)
 *
 * Feature: 1-4-2-response-init-xmlresponses-overwrites-html-templates
 *
 * Purpose: Verify that when Response.init() receives jsonResponses, htmlResponses,
 * xmlResponses, rssResponses and textResponses together, each option is merged into its own
 * template slot and no slot returns a template of another format. Pins that xmlResponses
 * applies to the XML slot (Requirement 1.2 to 1.5), that it does not replace the HTML slot or
 * discard htmlResponses passed in the same call (Requirement 2.2, 2.3), and that the HTML
 * slot never returns the XML content type for any status code from 100 to 599
 * (Requirement 2.1, 4.3).
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Response.init() is called once per file, at module level, with all five format options
 *   (Response.init takes effect once per test file, so every case shares these templates).
 *   Each option carries a distinct response200 marker body. xmlResponses uses the custom
 *   Content-Type application/x-xml-custom. htmlResponses also carries a custom response404.
 * - DebugAndLog.log and DebugAndLog.warn are spied on and silenced in beforeEach
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Related Tests:
 * - test/response/response-init-xml-only-unit-tests.jest.mjs (xmlResponses alone)
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs (jsonResponses only)
 * - test/response/response-tests.jest.mjs
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 4.1, 4.3, 4.4, 4.5
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { Response, ClientRequest, xmlGenericResponse } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

const XML_CUSTOM_CONTENT_TYPE = "application/x-xml-custom";

const JSON_MARKER = "json200";
const HTML_MARKER = "html200";
const XML_MARKER = "xml200";
const RSS_MARKER = "rss200";
const TEXT_MARKER = "text200";

const XML_CUSTOM_BODY = `<?xml version="1.0" encoding="UTF-8" ?><marker>${XML_MARKER}</marker>`;
const HTML_CUSTOM_BODY_200 = `<html><body>${HTML_MARKER}</body></html>`;
const HTML_CUSTOM_BODY_404 = "<html><body>html404</body></html>";

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file. All five format options, no settings.
Response.init({
	jsonResponses: {
		response200: { statusCode: 200, headers: { "Content-Type": "application/json" }, body: { marker: JSON_MARKER } }
	},
	htmlResponses: {
		response200: { statusCode: 200, headers: { "Content-Type": "text/html" }, body: HTML_CUSTOM_BODY_200 },
		response404: { statusCode: 404, headers: { "Content-Type": "text/html" }, body: HTML_CUSTOM_BODY_404 }
	},
	xmlResponses: {
		response200: { statusCode: 200, headers: { "Content-Type": XML_CUSTOM_CONTENT_TYPE }, body: XML_CUSTOM_BODY }
	},
	rssResponses: {
		response200: { statusCode: 200, headers: { "Content-Type": "application/rss+xml" }, body: `<rss><marker>${RSS_MARKER}</marker></rss>` }
	},
	textResponses: {
		response200: { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: TEXT_MARKER }
	}
});

/**
 * Format name and the marker its response200 body carries.
 */
const FORMAT_MARKERS = {
	JSON: JSON_MARKER,
	HTML: HTML_MARKER,
	XML: XML_MARKER,
	RSS: RSS_MARKER,
	TEXT: TEXT_MARKER
};

/**
 * Serialize a template body so a marker can be searched for in any body type.
 *
 * @param {*} body - Template body (string or object)
 * @returns {string} String form of the body
 */
function bodyText(body) {
	return typeof body === "string" ? body : JSON.stringify(body);
}

describe("Response.init() with all five format options", () => {
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

	describe("each slot holds its own templates (Requirement 1.2, 2.3)", () => {
		it("returns its own marker from response(200) for each of the five formats", () => {
			for (const [format, marker] of Object.entries(FORMAT_MARKERS)) {
				const body = Response.getGenericResponses(format).response(200).body;

				expect(bodyText(body)).toContain(marker);
			}
		});

		it("returns none of the other four markers from response(200) for each format", () => {
			for (const [format, ownMarker] of Object.entries(FORMAT_MARKERS)) {
				const text = bodyText(Response.getGenericResponses(format).response(200).body);

				for (const [otherFormat, otherMarker] of Object.entries(FORMAT_MARKERS)) {
					if (otherFormat !== format) {
						expect(text).not.toContain(otherMarker);
					}
				}
				expect(text).toContain(ownMarker);
			}
		});

		it("returns the same object for \"XML\" and Response.CONTENT_TYPE.XML", () => {
			expect(Response.getGenericResponses("XML")).toBe(Response.getGenericResponses(Response.CONTENT_TYPE.XML));
		});
	});

	describe("xmlResponses applies to the XML slot (Requirement 1.2 to 1.5)", () => {
		it("serves the custom XML response200 through the XML slot", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response(200).body).toBe(XML_CUSTOM_BODY);
			expect(xml.response(200).headers["Content-Type"]).toBe(XML_CUSTOM_CONTENT_TYPE);
		});

		it("keeps the built-in XML response404 when the application supplied only response200", () => {
			const body = Response.getGenericResponses("XML").response(404).body;

			expect(body).toContain("<error>Not Found</error>");
			expect(body).not.toContain(XML_MARKER);
		});

		it("serves an unlisted 2xx (206) from the custom XML response200 through the class fallback", () => {
			const xml = Response.getGenericResponses("XML");

			expect(xml.response(206).body).toBe(XML_CUSTOM_BODY);
		});

		it("builds a Response for XML with the custom body for 200 and the built-in body for 404", () => {
			const response200 = new Response(REQ, { statusCode: 200 }, Response.CONTENT_TYPE.XML);
			const response404 = new Response(REQ, { statusCode: 404 }, Response.CONTENT_TYPE.XML);

			expect(response200.getBody()).toBe(XML_CUSTOM_BODY);
			expect(response404.getStatusCode()).toBe(404);
			expect(response404.getBody()).toContain("<error>Not Found</error>");
			expect(response404.getBody()).not.toContain(XML_MARKER);
		});

		it("does not modify the built-in xmlGenericResponse", () => {
			expect(xmlGenericResponse.response200.body).toContain("<hello>Success</hello>");
			expect(xmlGenericResponse.response200.body).not.toContain(XML_MARKER);
			expect(Response.getGenericResponses("XML")).not.toBe(xmlGenericResponse);
		});
	});

	describe("xmlResponses does not change the HTML slot (Requirement 2.2)", () => {
		it("keeps the custom HTML response404 that was passed in the same call", () => {
			const html = Response.getGenericResponses("HTML");

			expect(html.response(404).body).toBe(HTML_CUSTOM_BODY_404);
			expect(html.response(404).headers["Content-Type"]).toBe("text/html");
		});

		it("serves the custom HTML response200, not an XML body", () => {
			const body = Response.getGenericResponses("HTML").response(200).body;

			expect(body).toBe(HTML_CUSTOM_BODY_200);
			expect(body).not.toContain(XML_MARKER);
			expect(body).not.toContain("<?xml");
		});
	});

	describe("property: the HTML slot never returns an XML content type (Requirement 2.1, 4.3)", () => {
		it("returns a Content-Type that is neither Response.CONTENT_TYPE.XML nor the custom XML type for every status 100 to 599", () => {
			fc.assert(
				fc.property(fc.integer({ min: 100, max: 599 }), (statusCode) => {
					const contentType = Response.getGenericResponses("HTML").response(statusCode).headers["Content-Type"];

					return contentType !== Response.CONTENT_TYPE.XML && contentType !== XML_CUSTOM_CONTENT_TYPE;
				}),
				{ numRuns: 100 }
			);
		});
	});
});
