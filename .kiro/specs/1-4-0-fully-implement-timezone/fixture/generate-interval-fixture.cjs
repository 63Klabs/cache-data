"use strict";

/**
 * Golden fixture generator for interval-based expiration.
 *
 * Records what the pre-change interval arithmetic returns, so the TimeUtils
 * replacement can be checked against it once moment-timezone is gone. For each
 * zone and timestamp it records:
 *   - the zone's offset at the timestamp, in minutes, local time minus UTC:
 *     -1 * moment.tz.zone(zone).utcOffset(ms), with -0 normalized to 0
 *   - for each of the 20 intervals in Cache.testInterval(), the next interval
 *     boundary minus the timestamp, in seconds
 *
 * The boundaries come from the pre-change CacheData.nextIntervalInSeconds,
 * reached through TestHarness.getInternals(), not from a re-implementation.
 * CacheData.getOffsetInMinutes is stubbed for each row to return the offset at
 * that row's timestamp, so the arithmetic is today's and only the instant at
 * which the offset is sampled follows the new behavior (Q1). The original
 * method is restored once the rows are recorded.
 *
 * Run it BEFORE src/lib/dao-cache.js is refactored. The refactor removes both
 * CacheData methods, and moment-timezone is uninstalled once the fixture is
 * committed. After that, run it only against a pre-change copy, as described
 * under "Re-running after the refactor".
 *
 * Zones: Etc/UTC, America/Chicago, America/New_York, Europe/London,
 * Asia/Kolkata, Asia/Kathmandu, America/St_Johns, Australia/Lord_Howe,
 * Pacific/Chatham, and Pacific/Kiritimati.
 *
 * Timestamps per zone, 2020 through 2025, sorted with duplicates removed:
 *   - the 1st and 15th of each month in UTC, at a time of day derived from the
 *     month, so hours, minutes, and seconds vary (144)
 *   - local midnight on the first day of each quarter (24)
 *   - one second before, at, and one second after each zone.untils transition
 *
 * The output is deterministic. It has no generation timestamp, so re-running on
 * the same inputs writes a byte-identical file. Objects are indented with tabs,
 * each numeric array is on one line, and boundaryDeltas has one line per
 * timestamp.
 *
 * Usage, from the repository root:
 *   node .kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs [--dao-cache <path>] [--out <path>]
 *
 *   --dao-cache <path>  The dao-cache.js to load. Default: src/lib/dao-cache.js,
 *                       which is only valid before the refactor
 *   --out <path>        The file to write. Default:
 *                       test/cache/time-utils/fixtures/interval-fixture.json
 *
 * Paths given as options resolve against the current directory. The defaults
 * resolve against the repository root.
 *
 * Re-running after the refactor, from the repository root:
 *   1. Find a pre-change commit. The newest commit this lists removed the
 *      moment-timezone require, so its parent, <commit>^, is pre-change:
 *        git log -S "require('moment-timezone')" --format="%h %s" -- src/lib/dao-cache.js
 *   2. Extract that commit's src/ into a git-ignored directory inside the
 *      repository, so its require() calls resolve through this repository's
 *      node_modules:
 *        mkdir .fixture-src
 *        git archive <commit>^ src | tar -x -C .fixture-src
 *   3. Make moment-timezone available without recording it in package.json:
 *        npm install --no-save moment-timezone@0.6.5
 *   4. Generate from the pre-change copy:
 *        node .kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs --dao-cache .fixture-src/src/lib/dao-cache.js
 *   5. Clean up: rm -rf .fixture-src, then npm prune to remove moment-timezone.
 *
 * Everything runs in this process: no child processes and no shell. The file
 * isn't named *.jest.mjs, so Jest never runs it, and CI doesn't reference it.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (Requirement 10; design.md, "Golden fixture")
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DEFAULT_DAO_CACHE_PATH = path.join(REPO_ROOT, "src", "lib", "dao-cache.js");
const DEFAULT_OUT_PATH = path.join(REPO_ROOT, "test", "cache", "time-utils", "fixtures", "interval-fixture.json");

// Fixed strings rather than computed paths, so the output doesn't vary by platform
const GENERATOR = ".kiro/specs/1-4-0-fully-implement-timezone/fixture/generate-interval-fixture.cjs";
const SOURCE = "pre-change CacheData.nextIntervalInSeconds, offset sampled at each timestamp (Q1)";
const USAGE = `Usage: node ${GENERATOR} [--dao-cache <path>] [--out <path>]\n`;

const ZONES = [
	"Etc/UTC",
	"America/Chicago",
	"America/New_York",
	"Europe/London",
	"Asia/Kolkata",
	"Asia/Kathmandu",
	"America/St_Johns",
	"Australia/Lord_Howe",
	"Pacific/Chatham",
	"Pacific/Kiritimati"
];

// The 20 intervals of Cache.testInterval(), in seconds, in its order
const INTERVALS = [
	15, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800,
	14400, 18000, 21600, 28800, 43200, 86400, 172800, 259200, 345600, 432000
];

const FIRST_YEAR = 2020;
const LAST_YEAR = 2025;
const RANGE_START_MS = Date.UTC(FIRST_YEAR, 0, 1);
const RANGE_END_MS = Date.UTC(LAST_YEAR + 1, 0, 1); // exclusive
const QUARTER_START_MONTHS = [0, 3, 6, 9];
const SECONDS_PER_DAY = 86400;

/**
 * Parse the command-line options.
 *
 * @param {Array<string>} args - Arguments after the script path
 * @returns {{daoCachePath: string, outPath: string}} Absolute paths to load and write
 * @throws {TypeError} When an option is unknown, a value is missing, or a positional argument is given
 */
