/**
 * Property-based tests for the status code class fallback of the generic
 * response modules (JSON, HTML, XML, RSS, Text).
 *
 * Feature: 1-4-2-generic-responses-for-unlisted-status-codes
 *
 * Properties:
 * - P1 Drift guard: the response<digits> keys of each module equal the listed codes
 * - P2 Listed identity: response(code) is the module's own template for a listed code
 * - P3 Class fallback: unlisted 2xx (except 205), 4xx and 5xx use response200, response400, response500
 * - P4 Bodiless fallback: 1xx, 3xx and 205 use response204 with a null body
 * - P5 Out of range: integers below 100, at or above 600, and non-numeric strings use response500
 * - P6 Success element: XML and RSS bodies contain <hello> for listed 2xx codes and <error> otherwise
 * - P7 String and number agree: response(String(n)) is response(n)
 *
 * Generators are ranges with the listed codes removed by a constant list from
 * the shared helper. That list is a test constant, not the predicate under test.
 *
 * Requirements: 1.1, 1.8, 2.1, 3.1, 3.2, 10.3, 10.4
 *
 * Replay a failing run with FC_SEED. No test here passes a seed to fc.assert.
 */

import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import fc from "fast-check";
import DebugAndLog from "../../src/lib/tools/DebugAndLog.class.js";
import jsonResponse from "../../src/lib/tools/generic.response.json.js";
import htmlResponse from "../../src/lib/tools/generic.response.html.js";
import xmlResponse from "../../src/lib/tools/generic.response.xml.js";
import rssResponse from "../../src/lib/tools/generic.response.rss.js";
import textResponse from "../../src/lib/tools/generic.response.text.js";
import {
	LISTED_STATUS_CODES,
	NO_BODY_CODES,
	SUCCESS_CODES,
	BODILESS_FALLBACK_RANGES,
	BODILESS_FALLBACK_EXTRA_CODES
} from "../helpers/generic-response-status-codes.mjs";

const MODULES = [
	["json", jsonResponse],
	["html", htmlResponse],
	["xml", xmlResponse],
	["rss", rssResponse],
	["text", textResponse]
];

const XML_MODULES = [
	["xml", xmlResponse],
	["rss", rssResponse]
];

const NUMBERED_KEY = /^response\d+$/;

/**
 * Integers in an inclusive range, less the codes in the exclusion list.
 * Built from a constant list, so the generator needs no predicate.
 *
 * @param {number} min - First integer in the range
 * @param {number} max - Last integer in the range
 * @param {Array.<number>} excluded - Constant list of integers to leave out
 * @returns {Array.<number>} The remaining integers
 */
function rangeWithout(min, max, excluded) {
	const values = [];
	for (let n = min; n <= max; n++) {
		if (!excluded.includes(n)) {
			values.push(n);
		}
	}
	return values;
}

const UNLISTED_2XX = rangeWithout(200, 299, [...LISTED_STATUS_CODES, ...BODILESS_FALLBACK_EXTRA_CODES]);
const UNLISTED_4XX = rangeWithout(400, 499, LISTED_STATUS_CODES);
const UNLISTED_5XX = rangeWithout(500, 599, LISTED_STATUS_CODES);

const BODILESS_CODES = [
	...BODILESS_FALLBACK_RANGES.flatMap(([min, max]) => rangeWithout(min, max, [])),
	...BODILESS_FALLBACK_EXTRA_CODES
];

const MODULE_ARB = fc.constantFrom(...MODULES);
const XML_MODULE_ARB = fc.constantFrom(...XML_MODULES);

// Digits, whitespace and signs are left out, so parseInt cannot find a number
const NON_NUMERIC_ARB = fc.stringMatching(/^[a-zA-Z_]{0,12}$/);

const OUT_OF_RANGE_ARB = fc.oneof(
	fc.integer({ min: -1000000, max: 99 }),
	fc.integer({ min: 600, max: 1000000 }),
	NON_NUMERIC_ARB
);

