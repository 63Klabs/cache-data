import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const ClientIpResolver = (await import("../../../../src/lib/utils/ClientIpResolver.class.js")).default;
const DebugAndLog = (await import("../../../../src/lib/tools/DebugAndLog.class.js")).default;

/* ****************************************************************************
 * ClientIpResolver - Configuration and Logging Tests
 * Feature: 1-4-1-trusted-client-ip
 *
 * Covers the CACHE_DATA_TRUSTED_PROXY_HOPS parsing rules, the environment read
 * and memo, the once-per-distinct-value warning, and the debug resolution line.
 *
 * IMPORTANT: ClientIpResolver keeps the set of raw values it has already warned
 * about for the life of the module instance, and each Jest test file gets one
 * instance. Every test that asserts a warning therefore uses a raw value that
 * no other test in this file uses (Req 10.5). Do not reuse a raw value that
 * appears in a warning test, whether valid or invalid.
 *
 * Warning-test raw values in this file:
 *   "five-calls-invalid", "second-a-invalid", "second-b-invalid",
 *   "revisit-a-invalid", "revisit-b-invalid", `quote"and\nline-invalid`,
 *   "invalid-then-valid-bad", "never-throws-invalid"
 * Valid-value raw values in warning tests: "5", " 6 ", "", "7"
 *
 * Validates: Requirements 6.1-6.7, 7.1-7.3, 10.3, 10.5, 10.6
 */

const ENV_VAR = "CACHE_DATA_TRUSTED_PROXY_HOPS";

// Documentation range addresses (RFC 5737)
const VIEWER_IP = "192.0.2.77";
const FORWARDED_CLIENT = "198.51.100.10";
const FORWARDED_EDGE = "198.51.100.40";
const FORWARDED_MEMBER = "203.0.113.20";
const SOURCE_IP = "203.0.113.99";

const EXPECTED_WARNING = (raw) => `${ENV_VAR} must be a non-negative integer. Received ${JSON.stringify(raw)}. Using the default of 0.`;

