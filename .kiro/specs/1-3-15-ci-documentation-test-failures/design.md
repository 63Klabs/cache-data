# CI Documentation Test Failures Bugfix Design

## Overview

Three documentation property-based test utility functions contain edge-case bugs that produce false positives in CI, causing 5 test failures across 3 test suites. The bugs are all in test utility functions — no production source code changes are needed. The fix strategy is to correct the regex/parsing logic in each utility function to eliminate false positives while preserving correct detection of real issues.

## Glossary

- **Bug_Condition (C)**: The input conditions that trigger false positive test failures in each utility function
- **Property (P)**: The desired behavior — utility functions correctly identify only genuine issues (no false positives)
- **Preservation**: Existing correct behavior of each utility function that must remain unchanged after the fix
- **extractCodeExamples**: Utility function in `executable-example-validation-tests.jest.mjs` that extracts JavaScript code blocks from markdown
- **extractMarkdownLinks**: Utility function in `documentation-link-validity-tests.jest.mjs` that extracts `[text](url)` links from markdown
- **combinedPattern**: The regex in `jsdoc-no-hallucination-tests.jest.mjs` that matches JSDoc comment blocks to their associated functions
- **Fenced code block**: A markdown code block delimited by triple backticks (` ``` `)
- **Word boundary**: A regex assertion (`\b` or equivalent) that ensures a match occurs at the boundary between a word character and a non-word character

## Bug Details

### Bug Condition

The bugs manifest in three distinct scenarios within test utility functions. Each produces false positive test failures that block CI.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type {file: string, content: string, context: string}
  OUTPUT: boolean
  
  RETURN (
    (input.context == "extractCodeExamples"
      AND input.content CONTAINS fenced block tagged "```json"
      AND "```json".startsWith("```js") == true)
    OR
    (input.context == "extractMarkdownLinks"
      AND input.content CONTAINS "[text](url)" pattern inside fenced code block
      AND function does NOT track fenced code block state)
    OR
    (input.context == "jsdocHallucination"
      AND input.content CONTAINS multiple JSDoc blocks before a function
      AND regex greedily matches from earliest "/**" to closest "*/" before function)
  )
END FUNCTION
```

### Examples

- **Bug 1**: `docs/features/tools/powertools-integration.md` contains ` ```json ` blocks with structured log examples. `extractCodeExamples` matches them because `'```json'.startsWith('```js')` is `true`, then the JSON content fails JavaScript syntax validation.

- **Bug 2**: `docs/features/tools/powertools-integration.md` contains `this.#logger[level](message, extra)` inside a fenced code block. `extractMarkdownLinks` matches `[level](message, extra)` as a markdown link, then reports it as a broken internal link.

- **Bug 3**: `src/lib/tools/PowertoolsInit.js` has many functions each with their own JSDoc. The `combinedPattern` regex `/\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?...` uses `[\s\S]*?` which is non-greedy but still matches across multiple JSDoc blocks when there's no intervening code between the `*/` of one JSDoc and the `/**` of the next. For `static getInternals()`, the regex captures `@param` tags from `parseEnvFlag`, `isCapabilityEnabled`, `tryImport`, and `isValidNamespace` JSDoc blocks.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `extractCodeExamples` must continue to extract blocks tagged as ` ```javascript ` or ` ```js ` (exact tag, not prefix)
- `extractCodeExamples` must continue to skip blocks tagged as ` ```yaml `, ` ```bash `, ` ```python `, etc.
- `extractMarkdownLinks` must continue to extract `[text](url)` links from content outside fenced code blocks
- `extractMarkdownLinks` must continue to detect broken internal links in normal markdown prose
- The JSDoc hallucination test must continue to detect genuinely hallucinated parameters (parameters documented in JSDoc that don't exist in the function signature)
- The JSDoc hallucination test must continue to work correctly for `dao-cache.js`, `dao-endpoint.js`, and `src/index.js`

**Scope:**
All inputs that do NOT involve the specific edge cases (JSON code blocks, links inside fenced blocks, multi-JSDoc files) should be completely unaffected by these fixes. This includes:
- Legitimate JavaScript code blocks in markdown
- Real markdown links outside code blocks
- Functions with a single immediately-preceding JSDoc block

## Hypothesized Root Cause

Based on the bug description, the root causes are:

1. **Missing word boundary in language tag check** (`extractCodeExamples`): The condition `line.trim().startsWith('```js')` matches any language tag beginning with `js` — including `json`, `jsx`, `jsdoc`, etc. JavaScript's `startsWith` does not enforce a word boundary.

2. **No fenced code block state tracking** (`extractMarkdownLinks`): The function iterates lines and applies the link regex to every line without checking whether the current line is inside a fenced code block. Patterns like `this.#logger[level](message, extra)` match the `[text](url)` regex.

