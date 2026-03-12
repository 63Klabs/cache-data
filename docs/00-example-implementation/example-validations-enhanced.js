/**
 * Enhanced Validation Configuration Examples
 * 
 * This file demonstrates the enhanced validation system for ClientRequest,
 * including route-specific, method-specific, and multi-parameter validations.
 * 
 * Validation Priority Order (highest to lowest):
 * 1. Method-and-route match (BY_ROUTE with "METHOD:route")
 * 2. Route-only match (BY_ROUTE with "route")
 * 3. Method-only match (BY_METHOD with "METHOD")
 * 4. Global parameter name
 */

// ============================================================================
// Example 1: Legacy Global Validations (Backwards Compatible)
// ============================================================================
// This is the traditional validation approach that continues to work unchanged.
// Global validations apply to all routes and methods.

const legacyValidations = {
	referrers: ['example.com', 'myapp.com'],
	excludeParamsWithNoValidationMatch: true,  // Default: exclude unvalidated parameters
	parameters: {
		pathParameters: {
			// Global validation - applies to 'id' parameter on all routes
			id: (value) => typeof value === 'string' && value.length > 0,
			userId: (value) => /^[0-9]+$/.test(value)
		},
		queryStringParameters: {
			// Global validation - applies to 'limit' parameter on all routes
			limit: (value) => !isNaN(value) && value > 0 && value <= 100,
			page: (value) => !isNaN(value) && value > 0
		}
	}
};

// ============================================================================
// Example 2: Route-Specific Validations (Priority 2)
// ============================================================================
// Different validation rules for the same parameter name on different routes.
// Route-specific validations override global validations.

