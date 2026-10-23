"use strict";

const DebugAndLog = require("../tools/DebugAndLog.class.js");

/** Timezone used before init() succeeds, and when neither the option nor the environment variable is provided */
const DEFAULT_TIMEZONE = "Etc/UTC";

/** Environment variable init() falls back to when the timezone option isn't provided */
const TIMEZONE_ENV_VAR = "CACHE_DATA_TIME_ZONE_FOR_INTERVAL";

/** Closes every invalid-timezone error message */
const TIMEZONE_HINT = 'Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/**
 * Intl.DateTimeFormat options for reading the wall-clock time of an instant. hourCycle
 * "h23" keeps midnight at hour 0 rather than 24, and numberingSystem "latn" pins ASCII
 * digits whatever the runtime's defaults are.
 */
const FORMAT_OPTIONS = {
	hourCycle: "h23", numberingSystem: "latn",
	year: "numeric", month: "numeric", day: "numeric",
	hour: "numeric", minute: "numeric", second: "numeric"
};

/**
 * TimeUtils - Internal time utilities for interval-based cache expiration
 *
 * Owns timestamp conversion, HTTP date formatting and parsing, UTC offset lookup, and
 * interval-boundary arithmetic for the cache module. Offsets come from the built-in
 * Intl.DateTimeFormat, so they follow the IANA time zone data (tzdata) in the Node.js
 * runtime's ICU data. getTzDataVersion() reports its version.
 *
 * Offset sign: offsets are in minutes, local time minus UTC, so they're positive east of
 * UTC and negative west. America/Chicago is -300 during CDT and -360 during CST,
 * Asia/Kathmandu is 345, and Etc/UTC is 0.
 *
 * Current time: a timestamp of 0, or an omitted timestamp, means the current time
 * (Date.now()) in every method that takes one. The one exception is
 * generateInternetFormattedDate() with inMilliseconds set, which formats 0 as the epoch.
 *
 * Interval boundaries: nextIntervalInSeconds() rounds a timestamp up to the next multiple
 * of the interval in local time. A timestamp already on a boundary returns itself.
 *
 * DST: the offset is looked up for the timestamp being rounded, on every call. It's never
 * sampled once at init, so boundaries follow clock changes however long the process stays
 * up. A boundary that straddles a transition is still computed with the offset in effect
 * at the input timestamp, so it's off by the DST delta.
 *
 * Lifecycle: Cache.init() calls init() once, at cold start. init() resolves the active
 * timezone from the timezone option, then CACHE_DATA_TIME_ZONE_FOR_INTERVAL, then
 * "Etc/UTC". The first successful call fixes it for the life of the module instance.
 * Later calls log a warning and change nothing, and there's no reset. Until init()
 * succeeds, the active timezone is "Etc/UTC" and the offset is 0. The converters, the
 * formatter, and the parser never need init() and never depend on the active timezone.
 *
 * Testing seam: resolveTimezone(), and the optional timezone argument of
 * getOffsetInMinutes() and nextIntervalInSeconds(), cover any timezone without reading or
 * changing the active one, so tests can check many zones in one process. Cache never
 * passes a timezone argument.
 *
 * This class is internal to @63klabs/cache-data and is NOT part of the public API. It
 * isn't exported from src/index.js or src/lib/tools/index.js, and it isn't declared in
 * types/. The public Cache time helpers, such as Cache.nextIntervalInSeconds(),
 * Cache.parseToSeconds(), and Cache.generateInternetFormattedDate(), delegate to it.
 *
 * @private
 *
 * @example
 * // Internal use only. Cache.init() makes this call with parameters.timeZoneForInterval.
 * const TimeUtils = require("../utils/TimeUtils.class.js");
 * TimeUtils.init({ timezone: "America/Chicago" });
 *
 * // The next local midnight after 2026-01-15T18:00:00Z, which is noon CST
 * const boundary = TimeUtils.nextIntervalInSeconds(86400, 1768500000);
 * console.log(new Date(boundary * 1000).toISOString()); // "2026-01-16T06:00:00.000Z"
 */
class TimeUtils {

	/**
	 * Whether init() has succeeded. Once true it stays true; there's no reset.
	 *
	 * @private
	 * @type {boolean}
	 */
	static #initialized = false;

	/**
	 * The active timezone, trimmed and as given rather than in Intl's canonical form.
	 * "Etc/UTC" until init() succeeds.
	 *
	 * @private
	 * @type {string}
	 */
	static #timezone = DEFAULT_TIMEZONE;

