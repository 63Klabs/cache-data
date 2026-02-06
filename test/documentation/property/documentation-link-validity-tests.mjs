/**
 * Property-Based Tests for Documentation Link Validity
 * 
 * Feature: documentation-enhancement
 * Property 8: Documentation Link Validity
 * 
 * For any link in documentation files (README, docs directory),
 * the link SHALL either point to an existing file in the repository
 * or be a valid external URL.
 * 
 * Validates: Requirements 3.4
 */

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fc from 'fast-check';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract all markdown links from content
 * @param {string} content Markdown content
 * @returns {Array<{text: string, url: string, line: number}>} Array of links
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
 * Check if a URL is an external URL
 * @param {string} url URL to check
 * @returns {boolean} True if external URL
 */
function isExternalUrl(url) {
  return url.startsWith('http://') || 
         url.startsWith('https://') || 
         url.startsWith('mailto:') ||
         url.startsWith('ftp://');
}

/**
 * Check if a URL is a valid external URL format
 * @param {string} url URL to check
 * @returns {boolean} True if valid format
 */
function isValidExternalUrlFormat(url) {
  if (!isExternalUrl(url)) {
    return false;
  }
  
  // Check for common typos like double protocol
  if (url.match(/https?:\/\/https?:\/\//)) {
    return false;
  }
  
  // Check for valid URL structure
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Resolve a relative file path from a markdown file
 * @param {string} markdownFilePath Path to the markdown file
 * @param {string} relativePath Relative path from the link
 * @param {string} repoRoot Repository root path
 * @returns {string} Resolved absolute path
 */
function resolveRelativePath(markdownFilePath, relativePath, repoRoot) {
  // Remove anchor/fragment from path
  const pathWithoutAnchor = relativePath.split('#')[0];
  
  if (!pathWithoutAnchor) {
    // Link is just an anchor to the same file
    return markdownFilePath;
  }
  
  // Get directory of the markdown file
  const markdownDir = path.dirname(markdownFilePath);
  
  // Resolve the relative path
  const resolvedPath = path.resolve(markdownDir, pathWithoutAnchor);
  
  return resolvedPath;
}

/**
 * Check if a file or directory exists
 * @param {string} filePath Path to check
 * @returns {boolean} True if file or directory exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (e) {
    return false;
  }
}

/**
 * Find all markdown files in a directory recursively
 * @param {string} dir Directory to search
 * @param {Array<string>} fileList Accumulated file list
 * @returns {Array<string>} List of markdown file paths
 */
function findMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .git, and .kiro/steering directories
      // Steering documents may contain example links that don't exist
      if (file !== 'node_modules' && file !== '.git' && !filePath.includes('.kiro/steering')) {
        findMarkdownFiles(filePath, fileList);
      }
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

describe('Property 8: Documentation Link Validity', function() {
  const repoRoot = path.join(__dirname, '../../..');
  let allMarkdownFiles;
  let allLinks;

  before(function() {
    // Find all markdown files in the repository
    allMarkdownFiles = findMarkdownFiles(repoRoot);
    
    // Extract all links from all markdown files
    allLinks = [];
    allMarkdownFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      const links = extractMarkdownLinks(content);
      
      links.forEach(link => {
        allLinks.push({
          ...link,
          file: path.relative(repoRoot, filePath)
        });
      });
    });
  });

  it('should find markdown files in the repository', function() {
    expect(allMarkdownFiles).to.be.an('array').with.length.greaterThan(0);
    
    // Should at least have README.md
    const hasReadme = allMarkdownFiles.some(f => f.endsWith('README.md'));
    expect(hasReadme).to.be.true;
  });

  it('should extract links from markdown files', function() {
    expect(allLinks).to.be.an('array').with.length.greaterThan(0);
  });

  it('Property: All internal file links should point to existing files', function() {
    this.timeout(10000);

    const brokenLinks = [];
    
    allLinks.forEach(link => {
      // Skip external URLs
      if (isExternalUrl(link.url)) {
        return;
      }
      
      // Resolve the file path
      const markdownFilePath = path.join(repoRoot, link.file);
      const resolvedPath = resolveRelativePath(markdownFilePath, link.url, repoRoot);
      
      // Check if file exists
      if (!fileExists(resolvedPath)) {
        brokenLinks.push({
          file: link.file,
          line: link.line,
          text: link.text,
          url: link.url,
          resolvedPath: path.relative(repoRoot, resolvedPath)
        });
      }
    });
    
    if (brokenLinks.length > 0) {
      console.log('\nBroken Internal Links:');
      brokenLinks.forEach(link => {
        console.log(`  - ${link.file}:${link.line} - [${link.text}](${link.url})`);
        console.log(`    Resolved to: ${link.resolvedPath} (does not exist)`);
      });
    }
    
    expect(brokenLinks).to.have.lengthOf(0, 
      `Found ${brokenLinks.length} broken internal file links`);
  });

  it('Property: All external URLs should have valid format', function() {
    this.timeout(10000);

    const invalidUrls = [];
    
    allLinks.forEach(link => {
      // Only check external URLs
      if (!isExternalUrl(link.url)) {
        return;
      }
      
      // Check if URL has valid format
      if (!isValidExternalUrlFormat(link.url)) {
        invalidUrls.push({
          file: link.file,
          line: link.line,
          text: link.text,
          url: link.url
        });
      }
    });
    
    if (invalidUrls.length > 0) {
      console.log('\nInvalid External URLs:');
      invalidUrls.forEach(link => {
        console.log(`  - ${link.file}:${link.line} - [${link.text}](${link.url})`);
      });
    }
    
    expect(invalidUrls).to.have.lengthOf(0, 
      `Found ${invalidUrls.length} invalid external URLs`);
  });

  it('Property: For any markdown file, all relative links resolve to existing files', function() {
    this.timeout(10000);

    // Property-based test: for any markdown file with links,
    // all relative (non-external) links should resolve to existing files
    fc.assert(
      fc.property(
        fc.constantFrom(...allMarkdownFiles),
        (markdownFile) => {
          const content = fs.readFileSync(markdownFile, 'utf8');
          const links = extractMarkdownLinks(content);
          
          // Filter to only internal links
          const internalLinks = links.filter(link => !isExternalUrl(link.url));
          
          // If no internal links, property holds trivially
          if (internalLinks.length === 0) {
            return true;
          }
          
          // Check all internal links resolve to existing files
          return internalLinks.every(link => {
            const resolvedPath = resolveRelativePath(markdownFile, link.url, repoRoot);
            return fileExists(resolvedPath);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: For any link in documentation, it is either a valid file or valid external URL', function() {
    this.timeout(10000);

    // Property-based test: for any link, it should be either:
    // 1. A relative link to an existing file, or
    // 2. A valid external URL
    fc.assert(
      fc.property(
        fc.constantFrom(...allLinks),
        (link) => {
          const markdownFilePath = path.join(repoRoot, link.file);
          
          if (isExternalUrl(link.url)) {
            // External URL - check format is valid
            return isValidExternalUrlFormat(link.url);
          } else {
            // Internal link - check file exists
            const resolvedPath = resolveRelativePath(markdownFilePath, link.url, repoRoot);
            return fileExists(resolvedPath);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Links should not contain common typos', function() {
    this.timeout(10000);

    const linksWithTypos = [];
    
    allLinks.forEach(link => {
      const url = link.url;
      
      // Check for double protocol (e.g., https://https://)
      if (url.match(/https?:\/\/https?:\/\//)) {
        linksWithTypos.push({
          file: link.file,
          line: link.line,
          text: link.text,
          url: link.url,
          issue: 'Double protocol'
        });
      }
      
      // Check for double slashes in path (not after protocol)
      if (url.match(/[^:]\/\//)) {
        linksWithTypos.push({
          file: link.file,
          line: link.line,
          text: link.text,
          url: link.url,
          issue: 'Double slashes in path'
        });
      }
      
      // Check for spaces in URLs (should be encoded)
      if (isExternalUrl(url) && url.includes(' ')) {
        linksWithTypos.push({
          file: link.file,
          line: link.line,
          text: link.text,
          url: link.url,
          issue: 'Unencoded spaces in URL'
        });
      }
    });
    
    if (linksWithTypos.length > 0) {
      console.log('\nLinks with Potential Typos:');
      linksWithTypos.forEach(link => {
        console.log(`  - ${link.file}:${link.line} - [${link.text}](${link.url})`);
        console.log(`    Issue: ${link.issue}`);
      });
    }
    
    expect(linksWithTypos).to.have.lengthOf(0, 
      `Found ${linksWithTypos.length} links with potential typos`);
  });

  it('Property: README should have valid links to documentation directories', function() {
    this.timeout(10000);

    const readmePath = path.join(repoRoot, 'README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const links = extractMarkdownLinks(readmeContent);
    
    // Find links to docs directory
    const docsLinks = links.filter(link => 
      link.url.startsWith('./docs/') || link.url.startsWith('docs/')
    );
    
    expect(docsLinks).to.be.an('array').with.length.greaterThan(0,
      'README should have links to docs directory');
    
    // Check all docs links are valid
    const brokenDocsLinks = docsLinks.filter(link => {
      const resolvedPath = resolveRelativePath(readmePath, link.url, repoRoot);
      return !fileExists(resolvedPath);
    });
    
    if (brokenDocsLinks.length > 0) {
      console.log('\nBroken docs links in README:');
      brokenDocsLinks.forEach(link => {
        console.log(`  - Line ${link.line}: [${link.text}](${link.url})`);
      });
    }
    
    expect(brokenDocsLinks).to.have.lengthOf(0,
      `Found ${brokenDocsLinks.length} broken links to docs directory in README`);
  });

  it('Property: All documentation files should have valid cross-references', function() {
    this.timeout(10000);

    // Find all markdown files in docs directory
    const docsDir = path.join(repoRoot, 'docs');
    const docsFiles = findMarkdownFiles(docsDir);
    
    expect(docsFiles).to.be.an('array').with.length.greaterThan(0);
    
    const brokenCrossRefs = [];
    
    docsFiles.forEach(docFile => {
      const content = fs.readFileSync(docFile, 'utf8');
      const links = extractMarkdownLinks(content);
      
      // Check internal links (relative paths)
      links.forEach(link => {
        if (!isExternalUrl(link.url)) {
          const resolvedPath = resolveRelativePath(docFile, link.url, repoRoot);
          if (!fileExists(resolvedPath)) {
            brokenCrossRefs.push({
              file: path.relative(repoRoot, docFile),
              line: link.line,
              text: link.text,
              url: link.url,
              resolvedPath: path.relative(repoRoot, resolvedPath)
            });
          }
        }
      });
    });
    
    if (brokenCrossRefs.length > 0) {
      console.log('\nBroken cross-references in docs:');
      brokenCrossRefs.forEach(link => {
        console.log(`  - ${link.file}:${link.line} - [${link.text}](${link.url})`);
        console.log(`    Resolved to: ${link.resolvedPath} (does not exist)`);
      });
    }
    
    expect(brokenCrossRefs).to.have.lengthOf(0,
      `Found ${brokenCrossRefs.length} broken cross-references in docs`);
  });
});
