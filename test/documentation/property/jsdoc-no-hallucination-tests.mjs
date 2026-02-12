import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// >! Import secure JSDoc parsing functions to prevent string escaping vulnerabilities
import { parseParamTag } from '../../helpers/jsdoc-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * JSDoc No Hallucinated Documentation Property-Based Tests
 * Feature: documentation-enhancement
 * Property 5: No Hallucinated Documentation
 * Validates: Requirements 2.4
 */

/**
 * Parse JSDoc comment block and extract tags
 * @param {string} jsdocComment The JSDoc comment block
 * @returns {Object} Parsed JSDoc with description and tags
 */
function parseJSDoc(jsdocComment) {
	const lines = jsdocComment.split('\n').map(line => line.trim());
	const result = {
		description: '',
		params: [],
		returns: null,
		examples: [],
		throws: []
	};

	let currentTag = null;
	let descriptionLines = [];

	for (const line of lines) {
		// Skip comment markers
		const cleanLine = line.replace(/^\/\*\*|\*\/$/g, '').replace(/^\*\s?/, '').trim();
		
		if (!cleanLine) continue;

		// >! Use secure bracket counting for @param parsing
		if (cleanLine.startsWith('@param')) {
			const paramData = parseParamTag(cleanLine);
			if (paramData) {
				result.params.push({ type: paramData.type, name: paramData.name });
			}
			currentTag = 'param';
		} else if (cleanLine.startsWith('@returns')) {
			currentTag = 'returns';
		} else if (cleanLine.startsWith('@example')) {
			currentTag = 'example';
		} else if (cleanLine.startsWith('@throws')) {
			currentTag = 'throws';
		} else if (cleanLine.startsWith('@deprecated')) {
			currentTag = 'deprecated';
		} else if (!cleanLine.startsWith('@')) {
			// Description or continuation of current tag
			if (currentTag === null) {
				descriptionLines.push(cleanLine);
			}
		}
	}

	result.description = descriptionLines.join(' ').trim();
	return result;
}

/**
 * Extract function signature from code
 * @param {string} code The function code
 * @returns {Object|null} Function signature with name and parameters
 */
function extractFunctionSignature(code) {
	// Match various function patterns
	const patterns = [
		/(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)/,  // static/async method
		/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/,  // function expression
		/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/  // arrow function
	];

	for (const pattern of patterns) {
		const match = code.match(pattern);
		if (match) {
			const name = match[1];
			const paramsStr = match[2].trim();
			const params = paramsStr ? paramsStr.split(',').map(p => {
				// Extract parameter name, handling defaults and destructuring
				let paramName = p.trim().split('=')[0].trim();
				// Remove type annotations
				paramName = paramName.split(':')[0].trim();
				// Remove brackets for optional params
				paramName = paramName.replace(/[\[\]]/g, '');
				// Handle destructuring - just get the first identifier
				if (paramName.includes('{') || paramName.includes('[')) {
					paramName = paramName.replace(/[{}[\]]/g, '').split(',')[0].trim();
				}
				return paramName;
			}).filter(p => p.length > 0) : [];
			return { name, params };
		}
	}

	return null;
}

/**
 * Get all JavaScript files in src/lib/tools directory
 * @returns {Array<string>} Array of file paths
 */
function getToolsFiles() {
	const toolsDir = path.join(__dirname, '../../../src/lib/tools');
	const files = fs.readdirSync(toolsDir);
	return files
		.filter(file => file.endsWith('.js') && !file.startsWith('generic.response'))
		.map(file => path.join(toolsDir, file));
}

