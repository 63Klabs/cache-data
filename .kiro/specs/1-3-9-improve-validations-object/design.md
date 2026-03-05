# Design Document: Enhanced Validation System for ClientRequest

## Overview

This design document specifies the enhancement of the ClientRequest validation system to support route-specific and method-specific parameter validations while maintaining full backwards compatibility with existing global parameter validations.

### Current Limitations

The existing validation system only supports global parameter validations, where each parameter name (e.g., `id`, `players`) must have the same validation rules across all routes and HTTP methods. This creates limitations when:

- The same parameter name needs different validation rules in different contexts (e.g., `id` in `/product/{id}` vs `/employee/{id}`)
- Different HTTP methods require different validation constraints for the same parameter
- Multi-parameter validation is needed to enforce relationships between parameters

### Enhancement Goals

1. **Route-Specific Validations**: Allow different validation rules for the same parameter name in different routes
2. **Method-Specific Validations**: Allow different validation rules based on HTTP method
3. **Multi-Parameter Validations**: Support validation functions that evaluate multiple parameters together
4. **Clear Priority Order**: Establish predictable precedence when multiple validation rules could apply
5. **Backwards Compatibility**: Ensure existing validation configurations work without modification
6. **Performance**: Minimize overhead through caching and early exit strategies

## Architecture

### High-Level Design

The enhanced validation system uses a four-tier priority hierarchy:

```
Priority 1: Method-and-Route Match (BY_ROUTE with "METHOD:route")
    ↓ (if no match)
Priority 2: Route-Only Match (BY_ROUTE with "route")
    ↓ (if no match)
Priority 3: Method-Only Match (BY_METHOD with "METHOD")
    ↓ (if no match)
Priority 4: Global Parameter Name (existing behavior)
```

### Validation Configuration Structure


```javascript
module.exports = {
	referrers: ["example.com"],
	excludeParamsWithNoValidationMatch: true, // default
	parameters: {
		pathParameters: {
			// Global validation (Priority 4)
			id: (value) => typeof value === 'string' && value.length > 0,
			
			// Route-specific and method-specific validations
			BY_ROUTE: [
				{
					route: "POST:product/{id}",  // Priority 1: Method-and-route
					validate: (value) => /^P-[0-9]+$/.test(value)
				},
				{
					route: "product/{id}",  // Priority 2: Route-only
					validate: (value) => /^[A-Z]-[0-9]+$/.test(value)
				}
			],
			
			BY_METHOD: [
				{
					method: "POST",  // Priority 3: Method-only
					validate: (value) => value.length <= 50
				}
			]
		},
		queryParameters: {
			// Multi-parameter validation example
			BY_ROUTE: [
				{
					route: "search?query,limit",  // Validates both parameters together
					validate: ({query, limit}) => {
						return query.length > 0 && limit >= 1 && limit <= 100;
					}
				}
			]
		}
	}
};
```

### Component Responsibilities

#### ValidationMatcher (New Internal Class)

Responsible for matching validation rules to requests:

- Parse route patterns and extract parameter specifications
- Normalize routes (remove leading/trailing slashes, case-insensitive)
- Match route patterns with placeholder support (`{id}`, `{page}`)
- Determine validation priority
- Cache normalized patterns for performance

#### ValidationExecutor (New Internal Class)

Responsible for executing validation functions:

- Determine single vs multi-parameter interface
- Extract parameter values from request
- Execute validation functions with appropriate interface
- Handle validation errors gracefully
- Log validation failures with context

#### ClientRequest (Enhanced)

Enhanced to use the new validation system:

- Initialize ValidationMatcher with configuration during construction
- Delegate validation matching to ValidationMatcher
- Delegate validation execution to ValidationExecutor
- Maintain backwards compatibility with existing validation flow
- Preserve existing public API

## Components and Interfaces

### ValidationRule Interface

```javascript
/**
 * Route-specific validation rule
 * @typedef {Object} RouteValidationRule
 * @property {string} route - Route pattern or "METHOD:route" pattern
 * @property {Function} validate - Validation function
 */

/**
 * Method-specific validation rule
 * @typedef {Object} MethodValidationRule
 * @property {string} method - HTTP method (GET, POST, etc.)
 * @property {Function} validate - Validation function
 */
```

### ValidationMatcher Class

