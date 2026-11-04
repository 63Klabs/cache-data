import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/* ****************************************************************************
 * RequestInfo / ClientRequest client IP tests
 * Feature: 1-4-1-trusted-client-ip
 *
 * Purpose: Verify, through the public API only (RequestInfo.getClientIp(),
 * RequestInfo.getClientIP(), ClientRequest.getProps().client.ip), how the
 * client IP is chosen, and that the other client fields are unchanged.
 *
 * - describe("preservation"): behavior that is the same before and after the
 *   change. These pass on the current code.
 * - describe("fixed behavior"): behavior introduced by this feature. These fail
 *   on the code before the change and pass after it.
 *
 * Setup:
 * - CACHE_DATA_TRUSTED_PROXY_HOPS is deleted before each test so the default
 *   hop count (2) applies. process.env is saved and restored.
 *
 * Addresses: documentation ranges only (192.0.2.0/24, 198.51.100.0/24,
 * 203.0.113.0/24).
 *
 * Validates: Requirements 1.5, 2.1, 4.5, 5.1, 11.5
 *
 * Related Tests:
 * - test/request/request-info-forwarded-for-preservation-tests.jest.mjs
 * - test/request/request-info-forwarded-for-bug-exploration-tests.jest.mjs
 * ************************************************************************** */

const RequestInfo = (await import('../../../../src/lib/tools/RequestInfo.class.js')).default;
const { ClientRequest } = await import('../../../../src/lib/tools/index.js');
const { testEventA } = await import('../../../helpers/test-event.js');
const { testContextA } = await import('../../../helpers/test-context.js');
const { testValidationsA } = await import('../../../helpers/test-validations.js');

ClientRequest.init({ validations: testValidationsA });

const HOPS_ENV_VAR = "CACHE_DATA_TRUSTED_PROXY_HOPS";

// Documentation range addresses
const FORGED_IP = "192.0.2.1";
const VIEWER_IP = "198.51.100.10";
const EDGE_IP = "203.0.113.30";
const PROXY_IP = "203.0.113.20";
const SOURCE_IP = "198.51.100.1";

/**
 * Build an API Gateway REST event.
 *
 * @param {object} headers - Request headers (any key casing)
 * @param {*} sourceIp - Value for requestContext.identity.sourceIp
 * @returns {object} Event
 */
function buildEvent(headers, sourceIp = SOURCE_IP) {
	return {
		resource: "/items",
		path: "/items",
		httpMethod: "GET",
		headers,
		pathParameters: null,
		queryStringParameters: null,
		requestContext: {
			identity: { sourceIp, userAgent: "identity-agent" },
			resourcePath: "/items",
			httpMethod: "GET"
		},
		body: null,
		isBase64Encoded: false
	};
}

/**
 * Get the client IP three ways: RequestInfo.getClientIp(), RequestInfo.getClientIP(),
 * and ClientRequest.getProps().client.ip.
 *
 * @param {object} event - API Gateway event
 * @returns {{info: *, infoUpper: *, props: *}} The three results
 */
function clientIpsFor(event) {
	const info = new RequestInfo(event);
	// ClientRequest needs a referrer or origin to be present; add one without touching the IP headers
	const withReferer = {
		...event,
		headers: { Referer: "https://internal.example.com/dev", ...(event.headers || {}) }
	};
	const request = new ClientRequest(withReferer, testContextA);
	return {
		info: info.getClientIp(),
		infoUpper: info.getClientIP(),
		props: request.getProps().client.ip
	};
}

/**
 * List every file under a directory, recursively.
 *
 * @param {string} directory - Absolute directory path
 * @returns {Array<string>} Absolute file paths
 */
function listFilesRecursively(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFilesRecursively(entryPath));
		} else if (entry.isFile()) {
			files.push(entryPath);
		}
	}
	return files;
}

