import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

const RequestInfo = (await import('../../src/lib/tools/RequestInfo.class.js')).default;

/* ****************************************************************************
 * Preservation Property Tests
 * Feature: 1-3-11-client-request-update-forwarded-for
 * 
 * Property 2: Preservation - Fallback and Unrelated Behavior
 * 
 * These tests capture the existing correct behavior on UNFIXED code.
 * They MUST PASS on unfixed code to confirm baseline behavior that
 * must not regress after the fix is applied.
 * 
 * Validates: Requirements 2.4, 2.5, 3.1, 3.2, 3.3, 3.4
 */

/**
 * Arbitrary for generating a valid API Gateway event with configurable headers.
 * Excludes x-forwarded-for and user-agent from generated headers by default.
 */
const arbSourceIp = fc.ipV4();
const arbUserAgent = fc.string({ minLength: 1, maxLength: 100 });

const arbOtherHeaders = fc.record({
	origin: fc.option(fc.webUrl(), { nil: undefined }),
	referer: fc.option(fc.webUrl(), { nil: undefined }),
	"if-modified-since": fc.option(fc.constant("Wed, 21 Oct 2015 07:28:00 GMT"), { nil: undefined }),
	"if-none-match": fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
	accept: fc.option(fc.constantFrom("text/html", "application/json", "*/*", "text/plain"), { nil: undefined }),
}, { requiredKeys: [] });

const arbQueryStringParameters = fc.option(
	fc.dictionary(
		fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
		fc.string({ minLength: 0, maxLength: 50 }),
		{ minKeys: 0, maxKeys: 5 }
	),
	{ nil: null }
);


