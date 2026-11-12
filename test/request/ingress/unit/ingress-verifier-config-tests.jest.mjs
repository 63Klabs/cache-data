/**
 * Test: IngressVerifier configuration (CACHE_DATA_INGRESS_SECRET_NAME and
 * CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS)
 *
 * Purpose: Verify how the verifier reads its two environment variables: unset, empty,
 * whitespace, valid, invalid, and over-long secret ids; the memo by raw value; one error per
 * distinct bad value; the interval parse and range; idempotent register(); and that no reader,
 * read, or log is produced when the check is unset or invalid.
 *
 * Setup:
 * - beforeEach deletes both variables, calls IngressVerifier.reset(), and forces the SDK path.
 * - AWS.secrets is mocked so a stray read would be counted. No real AWS call is made and no
 *   credential is read.
 * - DebugAndLog methods are mocked so error and warning calls can be counted.
 * - Each test uses a secret id unique to it, because CachedParameterSecrets has no reset.
 *
 * Teardown: environment variables and mocks are restored.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 * - test/request/ingress/unit/ingress-secret-readers-tests.jest.mjs
 *
 * Requirements: 1.1 to 1.7
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;
const ParameterKeySafety = (await import("../../../../src/lib/utils/ParameterKeySafety.class.js")).default;
const readersModule = (await import("../../../../src/lib/utils/IngressSecretReaders.classes.js")).default;
const { IngressCurrentSecretReader, IngressPreviousSecretReader } = readersModule;

const NAME_VAR = "CACHE_DATA_INGRESS_SECRET_NAME";
const SECONDS_VAR = "CACHE_DATA_INGRESS_SECRET_REFRESH_SECONDS";

let originalName;
let originalSeconds;
let idCounter = 0;
let spies;
let secretsGet;

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test only. It contains "/" so that it looks like a real name.
 */
function nextId(label) {
	idCounter += 1;
	return `ingress-config/${label}-${idCounter}`;
}

/**
 * @param {string} id - Secret id
 * @returns {Array<string>} Registry keys that belong to the id
 */
function registeredFor(id) {
	return CachedParameterSecrets.getNames().filter((name) => name.startsWith(`${id}#`));
}

/**
 * @returns {number} Number of readers in the registry
 */
function registrySize() {
	return CachedParameterSecrets.getNames().length;
}

/**
 * @param {jest.SpyInstance} spy - Spy on a DebugAndLog method
 * @param {string} text - Text the first argument must contain
 * @returns {Array<string>} Messages written to the spy that contain the text
 */
function messagesContaining(spy, text) {
	return spy.mock.calls
		.map((call) => call[0])
		.filter((message) => typeof message === "string" && message.includes(text));
}

/**
 * @returns {number} Total number of DebugAndLog calls recorded by all spies
 */
function totalLogCalls() {
	return Object.values(spies).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}

/**
 * Builds a secret ARN without writing an account id into the file.
 *
 * @param {string} name - Secret name part
 * @returns {string} An ARN-shaped secret id
 */
function arnFor(name) {
	return ["arn", "aws", "secretsmanager", "us-east-2", "0".repeat(12), "secret", name].join(":");
}

/**
 * @param {string} id - Secret id registered by the verifier
 * @returns {object} The current reader
 */
function currentReader(id) {
	return CachedParameterSecrets.get(`${id}#AWSCURRENT`);
}

/**
 * @param {string} id - Secret id registered by the verifier
 * @returns {object} The previous reader
 */
function previousReader(id) {
	return CachedParameterSecrets.get(`${id}#AWSPREVIOUS`);
}

beforeEach(() => {
	originalName = process.env[NAME_VAR];
	originalSeconds = process.env[SECONDS_VAR];
	delete process.env[NAME_VAR];
	delete process.env[SECONDS_VAR];
	IngressVerifier.reset();
	ExtensionAvailability.reset();
	ExtensionAvailability.markUnavailable(ExtensionAvailability.REASON.OVERRIDE);

	spies = {
		error: jest.spyOn(DebugAndLog, "error").mockImplementation(async () => {}),
		warn: jest.spyOn(DebugAndLog, "warn").mockImplementation(async () => {}),
		debug: jest.spyOn(DebugAndLog, "debug").mockImplementation(async () => {}),
		info: jest.spyOn(DebugAndLog, "info").mockImplementation(async () => {}),
		log: jest.spyOn(DebugAndLog, "log").mockImplementation(async () => {})
	};
	secretsGet = jest.fn(async () => ({ SecretString: "unused-test-value" }));
	jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get: secretsGet, sdk: {} });
});

