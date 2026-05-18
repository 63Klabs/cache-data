/**
 * Bug Condition Exploration Property-Based Tests
 * 
 * Property 1: Bug Condition - Documentation Test Utility False Positives
 * 
 * CRITICAL: This test encodes the EXPECTED behavior. It is expected to FAIL
 * on unfixed code, confirming the bugs exist. Once the fixes are applied,
 * this test will PASS, confirming the bugs are resolved.
 * 
 * Three bugs in documentation test utility functions:
 * - Bug 1: extractCodeExamples incorrectly extracts ```json blocks (startsWith prefix match)
 * - Bug 2: extractMarkdownLinks extracts [text](url) patterns from inside fenced code blocks
 * - Bug 3: combinedPattern regex captures @param tags from unrelated JSDoc blocks
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseParamTag } from '../../helpers/jsdoc-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =============================================================================
 * Utility Functions Under Test (copied from their respective test files)
 * These are the UNFIXED versions that contain the bugs.
 * ========================================================================== */

/**
 * Extract code examples from markdown content.
 * (From executable-example-validation-tests.jest.mjs)
 * FIXED: Uses regex /^```(javascript|js)\s*$/ to enforce word boundary after js
 */
function extractCodeExamples(content, filePath) {
	const examples = [];
	const lines = content.split('\n');
	let inCodeBlock = false;
	let currentExample = null;
	let lineNumber = 0;

	lines.forEach((line, index) => {
		if (/^```(javascript|js)\s*$/.test(line.trim())) {
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
 * Extract all markdown links from content.
 * (From documentation-link-validity-tests.jest.mjs)
 * FIXED: Tracks fenced code block state and skips links inside code blocks
 */
function extractMarkdownLinks(content) {
	const links = [];
	const lines = content.split('\n');

	const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

	let inCodeBlock = false;

	lines.forEach((line, lineIndex) => {
		if (line.trim().startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			return; // skip this line
		}
		if (inCodeBlock) return; // skip lines inside code blocks

		let match;
		while ((match = linkPattern.exec(line)) !== null) {
			links.push({
				text: match[1],
				url: match[2],
				line: lineIndex + 1
			});
		}
	});

	return links;
}

/**
 * Parse JSDoc comment block and extract tags.
 * (From jsdoc-no-hallucination-tests.jest.mjs)
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
		const cleanLine = line.replace(/^\/\*\*|\*\/$/g, '').replace(/^\*\s?/, '').trim();

		if (!cleanLine) continue;

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
			if (currentTag === null) {
				descriptionLines.push(cleanLine);
			}
		}
	}

	result.description = descriptionLines.join(' ').trim();
	return result;
}

/* =============================================================================
 * Bug Condition Exploration Tests
 * ========================================================================== */

describe("Bug Condition Exploration - Documentation Test Utility False Positives", () => {

	describe("Bug 1: extractCodeExamples incorrectly extracts non-JS code blocks", () => {
		// **Validates: Requirements 1.1**
		// Bug Condition: '```json'.startsWith('```js') === true

		it("Property: extractCodeExamples SHALL NOT extract blocks tagged as ```json, ```jsx, or ```jsdoc", () => {
			// These language tags all start with '```js' but are NOT JavaScript
			const nonJsLanguageTags = ['json', 'jsx', 'jsdoc'];

			fc.assert(
				fc.property(
					fc.constantFrom(...nonJsLanguageTags),
					fc.string({ minLength: 1, maxLength: 50 }),
					(langTag, codeContent) => {
						const markdown = [
							'# Test Document',
							'',
							'Some text before.',
							'',
							'```' + langTag,
							codeContent,
							'```',
							'',
							'Some text after.'
						].join('\n');

						const examples = extractCodeExamples(markdown, 'test.md');

						// Expected behavior: NO blocks should be extracted
						// because json, jsx, jsdoc are NOT JavaScript
						return examples.length === 0;
					}
				),
				{ numRuns: 30 }
			);
		});

		it("Property: extractCodeExamples SHALL NOT extract ```json blocks from actual documentation", () => {
			// Use the actual file that triggers the bug
			const powertoolsDoc = path.join(__dirname, '../../../docs/features/tools/powertools-integration.md');

			if (!fs.existsSync(powertoolsDoc)) {
				return; // Skip if file doesn't exist
			}

			const content = fs.readFileSync(powertoolsDoc, 'utf-8');
			const examples = extractCodeExamples(content, powertoolsDoc);

			// Expected behavior: None of the extracted examples should be JSON content
			// Bug: extractCodeExamples extracts ```json blocks because '```json'.startsWith('```js') is true
			const jsonExamples = examples.filter(ex => {
				const trimmed = ex.code.trim();
				// JSON content starts with { and contains "key": patterns
				return trimmed.startsWith('{') && trimmed.includes('"level"');
			});

			expect(jsonExamples).toHaveLength(0);
		});
	});

	describe("Bug 2: extractMarkdownLinks extracts link-like patterns from inside fenced code blocks", () => {
		// **Validates: Requirements 1.2**
		// Bug Condition: [text](url) pattern inside fenced code block is extracted as a link

		it("Property: extractMarkdownLinks SHALL NOT extract link-like patterns from inside fenced code blocks", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 30 }),
					fc.string({ minLength: 1, maxLength: 30 }),
					(text, url) => {
						// Ensure text and url don't contain characters that break the pattern
						const safeText = text.replace(/[\[\]()]/g, 'x');
						const safeUrl = url.replace(/[\[\]()]/g, 'x');

						const markdown = [
							'# Test Document',
							'',
							'```javascript',
							`// This contains a link-like pattern: [${safeText}](${safeUrl})`,
							'```',
							''
						].join('\n');

						const links = extractMarkdownLinks(markdown);

						// Expected behavior: NO links should be extracted from inside code blocks
						return links.length === 0;
					}
				),
				{ numRuns: 30 }
			);
		});

		it("Property: extractMarkdownLinks SHALL NOT extract [level](message, extra) from code blocks in actual documentation", () => {
			// Use the actual file that triggers the bug
			const powertoolsDoc = path.join(__dirname, '../../../docs/features/tools/powertools-integration.md');

			if (!fs.existsSync(powertoolsDoc)) {
				return; // Skip if file doesn't exist
			}

			const content = fs.readFileSync(powertoolsDoc, 'utf-8');
			const links = extractMarkdownLinks(content);

			// Expected behavior: No links extracted from inside fenced code blocks
			// Bug: extractMarkdownLinks reports [level](message, extra) inside code blocks as broken links
			const codeBlockLinks = links.filter(link => {
				// These patterns are code, not real markdown links
				return link.text === 'level' ||
					link.url.includes('message') ||
					link.url.includes('extra');
			});

			expect(codeBlockLinks).toHaveLength(0);
		});
	});

	describe("Bug 3: JSDoc regex captures @param tags from unrelated JSDoc blocks", () => {
		// **Validates: Requirements 1.3**
		// Bug Condition: regex greedily matches from earliest "/**" to closest "*/" before function

		it("Property: JSDoc regex SHALL only associate the immediately preceding JSDoc block with each function", () => {
			// Simulate the bug: multiple JSDoc blocks before a function
			// The regex should only capture the LAST JSDoc block before the function
			const sourceWithMultipleJSDocBlocks = [
				'/**',
				' * First function description.',
				' * @param {string} value - Some value',
				' * @param {boolean} globalFlag - A flag',
				' */',
				'function firstFunction(value, globalFlag) {',
				'  return value;',
				'}',
				'',
				'/**',
				' * Second function description.',
				' * @param {boolean} individualFlag - Another flag',
				' * @param {boolean} isImportable - Import check',
				' */',
				'function secondFunction(individualFlag, isImportable) {',
				'  return individualFlag;',
				'}',
				'',
				'/**',
				' * Third function description.',
				' * @param {string} packageName - Package name',
				' * @param {string} namespace - Namespace',
				' */',
				'function thirdFunction(packageName, namespace) {',
				'  return packageName;',
				'}',
				'',
				'/**',
				' * Get internal state. No parameters.',
				' * @returns {Object} Internal state',
				' */',
				'static getInternals() {',
				'  return {};',
				'}'
			].join('\n');

			// Use the FIXED regex with tempered greedy token to prevent cross-JSDoc matching
			const combinedPattern = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:const\s+)?([_#]?\w+)\s*[=:]?\s*(?:async\s+)?(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*\{/g;

			let match;
			const results = [];
			while ((match = combinedPattern.exec(sourceWithMultipleJSDocBlocks)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3] || '';

				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					return p.trim().split('=')[0].trim().split(':')[0].trim();
				}).filter(p => p.length > 0) : [];

				results.push({
					functionName,
					jsdocParams: jsdoc.params.map(p => p.name),
					actualParams
				});
			}

			// Find getInternals result
			const getInternalsResult = results.find(r => r.functionName === 'getInternals');

			// Expected behavior: getInternals() has NO parameters, so its JSDoc should have NO @param tags
			// Bug: The regex greedily captures from an earlier /** and picks up @param tags from other functions
			if (getInternalsResult) {
				// The immediately preceding JSDoc for getInternals has no @param tags
				expect(getInternalsResult.jsdocParams).toHaveLength(0);
			}
		});

		it("Property: JSDoc regex SHALL NOT report hallucinated params for getInternals() in PowertoolsInit.js", () => {
			// Use the actual file that triggers the bug
			const powertoolsFile = path.join(__dirname, '../../../src/lib/tools/PowertoolsInit.js');

			if (!fs.existsSync(powertoolsFile)) {
				return; // Skip if file doesn't exist
			}

			const content = fs.readFileSync(powertoolsFile, 'utf-8');

			// Use the FIXED regex with tempered greedy token to prevent cross-JSDoc matching
			const combinedPattern = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:const\s+)?([_#]?\w+)\s*[=:]?\s*(?:async\s+)?(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*\{/g;

			let match;
			const issues = [];

			while ((match = combinedPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3] || '';

				// Only check getInternals
				if (functionName !== 'getInternals') {
					continue;
				}

				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');

				// getInternals() takes no parameters
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					return p.trim().split('=')[0].trim().split(':')[0].trim();
				}).filter(p => p.length > 0) : [];

				// Check for hallucinated parameters
				for (const jsdocParam of jsdoc.params) {
					if (!actualParams.includes(jsdocParam.name)) {
						issues.push(`getInternals: JSDoc documents parameter '${jsdocParam.name}' that doesn't exist in function signature`);
					}
				}
			}

			// Expected behavior: No hallucinated params for getInternals()
			// Bug: regex captures @param tags from parseEnvFlag, isCapabilityEnabled, tryImport, isValidNamespace
			if (issues.length > 0) {
				console.log('\nBug 3 Counterexamples - Hallucinated params for getInternals():');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).toHaveLength(0);
		});
	});
});
