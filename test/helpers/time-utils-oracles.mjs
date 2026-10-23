/**
 * Offset oracles and shared interval data for the TimeUtils tests.
 *
 * TimeUtils derives a UTC offset from the wall-clock time `Intl.DateTimeFormat`
 * reports for an instant: it reassembles the parts as a UTC time and subtracts the
 * instant. The oracles here derive the same offset by other methods, so a mistake
 * in that reconstruction shows up as a disagreement (Requirement 11.4):
 *
 * - `longOffsetMinutes()` parses the offset that ICU formats itself, with
 *   `timeZoneName: "longOffset"`, such as `GMT-05:00`. It runs on every runtime.
 * - `temporalOffsetMinutes()` asks native Temporal, a separate implementation,
 *   where `nativeTemporal()` finds it: Node.js 26 or later (Requirement 11.5).
 *
 * Every oracle reads the runtime's tz data, so they check TimeUtils' derivation,
 * not the data. The golden fixture pins the pre-change results.
 *
 * Temporal is only ever read through `globalThis`, so a runtime without it gets
 * `undefined` instead of a `ReferenceError`.
 *
 * Not a test file: the name ends in `.mjs` rather than `.jest.mjs`, so Jest's
 * `testMatch` of `**\/test\/**\/*.jest.mjs` doesn't collect it as a suite.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Oracles and shared data")
 *
 * @module test/helpers/time-utils-oracles
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * The 20 intervals `Cache.testInterval()` reports, in seconds: 15, 30, and 60
 * seconds; 5, 10, 15, 30, and 60 minutes; and 2, 3, 4, 5, 6, 8, 12, 24, 48, 72,
 * 96, and 120 hours.
 *
 * The order matches the `tests` keys that follow `start`, `sec_15` through
 * `hrs_120`, and the golden fixture's `intervals` array, so index i lines up
 * across all three.
 *
 * @type {ReadonlyArray<number>}
 * @example
 * import fc from "fast-check";
 * import { INTERVAL_TABLE } from "../../../helpers/time-utils-oracles.mjs";
 *
 * // The interval table plus anything up to 30 days
 * const interval = fc.oneof(fc.constantFrom(...INTERVAL_TABLE), fc.integer({ min: 1, max: 2592000 }));
 */
export const INTERVAL_TABLE = Object.freeze([
	15, 30, 60,
	5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, 60 * MINUTE,
	2 * HOUR, 3 * HOUR, 4 * HOUR, 5 * HOUR, 6 * HOUR, 8 * HOUR, 12 * HOUR,
	24 * HOUR, 48 * HOUR, 72 * HOUR, 96 * HOUR, 120 * HOUR
]);

/**
 * Matches the `timeZoneName: "longOffset"` output of an en-US formatter: `GMT`,
 * `GMT±HH:MM`, or `GMT±HH:MM:SS`. Seconds appear only for local mean time, such
 * as `GMT-05:50:36` for America/Chicago before 1883.
 *
 * @private
 * @type {RegExp}
 */
const LONG_OFFSET_PATTERN = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * One en-US `longOffset` formatter per time zone name, built on first use and reused.
 *
 * @private
 * @type {Map<string, Intl.DateTimeFormat>}
 */
const LONG_OFFSET_FORMATTERS = new Map();

/**
 * Get the offset of a time zone at an instant, in minutes, parsed from the
 * `longOffset` time zone name that `Intl.DateTimeFormat` formats for it.
 *
 * The sign convention is TimeUtils': local time minus UTC, positive east of UTC.
 * An offset with a seconds part, which only local mean time has, gives fractional
 * minutes: `GMT-05:50:36` is -350.6. A zero offset is `0`, never `-0`.
 *
 * @param {string} timeZone - A time zone name `Intl.DateTimeFormat` accepts, such as "America/Chicago"
 * @param {number} epochMs - The instant, in milliseconds since the Unix epoch
 * @returns {number} Local time minus UTC at `epochMs`, in minutes
 * @throws {TypeError} When `timeZone` isn't a string, because `Intl` would otherwise fall back to the host's time zone
 * @throws {RangeError} When `Intl` rejects `timeZone`, or `epochMs` is `NaN` or outside the `Date` range
 * @throws {Error} When the formatted name isn't `GMT`, `GMT±HH:MM`, or `GMT±HH:MM:SS`
 * @example
 * longOffsetMinutes("America/Chicago", Date.UTC(2026, 6, 1)); // -300 (CDT)
 * longOffsetMinutes("America/Chicago", Date.UTC(2026, 0, 15)); // -360 (CST)
 * longOffsetMinutes("Asia/Kathmandu", Date.UTC(2026, 0, 15)); // 345
 * longOffsetMinutes("Etc/UTC", 0); // 0
 *
 * @example
 * // Local mean time before standard time has a seconds part
 * longOffsetMinutes("America/Chicago", Date.UTC(1880, 0, 1)); // -350.6 (GMT-05:50:36)
 */
