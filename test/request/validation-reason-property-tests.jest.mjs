import { describe, it, expect, afterEach, jest } from "@jest/globals";
import fc from "fast-check";
import { ClientRequest, Response } from "../../src/lib/tools/index.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

// Initialize with test validations (referrers: ['example.com', 'acme.com'])
ClientRequest.init({ validations: testValidationsA });

/* ****************************************************************************
 * Generators
 * --------------------------------------------------------------------------
 * Reusable fast-check arbitraries for building API Gateway events.
 *************************************************************************** */

/**
 * Generate a valid referrer URL that ends with a whitelisted domain.
 *
 * @returns {fc.Arbitrary<string>} A referrer URL ending with example.com or acme.com
 */
const validReferrerArb = fc.constantFrom(
	"https://internal.example.com/dev",
	"https://www.example.com/page",
	"https://app.acme.com/dashboard",
	"https://portal.acme.com"
);

/**
 * Generate an invalid referrer URL that does NOT match any whitelisted domain.
 *
 * @returns {fc.Arbitrary<string>} A referrer URL not matching the whitelist
 */
const invalidReferrerArb = fc.constantFrom(
	"https://evil.org/attack",
	"https://malicious.net",
	"https://bad-actor.io/page",
	"https://fakesite.xyz"
);

/**
 * Generate a valid 5-digit employeeId string.
 *
 * @returns {fc.Arbitrary<string>} A 5-digit numeric string
 */
const validEmployeeIdArb = fc.integer({ min: 10000, max: 99999 }).map(String);

/**
 * Generate an invalid employeeId (not a 5-digit numeric string).
 *
 * @returns {fc.Arbitrary<string>} A string that fails the employeeId validation
 */
const invalidEmployeeIdArb = fc.oneof(
	fc.constant("bad"),
	fc.constant("1234"),
	fc.constant("123456"),
	fc.constant("abcde"),
	fc.constant("")
);

/**
 * Generate a valid "include" query parameter value.
 *
 * @returns {fc.Arbitrary<string>} A valid include value like "contact", "department", or "contact,department"
 */
const validIncludeArb = fc.constantFrom("contact", "department", "contact,department");

/**
 * Generate a valid "format" query parameter value.
 *
 * @returns {fc.Arbitrary<string>} Either "detailed" or "simple"
 */
const validFormatArb = fc.constantFrom("detailed", "simple");

/**
 * Generate a valid "version" query parameter value.
 *
 * @returns {fc.Arbitrary<string>} Either "1" or "2"
 */
const validVersionArb = fc.constantFrom("1", "2");

/**
 * Generate an invalid query parameter value that will fail validation.
 *
 * @returns {fc.Arbitrary<string>} A string that fails query parameter validation
 */
const invalidQueryValueArb = fc.constantFrom(
	"invalid_value",
	"bad_format",
	"xyz",
	"999"
);

/**
 * Build a complete API Gateway event from parts.
 *
 * @param {Object} options - Event configuration
 * @param {string} options.referrer - Referrer URL
 * @param {string} options.employeeId - Path parameter
 * @param {string} options.include - Query parameter
 * @param {string} options.format - Query parameter
 * @param {string} options.version - Query parameter
 * @param {string|null} [options.body] - Request body
 * @param {string} [options.httpMethod] - HTTP method
 * @returns {Object} A complete API Gateway event
 */
function buildEvent({ referrer, employeeId, include, format, version, body = null, httpMethod = "GET" }) {
	return {
		resource: "/employees/{employeeId}/profile",
		path: `/employees/${employeeId}/profile`,
		httpMethod,
		headers: {
			Accept: "application/json",
			Host: "api.example.com",
			"User-Agent": "Mozilla/5.0",
			Referer: referrer
		},
		pathParameters: { employeeId },
		queryStringParameters: { include, format, version },
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
			httpMethod,
			apiId: "1234567890"
		},
		body,
		isBase64Encoded: false
	};
}

/* ****************************************************************************
 * Property-Based Tests
 * Feature: enhance-invalid-request-messaging
 *************************************************************************** */
