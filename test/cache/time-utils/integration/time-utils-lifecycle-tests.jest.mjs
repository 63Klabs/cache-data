/**
 * TimeUtils.init() lifecycle tests (child processes).
 *
 * Purpose: verify how TimeUtils.init() picks the active timezone and how often it does.
 * The timezone option comes first, then the CACHE_DATA_TIME_ZONE_FOR_INTERVAL environment
 * variable, then "Etc/UTC". Values that aren't provided fall through to the next level,
 * names are trimmed, and init() without an options object behaves like init({}). An
 * invalid name throws a readable error and leaves TimeUtils uninitialized, so a corrected
 * call still succeeds. The first successful call fixes the timezone, and every later call
 * logs one warning and reads neither the option nor the environment variable.
 *
 * Setup: TimeUtils initializes once per module instance and has no reset (Requirement
 * 4.6), and init() reads CACHE_DATA_TIME_ZONE_FOR_INTERVAL from the process environment.
 * So each test runs the `time-utils-init` scenario of
 * test/cache/time-utils/fixtures/time-utils-child.cjs in a fresh Node.js process through
 * test/helpers/time-utils-child-runner.mjs (Requirement 11.6). The runner uses
 * execFileSync with an argument array and a 20-second child timeout, never a shell or
 * `npm test`. It removes CACHE_DATA_TIME_ZONE_FOR_INTERVAL from the child environment,
 * and a test that needs the variable sets it through the runner's env overrides, never in
 * this process's environment. The child replaces DebugAndLog.warn and DebugAndLog.error
 * with recorders.
 *
 * These tests call TimeUtils directly rather than through Cache, so they don't depend on
 * the src/lib/dao-cache.js integration. They assert zone names, never offsets or
 * boundaries, so no result depends on the runtime's tz data.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (task 5.6; design.md, "Testing strategy")
 * Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.7, 3.1 to 3.4, 4.1, 4.2, 11.6, 12.2
 *
 * Related tests:
 * - test/cache/time-utils/unit/time-utils-unit-tests.jest.mjs
 * - test/cache/time-utils/property/time-utils-property-tests.jest.mjs
 * - test/cache/time-utils/integration/time-utils-cache-init-tests.jest.mjs
 */

import { describe, it, expect } from "@jest/globals";
import { runTimeUtilsChild } from "../../../helpers/time-utils-child-runner.mjs";

/** Timeout for each child-process test; the child itself times out at 20 seconds. */
const CHILD_TEST_TIMEOUT_MS = 60000;

/** The Requirement 3.2 message for "Invalid/Zone" passed as the timezone option. */
const INVALID_OPTION_MESSAGE = 'Invalid timezone "Invalid/Zone". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/** The Requirement 3.3 message for "Invalid/Zone" read from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. */
const INVALID_ENV_VALUE_MESSAGE = 'Invalid timezone "Invalid/Zone" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/** The warning each call after a successful init logs with DebugAndLog.warn (Requirement 4.2). */
const ALREADY_INITIALIZED_WARNING = "TimeUtils already initialized. Ignoring call to TimeUtils.init()";

/** The child's summary of an init call that returned. */
const RETURNED = Object.freeze({ threw: false, name: null, message: null, causeName: null });

/** The child's summary of an init call that threw for "Invalid/Zone" as the option (Requirements 3.1, 3.2). */
const THREW_INVALID_OPTION = Object.freeze({ threw: true, name: "Error", message: INVALID_OPTION_MESSAGE, causeName: "RangeError" });

/** The child's summary of an init call that threw for "Invalid/Zone" from the env var (Requirements 3.1, 3.3). */
const THREW_INVALID_ENV_VALUE = Object.freeze({ threw: true, name: "Error", message: INVALID_ENV_VALUE_MESSAGE, causeName: "RangeError" });

/**
 * The call every resolution case makes after the call under test. A call after a
 * successful init is ignored with one ALREADY_INITIALIZED_WARNING, so the warning shows
 * that the call under test initialized TimeUtils. That matters where the expected
 * timezone is Etc/UTC, which an uninitialized TimeUtils also reports. Had the call under
 * test left TimeUtils uninitialized, this call would initialize it, and the timezone would
 * read Pacific/Chatham.
 */
const PROBE_CALL = Object.freeze({ options: Object.freeze({ timezone: "Pacific/Chatham" }) });

/**
 * Run the time-utils-init scenario in a fresh process, check that it ran, and return the
 * fields the tests assert on.
 *
 * @param {Array<Object>} calls - time-utils-init call entries: `{ options }` calls TimeUtils.init(options), `{}` calls TimeUtils.init(undefined), and `{ noArgument: true }` calls TimeUtils.init(). JSON can't carry undefined, so options without a timezone key stand for `{ timezone: undefined }`
 * @param {Object.<string, (string|undefined)>} [env={}] - Environment overrides for the child, such as CACHE_DATA_TIME_ZONE_FOR_INTERVAL. undefined leaves a variable unset
 * @returns {{calls: Array<Object>, timeZone: string, warnings: Array<string>, errors: Array<string>}} Each call's outcome, TimeUtils.getTimeZone() after the calls, and the messages logged with DebugAndLog.warn and DebugAndLog.error
 */
