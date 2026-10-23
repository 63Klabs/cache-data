/**
 * Property-based tests for the internal TimeUtils class: Properties 1 to 7 of the
 * timezone design, plus a guard for the premise Property 7 rests on. Property 8, the
 * cross-check against native Temporal, is in
 * time-utils-temporal-oracle-property-tests.jest.mjs.
 *
 * TimeUtils is internal, so it's imported by file path, as the DataHasher property tests
 * do. This file never calls TimeUtils.init(), so the active timezone stays "Etc/UTC".
 * Every zone is reached through the explicit-timezone seam instead:
 * getOffsetInMinutes(t, z), nextIntervalInSeconds(I, t, z), and
 * resolveTimezone(option, envValue) (Requirement 4.5).
 *
 * The oracle. O(z, t) below is longOffsetMinutes(z, t * 1000) from
 * test/helpers/time-utils-oracles.mjs: the offset ICU formats itself with
 * timeZoneName "longOffset", such as "GMT-05:00", parsed into minutes. TimeUtils derives
 * its offset another way, by reading the wall-clock parts back as a UTC time, so a
 * mistake in that derivation shows up as a disagreement (Requirement 11.4). Property 3
 * compares the two offsets directly. Property 1 checks boundary alignment against the
 * oracle's offset rather than TimeUtils' own, and Property 2's precondition uses it too.
 *
 * The shared arbitraries, all valid by construction:
 * - zone: any name Intl.supportedValuesOf("timeZone") lists
 * - instant: an integer second from 2000-01-01T00:00:00Z to 2099-12-31T23:59:59Z. It's
 *   never 0, which TimeUtils reads as "now". Every offset in this range is a whole
 *   number of minutes, so 60 * O(z, t) is an exact number of seconds
 * - interval: the 20 intervals of Cache.testInterval(), plus any integer from 1 second
 *   to 30 days
 * Properties 4 to 7 add their own, described where they're defined.
 *
 * Guardrails (.kiro/steering/test-execution-monitoring.md):
 * - No fc.assert passes a seed option. The global FC_SEED hook,
 *   test/setup/fast-check-seed.mjs, seeds every fc.assert here, and fc.sample too.
 * - No generator is filtered on the predicate its property asserts. fc.pre appears only
 *   in Properties 2 and 6, as the preconditions the design specifies.
 * - numRuns is 1000 for Properties 1 and 3, and 200 for the others. Nothing here spawns
 *   a child process.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Correctness properties")
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import fc from "fast-check";

import TimeUtils from "../../../../src/lib/utils/TimeUtils.class.js";
import { INTERVAL_TABLE, longOffsetMinutes } from "../../../helpers/time-utils-oracles.mjs";

/* ****************************************************************************
 *	Constants
 */

/** Jest timeout for each property test, in milliseconds */
const PROPERTY_TIMEOUT_MS = 60000;

/** numRuns for Properties 1 and 3 */
const WIDE_NUM_RUNS = 1000;

/** numRuns for Properties 2, 4, 5, 6, and 7 */
const STANDARD_NUM_RUNS = 200;

/** How many generated invalid names the Property 7 premise guard checks against Intl */
const PREMISE_SAMPLE_SIZE = 1000;

/** The longest interval drawn outside the interval table: 30 days, in seconds */
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60;

/** 2000-01-01T00:00:00Z, in seconds: the start of the instant range */
const INSTANT_MIN_SECONDS = Date.UTC(2000, 0, 1) / 1000;

/** 2099-12-31T23:59:59Z, in seconds: the end of the instant range */
const INSTANT_MAX_SECONDS = Date.UTC(2099, 11, 31, 23, 59, 59) / 1000;

/** 2000-01-01T00:00:00.000Z, in milliseconds: the start of Property 4's Date.now() range */
const NOW_MIN_MS = Date.UTC(2000, 0, 1);

/** 2099-12-31T23:59:59.999Z, in milliseconds: the end of Property 4's Date.now() range */
const NOW_MAX_MS = Date.UTC(2100, 0, 1) - 1;

/** The furthest a Date can be from the epoch, in milliseconds */
const MAX_DATE_MS = 8.64e15;

/** The furthest a timestamp in seconds can be from the epoch while its milliseconds still fit a Date */
const MAX_DATE_SECONDS = MAX_DATE_MS / 1000;

