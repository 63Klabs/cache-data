#!/usr/bin/env node

/**
 * Documentation Audit and Validation Script
 * 
 * Scans all source files in src/ directory to:
 * - Identify all exported functions, methods, and classes
 * - Parse existing JSDoc comments
 * - Validate JSDoc completeness (all required tags present)
 * - Validate JSDoc accuracy (parameters match code)
 * - Validate links in all documentation files
 * - Validate example code syntax
 * - Generate comprehensive validation report
 * 
 * Requirements: 1.1, 9.5, 10.5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(__dirname, '..', '.kiro', 'specs', '1-3-6-documentation-enhancement', 'audit-report.json');

/**
 * Recursively get all JavaScript files in a directory
 * @param {string} dir Directory to scan
 * @param {Array<string>} fileList Accumulated file list
 * @returns {Array<string>} List of file paths
 */
function getJavaScriptFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	
	files.forEach(file => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		
		if (stat.isDirectory()) {
			getJavaScriptFiles(filePath, fileList);
		} else if (file.endsWith('.js')) {
			fileList.push(filePath);
		}
	});
	
	return fileList;
}

/**
 * Extract JSDoc comment block preceding a code element
 * @param {string} content File content
 * @param {number} position Position of the code element
 * @returns {string|null} JSDoc comment or null
 */
function extractJSDocBefore(content, position) {
	// Look backwards from position to find JSDoc comment
	const beforeContent = content.substring(0, position);
	const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
	const matches = [...beforeContent.matchAll(jsdocPattern)];
	
	if (matches.length === 0) return null;
	
	// Get the last JSDoc comment before this position
	const lastMatch = matches[matches.length - 1];
	const jsdocEnd = lastMatch.index + lastMatch[0].length;
	
	// Check if there's only whitespace between JSDoc and the code element
	const betweenContent = content.substring(jsdocEnd, position);
	if (/^\s*$/.test(betweenContent)) {
		return lastMatch[0];
	}
	
	return null;
}

/**
 * Parse JSDoc comment to extract tags
 * @param {string} jsdoc JSDoc comment block
 * @returns {Object} Parsed JSDoc data
 */
function parseJSDoc(jsdoc) {
	if (!jsdoc) {
		return {
			description: null,
			params: [],
			returns: null,
			examples: [],
			throws: []
		};
	}
	
	const lines = jsdoc.split('\n').map(line => line.trim().replace(/^\*\s?/, ''));
	
	const parsed = {
		description: '',
		params: [],
		returns: null,
		examples: [],
		throws: []
	};
	
	let currentTag = null;
	let currentContent = '';
	
	lines.forEach(line => {
		// Check for tags
		const paramMatch = line.match(/^@param\s+\{([^}]+)\}\s+(\[?[\w.]+\]?)\s*-?\s*(.*)/);
		const returnsMatch = line.match(/^@returns?\s+\{([^}]+)\}\s*(.*)/);
		const exampleMatch = line.match(/^@example/);
		const throwsMatch = line.match(/^@throws?\s+\{([^}]+)\}\s*(.*)/);
		
		if (paramMatch) {
			if (currentTag === 'description' && currentContent.trim()) {
				parsed.description = currentContent.trim();
			}
			currentTag = 'param';
			const [, type, name, description] = paramMatch;
			const isOptional = name.startsWith('[') && name.endsWith(']');
			const cleanName = name.replace(/[\[\]]/g, '').split('=')[0];
			const defaultValue = name.includes('=') ? name.split('=')[1].replace(']', '') : null;
			
			parsed.params.push({
				name: cleanName,
				type,
				description: description || '',
				optional: isOptional,
				defaultValue
			});
		} else if (returnsMatch) {
			if (currentTag === 'description' && currentContent.trim()) {
				parsed.description = currentContent.trim();
			}
			currentTag = 'returns';
			const [, type, description] = returnsMatch;
			parsed.returns = {
				type,
				description: description || ''
			};
		} else if (exampleMatch) {
			if (currentTag === 'description' && currentContent.trim()) {
				parsed.description = currentContent.trim();
			}
			currentTag = 'example';
			currentContent = '';
		} else if (throwsMatch) {
			if (currentTag === 'description' && currentContent.trim()) {
				parsed.description = currentContent.trim();
			}
			currentTag = 'throws';
			const [, type, description] = throwsMatch;
			parsed.throws.push({
				type,
				description: description || ''
			});
		} else if (line && !line.startsWith('/**') && !line.startsWith('*/')) {
			// Content line
			if (currentTag === 'example') {
				currentContent += line + '\n';
			} else if (currentTag === 'description' || !currentTag) {
				currentTag = 'description';
				currentContent += line + ' ';
			} else if (currentTag === 'param' && parsed.params.length > 0) {
				// Continuation of param description
				parsed.params[parsed.params.length - 1].description += ' ' + line;
			} else if (currentTag === 'returns' && parsed.returns) {
				// Continuation of returns description
				parsed.returns.description += ' ' + line;
			} else if (currentTag === 'throws' && parsed.throws.length > 0) {
				// Continuation of throws description
				parsed.throws[parsed.throws.length - 1].description += ' ' + line;
			}
		}
	});
	
	// Handle any remaining content
	if (currentTag === 'description' && currentContent.trim()) {
		parsed.description = currentContent.trim();
	} else if (currentTag === 'example' && currentContent.trim()) {
		parsed.examples.push(currentContent.trim());
	}
	
	return parsed;
}

