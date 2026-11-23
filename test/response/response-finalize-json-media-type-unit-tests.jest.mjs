/**
 * Test: Response.finalize() and Response.getContentTypeCode() with JSON media types (unit tests)
 *
 * Feature: 1-4-2-response-generic-template-content-type-header-is-ignored
 *
 * Purpose: Verify that finalize() serializes the body as JSON when the Content-Type header is
 * a JSON media type (application/json, with or without parameters or case differences, or a
 * "+json" type such as application/problem+json), and keeps sending `${body}` for every other
 * header value, including values that are not strings (Requirements 3.1 to 3.6). Verify that
 * getContentTypeCode() matches by media type, returns undefined for a header that is not a
 * string without throwing, and that the response log line keeps its 13 fields (Requirements
 * 4.1 to 4.6; SEC-REQ-4.2-SEM-248-1, SEC-REQ-4.2-SEM-248-2).
 *
 * Setup:
 * - ClientRequest.init() once at the top of the file
 * - Response.init() is called once per file, at module level, with settings only. The default
 *   generic templates are used (no template option)
 * - Custom Content-Type values are set with addHeader() AFTER construction and AFTER setBody(),
 *   because setBody() re-infers Content-Type. The tests therefore exercise finalize() and
 *   getContentTypeCode() on their own, independent of how the constructor treats a header
 * - A new ClientRequest is created for each test that calls finalize()
 * - DebugAndLog.log and DebugAndLog.warn are spied on and silenced in beforeEach; the log spy is
 *   read to inspect the response log line
 * - No process.env change, no real AWS call, no child process
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Related Tests:
 * - test/response/response-template-content-type-unit-tests.jest.mjs (file A)
 * - test/response/response-content-type-header-unit-tests.jest.mjs (file B)
 * - test/response/response-template-content-type-property-tests.jest.mjs (file D)
 * - test/response/response-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

const DebugAndLog = (await import("../../src/lib/tools/DebugAndLog.class.js")).default;

ClientRequest.init({ validations: testValidationsA });

// The single Response.init() call of this file. Settings only, default templates.
Response.init({
	settings: {
		errorExpirationInSeconds: 180,
		routeExpirationInSeconds: 0
	}
});

const JSON_FAMILY = [
	"application/problem+json",
	"application/vnd.api+json",
	"application/json; charset=utf-8",
	"APPLICATION/JSON"
];

const OBJECT_BODY = { id: 7, name: "widget" };
const ARRAY_BODY = [1, "two", { three: 3 }];

describe("Response finalize() and getContentTypeCode() with JSON media types", () => {
	let REQ;
	let logSpy;

	/**
	 * Build a response with the given body, then set the Content-Type header.
	 * The header is set after setBody() because setBody() re-infers Content-Type.
	 *
	 * @param {*} body - Body to set
	 * @param {*} contentType - Value for the Content-Type header
	 * @returns {Response} Response ready for finalize() or getContentTypeCode()
	 */
	function buildResponse(body, contentType) {
		const response = new Response(REQ, { statusCode: 200 });
		response.setBody(body);
		response.addHeader("Content-Type", contentType);
		return response;
	}

	/**
	 * Read the message of the last response log line written through DebugAndLog.log().
	 *
	 * @returns {string} Log message
	 */
	function lastResponseLogMessage() {
		const calls = logSpy.mock.calls.filter((call) => call[1] === "RESPONSE");
		expect(calls.length).toBeGreaterThan(0);
		return calls[calls.length - 1][0];
	}

	beforeEach(() => {
		logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => Promise.resolve());
		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("JSON family", () => {
		for (const header of JSON_FAMILY) {
			describe(`Content-Type ${header}`, () => {
				it("stringifies an object body", () => {
					const result = buildResponse({ ...OBJECT_BODY }, header).finalize();
					expect(result.body).toBe(JSON.stringify(OBJECT_BODY));
				});

				it("stringifies an array body", () => {
					const result = buildResponse([...ARRAY_BODY], header).finalize();
					expect(result.body).toBe(JSON.stringify(ARRAY_BODY));
				});

				it("places a string body in an array", () => {
					const result = buildResponse("x", header).finalize();
					expect(result.body).toBe("[\"x\"]");
				});

				it("places a number body in an array", () => {
					const result = buildResponse(5, header).finalize();
					expect(result.body).toBe("[5]");
				});
			});
		}
	});

	describe("application/json is unchanged", () => {
		const header = "application/json";

		it("stringifies an object body", () => {
			const result = buildResponse({ ...OBJECT_BODY }, header).finalize();
			expect(result.body).toBe(JSON.stringify(OBJECT_BODY));
		});

		it("stringifies an array body", () => {
			const result = buildResponse([...ARRAY_BODY], header).finalize();
			expect(result.body).toBe(JSON.stringify(ARRAY_BODY));
		});

		it("places a string body in an array", () => {
			const result = buildResponse("x", header).finalize();
			expect(result.body).toBe("[\"x\"]");
		});

		it("places a number body in an array", () => {
			const result = buildResponse(5, header).finalize();
			expect(result.body).toBe("[5]");
		});

		it("keeps a null body as null", () => {
			const response = new Response(REQ, { statusCode: 200 });
			response.setBodyToNull();
			response.addHeader("Content-Type", header);
			const result = response.finalize();
			expect(result.body).toBeNull();
		});
	});

	describe("headers that are not a JSON media type send the body as text", () => {
		for (const header of ["application/atom+xml", "text/html", "application/xml"]) {
			describe(`Content-Type ${header}`, () => {
				it("sends a string body as it is", () => {
					const result = buildResponse("<entry>one</entry>", header).finalize();
					expect(result.body).toBe("<entry>one</entry>");
				});

				it("sends an object body as [object Object] (today's behavior)", () => {
					const result = buildResponse({ ...OBJECT_BODY }, header).finalize();
					expect(result.body).toBe("[object Object]");
				});
			});
		}
	});

	describe("header values that are not strings", () => {
		for (const header of [42, null]) {
			it(`does not throw for the header ${String(header)} and sends a string body as text`, () => {
				const response = buildResponse("plain text", header);
				let result;
				expect(() => {
					result = response.finalize();
				}).not.toThrow();
				expect(result.body).toBe("plain text");
				expect(result.statusCode).toBe(200);
			});
		}
	});

	describe("the Content-Type header value is not changed by finalize()", () => {
		it("returns the value it was given", () => {
			const result = buildResponse({ ...OBJECT_BODY }, "application/problem+json").finalize();
			expect(result.headers["Content-Type"]).toBe("application/problem+json");
		});

		it("returns a value with parameters and case exactly as given", () => {
			const result = buildResponse({ ...OBJECT_BODY }, "Application/JSON; charset=UTF-8").finalize();
			expect(result.headers["Content-Type"]).toBe("Application/JSON; charset=UTF-8");
		});

		it("adds the header only when the key is absent", () => {
			const response = new Response(REQ, { statusCode: 200 });
			response.setBody({ ...OBJECT_BODY });
			delete response.getHeaders()["Content-Type"];
			const result = response.finalize();
			expect(result.headers["Content-Type"]).toBe("application/json");
			expect(result.body).toBe(JSON.stringify(OBJECT_BODY));
		});
	});

	describe("a body of 404 resets to the 404 template", () => {
		it("gives the same result for a +json header as for application/json", () => {
			const expected = buildResponse(404, "application/json").finalize();
			const result = buildResponse(404, "application/problem+json").finalize();

			expect(expected.statusCode).toBe(404);
			expect(result.statusCode).toBe(404);
			expect(result.body).toBe(expected.body);
			expect(result.body).toBe(JSON.stringify(Response.getGenericResponses("JSON").response404.body));
		});
	});

	describe("getContentTypeCode()", () => {
		const cases = [
			["application/json", "JSON"],
			["application/json; charset=utf-8", "JSON"],
			["application/problem+json", "JSON"],
			["text/html", "HTML"],
			["text/html; charset=utf-8", "HTML"],
			["text/css", "CSS"],
			["application/atom+xml", undefined]
		];

		for (const [header, code] of cases) {
			it(`returns ${String(code)} for ${header}`, () => {
				const response = buildResponse("body", header);
				expect(response.getContentTypeCode()).toBe(code);
			});
		}

		it("returns undefined without throwing for a header that is a number", () => {
			const response = buildResponse("body", 42);
			let code = "not-called";
			expect(() => {
				code = response.getContentTypeCode();
			}).not.toThrow();
			expect(code).toBeUndefined();
		});
	});

	describe("response log line", () => {
		it("has 13 fields and names HTML in the third for text/html", () => {
			buildResponse("<html><body>ok</body></html>", "text/html").finalize();

			const fields = lastResponseLogMessage().split(" | ");
			expect(fields).toHaveLength(13);
			expect(fields[2]).toBe("HTML");
		});

		it("has 13 fields and names JSON in the third for application/problem+json", () => {
			buildResponse({ ...OBJECT_BODY }, "application/problem+json").finalize();

			const fields = lastResponseLogMessage().split(" | ");
			expect(fields).toHaveLength(13);
			expect(fields[2]).toBe("JSON");
		});

		it("has 13 fields for a default JSON response", () => {
			buildResponse({ ...OBJECT_BODY }, "application/json").finalize();

			const fields = lastResponseLogMessage().split(" | ");
			expect(fields).toHaveLength(13);
			expect(fields[2]).toBe("JSON");
		});
	});
});
