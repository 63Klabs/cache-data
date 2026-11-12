/**
 * Test: IngressVerifier mismatch refresh
 *
 * Purpose: Verify that a mismatch starts a rate-limited, non-awaited forced refresh of both ingress
 * secret readers, and that no other outcome starts one (Requirement 6, Property 8).
 *
 * Setup:
 * - CACHE_DATA_INGRESS_SECRET_NAME and CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS are deleted before
 *   each test, and IngressVerifier.reset() is called.
 * - The SDK transport is forced with ExtensionAvailability.setOverride(false). AWS.secrets is replaced
 *   with a mock that answers by VersionStage, so reads are counted per stage. No real AWS call is made.
 * - Date.now is spied on and moved by hand to cross the 60-second cooldown.
 * - Each test (and each property run) uses a secret id unique to it because CachedParameterSecrets
 *   has no reset.
 * - Secret values are made-up strings. Headers drawn by the property start with "!" and no secret does,
 *   so a drawn header can never equal a secret, by construction.
 *
 * Teardown: environment variables, ExtensionAvailability, mocks, and the verifier are restored.
 *
 * Known Issues: none.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-prime-tests.jest.mjs
 * - test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { setImmediate } from "node:timers";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;

const ENV_NAME = IngressVerifier.ENV_SECRET_NAME;
const ENV_SECONDS = "CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS";
const HEADER_NAME = "x-atlantis-origin-secret";
const COOLDOWN_MS = 60000;
const START_TIME = 1700000000000;
const CURRENT = "AWSCURRENT";
const PREVIOUS = "AWSPREVIOUS";

const ORIGINAL_ENV = {
	[ENV_NAME]: process.env[ENV_NAME],
	[ENV_SECONDS]: process.env[ENV_SECONDS]
};

const OLD_CURRENT = "fake-old-current-value";
const NEW_CURRENT = "fake-new-current-value";
const FAKE_PREVIOUS = "fake-previous-value";
const WRONG_HEADER = "!fake-wrong-header";

let idCounter = 0;
let now = START_TIME;
let calls = [];
let behavior = {};

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test (or one property run) only
 */
function nextId(label) {
	idCounter += 1;
	return `ingress-mismatch/${label}-${idCounter}`;
}

/**
 * @param {string} name - Error name
 * @returns {Error} An error with the given name
 */
function namedError(name) {
	return Object.assign(new Error("mock error"), { name });
}

/**
 * @returns {Error} The error AWS.secrets gives for a secret with no AWSPREVIOUS version
 */
function notFound() {
	return namedError("ResourceNotFoundException");
}

/**
 * Answers AWS.secrets.get by VersionStage from the `behavior` table and records the call.
 *
 * @param {{SecretId: string, VersionStage: string}} params - SDK parameters
 * @returns {Promise<{SecretString: string}>} The response
 */
async function answerGet(params) {
	calls.push({ SecretId: params.SecretId, VersionStage: params.VersionStage, at: now });
	const entry = behavior[params.VersionStage];
	if (entry.gate) { await entry.gate; }
	if (entry.error) { throw entry.error; }
	return { SecretString: entry.value };
}

/**
 * @param {string} stage - AWSCURRENT or AWSPREVIOUS
 * @returns {number} Reads of that stage since the last clear
 */
function reads(stage) {
	return calls.filter((call) => call.VersionStage === stage).length;
}

/**
 * Lets non-awaited promise chains finish.
 *
 * @returns {Promise<void>} Resolves after pending microtasks and one macrotask
 */
async function flush() {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
}

/**
 * @param {*} headerValue - Value of the secret header
 * @returns {object} A lowercased header map
 */
function headersWith(headerValue) {
	return { [HEADER_NAME]: headerValue };
}

/**
 * Configures the environment and the mock for a secret id, then loads both readers and clears the
 * call record, so a test counts only the reads it causes.
 *
 * @param {string} id - Unique secret id
 * @param {object} [options] - What the secret holds
 * @param {string|null} [options.current=OLD_CURRENT] - AWSCURRENT value, or null for a failing read
 * @param {string|null} [options.previous=null] - AWSPREVIOUS value, or null for "no previous version"
 * @param {boolean} [options.prime=true] - Whether to load the readers
 * @returns {Promise<void>} Resolves when the setup is done
 */