/**
 * Extract function parameters from function signature
 * @param {string} signature Function signature
 * @returns {Array<string>} Parameter names
 */
function extractFunctionParams(signature) {
	const paramMatch = signature.match(/\(([^)]*)\)/);
	if (!paramMatch || !paramMatch[1].trim()) return [];
	
	return paramMatch[1]
		.split(',')
		.map(p => p.trim().split('=')[0].trim())
		.filter(p => p.length > 0);
}

/**
 * Analyze a single source file
 * @param {string} filePath Path to source file
 * @returns {Object} Analysis results
 */
function analyzeFile(filePath) {
	const content = fs.readFileSync(filePath, 'utf-8');
	const relativePath = path.relative(SRC_DIR, filePath);
	
	const exports = [];
	
	// Pattern for class declarations
	const classPattern = /class\s+(\w+)/g;
	let match;
	
	while ((match = classPattern.exec(content)) !== null) {
		const className = match[1];
		const jsdoc = extractJSDocBefore(content, match.index);
		const parsedJSDoc = parseJSDoc(jsdoc);
		
		exports.push({
			type: 'class',
			name: className,
			hasJSDoc: jsdoc !== null,
			jsdoc: parsedJSDoc,
			position: match.index
		});
		
		// Find methods in this class
		const classStart = match.index;
		const classEnd = content.indexOf('}', classStart);
		const classBody = content.substring(classStart, classEnd);
		
		// Static methods
		const staticMethodPattern = /static\s+(\w+)\s*\([^)]*\)/g;
		let methodMatch;
		while ((methodMatch = staticMethodPattern.exec(classBody)) !== null) {
			const methodName = methodMatch[1];
			const methodJsdoc = extractJSDocBefore(classBody, methodMatch.index);
			const parsedMethodJSDoc = parseJSDoc(methodJsdoc);
			const params = extractFunctionParams(methodMatch[0]);
			
			exports.push({
				type: 'method',
				name: `${className}.${methodName}`,
				className: className,
				isStatic: true,
				hasJSDoc: methodJsdoc !== null,
				jsdoc: parsedMethodJSDoc,
				actualParams: params,
				position: classStart + methodMatch.index
			});
		}
		
		// Instance methods (excluding constructor and private methods)
		const instanceMethodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
		while ((methodMatch = instanceMethodPattern.exec(classBody)) !== null) {
			const methodName = methodMatch[1];
			// Skip constructor, static methods, and private methods
			if (methodName === 'constructor' || methodName.startsWith('#') || classBody.substring(Math.max(0, methodMatch.index - 10), methodMatch.index).includes('static')) {
				continue;
			}
			
			const methodJsdoc = extractJSDocBefore(classBody, methodMatch.index);
			const parsedMethodJSDoc = parseJSDoc(methodJsdoc);
			const params = extractFunctionParams(methodMatch[0]);
			
			exports.push({
				type: 'method',
				name: `${className}.${methodName}`,
				className: className,
				isStatic: false,
				hasJSDoc: methodJsdoc !== null,
				jsdoc: parsedMethodJSDoc,
				actualParams: params,
				position: classStart + methodMatch.index
			});
		}
	}
	
	// Pattern for exported functions (const functionName = ...)
	const constFunctionPattern = /const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
	while ((match = constFunctionPattern.exec(content)) !== null) {
		const functionName = match[1];
		const jsdoc = extractJSDocBefore(content, match.index);
		const parsedJSDoc = parseJSDoc(jsdoc);
		const params = extractFunctionParams(match[0]);
		
		exports.push({
			type: 'function',
			name: functionName,
			hasJSDoc: jsdoc !== null,
			jsdoc: parsedJSDoc,
			actualParams: params,
			position: match.index
		});
	}
	
	// Pattern for function declarations
	const functionPattern = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;
	while ((match = functionPattern.exec(content)) !== null) {
		const functionName = match[1];
		const jsdoc = extractJSDocBefore(content, match.index);
		const parsedJSDoc = parseJSDoc(jsdoc);
		const params = extractFunctionParams(match[0]);
		
		exports.push({
			type: 'function',
			name: functionName,
			hasJSDoc: jsdoc !== null,
			jsdoc: parsedJSDoc,
			actualParams: params,
			position: match.index
		});
	}
	
	// Check module.exports to determine what's actually exported
	const moduleExportsPattern = /module\.exports\s*=\s*\{([^}]+)\}/;
	const exportsMatch = content.match(moduleExportsPattern);
	let exportedNames = [];
	
	if (exportsMatch) {
		exportedNames = exportsMatch[1]
			.split(',')
			.map(e => e.trim().split(':')[0].trim())
			.filter(e => e.length > 0);
	}
	
	// Filter to only exported items
	const exportedItems = exports.filter(item => {
		if (exportedNames.length === 0) return true; // If we can't determine exports, include all
		return exportedNames.includes(item.name) || exportedNames.includes(item.name.split('.')[0]);
	});
	
	return {
		filePath: relativePath,
		exports: exportedItems
	};
}

