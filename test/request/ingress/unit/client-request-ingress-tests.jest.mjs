/**
 * Test: ClientRequest ingress verification
 *
 * Purpose: Verify what `ClientRequest` adds on top of `IngressVerifier`: `getProps().client.sourceIp`
 * and `getProps().client.ingress`, `isIngressVerified()` for the three ingress values, that changing
 * the object returned by `getProps()` cannot change `isIngressVerified()`, that `isValid()` is not
 * affected by an unverified request, the single `INGRESS_UNVERIFIED` log line (exactly
 * `{"reason":"<code>"}`, none for `direct` and `cloudfront`), that the `RESPONSE` log line still has
 * 13 fields, and the results of `ClientRequest.prime()`.
 *
 * Setup:
 * - SDK transport: ExtensionAvailability.setOverride(false) and a spy on the AWS.secrets getter.
 *   No real AWS call is made and no credential is read.
 * - The two CACHE_DATA_INGRESS_* variables are deleted in beforeEach and set per test BEFORE the
 *   ClientRequest is constructed, because the verifier reads them on every call.
 * - Each test uses a secret id unique to it because the CachedParameterSecrets registry keeps every reader.
 * - Secret values are made up. Only documentation range addresses (RFC 5737) are used.
 * - DebugAndLog.log, error, warn, info, and debug are spied on so nothing is written and the lines can be read.
 *
 * Teardown: mocks are restored, ExtensionAvailability and IngressVerifier are reset, and the
 * CACHE_DATA_INGRESS_* variables are restored.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-prime-tests.jest.mjs
 * - test/response/response-log-field-sanitization-tests.jest.mjs
 *
 * Requirements: 2.3, 3.1, 5.2, 7.1 to 7.4, 8.1 to 8.5, 15.3, 15.6
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { testEventA } from "../../../helpers/test-event.js";
import { testContextA } from "../../../helpers/test-context.js";
import { testValidationsA } from "../../../helpers/test-validations.js";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, ClientRequest, Response } = tools.default;
const DebugAndLog = (await import("../../../../src/lib/tools/DebugAndLog.class.js")).default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;

const ENV_SECRET_NAME = IngressVerifier.ENV_SECRET_NAME;
const ENV_REFRESH_SECONDS = IngressVerifier.ENV_REFRESH_SECONDS;
const ORIGINAL_SECRET_NAME = process.env[ENV_SECRET_NAME];
const ORIGINAL_REFRESH_SECONDS = process.env[ENV_REFRESH_SECONDS];

const HEADER = "X-Atlantis-Origin-Secret";
const CURRENT_VALUE = "fake-current-ingress-value-0001";
const PREVIOUS_VALUE = "fake-previous-ingress-value-0002";
const OLDER_VALUE = "fake-older-ingress-value-0003";
const START_TIME = 1700000000000;
const SOURCE_IP = "203.0.113.45";

const RESPONSE_OPTIONS = {
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
};

let idCounter = 0;
let now = START_TIME;

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test only
 */
function nextId(label) {
	idCounter += 1;
	return `ingress/client-request/${label}-${idCounter}`;
}

/**
 * @param {string} name - Error name
 * @param {string} [message] - Error message
 * @returns {Error} An error with the given name
 */
function namedError(name, message = "mock error") {
	return Object.assign(new Error(message), { name });
}

/**
 * Uses the SDK transport and replaces `AWS.secrets.get`. Reads for the secret `id` are answered by
 * `plan.current` (AWSCURRENT) or `plan.previous` (AWSPREVIOUS), looked up at call time. Reads for any
 * other secret id (readers left in the registry by other tests) get a fake value.
 *
 * @param {string} id - Secret id under test
 * @param {{current: (function(object): Promise<object>)|undefined, previous: (function(object): Promise<object>)|undefined}} plan - Answers
 * @returns {jest.Mock} The mock of `AWS.secrets.get`
 */
function useSdk(id, plan = {}) {
	ExtensionAvailability.setOverride(false);
	const get = jest.fn(async (params) => {
		if (params.SecretId !== id) { return { SecretString: "fake-other-secret-value" }; }
		if (params.VersionStage === "AWSPREVIOUS") {
			return plan.previous ? plan.previous(params) : { SecretString: PREVIOUS_VALUE };
		}
		return plan.current ? plan.current(params) : { SecretString: CURRENT_VALUE };
	});
	jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get, sdk: {} });
	return get;
}

