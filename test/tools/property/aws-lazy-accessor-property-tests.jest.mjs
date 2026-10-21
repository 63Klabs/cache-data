/**
 * Property tests for the lazy AWS accessors (child process per run).
 *
 * Purpose: for any sequence of accessor reads, check two properties from
 * design.md "Correctness properties":
 *
 * - Property 1, load isolation: nothing loads at import, and afterward exactly
 *   the service-client packages of the services read are loaded.
 * - Property 2, memo stability: every read returns a new outer object, and every
 *   read of a service returns the same `client` and `sdk` as its first read.
 *
 * Property 1 is new behavior and fails on the eager implementation; Property 2
 * holds today. Both are asserted on each generated sequence, in one run.
 *
 * Setup: each run executes the `load-sequence` scenario of
 * test/tools/fixtures/aws-classes-child.cjs in a fresh Node.js process, because
 * loaded packages can only be observed from an empty module cache.
 *
 * Generator: any order, with repeats, including the empty sequence. These
 * properties assert loading behavior, not acceptance by a predicate, so there is
 * no precondition to mirror and nothing is filtered. For that reason the
 * arbitrary is not registered in AUDITED_ARBITRARIES.
 *
 * Runs: 10, because every run spawns a child process
 * (.kiro/steering/test-execution-monitoring.md). endOnFailure skips shrinking, so
 * a failure can't set off an unbounded series of child processes. No `seed`
 * option: the global FC_SEED hook seeds this fc.assert, which generates the
 * sequences; the child only executes them.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (task 4.4)
 * Validates: Requirements 1.3, 1.4, 2.3, 3.2, 9.4, 9.9, 9.10
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { runChild, SERVICE_PACKAGES } from "../../helpers/aws-classes-child-runner.mjs";

const ACCESSORS = Object.keys(SERVICE_PACKAGES);
const PROPERTY_TEST_TIMEOUT_MS = 120000;

/** Read sequences over all four accessors: any order, repeats allowed, possibly empty. */
const readSequence = fc.array(fc.constantFrom(...ACCESSORS), { maxLength: 8 });

/**
 * The sorted, de-duplicated service-client packages for a sequence of reads.
 *
 * @param {Array<string>} reads - Accessor names
 * @returns {Array<string>} Expected loaded packages
 */
function expectedPackages(reads) {
	return [...new Set(reads.flatMap((name) => SERVICE_PACKAGES[name]))].sort();
}

describe("Lazy AWS accessors: properties", () => {

	it("Properties 1 and 2: load isolation and memo stability hold for any sequence of reads", () => {
		fc.assert(
			fc.property(readSequence, (reads) => {
				const run = runChild("load-sequence", { reads });
				expect(run.status).toBe(0);
				expect(run.result).not.toBeNull();
				const result = run.result;
				expect(result.entryLoaded).toBe(true);
				expect(result.readErrors).toEqual([]);

				// Property 1: load isolation (Req 1.3, 1.4)
				expect(result.atLoad).toEqual([]);
				expect(result.afterReads).toEqual(expectedPackages(reads));

				// Property 2: memo stability (Req 2.3, 3.2)
				const readServices = [...new Set(reads)].sort();
				expect(Object.keys(result.checks).sort()).toEqual(readServices);
				for (const name of readServices) {
					expect(result.checks[name]).toEqual({
						reads: reads.filter((read) => read === name).length,
						sameClient: true,
						sameSdk: true,
						freshLiteral: true
					});
				}
			}),
			{ numRuns: 10, endOnFailure: true }
		);
	}, PROPERTY_TEST_TIMEOUT_MS);
});