3. **Greedy cross-JSDoc matching** (`jsdoc-no-hallucination-tests.jest.mjs`): The `combinedPattern` regex uses `\/\*\*([\s\S]*?)\*\/` which matches from any `/**` to the nearest `*/`. When multiple JSDoc blocks appear consecutively (separated only by function code), the regex can start matching from an earlier `/**` and capture content from multiple JSDoc blocks. The real issue is that the regex engine finds the first `/**` in the file and then the `\s*` after `*/` allows it to skip over intervening code to reach the function declaration.

## Correctness Properties

Property 1: Bug Condition - Code Block Language Tag Precision

_For any_ markdown content containing a fenced code block with a language tag that starts with `js` but is NOT exactly `js` or `javascript` (e.g., `json`, `jsx`, `jsdoc`), the fixed `extractCodeExamples` function SHALL NOT extract that block as a JavaScript example.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Link Extraction Respects Fenced Code Blocks

_For any_ markdown content containing text matching the `[text](url)` pattern inside a fenced code block, the fixed `extractMarkdownLinks` function SHALL NOT extract that text as a markdown link.

**Validates: Requirements 2.2**

Property 3: Bug Condition - JSDoc Association Precision

_For any_ source file containing multiple functions each with their own JSDoc block, the fixed JSDoc hallucination test regex SHALL only associate the immediately preceding JSDoc block (the `/** ... */` with no intervening function declarations) with each function.

**Validates: Requirements 2.3**

Property 4: Preservation - Legitimate JavaScript Extraction

_For any_ markdown content containing fenced code blocks tagged exactly as ` ```javascript ` or ` ```js ` (followed by end-of-line or whitespace), the fixed `extractCodeExamples` function SHALL continue to extract those blocks exactly as before.

**Validates: Requirements 3.1, 3.4**

Property 5: Preservation - Legitimate Link Extraction

_For any_ markdown content containing `[text](url)` links outside of fenced code blocks, the fixed `extractMarkdownLinks` function SHALL continue to extract those links exactly as before.

**Validates: Requirements 3.2, 3.5**

Property 6: Preservation - Legitimate Hallucination Detection

_For any_ source file where a function's immediately preceding JSDoc block documents parameters that don't exist in the function signature, the fixed JSDoc hallucination test SHALL continue to report those as hallucinated parameters.

**Validates: Requirements 3.3, 3.6**

## Fix Implementation

### Changes Required

All fixes are in test utility functions. No production source code changes needed.

**File**: `test/documentation/property/executable-example-validation-tests.jest.mjs`

**Function**: `extractCodeExamples`

**Specific Changes**:
1. **Replace `startsWith` with exact match**: Change the condition from `line.trim().startsWith('```javascript') || line.trim().startsWith('```js')` to use a regex or exact comparison that enforces a word boundary after `js`. The fix should match ` ```js ` (followed by end-of-line or whitespace) but NOT ` ```json `, ` ```jsx `, etc.
   - Replace: `line.trim().startsWith('```javascript') || line.trim().startsWith('```js')`
   - With: `/^```(javascript|js)\s*$/.test(line.trim())`

---

**File**: `test/documentation/property/documentation-link-validity-tests.jest.mjs`

**Function**: `extractMarkdownLinks`

