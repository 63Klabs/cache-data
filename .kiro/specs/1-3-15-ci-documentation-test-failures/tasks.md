# Implementation Plan

## Overview

Fix three documentation property-based test utility functions that contain edge-case bugs producing false positives in CI, causing 5 test failures across 3 test suites. The bugs are in `extractCodeExamples` (prefix matching without word boundary), `extractMarkdownLinks` (no fenced code block state tracking), and `combinedPattern` regex (greedy cross-JSDoc matching). No production source code changes are needed.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Documentation Test Utility False Positives
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bugs exist in the test utility functions
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases:
    - Bug 1: `extractCodeExamples` incorrectly extracts ` ```json ` blocks because `'```json'.startsWith('```js')` is `true`
    - Bug 2: `extractMarkdownLinks` extracts `[level](message, extra)` from inside fenced code blocks
    - Bug 3: `combinedPattern` regex in JSDoc test captures `@param` tags from unrelated JSDoc blocks for `getInternals()`
  - Test that `extractCodeExamples` does NOT extract blocks tagged as ` ```json `, ` ```jsx `, ` ```jsdoc ` (from Bug Condition in design: `input.content CONTAINS fenced block tagged "```json" AND "```json".startsWith("```js") == true`)
  - Test that `extractMarkdownLinks` does NOT extract link-like patterns from inside fenced code blocks (from Bug Condition in design: `input.content CONTAINS "[text](url)" pattern inside fenced code block AND function does NOT track fenced code block state`)
  - Test that JSDoc regex only associates the immediately preceding JSDoc block with each function, not earlier blocks (from Bug Condition in design: `input.content CONTAINS multiple JSDoc blocks before a function AND regex greedily matches from earliest "/**"`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - `extractCodeExamples` extracts JSON blocks and they fail syntax validation
    - `extractMarkdownLinks` reports `[level](message, extra)` inside code blocks as broken links
    - JSDoc test reports `value`, `globalFlag`, `individualFlag`, `isImportable`, `packageName`, `namespace` as hallucinated params for `getInternals()`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Documentation Test Utility Correct Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `extractCodeExamples` correctly extracts ` ```javascript ` and ` ```js ` blocks from markdown
    - Observe: `extractCodeExamples` correctly skips ` ```yaml `, ` ```bash `, ` ```python ` blocks
    - Observe: `extractMarkdownLinks` correctly extracts `[text](url)` links from content outside fenced code blocks
    - Observe: JSDoc hallucination test correctly detects genuinely hallucinated parameters in `dao-cache.js`, `dao-endpoint.js`, and `src/index.js`
    - Observe: JSDoc regex correctly associates single immediately-preceding JSDoc blocks with their functions
  - Write property-based tests capturing observed behavior patterns:
    - Property: For all markdown content with ` ```javascript ` or ` ```js ` (exact tag) blocks, `extractCodeExamples` extracts those blocks (from Preservation Requirements in design)
    - Property: For all markdown content with ` ```yaml `, ` ```bash `, ` ```python ` blocks, `extractCodeExamples` does NOT extract those blocks
    - Property: For all markdown content with `[text](url)` links outside fenced code blocks, `extractMarkdownLinks` extracts those links
    - Property: For all source files where a function has a single immediately-preceding JSDoc with hallucinated params, the test detects them
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for CI documentation test false positives

  - [x] 3.1 Fix `extractCodeExamples` in `test/documentation/property/executable-example-validation-tests.jest.mjs`
    - Replace `line.trim().startsWith('```javascript') || line.trim().startsWith('```js')` with `/^```(javascript|js)\s*$/.test(line.trim())` to enforce word boundary after `js`
    - This prevents matching ` ```json `, ` ```jsx `, ` ```jsdoc `, etc.
    - _Bug_Condition: isBugCondition(input) where input.context == "extractCodeExamples" AND "```json".startsWith("```js") == true_
    - _Expected_Behavior: extractCodeExamples SHALL NOT extract blocks tagged as json, jsx, jsdoc — only exact js or javascript_
    - _Preservation: extractCodeExamples SHALL CONTINUE TO extract blocks tagged as ` ```javascript ` or ` ```js ` (exact tag)_
    - _Requirements: 1.1, 2.1, 3.1, 3.4_

  - [x] 3.2 Fix `extractMarkdownLinks` in `test/documentation/property/documentation-link-validity-tests.jest.mjs`
    - Add `let inCodeBlock = false;` before the line iteration loop
    - At the start of the line loop, check if `line.trim().startsWith('```')` and toggle `inCodeBlock`
    - Skip the regex matching (link extraction) when `inCodeBlock` is true
    - _Bug_Condition: isBugCondition(input) where input.context == "extractMarkdownLinks" AND content CONTAINS "[text](url)" inside fenced code block_
    - _Expected_Behavior: extractMarkdownLinks SHALL NOT extract link-like patterns from inside fenced code blocks_
    - _Preservation: extractMarkdownLinks SHALL CONTINUE TO extract [text](url) links from content outside fenced code blocks_
    - _Requirements: 1.2, 2.2, 3.2, 3.5_

  - [x] 3.3 Fix `combinedPattern` regex in `test/documentation/property/jsdoc-no-hallucination-tests.jest.mjs`
    - Replace `\/\*\*([\s\S]*?)\*\/` with `\/\*\*(?:(?!\*\/)[\s\S])*?\*\/` (tempered greedy token) in `combinedPattern` for the tools module test
    - This prevents the regex from matching across `*/` boundaries, ensuring only the immediately preceding JSDoc block is captured
    - Apply the same tempered greedy token fix to `methodPattern` in the dao-cache.js test case
    - Apply the same tempered greedy token fix to `functionPattern` in the dao-endpoint.js and src/index.js test cases
    - Note: The capture group for JSDoc content shifts — update match indices accordingly (match[1] becomes the function name, match[2] becomes params; JSDoc content is captured differently)
    - _Bug_Condition: isBugCondition(input) where input.context == "jsdocHallucination" AND regex greedily matches from earliest "/**" to closest "*/" before function_
    - _Expected_Behavior: JSDoc regex SHALL only associate the immediately preceding JSDoc block with each function_
    - _Preservation: JSDoc hallucination test SHALL CONTINUE TO detect genuinely hallucinated parameters in dao-cache.js, dao-endpoint.js, and src/index.js_
    - _Requirements: 1.3, 2.3, 3.3, 3.6_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Documentation Test Utility False Positives
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - `extractCodeExamples` no longer extracts ` ```json ` blocks
      - `extractMarkdownLinks` no longer extracts links from inside fenced code blocks
      - JSDoc regex only associates the immediately preceding JSDoc block with each function
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Documentation Test Utility Correct Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions):
      - ` ```javascript ` and ` ```js ` blocks still extracted correctly
      - Links outside code blocks still extracted correctly
      - Genuinely hallucinated parameters still detected in dao-cache.js, dao-endpoint.js, src/index.js

- [x] 4. Run full documentation test suite to verify all 5 failures are resolved
  - Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js test/documentation/property/`
  - Verify `executable-example-validation-tests.jest.mjs` passes (no JSON blocks extracted as JS)
  - Verify `documentation-link-validity-tests.jest.mjs` passes (no false broken links from code blocks)
  - Verify `jsdoc-no-hallucination-tests.jest.mjs` passes (no cross-JSDoc contamination for `getInternals()`)
  - Confirm 0 test failures across all 3 test suites
  - Run full project test suite: `npm test` to ensure no regressions in any other test suites
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["3.4", "3.5"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```

## Notes

- All fixes are in test utility functions only — no production source code changes needed
- The three bugs are independent but all cause false positives in CI
- Property-based tests use fast-check library for input generation
- Run tests with `node --experimental-vm-modules` flag for ESM support
- The tempered greedy token `(?:(?!\*\/)[\s\S])*?` is the key regex fix for JSDoc cross-contamination