function parseOptions(args) {
	const { values } = parseArgs({
		args,
		options: {
			"dao-cache": { type: "string" },
			out: { type: "string" }
		},
		strict: true,
		allowPositionals: false
	});

	return {
		daoCachePath: (values["dao-cache"] === undefined) ? DEFAULT_DAO_CACHE_PATH : path.resolve(values["dao-cache"]),
		outPath: (values.out === undefined) ? DEFAULT_OUT_PATH : path.resolve(values.out)
	};
}

/**
 * Load moment-timezone, explaining how to restore it if it has been removed.
 *
 * @returns {Object} The moment-timezone module
 * @throws {Error} When moment-timezone isn't installed, with the install command in the message
 */
function loadMomentTimezone() {
	try {
		return require("moment-timezone");
	} catch (error) {
		if (error?.code === "MODULE_NOT_FOUND") {
			throw new Error("moment-timezone is not installed. Run `npm install --no-save moment-timezone@0.6.5` and try again. See this script's header comment.", { cause: error });
		}
		throw error;
	}
}

/**
 * Load the pre-change CacheData class through TestHarness.
 *
 * @param {string} daoCachePath - Absolute path of the dao-cache.js to load
 * @returns {Object} The CacheData class
 * @throws {Error} When the file has no CacheData.nextIntervalInSeconds and CacheData.getOffsetInMinutes, as after the refactor
 */
function loadCacheData(daoCachePath) {
	// >! require() executes the file it loads. Pass --dao-cache only a
	// >! dao-cache.js from this repository's history
	const daoCache = require(daoCachePath);
	const CacheData = daoCache?.TestHarness?.getInternals?.()?.CacheData;

	if (typeof CacheData?.nextIntervalInSeconds !== "function" || typeof CacheData?.getOffsetInMinutes !== "function") {
		throw new Error(`${daoCachePath} has no CacheData.nextIntervalInSeconds and CacheData.getOffsetInMinutes to call through TestHarness. Pass a pre-change dao-cache.js with --dao-cache. See this script's header comment.`);
	}

	return CacheData;
}

