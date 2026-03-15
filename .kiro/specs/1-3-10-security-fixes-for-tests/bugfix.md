# Bugfix Requirements Document

## Introduction

GitHub code scanning (CodeQL) identified 2 security vulnerabilities across 3 locations in the codebase. Issue 1 is an incomplete string escaping pattern (CWE-116, CWE-20, CWE-80) in two JSDoc parsing functions that use `.replace(']', '')` instead of `.replace(/\]/g, '')`, causing only the first `]` occurrence to be removed. Issue 2 is a prototype-polluting assignment (CWE-471, CWE-915) in production code (`src/lib/tools/index.js`) where `paramstore[group][name] = param.Value` could alter `Object.prototype` if `group` or `name` resolves to `__proto__`, `constructor`, or `prototype`.

Note: While the spec title references "tests", Issue 2 (Security Issue #52) affects production code in `src/lib/tools/index.js` and must be treated with production-grade rigor.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a JSDoc `@param` tag contains a default value with multiple `]` characters (e.g., `[param=value]]`) THEN the system only removes the first `]` from the default value string because `.replace(']', '')` is used instead of a global regex, leaving subsequent `]` characters in the parsed default value (`test/helpers/jsdoc-parser.mjs:78`)

1.2 WHEN a JSDoc `@param` tag contains a default value with multiple `]` characters THEN the system only removes the first `]` from the default value string in the audit documentation script, producing incorrect parsed output (`scripts/audit-documentation.mjs:155`)

1.3 WHEN AWS SSM parameter results contain a parameter whose path segment resolves to `__proto__`, `constructor`, or `prototype` as the `group` value THEN the system assigns to `paramstore[group][name]` without guarding against prototype pollution, potentially altering `Object.prototype` and compromising application integrity (`src/lib/tools/index.js:471`)

1.4 WHEN AWS SSM parameter results contain a parameter whose final name segment is `__proto__`, `constructor`, or `prototype` THEN the system assigns to `paramstore[group][name]` without guarding against prototype pollution on the nested object, potentially injecting properties onto `Object.prototype` (`src/lib/tools/index.js:471`)

### Expected Behavior (Correct)

2.1 WHEN a JSDoc `@param` tag contains a default value with multiple `]` characters THEN the system SHALL remove all occurrences of `]` from the default value string using a global regex `/\]/g` in `test/helpers/jsdoc-parser.mjs`

2.2 WHEN a JSDoc `@param` tag contains a default value with multiple `]` characters THEN the system SHALL remove all occurrences of `]` from the default value string using a global regex `/\]/g` in `scripts/audit-documentation.mjs`

2.3 WHEN AWS SSM parameter results contain a parameter whose path segment resolves to `__proto__`, `constructor`, or `prototype` as the `group` value THEN the system SHALL skip that parameter assignment and log a warning, preventing prototype pollution in `src/lib/tools/index.js`

2.4 WHEN AWS SSM parameter results contain a parameter whose final name segment is `__proto__`, `constructor`, or `prototype` THEN the system SHALL skip that parameter assignment and log a warning, preventing prototype pollution on the nested object in `src/lib/tools/index.js`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a JSDoc `@param` tag contains a default value with zero or one `]` character THEN the system SHALL CONTINUE TO correctly parse and return the default value with `]` removed in both `test/helpers/jsdoc-parser.mjs` and `scripts/audit-documentation.mjs`

3.2 WHEN a JSDoc `@param` tag has no default value THEN the system SHALL CONTINUE TO return `null` for the `defaultValue` field in both parser files

3.3 WHEN a JSDoc `@param` tag has a simple default value without `]` characters (e.g., `[param=100]`) THEN the system SHALL CONTINUE TO correctly extract the default value string

3.4 WHEN AWS SSM parameter results contain parameters with normal group and name values (not `__proto__`, `constructor`, or `prototype`) THEN the system SHALL CONTINUE TO store key-value pairs in `paramstore[group][name]` exactly as before

3.5 WHEN AWS SSM parameter results are empty or no parameters match THEN the system SHALL CONTINUE TO return an empty `paramstore` object

3.6 WHEN AWS SSM parameters span multiple groups THEN the system SHALL CONTINUE TO organize parameters into their respective groups correctly