afterEach(() => {
	if (originalName === undefined) { delete process.env[NAME_VAR]; } else { process.env[NAME_VAR] = originalName; }
	if (originalSeconds === undefined) { delete process.env[SECONDS_VAR]; } else { process.env[SECONDS_VAR] = originalSeconds; }
	jest.restoreAllMocks();
	IngressVerifier.reset();
	ExtensionAvailability.reset();
});

describe("IngressVerifier configuration constants", () => {
	it("exposes the variable names, the default, and the range", () => {
		expect(IngressVerifier.ENV_SECRET_NAME).toBe(NAME_VAR);
		expect(IngressVerifier.ENV_REFRESH_SECONDS).toBe(SECONDS_VAR);
		expect(IngressVerifier.DEFAULT_REFRESH_SECONDS).toBe(3600);
		expect(IngressVerifier.MIN_REFRESH_SECONDS).toBe(60);
		expect(IngressVerifier.MAX_REFRESH_SECONDS).toBe(86400);
	});
});

describe("Secret variable: not configured (R1.1)", () => {
	it.each([
		["unset", undefined],
		["empty", ""],
		["spaces", "   "],
		["tabs and newlines", " \t\n "]
	])("treats a %s variable as not configured: direct, no reader, no read, no log", (label, raw) => {
		if (raw !== undefined) { process.env[NAME_VAR] = raw; }
		const sizeBefore = registrySize();

		IngressVerifier.register();
		const first = IngressVerifier.evaluate({});
		const second = IngressVerifier.evaluate({ [IngressVerifier.SECRET_HEADER]: "anything" });

		expect(first).toBe(IngressVerifier.RESULT.DIRECT);
		expect(second).toBe(IngressVerifier.RESULT.DIRECT);
		expect(first).toEqual({ ingress: "direct", reason: null });
		expect(registrySize()).toBe(sizeBefore);
		expect(secretsGet).not.toHaveBeenCalled();
		expect(totalLogCalls()).toBe(0);
	});

	it("does not read the interval variable when the check is not configured", () => {
		process.env[SECONDS_VAR] = "not-a-number";

		IngressVerifier.register();
		IngressVerifier.evaluate({});

		expect(spies.warn).not.toHaveBeenCalled();
		expect(totalLogCalls()).toBe(0);
	});
});

describe("Secret variable: valid (R1.2)", () => {
	it("creates and registers both readers under their own keys", () => {
		const id = nextId("valid");
		process.env[NAME_VAR] = id;

		IngressVerifier.register();

		expect(registeredFor(id).sort()).toEqual([`${id}#AWSCURRENT`, `${id}#AWSPREVIOUS`]);
		expect(currentReader(id)).toBeInstanceOf(IngressCurrentSecretReader);
		expect(previousReader(id)).toBeInstanceOf(IngressPreviousSecretReader);
		expect(currentReader(id).name).toBe(id);
		expect(previousReader(id).name).toBe(id);
		expect(secretsGet).not.toHaveBeenCalled();
		expect(spies.error).not.toHaveBeenCalled();
		expect(spies.warn).not.toHaveBeenCalled();
	});

	it("uses the trimmed value as the secret id for both readers", () => {
		const id = nextId("trimmed");
		process.env[NAME_VAR] = `  \t${id}\n `;

		IngressVerifier.register();

		expect(currentReader(id)).toBeDefined();
		expect(previousReader(id)).toBeDefined();
		expect(currentReader(id).name).toBe(id);
		expect(previousReader(id).name).toBe(id);
		expect(spies.error).not.toHaveBeenCalled();
	});

	it("accepts a secret ARN", () => {
		const id = arnFor(`ingress-config-arn-${++idCounter}`);
		process.env[NAME_VAR] = id;

		IngressVerifier.register();

		expect(currentReader(id)).toBeDefined();
		expect(previousReader(id)).toBeDefined();
		expect(spies.error).not.toHaveBeenCalled();
	});

	it("accepts a secret id of exactly 2048 characters", () => {
		const id = `ingress-config/long-${++idCounter}-`.padEnd(2048, "a");
		expect(id.length).toBe(2048);
		process.env[NAME_VAR] = id;

		IngressVerifier.register();

		expect(currentReader(id)).toBeDefined();
		expect(spies.error).not.toHaveBeenCalled();
	});

	it("reports not-primed, not bad-configuration, for a valid id whose reader has not read", () => {
		const id = nextId("not-primed");
		process.env[NAME_VAR] = id;

		const result = IngressVerifier.evaluate({});

		expect(result).toBe(IngressVerifier.RESULT.SECRET_NOT_PRIMED);
		expect(secretsGet).not.toHaveBeenCalled();
	});
});

