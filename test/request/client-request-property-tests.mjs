import { expect } from 'chai';
import fc from 'fast-check';
import { ClientRequest } from '../../src/lib/tools/index.js';
import { testEventA } from '../helpers/test-event.js';
import { testContextA } from '../helpers/test-context.js';
import { testValidationsA } from '../helpers/test-validations.js';

ClientRequest.init({ validations: testValidationsA });

/* ****************************************************************************
 * ClientRequest Property-Based Tests
 * Feature: reduce-json-stringify
 */
describe("ClientRequest - Property-Based Tests", () => {

	describe("Property 1: Defensive Copy Immutability", () => {
		// Feature: reduce-json-stringify, Property 1: Defensive Copy Immutability

		it("should not affect static property when modifying returned authorizations from constructor", () => {
			fc.assert(
				fc.property(
					fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
					fc.string(),
					(method, path) => {
						// Create a test event with random method and path
						const testEvent = {
							...testEventA,
							httpMethod: method,
							path: path || '/test'
						};

						// Create a ClientRequest instance
						const req = new ClientRequest(testEvent, testContextA);

						// Get authorizations (should be a defensive copy)
						const authsCopy = req.getAuthorizations();

						// Store the original static property value
						const originalStaticAuth = ['all']; // Default unauthenticated authorizations

						// Modify the returned copy
						authsCopy.push('modified');
						if (authsCopy.length > 0) {
							authsCopy[0] = 'tampered';
						}

						// Create a new instance and verify static property wasn't affected
						const req2 = new ClientRequest(testEvent, testContextA);
						const authsAfterModification = req2.getAuthorizations();

						// Verify the static property hasn't changed
						expect(authsAfterModification).to.deep.equal(originalStaticAuth);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect static property when modifying returned authorizations from getAuthorizations()", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					(iterations) => {
						// Create a ClientRequest instance
						const req = new ClientRequest(testEventA, testContextA);

						// Get authorizations multiple times and modify each copy
						for (let i = 0; i < iterations; i++) {
							const authsCopy = req.getAuthorizations();
							authsCopy.push(`modified-${i}`);
							authsCopy[0] = `tampered-${i}`;
						}

						// Get authorizations one more time
						const finalAuths = req.getAuthorizations();

						// Verify the returned value is still the original
						expect(finalAuths).to.deep.equal(['all']);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should not affect internal state when modifying nested values in authorizations", () => {
			fc.assert(
				fc.property(
					fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
					(modifications) => {
						// Create a ClientRequest instance
						const req = new ClientRequest(testEventA, testContextA);

						// Get authorizations
						const authsCopy = req.getAuthorizations();

						// Store the original state
						const originalAuths = req.getAuthorizations();

						// Try various modifications
						modifications.forEach((mod, idx) => {
							if (idx < authsCopy.length) {
								authsCopy[idx] = mod;
							}
						});
						authsCopy.push('new-auth');

						// Get the state after modification
						const authsAfterModification = req.getAuthorizations();

						// Verify the internal state hasn't changed
						expect(JSON.stringify(authsAfterModification)).to.equal(JSON.stringify(originalAuths));
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: Output Compatibility with JSON Pattern", () => {
		// Feature: reduce-json-stringify, Property 2: Output Compatibility with JSON Pattern

		it("should produce identical output for getAuthorizations() compared to JSON pattern", () => {
			fc.assert(
				fc.property(
					fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
					(method) => {
						// Create a test event
						const testEvent = {
							...testEventA,
							httpMethod: method
						};

						// Create a ClientRequest instance
						const req = new ClientRequest(testEvent, testContextA);

						// Get authorizations using structuredClone (current implementation)
						const structuredCloneOutput = req.getAuthorizations();

						// Simulate JSON pattern output (what it would have been before)
						const staticAuth = ['all']; // Default unauthenticated authorizations
						const jsonPatternOutput = JSON.parse(JSON.stringify(staticAuth));

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should produce identical output for authorization arrays with various structures", () => {
			fc.assert(
				fc.property(
					fc.array(fc.oneof(fc.string(), fc.constant('all'), fc.constant('none')), { minLength: 1, maxLength: 5 }),
					(authArray) => {
						// For this test, we're verifying that structuredClone and JSON pattern
						// produce identical results for array cloning
						
						// Simulate structuredClone
						const structuredCloneOutput = structuredClone(authArray);

						// Simulate JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(authArray));

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should handle empty and single-element authorization arrays identically", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant([]),
						fc.array(fc.string(), { minLength: 1, maxLength: 1 })
					),
					(authArray) => {
						// Simulate structuredClone
						const structuredCloneOutput = structuredClone(authArray);

						// Simulate JSON pattern
						const jsonPatternOutput = JSON.parse(JSON.stringify(authArray));

						// Verify outputs are identical
						expect(JSON.stringify(structuredCloneOutput)).to.equal(JSON.stringify(jsonPatternOutput));
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
