const RequestInfo = require('./RequestInfo.class');
const Timer = require('./Timer.class');
const DebugAndLog = require('./DebugAndLog.class');
const { safeClone } = require('./utils');
const ValidationMatcher = require('../utils/ValidationMatcher.class');
const ValidationExecutor = require('../utils/ValidationExecutor.class');


/**
 * Extends RequestInfo to provide request validation, parameter extraction, and authentication.
 * 
 * ClientRequest processes Lambda API Gateway events and validates parameters using a flexible
 * validation system that supports global, route-specific, method-specific, and method-and-route
 * specific validation rules with clear priority ordering.
 * 
 * Validation Priority Order (highest to lowest):
 * 1. Method-and-route match (BY_ROUTE with "METHOD:route")
 * 2. Route-only match (BY_ROUTE with "route")
 * 3. Method-only match (BY_METHOD with "METHOD")
 * 4. Global parameter name
 * 
 * Header Key Format Conversion:
 * 
 * HTTP headers use kebab-case naming (e.g., 'content-type', 'x-api-key'), but JavaScript
 * property naming conventions prefer camelCase. ClientRequest automatically converts header
 * keys from kebab-case to camelCase during validation and parameter extraction to maintain
 * consistency with JavaScript naming standards.
 * 
 * This conversion is necessary because:
 * - JavaScript object properties conventionally use camelCase
 * - Accessing headers as object properties (e.g., headers.contentType) is more idiomatic
 * - Validation rule keys should match JavaScript property naming conventions
 * 
 * Conversion Algorithm:
 * 1. Convert entire header name to lowercase
 * 2. Replace each hyphen followed by a letter with the uppercase letter
 * 3. Remove all hyphens
 * 
 * Header Key Conversion Reference Table:
 * 
 * | HTTP Header (kebab-case)  | JavaScript Property (camelCase) |
 * |---------------------------|----------------------------------|
 * | content-type              | contentType                      |
 * | Content-Type              | contentType                      |
 * | authorization             | authorization                    |
 * | x-api-key                 | xApiKey                          |
 * | X-API-Key                 | xApiKey                          |
 * | x-custom-header           | xCustomHeader                    |
 * | if-modified-since         | ifModifiedSince                  |
 * | if-none-match             | ifNoneMatch                      |
 * | cache-control             | cacheControl                     |
 * | user-agent                | userAgent                        |
 * | accept-encoding           | acceptEncoding                   |
 * 
 * When configuring header parameter validation rules, use the camelCase property names
 * shown in the right column. Use the static method convertHeaderKeyToCamelCase() to
 * determine the correct property name for any HTTP header
 * 
 * @example
 * // Initialize ClientRequest with global validations (backwards compatible)
 * ClientRequest.init({
 *   validations: {
 *     referrers: ['example.com', 'myapp.com'],
 *     parameters: {
 *       queryStringParameters: {
 *         limit: (value) => !isNaN(value) && value > 0 && value <= 100,
 *         page: (value) => !isNaN(value) && value > 0
 *       },
 *       pathParameters: {
 *         id: (value) => /^[a-zA-Z0-9-]+$/.test(value)
 *       }
 *     }
 *   }
 * });
 * 
 * @example
 * // Initialize with route-specific validations
 * ClientRequest.init({
 *   parameters: {
 *     pathParameters: {
 *       // Global validation (Priority 4) - applies to all routes
 *       id: (value) => typeof value === 'string' && value.length > 0,
 *       
 *       // Route-specific validations (Priority 2)
 *       BY_ROUTE: [
 *         {
 *           route: "product/{id}",
 *           validate: (value) => /^P-[0-9]+$/.test(value)
 *         },
 *         {
 *           route: "employee/{id}",
 *           validate: (value) => /^E-[0-9]+$/.test(value)
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * @example
 * // Initialize with method-specific validations
 * ClientRequest.init({
 *   parameters: {
 *     pathParameters: {
 *       id: (value) => typeof value === 'string',
 *       
 *       // Method-specific validations (Priority 3)
 *       BY_METHOD: [
 *         {
 *           method: "POST",
 *           validate: (value) => value.length <= 50
 *         },
 *         {
 *           method: "GET",
 *           validate: (value) => value.length > 0
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * @example
 * // Initialize with method-and-route validations (highest priority)
 * ClientRequest.init({
 *   parameters: {
 *     pathParameters: {
 *       BY_ROUTE: [
 *         {
 *           route: "POST:game/join/{id}",  // Priority 1: Method-and-route
 *           validate: (value) => /^[0-9]{6}$/.test(value)
 *         },
 *         {
 *           route: "GET:game/join/{id}",   // Priority 1: Method-and-route
 *           validate: (value) => /^[0-9]+$/.test(value)
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * @example
 * // Multi-parameter validation - validate multiple parameters together
 * ClientRequest.init({
 *   parameters: {
 *     queryStringParameters: {
 *       BY_ROUTE: [
 *         {
 *           route: "search?query,limit",  // Specify multiple parameters
 *           validate: ({query, limit}) => {
 *             // Validation function receives object with all specified parameters
 *             return query.length > 0 && limit >= 1 && limit <= 100;
 *           }
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * @example
 * // Header parameter validation with camelCase property names
 * // Note: HTTP headers are automatically converted from kebab-case to camelCase
 * ClientRequest.init({
 *   parameters: {
 *     headerParameters: {
 *       // Use camelCase for header validation rules
 *       contentType: (value) => value === 'application/json',
 *       authorization: (value) => value.startsWith('Bearer '),
 *       xApiKey: (value) => /^[a-zA-Z0-9]{32}$/.test(value),
 *       
 *       // Use convertHeaderKeyToCamelCase() to determine correct property names
 *       // ClientRequest.convertHeaderKeyToCamelCase('x-custom-header') returns 'xCustomHeader'
 *       xCustomHeader: (value) => value.length > 0
 *     }
 *   }
 * });
 * 
 * @example
 * // Body parameter validation - basic single-field validation
 * // Body content is automatically parsed from JSON before validation
 * ClientRequest.init({
 *   parameters: {
 *     bodyParameters: {
 *       // Global validation for specific fields
 *       email: (value) => typeof value === 'string' && value.includes('@'),
 *       age: (value) => typeof value === 'number' && value >= 0 && value <= 150,
 *       username: (value) => /^[a-zA-Z0-9_-]{3,20}$/.test(value)
 *     }
 *   }
 * });
 * 
 * // In Lambda handler
 * exports.handler = async (event, context) => {
 *   // event.body = '{"email":"user@example.com","age":25,"username":"john_doe"}'
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request body' };
 *   }
 *   
 *   // Access validated body parameters
 *   const bodyParams = clientRequest.getBodyParameters();
 *   console.log(bodyParams.email);    // 'user@example.com'
 *   console.log(bodyParams.age);      // 25
 *   console.log(bodyParams.username); // 'john_doe'
 * };
 * 
 * @example
 * // Body parameter validation - multi-field validation
 * // Validate multiple fields together with complex business logic
 * ClientRequest.init({
 *   parameters: {
 *     bodyParameters: {
 *       BY_ROUTE: [
 *         {
 *           route: 'POST:users',
 *           validate: ({email, password, confirmPassword}) => {
 *             // Multi-field validation: password confirmation
 *             return email && password && 
 *                    password === confirmPassword &&
 *                    password.length >= 8 &&
 *                    email.includes('@');
 *           }
 *         },
 *         {
 *           route: 'PUT:users/{id}',
 *           validate: ({email, username}) => {
 *             // At least one field must be provided for update
 *             return email || username;
 *           }
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * @example
 * // Body parameter validation - error handling for invalid JSON
 * // ClientRequest handles JSON parsing errors gracefully
 * exports.handler = async (event, context) => {
 *   // event.body = 'invalid json{' (malformed JSON)
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     // Validation fails for invalid JSON
 *     return { 
 *       statusCode: 400, 
 *       body: JSON.stringify({ error: 'Invalid request body' })
 *     };
 *   }
 *   
 *   // This code only runs if body is valid JSON and passes validation
 *   const bodyParams = clientRequest.getBodyParameters();
 *   // Process valid body parameters...
 * };
 * 
 * @example
 * // Body parameter validation - complex nested objects and arrays
 * ClientRequest.init({
 *   parameters: {
 *     bodyParameters: {
 *       // Validate nested object structure
 *       user: (value) => {
 *         return value && 
 *                typeof value === 'object' &&
 *                typeof value.name === 'string' &&
 *                typeof value.email === 'string' &&
 *                value.email.includes('@');
 *       },
 *       
 *       // Validate array of items
 *       items: (value) => {
 *         return Array.isArray(value) &&
 *                value.length > 0 &&
 *                value.every(item => 
 *                  item.id && 
 *                  typeof item.quantity === 'number' &&
 *                  item.quantity > 0
 *                );
 *       },
 *       
 *       // Validate nested array of objects with specific structure
 *       addresses: (value) => {
 *         return Array.isArray(value) &&
 *                value.every(addr =>
 *                  addr.street &&
 *                  addr.city &&
 *                  addr.zipCode &&
 *                  /^\d{5}$/.test(addr.zipCode)
 *                );
 *       }
 *     }
 *   }
 * });
 * 
 * // Example request body:
 * // {
 * //   "user": {
 * //     "name": "John Doe",
 * //     "email": "john@example.com"
 * //   },
 * //   "items": [
 * //     {"id": "item-1", "quantity": 2},
 * //     {"id": "item-2", "quantity": 1}
 * //   ],
 * //   "addresses": [
 * //     {"street": "123 Main St", "city": "Boston", "zipCode": "02101"}
 * //   ]
 * // }
 * 
 * exports.handler = async (event, context) => {
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request body structure' };
 *   }
 *   
 *   const bodyParams = clientRequest.getBodyParameters();
 *   console.log(bodyParams.user.name);        // 'John Doe'
 *   console.log(bodyParams.items.length);     // 2
 *   console.log(bodyParams.addresses[0].city); // 'Boston'
 * };
 * 
 * @example
 * // Body parameter validation - combining with other parameter types
 * ClientRequest.init({
 *   parameters: {
 *     pathParameters: {
 *       id: (value) => /^[0-9]+$/.test(value)
 *     },
 *     bodyParameters: {
 *       BY_ROUTE: [
 *         {
 *           route: 'PUT:users/{id}',
 *           validate: ({email, username, bio}) => {
 *             // Validate update payload
 *             const hasAtLeastOneField = email || username || bio;
 *             const emailValid = !email || email.includes('@');
 *             const usernameValid = !username || /^[a-zA-Z0-9_-]{3,20}$/.test(username);
 *             const bioValid = !bio || bio.length <= 500;
 *             
 *             return hasAtLeastOneField && emailValid && usernameValid && bioValid;
 *           }
 *         }
 *       ]
 *     }
 *   }
 * });
 * 
 * exports.handler = async (event, context) => {
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request' };
 *   }
 *   
 *   // All parameter types are validated
 *   const userId = clientRequest.getPathParameters().id;
 *   const updates = clientRequest.getBodyParameters();
 *   
 *   // Update user with validated data
 *   await updateUser(userId, updates);
 *   return { statusCode: 200, body: 'User updated' };
 * };
 * 
 * @example
 * // Use in Lambda handler
 * exports.handler = async (event, context) => {
 *   const clientRequest = new ClientRequest(event, context);
 *   
 *   if (!clientRequest.isValid()) {
 *     return { statusCode: 400, body: 'Invalid request' };
 *   }
 *   
 *   const userId = clientRequest.getPathAt(1);
 *   const queryParams = clientRequest.getQueryStringParameters();
 *   
 *   // Add logging for monitoring
 *   clientRequest.addPathLog(`users/${userId}`);
 *   clientRequest.addQueryLog(`limit=${queryParams.limit}`);
 *   
 *   // Process request...
 *   return { statusCode: 200, body: 'Success' };
 * };
 */