	/**
	 * Formatter for the active timezone. null until init() succeeds, which means an offset
	 * of 0 (Etc/UTC).
	 *
	 * @private
	 * @type {Intl.DateTimeFormat|null}
	 */
	static #activeFormatter = null;

	/**
	 * Formatters keyed by timezone name as given, one for every name that passed
	 * validation, from any caller. Building a formatter costs about 15 times as much as a
	 * lookup with one, so each name's formatter is built once and reused.
	 *
	 * @private
	 * @type {Map<string, Intl.DateTimeFormat>}
	 */
	static #formatters = new Map();

	/* =========================================================================
	 * Lifecycle and timezone resolution
	 * ---------------------------------------------------------------------- */

	/**
	 * Initialize TimeUtils with the timezone used for offsets and interval boundaries.
	 * Cache.init() calls it once at cold start with
	 * `{ timezone: parameters.timeZoneForInterval }`.
	 *
	 * The active timezone is the first provided value among options.timezone, the
	 * CACHE_DATA_TIME_ZONE_FOR_INTERVAL environment variable, and "Etc/UTC". undefined,
	 * null, "", and strings of only whitespace aren't provided, so they fall through to
	 * the next level. See resolveTimezone() for how the value is trimmed and validated.
	 *
	 * The first successful call fixes the active timezone for the life of the module
	 * instance. A later call logs a warning with DebugAndLog.warn and returns without
	 * reading options or the environment variable. A call that throws assigns nothing and
	 * leaves TimeUtils uninitialized, so a corrected call can still succeed.
	 *
	 * @param {Object|null} [options={}] - Initialization options. undefined and null behave like {}
	 * @param {string|null} [options.timezone] - IANA time zone name such as "America/Chicago", or a fixed offset such as "+05:30". Surrounding whitespace is trimmed
	 * @returns {void}
	 * @throws {Error} When options.timezone is provided and isn't a string: `Invalid timezone of type <type>. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`
	 * @throws {Error} When Intl.DateTimeFormat rejects the resolved name: `Invalid timezone "<name>". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".` The message reads `Invalid timezone "<name>" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. ...` when the environment variable supplied the name. cause is the RangeError Intl threw
	 * @example
	 * TimeUtils.init({ timezone: "America/Chicago" });
	 * TimeUtils.getTimeZone(); // "America/Chicago"
	 *
	 * // A second call logs a warning and changes nothing
	 * TimeUtils.init({ timezone: "Europe/London" });
	 * TimeUtils.getTimeZone(); // "America/Chicago"
	 *
	 * @example
	 * // An invalid name throws, and TimeUtils stays uninitialized, so a corrected call works
	 * try {
	 *   TimeUtils.init({ timezone: "America/Chicgo" });
	 * } catch (error) {
	 *   console.log(error.message); // 'Invalid timezone "America/Chicgo". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".'
	 *   console.log(error.cause instanceof RangeError); // true
	 * }
	 * TimeUtils.init({ timezone: "America/Chicago" });
	 */
	static init(options = {}) {
		if (TimeUtils.#initialized) {
			DebugAndLog.warn("TimeUtils already initialized. Ignoring call to TimeUtils.init()");
			return;
		}
		const option = (options === undefined || options === null) ? undefined : options.timezone;
		const name = TimeUtils.resolveTimezone(option, process.env[TIMEZONE_ENV_VAR]); // may throw
		TimeUtils.#activeFormatter = TimeUtils.#formatters.get(name);
		TimeUtils.#timezone = name;
		TimeUtils.#initialized = true;
	}

