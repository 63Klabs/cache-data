const { safeClone } = require('./utils');

/**
 * Create an object that is able to return a copy and not
 * a reference to its properties.
 * @example
 * // Create an immutable object
 * const config = new ImmutableObject({
 *   apiKey: 'secret-key',
 *   timeout: 5000,
 *   retries: 3
 * });
 * 
 * // Lock it to prevent changes
 * config.finalize();
 * 
 * // Get a copy (not a reference)
 * const configCopy = config.get();
 * configCopy.apiKey = 'modified'; // Original is unchanged
 * 
 * @example
 * // Create and finalize immediately
 * const settings = new ImmutableObject({
 *   database: { host: 'localhost', port: 5432 },
 *   cache: { ttl: 300 }
 * }, true);
 * 
 * // Get nested values
 * const dbConfig = settings.get('database');
 * console.log(dbConfig); // { host: 'localhost', port: 5432 }
 * 
 * @example
 * // Use for connection configurations
 * const connections = new ImmutableObject({
 *   api: { host: 'api.example.com', path: '/v1' },
 *   auth: { host: 'auth.example.com', path: '/oauth' }
 * });
 * 
 * connections.finalize();
 * 
 * // Each get() returns a fresh copy
 * const apiConn1 = connections.get('api');
 * const apiConn2 = connections.get('api');
 * apiConn1.path = '/v2'; // apiConn2 is unaffected
 */
class ImmutableObject {

	/**
	 * 
	 * @param {object} obj The object you want to store as immutable. You can use keys for sub-objects to retreive those inner objects later
	 * @param {boolean} finalize Should we lock the object right away?
	 */
	constructor(obj = null, finalize = false) {
		this.obj = obj;
		this.locked = false;
		if ( finalize ) {
			this.finalize();
		}
	};

	/**
	 * Locks the object so it can't be changed.
	 */
	lock() {
		if ( !this.locked ) {
			/* We'll stringify the object to break all references,
			then change it back to an object */
			this.obj = safeClone(this.obj);
			this.locked = true;            
		}
	};

	/**
	 * Finalizes the object by immediately locking it
	 * @param {object|null} obj // The object you want to store as immutable. You can use keys for sub-objects to retreive those inner objects later 
	 */
	finalize(obj = null) {
		if ( !this.locked ) {
			if ( obj !== null ) { this.obj = obj; }
			this.lock();
		}
	};

	/**
	 * 
	 * @returns A copy of the object, not a reference
	 */
	toObject() {
		return this.get();
	}

	/**
	 * Get a copy of the value, not a reference, via an object's key
	 * @param {string} key Key of the value you wish to return
	 * @returns {*} The value of the supplied key
	 */
	get(key = "") {
		/* we need to break the reference to the orig obj.
		tried many methods but parse seems to be only one that works 
		https://itnext.io/can-json-parse-be-performance-improvement-ba1069951839
		https://medium.com/coding-at-dawn/how-to-use-the-spread-operator-in-javascript-b9e4a8b06fab
		*/
		//return {...this.connection[key]}; // doesn't make a deep copy
		//return Object.assign({}, this.connection[key]);

		// If no key argument was provided (undefined), return the whole object
		// Otherwise, return the value at the specified key (even if key is "")
		return safeClone( (arguments.length === 0 || !(key in this.obj)) ? this.obj : this.obj[key] );

	};
};

module.exports = ImmutableObject;