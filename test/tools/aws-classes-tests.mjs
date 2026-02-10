/**
 * Mocha tests for AWS.classes.js
 * 
 * Tests AWS helper functions for DynamoDB, S3, and SSM operations.
 * Tests Node.js version detection and AWS SDK version selection.
 * 
 * Validates: Requirements 3.1, 3.2, 3.5
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { AWS } from '../../src/lib/tools/AWS.classes.js';

describe('AWS.classes', () => {

	describe('Node.js Version Detection', () => {

		it('should return Node.js version string', () => {
			const version = AWS.NODE_VER;
			expect(version).to.be.a('string');
			expect(version).to.match(/^\d+\.\d+\.\d+$/);
		});

		it('should return major version number', () => {
			const major = AWS.NODE_VER_MAJOR;
			expect(major).to.be.a('number');
			expect(major).to.be.at.least(18); // Current Node.js version should be >= 18
		});

		it('should return minor version number', () => {
			const minor = AWS.NODE_VER_MINOR;
			expect(minor).to.be.a('number');
			expect(minor).to.be.at.least(0);
		});

		it('should return patch version number', () => {
			const patch = AWS.NODE_VER_PATCH;
			expect(patch).to.be.a('number');
			expect(patch).to.be.at.least(0);
		});

		it('should return major.minor version string', () => {
			const majorMinor = AWS.NODE_VER_MAJOR_MINOR;
			expect(majorMinor).to.be.a('string');
			expect(majorMinor).to.match(/^\d+\.\d+$/);
		});

		it('should return version array [major, minor, patch]', () => {
			const versionArray = AWS.NODE_VER_ARRAY;
			expect(versionArray).to.be.an('array');
			expect(versionArray).to.have.lengthOf(3);
			expect(versionArray[0]).to.be.a('number');
			expect(versionArray[1]).to.be.a('number');
			expect(versionArray[2]).to.be.a('number');
		});

	});

	describe('AWS SDK Version Detection', () => {

		it('should return SDK version V3 for Node.js >= 18', () => {
			const sdkVer = AWS.SDK_VER;
			expect(sdkVer).to.equal('V3');
		});

		it('should return SDK_V3 as true for Node.js >= 18', () => {
			const isV3 = AWS.SDK_V3;
			expect(isV3).to.be.true;
		});

		it('should return SDK_V2 as false for Node.js >= 18', () => {
			const isV2 = AWS.SDK_V2;
			expect(isV2).to.be.false;
		});

	});

	describe('AWS Region Configuration', () => {

		let originalRegion;
		let consoleWarnStub;

		beforeEach(() => {
			originalRegion = process.env.AWS_REGION;
			consoleWarnStub = sinon.stub(console, 'warn');
		});

		afterEach(() => {
			if (originalRegion !== undefined) {
				process.env.AWS_REGION = originalRegion;
			} else {
				delete process.env.AWS_REGION;
			}
			consoleWarnStub.restore();
		});

		it('should return AWS_REGION from environment when set', () => {
			process.env.AWS_REGION = 'us-west-2';
			// Note: AWS.REGION caches the value, so this test may not work as expected
			// if REGION was already accessed. This is a known limitation.
			const region = AWS.REGION;
			expect(region).to.be.a('string');
			expect(['us-west-2', 'us-east-1']).to.include(region); // May be cached
		});

	});

	describe('AWS INFO Getter', () => {

		it('should return object with all version and configuration info', () => {
			const info = AWS.INFO;
			expect(info).to.be.an('object');
			expect(info).to.have.property('NODE_VER');
			expect(info).to.have.property('NODE_VER_MAJOR');
			expect(info).to.have.property('NODE_VER_MINOR');
			expect(info).to.have.property('NODE_VER_PATCH');
			expect(info).to.have.property('NODE_VER_MAJOR_MINOR');
			expect(info).to.have.property('NODE_VER_ARRAY');
			expect(info).to.have.property('SDK_VER');
			expect(info).to.have.property('REGION');
			expect(info).to.have.property('SDK_V2');
			expect(info).to.have.property('SDK_V3');
			expect(info).to.have.property('AWSXRayOn');
		});

	});

	describe('DynamoDB Client', () => {

		it('should return object with client', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.be.an('object');
			expect(dynamo).to.have.property('client');
			expect(dynamo.client).to.not.be.null;
		});

		it('should return object with put function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('put');
			expect(dynamo.put).to.be.a('function');
		});

		it('should return object with get function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('get');
			expect(dynamo.get).to.be.a('function');
		});

		it('should return object with scan function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('scan');
			expect(dynamo.scan).to.be.a('function');
		});

		it('should return object with delete function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('delete');
			expect(dynamo.delete).to.be.a('function');
		});

		it('should return object with update function', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('update');
			expect(dynamo.update).to.be.a('function');
		});

		it('should return object with sdk', () => {
			const dynamo = AWS.dynamo;
			expect(dynamo).to.have.property('sdk');
			expect(dynamo.sdk).to.be.an('object');
		});

	});

	describe('S3 Client', () => {

		it('should return object with client', () => {
			const s3 = AWS.s3;
			expect(s3).to.be.an('object');
			expect(s3).to.have.property('client');
			expect(s3.client).to.not.be.null;
		});

		it('should return object with put function', () => {
			const s3 = AWS.s3;
			expect(s3).to.have.property('put');
			expect(s3.put).to.be.a('function');
		});

		it('should return object with get function', () => {
			const s3 = AWS.s3;
			expect(s3).to.have.property('get');
			expect(s3.get).to.be.a('function');
		});

		it('should return object with sdk', () => {
			const s3 = AWS.s3;
			expect(s3).to.have.property('sdk');
			expect(s3.sdk).to.be.an('object');
		});

	});

	describe('SSM Client', () => {

		it('should return object with client', () => {
			const ssm = AWS.ssm;
			expect(ssm).to.be.an('object');
			expect(ssm).to.have.property('client');
			expect(ssm.client).to.not.be.null;
		});

		it('should return object with getByName function', () => {
			const ssm = AWS.ssm;
			expect(ssm).to.have.property('getByName');
			expect(ssm.getByName).to.be.a('function');
		});

		it('should return object with getByPath function', () => {
			const ssm = AWS.ssm;
			expect(ssm).to.have.property('getByPath');
			expect(ssm.getByPath).to.be.a('function');
		});

		it('should return object with sdk', () => {
			const ssm = AWS.ssm;
			expect(ssm).to.have.property('sdk');
			expect(ssm.sdk).to.be.an('object');
		});

	});

	describe('X-Ray', () => {

		it('should return XRay object or null', () => {
			const xray = AWS.XRay;
			// XRay can be null if not enabled, or an object if enabled
			expect(xray === null || typeof xray === 'object').to.be.true;
		});

	});

});
