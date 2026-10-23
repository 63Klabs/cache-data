/**
 * Property-based tests for the internal TimeUtils class: Property 8 of the timezone
 * design, the cross-check against native Temporal. Properties 1 to 7 are in
 * time-utils-property-tests.jest.mjs.
 *
 * Why a second oracle. TimeUtils derives an offset by reading the wall-clock parts that
 * Intl.DateTimeFormat formats for an instant back as a UTC time. Properties 1 and 3
 * check it against the longOffset oracle, which parses the offset ICU formats itself
 * with timeZoneName "longOffset". That oracle is independent of TimeUtils'
 * reconstruction, but it goes through the same Intl.DateTimeFormat formatter path.
 * Temporal is a separate implementation, and it hands back the offset as a number,
 * ZonedDateTime.offsetNanoseconds, with no formatting or parsing step in between. A
 * fault the two formatter paths share, which the longOffset oracle can't see, shows up
 * here as a disagreement. Both read the runtime's tz data, so this checks how the offset
 * is derived, not the data itself. On Node.js 26.10.0 the two agreed for all 418 zones
 * from 2020 to 2027 (PLAN.md, Round 3).
 *
 * T(z, t) below is temporalOffsetMinutes(temporal, z, t * 1000) from
 * test/helpers/time-utils-oracles.mjs: Temporal's offset in minutes, with TimeUtils'
 * sign convention, local time minus UTC, and 0 rather than -0 for a zero offset.
 *
 * Detection. nativeTemporal(), from the same module, returns globalThis.Temporal only on
 * Node.js 26 or later with the standard API, detected by
 * Temporal.ZonedDateTime.prototype.getTimeZoneTransition. The version check excludes the
 * older, pre-standard implementation that --harmony-temporal exposes on Node.js 22 and
 * 24, and the API check excludes a polyfill with a different shape. This file reaches
 * Temporal only through those two helpers, which read it from globalThis, so it loads
 * without a ReferenceError on a runtime that doesn't have it.
 *
 * Skipped elsewhere. The Property 8 block is (nativeTemporal() ? describe : describe.skip),
 * so on Node.js 22 and 24 Jest reports its tests as skipped, not passed
 * (Requirement 11.5). Properties 1 and 3 give the same coverage on every runtime with
 * the longOffset oracle. On Node.js 26, CI runs this file in the leg marked
 * continue-on-error (.github/workflows/test.yml), so it's a cross-check rather than a
 * release gate.
 *
 * TimeUtils is internal, so it's imported by file path, as the sibling file does. This
 * file never calls TimeUtils.init(), so the active timezone stays "Etc/UTC", and every
 * zone is reached through the explicit-timezone seam instead:
 * getOffsetInMinutes(t, z) and nextIntervalInSeconds(I, t, z) (Requirement 4.5).
 *
 * The arbitraries are the sibling file's zone, instant, and interval, copied rather than
 * shared, and all valid by construction:
 * - zone: any name Intl.supportedValuesOf("timeZone") lists. On Node.js 26.10.0,
 *   Temporal accepts all 418
 * - instant: an integer second from 2000-01-01T00:00:00Z to 2099-12-31T23:59:59Z. It's
 *   never 0, which TimeUtils reads as "now". Every offset in this range is a whole
 *   number of minutes, so 60 * T(z, t) is an exact number of seconds
 * - interval: the 20 intervals of Cache.testInterval(), plus any integer from 1 second
 *   to 30 days
 *
 * Guardrails (.kiro/steering/test-execution-monitoring.md):
 * - No fc.assert passes a seed option. The global FC_SEED hook,
 *   test/setup/fast-check-seed.mjs, seeds both.
 * - No fc.pre and no filters. Nothing is gated, on the predicate a property asserts or
 *   on anything else.
 * - numRuns is 1000 for both properties, as for Properties 1 and 3. Nothing here spawns
 *   a child process.
 *
 * Spec: .kiro/specs/1-4-0-fully-implement-timezone (design.md, "Correctness properties"
 * and "Temporal oracle (Q13)")
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

import TimeUtils from "../../../../src/lib/utils/TimeUtils.class.js";
import { INTERVAL_TABLE, nativeTemporal, temporalOffsetMinutes } from "../../../helpers/time-utils-oracles.mjs";

/* ****************************************************************************
 *	Constants
 */

