
const crypto = require("crypto"); // included by aws so don't need to add to package.json

/* *****************************************************************************
   -----------------------------------------------------------------------------
   HELPER FUNCTIONS
   -----------------------------------------------------------------------------
*/

const printMsg = function() {
	console.log("This is a message from the demo package");
};

/**
 * Given a secret string, returns a string padded out at the beginning
 * with * or passed character leaving only the specified number of characters unobfuscated.
 * 
 * For example, if 123456789123456 was passed with default keep, padding character, and length,
 * ******3456 would be returned.
 * 
 * No more than 25% of the string, or 6 characters may be kept, whichever is lesser.
 * @param {string} str The secret string to obfuscate
 * @param {Object} options
 * @param {number} options.keep The number of characters to keep unobfuscated on the end. 4 is default
 * @param {string} options.char The character to pad out with. '*' is default
 * @param {number} options.len Length of the result string
 * @returns Last few characters padded by * or (passed character) from start
 */
const obfuscate = function(str, options = {}) {
	if ( !( "keep" in options) ) { options.keep = 4; }
	if ( !( "char" in options) ) { options.char = '*'; }
	if ( !( "len" in options)  ) { options.len = 10; }

	// don't show more than 25% of the string, and show no more than a max of 6;
	if ((options.keep / str.length) > .25 || str.length <= 6) { options.keep = Math.min(Math.ceil(str.length * .25), 6); }

	// we allow any length greater than padding of 4
	if ( options.keep + 4 > options.len ) { options.len = options.keep + 4; }

	return str.slice(-options.keep).padStart(options.len, options.char);
};

/**
 * Given an object such as a Lambda event which may hold secret keys in the query string or 
 * Authorization headers, it will attempt to find and obfuscate them. It searches for any object keys,
 * string patterns that have 'key', 'secret', or 'token' in the label and obfuscates its value.
 * @param {Object} obj The object to sanitize
 * @returns {Object} A sanitized object
 */