**Specific Changes**:
2. **Add fenced code block state tracking**: Add a boolean `inCodeBlock` variable that toggles when a line starts with ` ``` `. Skip link extraction for lines where `inCodeBlock` is true.
   - Add `let inCodeBlock = false;` before the line iteration
   - At the start of the line loop, check if `line.trim().startsWith('```')` and toggle `inCodeBlock`
   - Skip the regex matching when `inCodeBlock` is true

---

**File**: `test/documentation/property/jsdoc-no-hallucination-tests.jest.mjs`

**Function**: The `combinedPattern` regex used in the tools module test

**Specific Changes**:
3. **Match only the immediately preceding JSDoc block**: Replace the greedy `\/\*\*([\s\S]*?)\*\/` pattern with a non-cross-JSDoc pattern. The fix should ensure the captured JSDoc content does not itself contain `*/` followed by another `/**` — i.e., it must be a single contiguous JSDoc block.
   - Replace: `/\/\*\*([\s\S]*?)\*\/\s*(?:static\s+)?(?:async\s+)?(?:const\s+)?([_#]?\w+)\s*[=:]?\s*(?:async\s+)?(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*\{/g`
   - With: `/\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\s*(?:static\s+)?(?:async\s+)?(?:const\s+)?([_#]?\w+)\s*[=:]?\s*(?:async\s+)?(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*\{/g`
   - The key change is using `(?:(?!\*\/)[\s\S])*?` (tempered greedy token) which prevents matching across `*/` boundaries, ensuring only the last JSDoc block before the function is captured.
   - Additionally, the same fix should be applied to the `methodPattern` and `functionPattern` regexes in the other test cases (dao-cache.js, dao-endpoint.js, src/index.js tests).

4. **Alternative approach for JSDoc**: Instead of fixing the regex, use a two-pass approach:
   - First pass: Find all function declarations with their positions
   - Second pass: For each function, search backwards from its position to find the nearest `/** ... */` block with no intervening code statements
   - This is more robust but requires more refactoring

5. **Recommended approach**: Use the simpler regex fix (option 3) since it's minimal and targeted. The tempered greedy token `(?:(?!\*\/)[\s\S])*?` ensures the match cannot span across a `*/` boundary, so only the immediately preceding JSDoc block is captured.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Run the existing test suite on the UNFIXED code to observe the 5 failures and confirm they match the hypothesized root causes.

**Test Cases**:
1. **JSON Code Block Test**: Run `executable-example-validation-tests.jest.mjs` and observe that JSON blocks are incorrectly extracted (will fail on unfixed code)
2. **Code Block Link Test**: Run `documentation-link-validity-tests.jest.mjs` and observe that `[level](message, extra)` inside code blocks is reported as a broken link (will fail on unfixed code)
3. **JSDoc Cross-Contamination Test**: Run `jsdoc-no-hallucination-tests.jest.mjs` and observe that `getInternals()` reports hallucinated params from other functions (will fail on unfixed code)

**Expected Counterexamples**:
- `extractCodeExamples` extracts JSON blocks and they fail syntax validation
- `extractMarkdownLinks` reports code-block content as broken links
- JSDoc test reports `value`, `globalFlag`, `individualFlag`, `isImportable`, `packageName`, `namespace` as hallucinated params for `getInternals()`
- Possible causes confirmed: prefix matching without word boundary, no code block tracking, greedy regex spanning multiple JSDoc blocks

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedUtilityFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

Specifically:
- For `extractCodeExamples`: JSON/JSX/JSDOC blocks are NOT extracted
- For `extractMarkdownLinks`: Links inside fenced code blocks are NOT extracted
- For JSDoc test: Only the immediately preceding JSDoc block is associated with each function

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs (legitimate JS blocks, links outside code blocks, single-JSDoc functions), then write property-based tests capturing that behavior.

**Test Cases**:
1. **JS Block Preservation**: Verify that ` ```javascript ` and ` ```js ` blocks continue to be extracted correctly
2. **Link Extraction Preservation**: Verify that links in normal markdown prose continue to be extracted
3. **JSDoc Detection Preservation**: Verify that genuinely hallucinated parameters in dao-cache.js, dao-endpoint.js, and src/index.js continue to be detected
4. **Other Language Block Preservation**: Verify that ` ```yaml `, ` ```bash `, ` ```python ` blocks continue to be skipped

### Unit Tests

- Test `extractCodeExamples` with ` ```json `, ` ```jsx `, ` ```jsdoc ` blocks (should skip)
- Test `extractCodeExamples` with ` ```js ` and ` ```javascript ` blocks (should extract)
- Test `extractMarkdownLinks` with links inside fenced code blocks (should skip)
- Test `extractMarkdownLinks` with links outside fenced code blocks (should extract)
- Test JSDoc regex with file containing multiple consecutive JSDoc blocks (should only match nearest)
- Test JSDoc regex with file containing single JSDoc before function (should match correctly)

### Property-Based Tests

- Generate random markdown with mixed code block language tags and verify only `js`/`javascript` blocks are extracted
- Generate random markdown with links both inside and outside fenced code blocks and verify only outside links are extracted
- Generate random source files with varying numbers of JSDoc blocks and verify each function only gets its immediately preceding JSDoc

### Integration Tests

- Run the full documentation test suite after fixes and verify all 5 previously-failing tests now pass
- Run the full documentation test suite and verify no new failures are introduced
- Verify the fixes work correctly with the actual project files (`powertools-integration.md`, `PowertoolsInit.js`)
