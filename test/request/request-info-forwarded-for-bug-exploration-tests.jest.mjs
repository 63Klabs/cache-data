import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

const RequestInfo = (await import('../../src/lib/tools/RequestInfo.class.js')).default;

/* ****************************************************************************
 * Bug Condition Exploration Tests
 * Feature: 1-3-11-client-request-update-forwarded-for
 * Updated by: 1-4-1-trusted-client-ip
 *
 * 1-4-1-trusted-client-ip changed IP selection from leftmost to
 * right-to-left: getClientIp() now returns the x-forwarded-for entry
 * CACHE_DATA_TRUSTED_PROXY_HOPS + 1 positions from the right (default
 * 2 from the right), and falls back to identity.sourceIp when the chain is
 * too short. The IP assertions below were rewritten accordingly.
 *
 * Property 1: Bug Condition - X-Forwarded-For and User-Agent Header Priority
 * 
 * These tests encode the EXPECTED (correct) behavior. On unfixed code they
 * are expected to FAIL, which confirms the bug exists.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */
describe("RequestInfo - Bug Condition Exploration (X-Forwarded-For / User-Agent)", () => {

	let originalTrustedProxyHops;

	beforeEach(() => {
		originalTrustedProxyHops = process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
		delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
	});

	afterEach(() => {
		if (originalTrustedProxyHops === undefined) {
			delete process.env.CACHE_DATA_TRUSTED_PROXY_HOPS;
		} else {
			process.env.CACHE_DATA_TRUSTED_PROXY_HOPS = originalTrustedProxyHops;
		}
	});

	describe("Property 1: X-Forwarded-For header should take priority over identity.sourceIp", () => {

		it("Property: getClientIp() returns the x-forwarded-for entry 2 from the right by default", () => {
			/**
			 * Validates: Requirements 2.1, 2.2
			 * 
			 * For any event where x-forwarded-for holds at least two entries
			 * and CACHE_DATA_TRUSTED_PROXY_HOPS is unset (default 1),
			 * getClientIp() should return the entry 2 from the right (trimmed),
			 * regardless of any entries to its left.
			 */
			fc.assert(
				fc.property(
					fc.ipV4(),                                          // client IP (2nd from the right)
					fc.array(fc.ipV4(), { minLength: 0, maxLength: 3 }), // optional (forgeable) entries to the left
					fc.ipV4(),                                          // identity.sourceIp (CloudFront IP)
					fc.ipV4(),                                          // edge IP (rightmost entry)
					(clientIp, proxyIps, identityIp, edgeIp) => {
						// Ensure identity IP differs from client IP so a fallback is detectable
						fc.pre(clientIp !== identityIp);

						const forwardedFor = [...proxyIps, clientIp, edgeIp].join(", ");

						const event = {
							headers: {
								"X-Forwarded-For": forwardedFor
							},
							requestContext: {
								identity: {
									sourceIp: identityIp,
									userAgent: "TestAgent"
								}
							},
							queryStringParameters: null,
							body: null
						};

						const requestInfo = new RequestInfo(event);
						expect(requestInfo.getClientIp()).toBe(clientIp);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: getClientUserAgent() returns user-agent header when present", () => {
			/**
			 * Validates: Requirements 2.3
			 * 
			 * For any event where user-agent header is present and non-empty
			 * with identity.userAgent set to a different value, getClientUserAgent()
			 * should return the user-agent header value.
			 */
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					(headerUserAgent) => {
						const identityUserAgent = "Amazon CloudFront";
						fc.pre(headerUserAgent !== identityUserAgent);

						const event = {
							headers: {
								"User-Agent": headerUserAgent
							},
							requestContext: {
								identity: {
									sourceIp: "198.51.100.1",
									userAgent: identityUserAgent
								}
							},
							queryStringParameters: null,
							body: null
						};

						const requestInfo = new RequestInfo(event);
						expect(requestInfo.getClientUserAgent()).toBe(headerUserAgent);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Concrete bug condition cases", () => {

		it("single IP: a one-entry chain falls back to identity.sourceIp", () => {
			/**
			 * Validates: Requirements 1.1, 2.1
			 */
			const event = {
				headers: {
					"X-Forwarded-For": "203.0.113.50"
				},
				requestContext: {
					identity: {
						sourceIp: "198.51.100.1",
						userAgent: "Amazon CloudFront"
					}
				},
				queryStringParameters: null,
				body: null
			};

			const requestInfo = new RequestInfo(event);
			expect(requestInfo.getClientIp()).toBe("198.51.100.1");
		});

		it("multiple IPs: a forged left entry is ignored", () => {
			/**
			 * Validates: Requirements 1.2, 2.2
			 */
			const event = {
				headers: {
					"X-Forwarded-For": "192.0.2.1, 203.0.113.50, 198.51.100.1"
				},
				requestContext: {
					identity: {
						sourceIp: "198.51.100.1",
						userAgent: "Amazon CloudFront"
					}
				},
				queryStringParameters: null,
				body: null
			};

			const requestInfo = new RequestInfo(event);
			expect(requestInfo.getClientIp()).toBe("203.0.113.50");
		});

		it("user-agent: header 'Mozilla/5.0 (Windows NT 10.0)' with identity.userAgent 'Amazon CloudFront'", () => {
			/**
			 * Validates: Requirements 1.3, 2.3
			 */
			const event = {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0)"
				},
				requestContext: {
					identity: {
						sourceIp: "198.51.100.1",
						userAgent: "Amazon CloudFront"
					}
				},
				queryStringParameters: null,
				body: null
			};

			const requestInfo = new RequestInfo(event);
			expect(requestInfo.getClientUserAgent()).toBe("Mozilla/5.0 (Windows NT 10.0)");
		});
	});
});
