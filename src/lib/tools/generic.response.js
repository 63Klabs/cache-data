/**
 * Centralized generic response module factory.
 *
 * Encapsulates the shared STATUS_CODE_MAP, response object generation, and
 * response() lookup function used by all five format-specific generic response
 * files (HTML, JSON, RSS, Text, XML).
 *
 * @module generic.response
 */

/**
 * Map of HTTP status codes to their default message strings.
 *
 * @type {Object.<number, string>}
 */
const STATUS_CODE_MAP = {
	200: "Success",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	408: "Request Timeout",
	418: "I'm a teapot",
	427: "Too Many Requests",
	500: "Internal Server Error"
};

/**
 * Create a complete generic response module for a given content type and body formatter.
 *
 * Iterates over STATUS_CODE_MAP, calls bodyFormatter(statusCode, message) for each
 * entry, and builds the response objects. Attaches a response() function that parses
 * the status code to an integer and looks up the matching response object, falling
 * back to response500 for unknown codes.
 *
 * @param {string} contentType - MIME content type string (e.g., "application/json")
 * @param {function(number, string): *} bodyFormatter - Function that transforms (statusCode, message) into format-specific body
 * @returns {{contentType: string, headers: Object, response200: Object, response400: Object, response401: Object, response403: Object, response404: Object, response405: Object, response408: Object, response418: Object, response427: Object, response500: Object, response: function(number|string): Object}}
 * @example
 * const { createGenericResponseModule } = require("./generic.response");
 *
 * const mod = createGenericResponseModule("application/json", (statusCode, message) => ({ message }));
 * console.log(mod.response200.body); // { message: "Success" }
 * console.log(mod.response(404).statusCode); // 404
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
			body: bodyFormatter(statusCode, message)
		};
	}

	mod.response = function (statusCode) {
		statusCode = parseInt(statusCode, 10);
		return this["response" + statusCode] || this.response500;
	};

	return mod;
}

module.exports = { createGenericResponseModule };