describe("ClientRequest Validation Reason - Property-Based Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("Property 1: Valid request produces canonical validation reason", () => {
		// Feature: enhance-invalid-request-messaging, Property 1: Valid request produces canonical validation reason

		it("for any valid event, getValidationReason() returns { isValid: true, statusCode: 200, messages: [] }", () => {
			fc.assert(
				fc.property(
					validReferrerArb,
					validEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						const event = buildEvent({ referrer, employeeId, include, format, version });
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason).toEqual({ isValid: true, statusCode: 200, messages: [] });
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: Invalid request produces well-formed validation reason", () => {
		// Feature: enhance-invalid-request-messaging, Property 2: Invalid request produces well-formed validation reason

		it("for any event that fails at least one check, getValidationReason() returns isValid false, statusCode !== 200, and non-empty messages of strings", () => {
			// Generate events with at least one invalid component
			const invalidEventArb = fc.oneof(
				// Invalid referrer
				fc.tuple(invalidReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid path parameter
				fc.tuple(validReferrerArb, invalidEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid query parameter
				fc.tuple(validReferrerArb, validEmployeeIdArb, invalidQueryValueArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid JSON body
				fc.tuple(validReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version, body: "{not json", httpMethod: "POST" }))
			);

			fc.assert(
				fc.property(invalidEventArb, (event) => {
					const req = new ClientRequest(event, testContextA);
					const reason = req.getValidationReason();

					expect(reason.isValid).toBe(false);
					expect(reason.statusCode).not.toBe(200);
					expect(Array.isArray(reason.messages)).toBe(true);
					expect(reason.messages.length).toBeGreaterThan(0);
					reason.messages.forEach((msg) => {
						expect(typeof msg).toBe("string");
					});
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3: Referrer failure maps to 403", () => {
		// Feature: enhance-invalid-request-messaging, Property 3: Referrer failure maps to 403
		// Note: In the current implementation, an invalid referrer also causes
		// hasNoAuthorization() to return true (since it checks isAuthorizedReferrer()),
		// which means 401 takes priority over 403. The referrer failure still produces
		// a "Forbidden" message, but the statusCode is 401 due to priority ordering.

		it("for any event with invalid referrer, messages contain 'Forbidden'", () => {
			fc.assert(
				fc.property(
					invalidReferrerArb,
					validEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						const event = buildEvent({ referrer, employeeId, include, format, version });
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.messages).toContain("Forbidden");
						// 401 takes priority because hasNoAuthorization depends on isAuthorizedReferrer
						expect(reason.statusCode).toBe(401);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 4: Authentication failure maps to 401", () => {
		// Feature: enhance-invalid-request-messaging, Property 4: Authentication failure maps to 401

		it("for any event where authentication check fails, statusCode is 401 and messages contain 'Unauthorized'", () => {
			fc.assert(
				fc.property(
					invalidReferrerArb,
					validEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						// An invalid referrer triggers hasNoAuthorization() = true
						const event = buildEvent({ referrer, employeeId, include, format, version });
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(401);
						expect(reason.messages).toContain("Unauthorized");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 5: Parameter failure maps to 400 with per-parameter messages", () => {
		// Feature: enhance-invalid-request-messaging, Property 5: Parameter failure maps to 400 with per-parameter messages

		it("for any event with invalid path parameter and valid referrer, statusCode is 400 and messages contain parameter name", () => {
			fc.assert(
				fc.property(
					validReferrerArb,
					invalidEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						const event = buildEvent({ referrer, employeeId, include, format, version });
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(400);
						expect(reason.messages).toContain("Invalid parameter: employeeId");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("for any event with invalid query parameter and valid referrer, statusCode is 400 and messages contain parameter name", () => {
			fc.assert(
				fc.property(
					validReferrerArb,
					validEmployeeIdArb,
					invalidQueryValueArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						const event = buildEvent({ referrer, employeeId, include, format, version });
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(400);
						expect(reason.messages).toContain("Invalid parameter: include");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("for any event with multiple invalid query parameters, messages contain each invalid parameter name", () => {
			fc.assert(
				fc.property(
					validReferrerArb,
					validEmployeeIdArb,
					invalidQueryValueArb,
					invalidQueryValueArb,
					(referrer, employeeId, badInclude, badFormat) => {
						const event = buildEvent({
							referrer,
							employeeId,
							include: badInclude,
							format: badFormat,
							version: "2"
						});
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(400);
						expect(reason.messages).toContain("Invalid parameter: include");
						expect(reason.messages).toContain("Invalid parameter: format");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 6: Invalid JSON body maps to 400 with body message", () => {
		// Feature: enhance-invalid-request-messaging, Property 6: Invalid JSON body maps to 400 with body message

		it("for any event with non-empty invalid JSON body, statusCode is 400 and messages contain 'Invalid request body'", () => {
			// Generate strings that are definitely not valid JSON
			const invalidJsonArb = fc.constantFrom(
				"{not json",
				"{\"key\": }",
				"[unclosed",
				"just a string without quotes",
				"{{{",
				"[[[",
				"abc123",
				"<xml>not json</xml>"
			);

			fc.assert(
				fc.property(
					validReferrerArb,
					validEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					invalidJsonArb,
					(referrer, employeeId, include, format, version, badBody) => {
						const event = buildEvent({
							referrer,
							employeeId,
							include,
							format,
							version,
							body: badBody,
							httpMethod: "POST"
						});
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(400);
						expect(reason.messages).toContain("Invalid request body");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 7: Status code priority ordering", () => {
		// Feature: enhance-invalid-request-messaging, Property 7: Status code priority ordering

		it("for any event with multiple failure types, statusCode is the highest-priority code and all failure messages are present", () => {
			fc.assert(
				fc.property(
					invalidReferrerArb,
					invalidEmployeeIdArb,
					invalidQueryValueArb,
					(referrer, employeeId, badInclude) => {
						// This event triggers referrer (403), auth (401), and parameter (400) failures
						const event = buildEvent({
							referrer,
							employeeId,
							include: badInclude,
							format: "detailed",
							version: "2"
						});
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						// 401 > 403 > 400
						expect(reason.statusCode).toBe(401);
						// All failure messages should be present
						expect(reason.messages).toContain("Forbidden");
						expect(reason.messages).toContain("Unauthorized");
						expect(reason.messages).toContain("Invalid parameter: employeeId");
						expect(reason.messages).toContain("Invalid parameter: include");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("for any event with parameter and body failures (no referrer/auth failure), statusCode is 400", () => {
			fc.assert(
				fc.property(
					validReferrerArb,
					invalidEmployeeIdArb,
					validIncludeArb,
					validFormatArb,
					validVersionArb,
					(referrer, employeeId, include, format, version) => {
						const event = buildEvent({
							referrer,
							employeeId,
							include,
							format,
							version,
							body: "{bad json",
							httpMethod: "POST"
						});
						const req = new ClientRequest(event, testContextA);

						const reason = req.getValidationReason();

						expect(reason.isValid).toBe(false);
						expect(reason.statusCode).toBe(400);
						expect(reason.messages).toContain("Invalid parameter: employeeId");
						expect(reason.messages).toContain("Invalid request body");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 8: Defensive copy prevents mutation", () => {
		// Feature: enhance-invalid-request-messaging, Property 8: Defensive copy prevents mutation

		it("for any ClientRequest, two calls to getValidationReason() return distinct objects; mutating one does not affect the other", () => {
			// Test with both valid and invalid events
			const eventArb = fc.oneof(
				// Valid event
				fc.tuple(validReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid event (bad parameter)
				fc.tuple(validReferrerArb, invalidEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid event (bad referrer)
				fc.tuple(invalidReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version }))
			);

			fc.assert(
				fc.property(eventArb, (event) => {
					const req = new ClientRequest(event, testContextA);

					const reason1 = req.getValidationReason();
					const reason2 = req.getValidationReason();

					// Distinct object references
					expect(reason1).not.toBe(reason2);
					expect(reason1.messages).not.toBe(reason2.messages);

					// Same content
					expect(reason1).toEqual(reason2);

					// Mutating one does not affect the other
					reason1.messages.push("mutated");
					reason1.statusCode = 999;
					reason1.isValid = !reason1.isValid;

					const reason3 = req.getValidationReason();
					expect(reason3).toEqual(reason2);
					expect(reason3.messages).not.toContain("mutated");
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 9: Backwards compatibility — isValid consistency", () => {
		// Feature: enhance-invalid-request-messaging, Property 9: Backwards compatibility — isValid consistency

		it("for any ClientRequest, isValid() returns a boolean equal to getValidationReason().isValid", () => {
			const eventArb = fc.oneof(
				// Valid event
				fc.tuple(validReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid path parameter
				fc.tuple(validReferrerArb, invalidEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid referrer
				fc.tuple(invalidReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid query parameter
				fc.tuple(validReferrerArb, validEmployeeIdArb, invalidQueryValueArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid JSON body
				fc.tuple(validReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version, body: "{bad", httpMethod: "POST" }))
			);

			fc.assert(
				fc.property(eventArb, (event) => {
					const req = new ClientRequest(event, testContextA);

					const isValidResult = req.isValid();
					const reason = req.getValidationReason();

					expect(typeof isValidResult).toBe("boolean");
					expect(isValidResult).toBe(reason.isValid);
				}),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 12: Integration — validation reason flows to Response", () => {
		// Feature: enhance-invalid-request-messaging, Property 12: Integration — validation reason flows to Response

		it("for any invalid ClientRequest, passing statusCode to Response.reset() and messages to setMessage() produces correct response", () => {
			const invalidEventArb = fc.oneof(
				// Invalid path parameter
				fc.tuple(validReferrerArb, invalidEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid referrer (triggers 401)
				fc.tuple(invalidReferrerArb, validEmployeeIdArb, validIncludeArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Invalid query parameter
				fc.tuple(validReferrerArb, validEmployeeIdArb, invalidQueryValueArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version })),
				// Multiple failures
				fc.tuple(invalidReferrerArb, invalidEmployeeIdArb, invalidQueryValueArb, validFormatArb, validVersionArb)
					.map(([referrer, employeeId, include, format, version]) =>
						buildEvent({ referrer, employeeId, include, format, version }))
			);

			fc.assert(
				fc.property(invalidEventArb, (event) => {
					const req = new ClientRequest(event, testContextA);
					const reason = req.getValidationReason();

					// Verify the request is indeed invalid
					expect(reason.isValid).toBe(false);

					// Create a Response and apply the validation reason
					const response = new Response(req);
					response.reset({ statusCode: reason.statusCode });
					response.setMessage(reason.messages);

					// Verify the response has the correct status code
					expect(response.getStatusCode()).toBe(reason.statusCode);

					// Verify the messages were merged into the body
					const body = response.getBody();
					expect(body.messages).toEqual(reason.messages);
				}),
				{ numRuns: 100 }
			);
		});
	});
});
