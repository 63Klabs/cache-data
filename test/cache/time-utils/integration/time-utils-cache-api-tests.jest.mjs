/**
 * Cache time API tests for the TimeUtils refactor, run in process.
 *
 * Cache.init() runs once, at module scope, with timeZoneForInterval "America/Chicago",
 * and every block in this file shares that state. Jest gives each test file its own
 * module registry and its own copy of process.env, so neither this init nor the
 * environment cleanup before it reaches another file. Anything that needs a fresh
 * init, or reads CACHE_DATA_TIME_ZONE_FOR_INTERVAL, runs in a child process instead:
 * see time-utils-cache-init-tests.jest.mjs.
 *
 * The file has three top-level blocks, in this order. Each task appends its block after
 * the ones before it, and the module-scope init and the shared afterEach apply to all
 * of them.
 *
 * - "preservation" (task 3.1): today's public contract. These pass on the pre-change
 *   code and must keep passing, unmodified, once dao-cache.js delegates to TimeUtils.
 *   They use only the public Cache API, and no expected value depends on the offset.
 * - "fixed behavior" (task 4.1): the defects this spec fixes. These fail on the
 *   pre-change code.
 * - "delegation" (task 6.5): Cache's time helpers return what TimeUtils returns. This
 *   is the only block that imports TimeUtils.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Test files")
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { randomBytes } from "node:crypto";

import { Cache } from "../../../../src/lib/dao-cache.js";
import TimeUtils from "../../../../src/lib/utils/TimeUtils.class.js";
import DebugAndLog from "../../../../src/lib/tools/DebugAndLog.class.js";
import { INTERVAL_TABLE } from "../../../helpers/time-utils-oracles.mjs";

/* ****************************************************************************
 *	Shared setup
 */

// CACHE_IN_MEMORY_ONLY and CACHE_USE_IN_MEMORY switch Cache.init() into the in-memory
// modes, which this file doesn't cover. In in-memory-only mode, for example,
// Cache.info().secureDataAlgorithm is null rather than the declared string. Removing
// both keeps results independent of the developer's shell, as
// test/helpers/time-utils-child-runner.mjs does for child processes.
delete process.env.CACHE_IN_MEMORY_ONLY;
delete process.env.CACHE_USE_IN_MEMORY;

Cache.init({
	dynamoDbTable: "time-utils-cache-api-test-table",
	s3Bucket: "time-utils-cache-api-test-bucket",
	// >! A random key for each run, never a real one
	secureDataKey: randomBytes(32),
	timeZoneForInterval: "America/Chicago"
});

afterEach(() => {
	jest.restoreAllMocks();
});

/* ****************************************************************************
 *	preservation
 */

/**
 * The Cache.testInterval() keys after `start`, in order. INTERVAL_TABLE lists the
 * same intervals in the same order.
 */
const INTERVAL_KEYS = Object.freeze([
	"sec_15", "sec_30", "sec_60",
	"min_05", "min_10", "min_15", "min_30", "min_60",
	"hrs_02", "hrs_03", "hrs_04", "hrs_05", "hrs_06", "hrs_08", "hrs_12",
	"hrs_24", "hrs_48", "hrs_72", "hrs_96", "hrs_120"
]);

/** Seconds per unit in a testInterval() key. */
const KEY_UNIT_SECONDS = Object.freeze({ sec: 1, min: 60, hrs: 3600 });

/**
 * The Cache.info() fields that types/lib/dao-cache.d.ts declares before this spec,
 * with their declared types, minus the optional inMemoryCache. Task 10 adds
 * tzDataVersion and saltSource to the declaration, so neither is checked here.
 */
const DECLARED_INFO_FIELDS = Object.freeze([
	["idHashAlgorithm", "string"],
	["dynamoDbTable", "string | null"],
	["s3Bucket", "object"],
	["secureDataAlgorithm", "string"],
	["secureDataKey", "string"],
	["DynamoDbMaxCacheSize_kb", "number"],
	["purgeExpiredCacheEntriesAfterXHours", "number"],
	["timeZoneForInterval", "string"],
	["offsetInMinutes", "number"],
	["useInMemoryCache", "boolean"],
	["sharedCacheId", "string | null"],
	["inMemoryOnly", "boolean"]
]);

/** 2023-11-14T22:13:27Z, which is on none of the boundaries in UTC_ALIGNED_BOUNDARIES. */
const OFF_BOUNDARY_SECONDS = 1700000007;