describe("RequestInfo client IP", () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		delete process.env[HOPS_ENV_VAR];
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
	});

	describe("preservation", () => {

		it("returns identity.sourceIp when there is no x-forwarded-for header", () => {
			const event = buildEvent({ "User-Agent": "Mozilla/5.0" });
			const ips = clientIpsFor(event);
			expect(ips.info).toBe(SOURCE_IP);
			expect(ips.infoUpper).toBe(SOURCE_IP);
			expect(ips.props).toBe(SOURCE_IP);
		});

		it("returns identity.sourceIp for the shared test event", () => {
			const ips = clientIpsFor(testEventA);
			const expected = testEventA.requestContext.identity.sourceIp;
			expect(ips.info).toBe(expected);
			expect(ips.props).toBe(expected);
		});

		it("returns identity.sourceIp when x-forwarded-for is null or empty", () => {
			expect(clientIpsFor(buildEvent({ "X-Forwarded-For": null })).info).toBe(SOURCE_IP);
			expect(clientIpsFor(buildEvent({ "X-Forwarded-For": "" })).info).toBe(SOURCE_IP);
		});

		it("returns identity.sourceIp when the event has no headers", () => {
			const event = buildEvent({});
			delete event.headers;
			expect(new RequestInfo(event).getClientIp()).toBe(SOURCE_IP);

			const nullHeaders = buildEvent(null);
			expect(new RequestInfo(nullHeaders).getClientIp()).toBe(SOURCE_IP);
		});

		it("returns null when there is no header and no sourceIp", () => {
			const event = buildEvent({}, null);
			expect(new RequestInfo(event).getClientIp()).toBeNull();

			const noIdentity = buildEvent({});
			delete noIdentity.requestContext.identity;
			expect(new RequestInfo(noIdentity).getClientIp()).toBeNull();
		});

		it("keeps the user agent from the user-agent header, ahead of identity.userAgent", () => {
			const event = buildEvent({ "User-Agent": "Mozilla/5.0", Referer: "https://internal.example.com/dev" });
			const info = new RequestInfo(event);
			expect(info.getClientUserAgent()).toBe("Mozilla/5.0");
			expect(new ClientRequest(event, testContextA).getClientUserAgent()).toBe("Mozilla/5.0");
		});

		it("falls back to identity.userAgent when there is no user-agent header", () => {
			const info = new RequestInfo(buildEvent({}));
			expect(info.getClientUserAgent()).toBe("identity-agent");
		});

		it("keeps the origin", () => {
			const info = new RequestInfo(buildEvent({ Origin: "https://app.example.com" }));
			expect(info.getClientOrigin()).toBe("https://app.example.com");
		});

		it("keeps the referrer without its query string, and falls back to the origin", () => {
			const withReferer = new RequestInfo(buildEvent({
				Referer: "https://internal.example.com/dev?token=abc",
				Origin: "https://app.example.com"
			}));
			expect(withReferer.getClientReferrer(true)).toBe("https://internal.example.com/dev");
			expect(withReferer.getClientReferrer()).toBe("internal.example.com");

			const originOnly = new RequestInfo(buildEvent({ Origin: "https://app.example.com" }));
			expect(originOnly.getClientReferrer(true)).toBe("https://app.example.com");

			const shared = new RequestInfo(testEventA);
			expect(shared.getClientReferrer(true)).toBe("https://internal.example.com/dev");
		});

		it("keeps ifModifiedSince and ifNoneMatch", () => {
			const info = new RequestInfo(buildEvent({
				"If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT",
				"If-None-Match": "\"etag-1\""
			}));
			expect(info.getClientIfModifiedSince()).toBe("Wed, 21 Oct 2015 07:28:00 GMT");
			expect(info.getClientIfNoneMatch()).toBe("\"etag-1\"");

			const none = new RequestInfo(buildEvent({}));
			expect(none.getClientIfModifiedSince()).toBeNull();
			expect(none.getClientIfNoneMatch()).toBeNull();
		});

		it("keeps accept", () => {
			const info = new RequestInfo(buildEvent({ Accept: "application/json" }));
			expect(info.getClientAccept()).toBe("application/json");
			expect(new RequestInfo(testEventA).getClientAccept()).toBe("application/json");
			expect(new RequestInfo(buildEvent({})).getClientAccept()).toBeNull();
		});
	});

	describe("fixed behavior", () => {

		it("ignores a forged leftmost x-forwarded-for entry (T1 chain, default hop count)", () => {
			const event = buildEvent({
				"X-Forwarded-For": `${FORGED_IP}, ${VIEWER_IP}, ${PROXY_IP}`
			}, PROXY_IP);
			const ips = clientIpsFor(event);
			expect(ips.info).toBe(VIEWER_IP);
			expect(ips.infoUpper).toBe(VIEWER_IP);
			expect(ips.props).toBe(VIEWER_IP);
		});

		it("does not return a one-entry x-forwarded-for chain, and falls back to identity.sourceIp", () => {
			const event = buildEvent({ "X-Forwarded-For": FORGED_IP });
			const ips = clientIpsFor(event);
			expect(ips.info).toBe(SOURCE_IP);
			expect(ips.props).toBe(SOURCE_IP);
		});

		it("reads x-forwarded-for from the right when the header name has mixed case", () => {
			const event = buildEvent({
				"x-FORWARDED-for": `${FORGED_IP}, ${FORGED_IP}, ${VIEWER_IP}, ${PROXY_IP}`
			}, PROXY_IP);
			expect(new RequestInfo(event).getClientIp()).toBe(VIEWER_IP);
		});

		it("uses a mixed-case CloudFront-Viewer-Address header ahead of x-forwarded-for", () => {
			const event = buildEvent({
				"CloudFront-Viewer-Address": `${VIEWER_IP}:46532`,
				"X-Forwarded-For": `${FORGED_IP}, ${EDGE_IP}, ${PROXY_IP}`
			}, PROXY_IP);
			const ips = clientIpsFor(event);
			expect(ips.info).toBe(VIEWER_IP);
			expect(ips.props).toBe(VIEWER_IP);
		});

		it("reads a bracketed IPv6 CloudFront-Viewer-Address with a port", () => {
			const event = buildEvent({
				"cLoUdFrOnT-vIeWeR-aDdReSs": "[2001:db8::1]:60776"
			});
			expect(new RequestInfo(event).getClientIp()).toBe("2001:db8::1");
		});

		it("skips CloudFront-Viewer-Address when the hop count is 1", () => {
			process.env[HOPS_ENV_VAR] = "1";
			const event = buildEvent({
				"CloudFront-Viewer-Address": `${FORGED_IP}:443`,
				"X-Forwarded-For": VIEWER_IP
			});
			expect(new RequestInfo(event).getClientIp()).toBe(VIEWER_IP);
		});

		it("selects the viewer from a T2 chain when the hop count is 3", () => {
			process.env[HOPS_ENV_VAR] = "3";
			const event = buildEvent({
				"X-Forwarded-For": `${FORGED_IP}, ${VIEWER_IP}, ${EDGE_IP}, ${PROXY_IP}`
			}, EDGE_IP);
			expect(new RequestInfo(event).getClientIp()).toBe(VIEWER_IP);
		});

		it("falls back to identity.sourceIp when the selected x-forwarded-for entry is not an IP", () => {
			const event = buildEvent({
				"X-Forwarded-For": `${FORGED_IP}, not-an-ip, ${PROXY_IP}`
			}, PROXY_IP);
			expect(new RequestInfo(event).getClientIp()).toBe(PROXY_IP);
		});

		it("RequestInfo.class.js source no longer contains x-forwarded-for", () => {
			const sourcePath = fileURLToPath(new URL('../../../../src/lib/tools/RequestInfo.class.js', import.meta.url));
			const source = readFileSync(sourcePath, 'utf8');
			// Case-sensitive on the lowercase header key the old selection logic used.
			expect(source.includes("x-forwarded-for")).toBe(false);
		});

		it("does not mention ClientIpResolver in src/index.js or src/lib/tools/index.js", () => {
			const entryPoints = ['../../../../src/index.js', '../../../../src/lib/tools/index.js'];
			for (const relativePath of entryPoints) {
				const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
				expect(readFileSync(filePath, 'utf8').includes("ClientIpResolver")).toBe(false);
			}
		});

		it("does not mention ClientIpResolver in any file under types/", () => {
			const typesDir = fileURLToPath(new URL('../../../../types', import.meta.url));
			const typeFiles = listFilesRecursively(typesDir);
			// Guard against a vacuous pass if the directory moves or is empty
			expect(typeFiles.length).toBeGreaterThan(0);
			expect(typeFiles.some((filePath) => filePath.endsWith(".d.ts"))).toBe(true);
			const mentions = typeFiles.filter((filePath) => readFileSync(filePath, 'utf8').includes("ClientIpResolver"));
			expect(mentions).toEqual([]);
		});
	});
});
