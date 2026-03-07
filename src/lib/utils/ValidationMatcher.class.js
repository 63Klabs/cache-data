const DebugAndLog = require('../tools/DebugAndLog.class');

/**
 * Internal class for matching validation rules to request parameters.
 * Implements a four-tier priority system for validation rule resolution:
 * 1. Method-and-route match (BY_ROUTE with "METHOD:route")
 * 2. Route-only match (BY_ROUTE with "route")
 * 3. Method-only match (BY_METHOD with "METHOD")
 * 4. Global parameter name
 * 
 * @private
 * @example
 * // Internal use only - not exposed in public API
 * const matcher = new ValidationMatcher(
 *   paramValidations,
 *   'GET',
 *   '/product/{id}'
 * );
 * const rule = matcher.findValidationRule('id');
 */
class ValidationMatcher {
	#paramValidations;
	#httpMethod;
	#resourcePath;
	#normalizedResourcePath;
	#cachedPatterns;

	/**
	 * Creates a new ValidationMatcher instance.
	 * 
	 * @param {Object} paramValidations - Parameter validation configuration
	 * @param {string} httpMethod - HTTP method of request (e.g., 'GET', 'POST')
	 * @param {string} resourcePath - Resource path template (e.g., '/product/{id}')
	 */
	constructor(paramValidations, httpMethod, resourcePath) {
		this.#paramValidations = paramValidations || {};
		this.#httpMethod = (httpMethod || '').toUpperCase();
		this.#resourcePath = resourcePath || '';
		this.#normalizedResourcePath = this.#normalizeRoute(this.#resourcePath);
		this.#cachedPatterns = new Map();
		
		// >! Cache normalized patterns during initialization for performance
		this.#cacheNormalizedPatterns();
	}

	/**
	 * Find the best matching validation rule for a parameter.
	 * Uses four-tier priority resolution:
	 * 1. Method-and-route match (BY_ROUTE with "METHOD:route")
	 * 2. Route-only match (BY_ROUTE with "route")
	 * 3. Method-only match (BY_METHOD with "METHOD")
	 * 4. Global parameter name
	 * 
	 * @param {string} paramName - Parameter name to find validation for
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule with function and parameter list, or null if no match
	 * @example
	 * const rule = matcher.findValidationRule('id');
	 * if (rule) {
	 *   const isValid = rule.validate(paramValue);
	 * }
	 */
	findValidationRule(paramName) {
		// >! Early exit on first match to minimize pattern comparisons
		// Priority 1: Method-and-route match
		const methodRouteMatch = this.#findMethodRouteMatch(paramName);
		if (methodRouteMatch) return methodRouteMatch;
		
		// Priority 2: Route-only match
		const routeMatch = this.#findRouteMatch(paramName);
		if (routeMatch) return routeMatch;
		
		// Priority 3: Method-only match
		const methodMatch = this.#findMethodMatch(paramName);
		if (methodMatch) return methodMatch;
		
		// Priority 4: Global parameter name
		return this.#findGlobalMatch(paramName);
	}

