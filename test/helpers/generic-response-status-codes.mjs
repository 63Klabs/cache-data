/**
 * Shared constants for the generic response tests.
 *
 * Every value here is a literal written by hand. None is read from or derived
 * from the source under test (`src/lib/tools/generic.response*.js`), so the
 * list is an independent oracle: if the source gains or loses a template, the
 * drift guard tests that import this file fail.
 *
 * Used by:
 * - test/response/generic-response-module-tests.jest.mjs
 * - test/response/generic-response-module-property-tests.jest.mjs
 * - test/response/generic-response-class-fallback-tests.jest.mjs
 * - test/response/generic-response-class-fallback-property-tests.jest.mjs
 */

/**
 * Every status code that has its own `response<code>` template (seventeen codes).
 */
export const LISTED_STATUS_CODES = [200, 201, 202, 204, 400, 401, 403, 404, 405, 408, 409, 418, 422, 427, 429, 500, 503];

/**
 * Listed status codes whose template body is `null` (no formatter call).
 */
export const NO_BODY_CODES = [204];

/**
 * Message used in the body of each listed template. 427 is the deprecated
 * misspelling of 429 and carries the same message.
 */
export const STATUS_CODE_MESSAGES = {
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
 * Listed codes in the 2xx range.
 */
export const SUCCESS_CODES = LISTED_STATUS_CODES.filter((code) => code >= 200 && code <= 299);

/**
 * Listed codes at or above 400.
 */
export const ERROR_CODES = LISTED_STATUS_CODES.filter((code) => code >= 400);

/**
 * Inclusive ranges of unlisted codes that fall back to the bodiless
 * `response204` template (1xx and 3xx).
 */
export const BODILESS_FALLBACK_RANGES = [[100, 199], [300, 399]];

/**
 * Unlisted codes outside the ranges above that also fall back to the bodiless
 * `response204` template (205 Reset Content).
 */
export const BODILESS_FALLBACK_EXTRA_CODES = [205];
