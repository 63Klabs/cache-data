import { describe, it, expect } from "@jest/globals";
import { ApiRequest } from "../../src/lib/tools/index.js";

describe("ApiRequest Response Format Unit Tests", () => {

	// ── format() ────────────────────────────────────────────────────────

	describe("format()", () => {
		it("should return correct defaults when called with no arguments", () => {
			const result = ApiRequest.format();
			expect(result).toEqual({
				success: false,
				statusCode: 0,
				message: null,
				headers: null,
				body: null
			});
		});

		it("should return exact values when called with all properties", () => {
			const result = ApiRequest.format({
				success: true,
				statusCode: 201,
				message: "Created",
				headers: { "Content-Type": "application/json" },
				body: { id: 42 }
			});
			expect(result).toEqual({
				success: true,
				statusCode: 201,
				message: "Created",
				headers: { "Content-Type": "application/json" },
				body: { id: 42 }
			});
		});

		it("should use defaults for omitted properties (partial object)", () => {
			const result = ApiRequest.format({ statusCode: 404, message: "Not Found" });
			expect(result).toEqual({
				success: false,
				statusCode: 404,
				message: "Not Found",
				headers: null,
				body: null
			});
		});

		it("should use defaults when only body is provided", () => {
			const result = ApiRequest.format({ body: "hello" });
			expect(result).toEqual({
				success: false,
				statusCode: 0,
				message: null,
				headers: null,
				body: "hello"
			});
		});
	});

	// ── success() ───────────────────────────────────────────────────────

	describe("success()", () => {
		it("should return success-specific defaults when called with no arguments", () => {
			const result = ApiRequest.success();
			expect(result).toEqual({
				success: true,
				statusCode: 200,
				message: "SUCCESS",
				headers: null,
				body: null
			});
		});

		it("should allow overriding statusCode", () => {
			const result = ApiRequest.success({ statusCode: 201 });
			expect(result).toEqual({
				success: true,
				statusCode: 201,
				message: "SUCCESS",
				headers: null,
				body: null
			});
		});

		it("should allow overriding body with an object", () => {
			const result = ApiRequest.success({ body: { id: 1, name: "item" } });
			expect(result).toEqual({
				success: true,
				statusCode: 200,
				message: "SUCCESS",
				headers: null,
				body: { id: 1, name: "item" }
			});
		});

		it("should allow overriding multiple properties at once", () => {
			const result = ApiRequest.success({
				statusCode: 202,
				message: "Accepted",
				headers: { "X-Request-Id": "abc-123" },
				body: "OK"
			});
			expect(result).toEqual({
				success: true,
				statusCode: 202,
				message: "Accepted",
				headers: { "X-Request-Id": "abc-123" },
				body: "OK"
			});
		});
	});

	// ── error() ─────────────────────────────────────────────────────────

	describe("error()", () => {
		it("should return error-specific defaults when called with no arguments", () => {
			const result = ApiRequest.error();
			expect(result).toEqual({
				success: false,
				statusCode: 500,
				message: "ERROR",
				headers: null,
				body: null
			});
		});

		it("should allow overriding statusCode and message", () => {
			const result = ApiRequest.error({ statusCode: 404, message: "Not Found" });
			expect(result).toEqual({
				success: false,
				statusCode: 404,
				message: "Not Found",
				headers: null,
				body: null
			});
		});

		it("should allow overriding body with an error details object", () => {
			const result = ApiRequest.error({ body: { error: "validation_failed", fields: ["email"] } });
			expect(result).toEqual({
				success: false,
				statusCode: 500,
				message: "ERROR",
				headers: null,
				body: { error: "validation_failed", fields: ["email"] }
			});
		});

		it("should allow overriding all properties", () => {
			const result = ApiRequest.error({
				success: true,
				statusCode: 503,
				message: "Service Unavailable",
				headers: { "Retry-After": "120" },
				body: "try again later"
			});
			expect(result).toEqual({
				success: true,
				statusCode: 503,
				message: "Service Unavailable",
				headers: { "Retry-After": "120" },
				body: "try again later"
			});
		});
	});

	// ── apiGateway() ────────────────────────────────────────────────────

	describe("apiGateway()", () => {
		it("should return an object with exactly three properties: statusCode, headers, body", () => {
			const result = ApiRequest.apiGateway();
			const keys = Object.keys(result);
			expect(keys).toEqual(["statusCode", "headers", "body"]);
			expect(keys).toHaveLength(3);
		});

		it("should stringify object bodies with JSON.stringify()", () => {
			const bodyObj = { id: 1, name: "test" };
			const result = ApiRequest.apiGateway({ statusCode: 200, body: bodyObj });
			expect(result.body).toBe(JSON.stringify(bodyObj));
			expect(typeof result.body).toBe("string");
		});

		it("should pass string bodies through unchanged", () => {
			const result = ApiRequest.apiGateway({ statusCode: 200, body: "plain text" });
			expect(result.body).toBe("plain text");
		});

		it("should pass null bodies through unchanged", () => {
			const result = ApiRequest.apiGateway({ statusCode: 200, body: null });
			expect(result.body).toBeNull();
		});

		it("should not include success or message properties", () => {
			const result = ApiRequest.apiGateway({
				success: true,
				statusCode: 200,
				message: "SUCCESS",
				headers: null,
				body: null
			});
			expect(result).not.toHaveProperty("success");
			expect(result).not.toHaveProperty("message");
		});

		it("should preserve statusCode and headers from input", () => {
			const headers = { "Content-Type": "application/json", "X-Request-Id": "abc" };
			const result = ApiRequest.apiGateway({ statusCode: 201, headers });
			expect(result.statusCode).toBe(201);
			expect(result.headers).toEqual(headers);
		});
	});

	// ── responseFormat() (refactored) ───────────────────────────────────

	describe("responseFormat() refactored delegation", () => {
		it("should return correct defaults when called with no arguments", () => {
			const result = ApiRequest.responseFormat();
			expect(result).toEqual({
				success: false,
				statusCode: 0,
				message: null,
				headers: null,
				body: null
			});
		});

		it("should produce identical output to format() for all arguments", () => {
			const args = [true, 200, "OK", { "Content-Type": "text/html" }, { data: "value" }];
			const fromResponseFormat = ApiRequest.responseFormat(...args);
			const fromFormat = ApiRequest.format({
				success: args[0],
				statusCode: args[1],
				message: args[2],
				headers: args[3],
				body: args[4]
			});
			expect(fromResponseFormat).toEqual(fromFormat);
		});

		it("should produce identical output to format() with partial arguments", () => {
			const fromResponseFormat = ApiRequest.responseFormat(true, 201);
			const fromFormat = ApiRequest.format({ success: true, statusCode: 201 });
			expect(fromResponseFormat).toEqual(fromFormat);
		});

		it("should produce identical output to format() with only body", () => {
			const fromResponseFormat = ApiRequest.responseFormat(false, 0, null, null, "body text");
			const fromFormat = ApiRequest.format({ body: "body text" });
			expect(fromResponseFormat).toEqual(fromFormat);
		});

		it("should produce identical output to format() for error-like arguments", () => {
			const fromResponseFormat = ApiRequest.responseFormat(false, 500, "Internal Server Error", null, null);
			const fromFormat = ApiRequest.format({ success: false, statusCode: 500, message: "Internal Server Error" });
			expect(fromResponseFormat).toEqual(fromFormat);
		});
	});
});
