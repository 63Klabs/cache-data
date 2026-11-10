"use strict";
const { isIP } = require("node:net");
const DebugAndLog = require("../tools/DebugAndLog.class.js");

/** Environment variable that holds the number of trusted proxies in front of the function */
const ENV_VAR = "CACHE_DATA_TRUSTED_PROXY_HOPS";

/** Hop count used when the environment variable is unset, empty, or invalid. 0 returns identity.sourceIp, which no header can change, so a missing or wrong setting is never forgeable. */
const DEFAULT_TRUSTED_PROXY_HOPS = 0;

/** Last raw environment value seen. A Symbol never equals a real value, so the first read always parses. */
let memoRaw = Symbol("unread");

/** Hop count parsed from memoRaw */
let memoHops = DEFAULT_TRUSTED_PROXY_HOPS;

/** Raw environment values already reported with a warning */
const warnedRawValues = new Set();

/**
 * ClientIpResolver - Internal client IP resolution
 *
 * Resolves the client IP address from values a trusted proxy wrote, never from a value
 * only the client wrote. Sources are tried in this order, and the first value a step
 * produces is returned:
 *
 * 1. The `cloudfront-viewer-address` header (skipped when the hop count is 0 or 1)
 * 2. The `x-forwarded-for` header, read from the right: the entry at index
 *    `length - N`, where N is the hop count (skipped when the hop count is 0)
 * 3. `identity.sourceIp`, returned unchanged
 *
 * The hop count N is the number of trusted proxies that append to `X-Forwarded-For`
 * between the client and the Lambda function. It comes from the environment variable
 * `CACHE_DATA_TRUSTED_PROXY_HOPS` and defaults to 0, which returns `identity.sourceIp`
 * and reads neither header. `identity.sourceIp` is the client for an edge-optimized REST
 * API with no CloudFront distribution of the user's own, for a Regional REST API, and for
 * the user's own CloudFront in front of a Regional REST API (measured 2026-11-09, see
 * docs/cloudfront-notes/README.md). Only the user's own CloudFront in front of an
 * edge-optimized REST API needs a count, 3.
 *
 * A wrong count is not equally safe in both directions. A count that is too low selects
 * the address of a trusted proxy, never an entry the client wrote. A count that is too
 * high selects an entry to the left of the real chain, which the client can write: with a
 * count k higher than the real chain, a client that sends k or more extra entries chooses
 * the result, and with fewer the header is shorter than the count and the result is
 * `identity.sourceIp`.
 *
 * Every method is total: header values that are missing or not strings fall through
 * to the next step rather than throw.
 *
 * @private
 * @example
 * const ip = ClientIpResolver.resolve(
 *   { "x-forwarded-for": "198.51.100.10, 203.0.113.20" },
 *   { sourceIp: "203.0.113.20" },
 *   2
 * );
 * // ip === "198.51.100.10" with a hop count of 2
 */
class ClientIpResolver {

	/** Name of the environment variable that holds the hop count */
	static ENV_VAR = ENV_VAR;

	/** Hop count used when the environment variable is unset, empty, or invalid */
	static DEFAULT_TRUSTED_PROXY_HOPS = DEFAULT_TRUSTED_PROXY_HOPS;

	/**
	 * Resolve the client IP address and, at debug level, log how it was chosen.
	 *
	 * Never throws. An unexpected error is logged with DebugAndLog.error and null is returned.
	 *
	 * @param {Object|null|undefined} headers - Header map with every key lowercased
	 * @param {Object|null|undefined} identity - The `requestContext.identity` object
	 * @param {number} [trustedProxyHops] - Hop count to use. Defaults to the value of CACHE_DATA_TRUSTED_PROXY_HOPS (0 when unset)
	 * @returns {string|null} The client IP, or null when no step produces a value
	 * @example
	 * const ip = ClientIpResolver.resolve(
	 *   { "x-forwarded-for": "198.51.100.10, 203.0.113.30, 203.0.113.20" },
	 *   { sourceIp: "203.0.113.20" },
	 *   3
	 * );
	 * // ip === "198.51.100.10"
	 */
	static resolve(headers, identity, trustedProxyHops) {
		try {
			const { ip, step, trustedProxyHops: hops, forwardedForEntryCount } = ClientIpResolver.resolveDetailed(headers, identity, trustedProxyHops);

			// The message is built only at debug level, and holds the step name and two integers, never an address
			if (DebugAndLog.getLogLevel() >= DebugAndLog.DEBUG_LEVEL_NUM) {
				DebugAndLog.debug(`ClientIpResolver: step=${step} trustedProxyHops=${hops} xForwardedForEntries=${forwardedForEntryCount}`);
			}

			return ip;
		} catch (error) {
			DebugAndLog.error(`ClientIpResolver failed to resolve the client IP: ${error?.message || "Unknown error"}`, error?.stack);
			return null;
		}
	}

