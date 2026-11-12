/**
 * Test: Ingress verification never logs a secret value or a header value
 *
 * Purpose: Property 7 of the spec. Across complete request sequences (matching header, wrong
 * header, missing header, a failed read of the current version followed by recovery, a missing
 * previous version, a failing previous version, an unusable (BLANK) value, an invalid
 * configuration, and rotation), every argument of every DebugAndLog call, and every line written
 * to the console, is searched for each secret value and for the header value. None may appear.
 * An example test also asserts that no message the package writes contains "!".
 *
 * Why "!": the header value in these sequences is always "!" followed by drawn text, and the
 * secret alphabet has no "!". If the package's own messages never contain "!", the header value
 * cannot appear in a message by chance, so a match is a real leak.
 *
 * Setup:
 * - AWS.secrets is replaced with a mock that answers by version stage. The SDK path is forced
 *   with ExtensionAvailability.setOverride(false). No real AWS call is made and no credential is read.
 * - Every DebugAndLog method that exists is spied on and calls through, so the real formatting runs.
 *   console.log, info, warn, error, and debug are stubbed to capture what DebugAndLog writes
 *   and to keep the test output quiet.
 * - Every run uses a secret id unique to it, because CachedParameterSecrets has no reset.
 * - Secrets are alphanumeric strings of 24 to 64 characters, so a substring match is meaningful.
 *   No generator is filtered by the predicate the property asserts.
 *
 * Teardown: CACHE_DATA_INGRESS_* variables are restored, mocks are restored, ExtensionAvailability
 * and IngressVerifier are reset.
 *
 * Known limits:
 * - The "no message contains '!'" example test runs with valid secret names. A secret name that
 *   is not valid is reflected back by the package inside JSON.stringify quotes by design (it is
 *   user supplied), so one extra test strips that quoted value and checks the rest of the message.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 * - test/request/ingress/unit/client-request-ingress-tests.jest.mjs
 *
 * Requirements: 10.2, 15.7
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { setImmediate as nodeSetImmediate } from "node:timers";
const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ClientRequest = (await import("../../../../src/lib/tools/ClientRequest.class.js")).default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;
const ENV_NAME = IngressVerifier.ENV_SECRET_NAME;
const ENV_SECONDS = IngressVerifier.ENV_REFRESH_SECONDS;
const ORIGINAL_NAME = process.env[ENV_NAME];
const ORIGINAL_SECONDS = process.env[ENV_SECONDS];
const CANDIDATE_LOG_METHODS = ["log", "debug", "info", "warn", "warning", "error", "diag", "msg", "message", "writeLog"];
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"];
const INVALID_SECRET_NAME = "not a valid secret name";
const MOCK_CONTEXT = { getRemainingTimeInMillis: () => 30000 };
const NUM_RUNS = 100;

/** The steps a sequence is made of. State steps change the secret store or the configuration. */
const STEPS = Object.freeze([
	"reqMatch",
	"reqPrevious",
	"reqWrong",
	"reqMissing",
	"failCurrent",
	"recover",
	"previousMissing",
	"previousFails",
	"blankCurrent",
	"rotate",
	"invalidConfig",
	"validConfig"
]);

let idCounter = 0;
let spies = {};
let consoleSpies = {};

/**
 * @param {string} label - Short label
 * @returns {string} A secret id used by one run only
 */
function nextId(label) {
	idCounter += 1;
	return `ingress/secrecy/${label}-${idCounter}`;
}

/**
 * @param {*} arg - Any logged argument
 * @returns {string} The argument as text, including the stack of an Error
 */
function serialize(arg) {
	if (typeof arg === "string") { return arg; }
	if (arg instanceof Error) { return `${arg.name}: ${arg.message}\n${arg.stack}`; }
	try {
		const json = JSON.stringify(arg);
		return (json === undefined) ? String(arg) : json;
	} catch (error) { // eslint-disable-line no-unused-vars
		return String(arg);
	}
}

/**
 * @returns {string[]} Every argument of every DebugAndLog call and every console call, serialized, one entry each
 */
function allLoggedEntries() {
	const entries = [];
	for (const spy of [...Object.values(spies), ...Object.values(consoleSpies)]) {
		for (const call of spy.mock.calls) {
			for (const arg of call) {
				entries.push(serialize(arg));
			}
		}
	}
	return entries;
}

/**
 * @returns {number} Number of DebugAndLog calls (all methods) and console calls captured
 */
function capturedCallCount() {
	return [...Object.values(spies), ...Object.values(consoleSpies)].reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}

/**
 * Clears the captured calls between runs of one property.
 *
 * @returns {void}
 */
