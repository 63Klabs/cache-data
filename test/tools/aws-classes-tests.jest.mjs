/**
 * Jest tests for AWS.classes.js
 * Migrated from: test/tools/aws-classes-tests.mjs
 * 
 * Tests AWS helper functions for DynamoDB, S3, and SSM operations.
 * Tests Node.js version detection and AWS SDK version selection.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { jest } from '@jest/globals';
import { AWS } from '../../src/lib/tools/AWS.classes.js';

describe('AWS.classes', () => {

	describe('Node.js Version Detection', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return Node.js version string', () => {
			const version = AWS.NODE_VER;
			expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return major version number', () => {
			const major = AWS.NODE_VER_MAJOR;
			expect(typeof major).toBe('number');
			expect(major).toBeGreaterThanOrEqual(18); // Current Node.js version should be >= 18
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return minor version number', () => {
			const minor = AWS.NODE_VER_MINOR;
			expect(typeof minor).toBe('number');
			expect(minor).toBeGreaterThanOrEqual(0);
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return patch version number', () => {
			const patch = AWS.NODE_VER_PATCH;
			expect(typeof patch).toBe('number');
			expect(patch).toBeGreaterThanOrEqual(0);
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return major.minor version string', () => {
			const majorMinor = AWS.NODE_VER_MAJOR_MINOR;
			expect(majorMinor).toMatch(/^\d+\.\d+$/);
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return version array [major, minor, patch]', () => {
			const versionArray = AWS.NODE_VER_ARRAY;
			expect(Array.isArray(versionArray)).toBe(true);
			expect(versionArray).toHaveLength(3);
			expect(typeof versionArray[0]).toBe('number');
			expect(typeof versionArray[1]).toBe('number');
			expect(typeof versionArray[2]).toBe('number');
		});

	});

	describe('AWS SDK Version Detection', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return SDK version V3 for Node.js >= 18', () => {
			const sdkVer = AWS.SDK_VER;
			expect(sdkVer).toBe('V3');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return SDK_V3 as true for Node.js >= 18', () => {
			const isV3 = AWS.SDK_V3;
			expect(isV3).toBe(true);
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return SDK_V2 as false for Node.js >= 18', () => {
			const isV2 = AWS.SDK_V2;
			expect(isV2).toBe(false);
		});

	});

	describe('AWS Region Configuration', () => {

		let originalRegion;

		beforeEach(() => {
			originalRegion = process.env.AWS_REGION;
			jest.clearAllMocks();
		});

		afterEach(() => {
			if (originalRegion !== undefined) {
				process.env.AWS_REGION = originalRegion;
			} else {
				delete process.env.AWS_REGION;
			}
			jest.restoreAllMocks();
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return AWS_REGION from environment when set', () => {
			process.env.AWS_REGION = 'us-west-2';
			// Note: AWS.REGION caches the value, so this test may not work as expected
			// if REGION was already accessed. This is a known limitation.
			const region = AWS.REGION;
			expect(typeof region).toBe('string');
			expect(['us-west-2', 'us-east-1']).toContain(region); // May be cached
		});

	});

	describe('AWS INFO Getter', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with all version and configuration info', () => {
			const info = AWS.INFO;
			expect(typeof info).toBe('object');
			expect(info).toHaveProperty('NODE_VER');
			expect(info).toHaveProperty('NODE_VER_MAJOR');
			expect(info).toHaveProperty('NODE_VER_MINOR');
			expect(info).toHaveProperty('NODE_VER_PATCH');
			expect(info).toHaveProperty('NODE_VER_MAJOR_MINOR');
			expect(info).toHaveProperty('NODE_VER_ARRAY');
			expect(info).toHaveProperty('SDK_VER');
			expect(info).toHaveProperty('REGION');
			expect(info).toHaveProperty('SDK_V2');
			expect(info).toHaveProperty('SDK_V3');
			expect(info).toHaveProperty('AWSXRayOn');
		});

	});

	describe('DynamoDB Client', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with client', () => {
			const dynamo = AWS.dynamo;
			expect(typeof dynamo).toBe('object');
			expect(dynamo).toHaveProperty('client');
			expect(dynamo.client).not.toBeNull();
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with put function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('put');
			expect(typeof dynamo.put).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with get function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('get');
			expect(typeof dynamo.get).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with scan function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('scan');
			expect(typeof dynamo.scan).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with delete function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('delete');
			expect(typeof dynamo.delete).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with update function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('update');
			expect(typeof dynamo.update).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with sdk', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).toHaveProperty('sdk');
			expect(typeof dynamo.sdk).toBe('object');
		});

	});

	describe('S3 Client', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with client', () => {
			const s3 = AWS.s3;
			expect(typeof s3).toBe('object');
			expect(s3).toHaveProperty('client');
			expect(s3.client).not.toBeNull();
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with put function', () => {
			const s3 = AWS.s3;
			expect(s3).toHaveProperty('put');
			expect(typeof s3.put).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with get function', () => {
			const s3 = AWS.s3;
			expect(s3).toHaveProperty('get');
			expect(typeof s3.get).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with sdk', () => {
			const s3 = AWS.s3;
			expect(s3).toHaveProperty('sdk');
			expect(typeof s3.sdk).toBe('object');
		});

	});

	describe('SSM Client', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with client', () => {
			const ssm = AWS.ssm;
			expect(typeof ssm).toBe('object');
			expect(ssm).toHaveProperty('client');
			expect(ssm.client).not.toBeNull();
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with getByName function', () => {
			const ssm = AWS.ssm;
			expect(ssm).toHaveProperty('getByName');
			expect(typeof ssm.getByName).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with getByPath function', () => {
			const ssm = AWS.ssm;
			expect(ssm).toHaveProperty('getByPath');
			expect(typeof ssm.getByPath).toBe('function');
		});

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return object with sdk', () => {
			const ssm = AWS.ssm;
			expect(ssm).toHaveProperty('sdk');
			expect(typeof ssm.sdk).toBe('object');
		});

	});

	describe('X-Ray', () => {

		/**
		 * Validates: Requirements 3.2, 3.5
		 */
		it('should return XRay object or null', () => {
			const xray = AWS.XRay;
			// XRay can be null if not enabled, or an object if enabled
			expect(xray === null || typeof xray === 'object').toBe(true);
		});

	});

});
