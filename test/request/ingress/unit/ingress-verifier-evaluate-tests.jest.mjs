/**
 * Test: IngressVerifier.evaluate()
 *
 * Purpose: Verify the decision table of Requirement 3.2 row by row (including the order of the
 * rows), the previous-reader cases (absent, unusable, failing, never primed), rotation, the exact
 * comparison, the "never throws" rule, and the once-per-episode error counts (Requirement 10.4).
 * Also verifies that neither the header value nor a secret value reaches any log call.
 *
 * Setup:
 * - Every test uses a secret id unique to it, because CachedParameterSecrets has no reset.
 * - AWS.secrets is replaced with a mock that answers by version stage. No real AWS call is made,
 *   and no credential is read. The SDK transport is forced with ExtensionAvailability.setOverride(false).
 * - Secret values are made-up strings.
 * - Every DebugAndLog method is spied on so that error and warn calls can be counted and so that
 *   every argument can be searched for a secret value or a header value.
 *
 * Teardown: CACHE_DATA_INGRESS_SECRET_NAME and CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS are
 * restored, mocks are restored, ExtensionAvailability and IngressVerifier are reset.
 *
 * Known gap: the item "direct returns the same getProps() apart from two fields" needs the
 * ClientRequest wiring (task 7) and is covered by client-request-ingress-tests.jest.mjs.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-config-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-prime-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-mismatch-refresh-tests.jest.mjs
 * - test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs
 *
 * Requirements: 3.1 to 3.8, 10.1, 10.4
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import crypto from "node:crypto";
import { setImmediate as nodeSetImmediate } from "node:timers";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;

const ENV_NAME = IngressVerifier.ENV_SECRET_NAME;
const ENV_SECONDS = IngressVerifier.ENV_REFRESH_SECONDS;
const HEADER = IngressVerifier.SECRET_HEADER;
const RESULT = IngressVerifier.RESULT;

const ORIGINAL_NAME = process.env[ENV_NAME];
const ORIGINAL_SECONDS = process.env[ENV_SECONDS];

const LOG_METHODS = ["debug", "diag", "msg", "message", "info", "log", "warn", "warning", "error", "writeLog"];

let idCounter = 0;
let spies = {};
let sensitiveValues = [];

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test only
 */
function nextId(label) {
	idCounter += 1;
	return `ingress/evaluate/${label}-${idCounter}`;
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
 * Records fake values that must never appear in a log argument. Empty strings are ignored.
 *
 * @param {...string} values - Values to watch for
 * @returns {void}
 */
function track(...values) {
	for (const value of values) {
		if (typeof value === "string" && value !== "") {
			sensitiveValues.push(value);
		}
	}
}

/**
 * @returns {string} Every argument of every DebugAndLog call, serialized
 */
function allLoggedText() {
	const parts = [];
	for (const spy of Object.values(spies)) {
		for (const call of spy.mock.calls) {
			for (const arg of call) {
				try {
					parts.push(typeof arg === "string" ? arg : JSON.stringify(arg));
				} catch (error) { // eslint-disable-line no-unused-vars
					parts.push(String(arg));
				}
			}
		}
	}
	return parts.join("\n");
}

/**
 * @returns {number} Number of DebugAndLog.error calls so far in this test
 */
function errorCount() {
	return spies.error.mock.calls.length;
}

/**
 * Lets non-awaited refreshes finish.
 *
 * @returns {Promise<void>}
 */
async function settle() {
	for (let i = 0; i < 5; i += 1) {
		await new Promise((resolve) => nodeSetImmediate(resolve));
	}
}

/**
 * Replaces AWS.secrets with a mock that answers by version stage. A store entry that is a string
 * answers `{ SecretString }`, an Error is thrown, `null` throws ResourceNotFoundException, and an
 * object is returned as is.
 *
 * @param {{AWSCURRENT: (string|Error|null|object), AWSPREVIOUS: (string|Error|null|object)}} store - Mutable answers
 * @returns {jest.Mock} The mock for AWS.secrets.get
 */
function useSecrets(store) {
	ExtensionAvailability.setOverride(false);
	const get = jest.fn(async ({ VersionStage }) => {
		const entry = store[VersionStage];
		if (entry instanceof Error) { throw entry; }
		if (entry === null || entry === undefined) { throw namedError("ResourceNotFoundException", "no such version"); }
		if (typeof entry === "string") { return { SecretString: entry }; }
		return entry;
	});
	jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get, sdk: {} });
	return get;
}