describe("RequestInfo - Preservation Property Tests (Fallback & Unrelated Behavior)", () => {

	describe("Property 2a: IP fallback to identity.sourceIp when no x-forwarded-for header", () => {

		it("Property: getClientIp() returns identity.sourceIp when x-forwarded-for is absent", () => {
			/**
			 * Validates: Requirements 2.4, 3.1
			 * 
			 * For any event WITHOUT an x-forwarded-for header (or with empty/null value),
			 * getClientIp() returns identity.sourceIp (or null if identity missing).
			 */
			fc.assert(
				fc.property(
					arbSourceIp,
					arbUserAgent,
					fc.constantFrom(undefined, null, ""),
					arbOtherHeaders,
					arbQueryStringParameters,
					(sourceIp, userAgent, forwardedForValue, otherHeaders, queryParams) => {
						const eventHeaders = { ...otherHeaders };

						// Include x-forwarded-for only if it has a non-undefined value
						// (null and "" should still fall back)
						if (forwardedForValue !== undefined) {
							eventHeaders["X-Forwarded-For"] = forwardedForValue;
						}

						const event = {
							headers: eventHeaders,
							requestContext: {
								identity: {
									sourceIp: sourceIp,
									userAgent: userAgent
								}
							},
							queryStringParameters: queryParams,
							body: null
						};

						const requestInfo = new RequestInfo(event);
						expect(requestInfo.getClientIp()).toBe(sourceIp);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2b: User agent fallback to identity.userAgent when no user-agent header", () => {

		it("Property: getClientUserAgent() returns identity.userAgent when user-agent header is absent", () => {
			/**
			 * Validates: Requirements 2.5, 3.2
			 * 
			 * For any event WITHOUT a user-agent header (or with empty/null value),
			 * getClientUserAgent() returns identity.userAgent (or null if identity missing).
			 */
			fc.assert(
				fc.property(
					arbSourceIp,
					arbUserAgent,
					fc.constantFrom(undefined, null, ""),
					arbOtherHeaders,
					arbQueryStringParameters,
					(sourceIp, userAgent, userAgentHeaderValue, otherHeaders, queryParams) => {
						const eventHeaders = { ...otherHeaders };

						if (userAgentHeaderValue !== undefined) {
							eventHeaders["User-Agent"] = userAgentHeaderValue;
						}

						const event = {
							headers: eventHeaders,
							requestContext: {
								identity: {
									sourceIp: sourceIp,
									userAgent: userAgent
								}
							},
							queryStringParameters: queryParams,
							body: null
						};

						const requestInfo = new RequestInfo(event);
						expect(requestInfo.getClientUserAgent()).toBe(userAgent);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2c: Unrelated getters produce identical results regardless of x-forwarded-for/user-agent", () => {

		it("Property: origin, referrer, ifModifiedSince, ifNoneMatch, accept, parameters, body are unchanged by x-forwarded-for/user-agent presence", () => {
			/**
			 * Validates: Requirements 3.3
			 * 
			 * For all random events, getClientOrigin(), getClientReferrer(),
			 * getClientIfModifiedSince(), getClientIfNoneMatch(), getClientAccept(),
			 * getClientParameters(), getClientBody() produce identical results
			 * regardless of whether x-forwarded-for or user-agent headers are present.
			 */
			fc.assert(
				fc.property(
					arbSourceIp,
					arbUserAgent,
					arbOtherHeaders,
					arbQueryStringParameters,
					fc.option(fc.ipV4(), { nil: undefined }),
					fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
					(sourceIp, identityUa, otherHeaders, queryParams, forwardedFor, headerUa) => {
						// Build event WITHOUT x-forwarded-for and user-agent
						const headersWithout = { ...otherHeaders };

						const eventWithout = {
							headers: headersWithout,
							requestContext: {
								identity: {
									sourceIp: sourceIp,
									userAgent: identityUa
								}
							},
							queryStringParameters: queryParams,
							body: null
						};

						// Build event WITH x-forwarded-for and user-agent
						const headersWith = { ...otherHeaders };
						if (forwardedFor !== undefined) {
							headersWith["X-Forwarded-For"] = forwardedFor;
						}
						if (headerUa !== undefined) {
							headersWith["User-Agent"] = headerUa;
						}

						const eventWith = {
							headers: headersWith,
							requestContext: {
								identity: {
									sourceIp: sourceIp,
									userAgent: identityUa
								}
							},
							queryStringParameters: queryParams,
							body: null
						};

						const riWithout = new RequestInfo(eventWithout);
						const riWith = new RequestInfo(eventWith);

						// All non-IP/UA getters must produce identical results
						expect(riWith.getClientOrigin()).toEqual(riWithout.getClientOrigin());
						expect(riWith.getClientReferrer()).toEqual(riWithout.getClientReferrer());
						expect(riWith.getClientReferrer(true)).toEqual(riWithout.getClientReferrer(true));
						expect(riWith.getClientIfModifiedSince()).toEqual(riWithout.getClientIfModifiedSince());
						expect(riWith.getClientIfNoneMatch()).toEqual(riWithout.getClientIfNoneMatch());
						expect(riWith.getClientAccept()).toEqual(riWithout.getClientAccept());
						expect(riWith.getClientParameters()).toEqual(riWithout.getClientParameters());
						expect(riWith.getClientBody()).toEqual(riWithout.getClientBody());
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2d: Null behavior when no headers and no identity", () => {

		it("Property: IP and user agent are null when no headers and no identity data", () => {
			/**
			 * Validates: Requirements 3.4
			 * 
			 * For events with no headers and no identity data,
			 * IP and user agent remain null.
			 */
			fc.assert(
				fc.property(
					arbQueryStringParameters,
					(queryParams) => {
						// Event with no headers and no identity
						const event = {
							headers: null,
							requestContext: {},
							queryStringParameters: queryParams,
							body: null
						};

						const requestInfo = new RequestInfo(event);
						expect(requestInfo.getClientIp()).toBeNull();
						expect(requestInfo.getClientUserAgent()).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("Property: IP and user agent are null when event has no requestContext", () => {
			/**
			 * Validates: Requirements 3.4
			 */
			const event = {
				headers: null,
				queryStringParameters: null,
				body: null
			};

			const requestInfo = new RequestInfo(event);
			expect(requestInfo.getClientIp()).toBeNull();
			expect(requestInfo.getClientUserAgent()).toBeNull();
		});
	});
});
