/**
 * Bug Condition Exploration Property Test
 * 
 * Property 1: Bug Condition - Default Limit Not Injected as Query Parameter
 * 
 * This test encodes the EXPECTED behavior: when pagination is enabled with a
 * `defaultLimit` configured and `parameters` does not contain the `limitLabel`
 * key, the system SHALL inject `defaultLimit` as `parameters[limitLabel]` before
 * constructing the request URI, so that `getURI()` contains the query parameter
 * `limitLabel=defaultLimit`.
 * 
 * On UNFIXED code, this test is EXPECTED TO FAIL because the constructor does
 * not inject `defaultLimit` into `parameters[limitLabel]` before URI construction.
 * 
 * Bug Condition: isBugCondition(input) returns true when
 *   input.pagination.enabled = true
 *   AND (input.parameters IS NULL OR UNDEFINED OR input.parameters[input.pagination.limitLabel] IS UNDEFINED)
 * 
 * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import ApiRequest from "../../../src/lib/tools/ApiRequest.class.js";

/**
 * Arbitrary for generating a limitLabel from common pagination parameter names.
 */
const limitLabelArb = fc.constantFrom("limit", "take", "pageSize", "per_page");

/**
 * Arbitrary for generating a defaultLimit value.
 */
const defaultLimitArb = fc.integer({ min: 1, max: 10000 });

/**
 * Arbitrary for generating a path from common API paths.
 */
const pathArb = fc.constantFrom("/items", "/users", "/orders", "/data");

/**
 * Arbitrary for generating parameters that do NOT include the limitLabel key.
 * Returns one of: undefined, null, empty object, or object with unrelated keys.
 */
function parametersWithoutLimitArb(limitLabel) {
	const unrelatedKeysArb = fc.dictionary(
		fc.stringMatching(/^[a-z]{2,8}$/).filter(key => key !== limitLabel),
		fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 100 }).map(String)),
		{ minKeys: 1, maxKeys: 3 }
	);

	return fc.oneof(
		fc.constant(undefined),
		fc.constant(null),
		fc.constant({}),
		unrelatedKeysArb
	);
}

describe("Property 1: Bug Condition - Default Limit Not Injected as Query Parameter", () => {

	it("getURI() contains limitLabel=defaultLimit when pagination is enabled and no explicit limit is provided", () => {
		/**
		 * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
		 * 
		 * For any input where pagination is enabled and no explicit limit parameter
		 * is provided, the URI returned by getURI() must contain the query parameter
		 * limitLabel=defaultLimit.
		 */
		fc.assert(
			fc.property(
				fc.domain(),
				pathArb,
				defaultLimitArb,
				limitLabelArb,
				(host, path, defaultLimit, limitLabel) => {
					// Generate parameters without the limitLabel
					// Use a simple case: parameters is undefined (most common bug trigger)
					const config = {
						host,
						path,
						pagination: {
							enabled: true,
							defaultLimit,
							limitLabel
						}
					};

					const apiRequest = new ApiRequest(config);
					const uri = apiRequest.getURI();

					// Assert: URI must contain limitLabel=defaultLimit as a query parameter
					const expectedParam = `${limitLabel}=${defaultLimit}`;
					expect(uri).toMatch(
						new RegExp(`[?&]${escapeRegExp(expectedParam)}(&|$)`)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("getURI() contains limitLabel=defaultLimit when parameters is null", () => {
		/**
		 * **Validates: Requirements 1.3, 2.3**
		 */
		fc.assert(
			fc.property(
				fc.domain(),
				pathArb,
				defaultLimitArb,
				limitLabelArb,
				(host, path, defaultLimit, limitLabel) => {
					const config = {
						host,
						path,
						parameters: null,
						pagination: {
							enabled: true,
							defaultLimit,
							limitLabel
						}
					};

					const apiRequest = new ApiRequest(config);
					const uri = apiRequest.getURI();

					const expectedParam = `${limitLabel}=${defaultLimit}`;
					expect(uri).toMatch(
						new RegExp(`[?&]${escapeRegExp(expectedParam)}(&|$)`)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("getURI() contains limitLabel=defaultLimit when parameters is empty object", () => {
		/**
		 * **Validates: Requirements 1.3, 2.3**
		 */
		fc.assert(
			fc.property(
				fc.domain(),
				pathArb,
				defaultLimitArb,
				limitLabelArb,
				(host, path, defaultLimit, limitLabel) => {
					const config = {
						host,
						path,
						parameters: {},
						pagination: {
							enabled: true,
							defaultLimit,
							limitLabel
						}
					};

					const apiRequest = new ApiRequest(config);
					const uri = apiRequest.getURI();

					const expectedParam = `${limitLabel}=${defaultLimit}`;
					expect(uri).toMatch(
						new RegExp(`[?&]${escapeRegExp(expectedParam)}(&|$)`)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("getURI() contains limitLabel=defaultLimit when parameters has other keys but not limitLabel", () => {
		/**
		 * **Validates: Requirements 1.1, 2.1**
		 */
		fc.assert(
			fc.property(
				fc.domain(),
				pathArb,
				defaultLimitArb,
				limitLabelArb,
				(host, path, defaultLimit, limitLabel) => {
					// Create parameters with keys that are NOT the limitLabel
					const otherParams = { filter: "active", sort: "name" };

					const config = {
						host,
						path,
						parameters: otherParams,
						pagination: {
							enabled: true,
							defaultLimit,
							limitLabel
						}
					};

					const apiRequest = new ApiRequest(config);
					const uri = apiRequest.getURI();

					const expectedParam = `${limitLabel}=${defaultLimit}`;
					expect(uri).toMatch(
						new RegExp(`[?&]${escapeRegExp(expectedParam)}(&|$)`)
					);
				}
			),
			{ numRuns: 100 }
		);
	});

});

/**
 * Escape special regex characters in a string.
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
