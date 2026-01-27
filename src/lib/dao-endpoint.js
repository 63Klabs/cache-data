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
 * to access the class. For exmaple, get(connection, data)
 * 
 * The connection parameter is used to pass connection information to the 
 * API (host, path, query, etc).
 * 
 * The data parameter is optional and can be left off. However, it can be used 
 * to pass additional information to the class to perform before/after logic.
 * 
 * @example
 *  // access function that utilizes the class
 *  const get = async (connection, data = null) => {
 *      return (new Endpoint(connection).get());
 *  };
 */

/*
 * -----------------------------------------------------------------------------
 * Object definitions
 * -----------------------------------------------------------------------------
 */

/**
 * Connection configuration object for making endpoint requests.
 * 
 * @typedef {Object} ConnectionObject
 * @property {string} [method="GET"] - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @property {string} [uri] - Complete URI including protocol, host, and path (alternative to separate protocol/host/path)
 * @property {string} [protocol="https"] - Protocol to use (http or https)
 * @property {string} [host] - Hostname or IP address of the endpoint
 * @property {string} [path] - Path portion of the URL
 * @property {string|null} [body=null] - Request body for POST/PUT requests
 * @property {Object.<string, string|number|boolean>|null} [parameters=null] - Query string parameters as key-value pairs
 * @property {Object.<string, string>|null} [headers=null] - HTTP headers as key-value pairs
 * @property {Object} [options] - Additional request options
 * @property {number} [options.timeout] - Request timeout in milliseconds
 * @property {string} [note="Get data from endpoint"] - Descriptive note for logging purposes
 */

/*
 * -----------------------------------------------------------------------------
 */

"use strict";

const tools = require("./tools/index.js");

/**
 * Makes a GET request to a remote endpoint with the specified connection configuration.
 * 
 * This function provides a simple interface for making HTTP requests to external APIs
 * or services. It supports both URI-based and component-based (protocol/host/path) 
 * connection specifications. Query parameters can be provided either in the connection
 * object or as a separate query parameter, which will be merged together.
 * 
 * The response body is automatically parsed as JSON if possible, otherwise returned as text.
 * 
 * @param {ConnectionObject} connection - Connection configuration object specifying the endpoint details
 * @param {Object} [query={}] - Additional query data to merge with connection parameters
 * @param {Object.<string, string|number|boolean>} [query.parameters] - Query string parameters to merge with connection.parameters
 * @returns {Promise<{success: boolean, statusCode: number, body: Object|string|null, headers: Object}>} Response object containing success status, HTTP status code, parsed body, and response headers
 * @throws {Error} Throws an error if the request fails due to network issues or invalid configuration
 * 
 * @example
 * // Using separate host and path
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.get(
 *   { host: "api.example.com", path: "/data" },
 *   { parameters: { q: "Chicago" } }
 * );
 * console.log(response.body);
 * 
 * @example
 * // Using complete URI
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.get(
 *   { uri: "https://api.example.com/data" },
 *   { parameters: { q: "Chicago" } }
 * );
 * console.log(response.body);
 * 
 * @example
 * // With custom headers and timeout
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.get({
 *   host: "api.example.com",
 *   path: "/secure/data",
 *   headers: { "Authorization": "Bearer token123" },
 *   options: { timeout: 5000 }
 * });
 * 
 * @example
 * // POST request with body
 * const { endpoint } = require("@63klabs/cache-data");
 * const response = await endpoint.get({
 *   method: "POST",
 *   uri: "https://api.example.com/submit",
 *   body: JSON.stringify({ name: "John", age: 30 }),
 *   headers: { "Content-Type": "application/json" }
 * });
 */
const get = async (connection, query = {}) => {
	if (query === null) { query = {} };
	return (new Endpoint(connection, query).get());
};

/**
 * Endpoint request class for making HTTP requests to remote APIs.
 * 
 * This class provides a bare-bones implementation for making API requests and can be used
 * as a template to create more elaborate request handlers with custom logic for data
 * manipulation before/after requests. The class handles connection configuration, parameter
 * merging, and automatic JSON parsing of responses.
 * 
 * The class is typically not instantiated directly but accessed through convenience functions
 * like `endpoint.get()`. However, it can be extended to add custom pre/post-processing logic.
 * 
 * @example
 * // Direct instantiation (advanced usage)
 * const endpoint = new Endpoint({ host: "api.example.com", path: "/data" });
 * const response = await endpoint.get();
 * 
 * @example
 * // Extending for custom logic
 * class CustomEndpoint extends Endpoint {
 *   async get() {
 *     // Custom pre-processing
 *     const response = await super.get();
 *     // Custom post-processing
 *     return response;
 *   }
 * }
 */