	/**
	 * Resolve the client IP address and report which step produced it.
	 *
	 * Does not log the resolution. Logs a warning, once per distinct value, when the
	 * hop count is read from an invalid environment variable.
	 *
	 * @param {Object|null|undefined} headers - Header map with every key lowercased. Anything that is not a non-null object is treated as an empty map
	 * @param {Object|null|undefined} identity - The `requestContext.identity` object. Anything that is not a non-null object is treated as an empty object
	 * @param {number} [trustedProxyHops] - Non-negative safe integer hop count. Any other value is replaced by the value of CACHE_DATA_TRUSTED_PROXY_HOPS (0 when unset)
	 * @returns {{ip: (string|null), step: string, trustedProxyHops: number, forwardedForEntryCount: number}} The IP, the step that produced it (`viewer-address`, `x-forwarded-for`, `source-ip`, or `none`), the hop count used, and the number of `x-forwarded-for` entries (0 when the header is absent)
	 * @example
	 * const result = ClientIpResolver.resolveDetailed({ "x-forwarded-for": "198.51.100.10" }, { sourceIp: "203.0.113.20" }, 1);
	 * // { ip: "198.51.100.10", step: "x-forwarded-for", trustedProxyHops: 1, forwardedForEntryCount: 1 }
	 */
	static resolveDetailed(headers, identity, trustedProxyHops) {
		const hops = (Number.isSafeInteger(trustedProxyHops) && trustedProxyHops >= 0)
			? trustedProxyHops
			: ClientIpResolver.getTrustedProxyHops();

		const headerMap = (headers !== null && typeof headers === "object") ? headers : {};
		const identityMap = (identity !== null && typeof identity === "object") ? identity : {};

		// >! Step 1 runs only when at least two proxies are trusted. CloudFront dropped a viewer-supplied CloudFront-Viewer-Address in front of an edge-optimized API, but a Regional API with no CloudFront delivered it unchanged, so with fewer hops the header can be forged
		const viewerIp = (hops >= 2) ? ClientIpResolver.parseViewerAddress(headerMap["cloudfront-viewer-address"]) : null;

		// The entry count is computed even when step 1 wins, so the debug line can always report it
		const forwarded = ClientIpResolver.selectForwardedFor(headerMap["x-forwarded-for"], hops);

		if (viewerIp !== null) {
			return { ip: viewerIp, step: "viewer-address", trustedProxyHops: hops, forwardedForEntryCount: forwarded.entryCount };
		}

		if (forwarded.ip !== null) {
			return { ip: forwarded.ip, step: "x-forwarded-for", trustedProxyHops: hops, forwardedForEntryCount: forwarded.entryCount };
		}

		if (identityMap.sourceIp !== null && identityMap.sourceIp !== undefined) {
			return { ip: identityMap.sourceIp, step: "source-ip", trustedProxyHops: hops, forwardedForEntryCount: forwarded.entryCount };
		}

		return { ip: null, step: "none", trustedProxyHops: hops, forwardedForEntryCount: forwarded.entryCount };
	}

	/**
	 * Get the hop count from the CACHE_DATA_TRUSTED_PROXY_HOPS environment variable.
	 *
	 * Reads the variable on every call, so a change is seen on the next call. The parsed
	 * result is cached against the raw string, so an unchanged value is not parsed again.
	 * An invalid value gives the default of 0 and one DebugAndLog.warn per distinct raw
	 * value. Never throws because of the variable's value.
	 *
	 * @returns {number} The hop count: 0 or more, or 0 when the variable is unset, empty, or invalid
	 * @example
	 * process.env.CACHE_DATA_TRUSTED_PROXY_HOPS = "3";
	 * const hops = ClientIpResolver.getTrustedProxyHops();
	 * // hops === 3
	 */
	static getTrustedProxyHops() {
		const rawValue = process.env[ENV_VAR];

		if (rawValue === memoRaw) {
			return memoHops;
		}

		const parsed = ClientIpResolver.parseTrustedProxyHops(rawValue);
		memoRaw = rawValue;
		memoHops = parsed.trustedProxyHops;

		if (!parsed.isValid && !warnedRawValues.has(rawValue)) {
			warnedRawValues.add(rawValue);
			// >! JSON.stringify escapes quotes and control characters, so an environment value can't forge or split the log line
			DebugAndLog.warn(`${ENV_VAR} must be a non-negative integer. Received ${JSON.stringify(rawValue)}. Using the default of ${DEFAULT_TRUSTED_PROXY_HOPS}.`);
		}

		return memoHops;
	}

