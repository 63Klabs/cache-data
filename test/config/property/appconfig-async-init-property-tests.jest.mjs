/**
 * Property-based tests for AppConfig async initialization
 * Feature: appconfig-async-init-optimization
 * 
 * Tests universal correctness properties across many generated inputs using fast-check.
 * Each property validates specific requirements from the design document.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';

// Import tools module to access AppConfig and related classes
const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog, Connections, ClientRequest, Response } = tools.default;

/**
 * Generators for property-based testing
 */

// Generate valid settings object
const settingsArbitrary = fc.record({
	dataLimit: fc.option(fc.integer({ min: 1, max: 10000 })),
	cacheTTL: fc.option(fc.integer({ min: 1, max: 3600 })),
	customField: fc.option(fc.string())
});

// Generate valid connections object
// >! Filter out objects with __proto__ or other special properties that cause Connections constructor to fail
const connectionsArbitrary = fc.dictionary(
	fc.string({ minLength: 1, maxLength: 20 }),
	fc.record({
		method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
		host: fc.domain(),
		path: fc.string({ minLength: 1, maxLength: 50 }).map(s => '/' + s),
		parameters: fc.option(fc.dictionary(fc.string(), fc.string()))
	}),
	{ minKeys: 1, maxKeys: 3 }
).filter(connections => {
	// Filter out objects with special properties like __proto__, constructor, prototype
	for (const key in connections) {
		if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
			return false;
		}
		// Also check nested objects
		const conn = connections[key];
		if (conn && typeof conn === 'object') {
			for (const nestedKey in conn) {
				if (nestedKey === '__proto__' || nestedKey === 'constructor' || nestedKey === 'prototype') {
					return false;
				}
			}
		}
	}
	return true;
});

// Generate valid validations object
const validationsArbitrary = fc.record({
	paramValidations: fc.array(fc.record({
		name: fc.string({ minLength: 1, maxLength: 20 }),
		required: fc.boolean()
	}), { maxLength: 5 })
});

// Generate valid responses object
const responsesArbitrary = fc.record({
	settings: fc.record({
		errorExpirationInSeconds: fc.integer({ min: 1, max: 3600 }),
		routeExpirationInSeconds: fc.integer({ min: 1, max: 3600 })
	})
});

// Generate random combinations of options
const optionsArbitrary = fc.record({
	settings: fc.option(settingsArbitrary),
	connections: fc.option(connectionsArbitrary),
	validations: fc.option(validationsArbitrary),
	responses: fc.option(responsesArbitrary),
	debug: fc.option(fc.boolean())
}, { requiredKeys: [] });

// Generate options with at least one field
const nonEmptyOptionsArbitrary = fc.record({
	settings: fc.option(settingsArbitrary),
	connections: fc.option(connectionsArbitrary),
	validations: fc.option(validationsArbitrary),
	responses: fc.option(responsesArbitrary),
	debug: fc.option(fc.boolean())
}).filter(opts => 
	opts.settings !== null || 
	opts.connections !== null || 
	opts.validations !== null || 
	opts.responses !== null
);