describe("JSDoc No Hallucinated Documentation - Property-Based Tests", () => {

	describe("Property 5: No Hallucinated Documentation", () => {
		// Feature: documentation-enhancement, Property 5: No Hallucinated Documentation
		// Validates: Requirements 2.4

		it("should not document parameters that don't exist in function signatures in tools module", () => {
			const toolsFiles = getToolsFiles();
			const issues = [];

			for (const filePath of toolsFiles) {
				const content = fs.readFileSync(filePath, 'utf-8');
				const fileName = path.basename(filePath);

				// Improved pattern that better matches JSDoc with their actual functions
				// This pattern ensures we capture the complete function declaration including private/internal markers
				const combinedPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:const\s+)?([_#]?\w+)\s*[=:]?\s*(?:async\s+)?(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*\{/g;

				let match;
				while ((match = combinedPattern.exec(content)) !== null) {
					const jsdocComment = match[1];
					const functionName = match[2];
					const paramsStr = match[3] || '';

					// Skip private methods, internal functions, and constructors
					// These are intentionally not part of the public API
					if (functionName.startsWith('_') || functionName.startsWith('#') || functionName === 'constructor') {
						continue;
					}

					// Parse JSDoc
					const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

					// Parse actual function parameters
					const actualParams = paramsStr ? paramsStr.split(',').map(p => {
						let paramName = p.trim().split('=')[0].trim();
						// Remove type annotations
						paramName = paramName.split(':')[0].trim();
						// Remove brackets for optional params
						paramName = paramName.replace(/[\[\]]/g, '');
						// Handle destructuring - extract first parameter name
						if (paramName.includes('{') || paramName.includes('[')) {
							// For destructured params, we consider the whole destructure as one param
							// Extract the variable name if it's like "{ prop1, prop2 }"
							const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
							if (destructureMatch) {
								// Return null for complex destructuring, filter out later
								return null;
							}
						}
						return paramName;
					}).filter(p => p && p.length > 0) : [];

					// Check for hallucinated parameters (in JSDoc but not in code)
					if (jsdoc.params.length > 0) {
						for (const jsdocParam of jsdoc.params) {
							const paramName = jsdocParam.name;
							
							// Handle nested parameter documentation (e.g., options.property)
							// These are valid and document properties of object parameters
							if (paramName.includes('.')) {
								const baseParam = paramName.split('.')[0];
								if (!actualParams.includes(baseParam)) {
									issues.push(`${fileName}:${functionName}: JSDoc documents nested parameter '${paramName}' but base parameter '${baseParam}' doesn't exist in function signature`);
								}
								// If base param exists, nested documentation is valid
								continue;
							}
							
							// Check if this parameter exists in actual function signature
							if (!actualParams.includes(paramName)) {
								issues.push(`${fileName}:${functionName}: JSDoc documents parameter '${paramName}' that doesn't exist in function signature`);
							}
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nHallucinated JSDoc Parameter Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} hallucinated parameter documentation issues`);
		});

		it("should not document parameters that don't exist in function signatures in dao-cache.js", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');
			const issues = [];

			// Improved pattern that captures private/internal functions correctly
			const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = methodPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const methodName = match[2];
				const paramsStr = match[3].trim();

				// Skip private methods, internal functions, and constructors
				if (methodName.startsWith('_') || methodName.startsWith('#') || methodName === 'constructor') {
					continue;
				}

				// Parse JSDoc
				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// Parse actual function parameters
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					// Remove type annotations
					paramName = paramName.split(':')[0].trim();
					// Remove brackets for optional params
					paramName = paramName.replace(/[\[\]]/g, '');
					// Handle destructuring
					if (paramName.includes('{') || paramName.includes('[')) {
						// Skip complex destructuring for now
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) {
							return null;
						}
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				// Check for hallucinated parameters (in JSDoc but not in code)
				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						
						// Handle nested parameter documentation (e.g., options.property)
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`dao-cache.js:${methodName}: JSDoc documents nested parameter '${paramName}' but base parameter '${baseParam}' doesn't exist in function signature`);
							}
							continue;
						}
						
						// Check if this parameter exists in actual function signature
						if (!actualParams.includes(paramName)) {
							issues.push(`dao-cache.js:${methodName}: JSDoc documents parameter '${paramName}' that doesn't exist in function signature`);
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nHallucinated JSDoc Parameter Issues in dao-cache.js:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} hallucinated parameter documentation issues in dao-cache.js`);
		});

		it("should not document parameters that don't exist in function signatures in dao-endpoint.js", () => {
			const endpointFilePath = path.join(__dirname, '../../../src/lib/dao-endpoint.js');
			const content = fs.readFileSync(endpointFilePath, 'utf-8');
			const issues = [];

			// Improved pattern that captures private/internal functions correctly
			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:function\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3].trim();

				// Skip private functions
				if (functionName.startsWith('_') || functionName.startsWith('#')) {
					continue;
				}

				// Parse JSDoc
				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// Parse actual function parameters
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					// Remove type annotations
					paramName = paramName.split(':')[0].trim();
					// Remove brackets for optional params
					paramName = paramName.replace(/[\[\]]/g, '');
					// Handle destructuring
					if (paramName.includes('{') || paramName.includes('[')) {
						// Skip complex destructuring for now
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) {
							return null;
						}
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				// Check for hallucinated parameters (in JSDoc but not in code)
				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						
						// Handle nested parameter documentation (e.g., options.property)
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`dao-endpoint.js:${functionName}: JSDoc documents nested parameter '${paramName}' but base parameter '${baseParam}' doesn't exist in function signature`);
							}
							continue;
						}
						
						// Check if this parameter exists in actual function signature
						if (!actualParams.includes(paramName)) {
							issues.push(`dao-endpoint.js:${functionName}: JSDoc documents parameter '${paramName}' that doesn't exist in function signature`);
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nHallucinated JSDoc Parameter Issues in dao-endpoint.js:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} hallucinated parameter documentation issues in dao-endpoint.js`);
		});

		it("should not document parameters that don't exist in function signatures in src/index.js", () => {
			const indexFilePath = path.join(__dirname, '../../../src/index.js');
			const content = fs.readFileSync(indexFilePath, 'utf-8');
			const issues = [];

			// Improved pattern that captures private/internal functions correctly
			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:function\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3].trim();

				// Skip private functions
				if (functionName.startsWith('_') || functionName.startsWith('#')) {
					continue;
				}

				// Parse JSDoc
				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// Parse actual function parameters
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					// Remove type annotations
					paramName = paramName.split(':')[0].trim();
					// Remove brackets for optional params
					paramName = paramName.replace(/[\[\]]/g, '');
					// Handle destructuring
					if (paramName.includes('{') || paramName.includes('[')) {
						// Skip complex destructuring for now
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) {
							return null;
						}
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				// Check for hallucinated parameters (in JSDoc but not in code)
				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						
						// Handle nested parameter documentation (e.g., options.property)
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`src/index.js:${functionName}: JSDoc documents nested parameter '${paramName}' but base parameter '${baseParam}' doesn't exist in function signature`);
							}
							continue;
						}
						
						// Check if this parameter exists in actual function signature
						if (!actualParams.includes(paramName)) {
							issues.push(`src/index.js:${functionName}: JSDoc documents parameter '${paramName}' that doesn't exist in function signature`);
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nHallucinated JSDoc Parameter Issues in src/index.js:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} hallucinated parameter documentation issues in src/index.js`);
		});
	});
});