	/**
	 * Resolve and validate a timezone name without reading or changing the active
	 * timezone. init() resolves through this method, and it's the testing seam for the
	 * resolution rules.
	 *
	 * The result is the first provided value among option, envValue, and "Etc/UTC".
	 * undefined, null, "", and strings of only whitespace aren't provided. envValue is
	 * used only when option isn't provided, so an invalid envValue can't fail a valid
	 * option. The value is trimmed, then validated by building an Intl.DateTimeFormat with
	 * it, so every name Intl accepts is valid, including fixed offsets such as "+05:30".
	 * TimeUtils keeps no list of names of its own. A valid name's formatter is cached for
	 * later offset lookups.
	 *
	 * The name is returned as given, not in Intl's canonical form: "Etc/UTC" stays
	 * "Etc/UTC" rather than becoming "UTC".
	 *
	 * @param {*} option - The timezone option, such as options.timezone from init()
	 * @param {*} envValue - The CACHE_DATA_TIME_ZONE_FOR_INTERVAL value, normally a string or undefined. Used only when option isn't provided
	 * @returns {string} The trimmed timezone name
	 * @throws {Error} When option is provided and isn't a string: `Invalid timezone of type <type>. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".`
	 * @throws {Error} When Intl.DateTimeFormat rejects the trimmed name: `Invalid timezone "<name>". Expected ...` for option, or `Invalid timezone "<name>" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Expected ...` for envValue. The name is quoted with JSON.stringify, and cause is the RangeError Intl threw
	 * @example
	 * TimeUtils.resolveTimezone("  America/Chicago ", "Europe/London"); // "America/Chicago"
	 * TimeUtils.resolveTimezone("", "Asia/Kolkata"); // "Asia/Kolkata"
	 * TimeUtils.resolveTimezone(null, undefined); // "Etc/UTC"
	 *
	 * @example
	 * try {
	 *   TimeUtils.resolveTimezone(undefined, "Invalid/Zone");
	 * } catch (error) {
	 *   console.log(error.message); // 'Invalid timezone "Invalid/Zone" from CACHE_DATA_TIME_ZONE_FOR_INTERVAL. Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".'
	 * }
	 */
	static resolveTimezone(option, envValue) {
		if (TimeUtils.#isProvided(option)) {
			if (typeof option !== "string") {
				throw new Error(`Invalid timezone of type ${typeof option}. ${TIMEZONE_HINT}`);
			}
			return TimeUtils.#validate(option.trim(), "");
		}
		if (TimeUtils.#isProvided(envValue)) {
			return TimeUtils.#validate(String(envValue).trim(), ` from ${TIMEZONE_ENV_VAR}`);
		}
		return TimeUtils.#validate(DEFAULT_TIMEZONE, "");
	}

