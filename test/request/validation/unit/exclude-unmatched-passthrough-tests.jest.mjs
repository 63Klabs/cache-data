/**
 * Unit Tests: excludeParamsWithNoValidationMatch Passthrough Fix
 * 
 * Tests that when excludeParamsWithNoValidationMatch is false, parameters are
 * passed through even when no validation rules are configured for that parameter type.
 * 
 * Bug: #hasValidParameters() had a guard `if (clientParameters && paramValidations)` that
 * short-circuited when paramValidations was undefined, preventing passthrough even when
 * excludeParamsWithNoValidationMatch was false.
 * 
 * Spec: 1-3-10-exclude-unmatched-passthrough-fix
 * 
 * Requirements tested:
 * - 1.1: Body passthrough with no bodyParameters validations configured
 * - 1.2: Body passthrough with empty bodyParameters validations object
 * - 1.3: Default behavior preserved (exclude unmatched)
 * - 1.4: bodyPayload always contains raw body string
 * - 2.1: Path parameters passthrough
 * - 2.2: Query parameters passthrough (lowercased keys)
 * - 2.3: Header parameters passthrough (camelCased keys)
 * - 2.4: Cookie parameters passthrough
 * - 3.1: Default behavior unchanged
 * - 3.2: Existing validation rules still work with passthrough enabled
 * - 3.3: Mixed scenarios work correctly
 * - 3.4: isValid() not affected by passthrough
 */

import { describe, it, expect, afterEach } from '@jest/globals';

const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

