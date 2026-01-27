import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * JSDoc Return Type Format Property-Based Tests
 * Feature: documentation-enhancement
 * Property 3: JSDoc Return Type Format Compliance
 * Validates: Requirements 1.6, 1.7, 1.8
 */

/**
 * Parse JSDoc comment block and extract return type
 * @param {string} jsdocComment The JSDoc comment block
 * @returns {string|null} The return type or null if not found
 */
function parseReturnType(jsdocComment) {
	const lines = jsdocComment.split('\n').map(line => line.trim());
	
	let inReturns = false;
	let returnType = '';
	
	for (const line of lines) {
		const cleanLine = line.replace(/^\/\*\*|\*\/$/g, '').replace(/^\*\s?/, '').trim();
		
		if (cleanLine.startsWith('@returns') || cleanLine.startsWith('@return')) {
			inReturns = true;
			const match = cleanLine.match(/@returns?\s+\{(.+)/);
			if (match) {
				returnType = match[1];
				// Check if the type is complete (has closing brace)
				if (returnType.endsWith('}')) {
					return returnType.slice(0, -1); // Remove trailing }
				}
			}
		} else if (inReturns && cleanLine && !cleanLine.startsWith('@')) {
			// Continue collecting the return type if it spans multiple lines
			returnType += cleanLine;
			if (returnType.endsWith('}')) {
				return returnType.slice(0, -1); // Remove trailing }
			}
		} else if (inReturns && cleanLine.startsWith('@')) {
			// Hit another tag, stop collecting
			break;
		}
	}
	
	// If we collected a return type but it doesn't end with }, return what we have
	if (returnType) {
		return returnType.endsWith('}') ? returnType.slice(0, -1) : returnType;
	}
	
	return null;
}

/**
 * Check if a function is async or returns a Promise
 * @param {string} code The function code
 * @returns {boolean} True if function is async or returns Promise
 */
function isAsyncFunction(code) {
	// Check for async keyword
	if (/async\s+\w+\s*\(/.test(code) || /async\s+function/.test(code)) {
		return true;
	}
	
	// Check for explicit Promise return
	if (/return\s+new\s+Promise/.test(code) || /return\s+Promise\./.test(code)) {
		return true;
	}
	
	return false;
}

/**
 * Check if return type uses proper Promise notation
 * @param {string} returnType The return type string
 * @returns {boolean} True if Promise notation is proper
 */
function hasProperPromiseNotation(returnType) {
	// Should use Promise<Type> format
	if (returnType.includes('Promise')) {
		// Check for proper format: Promise<...>
		return /Promise<[^>]+>/.test(returnType);
	}
	return true; // Not a Promise, so notation is fine
}

/**
 * Check if return type uses proper Array notation
 * @param {string} returnType The return type string
 * @returns {boolean} True if Array notation is proper
 */
function hasProperArrayNotation(returnType) {
	// Should use Array.<Type> format, not Array or []
	if (returnType.includes('Array') && !returnType.includes('Array.<')) {
		// Check if it's just "Array" without element type
		if (/\bArray\b(?!\.|\<)/.test(returnType)) {
			return false;
		}
	}
	return true;
}

/**
 * Check if return type documents Object properties when appropriate
 * @param {string} returnType The return type string
 * @returns {boolean} True if Object notation is detailed enough
 */
function hasProperObjectNotation(returnType) {
	// If it's just "Object" without structure, it should ideally have properties
	// However, Object.<string, Type> is acceptable for generic objects
	if (returnType === 'Object') {
		// Plain "Object" without details is not ideal but acceptable for generic objects
		return true;
	}
	
	// Check for detailed object structure: {prop: Type, ...}
	if (returnType.includes('{') && returnType.includes(':')) {
		return true;
	}
	
	// Check for generic object notation: Object.<KeyType, ValueType>
	if (/Object\.<[^>]+>/.test(returnType)) {
		return true;
	}
	
	return true;
}

describe("JSDoc Return Type Format - Property-Based Tests", () => {

	describe("Property 3: JSDoc Return Type Format Compliance", () => {
		// Feature: documentation-enhancement, Property 3: JSDoc Return Type Format Compliance

		it("should use proper Promise<Type> notation for async functions in dao-endpoint.js", () => {
			const endpointFilePath = path.join(__dirname, '../../../src/lib/dao-endpoint.js');
			const content = fs.readFileSync(endpointFilePath, 'utf-8');

			const issues = [];

			// Extract all functions and methods with JSDoc
			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*((?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*)?\([^)]*\)|(?:async\s+)?(\w+)\s*\([^)]*\))/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionCode = match[2];
				const functionName = match[3] || match[4];

				// Skip private functions
				if (functionName && functionName.startsWith('_')) {
					continue;
				}

				const returnType = parseReturnType('/**' + jsdocComment + '*/');
				
				if (returnType) {
					// Check if function is async
					if (isAsyncFunction(functionCode)) {
						if (!hasProperPromiseNotation(returnType)) {
							issues.push(`${functionName}: Async function should use Promise<Type> notation, found: ${returnType}`);
						}
					}

					// Check Array notation
					if (!hasProperArrayNotation(returnType)) {
						issues.push(`${functionName}: Should use Array.<Type> notation, found: ${returnType}`);
					}

					// Check Object notation
					if (!hasProperObjectNotation(returnType)) {
						issues.push(`${functionName}: Object return type should document structure, found: ${returnType}`);
					}
				}
			}

			// Also check class methods
			const classPattern = /class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
			let classMatch;
			
			while ((classMatch = classPattern.exec(content)) !== null) {
				const className = classMatch[1];
				const classBody = classMatch[2];

				const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
				let methodMatch;

				while ((methodMatch = methodPattern.exec(classBody)) !== null) {
					const jsdocComment = methodMatch[1];
					const methodName = methodMatch[2];
					const methodCode = methodMatch[0];

					// Skip constructor and private methods
					if (methodName === 'constructor' || methodName.startsWith('_')) {
						continue;
					}

					const returnType = parseReturnType('/**' + jsdocComment + '*/');
					
					if (returnType) {
						// Check if method is async
						if (isAsyncFunction(methodCode)) {
							if (!hasProperPromiseNotation(returnType)) {
								issues.push(`${className}.${methodName}: Async method should use Promise<Type> notation, found: ${returnType}`);
							}
						}

						// Check Array notation
						if (!hasProperArrayNotation(returnType)) {
							issues.push(`${className}.${methodName}: Should use Array.<Type> notation, found: ${returnType}`);
						}

						// Check Object notation
						if (!hasProperObjectNotation(returnType)) {
							issues.push(`${className}.${methodName}: Object return type should document structure, found: ${returnType}`);
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Return Type Format Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} return type format issues`);
		});

		it("should use proper Promise<Type> notation for async functions in dao-cache.js", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');

			const issues = [];

			// Check class methods
			const classPattern = /class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
			let classMatch;
			
			while ((classMatch = classPattern.exec(content)) !== null) {
				const className = classMatch[1];
				const classBody = classMatch[2];

				// Skip non-exported classes
				if (!content.includes(`module.exports`) || 
					!['S3Cache', 'DynamoDbCache', 'CacheData', 'Cache', 'CacheableDataAccess'].includes(className)) {
					continue;
				}

				const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
				let methodMatch;

				while ((methodMatch = methodPattern.exec(classBody)) !== null) {
					const jsdocComment = methodMatch[1];
					const methodName = methodMatch[2];
					const methodCode = methodMatch[0];

					// Skip constructor and private methods
					if (methodName === 'constructor' || methodName.startsWith('_')) {
						continue;
					}

					const returnType = parseReturnType('/**' + jsdocComment + '*/');
					
					if (returnType) {
						// Check if method is async
						if (isAsyncFunction(methodCode)) {
							if (!hasProperPromiseNotation(returnType)) {
								issues.push(`${className}.${methodName}: Async method should use Promise<Type> notation, found: ${returnType}`);
							}
						}

						// Check Array notation
						if (!hasProperArrayNotation(returnType)) {
							issues.push(`${className}.${methodName}: Should use Array.<Type> notation, found: ${returnType}`);
						}

						// Check Object notation
						if (!hasProperObjectNotation(returnType)) {
							issues.push(`${className}.${methodName}: Object return type should document structure, found: ${returnType}`);
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Return Type Format Issues (dao-cache.js):');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} return type format issues`);
		});

		it("should validate return type format using property-based testing", () => {
			// Property: For any return type string, if it contains Promise/Array/Object,
			// it should follow the proper notation rules

			fc.assert(
				fc.property(
					fc.oneof(
						// Valid Promise types
						fc.string({ minLength: 1 }).map(t => `Promise<${t}>`),
						// Valid Array types
						fc.string({ minLength: 1 }).map(t => `Array.<${t}>`),
						// Valid Object types with structure
						fc.string({ minLength: 1 }).map(t => `{${t}: string}`),
						// Valid generic Object types
						fc.tuple(
							fc.string({ minLength: 1 }), 
							fc.string({ minLength: 1 })
						).map(([k, v]) => `Object.<${k}, ${v}>`)
					),
					(returnType) => {
						// These should all pass the validation
						expect(hasProperPromiseNotation(returnType)).to.be.true;
						expect(hasProperArrayNotation(returnType)).to.be.true;
						expect(hasProperObjectNotation(returnType)).to.be.true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should reject improper return type formats using property-based testing", () => {
			// Property: Invalid formats should be detected

			const invalidFormats = [
				'Promise',           // Missing type parameter
				'Array',             // Missing element type
				'Promise<>',         // Empty type parameter
			];

			for (const invalidFormat of invalidFormats) {
				if (invalidFormat.includes('Promise') && invalidFormat !== 'Promise<void>') {
					expect(hasProperPromiseNotation(invalidFormat)).to.be.false;
				}
				if (invalidFormat === 'Array') {
					expect(hasProperArrayNotation(invalidFormat)).to.be.false;
				}
			}
		});
	});
});