```javascript
class ValidationMatcher {
	/**
	 * Initialize matcher with validation configuration
	 * @param {Object} paramValidations - Parameter validation configuration
	 * @param {string} httpMethod - HTTP method of request
	 * @param {string} resourcePath - Resource path template
	 */
	constructor(paramValidations, httpMethod, resourcePath) {
		this.paramValidations = paramValidations;
		this.httpMethod = httpMethod.toUpperCase();
		this.resourcePath = this.#normalizeRoute(resourcePath);
		this.#cacheNormalizedPatterns();
	}
	
	/**
	 * Find the best matching validation rule for a parameter
	 * @param {string} paramName - Parameter name
	 * @returns {{validate: Function, params: Array<string>}|null} Validation rule and parameter list
	 */
	findValidationRule(paramName) {
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
		const globalMatch = this.#findGlobalMatch(paramName);
		if (globalMatch) return globalMatch;
		
		return null;
	}
	
	/**
	 * Normalize route by removing leading/trailing slashes and lowercasing
	 * @private
	 */
	#normalizeRoute(route) {
		return route.replace(/^\/|\/$/g, '').toLowerCase();
	}
	
	/**
	 * Cache normalized patterns during initialization
	 * @private
	 */
	#cacheNormalizedPatterns() {
		// Implementation caches normalized routes for performance
	}
	
	/**
	 * Check if route pattern matches request route
	 * @private
	 */
	#routeMatches(pattern, requestRoute) {
		// Implementation handles placeholder matching
	}
}
```

### ValidationExecutor Class

```javascript
class ValidationExecutor {
	/**
	 * Execute validation function with appropriate interface
	 * @param {Function} validateFn - Validation function
	 * @param {Array<string>} paramNames - Parameter names to validate
	 * @param {Object} paramValues - All parameter values
	 * @returns {boolean} True if validation passes
	 */
	static execute(validateFn, paramNames, paramValues) {
		try {
			if (paramNames.length === 1) {
				// Single parameter: pass value directly
				const value = paramValues[paramNames[0]];
				return validateFn(value);
			} else {
				// Multiple parameters: pass object
				const paramObj = {};
				for (const name of paramNames) {
					paramObj[name] = paramValues[name];
				}
				return validateFn(paramObj);
			}
		} catch (error) {
			// Log error and treat as validation failure
			DebugAndLog.error(`Validation function threw error: ${error.message}`);
			return false;
		}
	}
}
```

## Data Models

### Validation Configuration Model

```javascript
{
	referrers: Array<string>,
	excludeParamsWithNoValidationMatch: boolean,  // default: true
	parameters: {
		pathParameters: {
			// Global validations
			paramName: Function,
			
			// Route-specific validations
			BY_ROUTE: Array<{
				route: string,  // "route" or "METHOD:route"
				validate: Function
			}>,
			
			// Method-specific validations
			BY_METHOD: Array<{
				method: string,  // "GET", "POST", etc.
				validate: Function
			}>
		},
		queryParameters: { /* same structure */ },
		headerParameters: { /* same structure */ },
		cookieParameters: { /* same structure */ },
		bodyParameters: { /* same structure */ }
	}
}
```

### Route Pattern Syntax

#### Basic Route Pattern
```
"product/{id}"          // Matches: product/123, product/abc
"user/profile"          // Matches: user/profile (exact)
```

#### Method-and-Route Pattern
```
"POST:product/{id}"     // Matches: POST requests to product/*
"GET:search"            // Matches: GET requests to search
```

#### Query Parameter Specification
```
"search?query"          // Validates 'query' parameter
"search?query,limit"    // Validates both parameters together
```

#### Path Parameter Specification
```
"product/{id}"          // Validates 'id' path parameter
"user/{userId}/{page}"  // Validates both path parameters together
```

#### Mixed Parameter Specification
```
"search/{category}?query,limit"  // Validates category, query, and limit together
```

## Algorithms

### Route Pattern Matching Algorithm

```javascript
/**
 * Match route pattern against request route
 * 
 * Algorithm:
 * 1. Normalize both pattern and request route (remove slashes, lowercase)
 * 2. Split both into segments by '/'
 * 3. If segment counts don't match, return false
 * 4. For each segment:
 *    a. If pattern segment is a placeholder ({param}), match any value
 *    b. Otherwise, compare segments case-insensitively
 *    c. If any segment doesn't match, return false
 * 5. Return true if all segments match
 * 
 * Time Complexity: O(n) where n is number of segments
 * Space Complexity: O(n) for segment arrays
 */
function routeMatches(pattern, requestRoute) {
	const normalizedPattern = normalizeRoute(pattern);
	const normalizedRequest = normalizeRoute(requestRoute);
	
	const patternSegments = normalizedPattern.split('/');
	const requestSegments = normalizedRequest.split('/');
	
	if (patternSegments.length !== requestSegments.length) {
		return false;
	}
	
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
```

### Validation Priority Resolution Algorithm

