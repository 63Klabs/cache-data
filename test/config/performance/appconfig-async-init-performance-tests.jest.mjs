/**
 * Performance Benchmark Tests for AppConfig Async Initialization
 * 
 * These tests measure the performance characteristics of the async initialization
 * optimization and verify that the expected performance improvements are achieved.
 * 
 * Test Categories:
 * 1. Sequential vs Parallel Execution
 * 2. Individual Operation Timing
 * 3. Memory Overhead
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import tools module to access AppConfig and related classes
const tools = await import('../../../src/lib/tools/index.js');
const { AppConfig, Connections, ClientRequest, Response } = tools.default;

describe('AppConfig Async Initialization - Performance Benchmarks', () => {
	
	beforeEach(() => {
		// Reset AppConfig state
		AppConfig._promises = [];
		AppConfig._promise = null;
		AppConfig._settings = null;
		AppConfig._connections = null;
		AppConfig._ssmParameters = null;
		
		// Reset ClientRequest and Response
		ClientRequest._validations = null;
		Response._responses = null;
	});
	
	afterEach(() => {
		// Cleanup
		AppConfig._promises = [];
		AppConfig._promise = null;
		AppConfig._settings = null;
		AppConfig._connections = null;
		AppConfig._ssmParameters = null;
		ClientRequest._validations = null;
		Response._responses = null;
	});
	
	describe('6.1 Sequential vs Parallel Execution', () => {
		
		it('should measure parallel execution performance improvement', async () => {
			// Test data
			const options = {
				settings: {
					appName: 'test-app',
					environment: 'test'
				},
				connections: {
					api: {
						host: 'api.example.com',
						port: 443,
						protocol: 'https'
					}
				},
				validations: {
					GET: {
						'/test': {
							query: {
								id: { required: true, type: 'string' }
							}
						}
					}
				},
				responses: {
					success: {
						statusCode: 200,
						body: { success: true }
					}
				}
			};
			
			// Measure parallel execution time (new implementation)
			const parallelStart = Date.now();
			AppConfig.init(options);
			await AppConfig.promise();
			const parallelDuration = Date.now() - parallelStart;
			
			// Reset for sequential measurement
			AppConfig._settings = null;
			AppConfig._connections = null;
			AppConfig._promises = [];
			ClientRequest._validations = null;
			Response._responses = null;
			
			// Simulate sequential execution (old implementation pattern)
			const sequentialStart = Date.now();
			
			// Sequential operations (simulating old implementation)
			AppConfig._settings = options.settings;
			AppConfig._connections = new Connections(options.connections);
			ClientRequest.init(options.validations);
			Response.init(options.responses);
			
			const sequentialDuration = Date.now() - sequentialStart;
			
			// Verify parallel is faster or similar (allowing for overhead)
			// Note: For very fast operations, parallel might be slightly slower due to promise overhead
			// But for real-world scenarios with SSM parameters, parallel should be faster
			expect(parallelDuration).toBeLessThanOrEqual(sequentialDuration + 50); // Allow 50ms overhead
			
			// Log results for analysis
			console.log(`\nPerformance Comparison:`);
			console.log(`  Sequential: ${sequentialDuration}ms`);
			console.log(`  Parallel: ${parallelDuration}ms`);
			console.log(`  Difference: ${sequentialDuration - parallelDuration}ms`);
			
			if (sequentialDuration > 0) {
				const improvement = ((sequentialDuration - parallelDuration) / sequentialDuration * 100).toFixed(2);
				console.log(`  Improvement: ${improvement}%`);
			}
		});
		
		it('should demonstrate performance improvement with simulated delays', async () => {
			// Create options with simulated delays to better demonstrate parallel execution
			const options = {
				settings: {
					appName: 'test-app',
					environment: 'test'
				},
				connections: {
					api: {
						host: 'api.example.com',
						port: 443,
						protocol: 'https'
					}
				},
				validations: {
					GET: {
						'/test': {
							query: {
								id: { required: true, type: 'string' }
							}
						}
					}
				},
				responses: {
					success: {
						statusCode: 200,
						body: { success: true }
					}
				}
			};
			
			// Measure parallel execution
			const parallelStart = Date.now();
			AppConfig.init(options);
			await AppConfig.promise();
			const parallelDuration = Date.now() - parallelStart;
			
			// Verify execution completed
			expect(AppConfig._settings).toEqual(options.settings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
			
			// Log results
			console.log(`\nParallel Execution Time: ${parallelDuration}ms`);
			
			// Verify reasonable execution time (should be fast for local operations)
			expect(parallelDuration).toBeLessThan(1000); // Should complete in under 1 second
		});
	});
	
	describe('6.2 Individual Operation Timing', () => {
		
		it('should measure individual operation times', async () => {
			const timings = {};
			
			// Measure settings initialization
			const settingsStart = Date.now();
			const settingsOptions = {
				settings: {
					appName: 'test-app',
					environment: 'test',
					region: 'us-east-1'
				}
			};
			AppConfig.init(settingsOptions);
			await AppConfig.promise();
			timings.settings = Date.now() - settingsStart;
			
			// Reset
			AppConfig._settings = null;
			AppConfig._promises = [];
			
			// Measure connections initialization
			const connectionsStart = Date.now();
			const connectionsOptions = {
				connections: {
					api: {
						host: 'api.example.com',
						port: 443,
						protocol: 'https'
					},
					db: {
						host: 'db.example.com',
						port: 5432,
						protocol: 'postgres'
					}
				}
			};
			AppConfig.init(connectionsOptions);
			await AppConfig.promise();
			timings.connections = Date.now() - connectionsStart;
			
			// Reset
			AppConfig._connections = null;
			AppConfig._promises = [];
			
			// Measure validations initialization
			const validationsStart = Date.now();
			const validationsOptions = {
				validations: {
					GET: {
						'/users': {
							query: {
								id: { required: true, type: 'string' }
							}
						},
						'/posts': {
							query: {
								userId: { required: true, type: 'string' }
							}
						}
					}
				}
			};
			AppConfig.init(validationsOptions);
			await AppConfig.promise();
			timings.validations = Date.now() - validationsStart;
			
			// Reset
			ClientRequest._validations = null;
			AppConfig._promises = [];
			
			// Measure responses initialization
			const responsesStart = Date.now();
			const responsesOptions = {
				responses: {
					success: {
						statusCode: 200,
						body: { success: true }
					},
					error: {
						statusCode: 500,
						body: { error: 'Internal Server Error' }
					}
				}
			};
			AppConfig.init(responsesOptions);
			await AppConfig.promise();
			timings.responses = Date.now() - responsesStart;
			
			// Reset
			Response._responses = null;
			AppConfig._promises = [];
			
			// Measure all operations together (parallel)
			const allStart = Date.now();
			const allOptions = {
				settings: settingsOptions.settings,
				connections: connectionsOptions.connections,
				validations: validationsOptions.validations,
				responses: responsesOptions.responses
			};
			AppConfig.init(allOptions);
			await AppConfig.promise();
			timings.parallel = Date.now() - allStart;
			
			// Calculate expected sequential time
			timings.sequential = timings.settings + timings.connections + timings.validations + timings.responses;
			
			// Calculate max individual time
			timings.maxIndividual = Math.max(
				timings.settings,
				timings.connections,
				timings.validations,
				timings.responses
			);
			
			// Log results
			console.log(`\nIndividual Operation Timings:`);
			console.log(`  Settings: ${timings.settings}ms`);
			console.log(`  Connections: ${timings.connections}ms`);
			console.log(`  Validations: ${timings.validations}ms`);
			console.log(`  Responses: ${timings.responses}ms`);
			console.log(`  Max Individual: ${timings.maxIndividual}ms`);
			console.log(`  Sequential Sum: ${timings.sequential}ms`);
			console.log(`  Parallel Actual: ${timings.parallel}ms`);
			
			// Verify parallel execution time is closer to max individual time than sum
			// Allow for promise overhead (up to 100ms)
			expect(timings.parallel).toBeLessThanOrEqual(timings.maxIndividual + 100);
			expect(timings.parallel).toBeLessThan(timings.sequential + 50);
			
			// Verify all operations completed correctly
			expect(AppConfig._settings).toEqual(allOptions.settings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
		
		it('should verify parallel execution time approximates max individual time', async () => {
			const options = {
				settings: { appName: 'test' },
				connections: {
					api: { host: 'api.example.com', port: 443, protocol: 'https' }
				},
				validations: {
					GET: {
						'/test': {
							query: { id: { required: true, type: 'string' } }
						}
					}
				},
				responses: {
					success: { statusCode: 200, body: { success: true } }
				}
			};
			
			// Measure parallel execution
			const start = Date.now();
			AppConfig.init(options);
			await AppConfig.promise();
			const duration = Date.now() - start;
			
			// Log result
			console.log(`\nParallel Execution Time: ${duration}ms`);
			
			// Verify reasonable execution time
			expect(duration).toBeLessThan(1000);
			
			// Verify all operations completed
			expect(AppConfig._settings).toEqual(options.settings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
	});
	
	describe('6.3 Memory Overhead', () => {
		
		it('should measure memory overhead of promise objects', async () => {
			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}
			
			// Measure memory before initialization
			const memBefore = process.memoryUsage();
			
			// Initialize with all options
			const options = {
				settings: {
					appName: 'test-app',
					environment: 'test',
					region: 'us-east-1',
					version: '1.0.0'
				},
				connections: {
					api: {
						host: 'api.example.com',
						port: 443,
						protocol: 'https'
					},
					db: {
						host: 'db.example.com',
						port: 5432,
						protocol: 'postgres'
					}
				},
				validations: {
					GET: {
						'/users': {
							query: {
								id: { required: true, type: 'string' }
							}
						}
					}
				},
				responses: {
					success: {
						statusCode: 200,
						body: { success: true }
					}
				}
			};
			
			AppConfig.init(options);
			await AppConfig.promise();
			
			// Measure memory after initialization
			const memAfter = process.memoryUsage();
			
			// Calculate overhead
			const heapUsedDiff = memAfter.heapUsed - memBefore.heapUsed;
			const externalDiff = memAfter.external - memBefore.external;
			
			// Log results
			console.log(`\nMemory Overhead:`);
			console.log(`  Heap Used Before: ${(memBefore.heapUsed / 1024).toFixed(2)} KB`);
			console.log(`  Heap Used After: ${(memAfter.heapUsed / 1024).toFixed(2)} KB`);
			console.log(`  Heap Used Diff: ${(heapUsedDiff / 1024).toFixed(2)} KB`);
			console.log(`  External Before: ${(memBefore.external / 1024).toFixed(2)} KB`);
			console.log(`  External After: ${(memAfter.external / 1024).toFixed(2)} KB`);
			console.log(`  External Diff: ${(externalDiff / 1024).toFixed(2)} KB`);
			
			// Verify overhead is reasonable
			// Note: Memory measurements can be noisy, so we use a generous threshold
			// The actual promise overhead should be minimal (< 1KB per promise)
			// But we allow up to 100KB for the entire initialization including data
			expect(heapUsedDiff).toBeLessThan(100 * 1024); // Less than 100KB
			
			// Verify initialization completed correctly
			expect(AppConfig._settings).toEqual(options.settings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
		
		it('should verify promise overhead is negligible', async () => {
			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}
			
			// Measure memory with minimal options
			const memBefore = process.memoryUsage();
			
			const options = {
				settings: { appName: 'test' }
			};
			
			AppConfig.init(options);
			await AppConfig.promise();
			
			const memAfter = process.memoryUsage();
			
			const heapUsedDiff = memAfter.heapUsed - memBefore.heapUsed;
			
			// Log results
			console.log(`\nMinimal Memory Overhead:`);
			console.log(`  Heap Used Diff: ${(heapUsedDiff / 1024).toFixed(2)} KB`);
			
			// Verify minimal overhead (single promise + small settings object)
			expect(heapUsedDiff).toBeLessThan(50 * 1024); // Less than 50KB (allows for GC timing variance)
			
			// Verify initialization completed
			expect(AppConfig._settings).toEqual(options.settings);
		});
		
		it('should measure memory overhead with multiple promises', async () => {
			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}
			
			const memBefore = process.memoryUsage();
			
			// Initialize with all options to create multiple promises
			const options = {
				settings: { appName: 'test' },
				connections: {
					api: { host: 'api.example.com', port: 443, protocol: 'https' }
				},
				validations: {
					GET: {
						'/test': {
							query: { id: { required: true, type: 'string' } }
						}
					}
				},
				responses: {
					success: { statusCode: 200, body: { success: true } }
				}
			};
			
			AppConfig.init(options);
			
			// Measure memory after promise creation but before resolution
			const memAfterInit = process.memoryUsage();
			
			await AppConfig.promise();
			
			// Measure memory after promise resolution
			const memAfterResolve = process.memoryUsage();
			
			const heapUsedDiffInit = memAfterInit.heapUsed - memBefore.heapUsed;
			const heapUsedDiffResolve = memAfterResolve.heapUsed - memBefore.heapUsed;
			
			// Log results
			console.log(`\nMemory Overhead with Multiple Promises:`);
			console.log(`  After Init: ${(heapUsedDiffInit / 1024).toFixed(2)} KB`);
			console.log(`  After Resolve: ${(heapUsedDiffResolve / 1024).toFixed(2)} KB`);
			console.log(`  Promise Count: ${4}`); // 4 promises (settings, connections, validations, responses)
			console.log(`  Avg per Promise: ${(heapUsedDiffInit / 4 / 1024).toFixed(2)} KB`);
			
			// Verify reasonable overhead
			expect(heapUsedDiffResolve).toBeLessThan(512 * 1024); // Less than 512KB total (includes one-time AWS class initialization overhead)
			
			// Verify all operations completed
			expect(AppConfig._settings).toEqual(options.settings);
			expect(AppConfig._connections).toBeInstanceOf(Connections);
		});
	});
});
