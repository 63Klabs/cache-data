/**
 * Unit tests for the internal TimeUtils class.
 *
 * TimeUtils isn't part of the public API, so it's imported directly by file path, as the
 * DataHasher and in-memory-cache tests import their classes.
 *
 * This file NEVER calls TimeUtils.init(). The first successful init() fixes the active
 * timezone for the life of the module instance, and there's no reset (Requirement 4.6),
 * while Jest gives each test file its own module registry. So every test here sees
 * TimeUtils uninitialized, with an active timezone of "Etc/UTC" and an offset of 0, and no
 * test depends on the order the tests run in. Other zones are reached through the
 * explicit-timezone seam: resolveTimezone() and the timezone argument of
 * getOffsetInMinutes() and nextIntervalInSeconds() (Requirement 4.5). Behavior that needs
 * init(), or reads CACHE_DATA_TIME_ZONE_FOR_INTERVAL, runs in fresh child processes in
 * integration/time-utils-lifecycle-tests.jest.mjs instead (Requirement 11.3). That
 * includes init() with undefined or null options (Requirement 2.3).
 *
 * Fixed expected values use only zones and dates for which the tz data in Node.js 22, 24,
 * and 26 agrees (Requirement 11.12). That rules out the zones PLAN.md Round 2 found
 * drifting from September 2026: Africa/Casablanca and Africa/El_Aaiun, and the Canadian
 * zones such as America/Vancouver, America/Edmonton, America/Winnipeg, and America/Inuvik.
 * Every zone used here, including America/Chicago in November 2026, agrees on all three.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Test files")
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";

import TimeUtils from "../../../../src/lib/utils/TimeUtils.class.js";
import DebugAndLog from "../../../../src/lib/tools/DebugAndLog.class.js";
import { INTERVAL_TABLE } from "../../../helpers/time-utils-oracles.mjs";

/* ****************************************************************************
 *	Shared data and helpers
 */

/** Closes every invalid-timezone error message (Requirements 2.4, 3.2, 3.3). */
const TIMEZONE_HINT = 'Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/**
 * The public static methods in design.md's TimeUtils table, in its order. Requirement 1.2
 * names all of them except resolveTimezone() and getTzDataVersion().
 */
const PUBLIC_STATIC_METHODS = Object.freeze([
	"init",
	"resolveTimezone",
	"getTimeZone",
	"getTzDataVersion",
	"getOffsetInMinutes",
	"nextIntervalInSeconds",
	"generateInternetFormattedDate",
	"convertTimestampFromMilliToSeconds",
	"convertTimestampFromSecondsToMilli",
	"parseToSeconds"
]);

/** Values that aren't provided (Requirement 2.2): undefined, null, "", and whitespace only. */
const NOT_PROVIDED = Object.freeze([undefined, null, "", "   ", "\t \n"]);

/**
 * Convert an ISO 8601 date to seconds since the Unix epoch.
 *
 * @param {string} isoDate - A date with a UTC designator, such as "2026-01-15T18:00:00Z"
 * @returns {number} Seconds since 1970-01-01T00:00:00Z
 */
function secondsAt(isoDate) {
	return Date.parse(isoDate) / 1000;
}

/**
 * Render seconds since the Unix epoch as an ISO 8601 string, so that a wrong boundary
 * fails with readable dates. A non-finite value renders as itself instead of throwing.
 *
 * @param {number} seconds - Seconds since the epoch
 * @returns {string} Such as "2026-01-16T06:00:00.000Z", or "NaN"
 */
function isoAt(seconds) {
	return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : String(seconds);
}

/**
 * Run a function and return what it throws.
 *
 * @param {function(): *} fn - The function to run
 * @returns {*} The thrown value, or undefined when fn returns normally
 */
function thrownBy(fn) {
	try {
		fn();
	} catch (error) {
		return error;
	}
	return undefined;
}

/**
 * Assert that error is an invalid-timezone Error with the expected message, and that its
 * cause is the RangeError Intl.DateTimeFormat itself throws for the rejected name
 * (Requirement 3.1).
 *
 * @param {*} error - What the call under test threw
 * @param {string} expectedMessage - The exact message
 * @param {string} rejectedName - The trimmed name Intl rejected
 * @returns {void}
 */
