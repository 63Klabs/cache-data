/**
 * Integration tests for AppConfig async initialization
 * Feature: appconfig-async-init-optimization
 * 
 * Tests real-world scenarios including:
 * - Lambda cold start simulation
 * - SSM parameters with other operations
 * - Full application initialization
 * - Backwards compatibility
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Import tools module to access AppConfig and related classes
const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, DebugAndLog, Connections, ClientRequest, Response } = tools.default;

describe('AppConfig Async Initialization - Integration Tests', () => {
	
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

	describe('5.1 Lambda cold start simulation', () => {
		it('should initialize all components in parallel during cold start', async () => {
			// Simulate Lambda cold start with all initialization options
			const testSettings = {
				dataLimit: 1000,
				cacheTTL: 300,
				region: 'us-east-1'
			};
			
			const testConnections = [
				{
					name: 'apiConnection',
					method: 'GET',
					host: 'api.example.com',
					path: '/v1/data'
				},
				{
					name: 'dbConnection',
					method: 'POST',
					host: 'db.example.com',
					path: '/query'
				}
			];
			
			const testValidations = {
				paramValidations: [
					{
						parameterNames: ['userId'],
						validate: (userId) => /^[0-9]+$/.test(userId)
					}
				]
			};
			
			const testResponses = {
				settings: {
					errorExpirationInSeconds: 60,
					routeExpirationInSeconds: 300
				}
			};
			
			const testSSMParams = [
				{
					group: 'app',
					path: '/test/params/',
					names: ['apiKey', 'dbPassword']
				}
			];
			
			// Mock methods to track execution
			const executionTimes = {};
			const executionOrder = [];
			
			ClientRequest.init = jest.fn(() => {
				executionOrder.push('ClientRequest.init');
				executionTimes.validations = Date.now();
			});
			
			Response.init = jest.fn(() => {
				executionOrder.push('Response.init');
				executionTimes.responses = Date.now();
			});
			
			const mockInitParams = jest.fn().mockImplementation(async () => {
				executionOrder.push('_initParameters');
				executionTimes.ssmParameters = Date.now();
				// Simulate SSM API call delay
				await new Promise(resolve => setTimeout(resolve, 50));
				return { app: { apiKey: 'test-key', dbPassword: 'test-pass' } };
			});
			AppConfig._initParameters = mockInitParams;
			
			// Measure initialization time
			const startTime = Date.now();
			
			// Call init() - should return immediately
			const result = AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: testValidations,
				responses: testResponses,
				ssmParameters: testSSMParams
			});
			
			const initReturnTime = Date.now();
			
			// Verify init() returned immediately (< 10ms)
			expect(initReturnTime - startTime).toBeLessThan(10);
			expect(result).toBe(true);
			
			// Wait for all initialization to complete
			await AppConfig.promise();
			
			const totalTime = Date.now() - startTime;
			
			// Verify all components initialized
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
			expect(Response.init).toHaveBeenCalledWith(testResponses);
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
			
			// Verify parallel execution improved performance
			// Total time should be close to the longest operation (SSM ~50ms)
			// not the sum of all operations
			expect(totalTime).toBeLessThan(100); // Should be much less than sequential
			
			// Verify all operations executed
			expect(executionOrder).toContain('ClientRequest.init');
			expect(executionOrder).toContain('Response.init');
			expect(executionOrder).toContain('_initParameters');
		});

		it('should verify parallel execution improves performance vs sequential', async () => {
			// Create operations with measurable delays
			const testSettings = { dataLimit: 1000 };
			const testConnections = [
				{ name: 'conn1', method: 'GET', host: 'example.com', path: '/api' }
			];
			
			// Mock operations with delays to simulate real work
			ClientRequest.init = jest.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 30));
			});
			
			Response.init = jest.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 30));
			});
			
			const mockInitParams = jest.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 30));
				return { app: { param1: 'value1' } };
			});
			AppConfig._initParameters = mockInitParams;
			
			// Measure parallel execution time
			const parallelStart = Date.now();
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} },
				ssmParameters: [{ group: 'app', path: '/test/', names: ['param1'] }]
			});
			await AppConfig.promise();
			const parallelTime = Date.now() - parallelStart;
			
			// Parallel execution should take approximately the time of the longest operation
			expect(parallelTime).toBeLessThan(80);
			
			// Sequential execution would take sum of all operations (~150ms)
			const estimatedSequentialTime = 30 + 30 + 30 + 30 + 30; // 150ms
			expect(parallelTime).toBeLessThan(estimatedSequentialTime * 0.6); // At least 40% faster
		});
		
		it('should verify all components work correctly after initialization', async () => {
			const testSettings = { dataLimit: 1000, cacheTTL: 300 };
			const testConnections = [
				{ name: 'apiConnection', method: 'GET', host: 'api.example.com', path: '/v1/users' }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: { errorExpirationInSeconds: 60 } }
			});
			
			await AppConfig.promise();
			
			// Verify components are usable
			expect(AppConfig.settings()).toEqual(testSettings);
			expect(AppConfig.connections()).toBeInstanceOf(Connections);
			expect(AppConfig.getConnection('apiConnection')).toBeDefined();
			expect(AppConfig.getConn('apiConnection')).toBeDefined();
			
			// Verify connection object is returned
			const conn = AppConfig.getConnection('apiConnection');
			expect(conn).not.toBeNull();
			expect(conn.toObject()).toBeDefined();
		});
	});
	
	describe('5.2 SSM parameters with other operations', () => {
		it('should load SSM parameters in parallel with other operations', async () => {
			const testSettings = { dataLimit: 1000 };
			const testConnections = [
				{ name: 'conn1', method: 'GET', host: 'example.com', path: '/api' }
			];
			
			const testSSMParams = [
				{ group: 'app', path: '/test/params/', names: ['apiKey', 'dbHost', 'dbPassword'] },
				{ group: 'cache', path: '/test/cache/', names: ['ttl', 'maxSize'] }
			];
			
			// Track execution order and timing
			const executionLog = [];
			
			const mockInitParams = jest.fn().mockImplementation(async (params) => {
				executionLog.push({ operation: 'SSM_start', time: Date.now() });
				await new Promise(resolve => setTimeout(resolve, 60));
				executionLog.push({ operation: 'SSM_end', time: Date.now() });
				return {
					app: { apiKey: 'test-key', dbHost: 'db.example.com', dbPassword: 'test-pass' },
					cache: { ttl: '300', maxSize: '1000' }
				};
			});
			AppConfig._initParameters = mockInitParams;
			
			ClientRequest.init = jest.fn().mockImplementation(async () => {
				executionLog.push({ operation: 'ClientRequest_start', time: Date.now() });
				await new Promise(resolve => setTimeout(resolve, 20));
				executionLog.push({ operation: 'ClientRequest_end', time: Date.now() });
			});
			
			Response.init = jest.fn().mockImplementation(async () => {
				executionLog.push({ operation: 'Response_start', time: Date.now() });
				await new Promise(resolve => setTimeout(resolve, 20));
				executionLog.push({ operation: 'Response_end', time: Date.now() });
			});
			
			const startTime = Date.now();
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} },
				ssmParameters: testSSMParams
			});
			
			await AppConfig.promise();
			const totalTime = Date.now() - startTime;
			
			// Verify SSM parameters loaded correctly
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
			expect(AppConfig._ssmParameters).toBeDefined();
			
			// Verify other operations completed
			expect(ClientRequest.init).toHaveBeenCalled();
			expect(Response.init).toHaveBeenCalled();
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			
			// Verify parallel execution
			expect(totalTime).toBeLessThan(100);
			
			// Verify operations overlapped
			const ssmStart = executionLog.find(e => e.operation === 'SSM_start');
			const ssmEnd = executionLog.find(e => e.operation === 'SSM_end');
			const clientStart = executionLog.find(e => e.operation === 'ClientRequest_start');
			const responseStart = executionLog.find(e => e.operation === 'Response_start');
			
			if (clientStart && ssmEnd) {
				expect(clientStart.time).toBeLessThan(ssmEnd.time);
			}
			if (responseStart && ssmEnd) {
				expect(responseStart.time).toBeLessThan(ssmEnd.time);
			}
		});
		
		it('should verify no race conditions between SSM and other operations', async () => {
			const testSettings = { dataLimit: 1000 };
			const testConnections = [
				{ name: 'conn1', method: 'GET', host: 'example.com', path: '/api' }
			];
			
			const stateChanges = [];
			
			const mockInitParams = jest.fn().mockImplementation(async () => {
				stateChanges.push({ operation: 'SSM', state: 'start' });
				await new Promise(resolve => setTimeout(resolve, 30));
				stateChanges.push({ operation: 'SSM', state: 'end' });
				return { app: { key: 'value' } };
			});
			AppConfig._initParameters = mockInitParams;
			
			ClientRequest.init = jest.fn().mockImplementation(async () => {
				stateChanges.push({ operation: 'ClientRequest', state: 'start' });
				await new Promise(resolve => setTimeout(resolve, 20));
				stateChanges.push({ operation: 'ClientRequest', state: 'end' });
			});
			
			Response.init = jest.fn().mockImplementation(async () => {
				stateChanges.push({ operation: 'Response', state: 'start' });
				await new Promise(resolve => setTimeout(resolve, 20));
				stateChanges.push({ operation: 'Response', state: 'end' });
			});
			
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} },
				ssmParameters: [{ group: 'app', path: '/test/', names: ['key'] }]
			});
			
			await AppConfig.promise();
			
			// Verify all operations completed
			expect(stateChanges.filter(s => s.state === 'end')).toHaveLength(3);
			
			// Verify final state is consistent
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			expect(ClientRequest.init).toHaveBeenCalled();
			expect(Response.init).toHaveBeenCalled();
			expect(mockInitParams).toHaveBeenCalled();
		});
	});

	describe('5.3 Full application initialization', () => {
		it('should complete full initialization flow with all options', async () => {
			const testSettings = {
				dataLimit: 1000,
				cacheTTL: 300,
				region: 'us-east-1',
				environment: 'production'
			};
			
			const testConnections = [
				{ name: 'apiConnection', method: 'GET', host: 'api.example.com', path: '/v1/users' },
				{ name: 'dbConnection', method: 'POST', host: 'db.example.com', path: '/query' },
				{ name: 'cacheConnection', method: 'GET', host: 'cache.example.com', path: '/get' }
			];
			
			const testValidations = {
				paramValidations: [
					{ parameterNames: ['userId'], validate: (userId) => /^[0-9]+$/.test(userId) },
					{ parameterNames: ['email'], validate: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }
				]
			};
			
			const testResponses = {
				settings: {
					errorExpirationInSeconds: 60,
					routeExpirationInSeconds: 300,
					defaultCacheControl: 'public, max-age=300'
				}
			};
			
			const testSSMParams = [
				{ group: 'app', path: '/prod/app/', names: ['apiKey', 'secretKey'] },
				{ group: 'database', path: '/prod/db/', names: ['host', 'port', 'username', 'password'] }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			const mockInitParams = jest.fn().mockResolvedValue({
				app: { apiKey: 'prod-api-key', secretKey: 'prod-secret' },
				database: { host: 'db.prod.com', port: '5432', username: 'admin', password: 'secure' }
			});
			AppConfig._initParameters = mockInitParams;
			
			const result = AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: testValidations,
				responses: testResponses,
				ssmParameters: testSSMParams
			});
			
			expect(result).toBe(true);
			await AppConfig.promise();
			
			// Verify all components initialized correctly
			expect(AppConfig._settings).toEqual(testSettings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			expect(ClientRequest.init).toHaveBeenCalledWith(testValidations);
			expect(Response.init).toHaveBeenCalledWith(testResponses);
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
		});
		
		it('should verify application can use initialized configuration', async () => {
			const testSettings = { dataLimit: 1000, cacheTTL: 300 };
			const testConnections = [
				{ name: 'userApi', method: 'GET', host: 'api.example.com', path: '/v1/users' },
				{ name: 'orderApi', method: 'POST', host: 'api.example.com', path: '/v1/orders' }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} }
			});
			
			await AppConfig.promise();
			
			// Test getter methods work correctly
			const settings = AppConfig.settings();
			expect(settings).toEqual(testSettings);
			expect(settings.dataLimit).toBe(1000);
			expect(settings.cacheTTL).toBe(300);
			
			const connections = AppConfig.connections();
			expect(connections).toBeInstanceOf(Connections);
			
			// Test getConnection method
			const userApiConn = AppConfig.getConnection('userApi');
			expect(userApiConn).toBeDefined();
			expect(userApiConn).not.toBeNull();
			
			const orderApiConn = AppConfig.getConnection('orderApi');
			expect(orderApiConn).toBeDefined();
			expect(orderApiConn).not.toBeNull();
			
			// Test getConn method (alias) - returns toObject() format
			const userApiConnAlias = AppConfig.getConn('userApi');
			expect(userApiConnAlias).toEqual(userApiConn.toObject());
			
			// Test getConnCacheProfile method
			const cacheProfile = AppConfig.getConnCacheProfile('userApi');
			expect(cacheProfile).toBeDefined();
		});
	});
	
	describe('5.4 Backwards compatibility', () => {
		it('should maintain existing usage pattern: init() followed by promise()', async () => {
			const testSettings = { dataLimit: 1000, cacheTTL: 300 };
			const testConnections = [
				{ name: 'apiConnection', method: 'GET', host: 'api.example.com', path: '/v1/data' }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			// Existing usage pattern
			const initResult = AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} }
			});
			
			expect(initResult).toBe(true);
			await AppConfig.promise();
			
			// Verify configuration is accessible
			expect(AppConfig.settings()).toEqual(testSettings);
			expect(AppConfig.connections()).toBeInstanceOf(Connections);
			expect(AppConfig.getConnection('apiConnection')).toBeDefined();
		});
		
		it('should handle production usage pattern with SSM parameters', async () => {
			const testSettings = { environment: 'production', region: 'us-east-1' };
			const testConnections = [
				{ name: 'apiConnection', method: 'GET', host: 'api.prod.example.com', path: '/v1/data' }
			];
			
			const testSSMParams = [
				{ group: 'app', path: '/prod/app/', names: ['apiKey', 'secretKey'] }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			const mockInitParams = jest.fn().mockResolvedValue({
				app: { apiKey: 'prod-key', secretKey: 'prod-secret' }
			});
			AppConfig._initParameters = mockInitParams;
			
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} },
				ssmParameters: testSSMParams
			});
			
			await AppConfig.promise();
			
			// Application can now use configuration
			const settings = AppConfig.settings();
			expect(settings.environment).toBe('production');
			
			const conn = AppConfig.getConnection('apiConnection');
			expect(conn).not.toBeNull();
			
			// SSM parameters loaded
			expect(mockInitParams).toHaveBeenCalledWith(testSSMParams);
		});
		
		it('should verify no breaking changes in API behavior', async () => {
			const testSettings = { dataLimit: 1000 };
			const testConnections = [
				{ name: 'conn1', method: 'GET', host: 'example.com', path: '/api' },
				{ name: 'conn2', method: 'POST', host: 'example.com', path: '/data' }
			];
			
			ClientRequest.init = jest.fn();
			Response.init = jest.fn();
			
			AppConfig.init({
				settings: testSettings,
				connections: testConnections,
				validations: { paramValidations: [] },
				responses: { settings: {} }
			});
			
			await AppConfig.promise();
			
			// Test all getter methods
			expect(AppConfig.settings()).toEqual(testSettings);
			expect(AppConfig.connections()).toBeInstanceOf(Connections);
			expect(AppConfig.getConnection('conn1')).toBeDefined();
			expect(AppConfig.getConnection('conn2')).toBeDefined();
			expect(AppConfig.getConn('conn1')).toBeDefined();
			expect(AppConfig.getConnCacheProfile('conn1')).toBeDefined();
			
			// Verify connections are not null
			const conn1 = AppConfig.getConnection('conn1');
			const conn2 = AppConfig.getConnection('conn2');
			expect(conn1).not.toBeNull();
			expect(conn2).not.toBeNull();
		});
		
		it('should handle edge case: partial initialization', async () => {
			const testSettings = { dataLimit: 1000 };
			
			AppConfig.init({ settings: testSettings });
			await AppConfig.promise();
			
			// Settings should be available
			expect(AppConfig.settings()).toEqual(testSettings);
			
			// Other components should be null
			expect(AppConfig._connections).toBeNull();
		});
		
		it('should handle edge case: calling promise() multiple times', async () => {
			const testSettings = { dataLimit: 1000 };
			
			ClientRequest.init = jest.fn();
			
			AppConfig.init({
				settings: testSettings,
				validations: { paramValidations: [] }
			});
			
			// Call promise() multiple times
			const promise1 = AppConfig.promise();
			const promise2 = AppConfig.promise();
			const promise3 = AppConfig.promise();
			
			// All should resolve successfully
			await expect(promise1).resolves.toBeDefined();
			await expect(promise2).resolves.toBeDefined();
			await expect(promise3).resolves.toBeDefined();
			
			// Configuration should be accessible
			expect(AppConfig.settings()).toEqual(testSettings);
		});
	});
});