const routeSpecificValidations = {
	parameters: {
		pathParameters: {
			// Global validation (Priority 4) - fallback for routes without specific rules
			id: (value) => typeof value === 'string' && value.length > 0,
			
			// Route-specific validations (Priority 2)
			BY_ROUTE: [
				{
					// Product IDs must start with 'P-' followed by digits
					route: "product/{id}",
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				{
					// Employee IDs must start with 'E-' followed by digits
					route: "employee/{id}",
					validate: (value) => /^E-[0-9]+$/.test(value)
				},
				{
					// Order IDs must be UUIDs
					route: "order/{id}",
					validate: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
				}
			]
		}
	}
};

// ============================================================================
// Example 3: Method-Specific Validations (Priority 3)
// ============================================================================
// Different validation rules based on HTTP method, regardless of route.
// Method-specific validations override global validations but are overridden
// by route-specific validations.

const methodSpecificValidations = {
	parameters: {
		pathParameters: {
			// Global validation (Priority 4)
			id: (value) => typeof value === 'string',
			
			// Method-specific validations (Priority 3)
			BY_METHOD: [
				{
					// POST requests require shorter IDs (for creation)
					method: "POST",
					validate: (value) => value.length > 0 && value.length <= 50
				},
				{
					// GET requests allow longer IDs (for retrieval)
					method: "GET",
					validate: (value) => value.length > 0 && value.length <= 200
				},
				{
					// DELETE requests require non-empty IDs
					method: "DELETE",
					validate: (value) => value.length > 0
				}
			]
		},
		queryStringParameters: {
			BY_METHOD: [
				{
					// POST requests don't allow query parameters
					method: "POST",
					validate: () => false
				},
				{
					// GET requests allow query parameters
					method: "GET",
					validate: (value) => typeof value === 'string'
				}
			]
		}
	}
};

// ============================================================================
// Example 4: Method-and-Route Validations (Priority 1 - Highest)
// ============================================================================
// Most specific validation rules that apply only to a specific combination
// of HTTP method and route. These override all other validation rules.

const methodAndRouteValidations = {
	parameters: {
		pathParameters: {
			BY_ROUTE: [
				{
					// POST to game/join requires 6-digit game code
					route: "POST:game/join/{id}",
					validate: (value) => /^[0-9]{6}$/.test(value)
				},
				{
					// GET from game/join allows any numeric ID
					route: "GET:game/join/{id}",
					validate: (value) => /^[0-9]+$/.test(value)
				},
				{
					// POST to product creation requires specific format
					route: "POST:product/{id}",
					validate: (value) => /^P-[0-9]{4}$/.test(value)
				},
				{
					// GET from product allows longer IDs
					route: "GET:product/{id}",
					validate: (value) => /^P-[0-9]+$/.test(value)
				}
			]
		}
	}
};

// ============================================================================
// Example 5: Multi-Parameter Validation
// ============================================================================
// Validate multiple parameters together to enforce relationships and constraints.
// The validation function receives an object with all specified parameters.

const multiParameterValidations = {
	parameters: {
		queryStringParameters: {
			BY_ROUTE: [
				{
					// Validate query and limit together for search endpoint
					route: "search?query,limit",
					validate: ({query, limit}) => {
						// Both parameters must be present and valid
						if (!query || query.length === 0) return false;
						if (!limit || isNaN(limit)) return false;
						
						// Enforce relationship: limit must be reasonable for query length
						const numLimit = parseInt(limit);
						return numLimit >= 1 && numLimit <= 100;
					}
				},
				{
					// Validate pagination parameters together
					route: "users?page,limit",
					validate: ({page, limit}) => {
						const numPage = parseInt(page);
						const numLimit = parseInt(limit);
						
						// Both must be positive integers
						if (isNaN(numPage) || isNaN(numLimit)) return false;
						if (numPage < 1 || numLimit < 1) return false;
						
						// Limit must not exceed maximum
						return numLimit <= 100;
					}
				}
			]
		},
		pathParameters: {
			BY_ROUTE: [
				{
					// Validate multiple path parameters together
					route: "user/{userId}/post/{postId}",
					validate: ({userId, postId}) => {
						// Both must be numeric
						return /^[0-9]+$/.test(userId) && /^[0-9]+$/.test(postId);
					}
				}
			]
		}
	}
};

// ============================================================================
// Example 6: Mixed Priority Levels (Complete Example)
// ============================================================================
// Demonstrates all priority levels working together. The highest-priority
// matching rule is applied, and lower-priority rules are not checked.

const mixedPriorityValidations = {
	referrers: ['example.com'],
	excludeParamsWithNoValidationMatch: true,
	parameters: {
		pathParameters: {
			// Priority 4: Global validation (fallback for all routes)
			id: (value) => typeof value === 'string' && value.length > 0,
			
			// Priority 3: Method-specific validations
			BY_METHOD: [
				{
					method: "POST",
					validate: (value) => value.length <= 50
				},
				{
					method: "GET",
					validate: (value) => value.length > 0
				}
			],
			
			// Priority 2 and 1: Route-specific and method-and-route validations
			BY_ROUTE: [
				// Priority 1: Method-and-route (most specific)
				{
					route: "POST:product/{id}",
					validate: (value) => /^P-[0-9]{4}$/.test(value)
				},
				{
					route: "GET:product/{id}",
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				
				// Priority 2: Route-only (less specific than method-and-route)
				{
					route: "product/{id}",
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				{
					route: "employee/{id}",
					validate: (value) => /^E-[0-9]+$/.test(value)
				}
			]
		},
		queryStringParameters: {
			// Global validations
			limit: (value) => !isNaN(value) && value > 0 && value <= 100,
			page: (value) => !isNaN(value) && value > 0,
			
			// Route-specific multi-parameter validation
			BY_ROUTE: [
				{
					route: "search?query,limit",
					validate: ({query, limit}) => {
						return query.length > 0 && 
						       !isNaN(limit) && 
						       parseInt(limit) >= 1 && 
						       parseInt(limit) <= 100;
					}
				}
			]
		}
	}
};

// ============================================================================
// Example 7: Real-World API Validation Configuration
// ============================================================================
// A complete, production-ready validation configuration for a RESTful API.

const productionValidations = {
	referrers: ['myapp.com', 'api.myapp.com'],
	excludeParamsWithNoValidationMatch: true,
	parameters: {
		pathParameters: {
			// Global fallback validations
			id: (value) => typeof value === 'string' && value.length > 0,
			userId: (value) => /^[0-9]+$/.test(value),
			
			BY_ROUTE: [
				// Product endpoints
				{
					route: "POST:product/{id}",
					validate: (value) => /^P-[0-9]{4}$/.test(value)
				},
				{
					route: "product/{id}",
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				
				// User endpoints
				{
					route: "user/{userId}/profile",
					validate: (value) => /^[0-9]{1,10}$/.test(value)
				},
				
				// Order endpoints
				{
					route: "order/{id}",
					validate: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
				}
			],
			
			BY_METHOD: [
				{
					method: "POST",
					validate: (value) => value.length <= 50
				},
				{
					method: "DELETE",
					validate: (value) => value.length > 0 && value.length <= 100
				}
			]
		},
		queryStringParameters: {
			// Global query parameter validations
			limit: (value) => !isNaN(value) && parseInt(value) >= 1 && parseInt(value) <= 100,
			page: (value) => !isNaN(value) && parseInt(value) >= 1,
			sort: (value) => ['asc', 'desc'].includes(value.toLowerCase()),
			
			BY_ROUTE: [
				// Search endpoint with multi-parameter validation
				{
					route: "search?query,limit,page",
					validate: ({query, limit, page}) => {
						if (!query || query.length === 0) return false;
						
						const numLimit = parseInt(limit);
						const numPage = parseInt(page);
						
						return !isNaN(numLimit) && numLimit >= 1 && numLimit <= 100 &&
						       !isNaN(numPage) && numPage >= 1;
					}
				},
				
				// Product filter endpoint
				{
					route: "product?category,minPrice,maxPrice",
					validate: ({category, minPrice, maxPrice}) => {
						if (!category || category.length === 0) return false;
						
						const min = parseFloat(minPrice);
						const max = parseFloat(maxPrice);
						
						if (isNaN(min) || isNaN(max)) return false;
						return min >= 0 && max >= min;
					}
				}
			]
		},
		headerParameters: {
			// Header validations (headers are camelCased automatically)
			contentType: (value) => ['application/json', 'application/xml'].includes(value),
			authorization: (value) => value.startsWith('Bearer ') && value.length > 7
		}
	}
};

// ============================================================================
// Usage Examples
// ============================================================================

// Initialize ClientRequest with one of the validation configurations
const { tools: {ClientRequest} } = require('@63klabs/cache-data');

// Use legacy validations (backwards compatible)
ClientRequest.init(legacyValidations);

// Or use enhanced validations with route-specific rules
ClientRequest.init(routeSpecificValidations);

// Or use the complete production configuration
ClientRequest.init(productionValidations);

// In your Lambda handler
exports.handler = async (event, context) => {
	const clientRequest = new ClientRequest(event, context);
	
	// Check if request is valid
	if (!clientRequest.isValid()) {
		return {
			statusCode: 400,
			body: JSON.stringify({ error: 'Invalid request parameters' })
		};
	}
	
	// Get validated parameters
	const pathParams = clientRequest.getPathParameters();
	const queryParams = clientRequest.getQueryStringParameters();
	
	// Process request with validated parameters
	// ...
	
	return {
		statusCode: 200,
		body: JSON.stringify({ success: true })
	};
};

// ============================================================================
// Validation Priority Examples
// ============================================================================

// Example: How priority order works
// Given this configuration:
const priorityExample = {
	parameters: {
		pathParameters: {
			id: (value) => typeof value === 'string',  // Priority 4: Global
			
			BY_METHOD: [
				{
					method: "POST",  // Priority 3: Method-only
					validate: (value) => value.length <= 50
				}
			],
			
			BY_ROUTE: [
				{
					route: "product/{id}",  // Priority 2: Route-only
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				{
					route: "POST:product/{id}",  // Priority 1: Method-and-route
					validate: (value) => /^P-[0-9]{4}$/.test(value)
				}
			]
		}
	}
};

// For a POST request to /product/P-1234:
// 1. Checks "POST:product/{id}" (Priority 1) - MATCHES - Uses this validation
// 2. Does NOT check "product/{id}" (Priority 2) - early exit
// 3. Does NOT check "POST" method (Priority 3) - early exit
// 4. Does NOT check global "id" (Priority 4) - early exit

// For a GET request to /product/P-1234:
// 1. Checks "POST:product/{id}" (Priority 1) - no match (wrong method)
// 2. Checks "product/{id}" (Priority 2) - MATCHES - Uses this validation
// 3. Does NOT check "POST" method (Priority 3) - early exit
// 4. Does NOT check global "id" (Priority 4) - early exit

// For a POST request to /employee/E-5678:
// 1. Checks "POST:product/{id}" (Priority 1) - no match (wrong route)
// 2. Checks "product/{id}" (Priority 2) - no match (wrong route)
// 3. Checks "POST" method (Priority 3) - MATCHES - Uses this validation
// 4. Does NOT check global "id" (Priority 4) - early exit

// For a GET request to /employee/E-5678:
// 1. Checks "POST:product/{id}" (Priority 1) - no match
// 2. Checks "product/{id}" (Priority 2) - no match
// 3. Checks "POST" method (Priority 3) - no match (wrong method)
// 4. Checks global "id" (Priority 4) - MATCHES - Uses this validation

module.exports = {
	legacyValidations,
	routeSpecificValidations,
	methodSpecificValidations,
	methodAndRouteValidations,
	multiParameterValidations,
	mixedPriorityValidations,
	productionValidations
};
