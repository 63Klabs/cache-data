/**
 * Unit tests for Powertools test helpers.
 * Validates that mock-powertools and env-helper utilities work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
	createMockTracer,
	createMockLogger,
	createMockMetrics,
	createMockModules,
	ALL_AVAILABILITY_COMBINATIONS
} from '../helpers/mock-powertools.mjs';
import {
	saveEnv,
	restoreEnv,
	clearPowertoolsEnv,
	setEnvVars,
	createEnvContext,
	withEnv,
	withEnvAsync,
	POWERTOOLS_ENV_VARS
} from '../helpers/env-helper.mjs';

describe('Powertools Test Helpers', () => {

	describe('mock-powertools helper', () => {

		describe('createMockTracer()', () => {
			it('should return a Tracer class and mockTracer object', () => {
				const { Tracer, mockTracer } = createMockTracer();

				expect(Tracer).toBeDefined();
				expect(mockTracer).toBeDefined();
				expect(typeof Tracer).toBe('function');
			});

			it('should create instances with expected methods', () => {
				const { Tracer } = createMockTracer();
				const instance = new Tracer({ serviceName: 'test' });

				expect(instance.captureAWSv3Client).toBeDefined();
				expect(instance.getSegment).toBeDefined();
				expect(instance.setSegment).toBeDefined();
				expect(instance.isTracingEnabled).toBeDefined();
			});

			it('should return client unchanged from captureAWSv3Client', () => {
				const { Tracer } = createMockTracer();
				const instance = new Tracer();
				const mockClient = { send: () => {} };

				const result = instance.captureAWSv3Client(mockClient);
				expect(result).toBe(mockClient);
			});

			it('should return a subsegment from getSegment().addNewSubsegment()', () => {
				const { Tracer } = createMockTracer();
				const instance = new Tracer();
				const segment = instance.getSegment();
				const subsegment = segment.addNewSubsegment('test-subsegment');

				expect(subsegment).toBeDefined();
				expect(subsegment.name).toBe('test-subsegment');
				expect(typeof subsegment.close).toBe('function');
				expect(typeof subsegment.addError).toBe('function');
			});
		});

		describe('createMockLogger()', () => {
			it('should return a Logger class and mockLogger object', () => {
				const { Logger, mockLogger } = createMockLogger();

				expect(Logger).toBeDefined();
				expect(mockLogger).toBeDefined();
				expect(typeof Logger).toBe('function');
			});

			it('should create instances with all log level methods', () => {
				const { Logger } = createMockLogger();
				const instance = new Logger({ serviceName: 'test' });

				expect(typeof instance.error).toBe('function');
				expect(typeof instance.warn).toBe('function');
				expect(typeof instance.info).toBe('function');
				expect(typeof instance.debug).toBe('function');
			});

			it('should collect log entries', () => {
				const { Logger, logEntries } = createMockLogger();
				const instance = new Logger();

				instance.info('test message', { key: 'value' });
				instance.error('error message');

				expect(logEntries).toHaveLength(2);
				expect(logEntries[0].level).toBe('info');
				expect(logEntries[0].message).toBe('test message');
				expect(logEntries[1].level).toBe('error');
			});
		});

		describe('createMockMetrics()', () => {
			it('should return Metrics class, MetricUnit, and tracking arrays', () => {
				const { Metrics, MetricUnit, mockMetrics, emittedMetrics } = createMockMetrics();

				expect(Metrics).toBeDefined();
				expect(MetricUnit).toBeDefined();
				expect(mockMetrics).toBeDefined();
				expect(emittedMetrics).toBeDefined();
				expect(Array.isArray(emittedMetrics)).toBe(true);
			});

			it('should provide standard MetricUnit values', () => {
				const { MetricUnit } = createMockMetrics();

				expect(MetricUnit.Count).toBe('Count');
				expect(MetricUnit.Milliseconds).toBe('Milliseconds');
				expect(MetricUnit.Seconds).toBe('Seconds');
				expect(MetricUnit.Bytes).toBe('Bytes');
			});

			it('should track emitted metrics', () => {
				const { Metrics, MetricUnit, emittedMetrics } = createMockMetrics();
				const instance = new Metrics({ namespace: 'TestNamespace' });

				instance.addMetric('CacheHit', MetricUnit.Count, 1);
				instance.addDimension('operation', 'cache-read');

				expect(emittedMetrics).toHaveLength(2);
				expect(emittedMetrics[0]).toEqual({ name: 'CacheHit', unit: 'Count', value: 1 });
				expect(emittedMetrics[1]).toEqual({ dimension: 'operation', value: 'cache-read' });
			});
		});

		describe('createMockModules()', () => {
			it('should create all modules when all are available', () => {
				const modules = createMockModules({ tracer: true, logger: true, metrics: true });

				expect(modules["@aws-lambda-powertools/tracer"]).toBeDefined();
				expect(modules["@aws-lambda-powertools/tracer"].Tracer).toBeDefined();
				expect(modules["@aws-lambda-powertools/logger"]).toBeDefined();
				expect(modules["@aws-lambda-powertools/logger"].Logger).toBeDefined();
				expect(modules["@aws-lambda-powertools/metrics"]).toBeDefined();
				expect(modules["@aws-lambda-powertools/metrics"].Metrics).toBeDefined();
				expect(modules["@aws-lambda-powertools/metrics"].MetricUnit).toBeDefined();
			});

			it('should omit modules when not available', () => {
				const modules = createMockModules({ tracer: false, logger: true, metrics: false });

				expect(modules["@aws-lambda-powertools/tracer"]).toBeUndefined();
				expect(modules["@aws-lambda-powertools/logger"]).toBeDefined();
				expect(modules["@aws-lambda-powertools/metrics"]).toBeUndefined();
			});

			it('should create no modules when none are available', () => {
				const modules = createMockModules({ tracer: false, logger: false, metrics: false });

				expect(Object.keys(modules)).toHaveLength(0);
			});
		});

		describe('ALL_AVAILABILITY_COMBINATIONS', () => {
			it('should contain exactly 8 combinations', () => {
				expect(ALL_AVAILABILITY_COMBINATIONS).toHaveLength(8);
			});

			it('should cover all boolean combinations of 3 packages', () => {
				const asStrings = ALL_AVAILABILITY_COMBINATIONS.map(
					c => `${c.tracer}-${c.logger}-${c.metrics}`
				);
				const unique = new Set(asStrings);
				expect(unique.size).toBe(8);
			});
		});
	});

	describe('env-helper', () => {
		let envSnapshot;

		beforeEach(() => {
			envSnapshot = saveEnv();
		});

		afterEach(() => {
			restoreEnv(envSnapshot);
		});

		describe('saveEnv() and restoreEnv()', () => {
			it('should save and restore environment variables', () => {
				process.env.CACHE_DATA_POWERTOOLS = 'true';
				const snapshot = saveEnv();

				process.env.CACHE_DATA_POWERTOOLS = 'false';
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('false');

				restoreEnv(snapshot);
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('true');
			});

			it('should restore undefined variables by deleting them', () => {
				delete process.env.CACHE_DATA_POWERTOOLS;
				const snapshot = saveEnv();

				process.env.CACHE_DATA_POWERTOOLS = 'true';
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('true');

				restoreEnv(snapshot);
				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
			});
		});

		describe('clearPowertoolsEnv()', () => {
			it('should clear all Powertools environment variables', () => {
				process.env.CACHE_DATA_POWERTOOLS = 'true';
				process.env.CACHE_DATA_POWERTOOLS_TRACER = 'false';
				process.env.POWERTOOLS_SERVICE_NAME = 'test-service';

				clearPowertoolsEnv();

				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
				expect(process.env.CACHE_DATA_POWERTOOLS_TRACER).toBeUndefined();
				expect(process.env.POWERTOOLS_SERVICE_NAME).toBeUndefined();
			});
		});

		describe('setEnvVars()', () => {
			it('should set multiple environment variables', () => {
				setEnvVars({
					CACHE_DATA_POWERTOOLS: 'true',
					CACHE_DATA_POWERTOOLS_TRACER: 'false'
				});

				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('true');
				expect(process.env.CACHE_DATA_POWERTOOLS_TRACER).toBe('false');
			});

			it('should delete variables set to undefined or null', () => {
				process.env.CACHE_DATA_POWERTOOLS = 'true';
				process.env.CACHE_DATA_POWERTOOLS_TRACER = 'true';

				setEnvVars({
					CACHE_DATA_POWERTOOLS: undefined,
					CACHE_DATA_POWERTOOLS_TRACER: null
				});

				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
				expect(process.env.CACHE_DATA_POWERTOOLS_TRACER).toBeUndefined();
			});
		});

		describe('createEnvContext()', () => {
			it('should save, clear, and restore environment', () => {
				process.env.CACHE_DATA_POWERTOOLS = 'original';
				const ctx = createEnvContext();

				ctx.setup();
				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();

				ctx.set({ CACHE_DATA_POWERTOOLS: 'modified' });
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('modified');

				ctx.teardown();
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('original');
			});

			it('should support clear() within context', () => {
				const ctx = createEnvContext();
				ctx.setup();

				ctx.set({ CACHE_DATA_POWERTOOLS: 'true' });
				expect(process.env.CACHE_DATA_POWERTOOLS).toBe('true');

				ctx.clear();
				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();

				ctx.teardown();
			});
		});

		describe('withEnv()', () => {
			it('should set env vars during function execution and restore after', () => {
				delete process.env.CACHE_DATA_POWERTOOLS;

				const result = withEnv(
					{ CACHE_DATA_POWERTOOLS: 'true' },
					() => process.env.CACHE_DATA_POWERTOOLS
				);

				expect(result).toBe('true');
				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
			});

			it('should restore env vars even if function throws', () => {
				delete process.env.CACHE_DATA_POWERTOOLS;

				expect(() => {
					withEnv(
						{ CACHE_DATA_POWERTOOLS: 'true' },
						() => { throw new Error('test error'); }
					);
				}).toThrow('test error');

				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
			});
		});

		describe('withEnvAsync()', () => {
			it('should set env vars during async function execution and restore after', async () => {
				delete process.env.CACHE_DATA_POWERTOOLS;

				const result = await withEnvAsync(
					{ CACHE_DATA_POWERTOOLS: 'true' },
					async () => process.env.CACHE_DATA_POWERTOOLS
				);

				expect(result).toBe('true');
				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
			});

			it('should restore env vars even if async function rejects', async () => {
				delete process.env.CACHE_DATA_POWERTOOLS;

				await expect(
					withEnvAsync(
						{ CACHE_DATA_POWERTOOLS: 'true' },
						async () => { throw new Error('async error'); }
					)
				).rejects.toThrow('async error');

				expect(process.env.CACHE_DATA_POWERTOOLS).toBeUndefined();
			});
		});

		describe('POWERTOOLS_ENV_VARS', () => {
			it('should contain all expected environment variable names', () => {
				expect(POWERTOOLS_ENV_VARS).toContain('CACHE_DATA_POWERTOOLS');
				expect(POWERTOOLS_ENV_VARS).toContain('CACHE_DATA_POWERTOOLS_TRACER');
				expect(POWERTOOLS_ENV_VARS).toContain('CACHE_DATA_POWERTOOLS_LOGGER');
				expect(POWERTOOLS_ENV_VARS).toContain('CACHE_DATA_POWERTOOLS_METRICS');
				expect(POWERTOOLS_ENV_VARS).toContain('POWERTOOLS_SERVICE_NAME');
				expect(POWERTOOLS_ENV_VARS).toContain('POWERTOOLS_METRICS_NAMESPACE');
				expect(POWERTOOLS_ENV_VARS).toContain('CacheData_AWSXRayOn');
				expect(POWERTOOLS_ENV_VARS).toContain('CACHE_DATA_AWS_X_RAY_ON');
				expect(POWERTOOLS_ENV_VARS).toContain('_X_AMZN_TRACE_ID');
			});
		});
	});
});
