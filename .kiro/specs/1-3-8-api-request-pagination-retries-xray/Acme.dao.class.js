const { tools } = require('@63klabs/cache-data');

class Acme {
	constructor(connection) {

		this.response = null;

		this.request = {
			method: this._setRequestSetting(connection, "method", "GET"),
			uri: this._setRequestSetting(connection, "uri", ""),
			protocol: this._setRequestSetting(connection, "protocol", "https"),
			host: this._setRequestSetting(connection, "host", "api.example.com"),
			path: this._setRequestSetting(connection, "path", ""),
			body: this._setRequestSetting(connection, "body", null),
			note: this._setRequestSetting(connection, "note", "Get data from Acme API"),
			parameters: this._setParameters(connection),
			headers: this._setHeaders(connection),
			options: this._setOptions(connection),
			cache: this._setCache(connection)
		};  
		this.request.origNote = this.request.note; // so that we can add later
	};

	_setRequestSetting(connection, key, defaultValue) {
		if (!(key in connection)) {
			connection[key] = defaultValue;
		}

		return connection[key];        
	};
	
	/**
	 * Set any parameters standard to all platform requests. If there are any
	 * parameters unique to individual endpoints then update the method unique
	 * to that class instead.
	 * @param {*} connection 
	 * @returns 
	 */
	_setParameters(connection) {
		if (!("parameters" in connection)) {
			connection.parameters = {};
		}

		return connection.parameters;
	};

	/**
	 * Set any headers standard to all platform requests. If there are any
	 * headers unique to individual endpoints then update the method unique to
	 * that class instead.
	 * @param {*} connection 
	 * @returns 
	 */
	_setHeaders(connection) {
		if (!("headers" in connection)) {
			connection.headers = null;
		} else {
			/* we only want json - not required, but standard to include */
			if ( !("content-type" in connection.headers) ) {
				connection.headers['content-type'] = "application/json";
			}

			/* we only want json - not required, but standard to include */
			if ( !("accept" in connection.headers) ) {
				connection.headers['accept'] = "application/json";
			}            
		}

		return connection.headers;
	};

	_setOptions(connection) {

		let options = {};

		if (connection?.options) {
			options = Object.assign({}, { maxRetries: 1, timeout: 8000}, connection?.options || {})
		}

		options.separateDuplicateParameters = true; // Acme API wants dupe parameters separate

		return options;
	}

	_setCache(connection) {
		if (!("cache" in connection)) {
			connection.cache = null;
		}

		return connection.cache;
	}

