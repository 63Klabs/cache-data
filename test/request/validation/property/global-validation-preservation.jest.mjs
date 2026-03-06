import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * PRESERVATION TEST FOR GLOBAL PARAMETER VALIDATIONS
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that global parameter validations (no BY_ROUTE or BY_METHOD) work correctly
 * on unfixed code. This establishes the baseline behavior that must be preserved after bug fixes.
 * 
 * EXPECTED OUTCOME: Test PASSES (confirms baseline behavior to preserve)
 * 
 * Property 2: Preservation - Global Parameter Validations Unchanged
 * 
 * For all global parameter validations (validation functions defined directly on parameter names
 * without BY_ROUTE or BY_METHOD), validation works correctly. This behavior must be preserved
 * after fixing route-specific validation bugs.
 */
describe('Preservation: Global Parameter Validations', () => {
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Unit Tests: Known Global Validation Patterns', () => {
		it('should validate global path parameter correctly', () => {
			// Initialize ClientRequest with global path parameter validation
			ClientRequest.init({
				parameters: {
					pathParameters: {
						// Global validation - applies to 'id' parameter regardless of route
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			// Create mock API Gateway event
			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			// Create ClientRequest instance
			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true for valid global validation
			expect(clientRequest.isValid()).toBe(true);

			// EXPECTED: Path parameters should be extracted
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				id: '123'
			});
		});

		it('should validate global query parameter correctly', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						// Global validation - applies to 'search' parameter regardless of route
						search: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/search',
				path: '/api/search',
				pathParameters: {},
				queryStringParameters: {
					search: 'test query'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);

			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				search: 'test query'
			});
		});

		it('should validate global header parameter correctly', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						// Global validation - applies to 'authorization' header regardless of route
						authorization: (value) => typeof value === 'string' && value.startsWith('Bearer ')
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					authorization: 'Bearer token123'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);

			const headerParams = clientRequest.getHeaderParameters();
			expect(headerParams).toEqual({
				authorization: 'Bearer token123'
			});
		});

		it('should reject invalid global parameter validation', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/abc',
				pathParameters: {
					id: 'abc'  // Invalid - not numeric
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false because validation fails
			expect(clientRequest.isValid()).toBe(false);

			// EXPECTED: Path parameters should be empty when validation fails
			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({});
		});

		it('should validate multiple global parameters correctly', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					},
					queryStringParameters: {
						limit: (value) => {
							const num = parseInt(value, 10);
							return !isNaN(num) && num > 0 && num <= 100;
						}
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/items/{id}',
				path: '/items/456',
				pathParameters: {
					id: '456'
				},
				queryStringParameters: {
					limit: '50'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);

			const pathParams = clientRequest.getPathParameters();
			expect(pathParams).toEqual({
				id: '456'
			});

			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({
				limit: '50'
			});
		});

		it('should handle global validation with no parameters in request', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						optional: (value) => typeof value === 'string'
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},  // No query parameters
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true when no parameters to validate
			expect(clientRequest.isValid()).toBe(true);

			const queryParams = clientRequest.getQueryStringParameters();
			expect(queryParams).toEqual({});
		});
	});

	describe('Property-Based Tests: Global Parameter Validations', () => {
		it('Property: Global path parameter validation works for any numeric ID', () => {
			fc.assert(
				fc.property(
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					(numericId) => {
						const idString = numericId.toString();
						
						// Initialize with global path parameter validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: '/item/{id}',
							path: `/item/${idString}`,
							pathParameters: {
								id: idString
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Global validation should work correctly
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: idString
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Global query parameter validation works for any string', () => {
			fc.assert(
				fc.property(
					// Generate alphanumeric string
					fc.stringMatching(/^[a-zA-Z0-9 ]{1,50}$/),
					(searchQuery) => {
						fc.pre(searchQuery.length > 0);
						
						// Initialize with global query parameter validation
						ClientRequest.init({
							parameters: {
								queryStringParameters: {
									search: (value) => typeof value === 'string' && value.length > 0
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: '/search',
							path: '/search',
							pathParameters: {},
							queryStringParameters: {
								search: searchQuery
							},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Global validation should work correctly
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getQueryStringParameters()).toEqual({
							search: searchQuery
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Global validation rejects invalid values correctly', () => {
			fc.assert(
				fc.property(
					// Generate string with special characters (invalid for numeric validation)
					fc.stringMatching(/^[^0-9]{1,20}$/),
					(invalidId) => {
						fc.pre(invalidId.length > 0);
						
						// Initialize with global path parameter validation (numeric only)
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: '/item/{id}',
							path: `/item/${invalidId}`,
							pathParameters: {
								id: invalidId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Invalid values should be rejected
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getPathParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 30 }
			);
		});

		it('Property: Global validation works across different routes', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'item', 'order', 'post'),
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					(routePrefix, numericId) => {
						const idString = numericId.toString();
						
						// Initialize with global path parameter validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: `/${routePrefix}/{id}`,
							path: `/${routePrefix}/${idString}`,
							pathParameters: {
								id: idString
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Global validation should work regardless of route
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: idString
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Multiple global validations work together', () => {
			fc.assert(
				fc.property(
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					// Generate page number
					fc.integer({ min: 1, max: 100 }),
					(numericId, pageNum) => {
						const idString = numericId.toString();
						const pageString = pageNum.toString();
						
						// Initialize with multiple global validations
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[0-9]+$/.test(value)
								},
								queryStringParameters: {
									page: (value) => {
										const num = parseInt(value, 10);
										return !isNaN(num) && num > 0 && num <= 100;
									}
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: '/items/{id}',
							path: `/items/${idString}`,
							pathParameters: {
								id: idString
							},
							queryStringParameters: {
								page: pageString
							},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: All global validations should work together
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({
							id: idString
						});
						expect(clientRequest.getQueryStringParameters()).toEqual({
							page: pageString
						});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Edge Cases: Global Parameter Validations', () => {
		it('should handle global validation with empty string', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						search: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					search: ''  // Empty string
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false for empty string
			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getQueryStringParameters()).toEqual({});
		});

		it('should handle global validation with special characters', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						query: (value) => /^[a-zA-Z0-9 ]+$/.test(value)
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					query: 'test@#$%'  // Contains special characters
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return false for special characters
			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getQueryStringParameters()).toEqual({});
		});

		it('should handle global validation with case-insensitive query parameters', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						search: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: {},
				queryStringParameters: {
					Search: 'test query'  // Uppercase 'S'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Query parameters are lowercased, so validation should work
			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getQueryStringParameters()).toEqual({
				search: 'test query'
			});
		});

		it('should handle global validation with undefined parameter value', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						optional: (value) => value === undefined || typeof value === 'string'
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},  // No 'optional' parameter
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() should return true when parameter is not present
			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getQueryStringParameters()).toEqual({});
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that global parameter validations work correctly on the UNFIXED code.
 * These behaviors MUST be preserved after implementing fixes for route-specific validation bugs.
 * 
 * Preserved Behaviors:
 * 
 * 1. Global path parameter validations work correctly (no BY_ROUTE or BY_METHOD)
 * 2. Global query parameter validations work correctly
 * 3. Global header parameter validations work correctly
 * 4. Multiple global validations work together correctly
 * 5. Invalid values are rejected correctly by global validations
 * 6. Global validations work across different routes
 * 7. Query parameters are case-insensitive (lowercased before validation)
 * 8. Empty parameter objects are handled correctly
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Global path parameter validation works for any numeric ID
 * - Property 2: Global query parameter validation works for any string
 * - Property 3: Global validation rejects invalid values correctly
 * - Property 4: Global validation works across different routes
 * - Property 5: Multiple global validations work together
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the global parameter validation behavior that must be preserved.
 */