/**
 * Rows of [interval in seconds, the next boundary after OFF_BOUNDARY_SECONDS, that
 * boundary in UTC]. America/Chicago's offset is a whole number of hours, and each of
 * these intervals divides an hour, so the boundaries fall where they would in UTC
 * whichever Chicago offset applies: the one sampled at init before this spec, or the
 * one at the timestamp after it.
 */
const UTC_ALIGNED_BOUNDARIES = Object.freeze([
	[15, 1700000010, "22:13:30Z"],
	[60, 1700000040, "22:14:00Z"],
	[900, 1700000100, "22:15:00Z"],
	[3600, 1700002800, "23:00:00Z"]
]);

/**
 * Name a value's type the way types/ declares it: "null" for null, otherwise typeof.
 *
 * @param {*} value - Any value
 * @returns {string} "null", or what typeof returns for value
 */
function typeName(value) {
	return (value === null) ? "null" : typeof value;
}

/**
 * Read the interval a testInterval() key names: "sec_15" is 15 seconds, "min_05" is
 * 300, and "hrs_120" is 432000.
 *
 * @param {string} key - A key from INTERVAL_KEYS
 * @returns {number} The interval in seconds, or NaN when key has another format
 */
function intervalFromKey(key) {
	const [unit, count] = key.split("_");
	return (Object.hasOwn(KEY_UNIT_SECONDS, unit) ? KEY_UNIT_SECONDS[unit] : NaN) * Number(count);
}

// Validates: Requirements 8.6, 8.7, 11.7, 12.3
describe("preservation", () => {

	describe("Cache.testInterval()", () => {

		it("returns start followed by one Date per interval, under the existing keys", () => {
			const { tests } = Cache.testInterval();

			expect(Object.keys(tests)).toEqual(["start", ...INTERVAL_KEYS]);
			expect(Object.keys(tests).filter((key) => !(tests[key] instanceof Date))).toEqual([]);
		});

		it("pairs each key with the INTERVAL_TABLE entry at the same index", () => {
			// The bounds check below relies on this pairing
			expect(INTERVAL_KEYS.map(intervalFromKey)).toEqual([...INTERVAL_TABLE]);
		});

		it("puts each boundary at or after start and less than one interval later", () => {
			const { tests } = Cache.testInterval();
			const startMs = tests.start.getTime();

			const outOfBounds = INTERVAL_KEYS
				.map((key, index) => ({
					key,
					intervalInSeconds: INTERVAL_TABLE[index],
					secondsAfterStart: (tests[key].getTime() - startMs) / 1000
				}))
				// Negated so that NaN, which fails both comparisons, is reported too
				.filter(({ intervalInSeconds, secondsAfterStart }) => !(secondsAfterStart >= 0 && secondsAfterStart < intervalInSeconds));

			expect(outOfBounds).toEqual([]);
		});

		it("reports timeZoneForInterval as a string and offsetInMinutes as a number in info", () => {
			const { info } = Cache.testInterval();

			expect(typeName(info.timeZoneForInterval)).toBe("string");
			expect(typeName(info.offsetInMinutes)).toBe("number");
			expect(info.offsetInMinutes).not.toBeNaN();
		});
	});

	describe("Cache.generateInternetFormattedDate()", () => {

		it("formats a timestamp in seconds as an HTTP date", () => {
			expect(Cache.generateInternetFormattedDate(1700000000)).toBe("Tue, 14 Nov 2023 22:13:20 GMT");
		});

		it("formats a timestamp in milliseconds as an HTTP date when inMilliseconds is true", () => {
			expect(Cache.generateInternetFormattedDate(1700000000000, true)).toBe("Tue, 14 Nov 2023 22:13:20 GMT");
		});
	});

	describe("Cache.parseToSeconds()", () => {

		it.each([
			["an HTTP date", "Wed, 28 Jul 2021 12:24:11 GMT"],
			["an ISO 8601 date", "2021-07-28T12:24:11Z"]
		])("parses %s, %j, to seconds since the epoch", (_format, date) => {
			expect(Cache.parseToSeconds(date)).toBe(1627475051);
		});
	});

	describe("Cache.nextIntervalInSeconds()", () => {

		it.each(UTC_ALIGNED_BOUNDARIES)("rounds 22:13:27Z up to the next %i-second boundary, %i (%s)", (intervalInSeconds, boundary) => {
			expect(Cache.nextIntervalInSeconds(intervalInSeconds, OFF_BOUNDARY_SECONDS)).toBe(boundary);
		});

		it.each(UTC_ALIGNED_BOUNDARIES)("returns a timestamp on a %i-second boundary, %i (%s), unchanged", (intervalInSeconds, boundary) => {
			expect(Cache.nextIntervalInSeconds(intervalInSeconds, boundary)).toBe(boundary);
		});
	});

	describe("Cache.info()", () => {

		it.each(DECLARED_INFO_FIELDS)("has %s, declared as %s", (field, declaredType) => {
			const info = Cache.info();

			expect(info).toHaveProperty([field]);
			expect(declaredType.split(" | ")).toContain(typeName(info[field]));
		});

		it("has s3Bucket.bucket, declared as string | null, and s3Bucket.path, declared as string", () => {
			const { s3Bucket } = Cache.info();

			expect(["string", "null"]).toContain(typeName(s3Bucket.bucket));
			expect(typeName(s3Bucket.path)).toBe("string");
		});

		it("has inMemoryCache only as an object, since it's declared optional", () => {
			expect(["undefined", "object"]).toContain(typeName(Cache.info().inMemoryCache));
		});
	});
});