```javascript
/**
 * Find validation rule with highest priority
 * 
 * Algorithm:
 * 1. Check BY_ROUTE for "METHOD:route" patterns (Priority 1)
 *    - Parse method from pattern
 *    - Check if method matches request method
 *    - Check if route matches request route
 *    - Return first match
 * 
 * 2. Check BY_ROUTE for route-only patterns (Priority 2)
 *    - Check if route matches request route
 *    - Return first match
 * 
 * 3. Check BY_METHOD for method matches (Priority 3)
 *    - Check if method matches request method
 *    - Return first match
 * 
 * 4. Check global parameter validations (Priority 4)
 *    - Return validation function for parameter name
 * 
 * 5. Return null if no match found
 * 
 * Time Complexity: O(r + m) where r is BY_ROUTE rules, m is BY_METHOD rules
 * Space Complexity: O(1)
 * 
 * Optimization: Early exit on first match (no need to check lower priorities)
 */
function findValidationRule(paramName, paramValidations, httpMethod, resourcePath) {
	// Priority 1: Method-and-route match
	if (paramValidations.BY_ROUTE) {
		for (const rule of paramValidations.BY_ROUTE) {
			if (rule.route.includes(':')) {
				const [method, route] = rule.route.split(':', 2);
				if (method.toUpperCase() === httpMethod.toUpperCase() &&
				    routeMatches(route, resourcePath)) {
					return {
						validate: rule.validate,
						params: extractParamNames(rule.route)
					};
				}
			}
		}
	}
	
	// Priority 2: Route-only match
	if (paramValidations.BY_ROUTE) {
		for (const rule of paramValidations.BY_ROUTE) {
			if (!rule.route.includes(':') && routeMatches(rule.route, resourcePath)) {
				return {
					validate: rule.validate,
					params: extractParamNames(rule.route)
				};
			}
		}
	}
	
	// Priority 3: Method-only match
	if (paramValidations.BY_METHOD) {
		for (const rule of paramValidations.BY_METHOD) {
			if (rule.method.toUpperCase() === httpMethod.toUpperCase()) {
				return {
					validate: rule.validate,
					params: [paramName]
				};
			}
		}
	}
	
	// Priority 4: Global parameter name
	if (paramValidations[paramName]) {
		return {
			validate: paramValidations[paramName],
			params: [paramName]
		};
	}
	
	return null;
}
```

### Parameter Extraction Algorithm

```javascript
/**
 * Extract parameter names from route pattern
 * 
 * Algorithm:
 * 1. Remove method prefix if present (METHOD:)
 * 2. Extract path parameters from {param} placeholders
 * 3. Extract query parameters from ?param or ?param1,param2
 * 4. Return array of all parameter names
 * 
 * Examples:
 * - "product/{id}" → ["id"]
 * - "search?query,limit" → ["query", "limit"]
 * - "POST:product/{id}?key" → ["id", "key"]
 * 
 * Time Complexity: O(n) where n is pattern length
 * Space Complexity: O(p) where p is number of parameters
 */
function extractParamNames(routePattern) {
	const params = [];
	
	// Remove method prefix if present
	let pattern = routePattern;
	if (pattern.includes(':')) {
		pattern = pattern.split(':', 2)[1];
	}
	
	// Split route and query parts
	const [routePart, queryPart] = pattern.split('?', 2);
	
	// Extract path parameters from {param} placeholders
	const pathParamRegex = /\{([^}]+)\}/g;
	let match;
	while ((match = pathParamRegex.exec(routePart)) !== null) {
		params.push(match[1]);
	}
	
	// Extract query parameters
	if (queryPart) {
		const queryParams = queryPart.split(',').map(p => p.trim());
		params.push(...queryParams);
	}
	
	return params;
}
```

### Validation Execution Flow

