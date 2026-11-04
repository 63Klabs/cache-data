/**
 * Test: RESPONSE log line field sanitization (examples)
 *
 * Feature: 1-4-1-trusted-client-ip
 *
 * Purpose: Verify that Response._log(), reached through Response.finalize(),
 * writes the 13-field RESPONSE line with the request-derived fields cleaned:
 * "|" and control characters removed, empty values logged as "-".
 *
 * Setup:
 * - DebugAndLog.log is spied on, so nothing is written and the message can be read
 * - The ClientRequest getters are spied on to supply the field values
 * - Response.init() uses the same options as response-tests.jest.mjs
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Blocks:
 * - "preservation": behavior that holds on the code before the change
 * - "fixed behavior": behavior the sanitizer adds
 *
 * Only documentation range addresses (192.0.2.0/24, 198.51.100.0/24,
 * 203.0.113.0/24) are used.
 *
 * Related Tests:
 * - test/response/response-tests.jest.mjs
 * - test/response/response-log-field-sanitization-property-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Response, ClientRequest } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

const DebugAndLog = (await import('../../src/lib/tools/DebugAndLog.class.js')).default;

const DEFAULT_FIELDS = Object.freeze({
	statusCode: 200,
	bytes: 25, // {"message":"Hello World"}
	contentType: "JSON",
	execms: 42,
	clientIp: "203.0.113.10",
	userAgent: "Mozilla/5.0",
	origin: "https://app.example.com",
	referrer: "https://app.example.com/page",
	resource: "GET:items/{itemId}",
	queryKeys: "id&q",
	routeLog: "route:items",
	queryLog: "format=short",
	apiKey: null
});

const RESPONSE_OPTIONS = {
	jsonResponses: {
		response200: {
			statusCode: 200,
			headers: { "X-Custom-Header": "Custom Value" },
			body: { message: "Hello World" }
		}
	},
	htmlResponses: {
		response200: {
			statusCode: 200,
			headers: { "X-Custom-Header": "Custom Value HTML" },
			body: "<html><head><title>Hello</title></head><body><h1>Hello World</h1></body></html>"
		}
	},
	settings: {
		errorExpirationInSeconds: 422,
		routeExpirationInSeconds: 922
	}
};

/**
 * Build the RESPONSE message the log line should hold, from the thirteen final field texts.
 *
 * @param {Object} fields - Field texts, in log order
 * @returns {string} The message passed to DebugAndLog.log
 */
function buildLine(fields) {
	return [
		fields.statusCode,
		fields.bytes,
		fields.contentType,
		fields.execms,
		fields.clientIp,
		fields.userAgent,
		fields.origin,
		fields.referrer,
		fields.resource,
		fields.queryKeys,
		fields.routeLog,
		fields.queryLog,
		fields.apiKey
	].join(" | ");
}