/* ****************************************************************************
 *	fixed behavior
 */

/**
 * The connection for a Cache instance with no stored data. The constructor only hashes
 * it, and nothing in this file calls read() or update() on the instance, so the
 * instance's getExpires() stays 0.
 */
const NO_DATA_CONNECTION = Object.freeze({
	host: "api.example.com",
	path: "/time-utils/no-stored-data",
	parameters: {},
	headers: {},
	options: {}
});

/** The cache profile for a Cache instance with no stored data. The constructor only reads it. */
const NO_DATA_CACHE_PROFILE = Object.freeze({
	hostId: "api.example.com",
	pathId: "/time-utils/no-stored-data",
	defaultExpirationInSeconds: 300,
	expirationIsOnInterval: false,
	overrideOriginHeaderExpiration: false,
	headersToRetain: [],
	encrypt: false
});

/**
 * A mocked Date.now() for formatting the current time: 2026-01-15T18:00:00.750Z. The 750
 * milliseconds tell formatting the current time as is, "18:00:00", apart from rounding
 * it up to a whole second first, "18:00:01".
 */
const MOCKED_NOW_MS = Date.parse("2026-01-15T18:00:00.750Z");

/** 2026-01-15T18:00:00Z, noon in Chicago during CST, when the offset is -360. */
const CHICAGO_CST_INSTANT_MS = Date.parse("2026-01-15T18:00:00Z");

/** 2026-07-01T12:00:00Z, 7:00 AM in Chicago during CDT, when the offset is -300. */
const CHICAGO_CDT_INSTANT_MS = Date.parse("2026-07-01T12:00:00Z");

/**
 * What Requirement 8.8 says Cache.info().tzDataVersion reports: the runtime's
 * process.versions.tz, or null when the runtime doesn't report one.
 */
const RUNTIME_TZ_DATA_VERSION = (typeof process.versions.tz === "string" && process.versions.tz !== "")
	? process.versions.tz
	: null;

/**
 * Build a Cache instance with no stored data.
 *
 * @returns {Cache} A new instance that nothing has called read() or update() on
 */
function newCacheWithNoStoredData() {
	return new Cache(NO_DATA_CONNECTION, NO_DATA_CACHE_PROFILE);
}