class Endpoint {

	/**
	 * Creates a new Endpoint instance with the specified connection configuration.
	 * 
	 * The constructor initializes the request configuration by merging connection settings
	 * with query parameters. If query.parameters are provided, they are merged with
	 * connection.parameters. All connection properties are set with appropriate defaults.
	 * 
	 * @param {ConnectionObject} connection - Connection configuration object with endpoint details
	 * @param {Object} [query={}] - Additional query data to merge with connection
	 * @param {Object.<string, string|number|boolean>} [query.parameters] - Query parameters to merge with connection.parameters
	 * 
	 * @example
	 * // Basic constructor usage
	 * const endpoint = new Endpoint({ host: "api.example.com", path: "/users" });
	 * 
	 * @example
	 * // With query parameters
	 * const endpoint = new Endpoint(
	 *   { host: "api.example.com", path: "/search" },
	 *   { parameters: { q: "javascript", limit: 10 } }
	 * );
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
	 * Sets a request setting from the connection object or uses a default value.
	 * 
	 * This internal helper method checks if a key exists in the connection object.
	 * If the key exists, it returns the value; otherwise, it sets the key to the
	 * default value and returns that default. This ensures all request settings
	 * have valid values.
	 * 
	 * @param {ConnectionObject} connection - The connection object to check for the key
	 * @param {string} key - The property key to check for and retrieve
	 * @param {*} defaultValue - The default value to use if the key is not found
	 * @returns {*} The value from the connection object if found, otherwise the default value
	 * 
	 * @example
	 * // Internal usage within constructor
	 * this.request.method = this._setRequestSetting(connection, "method", "GET");
	 * // If connection.method exists, uses that value; otherwise uses "GET"
	 */
	_setRequestSetting(connection, key, defaultValue) {
		if (!(key in connection)) {
			connection[key] = defaultValue;
		}

		return connection[key];        
	};

	/**
	 * Executes the HTTP request and returns the response.
	 * 
	 * This method sends the configured request to the remote endpoint using the APIRequest
	 * class. It automatically attempts to parse the response body as JSON. If the body is
	 * not valid JSON, it is kept as text. The method caches the response so subsequent
	 * calls return the same result without making additional requests.
	 * 
	 * This method can be overridden in subclasses to add custom pre-processing (before the
	 * request) or post-processing (after the response) logic.
	 * 
	 * @returns {Promise<{success: boolean, statusCode: number, body: Object|string|null, headers: Object}>} Response object with success status, HTTP status code, parsed body, and headers
	 * @throws {Error} Throws an error if the request fails due to network issues, timeout, or invalid configuration
	 * 
	 * @example
	 * // Basic usage through the get() function
	 * const endpoint = new Endpoint({ host: "api.example.com", path: "/data" });
	 * const response = await endpoint.get();
	 * if (response.success) {
	 *   console.log(response.body);
	 * }
	 * 
	 * @example
	 * // Handling errors
	 * try {
	 *   const endpoint = new Endpoint({ uri: "https://api.example.com/data" });
	 *   const response = await endpoint.get();
	 *   console.log(response.statusCode, response.body);
	 * } catch (error) {
	 *   console.error("Request failed:", error.message);
	 * }
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
	 * Internal method that makes the actual HTTP request using the APIRequest class.
	 * 
	 * This method creates an APIRequest instance with the configured request settings
	 * and sends the request. It handles errors by logging them and returning a formatted
	 * error response. This method is called internally by the get() method.
	 * 
	 * @returns {Promise<{success: boolean, statusCode: number, body: Object|string|null, headers: Object}>} Response object from the APIRequest
	 * @throws {Error} Throws an error if the APIRequest instantiation or send operation fails
	 * 
	 * @example
	 * // Internal usage (not typically called directly)
	 * const response = await this._call();
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