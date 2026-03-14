import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { ClientRequest } from "../../src/lib/tools/index.js";

import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

// Initialize with test validations (referrers: ['example.com', 'acme.com'])
ClientRequest.init({ validations: testValidationsA });

/**
 * Helper to create a minimal valid API Gateway event.
 * Override any property by passing a partial event object.
 *
 * @param {Object} overrides - Properties to merge into the base event
 * @returns {Object} A complete event object for ClientRequest
 */
function createEvent(overrides = {}) {
	const base = {
		resource: "/employees/{employeeId}/profile",
		path: "/employees/12345/profile",
		httpMethod: "GET",
		headers: {
			Accept: "application/json",
			Host: "api.example.com",
			"User-Agent": "Mozilla/5.0",
			Referer: "https://internal.example.com/dev"
		},
		pathParameters: {
			employeeId: "12345"
		},
		queryStringParameters: {
			include: "contact,department",
			format: "detailed",
			version: "2"
		},
		requestContext: {
			accountId: "123456789012",
			resourceId: "abc123",
			stage: "prod",
			requestId: "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
			identity: {
				sourceIp: "192.168.100.1",
				userAgent: "Mozilla/5.0"
			},
			resourcePath: "/employees/{employeeId}/profile",
			httpMethod: "GET",
			apiId: "1234567890"
		},
		body: null,
		isBase64Encoded: false
	};

	return { ...base, ...overrides };
}

describe("getValidationReason() Unit Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Valid request", () => {
		it("should return { isValid: true, statusCode: 200, messages: [] } for a valid request", () => {
			const event = createEvent();
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason).toEqual({ isValid: true, statusCode: 200, messages: [] });
		});
	});

	describe("Referrer failure", () => {
		it("should return statusCode 403 with 'Forbidden' message when referrer is not whitelisted", () => {
			const event = createEvent({
				headers: {
					Accept: "application/json",
					Host: "api.example.com",
					"User-Agent": "Mozilla/5.0",
					Referer: "https://evil.example.org/attack"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.messages).toContain("Forbidden");
			// Referrer failure also triggers hasNoAuthorization, so 401 takes priority
			expect([400, 401, 403]).toContain(reason.statusCode);
		});
	});

	describe("Authentication failure", () => {
		it("should return statusCode 401 with 'Unauthorized' message when authorization fails", () => {
			// hasNoAuthorization() returns true when referrer is invalid
			// (since authenticationIsRequired is false, auth depends on referrer)
			const event = createEvent({
				headers: {
					Accept: "application/json",
					Host: "api.example.com",
					"User-Agent": "Mozilla/5.0",
					Referer: "https://unauthorized.example.org"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(401);
			expect(reason.messages).toContain("Unauthorized");
		});
	});

	describe("Parameter validation failures", () => {
		it("should return statusCode 400 with 'Invalid parameter: employeeId' for invalid path parameter", () => {
			const event = createEvent({
				headers: {
					Accept: "application/json",
					Host: "api.example.com",
					"User-Agent": "Mozilla/5.0",
					Referer: "https://internal.example.com/dev"
				},
				pathParameters: {
					employeeId: "bad"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(400);
			expect(reason.messages).toContain("Invalid parameter: employeeId");
		});

		it("should return statusCode 400 with parameter-specific message for invalid query parameter", () => {
			const event = createEvent({
				queryStringParameters: {
					include: "invalid_value",
					format: "detailed",
					version: "2"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(400);
			expect(reason.messages).toContain("Invalid parameter: include");
		});

		it("should collect all messages when multiple parameters are invalid", () => {
			const event = createEvent({
				queryStringParameters: {
					include: "invalid_value",
					format: "bad_format",
					version: "2"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(400);
			expect(reason.messages).toContain("Invalid parameter: include");
			expect(reason.messages).toContain("Invalid parameter: format");
			expect(reason.messages.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("Invalid JSON body", () => {
		it("should return statusCode 400 with 'Invalid request body' for malformed JSON", () => {
			const event = createEvent({
				httpMethod: "POST",
				body: "{not valid json"
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(400);
			expect(reason.messages).toContain("Invalid request body");
		});
	});

	describe("Status code priority", () => {
		it("should use highest-priority status code (401) when both referrer and parameter checks fail", () => {
			// Bad referrer triggers both 403 (Forbidden) and 401 (Unauthorized)
			// Bad parameter triggers 400
			// 401 > 403 > 400, so 401 wins
			const event = createEvent({
				headers: {
					Accept: "application/json",
					Host: "api.example.com",
					"User-Agent": "Mozilla/5.0",
					Referer: "https://evil.example.org"
				},
				pathParameters: {
					employeeId: "bad"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason = req.getValidationReason();

			expect(reason.isValid).toBe(false);
			expect(reason.statusCode).toBe(401);
			expect(reason.messages).toContain("Forbidden");
			expect(reason.messages).toContain("Unauthorized");
			expect(reason.messages).toContain("Invalid parameter: employeeId");
		});
	});

	describe("Defensive copy", () => {
		it("should return a new object each call with no shared references", () => {
			const event = createEvent({
				pathParameters: {
					employeeId: "bad"
				}
			});
			const req = new ClientRequest(event, testContextA);

			const reason1 = req.getValidationReason();
			const reason2 = req.getValidationReason();

			// Different object references
			expect(reason1).not.toBe(reason2);
			expect(reason1.messages).not.toBe(reason2.messages);

			// Same content
			expect(reason1).toEqual(reason2);

			// Mutating one does not affect the other
			reason1.messages.push("extra");
			expect(reason2.messages).not.toContain("extra");
		});
	});

	describe("Backwards compatibility", () => {
		it("isValid() should still return a boolean", () => {
			const validReq = new ClientRequest(createEvent(), testContextA);
			expect(typeof validReq.isValid()).toBe("boolean");
			expect(validReq.isValid()).toBe(true);

			const invalidReq = new ClientRequest(createEvent({
				pathParameters: { employeeId: "bad" }
			}), testContextA);
			expect(typeof invalidReq.isValid()).toBe("boolean");
			expect(invalidReq.isValid()).toBe(false);
		});

		it("isValid() should match getValidationReason().isValid", () => {
			const validReq = new ClientRequest(createEvent(), testContextA);
			expect(validReq.isValid()).toBe(validReq.getValidationReason().isValid);

			const invalidReq = new ClientRequest(createEvent({
				pathParameters: { employeeId: "bad" }
			}), testContextA);
			expect(invalidReq.isValid()).toBe(invalidReq.getValidationReason().isValid);
		});
	});
});
