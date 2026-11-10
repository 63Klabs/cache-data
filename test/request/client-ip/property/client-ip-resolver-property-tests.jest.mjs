import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { isIP } from 'node:net';

const ClientIpResolver = (await import("../../../../src/lib/utils/ClientIpResolver.class.js")).default;
const DebugAndLog = (await import("../../../../src/lib/tools/DebugAndLog.class.js")).default;

/* ****************************************************************************
 * ClientIpResolver - Property-Based Tests
 * Feature: 1-4-1-trusted-client-ip
 *
 * Properties 1 to 6 from design.md "Correctness properties".
 *
 * None of these tests spawns a child process. No `seed` option is passed to
 * fc.assert: the global FC_SEED hook is the single seeding mechanism. Every
 * arbitrary is valid by construction, with no fc.pre and no generator filtered
 * on the predicate a property asserts.
 *
 * Run counts: 500 for Properties 1 and 2, 200 for Properties 3 to 6.
 *
 * Bare IPv6 (Requirement 3.5) is deliberately not a property: a bare address
 * such as `::1:2` is read as an address with a port. Examples cover it in
 * client-ip-resolver-unit-tests.jest.mjs.
 *
 * Validates: Requirements 3.1-3.3, 4.5, 10.4, 10.7, 10.8
 * ************************************************************************** */

const PROPERTY_TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// Shared arbitraries (design.md "Correctness properties")
// ---------------------------------------------------------------------------

/** Any valid IPv4 or IPv6 address. Every draw satisfies isIP() > 0. */
const ip = fc.oneof(fc.ipV4(), fc.ipV6());

/** Anything at all a client could have written to the left of the trusted entries, including commas, spaces, and IPs. */
const forged = fc.array(fc.string({ maxLength: 40 }), { maxLength: 6 });

/** Number of trusted proxies, 1 to 5. */
const hops = fc.integer({ min: 1, max: 5 });

/** Any port, 0 to 65535. */
const port = fc.integer({ min: 0, max: 65535 });

/**
 * An address in one documentation range, so sources drawn from different ranges can never be equal.
 * @param {string} prefix - First three octets, for example "198.51.100"
 * @returns {fc.Arbitrary<string>} Addresses from prefix.1 to prefix.254
 */
const docIp = (prefix) => fc.integer({ min: 1, max: 254 }).map((last) => `${prefix}.${last}`);

const VIEWER_RANGE = "192.0.2";
const FORWARDED_RANGE = "198.51.100";
const SOURCE_RANGE = "203.0.113";

/** 0 to 3 spaces */
const spaces = fc.integer({ min: 0, max: 3 }).map((count) => " ".repeat(count));