	/**
	 * Retrieves data from the Acme API with automatic retry functionality.
	 * This method handles the complete request lifecycle including retries, JSON parsing,
	 * and error handling.
	 * 
	 * @async
	 * @returns {Promise<Object>} A promise that resolves to the API response object with the following structure:
	 *                           - success: boolean indicating if the request was successful
	 *                           - statusCode: HTTP status code
	 *                           - body: parsed JSON response data
	 *                           - headers: response headers
	 * 
	 * @example
	 * const acme = new Acme({
	 *   options: {
	 *     maxRetries: 2,    // Will attempt the request up to 3 times total
	 *     timeout: 8000     // Each attempt gets 6000ms
	 *   }
	 * });
	 * const response = await acme.get();
	 * 
	 * @throws {Error} If all retry attempts fail or if the response cannot be processed
	 * 
	 * @description
	 * The method implements a retry mechanism with the following behavior:
	 * - Total number of attempts = maxRetries + 1 (default: 2 attempts)
	 * - Timeout per attempt
	 * - Retries occur on:
	 *   - Network errors
	 *   - Empty or null responses
	 *   - JSON parsing errors
	 * 
	 * Configuration options:
	 * - options.maxRetries: Number of retry attempts (default: 1)
	 * - options.timeout: Timeout per attempt in milliseconds (default: 8000)
	 */
	async get() {
		let response = null;
		const maxRetries = this.options?.maxRetries || 1;
		const timeout = this.options?.timeout || 8000;
		
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				// Update the timeout for this attempt
				this.request.options.timeout = timeout;

				if (attempt > 0) {
					this.request.note += `[Retry ${attempt + 1}/${maxRetries + 1}]`;
					tools.DebugAndLog.warn(`Retrying Acme Request (${this.request.note})`);
				}
				
				response = await this._call();
	
				try { 
					// Parse JSON
					response.body = (response.body !== "" && response.body !== null) 
						? JSON.parse(response.body) 
						: null; 
	
					// Should never be empty or null
					if (response.body === null) {
						response = tools.APIRequest.responseFormat(false, 500, "FAIL", response.headers);
						tools.DebugAndLog.error(`Acme Returned Empty or Null Body (${this.request.note})`, response);
						// Continue to next retry if we have attempts left
						if (attempt < maxRetries) continue;
					}
	
					// If we get here with valid data, break the retry loop
					break;
	
				} catch (error) {
					tools.DebugAndLog.warn(`Acme Response that resulted in Error (${this.request.note}) - Attempt ${attempt + 1}/${maxRetries + 1}:`, response);
					
					response = tools.APIRequest.responseFormat(false, 500, "FAIL", response.headers);
					tools.DebugAndLog.error(`Acme JSON Parse Error (${this.request.note}): ${error.message}`, error.stack);
					
					// Continue to next retry if we have attempts left
					if (attempt < maxRetries) continue;
				}
	
			} catch (error) {
				response = tools.APIRequest.responseFormat(false, 500, "FAIL", response?.headers);
				tools.DebugAndLog.error(`Error in call to Acme remote endpoint (Attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`, error.stack);
				
				// Continue to next retry if we have attempts left
				if (attempt < maxRetries) continue;
			}
		}
			
		return response;
	}	

	async _call() {

		var response = null;

		try {
			tools.DebugAndLog.debug(`Acme _call: ${this.request.note}`, this.request);
			const apiRequest = new tools.APIRequest(this.request);
			response = await apiRequest.send();

		} catch (error) {
			tools.DebugAndLog.error(`Error in Acme _call: ${error.message}`, error.stack);
			response = tools.APIRequest.responseFormat(false, 500, "Error in call()");
		}

		return response;

	};

	/* Pagination options for .get() */
	// const TOTAL_ITEMS_LABEL = "totalItems";
	// const ITEMS_LABEL = "items";
	// const OFFSET_LABEL = "skip";
	// const LIMIT_LABEL = "take";
	// const RESP_RETURN_COUNT_LABEL = "totalReturnedItems"; // The final count of items in the response

	// const BATCH_SIZE = 5; // Process in batches of 5 (or your desired concurrency limit)
	// const REQ_LIMIT_SIZE = 100; // Maximum number of records to return in a single request

	// In the parent class
	async paginateResults(initialResponse, options = {}) {
		const {
			totalItemsLabel = 'totalItems',  // Customize these default values
			itemsLabel = 'items',
			offsetLabel = 'offset',
			limitLabel = 'limit',
			responseReturnCountLabel = 'returnedItemCount',
			defaultLimit = 200,              // Default limit size
			batchSize = 5                   // Default batch size for concurrent requests
		} = options;

		if (!initialResponse.success 
			|| !(totalItemsLabel in initialResponse.body) 
			|| !(itemsLabel in initialResponse.body) 
			|| (offsetLabel in this.request.parameters && this.request.parameters[offsetLabel] > 0)
		) {
			return initialResponse;
		}

		const limit = this.request.parameters[limitLabel] ??= defaultLimit;
		const totalRecords = initialResponse.body[totalItemsLabel];

		// Calculate all required offsets
		const offsets = [];
		for (let offset = limit; offset < totalRecords; offset += limit) {
			offsets.push(offset);
		}

		if (offsets.length === 0) {
			return initialResponse;
		}

		const allResults = [];

		for (let i = 0; i < offsets.length; i += batchSize) {
			const batchOffsets = offsets.slice(i, i + batchSize);
			const batchPromises = batchOffsets.map(offset => {
				const clonedRequest = {
					...this.request,
					parameters: { ...this.request.parameters, [offsetLabel]: offset },
					note: `${this.request.note}[Offset ${offset}]`
				};
				
				const instance = new this.constructor(clonedRequest);
				return instance.get();
			});

			const batchResults = await Promise.all(batchPromises);
			allResults.push(...batchResults);
		}

		// Combine all results
		const allRecords = [
			...initialResponse.body[itemsLabel],
			...allResults.flatMap(result => {
				if (!result || !result.body) {
					this.logWarning?.("Received null or invalid body from API. Only combining partial results");
					return [];
				}
				return result.body[itemsLabel] || [];
			})
		];

		let response = {
			...initialResponse,
			body: {
				...initialResponse.body,
				[itemsLabel]: allRecords
			}
		};

		// Clean up response
		delete response.body[offsetLabel];
		delete response.body[limitLabel];
		response.body[responseReturnCountLabel] = allRecords.length;

		return response;
	}

}

module.exports = {
	Acme
};