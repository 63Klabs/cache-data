/**
 * Test: Ingress secret readers (IngressCurrentSecretReader, IngressPreviousSecretReader)
 *
 * Purpose: Verify the private readers that keep the AWSCURRENT and AWSPREVIOUS versions of the
 * ingress secret warm in CachedParameterSecrets: registry keys, the version stage on both
 * transports, the "no previous version" handling, the failure-episode logging rule, the 30-second
 * wait after a failed read, the stuck-refreshing guard, and the unchanged base-class hook default.
 *
 * Setup:
 * - SDK transport: ExtensionAvailability.setOverride(false) and a spy on the AWS.secrets getter.
 * - Extension transport: ExtensionAvailability.setOverride(true) and http.request mocked with
 *   test/helpers/extension-mock.mjs.
 * - Time: Date.now is spied on and advanced by hand for the 30-second wait and the refresh interval.
 * - Each test uses a secret id unique to it because CachedParameterSecrets has no reset.
 *
 * Teardown: mocks are restored, ExtensionAvailability is reset, and AWS_SESSION_TOKEN is restored.
 * No real AWS call is made and no credential is read.
 *
 * Related Tests:
 * - test/request/ingress/unit/cached-secret-non2xx-hook-tests.jest.mjs
 *
 * Requirements: 4.1 to 4.11, 15.1
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import http from "http";
import { mockExtension } from "../../../helpers/extension-mock.mjs";

const tools = await import("../../../../src/lib/tools/index.js");
const { AWS, DebugAndLog, CachedSecret, CachedParameterSecrets } = tools.default;
const ExtensionAvailability = (await import("../../../../src/lib/utils/ExtensionAvailability.class.js")).default;
const readersModule = (await import("../../../../src/lib/utils/IngressSecretReaders.classes.js")).default;
const {
	IngressSecretReader,
	IngressCurrentSecretReader,
	IngressPreviousSecretReader,
	NO_PREVIOUS_VERSION,
	PREVIOUS_MISSING_STATUS
} = readersModule;

const ORIGINAL_TOKEN = process.env.AWS_SESSION_TOKEN;
const START_TIME = 1700000000000;
const WAIT_MS = 30000;

let idCounter = 0;
let now = START_TIME;

/**
 * @param {string} label - Short label for the test
 * @returns {string} A secret id used by one test only. It contains "/" so that encoding is visible.
 */
function nextId(label) {
	idCounter += 1;
	return `ingress/readers/${label}-${idCounter}`;
}

/**
 * Uses the SDK transport and replaces AWS.secrets.get with a mock.
 *
 * @param {function(object): Promise<object>} [impl] - Implementation of AWS.secrets.get
 * @returns {{ get: jest.Mock, getter: jest.SpyInstance }} The mock and the getter spy
 */
function useSdk(impl) {
	ExtensionAvailability.setOverride(false);
	const get = jest.fn(impl || (async () => ({ SecretString: "sdk-value" })));
	const getter = jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get, sdk: {} });
	return { get, getter };
}

/**
 * Uses the Lambda extension transport.
 *
 * @returns {void}
 */
function useExtension() {
	ExtensionAvailability.setOverride(true);
}

/**
 * @param {string} name - Error name
 * @param {string} [message] - Error message
 * @returns {Error} An error with the given name
 */
function namedError(name, message = "mock error") {
	return Object.assign(new Error(message), { name });
}

/**
 * @param {jest.SpyInstance} spy - Spy on a DebugAndLog method
 * @param {string} prefix - Start of the message
 * @returns {Array<string>} Messages written by the spy that start with the prefix
 */
function linesWithPrefix(spy, prefix) {
	return spy.mock.calls
		.map((call) => call[0])
		.filter((message) => typeof message === "string" && message.startsWith(prefix));
}

/**
 * Makes Date.now return the controlled clock.
 *
 * @returns {void}
 */
function freezeTime() {
	now = START_TIME;
	jest.spyOn(Date, "now").mockImplementation(() => now);
}