export function longOffsetMinutes(timeZone, epochMs) {
	if (typeof timeZone !== "string") {
		throw new TypeError(`timeZone must be a string, got ${typeof timeZone}`);
	}
	let formatter = LONG_OFFSET_FORMATTERS.get(timeZone);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
		LONG_OFFSET_FORMATTERS.set(timeZone, formatter);
	}
	const name = formatter.formatToParts(epochMs).find((part) => part.type === "timeZoneName")?.value;
	const match = LONG_OFFSET_PATTERN.exec(name ?? "");
	if (match === null) {
		throw new Error(`Unrecognized longOffset time zone name ${JSON.stringify(name)} for ${JSON.stringify(timeZone)}`);
	}
	const [, sign, hours, minutes, seconds] = match;
	// Whole seconds first, then one division, so the result is exactly offsetSeconds / 60
	const totalSeconds = (Number(hours ?? 0) * HOUR) + (Number(minutes ?? 0) * MINUTE) + Number(seconds ?? 0);
	if (totalSeconds === 0) {
		return 0;
	}
	return ((sign === "-") ? -totalSeconds : totalSeconds) / 60;
}

/**
 * The first Node.js major with native Temporal enabled by default. Node.js 22 and
 * 24 only have an older, pre-standard implementation behind `--harmony-temporal`.
 *
 * @private
 * @type {number}
 */
const MIN_TEMPORAL_NODE_MAJOR = 26;

/**
 * Get native Temporal when this runtime has it: Node.js 26 or later, with the
 * standard API, detected by `Temporal.ZonedDateTime.prototype.getTimeZoneTransition`.
 *
 * Both checks are needed. `--harmony-temporal` on Node.js 22 and 24 defines an
 * older, pre-standard Temporal without `getTimeZoneTransition()`, and a polyfill
 * could define one on any runtime. Only `globalThis.Temporal` is read, so a
 * runtime without it gets `null` instead of a `ReferenceError`.
 *
 * @returns {Object|null} The `Temporal` namespace object, or `null` when native Temporal isn't available
 * @example
 * import { describe } from "@jest/globals";
 * import { nativeTemporal } from "../../../helpers/time-utils-oracles.mjs";
 *
 * // Jest reports these tests as skipped, not passed, where native Temporal is missing
 * (nativeTemporal() ? describe : describe.skip)("Property 8: Temporal agrees", () => {
 *   // property tests that call temporalOffsetMinutes(nativeTemporal(), ...)
 * });
 */
export function nativeTemporal() {
	const major = Number.parseInt(String(process.versions?.node ?? ""), 10);
	if (!Number.isInteger(major) || major < MIN_TEMPORAL_NODE_MAJOR) {
		return null;
	}
	if (typeof globalThis.Temporal?.ZonedDateTime?.prototype?.getTimeZoneTransition !== "function") {
		return null;
	}
	return globalThis.Temporal;
}

/**
 * Get the offset of a time zone at an instant, in minutes, from native Temporal.
 *
 * Same sign convention and units as `longOffsetMinutes()`: local time minus UTC,
 * positive east of UTC. A zero offset is `0`, never `-0`.
 *
 * @param {Object} temporal - The `Temporal` namespace object that `nativeTemporal()` returned
 * @param {string} timeZone - A time zone name Temporal accepts, such as "America/Chicago"
 * @param {number} epochMs - The instant, an integer number of milliseconds since the Unix epoch
 * @returns {number} Local time minus UTC at `epochMs`, in minutes
 * @throws {TypeError} When `temporal` isn't a Temporal namespace, or `timeZone` isn't a string
 * @throws {RangeError} When Temporal rejects `timeZone`, or `epochMs` isn't an integer within the `Date` range
 * @example
 * const temporal = nativeTemporal();
 * if (temporal !== null) {
 *   temporalOffsetMinutes(temporal, "America/Chicago", Date.UTC(2026, 6, 1)); // -300 (CDT)
 *   temporalOffsetMinutes(temporal, "Asia/Kathmandu", Date.UTC(2026, 0, 15)); // 345
 * }
 */
export function temporalOffsetMinutes(temporal, timeZone, epochMs) {
	const { offsetNanoseconds } = temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timeZone);
	return (offsetNanoseconds === 0) ? 0 : offsetNanoseconds / 6e10;
}
