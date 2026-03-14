import { describe, it, expect, beforeAll } from '@jest/globals';
import { nodeVer, nodeVerMajor, AWS } from '../src/lib/tools/index.js';

describe('Package Exports and Environment', () => {
	let consoleOutput = [];
	
	beforeAll(() => {
		// Capture console output for verification
		console.log(`Testing Against Node version ${nodeVerMajor} (${nodeVer})`);
		
		if (nodeVerMajor < 16) {
			console.log("Node version is too low, skipping tests");
		}
		if (nodeVerMajor < 18) {
			console.warn("Lambda running Node v16 or less will use AWS-SDK v2. Upgrade your Lambda function to use Node v18 or higher so that AWS-SDK v3 may be used. @63klabs/cache-data will still work under Node 16/AWS-SDK v2, but you will receive warnings about upgrading AWS-SDK to v3");
		}
		
		console.log(`Node ${AWS.NODE_VER} MAJOR ${AWS.NODE_VER_MAJOR} MINOR ${AWS.NODE_VER_MINOR} PATCH ${AWS.NODE_VER_PATCH} MAJOR MINOR ${AWS.NODE_VER_MAJOR_MINOR} SDK ${AWS.SDK_VER} REGION ${AWS.REGION} V2 ${AWS.SDK_V2} V3 ${AWS.SDK_V3}`, AWS.nodeVersionArray);
		console.log(`AWS.INFO`, AWS.INFO);
	});
	
	describe('Node Version Exports', () => {
		it('should export nodeVer as a string', () => {
			expect(typeof nodeVer).toBe('string');
			expect(nodeVer).toBeTruthy();
		});
		
		it('should export nodeVerMajor as a number', () => {
			expect(typeof nodeVerMajor).toBe('number');
			expect(nodeVerMajor).toBeGreaterThanOrEqual(16);
		});
		
		it('should have nodeVerMajor matching process.version', () => {
			const expectedMajor = parseInt(process.version.slice(1).split('.')[0]);
			expect(nodeVerMajor).toBe(expectedMajor);
		});
	});
	
	describe('AWS Exports', () => {
		it('should export AWS class', () => {
			expect(AWS).toBeDefined();
			expect(typeof AWS).toBe('function');
		});
		
		it('should have NODE_VER property', () => {
			expect(AWS.NODE_VER).toBeDefined();
			expect(typeof AWS.NODE_VER).toBe('string');
		});
		
		it('should have NODE_VER_MAJOR property', () => {
			expect(AWS.NODE_VER_MAJOR).toBeDefined();
			expect(typeof AWS.NODE_VER_MAJOR).toBe('number');
			expect(AWS.NODE_VER_MAJOR).toBeGreaterThanOrEqual(16);
		});
		
		it('should have NODE_VER_MINOR property', () => {
			expect(AWS.NODE_VER_MINOR).toBeDefined();
			expect(typeof AWS.NODE_VER_MINOR).toBe('number');
			expect(AWS.NODE_VER_MINOR).toBeGreaterThanOrEqual(0);
		});
		
		it('should have NODE_VER_PATCH property', () => {
			expect(AWS.NODE_VER_PATCH).toBeDefined();
			expect(typeof AWS.NODE_VER_PATCH).toBe('number');
			expect(AWS.NODE_VER_PATCH).toBeGreaterThanOrEqual(0);
		});
		
		it('should have NODE_VER_MAJOR_MINOR property', () => {
			expect(AWS.NODE_VER_MAJOR_MINOR).toBeDefined();
			expect(typeof AWS.NODE_VER_MAJOR_MINOR).toBe('string');
			expect(AWS.NODE_VER_MAJOR_MINOR).toMatch(/^\d+\.\d+$/);
		});
		
		it('should have SDK_VER property', () => {
			expect(AWS.SDK_VER).toBeDefined();
			expect(typeof AWS.SDK_VER).toBe('string');
			expect(['V2', 'V3']).toContain(AWS.SDK_VER);
		});
		
		it('should have REGION property', () => {
			expect(AWS.REGION).toBeDefined();
			expect(typeof AWS.REGION).toBe('string');
		});
		
		it('should have SDK_V2 boolean property', () => {
			expect(typeof AWS.SDK_V2).toBe('boolean');
		});
		
		it('should have SDK_V3 boolean property', () => {
			expect(typeof AWS.SDK_V3).toBe('boolean');
		});
		
		it('should have exactly one SDK version active', () => {
			expect(AWS.SDK_V2 || AWS.SDK_V3).toBe(true);
			expect(AWS.SDK_V2 && AWS.SDK_V3).toBe(false);
		});
		
		it('should have nodeVersionArray property', () => {
			expect(AWS.nodeVersionArray).toBeDefined();
			expect(Array.isArray(AWS.nodeVersionArray)).toBe(true);
			expect(AWS.nodeVersionArray.length).toBeGreaterThanOrEqual(3);
		});
		
		it('should have INFO property', () => {
			expect(AWS.INFO).toBeDefined();
			expect(typeof AWS.INFO).toBe('object');
		});
	});
	
	describe('Package Entry Point', () => {
		it('should successfully import from main entry point', async () => {
			const mainExports = await import('../src/index.js');
			expect(mainExports).toBeDefined();
		});
		
		it('should export tools module', async () => {
			const mainExports = await import('../src/index.js');
			expect(mainExports.tools).toBeDefined();
			expect(typeof mainExports.tools).toBe('object');
		});
		
		it('should export cache module', async () => {
			const mainExports = await import('../src/index.js');
			expect(mainExports.cache).toBeDefined();
			expect(typeof mainExports.cache).toBe('object');
		});
		
		it('should export endpoint module', async () => {
			const mainExports = await import('../src/index.js');
			expect(mainExports.endpoint).toBeDefined();
			expect(typeof mainExports.endpoint).toBe('object');
		});
	});
});