describe("ClientIpResolver - configuration and logging tests", () => {
	let originalEnv;
	let warnSpy;
	let debugSpy;

	beforeEach(() => {
		originalEnv = { ...process.env };
		delete process.env[ENV_VAR];

		// Mock implementations keep test output clean and let the tests inspect calls
		warnSpy = jest.spyOn(DebugAndLog, "warn").mockImplementation(() => {});
		debugSpy = jest.spyOn(DebugAndLog, "debug").mockImplementation(() => {});
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
	});

	describe("parseTrustedProxyHops()", () => {
		describe("valid and default values", () => {
			const validCases = [
				[undefined, 0],
				["", 0],
				["  ", 0],
				["0", 0],
				["1", 1],
				["2", 2],
				["3", 3],
				[" 3 ", 3],
				["007", 7]
			];

			it.each(validCases)("parses %j as %j and marks it valid", (raw, expectedHops) => {
				expect(ClientIpResolver.parseTrustedProxyHops(raw)).toEqual({ trustedProxyHops: expectedHops, isValid: true });
			});
		});

		describe("invalid values", () => {
			const invalidCases = [
				"abc",
				"-1",
				"1.5",
				"2 hops",
				"+2",
				"0x2",
				"\uFF12" // full-width digit two
			];

			it.each(invalidCases)("parses %j as the default of 0 and marks it invalid", (raw) => {
				expect(ClientIpResolver.parseTrustedProxyHops(raw)).toEqual({ trustedProxyHops: 0, isValid: false });
			});
		});

		it("is pure: logs nothing and reads no environment state", () => {
			process.env[ENV_VAR] = "9";
			ClientIpResolver.parseTrustedProxyHops("abc");
			ClientIpResolver.parseTrustedProxyHops(undefined);
			expect(warnSpy).not.toHaveBeenCalled();
			expect(debugSpy).not.toHaveBeenCalled();
			expect(ClientIpResolver.parseTrustedProxyHops(undefined).trustedProxyHops).toBe(0);
		});
	});

	describe("getTrustedProxyHops() reads process.env", () => {
		it("returns 0 when the variable is unset", () => {
			delete process.env[ENV_VAR];
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);
		});

		it("returns 3 when the variable is \"3\"", () => {
			process.env[ENV_VAR] = "3";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(3);
		});

		it("sees a change to the variable on the next call", () => {
			process.env[ENV_VAR] = "3";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(3);

			process.env[ENV_VAR] = "1";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(1);

			delete process.env[ENV_VAR];
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);

			process.env[ENV_VAR] = "0";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);
		});

		it("returns the same result for repeated calls with an unchanged value", () => {
			process.env[ENV_VAR] = "3";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(3);
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(3);
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(3);
		});

		it("never throws for an invalid value and falls back to 0", () => {
			process.env[ENV_VAR] = "never-throws-invalid";
			expect(() => ClientIpResolver.getTrustedProxyHops()).not.toThrow();
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);
		});
	});

	describe("invalid value warning", () => {
		it("logs exactly one warning with the exact message across five calls", () => {
			const raw = "five-calls-invalid";
			process.env[ENV_VAR] = raw;

			for (let i = 0; i < 5; i++) {
				expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);
			}

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(EXPECTED_WARNING(raw));
			expect(warnSpy.mock.calls[0][0]).toBe(`CACHE_DATA_TRUSTED_PROXY_HOPS must be a non-negative integer. Received "five-calls-invalid". Using the default of 0.`);
		});

		it("warns once more for a second distinct invalid value", () => {
			const rawA = "second-a-invalid";
			const rawB = "second-b-invalid";

			process.env[ENV_VAR] = rawA;
			ClientIpResolver.getTrustedProxyHops();
			ClientIpResolver.getTrustedProxyHops();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenLastCalledWith(EXPECTED_WARNING(rawA));

			process.env[ENV_VAR] = rawB;
			ClientIpResolver.getTrustedProxyHops();
			ClientIpResolver.getTrustedProxyHops();
			expect(warnSpy).toHaveBeenCalledTimes(2);
			expect(warnSpy).toHaveBeenLastCalledWith(EXPECTED_WARNING(rawB));
		});

		it("does not warn again when the variable returns to a value already warned about", () => {
			const rawA = "revisit-a-invalid";
			const rawB = "revisit-b-invalid";

			process.env[ENV_VAR] = rawA;
			ClientIpResolver.getTrustedProxyHops();
			process.env[ENV_VAR] = rawB;
			ClientIpResolver.getTrustedProxyHops();
			process.env[ENV_VAR] = rawA;
			ClientIpResolver.getTrustedProxyHops();

			expect(warnSpy).toHaveBeenCalledTimes(2);
		});

		it("escapes quotes and control characters with JSON.stringify so the raw value cannot split the line", () => {
			const raw = "quote\"and\nline-invalid";
			process.env[ENV_VAR] = raw;

			ClientIpResolver.getTrustedProxyHops();

			expect(warnSpy).toHaveBeenCalledTimes(1);
			const message = warnSpy.mock.calls[0][0];
			expect(message).toBe(EXPECTED_WARNING(raw));
			expect(message).not.toContain("\n");
			expect(message).toContain("\\n");
			expect(message).toContain("\\\"");
		});

		it("warns once and does not warn again for a later valid value", () => {
			process.env[ENV_VAR] = "invalid-then-valid-bad";
			ClientIpResolver.getTrustedProxyHops();
			expect(warnSpy).toHaveBeenCalledTimes(1);

			process.env[ENV_VAR] = "7";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(7);
			expect(warnSpy).toHaveBeenCalledTimes(1);
		});

		it("does not warn for valid, empty, whitespace-only, or unset values", () => {
			process.env[ENV_VAR] = "5";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(5);

			process.env[ENV_VAR] = " 6 ";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(6);

			process.env[ENV_VAR] = "";
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);

			delete process.env[ENV_VAR];
			expect(ClientIpResolver.getTrustedProxyHops()).toBe(0);

			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe("debug resolution line", () => {
		const DEBUG_LINE = (step, hops, entries) => `ClientIpResolver: step=${step} trustedProxyHops=${hops} xForwardedForEntries=${entries}`;

		// One request per resolution step, each with an explicit hop count
		const stepCases = [
			{
				step: "viewer-address",
				hops: 2,
				entries: 2,
				headers: {
					"cloudfront-viewer-address": `${VIEWER_IP}:46532`,
					"x-forwarded-for": `${FORWARDED_CLIENT}, ${FORWARDED_MEMBER}`
				},
				identity: { sourceIp: SOURCE_IP },
				expectedIp: VIEWER_IP
			},
			{
				step: "x-forwarded-for",
				hops: 3,
				entries: 3,
				headers: {
					"x-forwarded-for": `${FORWARDED_CLIENT}, ${FORWARDED_EDGE}, ${FORWARDED_MEMBER}`
				},
				identity: { sourceIp: SOURCE_IP },
				expectedIp: FORWARDED_CLIENT
			},
			{
				step: "source-ip",
				hops: 2,
				entries: 0,
				headers: {},
				identity: { sourceIp: SOURCE_IP },
				expectedIp: SOURCE_IP
			},
			{
				step: "none",
				hops: 1,
				entries: 0,
				headers: {},
				identity: {},
				expectedIp: null
			}
		];

		describe("at debug level", () => {
			beforeEach(() => {
				jest.spyOn(DebugAndLog, "getLogLevel").mockReturnValue(DebugAndLog.DEBUG_LEVEL_NUM);
			});

			it.each(stepCases)("logs exactly one line with the exact text for step $step", ({ step, hops, entries, headers, identity, expectedIp }) => {
				const ip = ClientIpResolver.resolve(headers, identity, hops);

				expect(ip).toBe(expectedIp);
				expect(debugSpy).toHaveBeenCalledTimes(1);
				expect(debugSpy).toHaveBeenCalledWith(DEBUG_LINE(step, hops, entries));
			});

			it.each(stepCases)("does not put any request address in the line for step $step", ({ hops, headers, identity }) => {
				ClientIpResolver.resolve(headers, identity, hops);

				expect(debugSpy).toHaveBeenCalledTimes(1);
				const message = debugSpy.mock.calls[0][0];
				const addresses = [VIEWER_IP, FORWARDED_CLIENT, FORWARDED_EDGE, FORWARDED_MEMBER, SOURCE_IP];
				for (const address of addresses) {
					expect(message).not.toContain(address);
				}
				expect(message).not.toContain("46532");
			});

			it("logs one line per resolve() call", () => {
				const { headers, identity } = stepCases[1];

				ClientIpResolver.resolve(headers, identity, 3);
				ClientIpResolver.resolve(headers, identity, 3);
				ClientIpResolver.resolve(headers, identity, 3);

				expect(debugSpy).toHaveBeenCalledTimes(3);
			});

			it("reports the hop count read from the environment when none is passed", () => {
				process.env[ENV_VAR] = "3";
				const { headers, identity } = stepCases[1];

				const ip = ClientIpResolver.resolve(headers, identity);

				expect(ip).toBe(FORWARDED_CLIENT);
				expect(debugSpy).toHaveBeenCalledTimes(1);
				expect(debugSpy).toHaveBeenCalledWith(DEBUG_LINE("x-forwarded-for", 3, 3));
			});

			it("reports the default hop count of 0 when the variable is unset", () => {
				delete process.env[ENV_VAR];

				ClientIpResolver.resolve({}, { sourceIp: SOURCE_IP });

				expect(debugSpy).toHaveBeenCalledTimes(1);
				expect(debugSpy).toHaveBeenCalledWith(DEBUG_LINE("source-ip", 0, 0));
			});
		});

		describe("below debug level", () => {
			it.each(stepCases)("logs no debug line for step $step at info level", ({ hops, headers, identity, expectedIp }) => {
				const levelSpy = jest.spyOn(DebugAndLog, "getLogLevel").mockReturnValue(DebugAndLog.INFO_LEVEL_NUM);

				const ip = ClientIpResolver.resolve(headers, identity, hops);

				expect(ip).toBe(expectedIp);
				expect(levelSpy).toHaveBeenCalled();
				expect(debugSpy).not.toHaveBeenCalled();
			});
		});
	});
});