```
┌─────────────────────────────────────┐
│ ClientRequest Constructor           │
│ - Parse event                       │
│ - Extract HTTP method               │
│ - Extract resource path             │
│ - Initialize ValidationMatcher      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ #validate() Method                  │
│ - Call #hasValidPathParameters()    │
│ - Call #hasValidQueryStringParams() │
│ - Call #hasValidHeaderParameters()  │
│ - Call #hasValidCookieParameters()  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ #hasValidParameters()               │
│ For each parameter in request:      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ ValidationMatcher.findValidationRule│
│ - Check Priority 1: Method+Route    │
│ - Check Priority 2: Route Only      │
│ - Check Priority 3: Method Only     │
│ - Check Priority 4: Global          │
│ - Return first match or null        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ If rule found:                      │
│   ValidationExecutor.execute()      │
│   - Determine single vs multi-param │
│   - Extract parameter values        │
│   - Call validation function        │
│   - Handle errors                   │
│   - Return true/false               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ If validation passes:               │
│   - Add parameter to validated set  │
│ If validation fails:                │
│   - Log warning                     │
│   - Mark request as invalid         │
│   - Return immediately              │
│ If no rule and exclude flag true:   │
│   - Skip parameter                  │
│ If no rule and exclude flag false:  │
│   - Add parameter without validation│
└─────────────────────────────────────┘
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, the following properties were identified as testable. Redundant properties have been eliminated through consolidation:

**Consolidated Properties:**
- Properties 1.1-1.5 (backwards compatibility) → Property 1: Backwards Compatibility
- Properties 2.2, 3.5, 4.3, 5.1, 5.2 (priority order) → Property 2: Validation Priority Order
- Properties 2.3, 6.1-6.4 (route matching) → Property 3: Route Pattern Matching
- Properties 7.1, 7.2, 7.7, 13.4, 13.5 (validation interface) → Property 4: Validation Function Interface
- Properties 7.3, 7.4, 7.5 (validation execution) → Property 5: Validation Execution
- Properties 8.1-8.8 (structure validation) → Property 6: Configuration Structure Validation
- Properties 9.2, 9.3, 9.5 (error handling) → Property 7: Error Handling
- Properties 11.1, 11.2, 11.3 (performance) → Property 8: Performance Optimization

### Property 1: Backwards Compatibility Preservation

*For any* validation configuration that does not include BY_ROUTE or BY_METHOD properties, the ClientRequest SHALL process parameters exactly as it did before the enhancement, applying global parameter validations and producing identical validated parameter objects.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 12.1-12.7**

**Test Strategy:** Generate random validation configurations in the legacy format (without BY_ROUTE/BY_METHOD) and verify that validation behavior matches the original implementation.

### Property 2: Validation Priority Order

*For any* parameter with validation rules at multiple priority levels (method-and-route, route-only, method-only, global), the ClientRequest SHALL apply only the highest-priority matching rule and SHALL NOT check lower-priority rules once a match is found.

**Validates: Requirements 2.2, 3.5, 4.3, 5.1, 5.2, 5.3, 11.2**

**Test Strategy:** Create validation configurations with rules at all four priority levels, track which rules are checked, and verify that only the highest-priority matching rule is applied and lower-priority rules are not evaluated.

### Property 3: Route Pattern Matching

*For any* route pattern with placeholders and any request route, the ClientRequest SHALL match the pattern if and only if: (1) the number of segments matches, (2) non-placeholder segments match case-insensitively, and (3) placeholder segments match any value.

**Validates: Requirements 2.3, 2.5, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5**

**Test Strategy:** Generate random route patterns with various placeholder configurations and random request routes, then verify matching follows the specified algorithm. Test normalization by generating routes with different slash and case configurations.

### Property 4: Validation Function Interface Selection

*For any* route pattern specification, the ClientRequest SHALL pass a single parameter value to the validation function when exactly one parameter is specified, and SHALL pass an object with parameter names as keys when multiple parameters are specified.

**Validates: Requirements 7.1, 7.2, 7.7, 13.4, 13.5, 14.1, 14.2, 14.3**

**Test Strategy:** Generate route patterns with single and multiple parameter specifications, verify that validation functions receive the correct interface (single value vs object), and verify that multi-parameter objects include all specified parameters with correct names and values.

### Property 5: Validation Execution and Result Handling

*For any* validation function and parameter value(s), when the validation function returns true, the ClientRequest SHALL include the parameter(s) in the validated parameters object; when the validation function returns false, the ClientRequest SHALL mark the request as invalid, exclude the parameter(s), and log a warning.

**Validates: Requirements 7.3, 7.4, 7.5, 9.1**

**Test Strategy:** Generate random validation functions that return true or false, verify that parameters are included/excluded correctly, verify that request validity is set correctly, and verify that warnings are logged for failures.

### Property 6: Configuration Structure Validation

*For any* validation configuration, the ClientRequest SHALL accept configurations where: (1) BY_ROUTE entries have 'route' and 'validate' properties, (2) BY_METHOD entries have 'method' and 'validate' properties, (3) 'validate' properties are functions, and (4) 'route' properties are strings in valid format.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8**

**Test Strategy:** Generate validation configurations with various structures, verify that valid configurations are accepted, and verify that invalid configurations are handled gracefully (either rejected or logged with warnings).

### Property 7: Error Handling and Logging

*For any* validation function that throws an error during execution, the ClientRequest SHALL catch the error, mark the request as invalid, log the error with sufficient context to identify the failing rule, and continue processing other parameters.

**Validates: Requirements 9.2, 9.3, 9.5**

**Test Strategy:** Generate validation functions that throw various types of errors, verify that errors are caught and don't crash the request processing, verify that errors are logged with rule context, and verify that other parameters continue to be processed.

### Property 8: Performance Optimization Through Early Exit

*For any* parameter with multiple potential validation rules, the ClientRequest SHALL stop checking rules immediately after finding the first match at the highest priority level, minimizing the number of pattern comparisons performed.

**Validates: Requirements 11.1, 11.2**

**Test Strategy:** Create validation configurations with many rules at different priority levels, instrument the matching code to count comparisons, and verify that the number of comparisons is minimized (no lower-priority checks after a match).

### Property 9: Route Normalization Consistency

*For any* two route patterns that differ only in leading/trailing slashes or letter casing, the ClientRequest SHALL treat them as equivalent after normalization.

**Validates: Requirements 6.3, 6.4**

**Test Strategy:** Generate pairs of route patterns that differ only in slashes or casing (e.g., "/product/{id}/" vs "product/{id}", "Product/{ID}" vs "product/{id}"), and verify that they match the same request routes.

### Property 10: Parameter Specification Parsing

*For any* route pattern with parameter specifications (query parameters with ?, path parameters with {}, or comma-separated lists), the ClientRequest SHALL correctly extract all parameter names and use them to determine the validation function interface.

**Validates: Requirements 13.1, 13.2, 13.3, 13.6**

**Test Strategy:** Generate route patterns with various parameter specification formats (single path param, multiple path params, single query param, multiple query params, mixed), and verify that all parameter names are correctly extracted and the appropriate validation interface is used.

### Property 11: Multi-Parameter Validation Object Structure

*For any* multi-parameter validation with specified parameter names, the ClientRequest SHALL pass an object to the validation function that includes all specified parameters as properties, even if some parameter values are undefined or null.

**Validates: Requirements 14.3, 14.4, 14.5**

**Test Strategy:** Generate multi-parameter validations with various combinations of present and missing parameters, and verify that the validation function receives an object with all specified parameter names as keys, with undefined/null values for missing parameters.

### Property 12: Method Matching Case-Insensitivity

*For any* HTTP method specified in validation rules (in BY_METHOD or METHOD:route patterns), the ClientRequest SHALL match the method case-insensitively against the request method.

**Validates: Requirements 4.5**

**Test Strategy:** Generate method specifications in various cases (GET, get, Get, gEt) and verify that they all match requests with the same method regardless of case.

### Property 13: Exclude Flag Behavior

*For any* parameter without a matching validation rule, the ClientRequest SHALL exclude the parameter from the validated parameters object when excludeParamsWithNoValidationMatch is true (default), and SHALL include the parameter without validation when excludeParamsWithNoValidationMatch is false.

**Validates: Requirements 5.4, 5.5**

**Test Strategy:** Generate requests with parameters that have no validation rules, test with excludeParamsWithNoValidationMatch set to both true and false, and verify that parameters are excluded or included accordingly.

### Property 14: Validation Timing

*For all* requests, the ClientRequest SHALL perform parameter validation during constructor execution (initialization phase), ensuring that invalid requests are identified immediately before any other processing occurs.

**Validates: Requirements 11.4**

**Test Strategy:** Verify that validation occurs in the constructor by checking that the isValid flag is set before the constructor returns, and that validation errors are available immediately after construction.

### Property 15: Absent Parameter Skipping

*For any* validation rule, the ClientRequest SHALL NOT execute the validation function if the parameter is not present in the request, avoiding unnecessary validation overhead.

**Validates: Requirements 11.5**

**Test Strategy:** Generate validation configurations with rules for parameters that are not in the request, instrument validation functions to track calls, and verify that validation functions are not called for absent parameters.

## Error Handling

### Validation Function Errors

When a validation function throws an error:

1. **Catch the Error**: Wrap validation function calls in try-catch blocks
2. **Log with Context**: Log the error with parameter name, route pattern, and error message
3. **Mark as Invalid**: Treat the error as a validation failure (mark request as invalid)
4. **Continue Processing**: Don't stop processing other parameters
5. **Return False**: Treat thrown errors as validation failures

```javascript
try {
	const isValid = validateFn(value);
	return isValid;
} catch (error) {
	DebugAndLog.error(
		`Validation function error for parameter '${paramName}': ${error.message}`,
		error.stack
	);
	return false;
}
```

### Configuration Errors

When validation configuration is invalid:

1. **Detect Early**: Validate configuration structure during initialization
2. **Log Warnings**: Log warnings for invalid configuration entries
3. **Skip Invalid Rules**: Skip rules with invalid structure, continue with valid rules
4. **Don't Crash**: Never throw errors that would prevent request processing

Invalid configuration examples:
- BY_ROUTE entry missing 'route' or 'validate' property
- BY_METHOD entry missing 'method' or 'validate' property
- 'validate' property is not a function
- 'route' property is not a string

### Route Matching Errors

When route matching encounters errors:

1. **Handle Gracefully**: Catch any errors in route matching logic
2. **Log Debug Info**: Log route pattern and request route for debugging
3. **Return No Match**: Treat errors as non-matches, continue to next priority
4. **Don't Block Validation**: Errors in one rule shouldn't prevent checking other rules

### Sensitive Data Protection

When logging validation failures:

1. **Sanitize Values**: Don't log full parameter values that might be sensitive (passwords, tokens, keys)
2. **Log Parameter Names**: Always log parameter names for debugging
3. **Log Partial Values**: For debugging, log only first/last few characters or value length
4. **Respect Privacy**: Follow data privacy regulations (GDPR, CCPA)

```javascript
// Good: Sanitized logging
DebugAndLog.warn(`Invalid parameter: ${paramName} (length: ${value.length})`);