/**
 * @param {string} id - Secret id
 * @param {string} stage - AWSCURRENT or AWSPREVIOUS
 * @returns {object} The reader registered by the verifier
 */
function readerOf(id, stage) {
	return CachedParameterSecrets.get(`${id}#${stage}`);
}

/**
 * Configures the verifier for a new secret and loads both readers through IngressVerifier.prime().
 *
 * @param {string} label - Short label for the test
 * @param {(string|Error|null|object)} current - Answer for AWSCURRENT
 * @param {(string|Error|null|object)} [previous] - Answer for AWSPREVIOUS (default: no previous version)
 * @returns {Promise<{id: string, store: object, get: jest.Mock}>} The context of the test
 */
async function load(label, current, previous = null) {
	const id = nextId(label);
	const store = { AWSCURRENT: current, AWSPREVIOUS: previous };
	const get = useSecrets(store);
	process.env[ENV_NAME] = id;
	await IngressVerifier.prime();
	return { id, store, get };
}

/**
 * Changes the answers and re-reads both readers, as a rotation followed by a refresh does.
 *
 * @param {{id: string, store: object}} context - Context returned by load()
 * @param {(string|Error|null|object)} current - New answer for AWSCURRENT
 * @param {(string|Error|null|object)} previous - New answer for AWSPREVIOUS
 * @returns {Promise<void>}
 */
async function rotate(context, current, previous) {
	context.store.AWSCURRENT = current;
	context.store.AWSPREVIOUS = previous;
	await readerOf(context.id, "AWSCURRENT").refresh();
	await readerOf(context.id, "AWSPREVIOUS").refresh();
}

/**
 * @param {string} value - Header value
 * @returns {object} A lowercased header map holding the secret header
 */
function withHeader(value) {
	return { [HEADER]: value };
}