class ClientRequest extends RequestInfo { 

	static #validations = {
		referrers: ['*'],
		parameters: {}
	};

	static #authenticationIsRequired = false; // is it a public API (no authentication required) or authenticated API? (if both, set to false and use authorizations and roles)
	static #unauthenticatedAuthorizations = (ClientRequest.#authenticationIsRequired) ? ['none'] : ['all']; // change from 'all' if there is a mix of public and authenticated access
	
	/* we would need to add valid roles and authorizations as well as static */

	/* What and who of the request */
	#event = null;
	#context = null;
	#authorizations = safeClone(ClientRequest.#unauthenticatedAuthorizations);
	#roles = [];
	
	/* Validation system */
	#validationMatchers = {};
	#validationReason = { isValid: true, statusCode: 200, messages: [] };

	/* The request data */
	#props = {};

	/* Logging */
	#timer = null;
	#logs = {
		pathLog: [],
		queryLog: [],
		apiKey: null
	}

	/**
	 * Initializes the request data based on the event and performs parameter validation.
	 * 
	 * The constructor initializes ValidationMatchers for each parameter type (path, query, header, cookie)
	 * using the configured validation rules. Validation is performed immediately during construction,
	 * and the request validity can be checked using isValid().
	 * 
	 * Validation uses a four-tier priority system:
	 * 1. Method-and-route match (BY_ROUTE with "METHOD:route") - Most specific
	 * 2. Route-only match (BY_ROUTE with "route")
	 * 3. Method-only match (BY_METHOD with "METHOD")
	 * 4. Global parameter name - Least specific
	 * 
	 * @param {Object} event - Lambda API Gateway event object
	 * @param {Object} context - Lambda context object
	 * @example
	 * // Basic usage
	 * const clientRequest = new ClientRequest(event, context);
	 * if (clientRequest.isValid()) {
	 *   // Process valid request
	 * }
	 * 
	 * @example
	 * // With route-specific validation
	 * // If event.resource = "/product/{id}" and event.httpMethod = "GET"
	 * // ValidationMatcher will check:
	 * // 1. GET:product/{id} validation (if exists)
	 * // 2. product/{id} validation (if exists)
	 * // 3. GET method validation (if exists)
	 * // 4. Global 'id' parameter validation (if exists)
	 * const clientRequest = new ClientRequest(event, context);
	 */
	constructor(event, context) {
		super(event);
		
		this.#timer = new Timer("ClientRequest", true);

		this.#event = event;
		this.#context = context;

		this.#authenticate();

		const { resource, resourceArray, path, pathArray } = this.#extractResourceAndPath();

		this.#props = {
			method: this.#event.httpMethod,
			path,
			pathArray,
			resource,
			resourceArray,
			pathParameters: {},
			queryStringParameters: {},
			headerParameters: {},
			cookieParameters: {},
			bodyParameters: {},
			bodyPayload: this.#event?.body || null, // from body
			client: {
				ip: this.getClientIp(),
				userAgent: this.getClientUserAgent(),
				origin: this.getClientOrigin(),
				referrer: this.getClientReferrer(),
				isAuthenticated: this.isAuthenticated(),
				isGuest: this.isGuest(),
				authorizations: this.getAuthorizations(),
				roles: this.getRoles()
			},
			deadline: (this.deadline() - 500),
			calcMsToDeadline: this.calcMsToDeadline
		};
		
		// >! Initialize ValidationMatchers for each parameter type
		// >! This enables route-specific and method-specific validations
		const httpMethod = this.#event.httpMethod || '';
		const resourcePath = resource || '';
		const paramValidations = ClientRequest.getParameterValidations();
		
		// >! Support both queryParameters and queryStringParameters for backwards compatibility
		const queryValidations = paramValidations?.queryStringParameters || paramValidations?.queryParameters;
		
		this.#validationMatchers = {
			pathParameters: new ValidationMatcher(paramValidations?.pathParameters, httpMethod, resourcePath),
			queryStringParameters: new ValidationMatcher(queryValidations, httpMethod, resourcePath),
			headerParameters: new ValidationMatcher(paramValidations?.headerParameters, httpMethod, resourcePath),
			cookieParameters: new ValidationMatcher(paramValidations?.cookieParameters, httpMethod, resourcePath),
			bodyParameters: new ValidationMatcher(paramValidations?.bodyParameters, httpMethod, resourcePath)
		};
		
		this.#validate();

	};

	/**
	 * Initialize the ClientRequest class with validation configuration.
	 * 
	 * This method configures the validation system for all ClientRequest instances.
	 * Call this once during application initialization, before creating any ClientRequest instances.
	 * 
	 * Validation Configuration Structure:
	 * - referrers: Array of allowed referrer domains (use ['*'] to allow all)
	 * - parameters: Object containing validation rules for each parameter type
	 *   - pathParameters, queryStringParameters, headerParameters, cookieParameters, bodyParameters
	 *   - Each parameter type can have:
	 *     - Global validations: paramName: (value) => boolean
	 *     - BY_ROUTE: Array of route-specific validation rules
	 *     - BY_METHOD: Array of method-specific validation rules
	 * 
	 * Parameter Specification Syntax:
	 * - Path parameters: "route/{param}" - Validates 'param' path parameter
	 * - Query parameters: "route?param" - Validates 'param' query parameter
	 * - Multiple parameters: "route?param1,param2" - Validates both parameters together
	 * - Method-and-route: "METHOD:route" - Applies only to specific HTTP method and route
	 * 
	 * @param {Object} options - Configuration options
	 * @param {Array<string>} [options.referrers] - Array of allowed referrers (use ['*'] for all)
	 * @param {Object} [options.parameters] - Parameter validation configuration
	 * @param {Object} [options.parameters.pathParameters] - Path parameter validations
	 * @param {Object} [options.parameters.queryStringParameters] - Query parameter validations
	 * @param {Object} [options.parameters.headerParameters] - Header parameter validations
	 * @param {Object} [options.parameters.cookieParameters] - Cookie parameter validations
	 * @param {Object} [options.parameters.bodyParameters] - Body parameter validations
	 * @param {Array<{route: string, validate: Function}>} [options.parameters.*.BY_ROUTE] - Route-specific validations
	 * @param {Array<{method: string, validate: Function}>} [options.parameters.*.BY_METHOD] - Method-specific validations
	 * @param {boolean} [options.parameters.excludeParamsWithNoValidationMatch=true] - Exclude parameters without validation rules
	 * @throws {Error} If options is not an object
	 * 
	 * @example
	 * // Global validations only (backwards compatible)
	 * ClientRequest.init({
	 *   referrers: ['example.com'],
	 *   parameters: {
	 *     pathParameters: {
	 *       id: (value) => /^[a-zA-Z0-9-]+$/.test(value)
	 *     },
	 *     queryStringParameters: {
	 *       limit: (value) => !isNaN(value) && value > 0 && value <= 100
	 *     }
	 *   }
	 * });
	 * 
	 * @example
	 * // Route-specific validations (Priority 2)
	 * ClientRequest.init({
	 *   parameters: {
	 *     pathParameters: {
	 *       id: (value) => typeof value === 'string',  // Global fallback
	 *       BY_ROUTE: [
	 *         {
	 *           route: "product/{id}",
	 *           validate: (value) => /^P-[0-9]+$/.test(value)
	 *         },
	 *         {
	 *           route: "employee/{id}",
	 *           validate: (value) => /^E-[0-9]+$/.test(value)
	 *         }
	 *       ]
	 *     }
	 *   }
	 * });
	 * 
	 * @example
	 * // Method-specific validations (Priority 3)
	 * ClientRequest.init({
	 *   parameters: {
	 *     pathParameters: {
	 *       BY_METHOD: [
	 *         {
	 *           method: "POST",
	 *           validate: (value) => value.length <= 50
	 *         },
	 *         {
	 *           method: "GET",
	 *           validate: (value) => value.length > 0
	 *         }
	 *       ]
	 *     }
	 *   }
	 * });
	 * 
	 * @example
	 * // Method-and-route validations (Priority 1 - highest)
	 * ClientRequest.init({
	 *   parameters: {
	 *     pathParameters: {
	 *       BY_ROUTE: [
	 *         {
	 *           route: "POST:game/join/{id}",
	 *           validate: (value) => /^[0-9]{6}$/.test(value)
	 *         },
	 *         {
	 *           route: "GET:game/join/{id}",
	 *           validate: (value) => /^[0-9]+$/.test(value)
	 *         }
	 *       ]
	 *     }
	 *   }
	 * });
	 * 
	 * @example
	 * // Multi-parameter validation
	 * ClientRequest.init({
	 *   parameters: {
	 *     queryStringParameters: {
	 *       BY_ROUTE: [
	 *         {
	 *           route: "search?query,limit",  // Specify multiple parameters
	 *           validate: ({query, limit}) => {
	 *             // Validation function receives object with all parameters
	 *             return query.length > 0 && limit >= 1 && limit <= 100;
	 *           }
	 *         }
	 *       ]
	 *     }
	 *   }
	 * });
	 * 
	 * @example
	 * // Mixed priority levels
	 * ClientRequest.init({
	 *   parameters: {
	 *     pathParameters: {
	 *       id: (value) => typeof value === 'string',  // Priority 4: Global
	 *       BY_METHOD: [
	 *         {
	 *           method: "POST",  // Priority 3: Method-only
	 *           validate: (value) => value.length <= 50
	 *         }
	 *       ],
	 *       BY_ROUTE: [
	 *         {
	 *           route: "product/{id}",  // Priority 2: Route-only
	 *           validate: (value) => /^P-[0-9]+$/.test(value)
	 *         },
	 *         {
	 *           route: "POST:product/{id}",  // Priority 1: Method-and-route
	 *           validate: (value) => /^P-[0-9]{4}$/.test(value)
	 *         }
	 *       ]
	 *     }
	 *   }
	 * });
	 */
	static init(options) {
		if (typeof options === 'object') {
			if ('referrers' in options) {
				ClientRequest.#validations.referrers = options.referrers;
			}
			if ('parameters' in options) {
				ClientRequest.#validations.parameters = options.parameters;
			}

			// Backwards compatibility - deprecated
			if ('validations' in options) {
				if ('referrers' in options.validations) {
					ClientRequest.#validations.referrers = options.validations.referrers;
				}
				if ('parameters' in options.validations) {
					ClientRequest.#validations.parameters = options.validations.parameters;
				}
			}
		} else {
			const errMsg = 'Application Configuration Error. Invalid options passed to ClientRequest.init(). Received:';
			DebugAndLog.error(errMsg, options);
			throw new Error(errMsg, options);
		}

	};

	/**
	 * Returns the current validation rules
	 * @returns {{referrerWhiteList<Array>}} validations
	 */
	static info() {
		return {
			referrerWhiteList: ClientRequest.getReferrerWhiteList(),
		};
	};

	/**
	 * Allowed referrers
	 * @returns {Array<string>} Allowed referrers
	 */
	static getReferrerWhiteList() {
		return ClientRequest.#validations.referrers;
	};

	/**
	 * Parameter validations
	 * @returns {{
	 * 	pathParameters?: object,
	 * 	queryStringParameters?: object,
	 * 	headerParameters?: object,
	 * 	cookieParameters?: object,
	 * 	bodyParameters?: object
	 * }}
	 */
	static getParameterValidations() {
		return ClientRequest.#validations.parameters;
	};
	/**
	 * Convert HTTP header key from kebab-case to camelCase.
	 *
	 * This utility method helps developers determine the correct key names for header validation rules.
	 * HTTP headers use kebab-case (e.g., 'content-type'), but ClientRequest converts them to camelCase
	 * (e.g., 'contentType') during validation for JavaScript property naming conventions.
	 *
	 * The conversion algorithm:
	 * 1. Convert entire string to lowercase
	 * 2. Replace each hyphen followed by a letter with the uppercase letter
	 * 3. Remove all hyphens
	 *
	 * @param {string} headerKey - HTTP header key in kebab-case (e.g., 'Content-Type', 'x-custom-header')
	 * @returns {string} Header key in camelCase (e.g., 'contentType', 'xCustomHeader')
	 * @example
	 * // Common HTTP headers
	 * ClientRequest.convertHeaderKeyToCamelCase('content-type');  // 'contentType'
	 * ClientRequest.convertHeaderKeyToCamelCase('Content-Type');  // 'contentType'
	 * ClientRequest.convertHeaderKeyToCamelCase('x-api-key');     // 'xApiKey'
	 *
	 * @example
	 * // Multiple hyphens
	 * ClientRequest.convertHeaderKeyToCamelCase('x-custom-header-name');  // 'xCustomHeaderName'
	 *
	 * @example
	 * // Use in validation configuration
	 * const headerKey = ClientRequest.convertHeaderKeyToCamelCase('X-Custom-Header');
	 * // Now use 'xCustomHeader' in validation rules
	 */
	static convertHeaderKeyToCamelCase(headerKey) {
		if (!headerKey || typeof headerKey !== 'string') {
			return '';
		}

		// >! Convert to lowercase and replace -([a-z]) with uppercase letter
		// >! Then remove any remaining hyphens (e.g., from consecutive hyphens or trailing hyphens)
		// >! This prevents injection via special characters in header names
		return headerKey.toLowerCase()
			.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())
			.replace(/-/g, '');
	}

	/**
	 * Used in the constructor to set validity of the request
	 * This method may be customized to meet your validation needs
	 */
	#validate() {
	
		const reasons = [];
		let statusCode = 200;

		// Referrer check
		const referrerValid = this.isAuthorizedReferrer();
		if (!referrerValid) {
			reasons.push("Forbidden");
			statusCode = this.#upgradeStatusCode(statusCode, 403);
		}

		// Authentication check
		const authFailed = this.hasNoAuthorization();
		if (authFailed) {
			reasons.push("Unauthorized");
			statusCode = this.#upgradeStatusCode(statusCode, 401);
		}

		// Parameter checks - collect invalid parameter names from each
		const pathResult = this.#hasValidPathParameters();
		const queryResult = this.#hasValidQueryStringParameters();
		const headerResult = this.#hasValidHeaderParameters();
		const cookieResult = this.#hasValidCookieParameters();
		const bodyResult = this.#hasValidBodyParameters();

		// Collect invalid parameter messages
		const paramResults = [pathResult, queryResult, headerResult, cookieResult, bodyResult];
		for (const result of paramResults) {
			if (result.invalidParams) {
				for (const paramName of result.invalidParams) {
					reasons.push(`Invalid parameter: ${paramName}`);
					statusCode = this.#upgradeStatusCode(statusCode, 400);
				}
			}
		}

		// Handle invalid JSON body
		if (bodyResult.invalidBody) {
			reasons.push("Invalid request body");
			statusCode = this.#upgradeStatusCode(statusCode, 400);
		}

		// Compute combined valid boolean from all check results
		const valid = referrerValid && !authFailed
			&& pathResult.isValid && queryResult.isValid && headerResult.isValid
			&& cookieResult.isValid && bodyResult.isValid;

		// Preserve backwards compatibility
		super._isValid = valid;

		// Populate validation reason
		this.#validationReason = {
			isValid: valid,
			statusCode: valid ? 200 : statusCode,
			messages: valid ? [] : reasons
		};

	};

	/**
	 * Returns the higher-priority HTTP status code between two candidates.
	 * Priority order: 401 > 403 > 400 > 200.
	 *
	 * @private
	 * @param {number} current - The current status code
	 * @param {number} candidate - The candidate status code to compare
	 * @returns {number} The status code with higher priority
	 */
	#upgradeStatusCode(current, candidate) {
		const priority = { 401: 3, 403: 2, 400: 1, 200: 0 };
		return (priority[candidate] || 0) > (priority[current] || 0) ? candidate : current;
	};

	/**
	 * Returns a structured validation result object describing why the request
	 * passed or failed validation. The object includes the validation status,
	 * an appropriate HTTP status code, and descriptive messages identifying
	 * each failure.
	 * 
	 * A new object is returned on each call to prevent external mutation of
	 * internal state.
	 * 
	 * @returns {{ isValid: boolean, statusCode: number, messages: Array<string> }}
	 *   A new object on each call containing:
	 *   - isValid: whether the request passed all validation checks
	 *   - statusCode: the appropriate HTTP status code (200, 400, 401, or 403)
	 *   - messages: array of descriptive failure messages (empty when valid)
	 * @example
	 * // Valid request
	 * const reason = clientRequest.getValidationReason();
	 * // { isValid: true, statusCode: 200, messages: [] }
	 *
	 * @example
	 * // Invalid request with bad parameters
	 * const reason = clientRequest.getValidationReason();
	 * // { isValid: false, statusCode: 400, messages: ["Invalid parameter: limit"] }
	 */
	getValidationReason() {
		return {
			isValid: this.#validationReason.isValid,
			statusCode: this.#validationReason.statusCode,
			messages: [...this.#validationReason.messages]
		};
	}

	/**
	 * Validate parameters using ValidationMatcher and ValidationExecutor.
	 * 
	 * This method implements the core parameter validation logic:
	 * 1. Uses ValidationMatcher to find the best matching validation rule (4-tier priority)
	 * 2. Uses ValidationExecutor to execute validation with appropriate interface (single or multi-parameter)
	 * 3. Extracts ALL validated parameters specified in the matching rule and returns them
	 * 4. Respects excludeParamsWithNoValidationMatch flag (default: true)
	 * 
	 * When a validation rule matches and validation passes, ALL parameters specified in rule.params
	 * are extracted from clientParameters and included in the returned params object. This ensures
	 * that multi-parameter validation rules (e.g., validating query?param1,param2 together) correctly
	 * extract all validated parameters, not just the one that triggered the rule match.
	 * 
	 * For single-parameter validation with multi-placeholder routes (e.g., users/{userId}/posts/{id}):
	 * - ValidationMatcher returns validateParam field indicating which parameter to validate
	 * - ValidationExecutor validates only that parameter with single-parameter interface
	 * - This method extracts ALL parameters from rule.params array (e.g., both userId and id)
	 * 
	 * @private
	 * @param {Object} paramValidations - Parameter validation configuration (may include BY_ROUTE, BY_METHOD, and global validations)
	 * @param {Object} clientParameters - Parameters from the request (path, query, header, or cookie parameters)
	 * @param {ValidationMatcher} validationMatcher - ValidationMatcher instance for finding validation rules
	 * @returns {{isValid: boolean, params: Object}} Object with validation result and extracted parameters
	 * @example
	 * // Internal use - validates path parameters
	 * const { isValid, params } = #hasValidParameters(
	 *   paramValidations.pathParameters,
	 *   event.pathParameters,
	 *   validationMatcher
	 * );
	 */
	#hasValidParameters(paramValidations, clientParameters, validationMatcher) {

		let rValue = {
			isValid: true,
			params: {},
			invalidParams: []
		}
	
		if (clientParameters) {
			// >! Check excludeParamsWithNoValidationMatch flag (default: true)
			const excludeUnmatched = ClientRequest.#validations.parameters?.excludeParamsWithNoValidationMatch !== false;

			// >! When no validation rules exist for this parameter type,
			// >! pass through all parameters if excludeUnmatched is false
			if (!paramValidations) {
				if (!excludeUnmatched) {
					rValue.params = { ...clientParameters };
				}
				return rValue;
			}
			
			// >! Track which parameters have been validated to avoid duplicate validation
			const validatedParams = new Set();
			
			// >! Create normalized parameter map for validation execution
			// >! Include ALL parameter types so multi-parameter validations can access them
			const normalizedParams = {};
			
			// >! Add path parameters (if available)
			if (this.#event?.pathParameters) {
				for (const [key, value] of Object.entries(this.#event.pathParameters)) {
					const normalizedKey = key.replace(/^\/|\/$/g, '');
					normalizedParams[normalizedKey] = value;
				}
			}
			
			// >! Add query parameters (if available, lowercased)
			if (this.#event?.queryStringParameters) {
				for (const [key, value] of Object.entries(this.#event.queryStringParameters)) {
					const normalizedKey = key.toLowerCase().replace(/^\/|\/$/g, '');
					normalizedParams[normalizedKey] = value;
				}
			}
			
			// >! Add header parameters (if available, camelCased)
			if (this.#event?.headers) {
				for (const [key, value] of Object.entries(this.#event.headers)) {
					const camelCaseKey = key.toLowerCase().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
					normalizedParams[camelCaseKey] = value;
				}
			}
			
			// >! Add cookie parameters (if available)
			if (this.#event?.cookie) {
				for (const [key, value] of Object.entries(this.#event.cookie)) {
					const normalizedKey = key.replace(/^\/|\/$/g, '');
					normalizedParams[normalizedKey] = value;
				}
			}
			
			// >! Add client parameters being validated to normalizedParams
			// >! This ensures validation functions can access the parameters they're validating
			for (const [key, value] of Object.entries(clientParameters)) {
				const normalizedKey = key.replace(/^\/|\/$/g, '');
				normalizedParams[normalizedKey] = value;
			}
			
			// >! Collect valid params separately so we can clear them if any fail
			const collectedParams = {};

			// Use a for...of loop instead of forEach for better control flow
			for (const [key, value] of Object.entries(clientParameters)) {
				// >! Preserve existing parameter key normalization
				const paramKey = key.replace(/^\/|\/$/g, '');
				const paramValue = value;
				
				// >! Skip parameters that have already been validated
				if (validatedParams.has(paramKey)) {
					continue;
				}
				
				// >! Use ValidationMatcher to find the best matching validation rule
				const rule = validationMatcher.findValidationRule(paramKey);
				
				if (rule) {
					// >! Use ValidationExecutor to execute validation with appropriate interface
					// Pass normalized parameters so validation functions can access them by normalized names
					const isValid = ValidationExecutor.execute(rule.validate, rule.params, normalizedParams);
					
					if (isValid) {
						// >! Extract ALL parameters specified in rule.params when validation passes
						// >! This fixes the bug where only the current paramKey was added
						for (const ruleParamName of rule.params) {
							// >! Find the parameter value in clientParameters
							// >! Use normalized key matching to handle case differences
							const normalizedRuleParam = ruleParamName.replace(/^\/|\/$/g, '');
							
							// >! Search for matching parameter in clientParameters
							for (const [clientKey, clientValue] of Object.entries(clientParameters)) {
								const normalizedClientKey = clientKey.replace(/^\/|\/$/g, '');
								
								if (normalizedClientKey === normalizedRuleParam) {
									collectedParams[clientKey] = clientValue;
									// >! Mark this parameter as validated to avoid duplicate validation
									validatedParams.add(normalizedClientKey);
									break;
								}
							}
						}
					} else {
						// >! Maintain existing logging for invalid parameters
						DebugAndLog.warn(`Invalid parameter: ${paramKey} = ${paramValue}`);
						rValue.isValid = false;
						rValue.invalidParams.push(paramKey);
					}
				} else if (!excludeUnmatched) {
					// No validation rule found, but excludeUnmatched is false
					// Include parameter without validation
					collectedParams[paramKey] = paramValue;
				}
				// If excludeUnmatched is true and no rule found, skip parameter (existing behavior)
			}

			// >! If any parameter failed, clear params (preserves existing behavior)
			rValue.params = rValue.isValid ? collectedParams : {};
		}	
		return rValue;
	}

	/**
	 * Validate path parameters from the request.
	 * 
	 * Uses ValidationMatcher to find matching validation rules based on route pattern and HTTP method.
	 * Extracts validated path parameters and stores them in this.#props.pathParameters.
	 * 
	 * @private
	 * @returns {boolean} True if all path parameters are valid, false otherwise
	 * @example
	 * // Internal use during request validation
	 * const isValid = #hasValidPathParameters();
	 */
	#hasValidPathParameters() {
		const { isValid, params, invalidParams } = this.#hasValidParameters(
			ClientRequest.getParameterValidations()?.pathParameters,
			this.#event?.pathParameters,
			this.#validationMatchers.pathParameters
		);
		this.#props.pathParameters = params;
		return { isValid, invalidParams };
	}

	/**
	 * Validate query string parameters from the request.
	 * 
	 * Normalizes query parameter keys to lowercase before validation.
	 * Uses ValidationMatcher to find matching validation rules based on route pattern and HTTP method.
	 * Extracts validated query parameters and stores them in this.#props.queryStringParameters.
	 * Supports both queryStringParameters and queryParameters for backwards compatibility.
	 * 
	 * @private
	 * @returns {boolean} True if all query string parameters are valid, false otherwise
	 * @example
	 * // Internal use during request validation
	 * const isValid = #hasValidQueryStringParameters();
	 */
	#hasValidQueryStringParameters() {
		// lowercase all the this.#event.queryStringParameters keys
		const qs = {};
		for (const key in this.#event.queryStringParameters) {
			qs[key.toLowerCase()] = this.#event.queryStringParameters[key];
		}
		
		// >! Support both queryParameters and queryStringParameters for backwards compatibility
		const paramValidations = ClientRequest.getParameterValidations();
		const queryValidations = paramValidations?.queryStringParameters || paramValidations?.queryParameters;
		
		const { isValid, params, invalidParams } = this.#hasValidParameters(
			queryValidations,
			qs,
			this.#validationMatchers.queryStringParameters
		);
		this.#props.queryStringParameters = params;
		return { isValid, invalidParams };
	}

	/**
	 * Validate header parameters from the request.
	 * 
	 * Normalizes header keys to camelCase (e.g., 'content-type' becomes 'contentType') before validation.
	 * Uses ValidationMatcher to find matching validation rules based on route pattern and HTTP method.
	 * Extracts validated header parameters and stores them in this.#props.headerParameters.
	 * 
	 * @private
	 * @returns {boolean} True if all header parameters are valid, false otherwise
	 * @example
	 * // Internal use during request validation
	 * const isValid = #hasValidHeaderParameters();
	 */
	/**
		 * Validate header parameters from the request.
		 * 
		 * HTTP headers are automatically converted from kebab-case to camelCase for JavaScript
		 * property naming conventions. The conversion algorithm:
		 * 1. Convert entire header key to lowercase
		 * 2. Replace each hyphen followed by a letter with the uppercase letter
		 * 3. Remove all hyphens
		 * 
		 * This allows validation rules to use JavaScript-friendly property names while
		 * maintaining compatibility with standard HTTP header naming conventions.
		 * 
		 * @private
		 * @returns {boolean} True if all header parameters are valid, false otherwise
		 * @example
		 * // HTTP header conversion examples:
		 * // 'Content-Type' → 'contentType'
		 * // 'content-type' → 'contentType'
		 * // 'X-API-Key' → 'xApiKey'
		 * // 'x-custom-header' → 'xCustomHeader'
		 * // 'authorization' → 'authorization' (no hyphens, unchanged)
		 * 
		 * // Internal use during request validation
		 * const isValid = this.#hasValidHeaderParameters();
		 */
		#hasValidHeaderParameters() {
			// camel case all the this.#event.headers keys and remove hyphens
			const headers = {};
			for (const key in this.#event.headers) {
				const camelCaseKey = key.toLowerCase().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
				headers[camelCaseKey] = this.#event.headers[key];
			}
			const { isValid, params, invalidParams } = this.#hasValidParameters(
				ClientRequest.getParameterValidations()?.headerParameters,
				headers,
				this.#validationMatchers.headerParameters
			);
			this.#props.headerParameters = params;
			return { isValid, invalidParams };
		}

	#hasValidCookieParameters() {
		const { isValid, params, invalidParams } = this.#hasValidParameters(
			ClientRequest.getParameterValidations()?.cookieParameters,
			this.#event?.cookie,
			this.#validationMatchers.cookieParameters
		);
		this.#props.cookieParameters = params;
		return { isValid, invalidParams };
	}

	/**
	 * Validate body parameters from the request.
	 *
	 * Parses JSON body content before validation. Handles both API Gateway v1 and v2 formats.
	 * Uses ValidationMatcher to find matching validation rules based on route pattern and HTTP method.
	 * Extracts validated body parameters and stores them in this.#props.bodyParameters.
	 *
	 * Null, undefined, or empty string bodies are treated as empty objects for validation.
	 * If the body contains invalid JSON, the error is logged and validation fails.
	 *
	 * @private
	 * @returns {boolean} True if all body parameters are valid, false otherwise
	 * @example
	 * // Internal use during request validation
	 * const isValid = #hasValidBodyParameters();
	 */
	#hasValidBodyParameters() {
		// >! Parse body content before validation
		let bodyObject = {};

		// >! Handle null, undefined, and empty string body cases
		if (this.#event.body && this.#event.body !== '') {
			try {
				// >! Parse JSON with error handling
				bodyObject = JSON.parse(this.#event.body);
			} catch (error) {
				// >! Log JSON parsing errors
				DebugAndLog.error(
					`Failed to parse request body as JSON: ${error?.message || 'Unknown error'}`,
					error?.stack
				);
				this.#props.bodyParameters = {};
				return { isValid: false, invalidParams: [], invalidBody: true };
			}
		}

		// >! Use existing validation framework with body validation matcher
		const { isValid, params, invalidParams } = this.#hasValidParameters(
			ClientRequest.getParameterValidations()?.bodyParameters,
			bodyObject,
			this.#validationMatchers.bodyParameters
		);

		// >! Store validated parameters
		this.#props.bodyParameters = params;
		return { isValid, invalidParams };
	}



	// Utility function for getPathArray and getResourceArray
	// Returns array slice based on n parameter
	#getArray(arr, n = 0) {
		if (n === 0 || arr.length <= n || (n < 0 && arr.length <= (n*-1))) {
			return arr;
		} else if (n > 0) {
			return arr.slice(0, n);
		} else {
			// Handle negative indices by counting from the end
			return arr.slice(n);
		}
	};

	#getElementAt(arr, n = 0) {
		if (arr.length <= n || (n < 0 && arr.length <= (n*-1)-1)) return null;
		if (n < 0) {
			// Handle negative indices by counting from the end
			return arr[arr.length + n];
		} else {
			return arr[n];
		}
	};

	/** 
	 * Get the first n path elements as a string.
	 * If n is 0, the whole path will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is a string with each element separated by a slash.
	 * @param {number} n number of elements to return.
	 * @returns {string} path elements
	*/
	getPath(n = 0) {
		return this.getPathArray(n).join('/');
	}

	/**
	 * Get the first n path elements as an array.
	 * If n is 0, the whole path will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is an array of strings.
	 * @param {number} n number of elements to return.
	 * @returns {array<string>} path elements
	 */
	getPathArray(n = 0) {
		return this.#getArray(this.#props.pathArray, n);
	}


	/**
	 * Get the path element at the specified index. If n is a negative number then return the nth element from the end.
	 * @param {number} n index of the resource to return
	 * @returns {string} path element
	 */
	getPathAt(n = 0) {
		return this.#getElementAt(this.#props.pathArray, n);
	}

	/**
	 * Get the first n resource elements as a string.
	 * If n is 0, the whole resource will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is a string with each element separated by a slash.
	 * @param {number} n number of elements to return.
	 * @returns {string} resource elements
	 */
	getResource(n = 0) {
		return this.getResourceArray(n).join('/');
	}

	/**
	 * Get the first n resource elements as an array.
	 * If n is 0, the whole resource will be provided
	 * If n is a negative number, the last n elements will be provided
	 * The return value is an array of strings.
	 * @param {number} n number of elements to return.
	 * @returns {array<string>} resource elements
	 */
	getResourceArray(n = 0) {
		return this.#getArray(this.#props.resourceArray, n);
	}

	/**
	 * Get the resource element at the specified index. If n is a negative number then return the nth element from the end.
	 * @param {number} n index of the resource to return
	 * @returns {string} resource element
	 */
	getResourceAt(n = 0) {
		return this.#getElementAt(this.#props.resourceArray, n);
	}

	/**
	 * Returns the path parameters received in the request.
	 * Path parameters are defined in the API's path definition and validated in the applications validation functions.
	 * @returns {object} path parameters
	 */
	getPathParameters() {
		return this.#props.pathParameters;
	};

	/**
	 * Returns the query string parameters received in the request.
	 * Query string parameters are validated in the applications validation functions.
	 * @returns {object} query string parameters
	 */
	getQueryStringParameters() {
		return this.#props.queryStringParameters;
	};

	/**
	 * Returns the header parameters received in the request.
	 * Only headers validated in the applications validation functions are returned.
	 * @returns {object} header parameters
	 */
	getHeaderParameters() {
		return this.#props.headerParameters;
	};

	/**
	 * Returns the cookie parameters received in the request.
	 * Only cookies validated in the applications validation functions are returned.
	 * @returns {object} cookie parameters
	 */
	getCookieParameters() {
		return this.#props.cookieParameters;
	};

	/**
	 * Returns the body parameters received in the request.
	 * Body parameters are validated in the applications validation functions.
	 * @returns {object} body parameters
	 */
	getBodyParameters() {
		return this.#props.bodyParameters || {};
	};

	#authenticate() {
		// add your authentication logic here
		this.authenticated = false; // anonymous
	};

	isAuthenticated() {
		return (ClientRequest.#authenticationIsRequired && this.authenticated);
	};

	isGuest() {
		return (!ClientRequest.#authenticationIsRequired && !this.authenticated);
	};

	isAuthorizedToPerform(action="all") {
		return ( this.getAuthorizations().includes(action) || this.getAuthorizations().includes('all'));
	};

	getRoles() {
		if (this.isAuthenticated()) {
			return this.#roles;
		} else {
			return ['guest'];
		}
	};

	getAuthorizations() {
		if (this.isAuthenticated()) {
			return this.#authorizations;
		} else {
			return safeClone(ClientRequest.#unauthenticatedAuthorizations);
		}
	};

	isAuthorizedReferrer() {
		/* Check the array of valid referrers */
		/* Check if the array includes a wildcard (*) OR if one of the whitelisted referrers matches the end of the referrer */
		if (!ClientRequest.requiresValidReferrer()) {
			// Wildcard (*) is in the list, allow all referrers
			return true;
		} else {
			// Check if referrer matches one of the whitelisted referrers
			for (let i = 0; i < ClientRequest.#validations.referrers.length; i++) {
				if (this.getClientReferer().endsWith(ClientRequest.#validations.referrers[i])) {
					return true;
				}
			}
		}
		return false;
	};

	static requiresValidReferrer() {
		return !ClientRequest.#validations.referrers.includes('*');
	};

	hasNoAuthorization() {
		return (this.getAuthorizations().includes('none') || !this.isAuthorizedReferrer() );
	};


	getExecutionTime() {
		return this.#timer.elapsed();
	};

	getFinalExecutionTime() {
		return this.#timer.stop();
	}

	/**
	 * Get the _processed_ request properties. These are the properties that
	 * the ClientRequest object took from the event sent to Lambda, validated,
	 * supplemented, and makes available to controllers.
	 * 
	 * Note When accessed behind CloudFront:
	 * To ensure the user agent is passed along to API Gateway, use the AWS 
	 * managed Origin Request Policy named AllViewerExceptHostHeader. This 
	 * forwards the User-Agent along with most other viewer headers while 
	 * maintaining the correct Host header required for API Gateway to route 
	 * the request properly.
	 *
	 * @returns {{ method: string, path: string, pathArray: string[], resource: string, resourceArray: string[], pathParameters: {}, queryStringParameters: {}, headerParameters: {}, cookieParameters: {}, bodyParameters: {}, bodyPayload: string, client: {ip: string, userAgent: string, origin: string, referrer: string, isAuthenticated: boolean, isGuest: boolean, authorizations: string[], roles: string[]}, deadline: number, calcMsToDeadline: function}
	 */
	getProps() {
		return this.#props;
	};
	
	/**
	 * Add one or more path notations to the log.
	 * These are used for logging and monitoring. When a response is finalized the route
	 * is recorded in CloudWatch logs along with the status and other information.
	 * Do not send sensitive information in the path notation, use placeholders instead. 
	 * For example, /user/{id}/profile instead of /user/123/profile
	 * However, /city/Chicago is acceptable because it is not a sensitive identifier.
	 * Only add meaningful parameters. You can abbreviate and rewrite long parameters.
	 * For example, /format/jpg can be coded as /f:jpg or /user/123/profile/privacy as /userProfile/privacy
	 * @param {string|Array<string>} path
	 */
	addPathLog(path = null) {
		if (path === null) {
			path = `${this.#props.method}:${this.#props.pathArray.join("/")}`;
		}
		if (typeof path === 'string') {
			this.#logs.pathLog.push(path);
		} else if (Array.isArray(path)) {
			this.#logs.pathLog = this.#logs.pathLog.concat(path);
		}
	};

	/**
	 * Add one or more query notations to the query log.
	 * These are used for logging and monitoring. When a response is finalized the 
	 * parameters are recorded in CloudWatch logs along with the status and other 
	 * information.
	 * Do not send sensitive information in the query notation, use placeholders instead. 
	 * For example, user instead of user=123
	 * However, city=Chicago is acceptable because it is not a sensitive query.
	 * Only add meaningful parameters. You can abbreviate long parameters.
	 * For example, format=jpg can be coded as f:jpg
	 * @param {string|Array<string>} query
	 */
	addQueryLog(query) {
		if (typeof query === 'string') {
			this.#logs.queryLog.push(query);
		} else if (Array.isArray(query)) {
			this.#logs.queryLog = this.#logs.queryLog.concat(query);
		}
	};

	/**
	 * Get the request log entries
	 * resource: http method and resource path with path parameter keys (no values)
	 * queryKeys: query string keys (no values)
	 * pathLog: custom route path with values (set by application using addPathLog())
	 * queryLog: custom query with or without values (set by addQueryLog())
	 * apiKey: last 6 characters of api key if present
	 * @returns {resource: string, queryKeys: string, routeLog: string, queryLog: string, apiKey: string}
	 */
	getRequestLog() {
		return {
			resource: `${this.#props.method}:${this.#props.resourceArray.join('/')}`,
			// put queryString keys in alpha order and join with &
			queryKeys: Object.keys(this.#props.queryStringParameters).sort().map(key => `${key}=${this.#props.queryStringParameters[key]}`).join('&'),
			routeLog: this.#logs.pathLog.join('/'),
			// put logs.params in alpha order and join with &
			queryLog: this.#logs.queryLog.sort().join('&'),
			// only show last 6 characters of this.apiKey
			apiKey: (this.#logs.apiKey !== null) ? this.#logs.apiKey.substring(this.#logs.apiKey.length - 6) : null
		};
	};

	timerStop() {
		return this.#timer?.stop() || 0;
	};

	/**
	 * 
	 * @returns {number} The remaining time before Lambda times out. 1000 if context is not set in ClientRequest object.
	 */
	getRemainingTimeInMillis() {
		return this.getContext().getRemainingTimeInMillis() || 1000;
	};

	/**
	 * Get the number of milliseconds remaining and deduct the headroom given.
	 * Useful when you want to set a timeout on a function (such as an http request)
	 * that may take longer than our function has time for.
	 * @param {number} headroomInMillis number in milliseconds to deduct from Remaining Time
	 * @returns {number} greater than or equal to 0
	 */
	calcRemainingTimeInMillis(headroomInMillis = 0) {
		let rt = this.getRemainingTimeInMillis() - headroomInMillis;
		return (rt > 0 ? rt : 0);
	};

	/**
	 * 
	 * @returns timestamp for when the remaining time is up
	 */
	deadline() {
		return Date.now() + this.getRemainingTimeInMillis();
	};

	/**
	 * 
	 * @returns Milliseconds to Deadline
	 */
	calcMsToDeadline(deadline) {
		if (!deadline) {
			deadline = Date.now() - 500;
		}
		return deadline - Date.now();
	};

	getContext() {
		if (this.#context === null) {
			DebugAndLog.warn("Context for request is null but was requested. Set context along with event when constructing ClientRequest object");
		}
		return this.#context;
	};

	getEvent() {
		return this.#event;
	};

	#extractResourceAndPath() {
		const {resource, path} = this.getEvent();

		let resourceIndex = [];

		const resourcesAndPaths = {
			resource: '',
			resourceArray: [],
			path: '',
			pathArray: []
		};

		/* We want to use reqContext.resourcePath to create a resourcePath and resourceArray, and we want to use path to create a path and pathArray
		For resourcePathArray, we want to split resourcePath on / and remove any empty strings. We also want to lowercase any element that is not surrounded with {}
		We want to add the index of any resource element that is surrounded with {} to the resourceIndex array.
		For pathArray we want to split on / and remove any empty strings. We also want to lowercase any element that is not at an index listed in the resourceIndex array
		*/
		if (resource) {
			const resourceArray = resource.split('/').filter((element) => element !== '');
			resourceArray.forEach((element, index) => {
				if (element.startsWith('{') && element.endsWith('}')) {
					resourceIndex.push(index);
					resourcesAndPaths.resourceArray.push(element);
				} else {
					resourcesAndPaths.resourceArray.push(element.toLowerCase());
				}
			});
			resourcesAndPaths.resource = resourcesAndPaths.resourceArray.join('/');
		}

		if (path) {
			const pathArray = path.split('/').filter((element) => element !== '');
			pathArray.forEach((element, index) => {
				if (!resourceIndex.includes(index)) {
					resourcesAndPaths.pathArray.push(element.toLowerCase());
				} else {
					resourcesAndPaths.pathArray.push(element);
				}
			});
			resourcesAndPaths.path = resourcesAndPaths.pathArray.join('/');
		}

		return resourcesAndPaths;

	}

};

module.exports = ClientRequest;