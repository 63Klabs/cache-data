/**
 * Property-Based Tests for README Feature Coverage
 * 
 * Feature: documentation-enhancement
 * Property 7: README Feature Coverage
 * 
 * For any major module exported by the package (tools, cache, endpoint),
 * the README SHALL mention that module and its primary purpose.
 * 
 * Validates: Requirements 3.3
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fc from 'fast-check';
// >! Import secure module.exports parsing to prevent string escaping vulnerabilities
import { parseModuleExports } from '../../helpers/jsdoc-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Property 7: README Feature Coverage', () => {
  let readmeContent;
  let indexExports;

  beforeAll(() => {
    // Read README.md
    const readmePath = path.join(__dirname, '../../../README.md');
    readmeContent = fs.readFileSync(readmePath, 'utf8');

    // Read src/index.js to get exported modules
    const indexPath = path.join(__dirname, '../../../src/index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // >! Use secure bracket counting to parse module.exports
    indexExports = parseModuleExports(indexContent);

  });

  it('should mention all exported modules in README', () => {
    // Verify we found exports
    expect(indexExports).toBeInstanceOf(Array);
    expect(indexExports.length).toBeGreaterThan(0);

    // Check each exported module is mentioned in README
    indexExports.forEach(moduleName => {
      const moduleNameLower = moduleName.toLowerCase();
      const readmeLower = readmeContent.toLowerCase();
      
      expect(readmeLower).toContain(moduleNameLower);
    });
  });

  it('should have a Features section', () => {
    expect(readmeContent).toMatch(/##\s+Features/i);
  });

  it('Property: For any exported module, README mentions that module', () => {
    // Property-based test: for any subset of exported modules,
    // all should be mentioned in README
    fc.assert(
      fc.property(
        fc.subarray(indexExports, { minLength: 1 }),
        (selectedModules) => {
          const readmeLower = readmeContent.toLowerCase();
          
          return selectedModules.every(moduleName => {
            const moduleNameLower = moduleName.toLowerCase();
            return readmeLower.includes(moduleNameLower);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Features section should describe module purposes', () => {
    // Extract Features section - match until next level-2 heading (##) but not level-3 (###)
    const featuresMatch = readmeContent.match(/##\s+Features([\s\S]*?)(?=\n##\s+[^#]|$)/i);
    expect(featuresMatch).not.toBeNull();
    
    const featuresSection = featuresMatch[1];

    // Property: Each module should have descriptive content in Features section
    fc.assert(
      fc.property(
        fc.constantFrom(...indexExports),
        (moduleName) => {
          const moduleNameLower = moduleName.toLowerCase();
          const featuresSectionLower = featuresSection.toLowerCase();
          
          // Module should be mentioned in features section
          if (!featuresSectionLower.includes(moduleNameLower)) {
            return false;
          }

          // Find the module section and check it has substantial content
          // (at least 50 characters of description)
          // Match patterns like "### Cache Module" or "### cache" (case insensitive)
          const modulePattern = new RegExp(
            `###\\s+${moduleName}(?:\\s+module)?([\\s\\S]{50,}?)(?=\\n###|\\n##|$)`,
            'i'
          );
          const moduleSection = featuresSection.match(modulePattern);
          
          return moduleSection !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Each module section should list capabilities', () => {
    // Extract Features section - match until next level-2 heading (##) but not level-3 (###)
    const featuresMatch = readmeContent.match(/##\s+Features([\s\S]*?)(?=\n##\s+[^#]|$)/i);
    const featuresSection = featuresMatch[1];

    // Property: Each module section should have bullet points or list items
    fc.assert(
      fc.property(
        fc.constantFrom(...indexExports),
        (moduleName) => {
          // Find the module section - match patterns like "### Cache Module" or "### cache"
          const modulePattern = new RegExp(
            `###\\s+${moduleName}(?:\\s+module)?([\\s\\S]+?)(?=\\n###|\\n##|$)`,
            'i'
          );
          const moduleSection = featuresSection.match(modulePattern);
          
          if (!moduleSection) {
            return false;
          }

          const sectionContent = moduleSection[1];
          
          // Should have at least one bullet point or numbered list
          const hasBulletPoints = /^[\s]*[-*+]\s+/m.test(sectionContent);
          const hasNumberedList = /^[\s]*\d+\.\s+/m.test(sectionContent);
          
          return hasBulletPoints || hasNumberedList;
        }
      ),
      { numRuns: 100 }
    );
  });
});