/**
 * Get a zone's offset at an instant, in the sign convention CacheData stores.
 *
 * @param {Object} zone - moment-timezone Zone
 * @param {number} timestampInSeconds - The instant, in seconds
 * @returns {number} Local time minus UTC, in minutes. Never -0
 */
function offsetMinutesAt(zone, timestampInSeconds) {
	// moment-timezone reports UTC minus local time; invert it as _setOffsetInMinutes does
	const offset = -1 * zone.utcOffset(timestampInSeconds * 1000);
	// -1 * 0 is -0 for zero-offset zones. Jest's toEqual tells -0 from 0, and TimeUtils returns 0
	return (offset === 0) ? 0 : offset;
}

/**
 * Build the ordinary instants: the 1st and 15th of each month in the range, in
 * UTC, at a time of day derived from the month.
 *
 * @returns {Array<number>} 144 timestamps in seconds
 */
function buildOrdinaryInstants() {
	const instants = [];

	for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
		for (let month = 0; month < 12; month++) {
			const monthIndex = ((year - FIRST_YEAR) * 12) + month;
			// Each multiplier is coprime with its component's range, so across the 72
			// months every hour, minute, and second value appears. Month 0 is midnight UTC
			const hour = (monthIndex * 5) % 24;
			const minute = (monthIndex * 13) % 60;
			const second = (monthIndex * 17) % 60;

			for (const day of [1, 15]) {
				instants.push(Date.UTC(year, month, day, hour, minute, second) / 1000);
			}
		}
	}

	return instants;
}

/**
 * Build one zone's timestamps: the ordinary instants, local midnight on the
 * first day of each quarter, and the seconds around each transition in range.
 *
 * @param {Object} moment - The moment-timezone module
 * @param {string} zoneName - IANA zone name
 * @param {Object} zone - moment-timezone Zone for zoneName
 * @returns {Array<number>} Timestamps in seconds, sorted, without duplicates
 * @throws {Error} When a quarter start isn't a local-midnight boundary, or a transition isn't on a whole second
 */
function buildTimestamps(moment, zoneName, zone) {
	const timestamps = buildOrdinaryInstants();

	for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
		for (const month of QUARTER_START_MONTHS) {
			const midnight = moment.tz([year, month, 1], zoneName).unix();
			// The row must be exactly on a boundary in the local frame the arithmetic uses
			if ((midnight + (offsetMinutesAt(zone, midnight) * 60)) % SECONDS_PER_DAY !== 0) {
				throw new Error(`Local midnight for ${zoneName} on ${year}-${month + 1}-01 isn't a day boundary: ${midnight}`);
			}
			timestamps.push(midnight);
		}
	}

	for (const untilMs of zone.untils) {
		if (untilMs >= RANGE_START_MS && untilMs < RANGE_END_MS) {
			const transition = untilMs / 1000;
			if (!Number.isInteger(transition)) {
				throw new Error(`Transition for ${zoneName} isn't on a whole second: ${untilMs} ms`);
			}
			timestamps.push(transition - 1, transition, transition + 1);
		}
	}

	return [...new Set(timestamps)].sort((a, b) => a - b);
}

/**
 * Record one zone's offsets and boundary deltas with the pre-change arithmetic.
 * Replaces CacheData.getOffsetInMinutes for each row; the caller restores it.
 *
 * @param {Object} CacheData - The pre-change CacheData class
 * @param {Object} zone - moment-timezone Zone
 * @param {string} zoneName - IANA zone name, for error messages
 * @param {Array<number>} timestamps - Timestamps in seconds
 * @returns {{timestamps: Array<number>, offsets: Array<number>, boundaryDeltas: Array<Array<number>>}} The zone's rows
 * @throws {Error} When a boundary delta isn't an integer, which JSON could only record lossily
 */
