/**
 * Bug Condition Exploration Property Test
 * 
 * Property 1: Bug Condition - Pagination and Retry Properties Dropped by Connection
 * 
 * This test encodes the EXPECTED behavior: when a Connection is created with
 * non-null `pagination` and/or `retry` properties, those properties should
 * survive the round-trip through `new Connection(config).toObject()`.
 * 
 * On UNFIXED code, this test is EXPECTED TO FAIL because `_init()` does not
 * handle `pagination` or `retry`, and `toObject()` does not include them.
 * 
 * Bug Condition: isBugCondition(input) returns true when
 *   ("pagination" IN input AND input.pagination !== null)
 *   OR ("retry" IN input AND input.retry !== null)
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { Connection } from "../../../src/lib/tools/Connections.classes.js";

/**
 * Arbitrary for generating non-null pagination config objects.
 */
const paginationArb = fc.record({
	enabled: fc.boolean(),
	defaultLimit: fc.integer({ min: 1, max: 10000 })
});

/**
 * Arbitrary for generating non-null retry config objects.
 */
const retryArb = fc.record({
	enabled: fc.boolean(),
	maxRetries: fc.integer({ min: 0, max: 10 })
});

/**
 * Arbitrary for generating a base connection config with a valid host.
 */
const baseConnectionArb = fc.record({
	host: fc.webAuthority({ withPort: false }),
	path: fc.stringMatching(/^\/[a-z0-9/]{1,20}$/),
	method: fc.constantFrom("GET", "POST", "PUT", "DELETE")
});

describe("Property 1: Bug Condition - Pagination and Retry Properties Dropped by Connection", () => {

	it("pagination property survives Connection round-trip when provided as non-null", () => {
		/**
		 * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
		 */
		fc.assert(
			fc.property(
				baseConnectionArb,
				paginationArb,
				(base, pagination) => {
					const config = { ...base, pagination };
					const conn = new Connection(config);
					const result = conn.toObject();

					// Assert pagination is present and deep equals input
					expect(result.pagination).toEqual(pagination);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("retry property survives Connection round-trip when provided as non-null", () => {
		/**
		 * **Validates: Requirements 1.2, 1.4, 2.2, 2.4**
		 */
		fc.assert(
			fc.property(
				baseConnectionArb,
				retryArb,
				(base, retry) => {
					const config = { ...base, retry };
					const conn = new Connection(config);
					const result = conn.toObject();

					// Assert retry is present and deep equals input
					expect(result.retry).toEqual(retry);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("both pagination and retry properties survive Connection round-trip when both provided as non-null", () => {
		/**
		 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4**
		 */
		fc.assert(
			fc.property(
				baseConnectionArb,
				paginationArb,
				retryArb,
				(base, pagination, retry) => {
					const config = { ...base, pagination, retry };
					const conn = new Connection(config);
					const result = conn.toObject();

					// Assert both properties are present and deep equal input
					expect(result.pagination).toEqual(pagination);
					expect(result.retry).toEqual(retry);
				}
			),
			{ numRuns: 100 }
		);
	});

});