describe('excludeParamsWithNoValidationMatch Passthrough Fix', () => {

	afterEach(() => {
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Body Parameter Passthrough (Requirements 1.1-1.4)', () => {

		it('should return parsed body parameters when excludeParamsWithNoValidationMatch is false and no bodyParameters validations configured (1.1)', () => {
			const bodyData = {
				templateName: 'template-network-route53-cloudfront-s3-apigw',
				category: 'network'
			};

			const event = {
				httpMethod: 'POST',
				resource: '/mcp/get_template',
				path: '/mcp/get_template',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
					// No bodyParameters key at all
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});

		it('should return parsed body parameters when excludeParamsWithNoValidationMatch is false and bodyParameters validations is empty object (1.2)', () => {
			const bodyData = {
				name: 'test-item',
				count: 42
			};

			const event = {
				httpMethod: 'POST',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					bodyParameters: {}
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});

		it('should return empty body parameters when excludeParamsWithNoValidationMatch is true (default) and no bodyParameters validations configured (1.3)', () => {
			const bodyData = {
				templateName: 'some-template',
				category: 'network'
			};

			const event = {
				httpMethod: 'POST',
				resource: '/mcp/get_template',
				path: '/mcp/get_template',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					// excludeParamsWithNoValidationMatch defaults to true
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});

		it('should always have bodyPayload with raw body string regardless of validation settings (1.4)', () => {
			const bodyString = '{"templateName":"my-template","category":"network"}';

			const event = {
				httpMethod: 'POST',
				resource: '/mcp/get_template',
				path: '/mcp/get_template',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: bodyString
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
				}
			});

			const request = new ClientRequest(event, mockContext);
			const props = request.getProps();

			expect(props.bodyPayload).toBe(bodyString);
		});

		it('should handle nested objects and arrays in body passthrough', () => {
			const bodyData = {
				user: { name: 'test', email: 'test@example.com' },
				items: [{ id: 1 }, { id: 2 }],
				active: true
			};

			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: JSON.stringify(bodyData)
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual(bodyData);
		});

		it('should return empty body parameters when body is null and passthrough is enabled', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				body: null
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getBodyParameters()).toEqual({});
		});
	});

	describe('All Parameter Types Passthrough (Requirements 2.1-2.4)', () => {

		it('should pass through path parameters when no pathParameters validations configured (2.1)', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/users/{id}',
				path: '/users/abc-123',
				pathParameters: { id: 'abc-123' },
				queryStringParameters: null,
				headers: {},
				body: null
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
					// No pathParameters validations
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getPathParameters()).toEqual({ id: 'abc-123' });
		});

		it('should pass through query parameters with lowercased keys when no queryStringParameters validations configured (2.2)', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/search',
				path: '/search',
				pathParameters: null,
				queryStringParameters: { Query: 'test', Limit: '10' },
				headers: {},
				body: null
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
					// No queryStringParameters validations
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({ query: 'test', limit: '10' });
		});

		it('should pass through header parameters with camelCased keys when no headerParameters validations configured (2.3)', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: null,
				headers: { 'content-type': 'application/json', 'x-api-key': 'key123' },
				body: null
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
					// No headerParameters validations
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			const headers = request.getHeaderParameters();
			expect(headers.contentType).toBe('application/json');
			expect(headers.xApiKey).toBe('key123');
		});

		it('should pass through cookie parameters when no cookieParameters validations configured (2.4)', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/items',
				path: '/items',
				pathParameters: null,
				queryStringParameters: null,
				headers: {},
				cookie: { session: 'abc123', theme: 'dark' },
				body: null
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
					// No cookieParameters validations
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getCookieParameters()).toEqual({ session: 'abc123', theme: 'dark' });
		});
	});

	describe('Backwards Compatibility (Requirements 3.1-3.4)', () => {

		it('should preserve default behavior - parameters excluded when no validations and flag not set (3.1)', () => {
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: { limit: '10' },
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'test' })
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					// excludeParamsWithNoValidationMatch not set (defaults to true)
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			expect(request.getQueryStringParameters()).toEqual({});
			expect(request.getHeaderParameters()).toEqual({});
			expect(request.getBodyParameters()).toEqual({});
		});

		it('should still apply validation rules when passthrough is enabled and rules exist (3.2)', () => {
			const event = {
				httpMethod: 'POST',
				resource: '/users',
				path: '/users',
				pathParameters: null,
				queryStringParameters: { limit: '10' },
				headers: {},
				body: JSON.stringify({ email: 'user@example.com', name: 'test' })
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					queryStringParameters: {
						limit: (value) => !isNaN(value) && parseInt(value) > 0
					},
					bodyParameters: {
						email: (value) => typeof value === 'string' && value.includes('@')
					}
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			// limit validated by rule
			expect(request.getQueryStringParameters().limit).toBe('10');
			// email validated by rule, name passes through (no rule, but passthrough enabled)
			expect(request.getBodyParameters().email).toBe('user@example.com');
			expect(request.getBodyParameters().name).toBe('test');
		});

		it('should handle mixed scenarios - some types with validations, some without (3.3)', () => {
			const event = {
				httpMethod: 'GET',
				resource: '/users/{id}',
				path: '/users/123',
				pathParameters: { id: '123' },
				queryStringParameters: { format: 'json' },
				headers: { 'x-api-key': 'mykey' },
				body: JSON.stringify({ extra: 'data' })
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false,
					pathParameters: {
						id: (value) => /^[0-9]+$/.test(value)
					}
					// No queryStringParameters, headerParameters, or bodyParameters validations
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			// Path validated by rule
			expect(request.getPathParameters()).toEqual({ id: '123' });
			// Query, header, body pass through without validation
			expect(request.getQueryStringParameters()).toEqual({ format: 'json' });
			expect(request.getHeaderParameters().xApiKey).toBe('mykey');
			expect(request.getBodyParameters()).toEqual({ extra: 'data' });
		});

		it('should not affect isValid() when parameters pass through without validation (3.4)', () => {
			const event = {
				httpMethod: 'POST',
				resource: '/data',
				path: '/data',
				pathParameters: null,
				queryStringParameters: { anything: 'goes' },
				headers: { 'x-custom': 'value' },
				body: JSON.stringify({ field1: 'a', field2: 123, field3: true })
			};

			ClientRequest.init({
				referrers: ['*'],
				parameters: {
					excludeParamsWithNoValidationMatch: false
				}
			});

			const request = new ClientRequest(event, mockContext);

			expect(request.isValid()).toBe(true);
			const reason = request.getValidationReason();
			expect(reason.isValid).toBe(true);
			expect(reason.statusCode).toBe(200);
			expect(reason.messages).toEqual([]);
		});
	});
});