function expectInvalidTimezoneError(error, expectedMessage, rejectedName) {
	const intlError = thrownBy(() => new Intl.DateTimeFormat("en-US", { timeZone: rejectedName }));

	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe(expectedMessage);
	expect(error.cause).toBeInstanceOf(RangeError);
	expect(error.cause.message).toBe(intlError?.message);
}

/** 2026-01-15T18:00:00Z: noon CST in Chicago, and summer in the southern hemisphere. */
const JANUARY = secondsAt("2026-01-15T18:00:00Z");

/** 2026-07-01T12:00:00Z: 7:00 AM CDT in Chicago, and winter in the southern hemisphere. */
const JULY = secondsAt("2026-07-01T12:00:00Z");

/** A Date.now() value to mock: 2026-01-15T18:00:00.123Z, with milliseconds so rounding shows. */
const MOCKED_NOW_MS = Date.parse("2026-01-15T18:00:00.123Z");

afterEach(() => {
	jest.restoreAllMocks();
});

/* ****************************************************************************
 *	Class surface and lifecycle state
 */

// Validates: Requirements 1.2, 4.6
describe("TimeUtils class surface", () => {

	it("has exactly the public static methods in the design, plus length, name, and prototype", () => {
		// Private # members don't appear here. A public reset member, or any other unlisted
		// static, would (Requirement 4.6)
		expect(Object.getOwnPropertyNames(TimeUtils).sort()).toEqual([...PUBLIC_STATIC_METHODS, "length", "name", "prototype"].sort());
		expect(Object.getOwnPropertySymbols(TimeUtils)).toEqual([]);
	});

	it.each(PUBLIC_STATIC_METHODS)("has %s() as a static method", (methodName) => {
		expect(typeof TimeUtils[methodName]).toBe("function");
	});

	it("has no instance members", () => {
		expect(Object.getOwnPropertyNames(TimeUtils.prototype)).toEqual(["constructor"]);
		expect(Object.getOwnPropertySymbols(TimeUtils.prototype)).toEqual([]);
	});
});

// Validates: Requirement 4.3
describe("TimeUtils before init()", () => {

	it("reports Etc/UTC as the active timezone", () => {
		expect(TimeUtils.getTimeZone()).toBe("Etc/UTC");
	});

	it("reports an offset of 0, now and at any timestamp", () => {
		// toBe() compares with Object.is, so -0 would fail
		expect(TimeUtils.getOffsetInMinutes()).toBe(0);
		expect(TimeUtils.getOffsetInMinutes(0)).toBe(0);
		expect(TimeUtils.getOffsetInMinutes(JANUARY)).toBe(0);
		expect(TimeUtils.getOffsetInMinutes(JULY)).toBe(0);
	});

	it("rounds interval boundaries with an offset of 0", () => {
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, JANUARY))).toBe("2026-01-16T00:00:00.000Z");
		// Asia/Kathmandu, at +5:45, gives 10:15Z from here (see nextIntervalInSeconds() below)
		expect(isoAt(TimeUtils.nextIntervalInSeconds(3600, secondsAt("2026-01-15T10:10:00Z")))).toBe("2026-01-15T11:00:00.000Z");
	});
});

// Validates: Requirement 4.5
describe("TimeUtils with an explicit timezone", () => {

	it("leaves the active timezone unchanged", () => {
		expect(TimeUtils.resolveTimezone("America/Chicago", "Asia/Kolkata")).toBe("America/Chicago");
		expect(TimeUtils.getOffsetInMinutes(JULY, "America/Chicago")).toBe(-300);
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, JANUARY, "America/Chicago"))).toBe("2026-01-16T06:00:00.000Z");

		expect(TimeUtils.getTimeZone()).toBe("Etc/UTC");
		expect(TimeUtils.getOffsetInMinutes(JULY)).toBe(0);
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, JANUARY))).toBe("2026-01-16T00:00:00.000Z");
	});

	it.each([
		["getOffsetInMinutes()", () => TimeUtils.getOffsetInMinutes(JANUARY, " Invalid/Zone ")],
		["nextIntervalInSeconds()", () => TimeUtils.nextIntervalInSeconds(3600, JANUARY, " Invalid/Zone ")]
	])("%s throws the option error, with Intl's error as the cause, for a timezone Intl rejects", (_methodName, call) => {
		expectInvalidTimezoneError(thrownBy(call), `Invalid timezone "Invalid/Zone". ${TIMEZONE_HINT}`, "Invalid/Zone");
	});
});