function runTimeUtilsInit(calls, env = {}) {
	const run = runTimeUtilsChild("time-utils-init", { calls }, { env });
	// stderr is empty on a zero exit, so a failed run shows the child's error line in the diff
	expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: "" });
	expect(run.result).not.toBeNull();
	expect(run.result.loadError).toBeNull();
	const { calls: outcomes, timeZone, warnings, errors } = run.result;
	return { calls: outcomes, timeZone, warnings, errors };
}

/**
 * Check one resolution case in a fresh process: the call under test, then PROBE_CALL.
 * Both return, the probe is ignored with one warning, and the active timezone is the one
 * the call under test resolved.
 *
 * @param {{envValue: (string|undefined), call: Object, timeZone: string}} resolutionCase - CACHE_DATA_TIME_ZONE_FOR_INTERVAL in the child (undefined for unset), the call entry under test, and the timezone it resolves
 * @returns {void}
 */
function expectResolution({ envValue, call, timeZone }) {
	expect(runTimeUtilsInit([call, PROBE_CALL], { CACHE_DATA_TIME_ZONE_FOR_INTERVAL: envValue })).toEqual({
		calls: [RETURNED, RETURNED],
		timeZone,
		warnings: [ALREADY_INITIALIZED_WARNING],
		errors: []
	});
}

// Each source gets its own zone, so the resolved name shows which one won: America/Chicago
// for the option, Asia/Kolkata for the env var, and Etc/UTC for the default. Intl
// canonicalizes Asia/Kolkata to Asia/Calcutta and Etc/UTC to UTC on Node.js 22, 24, and 26,
// and TimeUtils keeps a name as given (Requirement 2.7), so the expected names are as written

/** The option, then CACHE_DATA_TIME_ZONE_FOR_INTERVAL, then Etc/UTC (Requirements 2.1, 12.2). */
const PRECEDENCE_CASES = Object.freeze([
	{
		title: "uses the timezone option over CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
		envValue: "Asia/Kolkata",
		call: { options: { timezone: "America/Chicago" } },
		timeZone: "America/Chicago"
	},
	{
		title: "uses CACHE_DATA_TIME_ZONE_FOR_INTERVAL when the option is omitted",
		envValue: "Asia/Kolkata",
		call: { options: {} },
		timeZone: "Asia/Kolkata"
	},
	{
		title: "defaults to Etc/UTC when neither the option nor CACHE_DATA_TIME_ZONE_FOR_INTERVAL is set",
		envValue: undefined,
		call: { options: {} },
		timeZone: "Etc/UTC"
	},
	{
		// The env var is read only when the option isn't provided
		title: "doesn't read CACHE_DATA_TIME_ZONE_FOR_INTERVAL when the option is provided, so an invalid value there can't fail a valid option",
		envValue: "Invalid/Zone",
		call: { options: { timezone: "America/Chicago" } },
		timeZone: "America/Chicago"
	}
]);

/**
 * Values that aren't provided fall through at both levels (Requirement 2.2). An omitted
 * option, which stands for undefined, is the second precedence case, and an unset env var
 * the third. An env var can't hold null.
 */
const NOT_PROVIDED_CASES = Object.freeze([
	{
		title: "falls through a null option to CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
		envValue: "Asia/Kolkata",
		call: { options: { timezone: null } },
		timeZone: "Asia/Kolkata"
	},
	{
		title: 'falls through an option of "" to CACHE_DATA_TIME_ZONE_FOR_INTERVAL',
		envValue: "Asia/Kolkata",
		call: { options: { timezone: "" } },
		timeZone: "Asia/Kolkata"
	},
	{
		title: "falls through a whitespace-only option to CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
		envValue: "Asia/Kolkata",
		call: { options: { timezone: " \t " } },
		timeZone: "Asia/Kolkata"
	},
	{
		title: 'falls through a CACHE_DATA_TIME_ZONE_FOR_INTERVAL of "" to Etc/UTC',
		envValue: "",
		call: { options: {} },
		timeZone: "Etc/UTC"
	},
	{
		title: "falls through a whitespace-only CACHE_DATA_TIME_ZONE_FOR_INTERVAL to Etc/UTC",
		envValue: " \t  ",
		call: { options: {} },
		timeZone: "Etc/UTC"
	}
]);

/** Without an options object, init() behaves like init({}), so the env var applies (Requirement 2.3). */
const MISSING_OPTIONS_CASES = Object.freeze([
	{
		title: "treats TimeUtils.init() with no argument like init({})",
		envValue: "Asia/Kolkata",
		call: { noArgument: true },
		timeZone: "Asia/Kolkata"
	},
	{
		title: "treats TimeUtils.init(undefined) like init({})",
		envValue: "Asia/Kolkata",
		call: {},
		timeZone: "Asia/Kolkata"
	},
	{
		title: "treats TimeUtils.init(null) like init({})",
		envValue: "Asia/Kolkata",
		call: { options: null },
		timeZone: "Asia/Kolkata"
	}
]);