describe("Ingress secret readers", () => {

	let debugSpy;
	let warnSpy;
	let errorSpy;

	beforeEach(() => {
		ExtensionAvailability.reset();
		freezeTime();
		debugSpy = jest.spyOn(DebugAndLog, "debug").mockImplementation(() => {});
		warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		ExtensionAvailability.reset();
		if (ORIGINAL_TOKEN === undefined) {
			delete process.env.AWS_SESSION_TOKEN;
		} else {
			process.env.AWS_SESSION_TOKEN = ORIGINAL_TOKEN;
		}
	});

	describe("registry keys (R4.1, R4.3)", () => {

		it("registers each reader under <id>#<STAGE>, which differs from the id and from the other reader", () => {
			const id = nextId("keys");
			const current = new IngressCurrentSecretReader(id);
			const previous = new IngressPreviousSecretReader(id);

			expect(current.getName()).toBe(`${id}#AWSCURRENT`);
			expect(previous.getName()).toBe(`${id}#AWSPREVIOUS`);
			expect(current.getName()).not.toBe(id);
			expect(previous.getName()).not.toBe(id);
			expect(current.getName()).not.toBe(previous.getName());

			expect(CachedParameterSecrets.get(`${id}#AWSCURRENT`)).toBe(current);
			expect(CachedParameterSecrets.get(`${id}#AWSPREVIOUS`)).toBe(previous);
			expect(CachedParameterSecrets.get(id)).toBeUndefined();
		});

		it("does not hide an application CachedSecret for the same id, whichever is created first", () => {
			const idReadersFirst = nextId("keys-readers-first");
			const readerA = new IngressCurrentSecretReader(idReadersFirst);
			const readerB = new IngressPreviousSecretReader(idReadersFirst);
			const appFirst = new CachedSecret(idReadersFirst);

			expect(CachedParameterSecrets.get(idReadersFirst)).toBe(appFirst);
			expect(CachedParameterSecrets.get(`${idReadersFirst}#AWSCURRENT`)).toBe(readerA);
			expect(CachedParameterSecrets.get(`${idReadersFirst}#AWSPREVIOUS`)).toBe(readerB);

			const idAppFirst = nextId("keys-app-first");
			const app = new CachedSecret(idAppFirst);
			const current = new IngressCurrentSecretReader(idAppFirst);
			const previous = new IngressPreviousSecretReader(idAppFirst);

			expect(CachedParameterSecrets.get(idAppFirst)).toBe(app);
			expect(CachedParameterSecrets.get(`${idAppFirst}#AWSCURRENT`)).toBe(current);
			expect(CachedParameterSecrets.get(`${idAppFirst}#AWSPREVIOUS`)).toBe(previous);
		});

		it("builds the name tag from the id, the class and the stage, with no value", () => {
			const id = nextId("name-tag");
			expect(new IngressCurrentSecretReader(id).getNameTag()).toBe(`${id} [IngressCurrentSecretReader AWSCURRENT]`);
			expect(new IngressPreviousSecretReader(id).getNameTag()).toBe(`${id} [IngressPreviousSecretReader AWSPREVIOUS]`);
		});

		it("is a CachedSecret subclass with the stage set on the thin subclasses only", () => {
			const id = nextId("class-shape");
			expect(new IngressCurrentSecretReader(id)).toBeInstanceOf(CachedSecret);
			expect(new IngressPreviousSecretReader(id)).toBeInstanceOf(CachedSecret);
			expect(IngressSecretReader.STAGE).toBeNull();
			expect(IngressCurrentSecretReader.STAGE).toBe("AWSCURRENT");
			expect(IngressPreviousSecretReader.STAGE).toBe("AWSPREVIOUS");
		});

	});

	describe("version stage on the SDK transport (R4.4, R4.9)", () => {

		it("current reader calls AWS.secrets.get with { SecretId, VersionStage: AWSCURRENT }", async () => {
			const id = nextId("sdk-current");
			const { get } = useSdk(async () => ({ SecretString: "current-value" }));
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();

			expect(get).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSCURRENT" });
			expect(reader.cache.status).toBe(1);
			expect(reader.secretValue()).toBe("current-value");
			expect(reader.hasSettled()).toBe(true);
		});

		it("previous reader calls AWS.secrets.get with { SecretId, VersionStage: AWSPREVIOUS }", async () => {
			const id = nextId("sdk-previous");
			const { get } = useSdk(async () => ({ SecretString: "previous-value" }));
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();

			expect(get).toHaveBeenCalledTimes(1);
			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSPREVIOUS" });
			expect(reader.cache.status).toBe(1);
			expect(reader.secretValue()).toBe("previous-value");
		});

		it("does not use the extension when the SDK transport is selected", async () => {
			const id = nextId("sdk-no-http");
			useSdk();
			const requestSpy = jest.spyOn(http, "request").mockImplementation(() => {
				throw new Error("http.request must not be called on the SDK transport");
			});

			await new IngressCurrentSecretReader(id).refresh();
			await new IngressPreviousSecretReader(id).refresh();

			expect(requestSpy).not.toHaveBeenCalled();
		});

	});

	describe("version stage on the extension transport (R4.4, R4.9)", () => {

		it("current reader requests versionStage=AWSCURRENT with the encoded id", async () => {
			const id = nextId("ext-current");
			useExtension();
			const requestSpy = mockExtension.secretSuccess(jest, http, "ext-current-value");
			const sdk = jest.spyOn(AWS, "secrets", "get");
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();

			expect(requestSpy).toHaveBeenCalledTimes(1);
			const path = requestSpy.mock.calls[0][0].path;
			expect(path).toContain("versionStage=AWSCURRENT");
			expect(path).not.toContain("AWSPREVIOUS");
			expect(path).toContain(`secretId=${encodeURIComponent(id)}`);
			expect(path).toContain("%2F");
			expect(path).toBe(`/secretsmanager/get?secretId=${encodeURIComponent(id)}&versionStage=AWSCURRENT&withDecryption=true`);
			expect(reader.secretValue()).toBe("ext-current-value");
			expect(sdk).not.toHaveBeenCalled();
		});

		it("previous reader requests versionStage=AWSPREVIOUS with the encoded id", async () => {
			const id = nextId("ext-previous");
			useExtension();
			const requestSpy = mockExtension.secretSuccess(jest, http, "ext-previous-value");
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();

			expect(requestSpy).toHaveBeenCalledTimes(1);
			const path = requestSpy.mock.calls[0][0].path;
			expect(path).toContain("versionStage=AWSPREVIOUS");
			expect(path).not.toContain("AWSCURRENT");
			expect(path).toContain(`secretId=${encodeURIComponent(id)}`);
			expect(reader.secretValue()).toBe("ext-previous-value");
		});

		it("getPath() encodes ids that contain reserved characters", () => {
			const id = "ingress/readers/with space&equals=1?x#y";
			expect(new IngressCurrentSecretReader(id).getPath())
				.toBe(`/secretsmanager/get?secretId=${encodeURIComponent(id)}&versionStage=AWSCURRENT&withDecryption=true`);
			expect(new IngressPreviousSecretReader(id).getPath())
				.toBe(`/secretsmanager/get?secretId=${encodeURIComponent(id)}&versionStage=AWSPREVIOUS&withDecryption=true`);
		});

	});

	describe("no previous version (R4.5, R4.10, D16)", () => {

		it("PREVIOUS_MISSING_STATUS is true for every status outside 200-299 and false inside", () => {
			for (const status of [100, 199, 300, 301, 400, 403, 404, 429, 500, 503]) {
				expect(PREVIOUS_MISSING_STATUS(status)).toBe(true);
			}
			for (const status of [200, 201, 204, 250, 299]) {
				expect(PREVIOUS_MISSING_STATUS(status)).toBe(false);
			}
			for (const notAStatus of [undefined, null, "404", NaN, {}]) {
				expect(PREVIOUS_MISSING_STATUS(notAStatus)).toBe(false);
			}
		});

		it("NO_PREVIOUS_VERSION is frozen and has no SecretString", () => {
			expect(Object.isFrozen(NO_PREVIOUS_VERSION)).toBe(true);
			expect("SecretString" in NO_PREVIOUS_VERSION).toBe(false);
			expect(IngressPreviousSecretReader.NO_PREVIOUS_VERSION).toBe(NO_PREVIOUS_VERSION);
		});

		it("SDK ResourceNotFoundException becomes status 1 with no value and a debug line only", async () => {
			const id = nextId("sdk-not-found");
			useSdk(async () => { throw namedError("ResourceNotFoundException", "can't find AWSPREVIOUS"); });
			const reader = new IngressPreviousSecretReader(id);

			const status = await reader.refresh();

			expect(status).toBe(1);
			expect(reader.cache.status).toBe(1);
			expect(reader.cache.status).not.toBeLessThan(0);
			expect(reader.value).toBe(NO_PREVIOUS_VERSION);
			expect(reader.isValid()).toBe(false);
			expect(reader.secretValue()).toBeNull();
			expect(reader.hasSettled()).toBe(true);
			expect(linesWithPrefix(debugSpy, "IngressPreviousSecretReader: no previous version")).toHaveLength(1);
			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		});

		it.each([404, 400, 403, 500])("extension HTTP %i becomes status 1 with no value and a debug line only", async (statusCode) => {
			const id = nextId(`ext-non2xx-${statusCode}`);
			useExtension();
			mockExtension.nonTwoXxWithJson(jest, http, statusCode);
			const reader = new IngressPreviousSecretReader(id);

			const status = await reader.refresh();

			expect(status).toBe(1);
			expect(reader.cache.status).toBe(1);
			expect(reader.isValid()).toBe(false);
			expect(reader.secretValue()).toBeNull();
			const debugLines = linesWithPrefix(debugSpy, "IngressPreviousSecretReader: HTTP");
			expect(debugLines).toHaveLength(1);
			expect(debugLines[0]).toContain(String(statusCode));
			expect(debugLines[0]).toContain("treating as no previous version");
			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		});

		it("is not read again before the refresh interval has passed", async () => {
			const id = nextId("no-reread");
			const { get } = useSdk(async () => { throw namedError("ResourceNotFoundException"); });
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();
			expect(get).toHaveBeenCalledTimes(1);
			expect(reader.needsRefresh()).toBe(false);

			now += 299000;
			expect(reader.needsRefresh()).toBe(false);
			await reader.prime();
			expect(get).toHaveBeenCalledTimes(1);

			now += 2000;
			expect(reader.needsRefresh()).toBe(true);
			await reader.prime();
			expect(get).toHaveBeenCalledTimes(2);
		});

		it("is read again at once on a forced refresh", async () => {
			const id = nextId("forced-after-none");
			const { get } = useSdk(async () => { throw namedError("ResourceNotFoundException"); });
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();
			await reader.refresh();

			expect(get).toHaveBeenCalledTimes(2);
			expect(reader.cache.status).toBe(1);
		});

		it("replaces an earlier previous value when the label is later removed", async () => {
			const id = nextId("label-removed");
			let missing = false;
			useSdk(async () => {
				if (missing) { throw namedError("ResourceNotFoundException"); }
				return { SecretString: "old-previous" };
			});
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();
			expect(reader.secretValue()).toBe("old-previous");

			missing = true;
			await reader.refresh();
			expect(reader.secretValue()).toBeNull();
			expect(reader.cache.status).toBe(1);
		});

		it("current reader treats ResourceNotFoundException as a failed read, not as a missing version", async () => {
			const id = nextId("current-not-found");
			useSdk(async () => { throw namedError("ResourceNotFoundException"); });
			const reader = new IngressCurrentSecretReader(id);

			const status = await reader.refresh();

			expect(status).toBe(-1);
			expect(reader.cache.status).toBe(-1);
			expect(reader.secretValue()).toBeNull();
			expect(linesWithPrefix(errorSpy, "IngressCurrentSecretReader:")).toHaveLength(1);
		});

	});

	describe("other failures of the previous reader (R4.6)", () => {

		it("SDK errors other than ResourceNotFoundException are failed reads with one warning per episode", async () => {
			const id = nextId("prev-sdk-fail");
			let behavior = "fail";
			const { get } = useSdk(async () => {
				if (behavior === "fail") { throw namedError("AccessDeniedException", "denied"); }
				return { SecretString: "previous-value" };
			});
			const reader = new IngressPreviousSecretReader(id);

			expect(await reader.refresh()).toBe(-1);
			expect(await reader.refresh()).toBe(-1);
			expect(await reader.refresh()).toBe(-1);

			expect(get).toHaveBeenCalledTimes(3);
			expect(reader.cache.status).toBe(-1);
			expect(reader.secretValue()).toBeNull();
			expect(linesWithPrefix(warnSpy, "IngressPreviousSecretReader:")).toHaveLength(1);
			expect(errorSpy).not.toHaveBeenCalled();

			behavior = "ok";
			expect(await reader.refresh()).toBe(1);
			expect(reader.secretValue()).toBe("previous-value");
			expect(linesWithPrefix(warnSpy, "IngressPreviousSecretReader:")).toHaveLength(1);

			behavior = "fail";
			await reader.refresh();
			await reader.refresh();
			expect(linesWithPrefix(warnSpy, "IngressPreviousSecretReader:")).toHaveLength(2);
		});

		it("the warning names the secret id and the stage", async () => {
			const id = nextId("prev-warning-text");
			useSdk(async () => { throw new Error("timeout"); });

			await new IngressPreviousSecretReader(id).refresh();

			const lines = linesWithPrefix(warnSpy, "IngressPreviousSecretReader:");
			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain(id);
			expect(lines[0]).toContain("AWSPREVIOUS");
		});

		it("an unparseable extension answer is a failed read with one warning per episode", async () => {
			const id = nextId("prev-ext-parse");
			useExtension();
			mockExtension.malformedBody(jest, http);
			const reader = new IngressPreviousSecretReader(id);

			expect(await reader.refresh()).toBe(-1);
			expect(await reader.refresh()).toBe(-1);

			expect(reader.cache.status).toBe(-1);
			expect(reader.secretValue()).toBeNull();
			expect(linesWithPrefix(warnSpy, "IngressPreviousSecretReader:")).toHaveLength(1);
		});

	});

	describe("failures of the current reader (R4.7)", () => {

		it("SDK failure writes one DebugAndLog.error per episode and no other error", async () => {
			const id = nextId("cur-sdk-fail");
			let behavior = "fail";
			useSdk(async () => {
				if (behavior === "fail") { throw new Error("service unavailable"); }
				return { SecretString: "current-value" };
			});
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			await reader.refresh();
			await reader.refresh();

			// Only DebugAndLog.error is counted. The base class also writes warning lines.
			expect(errorSpy).toHaveBeenCalledTimes(1);
			const lines = linesWithPrefix(errorSpy, "IngressCurrentSecretReader:");
			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain(id);
			expect(lines[0]).toContain("AWSCURRENT");

			behavior = "ok";
			await reader.refresh();
			expect(reader.cache.status).toBe(1);
			expect(errorSpy).toHaveBeenCalledTimes(1);

			behavior = "fail";
			await reader.refresh();
			await reader.refresh();
			expect(errorSpy).toHaveBeenCalledTimes(2);
		});

		it("extension non-2xx writes one reader error per episode", async () => {
			const id = nextId("cur-ext-403");
			useExtension();
			mockExtension.nonTwoXxWithJson(jest, http, 403);
			const reader = new IngressCurrentSecretReader(id);

			expect(await reader.refresh()).toBe(-1);
			expect(await reader.refresh()).toBe(-1);

			expect(reader.cache.status).toBe(-1);
			expect(linesWithPrefix(errorSpy, "IngressCurrentSecretReader:")).toHaveLength(1);
		});

		it("keeps the last good value after a failed refresh", async () => {
			const id = nextId("cur-keeps-value");
			let fail = false;
			useSdk(async () => {
				if (fail) { throw new Error("service unavailable"); }
				return { SecretString: "good-value" };
			});
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			expect(reader.secretValue()).toBe("good-value");

			fail = true;
			expect(await reader.refresh()).toBe(-1);

			expect(reader.cache.status).toBe(-1);
			expect(reader.isValid()).toBe(true);
			expect(reader.secretValue()).toBe("good-value");
		});

		it("keeps the last good value of the previous reader after a failed refresh", async () => {
			const id = nextId("prev-keeps-value");
			let fail = false;
			useSdk(async () => {
				if (fail) { throw namedError("InternalServiceError"); }
				return { SecretString: "good-previous" };
			});
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();
			fail = true;
			await reader.refresh();

			expect(reader.cache.status).toBe(-1);
			expect(reader.secretValue()).toBe("good-previous");
		});

		it("secretValue() is null before the first read and hasSettled() is false", () => {
			const reader = new IngressCurrentSecretReader(nextId("never-read"));
			expect(reader.secretValue()).toBeNull();
			expect(reader.hasSettled()).toBe(false);
			expect(reader.isRefreshing()).toBe(false);
		});

	});

	describe("30-second wait after a failed read (R4.11)", () => {

		it("needsRefresh() is true before any failure", () => {
			const reader = new IngressCurrentSecretReader(nextId("wait-before"));
			expect(reader.needsRefresh()).toBe(true);
		});

		it("needsRefresh() stays false for 30 seconds after a failure, then becomes true", async () => {
			const id = nextId("wait-30s");
			const { get } = useSdk(async () => { throw new Error("service unavailable"); });
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			expect(reader.cache.status).toBe(-1);
			expect(reader.needsRefresh()).toBe(false);

			now += WAIT_MS - 1;
			expect(reader.needsRefresh()).toBe(false);

			now += 1;
			expect(reader.needsRefresh()).toBe(true);
			expect(get).toHaveBeenCalledTimes(1);
		});

		it("prime() inside the wait does not start a read; after the wait it does", async () => {
			const id = nextId("wait-prime");
			const { get } = useSdk(async () => { throw new Error("service unavailable"); });
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();
			expect(get).toHaveBeenCalledTimes(1);

			now += 10000;
			await reader.prime();
			expect(get).toHaveBeenCalledTimes(1);

			now += WAIT_MS;
			await reader.prime();
			expect(get).toHaveBeenCalledTimes(2);
		});

		it("each failure restarts the wait", async () => {
			const id = nextId("wait-restart");
			const { get } = useSdk(async () => { throw new Error("service unavailable"); });
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			now += WAIT_MS;
			expect(reader.needsRefresh()).toBe(true);
			await reader.refresh();

			expect(get).toHaveBeenCalledTimes(2);
			expect(reader.needsRefresh()).toBe(false);
			now += WAIT_MS - 1;
			expect(reader.needsRefresh()).toBe(false);
			now += 1;
			expect(reader.needsRefresh()).toBe(true);
		});

		it("applies on the extension transport too", async () => {
			const id = nextId("wait-ext");
			useExtension();
			const requestSpy = mockExtension.nonTwoXxWithJson(jest, http, 500);
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			const callsAfterFirst = requestSpy.mock.calls.length;
			expect(callsAfterFirst).toBeGreaterThan(0);

			now += 5000;
			await reader.prime();
			expect(requestSpy.mock.calls.length).toBe(callsAfterFirst);
		});

		it("a successful read ends the wait", async () => {
			const id = nextId("wait-success");
			let fail = true;
			useSdk(async () => {
				if (fail) { throw new Error("service unavailable"); }
				return { SecretString: "back" };
			});
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			expect(reader.needsRefresh()).toBe(false);

			fail = false;
			expect(await reader.refresh()).toBe(1);
			expect(reader.cache.status).toBe(1);
			expect(reader.needsRefresh()).toBe(false);

			now += 301000;
			expect(reader.needsRefresh()).toBe(true);
		});

	});

	describe("forced refresh is not blocked by the wait (R4.11, R6)", () => {

		it("refresh() inside the 30 seconds starts a read", async () => {
			const id = nextId("forced-refresh");
			let fail = true;
			const { get } = useSdk(async () => {
				if (fail) { throw new Error("service unavailable"); }
				return { SecretString: "recovered" };
			});
			const reader = new IngressCurrentSecretReader(id);

			await reader.refresh();
			expect(reader.needsRefresh()).toBe(false);

			now += 1000;
			fail = false;
			const status = await reader.refresh();

			expect(get).toHaveBeenCalledTimes(2);
			expect(status).toBe(1);
			expect(reader.secretValue()).toBe("recovered");
		});

		it("refresh() while a read is running does not start a second read", async () => {
			const id = nextId("running-refresh");
			let release;
			const gate = new Promise((resolve) => { release = resolve; });
			const { get } = useSdk(async () => {
				await gate;
				return { SecretString: "slow" };
			});
			const reader = new IngressCurrentSecretReader(id);

			const first = reader.refresh();
			expect(reader.isRefreshing()).toBe(true);
			expect(reader.needsRefresh()).toBe(false);
			const second = reader.refresh();
			release();
			await Promise.all([first, second]);

			expect(get).toHaveBeenCalledTimes(1);
			expect(reader.cache.status).toBe(1);
		});

	});

	describe("never stuck refreshing (R4.11)", () => {

		it("a refresh that ends with cache.status 0 is set to -1", async () => {
			const id = nextId("status-zero");
			useSdk();
			const reader = new IngressCurrentSecretReader(id);
			// The base refresh() catches an exception from the transport and resolves -1
			// without changing cache.status, which would leave it at 0.
			jest.spyOn(reader, "_requestFromSdk").mockRejectedValue(new Error("exploded"));

			const status = await reader.refresh();

			expect(status).toBe(-1);
			expect(reader.cache.status).toBe(-1);
			expect(reader.isRefreshing()).toBe(false);
			expect(reader.hasSettled()).toBe(true);
			expect(linesWithPrefix(errorSpy, "IngressCurrentSecretReader:")).toHaveLength(1);
		});

		it("a reader reset from status 0 follows the 30-second wait and can be read again", async () => {
			const id = nextId("status-zero-wait");
			useSdk();
			const reader = new IngressPreviousSecretReader(id);
			const requestSpy = jest.spyOn(reader, "_requestFromSdk").mockRejectedValue(new Error("exploded"));

			await reader.refresh();
			expect(reader.needsRefresh()).toBe(false);

			now += WAIT_MS;
			expect(reader.needsRefresh()).toBe(true);

			requestSpy.mockResolvedValue({ ok: true, value: { SecretString: "fine" }, reason: null });
			expect(await reader.prime()).toBe(1);
			expect(reader.secretValue()).toBe("fine");
		});

	});

	describe("base-class hook default (R4.2)", () => {

		it("CachedSecret still writes the existing non-2xx warning through _logNon2xxResponse", async () => {
			const id = nextId("hook-default");
			useExtension();
			mockExtension.nonTwoXxWithJson(jest, http, 404);
			const secret = new CachedSecret(id);

			const result = await secret._requestSecretsFromLambdaExtension();

			expect(result).toEqual({ ok: false, value: null, reason: "non-2xx" });
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0]).toEqual([
				`CachedParameterSecret http: Non-2xx 404 for /secretsmanager/get?secretId=${encodeURIComponent(id)}&withDecryption=true`
			]);
		});

		it("the previous reader overrides the hook, so the same event is debug level", async () => {
			const id = nextId("hook-override");
			useExtension();
			mockExtension.nonTwoXxWithJson(jest, http, 404);
			const reader = new IngressPreviousSecretReader(id);

			await reader._requestSecretsFromLambdaExtension();

			expect(warnSpy).not.toHaveBeenCalled();
			expect(linesWithPrefix(debugSpy, "IngressPreviousSecretReader: HTTP 404")).toHaveLength(1);
		});

	});

	describe("no secret value or header value in any log line (R4.8)", () => {

		const SECRET_VALUE = "s3cr3t-VALUE-0042-do-not-log";
		const TOKEN_VALUE = "session-TOKEN-0042-do-not-log";

		/**
		 * @returns {Array<jest.SpyInstance>} Spies on every DebugAndLog writer, silenced
		 */
		function spyOnAllWriters() {
			return ["debug", "diag", "msg", "info", "log", "warn", "error"]
				.map((method) => jest.spyOn(DebugAndLog, method).mockImplementation(() => {}));
		}

		/**
		 * @param {Array<jest.SpyInstance>} spies - Spies from spyOnAllWriters()
		 * @returns {string} Every argument of every call, as text
		 */
		function everythingLogged(spies) {
			return spies
				.flatMap((spy) => spy.mock.calls)
				.map((args) => args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg) + String(arg?.stack ?? ""))).join(" "))
				.join("\n");
		}

		it("SDK success, failure and no-previous-version paths log neither the value nor an error carrying it", async () => {
			const id = nextId("no-leak-sdk");
			const spies = spyOnAllWriters();
			let behavior = "ok";
			useSdk(async () => {
				if (behavior === "ok") { return { SecretString: SECRET_VALUE }; }
				if (behavior === "missing") { throw namedError("ResourceNotFoundException"); }
				throw new Error("service unavailable");
			});
			const current = new IngressCurrentSecretReader(id);
			const previous = new IngressPreviousSecretReader(id);

			await current.prime();
			await previous.prime();
			expect(current.secretValue()).toBe(SECRET_VALUE);

			behavior = "fail";
			await current.refresh();
			await previous.refresh();
			behavior = "missing";
			await previous.refresh();

			const logged = everythingLogged(spies);
			expect(logged).not.toContain(SECRET_VALUE);
			expect(logged).toContain(id);
		});

		it("extension paths log neither the value nor the session token header", async () => {
			const id = nextId("no-leak-ext");
			process.env.AWS_SESSION_TOKEN = TOKEN_VALUE;
			const spies = spyOnAllWriters();
			useExtension();
			mockExtension.secretSuccess(jest, http, SECRET_VALUE);
			const current = new IngressCurrentSecretReader(id);
			await current.prime();
			expect(current.secretValue()).toBe(SECRET_VALUE);

			jest.restoreAllMocks();
			const spies2 = spyOnAllWriters();
			freezeTime();
			mockExtension.nonTwoXxWithJson(jest, http, 404);
			await new IngressPreviousSecretReader(id).prime();

			mockExtension.malformedBody(jest, http);
			await new IngressPreviousSecretReader(nextId("no-leak-ext-parse")).prime();

			const logged = everythingLogged([...spies, ...spies2]);
			expect(logged).not.toContain(SECRET_VALUE);
			expect(logged).not.toContain(TOKEN_VALUE);
		});

	});

	describe("transport selection (R4.9)", () => {

		it("uses the extension and never AWS.secrets when the extension is available", async () => {
			const id = nextId("transport-ext");
			useExtension();
			const requestSpy = mockExtension.secretSuccess(jest, http, "value");
			const getter = jest.spyOn(AWS, "secrets", "get");

			await new IngressCurrentSecretReader(id).refresh();
			await new IngressPreviousSecretReader(id).refresh();

			expect(requestSpy).toHaveBeenCalledTimes(2);
			expect(getter).not.toHaveBeenCalled();
		});

		it("falls back to AWS.secrets.get when the extension refuses the connection", async () => {
			const id = nextId("transport-fallback");
			process.env.AWS_SESSION_TOKEN = "test-token";
			ExtensionAvailability.reset();
			mockExtension.connectionRefused(jest, http);
			const get = jest.fn(async () => ({ SecretString: "from-sdk" }));
			jest.spyOn(AWS, "secrets", "get").mockReturnValue({ client: {}, get, sdk: {} });
			const reader = new IngressPreviousSecretReader(id);

			await reader.refresh();

			expect(get).toHaveBeenCalledWith({ SecretId: id, VersionStage: "AWSPREVIOUS" });
			expect(reader.secretValue()).toBe("from-sdk");
		});

	});

});