describe("IngressVerifier.evaluate()", () => {

	beforeEach(() => {
		delete process.env[ENV_NAME];
		delete process.env[ENV_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		sensitiveValues = [];
		spies = {};
		for (const method of LOG_METHODS) {
			spies[method] = jest.spyOn(DebugAndLog, method).mockImplementation(() => {});
		}
	});

	afterEach(() => {
		try {
			const text = allLoggedText();
			for (const value of sensitiveValues) {
				expect(text.includes(value)).toBe(false);
			}
		} finally {
			jest.restoreAllMocks();
			ExtensionAvailability.reset();
			IngressVerifier.reset();
			if (ORIGINAL_NAME === undefined) { delete process.env[ENV_NAME]; } else { process.env[ENV_NAME] = ORIGINAL_NAME; }
			if (ORIGINAL_SECONDS === undefined) { delete process.env[ENV_SECONDS]; } else { process.env[ENV_SECONDS] = ORIGINAL_SECONDS; }
		}
	});

	describe("result objects", () => {

		it("exposes eight frozen results with the documented shape", () => {
			const expected = {
				DIRECT: ["direct", null],
				CLOUDFRONT: ["cloudfront", null],
				MISSING_HEADER: ["unverified", "missing-header"],
				MISMATCH: ["unverified", "mismatch"],
				SECRET_NOT_PRIMED: ["unverified", "secret-not-primed"],
				SECRET_UNAVAILABLE: ["unverified", "secret-unavailable"],
				SECRET_UNUSABLE: ["unverified", "secret-unusable"],
				BAD_CONFIGURATION: ["unverified", "bad-configuration"]
			};
			expect(Object.keys(RESULT).sort()).toEqual(Object.keys(expected).sort());
			for (const [name, [ingress, reason]] of Object.entries(expected)) {
				expect(RESULT[name]).toEqual({ ingress, reason });
				expect(Object.isFrozen(RESULT[name])).toBe(true);
			}
		});

		it("returns synchronously, not a promise", () => {
			const result = IngressVerifier.evaluate({});
			expect(typeof result.then).toBe("undefined");
		});

	});

	describe("row 1: variable not configured (R3.2, R10.1)", () => {

		it("returns direct when the variable is unset", () => {
			const get = useSecrets({ AWSCURRENT: "unused-value", AWSPREVIOUS: null });
			expect(IngressVerifier.evaluate({})).toBe(RESULT.DIRECT);
			expect(get).not.toHaveBeenCalled();
		});

		it("returns direct when the variable is an empty string", () => {
			process.env[ENV_NAME] = "";
			expect(IngressVerifier.evaluate({})).toBe(RESULT.DIRECT);
		});

		it("returns direct when the variable is only whitespace", () => {
			process.env[ENV_NAME] = " \t ";
			expect(IngressVerifier.evaluate({})).toBe(RESULT.DIRECT);
		});

		it("returns direct whatever the headers hold", () => {
			track("test-secret-value-direct");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-direct"))).toBe(RESULT.DIRECT);
			expect(IngressVerifier.evaluate(undefined)).toBe(RESULT.DIRECT);
			expect(IngressVerifier.evaluate(null)).toBe(RESULT.DIRECT);
			expect(IngressVerifier.evaluate("not an object")).toBe(RESULT.DIRECT);
		});

		it("writes nothing to the log for direct", () => {
			IngressVerifier.evaluate({});
			expect(allLoggedText()).toBe("");
		});

	});

	describe("row 2: variable set and invalid (R3.2)", () => {

		it("returns bad-configuration for an invalid secret name", () => {
			process.env[ENV_NAME] = "not a valid name with spaces";
			expect(IngressVerifier.evaluate({})).toBe(RESULT.BAD_CONFIGURATION);
		});

		it("returns bad-configuration for an over-long secret name", () => {
			process.env[ENV_NAME] = "a".repeat(2049);
			expect(IngressVerifier.evaluate({})).toBe(RESULT.BAD_CONFIGURATION);
		});

		it("returns bad-configuration even when the header is present, and makes no AWS call", () => {
			const get = useSecrets({ AWSCURRENT: "test-secret-value-bad", AWSPREVIOUS: null });
			track("test-secret-value-bad");
			process.env[ENV_NAME] = "not a valid name with spaces";
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-bad"))).toBe(RESULT.BAD_CONFIGURATION);
			expect(get).not.toHaveBeenCalled();
		});

		it("is not direct (only an unset or empty variable gives direct)", () => {
			process.env[ENV_NAME] = "not a valid name with spaces";
			expect(IngressVerifier.evaluate({}).ingress).not.toBe("direct");
		});

		it("logs one error across many requests (R10.4)", () => {
			process.env[ENV_NAME] = "not a valid name with spaces";
			for (let i = 0; i < 10; i += 1) {
				IngressVerifier.evaluate({});
			}
			expect(errorCount()).toBe(1);
		});

	});

	describe("row 3: current reader never finished a read (R3.2)", () => {

		it("returns secret-not-primed before any read and makes no AWS call", () => {
			const get = useSecrets({ AWSCURRENT: "test-secret-value-np", AWSPREVIOUS: null });
			track("test-secret-value-np");
			process.env[ENV_NAME] = nextId("not-primed");

			expect(IngressVerifier.evaluate(withHeader("test-secret-value-np"))).toBe(RESULT.SECRET_NOT_PRIMED);
			expect(get).not.toHaveBeenCalled();
		});

		it("returns secret-not-primed even when the header is missing (row 3 precedes row 6)", () => {
			useSecrets({ AWSCURRENT: "test-secret-value-np2", AWSPREVIOUS: null });
			process.env[ENV_NAME] = nextId("not-primed-no-header");
			expect(IngressVerifier.evaluate({})).toBe(RESULT.SECRET_NOT_PRIMED);
		});

		it("logs one error across many requests, naming the prime call and no value", () => {
			useSecrets({ AWSCURRENT: "test-secret-value-np3", AWSPREVIOUS: null });
			track("test-secret-value-np3");
			process.env[ENV_NAME] = nextId("not-primed-episode");

			for (let i = 0; i < 25; i += 1) {
				expect(IngressVerifier.evaluate(withHeader("test-secret-value-np3"))).toBe(RESULT.SECRET_NOT_PRIMED);
			}

			expect(errorCount()).toBe(1);
			expect(spies.error.mock.calls[0][0]).toContain("ClientRequest.prime()");
		});

		it("starts no mismatch refresh", async () => {
			const get = useSecrets({ AWSCURRENT: "test-secret-value-np4", AWSPREVIOUS: null });
			process.env[ENV_NAME] = nextId("not-primed-no-refresh");
			IngressVerifier.evaluate(withHeader("something-else"));
			await settle();
			expect(get).not.toHaveBeenCalled();
		});

	});

	describe("row 4: current reader finished a read and holds no value (R3.2, R3.3)", () => {

		it("returns secret-unavailable when the read fails", async () => {
			await load("unavailable", new Error("service down"));
			expect(IngressVerifier.evaluate(withHeader("anything"))).toBe(RESULT.SECRET_UNAVAILABLE);
		});

		it("returns secret-unavailable when the answer has no SecretString", async () => {
			await load("unavailable-binary", { SecretBinary: "AAAA" });
			expect(IngressVerifier.evaluate(withHeader("anything"))).toBe(RESULT.SECRET_UNAVAILABLE);
		});

		it("returns secret-unavailable even when the header is missing (row 4 precedes row 6)", async () => {
			await load("unavailable-no-header", new Error("service down"));
			expect(IngressVerifier.evaluate({})).toBe(RESULT.SECRET_UNAVAILABLE);
		});

		it("is not rescued by a good previous value", async () => {
			track("test-secret-value-prev-only");
			await load("unavailable-prev-good", new Error("service down"), "test-secret-value-prev-only");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-prev-only"))).toBe(RESULT.SECRET_UNAVAILABLE);
		});

		it("makes no further error after the reader's own episode error, across many requests", async () => {
			await load("unavailable-episode", new Error("service down"));
			const afterPrime = errorCount();
			expect(afterPrime).toBe(1);

			for (let i = 0; i < 25; i += 1) {
				expect(IngressVerifier.evaluate({})).toBe(RESULT.SECRET_UNAVAILABLE);
			}
			expect(errorCount()).toBe(afterPrime);
		});

		it("starts no mismatch refresh", async () => {
			const { get } = await load("unavailable-no-refresh", new Error("service down"));
			const calls = get.mock.calls.length;
			IngressVerifier.evaluate(withHeader("anything"));
			await settle();
			expect(get.mock.calls.length).toBe(calls);
		});

	});

	describe("row 5: current value unusable (R3.2)", () => {

		const unusableValues = [
			["an empty string", ""],
			["spaces", "   "],
			["a tab and newline", "\t\n"],
			["BLANK", "BLANK"],
			["blank in lower case", "blank"],
			["Blank with surrounding whitespace", "  Blank\n"]
		];

		for (const [label, value] of unusableValues) {
			it(`returns secret-unusable for ${label}`, async () => {
				await load(`unusable-${label.replace(/\W+/g, "-")}`, value);
				expect(IngressVerifier.evaluate(withHeader("anything"))).toBe(RESULT.SECRET_UNUSABLE);
			});

			it(`never verifies a header equal to ${label}`, async () => {
				await load(`unusable-equal-${label.replace(/\W+/g, "-")}`, value);
				expect(IngressVerifier.evaluate(withHeader(value)).ingress).toBe("unverified");
			});
		}

		it("returns secret-unusable even when the header is missing (row 5 precedes row 6)", async () => {
			await load("unusable-no-header", "BLANK");
			expect(IngressVerifier.evaluate({})).toBe(RESULT.SECRET_UNUSABLE);
		});

		it("is not rescued by a good previous value", async () => {
			track("test-secret-value-prev-good");
			await load("unusable-prev-good", "BLANK", "test-secret-value-prev-good");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-prev-good"))).toBe(RESULT.SECRET_UNUSABLE);
		});

		it("accepts a value that only contains BLANK as part of it", async () => {
			await load("usable-blank-inside", "BLANK-test-value");
			expect(IngressVerifier.evaluate(withHeader("BLANK-test-value"))).toBe(RESULT.CLOUDFRONT);
		});

		it("starts no mismatch refresh", async () => {
			const { get } = await load("unusable-no-refresh", "BLANK");
			const calls = get.mock.calls.length;
			IngressVerifier.evaluate(withHeader("anything"));
			await settle();
			expect(get.mock.calls.length).toBe(calls);
		});

	});

	describe("row 6: header absent, empty, or not a string (R3.2, R3.6)", () => {

		const missingHeaders = [
			["no header", {}],
			["undefined headers", undefined],
			["null headers", null],
			["a string instead of a map", "x-atlantis-origin-secret"],
			["a number instead of a map", 42],
			["an array instead of a map", []],
			["an undefined header value", { [HEADER]: undefined }],
			["a null header value", { [HEADER]: null }],
			["an empty string", { [HEADER]: "" }],
			["an array of the secret", { [HEADER]: ["test-secret-value-m1"] }],
			["a number", { [HEADER]: 12345 }],
			["a boolean", { [HEADER]: true }],
			["an object", { [HEADER]: { value: "test-secret-value-m1" } }],
			["the header under a non-lowercase key", { "X-Atlantis-Origin-Secret": "test-secret-value-m1" }],
			["the header only in multiValueHeaders", { multiValueHeaders: { [HEADER]: ["test-secret-value-m1"] } }]
		];

		for (const [label, headers] of missingHeaders) {
			it(`returns missing-header for ${label}`, async () => {
				track("test-secret-value-m1");
				await load(`missing-${label.replace(/\W+/g, "-")}`, "test-secret-value-m1");
				expect(IngressVerifier.evaluate(headers)).toBe(RESULT.MISSING_HEADER);
			});
		}

		it("starts no mismatch refresh", async () => {
			const { get } = await load("missing-no-refresh", "test-secret-value-m2");
			const calls = get.mock.calls.length;
			IngressVerifier.evaluate({});
			await settle();
			expect(get.mock.calls.length).toBe(calls);
		});

	});

	describe("row 7: header equals the current or a usable previous value (R3.2 to R3.5)", () => {

		it("returns cloudfront when the header equals the current value", async () => {
			track("test-secret-value-1");
			await load("current-match", "test-secret-value-1");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-1"))).toBe(RESULT.CLOUDFRONT);
		});

		it("returns cloudfront when the header equals the previous value", async () => {
			track("test-secret-value-cur", "test-secret-value-prev");
			await load("previous-match", "test-secret-value-cur", "test-secret-value-prev");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-prev"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur"))).toBe(RESULT.CLOUDFRONT);
		});

		it("compares the whole SecretString with no JSON parsing (R3.5)", async () => {
			const json = "{\"token\":\"test-json-secret\"}";
			track(json);
			await load("whole-string", json);
			expect(IngressVerifier.evaluate(withHeader(json))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-json-secret"))).toBe(RESULT.MISMATCH);
		});

		it("does not trim the secret or the header (R3.5)", async () => {
			track("  padded-test-secret  ");
			await load("no-trim", "  padded-test-secret  ");
			expect(IngressVerifier.evaluate(withHeader("  padded-test-secret  "))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("padded-test-secret"))).toBe(RESULT.MISMATCH);
			expect(IngressVerifier.evaluate(withHeader("  padded-test-secret"))).toBe(RESULT.MISMATCH);
		});

		it("compares case-sensitively", async () => {
			await load("case-sensitive", "Test-Secret-Value-Case");
			expect(IngressVerifier.evaluate(withHeader("Test-Secret-Value-Case"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-case"))).toBe(RESULT.MISMATCH);
		});

		it("handles a non-ASCII secret", async () => {
			const value = "tést-sécret-値-1";
			track(value);
			await load("unicode", value);
			expect(IngressVerifier.evaluate(withHeader(value))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-1"))).toBe(RESULT.MISMATCH);
		});

		it("compares both accepted values on every evaluation that reaches row 7 (R3.4)", async () => {
			await load("both-compared", "test-secret-value-c", "test-secret-value-p");
			const spy = jest.spyOn(crypto, "timingSafeEqual");

			IngressVerifier.evaluate(withHeader("test-secret-value-c"));
			expect(spy).toHaveBeenCalledTimes(2);

			spy.mockClear();
			IngressVerifier.evaluate(withHeader("test-secret-value-p"));
			expect(spy).toHaveBeenCalledTimes(2);

			spy.mockClear();
			IngressVerifier.evaluate(withHeader("test-secret-value-x"));
			expect(spy).toHaveBeenCalledTimes(2);
			await settle();
		});

		it("compares 32-byte digests, so header length does not matter (R3.4)", async () => {
			await load("digest-length", "test-secret-value-d", "test-secret-value-e");
			const spy = jest.spyOn(crypto, "timingSafeEqual");

			IngressVerifier.evaluate(withHeader("x"));
			IngressVerifier.evaluate(withHeader("y".repeat(10000)));
			await settle();

			expect(spy.mock.calls.length).toBeGreaterThan(0);
			for (const [left, right] of spy.mock.calls) {
				expect(left.length).toBe(32);
				expect(right.length).toBe(32);
			}
		});

		it("compares one value when there is no usable previous value", async () => {
			await load("one-compared", "test-secret-value-c2", null);
			const spy = jest.spyOn(crypto, "timingSafeEqual");
			IngressVerifier.evaluate(withHeader("test-secret-value-c2"));
			expect(spy).toHaveBeenCalledTimes(1);
		});

	});

	describe("row 8: mismatch (R3.2, R3.8)", () => {

		it("returns mismatch for a wrong header", async () => {
			track("test-secret-value-wrong");
			await load("mismatch", "test-secret-value-right");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-wrong"))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("returns mismatch when the header differs only in the last character", async () => {
			await load("mismatch-last", "test-secret-value-abc");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-abd"))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("returns mismatch for a header that is a prefix or an extension of the secret", async () => {
			await load("mismatch-prefix", "test-secret-value-abc");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-ab"))).toBe(RESULT.MISMATCH);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-abcd"))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("does not throw for a very long header", async () => {
			await load("mismatch-long", "test-secret-value-long");
			expect(IngressVerifier.evaluate(withHeader("z".repeat(200000)))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("never gives cloudfront in rows 2 to 5 even when the header equals the secret (R3.8, R10.1)", async () => {
			const header = "test-secret-value-r38";
			track(header);

			process.env[ENV_NAME] = "not a valid name with spaces";
			expect(IngressVerifier.evaluate(withHeader(header)).ingress).toBe("unverified");

			IngressVerifier.reset();
			process.env[ENV_NAME] = nextId("r38-not-primed");
			useSecrets({ AWSCURRENT: header, AWSPREVIOUS: header });
			expect(IngressVerifier.evaluate(withHeader(header)).ingress).toBe("unverified");

			IngressVerifier.reset();
			await load("r38-unavailable", new Error("service down"), header);
			expect(IngressVerifier.evaluate(withHeader(header)).ingress).toBe("unverified");

			IngressVerifier.reset();
			await load("r38-unusable", "BLANK", header);
			expect(IngressVerifier.evaluate(withHeader(header)).ingress).toBe("unverified");
		});

	});

	describe("previous reader cases (R3.3)", () => {

		it("treats a missing previous version as absent: current verifies, others mismatch, no unavailable", async () => {
			track("test-secret-value-cur1");
			await load("prev-missing", "test-secret-value-cur1", null);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur1"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("something-else"))).toBe(RESULT.MISMATCH);
			expect(IngressVerifier.evaluate({})).toBe(RESULT.MISSING_HEADER);
			expect(errorCount()).toBe(0);
			await settle();
		});

		it("treats a failing previous read as absent and logs no error", async () => {
			track("test-secret-value-cur2");
			const { id } = await load("prev-failing", "test-secret-value-cur2", new Error("previous read failed"));
			expect(readerOf(id, "AWSPREVIOUS").secretValue()).toBeNull();
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur2"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("something-else"))).toBe(RESULT.MISMATCH);
			expect(errorCount()).toBe(0);
			await settle();
		});

		const unusablePrevious = [
			["BLANK", "BLANK"],
			["an empty string", ""],
			["spaces", "   "]
		];

		for (const [label, value] of unusablePrevious) {
			it(`ignores an unusable previous value (${label})`, async () => {
				track("test-secret-value-cur3");
				await load(`prev-unusable-${label.replace(/\W+/g, "-")}`, "test-secret-value-cur3", value);
				expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur3"))).toBe(RESULT.CLOUDFRONT);
				if (value !== "") {
					expect(IngressVerifier.evaluate(withHeader(value))).toBe(RESULT.MISMATCH);
				}
				await settle();
			});
		}

		it("ignores a previous reader that has never been primed", async () => {
			track("test-secret-value-cur4");
			const id = nextId("prev-not-primed");
			const store = { AWSCURRENT: "test-secret-value-cur4", AWSPREVIOUS: "test-secret-value-prev4" };
			track("test-secret-value-prev4");
			useSecrets(store);
			process.env[ENV_NAME] = id;
			IngressVerifier.register();
			await readerOf(id, "AWSCURRENT").refresh();

			expect(readerOf(id, "AWSPREVIOUS").hasSettled()).toBe(false);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur4"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-prev4"))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("does not let an unusable previous value hide a good current value", async () => {
			await load("prev-blank-cur-good", "test-secret-value-cur5", "blank");
			expect(IngressVerifier.evaluate(withHeader("blank"))).toBe(RESULT.MISMATCH);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-cur5"))).toBe(RESULT.CLOUDFRONT);
			await settle();
		});

	});

	describe("rotation (R3.2, R3.3)", () => {

		it("accepts the old value through the previous reader after one rotation, and the new value", async () => {
			track("test-secret-value-A", "test-secret-value-B");
			const context = await load("rotation-one", "test-secret-value-A", null);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A"))).toBe(RESULT.CLOUDFRONT);

			await rotate(context, "test-secret-value-B", "test-secret-value-A");

			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-B"))).toBe(RESULT.CLOUDFRONT);
		});

		it("rejects a value that is two rotations old", async () => {
			track("test-secret-value-A2", "test-secret-value-B2", "test-secret-value-C2");
			const context = await load("rotation-two", "test-secret-value-A2", null);

			await rotate(context, "test-secret-value-B2", "test-secret-value-A2");
			await rotate(context, "test-secret-value-C2", "test-secret-value-B2");

			expect(IngressVerifier.evaluate(withHeader("test-secret-value-C2"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-B2"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A2"))).toBe(RESULT.MISMATCH);
			await settle();
		});

		it("rejects the old value once the previous label is gone", async () => {
			const context = await load("rotation-label-gone", "test-secret-value-A3", null);
			await rotate(context, "test-secret-value-B3", "test-secret-value-A3");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A3"))).toBe(RESULT.CLOUDFRONT);

			await rotate(context, "test-secret-value-B3", null);

			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A3"))).toBe(RESULT.MISMATCH);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-B3"))).toBe(RESULT.CLOUDFRONT);
			await settle();
		});

		it("keeps the last good current value when a later read fails", async () => {
			const context = await load("rotation-read-fails", "test-secret-value-A4", null);
			context.store.AWSCURRENT = new Error("service down");
			await readerOf(context.id, "AWSCURRENT").refresh();

			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A4"))).toBe(RESULT.CLOUDFRONT);
		});

		it("follows a current value that becomes unusable and then usable again", async () => {
			const context = await load("rotation-unusable", "test-secret-value-A5", null);

			await rotate(context, "BLANK", "test-secret-value-A5");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A5"))).toBe(RESULT.SECRET_UNUSABLE);

			await rotate(context, "test-secret-value-B5", "test-secret-value-A5");
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-B5"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-A5"))).toBe(RESULT.CLOUDFRONT);
		});

	});

	describe("never throws (R3.7)", () => {

		// Known discrepancy (reported in task 5.3): evaluate() clears the failure episodes before it reads
		// the header, so an exception raised while reading the header logs on every request instead of
		// once per episode (R10.4). The design pseudocode has the same order.
		it("returns secret-unavailable and logs one error when reading the header throws", async () => {
			track("test-secret-value-t1");
			await load("throws-header", "test-secret-value-t1");
			const exploding = new Proxy({}, { get() { throw new Error("headers exploded"); } });

			const baseline = errorCount();
			for (let i = 0; i < 5; i += 1) {
				expect(IngressVerifier.evaluate(exploding)).toBe(RESULT.SECRET_UNAVAILABLE);
			}

			expect(errorCount() - baseline).toBe(1);
			expect(spies.error.mock.calls[baseline][0]).toContain("headers exploded");
		});

		it("returns secret-unavailable when a reader throws, without leaking a value", async () => {
			track("test-secret-value-t2");
			const { id } = await load("throws-reader", "test-secret-value-t2");
			jest.spyOn(readerOf(id, "AWSCURRENT"), "secretValue").mockImplementation(() => {
				throw new Error("reader exploded");
			});

			const baseline = errorCount();
			for (let i = 0; i < 5; i += 1) {
				expect(IngressVerifier.evaluate(withHeader("test-secret-value-t2"))).toBe(RESULT.SECRET_UNAVAILABLE);
			}
			expect(errorCount() - baseline).toBe(1);
		});

		it("verifies again once the failure is gone, and logs a new error if it comes back", async () => {
			track("test-secret-value-t3");
			await load("throws-recovers", "test-secret-value-t3");
			const exploding = new Proxy({}, { get() { throw new Error("headers exploded"); } });
			const baseline = errorCount();

			expect(IngressVerifier.evaluate(exploding)).toBe(RESULT.SECRET_UNAVAILABLE);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-t3"))).toBe(RESULT.CLOUDFRONT);
			expect(IngressVerifier.evaluate(exploding)).toBe(RESULT.SECRET_UNAVAILABLE);

			expect(errorCount() - baseline).toBe(2);
		});

		it("does not throw for odd inputs", async () => {
			await load("odd-inputs", "test-secret-value-t4");
			const inputs = [undefined, null, 0, 1, "", "text", true, [], [1, 2], () => {}, Symbol("s"), Object.create(null)];
			for (const input of inputs) {
				expect(() => IngressVerifier.evaluate(input)).not.toThrow();
				expect(IngressVerifier.evaluate(input)).toBe(RESULT.MISSING_HEADER);
			}
		});

	});

	describe("error episodes (R10.4)", () => {

		it("logs the unusable value once across many requests, and again after recovery", async () => {
			const context = await load("episode-unusable", "BLANK", null);
			const baseline = errorCount();

			for (let i = 0; i < 25; i += 1) {
				expect(IngressVerifier.evaluate(withHeader("anything"))).toBe(RESULT.SECRET_UNUSABLE);
			}
			expect(errorCount() - baseline).toBe(1);
			expect(spies.error.mock.calls[baseline][0]).toContain(context.id);

			await rotate(context, "test-secret-value-e1", null);
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-e1"))).toBe(RESULT.CLOUDFRONT);
			expect(errorCount() - baseline).toBe(1);

			await rotate(context, "   ", null);
			for (let i = 0; i < 25; i += 1) {
				expect(IngressVerifier.evaluate(withHeader("anything"))).toBe(RESULT.SECRET_UNUSABLE);
			}
			expect(errorCount() - baseline).toBe(2);
		});

		it("does not end the unusable episode on a request that fails earlier or later in the table", async () => {
			await load("episode-stays", "BLANK", null);
			const baseline = errorCount();

			IngressVerifier.evaluate({});
			IngressVerifier.evaluate(withHeader("anything"));
			IngressVerifier.evaluate(undefined);

			expect(errorCount() - baseline).toBe(1);
		});

		it("ends an episode only when evaluate reaches the comparison", async () => {
			const context = await load("episode-ends", "BLANK", null);
			const baseline = errorCount();

			IngressVerifier.evaluate({});
			expect(errorCount() - baseline).toBe(1);

			await rotate(context, "test-secret-value-e2", null);
			// A request with no header reaches row 6, so the episode has ended
			expect(IngressVerifier.evaluate({})).toBe(RESULT.MISSING_HEADER);

			await rotate(context, "BLANK", null);
			IngressVerifier.evaluate({});
			expect(errorCount() - baseline).toBe(2);
		});

		it("logs the reader failure once while the read keeps failing, and again after a successful read", async () => {
			const context = await load("episode-reader", new Error("service down"), null);
			const afterPrime = errorCount();
			expect(afterPrime).toBe(1);

			const reader = readerOf(context.id, "AWSCURRENT");
			await reader.refresh();
			await reader.refresh();
			for (let i = 0; i < 10; i += 1) {
				IngressVerifier.evaluate(withHeader("anything"));
			}
			expect(errorCount()).toBe(afterPrime);

			context.store.AWSCURRENT = "test-secret-value-e3";
			await reader.refresh();
			expect(IngressVerifier.evaluate(withHeader("test-secret-value-e3"))).toBe(RESULT.CLOUDFRONT);
			expect(errorCount()).toBe(afterPrime);

			context.store.AWSCURRENT = new Error("service down again");
			await reader.refresh();
			expect(errorCount()).toBe(afterPrime + 1);
		});

		it("logs no error for a previous reader that fails, however many requests arrive", async () => {
			await load("episode-previous", "test-secret-value-e4", new Error("previous failed"));
			for (let i = 0; i < 10; i += 1) {
				IngressVerifier.evaluate(withHeader("test-secret-value-e4"));
			}
			expect(errorCount()).toBe(0);
		});

		it("writes no warning from evaluate itself on a good request", async () => {
			await load("episode-no-warn", "test-secret-value-e5", null);
			const warnings = spies.warn.mock.calls.length;
			IngressVerifier.evaluate(withHeader("test-secret-value-e5"));
			expect(spies.warn.mock.calls.length).toBe(warnings);
		});

	});

	describe("secrecy (R10.1, R10.2)", () => {

		it("writes neither the header nor a secret value to any log call across all outcomes", async () => {
			const secret = "test-secret-value-s1";
			const previous = "test-secret-value-s0";
			const wrongHeader = "test-header-value-wrong";
			track(secret, previous, wrongHeader);

			const context = await load("secrecy", secret, previous);
			IngressVerifier.evaluate(withHeader(secret));
			IngressVerifier.evaluate(withHeader(previous));
			IngressVerifier.evaluate(withHeader(wrongHeader));
			IngressVerifier.evaluate({});
			await settle();

			await rotate(context, new Error("service down"), previous);
			await rotate(context, "BLANK", previous);
			IngressVerifier.evaluate(withHeader(wrongHeader));
			await settle();

			const text = allLoggedText();
			expect(text.includes(secret)).toBe(false);
			expect(text.includes(previous)).toBe(false);
			expect(text.includes(wrongHeader)).toBe(false);
		});

	});

});