describe("ClientIpResolver - property-based tests", () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
	});

	describe("Property 1: Right-to-left selection", () => {
		/**
		 * For any forged list P, hop count N, and list T of N IPs, the header value
		 * made of P followed by T resolves to T[0].
		 *
		 * **Validates: Requirements 4.1, 4.2, 4.5**
		 */
		it("resolves to the first of the N trusted entries whatever precedes them", () => {
			fc.assert(
				fc.property(
					forged,
					hops.chain((n) => fc.tuple(fc.constant(n), fc.array(ip, { minLength: n, maxLength: n }))),
					(leftEntries, [n, trusted]) => {
						const headers = { "x-forwarded-for": [...leftEntries, ...trusted].join(", ") };
						expect(ClientIpResolver.resolve(headers, {}, n)).toBe(trusted[0]);
					}
				),
				{ numRuns: 500 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	describe("Property 2: The default returns identity.sourceIp", () => {
		/**
		 * With the environment variable unset, for any forged list P and addresses V, E, M,
		 * the chain P ++ [V, E, M] resolves to identity.sourceIp. The default hop count is 0,
		 * so no X-Forwarded-For entry is trusted.
		 *
		 * The chain entries come from one documentation range and sourceIp from another,
		 * so sourceIp differs from every chain entry by construction. A default of 1, 2, or 3
		 * would select M, E, or V and fail this property. Nothing is filtered on the asserted
		 * predicate and there is no fc.pre.
		 *
		 * **Validates: Requirement 2.5 of spec 1-4-1-docs-a-cache-data-trusted-proxy-hops-value-that**
		 */
		it("returns identity.sourceIp with the default hop count whatever the headers hold", () => {
			fc.assert(
				fc.property(
					forged,
					docIp(FORWARDED_RANGE),
					docIp(FORWARDED_RANGE),
					docIp(FORWARDED_RANGE),
					docIp(SOURCE_RANGE),
					(leftEntries, v, e, m, sourceIp) => {
						delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
						const headers = { "x-forwarded-for": [...leftEntries, v, e, m].join(", ") };
						expect(ClientIpResolver.resolve(headers, { sourceIp })).toBe(sourceIp);
					}
				),
				{ numRuns: 500 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	describe("Property 3: Short chains fall through", () => {
		/**
		 * With N from 2 to 5 and 1 to N - 1 entries, nothing is selected from
		 * X-Forwarded-For and the result is identity.sourceIp.
		 *
		 * **Validates: Requirements 4.3, 5.1**
		 */
		it("falls through to identity.sourceIp when the chain has fewer entries than the hop count", () => {
			const shortChain = fc.integer({ min: 2, max: 5 }).chain((n) => fc.tuple(
				fc.constant(n),
				fc.array(docIp(FORWARDED_RANGE), { minLength: 1, maxLength: n - 1 }),
				docIp(SOURCE_RANGE)
			));

			fc.assert(
				fc.property(shortChain, ([n, entries, sourceIp]) => {
					const headers = { "x-forwarded-for": entries.join(", ") };
					expect(ClientIpResolver.resolve(headers, { sourceIp }, n)).toBe(sourceIp);
				}),
				{ numRuns: 200 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	describe("Property 4: Viewer address with a port", () => {
		/**
		 * parseViewerAddress returns the address for IPv4 with a port, bare IPv4,
		 * IPv6 with a port, and bracketed IPv6 with a port, each wrapped in 0 to 3
		 * spaces on each side. Bare IPv6 is not a property.
		 *
		 * **Validates: Requirements 3.1, 3.2, 3.3**
		 */
		it("returns the address for every form, with or without surrounding spaces", () => {
			fc.assert(
				fc.property(fc.ipV4(), fc.ipV6(), port, spaces, spaces, spaces, spaces, spaces, spaces, spaces, spaces,
					(a4, a6, p, l1, r1, l2, r2, l3, r3, l4, r4) => {
						expect(ClientIpResolver.parseViewerAddress(`${l1}${a4}:${p}${r1}`)).toBe(a4);
						expect(ClientIpResolver.parseViewerAddress(`${l2}${a4}${r2}`)).toBe(a4);
						expect(ClientIpResolver.parseViewerAddress(`${l3}${a6}:${p}${r3}`)).toBe(a6);
						expect(ClientIpResolver.parseViewerAddress(`${l4}[${a6}]:${p}${r4}`)).toBe(a6);
					}
				),
				{ numRuns: 200 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	describe("Property 5: Step 1 gating", () => {
		/**
		 * The viewer address wins when N >= 2, the last X-Forwarded-For entry
		 * (index 2 of three, 1 from the right) when N is 1, and identity.sourceIp
		 * when N is 0.
		 *
		 * **Validates: Requirements 2.1, 2.2, 2.3**
		 */
		it("runs the viewer-address step only when the hop count is 2 or more", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5 }),
					docIp(VIEWER_RANGE),
					fc.array(docIp(FORWARDED_RANGE), { minLength: 3, maxLength: 3 }),
					docIp(SOURCE_RANGE),
					(n, viewer, forwarded, sourceIp) => {
						const headers = {
							"cloudfront-viewer-address": `${viewer}:443`,
							"x-forwarded-for": forwarded.join(", ")
						};
						const expected = (n >= 2) ? viewer : ((n === 1) ? forwarded[2] : sourceIp);
						expect(ClientIpResolver.resolve(headers, { sourceIp }, n)).toBe(expected);
					}
				),
				{ numRuns: 200 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});

	describe("Property 6: Total and well-typed", () => {
		/**
		 * For arbitrary headers, identity, and hop count, resolve() never throws and
		 * returns null, the identity's sourceIp, or a valid IP string. resolve() also
		 * catches its own errors, so the test asserts DebugAndLog.error is never
		 * called, which would mean an internal exception was swallowed.
		 *
		 * **Validates: Requirements 2.5, 2.6, 3.4, 4.4, 5.1**
		 */
		it("never throws and returns null, the identity's sourceIp, or a valid IP", () => {
			const headerMap = fc.dictionary(
				fc.oneof(fc.constantFrom("cloudfront-viewer-address", "x-forwarded-for", "user-agent"), fc.string()),
				fc.anything()
			);
			const identity = fc.oneof(
				fc.constant(null),
				fc.constant(undefined),
				fc.anything(),
				fc.record({ sourceIp: fc.anything() })
			);

			const errorSpy = jest.spyOn(DebugAndLog, "error").mockImplementation(() => Promise.resolve(true));

			fc.assert(
				fc.property(headerMap, identity, fc.integer({ min: 0, max: 5 }), (headers, identityValue, n) => {
					errorSpy.mockClear();

					const result = ClientIpResolver.resolve(headers, identityValue, n);
					const sourceIp = (identityValue !== null && typeof identityValue === "object") ? identityValue.sourceIp : undefined;

					expect(errorSpy).not.toHaveBeenCalled();
					const isAllowed = result === null
						|| Object.is(result, sourceIp)
						|| (typeof result === "string" && isIP(result) > 0);
					expect(isAllowed).toBe(true);
				}),
				{ numRuns: 200 }
			);
		}, PROPERTY_TIMEOUT_MS);
	});
});