/**
 * Analyze JSDoc completeness
 * @param {Object} item Export item
 * @returns {Object} Completeness analysis
 */
function analyzeCompleteness(item) {
	const issues = [];
	
	if (!item.hasJSDoc) {
		return {
			complete: false,
			issues: ['Missing JSDoc comment']
		};
	}
	
	const jsdoc = item.jsdoc;
	
	// Check description
	if (!jsdoc.description || jsdoc.description.trim().length === 0) {
		issues.push('Missing description');
	}
	
	// Check @param tags
	if (item.actualParams && item.actualParams.length > 0) {
		const documentedParams = jsdoc.params.map(p => p.name);
		const missingParams = item.actualParams.filter(p => !documentedParams.includes(p));
		
		if (missingParams.length > 0) {
			issues.push(`Missing @param tags for: ${missingParams.join(', ')}`);
		}
		
		// Check for incomplete param documentation
		jsdoc.params.forEach(param => {
			if (!param.type || param.type.trim() === '') {
				issues.push(`@param ${param.name} missing type`);
			}
			if (!param.description || param.description.trim() === '') {
				issues.push(`@param ${param.name} missing description`);
			}
		});
	}
	
	// Check @returns tag (for functions and methods, not classes)
	if (item.type !== 'class' && !jsdoc.returns) {
		issues.push('Missing @returns tag');
	} else if (item.type !== 'class' && jsdoc.returns) {
		if (!jsdoc.returns.type || jsdoc.returns.type.trim() === '') {
			issues.push('@returns missing type');
		}
		if (!jsdoc.returns.description || jsdoc.returns.description.trim() === '') {
			issues.push('@returns missing description');
		}
	}
	
	// Check @example tag
	if (jsdoc.examples.length === 0) {
		issues.push('Missing @example tag');
	}
	
	// Note: @throws is optional, so we don't check for it
	
	return {
		complete: issues.length === 0,
		issues
	};
}

/**
 * Validate JSDoc accuracy - check if documented params match actual params
 * @param {Object} item Export item
 * @returns {Object} Accuracy validation results
 */
