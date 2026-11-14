/**
 * Centralized generic response module factory.
 *
 * Encapsulates the shared STATUS_CODE_MAP, response object generation, and
 * response() lookup function used by all five format-specific generic response
 * files (HTML, JSON, RSS, Text, XML).
 *
 * A status code with no template of its own uses the template of its class:
 * 2xx uses response200, 4xx uses response400, 5xx uses response500, and
 * 100-199, 205 and 300-399 use response204, which has a null body. Any other
 * value uses response500. response427 is deprecated (427 is not a registered
 * HTTP status); use response429.
 *
 * @module generic.response
 */

const DebugAndLog = require("./DebugAndLog.class");

/**
 * Map of HTTP status codes to their default message strings.
 *
 * @type {Object.<number, string>}
 */
const STATUS_CODE_MAP = {
	200: "Success",
	201: "Created",
	202: "Accepted",
	204: "No Content",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	408: "Request Timeout",
	409: "Conflict",
	418: "I'm a teapot",
	422: "Unprocessable Content",
	427: "Too Many Requests",
	429: "Too Many Requests",
	500: "Internal Server Error",
	503: "Service Unavailable"
};

/**
 * Status codes whose template has a null body. The body formatter is not called for them.
 * RFC 9110 sections 15.3.5 and 15.4.5 say a 204 and a 304 cannot contain content.
 *
 * @type {Set<number>}
 */
const NO_BODY_STATUS_CODES = new Set([204]);

const DEPRECATED_427_MESSAGE = "response427 is deprecated: 427 is not a registered HTTP status. Use response429 (Too Many Requests). response427 is kept through all of v1.x.";

let deprecation427Logged = false;

/**
 * Name the template that stands in for a status code that has none.
 *
 * @private
 * @param {number} code - Parsed status code (may be NaN)
 * @returns {string} Name of the template property
 * @example
 * fallbackTemplateName(410); // "response400"
 */
function fallbackTemplateName(code) {
	if ((code >= 100 && code < 200) || code === 205 || (code >= 300 && code < 400)) {
		return "response204";
	}
	if (code >= 200 && code < 300) {
		return "response200";
	}
	if (code >= 400 && code < 500) {
		return "response400";
	}
	return "response500";
}

/**
 * Log the one-time deprecation warning for response427. Never throws.
 *
 * @private
 * @returns {void}
 * @example
 * warnDeprecated427();
 */
function warnDeprecated427() {
	if (deprecation427Logged) {
		return;
	}
	deprecation427Logged = true;
	try {
		const result = DebugAndLog.warn(DEPRECATED_427_MESSAGE);
		if (result && typeof result.catch === "function") {
			result.catch(() => {});
		}
	} catch {
		// A logging failure must not change the response that is returned
	}
}

/**
 * Create a complete generic response module for a given content type and body formatter.
 *
 * Iterates over STATUS_CODE_MAP, calls bodyFormatter(statusCode, message) for each
 * entry, and builds the response objects. The response204 template has a null body
 * and the formatter is not called for it. Attaches a response() function that parses
 * the status code to an integer and returns the matching response object. A status
 * code with no template uses the template of its class: 2xx uses response200, 4xx
 * uses response400, 5xx uses response500, and 100-199, 205 and 300-399 use
 * response204 (no body). Any other value uses response500. The returned object is
 * the template itself, so its statusCode is the template's, not the requested code.
 * response427 is deprecated because 427 is not a registered HTTP status; use
 * response429. The first time response() resolves 427, a one-time warning is logged.
 *
 * @param {string} contentType - MIME content type string (e.g., "application/json")
 * @param {function(number, string): *} bodyFormatter - Function that transforms (statusCode, message) into format-specific body
 * @returns {{contentType: string, headers: Object, response200: Object, response201: Object, response202: Object, response204: Object, response400: Object, response401: Object, response403: Object, response404: Object, response405: Object, response408: Object, response409: Object, response418: Object, response422: Object, response427: Object, response429: Object, response500: Object, response503: Object, response: function(number|string): Object}}
 * @example
 * const { createGenericResponseModule } = require("./generic.response");
 *
 * const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));
 * console.log(mod.response201.body); // { message: "Created" }
 * console.log(mod.response204.body); // null
 * console.log(mod.response(404).statusCode); // 404
 * console.log(mod.response(410) === mod.response400); // true: no response410, so the 4xx template is used
 * console.log(mod.response(301) === mod.response204); // true: redirects have no template, so no body
 */
function createGenericResponseModule(contentType, bodyFormatter) {
	const headers = { "Content-Type": contentType };

	const mod = {
		contentType: contentType,
		headers: headers
	};

	for (const code in STATUS_CODE_MAP) {
		const statusCode = parseInt(code, 10);
		const message = STATUS_CODE_MAP[code];
		mod["response" + statusCode] = {
			statusCode: statusCode,
			headers: headers,
			body: NO_BODY_STATUS_CODES.has(statusCode) ? null : bodyFormatter(statusCode, message)
		};
	}

	mod.response = function (statusCode) {
		const code = parseInt(statusCode, 10);
		const direct = this["response" + code];
		if (direct) {
			if (code === 427) {
				warnDeprecated427();
			}
			return direct;
		}
		return this[fallbackTemplateName(code)] || this.response500;
	};

	return mod;
}

module.exports = { createGenericResponseModule };
