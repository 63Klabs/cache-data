#!/usr/bin/env node

/**
 * Documentation Files Review Script
 * 
 * Reviews all documentation files in docs/ directory to:
 * - List all files
 * - Check for broken links (internal file references)
 * - Identify outdated content or examples
 * - Note missing documentation for features
 * 
 * Requirements: 3.1, 3.4, 4.1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(__dirname, '..', '.kiro', 'specs', '1-3-6-documentation-enhancement', 'docs-review-report.json');

/**
 * Recursively get all markdown files in a directory
 * @param {string} dir Directory to scan
 * @param {Array<string>} fileList Accumulated file list
 * @returns {Array<string>} List of file paths
 */
function getMarkdownFiles(dir, fileList = []) {
	try {
		const files = fs.readdirSync(dir);
		
		files.forEach(file => {
			const filePath = path.join(dir, file);
			const stat = fs.statSync(filePath);
			
			if (stat.isDirectory()) {
				getMarkdownFiles(filePath, fileList);
			} else if (file.endsWith('.md')) {
				fileList.push(filePath);
			}
		});
	} catch (error) {
		console.error(`Error reading directory ${dir}:`, error.message);
	}
	
	return fileList;
}

/**
 * Extract links from markdown content
 * @param {string} content Markdown content
 * @returns {Array<Object>} Array of link objects with text and url
 */
function extractLinks(content) {
	const links = [];
	
	// Match markdown links: [text](url)
	const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
	let match;
	
	while ((match = markdownLinkPattern.exec(content)) !== null) {
		links.push({
			text: match[1],
			url: match[2],
			type: 'markdown'
		});
	}
	
	// Match HTML links: <a href="url">text</a>
	const htmlLinkPattern = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
	while ((match = htmlLinkPattern.exec(content)) !== null) {
		links.push({
			text: match[2],
			url: match[1],
			type: 'html'
		});
	}
	
	return links;
}

/**
 * Check if a link is valid
 * @param {string} url URL to check
 * @param {string} sourceFile File containing the link
 * @returns {Object} Validation result
 */
function validateLink(url, sourceFile) {
	// Skip external URLs (we'll just note them, not validate)
	if (url.startsWith('http://') || url.startsWith('https://')) {
		return {
			valid: true,
			type: 'external',
			url
		};
	}
	
	// Skip anchors within the same page
	if (url.startsWith('#')) {
		return {
			valid: true,
			type: 'anchor',
			url,
			note: 'Anchor links not validated'
		};
	}
	
	// Handle relative paths
	let targetPath = url;
	
	// Remove anchor from URL
	const anchorIndex = targetPath.indexOf('#');
	if (anchorIndex !== -1) {
		targetPath = targetPath.substring(0, anchorIndex);
	}
	
	// Resolve relative to source file
	const sourceDir = path.dirname(sourceFile);
	const resolvedPath = path.resolve(sourceDir, targetPath);
	
	// Check if file exists
	const exists = fs.existsSync(resolvedPath);
	
	return {
		valid: exists,
		type: 'internal',
		url,
		resolvedPath,
		exists
	};
}

/**
 * Check for outdated patterns in content
 * @param {string} content File content
 * @param {string} filePath File path
 * @returns {Array<Object>} Array of potential issues
 */
function checkForOutdatedContent(content, filePath) {
	const issues = [];
	
	// Check for old Node.js version references
	const nodeVersionPattern = /node\.?js\s+(?:version\s+)?(\d+)\.(\d+)/gi;
	let match;
	while ((match = nodeVersionPattern.exec(content)) !== null) {
		const major = parseInt(match[1]);
		if (major < 20) {
			issues.push({
				type: 'outdated-node-version',
				line: content.substring(0, match.index).split('\n').length,
				text: match[0],
				note: `References Node.js ${major}.x, but package.json requires >=20.0.0`
			});
		}
	}
	
	// Check for deprecated AWS SDK v2 references
	if (content.includes('aws-sdk') && !content.includes('@aws-sdk')) {
		const lines = content.split('\n');
		lines.forEach((line, index) => {
			if (line.includes('aws-sdk') && !line.includes('@aws-sdk')) {
				issues.push({
					type: 'deprecated-aws-sdk',
					line: index + 1,
					text: line.trim(),
					note: 'References old aws-sdk package instead of @aws-sdk/*'
				});
			}
		});
	}
	
	// Check for TODO or FIXME comments
	const todoPattern = /(TODO|FIXME|XXX|HACK):\s*(.+)/gi;
	while ((match = todoPattern.exec(content)) !== null) {
		issues.push({
			type: 'todo-comment',
			line: content.substring(0, match.index).split('\n').length,
			text: match[0],
			note: 'Documentation contains TODO/FIXME comment'
		});
	}
	
	// Check for broken code examples (missing closing backticks)
	const codeBlockStarts = (content.match(/```/g) || []).length;
	if (codeBlockStarts % 2 !== 0) {
		issues.push({
			type: 'malformed-code-block',
			line: null,
			text: null,
			note: 'Unmatched code block delimiters (```)'
		});
	}
	
	return issues;
}

/**
 * Analyze a single documentation file
 * @param {string} filePath Path to documentation file
 * @returns {Object} Analysis results
 */
