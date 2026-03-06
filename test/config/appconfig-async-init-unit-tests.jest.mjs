/**
 * Unit tests for AppConfig async initialization
 * Feature: appconfig-async-init-optimization
 * 
 * Tests the async initialization of AppConfig.init() method, verifying that:
 * - All initialization operations are wrapped in promises
 * - Promises are registered via AppConfig.add()
 * - Promise.all() waits for all operations to complete
 * - Debug logging works correctly
 * - Error handling is proper
 * - Backwards compatibility is maintained
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Import tools module to access AppConfig and related classes
const tools = await import('../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog, Connections, ClientRequest, Response } = tools.default;

describe('AppConfig Async Initialization - Unit Tests', () => {
	
	// Store original methods for restoration
	let originalDebugLog;
	let originalDebugError;
	let originalClientRequestInit;
	let originalResponseInit;
	
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
	});
	
	afterEach(() => {
		// Restore all mocks
		jest.restoreAllMocks();
		
		// Restore original methods
		DebugAndLog.debug = originalDebugLog;
		DebugAndLog.error = originalDebugError;
		ClientRequest.init = originalClientRequestInit;
		Response.init = originalResponseInit;
	});
	
	describe('2.1 Empty options initialization', () => {
		it('should handle empty object {} correctly', async () => {
			// Test init() with empty object
			const result = AppConfig.init({});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify no promises registered
			expect(AppConfig._promises).toHaveLength(0);
			
			// Verify promise() resolves immediately
			await expect(AppConfig.promise()).resolves.toEqual([]);
		});
		
		it('should handle no arguments (undefined options)', async () => {
			// Test init() with no arguments
			const result = AppConfig.init();
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify no promises registered
			expect(AppConfig._promises).toHaveLength(0);
			
			// Verify promise() resolves immediately
			await expect(AppConfig.promise()).resolves.toEqual([]);
		});
	});
	
	describe('2.2 Single option initialization', () => {
		it('should initialize with only settings option', async () => {
			const testSettings = { dataLimit: 1000, cacheTTL: 300 };
			
			// Call init with only settings
			const result = AppConfig.init({ settings: testSettings });
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify single promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify settings initialized correctly
			expect(AppConfig._settings).toEqual(testSettings);
		});
		
		it('should initialize with only connections option', async () => {
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api/v1/data'
				}
			};
			
			// Call init with only connections
			const result = AppConfig.init({ connections: testConnections });
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify single promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify connections initialized correctly
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
		
		it('should initialize with only validations option', async () => {
			const testValidations = {
				paramValidations: []
			};
			
			// Mock ClientRequest.init to avoid side effects
			ClientRequest.init = jest.fn();
			
			// Call init with only validations
			const result = AppConfig.init({ validations: testValidations });
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify single promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify ClientRequest.init was called
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
		});
		
		it('should initialize with only responses option', async () => {
			const testResponses = {
				settings: {
					errorExpirationInSeconds: 60,
					routeExpirationInSeconds: 300
				}
			};
			
			// Mock Response.init to avoid side effects
			Response.init = jest.fn();
			
			// Call init with only responses
			const result = AppConfig.init({ responses: testResponses });
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify single promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify Response.init was called
			expect(Response.init).toHaveBeenCalledWith(testResponses);
		});
		
		it('should initialize with only ssmParameters option', async () => {
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['param1', 'param2']
				}
			];
			
			// Mock _initParameters to avoid actual SSM calls
			const mockInitParams = jest.fn().mockResolvedValue({ app: { param1: 'value1' } });
			AppConfig._initParameters = mockInitParams;
			
			// Call init with only ssmParameters
			const result = AppConfig.init({ ssmParameters: testSSMParams });
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify single promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify _initParameters was called
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
		});
		
		it('should log debug messages when debug=true for settings', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
			});
			
			const testSettings = { dataLimit: 1000 };
			
			// Call init with debug=true
			AppConfig.init({ settings: testSettings, debug: true });
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify debug messages
			expect(DebugAndLog.debug).toHaveBeenCalled();
			const messages = debugMessages.map(args => args[0]);
			expect(messages).toContain('Config Init in debug mode');
			expect(messages).toContain('Settings initialized');
		});
		
		it('should log debug messages when debug=true for connections', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
			});
			
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api'
				}
			};
			
			// Call init with debug=true
			AppConfig.init({ connections: testConnections, debug: true });
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify debug messages
			expect(DebugAndLog.debug).toHaveBeenCalled();
			const messages = debugMessages.map(args => args[0]);
			expect(messages).toContain('Config Init in debug mode');
			expect(messages).toContain('Connections initialized');
		});
	});
	
	describe('2.3 All options initialization', () => {
		it('should initialize with all options', async () => {
			const testSettings = { dataLimit: 1000 };
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api'
				}
			};
			const testValidations = { paramValidations: [] };
			const testResponses = { settings: { errorExpirationInSeconds: 60 } };
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['param1']
				}
			];
			
			// Mock methods to avoid side effects
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			const mockInitParams = jest.fn().mockResolvedValue({ app: { param1: 'value1' } });
			AppConfig._initParameters = mockInitParams;
			
			// Call init with all options
			const result = AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: testValidations,
				responses: testResponses,
				ssmParameters: testSSMParams
			});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify 5 promises registered
			expect(AppConfig._promises).toHaveLength(5);
			
			// Wait for all promises to resolve
			await AppConfig.promise();
			
			// Verify all fields initialized correctly
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
			expect(Response.init).toHaveBeenCalledWith(testResponses);
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
		});
		
		it('should log all debug messages when debug=true', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
			});
			
			const testSettings = { dataLimit: 1000 };
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api'
				}
			};
			const testValidations = { paramValidations: [] };
			const testResponses = { settings: { errorExpirationInSeconds: 60 } };
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['param1']
				}
			];
			
			// Mock methods
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			const mockInitParams = jest.fn().mockResolvedValue({ app: { param1: 'value1' } });
			AppConfig._initParameters = mockInitParams;
			
			// Call init with all options and debug=true
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: testValidations,
				responses: testResponses,
				ssmParameters: testSSMParams,
				debug: true
			});
			
			// Wait for all promises to resolve
			await AppConfig.promise();
			
			// Verify debug messages
			const messages = debugMessages.map(args => args[0]);
			expect(messages).toContain('Config Init in debug mode');
			expect(messages).toContain('Settings initialized');
			expect(messages).toContain('Connections initialized');
			expect(messages).toContain('ClientRequest initialized');
			expect(messages).toContain('Response initialized');
		});
	});
	
	describe('2.4 Error handling', () => {
		it('should handle invalid validations data that throws error', async () => {
			const errorMessages = [];
			DebugAndLog.error = jest.fn((...args) => {
				errorMessages.push(args);
			});
			
			// Mock ClientRequest.init to throw error
			ClientRequest.init = jest.fn(() => {
				throw new Error('Invalid validations');
			});
			
			// Call init with validations
			const result = AppConfig.init({ validations: { invalid: true } });
			
			// Verify init() returns true (no synchronous error)
			expect(result).toBe(true);
			
			// Verify promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify error was logged
			expect(DebugAndLog.error).toHaveBeenCalled();
			const errorMessage = errorMessages[0][0];
			expect(errorMessage).toContain('ClientRequest initialization failed');
		});
		
		it('should handle invalid responses data that throws error', async () => {
			const errorMessages = [];
			DebugAndLog.error = jest.fn((...args) => {
				errorMessages.push(args);
			});
			
			// Mock Response.init to throw error
			Response.init = jest.fn(() => {
				throw new Error('Invalid responses');
			});
			
			// Call init with responses
			const result = AppConfig.init({ responses: { invalid: true } });
			
			// Verify init() returns true (no synchronous error)
			expect(result).toBe(true);
			
			// Verify promise registered
			expect(AppConfig._promises).toHaveLength(1);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify error was logged
			expect(DebugAndLog.error).toHaveBeenCalled();
			const errorMessage = errorMessages[0][0];
			expect(errorMessage).toContain('Response initialization failed');
		});
		
		it('should allow other operations to continue when one fails', async () => {
			const errorMessages = [];
			DebugAndLog.error = jest.fn((...args) => {
				errorMessages.push(args);
			});
			
			const testSettings = { dataLimit: 1000 };
			
			// Mock ClientRequest.init to throw error
			ClientRequest.init = jest.fn(() => {
				throw new Error('Invalid validations');
			});
			
			// Call init with settings and validations
			const result = AppConfig.init({
				settings: testSettings,
				validations: { invalid: true }
			});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify 2 promises registered
			expect(AppConfig._promises).toHaveLength(2);
			
			// Wait for all promises to resolve
			await AppConfig.promise();
			
			// Verify settings initialized successfully
			expect(AppConfig._settings).toEqual(testSettings);
			
			// Verify error was logged for validations
			expect(DebugAndLog.error).toHaveBeenCalled();
		});
		
		it('should ensure promises still resolve (never reject)', async () => {
			// Mock ClientRequest.init to throw error
			ClientRequest.init = jest.fn(() => {
				throw new Error('Test error');
			});
			
			// Call init with validations
			AppConfig.init({ validations: { invalid: true } });
			
			// Wait for promise - should not reject
			await expect(AppConfig.promise()).resolves.toBeDefined();
		});
	});
	
	describe('2.5 Synchronous error handling', () => {
		it('should return false on synchronous error', () => {
			// Force a synchronous error by making options.settings throw during access
			const badOptions = {};
			Object.defineProperty(badOptions, 'settings', {
				get() {
					throw new Error('Synchronous error');
				}
			});
			
			const errorMessages = [];
			DebugAndLog.error = jest.fn((...args) => {
				errorMessages.push(args);
			});
			
			// Call init with bad options
			const result = AppConfig.init(badOptions);
			
			// Verify init() returns false
			expect(result).toBe(false);
			
			// Verify error was logged
			expect(DebugAndLog.error).toHaveBeenCalled();
			const errorMessage = errorMessages[0][0];
			expect(errorMessage).toContain('Could not initialize Config');
		});
	});
	
	describe('2.6 Debug logging', () => {
		it('should log "Config Init in debug mode" first', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
			});
			
			const testSettings = { dataLimit: 1000 };
			
			// Call init with debug=true
			AppConfig.init({ settings: testSettings, debug: true });
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify first debug message
			expect(debugMessages[0][0]).toBe('Config Init in debug mode');
		});
		
		it('should log initialization messages after promise() resolves', async () => {
			const debugMessages = [];
			const debugTimestamps = [];
			
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
				debugTimestamps.push(Date.now());
			});
			
			const testSettings = { dataLimit: 1000 };
			
			// Call init with debug=true
			const initTime = Date.now();
			AppConfig.init({ settings: testSettings, debug: true });
			
			// Verify "Config Init in debug mode" appears immediately
			expect(debugMessages.length).toBeGreaterThan(0);
			expect(debugMessages[0][0]).toBe('Config Init in debug mode');
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify "Settings initialized" appears after promise resolves
			const settingsMessage = debugMessages.find(args => args[0] === 'Settings initialized');
			expect(settingsMessage).toBeDefined();
		});
		
		it('should include correct data in debug messages', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args);
			});
			
			const testSettings = { dataLimit: 1000, cacheTTL: 300 };
			
			// Call init with debug=true
			AppConfig.init({ settings: testSettings, debug: true });
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Find settings debug message
			const settingsMessage = debugMessages.find(args => args[0] === 'Settings initialized');
			expect(settingsMessage).toBeDefined();
			expect(settingsMessage[1]).toEqual(testSettings);
		});
		
		it('should verify message order is correct', async () => {
			const debugMessages = [];
			DebugAndLog.debug = jest.fn((...args) => {
				debugMessages.push(args[0]);
			});
			
			const testSettings = { dataLimit: 1000 };
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api'
				}
			};
			
			// Call init with debug=true
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				debug: true
			});
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Verify message order
			expect(debugMessages[0]).toBe('Config Init in debug mode');
			
			// Settings and Connections messages should appear after, in any order
			const laterMessages = debugMessages.slice(1);
			expect(laterMessages).toContain('Settings initialized');
			expect(laterMessages).toContain('Connections initialized');
		});
	});
	
	describe('2.7 Synchronous return behavior', () => {
		it('should return immediately without waiting', () => {
			const testSettings = { dataLimit: 1000 };
			
			const startTime = Date.now();
			const result = AppConfig.init({ settings: testSettings });
			const endTime = Date.now();
			
			// Verify return is immediate (< 10ms)
			const duration = endTime - startTime;
			expect(duration).toBeLessThan(10);
			
			// Verify return value is boolean
			expect(typeof result).toBe('boolean');
			expect(result).toBe(true);
		});
		
		it('should return before promises resolve', async () => {
			let promiseResolved = false;
			
			// Mock _initParameters to add delay
			AppConfig._initParameters = jest.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 50));
				promiseResolved = true;
				return { app: { param1: 'value1' } };
			});
			
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['param1']
				}
			];
			
			// Call init
			const result = AppConfig.init({ ssmParameters: testSSMParams });
			
			// Verify init() returned before promise resolved
			expect(result).toBe(true);
			expect(promiseResolved).toBe(false);
			
			// Wait for promise to resolve
			await AppConfig.promise();
			
			// Now promise should be resolved
			expect(promiseResolved).toBe(true);
		});
	});
	
	describe('2.8 Selective initialization', () => {
		it('should initialize only settings+connections', async () => {
			const testSettings = { dataLimit: 1000 };
			const testConnections = {
				myConnection: {
					method: 'GET',
					host: 'example.com',
					path: '/api'
				}
			};
			
			// Call init with settings and connections
			const result = AppConfig.init({
				settings: testSettings,
				connections: testConnections
			});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify 2 promises registered
			expect(AppConfig._promises).toHaveLength(2);
			
			// Wait for promises to resolve
			await AppConfig.promise();
			
			// Verify only provided options are initialized
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
		
		it('should initialize only validations+responses', async () => {
			const testValidations = { paramValidations: [] };
			const testResponses = { settings: { errorExpirationInSeconds: 60 } };
			
			// Mock methods
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			// Call init with validations and responses
			const result = AppConfig.init({
				validations: testValidations,
				responses: testResponses
			});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify 2 promises registered
			expect(AppConfig._promises).toHaveLength(2);
			
			// Wait for promises to resolve
			await AppConfig.promise();
			
			// Verify only provided options are initialized
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
			expect(Response.init).toHaveBeenCalledWith(testResponses);
			expect(AppConfig._settings).toBeNull();
			expect(AppConfig._connections).toBeNull();
		});
		
		it('should initialize settings+validations+ssmParameters', async () => {
			const testSettings = { dataLimit: 1000 };
			const testValidations = { paramValidations: [] };
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['param1']
				}
			];
			
			// Mock methods
			ClientRequest.init = jest.fn();
			const mockInitParams = jest.fn().mockResolvedValue({ app: { param1: 'value1' } });
			AppConfig._initParameters = mockInitParams;
			
			// Call init with settings, validations, and ssmParameters
			const result = AppConfig.init({
				settings: testSettings,
				validations: testValidations,
				ssmParameters: testSSMParams
			});
			
			// Verify init() returns true
			expect(result).toBe(true);
			
			// Verify 3 promises registered
			expect(AppConfig._promises).toHaveLength(3);
			
			// Wait for promises to resolve
			await AppConfig.promise();
			
			// Verify only provided options are initialized
			expect(AppConfig._settings).toEqual(testSettings);
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
			expect(AppConfig._connections).toBeNull();
		});
		
		it('should verify promise count matches provided options', async () => {
			// Test with 1 option
			AppConfig._promises = [];
			AppConfig.init({ settings: { test: 1 } });
			expect(AppConfig._promises).toHaveLength(1);
			await AppConfig.promise();
			
			// Test with 2 options
			AppConfig._promises = [];
			AppConfig.init({
				settings: { test: 1 },
				connections: { conn1: { method: 'GET', host: 'example.com', path: '/api' } }
			});
			expect(AppConfig._promises).toHaveLength(2);
			await AppConfig.promise();
			
			// Test with 3 options
			AppConfig._promises = [];
			ClientRequest.init = jest.fn();
			AppConfig.init({
				settings: { test: 1 },
				connections: { conn1: { method: 'GET', host: 'example.com', path: '/api' } },
				validations: { paramValidations: [] }
			});
			expect(AppConfig._promises).toHaveLength(3);
			await AppConfig.promise();
		});
	});
});