	/**
	 * Parse a raw CACHE_DATA_TRUSTED_PROXY_HOPS value. Pure: reads no state and logs nothing.
	 *
	 * An undefined value, or a string that is empty after trimming, gives the default.
	 * A trimmed string made only of the digits 0 to 9 gives that number in base 10.
	 * Anything else gives the default and is marked invalid.
	 *
	 * @param {string|undefined} rawValue - The raw environment value
	 * @returns {{trustedProxyHops: number, isValid: boolean}} The hop count and whether the raw value was acceptable
	 * @example
	 * ClientIpResolver.parseTrustedProxyHops(" 3 ");   // { trustedProxyHops: 3, isValid: true }
	 * ClientIpResolver.parseTrustedProxyHops("abc");   // { trustedProxyHops: 0, isValid: false }
	 */
	static parseTrustedProxyHops(rawValue) {
		if (rawValue === undefined) {
			return { trustedProxyHops: DEFAULT_TRUSTED_PROXY_HOPS, isValid: true };
		}

		if (typeof rawValue !== "string") {
			return { trustedProxyHops: DEFAULT_TRUSTED_PROXY_HOPS, isValid: false };
		}

		const trimmed = rawValue.trim();

		if (trimmed === "") {
			return { trustedProxyHops: DEFAULT_TRUSTED_PROXY_HOPS, isValid: true };
		}

		if (/^[0-9]+$/.test(trimmed)) {
			return { trustedProxyHops: Number.parseInt(trimmed, 10), isValid: true };
		}

		return { trustedProxyHops: DEFAULT_TRUSTED_PROXY_HOPS, isValid: false };
	}

	/**
	 * Parse the value of the CloudFront-Viewer-Address header into an IP address.
	 *
	 * Port first: the trimmed value is split at its last colon. When the part after it is
	 * 1 to 5 decimal digits and the part before it (with one pair of square brackets
	 * removed) is a valid IP, that address is returned. Otherwise the whole trimmed value
	 * is returned if it is a valid IP. The port is checked for format only, not range.
	 *
	 * A bare IPv6 address whose text minus its last group is itself a valid IP (such as
	 * `::1:2`) is read as an address with a port.
	 *
	 * @param {*} value - The header value
	 * @returns {string|null} The IP address without a port, or null when the value is not a string or holds no valid IP
	 * @example
	 * ClientIpResolver.parseViewerAddress("198.51.100.10:46532");   // "198.51.100.10"
	 * ClientIpResolver.parseViewerAddress("[2001:db8::1]:60776");   // "2001:db8::1"
	 * ClientIpResolver.parseViewerAddress("garbage");               // null
	 */
	static parseViewerAddress(value) {
		if (typeof value !== "string") {
			return null;
		}

		const trimmed = value.trim();
		const lastColon = trimmed.lastIndexOf(":");

		if (lastColon > 0) {
			const port = trimmed.slice(lastColon + 1);
			let host = trimmed.slice(0, lastColon);

			if (host.startsWith("[") && host.endsWith("]")) {
				host = host.slice(1, -1);
			}

			if (/^[0-9]{1,5}$/.test(port) && isIP(host)) {
				return host;
			}
		}

		return (isIP(trimmed) ? trimmed : null);
	}

	/**
	 * Select the client entry from an X-Forwarded-For value by counting from the right.
	 *
	 * The value is split on commas and each entry is trimmed. Empty entries keep their
	 * positions. The entry at index `length - trustedProxyHops` is returned if it is a
	 * valid IP. No entry is selected when the hop count is below 1, when there are fewer
	 * entries than the hop count, or when the selected entry is not a valid IP.
	 *
	 * @param {*} value - The header value
	 * @param {number} trustedProxyHops - Number of trusted proxies that append to the header
	 * @returns {{ip: (string|null), entryCount: number}} The selected IP (or null) and the number of entries (0 when the value is not a string)
	 * @example
	 * ClientIpResolver.selectForwardedFor("192.0.2.1, 198.51.100.10, 203.0.113.20", 2);
	 * // { ip: "198.51.100.10", entryCount: 3 }
	 */
	static selectForwardedFor(value, trustedProxyHops) {
		if (typeof value !== "string") {
			return { ip: null, entryCount: 0 };
		}

		const entries = value.split(",").map((entry) => entry.trim());
		const entryCount = entries.length;

		if (!(trustedProxyHops >= 1) || entryCount < trustedProxyHops) {
			return { ip: null, entryCount };
		}

		// >! Read from the right: proxies append to the end of the header, so entries on the left may have been written by the client
		const candidate = entries[entryCount - trustedProxyHops];

		return { ip: (isIP(candidate) ? candidate : null), entryCount };
	}
}

module.exports = ClientIpResolver;
