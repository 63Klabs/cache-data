/**
 * Property-Based Preservation Test: Path Parameter Extraction
 * 
 * Property 2: Preservation - Path Parameter Extraction Unchanged
 * 
 * METHODOLOGY: Observation-First
 * - Observe behavior on UNFIXED code for path parameter extraction
 * - Write tests that PASS on unfixed code
 * - These tests confirm baseline behavior to preserve during bug fixes
 * 
 * EXPECTED OUTCOME: All tests PASS on unfixed code
 * 
 * OBSERVATION: On unfixed code, getPathParameters() returns empty object {} in ALL cases,
 * even when path parameters exist. The ONLY working behavior is returning {} when no
 * path parameters exist. This is the baseline behavior to preserve.
 * 
 * NOTE: Path parameter extraction is completely broken on unfixed code (bugs #2, #3).
 * This preservation test only validates the one case that works: no path parameters.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest class
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

// Mock Lambda context
const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('Property 2: Path Parameter Extraction Preservation', () => {
	
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});
	
	describe('Unit Tests - Baseline Behavior (What Actually Works)', () => {
		
		it('should return empty object when no path parameters exist', () => {
			// Arrange: Route with no placeholders
			const event = {
				httpMethod: 'GET',
				resource: '/health',
				path: '/health',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const pathParams = request.getPathParameters();
			
			// Assert: Empty object returned when no path parameters
			// This is the ONLY case that works on unfixed code
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({});
		});
		
		it('should return empty object when pathParameters is null', () => {
			// Arrange: pathParameters is null
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const pathParams = request.getPathParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({});
		});
		
		it('should return empty object when pathParameters is undefined', () => {
			// Arrange: pathParameters is undefined
			const event = {
				httpMethod: 'GET',
				resource: '/status',
				path: '/status',
				pathParameters: undefined,
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const pathParams = request.getPathParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({});
		});
		
		it('should return empty object when pathParameters is empty object', () => {
			// Arrange: pathParameters is {}
			const event = {
				httpMethod: 'GET',
				resource: '/info',
				path: '/info',
				pathParameters: {},
				queryStringParameters: null,
				headers: {},
				body: null
			};
			
			const validations = {};
			
			// Act
			const request = new ClientRequest(event, mockContext, validations);
			const pathParams = request.getPathParameters();
			
			// Assert: Empty object returned
			expect(request.isValid()).toBe(true);
			expect(pathParams).toEqual({});
		});
	});
	
	describe('Property-Based Tests - Baseline Behavior', () => {
		
		it('Property: Empty object returned when no path parameters exist', () => {
			// Property: For all routes without placeholders,
			// getPathParameters() returns empty object
			// This is the ONLY behavior that works on unfixed code
			
			fc.assert(
				fc.property(
					fc.constantFrom('health', 'status', 'info', 'version', 'ping', 'ready', 'alive'),
					(routePath) => {
						// Arrange: No path parameters
						const event = {
							httpMethod: 'GET',
							resource: `/${routePath}`,
							path: `/${routePath}`,
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: null
						};
						
						const validations = {};
						
						// Act
						const request = new ClientRequest(event, mockContext, validations);
						const pathParams = request.getPathParameters();
						
						// Assert: Empty object returned
						expect(request.isValid()).toBe(true);
						expect(pathParams).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
		
		it('Property: Empty object returned for various null/undefined pathParameters', () => {
			// Property: For all routes with null/undefined pathParameters,
			// getPathParameters() returns empty object
			
			fc.assert(
				fc.property(
					fc.record({
						routePath: fc.constantFrom('api', 'data', 'service', 'endpoint'),
						pathParams: fc.constantFrom(null, undefined, {})
					}),
					({ routePath, pathParams }) => {
						// Arrange: No path parameters
						const event = {
							httpMethod: 'GET',
							resource: `/${routePath}`,
							path: `/${routePath}`,
							pathParameters: pathParams,
							queryStringParameters: null,
							headers: {},
							body: null
						};
						
						const validations = {};
						
						// Act
						const request = new ClientRequest(event, mockContext, validations);
						const result = request.getPathParameters();
						
						// Assert: Empty object returned
						expect(request.isValid()).toBe(true);
						expect(result).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