	/**
	 * Normalize route by removing leading/trailing slashes and converting to lowercase.
	 * 
	 * @private
	 * @param {string} route - Route to normalize
	 * @returns {string} Normalized route
	 */
	#normalizeRoute(route) {
		if (!route || typeof route !== 'string') {
			return '';
		}
		return route.replace(/^\/|\/$/g, '').toLowerCase();
	}

	/**
	 * Cache normalized patterns during initialization for performance optimization.
	 * 
	 * @private
	 */
	#cacheNormalizedPatterns() {
		// Cache BY_ROUTE patterns
		if (this.#paramValidations.BY_ROUTE && Array.isArray(this.#paramValidations.BY_ROUTE)) {
			for (const rule of this.#paramValidations.BY_ROUTE) {
				if (rule.route && typeof rule.route === 'string') {
					// Extract route part (remove method prefix if present)
					let routePart = rule.route;
					if (routePart.includes(':')) {
						const parts = routePart.split(':', 2);
						routePart = parts[1] || '';
					}
					
					// Remove query parameter specification for pattern matching
					const routeWithoutQuery = routePart.split('?')[0];
					const normalized = this.#normalizeRoute(routeWithoutQuery);
					this.#cachedPatterns.set(rule.route, normalized);
				}
			}
		}
	}

	/**
	 * Check if a route pattern matches the request route.
	 * Supports placeholder matching for any number of placeholders (e.g., {id}, {userId}, {postId}).
	 * Performs segment-by-segment comparison with placeholder detection.
	 * 
	 * @private
	 * @param {string} pattern - Route pattern to match (e.g., 'users/{userId}/posts/{postId}')
	 * @param {string} requestRoute - Normalized request route (e.g., 'users/123/posts/456')
	 * @returns {boolean} True if pattern matches request route, false otherwise
	 * @example
	 * // Single placeholder
	 * #routeMatches('product/{id}', 'product/123') // true
	 * 
	 * @example
	 * // Multiple placeholders
	 * #routeMatches('users/{userId}/posts/{postId}', 'users/123/posts/456') // true
	 * 
	 * @example
	 * // Segment count mismatch
	 * #routeMatches('product/{id}', 'product/123/extra') // false
	 */
	#routeMatches(pattern, requestRoute) {
		if (!pattern || !requestRoute) {
			return false;
		}

		// Split into segments
		const patternSegments = pattern.split('/').filter(s => s.length > 0);
		const requestSegments = requestRoute.split('/').filter(s => s.length > 0);

		// Segment count must match
		if (patternSegments.length !== requestSegments.length) {
			return false;
		}

		// >! Check each segment - placeholders match any value
		for (let i = 0; i < patternSegments.length; i++) {
			const patternSeg = patternSegments[i];
			const requestSeg = requestSegments[i];

			// Check if pattern segment is a placeholder
			if (patternSeg.startsWith('{') && patternSeg.endsWith('}')) {
				continue; // Placeholder matches any value
			}

			// Exact match (case-insensitive)
			if (patternSeg.toLowerCase() !== requestSeg.toLowerCase()) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Find method-and-route match (Priority 1: METHOD:route).
	 * Matches validation rules with method prefix (e.g., 'POST:product/{id}').
	 * Extracts method and route parts, validates both match the request.
	 * 
	 * @private
	 * @param {string} paramName - Parameter name to find validation for
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule with function and parameter list, or null if no match
	 * @example
	 * // Matches 'POST:product/{id}' for POST request to /product/123
	 * #findMethodRouteMatch('id') // { validate: Function, params: ['id'] }
	 * 
	 * @example
	 * // Does not match 'GET:product/{id}' for POST request
	 * #findMethodRouteMatch('id') // null
	 */
	#findMethodRouteMatch(paramName) {
		if (!this.#paramValidations.BY_ROUTE || !Array.isArray(this.#paramValidations.BY_ROUTE)) {
			return null;
		}

		for (const rule of this.#paramValidations.BY_ROUTE) {
			if (!rule.route || typeof rule.route !== 'string' || !rule.validate) {
				continue;
			}

			// Check if route includes method prefix
			if (!rule.route.includes(':')) {
				continue;
			}

			const [method, routePart] = rule.route.split(':', 2);
			
			// >! Match method case-insensitively
			if (method.toUpperCase() !== this.#httpMethod) {
				continue;
			}

			// Extract route pattern (without query params)
			const routeWithoutQuery = routePart.split('?')[0];
			const normalizedPattern = this.#cachedPatterns.get(rule.route) || this.#normalizeRoute(routeWithoutQuery);

			// Check if route matches
			if (!this.#routeMatches(normalizedPattern, this.#normalizedResourcePath)) {
				continue;
			}

			// Extract parameter names from route pattern
			const params = this.#extractParamNames(rule.route);
			
			// Check if this rule applies to the parameter
			if (params.length === 0 || params.includes(paramName)) {
				return {
					validate: rule.validate,
					params: params.length > 0 ? params : [paramName]
				};
			}
		}

		return null;
	}

	/**
	 * Find route-only match (Priority 2: route).
	 * 
	 * @private
	 * @param {string} paramName - Parameter name
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule or null
	 */
	#findRouteMatch(paramName) {
		if (!this.#paramValidations.BY_ROUTE || !Array.isArray(this.#paramValidations.BY_ROUTE)) {
			return null;
		}

		for (const rule of this.#paramValidations.BY_ROUTE) {
			if (!rule.route || typeof rule.route !== 'string' || !rule.validate) {
				continue;
			}

			// Skip method-and-route patterns
			if (rule.route.includes(':')) {
				continue;
			}

			// Extract route pattern (without query params)
			const routeWithoutQuery = rule.route.split('?')[0];
			const normalizedPattern = this.#cachedPatterns.get(rule.route) || this.#normalizeRoute(routeWithoutQuery);

			// Check if route matches
			if (!this.#routeMatches(normalizedPattern, this.#normalizedResourcePath)) {
				continue;
			}

			// Extract parameter names from route pattern
			const params = this.#extractParamNames(rule.route);
			
			// Check if this rule applies to the parameter
			if (params.length === 0 || params.includes(paramName)) {
				return {
					validate: rule.validate,
					params: params.length > 0 ? params : [paramName]
				};
			}
		}

		return null;
	}

	/**
	 * Find method-only match (Priority 3: METHOD).
	 * 
	 * @private
	 * @param {string} paramName - Parameter name
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule or null
	 */
	#findMethodMatch(paramName) {
		if (!this.#paramValidations.BY_METHOD || !Array.isArray(this.#paramValidations.BY_METHOD)) {
			return null;
		}

		for (const rule of this.#paramValidations.BY_METHOD) {
			if (!rule.method || typeof rule.method !== 'string' || !rule.validate) {
				continue;
			}

			// >! Match method case-insensitively
			if (rule.method.toUpperCase() === this.#httpMethod) {
				return {
					validate: rule.validate,
					params: [paramName]
				};
			}
		}

		return null;
	}

	/**
	 * Find global parameter match (Priority 4: global parameter name).
	 * 
	 * @private
	 * @param {string} paramName - Parameter name
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule or null
	 */
	#findGlobalMatch(paramName) {
		// Check if parameter has a global validation function
		if (this.#paramValidations[paramName] && typeof this.#paramValidations[paramName] === 'function') {
			return {
				validate: this.#paramValidations[paramName],
				params: [paramName]
			};
		}

		return null;
	}

	/**
	 * Extract parameter names from route pattern.
	 * Extracts both path parameters (from {}) and query parameters (after ?).
	 * When ? is present, query parameters are added to path parameters.
	 * When ? is absent, only path parameters in {} are extracted.
	 * 
	 * @private
	 * @param {string} routePattern - Route pattern to parse (e.g., 'product/{id}?key', 'POST:users/{userId}/posts/{postId}')
	 * @returns {Array<string>} Array of unique parameter names to validate
	 * @example
	 * // Path parameters only (no ? specification)
	 * #extractParamNames('product/{id}') // ['id']
	 * 
	 * @example
	 * // Multiple path parameters (no ? specification)
	 * #extractParamNames('users/{userId}/posts/{postId}') // ['userId', 'postId']
	 * 
	 * @example
	 * // Query parameters only (? specification, no path params)
	 * #extractParamNames('search?query,limit') // ['query', 'limit']
	 * 
	 * @example
	 * // Path and query parameters combined
	 * #extractParamNames('POST:product/{id}?key') // ['id', 'key'] - both path and query params
	 * 
	 * @example
	 * // Multiple path and query parameters
	 * #extractParamNames('users/{userId}/posts/{postId}?includeProfile') // ['userId', 'postId', 'includeProfile']
	 * 
	 * @example
	 * // Duplicate parameters removed
	 * #extractParamNames('product/{id}?id,key') // ['id', 'key'] (not ['id', 'id', 'key'])
	 */
	#extractParamNames(routePattern) {
		if (!routePattern || typeof routePattern !== 'string') {
			return [];
		}

		const params = [];

		// Remove method prefix if present
		let pattern = routePattern;
		if (pattern.includes(':')) {
			const parts = pattern.split(':', 2);
			pattern = parts[1] || '';
		}

		// Split route and query parts
		const [routePart, queryPart] = pattern.split('?', 2);

		// >! Extract path parameters from {} placeholders
		if (routePart) {
			const pathParamMatches = routePart.match(/\{([^}]+)\}/g);
			if (pathParamMatches) {
				for (const match of pathParamMatches) {
					// Remove braces and add to params
					const paramName = match.slice(1, -1).trim();
					if (paramName.length > 0) {
						params.push(paramName);
					}
				}
			}
		}

		// >! Add query parameters to the list
		if (queryPart) {
			const queryParams = queryPart.split(',').map(p => p.trim()).filter(p => p.length > 0);
			params.push(...queryParams);
		}

		// >! Remove duplicates while preserving order
		return [...new Set(params)];
	}
}

module.exports = ValidationMatcher;
