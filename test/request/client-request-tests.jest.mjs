import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { ClientRequest } from '../../src/lib/tools/index.js';

import {testEventA} from '../helpers/test-event.js';
import {testContextA} from '../helpers/test-context.js';
import {testValidationsA} from '../helpers/test-validations.js';

ClientRequest.init( { validations: testValidationsA });

describe("ClientRequest Class", () => {

	afterEach(() => {
		// Clean up mocks after each test
		jest.restoreAllMocks();
	});

	describe("Initialize ClientRequest Class", () => {
		it("Set Options during initialization and check values", () => {
			
			// Check the referrer list
			expect(ClientRequest.getReferrerWhiteList().length).toBe(2);

			// make sure the white list does not contain '*'
			expect(ClientRequest.getReferrerWhiteList().indexOf('*')).toBe(-1);

			// make sure the white list contains 'example.com'
			expect(ClientRequest.getReferrerWhiteList().indexOf('example.com')).not.toBe(-1);

			// make sure the white list contains 'acme.com'
			expect(ClientRequest.getReferrerWhiteList().indexOf('acme.com')).not.toBe(-1);

			// get the validation functions for path parameters and check employee id
			expect(ClientRequest.getParameterValidations().pathParameters.employeeId('12345')).toBe(true);

			// check invalid employee id
			expect(ClientRequest.getParameterValidations().pathParameters.employeeId('1234')).toBe(false);

			// check valid querystring parameter 'include'
			expect(ClientRequest.getParameterValidations().queryStringParameters.include('contact,department')).toBe(true);

			// check invalid querystring parameter 'include'
			expect(ClientRequest.getParameterValidations().queryStringParameters.include('dept')).toBe(false);

			// check valid querystring parameter 'format'
			expect(ClientRequest.getParameterValidations().queryStringParameters.format('detailed')).toBe(true);

			// check invalid querystring parameter 'format'
			expect(ClientRequest.getParameterValidations().queryStringParameters.format('invalid')).toBe(false);

		});

		it("Check client information against test event", () => {
			
			const REQ = new ClientRequest(testEventA, testContextA);
			expect(REQ.getClientUserAgent()).toBe('Mozilla/5.0');
			expect(REQ.getClientIp()).toBe('192.168.100.1');
			expect(REQ.getClientReferer(true)).toBe('https://internal.example.com/dev');
			expect(REQ.getClientReferer(false)).toBe('internal.example.com');
			expect(REQ.getClientReferer()).toBe('internal.example.com');
		})

		it("Test Props against test event", () => {
			const REQ = new ClientRequest(testEventA, testContextA);
			const props = REQ.getProps();
			expect(props.client.isAuthenticated).toBe(false);
			expect(props.client.isGuest).toBe(true);
			expect(props.method).toBe('GET');
			expect(props.path).toBe('employees/12345/profile');
			expect(props.pathArray.length).toBe(3);
			expect(props.resource).toBe('employees/{employeeId}/profile');
			expect(props.resourceArray.length).toBe(3);
			expect(props.pathParameters.employeeId).toBe('12345');
			expect(props.queryStringParameters.include).toBe('contact,department');
			expect(props.headerParameters.userAgent).toBe('Mozilla/5.0');
		})

		it("Test getPath and getResource methods", () => {
			const REQ = new ClientRequest(testEventA, testContextA);
			expect(REQ.getPath()).toBe('employees/12345/profile');
			expect(REQ.getPath(1)).toBe('employees');
			expect(REQ.getPath(2)).toBe('employees/12345');
			expect(REQ.getPath(3)).toBe('employees/12345/profile');
			expect(REQ.getPath(4)).toBe('employees/12345/profile');
			expect(REQ.getPath(0)).toBe('employees/12345/profile');
			expect(REQ.getPath(-1)).toBe('profile');
			expect(REQ.getPath(-2)).toBe('12345/profile');
			expect(REQ.getPath(-3)).toBe('employees/12345/profile');
			expect(REQ.getPath(-4)).toBe('employees/12345/profile');
			expect(REQ.getPath(-5)).toBe('employees/12345/profile');

			expect(REQ.getResource()).toBe('employees/{employeeId}/profile');
			expect(REQ.getResource(1)).toBe('employees');
			expect(REQ.getResource(2)).toBe('employees/{employeeId}');
			expect(REQ.getResource(3)).toBe('employees/{employeeId}/profile');
			expect(REQ.getResource(4)).toBe('employees/{employeeId}/profile');
			expect(REQ.getResource(0)).toBe('employees/{employeeId}/profile');
			expect(REQ.getResource(-1)).toBe('profile');
			expect(REQ.getResource(-2)).toBe('{employeeId}/profile');
			expect(REQ.getResource(-3)).toBe('employees/{employeeId}/profile');
			expect(REQ.getResource(-4)).toBe('employees/{employeeId}/profile');

			expect(REQ.getPathAt(0)).toBe('employees');
			expect(REQ.getPathAt(1)).toBe('12345');
			expect(REQ.getPathAt(2)).toBe('profile');
			expect(REQ.getPathAt(3)).toBe(null);
			expect(REQ.getPathAt(-1)).toBe('profile');
			expect(REQ.getPathAt(-2)).toBe('12345');
			expect(REQ.getPathAt(-3)).toBe('employees');
			expect(REQ.getPathAt(-4)).toBe(null);

			expect(REQ.getResourceAt(0)).toBe('employees');
			expect(REQ.getResourceAt(1)).toBe('{employeeId}');
			expect(REQ.getResourceAt(2)).toBe('profile');
			expect(REQ.getResourceAt(3)).toBe(null);
			expect(REQ.getResourceAt(-1)).toBe('profile');
			expect(REQ.getResourceAt(-2)).toBe('{employeeId}');
			expect(REQ.getResourceAt(-3)).toBe('employees');
			expect(REQ.getResourceAt(-4)).toBe(null);

			expect(REQ.getPathArray().length).toBe(3);
			expect(REQ.getPathArray(2).length).toBe(2);
			expect(REQ.getPathArray(3).length).toBe(3);
			expect(REQ.getPathArray(4).length).toBe(3);
			expect(REQ.getPathArray(0).length).toBe(3);
			expect(REQ.getPathArray(2)[0]).toBe('employees');
			expect(REQ.getPathArray(2)[1]).toBe('12345');
			expect(REQ.getPathArray(-1)[0]).toBe('profile');
			expect(REQ.getPathArray(-2)[0]).toBe('12345');

			expect(REQ.getResourceArray().length).toBe(3);
			expect(REQ.getResourceArray(2).length).toBe(2);
			expect(REQ.getResourceArray(3).length).toBe(3);
			expect(REQ.getResourceArray(4).length).toBe(3);
			expect(REQ.getResourceArray(0).length).toBe(3);
			expect(REQ.getResourceArray(2)[0]).toBe('employees');
			expect(REQ.getResourceArray(2)[1]).toBe('{employeeId}');
			expect(REQ.getResourceArray(-1)[0]).toBe('profile');
			expect(REQ.getResourceArray(-2)[0]).toBe('{employeeId}');

		})
	});
});

	describe("ClientRequest - Edge Cases for structuredClone optimization", () => {
		
		describe("Empty authorization arrays", () => {
			it("should handle empty authorization arrays correctly", () => {
				// Create a ClientRequest instance
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations
				const auths = req.getAuthorizations();
				
				// Verify it's an array
				expect(Array.isArray(auths)).toBe(true);
				
				// Verify it has the default value
				expect(auths.length).toBeGreaterThan(0);
			});
		});

		describe("Authorization arrays with various structures", () => {
			it("should return defensive copy that doesn't affect internal state", () => {
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations multiple times
				const auths1 = req.getAuthorizations();
				const auths2 = req.getAuthorizations();
				
				// Modify first copy
				auths1.push('new-auth');
				auths1[0] = 'modified';
				
				// Verify second copy is unaffected
				expect(auths2).not.toEqual(auths1);
				expect(auths2).toEqual(['all']);
			});

			it("should handle authorization arrays with string values", () => {
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations
				const auths = req.getAuthorizations();
				
				// Verify all elements are strings
				auths.forEach(auth => {
					expect(typeof auth).toBe('string');
				});
			});

			it("should maintain array structure after cloning", () => {
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations
				const auths = req.getAuthorizations();
				
				// Verify it's an array
				expect(Array.isArray(auths)).toBe(true);
				
				// Verify array methods work
				expect(typeof auths.push).toBe('function');
				expect(typeof auths.pop).toBe('function');
				expect(typeof auths.slice).toBe('function');
			});

			it("should handle multiple authorization values", () => {
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations
				const auths = req.getAuthorizations();
				
				// Verify default authorization
				expect(auths).toContain('all');
			});
		});

		describe("Authorization cloning consistency", () => {
			it("should produce identical results across multiple calls", () => {
				const req = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations multiple times
				const auths1 = req.getAuthorizations();
				const auths2 = req.getAuthorizations();
				const auths3 = req.getAuthorizations();
				
				// Verify all are identical
				expect(JSON.stringify(auths1)).toBe(JSON.stringify(auths2));
				expect(JSON.stringify(auths2)).toBe(JSON.stringify(auths3));
			});

			it("should maintain independence between instances", () => {
				const req1 = new ClientRequest(testEventA, testContextA);
				const req2 = new ClientRequest(testEventA, testContextA);
				
				// Get authorizations from both
				const auths1 = req1.getAuthorizations();
				const auths2 = req2.getAuthorizations();
				
				// Modify first
				auths1.push('modified');
				
				// Verify second is unaffected
				expect(auths2).not.toEqual(auths1);
				expect(auths2).toEqual(['all']);
			});
		});
	});
