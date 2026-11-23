/**
 * Test: Content-Type of a template-built Response (property-based tests)
 *
 * Feature: 1-4-2-response-generic-template-content-type-header-is-ignored
 *
 * Purpose: Verify, across generated inputs, that a Response built by the constructor carries
 * the Content-Type of the template it was built from (P1, Requirement 2), that a Content-Type
 * header that selects no format never makes the constructor throw and is kept exactly as given
 * (P2, Requirements 1.7 and 2.6), that a Content-Type header that contains a control character
 * never reaches the response (P3, Requirement 2.7), and that finalize() serializes an object body
 * as JSON for every "+json" media type (P4, Requirement 3.1). A 100,000-character header value
 * is passed through the constructor and finalize() to show the helpers finish in time
 * (SEC-REQ-5.7-SEM-1333-1).
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Exactly one Response.init() call at module level, because Response.init() takes effect once
 *   per file (once-per-process rule): a custom response200 in each of jsonResponses,
 *   htmlResponses, xmlResponses, rssResponses and textResponses. Each carries a distinct
 *   Content-Type that is not blank and contains no control character
 * - DebugAndLog.log and DebugAndLog.warn are spied on and silenced in beforeEach
 * - Every property uses numRuns 100 and no seed option, so the global FC_SEED hook applies
 * - No process.env change, no real AWS call, no child process, no npm test
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Generator rules:
 * - P2 draws are "application/x-" plus characters from [a-z0-9.+-], so no draw can equal a
 *   format code, a constant, or the media type of a constant (premise test in this file)
 * - P3 draws contain one control character by construction. P4 subtypes end in "+json" by
 *   construction. No generator is filtered by the predicate its property asserts
 *
 * Related Tests:
 * - test/response/response-template-content-type-unit-tests.jest.mjs (custom templates)
 * - test/response/response-content-type-header-unit-tests.jest.mjs (default templates)
 * - test/response/response-finalize-json-media-type-unit-tests.jest.mjs
 * - test/response/response-generic-templates-custom-unit-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

const FORMAT_CODES = ["JSON", "HTML", "XML", "RSS", "TEXT"];

// The 32 characters U+0000 to U+001F plus U+007F
const CONTROL_CHARACTERS = [
	...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)),
	String.fromCharCode(127)
];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

// Custom Content-Type of the response200 template of each format. Distinct, not blank,
// no control character, and none equals the constant of its format.
const CUSTOM_CONTENT_TYPES = {
	JSON: "application/problem+json",
	HTML: "text/html",
	XML: "application/atom+xml",
	RSS: "application/x-rss-custom",
	TEXT: "text/plain; charset=utf-8"
};

const FC_OPTIONS = { numRuns: 100 };

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file. Custom response200 for each of the five formats.
Response.init({
	settings: {
		errorExpirationInSeconds: 180,
		routeExpirationInSeconds: 0
	},
	jsonResponses: {
		response200: {
			statusCode: 200,
			headers: { "Content-Type": CUSTOM_CONTENT_TYPES.JSON },
			body: { marker: "json200" }
		}
	},
	htmlResponses: {
		response200: {
			statusCode: 200,
			headers: { "Content-Type": CUSTOM_CONTENT_TYPES.HTML },
			body: "<html><body>html200</body></html>"
		}
	},
	xmlResponses: {
		response200: {
			statusCode: 200,
			headers: { "Content-Type": CUSTOM_CONTENT_TYPES.XML },
			body: "<?xml version=\"1.0\" encoding=\"UTF-8\" ?><feed><title>xml200</title></feed>"
		}
	},
	rssResponses: {
		response200: {
			statusCode: 200,
			headers: { "Content-Type": CUSTOM_CONTENT_TYPES.RSS },
			body: "<?xml version=\"1.0\" encoding=\"UTF-8\" ?><rss version=\"2.0\"><channel><title>rss200</title></channel></rss>"
		}
	},
	textResponses: {
		response200: {
			statusCode: 200,
			headers: { "Content-Type": CUSTOM_CONTENT_TYPES.TEXT },
			body: "text200"
		}
	}
});

/**
 * Media type of a header value: text before the first ";", trimmed, lower case.
 *
 * @param {string} value - Header value
 * @returns {string} Media type
 */
function mediaTypeOf(value) {
	return value.split(";", 1)[0].trim().toLowerCase();
}

/**
 * Content-Type that a template-built response must carry for a format and status code:
 * the template header when it is a non-blank string, else the constant of the format.
 * A value equal to a format code resolves to the constant of that format.
 *
 * @param {string} format - One of the five format codes
 * @param {number} statusCode - Status code of the template
 * @returns {string} Expected Content-Type
 */
function expectedContentType(format, statusCode) {
	const templateValue = Response.getGenericResponses(format).response(statusCode)?.headers?.["Content-Type"];
	const value = (typeof templateValue === "string" && templateValue.trim() !== "")
		? templateValue
		: Response.CONTENT_TYPE[format];
	return FORMAT_CODES.includes(value) ? Response.CONTENT_TYPE[value] : value;
}