/** 1900-01-01T00:00:00Z, in seconds: the start of Property 6's range */
const PARSE_MIN_SECONDS = Date.UTC(1900, 0, 1) / 1000;

/** 2100-12-31T23:59:59Z, in seconds: the end of Property 6's range */
const PARSE_MAX_SECONDS = Date.UTC(2100, 11, 31, 23, 59, 59) / 1000;

/** What resolution returns when neither the option nor the environment variable is provided (Requirement 2.1) */
const DEFAULT_TIMEZONE = "Etc/UTC";

/** The environment variable an env-sourced error message names (Requirement 3.3) */
const TIMEZONE_ENV_VAR = "CACHE_DATA_TIME_ZONE_FOR_INTERVAL";

/** The sentence that closes every invalid-timezone message (Requirements 2.4, 3.2, and 3.3) */
const TIMEZONE_HINT = 'Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/** The prefix of every generated invalid name. The premise guard checks that Intl accepts no name that starts with it */
const INVALID_PREFIX = "Invalid/";

/** Every time zone name this runtime supports */
const SUPPORTED_ZONES = Object.freeze(Intl.supportedValuesOf("timeZone"));

/* ****************************************************************************
 *	Shared arbitraries
 */

/** Any time zone name this runtime supports */
const zone = fc.constantFrom(...SUPPORTED_ZONES);

/** An integer second from 2000 through 2099 */
const instant = fc.integer({ min: INSTANT_MIN_SECONDS, max: INSTANT_MAX_SECONDS });

/** The interval table plus any whole number of seconds up to 30 days */
const interval = fc.oneof(fc.constantFrom(...INTERVAL_TABLE), fc.integer({ min: 1, max: MAX_INTERVAL_SECONDS }));

/* ****************************************************************************
 *	Arbitraries for Properties 4 to 6
 */

/** Property 4: a mocked Date.now() value from 2000 through 2099, including milliseconds */
const nowInMilliseconds = fc.integer({ min: NOW_MIN_MS, max: NOW_MAX_MS });

/** Property 5: a non-zero integer number of seconds whose milliseconds fit the Date range */
const nonZeroSeconds = fc.oneof(
	fc.integer({ min: -MAX_DATE_SECONDS, max: -1 }),
	fc.integer({ min: 1, max: MAX_DATE_SECONDS })
);

/** Property 5: a non-zero integer number of milliseconds in the Date range */
const nonZeroMilliseconds = fc.oneof(
	fc.integer({ min: -MAX_DATE_MS, max: -1 }),
	fc.integer({ min: 1, max: MAX_DATE_MS })
);

/** Property 6: an integer second from 1900 through 2100, the Unix epoch included */
const parseableSecond = fc.integer({ min: PARSE_MIN_SECONDS, max: PARSE_MAX_SECONDS });

/**
 * Property 6: any string. A few percent of draws are strings Date.parse() accepts, such
 * as "7" or "2<", and the property's precondition discards those. The rest are the
 * unparsable strings the property is about.
 */
const anyString = fc.string();

/* ****************************************************************************
 *	Arbitraries for Property 7
 *
 *	Every value is tagged with its kind, so predictResolution() can predict the result
 *	without consulting Intl. `value` is what resolveTimezone() receives. `name` is the
 *	trimmed name, for the valid and invalid kinds. `typeName` is what typeof reports, for
 *	the non-string kind.
 */

/** 0 to 3 spaces or tabs, to pad a name with */
const padding = fc.array(fc.constantFrom(" ", "\t"), { maxLength: 3 }).map((characters) => characters.join(""));

/** 1 to 3 spaces or tabs: a string that isn't provided (Requirement 2.2) */
const whitespaceOnly = fc.array(fc.constantFrom(" ", "\t"), { minLength: 1, maxLength: 3 }).map((characters) => characters.join(""));

/**
 * "Invalid/" plus 1 to 12 characters from [A-Za-z0-9_]. Intl rejects every such name,
 * which the premise guard checks, and JSON.stringify() quotes one without escaping
 * anything.
 */
const invalidName = fc.stringMatching(/^[A-Za-z0-9_]{1,12}$/).map((suffix) => `${INVALID_PREFIX}${suffix}`);