function clearCaptured() {
	for (const spy of [...Object.values(spies), ...Object.values(consoleSpies)]) {
		spy.mockClear();
	}
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
 * @param {string} name - Error name
 * @returns {Error} An error with a message that holds no secret
 */
function namedError(name) {
	return Object.assign(new Error("simulated Secrets Manager outage"), { name });
}

/**
 * @param {object} store - Mutable answers by version stage
 * @returns {jest.Mock} The mock of AWS.secrets.get
 */
function useSecrets(store) {
	ExtensionAvailability.setOverride(false);
	const get = jest.fn(async ({ VersionStage }) => {
		const entry = store[VersionStage];
		if (entry instanceof Error) { throw entry; }
		if (entry === null || entry === undefined) { throw namedError("ResourceNotFoundException"); }
		return { SecretString: entry };
	});
	jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get, sdk: {} });
	return get;
}

/**
 * @param {object} [headers] - Headers of the request, in any letter case
 * @returns {object} An API Gateway REST event
 */
function buildEvent(headers = {}) {
	return {
		httpMethod: "GET",
		resource: "/search",
		path: "/search",
		pathParameters: null,
		queryStringParameters: null,
		headers,
		body: null,
		requestContext: { identity: { sourceIp: "203.0.113.20" } }
	};
}

/**
 * Plays a sequence of steps against the real verifier and readers, with only AWS.secrets mocked.
 *
 * @param {object} plan - What to play
 * @param {string[]} plan.secrets - Three distinct secret values
 * @param {string} plan.header - A wrong header value, "!" followed by drawn text
 * @param {boolean} plan.primeFirst - Whether the secret is loaded before the first step
 * @param {string[]} plan.steps - Steps drawn from STEPS
 * @param {string} plan.label - Label used for the secret id
 * @returns {Promise<{watched: string[], requests: number}>} Values that must never be logged, and the number of requests made
 */
async function playSequence({ secrets, header, primeFirst, steps, label }) {
	const id = nextId(label);
	let rotationIndex = 0;
	const store = { AWSCURRENT: secrets[0], AWSPREVIOUS: null };
	let requests = 0;

	useSecrets(store);
	process.env[ENV_NAME] = id;

	const refresh = async (stage) => {
		await CachedParameterSecrets.get(`${id}#${stage}`).refresh();
		await settle();
	};
	const request = async (headerValue) => {
		const headers = (headerValue === undefined) ? {} : { "X-Atlantis-Origin-Secret": headerValue };
		const clientRequest = new ClientRequest(buildEvent(headers), MOCK_CONTEXT);
		clientRequest.isIngressVerified();
		requests += 1;
		await settle();
	};

	if (primeFirst) {
		await ClientRequest.prime();
	} else {
		// A request before the secret is loaded is part of the sequence: the not-primed episode.
		await request(secrets[0]);
		await ClientRequest.prime();
	}

	for (const step of steps) {
		switch (step) {
			case "reqMatch":
				await request(typeof store.AWSCURRENT === "string" ? store.AWSCURRENT : secrets[0]);
				break;
			case "reqPrevious":
				await request(typeof store.AWSPREVIOUS === "string" ? store.AWSPREVIOUS : secrets[1]);
				break;
			case "reqWrong":
				await request(header);
				break;
			case "reqMissing":
				await request(undefined);
				break;
			case "failCurrent":
				store.AWSCURRENT = namedError("InternalServiceError");
				await refresh("AWSCURRENT");
				break;
			case "recover":
				store.AWSCURRENT = secrets[rotationIndex % 3];
				await refresh("AWSCURRENT");
				break;
			case "previousMissing":
				store.AWSPREVIOUS = null;
				await refresh("AWSPREVIOUS");
				break;
			case "previousFails":
				store.AWSPREVIOUS = namedError("InternalServiceError");
				await refresh("AWSPREVIOUS");
				break;
			case "blankCurrent":
				store.AWSCURRENT = "BLANK";
				await refresh("AWSCURRENT");
				break;
			case "rotate":
				store.AWSPREVIOUS = secrets[rotationIndex % 3];
				rotationIndex += 1;
				store.AWSCURRENT = secrets[rotationIndex % 3];
				await refresh("AWSCURRENT");
				await refresh("AWSPREVIOUS");
				break;
			case "invalidConfig":
				process.env[ENV_NAME] = INVALID_SECRET_NAME;
				await request(secrets[0]);
				break;
			case "validConfig":
				process.env[ENV_NAME] = id;
				break;
			default:
				throw new Error(`Unknown step ${step}`);
		}
	}
	return { watched: [...secrets, header], requests };
}

/** Every step once, in an order that covers failure, recovery, rotation, and a bad configuration. */
const FULL_SEQUENCE = Object.freeze([
	"reqMatch", "reqWrong", "reqMissing",
	"failCurrent", "reqMatch", "recover", "reqMatch",
	"previousMissing", "reqPrevious",
	"previousFails", "reqPrevious",
	"blankCurrent", "reqMatch", "recover",
	"rotate", "reqPrevious", "reqMatch", "reqWrong",
	"invalidConfig", "validConfig", "reqMatch"
]);

