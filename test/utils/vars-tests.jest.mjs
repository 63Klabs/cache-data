/**
 * Jest tests for vars module
 * 
 * Tests the Node.js version constants exported by the vars module.
 * These constants are derived from AWS.NODE_VER properties and should
 * match the current Node.js runtime version.
 * 
 * Requirements tested:
 * - 6.1: Test file creation
 * - 6.2: nodeVer exports valid version string in format "0.0.0"
 * - 6.3: nodeVerMajor exports integer representing major version
 * - 6.4: nodeVerMinor exports integer representing minor version
 * - 6.5: nodeVerMajorMinor exports string in format "0.0"
 * - 6.6: All exported values match AWS.NODE_VER properties
 */

import { describe, it, expect } from '@jest/globals';

// Import the vars module
const varsModule = await import('../../src/lib/tools/vars.js');
const { nodeVer, nodeVerMajor, nodeVerMinor, nodeVerMajorMinor } = varsModule;

// Import AWS class to verify consistency
const awsModule = await import('../../src/lib/tools/AWS.classes.js');
const { AWS } = awsModule;

describe('Vars Module', () => {
	describe('nodeVer', () => {
		it('should export valid version string in format "0.0.0"', () => {
			expect(typeof nodeVer).toBe('string');
			expect(nodeVer).toMatch(/^\d+\.\d+\.\d+$/);
		});

		it('should match AWS.NODE_VER', () => {
			expect(nodeVer).toBe(AWS.NODE_VER);
		});

		it('should match process.versions.node', () => {
			expect(nodeVer).toBe(process.versions.node);
		});
	});

	describe('nodeVerMajor', () => {
		it('should export integer representing major version', () => {
			expect(Number.isInteger(nodeVerMajor)).toBe(true);
			expect(nodeVerMajor).toBeGreaterThanOrEqual(16);
		});

		it('should match AWS.NODE_VER_MAJOR', () => {
			expect(nodeVerMajor).toBe(AWS.NODE_VER_MAJOR);
		});

		it('should match first part of process.versions.node', () => {
			const expectedMajor = parseInt(process.versions.node.split('.')[0], 10);
			expect(nodeVerMajor).toBe(expectedMajor);
		});
	});

	describe('nodeVerMinor', () => {
		it('should export integer representing minor version', () => {
			expect(Number.isInteger(nodeVerMinor)).toBe(true);
			expect(nodeVerMinor).toBeGreaterThanOrEqual(0);
		});

		it('should match AWS.NODE_VER_MINOR', () => {
			expect(nodeVerMinor).toBe(AWS.NODE_VER_MINOR);
		});

		it('should match second part of process.versions.node', () => {
			const expectedMinor = parseInt(process.versions.node.split('.')[1], 10);
			expect(nodeVerMinor).toBe(expectedMinor);
		});
	});

	describe('nodeVerMajorMinor', () => {
		it('should export string in format "0.0"', () => {
			expect(typeof nodeVerMajorMinor).toBe('string');
			expect(nodeVerMajorMinor).toMatch(/^\d+\.\d+$/);
		});

		it('should match AWS.NODE_VER_MAJOR_MINOR', () => {
			expect(nodeVerMajorMinor).toBe(AWS.NODE_VER_MAJOR_MINOR);
		});

		it('should be composed of nodeVerMajor and nodeVerMinor', () => {
			const expected = `${nodeVerMajor}.${nodeVerMinor}`;
			expect(nodeVerMajorMinor).toBe(expected);
		});

		it('should match first two parts of process.versions.node', () => {
			const parts = process.versions.node.split('.');
			const expected = `${parts[0]}.${parts[1]}`;
			expect(nodeVerMajorMinor).toBe(expected);
		});
	});

	describe('Version Consistency', () => {
		it('should have all exported values match AWS.NODE_VER properties', () => {
			expect(nodeVer).toBe(AWS.NODE_VER);
			expect(nodeVerMajor).toBe(AWS.NODE_VER_MAJOR);
			expect(nodeVerMinor).toBe(AWS.NODE_VER_MINOR);
			expect(nodeVerMajorMinor).toBe(AWS.NODE_VER_MAJOR_MINOR);
		});

		it('should have version values consistent with process.version', () => {
			// process.version includes 'v' prefix (e.g., 'v20.11.0')
			// process.versions.node does not include 'v' prefix (e.g., '20.11.0')
			const processVersion = process.version.substring(1); // Remove 'v' prefix
			expect(nodeVer).toBe(processVersion);
		});

		it('should have nodeVerMajor be at least 16', () => {
			// vars.js exits if Node version is below 16
			expect(nodeVerMajor).toBeGreaterThanOrEqual(16);
		});
	});

	describe('Type Validation', () => {
		it('should export nodeVer as string', () => {
			expect(typeof nodeVer).toBe('string');
		});

		it('should export nodeVerMajor as number', () => {
			expect(typeof nodeVerMajor).toBe('number');
		});

		it('should export nodeVerMinor as number', () => {
			expect(typeof nodeVerMinor).toBe('number');
		});

		it('should export nodeVerMajorMinor as string', () => {
			expect(typeof nodeVerMajorMinor).toBe('string');
		});
	});

	describe('Format Validation', () => {
		it('should have nodeVer in semantic version format', () => {
			const parts = nodeVer.split('.');
			expect(parts).toHaveLength(3);
			expect(parts.every(part => /^\d+$/.test(part))).toBe(true);
		});

		it('should have nodeVerMajorMinor with exactly one dot', () => {
			const dots = (nodeVerMajorMinor.match(/\./g) || []).length;
			expect(dots).toBe(1);
		});

		it('should have nodeVerMajorMinor parts be numeric', () => {
			const parts = nodeVerMajorMinor.split('.');
			expect(parts).toHaveLength(2);
			expect(parts.every(part => /^\d+$/.test(part))).toBe(true);
		});
	});
});
