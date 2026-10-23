/**
 * Golden fixture replay for TimeUtils.
 *
 * The fixture, test/cache/time-utils/fixtures/interval-fixture.json, records what the
 * pre-change code computed for 10 zones, at about 200 timestamps per zone from 2020
 * through 2025. For each timestamp t it holds the offset in minutes, and, for each of the
 * 20 intervals in Cache.testInterval(), the next boundary B minus t, in seconds. The
 * timestamps include ordinary instants, instants exactly on boundaries, and the instants
 * one second before, at, and one second after each transition in the range.
 *
 * .kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs wrote
 * it by calling the pre-change CacheData.nextIntervalInSeconds, with
 * CacheData.getOffsetInMinutes stubbed to return moment-timezone's offset at each row's
 * timestamp. So the arithmetic is the pre-change code's, and only the instant at which
 * the offset is sampled follows Q1. The generator's header explains how to regenerate the
 * fixture from a pre-change checkout.
 *
 * Each zone is replayed through the explicit-timezone seam,
 * TimeUtils.getOffsetInMinutes(t, zone) and TimeUtils.nextIntervalInSeconds(I, t, zone)
 * (Requirement 4.5). This file never calls TimeUtils.init(), so it neither reads nor sets
 * the active timezone. The whole arrays are compared with toEqual, which compares numbers
 * with Object.is, so -0 and 0 differ: the generator normalized -0 to 0, and TimeUtils
 * returns 0 for a zero offset. Each test first asserts that there's no first difference,
 * so a failure names the timestamp, and for a delta the interval, rather than leaving
 * them to be found in a diff of the whole array.
 *
 * A mismatch means TimeUtils doesn't reproduce today's result for an input where both
 * use the same offset, which Requirement 6.6 rules out: upgrading would move
 * expirations. Fix TimeUtils, not the fixture, which can only be regenerated from the
 * pre-change code.
 *
 * The zones and date range were chosen so that the tzdata in Node.js 22, 24, and 26
 * agrees with the generator's (Requirement 10.7), so this file passes on all three. A
 * failure on one runtime only points at that runtime's tzdata: compare
 * process.versions.tz with the fixture's tzdataVersion.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Golden fixture")
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INTERVAL_TABLE } from "../../../helpers/time-utils-oracles.mjs";

const TimeUtils = (await import("../../../../src/lib/utils/TimeUtils.class.js")).default;

/* ****************************************************************************
 *	Fixture
 */

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "interval-fixture.json");

/** The parsed fixture: { generator, source, momentTimezoneVersion, tzdataVersion, intervals, zones }. */
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

/** The fixture's zones, in file order. Each one is replayed. */
const ZONE_NAMES = Object.freeze(Object.keys(FIXTURE.zones));

/** The zones Requirement 10.4 requires the fixture to cover. */
const REQUIRED_ZONES = Object.freeze([
	"Etc/UTC", "America/Chicago", "America/New_York", "Europe/London", "Asia/Kolkata",
	"Asia/Kathmandu", "America/St_Johns", "Australia/Lord_Howe", "Pacific/Chatham", "Pacific/Kiritimati"
]);

/**
 * Find the first value where a replay differs from the fixture, and say where it is.
 * Values are compared with Object.is, as toEqual compares numbers, so -0 and 0 differ.
 *
 * Entries are offsets, or rows of deltas with one value per interval. A difference in a
 * row is reported with its interval, as single values rather than whole rows, because
 * Jest prints only the first 10 elements of an array in a received value.
 *
 * @param {Array<number>} timestamps - The zone's recorded timestamps, in seconds, one per entry
 * @param {Array<number>|Array<Array<number>>} actual - The replayed entries
 * @param {Array<number>|Array<Array<number>>} expected - The recorded entries
 * @returns {{index: number, timestamp: number, utc: string|null, intervalInSeconds?: number, expected: number, actual: number}|null} The first difference, or null when there's none
 * @example
 * firstMismatch([1577836800], [-300], [-360]);
 * // { index: 0, timestamp: 1577836800, utc: "2020-01-01T00:00:00.000Z", expected: -360, actual: -300 }
 */
function firstMismatch(timestamps, actual, expected) {
	const toRow = (entry) => (Array.isArray(entry) ? entry : [entry]);
	const entryCount = Math.max(actual.length, expected.length);
	for (let index = 0; index < entryCount; index++) {
		const actualRow = toRow(actual[index]);
		const expectedRow = toRow(expected[index]);
		const valueCount = Math.max(actualRow.length, expectedRow.length);
		for (let column = 0; column < valueCount; column++) {
			if (!Object.is(actualRow[column], expectedRow[column])) {
				const timestamp = timestamps[index];
				return {
					index,
					timestamp,
					// null when the arrays' lengths differ and there's no timestamp at index
					utc: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null,
					...(Array.isArray(expected[index]) ? { intervalInSeconds: FIXTURE.intervals[column] } : {}),
					expected: expectedRow[column],
					actual: actualRow[column]
				};
			}
		}
	}
	return null;
}

/* ****************************************************************************
 *	Tests
 */

// Validates: Requirements 6.6, 10.6, 10.7
describe("TimeUtils golden fixture replay", () => {

	describe("the fixture", () => {

		it("covers the ten zones Requirement 10.4 lists", () => {
			expect([...ZONE_NAMES].sort()).toEqual([...REQUIRED_ZONES].sort());
		});

		it("records the 20 intervals of INTERVAL_TABLE, in order", () => {
			expect(FIXTURE.intervals).toEqual([...INTERVAL_TABLE]);
		});

		it.each(ZONE_NAMES)("records one offset and one delta per interval for each timestamp in %s", (zone) => {
			const { timestamps, offsets, boundaryDeltas } = FIXTURE.zones[zone];

			// A zone with no timestamps would replay vacuously
			expect(timestamps.length).toBeGreaterThan(0);
			expect(offsets).toHaveLength(timestamps.length);
			expect(boundaryDeltas).toHaveLength(timestamps.length);
			// The index of every row that doesn't hold one delta per interval
			expect(boundaryDeltas.flatMap((row, index) => ((row.length === FIXTURE.intervals.length) ? [] : [index]))).toEqual([]);
		});
	});

	describe.each(ZONE_NAMES)("replay in %s", (zone) => {
		const { timestamps, offsets, boundaryDeltas } = FIXTURE.zones[zone];

		it("reproduces every recorded offset", () => {
			const replayed = timestamps.map((timestamp) => TimeUtils.getOffsetInMinutes(timestamp, zone));

			expect(firstMismatch(timestamps, replayed, offsets)).toBeNull();
			expect(replayed).toEqual(offsets);
		});

		it("reproduces every recorded boundary delta", () => {
			const replayed = timestamps.map((timestamp) => FIXTURE.intervals.map(
				(intervalInSeconds) => TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestamp, zone) - timestamp
			));

			expect(firstMismatch(timestamps, replayed, boundaryDeltas)).toBeNull();
			expect(replayed).toEqual(boundaryDeltas);
		});
	});
});
