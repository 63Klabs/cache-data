/**
 * Preservation Property Tests
 * 
 * Property 2: Preservation - Explicit Limit and Non-Paginated Requests Unchanged
 * 
 * These tests capture the EXISTING correct behavior of the ApiRequest class
 * for non-buggy inputs:
 * - Requests with pagination enabled AND an explicit limit parameter provided
 * - Requests with pagination disabled or absent
 * 
 * These tests MUST PASS on both unfixed and fixed code to confirm no regressions.
 * 
 * **Validates: Requirements 2.4, 3.1, 3.2, 3.3, 3.5**
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import ApiRequest from "../../../src/lib/tools/ApiRequest.class.js";

/**
 * Common arbitraries for generating test configs.
 */
const limitLabelArb = fc.constantFrom("limit", "take", "pageSize");
const defaultLimitArb = fc.integer({ min: 1, max: 5000 });
const explicitLimitArb = fc.integer({ min: 1, max: 5000 });
const pathArb = fc.constantFrom("/items", "/users", "/orders", "/data", "/products");

/**
 * Generate a host string that is valid for URL construction.
 */
const hostArb = fc.constantFrom(
	"api.example.com",
	"data.service.io",
	"backend.app.net",
	"rest.platform.org"
);

/**
 * Generate random parameter keys that are safe for query strings.
 * Keys are lowercase alpha strings that won't collide with limit labels.
 */
function safeParamKeyArb(excludeKeys = []) {
	return fc.stringMatching(/^[a-z]{2,8}$/).filter(
		key => !excludeKeys.includes(key) && key !== "limit" && key !== "take" && key !== "pageSize"
	);
}

/**
 * Generate random parameter values (strings or numeric strings).
 */
const paramValueArb = fc.oneof(
	fc.stringMatching(/^[a-zA-Z0-9_-]{1,15}$/),
	fc.integer({ min: 0, max: 9999 }).map(String)
);

