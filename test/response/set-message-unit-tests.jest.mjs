import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Response, ClientRequest } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

describe("Response setMessage() Unit Tests", () => {
	let REQ;
	let logStub;

	ClientRequest.init({ validations: testValidationsA });

	beforeEach(() => {
		logStub = jest.spyOn(console, "log").mockImplementation();

		Response.init({
			jsonResponses: {
				response200: {
					statusCode: 200,
					headers: { "X-Custom-Header": "Custom Value" },
					body: { message: "Hello World" }
				}
			},
			settings: {
				errorExpirationInSeconds: 300,
				routeExpirationInSeconds: 600
			}
		});

		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("setMessage with a string", () => {
		it("should merge { message: str } into JSON body", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 200,
				body: { data: "existing" }
			});

			RESPONSE.setMessage("Invalid parameter: limit");

			const body = RESPONSE.getBody();
			expect(body.message).toBe("Invalid parameter: limit");
			expect(body.data).toBe("existing");
		});
	});

	describe("setMessage with an array", () => {
		it("should merge { messages: arr } into JSON body", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 200,
				body: { data: "existing" }
			});

			RESPONSE.setMessage(["Invalid parameter: limit", "Invalid parameter: offset"]);

			const body = RESPONSE.getBody();
			expect(body.messages).toEqual(["Invalid parameter: limit", "Invalid parameter: offset"]);
			expect(body.data).toBe("existing");
		});
	});

	describe("setMessage does not alter status code or headers", () => {
		it("should preserve status code after setMessage with string", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 400,
				body: { error: "Bad Request" }
			});
			const statusBefore = RESPONSE.getStatusCode();
			const headersBefore = { ...RESPONSE.getHeaders() };

			RESPONSE.setMessage("Forbidden");

			expect(RESPONSE.getStatusCode()).toBe(statusBefore);
			expect(RESPONSE.getHeaders()).toEqual(headersBefore);
		});

		it("should preserve status code after setMessage with array", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 401,
				body: { error: "Unauthorized" }
			});
			const statusBefore = RESPONSE.getStatusCode();
			const headersBefore = { ...RESPONSE.getHeaders() };

			RESPONSE.setMessage(["Unauthorized", "Invalid parameter: id"]);

			expect(RESPONSE.getStatusCode()).toBe(statusBefore);
			expect(RESPONSE.getHeaders()).toEqual(headersBefore);
		});
	});

	describe("setMessage with non-object body is a no-op", () => {
		it("should not alter a string body", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 200,
				body: "<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>"
			});

			RESPONSE.setMessage("This should not appear");

			expect(typeof RESPONSE.getBody()).toBe("string");
			expect(RESPONSE.getBody()).not.toContain("This should not appear");
		});
	});

	describe("setMessage with empty array", () => {
		it("should merge { messages: [] } into body", () => {
			const RESPONSE = new Response(REQ, {
				statusCode: 200,
				body: { data: "existing" }
			});

			RESPONSE.setMessage([]);

			const body = RESPONSE.getBody();
			expect(body.messages).toEqual([]);
			expect(body.data).toBe("existing");
		});
	});
});
