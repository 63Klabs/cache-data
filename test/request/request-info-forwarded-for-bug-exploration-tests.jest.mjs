import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

const RequestInfo = (await import('../../src/lib/tools/RequestInfo.class.js')).default;

/* ****************************************************************************
 * Bug Condition Exploration Tests
 * Feature: 1-3-11-client-request-update-forwarded-for
 * 
 * Property 1: Bug Condition - X-Forwarded-For and User-Agent Header Priority
 * 
 * These tests encode the EXPECTED (correct) behavior. On unfixed code they
 * are expected to FAIL, which confirms the bug exists.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */
describe("RequestInfo - Bug Condition Exploration (X-Forwarded-For / User-Agent)", () => {

	describe("Property 1: X-Forwarded-For header should take priority over identity.sourceIp", () => {

		it("Property: getClientIp() returns first IP from x-forwarded-for when present", () => {
			/**
			 * Validates: Requirements 2.1, 2.2
			 * 
			 * For any event where x-forwarded-for is present and non-empty
			 * with identity.sourceIp set to a different value, getClientIp()
			 * should return the first IP from x-forwarded-for (trimmed).
			 */
			fc.assert(
				fc.property(
					fc.ipV4(),                                          // client IP (first in x-forwarded-for)
					fc.array(fc.ipV4(), { minLength: 0, maxLength: 3 }), // optional proxy IPs
					fc.ipV4(),                                          // identity.sourceIp (CloudFront IP)
					(clientIp, proxyIps, identityIp) => {
						// Ensure identity IP differs from client IP to trigger bug condition
						fc.pre(clientIp !== identityIp);

						const forwardedFor = [clientIp, ...proxyIps].join(", ");

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
									sourceIp: "54.240.144.1",
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

		it("single IP: x-forwarded-for '203.0.113.50' with identity.sourceIp '54.240.144.1'", () => {
			/**
			 * Validates: Requirements 1.1, 2.1
			 */
			const event = {
				headers: {
					"X-Forwarded-For": "203.0.113.50"
				},
				requestContext: {
					identity: {
						sourceIp: "54.240.144.1",
						userAgent: "Amazon CloudFront"
					}
				},
				queryStringParameters: null,
				body: null
			};

			const requestInfo = new RequestInfo(event);
			expect(requestInfo.getClientIp()).toBe("203.0.113.50");
		});

		it("multiple IPs: x-forwarded-for '203.0.113.50, 70.132.20.1, 54.240.144.1' with identity.sourceIp '54.240.144.1'", () => {
			/**
			 * Validates: Requirements 1.2, 2.2
			 */
			const event = {
				headers: {
					"X-Forwarded-For": "203.0.113.50, 70.132.20.1, 54.240.144.1"
				},
				requestContext: {
					identity: {
						sourceIp: "54.240.144.1",
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
						sourceIp: "54.240.144.1",
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