/** Surrounding whitespace is trimmed before validation, at both levels (Requirement 2.5). */
const TRIMMING_CASES = Object.freeze([
	{
		title: "trims a padded option, which still takes precedence over CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
		envValue: "Asia/Kolkata",
		call: { options: { timezone: "\t America/Chicago  " } },
		timeZone: "America/Chicago"
	},
	{
		title: "trims a padded CACHE_DATA_TIME_ZONE_FOR_INTERVAL",
		envValue: "  Asia/Kolkata\t",
		call: { options: {} },
		timeZone: "Asia/Kolkata"
	}
]);

describe("TimeUtils.init() in a fresh process", () => {

	// Validates: Requirements 2.1, 12.2
	describe("resolution order: the option, then CACHE_DATA_TIME_ZONE_FOR_INTERVAL, then Etc/UTC (Req 2.1, 12.2)", () => {
		it.each(PRECEDENCE_CASES)("$title", expectResolution, CHILD_TEST_TIMEOUT_MS);
	});

	// Validates: Requirement 2.2
	describe("values that aren't provided fall through to the next level (Req 2.2)", () => {
		it.each(NOT_PROVIDED_CASES)("$title", expectResolution, CHILD_TEST_TIMEOUT_MS);
	});

	// Validates: Requirement 2.3
	describe("init() without an options object (Req 2.3)", () => {
		it.each(MISSING_OPTIONS_CASES)("$title", expectResolution, CHILD_TEST_TIMEOUT_MS);
	});

	// Validates: Requirement 2.5
	describe("surrounding whitespace (Req 2.5)", () => {
		it.each(TRIMMING_CASES)("$title", expectResolution, CHILD_TEST_TIMEOUT_MS);
	});

	// Validates: Requirements 3.1, 3.2, 3.3, 3.4
	describe("an invalid timezone (Req 3.1 to 3.4)", () => {

		it("throws the option message, with Intl's RangeError as the cause, and leaves the active timezone at Etc/UTC", () => {
			expect(runTimeUtilsInit([{ options: { timezone: "Invalid/Zone" } }])).toEqual({
				calls: [THREW_INVALID_OPTION],
				timeZone: "Etc/UTC",
				warnings: [],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);

		it("throws the CACHE_DATA_TIME_ZONE_FOR_INTERVAL message, with Intl's RangeError as the cause, when the env var supplied the name", () => {
			expect(runTimeUtilsInit([{ options: {} }], { CACHE_DATA_TIME_ZONE_FOR_INTERVAL: "Invalid/Zone" })).toEqual({
				calls: [THREW_INVALID_ENV_VALUE],
				timeZone: "Etc/UTC",
				warnings: [],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);

		it("leaves TimeUtils uninitialized, so a corrected call succeeds without an 'already initialized' warning", () => {
			expect(runTimeUtilsInit([
				{ options: { timezone: "Invalid/Zone" } },
				{ options: { timezone: "America/Chicago" } }
			])).toEqual({
				calls: [THREW_INVALID_OPTION, RETURNED],
				timeZone: "America/Chicago",
				warnings: [],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);
	});

	// Validates: Requirements 4.1, 4.2
	describe("the first successful init fixes the timezone (Req 4.1, 4.2)", () => {

		it("keeps the first call's timezone, and ignores a second valid call with exactly one warning", () => {
			expect(runTimeUtilsInit([
				{ options: { timezone: "America/Chicago" } },
				{ options: { timezone: "Europe/London" } }
			])).toEqual({
				calls: [RETURNED, RETURNED],
				timeZone: "America/Chicago",
				warnings: [ALREADY_INITIALIZED_WARNING],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);

		it("doesn't read the option on a later call, so an invalid name or a non-string doesn't throw", () => {
			expect(runTimeUtilsInit([
				{ options: { timezone: "America/Chicago" } },
				{ options: { timezone: "Invalid/Zone" } },
				{ options: { timezone: 42 } }
			])).toEqual({
				calls: [RETURNED, RETURNED, RETURNED],
				timeZone: "America/Chicago",
				warnings: [ALREADY_INITIALIZED_WARNING, ALREADY_INITIALIZED_WARNING],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);

		it("doesn't read CACHE_DATA_TIME_ZONE_FOR_INTERVAL on a later call, so an invalid value doesn't throw", () => {
			// The first call provides the option, so it never reads the env var. The second
			// doesn't, so reading the env var would throw the env var message
			const result = runTimeUtilsInit(
				[
					{ options: { timezone: "America/Chicago" } },
					{ options: {} }
				],
				{ CACHE_DATA_TIME_ZONE_FOR_INTERVAL: "Invalid/Zone" }
			);

			expect(result).toEqual({
				calls: [RETURNED, RETURNED],
				timeZone: "America/Chicago",
				warnings: [ALREADY_INITIALIZED_WARNING],
				errors: []
			});
		}, CHILD_TEST_TIMEOUT_MS);
	});
});
