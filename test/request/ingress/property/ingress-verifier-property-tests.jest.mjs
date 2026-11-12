/**
 * Test: IngressVerifier property tests (Properties 1 to 6 and 9)
 *
 * Purpose: Verify, across many generated secrets, headers, and reader states, that
 * IngressVerifier.evaluate() decides exactly as the rules of Requirement 3.2 say, never
 * verifies a wrong, missing, or non-string header, never verifies against an unusable secret,
 * matches the header name case-insensitively, and never throws.
 *
 * Properties (design.md "Correctness properties"):
 * - Property 1: A wrong header never verifies
 * - Property 2: The header name is case-insensitive
 * - Property 3: Current and previous verify; older does not
 * - Property 4: Non-strings and empty headers never verify
 * - Property 5: An unusable secret never verifies
 * - Property 6: Total (never throws, always one of the frozen results)
 * - Property 9: Decision table (compared with a model written in this file)
 *
 * Setup:
 * - The SDK transport is forced with ExtensionAvailability.setOverride(false).
 * - AWS.secrets is replaced by a mock that answers by VersionStage. No real AWS call is made.
 * - Every generated case uses a secret id of its own because CachedParameterSecrets has no reset.
 * - Secrets are generated text. Nothing here is a real secret.
 * - DebugAndLog methods are silenced so that thousands of cases do not write to the console.
 *
 * Teardown: mocks are restored, ExtensionAvailability is reset, and the two
 * CACHE_DATA_INGRESS_* variables are restored.
 *
 * Generators are safe by construction. None is filtered by the predicate a property asserts:
 * - A wrong header is "!" followed by drawn text, and "!" is outside the secret alphabet.
 * - A near miss differs from the secret at one index by construction.
 * - Distinct secrets come from one fc.uniqueArray draw.
 * - An invalid secret variable starts with "!", which checkSecretName does not allow.
 *
 * No test passes a seed. FC_SEED reaches every fc.assert through the global hook.
 *
 * Known Issues: Property 2 builds the lowercased header map with RequestInfo, the class that
 * ClientRequest extends and that supplies the map ClientRequest passes to evaluate(). It does
 * not construct ClientRequest, so it does not depend on the ClientRequest wiring.
 *
 * Related Tests:
 * - test/request/ingress/unit/ingress-verifier-evaluate-tests.jest.mjs
 * - test/request/ingress/unit/ingress-verifier-mismatch-refresh-tests.jest.mjs
 *
 * Validates: Requirements 3.2, 3.6, 10.1, 15.2
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { setImmediate } from "node:timers";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const IngressVerifier = (await import("../../../../src/lib/utils/IngressVerifier.class.js")).default;
const RequestInfo = (await import("../../../../src/lib/tools/RequestInfo.class.js")).default;

const HEADER = "x-atlantis-origin-secret";
const HEADER_MIXED_CASE = "X-Atlantis-Origin-Secret";
const STAGE_CURRENT = "AWSCURRENT";
const STAGE_PREVIOUS = "AWSPREVIOUS";
const NUM_RUNS = 100;
const TEST_TIMEOUT_MS = 60000;

/** The 62 characters of the secret alphabet, ordered so that the next character is always different. */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Secret values the verifier must refuse to compare against. */
const UNUSABLE_VALUES = ["", " ", "\t\n", "BLANK", "blank", "Blank"];

let idCounter = 0;
let savedName;
let savedSeconds;
let secretsSpy;

// ---------------------------------------------------------------------------
// Shared arbitraries (valid by construction)
// ---------------------------------------------------------------------------

/** 24 to 64 alphanumeric characters. Never empty, whitespace, or BLANK. */
const secretArb = fc.stringMatching(/^[a-zA-Z0-9]{24,64}$/);

/** A value from the unusable list. */
const unusableArb = fc.constantFrom(...UNUSABLE_VALUES);

/** "!" is outside the secret alphabet, so no draw equals any secret. */
const wrongHeaderArb = fc.string({ maxLength: 40 }).map((text) => "!" + text);