// Bad: Exposes sensitive data
DebugAndLog.warn(`Invalid parameter: ${paramName} = ${value}`);
```

## Testing Strategy

### Dual Testing Approach

The validation system requires both unit tests and property-based tests:

#### Unit Tests

Unit tests verify specific examples and edge cases:

- **Backwards Compatibility**: Test existing validation configurations work unchanged
- **Priority Order Examples**: Test specific scenarios with rules at different priorities
- **Route Matching Examples**: Test exact matches, placeholder matches, normalization
- **Multi-Parameter Examples**: Test specific multi-parameter validation scenarios
- **Error Handling Examples**: Test specific error conditions
- **Configuration Examples**: Test valid and invalid configuration structures

#### Property-Based Tests

Property-based tests verify universal properties across many inputs:

- **Property 1**: Generate random legacy configurations, verify backwards compatibility
- **Property 2**: Generate configurations with all priority levels, verify priority order
- **Property 3**: Generate random route patterns and request routes, verify matching algorithm
- **Property 4**: Generate random parameter specifications, verify interface selection
- **Property 5**: Generate random validation functions, verify execution and result handling
- **Property 6**: Generate random configurations, verify structure validation
- **Property 7**: Generate validation functions that throw errors, verify error handling
- **Property 8**: Generate configurations with many rules, verify early exit optimization
- **Property 9**: Generate route pairs with different slashes/casing, verify normalization
- **Property 10**: Generate route patterns with various parameter specs, verify parsing
- **Property 11**: Generate multi-parameter validations with missing params, verify object structure
- **Property 12**: Generate methods in various cases, verify case-insensitive matching
- **Property 13**: Generate parameters without rules, verify exclude flag behavior
- **Property 14**: Verify validation timing in constructor
- **Property 15**: Generate rules for absent parameters, verify skipping

### Property-Based Testing Configuration

All property-based tests MUST:

- Use fast-check library for property generation
- Run minimum 100 iterations per property
- Include test tags referencing design properties
- Test with realistic data (not just edge cases)

Example property test structure:

```javascript
import fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';