function analyzeDocFile(filePath) {
	const content = fs.readFileSync(filePath, 'utf-8');
	const relativePath = path.relative(ROOT_DIR, filePath);
	
	// Extract links
	const links = extractLinks(content);
	
	// Validate links
	const brokenLinks = [];
	const externalLinks = [];
	const internalLinks = [];
	
	links.forEach(link => {
		const validation = validateLink(link.url, filePath);
		
		if (validation.type === 'external') {
			externalLinks.push({
				text: link.text,
				url: link.url
			});
		} else if (validation.type === 'internal') {
			internalLinks.push({
				text: link.text,
				url: link.url,
				valid: validation.valid
			});
			
			if (!validation.valid) {
				brokenLinks.push({
					text: link.text,
					url: link.url,
					resolvedPath: validation.resolvedPath
				});
			}
		}
	});
	
	// Check for outdated content
	const outdatedIssues = checkForOutdatedContent(content, filePath);
	
	// Get file stats
	const stats = fs.statSync(filePath);
	const lineCount = content.split('\n').length;
	const wordCount = content.split(/\s+/).length;
	
	return {
		filePath: relativePath,
		stats: {
			size: stats.size,
			lastModified: stats.mtime.toISOString(),
			lineCount,
			wordCount
		},
		links: {
			total: links.length,
			external: externalLinks.length,
			internal: internalLinks.length,
			broken: brokenLinks.length
		},
		brokenLinks,
		externalLinks,
		outdatedIssues,
		needsReview: brokenLinks.length > 0 || outdatedIssues.length > 0
	};
}

/**
 * Check for missing documentation based on source code
 * @returns {Array<Object>} Missing documentation items
 */
function checkMissingDocumentation() {
	const missing = [];
	
	// Check if main features are documented
	const expectedDocs = [
		{ path: 'docs/features/cache/README.md', feature: 'Cache Module' },
		{ path: 'docs/features/endpoint/README.md', feature: 'Endpoint Module' },
		{ path: 'docs/features/tools/README.md', feature: 'Tools Module' },
		{ path: 'docs/00-quick-start-implementation/README.md', feature: 'Quick Start Guide' },
		{ path: 'docs/01-advanced-implementation-for-web-service/README.md', feature: 'Advanced Implementation Guide' },
		{ path: 'docs/00-example-implementation/README.md', feature: 'Example Implementation' },
		{ path: 'docs/lambda-optimization/README.md', feature: 'Lambda Optimization Guide' },
		{ path: 'docs/technical/in-memory-cache.md', feature: 'In-Memory Cache Technical Docs' }
	];
	
	expectedDocs.forEach(doc => {
		const fullPath = path.join(ROOT_DIR, doc.path);
		if (!fs.existsSync(fullPath)) {
			missing.push({
				path: doc.path,
				feature: doc.feature,
				status: 'missing'
			});
		} else {
			// Check if file is empty or very small
			const stats = fs.statSync(fullPath);
			if (stats.size < 100) {
				missing.push({
					path: doc.path,
					feature: doc.feature,
					status: 'stub',
					size: stats.size
				});
			}
		}
	});
	
	return missing;
}

/**
 * Generate documentation review report
 */
function generateReviewReport() {
	console.log('Starting documentation files review...\n');
	
	const files = getMarkdownFiles(DOCS_DIR);
	console.log(`Found ${files.length} markdown files\n`);
	
	const fileAnalyses = [];
	let totalBrokenLinks = 0;
	let totalOutdatedIssues = 0;
	let filesNeedingReview = 0;
	
	files.forEach(file => {
		console.log(`Reviewing: ${path.relative(ROOT_DIR, file)}`);
		const analysis = analyzeDocFile(file);
		fileAnalyses.push(analysis);
		
		totalBrokenLinks += analysis.brokenLinks.length;
		totalOutdatedIssues += analysis.outdatedIssues.length;
		if (analysis.needsReview) {
			filesNeedingReview++;
		}
	});
	
	// Check for missing documentation
	const missingDocs = checkMissingDocumentation();
	
	const report = {
		reviewDate: new Date().toISOString(),
		summary: {
			totalFiles: files.length,
			filesNeedingReview,
			totalBrokenLinks,
			totalOutdatedIssues,
			missingDocumentation: missingDocs.length
		},
		missingDocumentation: missingDocs,
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
	console.log('DOCUMENTATION REVIEW SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total Files Reviewed: ${report.summary.totalFiles}`);
	console.log(`Files Needing Review: ${report.summary.filesNeedingReview}`);
	console.log(`Broken Links: ${report.summary.totalBrokenLinks}`);
	console.log(`Outdated Content Issues: ${report.summary.totalOutdatedIssues}`);
	console.log(`Missing Documentation: ${report.summary.missingDocumentation}`);
	console.log('='.repeat(60));
	
	if (missingDocs.length > 0) {
		console.log('\nMissing or Stub Documentation:');
		missingDocs.forEach(doc => {
			console.log(`  - ${doc.feature} (${doc.path}) - ${doc.status}`);
		});
	}
	
	if (totalBrokenLinks > 0) {
		console.log('\nFiles with Broken Links:');
		fileAnalyses.forEach(file => {
			if (file.brokenLinks.length > 0) {
				console.log(`  - ${file.filePath} (${file.brokenLinks.length} broken links)`);
			}
		});
	}
	
	console.log(`\nDetailed report saved to: ${OUTPUT_FILE}\n`);
	
	return report;
}

// Run the review
try {
	generateReviewReport();
} catch (error) {
	console.error('Error during review:', error);
	process.exit(1);
}
