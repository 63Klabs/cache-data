/**
 * Structural test for the initial state of the Node.js deprecation-notice
 * registry and its documenting comment in `src/lib/tools/index.js`.
 *
 * ACCESS NOTE: `NODE_DEPRECATION_NOTICES` (and its walker
 * `checkNodeDeprecationNotices()`) are module-INTERNAL to
 * `src/lib/tools/index.js` and are intentionally NOT exported (Property 7 /
 * Req 8.1 — the package export surface must not change to make this testable).
 * This test therefore reads the SOURCE FILE as text and asserts on its
 * structure rather than importing the registry. The source path is resolved
 * relative to this test file via `import.meta.url`.
 *
 * Requirement 4.5: initial registry contains exactly one entry
 *   `{ version: 20, active: true, message: <Req 3.2 text> }`.
 * Requirement 4.6: the registry/helper are documented with a comment explaining
 *   the `active: false`-rather-than-delete convention and referencing the
 *   runbook `.kiro/steering/cache-data-node-support.md` as the source of future
 *   entries.
 *
 * Feature: 1-3-17-node-26-support
 * Validates: Requirements 4.5, 4.6
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// The exact Requirement 3.2 message text. Kept identical to the seeded entry in
// `src/lib/tools/index.js`.
const REQ_3_2_MESSAGE = "Node.js 20 reached end-of-life on 2026-04-30 and is no longer tested by @63klabs/cache-data; please upgrade to Node.js 22 or later.";

/**
 * Produce a copy of JS source in which the contents of comments and string
 * literals are blanked out (replaced with spaces, preserving length/offsets),
 * so structural counting of code braces and `version:` fields is not fooled by
 * commented-out example entries or by punctuation inside message strings.
 *
 * Handles `//` line comments, block comments, and single/double-quoted and
 * template string literals with backslash escapes.
 *
 * @param {string} code - Source text to sanitize.
 * @returns {string} The code with comment and string-literal contents blanked.
 */
function blankCommentsAndStrings(code) {
	let out = '';
	let i = 0;
	const n = code.length;
	while (i < n) {
		const char = code[i];
		const next = code[i + 1];

		// Line comment: blank through end of line (keep the newline).
		if (char === '/' && next === '/') {
			while (i < n && code[i] !== '\n') {
				out += ' ';
				i++;
			}
			continue;
		}

		// Block comment: blank through the closing */ (preserve newlines).
		if (char === '/' && next === '*') {
			out += '  ';
			i += 2;
			while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
				out += code[i] === '\n' ? '\n' : ' ';
				i++;
			}
			if (i < n) {
				out += '  ';
				i += 2;
			}
			continue;
		}

		// String literal: keep the quotes, blank the contents.
		if (char === '"' || char === "'" || char === '`') {
			const quote = char;
			out += quote;
			i++;
			while (i < n && code[i] !== quote) {
				if (code[i] === '\\' && i + 1 < n) {
					out += '  ';
					i += 2;
					continue;
				}
				out += code[i] === '\n' ? '\n' : ' ';
				i++;
			}
			if (i < n) {
				out += quote;
				i++;
			}
			continue;
		}

		out += char;
		i++;
	}
	return out;
}

/**
 * Extract the text between a starting delimiter and its matching closing
 * delimiter using depth counting, so nested brackets/braces are handled
 * correctly. The input should already be sanitized of comments/strings when the
 * result is used for structural counting.
 *
 * @param {string} source - Full source text to scan.
 * @param {number} openPos - Index of the opening delimiter character.
 * @param {string} openChar - Opening delimiter (e.g. '[').
 * @param {string} closeChar - Closing delimiter (e.g. ']').
 * @returns {{content: string, endPos: number}|null} The inner content (exclusive
 *   of the delimiters) and the index of the matching close, or null if unmatched.
 */
function extractBalanced(source, openPos, openChar, closeChar) {
	let depth = 0;
	for (let i = openPos; i < source.length; i++) {
		const char = source[i];
		if (char === openChar) {
			depth++;
		} else if (char === closeChar) {
			depth--;
			if (depth === 0) {
				return { content: source.substring(openPos + 1, i), endPos: i };
			}
		}
	}
	return null;
}