async function setUpSecret(id, { current = OLD_CURRENT, previous = null, prime = true } = {}) {
	process.env[ENV_NAME] = id;
	IngressVerifier.reset();
	now = START_TIME;
	behavior = {
		[CURRENT]: (current === null) ? { error: new Error("mock read failure") } : { value: current },
		[PREVIOUS]: (previous === null) ? { error: notFound() } : { value: previous }
	};
	calls = [];
	if (prime) {
		await IngressVerifier.prime();
	}
	calls = [];
}

describe("IngressVerifier mismatch refresh", () => {

	beforeEach(() => {
		delete process.env[ENV_NAME];
		delete process.env[ENV_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		ExtensionAvailability.setOverride(false);
		now = START_TIME;
		calls = [];
		behavior = {};
		jest.spyOn(Date, "now").mockImplementation(() => now);
		jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get: jest.fn(answerGet), sdk: {} });
		jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});
		jest.spyOn(DebugAndLog, "debug").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		ExtensionAvailability.reset();
		IngressVerifier.reset();
		for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
			if (value === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = value;
			}
		}
	});

	describe("a mismatch starts one refresh of both readers (R6.1, R6.4)", () => {

		it("reads AWSCURRENT and AWSPREVIOUS once each and returns the shared mismatch result", async () => {
			const id = nextId("one-start");
			await setUpSecret(id);

			const result = IngressVerifier.evaluate(headersWith(WRONG_HEADER));

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			await flush();
			expect(reads(CURRENT)).toBe(1);
			expect(reads(PREVIOUS)).toBe(1);
			expect(calls.every((call) => call.SecretId === id)).toBe(true);
		});

		it("reloads values that have not expired, which prime() would not", async () => {
			const id = nextId("unexpired");
			await setUpSecret(id);
			// Both readers hold fresh values (refresh interval 3600 s, no time has passed).
			const current = CachedParameterSecrets.get(`${id}#${CURRENT}`);
			const previous = CachedParameterSecrets.get(`${id}#${PREVIOUS}`);
			expect(current.needsRefresh()).toBe(false);
			expect(previous.needsRefresh()).toBe(false);

			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(reads(CURRENT)).toBe(1);
			expect(reads(PREVIOUS)).toBe(1);
		});

		it("does not wait for the refresh: the result is returned while a read is still running", async () => {
			const id = nextId("not-awaited");
			await setUpSecret(id);
			let release;
			behavior[CURRENT].gate = new Promise((resolve) => { release = resolve; });

			const result = IngressVerifier.evaluate(headersWith(WRONG_HEADER));

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(result.ingress).toBe(IngressVerifier.INGRESS.UNVERIFIED);
			expect(result.reason).toBe(IngressVerifier.REASON.MISMATCH);
			expect(typeof result.then).toBe("undefined");
			await flush();
			expect(reads(CURRENT)).toBe(1);
			release();
			await flush();
		});
	});

	describe("the 60-second cooldown (R6.2)", () => {

		it("has a fixed constant of 60000 ms that is not a setting", async () => {
			expect(IngressVerifier.MISMATCH_REFRESH_COOLDOWN_MS).toBe(60000);

			const id = nextId("constant");
			process.env[ENV_SECONDS] = "120";
			await setUpSecret(id);
			process.env[ENV_SECONDS] = "120";
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			expect(reads(CURRENT)).toBe(1);

			// A 120-second interval must not change the cooldown.
			now = START_TIME + COOLDOWN_MS - 1;
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			expect(reads(CURRENT)).toBe(1);
			now = START_TIME + COOLDOWN_MS;
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			expect(reads(CURRENT)).toBe(2);
		});

		it("starts none for a second mismatch 1 ms short of 60 seconds", async () => {
			await setUpSecret(nextId("inside"));

			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			now = START_TIME + COOLDOWN_MS - 1;
			const result = IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(reads(CURRENT)).toBe(1);
			expect(reads(PREVIOUS)).toBe(1);
		});

		it("starts another at exactly 60 seconds after the last start", async () => {
			await setUpSecret(nextId("boundary"));

			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			now = START_TIME + COOLDOWN_MS;
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(reads(CURRENT)).toBe(2);
			expect(reads(PREVIOUS)).toBe(2);
			expect(calls.filter((call) => call.VersionStage === CURRENT).map((call) => call.at))
				.toEqual([START_TIME, START_TIME + COOLDOWN_MS]);
		});

		it("measures the cooldown from the last start, not from the last mismatch", async () => {
			await setUpSecret(nextId("from-start"));

			IngressVerifier.evaluate(headersWith(WRONG_HEADER)); // start at t0
			await flush();
			now = START_TIME + 30000;
			IngressVerifier.evaluate(headersWith(WRONG_HEADER)); // suppressed, must not move the clock
			await flush();
			now = START_TIME + COOLDOWN_MS;
			IngressVerifier.evaluate(headersWith(WRONG_HEADER)); // 60 s after the start at t0
			await flush();

			expect(reads(CURRENT)).toBe(2);
		});

		it("lets reset() clear the cooldown", async () => {
			const id = nextId("reset-clears");
			await setUpSecret(id);

			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();
			expect(reads(CURRENT)).toBe(1);

			IngressVerifier.reset();
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(reads(CURRENT)).toBe(2);
		});
	});

	describe("outcomes that start no refresh (R6.3)", () => {

		it("does nothing for a request without the header", async () => {
			await setUpSecret(nextId("no-header"));

			expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.MISSING_HEADER);
			expect(IngressVerifier.evaluate(undefined)).toBe(IngressVerifier.RESULT.MISSING_HEADER);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing for an empty header", async () => {
			await setUpSecret(nextId("empty-header"));

			expect(IngressVerifier.evaluate(headersWith(""))).toBe(IngressVerifier.RESULT.MISSING_HEADER);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing for a header that is not a string", async () => {
			await setUpSecret(nextId("non-string"));

			for (const value of [123, true, null, undefined, [WRONG_HEADER], { value: WRONG_HEADER }]) {
				expect(IngressVerifier.evaluate(headersWith(value))).toBe(IngressVerifier.RESULT.MISSING_HEADER);
			}
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the header matches the current value", async () => {
			await setUpSecret(nextId("match-current"));

			expect(IngressVerifier.evaluate(headersWith(OLD_CURRENT))).toBe(IngressVerifier.RESULT.CLOUDFRONT);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the header matches the previous value", async () => {
			await setUpSecret(nextId("match-previous"), { previous: FAKE_PREVIOUS });

			expect(IngressVerifier.evaluate(headersWith(FAKE_PREVIOUS))).toBe(IngressVerifier.RESULT.CLOUDFRONT);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it.each([
			["BLANK", "BLANK"],
			["blank in lowercase", "blank"],
			["an empty string", ""],
			["whitespace", "   "]
		])("does nothing when the current value is unusable (%s)", async (label, value) => {
			await setUpSecret(nextId("unusable"), { current: value });

			expect(IngressVerifier.evaluate(headersWith(WRONG_HEADER))).toBe(IngressVerifier.RESULT.SECRET_UNUSABLE);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the secret has not been loaded", async () => {
			await setUpSecret(nextId("not-primed"), { prime: false });

			expect(IngressVerifier.evaluate(headersWith(WRONG_HEADER))).toBe(IngressVerifier.RESULT.SECRET_NOT_PRIMED);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the current read failed and no value is held", async () => {
			await setUpSecret(nextId("unavailable"), { current: null });

			expect(IngressVerifier.evaluate(headersWith(WRONG_HEADER))).toBe(IngressVerifier.RESULT.SECRET_UNAVAILABLE);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the secret variable is invalid", async () => {
			await setUpSecret(nextId("bad-config"));
			process.env[ENV_NAME] = "not a valid secret name";

			expect(IngressVerifier.evaluate(headersWith(WRONG_HEADER))).toBe(IngressVerifier.RESULT.BAD_CONFIGURATION);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does nothing when the check is not configured", async () => {
			await setUpSecret(nextId("unset"));
			delete process.env[ENV_NAME];

			expect(IngressVerifier.evaluate(headersWith(WRONG_HEADER))).toBe(IngressVerifier.RESULT.DIRECT);
			await flush();

			expect(calls).toHaveLength(0);
		});

		it("does not use up the cooldown: a mismatch right after a non-mismatch still starts a refresh", async () => {
			await setUpSecret(nextId("cooldown-unused"));

			IngressVerifier.evaluate({});
			IngressVerifier.evaluate(headersWith(""));
			IngressVerifier.evaluate(headersWith(OLD_CURRENT));
			IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(reads(CURRENT)).toBe(1);
		});
	});

	describe("the next request sees the new values (R6.1, R6.6)", () => {

		it("accepts the new current value on the request after the mismatch", async () => {
			const id = nextId("rotated");
			await setUpSecret(id);
			behavior[CURRENT] = { value: NEW_CURRENT };
			behavior[PREVIOUS] = { value: OLD_CURRENT };

			const first = IngressVerifier.evaluate(headersWith(NEW_CURRENT));
			await flush();
			const second = IngressVerifier.evaluate(headersWith(NEW_CURRENT));

			expect(first).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(second).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("loads a previous version created after the container cached 'no previous version'", async () => {
			const id = nextId("late-previous");
			await setUpSecret(id); // AWSPREVIOUS answers ResourceNotFoundException: no previous version
			const previousReader = CachedParameterSecrets.get(`${id}#${PREVIOUS}`);
			expect(previousReader.secretValue()).toBeNull();
			expect(previousReader.cache.status).toBe(1);

			behavior[CURRENT] = { value: NEW_CURRENT };
			behavior[PREVIOUS] = { value: OLD_CURRENT };
			IngressVerifier.evaluate(headersWith(NEW_CURRENT));
			await flush();

			expect(reads(PREVIOUS)).toBe(1);
			expect(previousReader.secretValue()).toBe(OLD_CURRENT);
			expect(IngressVerifier.evaluate(headersWith(OLD_CURRENT))).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("still rejects a wrong header after the refresh, and starts no second refresh inside the cooldown", async () => {
			const id = nextId("still-wrong");
			await setUpSecret(id);
			behavior[CURRENT] = { value: NEW_CURRENT };
			behavior[PREVIOUS] = { value: OLD_CURRENT };

			IngressVerifier.evaluate(headersWith(NEW_CURRENT));
			await flush();
			const result = IngressVerifier.evaluate(headersWith(WRONG_HEADER));
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(reads(CURRENT)).toBe(1);
			expect(reads(PREVIOUS)).toBe(1);
		});
	});

	describe("a read that is already running is not started twice (R6.4)", () => {

		it("starts no second AWSCURRENT read while the first is still running, even after the cooldown", async () => {
			const id = nextId("running");
			await setUpSecret(id);
			let release;
			behavior[CURRENT] = { value: NEW_CURRENT, gate: new Promise((resolve) => { release = resolve; }) };

			IngressVerifier.evaluate(headersWith(NEW_CURRENT));
			await flush();
			expect(reads(CURRENT)).toBe(1);
			expect(CachedParameterSecrets.get(`${id}#${CURRENT}`).isRefreshing()).toBe(true);

			// The cooldown has passed, but the first read has not finished: the old value is still held.
			now = START_TIME + COOLDOWN_MS;
			const result = IngressVerifier.evaluate(headersWith(NEW_CURRENT));
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(reads(CURRENT)).toBe(1);

			release();
			await flush();
			expect(IngressVerifier.evaluate(headersWith(NEW_CURRENT))).toBe(IngressVerifier.RESULT.CLOUDFRONT);
			expect(reads(CURRENT)).toBe(1);
		});
	});

	describe("a failure of the refresh does not reach the request (R6.5)", () => {

		it("returns the mismatch and keeps the last good value when the read fails", async () => {
			await setUpSecret(nextId("read-fails"));
			behavior[CURRENT] = { error: new Error("mock read failure") };
			behavior[PREVIOUS] = { error: new Error("mock read failure") };

			let result;
			expect(() => { result = IngressVerifier.evaluate(headersWith(WRONG_HEADER)); }).not.toThrow();
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(reads(CURRENT)).toBe(1);
			// The old value is kept, so a request that carries it is still verified.
			expect(IngressVerifier.evaluate(headersWith(OLD_CURRENT))).toBe(IngressVerifier.RESULT.CLOUDFRONT);
		});

		it("returns the mismatch when refresh() throws synchronously, and still refreshes the other reader", async () => {
			const id = nextId("sync-throw");
			await setUpSecret(id);
			const current = CachedParameterSecrets.get(`${id}#${CURRENT}`);
			const previous = CachedParameterSecrets.get(`${id}#${PREVIOUS}`);
			const currentSpy = jest.spyOn(current, "refresh").mockImplementation(() => { throw new Error("sync failure"); });
			const previousSpy = jest.spyOn(previous, "refresh").mockResolvedValue(1);

			let result;
			expect(() => { result = IngressVerifier.evaluate(headersWith(WRONG_HEADER)); }).not.toThrow();
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(currentSpy).toHaveBeenCalledTimes(1);
			expect(previousSpy).toHaveBeenCalledTimes(1);
		});

		it("returns the mismatch when refresh() rejects", async () => {
			const id = nextId("reject");
			await setUpSecret(id);
			const current = CachedParameterSecrets.get(`${id}#${CURRENT}`);
			const previous = CachedParameterSecrets.get(`${id}#${PREVIOUS}`);
			const currentSpy = jest.spyOn(current, "refresh").mockRejectedValue(new Error("async failure"));
			const previousSpy = jest.spyOn(previous, "refresh").mockRejectedValue(new Error("async failure"));

			let result;
			expect(() => { result = IngressVerifier.evaluate(headersWith(WRONG_HEADER)); }).not.toThrow();
			await flush();

			expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
			expect(currentSpy).toHaveBeenCalledTimes(1);
			expect(previousSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("Property 8: the mismatch refresh is rate-limited (R6.2)", () => {

		/**
		 * **Validates: Requirements 6.2**
		 *
		 * For any non-decreasing list of mismatch times, with Date.now mocked, the number of forced
		 * refresh starts of the current reader is at most floor((last - first) / 60000) + 1, and two
		 * starts are never less than 60,000 ms apart.
		 *
		 * The generator draws gaps between mismatches. A gap is either small, close to the cooldown, or
		 * large, so the boundary is crossed often. The header starts with "!" and no secret does, so every
		 * request is a mismatch by construction (the generator is not filtered by a predicate).
		 */
		it("starts at most one refresh per 60 seconds for any non-decreasing list of mismatch times", async () => {
			const gapArbitrary = fc.oneof(
				fc.integer({ min: 0, max: 500 }),
				fc.integer({ min: COOLDOWN_MS - 1000, max: COOLDOWN_MS + 1000 }),
				fc.integer({ min: 0, max: 300000 })
			);
			const headerArbitrary = fc.string({ minLength: 0, maxLength: 20 }).map((text) => `!${text}`);

			await fc.assert(
				fc.asyncProperty(
					fc.array(gapArbitrary, { minLength: 1, maxLength: 25 }),
					headerArbitrary,
					async (gaps, header) => {
						await setUpSecret(nextId("property"));

						const times = [];
						let time = START_TIME;
						for (const gap of gaps) {
							time += gap;
							times.push(time);
						}

						for (const mismatchTime of times) {
							now = mismatchTime;
							const result = IngressVerifier.evaluate(headersWith(header));
							if (result !== IngressVerifier.RESULT.MISMATCH) { return false; }
							await flush(); // let the read finish so that "running" never hides a start
						}

						const starts = calls.filter((call) => call.VersionStage === CURRENT).map((call) => call.at);
						const first = times[0];
						const last = times[times.length - 1];
						const upperBound = Math.floor((last - first) / COOLDOWN_MS) + 1;

						if (starts.length < 1) { return false; } // the first mismatch always starts a refresh
						if (starts.length > upperBound) { return false; }
						for (let index = 1; index < starts.length; index++) {
							if (starts[index] - starts[index - 1] < COOLDOWN_MS) { return false; }
						}
						// AWSPREVIOUS is refreshed together with AWSCURRENT
						return reads(PREVIOUS) === starts.length;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
