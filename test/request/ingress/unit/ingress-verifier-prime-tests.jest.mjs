/**
 * Test: IngressVerifier.prime()
 *
 * Purpose: Verify what `IngressVerifier.prime()` (the implementation behind `ClientRequest.prime()`)
 * resolves and which reads it starts: not configured, invalid, loaded, not loaded, a secret that has
 * never been rotated, use together with `CachedParameterSecrets.prime()`, and no second read while one
 * is running.
 *
 * Setup:
 * - SDK transport: ExtensionAvailability.setOverride(false) and a spy on the AWS.secrets getter.
 *   Reads are counted by the `VersionStage` argument of `AWS.secrets.get`.
 * - Time: Date.now is spied on and advanced by hand for the refresh interval and the 30-second wait.
 * - Each test uses a secret id unique to it because the CachedParameterSecrets registry keeps every reader.
 * - Secret values are made up.
 *
 * Teardown: mocks are restored, ExtensionAvailability and IngressVerifier are reset, and the two
 * CACHE_DATA_INGRESS_* variables are restored. No real AWS call is made and no credential is read.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 *
 * Requirements: 5.1 to 5.4, 4.5
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { setImmediate } from "node:timers";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;

const ENV_SECRET_NAME = IngressVerifier.ENV_SECRET_NAME;
const ENV_REFRESH_SECONDS = IngressVerifier.ENV_REFRESH_SECONDS;
const ORIGINAL_SECRET_NAME = process.env[ENV_SECRET_NAME];
const ORIGINAL_REFRESH_SECONDS = process.env[ENV_REFRESH_SECONDS];

const HEADER = "x-atlantis-origin-secret";
const CURRENT_VALUE = "fake-current-ingress-value-0001";
const PREVIOUS_VALUE = "fake-previous-ingress-value-0002";
const START_TIME = 1700000000000;

let idCounter = 0;
let now = START_TIME;

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test only. It contains "/" so that it is a realistic name.
 */
