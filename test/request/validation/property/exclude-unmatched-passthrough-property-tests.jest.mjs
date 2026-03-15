/**
 * Property-Based Tests: excludeParamsWithNoValidationMatch Passthrough Fix
 * 
 * Validates correctness properties of the passthrough behavior using
 * generated inputs via fast-check.
 * 
 * Spec: 1-3-10-exclude-unmatched-passthrough-fix
 * 
 * Properties tested:
 * - Property 1: Passthrough completeness
 * - Property 2: Default exclusion preservation
 * - Property 3: Validation still applies with passthrough
 * - Property 4: Validity unaffected by passthrough
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import fc from 'fast-check';

const ClientRequestModule = await import('../../../../src/lib/tools/ClientRequest.class.js');
const ClientRequest = ClientRequestModule.default;

const mockContext = {
	getRemainingTimeInMillis: () => 30000
};

/**
 * Generate a safe parameter name (alphanumeric, no special chars).
 * Avoids keys that conflict with internal properties.
 */
const safeParamName = fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,15}$/);

/**
 * Generate a safe parameter value (non-empty string).
 */
const safeParamValue = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

describe('excludeParamsWithNoValidationMatch Passthrough - Property Tests', () => {

	afterEach(() => {
		ClientRequest.init({
			parameters: {}
		});
	});

	describe('Property 1: Passthrough Completeness', () => {
		it('Property: When excludeParamsWithNoValidationMatch=false and no validations, all body parameters are returned', () => {
			fc.assert(
				fc.property(
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 1, maxKeys: 5 }),
					(bodyData) => {
						const event = {
							httpMethod: 'POST',
							resource: '/api/data',
							path: '/api/data',
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
						const result = request.getBodyParameters();

						// Every key in bodyData must be in result
						for (const key of Object.keys(bodyData)) {
							expect(result).toHaveProperty(key, bodyData[key]);
						}
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: When excludeParamsWithNoValidationMatch=false and no validations, all query parameters are returned (lowercased)', () => {
			fc.assert(
				fc.property(
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 1, maxKeys: 5 }),
					(queryData) => {
						const event = {
							httpMethod: 'GET',
							resource: '/search',
							path: '/search',
							pathParameters: null,
							queryStringParameters: queryData,
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
						const result = request.getQueryStringParameters();

						// Every key in queryData must be in result (lowercased)
						for (const [key, value] of Object.entries(queryData)) {
							expect(result).toHaveProperty(key.toLowerCase(), value);
						}
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 2: Default Exclusion Preservation', () => {
		it('Property: When excludeParamsWithNoValidationMatch is not set and no validations, body parameters are empty', () => {
			fc.assert(
				fc.property(
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 1, maxKeys: 5 }),
					(bodyData) => {
						const event = {
							httpMethod: 'POST',
							resource: '/api/data',
							path: '/api/data',
							pathParameters: null,
							queryStringParameters: null,
							headers: {},
							body: JSON.stringify(bodyData)
						};

						ClientRequest.init({
							referrers: ['*'],
							parameters: {}
						});

						const request = new ClientRequest(event, mockContext);

						expect(request.getBodyParameters()).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});

		it('Property: When excludeParamsWithNoValidationMatch=true and no validations, query parameters are empty', () => {
			fc.assert(
				fc.property(
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 1, maxKeys: 5 }),
					(queryData) => {
						const event = {
							httpMethod: 'GET',
							resource: '/search',
							path: '/search',
							pathParameters: null,
							queryStringParameters: queryData,
							headers: {},
							body: null
						};

						ClientRequest.init({
							referrers: ['*'],
							parameters: {
								excludeParamsWithNoValidationMatch: true
							}
						});

						const request = new ClientRequest(event, mockContext);

						expect(request.getQueryStringParameters()).toEqual({});
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 3: Validation Still Applies With Passthrough', () => {
		it('Property: When validations exist and passthrough enabled, validated params use rules and unvalidated pass through', () => {
			fc.assert(
				fc.property(
					safeParamValue,
					(extraValue) => {
						const bodyData = {
							email: 'user@example.com',
							extraField: extraValue
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
								excludeParamsWithNoValidationMatch: false,
								bodyParameters: {
									email: (value) => typeof value === 'string' && value.includes('@')
								}
							}
						});

						const request = new ClientRequest(event, mockContext);
						const result = request.getBodyParameters();

						// email validated by rule
						expect(result.email).toBe('user@example.com');
						// extraField passes through without validation
						expect(result.extraField).toBe(extraValue);
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe('Property 4: Validity Unaffected by Passthrough', () => {
		it('Property: Passthrough without validation does not cause validation failure', () => {
			fc.assert(
				fc.property(
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 1, maxKeys: 5 }),
					fc.dictionary(safeParamName, safeParamValue, { minKeys: 0, maxKeys: 3 }),
					(bodyData, queryData) => {
						const event = {
							httpMethod: 'POST',
							resource: '/api/data',
							path: '/api/data',
							pathParameters: null,
							queryStringParameters: Object.keys(queryData).length > 0 ? queryData : null,
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
						const reason = request.getValidationReason();
						expect(reason.isValid).toBe(true);
						expect(reason.statusCode).toBe(200);
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