describe('Validation System Property Tests', () => {
	it('Property 1: Backwards Compatibility Preservation', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate legacy validation configuration
				fc.record({
					pathParameters: fc.dictionary(fc.string(), fc.func(fc.boolean())),
					queryParameters: fc.dictionary(fc.string(), fc.func(fc.boolean()))
				}),
				async (legacyConfig) => {
					// Test that legacy config works unchanged
					// Verify behavior matches original implementation
				}
			),
			{ numRuns: 100 }
		);
	});
	
	// Feature: 1-3-9-improve-validations-object, Property 1: Backwards Compatibility Preservation
});
```

### Test Coverage Goals

- **Unit Test Coverage**: >80% of validation matching and execution code
- **Property Test Coverage**: All 15 correctness properties must have property-based tests
- **Integration Test Coverage**: End-to-end tests with real ClientRequest instances
- **Edge Case Coverage**: Boundary conditions, empty inputs, null/undefined values

### Test Organization

```
test/
├── request/
│   ├── validation/
│   │   ├── unit/
│   │   │   ├── backwards-compatibility-tests.jest.mjs
│   │   │   ├── priority-order-tests.jest.mjs
│   │   │   ├── route-matching-tests.jest.mjs
│   │   │   ├── multi-parameter-tests.jest.mjs
│   │   │   └── error-handling-tests.jest.mjs
│   │   ├── integration/
│   │   │   ├── client-request-validation-tests.jest.mjs
│   │   │   └── real-world-scenarios-tests.jest.mjs
│   │   └── property/
│   │       ├── backwards-compatibility-property-tests.jest.mjs
│   │       ├── priority-order-property-tests.jest.mjs
│   │       ├── route-matching-property-tests.jest.mjs
│   │       ├── validation-interface-property-tests.jest.mjs
│   │       └── error-handling-property-tests.jest.mjs
```

## Performance Considerations

### Optimization Strategies

#### 1. Pattern Normalization Caching

**Problem**: Normalizing route patterns (removing slashes, lowercasing) on every validation check is expensive.

**Solution**: Cache normalized patterns during initialization.

```javascript
class ValidationMatcher {
	constructor(paramValidations, httpMethod, resourcePath) {
		this.normalizedResourcePath = this.#normalizeRoute(resourcePath);
		this.cachedPatterns = new Map();
		this.#cacheNormalizedPatterns();
	}
	