describe("Secret variable: invalid (R1.3)", () => {
	const INVALID_VALUES = [
		["a space inside", "bad name"],
		["a semicolon", "bad;name"],
		["a quote", "bad\"name"],
		["a backslash", "bad\\name"],
		["a non-ASCII letter", "na\u00efve"],
		["a newline inside", "bad\nname"],
		["__proto__", "__proto__"],
		["toString", "toString"],
		["a dangerous segment", "ingress-config/__proto__/x"]
	];

	it.each(INVALID_VALUES)("gives bad-configuration for %s", (label, raw) => {
		process.env[NAME_VAR] = raw;
		const sizeBefore = registrySize();

		const result = IngressVerifier.evaluate({ [IngressVerifier.SECRET_HEADER]: "anything" });

		expect(result).toBe(IngressVerifier.RESULT.BAD_CONFIGURATION);
		expect(result).toEqual({ ingress: "unverified", reason: "bad-configuration" });
		expect(registrySize()).toBe(sizeBefore);
		expect(secretsGet).not.toHaveBeenCalled();
		expect(spies.error).toHaveBeenCalledTimes(1);
	});

	it("gives bad-configuration for a secret id of 2049 characters, with no reader", () => {
		const raw = `ingress-config/long-${++idCounter}-`.padEnd(2049, "a");
		expect(raw.length).toBe(2049);
		process.env[NAME_VAR] = raw;
		const sizeBefore = registrySize();

		IngressVerifier.register();
		const result = IngressVerifier.evaluate({});

		expect(result).toBe(IngressVerifier.RESULT.BAD_CONFIGURATION);
		expect(registrySize()).toBe(sizeBefore);
		expect(spies.error).toHaveBeenCalledTimes(1);
	});

	it("creates no reader from register() for an invalid value", () => {
		process.env[NAME_VAR] = "bad name";
		const sizeBefore = registrySize();

		expect(() => IngressVerifier.register()).not.toThrow();

		expect(registrySize()).toBe(sizeBefore);
		expect(secretsGet).not.toHaveBeenCalled();
	});

	it("quotes the raw value with JSON.stringify and names the variable", () => {
		const raw = "bad name";
		process.env[NAME_VAR] = raw;

		IngressVerifier.evaluate({});

		const messages = messagesContaining(spies.error, NAME_VAR);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(JSON.stringify(raw));
	});

	it("escapes quotes and control characters so a value cannot forge or split the log line", () => {
		const raw = "x\"y\nFAKE LOG LINE\r\u0000z";
		process.env[NAME_VAR] = raw;

		IngressVerifier.evaluate({});

		const messages = messagesContaining(spies.error, NAME_VAR);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(JSON.stringify(raw));
		expect(messages[0].includes("\n")).toBe(false);
		expect(messages[0].includes("\r")).toBe(false);
		expect(messages[0].includes("\u0000")).toBe(false);
	});

	it("passes the safety check to ParameterKeySafety.checkSecretName with the trimmed value", () => {
		const id = nextId("safety");
		process.env[NAME_VAR] = `  ${id}  `;
		const checkSpy = jest.spyOn(ParameterKeySafety, "checkSecretName");

		IngressVerifier.evaluate({});

		expect(checkSpy).toHaveBeenCalledWith(id);
	});
});