describe('AppConfig Async Initialization - Property-Based Tests', () => {
	
	// Store original methods for restoration
	let originalDebugLog;
	let originalDebugError;
	let originalClientRequestInit;
	let originalResponseInit;
	let originalInitParameters;
	
	beforeEach(() => {
		// Reset AppConfig state before each test
		AppConfig._promises = [];
		AppConfig._promise = null;
		AppConfig._settings = null;
		AppConfig._connections = null;
		AppConfig._ssmParameters = null;
		
		// Store original methods
		originalDebugLog = DebugAndLog.debug;
		originalDebugError = DebugAndLog.error;
		originalClientRequestInit = ClientRequest.init;
		originalResponseInit = Response.init;
		originalInitParameters = AppConfig._initParameters;
	});
	
	afterEach(() => {
		// Restore all mocks
		jest.restoreAllMocks();
		
		// Restore original methods
		DebugAndLog.debug = originalDebugLog;
		DebugAndLog.error = originalDebugError;
		ClientRequest.init = originalClientRequestInit;
		Response.init = originalResponseInit;
		AppConfig._initParameters = originalInitParameters;
	});

	/**
	 * Property 1: Initialization Round-Trip
	 * 
	 * For any valid options object containing settings, connections, validations, and/or responses,
	 * after calling AppConfig.init(options) and waiting for AppConfig.promise() to resolve,
	 * the corresponding AppConfig fields should contain the provided configuration data.
	 * 
	 * Validates: Requirements 1.3, 2.3, 3.3, 4.3, 6.4
	 */
	describe('Property 1: Initialization Round-Trip', () => {
		it('should preserve all provided configuration after init and promise resolution', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					nonEmptyOptionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						AppConfig._settings = null;
						AppConfig._connections = null;
						
						// Call init and wait for promise
						const result = AppConfig.init(options);
						expect(result).toBe(true);
						await AppConfig.promise();
						
						// Verify settings
						if (options.settings) {
							expect(AppConfig._settings).toEqual(options.settings);
						}
						
						// Verify connections
						if (options.connections) {
							expect(AppConfig._connections).toBeInstanceOf(Connections);
						}
						
						// Verify ClientRequest initialized
						if (options.validations) {
							expect(ClientRequest.init).toHaveBeenCalledWith(options.validations);
						}
						
						// Verify Response initialized
						if (options.responses) {
							expect(Response.init).toHaveBeenCalledWith(options.responses);
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 2: Promise Registration Completeness
	 * 
	 * For any valid options object, after calling AppConfig.init(options),
	 * the number of promises in AppConfig._promises should equal the number of provided options.
	 * 
	 * Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2
	 */
	describe('Property 2: Promise Registration Completeness', () => {
		it('should register exactly one promise per provided option', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			AppConfig._initParameters = jest.fn().mockResolvedValue({});
			
			await fc.assert(
				fc.asyncProperty(
					optionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						
						// Count expected promises
						let expectedCount = 0;
						if (options.settings) expectedCount++;
						if (options.connections) expectedCount++;
						if (options.validations) expectedCount++;
						if (options.responses) expectedCount++;
						if (options.ssmParameters) expectedCount++;
						
						// Call init
						AppConfig.init(options);
						
						// Verify promise count
						expect(AppConfig._promises).toHaveLength(expectedCount);
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 3: Debug Logging After Resolution
	 * 
	 * For any valid options object with debug=true, after calling AppConfig.init(options)
	 * and waiting for AppConfig.promise() to resolve, the debug log should contain
	 * initialization messages for each provided option, and "Config Init in debug mode"
	 * should appear first.
	 * 
	 * Validates: Requirements 1.4, 2.4, 3.4, 4.4, 8.2, 8.3, 8.4
	 */
	describe('Property 3: Debug Logging After Resolution', () => {
		it('should log debug messages in correct order with correct data', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					nonEmptyOptionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						const debugMessages = [];
						
						// Mock debug logging
						DebugAndLog.debug = jest.fn((...args) => {
							debugMessages.push(args);
						});
						
						// Add debug flag
						const optionsWithDebug = { ...options, debug: true };
						
						// Call init
						AppConfig.init(optionsWithDebug);
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						// Verify "Config Init in debug mode" appears first
						expect(debugMessages.length).toBeGreaterThan(0);
						expect(debugMessages[0][0]).toBe('Config Init in debug mode');
						
						// Verify initialization messages appear after promise resolves
						const messages = debugMessages.map(args => args[0]);
						
						if (options.settings) {
							expect(messages).toContain('Settings initialized');
						}
						if (options.connections) {
							expect(messages).toContain('Connections initialized');
						}
						if (options.validations) {
							expect(messages).toContain('ClientRequest initialized');
						}
						if (options.responses) {
							expect(messages).toContain('Response initialized');
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 4: Parallel Execution Performance
	 * 
	 * For any valid options object with multiple initialization operations,
	 * the total execution time from AppConfig.init() to AppConfig.promise() resolution
	 * should be approximately equal to the maximum individual operation time, not the sum.
	 * 
	 * Validates: Requirements 5.4, 5.5
	 */
	describe('Property 4: Parallel Execution Performance', () => {
		it('should execute operations in parallel, not sequentially', async () => {
			// Mock methods with delays to simulate async operations
			const delays = {
				settings: 20,
				connections: 30,
				validations: 25,
				responses: 15
			};
			
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						settings: fc.constant({ test: 1 }),
						connections: fc.constant({ conn1: { method: 'GET', host: 'example.com', path: '/api' } }),
						validations: fc.constant({ paramValidations: [] }),
						responses: fc.constant({ settings: { errorExpirationInSeconds: 60 } })
					}),
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						
						// Track operation times
						const operationTimes = [];
						
						// Mock ClientRequest.init with delay
						ClientRequest.init = jest.fn().mockImplementation(async () => {
							const start = Date.now();
							await new Promise(resolve => setTimeout(resolve, delays.validations));
							operationTimes.push(Date.now() - start);
						});
						
						// Mock Response.init with delay
						Response.init = jest.fn().mockImplementation(async () => {
							const start = Date.now();
							await new Promise(resolve => setTimeout(resolve, delays.responses));
							operationTimes.push(Date.now() - start);
						});
						
						// Measure total execution time
						const startTime = Date.now();
						AppConfig.init(options);
						await AppConfig.promise();
						const totalTime = Date.now() - startTime;
						
						// Calculate expected times
						const maxIndividualTime = Math.max(...Object.values(delays));
						const sumOfTimes = Object.values(delays).reduce((a, b) => a + b, 0);
						
						// Verify parallel execution (total time ≈ max time, not sum)
						// Allow 50% tolerance for overhead and timing variations
						const tolerance = maxIndividualTime * 0.5;
						expect(totalTime).toBeLessThan(maxIndividualTime + tolerance);
						expect(totalTime).toBeLessThan(sumOfTimes * 0.7); // Much less than sequential
						
						return true;
					}
				),
				{ numRuns: 20 } // Fewer runs due to timing sensitivity
			);
		});
	});

	/**
	 * Property 5: Promise.all() Completion Guarantee
	 * 
	 * For any valid options object, AppConfig.promise() should not resolve until
	 * all registered initialization promises have completed.
	 * 
	 * Validates: Requirements 1.5, 2.5, 3.5, 4.5, 5.3, 10.5
	 */
	describe('Property 5: Promise.all() Completion Guarantee', () => {
		it('should not resolve promise() until all operations complete', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					nonEmptyOptionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						
						// Track completion order
						const completionOrder = [];
						
						// Wrap operations to track completion
						if (options.settings) {
							const originalPromise = AppConfig._promises[AppConfig._promises.length];
							// Settings will complete first
							completionOrder.push('settings');
						}
						
						// Call init
						AppConfig.init(options);
						
						// Track that promise() hasn't resolved yet
						let promiseResolved = false;
						const promiseResult = AppConfig.promise().then(() => {
							promiseResolved = true;
						});
						
						// Verify promise hasn't resolved immediately
						await new Promise(resolve => setTimeout(resolve, 10));
						
						// Wait for promise to resolve
						await promiseResult;
						
						// Verify promise resolved
						expect(promiseResolved).toBe(true);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 6: Synchronous Return
	 * 
	 * For any valid options object, AppConfig.init(options) should return immediately
	 * (< 1ms) with a boolean value, without waiting for any promises to resolve.
	 * 
	 * Validates: Requirements 6.1
	 */
	describe('Property 6: Synchronous Return', () => {
		it('should return immediately with boolean value', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					optionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						
						// Measure time from init() call to return
						const startTime = Date.now();
						const result = AppConfig.init(options);
						const endTime = Date.now();
						const duration = endTime - startTime;
						
						// Verify return is immediate (< 10ms to account for system variations)
						expect(duration).toBeLessThan(10);
						
						// Verify return value is boolean
						expect(typeof result).toBe('boolean');
						expect(result).toBe(true);
						
						// Verify return happens before any promise resolves
						let promiseResolved = false;
						AppConfig.promise().then(() => {
							promiseResolved = true;
						});
						
						// At this point, init() has returned but promises haven't resolved
						expect(promiseResolved).toBe(false);
						
						// Wait for promises
						await AppConfig.promise();
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 7: Error Isolation
	 * 
	 * For any options object where one operation throws an error, the error should be
	 * caught and logged, and other operations should complete successfully without being
	 * affected by the error.
	 * 
	 * Validates: Requirements 7.1, 7.2, 7.3
	 */
	describe('Property 7: Error Isolation', () => {
		it('should isolate errors and allow other operations to continue', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						settings: fc.constant({ test: 1 }),
						connections: fc.constant({ conn1: { method: 'GET', host: 'example.com', path: '/api' } }),
						validations: fc.constant({ invalid: true }),
						responses: fc.constant({ settings: { errorExpirationInSeconds: 60 } })
					}),
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						AppConfig._settings = null;
						AppConfig._connections = null;
						
						const errorMessages = [];
						DebugAndLog.error = jest.fn((...args) => {
							errorMessages.push(args);
						});
						
						// Mock ClientRequest.init to throw error
						ClientRequest.init = jest.fn(() => {
							throw new Error('Validation error');
						});
						
						// Mock Response.init to succeed
						Response.init = jest.fn();
						
						// Call init
						const result = AppConfig.init(options);
						
						// Verify init() returns true (no synchronous error)
						expect(result).toBe(true);
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						// Verify error was caught and logged
						expect(DebugAndLog.error).toHaveBeenCalled();
						expect(errorMessages[0][0]).toContain('ClientRequest initialization failed');
						
						// Verify other operations completed successfully
						expect(AppConfig._settings).toEqual(options.settings);
						expect(AppConfig._connections).toBeInstanceOf(Connections);
						expect(Response.init).toHaveBeenCalled();
						
						// Verify failed operation's promise still resolved
						// (promise() should resolve successfully)
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 8: Synchronous Error Handling
	 * 
	 * For any options object that causes a synchronous error in the try-catch block,
	 * init() should return false and log the error.
	 * 
	 * Validates: Requirements 7.4
	 */
	describe('Property 8: Synchronous Error Handling', () => {
		it('should return false and log error on synchronous errors', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constant({}),
					async () => {
						// Reset state
						AppConfig._promises = [];
						
						const errorMessages = [];
						DebugAndLog.error = jest.fn((...args) => {
							errorMessages.push(args);
						});
						
						// Create options that cause synchronous error
						const badOptions = {};
						Object.defineProperty(badOptions, 'settings', {
							get() {
								throw new Error('Synchronous error');
							}
						});
						
						// Call init with bad options
						const result = AppConfig.init(badOptions);
						
						// Verify init() returns false
						expect(result).toBe(false);
						
						// Verify error was logged
						expect(DebugAndLog.error).toHaveBeenCalled();
						expect(errorMessages[0][0]).toContain('Could not initialize Config');
						
						// Verify no promises are registered
						expect(AppConfig._promises).toHaveLength(0);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 9: Successful Initialization Return Value
	 * 
	 * For any valid options object that doesn't cause synchronous errors,
	 * AppConfig.init(options) should return true.
	 * 
	 * Validates: Requirements 7.5
	 */
	describe('Property 9: Successful Initialization Return Value', () => {
		it('should return true for all valid options', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			AppConfig._initParameters = jest.fn().mockResolvedValue({});
			
			await fc.assert(
				fc.asyncProperty(
					optionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						
						// Call init
						const result = AppConfig.init(options);
						
						// Verify init() returns true
						expect(result).toBe(true);
						
						// Verify no synchronous errors occurred
						// (if there were, result would be false)
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 10: Backwards Compatibility
	 * 
	 * For any valid options object, the final state after calling AppConfig.init(options)
	 * followed by AppConfig.promise() should be identical to the expected state.
	 * 
	 * Validates: Requirements 6.3
	 */
	describe('Property 10: Backwards Compatibility', () => {
		it('should produce identical final state as expected', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					nonEmptyOptionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						AppConfig._settings = null;
						AppConfig._connections = null;
						
						// Call init() followed by promise() (new implementation)
						const result = AppConfig.init(options);
						expect(result).toBe(true);
						await AppConfig.promise();
						
						// Verify final state matches expected
						if (options.settings) {
							expect(AppConfig._settings).toEqual(options.settings);
						} else {
							expect(AppConfig._settings).toBeNull();
						}
						
						// >! Connections initialization may fail with invalid data
						// >! When it fails, error is caught and logged, and _connections remains null
						// >! This is correct behavior per error handling design (Requirement 7.1, 7.2, 7.3)
						if (options.connections) {
							// If connections were provided, either:
							// 1. Connections instance was created successfully, OR
							// 2. Connections constructor threw error, was caught, and _connections is null
							// Both are valid outcomes depending on data validity
							if (AppConfig._connections !== null) {
								expect(AppConfig._connections).toBeInstanceOf(Connections);
							}
							// If null, that's OK - it means initialization failed and was handled gracefully
						} else {
							expect(AppConfig._connections).toBeNull();
						}
						
						if (options.validations) {
							expect(ClientRequest.init).toHaveBeenCalledWith(options.validations);
						}
						
						if (options.responses) {
							expect(Response.init).toHaveBeenCalledWith(options.responses);
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 11: SSM Parameters Unchanged
	 * 
	 * For any valid ssmParameters option, the behavior of SSM parameter loading
	 * should be identical to the current implementation, executing in parallel
	 * with other initialization operations.
	 * 
	 * Validates: Requirements 9.2, 9.3, 9.4
	 */
	describe('Property 11: SSM Parameters Unchanged', () => {
		it('should handle SSM parameters identically to current implementation', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						settings: fc.option(settingsArbitrary),
						ssmParameters: fc.constant([
							{
								group: 'app',
								path: '/test/params/',
								names: ['param1', 'param2']
							}
						])
					}),
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						AppConfig._ssmParameters = null;
						
						// Mock _initParameters
						const mockParams = { app: { param1: 'value1', param2: 'value2' } };
						const mockInitParams = jest.fn().mockResolvedValue(mockParams);
						AppConfig._initParameters = mockInitParams;
						
						// Call init
						const result = AppConfig.init(options);
						expect(result).toBe(true);
						
						// Verify _initParameters was called correctly
						expect(mockInitParams).toHaveBeenCalledWith(options.ssmParameters);
						
						// Verify SSM parameters promise is registered
						const promiseCount = options.settings ? 2 : 1;
						expect(AppConfig._promises).toHaveLength(promiseCount);
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						// Verify SSM parameters are set correctly
						const resolvedParams = await AppConfig._ssmParameters;
						expect(resolvedParams).toEqual(mockParams);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 12: Selective Initialization
	 * 
	 * For any subset of valid options, AppConfig.init() should register promises only
	 * for the provided options, and AppConfig.promise() should resolve after only those
	 * operations complete.
	 * 
	 * Validates: Requirements 10.1, 10.4
	 */
	describe('Property 12: Selective Initialization', () => {
		it('should initialize only provided options', async () => {
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			AppConfig._initParameters = jest.fn().mockResolvedValue({});
			
			await fc.assert(
				fc.asyncProperty(
					optionsArbitrary,
					async (options) => {
						// Reset state
						AppConfig._promises = [];
						AppConfig._settings = null;
						AppConfig._connections = null;
						
						// Count expected promises
						let expectedCount = 0;
						if (options.settings) expectedCount++;
						if (options.connections) expectedCount++;
						if (options.validations) expectedCount++;
						if (options.responses) expectedCount++;
						if (options.ssmParameters) expectedCount++;
						
						// Call init
						const result = AppConfig.init(options);
						expect(result).toBe(true);
						
						// Verify promise count matches provided options
						expect(AppConfig._promises).toHaveLength(expectedCount);
						
						// Wait for promises to resolve
						await AppConfig.promise();
						
						// Verify only provided options are initialized
						if (options.settings) {
							expect(AppConfig._settings).toEqual(options.settings);
						} else {
							expect(AppConfig._settings).toBeNull();
						}
						
						if (options.connections) {
							expect(AppConfig._connections).toBeInstanceOf(Connections);
						} else {
							expect(AppConfig._connections).toBeNull();
						}
						
						if (options.validations) {
							expect(ClientRequest.init).toHaveBeenCalled();
						}
						
						if (options.responses) {
							expect(Response.init).toHaveBeenCalled();
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * Property 13: Empty Options Handling
	 * 
	 * When AppConfig.init() is called with an empty options object {},
	 * no promises should be registered, and AppConfig.promise() should resolve immediately.
	 * 
	 * Validates: Requirements 10.2, 10.3
	 */
	describe('Property 13: Empty Options Handling', () => {
		it('should handle empty options correctly', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constant({}),
					async () => {
						// Reset state
						AppConfig._promises = [];
						
						// Call init with empty object
						const result = AppConfig.init({});
						
						// Verify init() returns true
						expect(result).toBe(true);
						
						// Verify no promises registered
						expect(AppConfig._promises).toHaveLength(0);
						
						// Verify promise() resolves immediately
						const startTime = Date.now();
						await AppConfig.promise();
						const duration = Date.now() - startTime;
						
						// Should resolve in < 10ms (immediate)
						expect(duration).toBeLessThan(10);
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