/* ****************************************************************************
 *	Timezone resolution
 */

// Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3
describe("TimeUtils.resolveTimezone()", () => {

	// One block per row of the decision table in design.md, "Timezone resolution"

	describe("with a provided option", () => {

		it.each([
			["America/Chicago", undefined],
			["  America/Chicago\t", "Europe/London"],
			["America/Chicago", " Invalid/Zone "],
			["\nAmerica/Chicago ", "   "]
		])("returns the option %j, trimmed, whatever the env value, here %j", (option, envValue) => {
			// The env value isn't read, so an invalid one can't fail a valid option
			expect(TimeUtils.resolveTimezone(option, envValue)).toBe("America/Chicago");
		});

		it.each([
			// 0 and false are falsy, but only the four kinds in NOT_PROVIDED aren't provided
			["the number 42", 42, "number"],
			["the number 0", 0, "number"],
			["false", false, "boolean"],
			["an object", {}, "object"],
			["an array", [], "object"],
			["a bigint", 1n, "bigint"],
			["a symbol", Symbol("America/Chicago"), "symbol"],
			["a function", () => "America/Chicago", "function"]
		])("throws the type error for %s, without falling back to the env value", (_label, option, typeName) => {
			const error = thrownBy(() => TimeUtils.resolveTimezone(option, "Asia/Kolkata"));

			expect(error).toBeInstanceOf(Error);
			expect(error.message).toBe(`Invalid timezone of type ${typeName}. ${TIMEZONE_HINT}`);
		});

		it.each([
			// [option, env value, the exact message, the trimmed name Intl rejected]
			["Invalid/Zone", undefined, `Invalid timezone "Invalid/Zone". ${TIMEZONE_HINT}`, "Invalid/Zone"],
			[" Invalid/Zone\t", "Asia/Kolkata", `Invalid timezone "Invalid/Zone". ${TIMEZONE_HINT}`, "Invalid/Zone"],
			// JSON.stringify escapes the quote and the control character (Requirement 3.2)
			['Bad"Zone\u0007', undefined, `Invalid timezone "Bad\\"Zone\\u0007". ${TIMEZONE_HINT}`, 'Bad"Zone\u0007']
		])("throws the option error, with Intl's error as the cause, for %j with the env value %j", (option, envValue, expectedMessage, rejectedName) => {
			expectInvalidTimezoneError(thrownBy(() => TimeUtils.resolveTimezone(option, envValue)), expectedMessage, rejectedName);
		});
	});

	describe("with an option that isn't provided", () => {

		it.each(NOT_PROVIDED)("falls through an option of %j to the env value, trimmed", (option) => {
			expect(TimeUtils.resolveTimezone(option, "\tAsia/Kolkata  ")).toBe("Asia/Kolkata");
		});

		it.each(NOT_PROVIDED)("throws the env error, with Intl's error as the cause, for an option of %j and an env value Intl rejects", (option) => {
			expectInvalidTimezoneError(
				thrownBy(() => TimeUtils.resolveTimezone(option, " Invalid/Zone ")),
				`Invalid timezone "Invalid/Zone" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. ${TIMEZONE_HINT}`,
				"Invalid/Zone"
			);
		});

		it("defaults to Etc/UTC when the env value isn't provided either", () => {
			const resolved = NOT_PROVIDED.flatMap((option) => NOT_PROVIDED.map((envValue) => ({
				option,
				envValue,
				timezone: TimeUtils.resolveTimezone(option, envValue)
			})));

			expect(resolved.filter(({ timezone }) => timezone !== "Etc/UTC")).toEqual([]);
		});
	});

	describe("accepted names", () => {

		it('accepts every name Intl.supportedValuesOf("timeZone") lists, and returns it as given', () => {
			const zones = Intl.supportedValuesOf("timeZone");

			expect(zones.filter((zone) => TimeUtils.resolveTimezone(zone, undefined) !== zone)).toEqual([]);
		});

		// Intl accepts all of these, but none is in Intl.supportedValuesOf("timeZone"), so
		// TimeUtils can't be checking a list of its own. Intl canonicalizes the first four to
		// UTC, Asia/Calcutta, and America/Chicago, and TimeUtils keeps them as given
		it.each([
			["Etc/UTC", "the default"],
			["Asia/Kolkata", "a name Intl canonicalizes to Asia/Calcutta"],
			["US/Central", "an alias"],
			["america/chicago", "a name in another letter case"],
			["+05:30", "a fixed offset east of UTC"],
			["-08:00", "a fixed offset west of UTC"]
		])("accepts %s, %s, and returns it as given", (name) => {
			expect(TimeUtils.resolveTimezone(name, undefined)).toBe(name);
		});
	});
});