	#cacheNormalizedPatterns() {
		// Cache all route patterns from BY_ROUTE
		if (this.paramValidations.BY_ROUTE) {
			for (const rule of this.paramValidations.BY_ROUTE) {
				const normalized = this.#normalizeRoute(rule.route);
				this.cachedPatterns.set(rule.route, normalized);
			}
		}
	}
}
```

**Impact**: Reduces string processing overhead from O(n*m) to O(n) where n is number of rules, m is pattern length.

#### 2. Early Exit on Match

**Problem**: Checking all priority levels even after finding a match wastes CPU cycles.

**Solution**: Return immediately after finding first match.

```javascript
findValidationRule(paramName) {
	// Priority 1: Method-and-route
	const match1 = this.#findMethodRouteMatch(paramName);
	if (match1) return match1;  // Early exit
	
	// Priority 2: Route-only
	const match2 = this.#findRouteMatch(paramName);
	if (match2) return match2;  // Early exit
	
	// Priority 3: Method-only
	const match3 = this.#findMethodMatch(paramName);
	if (match3) return match3;  // Early exit
	
	// Priority 4: Global
	return this.#findGlobalMatch(paramName);
}
```

**Impact**: Reduces average-case complexity from O(r+m+g) to O(1) for common cases where high-priority rules match.

#### 3. Absent Parameter Skipping

**Problem**: Executing validation functions for parameters not in the request wastes CPU.

**Solution**: Check parameter existence before validation.

```javascript
#hasValidParameters(paramValidations, clientParameters) {
	for (const [key, value] of Object.entries(clientParameters)) {
		// Only validate parameters that are present
		const rule = this.matcher.findValidationRule(key);
		if (rule) {
			const isValid = ValidationExecutor.execute(rule.validate, rule.params, clientParameters);
			// Handle validation result
		}
	}
}
```

**Impact**: Avoids unnecessary function calls for absent parameters.

#### 4. Validation Function Memoization (Optional)

**Problem**: Same validation function might be called multiple times with same value.

**Solution**: Cache validation results for identical inputs (optional optimization).

```javascript
class ValidationExecutor {
	static #cache = new Map();
	
	static execute(validateFn, paramNames, paramValues) {
		// Create cache key from function and values
		const cacheKey = this.#createCacheKey(validateFn, paramNames, paramValues);
		
		if (this.#cache.has(cacheKey)) {
			return this.#cache.get(cacheKey);
		}
		
		const result = this.#executeValidation(validateFn, paramNames, paramValues);
		this.#cache.set(cacheKey, result);
		return result;
	}
}
```

**Impact**: Reduces redundant validation function calls. **Note**: Only use if validation functions are pure (no side effects).

### Performance Benchmarks

Target performance metrics:

- **Initialization Overhead**: < 5ms for typical validation configuration (10-20 rules)
- **Validation Time**: < 1ms per parameter for simple validations
- **Memory Overhead**: < 1KB per validation rule for cached patterns
- **Worst-Case Complexity**: O(r+m) where r is BY_ROUTE rules, m is BY_METHOD rules

### Performance Testing

Include performance tests to verify optimization effectiveness:

```javascript
describe('Validation Performance', () => {
	it('should validate 100 parameters in < 100ms', () => {
		const start = Date.now();
		
		// Validate 100 parameters
		for (let i = 0; i < 100; i++) {
			clientRequest.#hasValidParameters(validations, params);
		}
		
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(100);
	});
	
	it('should not check lower-priority rules after match', () => {
		let checksPerformed = 0;
		
		// Instrument matching code to count checks
		// Verify that only highest-priority rule is checked
		
		expect(checksPerformed).toBe(1);
	});
});
```

## Implementation Approach

### Phase 1: Internal Classes (No Breaking Changes)

1. **Create ValidationMatcher Class**
   - Implement route pattern matching algorithm
   - Implement priority resolution algorithm
   - Implement pattern normalization and caching
   - Add comprehensive unit tests

2. **Create ValidationExecutor Class**
   - Implement single vs multi-parameter interface selection
   - Implement validation function execution with error handling
   - Add comprehensive unit tests

3. **Add Property-Based Tests**
   - Implement property tests for ValidationMatcher
   - Implement property tests for ValidationExecutor
   - Verify all properties pass

### Phase 2: ClientRequest Integration (Backwards Compatible)

1. **Enhance #hasValidParameters Method**
   - Initialize ValidationMatcher in constructor
   - Replace direct validation lookup with ValidationMatcher.findValidationRule()
   - Replace direct validation execution with ValidationExecutor.execute()
   - Maintain existing behavior for legacy configurations

2. **Add Integration Tests**
   - Test ClientRequest with legacy configurations (verify backwards compatibility)
   - Test ClientRequest with new BY_ROUTE configurations
   - Test ClientRequest with new BY_METHOD configurations
   - Test ClientRequest with mixed configurations

3. **Add End-to-End Tests**
   - Test real-world scenarios with actual Lambda events
   - Test all priority levels with realistic validation rules
   - Test multi-parameter validations with realistic use cases

### Phase 3: Documentation and Examples

1. **Update JSDoc Documentation**
   - Document new BY_ROUTE and BY_METHOD properties
   - Document validation priority order
   - Document parameter specification syntax
   - Document multi-parameter validation interface

2. **Create Example Configurations**
   - Update example-validations.js with BY_ROUTE examples
   - Add BY_METHOD examples
   - Add multi-parameter validation examples
   - Add mixed priority examples

3. **Update User Documentation**
   - Update request-validation.md with new features
   - Add migration guide for existing users
   - Add troubleshooting section
   - Add performance optimization tips

### Phase 4: Validation and Release

1. **Run Full Test Suite**
   - All unit tests must pass
   - All property-based tests must pass
   - All integration tests must pass
   - All backwards compatibility tests must pass

2. **Performance Validation**
   - Run performance benchmarks
   - Verify optimization effectiveness
   - Profile memory usage
   - Verify no performance regression for legacy configurations

3. **Documentation Review**
   - Verify all JSDoc is complete and accurate
   - Verify examples are executable
   - Verify migration guide is clear
   - Run documentation validation tests

4. **Release**
   - Update CHANGELOG.md with new features
   - Bump minor version (1.3.9 → 1.4.0)
   - Publish to NPM
   - Update GitHub release notes

## Backwards Compatibility Guarantees

### What Will NOT Change

1. **Existing Validation Configurations**: All existing validation configurations without BY_ROUTE or BY_METHOD will work exactly as before
2. **Global Validation Behavior**: Global parameter validations will continue to work identically
3. **Validation Function Interface**: Single-parameter validation functions will continue to receive a single value
4. **Parameter Exclusion**: The excludeParamsWithNoValidationMatch flag will continue to work as before
5. **Public API**: No changes to ClientRequest public methods or properties
6. **Export Structure**: The validation configuration export structure remains unchanged

### What Will Change (Additions Only)

1. **New Optional Properties**: BY_ROUTE and BY_METHOD arrays can be added to parameter type objects
2. **New Validation Priority**: When BY_ROUTE or BY_METHOD are present, they take priority over global validations
3. **New Multi-Parameter Interface**: Validation functions can now receive objects for multi-parameter validation
4. **New Parameter Specification Syntax**: Route patterns can now specify which parameters to validate

### Migration Path

Existing users can adopt the new features incrementally:

**Step 1**: Continue using existing global validations (no changes required)

**Step 2**: Add route-specific validations for specific routes that need different rules

```javascript
// Before: Global validation only
pathParameters: {
	id: (value) => typeof value === 'string'
}