function nextId(label) {
	idCounter += 1;
	return `ingress/prime/${label}-${idCounter}`;
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
 * `plan.current` (AWSCURRENT) or `plan.previous` (AWSPREVIOUS), looked up at call time so that a test
 * can change them. Reads for any other secret id (readers left in the registry by other tests) get a fake value.
 *
 * @param {string} id - Secret id under test
 * @param {{current: (function(object): Promise<object>)|undefined, previous: (function(object): Promise<object>)|undefined}} plan - Answers
 * @returns {jest.Mock} The mock of `AWS.secrets.get`
 */
function useSdk(id, plan) {
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
 * @param {jest.Mock} get - Mock of `AWS.secrets.get`
 * @param {string} id - Secret id
 * @param {string} versionStage - "AWSCURRENT" or "AWSPREVIOUS"
 * @returns {number} How many reads of that stage of that secret were started
 */
function readsOf(get, id, versionStage) {
	return get.mock.calls
		.map((call) => call[0])
		.filter((params) => params.SecretId === id && params.VersionStage === versionStage)
		.length;
}

/**
 * Lets every promise continuation that is already queued run.
 *
 * @returns {Promise<void>} Resolves after a macrotask
 */
function flush() {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("IngressVerifier.prime()", () => {

	let errorSpy;
	let warnSpy;

	beforeEach(() => {
		delete process.env[ENV_SECRET_NAME];
		delete process.env[ENV_REFRESH_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		now = START_TIME;
		jest.spyOn(Date, "now").mockImplementation(() => now);
		jest.spyOn(DebugAndLog, "debug").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "info").mockImplementation(() => {});
		warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});
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

	describe("check not configured (R5.2)", () => {

		it.each([
			["unset", undefined],
			["empty", ""],
			["whitespace only", "   \t "]
		])("resolves true, registers no reader, reads nothing, and logs nothing when the variable is %s", async (label, rawValue) => {
			const id = nextId("unset");
			const get = useSdk(id, {});
			if (rawValue !== undefined) { process.env[ENV_SECRET_NAME] = rawValue; }
			const namesBefore = CachedParameterSecrets.getNames();

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(CachedParameterSecrets.getNames()).toEqual(namesBefore);
			expect(get).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe("check configured but invalid (R5.2)", () => {

		it.each([
			["a space and a bang", "bad name!"],
			["more than 2048 characters", "a".repeat(2049)]
		])("resolves false, registers no reader, and reads nothing for a secret name with %s", async (label, rawValue) => {
			const id = nextId("invalid");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = rawValue;
			const namesBefore = CachedParameterSecrets.getNames();

			// Precondition: the implementation itself rejects this value
			expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.BAD_CONFIGURATION);

			const result = await IngressVerifier.prime();

			expect(result).toBe(false);
			expect(CachedParameterSecrets.getNames()).toEqual(namesBefore);
			expect(get).not.toHaveBeenCalled();
		});
	});

	describe("loaded (R5.2, R5.4)", () => {

		it("resolves true when both versions load, and reads each stage of the secret once", async () => {
			const id = nextId("loaded");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSCURRENT" });
			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSPREVIOUS" });
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
		});

		it("makes evaluate() accept the current and the previous value afterwards", async () => {
			const id = nextId("loaded-evaluate");
			useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;

			await IngressVerifier.prime();

			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate({ [HEADER]: PREVIOUS_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("creates and registers the readers when they do not exist yet", async () => {
			const id = nextId("creates");
			useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			expect(CachedParameterSecrets.get(`${id}#AWSCURRENT`)).toBeUndefined();
			expect(CachedParameterSecrets.get(`${id}#AWSPREVIOUS`)).toBeUndefined();

			await IngressVerifier.prime();

			expect(CachedParameterSecrets.get(`${id}#AWSCURRENT`)).toBeDefined();
			expect(CachedParameterSecrets.get(`${id}#AWSPREVIOUS`)).toBeDefined();
		});

		it("is safe to call repeatedly: later calls resolve true and start no read", async () => {
			const id = nextId("repeat");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;

			const results = [];
			results.push(await IngressVerifier.prime());
			results.push(await IngressVerifier.prime());
			results.push(await IngressVerifier.prime());

			expect(results).toEqual([true, true, true]);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
		});

		it("uses the registered readers again after IngressVerifier.reset() instead of reading a second time", async () => {
			const id = nextId("after-reset");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			await IngressVerifier.prime();

			IngressVerifier.reset();
			process.env[ENV_SECRET_NAME] = id;
			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
		});
	});

	describe("not loaded (R5.2)", () => {

		it("resolves false, and does not reject, when the current version cannot be read", async () => {
			const id = nextId("current-fails");
			const plan = { current: async () => { throw new Error("simulated outage"); } };
			const get = useSdk(id, plan);
			process.env[ENV_SECRET_NAME] = id;

			const result = await IngressVerifier.prime();

			expect(result).toBe(false);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.SECRET_UNAVAILABLE);
		});

		it("writes one error for the failed current read and none of its messages carries a secret value", async () => {
			const id = nextId("current-fails-log");
			useSdk(id, { current: async () => { throw new Error("simulated outage"); } });
			process.env[ENV_SECRET_NAME] = id;

			await IngressVerifier.prime();

			const messages = errorSpy.mock.calls.map((call) => String(call[0]));
			expect(messages.filter((message) => message.includes("IngressCurrentSecretReader"))).toHaveLength(1);
			for (const message of messages) {
				expect(message).not.toContain(CURRENT_VALUE);
				expect(message).not.toContain(PREVIOUS_VALUE);
			}
		});

		it("resolves false when the current version answers without a SecretString", async () => {
			const id = nextId("current-no-string");
			useSdk(id, { current: async () => ({}) });
			process.env[ENV_SECRET_NAME] = id;

			const result = await IngressVerifier.prime();

			expect(result).toBe(false);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.SECRET_UNAVAILABLE);
		});

		it("resolves false and does not reject when a reader's prime() rejects", async () => {
			const id = nextId("reader-rejects");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			IngressVerifier.register();
			const current = CachedParameterSecrets.get(`${id}#AWSCURRENT`);
			jest.spyOn(current, "prime").mockRejectedValue(new Error("simulated failure"));

			await expect(IngressVerifier.prime()).resolves.toBe(false);

			expect(errorSpy.mock.calls.some((call) => String(call[0]).startsWith("IngressVerifier.prime():"))).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(0);
		});

		it("reports secret-not-primed before prime() and verifies after it", async () => {
			const id = nextId("before-after");
			useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.SECRET_NOT_PRIMED);

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("waits 30 seconds before a second prime() retries a failed current read, then recovers", async () => {
			const id = nextId("retry");
			const plan = { current: async () => { throw new Error("simulated outage"); } };
			const get = useSdk(id, plan);
			process.env[ENV_SECRET_NAME] = id;

			expect(await IngressVerifier.prime()).toBe(false);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);

			now += 10000;
			expect(await IngressVerifier.prime()).toBe(false);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);

			plan.current = async () => ({ SecretString: CURRENT_VALUE });
			now += 21000;
			expect(await IngressVerifier.prime()).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(2);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});
	});

	describe("a missing or failing previous version does not make prime() false (R5.3)", () => {

		it("resolves true when the secret has no previous version, and logs no error and no warning", async () => {
			const id = nextId("no-previous");
			useSdk(id, { previous: async () => { throw namedError("ResourceNotFoundException", "no AWSPREVIOUS version"); } });
			process.env[ENV_SECRET_NAME] = id;

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(errorSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("resolves true when the previous version cannot be read for another reason, and warns once", async () => {
			const id = nextId("previous-fails");
			useSdk(id, { previous: async () => { throw new Error("simulated outage"); } });
			process.env[ENV_SECRET_NAME] = id;

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			const warnings = warnSpy.mock.calls
				.map((call) => String(call[0]))
				.filter((message) => message.includes("IngressPreviousSecretReader"));
			expect(warnings).toHaveLength(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});
	});

	describe("a secret that has never been rotated (R4.5, D16)", () => {

		it("stores 'no previous version' as a successful read and does not read the previous version again before R seconds", async () => {
			const id = nextId("never-rotated");
			const get = useSdk(id, { previous: async () => { throw namedError("ResourceNotFoundException", "no AWSPREVIOUS version"); } });
			process.env[ENV_SECRET_NAME] = id;
			process.env[ENV_REFRESH_SECONDS] = "120";

			expect(await IngressVerifier.prime()).toBe(true);

			const previous = CachedParameterSecrets.get(`${id}#AWSPREVIOUS`);
			expect(previous.cache.status).toBe(1);
			expect(previous.cache.refreshAfter).toBe(120);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);

			// Just before R seconds: neither prime() path starts a read of either stage
			now += 119000;
			expect(await IngressVerifier.prime()).toBe(true);
			expect(await CachedParameterSecrets.prime()).toBe(true);
			expect(previous.cache.status).toBe(1);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);

			// Past R seconds: the secret is read again, so a rotation is noticed
			now += 2000;
			expect(await IngressVerifier.prime()).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(2);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(2);
			expect(previous.cache.status).toBe(1);
			expect(errorSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe("together with CachedParameterSecrets.prime() (R5.4)", () => {

		it("starts one read per stage when both run at the same time", async () => {
			const id = nextId("together");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			IngressVerifier.register();

			const [verifierResult, registryResult] = await Promise.all([
				IngressVerifier.prime(),
				CachedParameterSecrets.prime()
			]);

			expect(verifierResult).toBe(true);
			expect(registryResult).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
		});

		it("starts no read when CachedParameterSecrets.prime() has already loaded the secret", async () => {
			const id = nextId("registry-first");
			const get = useSdk(id, {});
			process.env[ENV_SECRET_NAME] = id;
			IngressVerifier.register();
			await CachedParameterSecrets.prime();
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);

			const result = await IngressVerifier.prime();

			expect(result).toBe(true);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});
	});

	describe("no second read while one is running (R5.4)", () => {

		it("starts one read per stage for overlapping IngressVerifier.prime() and CachedParameterSecrets.prime() calls", async () => {
			const id = nextId("running");
			let release;
			const gate = new Promise((resolve) => { release = resolve; });
			const get = useSdk(id, {
				current: async () => { await gate; return { SecretString: CURRENT_VALUE }; },
				previous: async () => { await gate; return { SecretString: PREVIOUS_VALUE }; }
			});
			process.env[ENV_SECRET_NAME] = id;
			IngressVerifier.register();

			const first = IngressVerifier.prime();
			const second = IngressVerifier.prime();
			const third = CachedParameterSecrets.prime();
			await flush();

			// Both reads have started and neither has finished
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.SECRET_NOT_PRIMED);

			release();
			const results = await Promise.all([first, second, third]);

			expect(results).toEqual([true, true, true]);
			expect(readsOf(get, id, "AWSCURRENT")).toBe(1);
			expect(readsOf(get, id, "AWSPREVIOUS")).toBe(1);
			expect(IngressVerifier.evaluate({ [HEADER]: CURRENT_VALUE })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});
	});

	describe("Property: the result depends only on whether the current version holds a value (R5.2, R5.3)", () => {

		/**
		 * Builds the answer for one version stage from a generated outcome kind.
		 *
		 * @param {string} kind - "value", "notFound", "reject", or "noString"
		 * @param {string} value - Secret string used when kind is "value"
		 * @returns {function(): Promise<object>} Answer for AWS.secrets.get
		 */
		function answerFor(kind, value) {
			switch (kind) {
				case "value": return async () => ({ SecretString: value });
				case "notFound": return async () => { throw namedError("ResourceNotFoundException", "no AWSPREVIOUS version"); };
				case "noString": return async () => ({});
				default: return async () => { throw new Error("simulated outage"); };
			}
		}

		/**
		 * **Validates: Requirements 5.2, 5.3**
		 */
		it("resolves true exactly when the current version holds a SecretString, whatever happens to the previous version", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constantFrom("value", "reject", "noString"),
					fc.constantFrom("value", "notFound", "reject", "noString"),
					fc.string({ minLength: 1, maxLength: 24 }),
					fc.string({ minLength: 1, maxLength: 24 }),
					async (currentKind, previousKind, currentText, previousText) => {
						IngressVerifier.reset();
						const id = nextId("property");
						useSdk(id, {
							current: answerFor(currentKind, currentText),
							previous: answerFor(previousKind, previousText)
						});
						process.env[ENV_SECRET_NAME] = id;

						const result = await IngressVerifier.prime();

						return result === (currentKind === "value");
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
