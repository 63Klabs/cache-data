const { statusCodes } = require("../models/static-data/index.js");
const { tools: {DebugAndLog} } = require("@63klabs/cache-data");

const referrers = [
	"63klabs.net",
	"chadkluck.net",
];

const isString = (value) => {
	return typeof value === "string";
};

const isStringOfNumbers = (value) => {
	// using regex, check if all the characters are digits
	return /^\d+$/.test(value);
};

// validate organizationCode based on Config.getSettings('orgCodes') which has an array of organization_code and name pairs
// returns true if organizationCode is found in the array, false otherwise
// used in the organizationCode route handler to validate the organizationCode parameter
const statusCodePathParameter = (code) => {
	if (!Array.isArray(statusCodes) || statusCodes.length < 1) {
		DebugAndLog.error("No status codes found in the application's static data folder '/models/static-data'!");
		return false;
	}
	if (!code) return false;
	if (!isString(code)) return false;
	if (code.length === 0) return false;
	return statusCodes.some((statusCode) => statusCode.code === code);
};

/**
 * Ensure id is in 'G-<8-char-hex>' format
 * @param {string} id - The id to validate
 * @returns {boolean} - True if the id is valid, false otherwise
 */
const idPathParameter = (id) => {
	if (!id) return false;
	if (!id.match(/^G\-[a-f0-9]{8}$/)) return false;
	return true;
};

/**
 * Ensure players is a number between 1 and 10
 * @param {string} players - The players to validate
 * @returns {boolean} - True if the players is valid, false otherwise
 */
const playersQueryParameter = (players) => {
	if (!players) return false;
	if (!isStringOfNumbers(players)) return false;
	if (players < 1 || players > 10) return false;
	return true;
};

/**
 * The exported alias must match the parameter name in the request coming in.
 * The Request object will automatically validate the parameter based on the function name and exclude any request parameter that does not have a check.
 * You can define and re-use simple checks such as isString for multiple parameters if that is all you need.
 */
module.exports = {
	referrers,
	parameters: {
		pathParameters: {
			code: statusCodePathParameter,
			id: idPathParameter,
		},
		queryParameters: {
			players: playersQueryParameter,
		},
		// headerParameters: {},
		// cookieParameters: {},
		// bodyParameters: {},	
	}
};
