import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * JSDoc Completeness Property-Based Tests
 * Feature: documentation-enhancement
 * Property 1: JSDoc Completeness for All Exports
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.9, 9.5
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

		// Check for tags
		if (cleanLine.startsWith('@param')) {
			const match = cleanLine.match(/@param\s+\{([^}]+)\}\s+(\[?[\w.]+\]?)/);
			if (match) {
				result.params.push({ type: match[1], name: match[2] });
			}
			currentTag = 'param';
		} else if (cleanLine.startsWith('@returns')) {
			const match = cleanLine.match(/@returns\s+\{([^}]+)\}/);
			if (match) {
				result.returns = { type: match[1] };
			}
			currentTag = 'returns';
		} else if (cleanLine.startsWith('@example')) {
			currentTag = 'example';
			result.examples.push('');
		} else if (cleanLine.startsWith('@throws')) {
			const match = cleanLine.match(/@throws\s+\{([^}]+)\}/);
			if (match) {
				result.throws.push({ type: match[1] });
			}
			currentTag = 'throws';
		} else if (!cleanLine.startsWith('@')) {
			// Description or continuation of current tag
			if (currentTag === null) {
				descriptionLines.push(cleanLine);
			} else if (currentTag === 'example' && result.examples.length > 0) {
				result.examples[result.examples.length - 1] += cleanLine + '\n';
			}
		}
	}

	result.description = descriptionLines.join(' ').trim();
	return result;
}

/**
 * Extract function/method signature from code
 * @param {string} code The function code
 * @returns {Object} Function signature with name and parameters
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
				const paramName = p.trim().split('=')[0].trim().split(':')[0].trim();
				return paramName.replace(/[{}[\]]/g, '').split(',')[0].trim();
			}) : [];
			return { name, params };
		}
	}

	return null;
}

/**
 * Check if a function has throw statements
 * @param {string} code The function code
 * @returns {boolean} True if function contains throw statements
 */
function hasThrowStatements(code) {
	return /throw\s+new\s+\w+|throw\s+\w+/.test(code);
}