function recordZone(CacheData, zone, zoneName, timestamps) {
	const offsets = [];
	const boundaryDeltas = [];

	for (const timestamp of timestamps) {
		const offset = offsetMinutesAt(zone, timestamp);
		// Sample the offset at this row's timestamp (Q1). nextIntervalInSeconds reads
		// it by calling CacheData.getOffsetInMinutes() by class name
		CacheData.getOffsetInMinutes = () => offset;
		offsets.push(offset);

		boundaryDeltas.push(INTERVALS.map((interval) => {
			const delta = CacheData.nextIntervalInSeconds(interval, timestamp) - timestamp;
			if (!Number.isInteger(delta)) {
				throw new Error(`Boundary delta for ${zoneName} at ${timestamp} with interval ${interval} isn't an integer: ${delta}`);
			}
			return delta;
		}));
	}

	return { timestamps, offsets, boundaryDeltas };
}

/**
 * Build the fixture for every zone, restoring CacheData.getOffsetInMinutes afterwards.
 *
 * @param {Object} moment - The moment-timezone module
 * @param {Object} CacheData - The pre-change CacheData class
 * @returns {Object} The fixture, in output order
 * @throws {Error} When moment-timezone has no data for a zone, or a row fails a check
 */
function buildFixture(moment, CacheData) {
	const zones = {};
	const originalGetOffsetInMinutes = CacheData.getOffsetInMinutes;

	try {
		for (const zoneName of ZONES) {
			const zone = moment.tz.zone(zoneName);
			if (zone === null) {
				throw new Error(`moment-timezone ${moment.tz.version} has no zone ${zoneName}`);
			}
			zones[zoneName] = recordZone(CacheData, zone, zoneName, buildTimestamps(moment, zoneName, zone));
		}
	} finally {
		CacheData.getOffsetInMinutes = originalGetOffsetInMinutes;
	}

	return {
		generator: GENERATOR,
		source: SOURCE,
		momentTimezoneVersion: moment.tz.version,
		tzdataVersion: moment.tz.dataVersion,
		intervals: INTERVALS,
		zones
	};
}

/**
 * Serialize a value as JSON with objects indented by tabs, each flat array on
 * one line, and each array of arrays with one inner array per line.
 *
 * @param {*} value - Value to serialize
 * @param {string} [indent=""] - Indentation of the line the value starts on
 * @returns {string} JSON text
 */
function formatJson(value, indent = "") {
	const inner = `${indent}\t`;

	if (Array.isArray(value)) {
		if (value.length > 0 && value.every((item) => Array.isArray(item))) {
			const rows = value.map((row) => `${inner}${formatJson(row, inner)}`);
			return `[\n${rows.join(",\n")}\n${indent}]`;
		}
		return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
	}

	if (value !== null && typeof value === "object") {
		const members = Object.entries(value).map(([key, member]) => `${inner}${JSON.stringify(key)}: ${formatJson(member, inner)}`);
		return (members.length === 0) ? "{}" : `{\n${members.join(",\n")}\n${indent}}`;
	}

	return JSON.stringify(value);
}

/**
 * Generate the fixture and write it.
 *
 * @returns {void}
 */
function main() {
	let options;
	try {
		options = parseOptions(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`generate-interval-fixture: ${error.message}\n${USAGE}`);
		process.exitCode = 2;
		return;
	}

	// The tools module warns when AWS_REGION is unset. The value doesn't affect the fixture
	if (!process.env.AWS_REGION) {
		process.env.AWS_REGION = "us-east-1";
	}

	const moment = loadMomentTimezone();
	const CacheData = loadCacheData(options.daoCachePath);
	const fixture = buildFixture(moment, CacheData);
	const text = `${formatJson(fixture)}\n`;

	fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
	fs.writeFileSync(options.outPath, text, "utf8");

	const rowCount = Object.values(fixture.zones).reduce((sum, zone) => sum + zone.timestamps.length, 0);
	process.stdout.write(`Wrote ${options.outPath}: ${ZONES.length} zones, ${rowCount} rows, ${Buffer.byteLength(text)} bytes\n`);
}

main();
