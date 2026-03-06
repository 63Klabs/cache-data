import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import ClientRequest to test the full validation flow
const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

/**
 * PRESERVATION TEST FOR INVALID REQUEST HANDLING
 * 
 * CRITICAL: This test MUST PASS on unfixed code - it confirms baseline behavior to preserve.
 * 
 * GOAL: Verify that invalid requests (failing validation rules) return isValid()===false
 * on unfixed code. This establishes the baseline behavior that must be preserved after bug fixes.
 * 
 * EXPECTED OUTCOME: Test PASSES (confirms baseline behavior to preserve)
 * 
 * Property 2: Preservation - Invalid Requests Return isValid()===false
 * 
 * For all invalid requests (failing validation rules), isValid() returns false.
 * This behavior must be preserved after fixing validation bugs.
 */
describe('Preservation: Invalid Request Handling', () => {
	afterEach(() => {
		// Reset ClientRequest initialization between tests
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Unit Tests: Known Invalid Request Patterns', () => {
		it('should return isValid()===false for invalid path parameter', () => {
			// Initialize with path parameter validation (numeric only)
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
				path: '/product/abc',  // Invalid: contains letters
				pathParameters: {
					id: 'abc'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() returns false for invalid request
			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getPathParameters()).toEqual({});
		});

		it('should return isValid()===false for invalid query parameter', () => {
			ClientRequest.init({
				parameters: {
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
				resource: '/api/items',
				path: '/api/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '200'  // Invalid: exceeds maximum
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getQueryStringParameters()).toEqual({});
		});

		it('should return isValid()===false for invalid header parameter', () => {
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
					authorization: 'Basic token123'  // Invalid: not Bearer
				},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getHeaderParameters()).toEqual({});
		});

		it('should return isValid()===false when one of multiple parameters is invalid', () => {
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
					id: '456'  // Valid
				},
				queryStringParameters: {
					limit: 'invalid'  // Invalid: not a number
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() returns false when any parameter is invalid
			expect(clientRequest.isValid()).toBe(false);
		});

		it('should return isValid()===false for route-specific validation failure', () => {
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
				path: '/product/xyz',  // Invalid: not numeric
				pathParameters: {
					id: 'xyz'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getPathParameters()).toEqual({});
		});

		it('should return isValid()===false for method-specific validation failure', () => {
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
				path: '/product/abc',  // Invalid: not numeric
				pathParameters: {
					id: 'abc'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getPathParameters()).toEqual({});
		});
	});

	describe('Property-Based Tests: Invalid Request Handling', () => {
		it('Property: Invalid numeric path parameters return isValid()===false', () => {
			fc.assert(
				fc.property(
					// Generate non-numeric strings
					fc.stringMatching(/^[a-zA-Z!@#$%^&*()]+$/),
					(nonNumericId) => {
						fc.pre(nonNumericId.length > 0);
						
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
							path: `/item/${nonNumericId}`,
							pathParameters: {
								id: nonNumericId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Invalid requests return isValid()===false
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getPathParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Out-of-range numeric parameters return isValid()===false', () => {
			fc.assert(
				fc.property(
					// Generate numbers outside valid range (1-100)
					fc.oneof(
						fc.integer({ min: -1000, max: 0 }),
						fc.integer({ min: 101, max: 1000 })
					),
					(outOfRangeNum) => {
						const numString = outOfRangeNum.toString();
						
						// Initialize with range validation
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

						const event = {
							httpMethod: 'GET',
							resource: '/items',
							path: '/items',
							pathParameters: {},
							queryStringParameters: {
								limit: numString
							},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Out-of-range values return isValid()===false
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getQueryStringParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Invalid email formats return isValid()===false', () => {
			fc.assert(
				fc.property(
					// Generate strings that are NOT valid emails
					fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
						!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)
					),
					(invalidEmail) => {
						// Initialize with email validation
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
								email: invalidEmail
							},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Invalid email formats return isValid()===false
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getQueryStringParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Invalid requests with multiple parameters return isValid()===false', () => {
			fc.assert(
				fc.property(
					// Generate non-numeric ID
					fc.stringMatching(/^[a-zA-Z]+$/),
					// Generate out-of-range page number
					fc.integer({ min: 101, max: 1000 }),
					(nonNumericId, outOfRangePage) => {
						fc.pre(nonNumericId.length > 0);
						
						const pageString = outOfRangePage.toString();
						
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
							path: `/items/${nonNumericId}`,
							pathParameters: {
								id: nonNumericId
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

						// Property: Invalid requests with multiple parameters return isValid()===false
						expect(clientRequest.isValid()).toBe(false);

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: Invalid requests across different routes return isValid()===false', () => {
			fc.assert(
				fc.property(
					// Generate route prefix
					fc.constantFrom('product', 'user', 'item', 'order', 'post'),
					// Generate non-numeric ID
					fc.stringMatching(/^[a-zA-Z!@#$%]+$/),
					(routePrefix, nonNumericId) => {
						fc.pre(nonNumericId.length > 0);
						
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
							path: `/${routePrefix}/${nonNumericId}`,
							pathParameters: {
								id: nonNumericId
							},
							queryStringParameters: {},
							headers: {},
							requestContext: {}
						};

						const context = {
							getRemainingTimeInMillis: () => 30000
						};

						const clientRequest = new ClientRequest(event, context);

						// Property: Invalid requests fail across different routes
						expect(clientRequest.isValid()).toBe(false);
						expect(clientRequest.getPathParameters()).toEqual({});

						return true;
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Edge Cases: Invalid Request Handling', () => {
		it('should return isValid()===false for empty string when non-empty required', () => {
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
					search: ''  // Invalid: empty string
				},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getQueryStringParameters()).toEqual({});
		});

		it('should return isValid()===false for null parameter value', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/item/{id}',
				path: '/item/null',
				pathParameters: {
					id: null  // Invalid: null value
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
		});

		it('should return isValid()===false for undefined parameter value', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => typeof value === 'string' && value.length > 0
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/item/{id}',
				path: '/item/undefined',
				pathParameters: {
					id: undefined  // Invalid: undefined value
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
		});

		it('should return isValid()===false for boundary value violations', () => {
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

			// Test below minimum boundary
			const event1 = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '0'  // Invalid: below minimum
				},
				headers: {},
				requestContext: {}
			};

			const context1 = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest1 = new ClientRequest(event1, context1);
			expect(clientRequest1.isValid()).toBe(false);
			expect(clientRequest1.getQueryStringParameters()).toEqual({});

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

			// Test above maximum boundary
			const event2 = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: {},
				queryStringParameters: {
					limit: '101'  // Invalid: above maximum
				},
				headers: {},
				requestContext: {}
			};

			const context2 = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest2 = new ClientRequest(event2, context2);
			expect(clientRequest2.isValid()).toBe(false);
			expect(clientRequest2.getQueryStringParameters()).toEqual({});
		});

		it('should return isValid()===false for special characters in restricted format', () => {
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
				path: '/item/test-123',  // Invalid: contains dash
				pathParameters: {
					id: 'test-123'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			expect(clientRequest.isValid()).toBe(false);
			expect(clientRequest.getPathParameters()).toEqual({});
		});

		it('should return isValid()===false when validation function throws error', () => {
			ClientRequest.init({
				parameters: {
					pathParameters: {
						id: (value) => {
							if (value === 'error') {
								throw new Error('Validation error');
							}
							return /^[0-9]+$/.test(value);
						}
					}
				}
			});

			const event = {
				httpMethod: 'GET',
				resource: '/item/{id}',
				path: '/item/error',
				pathParameters: {
					id: 'error'
				},
				queryStringParameters: {},
				headers: {},
				requestContext: {}
			};

			const context = {
				getRemainingTimeInMillis: () => 30000
			};

			const clientRequest = new ClientRequest(event, context);

			// EXPECTED: isValid() returns false when validation throws
			expect(clientRequest.isValid()).toBe(false);
		});
	});
});

/**
 * PRESERVATION DOCUMENTATION
 * 
 * This test suite validates that invalid requests return isValid()===false on the UNFIXED code.
 * This behavior MUST be preserved after implementing fixes for validation bugs.
 * 
 * Preserved Behaviors:
 * 
 * 1. Invalid path parameters return isValid()===false
 * 2. Invalid query parameters return isValid()===false
 * 3. Invalid header parameters return isValid()===false
 * 4. Requests with one invalid parameter (among multiple) return isValid()===false
 * 5. Invalid route-specific validations return isValid()===false
 * 6. Invalid method-specific validations return isValid()===false
 * 7. Empty strings return isValid()===false when non-empty required
 * 8. Null/undefined parameter values return isValid()===false
 * 9. Boundary value violations return isValid()===false
 * 10. Special characters in restricted formats return isValid()===false
 * 11. Validation function errors result in isValid()===false
 * 
 * Property-Based Testing Coverage:
 * 
 * - Property 1: Invalid numeric path parameters return isValid()===false
 * - Property 2: Out-of-range numeric parameters return isValid()===false
 * - Property 3: Invalid email formats return isValid()===false
 * - Property 4: Invalid requests with multiple parameters return isValid()===false
 * - Property 5: Invalid requests across different routes return isValid()===false
 * 
 * These properties are tested across many generated inputs to ensure comprehensive coverage
 * of the invalid request handling behavior that must be preserved.
 */
