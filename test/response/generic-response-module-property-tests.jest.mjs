/**
 * Property-based tests for the centralized generic.response.js factory module.
 *
 * Feature: 1-3-10-clean-up-generic-responses
 *
 * Tests correctness properties of createGenericResponseModule using fast-check
 * to generate random inputs and verify structural invariants.
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { createGenericResponseModule } from "../../src/lib/tools/generic.response.js";

const KNOWN_STATUS_CODES = [200, 400, 401, 403, 404, 405, 408, 418, 427, 500];

const EXPECTED_PROPERTIES = [
	"contentType",
	"headers",
	"response200",
	"response400",
	"response401",
	"response403",
	"response404",
	"response405",
	"response408",
	"response418",
	"response427",
	"response500",
	"response"
];

describe("Generic Response Module - Property-Based Tests", () => {

	describe("Property 1: Factory structural completeness", () => {
		// Feature: 1-3-10-clean-up-generic-responses, Property 1: Factory structural completeness

		it("should return a module with all required properties for any content type and body formatter", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(contentType) => {
						const bodyFormatter = (statusCode, message) => message;
						const mod = createGenericResponseModule(contentType, bodyFormatter);

						for (const prop of EXPECTED_PROPERTIES) {
							expect(mod).toHaveProperty(prop);
						}
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should set headers Content-Type to the provided content type string", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(contentType) => {
						const bodyFormatter = (statusCode, message) => message;
						const mod = createGenericResponseModule(contentType, bodyFormatter);

						expect(mod.headers["Content-Type"]).toBe(contentType);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should produce response objects with correct statusCode, headers, and body for any body formatter", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(contentType) => {
						const bodyFormatter = (statusCode, message) => ({ statusCode, message });
						const mod = createGenericResponseModule(contentType, bodyFormatter);

						for (const code of KNOWN_STATUS_CODES) {
							const responseObj = mod["response" + code];
							expect(responseObj.statusCode).toBe(code);
							expect(responseObj.headers).toBe(mod.headers);
							expect(responseObj.body).toEqual({ statusCode: code, message: expect.any(String) });
						}
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should attach response as a function", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(contentType) => {
						const bodyFormatter = (statusCode, message) => message;
						const mod = createGenericResponseModule(contentType, bodyFormatter);

						expect(typeof mod.response).toBe("function");
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Property 5: Body formatter invocation", () => {
		// Feature: 1-3-10-clean-up-generic-responses, Property 5: Body formatter invocation

		it("should call the body formatter exactly once per status code with correct arguments", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1 }),
					(contentType) => {
						const calls = [];
						const trackingFormatter = (statusCode, message) => {
							calls.push({ statusCode, message });
							return message;
						};

						calls.length = 0;
						createGenericResponseModule(contentType, trackingFormatter);

						// Exactly 10 calls (one per status code)
						expect(calls).toHaveLength(10);

						// Each known status code was called exactly once
						const calledCodes = calls.map((c) => c.statusCode).sort((a, b) => a - b);
						expect(calledCodes).toEqual([...KNOWN_STATUS_CODES].sort((a, b) => a - b));

						// Messages match the STATUS_CODE_MAP
						const expectedMessages = {
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

						for (const call of calls) {
							expect(call.message).toBe(expectedMessages[call.statusCode]);
						}
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