describe("Secret variable: one error per distinct bad value (R1.3)", () => {
	it("logs once however many times the same bad value is evaluated", () => {
		process.env[NAME_VAR] = "bad name";

		for (let i = 0; i < 5; i++) { IngressVerifier.evaluate({}); }
		IngressVerifier.register();

		expect(messagesContaining(spies.error, NAME_VAR)).toHaveLength(1);
	});

	it("logs again for a different bad value", () => {
		process.env[NAME_VAR] = "bad name one";
		IngressVerifier.evaluate({});
		process.env[NAME_VAR] = "bad name two";
		IngressVerifier.evaluate({});
		IngressVerifier.evaluate({});

		const messages = messagesContaining(spies.error, NAME_VAR);
		expect(messages).toHaveLength(2);
		expect(messages[0]).toContain(JSON.stringify("bad name one"));
		expect(messages[1]).toContain(JSON.stringify("bad name two"));
	});

	it("does not log a value again when it comes back after another value", () => {
		process.env[NAME_VAR] = "bad name one";
		IngressVerifier.evaluate({});
		process.env[NAME_VAR] = "bad name two";
		IngressVerifier.evaluate({});
		process.env[NAME_VAR] = "bad name one";
		IngressVerifier.evaluate({});

		expect(messagesContaining(spies.error, NAME_VAR)).toHaveLength(2);
	});

	it("logs a bad value again after reset()", () => {
		process.env[NAME_VAR] = "bad name";
		IngressVerifier.evaluate({});
		IngressVerifier.reset();
		IngressVerifier.evaluate({});

		expect(messagesContaining(spies.error, NAME_VAR)).toHaveLength(2);
	});
});

describe("Secret variable: read on every evaluation, memoized by raw value (R1.4)", () => {
	it("parses an unchanged raw value once", () => {
		const id = nextId("memo");
		process.env[NAME_VAR] = id;
		const checkSpy = jest.spyOn(ParameterKeySafety, "checkSecretName");

		IngressVerifier.evaluate({});
		IngressVerifier.evaluate({});
		IngressVerifier.evaluate({});

		expect(checkSpy).toHaveBeenCalledTimes(1);
	});

	it("parses again when the raw value changes", () => {
		const idOne = nextId("memo-one");
		const idTwo = nextId("memo-two");
		const checkSpy = jest.spyOn(ParameterKeySafety, "checkSecretName");

		process.env[NAME_VAR] = idOne;
		IngressVerifier.evaluate({});
		IngressVerifier.evaluate({});
		process.env[NAME_VAR] = idTwo;
		IngressVerifier.evaluate({});
		IngressVerifier.evaluate({});

		expect(checkSpy).toHaveBeenCalledTimes(2);
		expect(checkSpy).toHaveBeenNthCalledWith(1, idOne);
		expect(checkSpy).toHaveBeenNthCalledWith(2, idTwo);
	});

	it("sees a changed value on the next evaluation: direct, then configured, then invalid, then direct", () => {
		const id = nextId("changes");

		expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.DIRECT);

		process.env[NAME_VAR] = id;
		expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.SECRET_NOT_PRIMED);
		expect(registeredFor(id)).toHaveLength(2);

		process.env[NAME_VAR] = "bad name";
		expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.BAD_CONFIGURATION);

		delete process.env[NAME_VAR];
		expect(IngressVerifier.evaluate({})).toBe(IngressVerifier.RESULT.DIRECT);
	});

	it("sees a variable that was unset when the verifier first ran and is valid later", () => {
		const id = nextId("late");
		IngressVerifier.register();
		expect(registeredFor(id)).toHaveLength(0);

		process.env[NAME_VAR] = id;
		IngressVerifier.register();

		expect(registeredFor(id)).toHaveLength(2);
	});

	it("creates a new reader pair for a new secret id and leaves the first pair registered", () => {
		const idOne = nextId("pair-one");
		const idTwo = nextId("pair-two");

		process.env[NAME_VAR] = idOne;
		IngressVerifier.register();
		const firstCurrent = currentReader(idOne);

		process.env[NAME_VAR] = idTwo;
		IngressVerifier.register();

		expect(registeredFor(idTwo)).toHaveLength(2);
		expect(registeredFor(idOne)).toHaveLength(2);
		expect(currentReader(idOne)).toBe(firstCurrent);
	});
});