/* ****************************************************************************
 *	Offsets and interval boundaries
 */

// Validates: Requirements 4.5, 5.1
describe("TimeUtils.getOffsetInMinutes() with an explicit timezone", () => {

	// Local time minus UTC: positive east of UTC, negative west. toBe() compares with
	// Object.is, so the zero rows also check that a zero offset is 0 rather than -0
	it.each([
		["America/Chicago", "2026-07-01T12:00:00Z", -300], // CDT
		["America/Chicago", "2026-01-15T18:00:00Z", -360], // CST
		["Asia/Kolkata", "2026-01-15T18:00:00Z", 330],
		["Asia/Kathmandu", "2026-07-01T12:00:00Z", 345],
		["Australia/Lord_Howe", "2026-07-01T12:00:00Z", 630], // standard time
		["Australia/Lord_Howe", "2026-01-15T18:00:00Z", 660], // DST, 30 minutes ahead
		["Pacific/Chatham", "2026-07-01T12:00:00Z", 765], // standard time
		["Pacific/Chatham", "2026-01-15T18:00:00Z", 825], // DST
		["Etc/UTC", "2026-01-15T18:00:00Z", 0],
		["Europe/London", "2026-01-15T18:00:00Z", 0], // GMT
		["+05:30", "2026-01-15T18:00:00Z", 330],
		["-08:00", "2026-07-01T12:00:00Z", -480]
	])("returns the offset of %s at %s, %d minutes", (zone, isoDate, expectedMinutes) => {
		expect(TimeUtils.getOffsetInMinutes(secondsAt(isoDate), zone)).toBe(expectedMinutes);
	});

	it.each([
		["2026-01-15T18:00:00.123Z", -360],
		["2026-07-01T12:00:00.456Z", -300]
	])("uses the current time, mocked to %s, for a timestamp of 0 or undefined", (nowIso, expectedMinutes) => {
		jest.spyOn(Date, "now").mockReturnValue(Date.parse(nowIso));

		expect(TimeUtils.getOffsetInMinutes(0, "America/Chicago")).toBe(expectedMinutes);
		expect(TimeUtils.getOffsetInMinutes(undefined, "America/Chicago")).toBe(expectedMinutes);
	});

	// design.md, "Error handling": NaN, as the pre-change arithmetic gave, rather than a throw
	it.each([
		["NaN", NaN],
		["beyond the Date range", 8.64e12 + 1]
	])("returns NaN, without throwing, for a timestamp that's %s", (_label, timestampInSeconds) => {
		expect(TimeUtils.getOffsetInMinutes(timestampInSeconds, "America/Chicago")).toBeNaN();
	});
});

