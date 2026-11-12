import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';

/* ****************************************************************************
 * RequestInfo client.sourceIp tests
 * Feature: 1-4-1-clientrequest-report-whether-a-request-came
 *
 * Purpose: Verify that RequestInfo reports client.sourceIp as
 * requestContext.identity.sourceIp when that value is a non-empty string, and
 * as null otherwise, and that client.ip, getClientIp(), and getClientIP() are
 * unchanged for the same events.
 *
 * - describe("client.sourceIp"): behavior introduced by this feature. These
 *   fail on the code before the field is added and pass after it.
 * - describe("client.ip preservation"): behavior that is the same before and
 *   after the change. These pass on the current code.
 *
 * Setup:
 * - CACHE_DATA_TRUSTED_PROXY_HOPS is deleted before each test and process.env
 *   is restored afterwards.
 *
 * Addresses: documentation ranges only (192.0.2.0/24, 198.51.100.0/24,
 * 203.0.113.0/24).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 *
 * Related Tests:
 * - test/request/client-ip/unit/request-info-client-ip-tests.jest.mjs
 * ************************************************************************** */

const RequestInfo = (await import('../../../../src/lib/tools/RequestInfo.class.js')).default;

const HOPS_ENV_VAR = "CACHE_DATA_TRUSTED_PROXY_HOPS";

// Documentation range addresses
const SOURCE_IP = "198.51.100.1";
const VIEWER_IP = "192.0.2.10";
const PROXY_IP = "203.0.113.20";

/**
 * Build an API Gateway REST event.
 *
 * @param {object} requestContext - Value for event.requestContext (omitted when undefined)
 * @param {object} [headers={}] - Request headers
 * @returns {object} Event
 */
function buildEvent(requestContext, headers = {}) {
	const event = {
		resource: "/items",
		path: "/items",
		httpMethod: "GET",
		headers,
		queryStringParameters: null,
		body: null
	};
	if (requestContext !== undefined) {
		event.requestContext = requestContext;
	}
	return event;
}

/**
 * Get the client object that RequestInfo holds, including the sourceIp key.
 *
 * @param {object} event - API Gateway event
 * @returns {object} Client object
 */
function clientOf(event) {
	return new RequestInfo(event).toObject(true).client;
}

describe("RequestInfo client.sourceIp", () => {

	let savedEnv;

	beforeEach(() => {
		savedEnv = { ...process.env };
		delete process.env[HOPS_ENV_VAR];
	});

	afterEach(() => {
		process.env = savedEnv;
		jest.restoreAllMocks();
	});

	describe("client.sourceIp", () => {

		it("should report identity.sourceIp when it is a non-empty string", () => {
			const event = buildEvent({ identity: { sourceIp: SOURCE_IP } });
			expect(clientOf(event).sourceIp).toBe(SOURCE_IP);
		});

		it("should return the same value from getClient()", () => {
			const requestInfo = new RequestInfo(buildEvent({ identity: { sourceIp: SOURCE_IP } }));
			expect(requestInfo.getClient().sourceIp).toBe(SOURCE_IP);
			expect(requestInfo.getClient("sourceIp")).toBe(SOURCE_IP);
		});

		it("should not validate, trim, or change the value", () => {
			const odd = " not-an-ip-address \t";
			const event = buildEvent({ identity: { sourceIp: odd } });
			expect(clientOf(event).sourceIp).toBe(odd);
		});

		it("should be null when requestContext is missing", () => {
			const event = buildEvent(undefined);
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it("should be null when requestContext has no identity", () => {
			const event = buildEvent({});
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it("should be null when identity is null", () => {
			const event = buildEvent({ identity: null });
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it("should be null when identity has no sourceIp", () => {
			const event = buildEvent({ identity: { userAgent: "agent" } });
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it("should be null when sourceIp is an empty string", () => {
			const event = buildEvent({ identity: { sourceIp: "" } });
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it.each([
			["a number", 12345],
			["a boolean", true],
			["an array", [SOURCE_IP]],
			["an object", { address: SOURCE_IP }],
			["null", null]
		])("should be null when sourceIp is %s", (_label, value) => {
			const event = buildEvent({ identity: { sourceIp: value } });
			expect(clientOf(event).sourceIp).toBeNull();
		});

		it("should not be changed by CACHE_DATA_TRUSTED_PROXY_HOPS or forwarding headers", () => {
			process.env[HOPS_ENV_VAR] = "1";
			const event = buildEvent(
				{ identity: { sourceIp: PROXY_IP } },
				{ "X-Forwarded-For": VIEWER_IP }
			);
			const client = clientOf(event);
			expect(client.sourceIp).toBe(PROXY_IP);
			expect(client.ip).toBe(VIEWER_IP);
		});

		it("Property: a non-empty string sourceIp is reported unchanged", () => {
			/**
			 * Validates: Requirements 2.1, 2.2
			 */
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 60 }), (value) => {
					const event = buildEvent({ identity: { sourceIp: value } });
					return clientOf(event).sourceIp === value;
				}),
				{ numRuns: 100 }
			);
		});

		it("Property: a sourceIp that is not a string is reported as null", () => {
			/**
			 * Validates: Requirements 2.1
			 */
			fc.assert(
				fc.property(
					fc.oneof(
						fc.integer(),
						fc.boolean(),
						fc.constant(null),
						fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 })
					),
					(value) => {
						const event = buildEvent({ identity: { sourceIp: value } });
						return clientOf(event).sourceIp === null;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("client.ip preservation", () => {

		it("should still resolve client.ip from identity.sourceIp by default", () => {
			const requestInfo = new RequestInfo(buildEvent({ identity: { sourceIp: SOURCE_IP } }));
			expect(requestInfo.getClientIp()).toBe(SOURCE_IP);
			expect(requestInfo.getClientIP()).toBe(SOURCE_IP);
			expect(requestInfo.getClient("ip")).toBe(SOURCE_IP);
		});

		it("should still ignore X-Forwarded-For when the hop count is unset", () => {
			const event = buildEvent(
				{ identity: { sourceIp: SOURCE_IP } },
				{ "X-Forwarded-For": VIEWER_IP }
			);
			expect(new RequestInfo(event).getClientIp()).toBe(SOURCE_IP);
		});

		it("should still read X-Forwarded-For from the right when the hop count is 1", () => {
			process.env[HOPS_ENV_VAR] = "1";
			const event = buildEvent(
				{ identity: { sourceIp: PROXY_IP } },
				{ "X-Forwarded-For": VIEWER_IP }
			);
			expect(new RequestInfo(event).getClientIp()).toBe(VIEWER_IP);
		});

		it("should still give a null client.ip when requestContext is missing", () => {
			const requestInfo = new RequestInfo(buildEvent(undefined));
			expect(requestInfo.getClientIp()).toBeNull();
			expect(requestInfo.getClientIP()).toBeNull();
		});

		it("should still give a null client.ip when identity is null", () => {
			expect(new RequestInfo(buildEvent({ identity: null })).getClientIp()).toBeNull();
		});

		it("should still pass an empty string sourceIp through as client.ip", () => {
			expect(new RequestInfo(buildEvent({ identity: { sourceIp: "" } })).getClientIp()).toBe("");
		});

		it("should still pass a non-string sourceIp through as client.ip", () => {
			expect(new RequestInfo(buildEvent({ identity: { sourceIp: 12345 } })).getClientIp()).toBe(12345);
		});
	});
});