/** Jest timeout for each property test, in milliseconds */
const PROPERTY_TIMEOUT_MS = 60000;

/** numRuns for both Property 8 tests, the same as for Properties 1 and 3 */
const NUM_RUNS = 1000;

/** The longest interval drawn outside the interval table: 30 days, in seconds */
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60;

/** 2000-01-01T00:00:00Z, in seconds: the start of the instant range */
const INSTANT_MIN_SECONDS = Date.UTC(2000, 0, 1) / 1000;

/** 2099-12-31T23:59:59Z, in seconds: the end of the instant range */
const INSTANT_MAX_SECONDS = Date.UTC(2099, 11, 31, 23, 59, 59) / 1000;

/** Every time zone name this runtime supports */
const SUPPORTED_ZONES = Object.freeze(Intl.supportedValuesOf("timeZone"));

/* ****************************************************************************
 *	Shared arbitraries, copied from time-utils-property-tests.jest.mjs
 */

/** Any time zone name this runtime supports */
const zone = fc.constantFrom(...SUPPORTED_ZONES);

/** An integer second from 2000 through 2099 */
const instant = fc.integer({ min: INSTANT_MIN_SECONDS, max: INSTANT_MAX_SECONDS });

/** The interval table plus any whole number of seconds up to 30 days */
const interval = fc.oneof(fc.constantFrom(...INTERVAL_TABLE), fc.integer({ min: 1, max: MAX_INTERVAL_SECONDS }));

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

/* ****************************************************************************
 *	Properties
 */

describe("TimeUtils - Temporal Oracle Property Tests", () => {

	// **Validates: Requirements 5.2, 6.3, 11.5**
	(nativeTemporal() ? describe : describe.skip)("Property 8: Temporal agrees, on Node.js 26 or later", () => {

		// Read once while Jest collects the tests. It's null where this block is skipped,
		// and only the it() bodies use it, which Jest runs only where it isn't
		const temporal = nativeTemporal();

		it("returns the offset Temporal reports for the instant", () => {
			fc.assert(
				fc.property(zone, instant, (timeZone, timestampInSeconds) => {
					expect(TimeUtils.getOffsetInMinutes(timestampInSeconds, timeZone))
						.toBe(temporalOffsetMinutes(temporal, timeZone, timestampInSeconds * 1000));
				}),
				{ numRuns: NUM_RUNS }
			);
		}, PROPERTY_TIMEOUT_MS);

		it("puts each boundary within one interval of the timestamp, aligned to Temporal's offset", () => {
			fc.assert(
				fc.property(zone, instant, interval, (timeZone, timestampInSeconds, intervalInSeconds) => {
					const boundary = TimeUtils.nextIntervalInSeconds(intervalInSeconds, timestampInSeconds, timeZone);
					// Temporal's offset at the timestamp, not TimeUtils' own. The boundary aligns
					// to it only if TimeUtils sampled the offset at the timestamp (Requirement 5.3)
					const offsetInSeconds = 60 * temporalOffsetMinutes(temporal, timeZone, timestampInSeconds * 1000);

					expect(Number.isInteger(boundary)).toBe(true);
					expect(boundary).toBeGreaterThanOrEqual(timestampInSeconds);
					expect(boundary).toBeLessThan(timestampInSeconds + intervalInSeconds);
					expect(remainder(boundary + offsetInSeconds, intervalInSeconds)).toBe(0);
				}),
				{ numRuns: NUM_RUNS }
			);
		}, PROPERTY_TIMEOUT_MS);
	});
});