/**
 * Escape special regex characters in a string.
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("Property 2: Preservation - Explicit Limit and Non-Paginated Requests Unchanged", () => {

	describe("Property 2a: Explicit limit NOT overwritten by defaultLimit", () => {
		it("getURI() contains limitLabel=explicitValue when pagination enabled with explicit limit", () => {
			/**
			 * **Validates: Requirements 2.4, 3.1**
			 * 
			 * For all configs with pagination enabled AND explicit parameters[limitLabel]
			 * provided (numeric > 0), getURI() must contain limitLabel=explicitValue
			 * (user-provided limit NOT overwritten by defaultLimit).
			 */
			fc.assert(
				fc.property(
					hostArb,
					pathArb,
					limitLabelArb,
					defaultLimitArb,
					explicitLimitArb,
					(host, path, limitLabel, defaultLimit, explicitLimit) => {
						const parameters = { [limitLabel]: explicitLimit };

						const config = {
							host,
							path,
							parameters,
							pagination: {
								enabled: true,
								defaultLimit,
								limitLabel
							}
						};

						const apiRequest = new ApiRequest(config);
						const uri = apiRequest.getURI();

						// The URI must contain the explicit limit value, NOT the defaultLimit
						const expectedParam = `${limitLabel}=${explicitLimit}`;
						expect(uri).toMatch(
							new RegExp(`[?&]${escapeRegExp(expectedParam)}(&|$)`)
						);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2b: Non-paginated requests have no injected limit", () => {
		it("getURI() does NOT contain any injected limit when pagination is disabled or absent", () => {
			/**
			 * **Validates: Requirements 3.2, 3.5**
			 * 
			 * For all configs with pagination disabled or absent (pagination: null,
			 * pagination.enabled: false, or no pagination key), getURI() must NOT
			 * contain any injected limit parameter and must match the URI constructed
			 * from parameters alone.
			 */
			fc.assert(
				fc.property(
					hostArb,
					pathArb,
					fc.constantFrom("limit", "take", "pageSize"),
					fc.oneof(
						fc.constant(null),           // pagination: null
						fc.constant({ enabled: false }), // pagination disabled
						fc.constant(undefined)       // no pagination key
					),
					fc.dictionary(
						safeParamKeyArb([]),
						paramValueArb,
						{ minKeys: 0, maxKeys: 3 }
					),
					(host, path, limitLabel, pagination, parameters) => {
						const config = { host, path, parameters };

						// Only add pagination key if it's not undefined
						if (pagination !== undefined) {
							config.pagination = pagination;
						}

						const apiRequest = new ApiRequest(config);
						const uri = apiRequest.getURI();

						// The URI must NOT contain any limit-like parameter that wasn't in the original parameters
						if (!Object.prototype.hasOwnProperty.call(parameters, limitLabel)) {
							expect(uri).not.toMatch(
								new RegExp(`[?&]${escapeRegExp(limitLabel)}=`)
							);
						}

						// All provided parameters must be present in the URI
						for (const [key, value] of Object.entries(parameters)) {
							expect(uri).toContain(`${key}=${encodeURIComponent(value)}`);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2c: All parameter keys retained alongside explicit limit", () => {
		it("getURI() contains ALL parameter keys when pagination enabled with explicit limit and other params", () => {
			/**
			 * **Validates: Requirements 3.3**
			 * 
			 * For all configs with pagination enabled AND parameters containing other
			 * keys (filters, sort, etc.) alongside an explicit limit, getURI() must
			 * contain ALL parameter keys in the query string.
			 */
			fc.assert(
				fc.property(
					hostArb,
					pathArb,
					limitLabelArb,
					defaultLimitArb,
					explicitLimitArb,
					fc.dictionary(
						safeParamKeyArb(["limit", "take", "pageSize"]),
						paramValueArb,
						{ minKeys: 1, maxKeys: 4 }
					),
					(host, path, limitLabel, defaultLimit, explicitLimit, otherParams) => {
						// Build parameters with explicit limit + other params
						const parameters = {
							...otherParams,
							[limitLabel]: explicitLimit
						};

						const config = {
							host,
							path,
							parameters,
							pagination: {
								enabled: true,
								defaultLimit,
								limitLabel
							}
						};

						const apiRequest = new ApiRequest(config);
						const uri = apiRequest.getURI();

						// ALL parameter keys must be present in the query string
						for (const key of Object.keys(parameters)) {
							expect(uri).toMatch(
								new RegExp(`[?&]${escapeRegExp(key)}=`)
							);
						}

						// The explicit limit value must be preserved
						const expectedLimitParam = `${limitLabel}=${explicitLimit}`;
						expect(uri).toMatch(
							new RegExp(`[?&]${escapeRegExp(expectedLimitParam)}(&|$)`)
						);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2d: Parameters round-trip correctly without pagination", () => {
		it("existing parameters round-trip correctly into the URI query string without pagination", () => {
			/**
			 * **Validates: Requirements 3.5**
			 * 
			 * For all configs without pagination, existing parameters must round-trip
			 * correctly into the URI query string.
			 */
			fc.assert(
				fc.property(
					hostArb,
					pathArb,
					fc.dictionary(
						safeParamKeyArb([]),
						paramValueArb,
						{ minKeys: 1, maxKeys: 5 }
					),
					(host, path, parameters) => {
						const config = {
							host,
							path,
							parameters
						};

						const apiRequest = new ApiRequest(config);
						const uri = apiRequest.getURI();

						// Verify the URI starts with the expected protocol://host/path
						expect(uri).toMatch(new RegExp(`^https://${escapeRegExp(host)}${escapeRegExp(path)}\\?`));

						// All parameters must be present with correct values
						for (const [key, value] of Object.entries(parameters)) {
							const expectedParam = `${key}=${encodeURIComponent(value)}`;
							expect(uri).toContain(expectedParam);
						}

						// Parse the query string and verify parameter count matches
						const queryString = uri.split("?")[1];
						const queryParams = queryString.split("&");
						expect(queryParams.length).toBe(Object.keys(parameters).length);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

});