describe("Generic response class fallback - property tests", () => {

	beforeEach(() => {
		// response(427) logs a one-time deprecation warning; keep test output clean
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Test constants", () => {
		it("should leave the generator pools non-empty and free of listed codes", () => {
			for (const pool of [UNLISTED_2XX, UNLISTED_4XX, UNLISTED_5XX, BODILESS_CODES]) {
				expect(pool.length).toBeGreaterThan(0);
			}
			for (const pool of [UNLISTED_2XX, UNLISTED_4XX, UNLISTED_5XX, BODILESS_CODES]) {
				for (const code of LISTED_STATUS_CODES) {
					expect(pool).not.toContain(code);
				}
			}
			expect(UNLISTED_2XX).not.toContain(205);
			expect(BODILESS_CODES).toContain(205);
		});
	});

	describe("P1: Drift guard", () => {
		it.each(MODULES)("should have a response<code> key for each listed code and no other in the %s module", (name, mod) => {
			const actual = Object.keys(mod).filter((key) => NUMBERED_KEY.test(key)).sort();
			const expected = LISTED_STATUS_CODES.map((code) => "response" + code).sort();
			expect(actual).toEqual(expected);
		});
	});

	describe("P2: Listed identity", () => {
		it("should return the module's own template with a matching statusCode for every listed code", () => {
			fc.assert(
				fc.property(
					MODULE_ARB,
					fc.constantFrom(...LISTED_STATUS_CODES),
					([, mod], code) => {
						const result = mod.response(code);
						expect(result).toBe(mod["response" + code]);
						expect(result.statusCode).toBe(code);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("P3: Class fallback", () => {
		it("should return response200 for an unlisted 2xx code other than 205", () => {
			fc.assert(
				fc.property(MODULE_ARB, fc.constantFrom(...UNLISTED_2XX), ([, mod], code) => {
					expect(mod.response(code)).toBe(mod.response200);
				}),
				{ numRuns: 100 }
			);
		});

		it("should return response400 for an unlisted 4xx code", () => {
			fc.assert(
				fc.property(MODULE_ARB, fc.constantFrom(...UNLISTED_4XX), ([, mod], code) => {
					expect(mod.response(code)).toBe(mod.response400);
				}),
				{ numRuns: 100 }
			);
		});

		it("should return response500 for an unlisted 5xx code", () => {
			fc.assert(
				fc.property(MODULE_ARB, fc.constantFrom(...UNLISTED_5XX), ([, mod], code) => {
					expect(mod.response(code)).toBe(mod.response500);
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("P4: Bodiless fallback", () => {
		it("should return response204 with a null body for 1xx, 3xx and 205", () => {
			fc.assert(
				fc.property(MODULE_ARB, fc.constantFrom(...BODILESS_CODES), ([, mod], code) => {
					const result = mod.response(code);
					expect(result).toBe(mod.response204);
					expect(result.body).toBeNull();
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("P5: Out of range", () => {
		it("should return response500 for integers below 100, at or above 600, and non-numeric strings", () => {
			fc.assert(
				fc.property(MODULE_ARB, OUT_OF_RANGE_ARB, ([, mod], value) => {
					expect(mod.response(value)).toBe(mod.response500);
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("P6: Success element", () => {
		it("should contain <hello> for listed 2xx codes and <error> for other listed codes", () => {
			fc.assert(
				fc.property(XML_MODULE_ARB, fc.constantFrom(...LISTED_STATUS_CODES), ([, mod], code) => {
					const body = mod.response(code).body;
					if (NO_BODY_CODES.includes(code)) {
						expect(body).toBeNull();
					} else if (SUCCESS_CODES.includes(code)) {
						expect(body).toContain("<hello>");
						expect(body).not.toContain("<error>");
					} else {
						expect(body).toContain("<error>");
						expect(body).not.toContain("<hello>");
					}
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("P7: String and number agree", () => {
		it("should return the same object for response(String(n)) and response(n)", () => {
			fc.assert(
				fc.property(MODULE_ARB, fc.integer({ min: -1000, max: 1000 }), ([, mod], n) => {
					expect(mod.response(String(n))).toBe(mod.response(n));
				}),
				{ numRuns: 100 }
			);
		});
	});
});
