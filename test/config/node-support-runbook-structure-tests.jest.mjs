/**
 * Structural test for the `cache-data-node-support` steering runbook document
 * at `.kiro/steering/cache-data-node-support.md`.
 *
 * This runbook is a report-only, manually-triggered steering document (not
 * executable code). This test reads the file as text and asserts on its
 * structure: front matter, the seeded support matrix and its columns, the
 * distinct Package Policy / AWS Lambda Status columns, the standing Node.js
 * release cadence note, and the presence of the Part B procedure and the
 * Requirement 10 trigger decision table. The runbook's live-fetch behavior is
 * documentation and is intentionally NOT executed by this test.
 *
 * The document path is resolved relative to this test file via
 * `import.meta.url`.
 *
 * Feature: 1-3-17-node-26-support
 * Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Runtime identifiers that must be seeded in the matrix (Requirement 9.4).
const SEEDED_RUNTIMES = ['nodejs20.x', 'nodejs22.x', 'nodejs24.x', 'nodejs26.x'];

// Columns the support matrix must contain (Requirement 9.3).
const REQUIRED_MATRIX_COLUMNS = [
	'Runtime',
	'Node Major',
	'Package Policy',
	'AWS Lambda Status',
	'Upstream Node EOL',
	'Lambda Deprecation Date',
	'Lambda Block-Create',
	'Lambda Block-Update',
	'Notes',
	'Last Checked'
];

/**
 * Split raw markdown into a leading YAML front-matter block (delimited by a
 * leading `---` line and a closing `---` line) and the remaining body.
 *
 * @param {string} text - Full markdown file contents.
 * @returns {{frontMatter: string|null, body: string}} The front-matter text
 *   (without the delimiters) or null when absent, plus the document body.
 */
function splitFrontMatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) {
		return { frontMatter: null, body: text };
	}
	return { frontMatter: match[1], body: text.slice(match[0].length) };
}

/**
 * Return the pipe-delimited header row lines from the document body: any line
 * that both starts and (ignoring trailing whitespace) ends with a `|`.
 *
 * @param {string} body - Markdown body text.
 * @returns {Array.<string>} Candidate table rows, trimmed.
 */
function pipeRows(body) {
	return body
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith('|') && line.endsWith('|'));
}

describe('cache-data-node-support runbook: structure', () => {
	// Feature: 1-3-17-node-26-support
	// Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const runbookPath = resolve(
		__dirname,
		'../../.kiro/steering/cache-data-node-support.md'
	);

	let raw;
	let frontMatter;
	let body;
	let matrixHeaderRow;

	beforeAll(() => {
		// Requirement 9.1: the file must exist.
		raw = readFileSync(runbookPath, 'utf-8');
		const split = splitFrontMatter(raw);
		frontMatter = split.frontMatter;
		body = split.body;

		// Locate the support-matrix header row: the first pipe row that contains
		// the Runtime and AWS Lambda Status headers.
		matrixHeaderRow = pipeRows(body).find(
			(row) => row.includes('Runtime') && row.includes('AWS Lambda Status')
		);
	});

	describe('Requirement 9.1: front matter with inclusion: manual and a description', () => {
		it('has a YAML front-matter block', () => {
			expect(frontMatter).not.toBeNull();
		});

		it('declares inclusion: manual', () => {
			expect(frontMatter).toMatch(/^\s*inclusion:\s*manual\s*$/m);
		});

		it('declares a non-empty description', () => {
			const descMatch = frontMatter.match(/^\s*description:\s*(.+)$/m);
			expect(descMatch).not.toBeNull();
			// Strip surrounding quotes/whitespace and confirm there is real text.
			const value = descMatch[1].trim().replace(/^["']|["']$/g, '').trim();
			expect(value.length).toBeGreaterThan(0);
		});
	});

	describe('Requirement 9.3: support matrix contains the required columns', () => {
		it('has a matrix header row', () => {
			expect(matrixHeaderRow).toBeDefined();
		});

		it('includes every required column', () => {
			for (const column of REQUIRED_MATRIX_COLUMNS) {
				expect(matrixHeaderRow).toContain(column);
			}
		});
	});

	describe('Requirement 9.4: matrix seeded with nodejs20.x through nodejs26.x', () => {
		it('references each seeded runtime identifier', () => {
			for (const runtime of SEEDED_RUNTIMES) {
				expect(body).toContain(runtime);
			}
		});

		it('has a seeded data row for each runtime with a last-checked date', () => {
			const rows = pipeRows(body);
			for (const runtime of SEEDED_RUNTIMES) {
				const dataRow = rows.find(
					(row) => row.includes(runtime) && !row.includes('AWS Lambda Status')
				);
				expect(dataRow).toBeDefined();
				// Seed values were researched as of 2026-09-25 (Last Checked column).
				expect(dataRow).toMatch(/\d{4}-\d{2}-\d{2}/);
			}
		});
	});

	describe('Requirement 9.5: Package Policy and AWS Lambda Status are distinct columns', () => {
		it('lists both column headers', () => {
			expect(matrixHeaderRow).toContain('Package Policy');
			expect(matrixHeaderRow).toContain('AWS Lambda Status');
		});

		it('keeps them as two separate cells in the header row', () => {
			const cells = matrixHeaderRow
				.split('|')
				.map((cell) => cell.trim())
				.filter((cell) => cell.length > 0);
			const policyIndex = cells.indexOf('Package Policy');
			const statusIndex = cells.indexOf('AWS Lambda Status');
			expect(policyIndex).toBeGreaterThanOrEqual(0);
			expect(statusIndex).toBeGreaterThanOrEqual(0);
			expect(policyIndex).not.toBe(statusIndex);
		});
	});

	describe('Requirement 9.6: standing Node.js release cadence note', () => {
		it('documents one major release per year', () => {
			expect(body).toMatch(/one\s+new\s+major\s+version\s+per\s+year/i);
		});

		it('documents the April release and October LTS promotion', () => {
			expect(body).toMatch(/April/);
			expect(body).toMatch(/October/i);
			expect(body).toMatch(/LTS/);
		});
	});

	describe('Part B procedure and Requirement 10 trigger table are present', () => {
		it('describes the Part B procedure', () => {
			expect(body).toMatch(/Part B/);
			// The procedure fetches AWS data, diffs, refreshes, evaluates, reports.
			expect(body).toMatch(/diff/i);
			expect(body).toMatch(/refresh/i);
			expect(body).toMatch(/trigger/i);
		});

		it('prefers the AWS docs MCP tools with web_fetch fallback', () => {
			expect(body).toMatch(/MCP/);
			expect(body).toMatch(/web_fetch/);
		});

		it('encodes the Requirement 10 trigger recommendations', () => {
			expect(body).toContain('{current-version}-node-{NN}-support');
			expect(body).toContain('{current-version}-node-{NN}-deprecation');
			expect(body).toContain('{next-minor}-node-{NN}-removal');
		});

		it('states the runbook is report-only', () => {
			expect(body).toMatch(/report-only/i);
		});
	});
});