/** An option that isn't provided: undefined, null, "", or only spaces and tabs */
const notProvidedOption = fc.oneof(fc.constantFrom(undefined, null, ""), whitespaceOnly)
	.map((value) => ({ kind: "notProvided", value }));

/** An environment variable value that isn't provided. Environment values are strings or undefined, never null */
const notProvidedEnvValue = fc.oneof(fc.constantFrom(undefined, ""), whitespaceOnly)
	.map((value) => ({ kind: "notProvided", value }));

/** A supported zone with 0 to 3 spaces or tabs on each side */
const validValue = fc.tuple(padding, zone, padding)
	.map(([before, name, after]) => ({ kind: "valid", value: `${before}${name}${after}`, name }));

/** An invalid name with 0 to 3 spaces or tabs on each side */
const invalidValue = fc.tuple(padding, invalidName, padding)
	.map(([before, name, after]) => ({ kind: "invalid", value: `${before}${name}${after}`, name }));

/** A provided option that isn't a string: an integer, a double, a boolean, {}, or [] */
const nonStringOption = fc.oneof(
	fc.integer().map((value) => ({ kind: "nonString", value, typeName: "number" })),
	fc.double().map((value) => ({ kind: "nonString", value, typeName: "number" })),
	fc.boolean().map((value) => ({ kind: "nonString", value, typeName: "boolean" })),
	fc.constant({ kind: "nonString", value: {}, typeName: "object" }),
	fc.constant({ kind: "nonString", value: [], typeName: "object" })
);

/** An option of any kind */
const taggedOption = fc.oneof(notProvidedOption, validValue, invalidValue, nonStringOption);

/** An environment variable value of any kind except non-string */
const taggedEnvValue = fc.oneof(notProvidedEnvValue, validValue, invalidValue);

/* ****************************************************************************
 *	Helpers
 */

/**
 * The non-negative remainder of value divided by divisor. A multiple of divisor gives 0
 * whatever its sign, and never -0.
 *
 * @param {number} value - The dividend
 * @param {number} divisor - A positive divisor
 * @returns {number} value modulo divisor, from 0 up to but not including divisor
 * @example
 * remainder(7200, 3600); // 0
 * remainder(-5, 3); // 1
 */
function remainder(value, divisor) {
	return ((value % divisor) + divisor) % divisor;
}

/**
 * Whether Intl.DateTimeFormat accepts a time zone name.
 *
 * @param {string} name - The time zone name to try
 * @returns {boolean} true when a formatter can be built with it, false when Intl throws a RangeError
 * @throws {Error} Anything Intl throws other than a RangeError
 * @example
 * isAcceptedByIntl("America/Chicago"); // true
 * isAcceptedByIntl("Invalid/Zone"); // false
 */
function isAcceptedByIntl(name) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: name });
		return true;
	} catch (error) {
		if (error instanceof RangeError) {
			return false;
		}
		throw error;
	}
}

/**
 * Describe a thrown error in the outcome shape that predictResolution() and
 * observeResolution() share.
 *
 * @param {string} message - The error message
 * @param {boolean} hasRangeErrorCause - Whether the error's cause is a RangeError
 * @returns {{threw: {isError: boolean, message: string, hasRangeErrorCause: boolean}}} The outcome
 * @example
 * threwOutcome('Invalid timezone of type number. Expected ...', false);
 */
function threwOutcome(message, hasRangeErrorCause) {
	return { threw: { isError: true, message, hasRangeErrorCause } };
}

/**
 * Predict resolveTimezone(option.value, env.value) from the two kinds alone, following
 * Requirements 2 and 3. It never consults Intl: whether a name is valid comes from the
 * kind it was generated as.
 *
 * @param {{kind: string, name?: string, typeName?: string}} option - A tagged option from taggedOption
 * @param {{kind: string, name?: string}} env - A tagged environment variable value from taggedEnvValue
 * @returns {{returned: string}|{threw: {isError: boolean, message: string, hasRangeErrorCause: boolean}}} The predicted outcome
 * @example
 * predictResolution({ kind: "notProvided", value: "" }, { kind: "valid", value: " Asia/Kolkata", name: "Asia/Kolkata" });
 * // { returned: "Asia/Kolkata" }
 */
