/**
 * Bug Condition Exploration Property Tests
 * 
 * Property 1: Bug Condition — Application-Set Cache Headers Overwritten by finalize()
 * 
 * Purpose: Surface counterexamples that demonstrate the bug exists on UNFIXED code.
 * These tests encode the EXPECTED (correct) behavior. They will FAIL on unfixed code
 * because finalize() unconditionally overwrites application-set Cache-Control and Expires
 * headers with config-derived defaults.
 * 
 * After the fix is applied, these same tests should PASS, confirming the bug is resolved.
 * 
 * Scoped PBT Approach: Inputs are scoped to where isBugCondition(input) is true —
 * the application has pre-set Cache-Control and/or Expires headers via addHeader()
 * before calling finalize(), and finalize() enters either the error path (status >= 400)
 * or the success path (status < 400 with routeExpirationInSeconds > 0).
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { Response, ClientRequest } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

// Arbitrary for non-empty Cache-Control header values
const cacheControlArb = fc.oneof(
	fc.constant("no-store"),
	fc.constant("no-cache"),
	fc.constant("max-age=5"),
	fc.constant("max-age=0"),
	fc.constant("private, max-age=60"),
	fc.constant("public, max-age=31536000"),
	fc.constant("s-maxage=120"),
	fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0'))
);

// Arbitrary for non-empty Expires header values
const expiresArb = fc.oneof(
	fc.constant("Thu, 01 Jan 1970 00:00:00 GMT"),
	fc.constant("Fri, 31 Dec 9999 23:59:59 GMT"),
	fc.constant("Wed, 09 Jun 2021 10:18:14 GMT"),
	fc.constant("0"),
	fc.constant("-1"),
	fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0'))
);

// Arbitrary for error status codes (>= 400)
const errorStatusArb = fc.integer({ min: 400, max: 599 });

// Arbitrary for success status codes (200-399)
const successStatusArb = fc.integer({ min: 200, max: 399 });

// Arbitrary for positive route expiration (triggers success path cache headers)
const positiveExpirationArb = fc.integer({ min: 1, max: 86400 });

describe("Bug Condition Exploration: Cache Header Override", () => {
	let REQ;
	let logStub;

	ClientRequest.init({ validations: testValidationsA });

	beforeEach(() => {
		logStub = jest.spyOn(console, 'log').mockImplementation();

		Response.init({
			settings: {
				errorExpirationInSeconds: 180,
				routeExpirationInSeconds: 3600
			}
		});

		REQ = new ClientRequest(testEventA, testContextA);
	});

	afterEach(() => {
		REQ = null;
		jest.restoreAllMocks();
	});

	describe("Error Path (status >= 400): Both headers pre-set", () => {
		it("Property: Application-set Cache-Control is preserved after finalize()", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					errorStatusArb,
					(cacheControlValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Application-set Expires is preserved after finalize()", () => {
			fc.assert(
				fc.property(
					expiresArb,
					errorStatusArb,
					(expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Expires"]).toBe(expiresValue);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Both Cache-Control and Expires are preserved after finalize()", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					expiresArb,
					errorStatusArb,
					(cacheControlValue, expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
						expect(result.headers["Expires"]).toBe(expiresValue);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Success Path (status < 400, routeExpirationInSeconds > 0): Both headers pre-set", () => {
		it("Property: Application-set Cache-Control is preserved after finalize()", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					successStatusArb,
					(cacheControlValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Application-set Expires is preserved after finalize()", () => {
			fc.assert(
				fc.property(
					expiresArb,
					successStatusArb,
					(expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Expires"]).toBe(expiresValue);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Both Cache-Control and Expires are preserved after finalize()", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					expiresArb,
					successStatusArb,
					(cacheControlValue, expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
						expect(result.headers["Expires"]).toBe(expiresValue);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Partial Pre-Set: Only Cache-Control set", () => {
		it("Property: Application-set Cache-Control is preserved, Expires gets config default (error path)", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					errorStatusArb,
					(cacheControlValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);

						const result = RESPONSE.finalize();

						// Cache-Control should be preserved
						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
						// Expires should be set from config (errorExpirationInSeconds)
						expect(result.headers["Expires"]).toBeDefined();
						expect(typeof result.headers["Expires"]).toBe("string");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Application-set Cache-Control is preserved, Expires gets config default (success path)", () => {
			fc.assert(
				fc.property(
					cacheControlArb,
					successStatusArb,
					(cacheControlValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Cache-Control", cacheControlValue);

						const result = RESPONSE.finalize();

						// Cache-Control should be preserved
						expect(result.headers["Cache-Control"]).toBe(cacheControlValue);
						// Expires should be set from config (routeExpirationInSeconds)
						expect(result.headers["Expires"]).toBeDefined();
						expect(typeof result.headers["Expires"]).toBe("string");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Partial Pre-Set: Only Expires set", () => {
		it("Property: Application-set Expires is preserved, Cache-Control gets config default (error path)", () => {
			fc.assert(
				fc.property(
					expiresArb,
					errorStatusArb,
					(expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						// Expires should be preserved
						expect(result.headers["Expires"]).toBe(expiresValue);
						// Cache-Control should be set from config (errorExpirationInSeconds)
						expect(result.headers["Cache-Control"]).toBeDefined();
						expect(typeof result.headers["Cache-Control"]).toBe("string");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: Application-set Expires is preserved, Cache-Control gets config default (success path)", () => {
			fc.assert(
				fc.property(
					expiresArb,
					successStatusArb,
					(expiresValue, statusCode) => {
						const RESPONSE = new Response(REQ);
						RESPONSE.setStatusCode(statusCode);
						RESPONSE.addHeader("Expires", expiresValue);

						const result = RESPONSE.finalize();

						// Expires should be preserved
						expect(result.headers["Expires"]).toBe(expiresValue);
						// Cache-Control should be set from config (routeExpirationInSeconds)
						expect(result.headers["Cache-Control"]).toBeDefined();
						expect(typeof result.headers["Cache-Control"]).toBe("string");
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
