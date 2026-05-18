# Bugfix Requirements Document

## Introduction

The GitHub Actions CI pipeline is failing with 5 test failures across 3 documentation property-based test suites. These tests validate JSDoc accuracy, markdown link validity, and code example syntax. The failures are caused by edge cases in the test utility functions that produce false positives, and by a JSDoc comment on `getInternals()` that the test's regex incorrectly associates with parameters from other functions in the file.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the `extractCodeExamples` function in `executable-example-validation-tests.jest.mjs` encounters a fenced code block tagged as ` ```json ` THEN the system incorrectly extracts it as a JavaScript example because `'```json'.startsWith('```js')` evaluates to `true`, causing JSON content to fail JavaScript syntax validation

1.2 WHEN the `extractMarkdownLinks` function in `documentation-link-validity-tests.jest.mjs` encounters text matching the `[text](url)` pattern inside a fenced code block (e.g., `this.#logger[level](message, extra)`) THEN the system incorrectly reports it as a broken internal link because the function does not track whether it is inside a fenced code block

1.3 WHEN the JSDoc hallucination test regex in `jsdoc-no-hallucination-tests.jest.mjs` scans `PowertoolsInit.js` for the `static getInternals()` method THEN the system matches the module-level `/**` comment at the top of the file through to the `*/` immediately before `static getInternals()`, capturing `@param` tags from intermediate function JSDoc comments (`parseEnvFlag`, `isCapabilityEnabled`, `tryImport`, `isValidNamespace`) as hallucinated parameters

### Expected Behavior (Correct)

2.1 WHEN the `extractCodeExamples` function encounters a fenced code block tagged as ` ```json ` THEN the system SHALL skip it and only extract blocks explicitly tagged as ` ```javascript ` or ` ```js ` (with a word boundary after `js` to prevent matching `json`, `jsx`, etc.)

2.2 WHEN the `extractMarkdownLinks` function encounters text inside a fenced code block (between ` ``` ` opening and closing markers) THEN the system SHALL skip link extraction for those lines, only extracting links from content outside fenced code blocks

2.3 WHEN the JSDoc hallucination test regex scans a source file THEN the system SHALL only associate the JSDoc comment immediately preceding a function (the closest `/** ... */` block with no intervening code) with that function, preventing cross-contamination from earlier JSDoc blocks in the file

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `extractCodeExamples` function encounters a fenced code block tagged as ` ```javascript ` or ` ```js ` (exact language tags) THEN the system SHALL CONTINUE TO extract and validate those blocks as JavaScript

3.2 WHEN the `extractMarkdownLinks` function encounters markdown links outside of fenced code blocks THEN the system SHALL CONTINUE TO extract and validate those links normally

3.3 WHEN the JSDoc hallucination test scans functions that have `@param` tags in their immediately preceding JSDoc comment that don't match the function signature THEN the system SHALL CONTINUE TO report those as hallucinated parameters

3.4 WHEN the `extractCodeExamples` function encounters code blocks with other language tags (` ```yaml `, ` ```bash `, ` ```python `, etc.) THEN the system SHALL CONTINUE TO skip those blocks

3.5 WHEN the link validity test encounters actual broken links in markdown files outside of code blocks THEN the system SHALL CONTINUE TO report those as broken links

3.6 WHEN the JSDoc hallucination test scans other source files (dao-cache.js, dao-endpoint.js, src/index.js) THEN the system SHALL CONTINUE TO correctly detect hallucinated parameters in those files
