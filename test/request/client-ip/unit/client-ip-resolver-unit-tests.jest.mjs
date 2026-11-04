import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const ClientIpResolver = (await import("../../../../src/lib/utils/ClientIpResolver.class.js")).default;

/* ****************************************************************************
 * ClientIpResolver - Unit Tests
 * Feature: 1-4-1-trusted-client-ip
 *
 * Covers the resolution order, the measured topology chain shapes (T1, T2, T4),
 * parseViewerAddress examples, hop count gating, and fail-safe behavior.
 *
 * Every call to resolve() passes an explicit hop count where the test is not
 * about the default. All addresses are RFC 5737 documentation range addresses.
 *
 * Validates: Requirements 2.1-2.6, 3.1-3.5, 4.1-4.4, 5.1, 10.3
 */

// Documentation range addresses
const FORGED = "192.0.2.1";
const CLIENT = "198.51.100.10";
const EDGE = "203.0.113.30";
const MEMBER = "203.0.113.20";
const SOURCE_IP = "203.0.113.99";

describe("ClientIpResolver - unit tests", () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
	});

	describe("Measured topology chain shapes (X-Forwarded-For from the right)", () => {
		describe("T1: edge-optimized REST API, no CloudFront of the user's own (N = 2)", () => {
			it("selects the client from the chain `C, M`", () => {
				const headers = { "x-forwarded-for": `${CLIENT}, ${MEMBER}` };
				expect(ClientIpResolver.resolve(headers, { sourceIp: CLIENT }, 2)).toBe(CLIENT);
			});

			it("ignores a forged entry prepended by the client", () => {
				const headers = { "x-forwarded-for": `${FORGED}, ${CLIENT}, ${MEMBER}` };
				expect(ClientIpResolver.resolve(headers, { sourceIp: CLIENT }, 2)).toBe(CLIENT);
			});
		});

		describe("T2: user's CloudFront in front of an edge-optimized REST API (N = 3)", () => {
			const headers = { "x-forwarded-for": `${CLIENT}, ${EDGE}, ${MEMBER}` };

			it("selects the client from the chain `C, E, M` at N = 3", () => {
				expect(ClientIpResolver.resolve(headers, { sourceIp: EDGE }, 3)).toBe(CLIENT);
			});

			it("selects the edge address at N = 2 (fail-safe direction)", () => {
				expect(ClientIpResolver.resolve(headers, { sourceIp: EDGE }, 2)).toBe(EDGE);
			});

			it("ignores a forged entry prepended by the client at N = 3", () => {
				const forgedHeaders = { "x-forwarded-for": `${FORGED}, ${CLIENT}, ${EDGE}, ${MEMBER}` };
				expect(ClientIpResolver.resolve(forgedHeaders, { sourceIp: EDGE }, 3)).toBe(CLIENT);
			});
		});

		describe("T4: Regional REST API, no CloudFront (N = 1)", () => {
			it("selects the client from the chain `C` at N = 1", () => {
				const headers = { "x-forwarded-for": CLIENT };
				expect(ClientIpResolver.resolve(headers, { sourceIp: CLIENT }, 1)).toBe(CLIENT);
			});

			it("ignores a forged entry prepended by the client at N = 1", () => {
				const headers = { "x-forwarded-for": `${FORGED}, ${CLIENT}` };
				expect(ClientIpResolver.resolve(headers, { sourceIp: CLIENT }, 1)).toBe(CLIENT);
			});

			it("returns the forged entry at N = 2 (documented T4 exposure at the default)", () => {
				const headers = { "x-forwarded-for": `${FORGED}, ${CLIENT}` };
				expect(ClientIpResolver.resolve(headers, { sourceIp: CLIENT }, 2)).toBe(FORGED);
			});
		});

		it("uses the default hop count of 2 when none is passed and the variable is unset", () => {
			const headers = { "x-forwarded-for": `${FORGED}, ${CLIENT}, ${MEMBER}` };
			expect(ClientIpResolver.DEFAULT_TRUSTED_PROXY_HOPS).toBe(2);
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP })).toBe(CLIENT);
		});
	});

	describe("Falling through to identity.sourceIp", () => {
		it("falls through when the chain is shorter than the hop count", () => {
			const headers = { "x-forwarded-for": CLIENT };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 2)).toBe(SOURCE_IP);
		});

		it("falls through when the header is an empty string", () => {
			const headers = { "x-forwarded-for": "" };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 1)).toBe(SOURCE_IP);
		});

		it("falls through when the header is ' , ' (two empty entries)", () => {
			const headers = { "x-forwarded-for": " , " };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 1)).toBe(SOURCE_IP);
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 2)).toBe(SOURCE_IP);
		});

		it("falls through when the selected entry is not a valid IP", () => {
			const headers = { "x-forwarded-for": `${CLIENT}, not-an-ip` };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 1)).toBe(SOURCE_IP);
		});

		it("does not select an empty entry on the right, even when an IP sits further left", () => {
			const headers = { "x-forwarded-for": `${CLIENT}, ` };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 1)).toBe(SOURCE_IP);
		});

		it("returns identity.sourceIp unchanged even when it is not a valid IP", () => {
			expect(ClientIpResolver.resolve({}, { sourceIp: "not-an-ip" }, 2)).toBe("not-an-ip");
			expect(ClientIpResolver.resolve({}, { sourceIp: "" }, 2)).toBe("");
		});

		it("returns null when no step produces a value", () => {
			expect(ClientIpResolver.resolve({}, {}, 2)).toBeNull();
			expect(ClientIpResolver.resolve({}, { sourceIp: null }, 2)).toBeNull();
			expect(ClientIpResolver.resolve({}, { sourceIp: undefined }, 2)).toBeNull();
		});
	});

	describe("CloudFront-Viewer-Address step gating", () => {
		const headers = {
			"cloudfront-viewer-address": `${FORGED}:46532`,
			"x-forwarded-for": `${CLIENT}, ${EDGE}, ${MEMBER}`
		};
		const identity = { sourceIp: SOURCE_IP };

		it.each([2, 3])("runs at N = %i and wins over X-Forwarded-For", (hops) => {
			expect(ClientIpResolver.resolve(headers, identity, hops)).toBe(FORGED);
		});

		it("is skipped at N = 1 (X-Forwarded-For entry 1 from the right is used)", () => {
			expect(ClientIpResolver.resolve(headers, identity, 1)).toBe(MEMBER);
		});

		it("is skipped at N = 0 (falls to identity.sourceIp)", () => {
			expect(ClientIpResolver.resolve(headers, identity, 0)).toBe(SOURCE_IP);
		});

		it("falls through to X-Forwarded-For when the header value does not parse", () => {
			const unparsable = { ...headers, "cloudfront-viewer-address": "garbage" };
			expect(ClientIpResolver.resolve(unparsable, identity, 3)).toBe(CLIENT);
		});

		it("falls through to identity.sourceIp when neither header step produces a value", () => {
			const unparsable = { "cloudfront-viewer-address": "garbage", "x-forwarded-for": "garbage" };
			expect(ClientIpResolver.resolve(unparsable, identity, 3)).toBe(SOURCE_IP);
		});
	});

	describe("Hop count of 0", () => {
		it("ignores x-forwarded-for and uses identity.sourceIp", () => {
			const headers = { "x-forwarded-for": `${CLIENT}, ${MEMBER}` };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 0)).toBe(SOURCE_IP);
		});

		it("returns null when there is no identity.sourceIp", () => {
			const headers = { "x-forwarded-for": CLIENT };
			expect(ClientIpResolver.resolve(headers, {}, 0)).toBeNull();
		});
	});

	describe("parseViewerAddress", () => {
		it.each([
			["198.51.100.10:46532", "198.51.100.10"],
			["2001:db8::1:60776", "2001:db8::1"],
			["2001:db8::1:1234", "2001:db8::1"],
			["[2001:db8::1]:443", "2001:db8::1"],
			["198.51.100.10", "198.51.100.10"],
			["2001:db8::1", "2001:db8::1"],
			["::1", "::1"],
			[" 198.51.100.10:443 ", "198.51.100.10"],
			["198.51.100.10:0", "198.51.100.10"],
			["198.51.100.10:65535", "198.51.100.10"]
		])("returns the address for %j", (value, expected) => {
			expect(ClientIpResolver.parseViewerAddress(value)).toBe(expected);
		});

		it("reads a bare IPv6 address whose text minus its last group is a valid IP as an address with a port (::1:2 -> ::1)", () => {
			expect(ClientIpResolver.parseViewerAddress("::1:2")).toBe("::1");
		});

		it.each([
			[""],
			["   "],
			["198.51.100.10:"],
			["198.51.100.10:123456"],
			["garbage"],
			["[::1]"],
			[":"],
			["198.51.100.10:port"],
			[12345],
			[undefined],
			[null],
			[{}],
			[["198.51.100.10"]]
		])("returns null for %j", (value) => {
			expect(ClientIpResolver.parseViewerAddress(value)).toBeNull();
		});
	});

	describe("selectForwardedFor", () => {
		it("reports the entry count and selects the entry N from the right", () => {
			expect(ClientIpResolver.selectForwardedFor(`${FORGED}, ${CLIENT}, ${MEMBER}`, 2))
				.toEqual({ ip: CLIENT, entryCount: 3 });
		});

		it("reports an entry count of 1 for an empty string and selects nothing", () => {
			expect(ClientIpResolver.selectForwardedFor("", 1)).toEqual({ ip: null, entryCount: 1 });
		});

		it("reports an entry count of 0 for a non-string value", () => {
			expect(ClientIpResolver.selectForwardedFor(undefined, 1)).toEqual({ ip: null, entryCount: 0 });
			expect(ClientIpResolver.selectForwardedFor([CLIENT], 1)).toEqual({ ip: null, entryCount: 0 });
		});

		it("selects nothing when the hop count is below 1", () => {
			expect(ClientIpResolver.selectForwardedFor(CLIENT, 0)).toEqual({ ip: null, entryCount: 1 });
		});

		it("trims entries before validating", () => {
			expect(ClientIpResolver.selectForwardedFor(`  ${CLIENT}  ,${MEMBER}`, 2))
				.toEqual({ ip: CLIENT, entryCount: 2 });
		});
	});

	describe("Totality (never throws)", () => {
		it("returns null for resolve(null, null)", () => {
			expect(() => ClientIpResolver.resolve(null, null)).not.toThrow();
			expect(ClientIpResolver.resolve(null, null)).toBeNull();
		});

		it("returns null for resolve(undefined, undefined)", () => {
			expect(() => ClientIpResolver.resolve(undefined, undefined)).not.toThrow();
			expect(ClientIpResolver.resolve(undefined, undefined)).toBeNull();
		});

		it('returns null for resolve("x", 5)', () => {
			expect(() => ClientIpResolver.resolve("x", 5)).not.toThrow();
			expect(ClientIpResolver.resolve("x", 5)).toBeNull();
		});

		it("treats non-string header values as no value", () => {
			const headers = { "cloudfront-viewer-address": 42, "x-forwarded-for": { a: 1 } };
			expect(ClientIpResolver.resolve(headers, { sourceIp: SOURCE_IP }, 3)).toBe(SOURCE_IP);
		});

		it("treats objects without the expected keys as empty", () => {
			expect(ClientIpResolver.resolve({ unrelated: "value" }, { other: 1 }, 2)).toBeNull();
		});
	});

	describe("resolveDetailed", () => {
		it("reports the step that produced the value", () => {
			const headers = {
				"cloudfront-viewer-address": `${FORGED}:443`,
				"x-forwarded-for": `${CLIENT}, ${MEMBER}`
			};
			expect(ClientIpResolver.resolveDetailed(headers, { sourceIp: SOURCE_IP }, 2))
				.toEqual({ ip: FORGED, step: "viewer-address", trustedProxyHops: 2, forwardedForEntryCount: 2 });
			expect(ClientIpResolver.resolveDetailed(headers, { sourceIp: SOURCE_IP }, 1))
				.toEqual({ ip: MEMBER, step: "x-forwarded-for", trustedProxyHops: 1, forwardedForEntryCount: 2 });
			expect(ClientIpResolver.resolveDetailed({}, { sourceIp: SOURCE_IP }, 2))
				.toEqual({ ip: SOURCE_IP, step: "source-ip", trustedProxyHops: 2, forwardedForEntryCount: 0 });
			expect(ClientIpResolver.resolveDetailed({}, {}, 2))
				.toEqual({ ip: null, step: "none", trustedProxyHops: 2, forwardedForEntryCount: 0 });
		});
	});

	describe("Static surface", () => {
		it("has exactly the six methods, ENV_VAR, DEFAULT_TRUSTED_PROXY_HOPS, and the built-in class properties", () => {
			expect(Object.getOwnPropertyNames(ClientIpResolver).sort()).toEqual([
				"DEFAULT_TRUSTED_PROXY_HOPS",
				"ENV_VAR",
				"getTrustedProxyHops",
				"length",
				"name",
				"parseTrustedProxyHops",
				"parseViewerAddress",
				"prototype",
				"resolve",
				"resolveDetailed",
				"selectForwardedFor"
			]);
		});

		it("exposes the environment variable name", () => {
			expect(ClientIpResolver.ENV_VAR).toBe("CACHE_DATA_TRUSTED_PROXY_HOPS");
		});
	});
});