	/**
	 * Whether a timezone value counts as provided. undefined, null, "", and strings of
	 * only whitespace don't, so resolution falls through to the next level.
	 *
	 * @private
	 * @param {*} value - An option or environment variable value
	 * @returns {boolean} true when value is provided
	 */
	static #isProvided(value) {
		return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
	}

	/**
	 * Validate a trimmed timezone name by building its Intl.DateTimeFormat, and cache the
	 * formatter under the name as given. Intl decides what's valid.
	 *
	 * @private
	 * @param {string} name - Trimmed timezone name
	 * @param {string} sourceSuffix - Text that follows the quoted name in the error message: "" for the option, " from CACHE_DATA_TIME_ZONE_FOR_INTERVAL" for the environment variable
	 * @returns {string} name, unchanged
	 * @throws {Error} When Intl.DateTimeFormat rejects name. cause is the RangeError Intl threw
	 */
	static #validate(name, sourceSuffix) {
		if (!TimeUtils.#formatters.has(name)) {
			try {
				TimeUtils.#formatters.set(name, new Intl.DateTimeFormat("en-US", { ...FORMAT_OPTIONS, timeZone: name }));
			} catch (error) {
				// >! JSON.stringify quotes the name and escapes control characters before it reaches a log
				throw new Error(`Invalid timezone ${JSON.stringify(name)}${sourceSuffix}. ${TIMEZONE_HINT}`, { cause: error });
			}
		}
		return name;
	}

	/**
	 * Get the active timezone: the name the first successful init() resolved, trimmed and
	 * as given rather than in Intl's canonical form. Before init() succeeds, it's
	 * "Etc/UTC".
	 *
	 * @returns {string} The active timezone name
	 * @example
	 * TimeUtils.getTimeZone(); // "Etc/UTC" before init()
	 *
	 * @example
	 * TimeUtils.init({ timezone: " America/Chicago " });
	 * TimeUtils.getTimeZone(); // "America/Chicago"
	 */
	static getTimeZone() {
		return TimeUtils.#timezone;
	}

	/**
	 * Get the version of the IANA time zone database in the Node.js runtime's ICU data,
	 * which every offset TimeUtils computes follows. Reads process.versions.tz.
	 *
	 * @returns {string|null} The tzdata version, such as "2026a", or null when the runtime doesn't report one
	 * @example
	 * TimeUtils.getTzDataVersion(); // "2026a" on Node.js 24.15.0
	 */
	static getTzDataVersion() {
		const version = process.versions?.tz;
		return (typeof version === "string" && version.length > 0) ? version : null;
	}

	/* =========================================================================
	 * Offsets and interval boundaries
	 * ---------------------------------------------------------------------- */

	/**
	 * Get the UTC offset of the active timezone at a timestamp, in minutes: local time
	 * minus UTC, positive east of UTC and negative west. America/Chicago is -300 during
	 * CDT and -360 during CST, Asia/Kathmandu is 345, and Etc/UTC is 0.
	 *
	 * The offset is derived from the wall-clock time Intl.DateTimeFormat reports for the
	 * instant, so it follows the runtime's tzdata (see getTzDataVersion()). It's computed on
	 * every call, never sampled at init, so it stays right across DST changes. It's
	 * usually a whole number. Local mean time offsets from before standard time, such as
	 * America/Chicago's before 1883, have a seconds part and give a fraction.
	 *
	 * A timestampInSeconds of 0, or an omitted one, means the current time. Before init()
	 * succeeds, and with no timezone given, the offset is 0 (Etc/UTC). A NaN or
	 * out-of-range timestamp gives NaN.
	 *
	 * @param {number} [timestampInSeconds=0] - Instant to look up, in seconds since the Unix epoch. 0 means now
	 * @param {string} [timezone] - Timezone to use instead of the active one, resolved by the same rules as init()'s timezone option. It doesn't read or change the active timezone. A testing seam: Cache never passes it
	 * @returns {number} Offset in minutes, local time minus UTC
	 * @throws {Error} When timezone is given and is a non-string or a name Intl rejects, with the messages resolveTimezone() throws for an option
	 * @example
	 * TimeUtils.getOffsetInMinutes(1784000000, "America/Chicago"); // -300 (July 2026, CDT)
	 * TimeUtils.getOffsetInMinutes(1768500000, "America/Chicago"); // -360 (January 2026, CST)
	 * TimeUtils.getOffsetInMinutes(1768500000, "Asia/Kathmandu"); // 345
	 *
	 * @example
	 * // After TimeUtils.init({ timezone: "Asia/Kolkata" }): the offset now
	 * TimeUtils.getOffsetInMinutes(); // 330
	 */
	static getOffsetInMinutes(timestampInSeconds = 0, timezone = undefined) {
		return TimeUtils.#offsetSecondsAt(timestampInSeconds, timezone) / 60;
	}

	/**
	 * Get the offset in seconds, local time minus UTC, of a timezone at an instant.
	 *
	 * The wall-clock time Intl.DateTimeFormat reports for the instant is read back as if
	 * it were UTC, and the instant, floored to the second, is subtracted. Working in whole
	 * seconds keeps nextIntervalInSeconds() exact for offsets that have a seconds part.
	 *
	 * @private
	 * @param {number} timestampInSeconds - Instant in seconds since the Unix epoch. 0 means now
	 * @param {string|undefined} timezone - Explicit timezone, or undefined for the active one
	 * @returns {number} Offset in seconds. 0 before init() when timezone is undefined, and NaN for a NaN or out-of-range instant
	 * @throws {Error} When timezone is given and resolveTimezone() rejects it
	 */
	static #offsetSecondsAt(timestampInSeconds, timezone) {
		const formatter = (timezone === undefined)
			? TimeUtils.#activeFormatter
			: TimeUtils.#formatters.get(TimeUtils.resolveTimezone(timezone, undefined));
		if (formatter === null) {
			return 0; // uninitialized: Etc/UTC (Req 4.3)
		}
		// Intl truncates a fractional time the same way, so the floor below agrees with the
		// second that formatToParts() reports, including for instants before the epoch
		const epochMs = Math.trunc((timestampInSeconds === 0) ? Date.now() : timestampInSeconds * 1000);
		if (!Number.isFinite(epochMs) || Math.abs(epochMs) > 8.64e15) {
			return NaN; // what today's arithmetic produces for these inputs
		}
		const parts = {};
		for (const { type, value } of formatter.formatToParts(epochMs)) {
			parts[type] = value;
		}
		// setUTCFullYear(), unlike Date.UTC(), doesn't map years 0 to 99 onto 1900 to 1999
		const wall = new Date(0);
		wall.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
		wall.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
		return (wall.getTime() - Math.floor(epochMs / 1000) * 1000) / 1000;
	}

	/**
	 * Get the next interval boundary at or after a timestamp, aligned to local time in the
	 * active timezone.
	 *
	 * The timestamp is shifted into a local frame by the offset in effect at that
	 * timestamp, rounded up to a multiple of the interval, and shifted back. For integer
	 * inputs, the result B satisfies t <= B < t + intervalInSeconds, and B plus the offset
	 * at t in seconds is a multiple of intervalInSeconds. A timestamp already on a
	 * boundary returns itself, so an entry expiring there is expired immediately.
	 *
	 * Alignment: intervals that divide 24 hours, such as 15 minutes, 4 hours, or 24 hours,
	 * fall on multiples of the interval counted from local midnight. Other intervals, such
	 * as 5 hours or multi-day intervals, count from the Unix epoch in the local frame, so a
	 * 5-hour boundary moves by an hour each day, and 168 hours falls on Thursdays. The
	 * offset applies to every interval length, so in a zone whose offset isn't a whole
	 * number of hours, hourly boundaries sit off the UTC hour: at :30 past it in
	 * Asia/Kolkata (UTC+5:30) and at :15 past it in Asia/Kathmandu (UTC+5:45), where
	 * half-hourly boundaries fall at :15 and :45.
	 *
	 * DST: the offset is the one in effect at the timestamp being rounded, looked up on
	 * every call rather than sampled at init, so boundaries follow clock changes. A
	 * boundary that straddles a transition is still computed with the offset at the input
	 * timestamp, so it's off by the DST delta. In America/Chicago, a 4-hour interval from
	 * 1:30 AM CDT on 2026-11-01 ends at 3:00 AM CST rather than 4:00 AM.
	 *
	 * A timestampInSeconds of 0, or an omitted one, means the current time. Before init()
	 * succeeds, and with no timezone given, the offset is 0 (Etc/UTC). An interval of 0,
	 * or a NaN or out-of-range timestamp, gives NaN.
	 *
	 * @param {number} intervalInSeconds - Interval length in seconds, such as 3600 for hourly or 86400 for daily
	 * @param {number} [timestampInSeconds=0] - Timestamp to round up, in seconds since the Unix epoch. 0 means now
	 * @param {string} [timezone] - Timezone to align to instead of the active one, resolved by the same rules as init()'s timezone option. It doesn't read or change the active timezone. A testing seam: Cache never passes it
	 * @returns {number} The boundary, in seconds since the Unix epoch
	 * @throws {Error} When timezone is given and is a non-string or a name Intl rejects, with the messages resolveTimezone() throws for an option
	 * @example
	 * // 2020-01-01T00:00:00Z is 6:00 PM CST on December 31. The next 4-hour local
	 * // boundary is 8:00 PM CST, 2 hours later
	 * TimeUtils.nextIntervalInSeconds(14400, 1577836800, "America/Chicago"); // 1577844000
	 *
	 * // Already on a boundary: an hourly interval from 6:00 PM CST returns the same instant
	 * TimeUtils.nextIntervalInSeconds(3600, 1577836800, "America/Chicago"); // 1577836800
	 *
	 * @example
	 * // After TimeUtils.init({ timezone: "America/Chicago" }): the next local midnight from now
	 * const expiresInSeconds = TimeUtils.nextIntervalInSeconds(86400);
	 */
	static nextIntervalInSeconds(intervalInSeconds, timestampInSeconds = 0, timezone = undefined) {
		if (timestampInSeconds === 0) {
			timestampInSeconds = TimeUtils.convertTimestampFromMilliToSeconds(Date.now());
		}
		const offset = TimeUtils.#offsetSecondsAt(timestampInSeconds, timezone); // sampled at t (Q1)
		const shifted = new Date((timestampInSeconds + offset) * 1000);
		const intervalMs = intervalInSeconds * 1000;
		const rounded = new Date(Math.ceil(shifted.getTime() / intervalMs) * intervalMs);
		return Math.ceil(rounded.getTime() / 1000) - offset;
	}

	/* =========================================================================
	 * Conversion, formatting, and parsing (independent of the active timezone)
	 * ---------------------------------------------------------------------- */

	/**
	 * Convert a Unix timestamp from milliseconds to seconds, rounding up. A
	 * timestampInMilliseconds of 0, or an omitted one, means the current time
	 * (Date.now()). Works without init().
	 *
	 * @param {number} [timestampInMilliseconds=0] - Timestamp in milliseconds since the Unix epoch. 0 means now
	 * @returns {number} Math.ceil(timestampInMilliseconds / 1000)
	 * @example
	 * TimeUtils.convertTimestampFromMilliToSeconds(1700000000001); // 1700000001
	 *
	 * @example
	 * // The current time in seconds, rounded up
	 * const nowInSeconds = TimeUtils.convertTimestampFromMilliToSeconds();
	 */
	static convertTimestampFromMilliToSeconds(timestampInMilliseconds = 0) {
		const ms = (timestampInMilliseconds === 0) ? Date.now() : timestampInMilliseconds;
		return Math.ceil(ms / 1000);
	}

	/**
	 * Convert a Unix timestamp from seconds to milliseconds. A timestampInSeconds of 0, or
	 * an omitted one, means the current time, returned as Date.now() itself. Works without
	 * init().
	 *
	 * @param {number} [timestampInSeconds=0] - Timestamp in seconds since the Unix epoch. 0 means now
	 * @returns {number} timestampInSeconds * 1000, or Date.now() when timestampInSeconds is 0
	 * @example
	 * TimeUtils.convertTimestampFromSecondsToMilli(1700000000); // 1700000000000
	 *
	 * @example
	 * // The current time in milliseconds
	 * const nowInMilliseconds = TimeUtils.convertTimestampFromSecondsToMilli();
	 */
	static convertTimestampFromSecondsToMilli(timestampInSeconds = 0) {
		return (timestampInSeconds === 0) ? Date.now() : timestampInSeconds * 1000;
	}

	/**
	 * Format a timestamp as an HTTP date in GMT, as used in the last-modified and expires
	 * headers. The result is new Date(ms).toUTCString(), where ms is timestamp when
	 * inMilliseconds is truthy, and convertTimestampFromSecondsToMilli(timestamp)
	 * otherwise. A seconds value of 0, or an omitted timestamp, therefore formats the
	 * current time. In milliseconds, 0 formats the Unix epoch. Works without init(), and
	 * doesn't depend on the active timezone.
	 *
	 * @param {number} [timestamp] - Timestamp in seconds, or in milliseconds when inMilliseconds is true. In seconds, 0 or an omitted value means now
	 * @param {boolean} [inMilliseconds=false] - true when timestamp is in milliseconds
	 * @returns {string} The date, such as "Tue, 14 Nov 2023 22:13:20 GMT", or "Invalid Date" for a timestamp outside the Date range
	 * @example
	 * TimeUtils.generateInternetFormattedDate(1700000000); // "Tue, 14 Nov 2023 22:13:20 GMT"
	 * TimeUtils.generateInternetFormattedDate(1700000000000, true); // "Tue, 14 Nov 2023 22:13:20 GMT"
	 *
	 * @example
	 * // The current time
	 * const lastModified = TimeUtils.generateInternetFormattedDate(0);
	 */
	static generateInternetFormattedDate(timestamp, inMilliseconds = false) {
		const ms = inMilliseconds ? timestamp : TimeUtils.convertTimestampFromSecondsToMilli(timestamp);
		return new Date(ms).toUTCString();
	}

	/**
	 * Parse a date string into a Unix timestamp in seconds with Date.parse(), rounding up.
	 * Accepts anything Date.parse() does, such as HTTP dates and ISO 8601 strings. The Unix
	 * epoch parses to 0, and unparsable input returns 0. If Date.parse() throws, as it does
	 * for a Symbol, the error is logged with DebugAndLog.error and 0 is returned.
	 *
	 * Works without init(), and never uses the active timezone. A string without a UTC
	 * offset follows Date.parse() rules, which can use the process's local time zone (the
	 * TZ environment variable).
	 *
	 * @param {string} date - Date string to parse, such as "Wed, 28 Jul 2021 12:24:11 GMT" or "2021-07-28T12:24:11Z"
	 * @returns {number} Seconds since 1970-01-01T00:00:00Z, or 0 when date can't be parsed
	 * @example
	 * TimeUtils.parseToSeconds("Wed, 28 Jul 2021 12:24:11 GMT"); // 1627475051
	 * TimeUtils.parseToSeconds("2021-07-28T12:24:11Z"); // 1627475051
	 *
	 * @example
	 * TimeUtils.parseToSeconds("Thu, 01 Jan 1970 00:00:00 GMT"); // 0
	 * TimeUtils.parseToSeconds("not a date"); // 0
	 */
	static parseToSeconds(date) {
		try {
			const ms = Date.parse(date);
			return Number.isFinite(ms) ? Math.ceil(ms / 1000) : 0;
		} catch (error) {
			DebugAndLog.error(`Cannot parse date/time: ${String(date)} ${error?.message || "Unknown error"}`, error?.stack);
			return 0;
		}
	}
}

module.exports = TimeUtils;