// Validates: Requirements 4.5, 5.3, 6.1, 6.2, 6.4, 6.5
describe("TimeUtils.nextIntervalInSeconds() with an explicit timezone", () => {

	it("puts 30-minute boundaries at :15 and :45 past the UTC hour in Asia/Kathmandu", () => {
		// 10:10Z is 3:55 PM at +5:45, and the next local :00 or :30 is 4:00 PM, 10:15Z
		expect(isoAt(TimeUtils.nextIntervalInSeconds(1800, secondsAt("2026-01-15T10:10:00Z"), "Asia/Kathmandu"))).toBe("2026-01-15T10:15:00.000Z");
	});

	it("puts a 24-hour boundary after DST ends at local midnight, CST", () => {
		// From noon CST on 2026-11-02. The pre-change code, with its offset sampled at init
		// during CDT, gave 05:00Z, which is 11:00 PM CST
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, secondsAt("2026-11-02T18:00:00Z"), "America/Chicago"))).toBe("2026-11-03T06:00:00.000Z");
	});

	it("rounds a 4-hour boundary that straddles the end of DST with the offset at the input", () => {
		// 06:30Z is 1:30 AM CDT on 2026-11-01. The boundary is 4:00 AM at the CDT offset,
		// 09:00Z, which after the 2:00 AM fall-back reads 3:00 AM CST: off by the DST delta,
		// the documented gap (Q1)
		expect(isoAt(TimeUtils.nextIntervalInSeconds(14400, secondsAt("2026-11-01T06:30:00Z"), "America/Chicago"))).toBe("2026-11-01T09:00:00.000Z");
	});

	// 60 days, 5,184,000 seconds, is the least common multiple of the 20 intervals, and local
	// midnight on 2026-01-07 is 341 of them after the epoch in the local frame. So it's a
	// boundary for every interval, and one second later the next boundary is one interval
	// away. None of these zones changes its offset in the 5 days that follow
	it.each([
		["Etc/UTC", "2026-01-07T00:00:00Z"],
		["America/Chicago", "2026-01-07T06:00:00Z"],
		["Asia/Kathmandu", "2026-01-06T18:15:00Z"],
		["Pacific/Chatham", "2026-01-06T10:15:00Z"]
	])("returns a timestamp on a boundary unchanged, for every interval: %s, local midnight at %s", (zone, isoDate) => {
		const boundary = secondsAt(isoDate);

		const mismatches = INTERVAL_TABLE
			.map((intervalInSeconds) => ({
				intervalInSeconds,
				fromBoundary: TimeUtils.nextIntervalInSeconds(intervalInSeconds, boundary, zone) - boundary,
				fromOneSecondLater: TimeUtils.nextIntervalInSeconds(intervalInSeconds, boundary + 1, zone) - boundary
			}))
			.filter(({ intervalInSeconds, fromBoundary, fromOneSecondLater }) => fromBoundary !== 0 || fromOneSecondLater !== intervalInSeconds);

		expect(mismatches).toEqual([]);
	});

	it("uses the current time for a timestamp of 0 or an omitted one", () => {
		// Now, 18:00:00.123Z, rounds up to 18:00:01Z, so the next 15-second boundary is
		// 18:00:15Z rather than 18:00:00Z
		jest.spyOn(Date, "now").mockReturnValue(MOCKED_NOW_MS);

		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, 0, "America/Chicago"))).toBe("2026-01-16T06:00:00.000Z");
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400, undefined, "America/Chicago"))).toBe("2026-01-16T06:00:00.000Z");
		expect(isoAt(TimeUtils.nextIntervalInSeconds(15, 0, "Etc/UTC"))).toBe("2026-01-15T18:00:15.000Z");
		// With no timezone either, the active one: Etc/UTC before init()
		expect(isoAt(TimeUtils.nextIntervalInSeconds(86400))).toBe("2026-01-16T00:00:00.000Z");
	});

	// design.md, "Error handling": NaN rather than a throw
	it.each([
		["a NaN timestamp", 3600, NaN],
		["a timestamp beyond the Date range", 3600, 8.64e12 + 1],
		["an interval of 0", 0, JANUARY]
	])("returns NaN, without throwing, for %s", (_label, intervalInSeconds, timestampInSeconds) => {
		expect(TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds, "America/Chicago")).toBeNaN();
	});
});

/* ****************************************************************************
 *	Conversion, formatting, and parsing
 */

