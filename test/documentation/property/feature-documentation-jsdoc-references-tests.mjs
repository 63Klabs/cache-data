import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * Feature Documentation JSDoc References Property-Based Tests
 * Feature: documentation-enhancement
 * Property 14: Feature Documentation JSDoc References
 * Validates: Requirements 6.6
 */

/**
 * Get all feature documentation files
 * @returns {Array<{name: string, path: string}>} List of feature documentation files
 */
function getFeatureDocumentationFiles() {
	const featuresDir = path.join(__dirname, '../../../docs/features');
	const features = [];
	
	// Get subdirectories in features/
	const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
	
	for (const entry of entries) {
		if (entry.isDirectory()) {
			const readmePath = path.join(featuresDir, entry.name, 'README.md');
			if (fs.existsSync(readmePath)) {
				features.push({
					name: entry.name,
					path: readmePath
				});
			}
		}
	}
	
	return features;
}

/**
 * Check if documentation has JSDoc references
 * @param {string} docPath Path to documentation file
 * @returns {boolean} True if documentation references JSDoc
 */
function hasJSDocReferences(docPath) {
	const content = fs.readFileSync(docPath, 'utf-8');
	
	// Look for various patterns that indicate JSDoc references
	const patterns = [
		/jsdoc/i,
		/api reference/i,
		/see.*src\//i,
		/refer.*source/i,
		/detailed.*api/i,
		/@param/i,
		/@returns/i,
		/method signatures/i,
		/complete.*documentation/i,
	];
	
	for (const pattern of patterns) {
		if (pattern.test(content)) {
			return true;
		}
	}
	
	return false;
}

/**
 * Check if documentation has an API Reference section
 * @param {string} docPath Path to documentation file
 * @returns {boolean} True if documentation has API Reference section
 */
function hasAPIReferenceSection(docPath) {
	const content = fs.readFileSync(docPath, 'utf-8');
	
	// Look for API Reference section headings
	const patterns = [
		/##\s+API\s+Reference/i,
		/##\s+Reference/i,
		/##\s+API\s+Documentation/i,
		/###\s+API\s+Reference/i,
	];
	
	for (const pattern of patterns) {
		if (pattern.test(content)) {
			return true;
		}
	}
	
	return false;
}

/**
 * Check if documentation mentions source files
 * @param {string} docPath Path to documentation file
 * @param {string} moduleName Module name (cache, endpoint, tools)
 * @returns {boolean} True if documentation mentions relevant source files
 */
function mentionsSourceFiles(docPath, moduleName) {
	const content = fs.readFileSync(docPath, 'utf-8');
	
	// Expected source file patterns for each module
	const sourcePatterns = {
		cache: [
			/src\/lib\/dao-cache\.js/i,
			/dao-cache/i,
		],
		endpoint: [
			/src\/lib\/dao-endpoint\.js/i,
			/dao-endpoint/i,
		],
		tools: [
			/src\/lib\/tools/i,
			/Timer\.class\.js/i,
			/DebugAndLog\.class\.js/i,
			/Response\.class\.js/i,
		]
	};
	
	const patterns = sourcePatterns[moduleName] || [];
	
	for (const pattern of patterns) {
		if (pattern.test(content)) {
			return true;
		}
	}
	
	return false;
}

/**
 * Count JSDoc-related references in documentation
 * @param {string} docPath Path to documentation file
 * @returns {number} Number of JSDoc references found
 */
function countJSDocReferences(docPath) {
	const content = fs.readFileSync(docPath, 'utf-8');
	let count = 0;
	
	// Count various types of references
	const patterns = [
		/see.*jsdoc/gi,
		/refer.*jsdoc/gi,
		/jsdoc.*comment/gi,
		/api.*reference/gi,
		/source.*code/gi,
		/src\/lib\//gi,
	];
	
	for (const pattern of patterns) {
		const matches = content.match(pattern);
		if (matches) {
			count += matches.length;
		}
	}
	
	return count;
}

describe('Feature Documentation JSDoc References Property Tests', function() {
	this.timeout(10000);

	// Feature: documentation-enhancement, Property 14: Feature Documentation JSDoc References
	it('Property 14: For any feature documented in features directory, documentation SHALL include references to JSDoc', function() {
		const features = getFeatureDocumentationFiles();
		
		fc.assert(
			fc.property(
				fc.constantFrom(...features),
				(feature) => {
					const hasReferences = hasJSDocReferences(feature.path);
					
					if (!hasReferences) {
						console.log(`\nFeature ${feature.name} documentation lacks JSDoc references`);
					}
					
					return hasReferences;
				}
			),
			{ numRuns: features.length }
		);
	});

	// Feature: documentation-enhancement, Property 14: Feature Documentation JSDoc References (API Reference Section)
	it('Property 14: For any feature documentation, it SHALL have an API Reference section', function() {
		const features = getFeatureDocumentationFiles();
		
		fc.assert(
			fc.property(
				fc.constantFrom(...features),
				(feature) => {
					const hasSection = hasAPIReferenceSection(feature.path);
					
					if (!hasSection) {
						console.log(`\nFeature ${feature.name} documentation lacks API Reference section`);
					}
					
					return hasSection;
				}
			),
			{ numRuns: features.length }
		);
	});

	// Feature: documentation-enhancement, Property 14: Feature Documentation JSDoc References (Source Files)
	it('Property 14: For any feature documentation, it SHALL mention relevant source files', function() {
		const features = getFeatureDocumentationFiles();
		
		fc.assert(
			fc.property(
				fc.constantFrom(...features),
				(feature) => {
					const mentionsSources = mentionsSourceFiles(feature.path, feature.name);
					
					if (!mentionsSources) {
						console.log(`\nFeature ${feature.name} documentation doesn't mention source files`);
					}
					
					return mentionsSources;
				}
			),
			{ numRuns: features.length }
		);
	});

	// Feature: documentation-enhancement, Property 14: Feature Documentation JSDoc References (Multiple References)
	it('Property 14: For any feature documentation, it SHALL have multiple JSDoc references', function() {
		const features = getFeatureDocumentationFiles();
		
		fc.assert(
			fc.property(
				fc.constantFrom(...features),
				(feature) => {
					const refCount = countJSDocReferences(feature.path);
					
					// We expect at least 2 references to JSDoc/source code
					const threshold = 2;
					
					if (refCount < threshold) {
						console.log(`\nFeature ${feature.name} has only ${refCount} JSDoc references (expected >= ${threshold})`);
					}
					
					return refCount >= threshold;
				}
			),
			{ numRuns: features.length }
		);
	});
});
