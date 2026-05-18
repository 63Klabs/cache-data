import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { LoggerBridge } from "../../../src/lib/utils/LoggerBridge.js";

/**
 * Property 7: Log Level Mapping Correctness
 * 
 * For any DebugAndLog tag in the set {ERROR, WARN, INFO, MSG, DIAG, DEBUG, LOG},
 * LoggerBridge.mapLevel(tag) SHALL return the corresponding Powertools level:
 * ERROR→error, WARN→warn, INFO→info, MSG→info, DIAG→debug, DEBUG→debug, LOG→info.
 * 
 * For any unknown tag, mapLevel returns "info" (default).
 * mapLevel never throws for any string input.
 * 
 * **Validates: Requirements 6.3**
 */
describe("Property 7: Log Level Mapping Correctness", () => {

	/**
	 * The complete mapping from DebugAndLog tags to Powertools levels.
	 */
	const EXPECTED_MAPPING = {
		"ERROR": "error",
		"WARN": "warn",
		"INFO": "info",
		"MSG": "info",
		"DIAG": "debug",
		"DEBUG": "debug",
		"LOG": "info"
	};

	describe("Known tags map to correct Powertools levels", () => {
		/**
		 * For any known tag drawn from the set of 7 valid tags,
		 * mapLevel returns the correct corresponding Powertools level.
		 */
		it("should map all known tags to their correct Powertools levels", () => {
			const knownTags = fc.constantFrom("ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG", "LOG");

			fc.assert(
				fc.property(
					knownTags,
					(tag) => {
						const result = LoggerBridge.mapLevel(tag);
						expect(result).toBe(EXPECTED_MAPPING[tag]);
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Exhaustive test: verify each of the 7 known mappings individually.
		 */
		it("should exhaustively verify all 7 known mappings", () => {
			expect(LoggerBridge.mapLevel("ERROR")).toBe("error");
			expect(LoggerBridge.mapLevel("WARN")).toBe("warn");
			expect(LoggerBridge.mapLevel("INFO")).toBe("info");
			expect(LoggerBridge.mapLevel("MSG")).toBe("info");
			expect(LoggerBridge.mapLevel("DIAG")).toBe("debug");
			expect(LoggerBridge.mapLevel("DEBUG")).toBe("debug");
			expect(LoggerBridge.mapLevel("LOG")).toBe("info");
		});
	});

	describe("Unknown tags default to info", () => {
		/**
		 * For any arbitrary string that is NOT one of the 7 known tags,
		 * mapLevel returns "info" as the default level.
		 */
		it("should return 'info' for any unknown tag", () => {
			const knownTags = ["ERROR", "WARN", "INFO", "MSG", "DIAG", "DEBUG", "LOG"];

			const unknownTag = fc.string().filter(
				(s) => !knownTags.includes(s)
			);

			fc.assert(
				fc.property(
					unknownTag,
					(tag) => {
						const result = LoggerBridge.mapLevel(tag);
						expect(result).toBe("info");
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * Lowercase versions of known tags are treated as unknown.
		 */
		it("should return 'info' for lowercase versions of known tags", () => {
			const lowercaseTags = fc.constantFrom(
				"error", "warn", "info", "msg", "diag", "debug", "log"
			);

			fc.assert(
				fc.property(
					lowercaseTags,
					(tag) => {
						const result = LoggerBridge.mapLevel(tag);
						expect(result).toBe("info");
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});
	});

	describe("mapLevel never throws for any string input", () => {
		/**
		 * For any arbitrary string input (including empty strings, special characters,
		 * very long strings, etc.), mapLevel SHALL NOT throw an exception.
		 */
		it("should never throw for any arbitrary string input", () => {
			fc.assert(
				fc.property(
					fc.string(),
					(tag) => {
						expect(() => LoggerBridge.mapLevel(tag)).not.toThrow();
					}
				),
				{
					numRuns: 100,
					seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
				}
			);
		});

		/**
		 * mapLevel always returns one of the valid Powertools levels.
		 */
		it("should always return a valid Powertools level", () => {
			const validLevels = ["error", "warn", "info", "debug"];

			fc.assert(
				fc.property(
					fc.string(),
					(tag) => {
						const result = LoggerBridge.mapLevel(tag);
						expect(validLevels).toContain(result);
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
