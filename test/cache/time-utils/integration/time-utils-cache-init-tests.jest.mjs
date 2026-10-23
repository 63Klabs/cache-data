/**
 * Cache.init() timezone tests (child processes).
 *
 * Purpose: verify how Cache.init() resolves, validates, and applies timeZoneForInterval
 * once TimeUtils handles the timezone. An invalid timezone fails init before any Cache
 * state is assigned, logs once, and doesn't block a corrected retry. In-memory-only mode
 * honors the timezone. A key holding undefined falls through to the default.
 * Cache.info() reports tzDataVersion. Interval boundaries use the offset at the
 * timestamp being rounded rather than the offset when init ran.
 *
 * These tests encode the fixed behavior. They fail until TimeUtils is integrated into
 * src/lib/dao-cache.js (task 6), which proves each one detects its defect.
 *
 * Setup: Cache and TimeUtils initialize once per module instance and expose no reset,
 * so each test runs the `cache-init` scenario of
 * test/cache/time-utils/fixtures/time-utils-child.cjs in a fresh Node.js process through
 * test/helpers/time-utils-child-runner.mjs. The runner uses execFileSync with an
 * argument array and a 20-second child timeout, never a shell or `npm test`. It removes
 * CACHE_DATA_TIME_ZONE_FOR_INTERVAL and the in-memory switches from the child
 * environment, and CHILD_ENV below removes the other variables that could change a
 * result. The child replaces DebugAndLog.warn and DebugAndLog.error with recorders.
 *
 * Fixed expected values use America/Chicago in 2026, where the tzdata in Node.js 22,
 * 24, and 26 agrees (Requirement 11.12).
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (task 4.2; design.md, "Testing strategy")
 * Validates: Requirements 2.2, 3.5, 3.6, 5.3, 8.1, 8.3, 8.8, 11.6
 *
 * Related tests:
 * - test/cache/time-utils/integration/time-utils-lifecycle-tests.jest.mjs
 * - test/cache/time-utils/integration/time-utils-cache-api-tests.jest.mjs
 * - test/cache/cache-validation-tests.jest.mjs
 */

import { describe, it, expect } from "@jest/globals";
import { runTimeUtilsChild } from "../../../helpers/time-utils-child-runner.mjs";

/** Timeout for each child-process test; the child itself times out at 20 seconds. */
const CHILD_TEST_TIMEOUT_MS = 60000;

/**
 * Environment overrides for every child, applied on top of the runner's defaults.
 * Cache.init() reads these variables: the first sets info.idHashAlgorithm, and the other
 * two make CacheData.init() throw when they hold an invalid value. Removing them keeps
 * the developer's shell from changing a result.
 */
const CHILD_ENV = Object.freeze({
	CACHE_DATA_ID_HASH_ALGORITHM: undefined,
	CACHE_DATA_DYNAMO_DB_MAX_CACHE_SIZE_KB: undefined,
	CACHE_DATA_PURGE_EXPIRED_CACHE_ENTRIES_AFTER_X_HRS: undefined
});

const DAY_IN_SECONDS = 86400;
const INVALID_ZONE = "Invalid/Zone";

/** The Requirement 3.2 message for INVALID_ZONE passed as the timezone option. */
const INVALID_ZONE_MESSAGE = 'Invalid timezone "Invalid/Zone". Expected an IANA time zone name such as "America/Chicago" or "Etc/UTC".';

/** The one DebugAndLog.error message Cache.init() logs before re-throwing (Requirement 3.5). */
const INVALID_ZONE_LOG = `Cache.init() failed: ${INVALID_ZONE_MESSAGE}`;

/** The child's summary of an init call that returned. */
const RETURNED = Object.freeze({ threw: false, name: null, message: null, causeName: null });

/** The child's summary of an init call that threw the Requirement 3.1 and 3.2 error. */
const THREW_INVALID_ZONE = Object.freeze({ threw: true, name: "Error", message: INVALID_ZONE_MESSAGE, causeName: "RangeError" });

/**
 * Seconds since the Unix epoch for an ISO 8601 instant.
 *
 * @param {string} iso - Instant such as "2026-10-21T15:00:00Z"
 * @returns {number} The instant in seconds
 */
function epochSeconds(iso) {
	return Date.parse(iso) / 1000;
}

/** 10:00 AM CDT (UTC-5) in America/Chicago. */
const OCTOBER_TIMESTAMP = epochSeconds("2026-10-21T15:00:00Z");

/** The next 24-hour boundary after OCTOBER_TIMESTAMP in America/Chicago: midnight CDT. */
const OCTOBER_CHICAGO_BOUNDARY = epochSeconds("2026-10-22T05:00:00Z");

/**
 * Run the cache-init scenario in a fresh process and check that it ran.
 *
 * @param {Object} args - cache-init arguments: calls, and optionally interval and timestamp
 * @param {Object.<string, (string|undefined)>} [env={}] - Environment overrides, applied after CHILD_ENV
 * @returns {Object} The scenario result
 */
function runCacheInit(args, env = {}) {
	const run = runTimeUtilsChild("cache-init", args, { env: { ...CHILD_ENV, ...env } });
	// stderr is empty on a zero exit, so a failed run shows the child's error line in the diff
	expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: "" });
	expect(run.result).not.toBeNull();
	expect(run.result.loadError).toBeNull();
	return run.result;
}