describe("Response template Content-Type property tests", () => {
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
		it("applied a custom response200 to every format that differs from the constant", () => {
			for (const format of FORMAT_CODES) {
				const header = Response.getGenericResponses(format).response200.headers["Content-Type"];
				expect(header).toBe(CUSTOM_CONTENT_TYPES[format]);
				expect(header).not.toBe(Response.CONTENT_TYPE[format]);
			}
		});

		it("uses a distinct, non-blank custom Content-Type with no control character for each format", () => {
			const values = Object.values(CUSTOM_CONTENT_TYPES);
			expect(new Set(values).size).toBe(FORMAT_CODES.length);
			for (const value of values) {
				expect(value.trim()).not.toBe("");
				expect(CONTROL_CHARACTER_PATTERN.test(value)).toBe(false);
			}
		});

		it("generator premise: 33 control characters, each a control character", () => {
			expect(CONTROL_CHARACTERS).toHaveLength(33);
			for (const character of CONTROL_CHARACTERS) {
				expect(CONTROL_CHARACTER_PATTERN.test(character)).toBe(true);
			}
		});
	});

	describe("Property 1: a template-built response carries the Content-Type of its template", () => {
		// Feature: 1-4-2-response-generic-template-content-type-header-is-ignored, Property 1
		// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.10**

		it("carries the resolved template Content-Type for every status code 100 to 599 and every format", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 100, max: 599 }),
					fc.constantFrom(...FORMAT_CODES),
					(statusCode, format) => {
						const response = new Response(REQ, { statusCode }, Response.CONTENT_TYPE[format]);
						const expected = expectedContentType(format, statusCode);

						expect(response.getHeaders()["Content-Type"]).toBe(expected);
						expect(response.getContentType()).toBe(expected);
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 2: a header that selects no format does not throw and is kept exactly", () => {
		// Feature: 1-4-2-response-generic-template-content-type-header-is-ignored, Property 2
		// **Validates: Requirements 1.7, 2.1, 2.6, 6.11**

		it("premise: no Response.CONTENT_TYPE value has a media type that starts with application/x-", () => {
			for (const value of Object.values(Response.CONTENT_TYPE)) {
				expect(mediaTypeOf(value).startsWith("application/x-")).toBe(false);
			}
			for (const code of Object.keys(Response.CONTENT_TYPE)) {
				expect(code.toLowerCase().startsWith("application/x-")).toBe(false);
			}
		});

		it("does not throw and carries the value exactly as given", () => {
			fc.assert(
				fc.property(
					fc.stringMatching(/^[a-z0-9.+-]{1,20}$/).map((subtype) => "application/x-" + subtype),
					(value) => {
						let response;
						expect(() => {
							response = new Response(REQ, { statusCode: 200, headers: { "Content-Type": value } });
						}).not.toThrow();

						expect(response.getHeaders()["Content-Type"]).toBe(value);
						expect(response.getContentType()).toBe(value);
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 3: a header with a control character never reaches the response", () => {
		// Feature: 1-4-2-response-generic-template-content-type-header-is-ignored, Property 3
		// **Validates: Requirements 2.7, 6.12; SEC-REQ-2.7-SEM-113-1**

		it("does not throw and the response Content-Type contains no control character", () => {
			fc.assert(
				fc.property(
					fc.tuple(
						fc.stringMatching(/^[a-z0-9/+.-]{0,12}$/),
						fc.constantFrom(...CONTROL_CHARACTERS),
						fc.stringMatching(/^[a-z0-9/+.-]{0,12}$/)
					).map(([prefix, controlCharacter, suffix]) => prefix + controlCharacter + suffix),
					(value) => {
						let response;
						expect(() => {
							response = new Response(REQ, { statusCode: 200, headers: { "Content-Type": value } });
						}).not.toThrow();

						const header = response.getHeaders()["Content-Type"];
						expect(typeof header).toBe("string");
						expect(CONTROL_CHARACTER_PATTERN.test(header)).toBe(false);
						expect(header).not.toBe(value);
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 4: finalize() serializes a plain-object body for every +json media type", () => {
		// Feature: 1-4-2-response-generic-template-content-type-header-is-ignored, Property 4
		// **Validates: Requirements 3.1, 6.13**

		it("returns JSON.stringify of the body", () => {
			fc.assert(
				fc.property(
					fc.dictionary(
						fc.stringMatching(/^[a-z]{1,8}$/),
						fc.oneof(fc.integer(), fc.boolean(), fc.stringMatching(/^[a-z ]{0,10}$/)),
						{ maxKeys: 5 }
					),
					fc.stringMatching(/^[a-z0-9.-]{1,10}$/).map((subtype) => "application/" + subtype + "+json"),
					(body, mediaType) => {
						const response = new Response(REQ, { statusCode: 200 });
						// setBody() re-infers Content-Type, so the header is set after it
						response.setBody(body);
						response.addHeader("Content-Type", mediaType);

						const finalized = response.finalize();

						expect(finalized.headers["Content-Type"]).toBe(mediaType);
						expect(finalized.body).toBe(JSON.stringify(body));
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Long Content-Type value (SEC-REQ-5.7-SEM-1333-1)", () => {
		// ";+ json" repeated 14286 times is 100,002 characters
		const LONG_VALUE = ";+ json".repeat(14286);

		it("is 100,000 characters or more and made of ;, +, space and json", () => {
			expect(LONG_VALUE.length).toBeGreaterThanOrEqual(100000);
			expect(LONG_VALUE.replace(/[;+ ]|json/g, "")).toBe("");
		});

		it("is accepted by the constructor as a supplied header and kept exactly", () => {
			let response;
			expect(() => {
				response = new Response(REQ, { statusCode: 200, headers: { "Content-Type": LONG_VALUE } });
			}).not.toThrow();

			expect(response.getHeaders()["Content-Type"]).toBe(LONG_VALUE);
		});

		it("is handled by finalize() as the header of a response with an object body", () => {
			const response = new Response(REQ, { statusCode: 200 });
			response.setBody({ a: 1 });
			response.addHeader("Content-Type", LONG_VALUE);

			let finalized;
			expect(() => {
				finalized = response.finalize();
			}).not.toThrow();

			expect(finalized.headers["Content-Type"]).toBe(LONG_VALUE);
			expect(typeof finalized.body).toBe("string");
		});
	});
});