function predictResolution(option, env) {
	// A provided option decides the result, whatever the environment variable holds (Requirement 2.1)
	if (option.kind === "nonString") {
		return threwOutcome(`Invalid timezone of type ${option.typeName}. ${TIMEZONE_HINT}`, false);
	}
	if (option.kind === "valid") {
		return { returned: option.name };
	}
	if (option.kind === "invalid") {
		return threwOutcome(`Invalid timezone "${option.name}". ${TIMEZONE_HINT}`, true);
	}
	// The option isn't provided, so resolution falls through to the environment variable (Requirement 2.2)
	if (env.kind === "valid") {
		return { returned: env.name };
	}
	if (env.kind === "invalid") {
		return threwOutcome(`Invalid timezone "${env.name}" from ${TIMEZONE_ENV_VAR}. ${TIMEZONE_HINT}`, true);
	}
	return { returned: DEFAULT_TIMEZONE };
}

/**
 * Call TimeUtils.resolveTimezone() and describe what happened, in the outcome shape
 * predictResolution() uses.
 *
 * @param {*} option - The option value to pass
 * @param {*} envValue - The environment variable value to pass
 * @returns {{returned: string}|{threw: {isError: boolean, message: string, hasRangeErrorCause: boolean}}} The observed outcome
 * @example
 * observeResolution(undefined, undefined); // { returned: "Etc/UTC" }
 */
function observeResolution(option, envValue) {
	try {
		return { returned: TimeUtils.resolveTimezone(option, envValue) };
	} catch (error) {
		return {
			threw: {
				isError: error instanceof Error,
				message: String(error?.message),
				hasRangeErrorCause: error?.cause instanceof RangeError
			}
		};
	}
}

/* ****************************************************************************
 *	Properties
 */