function validateJSDocAccuracy(item) {
	const issues = [];
	
	if (!item.hasJSDoc || !item.jsdoc) {
		return { accurate: true, issues: [] }; // Can't validate if no JSDoc
	}
	
	const jsdoc = item.jsdoc;
	const actualParams = item.actualParams || [];
	const documentedParams = jsdoc.params.map(p => p.name);
	
	// Check for hallucinated parameters (documented but not in actual signature)
	const hallucinatedParams = documentedParams.filter(p => !actualParams.includes(p));
	if (hallucinatedParams.length > 0) {
		issues.push(`Hallucinated parameters (not in actual signature): ${hallucinatedParams.join(', ')}`);
	}
	
	// Check for parameter order mismatch
	const commonParams = actualParams.filter(p => documentedParams.includes(p));
	if (commonParams.length > 0) {
		const actualOrder = commonParams.map(p => actualParams.indexOf(p));
		const docOrder = commonParams.map(p => documentedParams.indexOf(p));
		
		for (let i = 0; i < actualOrder.length - 1; i++) {
			if (actualOrder[i] > actualOrder[i + 1] && docOrder[i] < docOrder[i + 1]) {
				issues.push('Parameter order in JSDoc does not match actual signature');
				break;
			}
		}
	}
	
	return {
		accurate: issues.length === 0,
		issues
	};
}

/**
 * Get all markdown files recursively
 * @param {string} dir Directory to scan
 * @param {Array<string>} fileList Accumulated file list
 * @returns {Array<string>} List of markdown file paths
 */
function getMarkdownFiles(dir, fileList = []) {
	if (!fs.existsSync(dir)) return fileList;
	
	const files = fs.readdirSync(dir);
	
	files.forEach(file => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		
		if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
			getMarkdownFiles(filePath, fileList);
		} else if (file.endsWith('.md')) {
			fileList.push(filePath);
		}
	});
	
	return fileList;
}

/**
 * Extract links from markdown content
 * @param {string} content Markdown content
 * @returns {Array<Object>} Array of links with line numbers
 */
function extractLinks(content) {
	const links = [];
	const lines = content.split('\n');
	
	// Match markdown links [text](url) and bare URLs
	const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
	
	lines.forEach((line, index) => {
		let match;
		while ((match = linkPattern.exec(line)) !== null) {
			links.push({
				text: match[1],
				url: match[2],
				line: index + 1
			});
		}
	});
	
	return links;
}

/**
 * Validate a single link
 * @param {string} link Link URL
 * @param {string} sourceFile Source file containing the link
 * @returns {Object} Validation result
 */
function validateLink(link, sourceFile) {
	// Skip anchor links
	if (link.startsWith('#')) {
		return { valid: true, type: 'anchor' };
	}
	
	// External URLs
	if (link.startsWith('http://') || link.startsWith('https://')) {
		return { valid: true, type: 'external', note: 'External link not validated' };
	}
	
	// Internal relative links
	const sourceDir = path.dirname(sourceFile);
	const targetPath = path.resolve(sourceDir, link.split('#')[0]); // Remove anchor
	
	if (fs.existsSync(targetPath)) {
		return { valid: true, type: 'internal' };
	}
	
	// Try relative to root
	const rootPath = path.resolve(ROOT_DIR, link.split('#')[0]);
	if (fs.existsSync(rootPath)) {
		return { valid: true, type: 'internal' };
	}
	
	return { valid: false, type: 'internal', error: 'File not found' };
}

/**
 * Validate links in all documentation files
 * @returns {Object} Link validation results
 */
function validateDocumentationLinks() {
	console.log('\nValidating documentation links...');
	
	const markdownFiles = [
		...getMarkdownFiles(DOCS_DIR),
		path.join(ROOT_DIR, 'README.md'),
		path.join(ROOT_DIR, 'CHANGELOG.md'),
		path.join(ROOT_DIR, 'SECURITY.md')
	].filter(f => fs.existsSync(f));
	
	const brokenLinks = [];
	let totalLinks = 0;
	let validLinks = 0;
	
	markdownFiles.forEach(file => {
		const content = fs.readFileSync(file, 'utf-8');
		const links = extractLinks(content);
		
		links.forEach(link => {
			totalLinks++;
			const validation = validateLink(link.url, file);
			
			if (validation.valid) {
				validLinks++;
			} else {
				brokenLinks.push({
					file: path.relative(ROOT_DIR, file),
					line: link.line,
					text: link.text,
					url: link.url,
					error: validation.error
				});
			}
		});
	});
	
	console.log(`  Checked ${totalLinks} links in ${markdownFiles.length} files`);
	console.log(`  Valid: ${validLinks}, Broken: ${brokenLinks.length}`);
	
	return {
		totalLinks,
		validLinks,
		brokenLinks,
		filesChecked: markdownFiles.length
	};
}

