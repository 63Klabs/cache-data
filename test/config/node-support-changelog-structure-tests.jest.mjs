/**
 * Structural test for the v1.3.17 CHANGELOG entry documenting Node.js 26
 * support and the Node.js 20 deprecation.
 *
 * This test reads `CHANGELOG.md` as text and asserts on the structure of the
 * `## v1.3.17 (unreleased)` section rather than parsing Markdown, so it is
 * resilient to formatting while still enforcing the required content.
 *
 * Requirement 7.1: a new entry exists under the current unreleased version.
 * Requirement 7.2: Node.js 26 support is recorded under `Added`.
 * Requirement 7.3: the Node.js 20 deprecation is recorded under `Deprecated`
 *   using the plain "deprecated, no fixed sunset date" format (matching the
 *   v1.3.16 `AppConfig._initParameters()` precedent), NOT the CloudFormation
 *   24-month-sunset format.
 * Requirement 7.4: the entry references this spec directory.
 * Requirement 7.6: the entry notes that the changelog-convention steering
 *   document has a CloudFormation 24-month-sunset reference to review for npm
 *   applicability as a Phase 2 / v1.4.0 follow-up.
 *
 * Feature: 1-3-17-node-26-support
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const SPEC_DIR_REFERENCE = '.kiro/specs/1-3-17-node-26-support';

/**
 * Extract the body of a single `## <heading>` section from a Markdown
 * document: everything from the matched heading line up to (but excluding)
 * the next `## ` heading, or end-of-file.
 *
 * @param {string} markdown - Full Markdown source.
 * @param {RegExp} headingPattern - Pattern matching the target heading line.
 * @returns {string|null} The section body (including its heading line), or null
 *   if the heading is not found.
 */
function extractSection(markdown, headingPattern) {
	const lines = markdown.split('\n');
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (headingPattern.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start === -1) {
		return null;
	}
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^##\s/.test(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

/**
 * Extract a `### <category>` subsection body from within a section body:
 * everything from the matched `### ` heading up to the next `### ` or `## `
 * heading, or end of the provided text.
 *
 * @param {string} sectionBody - The section body to search within.
 * @param {string} category - The category name (e.g. "Added", "Deprecated").
 * @returns {string|null} The subsection body, or null if not present.
 */
function extractSubsection(sectionBody, category) {
	const lines = sectionBody.split('\n');
	const headingPattern = new RegExp(`^###\\s+${category}\\b`, 'i');
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (headingPattern.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start === -1) {
		return null;
	}
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^###?\s/.test(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

describe('CHANGELOG v1.3.17 entry: Node.js 26 support and Node.js 20 deprecation', () => {
	// Feature: 1-3-17-node-26-support
	// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const changelogPath = resolve(__dirname, '../../CHANGELOG.md');

	let changelog;
	let section;

	beforeAll(() => {
		changelog = readFileSync(changelogPath, 'utf-8');
		section = extractSection(changelog, /^##\s+v1\.3\.17\s+\(unreleased\)/);
	});

	describe('Requirement 7.1: unreleased v1.3.17 section exists', () => {
		it('has a "## v1.3.17 (unreleased)" heading', () => {
			expect(section).not.toBeNull();
			expect(section).toMatch(/^##\s+v1\.3\.17\s+\(unreleased\)/);
		});

		it('appears above the released v1.3.16 section', () => {
			const posThis = changelog.indexOf('## v1.3.17 (unreleased)');
			const posPrev = changelog.indexOf('## v1.3.16');
			expect(posThis).toBeGreaterThanOrEqual(0);
			expect(posPrev).toBeGreaterThanOrEqual(0);
			expect(posThis).toBeLessThan(posPrev);
		});
	});

	describe('Requirement 7.2: Node.js 26 support under Added', () => {
		it('has an Added subsection', () => {
			expect(extractSubsection(section, 'Added')).not.toBeNull();
		});

		it('the Added subsection records Node.js 26 support', () => {
			const added = extractSubsection(section, 'Added');
			expect(added).toMatch(/Node\.js\s+26/);
		});
	});

	describe('Requirement 7.3: Node.js 20 deprecation under Deprecated (plain no-sunset format)', () => {
		let deprecated;

		beforeAll(() => {
			deprecated = extractSubsection(section, 'Deprecated');
		});

		it('has a Deprecated subsection', () => {
			expect(deprecated).not.toBeNull();
		});

		it('records the Node.js 20 deprecation', () => {
			expect(deprecated).toMatch(/Node\.js\s+20/);
		});

		it('uses the plain "no fixed sunset date" format', () => {
			expect(deprecated).toMatch(/no fixed sunset date/i);
		});

		it('does NOT use the CloudFormation 24-month-sunset format in the deprecation entry', () => {
			// The Node 20 deprecation must not be phrased with the
			// CloudFormation-template "24-month support period" sunset wording.
			expect(deprecated).not.toMatch(/24-month/i);
			expect(deprecated).not.toMatch(/support period ending/i);
		});
	});

	describe('Requirement 7.4: references this spec directory', () => {
		it('references .kiro/specs/1-3-17-node-26-support', () => {
			expect(section).toContain(SPEC_DIR_REFERENCE);
		});
	});

	describe('Requirement 7.6: changelog-convention steering follow-up note', () => {
		it('mentions the changelog-convention steering document', () => {
			expect(section).toMatch(/changelog-convention/i);
		});

		it('flags the CloudFormation 24-month-sunset reference for review', () => {
			expect(section).toMatch(/24-month/i);
			expect(section).toMatch(/CloudFormation/i);
		});

		it('tracks it as a Phase 2 / v1.4.0 follow-up', () => {
			expect(section).toMatch(/follow-up/i);
			expect(section).toMatch(/v1\.4\.0|Phase 2/i);
		});
	});
});