/** A secret and a header that differs from it at one index by construction. */
const nearMissArb = fc.tuple(secretArb, fc.nat()).map(([secret, n]) => {
	const index = n % secret.length;
	const nextChar = ALPHABET[(ALPHABET.indexOf(secret[index]) + 1) % ALPHABET.length];
	return { secret, header: secret.slice(0, index) + nextChar + secret.slice(index + 1) };
});

/** Values that are not a string. */
const notAStringArb = fc.oneof(
	fc.constant(undefined),
	fc.constant(null),
	fc.integer(),
	fc.boolean(),
	fc.array(fc.string())
);

/** One boolean per character of the header name; true upper-cases a letter. */
const casingArb = fc.array(fc.boolean(), { minLength: HEADER_MIXED_CASE.length, maxLength: HEADER_MIXED_CASE.length });

/** The four reader states of Property 6. */
const readerStateArb = fc.constantFrom("unprimed", "settled-no-value", "value", "unusable");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @returns {string} A secret id used by one generated case only
 */
function nextSecretId() {
	idCounter += 1;
	return `ingress/property/${process.pid}-${idCounter}`;
}

/**
 * @param {string} name - Error name
 * @returns {Error} An error with the given name
 */
function namedError(name) {
	return Object.assign(new Error("simulated error"), { name });
}

/**
 * Applies a mask to the header name.
 *
 * @param {Array<boolean>} mask - One boolean per character
 * @returns {string} The header name with letters upper-cased where the mask is true
 */
function applyCasing(mask) {
	return HEADER.split("").map((char, i) => (mask[i] ? char.toUpperCase() : char)).join("");
}

/**
 * Lets work started without await (the mismatch refresh) finish while the mock is still in place.
 *
 * @returns {Promise<void>}
 */
async function settle() {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolve) => setImmediate(resolve));
	}
}

/**
 * Maps a Property 6 reader state to a state that arrange() accepts.
 *
 * @param {string} readerState - One of readerStateArb
 * @param {string} secret - A usable value
 * @param {string} unusable - An unusable value
 * @returns {{kind: string, value?: string}} Reader state
 */
function stateFor(readerState, secret, unusable) {
	switch (readerState) {
		case "unprimed": return { kind: "unprimed" };
		case "settled-no-value": return { kind: "failed" };
		case "value": return { kind: "value", value: secret };
		default: return { kind: "value", value: unusable };
	}
}

/**
 * Builds one case: resets the verifier, sets the variable, mocks the secret service by version
 * stage, and primes the readers that the case says have been read.
 *
 * Reader states:
 * - `unprimed`: never read
 * - `failed`: read finished with an error and no value
 * - `none`: read finished because the version does not exist (previous reader only)
 * - `value`: read finished with `value` as the SecretString
 *
 * @param {object} options - Case description
 * @param {string} [options.variable="valid"] - unset | empty | whitespace | invalid | valid
 * @param {string} [options.invalidText=""] - Text after "!" for an invalid variable
 * @param {{kind: string, value?: string}} options.current - State of the AWSCURRENT reader
 * @param {{kind: string, value?: string}} [options.previous={kind: "none"}] - State of the AWSPREVIOUS reader
 * @returns {Promise<{id: string, get: jest.Mock}>} The secret id and the mock of AWS.secrets.get
 */
async function arrange({ variable = "valid", invalidText = "", current, previous = { kind: "none" } }) {
	IngressVerifier.reset();
	delete process.env[IngressVerifier.ENV_SECRET_NAME];
	delete process.env[IngressVerifier.ENV_REFRESH_SECONDS];

	const id = nextSecretId();
	const states = { [STAGE_CURRENT]: current, [STAGE_PREVIOUS]: previous };

	const get = jest.fn(async (params) => {
		const state = states[params.VersionStage];
		if (state.kind === "value") { return { SecretString: state.value }; }
		if (state.kind === "none") { throw namedError("ResourceNotFoundException"); }
		throw namedError("InternalServiceError");
	});
	secretsSpy.mockReturnValue({ client: {}, get, sdk: {} });

	switch (variable) {
		case "unset": break;
		case "empty": process.env[IngressVerifier.ENV_SECRET_NAME] = ""; break;
		case "whitespace": process.env[IngressVerifier.ENV_SECRET_NAME] = " \t "; break;
		case "invalid": process.env[IngressVerifier.ENV_SECRET_NAME] = "!" + invalidText; break;
		case "too-long": process.env[IngressVerifier.ENV_SECRET_NAME] = "a".repeat(2049); break;
		default: process.env[IngressVerifier.ENV_SECRET_NAME] = id;
	}

	if (variable === "valid") {
		IngressVerifier.register();
		for (const stage of [STAGE_CURRENT, STAGE_PREVIOUS]) {
			if (states[stage].kind !== "unprimed") {
				await CachedParameterSecrets.get(`${id}#${stage}`).prime();
			}
		}
	}
	return { id, get };
}