describe("TimeUtils - Property Tests", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// **Validates: Requirements 5.3, 6.2, 6.3, 6.5**
	it("Property 1: Bounds and local alignment", () => {
		fc.assert(
			fc.property(zone, instant, interval, (timeZone, timestampInSeconds, intervalInSeconds) => {
				const boundary = TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds, timeZone);
				// The oracle's offset at the timestamp, not TimeUtils' own. The boundary aligns
				// to it only if TimeUtils sampled the offset at the timestamp (Requirement 5.3)
				const offsetInSeconds = 60 * longOffsetMinutes(timeZone, timestampInSeconds * 1000);

				expect(Number.isInteger(boundary)).toBe(true);
				expect(boundary).toBeGreaterThanOrEqual(timestampInSeconds);
				expect(boundary).toBeLessThan(timestampInSeconds + intervalInSeconds);
				expect(remainder(boundary + offsetInSeconds, intervalInSeconds)).toBe(0);
			}),
			{ numRuns: WIDE_NUM_RUNS }
		);
	}, PROPERTY_TIMEOUT_MS);

	// **Validates: Requirements 6.4**
	it("Property 2: Boundaries are fixed points", () => {
		fc.assert(
			fc.property(zone, instant, interval, (timeZone, timestampInSeconds, intervalInSeconds) => {
				const boundary = TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds, timeZone);
				// A precondition, not the predicate under test. A boundary on the far side of a
				// transition is aligned to the offset at the timestamp rather than its own, so
				// it isn't a boundary for its own offset. About 1 draw in 200 is excluded
				fc.pre(longOffsetMinutes(timeZone, boundary * 1000) === longOffsetMinutes(timeZone, timestampInSeconds * 1000));

				expect(TimeUtils.nextIntervalInSeconds(intervalInSeconds, boundary, timeZone)).toBe(boundary);
			}),
			{ numRuns: STANDARD_NUM_RUNS }
		);
	}, PROPERTY_TIMEOUT_MS);

	// **Validates: Requirements 5.1, 5.2**
	it("Property 3: The offset agrees with the oracle", () => {
		fc.assert(
			fc.property(zone, instant, (timeZone, timestampInSeconds) => {
				expect(TimeUtils.getOffsetInMinutes(timestampInSeconds, timeZone))
					.toBe(longOffsetMinutes(timeZone, timestampInSeconds * 1000));
			}),
			{ numRuns: WIDE_NUM_RUNS }
		);
	}, PROPERTY_TIMEOUT_MS);

	// **Validates: Requirements 5.1, 6.1**
	it("Property 4: An omitted timestamp means now", () => {
		fc.assert(
			fc.property(zone, interval, nowInMilliseconds, (timeZone, intervalInSeconds, nowMs) => {
				// Mocked for this run only, and restored before the predicate returns
				const nowSpy = jest.spyOn(Date, "now").mockReturnValue(nowMs);
				try {
					// The offset now is the offset at the current second
					expect(TimeUtils.getOffsetInMinutes(0, timeZone))
						.toBe(TimeUtils.getOffsetInMinutes(Math.floor(nowMs / 1000), timeZone));
					// The boundary from now is the boundary from the current time in seconds, rounded up
					expect(TimeUtils.nextIntervalInSeconds(intervalInSeconds, 0, timeZone))
						.toBe(TimeUtils.nextIntervalInSeconds(intervalInSeconds, Math.ceil(nowMs / 1000), timeZone));
				} finally {
					nowSpy.mockRestore();
				}
			}),
			{ numRuns: STANDARD_NUM_RUNS }
		);
	}, PROPERTY_TIMEOUT_MS);

	// **Validates: Requirements 7.1, 7.2, 7.4**
	it("Property 5: Conversions and formatting", () => {
		fc.assert(
			fc.property(nonZeroSeconds, nonZeroMilliseconds, (seconds, milliseconds) => {
				expect(TimeUtils.convertTimestampFromSecondsToMilli(seconds)).toBe(seconds * 1000);
				expect(TimeUtils.convertTimestampFromMilliToSeconds(milliseconds)).toBe(Math.ceil(milliseconds / 1000));
				expect(TimeUtils.generateInternetFormattedDate(seconds)).toBe(new Date(seconds * 1000).toUTCString());
				expect(TimeUtils.generateInternetFormattedDate(milliseconds, true)).toBe(new Date(milliseconds).toUTCString());
			}),
			{ numRuns: STANDARD_NUM_RUNS }
		);
	}, PROPERTY_TIMEOUT_MS);

	// **Validates: Requirements 7.5, 7.6**
	describe("Property 6: Parsing", () => {

		it("parses the HTTP date and ISO 8601 forms of a second back to that second", () => {
			fc.assert(
				fc.property(parseableSecond, (seconds) => {
					const date = new Date(seconds * 1000);

					expect(TimeUtils.parseToSeconds(date.toUTCString())).toBe(seconds);
					expect(TimeUtils.parseToSeconds(date.toISOString())).toBe(seconds);
				}),
				{ numRuns: STANDARD_NUM_RUNS }
			);
		}, PROPERTY_TIMEOUT_MS);

		it("returns 0 for any string Date.parse() can't parse", () => {
			fc.assert(
				fc.property(anyString, (text) => {
					// A precondition on Date.parse(), not the predicate under test, which is
					// about parseToSeconds()
					fc.pre(Number.isNaN(Date.parse(text)));

					expect(TimeUtils.parseToSeconds(text)).toBe(0);
				}),
				{ numRuns: STANDARD_NUM_RUNS }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	// **Validates: Requirements 2.1, 2.2, 2.4 to 2.7, 3.1 to 3.3**
	describe("Property 7: Resolution follows the rules", () => {

		// The invalid kind is only invalid if Intl rejects it. If a runtime ever accepts
		// such a name, this fails loudly instead of the property silently weakening
		it("rests on a premise that holds: Intl accepts no name that starts with Invalid/", () => {
			// Intl matches names case-insensitively, so the comparison is too
			const supportedWithPrefix = SUPPORTED_ZONES
				.filter((name) => name.toLowerCase().startsWith(INVALID_PREFIX.toLowerCase()));
			const acceptedSamples = fc.sample(invalidName, PREMISE_SAMPLE_SIZE).filter(isAcceptedByIntl);

			expect(supportedWithPrefix).toEqual([]);
			expect(acceptedSamples).toEqual([]);
		}, PROPERTY_TIMEOUT_MS);

		it("returns or throws what a model of Requirements 2 and 3 predicts", () => {
			fc.assert(
				fc.property(taggedOption, taggedEnvValue, (option, env) => {
					expect(observeResolution(option.value, env.value)).toEqual(predictResolution(option, env));
				}),
				{ numRuns: STANDARD_NUM_RUNS }
			);
		}, PROPERTY_TIMEOUT_MS);
	});
});
