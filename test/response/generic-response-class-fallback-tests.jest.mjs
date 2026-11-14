/**
 * Jest unit tests for the class fallback of `response()` in the generic response modules.
 *
 * Feature: 1-4-2-generic-responses-for-unlisted-status-codes
 * Requirements: 1.1 to 1.8, 3.1 to 3.8, 10.2
 *
 * A status code with no template uses the template of its class: 2xx the 200
 * template, 4xx the 400 template, 5xx the 500 template, and 100-199, 205 and
 * 300-399 the bodiless 204 template. Anything else uses the 500 template.
 *
 * Isolation: the five format modules are cached singletons. Tests that change a
 * template work on a shallow copy (`{ ...mod }`) or on a module built with
 * `createGenericResponseModule`, so no test changes the shared module objects.
 * `response()` reads templates from `this`, so a copy behaves like a module that
 * `Response.init()` merged custom templates into.
 *
 * `response(427)` logs a one-time deprecation warning through
 * `DebugAndLog.warn`. The spy installed in `beforeEach` silences it and is
 * restored in `afterEach`. The one-time behavior itself is tested in
 * generic-response-deprecation-427-tests.jest.mjs.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import genericResponse from "../../src/lib/tools/generic.response.js";
import DebugAndLog from "../../src/lib/tools/DebugAndLog.class.js";
import jsonResponse from "../../src/lib/tools/generic.response.json.js";
import htmlResponse from "../../src/lib/tools/generic.response.html.js";
import rssResponse from "../../src/lib/tools/generic.response.rss.js";
import textResponse from "../../src/lib/tools/generic.response.text.js";
import xmlResponse from "../../src/lib/tools/generic.response.xml.js";
import {
	LISTED_STATUS_CODES,
	NO_BODY_CODES,
	STATUS_CODE_MESSAGES
} from "../helpers/generic-response-status-codes.mjs";

const { createGenericResponseModule } = genericResponse;

const MODULES = [
	["json", jsonResponse],
	["html", htmlResponse],
	["xml", xmlResponse],
	["rss", rssResponse],
	["text", textResponse]
];

const NEW_CODES = [201, 202, 204, 409, 422, 429, 503];
const UNTEMPLATED_CODES = [205, 301, 302, 304];

describe("Generic response class fallback - unit tests", () => {

	beforeEach(() => {
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe.each(MODULES)("%s module", (name, sharedModule) => {

		/**
		 * Fresh shallow copy so a test can replace templates without leaking.
		 *
		 * @returns {Object} Copy of the module
		 */
		const freshModule = () => ({ ...sharedModule });

		describe("2xx without a template uses response200", () => {
			it.each([203, 206, 299])("response(%i) is the response200 object", (code) => {
				const mod = freshModule();
				const result = mod.response(code);
				expect(result).toBe(mod.response200);
				expect(result.statusCode).toBe(200);
			});

			it("response(205) is the bodiless response204 object, not response200", () => {
				const mod = freshModule();
				expect(mod.response(205)).toBe(mod.response204);
				expect(mod.response(205).body).toBeNull();
			});
		});

		describe("4xx without a template uses response400", () => {
			it.each([410, 413, 499])("response(%i) is the response400 object", (code) => {
				const mod = freshModule();
				const result = mod.response(code);
				expect(result).toBe(mod.response400);
				expect(result.statusCode).toBe(400);
			});
		});

		describe("5xx without a template uses response500", () => {
			it.each([501, 502, 504, 599])("response(%i) is the response500 object", (code) => {
				const mod = freshModule();
				const result = mod.response(code);
				expect(result).toBe(mod.response500);
				expect(result.statusCode).toBe(500);
			});
		});

		describe("1xx and 3xx use the bodiless response204", () => {
			it.each([100, 101, 199, 301, 302, 304, 399])("response(%i) is response204 with a null body", (code) => {
				const mod = freshModule();
				const result = mod.response(code);
				expect(result).toBe(mod.response204);
				expect(result.statusCode).toBe(204);
				expect(result.body).toBeNull();
			});
		});

		describe("values that are not statuses use response500", () => {
			it.each([0, -1, 99, 600, 999, NaN, "abc", "", undefined, null, {}, [], true, false, "0x1A4", "2e2"].map((value) => [value]))(
				"response(%p) is the response500 object",
				(value) => {
					const mod = freshModule();
					expect(mod.response(value)).toBe(mod.response500);
				}
			);

			it.each([undefined, null, true, false, 0, 1n, 12.5, "410", "", "abc", [], [410], {}, { a: 1 }].map((value) => [value]))(
				"response(%p) does not throw",
				(value) => {
					const mod = freshModule();
					expect(() => mod.response(value)).not.toThrow();
				}
			);
		});

		describe("parsing of the status code", () => {
			it.each(["410", " 410", "410abc", 410.7, "410.7", [410]].map((value) => [value]))(
				"response(%p) resolves like 410",
				(value) => {
					const mod = freshModule();
					expect(mod.response(value)).toBe(mod.response400);
				}
			);

			it("response(\"404\") is the same object as response(404) and response404", () => {
				const mod = freshModule();
				expect(mod.response("404")).toBe(mod.response(404));
				expect(mod.response("404")).toBe(mod.response404);
			});
		});

		describe("direct lookup wins over the fallback", () => {
			it("returns every listed template by identity", () => {
				const mod = freshModule();
				for (const code of LISTED_STATUS_CODES) {
					expect(mod.response(code)).toBe(mod["response" + code]);
					expect(mod.response(code).statusCode).toBe(code);
				}
			});

			it("returns a custom response201 added to the module for 201", () => {
				const mod = freshModule();
				const custom = { statusCode: 201, headers: mod.headers, body: "custom 201" };
				mod.response201 = custom;
				expect(mod.response(201)).toBe(custom);
			});

			it("returns a custom response for an unlisted code, ahead of the class template", () => {
				const mod = freshModule();
				const custom = { statusCode: 410, headers: mod.headers, body: "custom 410" };
				mod.response410 = custom;
				expect(mod.response(410)).toBe(custom);
				expect(mod.response(410)).not.toBe(mod.response400);
				expect(mod.response(411)).toBe(mod.response400);
			});

			it("does not change the shared module when a copy is changed", () => {
				const mod = freshModule();
				mod.response410 = { statusCode: 410, headers: mod.headers, body: "custom 410" };
				expect(sharedModule.response(410)).toBe(sharedModule.response400);
				expect(sharedModule.response410).toBeUndefined();
			});
		});

		describe("the fallback reads templates from this", () => {
			it("follows a replaced response400", () => {
				const mod = freshModule();
				const replacement = { statusCode: 400, headers: mod.headers, body: "app 400" };
				mod.response400 = replacement;
				expect(mod.response(410)).toBe(replacement);
				expect(mod.response(499)).toBe(replacement);
			});

			it("follows a replaced response200", () => {
				const mod = freshModule();
				const replacement = { statusCode: 200, headers: mod.headers, body: "app 200" };
				mod.response200 = replacement;
				expect(mod.response(203)).toBe(replacement);
			});

			it("follows a replaced response500 for 5xx and for non-status values", () => {
				const mod = freshModule();
				const replacement = { statusCode: 500, headers: mod.headers, body: "app 500" };
				mod.response500 = replacement;
				expect(mod.response(502)).toBe(replacement);
				expect(mod.response(999)).toBe(replacement);
				expect(mod.response("abc")).toBe(replacement);
			});

			it("follows a replaced response204 for 1xx, 205 and 3xx", () => {
				const mod = freshModule();
				const replacement = { statusCode: 204, headers: mod.headers, body: "app 204" };
				mod.response204 = replacement;
				expect(mod.response(100)).toBe(replacement);
				expect(mod.response(205)).toBe(replacement);
				expect(mod.response(301)).toBe(replacement);
			});

			it("does not send an unlisted 2xx or 4xx to a replaced response500", () => {
				const mod = freshModule();
				const replacement = { statusCode: 500, headers: mod.headers, body: "app 500" };
				mod.response500 = replacement;
				expect(mod.response(203)).toBe(mod.response200);
				expect(mod.response(410)).toBe(mod.response400);
			});

			it("returns response500 when the template named by the class is undefined", () => {
				const mod = freshModule();
				mod.response200 = undefined;
				expect(mod.response(203)).toBe(mod.response500);
				expect(mod.response(200)).toBe(mod.response500);
			});

			it("returns response500 when the template named by the class is null", () => {
				const mod = freshModule();
				mod.response400 = null;
				expect(mod.response(410)).toBe(mod.response500);
			});
		});

		describe("returned object", () => {
			it("is the template itself, not a copy", () => {
				const mod = freshModule();
				expect(mod.response(410)).toBe(mod.response400);
				expect(mod.response(301)).toBe(mod.response204);
				expect(mod.response(410).statusCode).toBe(400);
				expect(mod.response(301).statusCode).toBe(204);
			});

			it("is the same object on every call", () => {
				const mod = freshModule();
				expect(mod.response(410)).toBe(mod.response(410));
				expect(mod.response(301)).toBe(mod.response(302));
			});
		});

		describe("templates", () => {
			it("has response204 with a null body", () => {
				expect(sharedModule.response204.body).toBeNull();
			});

			it.each(NEW_CODES)("has response%i with its own status code and the shared headers object", (code) => {
				const template = sharedModule["response" + code];
				expect(template.statusCode).toBe(code);
				expect(template.headers).toBe(sharedModule.headers);
				expect(Object.keys(template).sort()).toEqual(["body", "headers", "statusCode"]);
			});

			it.each(NEW_CODES.filter((code) => !NO_BODY_CODES.includes(code)))(
				"has a response%i body that carries its message",
				(code) => {
					expect(JSON.stringify(sharedModule["response" + code].body)).toContain(STATUS_CODE_MESSAGES[code]);
				}
			);

			it.each(UNTEMPLATED_CODES)("has no response%i member", (code) => {
				expect(sharedModule).not.toHaveProperty("response" + code);
			});
		});
	});

	describe("module export surface", () => {
		it("exports only createGenericResponseModule from generic.response.js", () => {
			expect(Object.keys(genericResponse)).toEqual(["createGenericResponseModule"]);
			expect(genericResponse.STATUS_CODE_MAP).toBeUndefined();
		});

		it.each(MODULES)("does not expose STATUS_CODE_MAP on the %s module", (name, mod) => {
			expect(mod.STATUS_CODE_MAP).toBeUndefined();
			expect(mod.NO_BODY_STATUS_CODES).toBeUndefined();
		});
	});

	describe("factory with a formatter spy", () => {
		it("does not call the formatter for 204 and calls it once for each other listed code", () => {
			const formatter = jest.fn((statusCode, message) => ({ message }));
			const mod = createGenericResponseModule("application/json", formatter);

			expect(formatter).toHaveBeenCalledTimes(LISTED_STATUS_CODES.length - NO_BODY_CODES.length);
			expect(formatter.mock.calls.map((call) => call[0])).not.toContain(204);
			expect(formatter.mock.calls.map((call) => call[0]).sort((a, b) => a - b))
				.toEqual(LISTED_STATUS_CODES.filter((code) => !NO_BODY_CODES.includes(code)));
			expect(mod.response204.body).toBeNull();
		});

		it("does not call the formatter again when response() falls back to the 204 template", () => {
			const formatter = jest.fn((statusCode, message) => ({ message }));
			const mod = createGenericResponseModule("application/json", formatter);
			const callsAfterBuild = formatter.mock.calls.length;

			expect(mod.response(204).body).toBeNull();
			expect(mod.response(301).body).toBeNull();
			expect(mod.response(410)).toBe(mod.response400);
			expect(formatter).toHaveBeenCalledTimes(callsAfterBuild);
		});

		it("returns response500 for 203 when response200 is undefined on a built module", () => {
			const mod = createGenericResponseModule("text/plain", (statusCode, message) => message);
			mod.response200 = undefined;
			expect(mod.response(203)).toBe(mod.response500);
		});

		it("uses the templates of the module it is called on", () => {
			const first = createGenericResponseModule("text/plain", (statusCode, message) => "first " + message);
			const second = createGenericResponseModule("text/plain", (statusCode, message) => "second " + message);
			expect(first.response(410).body).toBe("first Bad Request");
			expect(second.response(410).body).toBe("second Bad Request");
		});
	});
});