const sanitize = function (obj) {

	const MAX_INPUT_LENGTH = 200000; // Adjustable

	let sanitizedObj = {};

	// If obj is already a string, convert it to an object
	if (typeof obj === 'string') {
		try {
			obj = JSON.parse(obj);
		} catch(e) {
			// If it's not JSON, wrap it in an object
			obj = { value: obj };
		}
	}
	
	try {

		// convert object to a string which is much easier to perform a search/replace on and we avoid changing original
		let strObj = JSON.stringify(obj);
		
		/**
		 * Find and replace secret values for secrets, keys, tokens, and authorization headers
		 * @param {string} strObj 
		 * @returns stringified object with secret values replaced (except arrays)
		 */
		const sanitizeRoundOne = function (strObj) {

			/* 
			This regex will produce 2 groups for each match. 
			Group 1 will have object key/values and = param value pairs from strings such as query strings.
			Group 2 will have authorization header keys 
			View/Edit this regex: https://regex101.com/r/IJp35p/3
			*/
			const regex1 = new RegExp(/(?:"?[a-z0-9_\-]*(?:key|secret|token)[a-z0-9_\-]*"?\s*(?::|=)\s*\"?(?!null|true|false)([a-z0-9+_:\.\-\/]+)|"Authorization":"[a-z0-9+:_\-\/]+\s(.*?(?<!\\)(?=")))/, "gi");

			// find matches
			let matches = strObj.matchAll(regex1);

			/* 
			We will do a loop, sort, then another loop, 
			but we don't expect 100s of matches anyway.
			*/

			// simplify the array of matches
			let matchList = [];
			for (const match of matches) {
				let segment = match[0];
				let secret = (match[1] !== undefined) ? match[1] : match[2]; // we only expect a result in Group 1 or Group 2, not both
				matchList.push({ segment, secret});
			}
		
			// sort so we are replacing the largest strings first
			matchList.sort(function (a, b) {
				return b.segment.length - a.segment.length;
			});
		
			// Perform replacecements
			for (const match of matchList) {
		
				/* 
				Determine if we should obfuscate as string or number 
				If we have an object such as: { pin:37832481234 }
				We will get a JSON parse error if we replace a number as *****1234
				So we need to replace it as a number such as 99999991234 so that
				when it parses from a string back to an object it looks like: { pin:99999991234 }
				However, we want to treat strings as strings:
				{ pin:"3783281234" } => { pin:"**********1234" }
				*/

				// see if character right before secret is : (stringify will place a number right after : without quotes, and we'll ignore =)
				let obf = (match.segment.charAt(match.segment.length - match.secret.length-1) === ':') 
					? obfuscate(match.secret, {char: 9}) // pad with 9
					: obfuscate(match.secret); // pad normally
		
				/* 
				2 steps. Replace secret in match, then replace match in strObj
				This ensures we keep the stringified object true to form for 
				converting back to obj
				*/
				let str = match.segment.replace(match.secret, obf); // replace secret in match
				strObj = strObj.replace(match.segment, str); // find the old match and replace it with the new one

			}

			return strObj;
		};

		const sanitizeRoundOneAlpha = function (strObj) {
			// Early validation
			if (typeof strObj !== 'string' || strObj.length > MAX_INPUT_LENGTH) {
				throw new Error('Input exceeds maximum allowed length or is not a string');
			}

			// Split the regex into two separate patterns for better control
			const keyPattern = new RegExp(
				/"?[a-z0-9_\-]{0,50}(?:key|secret|token)[a-z0-9_\-]{0,50}"?\s{0,10}(?::|=)\s{0,10}"?(?!null|true|false)([a-z0-9+_:\.\-\/]{1,500})/,
				"gi"
			);
			
			const authPattern = new RegExp(
				/"Authorization":"[a-z0-9+:_\-\/]{1,100}\s([^"\\]{1,400})(?<!\\)"/,
				"gi"
			);

			try {
				// Process matches in batches
				let matchList = [];
				
				// Process key/secret/token matches
				for (const match of strObj.matchAll(keyPattern)) {
					if (match[1] && match[1].length <= 500) {
						matchList.push({
							segment: match[0],
							secret: match[1]
						});
					}
				}

				// Process Authorization matches
				for (const match of strObj.matchAll(authPattern)) {
					if (match[1] && match[1].length <= 400) {
						matchList.push({
							segment: match[0],
							secret: match[1]
						});
					}
				}

				// Sort by length (largest first) to prevent partial replacements
				matchList.sort((a, b) => b.segment.length - a.segment.length);

				// Process replacements
				for (const match of matchList) {
					const isNumber = match.segment.charAt(
						match.segment.length - match.secret.length - 1
					) === ':';

					const obf = isNumber 
						? obfuscate(match.secret, {char: 9})
						: obfuscate(match.secret);

					const str = match.segment.replace(match.secret, obf);
					strObj = strObj.replace(match.segment, str);
				}

				return strObj;

			} catch (error) {
				console.error('Sanitization failed:', error);
				return strObj; // Return original if processing fails
			}
		};

		const sanitizeRoundOneBeta = function (strObj) {
			if (typeof strObj !== 'string' || strObj.length > MAX_INPUT_LENGTH) {
				throw new Error('Invalid input');
			}
		
			try {
				const obj = JSON.parse(strObj);
				
				const sanitizeValue = (key, value) => {
					if (typeof value !== 'string') return value;
					
					// Check for sensitive keys
					if (typeof key === 'string' && 
						(key.toLowerCase().includes('key') || 
						 key.toLowerCase().includes('secret') || 
						 key.toLowerCase().includes('token'))) {
						return obfuscate(value);
					}
					
					// Check Authorization
					if (key === 'Authorization' && typeof value === 'string') {
						const parts = value.split(' ');
						if (parts.length > 1) {
							return `${parts[0]} ${obfuscate(parts.slice(1).join(' '))}`;
						}
					}
					
					return value;
				};
		
				const sanitized = JSON.stringify(obj, (key, value) => sanitizeValue(key, value));
				return sanitized;
		
			} catch (e) {
				// If JSON parsing fails, fall back to regex approach
				return strObj;
			}
		};
		
		
		/**
		 * Find secret, key, and token arrays in stringified object
		 * @param {string} strObj 
		 * @returns stringified object with array of secrets replaced
		 */

		const sanitizeRoundTwo = function(strObj) {
			// Early length check to prevent ReDoS
			if (typeof strObj !== 'string' || strObj.length > MAX_INPUT_LENGTH) {
				strObj = JSON.stringify({message: 'Input exceeds maximum allowed length'});
			} else {

				// More specific pattern with limited repetition
				const regex2 = new RegExp(
					/\"[a-z0-9_\-]{0,50}(?:key|secret|token)[a-z0-9_\-]{0,50}\":\[([^\[\]]{0,1000})\]/,
					"gi"
				);
				
				// Simpler pattern for splitting
				const regex3 = new RegExp(/[^,\"]{1,100}/, "gi");

				// find matches
				let arrayMatches = Array.from(strObj.matchAll(regex2));

				// simplify the array of matches
				let matchList2 = arrayMatches.map(match => ({
					segment: match[0],
					secrets: match[1]
				}));

				// sort so we are replacing the largest strings first
				matchList2.sort((a, b) => b.segment.length - a.segment.length);

				for (const match of matchList2) {
					// Add length check for individual matches
					if (match.secrets.length > 1000) {
						continue; // Skip overly long matches
					}

					let secrets = Array.from(match.secrets.matchAll(regex3));
					let list = secrets.map(secret => obfuscate(secret[0]));
					let csv = `"${list.join('","')}"`;
					strObj = strObj.replace(match.segment, match.segment.replace(match.secrets, csv));
				}
			}

			return strObj;
		};

		// convert back to object
		sanitizedObj = JSON.parse(sanitizeRoundTwo(sanitizeRoundOne(strObj)));

	} catch (error) {
		//DebugAndLog.error(`Error sanitizing object. Skipping: ${error.message}`, error.stack);
		sanitizedObj = {"message": "Error sanitizing object"};
	}
		
	return sanitizedObj;
};


/**
 * Hash JSON objects and arrays to determine matches (contain 
 * the same keys, values, and nesting.
 * 
 * Works best with JSON data objects that survive JSON.stringify(). 
 * If the data object passed to it contains classes or specialized 
 * objects (like Date), JSON.stringify() will attempt to use a
 * .toJSON() method to convert the object. DataTypes of Symbols and
 * Functions will not survive this process.

 * @param {string} algorithm
 * @param {Object|Array|BigInt|Number|String|Boolean} data to hash
 * @param {{salt: string, iterations: number}} options
 * @returns {string} Reproducible hash in hex
 */
const hashThisData = function(algorithm, data, options = {}) {

	// set default values for options
	if ( !( "salt" in options) ) { options.salt = ""; }
	if ( !( "iterations" in options) || options.iterations < 1 ) { options.iterations = 1; }
	if ( !( "skipParse" in options) ) { options.skipParse = false; } // used so we don't parse during recursion

	// if it is an object or array, then parse it to remove non-data elements (functions, etc)
	if ( !options.skipParse && (typeof data === "object" || Array.isArray(data))) {
		data = JSON.parse(JSON.stringify(data, (key, value) => {
			switch (typeof value) {
				case 'bigint':
					return value.toString();
				case 'undefined':
					return 'undefined';
				default:
					return value;
			}
		}));
		options.skipParse = true; // set to true so we don't parse during recursion
	}

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
	const dataType = (data !== null && !Array.isArray(data)) ? typeof data : (Array.isArray(data)) ? "array" : "null";
	
	if (data === null) { data = "null" }
	if (data === undefined) { data = "undefined" }

	let valueStr = "";

	if (dataType === "array" || dataType === "object") {

		/*
		We will iterate through the keys and values and generate a reproducible data string.
		(sorted by object key or array value)
		*/

		let arrayOfStuff = [];

		// copy the named keys and alphabetize (or generate index for array) .
		let keys = (dataType === "array") 
			? Array.from({ length: data.length }, (value, index) => index)
			: Object.keys(data).sort();
	
		// iterate through the keys alphabetically and add the key and value to the arrayOfStuff
		keys.forEach((key) => {
			// clone options
			const opts = JSON.parse(JSON.stringify(options));
			opts.iterations = 1; // don't iterate during recursion, only at end

			const value = hashThisData(algorithm, data[key], opts);
			arrayOfStuff.push( `${(dataType !== "array" ? key : "$array")}:::${dataType}:::${value}` );
		})
		
		valueStr = arrayOfStuff.sort().join("|||");

	} else {
		valueStr = `-:::${dataType}:::${data.toString()}`;
	}

	const hash = crypto.createHash(algorithm);
	let hashOfData = "";

	// hash for the number of iterations
	for (let i = 0; i < options.iterations; i++) {
		hash.update(valueStr + hashOfData + options.salt);
		hashOfData = hash.digest('hex');
	}

	return hashOfData;
};

module.exports = {
	printMsg,
	sanitize,
	obfuscate,
	hashThisData
};