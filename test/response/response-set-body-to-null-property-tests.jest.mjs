/**
 * Test: Response.setBodyToNull() and falsy setBody() values (property tests)
 *
 * Feature: 1-4-1-response-setbody-null-is-ignored-so-a-response
 *
 * Purpose: Verify two properties across generated inputs.
 * - Property 1: a body set to null with setBodyToNull() stays null through finalize(),
 *   and the status code is unchanged.
 * - Property 2: setBody() with a falsy value (null, undefined, "", 0, false) never replaces
 *   the current body. Property 2 pins the compatibility decision that setBody(null) is
 *   ignored; changing it is a deliberate, versioned change.
 *
 * Setup:
 * - ClientRequest.init() once with the shared test validations
 * - Response.init() in beforeEach with the settings used by the other response tests
 * - DebugAndLog.log is spied on so finalize() writes no log line
 *
 * Teardown:
 * - jest.restoreAllMocks() in afterEach
 *
 * Known Issues:
 * - None. No child process is spawned.
 *
 * Related Tests:
 * - test/response/response-set-body-to-null-unit-tests.jest.mjs
 * - test/response/set-message-property-tests.jest.mjs
 *
 * **Validates: Requirements 5.3, 5.7**
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { Response, ClientRequest, DebugAndLog } from "../../src/lib/tools/index.js";
import { testEventA } from "../helpers/test-event.js";
import { testContextA } from "../helpers/test-context.js";
import { testValidationsA } from "../helpers/test-validations.js";

// Fixed keys, so no draw can be a prototype-polluting key.
const priorBodyArbitrary = fc.record({
	id: fc.integer(),
	name: fc.string({ maxLength: 20 }),
	tags: fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 })
});

describe("Response setBodyToNull() property tests", () => {
	let REQ;

	ClientRequest.init({ validations: testValidationsA });

	beforeEach(() => {
		jest.spyOn(DebugAndLog, "log").mockImplementation(() => {});

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

	describe("Property 1: a null body survives finalization", () => {
		it("finalize() returns body null and the same status code for any status and prior body", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 200, max: 599 }),
					priorBodyArbitrary,
					(statusCode, priorBody) => {
						const RESPONSE = new Response(REQ);

						RESPONSE.setStatusCode(statusCode);
						RESPONSE.setBody(priorBody);
						RESPONSE.setBodyToNull();

						const finalized = RESPONSE.finalize();

						expect(finalized.body).toBeNull();
						expect(finalized.statusCode).toBe(statusCode);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: falsy bodies never replace a body", () => {
		it("setBody() with null, undefined, empty string, 0, or false leaves the previous body", () => {
			fc.assert(
				fc.property(
					fc.constantFrom(null, undefined, "", 0, false),
					priorBodyArbitrary,
					(falsyValue, priorBody) => {
						const RESPONSE = new Response(REQ);

						RESPONSE.setBody(priorBody);
						RESPONSE.setBody(falsyValue);

						expect(RESPONSE.getBody()).toEqual(priorBody);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