describe("JSDoc Completeness - Property-Based Tests", () => {

	describe("Property 1: JSDoc Completeness for All Exports", () => {
		// Feature: documentation-enhancement, Property 1: JSDoc Completeness for All Exports

		it("should have complete JSDoc for all exported functions in dao-cache.js", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');

			// Extract all class definitions and their methods
			const classPattern = /\/\*\*[\s\S]*?\*\/\s*class\s+(\w+)\s*\{[\s\S]*?\n\}/g;
			const methodPattern = /\/\*\*[\s\S]*?\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;

			let match;
			const issues = [];

			// Find all classes
			while ((match = classPattern.exec(content)) !== null) {
				const className = match[1];
				const classBlock = match[0];

				// Check if class is exported
				const isExported = content.includes(`module.exports`) && 
					(content.includes(className) || classBlock.includes('class ' + className));

				if (!isExported && !['S3Cache', 'DynamoDbCache', 'CacheData', 'Cache', 'CacheableDataAccess'].includes(className)) {
					continue; // Skip non-exported classes
				}

				// Extract JSDoc for class
				const classJSDocMatch = classBlock.match(/\/\*\*([\s\S]*?)\*\//);
				if (classJSDocMatch) {
					const jsdoc = parseJSDoc(classJSDocMatch[0]);
					
					// Check for description
					if (!jsdoc.description || jsdoc.description.length < 10) {
						issues.push(`${className}: Missing or insufficient class description`);
					}

					// Check for @example
					if (jsdoc.examples.length === 0) {
						issues.push(`${className}: Missing @example tag`);
					}
				}

				// Find all methods in this class
				const methodMatches = [...classBlock.matchAll(methodPattern)];
				for (const methodMatch of methodMatches) {
					const methodName = methodMatch[1];
					
					// Skip constructor and private methods
					if (methodName === 'constructor' || methodName.startsWith('_') || methodName.startsWith('#')) {
						continue;
					}

					// Extract JSDoc for method
					const methodJSDocMatch = methodMatch[0].match(/\/\*\*([\s\S]*?)\*\//);
					if (!methodJSDocMatch) {
						issues.push(`${className}.${methodName}: Missing JSDoc comment`);
						continue;
					}

					const jsdoc = parseJSDoc(methodJSDocMatch[0]);
					const signature = extractFunctionSignature(methodMatch[0]);

					// Check for description
					if (!jsdoc.description || jsdoc.description.length < 10) {
						issues.push(`${className}.${methodName}: Missing or insufficient description`);
					}

					// Check for @param tags
					if (signature && signature.params.length > 0) {
						const nonOptionalParams = signature.params.filter(p => !p.includes('='));
						if (jsdoc.params.length < nonOptionalParams.length) {
							issues.push(`${className}.${methodName}: Missing @param tags (expected ${signature.params.length}, found ${jsdoc.params.length})`);
						}
					}

					// Check for @returns tag (skip if method name suggests no return)
					if (!['init', 'constructor'].includes(methodName) && !methodName.startsWith('set')) {
						if (!jsdoc.returns) {
							issues.push(`${className}.${methodName}: Missing @returns tag`);
						}
					}

					// Check for @example tag
					if (jsdoc.examples.length === 0) {
						issues.push(`${className}.${methodName}: Missing @example tag`);
					}

					// Check for @throws tag if function has throw statements
					const methodCode = methodMatch[0];
					if (hasThrowStatements(methodCode) && jsdoc.throws.length === 0) {
						issues.push(`${className}.${methodName}: Missing @throws tag (function contains throw statements)`);
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Completeness Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} JSDoc completeness issues`);
		});
	});

	describe("Property 2: JSDoc Parameter Accuracy", () => {
		// Feature: documentation-enhancement, Property 2: JSDoc Parameter Accuracy
		// Validates: Requirements 2.1, 2.4

		it("should have JSDoc parameter names matching actual function signatures", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');

			// Extract all class definitions and their methods
			const classPattern = /\/\*\*[\s\S]*?\*\/\s*class\s+(\w+)\s*\{[\s\S]*?\n\}/g;
			const methodPattern = /\/\*\*[\s\S]*?\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			const issues = [];

			// Find all classes
			while ((match = classPattern.exec(content)) !== null) {
				const className = match[1];
				const classBlock = match[0];

				// Check if class is exported
				const isExported = content.includes(`module.exports`) && 
					(content.includes(className) || classBlock.includes('class ' + className));

				if (!isExported && !['S3Cache', 'DynamoDbCache', 'CacheData', 'Cache', 'CacheableDataAccess'].includes(className)) {
					continue; // Skip non-exported classes
				}

				// Find all methods in this class
				const methodMatches = [...classBlock.matchAll(methodPattern)];
				for (const methodMatch of methodMatches) {
					const methodName = methodMatch[1];
					const paramsStr = methodMatch[2].trim();
					
					// Skip constructor and private methods
					if (methodName === 'constructor' || methodName.startsWith('_') || methodName.startsWith('#')) {
						continue;
					}

					// Extract JSDoc for method
					const methodJSDocMatch = methodMatch[0].match(/\/\*\*([\s\S]*?)\*\//);
					if (!methodJSDocMatch) {
						continue; // Already caught by completeness test
					}

					const jsdoc = parseJSDoc(methodJSDocMatch[0]);
					
					// Parse actual function parameters
					const actualParams = paramsStr ? paramsStr.split(',').map(p => {
						// Extract parameter name, handling defaults, destructuring, and optional params
						let paramName = p.trim().split('=')[0].trim();
						// Remove type annotations (TypeScript style, though this is JS)
						paramName = paramName.split(':')[0].trim();
						// Remove brackets for optional params
						paramName = paramName.replace(/[\[\]]/g, '');
						// Handle destructuring - just get the first identifier
						if (paramName.includes('{') || paramName.includes('[')) {
							paramName = paramName.replace(/[{}[\]]/g, '').split(',')[0].trim();
						}
						return paramName;
					}).filter(p => p.length > 0) : [];

					// Check if JSDoc params match actual params
					if (jsdoc.params.length > 0 && actualParams.length > 0) {
						// Extract param names from JSDoc (handle optional params with brackets)
						const jsdocParamNames = jsdoc.params.map(p => {
							let name = p.name.replace(/[\[\]]/g, ''); // Remove optional brackets
							// Handle destructured params
							if (name.includes('.')) {
								name = name.split('.')[0];
							}
							return name;
						});

						// Check for hallucinated parameters (in JSDoc but not in code)
						for (const jsdocParam of jsdocParamNames) {
							if (!actualParams.includes(jsdocParam)) {
								issues.push(`${className}.${methodName}: JSDoc documents parameter '${jsdocParam}' that doesn't exist in function signature`);
							}
						}

						// Check for missing parameters (in code but not in JSDoc)
						for (const actualParam of actualParams) {
							if (!jsdocParamNames.includes(actualParam)) {
								issues.push(`${className}.${methodName}: Function parameter '${actualParam}' is not documented in JSDoc`);
							}
						}

						// Check parameter order matches
						const minLength = Math.min(jsdocParamNames.length, actualParams.length);
						for (let i = 0; i < minLength; i++) {
							if (jsdocParamNames[i] !== actualParams[i]) {
								issues.push(`${className}.${methodName}: Parameter order mismatch - JSDoc has '${jsdocParamNames[i]}' at position ${i}, but function has '${actualParams[i]}'`);
							}
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Parameter Accuracy Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} JSDoc parameter accuracy issues`);
		});
	});
});