/**
 * Extract code examples from markdown content
 * @param {string} content Markdown content
 * @returns {Array<Object>} Array of code examples
 */
function extractCodeExamples(content) {
	const examples = [];
	const lines = content.split('\n');
	let inCodeBlock = false;
	let currentExample = null;
	let lineNumber = 0;
	
	lines.forEach((line, index) => {
		if (line.trim().startsWith('```javascript') || line.trim().startsWith('```js')) {
			inCodeBlock = true;
			lineNumber = index + 1;
			currentExample = {
				code: '',
				startLine: lineNumber
			};
		} else if (line.trim() === '```' && inCodeBlock) {
			inCodeBlock = false;
			if (currentExample && currentExample.code.trim()) {
				examples.push(currentExample);
			}
			currentExample = null;
		} else if (inCodeBlock && currentExample) {
			currentExample.code += line + '\n';
		}
	});
	
	return examples;
}

/**
 * Validate JavaScript code syntax
 * @param {string} code JavaScript code
 * @returns {Object} Validation result
 */
async function validateCodeSyntax(code) {
	// Create a temporary file
	const tempFile = path.join(ROOT_DIR, '.temp-validation.mjs');
	
	try {
		fs.writeFileSync(tempFile, code);
		
		// Try to parse with Node.js
		await execAsync(`node --check ${tempFile}`);
		
		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error.message
		};
	} finally {
		// Clean up temp file
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
	}
}

/**
 * Validate example code in documentation files
 * @returns {Promise<Object>} Example validation results
 */
async function validateExampleCode() {
	console.log('\nValidating example code...');
	
	const markdownFiles = [
		...getMarkdownFiles(DOCS_DIR),
		path.join(ROOT_DIR, 'README.md')
	].filter(f => fs.existsSync(f));
	
	const invalidExamples = [];
	let totalExamples = 0;
	let validExamples = 0;
	
	for (const file of markdownFiles) {
		const content = fs.readFileSync(file, 'utf-8');
		const examples = extractCodeExamples(content);
		
		for (const example of examples) {
			totalExamples++;
			const validation = await validateCodeSyntax(example.code);
			
			if (validation.valid) {
				validExamples++;
			} else {
				invalidExamples.push({
					file: path.relative(ROOT_DIR, file),
					line: example.startLine,
					error: validation.error,
					code: example.code.substring(0, 100) + (example.code.length > 100 ? '...' : '')
				});
			}
		}
	}
	
	console.log(`  Checked ${totalExamples} code examples in ${markdownFiles.length} files`);
	console.log(`  Valid: ${validExamples}, Invalid: ${invalidExamples.length}`);
	
	return {
		totalExamples,
		validExamples,
		invalidExamples,
		filesChecked: markdownFiles.length
	};
}

/**
 * Generate audit report
 */