/**
 * Builds a REST event from the shared test event with an optional ingress header.
 *
 * @param {Object} [options] - Event options
 * @param {*} [options.headerValue] - Value of the ingress header. The header is left out when undefined.
 * @param {string} [options.headerName] - Name of the ingress header (default: X-Atlantis-Origin-Secret)
 * @param {boolean} [options.withoutRequestContext] - Leave out requestContext
 * @returns {Object} Event
 */
function buildEvent({ headerValue, headerName = HEADER, withoutRequestContext = false } = {}) {
	const headers = { ...testEventA.headers };
	if (headerValue !== undefined) { headers[headerName] = headerValue; }
	const event = {
		...testEventA,
		headers,
		requestContext: {
			...testEventA.requestContext,
			identity: { ...testEventA.requestContext.identity, sourceIp: SOURCE_IP }
		}
	};
	if (withoutRequestContext) { delete event.requestContext; }
	return event;
}

/**
 * @param {Object} [options] - Options for buildEvent()
 * @returns {Object} A new ClientRequest
 */
function buildRequest(options) {
	return new ClientRequest(buildEvent(options), testContextA);
}

describe("ClientRequest ingress verification", () => {

	let logSpy;

	/**
	 * @returns {Array<Array<*>>} Arguments of every DebugAndLog.log call tagged INGRESS_UNVERIFIED
	 */
	function ingressCalls() {
		return logSpy.mock.calls.filter((call) => call[1] === "INGRESS_UNVERIFIED");
	}

	/**
	 * Configures the secret so `id` is loaded with the current and previous values.
	 *
	 * @param {string} label - Test label
	 * @param {Object} [plan] - Answers for useSdk()
	 * @returns {Promise<{id: string, get: jest.Mock}>} The secret id and the mock
	 */
	async function loadSecret(label, plan = {}) {
		const id = nextId(label);
		const get = useSdk(id, plan);
		process.env[ENV_SECRET_NAME] = id;
		await ClientRequest.prime();
		return { id, get };
	}

	beforeEach(() => {
		delete process.env[ENV_SECRET_NAME];
		delete process.env[ENV_REFRESH_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		now = START_TIME;
		jest.spyOn(Date, "now").mockImplementation(() => now);
		logSpy = jest.spyOn(DebugAndLog, "log").mockImplementation(() => Promise.resolve());
		jest.spyOn(DebugAndLog, "debug").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "info").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});
		ClientRequest.init({ validations: testValidationsA });
		Response.init(RESPONSE_OPTIONS);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		if (ORIGINAL_SECRET_NAME === undefined) {
			delete process.env[ENV_SECRET_NAME];
		} else {
			process.env[ENV_SECRET_NAME] = ORIGINAL_SECRET_NAME;
		}
		if (ORIGINAL_REFRESH_SECONDS === undefined) {
			delete process.env[ENV_REFRESH_SECONDS];
		} else {
			process.env[ENV_REFRESH_SECONDS] = ORIGINAL_REFRESH_SECONDS;
		}
	});

	describe("getProps().client.sourceIp (R2.3)", () => {

		it("holds identity.sourceIp", () => {
			const request = buildRequest();
			expect(request.getProps().client.sourceIp).toBe(SOURCE_IP);
		});

		it("is present, with the value null, when the event has no requestContext", () => {
			const request = buildRequest({ withoutRequestContext: true });
			const client = request.getProps().client;
			expect("sourceIp" in client).toBe(true);
			expect(client.sourceIp).toBeNull();
		});

		it("leaves client.ip as it was: the same value as sourceIp by default", () => {
			delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
			const request = buildRequest();
			expect(request.getProps().client.ip).toBe(SOURCE_IP);
			expect(request.getClientIp()).toBe(SOURCE_IP);
		});
	});

	describe("getProps().client.ingress (R3.1)", () => {

		it("is always present and is 'direct' when CACHE_DATA_INGRESS_SECRET_NAME is not set", () => {
			const client = buildRequest().getProps().client;
			expect("ingress" in client).toBe(true);
			expect(client.ingress).toBe("direct");
		});

		it.each([
			["empty", ""],
			["whitespace only", "   "]
		])("is 'direct' when the variable is %s", (label, rawValue) => {
			process.env[ENV_SECRET_NAME] = rawValue;
			expect(buildRequest().getProps().client.ingress).toBe("direct");
		});

		it("is 'cloudfront' when the header equals the current value", async () => {
			await loadSecret("props-current");
			expect(buildRequest({ headerValue: CURRENT_VALUE }).getProps().client.ingress).toBe("cloudfront");
		});

		it("is 'cloudfront' when the header equals the previous value", async () => {
			await loadSecret("props-previous");
			expect(buildRequest({ headerValue: PREVIOUS_VALUE }).getProps().client.ingress).toBe("cloudfront");
		});

		it("is 'cloudfront' when the header name is in lower case", async () => {
			await loadSecret("props-lowercase");
			const request = buildRequest({ headerName: "x-atlantis-origin-secret", headerValue: CURRENT_VALUE });
			expect(request.getProps().client.ingress).toBe("cloudfront");
		});

		it("is 'unverified' when the header equals neither value", async () => {
			await loadSecret("props-older");
			expect(buildRequest({ headerValue: OLDER_VALUE }).getProps().client.ingress).toBe("unverified");
		});

		it("is 'unverified' when the header is missing", async () => {
			await loadSecret("props-missing");
			expect(buildRequest().getProps().client.ingress).toBe("unverified");
		});

		it("keeps the other client fields apart from sourceIp and ingress when the check is turned on", async () => {
			const direct = buildRequest().getProps().client;
			await loadSecret("props-other-fields");
			const verified = buildRequest({ headerValue: CURRENT_VALUE }).getProps().client;

			const { ingress: directIngress, ...directRest } = direct;
			const { ingress: verifiedIngress, ...verifiedRest } = verified;
			expect(directIngress).toBe("direct");
			expect(verifiedIngress).toBe("cloudfront");
			expect(verifiedRest).toEqual(directRest);
		});
	});

	describe("isIngressVerified() (R7.1 to R7.3)", () => {

		it("is false for 'direct'", () => {
			const request = buildRequest();
			expect(request.getProps().client.ingress).toBe("direct");
			expect(request.isIngressVerified()).toBe(false);
		});

		it("is true for 'cloudfront'", async () => {
			await loadSecret("verified-cloudfront");
			const request = buildRequest({ headerValue: CURRENT_VALUE });
			expect(request.getProps().client.ingress).toBe("cloudfront");
			expect(request.isIngressVerified()).toBe(true);
		});

		it("is false for 'unverified'", async () => {
			await loadSecret("verified-unverified");
			const request = buildRequest({ headerValue: OLDER_VALUE });
			expect(request.getProps().client.ingress).toBe("unverified");
			expect(request.isIngressVerified()).toBe(false);
		});

		it("returns a boolean", async () => {
			await loadSecret("verified-boolean");
			expect(typeof buildRequest({ headerValue: CURRENT_VALUE }).isIngressVerified()).toBe("boolean");
			expect(typeof buildRequest().isIngressVerified()).toBe("boolean");
		});

		it("stays false after getProps().client.ingress is overwritten with 'cloudfront'", async () => {
			await loadSecret("overwrite-up");
			const request = buildRequest({ headerValue: OLDER_VALUE });
			expect(request.isIngressVerified()).toBe(false);

			request.getProps().client.ingress = "cloudfront";

			expect(request.getProps().client.ingress).toBe("cloudfront");
			expect(request.isIngressVerified()).toBe(false);
		});

		it("stays false after the whole client object is replaced", async () => {
			await loadSecret("overwrite-client");
			const request = buildRequest({ headerValue: OLDER_VALUE });

			request.getProps().client = { ingress: "cloudfront" };

			expect(request.isIngressVerified()).toBe(false);
		});

		it("stays false for 'direct' after getProps().client.ingress is overwritten", () => {
			const request = buildRequest();

			request.getProps().client.ingress = "cloudfront";

			expect(request.isIngressVerified()).toBe(false);
		});

		it("stays true after getProps().client.ingress is overwritten with 'unverified'", async () => {
			await loadSecret("overwrite-down");
			const request = buildRequest({ headerValue: CURRENT_VALUE });

			request.getProps().client.ingress = "unverified";

			expect(request.isIngressVerified()).toBe(true);
		});

		it("is decided when the request is built: a later change of the secret or of the environment does not change it", async () => {
			await loadSecret("decided-at-construction");
			const request = buildRequest({ headerValue: CURRENT_VALUE });
			expect(request.isIngressVerified()).toBe(true);

			process.env[ENV_SECRET_NAME] = "bad name!";
			IngressVerifier.reset();

			expect(request.isIngressVerified()).toBe(true);
		});
	});

	describe("isValid() is not affected (R7.4)", () => {

		it("gives the same isValid() and getValidationReason() for an unverified request as for a direct one", async () => {
			const direct = buildRequest();
			await loadSecret("valid-unverified");
			const unverified = buildRequest({ headerValue: OLDER_VALUE });
			expect(unverified.getProps().client.ingress).toBe("unverified");
			expect(direct.getProps().client.ingress).toBe("direct");

			expect(unverified.isValid()).toBe(direct.isValid());
			expect(unverified.getValidationReason()).toEqual(direct.getValidationReason());
		});

		it("gives the same isValid() for a verified request as for a direct one", async () => {
			const direct = buildRequest();
			await loadSecret("valid-verified");
			const verified = buildRequest({ headerValue: CURRENT_VALUE });

			expect(verified.isValid()).toBe(direct.isValid());
		});

		it("still reports an invalid request as invalid when it is also unverified", async () => {
			const invalidChanges = { pathParameters: { employeeId: "not valid!" } };
			const directInvalid = new ClientRequest({ ...buildEvent(), ...invalidChanges }, testContextA);
			await loadSecret("valid-invalid");
			const unverifiedInvalid = new ClientRequest({ ...buildEvent({ headerValue: OLDER_VALUE }), ...invalidChanges }, testContextA);

			expect(directInvalid.isValid()).toBe(false);
			expect(unverifiedInvalid.getProps().client.ingress).toBe("unverified");
			expect(unverifiedInvalid.isValid()).toBe(false);
		});
	});

	describe("INGRESS_UNVERIFIED log line (R8.1 to R8.4)", () => {

		/**
		 * Reason code, how to set up the secret and the header, and the header to send.
		 */
		const REASON_CASES = [
			{
				reason: "missing-header",
				label: "log-missing",
				setup: async (id) => { useSdk(id); process.env[ENV_SECRET_NAME] = id; await ClientRequest.prime(); },
				options: {}
			},
			{
				reason: "mismatch",
				label: "log-mismatch",
				setup: async (id) => { useSdk(id); process.env[ENV_SECRET_NAME] = id; await ClientRequest.prime(); },
				options: { headerValue: OLDER_VALUE }
			},
			{
				reason: "secret-not-primed",
				label: "log-not-primed",
				setup: async (id) => { useSdk(id); process.env[ENV_SECRET_NAME] = id; },
				options: { headerValue: CURRENT_VALUE }
			},
			{
				reason: "secret-unavailable",
				label: "log-unavailable",
				setup: async (id) => {
					useSdk(id, { current: async () => { throw new Error("simulated outage"); } });
					process.env[ENV_SECRET_NAME] = id;
					await ClientRequest.prime();
				},
				options: { headerValue: CURRENT_VALUE }
			},
			{
				reason: "secret-unusable",
				label: "log-unusable",
				setup: async (id) => {
					useSdk(id, { current: async () => ({ SecretString: "BLANK" }) });
					process.env[ENV_SECRET_NAME] = id;
					await ClientRequest.prime();
				},
				options: { headerValue: "BLANK" }
			},
			{
				reason: "bad-configuration",
				label: "log-bad-config",
				setup: async () => { process.env[ENV_SECRET_NAME] = "bad name!"; },
				options: { headerValue: CURRENT_VALUE }
			}
		];

		it.each(REASON_CASES)("writes exactly one line, {\"reason\":\"$reason\"}, for reason $reason", async ({ reason, label, setup, options }) => {
			await setup(nextId(label));

			const request = buildRequest(options);

			expect(request.getProps().client.ingress).toBe("unverified");
			const calls = ingressCalls();
			expect(calls).toHaveLength(1);
			expect(calls[0][0]).toBe(`{"reason":"${reason}"}`);
			expect(JSON.parse(calls[0][0])).toEqual({ reason });
			expect(Object.keys(JSON.parse(calls[0][0]))).toEqual(["reason"]);
		});

		it("passes only the message and the INGRESS_UNVERIFIED tag to DebugAndLog.log", async () => {
			await loadSecret("log-arguments");

			buildRequest({ headerValue: OLDER_VALUE });

			const calls = ingressCalls();
			expect(calls).toHaveLength(1);
			expect(calls[0]).toHaveLength(2);
			expect(calls[0][1]).toBe("INGRESS_UNVERIFIED");
		});

		it("writes one line per unverified request", async () => {
			await loadSecret("log-per-request");

			buildRequest({ headerValue: OLDER_VALUE });
			buildRequest();
			buildRequest({ headerValue: "!another-wrong-value" });

			expect(ingressCalls().map((call) => call[0])).toEqual([
				"{\"reason\":\"mismatch\"}",
				"{\"reason\":\"missing-header\"}",
				"{\"reason\":\"mismatch\"}"
			]);
		});

		it("writes no line for 'direct'", () => {
			buildRequest();
			buildRequest({ headerValue: "anything" });

			expect(ingressCalls()).toHaveLength(0);
			expect(logSpy.mock.calls.filter((call) => call[1] === "INGRESS_UNVERIFIED")).toHaveLength(0);
		});

		it("writes no line for 'cloudfront', with the current or the previous value", async () => {
			await loadSecret("log-cloudfront");

			buildRequest({ headerValue: CURRENT_VALUE });
			buildRequest({ headerValue: PREVIOUS_VALUE });

			expect(ingressCalls()).toHaveLength(0);
		});

		it("carries no header value, secret value, secret id, or IP address", async () => {
			const { id } = await loadSecret("log-secrecy");
			const wrongHeader = "!wrong-header-value-9999";

			buildRequest({ headerValue: wrongHeader });

			const calls = ingressCalls();
			expect(calls).toHaveLength(1);
			const everything = JSON.stringify(calls);
			for (const secretText of [wrongHeader, CURRENT_VALUE, PREVIOUS_VALUE, id, SOURCE_IP]) {
				expect(everything).not.toContain(secretText);
			}
		});

		it("is written by the constructor and not again by isIngressVerified(), getProps(), or isValid()", async () => {
			await loadSecret("log-once");

			const request = buildRequest({ headerValue: OLDER_VALUE });
			request.isIngressVerified();
			request.isIngressVerified();
			request.getProps();
			request.isValid();

			expect(ingressCalls()).toHaveLength(1);
		});
	});

	describe("RESPONSE log line is unchanged (R8.5, R15.6)", () => {

		/**
		 * Finalizes a Response for the request and returns the RESPONSE message.
		 *
		 * @param {Object} request - ClientRequest
		 * @returns {string} The message passed to DebugAndLog.log with the RESPONSE tag
		 */
		function responseLine(request) {
			const response = new Response(request);
			response.finalize();
			const calls = logSpy.mock.calls.filter((call) => call[1] === "RESPONSE");
			expect(calls).toHaveLength(1);
			return calls[0][0];
		}

		it("has 13 fields for a request that is 'direct'", () => {
			const line = responseLine(buildRequest());
			expect(line.split(" | ")).toHaveLength(13);
		});

		it("has 13 fields for a request that is 'cloudfront'", async () => {
			await loadSecret("response-cloudfront");
			const line = responseLine(buildRequest({ headerValue: CURRENT_VALUE }));
			expect(line.split(" | ")).toHaveLength(13);
		});

		it("has 13 fields for a request that is 'unverified', and adds no INGRESS_UNVERIFIED line of its own", async () => {
			await loadSecret("response-unverified");
			const request = buildRequest({ headerValue: OLDER_VALUE });
			expect(ingressCalls()).toHaveLength(1);

			const line = responseLine(request);

			expect(line.split(" | ")).toHaveLength(13);
			expect(ingressCalls()).toHaveLength(1);
			expect(line).not.toContain("unverified");
			expect(line).not.toContain("mismatch");
		});

		it("has the same fields in the same places whatever the ingress is", async () => {
			const directFields = responseLine(buildRequest()).split(" | ");
			logSpy.mockClear();
			await loadSecret("response-same-fields");
			const unverifiedFields = responseLine(buildRequest({ headerValue: OLDER_VALUE })).split(" | ");

			// statusCode, bytes, contentType (execms differs between requests)
			expect(unverifiedFields.slice(0, 3)).toEqual(directFields.slice(0, 3));
			// clientIp through apiKey
			expect(unverifiedFields.slice(4)).toEqual(directFields.slice(4));
		});
	});

	describe("ClientRequest.prime() (R5.2)", () => {

		it("returns a promise", () => {
			const result = ClientRequest.prime();
			expect(result).toBeInstanceOf(Promise);
			return result;
		});

		it("resolves true when the variable is not set, and reads nothing", async () => {
			const get = useSdk(nextId("prime-unset"));

			await expect(ClientRequest.prime()).resolves.toBe(true);

			expect(get).not.toHaveBeenCalled();
		});

		it("resolves false when the variable is invalid", async () => {
			const get = useSdk(nextId("prime-invalid"));
			process.env[ENV_SECRET_NAME] = "bad name!";

			await expect(ClientRequest.prime()).resolves.toBe(false);

			expect(get).not.toHaveBeenCalled();
		});

		it("resolves true when the secret loads, and requests are then verified", async () => {
			const id = nextId("prime-loaded");
			const get = useSdk(id);
			process.env[ENV_SECRET_NAME] = id;
			expect(buildRequest({ headerValue: CURRENT_VALUE }).getProps().client.ingress).toBe("unverified");

			await expect(ClientRequest.prime()).resolves.toBe(true);

			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSCURRENT" });
			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSPREVIOUS" });
			expect(buildRequest({ headerValue: CURRENT_VALUE }).isIngressVerified()).toBe(true);
		});

		it("resolves false, and does not reject, when the secret cannot be read", async () => {
			const id = nextId("prime-fails");
			useSdk(id, { current: async () => { throw new Error("simulated outage"); } });
			process.env[ENV_SECRET_NAME] = id;

			await expect(ClientRequest.prime()).resolves.toBe(false);

			expect(buildRequest({ headerValue: CURRENT_VALUE }).isIngressVerified()).toBe(false);
		});

		it("resolves true when the secret has no previous version", async () => {
			const id = nextId("prime-no-previous");
			useSdk(id, { previous: async () => { throw namedError("ResourceNotFoundException", "no AWSPREVIOUS version"); } });
			process.env[ENV_SECRET_NAME] = id;

			await expect(ClientRequest.prime()).resolves.toBe(true);

			expect(buildRequest({ headerValue: CURRENT_VALUE }).isIngressVerified()).toBe(true);
			expect(buildRequest({ headerValue: PREVIOUS_VALUE }).isIngressVerified()).toBe(false);
		});

		it("returns the same result as IngressVerifier.prime()", async () => {
			const id = nextId("prime-same");
			useSdk(id);
			process.env[ENV_SECRET_NAME] = id;

			const fromClientRequest = await ClientRequest.prime();
			const fromVerifier = await IngressVerifier.prime();

			expect(fromClientRequest).toBe(fromVerifier);
		});

		it("is a static method and not an instance method", () => {
			expect(typeof ClientRequest.prime).toBe("function");
			expect(typeof buildRequest().prime).toBe("undefined");
		});
	});

	describe("Property: a header that is not the secret never verifies a request (R3.1, R7.2)", () => {

		/**
		 * **Validates: Requirements 3.1, 7.1, 7.2**
		 */
		it("gives 'unverified' and false for any header that starts with '!'", async () => {
			await loadSecret("property-wrong-header");

			fc.assert(
				fc.property(
					fc.string({ maxLength: 40 }),
					(text) => {
						const request = buildRequest({ headerValue: `!${text}` });
						return request.getProps().client.ingress === "unverified" && request.isIngressVerified() === false;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