// After: Add route-specific validation
pathParameters: {
	id: (value) => typeof value === 'string',  // Still works as fallback
	BY_ROUTE: [
		{
			route: "product/{id}",
			validate: (value) => /^P-[0-9]+$/.test(value)
		}
	]
}
```

**Step 3**: Add method-specific validations for method-dependent rules

```javascript
pathParameters: {
	id: (value) => typeof value === 'string',
	BY_ROUTE: [ /* route-specific rules */ ],
	BY_METHOD: [
		{
			method: "POST",
			validate: (value) => value.length <= 50
		}
	]
}
```

**Step 4**: Add multi-parameter validations for cross-parameter constraints

```javascript
queryParameters: {
	BY_ROUTE: [
		{
			route: "search?query,limit",
			validate: ({query, limit}) => {
				return query.length > 0 && limit >= 1 && limit <= 100;
			}
		}
	]
}
```

### Deprecation Policy

No features are being deprecated in this enhancement. All existing functionality remains supported.

## Security Considerations

### Input Validation

1. **Validate Configuration Structure**: Verify BY_ROUTE and BY_METHOD entries have required properties
2. **Validate Route Patterns**: Ensure route patterns are strings and don't contain malicious content
3. **Validate Validation Functions**: Ensure 'validate' properties are functions
4. **Sanitize Log Output**: Don't log sensitive parameter values in validation failures

### Error Handling Security

1. **Catch All Errors**: Wrap validation function calls in try-catch to prevent crashes
2. **Don't Expose Internals**: Error messages should not reveal internal implementation details
3. **Rate Limiting**: Consider rate limiting validation failures to prevent DoS attacks
4. **Audit Logging**: Log validation failures for security monitoring

### Injection Prevention

1. **No Dynamic Code Execution**: Never use eval() or Function() constructor with route patterns
2. **Parameterized Matching**: Use parameterized route matching, not string concatenation
3. **Escape Special Characters**: Properly escape regex special characters in route patterns
4. **Validate Input Sources**: Ensure validation configurations come from trusted sources

## Summary

This design enhances the ClientRequest validation system with route-specific and method-specific parameter validations while maintaining full backwards compatibility. The key innovations are:

1. **Four-Tier Priority System**: Clear precedence from most specific (method-and-route) to least specific (global)
2. **Multi-Parameter Validation**: Support for validating multiple parameters together
3. **Flexible Parameter Specification**: Rich syntax for specifying which parameters to validate
4. **Performance Optimization**: Caching and early exit strategies minimize overhead
5. **Backwards Compatibility**: Existing configurations work without modification
6. **Comprehensive Testing**: Property-based tests verify correctness across all inputs

The implementation follows the established patterns in the codebase, uses internal classes to encapsulate complexity, and maintains the clean public API of ClientRequest.