// Validates: Requirements 7.1, 7.2, 7.3
describe("TimeUtils timestamp converters", () => {

	it.each([
		[1700000000000, 1700000000],
		[1700000000001, 1700000001],
		[1700000000999, 1700000001]
	])("convertTimestampFromMilliToSeconds(%i) returns %i, rounding milliseconds up", (timestampInMilliseconds, expectedSeconds) => {
		expect(TimeUtils.convertTimestampFromMilliToSeconds(timestampInMilliseconds)).toBe(expectedSeconds);
	});

	it("convertTimestampFromSecondsToMilli() multiplies by 1000", () => {
		expect(TimeUtils.convertTimestampFromSecondsToMilli(1700000000)).toBe(1700000000000);
	});

	it("both use Date.now() for 0 or no argument, without throwing", () => {
		jest.spyOn(Date, "now").mockReturnValue(MOCKED_NOW_MS);

		// 18:00:00.123Z, rounded up to the second
		expect(TimeUtils.convertTimestampFromMilliToSeconds()).toBe(1768500001);
		expect(TimeUtils.convertTimestampFromMilliToSeconds(0)).toBe(1768500001);
		expect(TimeUtils.convertTimestampFromSecondsToMilli()).toBe(1768500000123);
		expect(TimeUtils.convertTimestampFromSecondsToMilli(0)).toBe(1768500000123);
	});
});

// Validates: Requirement 7.4
describe("TimeUtils.generateInternetFormattedDate()", () => {

	it("formats a timestamp in seconds", () => {
		expect(TimeUtils.generateInternetFormattedDate(1700000000)).toBe("Tue, 14 Nov 2023 22:13:20 GMT");
	});

	it("formats a timestamp in milliseconds when inMilliseconds is true", () => {
		expect(TimeUtils.generateInternetFormattedDate(1700000000000, true)).toBe("Tue, 14 Nov 2023 22:13:20 GMT");
	});

	it("formats the current time for a seconds value of 0 or an omitted timestamp", () => {
		jest.spyOn(Date, "now").mockReturnValue(MOCKED_NOW_MS);

		expect(TimeUtils.generateInternetFormattedDate(0)).toBe("Thu, 15 Jan 2026 18:00:00 GMT");
		expect(TimeUtils.generateInternetFormattedDate()).toBe("Thu, 15 Jan 2026 18:00:00 GMT");
	});

	it("formats the Unix epoch, not the current time, for a milliseconds value of 0", () => {
		jest.spyOn(Date, "now").mockReturnValue(MOCKED_NOW_MS);

		expect(TimeUtils.generateInternetFormattedDate(0, true)).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
	});
});

// Validates: Requirements 7.5, 7.6, 7.7
describe("TimeUtils.parseToSeconds()", () => {

	it.each([
		["an HTTP date", "Wed, 28 Jul 2021 12:24:11 GMT", 1627475051],
		["an ISO 8601 date", "2021-07-28T12:24:11Z", 1627475051],
		["an ISO 8601 date with milliseconds, rounded up", "2021-07-28T12:24:11.001Z", 1627475052]
	])("parses %s, %j, to %i", (_format, date, expectedSeconds) => {
		expect(TimeUtils.parseToSeconds(date)).toBe(expectedSeconds);
	});

	it.each([
		"Thu, 01 Jan 1970 00:00:00 GMT",
		"1970-01-01T00:00:00.000Z"
	])("parses the Unix epoch, %j, to 0 without logging an error", (date) => {
		const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});

		expect(TimeUtils.parseToSeconds(date)).toBe(0);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it.each([
		["an unparsable string", "not a date"],
		["an empty string", ""],
		["undefined", undefined]
	])("returns 0, without logging an error, for %s", (_label, date) => {
		const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});

		expect(TimeUtils.parseToSeconds(date)).toBe(0);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("returns 0 and logs one error when Date.parse() throws, as it does for a Symbol", () => {
		const date = Symbol("2021-07-28T12:24:11Z");
		const parseError = thrownBy(() => Date.parse(date));
		const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});

		expect(TimeUtils.parseToSeconds(date)).toBe(0);
		expect(errorSpy).toHaveBeenCalledTimes(1);

		const [message, stack] = errorSpy.mock.calls[0];
		expect(message).toMatch(/^Cannot parse date\/time: /);
		expect(message).toContain(parseError.message);
		expect(stack).toContain(`${parseError.name}: ${parseError.message}`);
	});
});
