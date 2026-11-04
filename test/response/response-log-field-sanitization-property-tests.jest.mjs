/**
 * Property tests: RESPONSE log line field sanitization
 *
 * Feature: 1-4-1-trusted-client-ip
 *
 * Properties 7 and 8 from the spec's design.md "Correctness properties".
 *
 * - Property 7 (Thirteen fields): whatever the nine request-derived fields
 *   contain, the RESPONSE line splits on " | " into exactly 13 parts, and the
 *   nine request-derived parts hold no "|" and no control character.
 * - Property 8 (The sanitizer removes exactly the listed characters): a logged
 *   field equals the input with "|" and control characters (0x00-0x1F, 0x7F)
 *   removed, or "-" when nothing is left.
 *
 * Setup:
 * - ClientRequest.init() and Response.init() once per test, with the options
 *   test/response/response-tests.jest.mjs uses.
 * - DebugAndLog.log is spied (and silenced) to capture the logged message.
 * - The ClientRequest getters are spied to inject the field values.
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach.
 *
 * Notes:
 * - No child processes. No `seed` option: the global FC_SEED hook applies.
 * - Generators are not filtered on the asserted predicates. The alphabet is
 *   fixed and every draw is a legal input.
 * - These properties are expected to FAIL on the code before the sanitizer is
 *   added (the shrunk counterexample contains "|" or a control character).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { Response, ClientRequest, DebugAndLog } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

ClientRequest.init({ validations: testValidationsA });

/** Number of fields in a RESPONSE log line (including the leading status code). */
const FIELD_COUNT = 13;

/** Index of the user agent field within the split RESPONSE line. */
const USER_AGENT_INDEX = 5;

/** Index of the first request-derived field (client IP) within the split line. */
const FIRST_REQUEST_FIELD_INDEX = 4;

/** Alphabet from design.md: plain, delimiter, whitespace, control, and non-ASCII characters. */
const logFieldArb = fc.string({
	unit: fc.constantFrom("a", "Z", "0", " ", "|", "\r", "\n", "\t", "\x00", "\x7F", "é", "😀"),
	maxLength: 30
});

/**
 * Reference model for Property 8. Filters an array of code points; the
 * implementation builds a string in a loop, so they share the rule, not the code.
 *
 * @param {string} text - Input value
 * @returns {string} Input without "|" and control characters, or "-" when empty
 */
function modelSanitize(text) {
	const kept = [...text]
		.filter((char) => char !== "|" && char.charCodeAt(0) > 0x1F && char.charCodeAt(0) !== 0x7F)
		.join("");
	return (kept === "" ? "-" : kept);
}

describe("RESPONSE log field sanitization properties", () => {
	let REQ;
	let logSpy;
	let spies;

	beforeEach(() => {
		jest.spyOn(console, "log").mockImplementation(() => {});

		Response.init({
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
		});

		REQ = new ClientRequest(testEventA, testContextA);

		logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => {});
		spies = {
			ip: jest.spyOn(REQ, "getClientIp"),
			userAgent: jest.spyOn(REQ, "getClientUserAgent"),
			origin: jest.spyOn(REQ, "getClientOrigin"),
			referrer: jest.spyOn(REQ, "getClientReferrer"),
			requestLog: jest.spyOn(REQ, "getRequestLog")
		};
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	/**
	 * Set the nine request-derived field values, finalize a Response, and
	 * return the RESPONSE message handed to DebugAndLog.log.
	 *
	 * @param {Array<string>} values - [ip, userAgent, origin, referrer, resource, queryKeys, routeLog, queryLog, apiKey]
	 * @returns {string} The logged RESPONSE message
	 */
	function logWithFields(values) {
		const [ip, userAgent, origin, referrer, resource, queryKeys, routeLog, queryLog, apiKey] = values;

		spies.ip.mockReturnValue(ip);
		spies.userAgent.mockReturnValue(userAgent);
		spies.origin.mockReturnValue(origin);
		spies.referrer.mockReturnValue(referrer);
		spies.requestLog.mockReturnValue({ resource, queryKeys, routeLog, queryLog, apiKey });
		logSpy.mockClear();

		const response = new Response(REQ);
		response.finalize();

		const responseCalls = logSpy.mock.calls.filter((call) => call[1] === "RESPONSE");
		expect(responseCalls).toHaveLength(1);
		return responseCalls[0][0];
	}

	/**
	 * Property 7: Thirteen fields
	 *
	 * For any nine strings from the alphabet, the RESPONSE message splits on
	 * " | " into exactly 13 parts, and parts 5 to 13 contain no "|" and no
	 * character below 0x20 or equal to 0x7F.
	 *
	 * **Validates: Requirements 8.1, 8.3, 8.6**
	 */
	it("Property 7: the RESPONSE line always has thirteen fields with clean request-derived parts", () => {
		fc.assert(
			fc.property(fc.array(logFieldArb, { minLength: 9, maxLength: 9 }), (values) => {
				const message = logWithFields(values);
				const parts = message.split(" | ");

				expect(parts).toHaveLength(FIELD_COUNT);

				for (const part of parts.slice(FIRST_REQUEST_FIELD_INDEX)) {
					expect(part).not.toContain("|");
					for (const char of part) {
						const code = char.charCodeAt(0);
						expect(code > 0x1F && code !== 0x7F).toBe(true);
					}
				}
			}),
			{ numRuns: 500 }
		);
	}, 60000);

	/**
	 * Property 8: The sanitizer removes exactly the listed characters
	 *
	 * For any string s from the alphabet, the logged user agent field equals
	 * the model: s without "|" and control characters, or "-" when empty.
	 *
	 * **Validates: Requirements 8.2, 8.3**
	 */
	it("Property 8: a logged field equals the input without '|' and control characters, or '-' when empty", () => {
		fc.assert(
			fc.property(logFieldArb, (text) => {
				const message = logWithFields(["198.51.100.10", text, "-", "-", "GET:items", "id", "-", "-", "-"]);
				const parts = message.split(" | ");

				// A field that still holds "|" would shift the parts; the length check
				// keeps the failure message pointing at the shifted line.
				expect(parts).toHaveLength(FIELD_COUNT);
				expect(parts[USER_AGENT_INDEX]).toBe(modelSanitize(text));
			}),
			{ numRuns: 200 }
		);
	}, 60000);
});