// Validates: Requirements 5.4, 7.4, 7.5, 7.6, 7.8, 8.8, 11.8
describe("fixed behavior", () => {

	// Validates: Requirements 7.8, 11.8
	describe("a Cache instance with no stored data", () => {

		it("reports isExpired() as true without throwing", () => {
			const cache = newCacheWithNoStoredData();

			expect(cache.getExpires()).toBe(0);
			expect(() => cache.isExpired()).not.toThrow();
			expect(cache.isExpired()).toBe(true);
		});

		it("reports needsRefresh() as true without throwing", () => {
			const cache = newCacheWithNoStoredData();

			expect(cache.getExpires()).toBe(0);
			expect(() => cache.needsRefresh()).not.toThrow();
			expect(cache.needsRefresh()).toBe(true);
		});
	});

	// Validates: Requirement 7.4
	describe("Cache.generateInternetFormattedDate()", () => {

		it("formats the current time when the timestamp in seconds is 0", () => {
			jest.spyOn(Date, "now").mockReturnValue(MOCKED_NOW_MS);

			// "Thu, 15 Jan 2026 18:00:00 GMT"
			expect(Cache.generateInternetFormattedDate(0)).toBe(new Date(MOCKED_NOW_MS).toUTCString());
		});
	});

	// Validates: Requirements 7.5, 7.6
	describe("Cache.parseToSeconds()", () => {

		it("returns 0 for a string Date.parse() can't parse", () => {
			expect(Cache.parseToSeconds("not a date")).toBe(0);
		});

		it("parses the Unix epoch to 0 without logging an error", () => {
			const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});

			// The epoch is the one date Date.parse() turns into 0, which a converter that
			// reads 0 as "now" would mishandle
			const seconds = Cache.parseToSeconds("Thu, 01 Jan 1970 00:00:00 GMT");

			expect(seconds).toBe(0);
			expect(errorSpy).not.toHaveBeenCalled();
		});
	});

	describe("Cache.info()", () => {

		// Validates: Requirement 8.8
		it("reports tzDataVersion from the runtime's process.versions.tz", () => {
			expect(Cache.info()).toHaveProperty("tzDataVersion", RUNTIME_TZ_DATA_VERSION);
		});

		// Validates: Requirement 5.4
		it("reports offsetInMinutes at the time info() is called: -360 in January and -300 in July", () => {
			const nowSpy = jest.spyOn(Date, "now");

			nowSpy.mockReturnValue(CHICAGO_CST_INSTANT_MS);
			const januaryOffset = Cache.info().offsetInMinutes;
			nowSpy.mockReturnValue(CHICAGO_CDT_INSTANT_MS);
			const julyOffset = Cache.info().offsetInMinutes;

			expect([januaryOffset, julyOffset]).toEqual([-360, -300]);
		});
	});
});

/* ****************************************************************************
 *	delegation
 */

/**
 * The intervals for the Cache.nextIntervalInSeconds() comparison: the 20 that
 * Cache.testInterval() reports, then six it doesn't. 1 second; 7 and 45 seconds, which
 * don't divide a minute; 90 minutes, which isn't a whole number of hours; a week, which
 * falls on Thursdays; and 30 days, the longest interval the property tests draw.
 */
const DELEGATION_INTERVALS = Object.freeze([...INTERVAL_TABLE, 1, 7, 45, 5400, 604800, 2592000]);

/**
 * Instants for the explicit-timestamp comparisons, as ISO 8601 strings, each with its
 * America/Chicago local time. The first two are 1700000000 and 1577836800. The next four
 * sit at the 2026 transitions, where the offset at the timestamp changes: DST starts at
 * 2026-03-08T08:00:00Z and ends at 2026-11-01T07:00:00Z. The last is a fractional
 * timestamp, 1700000000.5, as Date.now() / 1000 gives.
 */
const DELEGATION_INSTANTS = Object.freeze([
	["2023-11-14T22:13:20Z", "4:13 PM CST"],
	["2020-01-01T00:00:00Z", "6:00 PM CST on 2019-12-31, on a boundary for many of the intervals"],
	["2026-03-08T07:59:59Z", "1:59:59 AM CST, one second before DST starts"],
	["2026-03-08T08:00:00Z", "3:00 AM CDT, the instant DST starts"],
	["2026-11-01T06:30:00Z", "1:30 AM CDT, half an hour before DST ends"],
	["2026-11-01T07:00:00Z", "1:00 AM CST, the instant DST ends"],
	["2023-11-14T22:13:20.500Z", "4:13 PM CST, half a second in"]
]);

/**
 * Date.now() values to mock for a timestamp of 0 and an omitted one. Each has a
 * milliseconds part, so the round up to a whole second is in play. In the last, the round
 * up crosses a transition: half a second before DST starts, the current time reads as
 * 2026-03-08T08:00:00Z, the first second of CDT.
 */
const DELEGATION_NOWS = Object.freeze([
	["2026-01-15T18:00:00.750Z", "noon CST"],
	["2026-07-01T12:00:00.250Z", "7:00 AM CDT"],
	["2026-03-08T07:59:59.500Z", "half a second before DST starts"]
]);

/**
 * Argument lists for the Cache.generateInternetFormattedDate() comparison that don't read
 * the clock. In milliseconds, 0 is the Unix epoch rather than the current time.
 */
const FORMAT_ARGUMENTS = Object.freeze([
	["a timestamp in seconds", [1700000000]],
	["a timestamp in milliseconds, with inMilliseconds true", [1700000000123, true]],
	["0 in milliseconds, the Unix epoch", [0, true]]
]);