describe('Node deprecation-notice registry: initial state and documenting comment', () => {
	// Feature: 1-3-17-node-26-support
	// Validates: Requirements 4.5, 4.6

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const sourcePath = resolve(__dirname, '../../src/lib/tools/index.js');

	let source;
	let registryBlock; // raw array body (comments/strings intact) for content checks
	let registryCode; // sanitized array body for structural counting
	let registryDeclPos;

	beforeAll(() => {
		source = readFileSync(sourcePath, 'utf-8');

		registryDeclPos = source.indexOf('const NODE_DEPRECATION_NOTICES');
		expect(registryDeclPos).toBeGreaterThanOrEqual(0);

		// Locate the array literal that opens the declaration and extract its body.
		const arrayOpenPos = source.indexOf('[', registryDeclPos);
		expect(arrayOpenPos).toBeGreaterThanOrEqual(0);

		const extracted = extractBalanced(source, arrayOpenPos, '[', ']');
		expect(extracted).not.toBeNull();
		registryBlock = extracted.content;

		// Blanking preserves offsets, so the same positions delimit the array in
		// the sanitized copy. Counting on this copy ignores commented-out example
		// entries and any punctuation inside message strings.
		const sanitized = blankCommentsAndStrings(source);
		const sanitizedExtracted = extractBalanced(sanitized, arrayOpenPos, '[', ']');
		expect(sanitizedExtracted).not.toBeNull();
		registryCode = sanitizedExtracted.content;
	});

	describe('Requirement 4.5: initial registry has exactly one entry', () => {
		it('declares NODE_DEPRECATION_NOTICES as an array', () => {
			expect(source).toMatch(/const\s+NODE_DEPRECATION_NOTICES\s*=\s*\[/);
		});

		it('contains exactly one entry object', () => {
			// Count top-level `{ ... }` objects inside the array block (depth 1).
			// Use the sanitized copy so a commented-out example entry (e.g.
			// `// { version: 22, ... }`) is not counted as a real entry.
			let depth = 0;
			let entryCount = 0;
			for (let i = 0; i < registryCode.length; i++) {
				const char = registryCode[i];
				if (char === '{') {
					if (depth === 0) {
						entryCount++;
					}
					depth++;
				} else if (char === '}') {
					depth--;
				}
			}
			expect(entryCount).toBe(1);
		});

		it('the single entry specifies version 20', () => {
			expect(registryBlock).toMatch(/version:\s*20\b/);
		});

		it('the single entry is active: true', () => {
			expect(registryBlock).toMatch(/active:\s*true\b/);
			// And is not seeded inactive.
			expect(registryBlock).not.toMatch(/active:\s*false\b/);
		});

		it('the single entry carries the exact Requirement 3.2 message', () => {
			expect(registryBlock).toContain(REQ_3_2_MESSAGE);
		});

		it('does not seed any Node major other than 20', () => {
			// Use the sanitized copy so a `version:` inside a commented-out
			// example entry does not register as a seeded version.
			const versionMatches = [...registryCode.matchAll(/version:\s*(\d+)/g)]
				.map((m) => m[1]);
			expect(versionMatches).toEqual(['20']);
		});
	});

	describe('Requirement 4.6: documenting comment for the registry convention', () => {
		it('references the runbook steering document', () => {
			expect(source).toContain('.kiro/steering/cache-data-node-support.md');
		});

		it('explains the active:false-rather-than-delete convention', () => {
			// Comment text: "set active:false rather than deleting the entry ...".
			expect(source).toMatch(/active:\s*false\s+rather than delet/i);
		});

		it('mentions the auditable-history rationale for keeping removed entries', () => {
			expect(source).toMatch(/auditable/i);
		});

		it('places the documenting comment before the registry declaration', () => {
			const runbookRefPos = source.indexOf('.kiro/steering/cache-data-node-support.md');
			expect(runbookRefPos).toBeGreaterThanOrEqual(0);
			expect(runbookRefPos).toBeLessThan(registryDeclPos);
		});
	});
});
