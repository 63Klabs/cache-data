/**
 * SDK v2 guard tests (in-process).
 *
 * Purpose: verify that `AWS.dynamo`, `AWS.s3`, and `AWS.ssm` throw the SDK v2
 * guard error when they are read while `AWS.SDK_V3` is false, and that
 * `AWS.secrets` does not. This is new behavior: the eager implementation builds
 * every client at import, so reading an accessor never throws, and these tests
 * fail until the conversion.
 *
 * Setup: `AWS.SDK_V3` is replaced with a getter spy returning false before every
 * test. This file never builds a converted service: every read of one throws
 * under the spy, so the memo fields stay null and the tests don't depend on order.
 * The real old-Node path (process.versions.node redefined in a child process) is
 * covered by the `v2-guard` test in aws-lazy-loading-tests.jest.mjs.
 *
 * Teardown: jest.restoreAllMocks() after each test.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (task 4.1)
 * Validates: Requirements 6.1, 6.3
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { AWS } from "../../src/lib/tools/AWS.classes.js";

const SDK_V2_GUARD_MESSAGE = "AWS SDK v2 is no longer supported. Please upgrade to Node.js 18 or higher to use AWS SDK v3.";
const CONVERTED_ACCESSORS = ["dynamo", "s3", "ssm"];

/**
 * Read an accessor and return what it threw, or null when it didn't throw.
 *
 * @param {string} name - Accessor name on AWS
 * @returns {*} The thrown value, or null
 */
function errorFromRead(name) {
	try {
		return AWS[name] === undefined ? new Error(`AWS.${name} is undefined`) : null;
	} catch (error) {
		return error;
	}
}

describe("SDK v2 guard on converted accessors (new behavior)", () => {

	beforeEach(() => {
		jest.spyOn(AWS, "SDK_V3", "get").mockReturnValue(false);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it.each(CONVERTED_ACCESSORS)("AWS.%s throws the SDK v2 guard error on every read while SDK_V3 is false (Req 6.1)", (name) => {
		for (const error of [errorFromRead(name), errorFromRead(name)]) {
			expect(error).not.toBeNull();
			expect(error.name).toBe("Error");
			expect(error.message).toBe(SDK_V2_GUARD_MESSAGE);
		}
	});

	it("AWS.secrets does not throw while SDK_V3 is false (Req 6.3)", () => {
		expect(() => AWS.secrets).not.toThrow();
	});
});