describe("Ingress log secrecy", () => {
	beforeEach(() => {
		delete process.env[ENV_NAME];
		delete process.env[ENV_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		spies = {};
		consoleSpies = {};
		for (const method of CANDIDATE_LOG_METHODS) {
			if (typeof DebugAndLog[method] === "function") {
				spies[method] = jest.spyOn(DebugAndLog, method);
			}
		}
		for (const method of CONSOLE_METHODS) {
			consoleSpies[method] = jest.spyOn(console, method).mockImplementation(() => {});
		}
	});

	afterEach(() => {
		jest.restoreAllMocks();
		ExtensionAvailability.reset();
		IngressVerifier.reset();
		if (ORIGINAL_NAME === undefined) { delete process.env[ENV_NAME]; } else { process.env[ENV_NAME] = ORIGINAL_NAME; }
		if (ORIGINAL_SECONDS === undefined) { delete process.env[ENV_SECONDS]; } else { process.env[ENV_SECONDS] = ORIGINAL_SECONDS; }
	});

	describe("capture", () => {
		it("sees a package log line and the console output, so the property cannot pass by capturing nothing", async () => {
			await playSequence({
				secrets: ["Aaaaaaaa11111111bbbbbbbb", "Cccccccc22222222dddddddd", "Eeeeeeee33333333ffffffff"],
				header: "!wrong",
				primeFirst: true,
				steps: ["reqWrong"],
				label: "capture"
			});
			const entries = allLoggedEntries();
			expect(entries).toContain("INGRESS_UNVERIFIED");
			expect(entries).toContain(JSON.stringify({ reason: "mismatch" }));
			expect(consoleSpies.log).toHaveBeenCalled();
		});

		it("detects a planted secret in a DebugAndLog argument", async () => {
			const secret = "Zzzzzzzz99999999yyyyyyyy";
			DebugAndLog.error(`planted ${secret}`);
			DebugAndLog.warn("planted", { nested: { value: secret } });
			const text = allLoggedEntries().join("\n");
			expect(text.includes(secret)).toBe(true);
		});
	});

	describe("Property 7: the secret is never logged", () => {
		it("logs neither a secret value nor the header value across request sequences", async () => {
			jest.setTimeout(60000);
			await fc.assert(
				fc.asyncProperty(
					fc.uniqueArray(fc.stringMatching(/^[a-zA-Z0-9]{24,64}$/), { minLength: 3, maxLength: 3 }),
					fc.string().map((text) => `!${text}`),
					fc.boolean(),
					fc.array(fc.constantFrom(...STEPS), { minLength: 1, maxLength: 12 }),
					async (secrets, header, primeFirst, steps) => {
						delete process.env[ENV_NAME];
						IngressVerifier.reset();
						ExtensionAvailability.reset();
						clearCaptured();
						try {
							const { watched } = await playSequence({ secrets, header, primeFirst, steps, label: "property" });
							const entries = allLoggedEntries();
							for (const value of watched) {
								for (const entry of entries) {
									if (entry.includes(value)) { return false; }
								}
							}
							return true;
						} finally {
							delete process.env[ENV_NAME];
						}
					}
				),
				{ numRuns: NUM_RUNS }
			);
		}, 60000);

		it("logs no secret value or header value in the sequence that covers every step", async () => {
			const secrets = ["Qqqqqqqq44444444rrrrrrrr", "Ssssssss55555555tttttttt", "Uuuuuuuu66666666vvvvvvvv"];
			const header = "!header-value-under-test";
			await playSequence({ secrets, header, primeFirst: false, steps: [...FULL_SEQUENCE], label: "full" });
			const entries = allLoggedEntries();
			expect(entries.length).toBeGreaterThan(0);
			for (const value of [...secrets, header]) {
				expect(entries.filter((entry) => entry.includes(value))).toEqual([]);
			}
		});
	});

	describe("package messages contain no exclamation mark", () => {
		it("writes no message with \"!\" across a sequence of every kind of request and failure", async () => {
			const secrets = ["Wwwwwwww77777777xxxxxxxx", "Yyyyyyyy88888888zzzzzzzz", "Aaaaaaaa00000000bbbbbbbb"];
			await playSequence({ secrets, header: "!header-value-under-test", primeFirst: false, steps: [...FULL_SEQUENCE], label: "bang" });
			expect(capturedCallCount()).toBeGreaterThan(0);
			expect(allLoggedEntries().filter((entry) => entry.includes("!"))).toEqual([]);
		});

		it("writes no message with \"!\" outside the quoted value of an invalid secret name", () => {
			const raw = "bad!name";
			process.env[ENV_NAME] = raw;
			new ClientRequest(buildEvent({ "x-atlantis-origin-secret": "!header" }), MOCK_CONTEXT);
			const entries = allLoggedEntries();
			const reflected = entries.filter((entry) => entry.includes(raw));
			expect(reflected.length).toBeGreaterThan(0);
			for (const entry of reflected) {
				expect(entry).toContain(JSON.stringify(raw));
			}
			const rest = entries.map((entry) => entry.split(JSON.stringify(raw)).join(""));
			expect(rest.filter((entry) => entry.includes("!"))).toEqual([]);
		});
	});
});