async function generateAuditReport() {
	console.log('Starting documentation audit and validation...\n');
	
	const files = getJavaScriptFiles(SRC_DIR);
	console.log(`Found ${files.length} JavaScript files\n`);
	
	const fileAnalyses = [];
	let totalExports = 0;
	let documentedExports = 0;
	let completeExports = 0;
	const missingJSDoc = [];
	const incompleteJSDoc = [];
	const inaccurateJSDoc = [];
	
	files.forEach(file => {
		console.log(`Analyzing: ${path.relative(SRC_DIR, file)}`);
		const analysis = analyzeFile(file);
		fileAnalyses.push(analysis);
		
		analysis.exports.forEach(item => {
			totalExports++;
			
			if (item.hasJSDoc) {
				documentedExports++;
			} else {
				missingJSDoc.push({
					file: analysis.filePath,
					name: item.name,
					type: item.type
				});
			}
			
			const completeness = analyzeCompleteness(item);
			if (completeness.complete) {
				completeExports++;
			} else if (item.hasJSDoc) {
				incompleteJSDoc.push({
					file: analysis.filePath,
					name: item.name,
					type: item.type,
					issues: completeness.issues
				});
			}
			
			// Validate accuracy
			const accuracy = validateJSDocAccuracy(item);
			if (!accuracy.accurate) {
				inaccurateJSDoc.push({
					file: analysis.filePath,
					name: item.name,
					type: item.type,
					issues: accuracy.issues
				});
			}
		});
	});
	
	// Validate documentation links
	const linkValidation = validateDocumentationLinks();
	
	// Validate example code
	const exampleValidation = await validateExampleCode();
	
	const report = {
		auditDate: new Date().toISOString(),
		summary: {
			totalFiles: files.length,
			totalPublicFunctions: totalExports,
			documentedFunctions: documentedExports,
			completeFunctions: completeExports,
			missingJSDocCount: missingJSDoc.length,
			incompleteJSDocCount: incompleteJSDoc.length,
			inaccurateJSDocCount: inaccurateJSDoc.length,
			coveragePercentage: totalExports > 0 ? ((documentedExports / totalExports) * 100).toFixed(2) : 0,
			completenessPercentage: totalExports > 0 ? ((completeExports / totalExports) * 100).toFixed(2) : 0,
			brokenLinksCount: linkValidation.brokenLinks.length,
			invalidExamplesCount: exampleValidation.invalidExamples.length,
			criticalErrors: missingJSDoc.length + inaccurateJSDoc.length + linkValidation.brokenLinks.length + exampleValidation.invalidExamples.length
		},
		jsdocAnalysis: {
			missingJSDoc,
			incompleteJSDoc,
			inaccurateJSDoc
		},
		linkValidation,
		exampleValidation,
		fileAnalyses
	};
	
	// Ensure output directory exists
	const outputDir = path.dirname(OUTPUT_FILE);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	
	// Write report to file
	fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
	
	// Print summary
	console.log('\n' + '='.repeat(60));
	console.log('DOCUMENTATION AUDIT AND VALIDATION SUMMARY');
	console.log('='.repeat(60));
	console.log('\nJSDoc Analysis:');
	console.log(`  Total Files Analyzed: ${report.summary.totalFiles}`);
	console.log(`  Total Public Functions/Classes: ${report.summary.totalPublicFunctions}`);
	console.log(`  Documented: ${report.summary.documentedFunctions} (${report.summary.coveragePercentage}%)`);
	console.log(`  Complete Documentation: ${report.summary.completeFunctions} (${report.summary.completenessPercentage}%)`);
	console.log(`  Missing JSDoc: ${report.summary.missingJSDocCount}`);
	console.log(`  Incomplete JSDoc: ${report.summary.incompleteJSDocCount}`);
	console.log(`  Inaccurate JSDoc: ${report.summary.inaccurateJSDocCount}`);
	
	console.log('\nLink Validation:');
	console.log(`  Total Links Checked: ${linkValidation.totalLinks}`);
	console.log(`  Valid Links: ${linkValidation.validLinks}`);
	console.log(`  Broken Links: ${linkValidation.brokenLinks.length}`);
	
	console.log('\nExample Code Validation:');
	console.log(`  Total Examples Checked: ${exampleValidation.totalExamples}`);
	console.log(`  Valid Examples: ${exampleValidation.validExamples}`);
	console.log(`  Invalid Examples: ${exampleValidation.invalidExamples.length}`);
	
	console.log('\n' + '='.repeat(60));
	console.log(`CRITICAL ERRORS: ${report.summary.criticalErrors}`);
	console.log('='.repeat(60));
	console.log(`\nDetailed report saved to: ${OUTPUT_FILE}\n`);
	
	// Exit with error code if critical errors found
	if (report.summary.criticalErrors > 0) {
		console.error('❌ Validation failed with critical errors');
		return report;
	} else {
		console.log('✅ All validation checks passed');
		return report;
	}
}

// Run the audit
try {
	const report = await generateAuditReport();
	// Exit with error code if there are critical errors
	if (report.summary.criticalErrors > 0) {
		process.exit(1);
	}
} catch (error) {
	console.error('Error during audit:', error);
	process.exit(1);
}
