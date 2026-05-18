/**
 * Preservation Property-Based Tests for Documentation Test Utilities
 * 
 * These tests capture the CORRECT behavior of the test utility functions
 * that must be preserved after the bugfix. They verify behavior on non-buggy
 * inputs (inputs that do NOT trigger the bug conditions).
 * 
 * Property 2: Preservation - Documentation Test Utility Correct Behavior
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseParamTag } from '../../helpers/jsdoc-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * Utility functions copied from the test files under test (unfixed versions)
 * These are the SAME functions used in the actual test files.
 * ***************************************************************************/

/**
 * Extract code examples from markdown content
 * (Copied from executable-example-validation-tests.jest.mjs)
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
 * Extract all markdown links from content
 * (Copied from documentation-link-validity-tests.jest.mjs)
 */
function extractMarkdownLinks(content) {
	const links = [];
	const lines = content.split('\n');

	// Match markdown links: [text](url)
	const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

	lines.forEach((line, lineIndex) => {
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
 * Parse JSDoc comment block and extract tags
 * (Copied from jsdoc-no-hallucination-tests.jest.mjs)
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

/* ****************************************************************************
 * Generators for property-based tests
 * ***************************************************************************/

/**
 * Generate random JavaScript code content for code blocks
 */
const jsCodeContent = fc.array(
	fc.oneof(
		fc.constant('const x = 1;'),
		fc.constant('function foo() { return 42; }'),
		fc.constant('console.log("hello");'),
		fc.constant('const arr = [1, 2, 3];'),
		fc.constant('async function getData() { return await fetch("/api"); }'),
		fc.constant('class MyClass { constructor() {} }'),
		fc.constant('const result = arr.map(x => x * 2);'),
		fc.constant('if (condition) { doSomething(); }')
	),
	{ minLength: 1, maxLength: 5 }
).map(lines => lines.join('\n'));

/**
 * Generate markdown content with exactly ```javascript or ```js blocks
 */
const markdownWithJsBlocks = fc.tuple(
	fc.constantFrom('```javascript', '```js'),
	jsCodeContent,
	fc.string({ minLength: 0, maxLength: 50 })
).map(([tag, code, prefix]) => {
	const prefixText = prefix ? `# Some heading\n\n${prefix}\n\n` : '';
	return `${prefixText}${tag}\n${code}\n\`\`\`\n`;
});

/**
 * Generate markdown content with non-JS language blocks that should be skipped
 */
const nonJsLanguageTags = fc.constantFrom(
	'```yaml', '```bash', '```python', '```shell',
	'```css', '```html', '```sql', '```ruby',
	'```go', '```rust', '```c', '```cpp'
);

/**
 * Generate markdown content with links outside code blocks
 */
const linkText = fc.constantFrom(
	'Click here', 'Documentation', 'API Reference', 'Getting Started',
	'Installation', 'Usage Guide', 'Examples', 'Contributing',
	'License', 'Changelog', 'Source Code', 'Related'
);

const linkUrl = fc.constantFrom(
	'https://example.com',
	'./docs/readme.md',
	'../other-file.md',
	'https://github.com/org/repo',
	'./src/index.js',
	'#section-name'
);

/* ****************************************************************************
 * Preservation Property Tests
 * ***************************************************************************/

describe("Property 2: Preservation - Documentation Test Utility Correct Behavior", () => {

	describe("Preservation 4: extractCodeExamples correctly extracts ```javascript and ```js blocks", () => {
		/**
		 * Validates: Requirements 3.1, 3.4
		 * 
		 * For all markdown content with ```javascript or ```js (exact tag) blocks,
		 * extractCodeExamples extracts those blocks.
		 */

		it("Property: For all markdown with ```javascript blocks, extractCodeExamples extracts them", () => {
			fc.assert(
				fc.property(
					jsCodeContent,
					(code) => {
						const markdown = `# Test\n\n\`\`\`javascript\n${code}\n\`\`\`\n`;
						const examples = extractCodeExamples(markdown, 'test.md');

						// Should extract at least one example
						expect(examples.length).toBeGreaterThanOrEqual(1);
						// The extracted code should contain the original code
						expect(examples[0].code.trim()).toBe(code.trim());
					}
				),
				{ numRuns: 50 }
			);
		});

		it("Property: For all markdown with ```js blocks, extractCodeExamples extracts them", () => {
			fc.assert(
				fc.property(
					jsCodeContent,
					(code) => {
						const markdown = `# Test\n\n\`\`\`js\n${code}\n\`\`\`\n`;
						const examples = extractCodeExamples(markdown, 'test.md');

						// Should extract at least one example
						expect(examples.length).toBeGreaterThanOrEqual(1);
						// The extracted code should contain the original code
						expect(examples[0].code.trim()).toBe(code.trim());
					}
				),
				{ numRuns: 50 }
			);
		});

		it("Property: For all markdown with either ```javascript or ```js, extraction succeeds", () => {
			fc.assert(
				fc.property(
					fc.constantFrom('```javascript', '```js'),
					jsCodeContent,
					(tag, code) => {
						const markdown = `Some text before\n\n${tag}\n${code}\n\`\`\`\n\nSome text after\n`;
						const examples = extractCodeExamples(markdown, 'test.md');

						expect(examples.length).toBe(1);
						expect(examples[0].code.trim()).toBe(code.trim());
						expect(examples[0].file).toBe('test.md');
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe("Preservation 4b: extractCodeExamples correctly skips non-JS language blocks", () => {
		/**
		 * Validates: Requirements 3.4
		 * 
		 * For all markdown content with ```yaml, ```bash, ```python blocks,
		 * extractCodeExamples does NOT extract those blocks.
		 */

		it("Property: For all markdown with non-JS language blocks, extractCodeExamples does NOT extract them", () => {
			fc.assert(
				fc.property(
					nonJsLanguageTags,
					fc.constant('key: value\nnested:\n  item: true'),
					(tag, code) => {
						const markdown = `# Test\n\n${tag}\n${code}\n\`\`\`\n`;
						const examples = extractCodeExamples(markdown, 'test.md');

						// Should NOT extract any examples
						expect(examples.length).toBe(0);
					}
				),
				{ numRuns: 50 }
			);
		});

		it("Property: Mixed content with non-JS blocks only extracts JS blocks", () => {
			fc.assert(
				fc.property(
					nonJsLanguageTags,
					jsCodeContent,
					(nonJsTag, jsCode) => {
						const markdown = [
							'# Test Document',
							'',
							`${nonJsTag}`,
							'some: yaml\ndata: here',
							'```',
							'',
							'```javascript',
							jsCode,
							'```',
							''
						].join('\n');

						const examples = extractCodeExamples(markdown, 'test.md');

						// Should extract exactly 1 example (the JS block)
						expect(examples.length).toBe(1);
						expect(examples[0].code.trim()).toBe(jsCode.trim());
					}
				),
				{ numRuns: 50 }
			);
		});
	});

	describe("Preservation 5: extractMarkdownLinks correctly extracts links outside fenced code blocks", () => {
		/**
		 * Validates: Requirements 3.2, 3.5
		 * 
		 * For all markdown content with [text](url) links outside fenced code blocks,
		 * extractMarkdownLinks extracts those links.
		 */

		it("Property: For all markdown with links in prose, extractMarkdownLinks extracts them", () => {
			fc.assert(
				fc.property(
					linkText,
					linkUrl,
					(text, url) => {
						const markdown = `# Heading\n\nSome text with [${text}](${url}) in it.\n`;
						const links = extractMarkdownLinks(markdown);

						// Should extract at least one link
						expect(links.length).toBeGreaterThanOrEqual(1);
						// Should find our link
						const found = links.some(l => l.text === text && l.url === url);
						expect(found).toBe(true);
					}
				),
				{ numRuns: 50 }
			);
		});

		it("Property: Multiple links in prose are all extracted", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.tuple(linkText, linkUrl),
						{ minLength: 1, maxLength: 5 }
					),
					(linkPairs) => {
						// Build markdown with multiple links on separate lines
						const lines = linkPairs.map(([text, url], i) =>
							`Line ${i}: See [${text}](${url}) for details.`
						);
						const markdown = lines.join('\n');
						const links = extractMarkdownLinks(markdown);

						// Should extract all links
						expect(links.length).toBe(linkPairs.length);
						for (let i = 0; i < linkPairs.length; i++) {
							expect(links[i].text).toBe(linkPairs[i][0]);
							expect(links[i].url).toBe(linkPairs[i][1]);
						}
					}
				),
				{ numRuns: 30 }
			);
		});

		it("Property: Links include correct line numbers", () => {
			fc.assert(
				fc.property(
					linkText,
					linkUrl,
					fc.integer({ min: 0, max: 5 }),
					(text, url, prefixLines) => {
						const prefix = Array(prefixLines).fill('Some text here.').join('\n');
						const markdown = prefix + (prefixLines > 0 ? '\n' : '') + `Check [${text}](${url}) here.\n`;
						const links = extractMarkdownLinks(markdown);

						expect(links.length).toBeGreaterThanOrEqual(1);
						const found = links.find(l => l.text === text && l.url === url);
						expect(found).toBeDefined();
						expect(found.line).toBe(prefixLines + 1);
					}
				),
				{ numRuns: 30 }
			);
		});
	});

	describe("Preservation 6: JSDoc hallucination test correctly detects genuinely hallucinated parameters", () => {
		/**
		 * Validates: Requirements 3.3, 3.6
		 * 
		 * For all source files where a function has a single immediately-preceding
		 * JSDoc with hallucinated params, the test detects them.
		 */

		it("Property: For source with single JSDoc containing hallucinated params, detection works", () => {
			// Generate source code with a single JSDoc block that has hallucinated params
			fc.assert(
				fc.property(
					fc.constantFrom('processData', 'handleRequest', 'fetchItems', 'validateInput'),
					fc.constantFrom('realParam', 'data', 'input', 'config'),
					fc.constantFrom('fakeParam', 'nonExistent', 'hallucinated', 'ghost'),
					(funcName, realParam, fakeParam) => {
						// Source with a single JSDoc that documents a param not in the signature
						const source = [
							`/**`,
							` * Does something useful.`,
							` * @param {string} ${realParam} - A real parameter`,
							` * @param {number} ${fakeParam} - A hallucinated parameter`,
							` */`,
							`${funcName}(${realParam}) {`,
							`  return ${realParam};`,
							`}`
						].join('\n');

						// Use the same regex pattern from the actual test
						const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

						let match;
						const issues = [];
						while ((match = methodPattern.exec(source)) !== null) {
							const jsdocComment = match[1];
							const matchedFuncName = match[2];
							const paramsStr = match[3].trim();

							if (matchedFuncName.startsWith('_') || matchedFuncName.startsWith('#') || matchedFuncName === 'constructor') {
								continue;
							}

							const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');
							const actualParams = paramsStr ? paramsStr.split(',').map(p => {
								let paramName = p.trim().split('=')[0].trim();
								paramName = paramName.split(':')[0].trim();
								paramName = paramName.replace(/[\[\]]/g, '');
								return paramName;
							}).filter(p => p && p.length > 0) : [];

							for (const jsdocParam of jsdoc.params) {
								const paramName = jsdocParam.name;
								if (paramName.includes('.')) continue;
								if (!actualParams.includes(paramName)) {
									issues.push(`${matchedFuncName}: hallucinated '${paramName}'`);
								}
							}
						}

						// Should detect the hallucinated parameter
						expect(issues.length).toBeGreaterThanOrEqual(1);
						const detected = issues.some(i => i.includes(fakeParam));
						expect(detected).toBe(true);
					}
				),
				{ numRuns: 30 }
			);
		});

		it("Property: For source with single JSDoc where all params match, no issues reported", () => {
			fc.assert(
				fc.property(
					fc.constantFrom('processData', 'handleRequest', 'fetchItems'),
					fc.constantFrom('param1', 'data', 'input'),
					fc.constantFrom('param2', 'options', 'config'),
					(funcName, param1, param2) => {
						// Source where JSDoc params match function signature exactly
						const source = [
							`/**`,
							` * Does something useful.`,
							` * @param {string} ${param1} - First parameter`,
							` * @param {Object} ${param2} - Second parameter`,
							` */`,
							`${funcName}(${param1}, ${param2}) {`,
							`  return ${param1};`,
							`}`
						].join('\n');

						const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

						let match;
						const issues = [];
						while ((match = methodPattern.exec(source)) !== null) {
							const jsdocComment = match[1];
							const matchedFuncName = match[2];
							const paramsStr = match[3].trim();

							if (matchedFuncName.startsWith('_') || matchedFuncName.startsWith('#') || matchedFuncName === 'constructor') {
								continue;
							}

							const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');
							const actualParams = paramsStr ? paramsStr.split(',').map(p => {
								let paramName = p.trim().split('=')[0].trim();
								paramName = paramName.split(':')[0].trim();
								paramName = paramName.replace(/[\[\]]/g, '');
								return paramName;
							}).filter(p => p && p.length > 0) : [];

							for (const jsdocParam of jsdoc.params) {
								const paramName = jsdocParam.name;
								if (paramName.includes('.')) continue;
								if (!actualParams.includes(paramName)) {
									issues.push(`${matchedFuncName}: hallucinated '${paramName}'`);
								}
							}
						}

						// Should NOT detect any hallucinated parameters
						expect(issues.length).toBe(0);
					}
				),
				{ numRuns: 30 }
			);
		});

		it("Preservation: JSDoc hallucination test passes on dao-cache.js (real file)", () => {
			const cacheFilePath = path.join(__dirname, '../../../src/lib/dao-cache.js');
			const content = fs.readFileSync(cacheFilePath, 'utf-8');
			const issues = [];

			const methodPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = methodPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const methodName = match[2];
				const paramsStr = match[3].trim();

				if (methodName.startsWith('_') || methodName.startsWith('#') || methodName === 'constructor') {
					continue;
				}

				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					paramName = paramName.split(':')[0].trim();
					paramName = paramName.replace(/[\[\]]/g, '');
					if (paramName.includes('{') || paramName.includes('[')) {
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) return null;
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`dao-cache.js:${methodName}: hallucinated nested '${paramName}'`);
							}
							continue;
						}
						if (!actualParams.includes(paramName)) {
							issues.push(`dao-cache.js:${methodName}: hallucinated '${paramName}'`);
						}
					}
				}
			}

			if (issues.length > 0) {
				console.log('\nPreservation check - dao-cache.js issues:', issues);
			}
			expect(issues).toHaveLength(0);
		});

		it("Preservation: JSDoc hallucination test passes on dao-endpoint.js (real file)", () => {
			const endpointFilePath = path.join(__dirname, '../../../src/lib/dao-endpoint.js');
			const content = fs.readFileSync(endpointFilePath, 'utf-8');
			const issues = [];

			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:function\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3].trim();

				if (functionName.startsWith('_') || functionName.startsWith('#')) {
					continue;
				}

				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					paramName = paramName.split(':')[0].trim();
					paramName = paramName.replace(/[\[\]]/g, '');
					if (paramName.includes('{') || paramName.includes('[')) {
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) return null;
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`dao-endpoint.js:${functionName}: hallucinated nested '${paramName}'`);
							}
							continue;
						}
						if (!actualParams.includes(paramName)) {
							issues.push(`dao-endpoint.js:${functionName}: hallucinated '${paramName}'`);
						}
					}
				}
			}

			if (issues.length > 0) {
				console.log('\nPreservation check - dao-endpoint.js issues:', issues);
			}
			expect(issues).toHaveLength(0);
		});

		it("Preservation: JSDoc hallucination test passes on src/index.js (real file)", () => {
			const indexFilePath = path.join(__dirname, '../../../src/index.js');
			const content = fs.readFileSync(indexFilePath, 'utf-8');
			const issues = [];

			const functionPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:function\s+)?([_#]?\w+)\s*\(([^)]*)\)\s*\{/g;

			let match;
			while ((match = functionPattern.exec(content)) !== null) {
				const jsdocComment = match[1];
				const functionName = match[2];
				const paramsStr = match[3].trim();

				if (functionName.startsWith('_') || functionName.startsWith('#')) {
					continue;
				}

				const jsdoc = parseJSDoc('/**' + jsdocComment + '*/');
				const actualParams = paramsStr ? paramsStr.split(',').map(p => {
					let paramName = p.trim().split('=')[0].trim();
					paramName = paramName.split(':')[0].trim();
					paramName = paramName.replace(/[\[\]]/g, '');
					if (paramName.includes('{') || paramName.includes('[')) {
						const destructureMatch = paramName.match(/^[{\[]([^}\]]+)[}\]]/);
						if (destructureMatch) return null;
					}
					return paramName;
				}).filter(p => p && p.length > 0) : [];

				if (jsdoc.params.length > 0) {
					for (const jsdocParam of jsdoc.params) {
						const paramName = jsdocParam.name;
						if (paramName.includes('.')) {
							const baseParam = paramName.split('.')[0];
							if (!actualParams.includes(baseParam)) {
								issues.push(`src/index.js:${functionName}: hallucinated nested '${paramName}'`);
							}
							continue;
						}
						if (!actualParams.includes(paramName)) {
							issues.push(`src/index.js:${functionName}: hallucinated '${paramName}'`);
						}
					}
				}
			}

			if (issues.length > 0) {
				console.log('\nPreservation check - src/index.js issues:', issues);
			}
			expect(issues).toHaveLength(0);
		});
	});
});
