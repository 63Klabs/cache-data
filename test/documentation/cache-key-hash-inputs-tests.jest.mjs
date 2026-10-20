/**
 * Documentation validation tests for the README "Cache Key Generation" section.
 *
 * The corrected README (spec 1-4-0-cache-key-generation-docs, task 7.1) states that the
 * full `cachePolicy` object — including behavioral fields such as
 * `defaultExpirationExtensionOnErrorInSeconds` — participates in the `id_hash`. These tests
 * keep that documented claim honest against the implementation: if a future change stopped
 * hashing a `cachePolicy` behavioral field, the differing-field assertion below would fail,
 * surfacing the drift between the docs and the code.
 *
 * The hash-input object is the `{ data, connection, cachePolicy }` wrapper that
 * `CacheableDataAccess.getData` passes to `Cache.generateIdHash` (see
 * `src/lib/dao-cache.js`). Both hashes are computed in the SAME process after a single
 * `Cache.init()`, so they share the same resolved salt and algorithm — exactly what makes the
 * single-field assertion valid without subprocess isolation.
 *
 * Validates: Requirements 10.1
 */

import { describe, it, expect } from "@jest/globals";
import { randomBytes } from "crypto";
import { Cache } from "../../src/lib/dao-cache.js";

// Initialize Cache once for these in-process hash comparisons. A random secureDataKey
// follows the init pattern used by the other cache tests. Cache.init is once-only global
// state; both hashes below are computed under this same init, so they share one salt.
const dataKey = Buffer.from(randomBytes(32).toString("hex"), "hex");

Cache.init({
	dynamoDbTable: "test-table-cache-key-hash-inputs",
	s3Bucket: "test-bucket-cache-key-hash-inputs",
	secureDataKey: dataKey
});

/**
 * Build a hash-input object matching the `{ data, connection, cachePolicy }` wrapper that
 * `CacheableDataAccess.getData` hands to `Cache.generateIdHash`.
 *
 * @param {Object} [overrides] - Field overrides merged onto the base cachePolicy
 * @param {number} [overrides.defaultExpirationExtensionOnErrorInSeconds] - Behavioral field under test
 * @returns {{data: Object, connection: Object, cachePolicy: Object}} The hash-input object
 */
function buildHashInput({ defaultExpirationExtensionOnErrorInSeconds = 60 } = {}) {
	return {
		data: { resource: "users", id: "123" },
		connection: {
			host: "api.example.com",
			path: "/users",
			headers: { accept: "application/json" }
		},
		cachePolicy: {
			hostId: "api.example.com",
			pathId: "/users",
			profile: "default",
			overrideOriginHeaderExpiration: false,
			defaultExpirationInSeconds: 300,
			defaultExpirationExtensionOnErrorInSeconds,
			expirationIsOnInterval: false,
			headersToRetain: "",
			encrypt: false
		}
	};
}

describe("Documentation: Cache Key Generation hash inputs", () => {

	describe("cachePolicy behavioral fields participate in the id_hash", () => {

		it("produces DIFFERENT hashes when only cachePolicy.defaultExpirationExtensionOnErrorInSeconds differs", () => {
			// The README documents that this purely operational cachePolicy field participates in
			// the hash. Two inputs identical except for this field must hash differently.
			const inputA = buildHashInput({ defaultExpirationExtensionOnErrorInSeconds: 60 });
			const inputB = buildHashInput({ defaultExpirationExtensionOnErrorInSeconds: 120 });

			const hashA = Cache.generateIdHash(inputA);
			const hashB = Cache.generateIdHash(inputB);

			expect(hashA).not.toBe(hashB);
		});

		it("produces IDENTICAL hashes for two structurally identical inputs (positive control)", () => {
			// Sanity check: the differing-field assertion above is not trivially always-true.
			// Identical inputs under the same init (same salt/algorithm) must hash identically.
			const hashA = Cache.generateIdHash(buildHashInput({ defaultExpirationExtensionOnErrorInSeconds: 60 }));
			const hashB = Cache.generateIdHash(buildHashInput({ defaultExpirationExtensionOnErrorInSeconds: 60 }));

			expect(hashA).toBe(hashB);
		});
	});
});
