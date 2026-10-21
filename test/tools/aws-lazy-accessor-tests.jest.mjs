/**
 * AWS accessor contract tests (in-process).
 *
 * Purpose: lock the public contract of `AWS.dynamo`, `AWS.s3`, and `AWS.ssm`
 * before they are converted to lazy accessors. The first block is preservation
 * tests: they pass on the eager implementation and must keep passing, unmodified,
 * after the conversion. The last block, for the S3 region, is new behavior (task
 * 4.1): the eager implementation builds S3 without a region, so it fails wherever
 * AWS_REGION is unset, and it must pass after the conversion.
 *
 * Setup: imports AWS.classes.js directly. Jest gives each test file its own module
 * registry, so this file gets a fresh AWS class.
 *
 * Ordering: the getter-descriptor test runs first, because it checks each accessor
 * before its first read in this module instance.
 *
 * Teardown: jest.restoreAllMocks() after each test restores `client.send` spies
 * and getter spies.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (tasks 3.1 and 4.1)
 * Validates: Requirements 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 8.3
 *
 * Related tests:
 * - test/tools/aws-classes-tests.jest.mjs (existing shape checks, unmodified by this spec)
 * - test/tools/aws-lazy-loading-tests.jest.mjs (child-process loading tests)
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { AWS } from "../../src/lib/tools/AWS.classes.js";

/**
 * The contract of each converted accessor (Requirement 3).
 * `verbs` maps each helper verb to the constructor name of the command it sends.
 */
const CONTRACTS = {
	dynamo: {
		keys: ["client", "delete", "get", "put", "scan", "sdk", "update"],
		sdkKeys: ["DynamoDBClient", "DynamoDBDocumentClient", "GetCommand", "PutCommand"],
		verbs: {
			put: "PutCommand",
			get: "GetCommand",
			scan: "ScanCommand",
			delete: "DeleteCommand",
			update: "UpdateCommand"
		}
	},
	s3: {
		keys: ["client", "get", "put", "sdk"],
		sdkKeys: ["GetObjectCommand", "PutObjectCommand", "S3"],
		verbs: {
			put: "PutObjectCommand",
			get: "GetObjectCommand"
		}
	},
	ssm: {
		keys: ["client", "getByName", "getByPath", "sdk"],
		sdkKeys: ["GetParametersByPathCommand", "GetParametersCommand", "SSMClient"],
		verbs: {
			getByName: "GetParametersCommand",
			getByPath: "GetParametersByPathCommand"
		}
	}
};

const ACCESSORS = Object.keys(CONTRACTS);

/** [accessor, verb, command constructor name] for every verb, for it.each. */
const VERB_CASES = ACCESSORS.flatMap((name) =>
	Object.entries(CONTRACTS[name].verbs).map(([verb, command]) => [name, verb, command])
);

/** The AWS class's own property names, recorded before the conversion (design.md). */
const EXPECTED_STATIC_MEMBERS = [
	"INFO", "NODE_VER", "NODE_VER_ARRAY", "NODE_VER_MAJOR", "NODE_VER_MAJOR_MINOR",
	"NODE_VER_MINOR", "NODE_VER_PATCH", "REGION", "SDK_V2", "SDK_V3", "SDK_VER", "XRay",
	"dynamo", "length", "name", "nodeVersionArray", "prototype", "region", "s3", "secrets", "ssm"
];

/**
 * Assert that a property is an accessor with a getter and no data value.
 *
 * @param {string} name - Static property name on AWS
 * @returns {void}
 */
function expectStaticGetter(name) {
	const descriptor = Object.getOwnPropertyDescriptor(AWS, name);
	expect(descriptor).toBeDefined();
	expect(typeof descriptor.get).toBe("function");
	expect(Object.hasOwn(descriptor, "value")).toBe(false);
}

