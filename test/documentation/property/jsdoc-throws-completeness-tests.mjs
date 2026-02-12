import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// >! Import secure JSDoc parsing functions to prevent string escaping vulnerabilities
import { parseThrowsTag } from '../../helpers/jsdoc-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * JSDoc Throws Documentation Completeness Property-Based Tests
 * Feature: documentation-enhancement
 * Property 4: JSDoc Throws Documentation Completeness
 * Validates: Requirements 1.4, 2.3
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
			currentTag = 'param';
		} else if (cleanLine.startsWith('@returns')) {
			currentTag = 'returns';
		} else if (cleanLine.startsWith('@example')) {
			currentTag = 'example';
		// >! Use secure bracket counting for @throws parsing
		} else if (cleanLine.startsWith('@throws')) {
			const throwsData = parseThrowsTag(cleanLine);
			if (throwsData) {
				result.throws.push({ type: throwsData.type });
			}
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
 * Check if a function has throw statements and extract error types
 * @param {string} code The function code
 * @returns {Array<string>} Array of error types thrown
 */
function extractThrowStatements(code) {
	const throwPattern = /throw\s+new\s+(\w+)|throw\s+(\w+)/g;
	const throws = [];
	let match;

	while ((match = throwPattern.exec(code)) !== null) {
		const errorType = match[1] || match[2];
		if (errorType && !throws.includes(errorType)) {
			throws.push(errorType);
		}
	}

	return throws;
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

describe("JSDoc Throws Documentation Completeness - Property-Based Tests", () => {

	describe("Property 4: JSDoc Throws Documentation Completeness", () => {
		// Feature: documentation-enhancement, Property 4: JSDoc Throws Documentation Completeness
		// Validates: Requirements 1.4, 2.3

		it("should document all throw statements with @throws tags in tools module", () => {
			const toolsFiles = getToolsFiles();
			const issues = [];

			for (const filePath of toolsFiles) {
				const content = fs.readFileSync(filePath, 'utf-8');
				const fileName = path.basename(filePath);

				// Extract all functions and methods with JSDoc
				const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*[=:]\s*(?:async\s+)?(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{([\s\S]*?)(?=\n\s*(?:\/\*\*|static|async|const|let|var|class|\}|$))/g;
				const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n\s*(?:\/\*\*|static|async|\}|$))/g;

				let match;
				const patterns = [functionPattern, methodPattern];

				for (const pattern of patterns) {
					while ((match = pattern.exec(content)) !== null) {
						const jsdocComment = match[1];
						const functionName = match[2];
						const functionBody = match[3] || '';

						// Skip private methods and constructors
						if (functionName.startsWith('_') || functionName.startsWith('#') || functionName === 'constructor') {
							continue;
						}

						// Parse JSDoc
						const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

						// Extract throw statements from function body
						const throwsInCode = extractThrowStatements(functionBody);

						// Check if all throws are documented
						if (throwsInCode.length > 0) {
							if (jsdoc.throws.length === 0) {
								issues.push(`${fileName}:${functionName}: Function throws ${throwsInCode.join(', ')} but has no @throws documentation`);
							} else {
								// Check if documented throws match actual throws
								const documentedTypes = jsdoc.throws.map(t => t.type);
								for (const thrownType of throwsInCode) {
									// Check for exact match or generic Error documentation
									const isDocumented = documentedTypes.some(docType => 
										docType === thrownType || 
										docType === 'Error' || 
										docType.includes(thrownType)
									);
									
									if (!isDocumented) {
										issues.push(`${fileName}:${functionName}: Throws ${thrownType} but it's not documented in @throws tags`);
									}
								}
							}
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Throws Documentation Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} @throws documentation issues`);
		});

		it("should document all throw statements with @throws tags in dao-cache.js", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');
			const issues = [];

			// Extract all class methods with JSDoc
			const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n\s*(?:\/\*\*|static|async|\}|$))/g;

			let match;
			while ((match = methodPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const methodName = match[2];
				const methodBody = match[3] || '';

				// Skip private methods and constructors
				if (methodName.startsWith('_') || methodName.startsWith('#') || methodName === 'constructor') {
					continue;
				}

				// Parse JSDoc
				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// Extract throw statements from method body
				const throwsInCode = extractThrowStatements(methodBody);

				// Check if all throws are documented
				if (throwsInCode.length > 0) {
					if (jsdoc.throws.length === 0) {
						issues.push(`dao-cache.js:${methodName}: Method throws ${throwsInCode.join(', ')} but has no @throws documentation`);
					} else {
						// Check if documented throws match actual throws
						const documentedTypes = jsdoc.throws.map(t => t.type);
						for (const thrownType of throwsInCode) {
							// Check for exact match or generic Error documentation
							const isDocumented = documentedTypes.some(docType => 
								docType === thrownType || 
								docType === 'Error' || 
								docType.includes(thrownType)
							);
							
							if (!isDocumented) {
								issues.push(`dao-cache.js:${methodName}: Throws ${thrownType} but it's not documented in @throws tags`);
							}
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Throws Documentation Issues in dao-cache.js:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} @throws documentation issues in dao-cache.js`);
		});

		it("should document all throw statements with @throws tags in dao-endpoint.js", () => {
			const endpointFilePath = path.join(__dirname, '../../../src/lib/dao-endpoint.js');
			const content = fs.readFileSync(endpointFilePath, 'utf-8');
			const issues = [];

			// Extract all functions and methods with JSDoc
			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n(?:\/\*\*|function|const|let|var|class|module\.exports|\}|$))/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const functionBody = match[3] || '';

				// Skip private functions
				if (functionName.startsWith('_') || functionName.startsWith('#')) {
					continue;
				}

				// Parse JSDoc
				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// Extract throw statements from function body
				const throwsInCode = extractThrowStatements(functionBody);

				// Check if all throws are documented
				if (throwsInCode.length > 0) {
					if (jsdoc.throws.length === 0) {
						issues.push(`dao-endpoint.js:${functionName}: Function throws ${throwsInCode.join(', ')} but has no @throws documentation`);
					} else {
						// Check if documented throws match actual throws
						const documentedTypes = jsdoc.throws.map(t => t.type);
						for (const thrownType of throwsInCode) {
							// Check for exact match or generic Error documentation
							const isDocumented = documentedTypes.some(docType => 
								docType === thrownType || 
								docType === 'Error' || 
								docType.includes(thrownType)
							);
							
							if (!isDocumented) {
								issues.push(`dao-endpoint.js:${functionName}: Throws ${thrownType} but it's not documented in @throws tags`);
							}
						}
					}
				}
			}

			// Report all issues
			if (issues.length > 0) {
				console.log('\nJSDoc Throws Documentation Issues in dao-endpoint.js:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} @throws documentation issues in dao-endpoint.js`);
		});
	});
});
