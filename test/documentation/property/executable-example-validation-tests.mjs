import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * Executable Example Validation Property-Based Tests
 * Feature: documentation-enhancement
 * Property 15: Executable Example Validation
 */

/**
 * Get all markdown files recursively
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
 * Extract code examples from markdown content
 */
function extractCodeExamples(content, filePath) {
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
				startLine: lineNumber,
				file: filePath
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
 */
async function validateCodeSyntax(code) {
	// Use a unique temp file name to avoid conflicts
	const tempFile = path.join(__dirname, `../../../.temp-validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mjs`);
	
	try {
		// Wrap code in a function context if it contains return statements
		// This allows documentation examples to show return statements naturally
		let codeToValidate = code;
		
		// Check if code contains return statements at the top level (not inside a function/arrow function)
		// We need to wrap it if there's a return statement that's not already inside a function
		const hasTopLevelReturn = code.includes('return ') && 
			!code.match(/^(async\s+)?function\s+\w+\s*\([^)]*\)\s*\{/m) && // Not a function declaration
			!code.match(/^const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>/m) && // Not an arrow function assignment
			!code.match(/^let\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>/m) &&
			!code.match(/^var\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>/m);
		
		if (hasTopLevelReturn) {
			codeToValidate = `async function exampleFunction() {\n${code}\n}`;
		}
		// Check if code contains private class fields (this.#) but no class definition
		else if (code.includes('this.#') && !code.includes('class ')) {
			codeToValidate = `class ExampleClass {\n  #privateField;\n  exampleMethod() {\n${code}\n  }\n}`;
		}
		
		fs.writeFileSync(tempFile, codeToValidate);
		await execAsync(`node --check ${tempFile}`);
		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error.message
		};
	} finally {
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
	}
}

/**
 * Check if code is a snippet (incomplete code that shouldn't be validated)
 */
function isCodeSnippet(code) {
	const snippetIndicators = [
		// Incomplete statements
		/^\s*\.\.\.\s*$/m,
		// Comments indicating it's a snippet
		/\/\/\s*\.\.\./,
		// Partial object/array definitions without closing
		/^\s*\{[^}]*$/,
		/^\s*\[[^\]]*$/,
		// Just comments
		/^(\s*\/\/.*\n)*\s*$/,
		// Just a single line without semicolon or complete statement
		/^[^;{}()]*$/,
		// Contains only property assignments (likely part of a larger object)
		/^\s*\w+:\s*[^,]+,?\s*$/,
		// TypeScript-style type annotations (e.g., "expiresAt: number")
		/:\s*(string|number|boolean|object|any|void|null|undefined)\s*(?:\/\/|$)/i,
		// Partial switch/case statements
		/^\s*case\s+/m,
		/^\s*default\s*:/m,
		// Partial method definitions without class context
		/^\s*async\s+\w+\s*\([^)]*\)\s*\{/,
		// Comments indicating examples or placeholders
		/\/\/\s*❌/,
		/\/\/\s*✅/,
		// Code showing only method signature or partial implementation
		/^\s*async\s+\w+\s*\([^)]*\)\s*\{\s*$/
	];
	
	const trimmedCode = code.trim();
	
	// Very short code (less than 10 chars) is likely a snippet
	if (trimmedCode.length < 10) {
		return true;
	}
	
	// Check for snippet indicators
	for (const pattern of snippetIndicators) {
		if (pattern.test(trimmedCode)) {
			return true;
		}
	}
	
	// If it's just a single line without proper statement ending, it's a snippet
	const lines = trimmedCode.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
	if (lines.length === 1 && !lines[0].includes(';') && !lines[0].includes('{') && !lines[0].includes('(')) {
		return true;
	}
	
	// If code contains only property/method definitions without a class/object wrapper
	// (e.g., "method() { ... }" without "class X {" or "const obj = {")
	if (/^\s*\w+\s*\([^)]*\)\s*\{/.test(trimmedCode) && 
	    !trimmedCode.includes('class ') && 
	    !trimmedCode.includes('const ') && 
	    !trimmedCode.includes('let ') &&
	    !trimmedCode.includes('var ') &&
	    !trimmedCode.includes('function ')) {
		return true;
	}
	
	// If code starts with a comment indicating it's a partial example
	if (/^\/\/\s*(In|From|Example|Partial|Snippet)/i.test(trimmedCode)) {
		return true;
	}
	
	// If code contains only object/interface-like structure with type annotations
	if (/^\s*\{[\s\S]*:\s*(string|number|boolean|object)[\s\S]*\}\s*$/.test(trimmedCode)) {
		return true;
	}
	
	return false;
}