describe("IngressVerifier property tests", () => {

	beforeEach(() => {
		savedName = process.env[IngressVerifier.ENV_SECRET_NAME];
		savedSeconds = process.env[IngressVerifier.ENV_REFRESH_SECONDS];
		delete process.env[IngressVerifier.ENV_SECRET_NAME];
		delete process.env[IngressVerifier.ENV_REFRESH_SECONDS];
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		ExtensionAvailability.setOverride(false);
		for (const method of ["log", "error", "warn", "info", "debug"]) {
			jest.spyOn(DebugAndLog, method).mockImplementation(() => {});
		}
		secretsSpy = jest.spyOn(AWS, "secrets", "get");
	});

	afterEach(() => {
		jest.restoreAllMocks();
		IngressVerifier.reset();
		ExtensionAvailability.reset();
		for (const [name, saved] of [
			[IngressVerifier.ENV_SECRET_NAME, savedName],
			[IngressVerifier.ENV_REFRESH_SECONDS, savedSeconds]
		]) {
			if (saved === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = saved;
			}
		}
	});

	// -----------------------------------------------------------------------
	it("Property 1: a wrong header never verifies", async () => {
		/** Validates: Requirements 3.2 row 8, 3.8, 10.1 */
		const caseArb = fc.oneof(
			fc.tuple(secretArb, wrongHeaderArb).map(([secret, header]) => ({ secret, header })),
			nearMissArb
		);

		await fc.assert(
			fc.asyncProperty(caseArb, async ({ secret, header }) => {
				await arrange({ current: { kind: "value", value: secret } });
				const result = IngressVerifier.evaluate({ [HEADER]: header });
				await settle();
				expect(result).toBe(IngressVerifier.RESULT.MISMATCH);
				expect(result.ingress).toBe("unverified");
				expect(result.reason).toBe("mismatch");
			}),
			{ numRuns: NUM_RUNS }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	it("Property 2: the header name is case-insensitive", async () => {
		/** Validates: Requirement 3.6 */
		await fc.assert(
			fc.asyncProperty(secretArb, casingArb, async (secret, mask) => {
				await arrange({ current: { kind: "value", value: secret } });
				const headerName = applyCasing(mask);
				const requestInfo = new RequestInfo({
					resource: "/items",
					path: "/items",
					httpMethod: "GET",
					headers: { [headerName]: secret },
					queryStringParameters: null,
					body: null
				});
				const result = IngressVerifier.evaluate(requestInfo.getClientHeaders());
				expect(result).toBe(IngressVerifier.RESULT.CLOUDFRONT);
				expect(result.ingress).toBe("cloudfront");
			}),
			{ numRuns: NUM_RUNS }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	it("Property 3: current and previous verify; older does not", async () => {
		/** Validates: Requirements 3.2 row 7, 3.3, 4.1 */
		const threeArb = fc.uniqueArray(secretArb, { minLength: 3, maxLength: 3 });

		await fc.assert(
			fc.asyncProperty(threeArb, async ([a, b, c]) => {
				// current = B, previous = A
				await arrange({ current: { kind: "value", value: b }, previous: { kind: "value", value: a } });
				expect(IngressVerifier.evaluate({ [HEADER]: a })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
				expect(IngressVerifier.evaluate({ [HEADER]: b })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
				expect(IngressVerifier.evaluate({ [HEADER]: c })).toBe(IngressVerifier.RESULT.MISMATCH);
				await settle();

				// current = B, no previous version
				await arrange({ current: { kind: "value", value: b }, previous: { kind: "none" } });
				expect(IngressVerifier.evaluate({ [HEADER]: b })).toBe(IngressVerifier.RESULT.CLOUDFRONT);
				expect(IngressVerifier.evaluate({ [HEADER]: a })).toBe(IngressVerifier.RESULT.MISMATCH);
				await settle();
			}),
			{ numRuns: NUM_RUNS }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	it("Property 4: non-strings and empty headers never verify and start no refresh", async () => {
		/** Validates: Requirements 3.2 row 6, 6.3 */
		const headerArb = fc.oneof(notAStringArb, fc.constant(""));

		await fc.assert(
			fc.asyncProperty(secretArb, headerArb, async (secret, header) => {
				const { get } = await arrange({ current: { kind: "value", value: secret } });
				const readsBefore = get.mock.calls.length;

				const result = IngressVerifier.evaluate({ [HEADER]: header });
				await settle();

				expect(result).toBe(IngressVerifier.RESULT.MISSING_HEADER);
				expect(result.ingress).toBe("unverified");
				expect(result.reason).toBe("missing-header");
				expect(get.mock.calls.length).toBe(readsBefore);
			}),
			{ numRuns: NUM_RUNS }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	it("Property 5: an unusable secret never verifies", async () => {
		/** Validates: Requirement 3.2 row 5, Decision 3 */
		const caseArb = fc.tuple(unusableArb, secretArb).chain(([unusable, previousSecret]) =>
			fc.record({
				unusable: fc.constant(unusable),
				previousSecret: fc.constant(previousSecret),
				// Any string, the secret's own text, and the previous value are all drawn
				header: fc.oneof(fc.string(), fc.constant(unusable), fc.constant(previousSecret))
			})
		);

		await fc.assert(
			fc.asyncProperty(caseArb, async ({ unusable, previousSecret, header }) => {
				const { get } = await arrange({
					current: { kind: "value", value: unusable },
					previous: { kind: "value", value: previousSecret }
				});
				const readsBefore = get.mock.calls.length;

				const result = IngressVerifier.evaluate({ [HEADER]: header });
				await settle();

				expect(result).toBe(IngressVerifier.RESULT.SECRET_UNUSABLE);
				expect(result.ingress).toBe("unverified");
				expect(result.reason).toBe("secret-unusable");
				expect(get.mock.calls.length).toBe(readsBefore);
			}),
			{ numRuns: NUM_RUNS }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	it("Property 6: evaluate is total", async () => {
		/** Validates: Requirements 3.7, 10.1 */
		const ingressValues = ["direct", "cloudfront", "unverified"];
		const reasonValues = [
			"missing-header", "mismatch", "secret-not-primed",
			"secret-unavailable", "secret-unusable", "bad-configuration"
		];
		const frozenResults = Object.values(IngressVerifier.RESULT);

		await fc.assert(
			fc.asyncProperty(
				fc.anything(),
				readerStateArb,
				readerStateArb,
				secretArb,
				unusableArb,
				async (headers, currentState, previousState, secret, unusable) => {
					await arrange({
						current: stateFor(currentState, secret, unusable),
						previous: stateFor(previousState, secret, unusable)
					});

					let result;
					expect(() => { result = IngressVerifier.evaluate(headers); }).not.toThrow();
					await settle();

					expect(ingressValues).toContain(result.ingress);
					expect(result.reason === null || reasonValues.includes(result.reason)).toBe(true);
					expect(frozenResults).toContain(result);
				}
			),
			{ numRuns: 200 }
		);
	}, TEST_TIMEOUT_MS);

	// -----------------------------------------------------------------------
	describe("Property 9: decision table", () => {

		/**
		 * @param {string} value - Secret value
		 * @returns {boolean} true when the value is empty, whitespace only, or BLANK in any case
		 */
		function isUnusableText(value) {
			const trimmed = value.trim();
			return trimmed === "" || trimmed.toUpperCase() === "BLANK";
		}

		/**
		 * The model: a plain ordered list of conditions that share the rule of Requirement 3.2,
		 * not the code. The first condition that applies gives the expected pair.
		 *
		 * @param {object} scenario - The case that was arranged
		 * @param {*} headers - The argument passed to evaluate()
		 * @returns {Array<string|null>} Expected [ingress, reason]
		 */
		function modelPair(scenario, headers) {
			const header = (headers !== null && typeof headers === "object") ? headers[HEADER] : undefined;
			const { variable, current, previous } = scenario;
			const previousIsUsable = previous.kind === "value" && !isUnusableText(previous.value);

			const rows = [
				{ applies: () => ["unset", "empty", "whitespace"].includes(variable), pair: ["direct", null] },
				{ applies: () => ["invalid", "too-long"].includes(variable), pair: ["unverified", "bad-configuration"] },
				{ applies: () => current.kind === "unprimed", pair: ["unverified", "secret-not-primed"] },
				{ applies: () => current.kind === "failed", pair: ["unverified", "secret-unavailable"] },
				{ applies: () => isUnusableText(current.value), pair: ["unverified", "secret-unusable"] },
				{ applies: () => typeof header !== "string" || header === "", pair: ["unverified", "missing-header"] },
				{
					applies: () => header === current.value || (previousIsUsable && header === previous.value),
					pair: ["cloudfront", null]
				},
				{ applies: () => true, pair: ["unverified", "mismatch"] }
			];
			return rows.find((row) => row.applies()).pair;
		}

		/**
		 * @param {string} kind - Header kind
		 * @param {object} scenario - The case
		 * @param {string} other - Text for a header that matches nothing
		 * @returns {*} The argument for evaluate()
		 */
		function headersFor(kind, scenario, other) {
			const currentText = scenario.current.value ?? "current-fallback-text";
			const previousText = scenario.previous.value ?? "previous-fallback-text";
			switch (kind) {
				case "no-headers": return undefined;
				case "absent": return {};
				case "undefined": return { [HEADER]: undefined };
				case "empty": return { [HEADER]: "" };
				case "number": return { [HEADER]: 42 };
				case "array": return { [HEADER]: [currentText] };
				case "current": return { [HEADER]: currentText };
				case "previous": return { [HEADER]: previousText };
				default: return { [HEADER]: "!" + other };
			}
		}

		const valueArb = fc.oneof(secretArb, unusableArb);

		const currentArb = fc.oneof(
			fc.constant({ kind: "unprimed" }),
			fc.constant({ kind: "failed" }),
			valueArb.map((value) => ({ kind: "value", value }))
		);

		const previousArb = fc.oneof(
			fc.constant({ kind: "unprimed" }),
			fc.constant({ kind: "none" }),
			fc.constant({ kind: "failed" }),
			valueArb.map((value) => ({ kind: "value", value }))
		);

		const scenarioArb = fc.record({
			variable: fc.constantFrom("unset", "empty", "whitespace", "invalid", "too-long", "valid"),
			invalidText: fc.string({ maxLength: 20 }),
			current: currentArb,
			previous: previousArb,
			headerKind: fc.constantFrom(
				"no-headers", "absent", "undefined", "empty", "number", "array", "current", "previous", "other"
			),
			other: fc.string({ maxLength: 40 })
		});

		it("Property 9: the (ingress, reason) pair equals the model for every combination", async () => {
			/** Validates: Requirement 3.2 */
			await fc.assert(
				fc.asyncProperty(scenarioArb, async (scenario) => {
					await arrange(scenario);
					const headers = headersFor(scenario.headerKind, scenario, scenario.other);

					const result = IngressVerifier.evaluate(headers);
					await settle();

					const [expectedIngress, expectedReason] = modelPair(scenario, headers);
					expect({ ingress: result.ingress, reason: result.reason }).toEqual({
						ingress: expectedIngress,
						reason: expectedReason
					});
				}),
				{ numRuns: 300 }
			);
		}, TEST_TIMEOUT_MS);
	});
});
