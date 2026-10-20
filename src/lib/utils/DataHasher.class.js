/**
 * DataHasher - Internal reproducible deep-hash utility for cache-key generation
 *
 * Owns the recursive, salt-and-iteration object-hashing logic used to turn JSON
 * objects and arrays into reproducible hex-encoded hashes. Two structures that contain
 * the same keys, values, and nesting produce the same hash.
 *
 * Works best with JSON data objects that survive JSON.stringify(). If the data object
 * passed to it contains classes or specialized objects (like Date), JSON.stringify()
 * will attempt to use a .toJSON() method to convert the object. DataTypes of Symbols and
 * Functions will not survive this process. Input that is not JSON-serializable (for
 * example, an object with circular references) will throw during normalization; this is
 * a documented constraint, not a feature.
 *
 * @private
 * This class is internal to @63klabs/cache-data and is NOT part of the public API. It is
 * not exported from src/index.js or src/lib/tools/index.js. It is used internally by
 * tools.hashThisData (a thin wrapper) and by Cache.generateIdHash (via that wrapper).
 *
 * @example
 * // Internal use only - import the class directly in tests.
 * const DataHasher = require("../utils/DataHasher.class.js");
 * const hash = DataHasher.hash("sha256", { host: "example.com", path: "/api" });
 *
 * @example
 * // Salt and iterations change the result deterministically.
 * const salted = DataHasher.hash("sha256", { a: 1 }, { salt: "pepper", iterations: 2 });
 */

const crypto = require("crypto"); // included by aws so don't need to add to package.json

class DataHasher {

	/**
	 * Hash JSON objects and arrays to determine matches (contain the same keys,
	 * values, and nesting). Returns a reproducible hex-encoded hash string.
	 *
	 * Works best with JSON data objects that survive JSON.stringify(). If the data
	 * object contains classes or specialized objects (like Date), JSON.stringify() will
	 * attempt to use a .toJSON() method to convert the object. DataTypes of Symbols and
	 * Functions will not survive this process.
	 *
	 * @param {string} algorithm - Hash algorithm name passed to crypto.createHash (e.g. "sha256", "RSA-SHA256")
	 * @param {Object|Array|BigInt|Number|String|Boolean|null} data - The data to hash. Object/array input must be JSON-serializable.
	 * @param {Object} [options={}] - Hashing options
	 * @param {string} [options.salt=""] - Salt folded into every hashing iteration; a differing salt changes the result
	 * @param {number} [options.iterations=1] - Number of hashing iterations, clamped to a minimum of 1
	 * @returns {string} Reproducible hash in lowercase hex
	 * @throws {TypeError} When data is not JSON-serializable (e.g. contains circular references); the error from JSON.stringify propagates unchanged
	 * @throws {Error} When algorithm is not a valid Node crypto hash name; the error from crypto.createHash propagates unchanged
	 * @example
	 * const hash = DataHasher.hash("sha256", { host: "example.com", path: "/api" });
	 *
	 * @example
	 * // Salt and iterations change the result deterministically.
	 * const salted = DataHasher.hash("sha256", { a: 1 }, { salt: "pepper", iterations: 2 });
	 */
	static hash(algorithm, data, options = {}) {

		// safeClone is read lazily from tools/utils.js to avoid any load-time circular
		// require between this module and tools/utils.js (which requires this class back).
		const { safeClone } = require("../tools/utils.js");

		// Clone options to avoid modifying the original
		options = safeClone(options);

		// set default values for options
		if ( !( "salt" in options) ) { options.salt = ""; }
		if ( !( "iterations" in options) || options.iterations < 1 ) { options.iterations = 1; }
		if ( !( "skipParse" in options) ) { options.skipParse = false; } // used so we don't parse during recursion

		// if it is an object or array, then parse it to remove non-data elements (functions, etc)
		if ( !options.skipParse && (typeof data === "object" || Array.isArray(data))) {
			// Normalize the data structure first using JSON.stringify with custom replacer
			const normalized = JSON.parse(JSON.stringify(data, (key, value) => {
				switch (typeof value) {
					case 'bigint':
						return value.toString();
					case 'undefined':
						return 'undefined';
					default:
						return value;
				}
			}));
			// Then clone for safety
			data = safeClone(normalized);
			options.skipParse = true; // set to true so we don't parse during recursion
		}

		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
		const dataType = (data !== null && !Array.isArray(data)) ? typeof data : (Array.isArray(data)) ? "array" : "null";

		if (data === null) { data = "null" }
		if (data === undefined) { data = "undefined" }

		let valueStr = "";

		if (dataType === "array") {

			/*
			Arrays are order-significant: each element is tagged with its numeric index
			and entries are built in ascending index order. The entry list is NOT sorted
			afterward, so element position contributes to the hash and two arrays that
			differ only in element order produce different hashes.

			The joined entry string is prefixed with a container-type marker
			(`${dataType}:::`) so that an empty array ("array:::") and an empty object
			("object:::") serialize differently and therefore hash differently, even
			though both have zero entries.
			*/

			let arrayOfStuff = [];

			// iterate through indices in ascending order (index position is significant)
			for (let i = 0; i < data.length; i++) {
				// clone options
				const opts = safeClone(options);
				opts.iterations = 1; // don't iterate during recursion, only at end

				const childHash = DataHasher.hash(algorithm, data[i], opts);
				arrayOfStuff.push( `${i}:::${dataType}:::${childHash}` );
			}

			// prefix with the container-type marker, then join in index order WITHOUT
			// sorting so array element order is significant and empty [] != empty {}
			valueStr = `${dataType}:::` + arrayOfStuff.join("|||");

		} else if (dataType === "object") {

			/*
			Objects are key-order-insensitive: keys are sorted first, then entries are
			built in that sorted-key order and joined. Because entries are already in
			sorted-key order, no final sort is applied (it would be redundant for objects
			and must be absent so the array path above stays order-significant).

			The joined entry string is prefixed with a container-type marker
			(`${dataType}:::`) so that an empty object ("object:::") and an empty array
			("array:::") serialize differently and therefore hash differently, even
			though both have zero entries.
			*/

			let arrayOfStuff = [];

			// copy the named keys and alphabetize so key order does not affect the hash
			const keys = Object.keys(data).sort();

			// iterate through the keys alphabetically and add the key and value to the arrayOfStuff
			keys.forEach((key) => {
				// clone options
				const opts = safeClone(options);
				opts.iterations = 1; // don't iterate during recursion, only at end

				const childHash = DataHasher.hash(algorithm, data[key], opts);
				arrayOfStuff.push( `${key}:::${dataType}:::${childHash}` );
			})

			// prefix with the container-type marker; entries are already in sorted-key
			// order so join WITHOUT a final sort (empty {} != empty [] via the marker)
			valueStr = `${dataType}:::` + arrayOfStuff.join("|||");

		} else {
			valueStr = `-:::${dataType}:::${data.toString()}`;
		}

		let hashOfData = "";

		// hash for the number of iterations
		for (let i = 0; i < options.iterations; i++) {
			const hash = crypto.createHash(algorithm);
			hash.update(valueStr + hashOfData + options.salt);
			hashOfData = hash.digest('hex');
		}

		return hashOfData;
	}
}

module.exports = DataHasher;