describe("register() (R1.5)", () => {
	it("is idempotent: repeated calls keep the same two readers", () => {
		const id = nextId("idempotent");
		process.env[NAME_VAR] = id;

		IngressVerifier.register();
		const current = currentReader(id);
		const previous = previousReader(id);
		const sizeAfterFirst = registrySize();
		IngressVerifier.register();
		IngressVerifier.register();
		IngressVerifier.evaluate({});

		expect(registeredFor(id)).toHaveLength(2);
		expect(registrySize()).toBe(sizeAfterFirst);
		expect(currentReader(id)).toBe(current);
		expect(previousReader(id)).toBe(previous);
	});

	it("holds the readers already registered after reset() instead of creating duplicates", () => {
		const id = nextId("after-reset");
		process.env[NAME_VAR] = id;
		IngressVerifier.register();
		const current = currentReader(id);
		const sizeBefore = registrySize();

		IngressVerifier.reset();
		IngressVerifier.register();

		expect(registrySize()).toBe(sizeBefore);
		expect(currentReader(id)).toBe(current);
	});

	it("never throws and never reads", () => {
		process.env[NAME_VAR] = "bad name";
		expect(() => IngressVerifier.register()).not.toThrow();
		process.env[NAME_VAR] = nextId("no-throw");
		expect(() => IngressVerifier.register()).not.toThrow();
		expect(secretsGet).not.toHaveBeenCalled();
	});

	it("is picked up by CachedParameterSecrets so its prime() can load the readers", () => {
		const id = nextId("registry");
		process.env[NAME_VAR] = id;

		IngressVerifier.register();

		expect(CachedParameterSecrets.getNames()).toEqual(expect.arrayContaining([`${id}#AWSCURRENT`, `${id}#AWSPREVIOUS`]));
	});
});

describe("Interval variable (R1.6, R1.7)", () => {
	/**
	 * Registers the readers for a fresh id with the given interval and returns the id.
	 *
	 * @param {string|undefined} raw - Raw interval value, or undefined to leave it unset
	 * @returns {string} The secret id
	 */
	function configure(raw) {
		const id = nextId("interval");
		process.env[NAME_VAR] = id;
		if (raw !== undefined) { process.env[SECONDS_VAR] = raw; }
		IngressVerifier.register();
		return id;
	}

	it.each([
		["unset", undefined],
		["empty", ""],
		["spaces", "   "],
		["tabs and newlines", "\t\n"]
	])("uses 3600 without a warning when the interval is %s", (label, raw) => {
		const id = configure(raw);

		expect(currentReader(id).cache.refreshAfter).toBe(3600);
		expect(previousReader(id).cache.refreshAfter).toBe(3600);
		expect(spies.warn).not.toHaveBeenCalled();
	});

	it.each([
		["60", 60],
		["61", 61],
		["300", 300],
		["3600", 3600],
		["86399", 86399],
		["86400", 86400],
		[" 120 ", 120],
		["0060", 60]
	])("uses %j as the interval when it is in range", (raw, expected) => {
		const id = configure(raw);

		expect(currentReader(id).cache.refreshAfter).toBe(expected);
		expect(previousReader(id).cache.refreshAfter).toBe(expected);
		expect(spies.warn).not.toHaveBeenCalled();
	});

	it.each([
		["one below the minimum", "59"],
		["zero", "0"],
		["one above the maximum", "86401"],
		["a very large number", "99999999999999999999"],
		["a negative number", "-100"],
		["a plus sign", "+100"],
		["a decimal", "120.5"],
		["an exponent", "1e3"],
		["hexadecimal", "0x100"],
		["a unit suffix", "100s"],
		["words", "one hour"],
		["a non-ASCII digit", "\u0661\u0662\u0663"]
	])("uses 3600 and warns once for %s", (label, raw) => {
		const id = configure(raw);

		expect(currentReader(id).cache.refreshAfter).toBe(3600);
		expect(previousReader(id).cache.refreshAfter).toBe(3600);
		expect(messagesContaining(spies.warn, SECONDS_VAR)).toHaveLength(1);
		expect(spies.error).not.toHaveBeenCalled();
	});

	it("names the variable, quotes the value, and states the range and default in the warning", () => {
		const raw = "10\"s";
		configure(raw);

		const messages = messagesContaining(spies.warn, SECONDS_VAR);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(JSON.stringify(raw));
		expect(messages[0]).toContain("60");
		expect(messages[0]).toContain("86400");
		expect(messages[0]).toContain("3600");
	});

	it("escapes control characters in the warning", () => {
		configure("1\n2\r3");

		const messages = messagesContaining(spies.warn, SECONDS_VAR);
		expect(messages).toHaveLength(1);
		expect(messages[0]).not.toMatch(/[\n\r]/);
	});

	it("warns once per distinct raw value however often it is read", () => {
		const id = nextId("interval-once");
		process.env[NAME_VAR] = id;

		process.env[SECONDS_VAR] = "5";
		for (let i = 0; i < 4; i++) { IngressVerifier.evaluate({}); }
		process.env[SECONDS_VAR] = "6";
		IngressVerifier.evaluate({});
		process.env[SECONDS_VAR] = "5";
		IngressVerifier.evaluate({});

		const messages = messagesContaining(spies.warn, SECONDS_VAR);
		expect(messages).toHaveLength(2);
		expect(messages[0]).toContain(JSON.stringify("5"));
		expect(messages[1]).toContain(JSON.stringify("6"));
	});

	it("warns again for a bad value after reset()", () => {
		const id = nextId("interval-reset");
		process.env[NAME_VAR] = id;
		process.env[SECONDS_VAR] = "5";
		IngressVerifier.evaluate({});
		IngressVerifier.reset();
		IngressVerifier.evaluate({});

		expect(messagesContaining(spies.warn, SECONDS_VAR)).toHaveLength(2);
	});

	it("applies a changed interval to the readers already registered, without creating new ones", () => {
		const id = configure("120");
		const current = currentReader(id);
		const previous = previousReader(id);
		expect(current.cache.refreshAfter).toBe(120);

		process.env[SECONDS_VAR] = "7200";
		IngressVerifier.evaluate({});

		expect(currentReader(id)).toBe(current);
		expect(previousReader(id)).toBe(previous);
		expect(current.cache.refreshAfter).toBe(7200);
		expect(previous.cache.refreshAfter).toBe(7200);
		expect(registeredFor(id)).toHaveLength(2);
	});

	it("falls back to 3600 when a valid interval is replaced by an invalid one", () => {
		const id = configure("120");
		process.env[SECONDS_VAR] = "abc";

		IngressVerifier.evaluate({});

		expect(currentReader(id).cache.refreshAfter).toBe(3600);
		expect(messagesContaining(spies.warn, SECONDS_VAR)).toHaveLength(1);
	});

	it("falls back to 3600 when the interval is unset after being set", () => {
		const id = configure("120");
		delete process.env[SECONDS_VAR];

		IngressVerifier.evaluate({});

		expect(currentReader(id).cache.refreshAfter).toBe(3600);
		expect(spies.warn).not.toHaveBeenCalled();
	});

	it("gives both readers of a new pair the interval (R1.7)", () => {
		process.env[SECONDS_VAR] = "900";
		const id = nextId("interval-new-pair");
		process.env[NAME_VAR] = id;

		IngressVerifier.evaluate({});

		expect(currentReader(id).cache.refreshAfter).toBe(900);
		expect(previousReader(id).cache.refreshAfter).toBe(900);
	});
});

