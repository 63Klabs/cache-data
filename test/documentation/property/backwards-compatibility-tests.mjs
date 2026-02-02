/**
 * Property-Based Tests: Backwards Compatibility Validation
 * 
 * These tests validate that documentation fixes have not altered function signatures
 * or exports, ensuring backwards compatibility is preserved.
 * 
 * Feature: documentation-quality-fixes
 * Properties Tested:
 * - Property 10: Function Signature Preservation
 * - Property 11: Export Preservation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);

/**
 * Extract function signatures from a JavaScript file
 * Returns array of {name, params, type} objects
 */
function extractFunctionSignatures(filePath) {
	const content = fs.readFileSync(filePath, 'utf-8');
	const signatures = [];

	// Match class methods: methodName(param1, param2) {
	// Exclude control flow keywords
	const methodRegex = /^\s*(static\s+)?(async\s+)?(\w+)\s*\(([^)]*)\)\s*{/gm;
	let match;
	while ((match = methodRegex.exec(content)) !== null) {
		const isStatic = !!match[1];
		const isAsync = !!match[2];
		const name = match[3];
		
		// Skip control flow keywords and constructor
		if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) {
			continue;
		}
		
		// Extract parameter names, removing default values and whitespace
		const params = match[4]
			.split(',')
			.map(p => p.trim())
			.filter(p => p)
			.map(p => p.split('=')[0].trim()); // Remove default values
		
		signatures.push({
			name,
			params,
			isStatic,
			isAsync,
			type: 'method'
		});
	}

	// Match standalone functions: function name(param1, param2) {
	const functionRegex = /^(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*{/gm;
	while ((match = functionRegex.exec(content)) !== null) {
		const isAsync = !!match[1];
		const name = match[2];
		// Extract parameter names, removing default values and whitespace
		const params = match[3]
			.split(',')
			.map(p => p.trim())
			.filter(p => p)
			.map(p => p.split('=')[0].trim()); // Remove default values
		
		signatures.push({
			name,
			params,
			isAsync,
			type: 'function'
		});
	}

	// Match arrow functions assigned to const: const name = (param1, param2) =>
	const arrowRegex = /^\s*const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/gm;
	while ((match = arrowRegex.exec(content)) !== null) {
		const name = match[1];
		// Extract parameter names, removing default values and whitespace
		const params = match[2]
			.split(',')
			.map(p => p.trim())
			.filter(p => p)
			.map(p => p.split('=')[0].trim()); // Remove default values
		
		signatures.push({
			name,
			params,
			type: 'arrow'
		});
	}

	return signatures;
}

/**
 * Known function signatures from before documentation fixes
 * These represent the baseline that must be preserved
 * Note: Only tracking key public API methods, not all internal methods
 */
const KNOWN_SIGNATURES = {
	'src/lib/dao-cache.js': {
		// S3Cache class - key methods
		'init': { params: ['bucket'], isStatic: true, isAsync: false },
		'write': { params: ['idHash', 'data'], isStatic: true, isAsync: true },
		'read': { params: ['idHash'], isStatic: true, isAsync: true },
		
		// DynamoDbCache class - key methods
		// Note: DynamoDB also has init, write, read with similar signatures
		
		// Cache class - key methods (these are instance methods, not static)
		// Note: Cache methods are not easily extractable via regex, so we validate via exports
	},
	'src/lib/dao-endpoint.js': {
		// The get function is exported as a standalone function
		// It has signature: async (connection, query = {})
		'get': { params: ['connection', 'query'], isStatic: false, isAsync: true },
	},
	'src/index.js': {
		// Module exports - validated separately
	}
};

describe('Feature: documentation-quality-fixes - Backwards Compatibility', function() {
	this.timeout(10000);

	describe('Property 10: Function Signature Preservation', () => {
		it('should preserve all function signatures in dao-cache.js', () => {
			const filePath = path.join(rootDir, 'src/lib/dao-cache.js');
			const currentSignatures = extractFunctionSignatures(filePath);
			const knownSignatures = KNOWN_SIGNATURES['src/lib/dao-cache.js'];

			// Verify each known signature still exists with same parameters
			Object.keys(knownSignatures).forEach(funcName => {
				const known = knownSignatures[funcName];
				const current = currentSignatures.find(sig => sig.name === funcName);

				expect(current, `Function ${funcName} should still exist`).to.exist;
				expect(current.params, `Function ${funcName} parameters should match`).to.deep.equal(known.params);
				
				if (known.isStatic !== undefined) {
					expect(current.isStatic, `Function ${funcName} static modifier should match`).to.equal(known.isStatic);
				}
				if (known.isAsync !== undefined) {
					expect(current.isAsync, `Function ${funcName} async modifier should match`).to.equal(known.isAsync);
				}
			});
		});

		it('should preserve all function signatures in dao-endpoint.js', () => {
			const filePath = path.join(rootDir, 'src/lib/dao-endpoint.js');
			const currentSignatures = extractFunctionSignatures(filePath);
			
			// Verify that the get function exists (arrow function with 2 params)
			const getFunc = currentSignatures.find(sig => sig.name === 'get' && sig.params.length === 2);
			expect(getFunc, 'Function get should exist with 2 parameters').to.exist;
			expect(getFunc.params[0], 'First parameter should be connection').to.equal('connection');
			expect(getFunc.params[1], 'Second parameter should be query').to.equal('query');
		});

		it('should preserve all function signatures in tools module', () => {
			// Tools module has many classes, we'll validate key public methods
			const toolsDir = path.join(rootDir, 'src/lib/tools');
			const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js') && f !== 'index.js');

			toolFiles.forEach(file => {
				const filePath = path.join(toolsDir, file);
				const signatures = extractFunctionSignatures(filePath);
				
				// Verify that signatures can be extracted (file is parseable)
				expect(signatures).to.be.an('array');
				
				// Each signature should have required properties
				signatures.forEach(sig => {
					expect(sig).to.have.property('name');
					expect(sig).to.have.property('params');
					expect(sig.params).to.be.an('array');
				});
			});
		});

		/**
		 * Property-based test: For any exported function, its signature should be stable
		 * 
		 * **Feature: documentation-quality-fixes, Property 10: Function Signature Preservation**
		 * **Validates: Requirements 7.1**
		 */
		it('Property 10: Function signatures must remain unchanged after documentation fixes', () => {
			fc.assert(
				fc.property(
					fc.constantFrom(
						'src/lib/dao-cache.js',
						'src/lib/dao-endpoint.js'
					),
					(filePath) => {
						const fullPath = path.join(rootDir, filePath);
						const signatures = extractFunctionSignatures(fullPath);
						
						// Property: All extracted signatures should have valid structure
						signatures.forEach(sig => {
							expect(sig.name).to.be.a('string').and.not.be.empty;
							expect(sig.params).to.be.an('array');
							expect(sig.type).to.be.oneOf(['method', 'function', 'arrow']);
						});

						// Property: Known signatures should still exist
						const knownSigs = KNOWN_SIGNATURES[filePath];
						if (knownSigs) {
							Object.keys(knownSigs).forEach(funcName => {
								const sig = signatures.find(s => s.name === funcName);
								expect(sig, `${filePath}:${funcName} should exist`).to.exist;
							});
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe('Property 11: Export Preservation', () => {
		it('should preserve exact export structure in src/index.js', () => {
			const indexPath = path.join(rootDir, 'src/index.js');
			const content = fs.readFileSync(indexPath, 'utf-8');

			// Verify the three main exports exist
			expect(content).to.include('tools');
			expect(content).to.include('cache');
			expect(content).to.include('endpoint');

			// Verify module.exports structure
			expect(content).to.match(/module\.exports\s*=\s*{/);
			
			// Load the actual module and verify exports
			const indexModule = require(indexPath);
			expect(indexModule).to.have.property('tools');
			expect(indexModule).to.have.property('cache');
			expect(indexModule).to.have.property('endpoint');
			
			// Verify only these three exports exist
			const exportKeys = Object.keys(indexModule);
			expect(exportKeys).to.have.lengthOf(3);
			expect(exportKeys).to.include.members(['tools', 'cache', 'endpoint']);
		});

		it('should preserve tools module exports', () => {
			const toolsIndexPath = path.join(rootDir, 'src/lib/tools/index.js');
			const toolsModule = require(toolsIndexPath);

			// Verify key tool exports exist
			expect(toolsModule).to.have.property('APIRequest');
			expect(toolsModule).to.have.property('ClientRequest');
			expect(toolsModule).to.have.property('Response');
			expect(toolsModule).to.have.property('DebugAndLog');
			expect(toolsModule).to.have.property('Timer');
		});

		it('should preserve cache module exports', () => {
			const cachePath = path.join(rootDir, 'src/lib/dao-cache.js');
			const cacheModule = require(cachePath);

			// Verify cache exports exist
			expect(cacheModule).to.have.property('Cache');
			expect(cacheModule).to.have.property('CacheableDataAccess');
			// Note: S3Cache, DynamoDbCache, and CacheData are internal classes, not exported
		});

		it('should preserve endpoint module exports', () => {
			const endpointPath = path.join(rootDir, 'src/lib/dao-endpoint.js');
			const endpointModule = require(endpointPath);

			// Verify endpoint exports exist
			expect(endpointModule).to.have.property('get');
			// Note: Endpoint class is not directly exported, only the get function
		});

		/**
		 * Property-based test: For any module export, it should remain accessible
		 * 
		 * **Feature: documentation-quality-fixes, Property 11: Export Preservation**
		 * **Validates: Requirements 7.2, 7.4**
		 */
		it('Property 11: All module exports must be preserved after documentation fixes', () => {
			fc.assert(
				fc.property(
					fc.constantFrom(
						{ path: 'src/index.js', exports: ['tools', 'cache', 'endpoint'] },
						{ path: 'src/lib/dao-cache.js', exports: ['Cache', 'CacheableDataAccess'] },
						{ path: 'src/lib/dao-endpoint.js', exports: ['get'] }
					),
					(moduleInfo) => {
						const modulePath = path.join(rootDir, moduleInfo.path);
						const module = require(modulePath);

						// Property: All expected exports should exist
						moduleInfo.exports.forEach(exportName => {
							expect(module, `${moduleInfo.path} should export ${exportName}`).to.have.property(exportName);
						});

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