describe("Cache.init() timezone handling in a fresh process (fixed behavior)", () => {

	describe("an invalid timeZoneForInterval (Req 3.5, 3.6)", () => {

		it("throws the readable error, logs it once, and assigns no Cache, CacheData, or TimeUtils state", () => {
			const result = runCacheInit({
				calls: [
					{ params: { dynamoDbTable: "table-one", s3Bucket: "bucket-one", timeZoneForInterval: INVALID_ZONE } }
				]
			});

			expect(result.calls).toEqual([THREW_INVALID_ZONE]);
			expect(result.errors).toEqual([INVALID_ZONE_LOG]);
			// idHashAlgorithm is the first Cache field init assigns, dynamoDbTable shows whether
			// CacheData.init() ran, and Etc/UTC is the uninitialized TimeUtils timezone
			expect(result.info).toMatchObject({
				idHashAlgorithm: null,
				dynamoDbTable: null,
				timeZoneForInterval: "Etc/UTC"
			});
		}, CHILD_TEST_TIMEOUT_MS);

		it("lets a corrected retry initialize Cache with its own settings, as if the failed call hadn't happened", () => {
			const result = runCacheInit({
				calls: [
					{ params: { dynamoDbTable: "table-one", s3Bucket: "bucket-one", timeZoneForInterval: INVALID_ZONE } },
					{ params: { dynamoDbTable: "table-two", s3Bucket: "bucket-two", timeZoneForInterval: "America/Chicago" } }
				],
				interval: DAY_IN_SECONDS,
				timestamp: OCTOBER_TIMESTAMP
			});

			expect(result.calls).toEqual([THREW_INVALID_ZONE, RETURNED]);
			expect(result.info).toMatchObject({
				dynamoDbTable: "table-two",
				timeZoneForInterval: "America/Chicago"
			});
			// The corrected timezone is in effect: midnight CDT, not midnight UTC
			expect(result.nextIntervalInSeconds).toBe(OCTOBER_CHICAGO_BOUNDARY);
			// No "already initialized" warning: the failed call left nothing initialized
			expect(result.warnings).toEqual([]);
			expect(result.errors).toEqual([INVALID_ZONE_LOG]);
		}, CHILD_TEST_TIMEOUT_MS);
	});

	describe("in-memory-only mode (Req 8.1, 8.3)", () => {

		it("honors America/Chicago: info reports it, and a 24-hour boundary falls on local midnight", () => {
			const result = runCacheInit({
				calls: [
					{ params: { inMemoryOnly: true, timeZoneForInterval: "America/Chicago" } }
				],
				interval: DAY_IN_SECONDS,
				timestamp: OCTOBER_TIMESTAMP
			});

			expect(result.calls).toEqual([RETURNED]);
			expect(result.info).toMatchObject({
				inMemoryOnly: true,
				timeZoneForInterval: "America/Chicago",
				tzDataVersion: result.processVersionsTz
			});
			// 2026-10-22T05:00Z is midnight CDT. Aligned to UTC it would be 2026-10-22T00:00Z
			expect(result.nextIntervalInSeconds).toBe(OCTOBER_CHICAGO_BOUNDARY);
		}, CHILD_TEST_TIMEOUT_MS);

		it("throws for an invalid timezone before evaluating the in-memory-only guard", () => {
			const result = runCacheInit({
				calls: [
					{ params: { inMemoryOnly: true, timeZoneForInterval: INVALID_ZONE } }
				]
			});

			expect(result.calls).toEqual([THREW_INVALID_ZONE]);
			expect(result.errors).toEqual([INVALID_ZONE_LOG]);
			expect(result.info).toMatchObject({
				inMemoryOnly: false,
				timeZoneForInterval: "Etc/UTC"
			});
		}, CHILD_TEST_TIMEOUT_MS);
	});

	it("defaults to Etc/UTC when timeZoneForInterval holds undefined and the env var is unset (Req 2.2)", () => {
		// Models `timeZoneForInterval: process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL` with the
		// variable unset: an own key holding undefined, not an omitted key
		const result = runCacheInit(
			{
				calls: [
					{ params: { dynamoDbTable: "table-one", s3Bucket: "bucket-one" }, undefinedParams: ["timeZoneForInterval"] }
				]
			},
			{ CACHE_DATA_TIME_ZONE_FOR_INTERVAL: undefined }
		);

		expect(result.calls).toEqual([RETURNED]);
		expect(result.info).toMatchObject({
			dynamoDbTable: "table-one",
			timeZoneForInterval: "Etc/UTC"
		});
	}, CHILD_TEST_TIMEOUT_MS);

	it("reports Cache.info().tzDataVersion equal to the child's process.versions.tz (Req 8.8)", () => {
		const result = runCacheInit({
			calls: [
				{ params: { dynamoDbTable: "table-one", s3Bucket: "bucket-one", timeZoneForInterval: "America/Chicago" } }
			]
		});

		expect(result.calls).toEqual([RETURNED]);
		expect(result.info).toHaveProperty("tzDataVersion", result.processVersionsTz);
	}, CHILD_TEST_TIMEOUT_MS);

	it("rounds with the offset at the timestamp, not the offset when init ran (Req 5.3)", () => {
		// Init runs during CDT (UTC-5). 2026-01-15T18:00Z is noon CST (UTC-6), so the next
		// 24-hour boundary is midnight CST, 2026-01-16T06:00Z. An offset sampled at init
		// would put it at 2026-01-16T05:00Z, 11:00 PM CST
		const result = runCacheInit({
			calls: [
				{
					params: { dynamoDbTable: "table-one", s3Bucket: "bucket-one", timeZoneForInterval: "America/Chicago" },
					nowAtInit: Date.parse("2026-07-01T12:00:00Z")
				}
			],
			interval: DAY_IN_SECONDS,
			timestamp: epochSeconds("2026-01-15T18:00:00Z")
		});

		expect(result.calls).toEqual([RETURNED]);
		expect(result.nextIntervalInSeconds).toBe(epochSeconds("2026-01-16T06:00:00Z"));
	}, CHILD_TEST_TIMEOUT_MS);
});