describe("Interval variable: properties (R1.6)", () => {
	// Generators are safe by construction: integers drawn inside or outside the accepted range.
	// Nothing filters on the parse the properties assert.

	it("Property: any whole number of seconds from 60 to 86400 is used as given", () => {
		const id = nextId("prop-in-range");
		process.env[NAME_VAR] = id;
		IngressVerifier.register();

		fc.assert(
			fc.property(fc.integer({ min: 60, max: 86400 }), (seconds) => {
				spies.warn.mockClear();
				process.env[SECONDS_VAR] = String(seconds);

				IngressVerifier.evaluate({});

				expect(currentReader(id).cache.refreshAfter).toBe(seconds);
				expect(previousReader(id).cache.refreshAfter).toBe(seconds);
				expect(spies.warn).not.toHaveBeenCalled();
			}),
			{ numRuns: 100 }
		);
	});

	it("Property: any whole number below 60 or above 86400 gives the default of 3600", () => {
		const id = nextId("prop-out-of-range");
		process.env[NAME_VAR] = id;
		IngressVerifier.register();

		fc.assert(
			fc.property(
				fc.oneof(
					fc.integer({ min: 0, max: 59 }),
					fc.integer({ min: 86401, max: 100000000 })
				),
				(seconds) => {
					process.env[SECONDS_VAR] = String(seconds);

					IngressVerifier.evaluate({});

					expect(currentReader(id).cache.refreshAfter).toBe(3600);
				}
			),
			{ numRuns: 100 }
		);
	});
});