describe("RESPONSE log line field sanitization", () => {
	let REQ;
	let logSpy;

	ClientRequest.init({ validations: testValidationsA });

	/**
	 * Finalize a response while the ClientRequest getters return the given values,
	 * and return the message that Response passed to DebugAndLog.log for the RESPONSE tag.
	 *
	 * @param {Object} [overrides] - Values replacing DEFAULT_FIELDS
	 * @returns {string} The RESPONSE log message
	 */
	function logResponse(overrides = {}) {
		const values = { ...DEFAULT_FIELDS, ...overrides };

		jest.spyOn(REQ, "getFinalExecutionTime").mockReturnValue(values.execms);
		jest.spyOn(REQ, "getClientIp").mockReturnValue(values.clientIp);
		jest.spyOn(REQ, "getClientUserAgent").mockReturnValue(values.userAgent);
		jest.spyOn(REQ, "getClientOrigin").mockReturnValue(values.origin);
		jest.spyOn(REQ, "getClientReferrer").mockReturnValue(values.referrer);
		jest.spyOn(REQ, "getRequestLog").mockReturnValue({
			resource: values.resource,
			queryKeys: values.queryKeys,
			routeLog: values.routeLog,
			queryLog: values.queryLog,
			apiKey: values.apiKey
		});

		const RESPONSE = new Response(REQ);
		RESPONSE.finalize();

		const responseCalls = logSpy.mock.calls.filter((call) => call[1] === "RESPONSE");
		expect(responseCalls).toHaveLength(1);
		return responseCalls[0][0];
	}

	beforeEach(() => {
		logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		Response.init(RESPONSE_OPTIONS);
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("preservation", () => {
		it("logs clean field values unchanged in the 13-field layout", () => {
			const message = logResponse();

			expect(message).toBe(buildLine({
				statusCode: 200,
				bytes: 25,
				contentType: "JSON",
				execms: 42,
				clientIp: "203.0.113.10",
				userAgent: "Mozilla/5.0",
				origin: "https://app.example.com",
				referrer: "https://app.example.com/page",
				resource: "GET:items/{itemId}",
				queryKeys: "id&q",
				routeLog: "route:items",
				queryLog: "format=short",
				apiKey: "-"
			}));
			expect(message.split(" | ")).toHaveLength(13);
		});

		it("passes the RESPONSE tag to DebugAndLog.log", () => {
			logResponse();

			expect(logSpy).toHaveBeenCalledTimes(1);
			expect(logSpy.mock.calls[0][1]).toBe("RESPONSE");
		});

		it("leaves statusCode, bytes, contentType, and execms unchanged", () => {
			const fields = logResponse({ execms: 1234 }).split(" | ");

			expect(fields[0]).toBe("200");
			expect(fields[1]).toBe("25");
			expect(fields[2]).toBe("JSON");
			expect(fields[3]).toBe("1234");
		});

		it("keeps the accented character é in the user agent", () => {
			const fields = logResponse({ userAgent: "Café/1.0" }).split(" | ");

			expect(fields[5]).toBe("Café/1.0");
		});

		it("keeps the emoji 😀 in the user agent", () => {
			const fields = logResponse({ userAgent: "Smile/😀/1.0" }).split(" | ");

			expect(fields[5]).toBe("Smile/😀/1.0");
		});

		it("logs a valid client IP unchanged", () => {
			const fields = logResponse({ clientIp: "198.51.100.7" }).split(" | ");

			expect(fields[4]).toBe("198.51.100.7");
		});

		it("keeps spaces inside a field", () => {
			const fields = logResponse({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }).split(" | ");

			expect(fields[5]).toBe("Mozilla/5.0 (X11; Linux x86_64)");
		});

		it.each([
			["userAgent", 5],
			["origin", 6],
			["referrer", 7]
		])("logs a null %s as -", (name, index) => {
			const fields = logResponse({ [name]: null }).split(" | ");

			expect(fields[index]).toBe("-");
			expect(fields).toHaveLength(13);
		});

		it.each([
			["userAgent", 5],
			["origin", 6],
			["referrer", 7]
		])("logs an empty %s as -", (name, index) => {
			const fields = logResponse({ [name]: "" }).split(" | ");

			expect(fields[index]).toBe("-");
			expect(fields).toHaveLength(13);
		});

		it.each([
			["queryKeys", 9],
			["routeLog", 10],
			["queryLog", 11],
			["apiKey", 12]
		])("logs an empty %s as -", (name, index) => {
			const fields = logResponse({ [name]: "" }).split(" | ");

			expect(fields[index]).toBe("-");
			expect(fields).toHaveLength(13);
		});
	});

	describe("fixed behavior", () => {
		describe("pipe character", () => {
			it("removes | from the user agent: 'Mozilla/5.0 | evil' logs as 'Mozilla/5.0  evil'", () => {
				const message = logResponse({ userAgent: "Mozilla/5.0 | evil" });

				expect(message).toBe(buildLine({ ...DEFAULT_FIELDS, userAgent: "Mozilla/5.0  evil", apiKey: "-" }));
				expect(message.split(" | ")).toHaveLength(13);
			});

			it.each([
				["clientIp", 4],
				["origin", 6],
				["referrer", 7],
				["resource", 8],
				["queryKeys", 9],
				["routeLog", 10],
				["queryLog", 11],
				["apiKey", 12]
			])("removes | from %s so the line keeps 13 fields", (name, index) => {
				const fields = logResponse({ [name]: "left|right" }).split(" | ");

				expect(fields).toHaveLength(13);
				expect(fields[index]).toBe("leftright");
			});

			it("logs a user agent made only of | characters as -", () => {
				const fields = logResponse({ userAgent: "|||" }).split(" | ");

				expect(fields[5]).toBe("-");
				expect(fields).toHaveLength(13);
			});

			it("logs an origin made only of | characters as -", () => {
				const fields = logResponse({ origin: "|||" }).split(" | ");

				expect(fields[6]).toBe("-");
				expect(fields).toHaveLength(13);
			});
		});

		describe("control characters", () => {
			it.each([
				["CR", "\r"],
				["LF", "\n"],
				["tab", "\t"],
				["NUL", "\x00"],
				["DEL", "\x7F"]
			])("removes %s from the user agent", (name, char) => {
				const message = logResponse({ userAgent: `Moz${char}illa/5.0` });

				expect(message).toBe(buildLine({ ...DEFAULT_FIELDS, userAgent: "Mozilla/5.0", apiKey: "-" }));
			});

			it("keeps the line on one line when the user agent holds CR and LF", () => {
				const message = logResponse({ userAgent: "Mozilla/5.0\r\n[FAKE] 500 | forged" });

				expect(message).not.toMatch(/[\r\n]/);
				expect(message.split(" | ")).toHaveLength(13);
			});

			it.each([
				["origin", 6],
				["referrer", 7],
				["resource", 8],
				["queryKeys", 9]
			])("removes control characters from %s", (name, index) => {
				const fields = logResponse({ [name]: "a\r\nb\tc\x00d\x7Fe" }).split(" | ");

				expect(fields[index]).toBe("abcde");
				expect(fields).toHaveLength(13);
			});

			it("logs a user agent made only of control characters as -", () => {
				const fields = logResponse({ userAgent: "\r\n\t\x00\x7F" }).split(" | ");

				expect(fields[5]).toBe("-");
			});

			it("keeps é and 😀 while removing a | beside them", () => {
				const fields = logResponse({ userAgent: "é|😀" }).split(" | ");

				expect(fields[5]).toBe("é😀");
			});
		});

		describe("empty and missing values", () => {
			it.each([
				["userAgent", 5],
				["origin", 6],
				["referrer", 7]
			])("logs an undefined %s as -", (name, index) => {
				const fields = logResponse({ [name]: undefined }).split(" | ");

				expect(fields[index]).toBe("-");
				expect(fields).toHaveLength(13);
			});
		});

		describe("client IP", () => {
			it("logs - in field 5 when the client IP is null", () => {
				const message = logResponse({ clientIp: null });
				const fields = message.split(" | ");

				expect(fields[4]).toBe("-");
				expect(fields).toHaveLength(13);
				expect(message).toBe(buildLine({ ...DEFAULT_FIELDS, clientIp: "-", apiKey: "-" }));
			});

			it("logs - when the client IP is undefined", () => {
				const fields = logResponse({ clientIp: undefined }).split(" | ");

				expect(fields[4]).toBe("-");
				expect(fields).toHaveLength(13);
			});

			it("logs - when the client IP is an empty string", () => {
				const fields = logResponse({ clientIp: "" }).split(" | ");

				expect(fields[4]).toBe("-");
				expect(fields).toHaveLength(13);
			});
		});
	});
});
