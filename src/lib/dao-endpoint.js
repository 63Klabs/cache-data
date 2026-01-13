/*
 * =============================================================================
 * Endpoint request class. DAO/Template
 * -----------------------------------------------------------------------------
 * 
 * Barebones API request to an endpoint. Can also be used as a template to
 * create additional DAO object classes.
 * 
 * The class can be used as a template and modified to provide additional
 * logic, query, filtering, and manipulation before/after data is sent/received
 * via the APIRequest class.
 * 
 * The class itself is not exposed, instead various functions can be used
 * to access the class. For exmaple, getDataDirectFromURI(connection, data)
 * 
 * The connection parameter is used to pass connection information to the 
 * API (host, path, query, etc).
 * 
 * The data parameter is optional and can be left off. However, it can be used 
 * to pass additional information to the class to perform before/after logic.
 * 
 * @example
 *  // access function that utilizes the class
 *  const getDataDirectFromURI = async (connection, data = null) => {
 *      return (new Endpoint(connection).get());
 *  };
 */

/*
 * -----------------------------------------------------------------------------
 * Object definitions
 * -----------------------------------------------------------------------------
 */

/**
 * @typedef ConnectionObject
 * @property {Object} connection
 * @property {string} connection.method
 * @property {string} connection.uri
 * @property {string} connection.protocol http or https
 * @property {string} connection.host
 * @property {string} connection.path
 * @property {string} connection.body
 * @property {object} connection.parameters
 * @property {object} connection.headers
 * @property {object} connection.options
 * @property {number} connection.options.timeout
 * @property {string} connection.note
 */

/*
 * -----------------------------------------------------------------------------
 */

"use strict";

const tools = require("./tools/index.js");

/**
 * 
 * @param {ConnectionObject} connection An object with details about the connection (method, uri, host, etc)
 * @param {Object} query Additional data to perform a query for the request.
 * @returns {Object} The response
 * @example
    const { endpoint } = require("@63klabs/cache-data");
    const data = await endpoint.get({host: "api.example.com", path: "data"}, { parameters: {q: "Chicago" }});
 */
const get = async (connection, query = null) => {
	return (new Endpoint(connection, query).get());
};

/**
 * A bare bones request to an endpoint. Can be used as a template to
 * create more elaborate requests. 
 */
class Endpoint {

	/**
	 * 
	 * @param {ConnectionObject} connection An object with connection data
	 */
	constructor(connection, query = {}) {

		this.response = null;

		// if query has parameters property then we will combine with connection parameters
		if ( query !== null && "parameters" in query ) {
			if ( !("parameters" in connection) || connection.parameters === null ) {
				connection.parameters = {};
			}
			
			for ( const [key, value] of Object.entries( query.parameters ) ) {
				connection.parameters[key] = value;
			}
		}

		this.request = {
			method: this._setRequestSetting(connection, "method", "GET"),
			uri: this._setRequestSetting(connection, "uri", ""),
			protocol: this._setRequestSetting(connection, "protocol", "https"),
			host: this._setRequestSetting(connection, "host", ""),
			path: this._setRequestSetting(connection, "path", ""),
			body: this._setRequestSetting(connection, "body", null),
			note: this._setRequestSetting(connection, "note", "Get data from endpoint"),
			parameters: this._setRequestSetting(connection, "parameters", null),
			headers: this._setRequestSetting(connection, "headers", null),
			options: this._setRequestSetting(connection, "options", null)
		};  
	};

	/**
	 * Takes the connection object, checks for the key provided and if the key 
	 * exists it returns its value. Otherwise it returns the default value.
	 * @param {ConnectionObject} connection The connection object to check for the existence of a key
	 * @param {string} key The key to check for and return the value from connection
	 * @param {*} defaultValue The value to use if the key is not found in the connection object
	 * @returns {*} Either the value of the key if found in the connection object, or the default value
	 */
	_setRequestSetting(connection, key, defaultValue) {
		if (!(key in connection)) {
			connection[key] = defaultValue;
		}

		return connection[key];        
	};

	/**
	 * This is the function used by the accessor method after the constructor
	 * is called.
	 * 
	 * As a template, it can be modified to perform additional checks, 
	 * operations, etc before or after sending the call.
	 * 
	 * @example
	 *  // access function that utilizes the class
	 *  const getDataDirectFromURI = async (connection, data = null) => {
	 *      return (new Endpoint(connection).get());
	 *  };
	 * @returns {object} Response data from the completed request
	 */
	async get() {

		if (this.response === null) {

			// send the call
			try {

				tools.DebugAndLog.debug("Sending call", this.request);
				this.response = await this._call();                

				// if it is not JSON we don't convert
				try { 

					let body = null;

					if ( this.response.body !== "" && this.response.body !== null ) {
						body = JSON.parse(this.response.body);
					}

					this.response.body = body;

				} catch (error) {
					tools.DebugAndLog.debug("This isn't JSON so we'll keep as text and do nothing. This isn't a true error.");
				}

			} catch (error) {
				tools.DebugAndLog.error(`Error in call to remote endpoint (${this.request.note}): ${error.message}`, error.stack);
			}

		}
			
		return this.response;
	}

	/**
	 * An internal function that actually makes the call to APIRequest class
	 * @returns {object} Response data from the completed request
	 */
	async _call() {

		var response = null;

		try {
			var apiRequest = new tools.APIRequest(this.request);
			response = await apiRequest.send();

		} catch (error) {
			tools.DebugAndLog.error(`Error in call (${this.request.note}): ${error.message}`, error.stack);
			response = tools.APIRequest.responseFormat(false, 500, "Error in call()");
		}

		return response;

	};

};

module.exports = {
	getDataDirectFromURI: get, // deprecated alias
	get
};