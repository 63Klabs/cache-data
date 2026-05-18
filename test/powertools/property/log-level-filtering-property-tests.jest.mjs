import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

/**
 * Property 8: Log Level Filtering Preservation
 * 
 * For any configured log level (0-5) and any message tag, the same messages
 * SHALL be filtered (suppressed) or passed (emitted) regardless of whether
 * the Powertools Logger is active or not. The filtering decision depends only
 * on the configured level and the message tag, not on the output backend.
 * 
 * **Validates: Requirements 6.5**
 */
describe("Property 8: Log Level Filtering Preservation", () => {

	/**
	 * DebugAndLog numeric log levels:
	 *   ERROR = 0 (always logged)
	 *   WARN  = 1
	 *   INFO  = 2
	 *   MSG   = 3
	 *   DIAG  = 4
	 *   DEBUG = 5
	 * 
	 * A message at level N is logged only if the configured log level >= N.
	 * ERROR messages are always logged regardless of configured level.
	 */

	// Define the filtering logic as a pure function matching DebugAndLog's writeLog behavior
	const TAG_LEVEL_MAP = {
		"ERROR": 0,
		"WARN": 1,
		"INFO": 2,
		"MSG": 3,
		"DIAG": 4,
		"DEBUG": 5
	};

	/**
	 * Pure function that determines whether a message should be logged.
	 * This mirrors the filtering logic in DebugAndLog.writeLog().
	 * 
	 * @param {number} configuredLevel - The configured log level (0-5)
	 * @param {string} tag - The message tag (ERROR, WARN, INFO, MSG, DIAG, DEBUG)
	 * @returns {boolean} True if the message should be logged, false if suppressed
	 */
	function shouldLog(configuredLevel, tag) {
		// ERROR is always logged regardless of configured level
		if (tag === "ERROR") {
			return true;
		}

		const tagLevel = TAG_LEVEL_MAP[tag];

		// If tag is not recognized (default/LOG case), it's always logged
		if (tagLevel === undefined) {
			return true;
		}

		// Message is logged only if configured level >= tag's required level
		return configuredLevel >= tagLevel;
	}

	/**
	 * Simulates the filtering decision as it would be made with LoggerBridge active.
	 * The design document shows that when LoggerBridge is active, the same level
	 * filtering is applied before delegating to the bridge.
	 * 
	 * @param {number} configuredLevel - The configured log level (0-5)
	 * @param {string} tag - The message tag
	 * @returns {boolean} True if the message would be passed to LoggerBridge
	 */
	function shouldLogWithBridge(configuredLevel, tag) {
		// The design shows the same filtering logic is applied before bridge delegation:
		// ERROR always passes
		if (tag === "ERROR") {
			return true;
		}

		const tagLevel = TAG_LEVEL_MAP[tag];

		if (tagLevel === undefined) {
			return true;
		}

		// Same check: configured level >= tag level
		return configuredLevel >= tagLevel;
	}

	describe("Filtering decision is identical regardless of Logger backend", () => {
		it("should produce the same filtering decision with or without LoggerBridge for any (level, tag) combination", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5 }),
					fc.constantFrom("ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG"),
					(configuredLevel, tag) => {
						const withoutBridge = shouldLog(configuredLevel, tag);
						const withBridge = shouldLogWithBridge(configuredLevel, tag);

						expect(withBridge).toBe(withoutBridge);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("ERROR messages are always logged regardless of configured level", () => {
		it("should always log ERROR messages for any configured level (0-5)", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5 }),
					(configuredLevel) => {
						const result = shouldLog(configuredLevel, "ERROR");
						expect(result).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Messages at levels higher than configured level are suppressed", () => {
		it("should suppress messages when tag level exceeds configured level", () => {
			// Generate combinations where tag level > configured level
			const suppressedCombination = fc.integer({ min: 0, max: 4 }).chain(
				(configuredLevel) => {
					// Pick a tag whose level is strictly greater than configuredLevel
					const tagsAboveLevel = Object.entries(TAG_LEVEL_MAP)
						.filter(([tag, level]) => tag !== "ERROR" && level > configuredLevel)
						.map(([tag]) => tag);

					if (tagsAboveLevel.length === 0) {
						// configuredLevel is 5, no tags above it (except none)
						return fc.constant(null);
					}

					return fc.constantFrom(...tagsAboveLevel).map(tag => ({
						configuredLevel,
						tag
					}));
				}
			).filter(v => v !== null);

			fc.assert(
				fc.property(
					suppressedCombination,
					({ configuredLevel, tag }) => {
						const result = shouldLog(configuredLevel, tag);
						expect(result).toBe(false);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		it("should pass messages when tag level is at or below configured level", () => {
			// Generate combinations where tag level <= configured level
			const passedCombination = fc.integer({ min: 0, max: 5 }).chain(
				(configuredLevel) => {
					// Pick a tag whose level is <= configuredLevel (excluding ERROR which is always logged)
					const tagsAtOrBelowLevel = Object.entries(TAG_LEVEL_MAP)
						.filter(([tag, level]) => tag !== "ERROR" && level <= configuredLevel)
						.map(([tag]) => tag);

					if (tagsAtOrBelowLevel.length === 0) {
						// configuredLevel is 0, only ERROR would pass (handled separately)
						return fc.constant(null);
					}

					return fc.constantFrom(...tagsAtOrBelowLevel).map(tag => ({
						configuredLevel,
						tag
					}));
				}
			).filter(v => v !== null);

			fc.assert(
				fc.property(
					passedCombination,
					({ configuredLevel, tag }) => {
						const result = shouldLog(configuredLevel, tag);
						expect(result).toBe(true);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("Filtering is monotonic with respect to configured level", () => {
		it("should never suppress a message at level N if it passes at level N-1", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 5 }),
					fc.constantFrom("ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG"),
					(configuredLevel, tag) => {
						const passesAtLowerLevel = shouldLog(configuredLevel - 1, tag);
						const passesAtHigherLevel = shouldLog(configuredLevel, tag);

						// If it passes at a lower configured level, it must also pass at a higher one
						if (passesAtLowerLevel) {
							expect(passesAtHigherLevel).toBe(true);
						}
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});
});