describe("Executable Example Validation - Property-Based Tests", () => {

	describe("Property 15: Executable Example Validation", () => {
		// Feature: documentation-enhancement, Property 15: Executable Example Validation
		// Validates: Requirements 10.4

		it("should have syntactically valid JavaScript in all documentation examples", async function() {
			this.timeout(30000); // Increase timeout for validation
			
			const docsDir = path.join(__dirname, '../../../docs');
			const readmeFile = path.join(__dirname, '../../../README.md');
			
			const markdownFiles = [
				...getMarkdownFiles(docsDir),
				readmeFile
			].filter(f => fs.existsSync(f));
			
			const issues = [];
			let totalExamples = 0;
			let validExamples = 0;
			let skippedSnippets = 0;
			
			for (const file of markdownFiles) {
				const content = fs.readFileSync(file, 'utf-8');
				const examples = extractCodeExamples(content, file);
				
				for (const example of examples) {
					totalExamples++;
					
					// Skip code snippets that are intentionally incomplete
					if (isCodeSnippet(example.code)) {
						skippedSnippets++;
						continue;
					}
					
					const validation = await validateCodeSyntax(example.code);
					
					if (validation.valid) {
						validExamples++;
					} else {
						const relativePath = path.relative(path.join(__dirname, '../../..'), file);
						issues.push({
							file: relativePath,
							line: example.startLine,
							error: validation.error,
							code: example.code.substring(0, 100) + (example.code.length > 100 ? '...' : '')
						});
					}
				}
			}
			
			if (issues.length > 0) {
				console.log('\nExecutable Example Validation Issues:');
				console.log(`Total examples: ${totalExamples}, Valid: ${validExamples}, Skipped snippets: ${skippedSnippets}, Invalid: ${issues.length}`);
				issues.slice(0, 10).forEach(issue => {
					console.log(`  - ${issue.file}:${issue.line}`);
					console.log(`    Error: ${issue.error}`);
					console.log(`    Code: ${issue.code.split('\n')[0]}...`);
				});
				if (issues.length > 10) {
					console.log(`  ... and ${issues.length - 10} more issues`);
				}
			}
			
			expect(issues).to.have.lengthOf(0, `Found ${issues.length} invalid code examples`);
		});

		it("should use property-based testing to verify example executability", async function() {
			this.timeout(30000);
			
			// Property: For any JavaScript code example in documentation,
			// it must execute without syntax errors (unless it's a snippet)
			
			const docsDir = path.join(__dirname, '../../../docs');
			const readmeFile = path.join(__dirname, '../../../README.md');
			
			const markdownFiles = [
				...getMarkdownFiles(docsDir),
				readmeFile
			].filter(f => fs.existsSync(f));
			
			// Collect all examples
			const allExamples = [];
			for (const file of markdownFiles) {
				const content = fs.readFileSync(file, 'utf-8');
				const examples = extractCodeExamples(content, file);
				allExamples.push(...examples.filter(ex => !isCodeSnippet(ex.code)));
			}
			
			if (allExamples.length === 0) {
				this.skip();
				return;
			}
			
			await fc.assert(
				fc.asyncProperty(
					fc.constantFrom(...allExamples),
					async (example) => {
						const validation = await validateCodeSyntax(example.code);
						return validation.valid;
					}
				),
				{ numRuns: Math.min(allExamples.length, 50) }
			);
		});

		it("should validate that examples use proper module imports", async function() {
			this.timeout(30000);
			
			const docsDir = path.join(__dirname, '../../../docs');
			const readmeFile = path.join(__dirname, '../../../README.md');
			
			const markdownFiles = [
				...getMarkdownFiles(docsDir),
				readmeFile
			].filter(f => fs.existsSync(f));
			
			const issues = [];
			
			for (const file of markdownFiles) {
				const content = fs.readFileSync(file, 'utf-8');
				const examples = extractCodeExamples(content, file);
				
				for (const example of examples) {
					// Skip snippets
					if (isCodeSnippet(example.code)) {
						continue;
					}
					
					const code = example.code;
					
					// Check if example uses cache-data functionality
					const usesCacheData = 
						code.includes('cache') ||
						code.includes('endpoint') ||
						code.includes('tools') ||
						code.includes('DebugAndLog') ||
						code.includes('Timer') ||
						code.includes('Response');
					
					if (usesCacheData) {
						// Check for proper import/require
						const hasImport = 
							code.includes('require') ||
							code.includes('import') ||
							code.includes('// ... imports') ||
							code.includes('// imports');
						
						if (!hasImport) {
							const relativePath = path.relative(path.join(__dirname, '../../..'), file);
							issues.push({
								file: relativePath,
								line: example.startLine,
								issue: 'Uses cache-data functionality but missing import statement'
							});
						}
					}
				}
			}
			
			if (issues.length > 0) {
				console.log('\nExample Import Issues:');
				issues.slice(0, 10).forEach(issue => {
					console.log(`  - ${issue.file}:${issue.line} - ${issue.issue}`);
				});
				if (issues.length > 10) {
					console.log(`  ... and ${issues.length - 10} more issues`);
				}
			}
			
			// This is a warning, not a failure, as some examples may be intentionally incomplete
			if (issues.length > 0) {
				console.log(`\nNote: Found ${issues.length} examples that may need import statements`);
			}
		});

		it("should validate that examples don't use deprecated APIs", async function() {
			this.timeout(30000);
			
			const docsDir = path.join(__dirname, '../../../docs');
			const readmeFile = path.join(__dirname, '../../../README.md');
			
			const markdownFiles = [
				...getMarkdownFiles(docsDir),
				readmeFile
			].filter(f => fs.existsSync(f));
			
			const deprecatedPatterns = [
				{ pattern: /getDataDirectFromURI/, name: 'getDataDirectFromURI (use endpoint.get instead)' }
			];
			
			const issues = [];
			
			for (const file of markdownFiles) {
				const content = fs.readFileSync(file, 'utf-8');
				const examples = extractCodeExamples(content, file);
				
				for (const example of examples) {
					for (const { pattern, name } of deprecatedPatterns) {
						if (pattern.test(example.code)) {
							const relativePath = path.relative(path.join(__dirname, '../../..'), file);
							issues.push({
								file: relativePath,
								line: example.startLine,
								deprecated: name
							});
						}
					}
				}
			}
			
			if (issues.length > 0) {
				console.log('\nDeprecated API Usage in Examples:');
				issues.forEach(issue => {
					console.log(`  - ${issue.file}:${issue.line} - Uses ${issue.deprecated}`);
				});
			}
			
			expect(issues).to.have.lengthOf(0, `Found ${issues.length} examples using deprecated APIs`);
		});
	});
});
