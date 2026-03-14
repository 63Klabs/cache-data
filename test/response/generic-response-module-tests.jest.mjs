/**
 * Jest unit tests and property-based tests for the centralized generic.response.js
 * factory module.
 *
 * Feature: 1-3-10-clean-up-generic-responses
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 *
 * Unit tests verify the factory produces correct modules, response() handles
 * known/unknown/string codes, headers are correct, and format files export helpers.
 *
 * Property-based tests validate Properties 2, 3, and 4 from the design document.
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { createGenericResponseModule } from "../../src/lib/tools/generic.response.js";
import jsonResponse from "../../src/lib/tools/generic.response.json.js";
import htmlResponse from "../../src/lib/tools/generic.response.html.js";
import rssResponse from "../../src/lib/tools/generic.response.rss.js";
import textResponse from "../../src/lib/tools/generic.response.text.js";
import xmlResponse from "../../src/lib/tools/generic.response.xml.js";

const KNOWN_STATUS_CODES = [200, 400, 401, 403, 404, 405, 408, 418, 427, 500];

const STATUS_CODE_MESSAGES = {
	200: "Success",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	408: "Request Timeout",
	418: "I'm a teapot",
	427: "Too Many Requests",
	500: "Internal Server Error"
};

describe("Generic Response Module - Unit Tests", () => {

	describe("Factory produces complete module", () => {
		const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));

		it("should produce a module with all 10 response objects", () => {
			for (const code of KNOWN_STATUS_CODES) {
				const key = "response" + code;
				expect(mod).toHaveProperty(key);
				expect(mod[key]).toHaveProperty("statusCode", code);
				expect(mod[key]).toHaveProperty("headers");
				expect(mod[key]).toHaveProperty("body");
			}
		});

		it("should include contentType, headers, and response function", () => {
			expect(mod).toHaveProperty("contentType", "application/json");
			expect(mod).toHaveProperty("headers");
			expect(typeof mod.response).toBe("function");
		});
	});

	describe("response() fallback for unknown codes", () => {
		const mod = createGenericResponseModule("text/plain", (statusCode, message) => message);

		it("should return response500 for code 999", () => {
			const result = mod.response(999);
			expect(result).toBe(mod.response500);
			expect(result.statusCode).toBe(500);
		});

		it("should return response500 for code 0", () => {
			const result = mod.response(0);
			expect(result).toBe(mod.response500);
		});

		it("should return response500 for code -1", () => {
			const result = mod.response(-1);
			expect(result).toBe(mod.response500);
		});

		it("should return response500 for NaN from non-numeric string", () => {
			const result = mod.response("abc");
			expect(result).toBe(mod.response500);
			expect(result.statusCode).toBe(500);
		});
	});

	describe("response() handles string status codes", () => {
		const mod = createGenericResponseModule("text/plain", (statusCode, message) => message);

		it("should handle string '404' the same as integer 404", () => {
			const fromString = mod.response("404");
			const fromInt = mod.response(404);
			expect(fromString).toBe(fromInt);
			expect(fromString.statusCode).toBe(404);
		});
	});

	describe("Headers contain correct Content-Type", () => {
		it("should set Content-Type to the provided content type", () => {
			const mod = createGenericResponseModule("application/xml", (s, m) => m);
			expect(mod.headers["Content-Type"]).toBe("application/xml");
		});

		it("should share the same headers object across all response objects", () => {
			const mod = createGenericResponseModule("text/html", (s, m) => m);
			for (const code of KNOWN_STATUS_CODES) {
				expect(mod["response" + code].headers).toBe(mod.headers);
			}
		});
	});

	describe("Format files export helper functions", () => {
		it("should export html helper from HTML module", () => {
			expect(typeof htmlResponse.html).toBe("function");
		});

		it("should export json helper from JSON module", () => {
			expect(typeof jsonResponse.json).toBe("function");
		});

		it("should export rss helper from RSS module", () => {
			expect(typeof rssResponse.rss).toBe("function");
		});

		it("should export text helper from Text module", () => {
			expect(typeof textResponse.text).toBe("function");
		});

		it("should export xml helper from XML module", () => {
			expect(typeof xmlResponse.xml).toBe("function");
		});
	});

	describe("json() helper behaviour", () => {
		it("should return data when data is truthy", () => {
			const data = { key: "value" };
			expect(jsonResponse.json(data)).toBe(data);
		});

		it("should return empty object when data is null", () => {
			expect(jsonResponse.json(null)).toEqual({});
		});

		it("should return empty object when called with no arguments", () => {
			expect(jsonResponse.json()).toEqual({});
		});
	});
});


describe("Generic Response Module - Property-Based Tests", () => {

	// Feature: 1-3-10-clean-up-generic-responses, Property 2: Known status code lookup
	describe("Property 2: Known status code lookup (int and string)", () => {

		it("should return the correct Response_Object for any known status code as integer", () => {
			const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));

			fc.assert(
				fc.property(
					fc.constantFrom(...KNOWN_STATUS_CODES),
					(code) => {
						const result = mod.response(code);
						expect(result.statusCode).toBe(code);
						expect(result).toBe(mod["response" + code]);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should return the correct Response_Object for any known status code as string", () => {
			const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));

			fc.assert(
				fc.property(
					fc.constantFrom(...KNOWN_STATUS_CODES),
					(code) => {
						const result = mod.response(String(code));
						expect(result.statusCode).toBe(code);
						expect(result).toBe(mod["response" + code]);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	// Feature: 1-3-10-clean-up-generic-responses, Property 3: Unknown status code fallback
	describe("Property 3: Unknown status code fallback", () => {

		it("should return response500 for any integer outside the known set", () => {
			const mod = createGenericResponseModule("text/plain", (statusCode, message) => message);
			const knownSet = new Set(KNOWN_STATUS_CODES);

			fc.assert(
				fc.property(
					fc.integer({ min: -1000, max: 1000 }).filter((n) => !knownSet.has(n)),
					(unknownCode) => {
						const result = mod.response(unknownCode);
						expect(result).toBe(mod.response500);
						expect(result.statusCode).toBe(500);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	// Feature: 1-3-10-clean-up-generic-responses, Property 4: Backwards compatibility of format output
	describe("Property 4: Backwards compatibility of format output", () => {

		/**
		 * Hardcoded expected values from the original implementations.
		 * Each format maps status codes to the expected Response_Object fields.
		 */
		const EXPECTED_OUTPUTS = buildExpectedOutputs();

		it("should produce identical output to the original implementation for any (format, statusCode) pair", () => {
			const formatModules = {
				json: jsonResponse,
				html: htmlResponse,
				rss: rssResponse,
				text: textResponse,
				xml: xmlResponse
			};
			const formatNames = Object.keys(formatModules);

			fc.assert(
				fc.property(
					fc.constantFrom(...formatNames),
					fc.constantFrom(...KNOWN_STATUS_CODES),
					(formatName, statusCode) => {
						const mod = formatModules[formatName];
						const result = mod.response(statusCode);
						const expected = EXPECTED_OUTPUTS[formatName][statusCode];

						expect(result.statusCode).toBe(expected.statusCode);
						expect(result.headers).toEqual(expected.headers);
						expect(result.body).toEqual(expected.body);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});
});

/**
 * Build the hardcoded expected output map for all five formats and all ten
 * status codes, matching the original pre-refactoring implementations.
 *
 * @returns {Object} Map of format name to status code to expected Response_Object
 */
function buildExpectedOutputs() {
	// Helper functions matching original implementations
	const htmlFn = (title, body) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
	const rssFn = (body) => `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0">${body}</rss>`;
	const xmlFn = (body) => `<?xml version="1.0" encoding="UTF-8" ?>${body}`;

	const HTML_TITLE_MAP = { 200: "OK", 500: "Error" };

	const formats = {};

	// JSON
	formats.json = {};
	for (const code of KNOWN_STATUS_CODES) {
		formats.json[code] = {
			statusCode: code,
			headers: { "Content-Type": "application/json" },
			body: { message: STATUS_CODE_MESSAGES[code] }
		};
	}

	// Text
	formats.text = {};
	for (const code of KNOWN_STATUS_CODES) {
		formats.text[code] = {
			statusCode: code,
			headers: { "Content-Type": "text/plain" },
			body: STATUS_CODE_MESSAGES[code]
		};
	}

	// HTML
	formats.html = {};
	for (const code of KNOWN_STATUS_CODES) {
		const message = STATUS_CODE_MESSAGES[code];
		const titleText = HTML_TITLE_MAP[code] || message;
		const title = code + " " + titleText;
		formats.html[code] = {
			statusCode: code,
			headers: { "Content-Type": "text/html; charset=utf-8" },
			body: htmlFn(title, "<p>" + message + "</p>")
		};
	}

	// RSS
	formats.rss = {};
	for (const code of KNOWN_STATUS_CODES) {
		const message = STATUS_CODE_MESSAGES[code];
		let body;
		if (code === 200) {
			body = rssFn("<hello>" + message + "</hello>");
		} else {
			const msg = code === 418 ? "418 " + message : message;
			body = rssFn("<error>" + msg + "</error>");
		}
		formats.rss[code] = {
			statusCode: code,
			headers: { "Content-Type": "application/rss+xml" },
			body: body
		};
	}

	// XML
	formats.xml = {};
	for (const code of KNOWN_STATUS_CODES) {
		const message = STATUS_CODE_MESSAGES[code];
		let body;
		if (code === 200) {
			body = xmlFn("<hello>" + message + "</hello>");
		} else {
			const msg = code === 418 ? "418 " + message : message;
			body = xmlFn("<error>" + msg + "</error>");
		}
		formats.xml[code] = {
			statusCode: code,
			headers: { "Content-Type": "application/xml" },
			body: body
		};
	}

	return formats;
}