/** Dates for the Cache.parseToSeconds() comparison, from parsable to unparsable. */
const PARSE_ARGUMENTS = Object.freeze([
	["an HTTP date", "Wed, 28 Jul 2021 12:24:11 GMT"],
	["an ISO 8601 date", "2021-07-28T12:24:11Z"],
	["an ISO 8601 date with milliseconds, which round up", "2021-07-28T12:24:11.001Z"],
	["the Unix epoch", "Thu, 01 Jan 1970 00:00:00 GMT"],
	["an unparsable string", "not a date"],
	["an empty string", ""],
	["undefined", undefined]
]);

/**
 * Get the next boundary for every interval in DELEGATION_INTERVALS from one class's
 * nextIntervalInSeconds(), labelled by interval so that a failed comparison names the
 * interval it failed for.
 *
 * @param {Function} timeClass - Cache or TimeUtils
 * @param {Array<number>} timestampArgs - The arguments after the interval: [timestampInSeconds], [0], or [] to omit the timestamp
 * @returns {Array<{intervalInSeconds: number, boundary: number}>} One entry per interval, in DELEGATION_INTERVALS order
 */
function nextBoundaries(timeClass, timestampArgs) {
	return DELEGATION_INTERVALS.map((intervalInSeconds) => ({
		intervalInSeconds,
		boundary: timeClass.nextIntervalInSeconds(intervalInSeconds, ...timestampArgs)
	}));
}

// Each test calls a Cache helper and the TimeUtils method it delegates to with the same
// arguments, and compares the results with toBe() or toEqual(), which use Object.is: NaN
// matches NaN, and -0 doesn't match 0. Arguments that read the clock run only under a
// mocked Date.now(), so both calls see the same instant.
// Validates: Requirement 8.6
describe("delegation", () => {

	it("shares the TimeUtils instance dao-cache.js uses, which Cache.init() set to America/Chicago", () => {
		// An uninitialized copy would report Etc/UTC, and every comparison below would
		// then be against the wrong timezone
		expect(TimeUtils.getTimeZone()).toBe("America/Chicago");
	});

	describe("Cache.nextIntervalInSeconds()", () => {

		it.each(DELEGATION_INSTANTS)("returns what TimeUtils returns for every interval from %s, %s", (isoInstant) => {
			const timestampInSeconds = Date.parse(isoInstant) / 1000;

			expect(nextBoundaries(Cache, [timestampInSeconds])).toEqual(nextBoundaries(TimeUtils, [timestampInSeconds]));
		});

		it.each(DELEGATION_NOWS)("returns what TimeUtils returns for every interval, for a timestamp of 0 and an omitted one, with Date.now() mocked to %s, %s", (nowIso) => {
			const nowSpy = jest.spyOn(Date, "now").mockReturnValue(Date.parse(nowIso));

			expect(nextBoundaries(Cache, [0])).toEqual(nextBoundaries(TimeUtils, [0]));
			expect(nextBoundaries(Cache, [])).toEqual(nextBoundaries(TimeUtils, []));
			// Both read the mocked clock rather than the real one
			expect(nowSpy).toHaveBeenCalled();
		});
	});

	describe("Cache.generateInternetFormattedDate()", () => {

		it.each(FORMAT_ARGUMENTS)("returns what TimeUtils returns for %s, with the arguments %j", (_label, args) => {
			expect(Cache.generateInternetFormattedDate(...args)).toBe(TimeUtils.generateInternetFormattedDate(...args));
		});

		it.each(DELEGATION_NOWS)("returns what TimeUtils returns for 0 in seconds and an omitted timestamp, with Date.now() mocked to %s, %s", (nowIso) => {
			const nowSpy = jest.spyOn(Date, "now").mockReturnValue(Date.parse(nowIso));

			expect(Cache.generateInternetFormattedDate(0)).toBe(TimeUtils.generateInternetFormattedDate(0));
			expect(Cache.generateInternetFormattedDate()).toBe(TimeUtils.generateInternetFormattedDate());
			// Both read the mocked clock rather than the real one
			expect(nowSpy).toHaveBeenCalled();
		});
	});

	describe("Cache.parseToSeconds()", () => {

		it.each(PARSE_ARGUMENTS)("returns what TimeUtils returns for %s, %j", (_label, date) => {
			expect(Cache.parseToSeconds(date)).toBe(TimeUtils.parseToSeconds(date));
		});
	});
});
