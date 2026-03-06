import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * PRESERVATION TEST FOR VALID REQUEST HANDLING
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that valid requests (matching all validation rules) return isValid()===true
 * on unfixed code. This establishes the baseline behavior that must be preserved after bug fixes.
 * 
 * EXPECTED OUTCOME: Test PASSES (confirms baseline behavior to preserve)
 * 
 * Property 2: Preservation - Valid Requests Return isValid()===true
 * 
 * For all valid requests (matching all validation rules), isValid() returns true.
 * This behavior must be preserved after fixing validation bugs.
 */
describe('Preservation: Valid Request Handling', () => {
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Unit Tests: Known Valid Request Patterns', () => {
		it('should return isValid()===true for valid path parameter', () => {
			// Initialize with path parameter validation
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

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() returns true for valid request
			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '123' });
		});

		it('should return isValid()===true for valid query parameter', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
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
			expect(clientRequest.getQueryStringParameters()).toEqual({ search: 'test query' });
		});

		it('should return isValid()===true for valid header parameter', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
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
			expect(clientRequest.getHeaderParameters()).toEqual({ authorization: 'Bearer token123' });
		});

		it('should return isValid()===true for multiple valid parameters', () => {
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
					},
					headerParameters: {
						contentType: (value) => value === 'application/json'
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
				headers: {
					'content-type': 'application/json'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '456' });
			expect(clientRequest.getQueryStringParameters()).toEqual({ limit: '50' });
			expect(clientRequest.getHeaderParameters()).toEqual({ contentType: 'application/json' });
		});

		it('should return isValid()===true for valid route-specific validation', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_ROUTE: [
							{
								route: 'product/{id}',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/product/{id}',
				path: '/product/789',
				pathParameters: {
					id: '789'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '789' });
		});

		it('should return isValid()===true for valid method-specific validation', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						BY_METHOD: [
							{
								method: 'POST',
								validate: (value) => /^[0-9]+$/.test(value)
							}
						]
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/product/{id}',
				path: '/product/999',
				pathParameters: {
					id: '999'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '999' });
		});

		it('should return isValid()===true when no validation rules exist', () => {
			ClientRequest.init({
				parameters: {}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {
					search: 'anything'
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() returns true when no validation rules
			expect(clientRequest.isValid()).toBe(true);
		});
	});

	describe('Property-Based Tests: Valid Request Handling', () => {
		it('Property: Valid numeric path parameters return isValid()===true', () => {
			fc.assert(
				fc.property(
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					(numericId) => {
						const idString = numericId.toString();
						
						// Initialize with numeric validation
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

						// Property: Valid requests return isValid()===true
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({ id: idString });

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Valid alphanumeric path parameters return isValid()===true', () => {
			fc.assert(
				fc.property(
					// Generate alphanumeric string
					fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
					(alphanumericId) => {
						fc.pre(alphanumericId.length > 0);
						
						// Initialize with alphanumeric validation
						ClientRequest.init({
							parameters: {
								pathParameters: {
									id: (value) => /^[a-zA-Z0-9]+$/.test(value)
								}
							}
						});

						const event = {
							httpMethod: 'GET',
							resource: '/item/{id}',
							path: `/item/${alphanumericId}`,
							pathParameters: {
								id: alphanumericId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Valid requests return isValid()===true
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({ id: alphanumericId });

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Valid query parameters return isValid()===true', () => {
			fc.assert(
				fc.property(
					// Generate valid search query
					fc.stringMatching(/^[a-zA-Z0-9 ]{1,50}$/),
					(searchQuery) => {
						fc.pre(searchQuery.length > 0);
						
						// Initialize with query parameter validation
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

						// Property: Valid requests return isValid()===true
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getQueryStringParameters()).toEqual({ search: searchQuery });

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Valid requests with multiple parameters return isValid()===true', () => {
			fc.assert(
				fc.property(
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					// Generate page number
					fc.integer({ min: 1, max: 100 }),
					(numericId, pageNum) => {
						const idString = numericId.toString();
						const pageString = pageNum.toString();
						
						// Initialize with multiple parameter validations
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

						// Property: Valid requests with multiple parameters return isValid()===true
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({ id: idString });
						expect(clientRequest.getQueryStringParameters()).toEqual({ page: pageString });

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Valid requests across different routes return isValid()===true', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'item', 'order', 'post'),
					// Generate numeric ID
					fc.integer({ min: 1, max: 999999 }),
					(routePrefix, numericId) => {
						const idString = numericId.toString();
						
						// Initialize with global validation
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

						// Property: Valid requests work across different routes
						expect(clientRequest.isValid()).toBe(true);
						expect(clientRequest.getPathParameters()).toEqual({ id: idString });

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Edge Cases: Valid Request Handling', () => {
		it('should return isValid()===true for valid request with empty query parameters', () => {
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
				path: '/item/123',
				pathParameters: {
					id: '123'
				},
				queryStringParameters: {},  // Empty query parameters
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '123' });
		});

		it('should return isValid()===true for valid request with null query parameters', () => {
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
				path: '/item/456',
				pathParameters: {
					id: '456'
				},
				queryStringParameters: null,  // Null query parameters
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getPathParameters()).toEqual({ id: '456' });
		});

		it('should return isValid()===true for valid request with case-insensitive headers', () => {
			ClientRequest.init({
				parameters: {
					headerParameters: {
						contentType: (value) => value === 'application/json'
					}
				}
			});

			const event = {
				httpMethod: 'POST',
				resource: '/api/data',
				path: '/api/data',
				pathParameters: {},
				queryStringParameters: {},
				headers: {
					'Content-Type': 'application/json'  // Uppercase 'C' and 'T'
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: Headers are normalized to camelCase
			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getHeaderParameters()).toEqual({ contentType: 'application/json' });
		});

		it('should return isValid()===true for valid request with boundary values', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						limit: (value) => {
							const num = parseInt(value, 10);
							return !isNaN(num) && num >= 1 && num <= 100;
						}
					}
				}
			});

			// Test minimum boundary
			const event1 = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '1'  // Minimum valid value
				},
				headers: {},
				requestContext: {}
			};

			const context1 = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest1 = new ClientRequest(event1, context1);
			expect(clientRequest1.isValid()).toBe(true);
			expect(clientRequest1.getQueryStringParameters()).toEqual({ limit: '1' });

			// Reset for next test
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						limit: (value) => {
							const num = parseInt(value, 10);
							return !isNaN(num) && num >= 1 && num <= 100;
						}
					}
				}
			});

			// Test maximum boundary
			const event2 = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '100'  // Maximum valid value
				},
				headers: {},
				requestContext: {}
			};

			const context2 = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest2 = new ClientRequest(event2, context2);
			expect(clientRequest2.isValid()).toBe(true);
			expect(clientRequest2.getQueryStringParameters()).toEqual({ limit: '100' });
		});

		it('should return isValid()===true for valid request with special characters in allowed format', () => {
			ClientRequest.init({
				parameters: {
					queryStringParameters: {
						email: (value) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/user',
				path: '/user',
				pathParameters: {},
				queryStringParameters: {
					email: 'test.user+tag@example.com'  // Valid email with special chars
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(true);
			expect(clientRequest.getQueryStringParameters()).toEqual({ email: 'test.user+tag@example.com' });
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that valid requests return isValid()===true on the UNFIXED code.
 * This behavior MUST be preserved after implementing fixes for validation bugs.
 * 
 * Preserved Behaviors:
 * 
 * 1. Valid path parameters return isValid()===true
 * 2. Valid query parameters return isValid()===true
 * 3. Valid header parameters return isValid()===true
 * 4. Valid requests with multiple parameters return isValid()===true
 * 5. Valid route-specific validations return isValid()===true
 * 6. Valid method-specific validations return isValid()===true
 * 7. Requests with no validation rules return isValid()===true
 * 8. Valid requests with empty/null query parameters return isValid()===true
 * 9. Valid requests with case-insensitive headers return isValid()===true
 * 10. Valid requests with boundary values return isValid()===true
 * 11. Valid requests work across different routes
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Valid numeric path parameters return isValid()===true
 * - Property 2: Valid alphanumeric path parameters return isValid()===true
 * - Property 3: Valid query parameters return isValid()===true
 * - Property 4: Valid requests with multiple parameters return isValid()===true
 * - Property 5: Valid requests across different routes return isValid()===true
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the valid request handling behavior that must be preserved.
 */