describe("AWS accessor contract (preservation)", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("getter form (Req 3.1)", () => {
		it("each accessor is a static getter before and after its first read", () => {
			for (const name of ACCESSORS) {
				expectStaticGetter(name);
				expect(AWS[name]).toBeDefined();
				expectStaticGetter(name);
			}
		});
	});

	describe.each(ACCESSORS)("AWS.%s", (name) => {
		const contract = CONTRACTS[name];

		it("returns a new object on every read, with the same client and sdk (Req 2.3, 3.2)", () => {
			const first = AWS[name];
			const second = AWS[name];
			expect(second).not.toBe(first);
			expect(second.client).toBe(first.client);
			expect(second.sdk).toBe(first.sdk);
		});

		it("has exactly the documented properties and sdk members (Req 3.3 to 3.5)", () => {
			const accessor = AWS[name];
			expect(Object.keys(accessor).sort()).toEqual(contract.keys);
			expect(Object.keys(accessor.sdk).sort()).toEqual(contract.sdkKeys);
		});

		it("keeps working when a verb is destructured and called after a later read (Req 3.7)", () => {
			const [verb, command] = Object.entries(contract.verbs)[0];
			const destructured = AWS[name][verb];
			const later = AWS[name];
			const sentinel = Promise.resolve({ verb });
			const send = jest.spyOn(later.client, "send").mockReturnValue(sentinel);
			const params = { marker: `${name}.${verb}.destructured` };

			expect(destructured(params)).toBe(sentinel);
			expect(send).toHaveBeenCalledTimes(1);
			expect(send.mock.calls[0][0].constructor.name).toBe(command);
			expect(send.mock.calls[0][0].input).toBe(params);
		});

		it("can be replaced with a getter spy and restored (Req 3.8)", () => {
			const mock = { client: {}, marker: `mock-${name}` };
			const spy = jest.spyOn(AWS, name, "get").mockReturnValue(mock);

			expect(AWS[name]).toBe(mock);
			expect(spy).toHaveBeenCalled();

			jest.restoreAllMocks();
			const real = AWS[name];
			expect(real).not.toBe(mock);
			expect(typeof real.client.send).toBe("function");
		});
	});

	describe("helper verbs (Req 3.6)", () => {
		it.each(VERB_CASES)("AWS.%s.%s sends a %s through the client and returns its promise", (name, verb, command) => {
			const accessor = AWS[name];
			const sentinel = Promise.resolve({ verb });
			const send = jest.spyOn(accessor.client, "send").mockReturnValue(sentinel);
			const params = { marker: `${name}.${verb}` };

			expect(accessor[verb](params)).toBe(sentinel);
			expect(send).toHaveBeenCalledTimes(1);
			const [sent] = send.mock.calls[0];
			expect(sent.constructor.name).toBe(command);
			expect(sent.input).toBe(params);
		});
	});

	describe("client construction parity (Req 4.1, 4.3)", () => {
		it("builds the DynamoDB client in AWS.REGION", async () => {
			await expect(AWS.dynamo.client.config.region()).resolves.toBe(AWS.REGION);
		});

		it("builds the SSM client in AWS.REGION", async () => {
			await expect(AWS.ssm.client.config.region()).resolves.toBe(AWS.REGION);
		});

		it("builds the DynamoDB document client without a translate configuration", () => {
			expect(AWS.dynamo.client.config.translateConfig).toBeUndefined();
		});

		it("keeps the aggregated S3 class, which supports method-style calls", () => {
			const { client, sdk } = AWS.s3;
			expect(client).toBeInstanceOf(sdk.S3);
			expect(typeof client.getObject).toBe("function");
		});
	});

	describe("public surface (Req 2.4, 8.3)", () => {
		it("adds no static member to the AWS class", () => {
			expect(Object.getOwnPropertyNames(AWS).sort()).toEqual(EXPECTED_STATIC_MEMBERS);
		});
	});
});

describe("S3 region (new behavior, task 4.1)", () => {
	// The eager implementation builds S3 without a region, so the SDK falls back to
	// AWS_REGION and then the shared config file. Where AWS_REGION is unset, as in
	// CI, that rejects or resolves some other region, and this test fails.
	it("builds the S3 client in AWS.REGION (Req 4.2)", async () => {
		await expect(AWS.s3.client.config.region()).resolves.toBe(AWS.REGION);
	});
});
