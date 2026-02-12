import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// >! Import secure JSDoc parsing functions to prevent string escaping vulnerabilities
import { parseParamTag, parseReturnsTag, parseThrowsTag } from '../../helpers/jsdoc-parser.mjs';

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
	let returnsBuffer = '';
	let braceCount = 0;

	for (const line of lines) {
		// Skip comment markers
		const cleanLine = line.replace(/^\/\*\*|\*\/$/g, '').replace(/^\*\s?/, '').trim();
		
		if (!cleanLine) continue;

		// >! Use secure bracket counting for JSDoc tag parsing
		if (cleanLine.startsWith('@param')) {
			const paramData = parseParamTag(cleanLine);
			if (paramData) {
				result.params.push({ type: paramData.type, name: paramData.name });
			}
			currentTag = 'param';
		} else if (cleanLine.startsWith('@returns')) {
			// >! Use secure bracket counting for @returns parsing
			const returnsData = parseReturnsTag(cleanLine);
			if (returnsData) {
				result.returns = { type: returnsData.type };
			} else {
				// No type annotation, just description
				result.returns = { type: 'any' };
			}
			currentTag = 'returns';
		} else if (cleanLine.startsWith('@example')) {
			currentTag = 'example';
			result.examples.push('');
		} else if (cleanLine.startsWith('@throws')) {
			// >! Use secure bracket counting for @throws parsing
			const throwsData = parseThrowsTag(cleanLine);
			if (throwsData) {
				result.throws.push({ type: throwsData.type });
			}
			currentTag = 'throws';
		} else if (!cleanLine.startsWith('@')) {
			// Description or continuation of current tag
			if (currentTag === null) {
				descriptionLines.push(cleanLine);
			} else if (currentTag === 'returns' && braceCount > 0) {
				// Continue collecting @returns content
				returnsBuffer += ' ' + cleanLine;
				braceCount += (cleanLine.match(/\{/g) || []).length - (cleanLine.match(/\}/g) || []).length;
				
				// If braces are now balanced, parse the complete @returns
				if (braceCount === 0) {
					// Extract type - everything between first { and last }
					const typeMatch = returnsBuffer.match(/@returns\s+(\{[\s\S]*?\})\s*(.*)/);
					if (typeMatch) {
						result.returns = { type: typeMatch[1] };
					} else {
						result.returns = { type: 'any' };
					}
					returnsBuffer = '';
				}
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
 * @returns {Object|null} Function signature with name and parameters, or null if not found
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
			
			// If paramsStr is empty, return empty params array
			if (!paramsStr || paramsStr.length === 0) {
				return { name, params: [] };
			}
			
			// Parse parameters
			const params = paramsStr.split(',').map(p => {
				// Extract parameter name, handling defaults and destructuring
				const paramName = p.trim().split('=')[0].trim().split(':')[0].trim();
				return paramName.replace(/[{}[\]]/g, '').split(',')[0].trim();
			}).filter(p => p && p.length > 0);  // Filter out empty or falsy strings
			
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
			const classPattern = /class\s+(\w+)\s*\{/g;
			
			let match;
			const issues = [];

			// Find all classes
			while ((match = classPattern.exec(content)) !== null) {
				const className = match[1];
				const classStartIndex = match.index;
				
				// Check if class is exported
				const isExported = content.includes(`module.exports`) && 
					(content.includes(className));

				if (!isExported && !['S3Cache', 'DynamoDbCache', 'CacheData', 'Cache', 'CacheableDataAccess'].includes(className)) {
					continue; // Skip non-exported classes
				}

				// Find the JSDoc comment immediately before the class keyword
				// Look backwards from the class position to find the JSDoc
				const beforeClass = content.substring(Math.max(0, classStartIndex - 2000), classStartIndex);
				const classJSDocMatch = beforeClass.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
				
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
				} else {
					issues.push(`${className}: Missing JSDoc comment for class`);
				}

				// Find the end of this class to create a class block
				// Simple approach: find the next "class" or end of file
				const nextClassMatch = classPattern.exec(content);
				const classEndIndex = nextClassMatch ? nextClassMatch.index : content.length;
				classPattern.lastIndex = classStartIndex + 1; // Reset to continue from current class
				
				const classBlock = content.substring(classStartIndex, classEndIndex);

				// Find all methods in this class - use a more precise pattern
				// Match JSDoc followed immediately by method declaration
				const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(static\s+)?(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g;
				const methodMatches = [...classBlock.matchAll(methodPattern)];
				
				for (const methodMatch of methodMatches) {
					const isStatic = methodMatch[2] !== undefined;
					const isAsync = methodMatch[3] !== undefined;
					const methodName = methodMatch[4];
					const paramsStr = methodMatch[5];
					
					// Skip constructor and private methods
					if (methodName === 'constructor' || methodName.startsWith('_') || methodName.startsWith('#')) {
						continue;
					}

					// Parse JSDoc
					const jsdocText = '/**' + methodMatch[1] + '*/';
					const jsdoc = parseJSDoc(jsdocText);
					
					// Parse actual parameters from signature
					const actualParams = paramsStr.trim() ? paramsStr.split(',').map(p => {
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
					}).filter(p => p && p.length > 0) : [];

					// Check for description
					if (!jsdoc.description || jsdoc.description.length < 10) {
						issues.push(`${className}.${methodName}: Missing or insufficient description`);
					}

					// Check for @param tags (only if method has parameters)
					if (actualParams.length > 0) {
						if (jsdoc.params.length < actualParams.length) {
							issues.push(`${className}.${methodName}: Missing @param tags (expected ${actualParams.length}, found ${jsdoc.params.length})`);
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
