# Security Fixes Bugfix Design

## Overview

This bugfix addresses two CodeQL-identified security vulnerabilities across three file locations. Issue 1 is an incomplete string escaping pattern (CWE-116) in two JSDoc `@param` parsers where `.replace(']', '')` only removes the first `]` occurrence. Issue 2 is a prototype-polluting assignment (CWE-471, CWE-915) in production code where `paramstore[group][name] = param.Value` can alter `Object.prototype` if `group` or `name` resolves to `__proto__`, `constructor`, or `prototype`. The fix strategy is minimal and targeted: replace the string `.replace()` with a global regex in both parser files, and add a dangerous-key guard in the production `_getParametersFromStore` method.

## Glossary

- **Bug_Condition (C)**: The condition that triggers each bug — (1) a JSDoc default value string containing multiple `]` characters, or (2) an SSM parameter whose group or name resolves to a prototype-polluting key
- **Property (P)**: The desired behavior — (1) all `]` characters are removed from default values, (2) dangerous keys are skipped with a warning logged
- **Preservation**: Existing parsing behavior for normal JSDoc tags and normal SSM parameter storage must remain unchanged
- **`parseParamTag`**: The function in `test/helpers/jsdoc-parser.mjs` and `scripts/audit-documentation.mjs` that parses JSDoc `@param` tags into structured objects
- **`_getParametersFromStore`**: The static method in `src/lib/tools/index.js` (`AppConfig` class) that retrieves AWS SSM parameters and stores them in a plain object keyed by group and name
- **`paramstore`**: The plain object in `_getParametersFromStore` that accumulates parameter key-value pairs organized by group
- **Dangerous keys**: The strings `__proto__`, `constructor`, and `prototype` which, when used as property names on plain objects, can cause prototype pollution

## Bug Details

### Bug Condition

The bugs manifest in two distinct scenarios:

**Issue 1 (Incomplete String Escaping):** When a JSDoc `@param` tag contains a default value with multiple `]` characters (e.g., `[param=value]]`), the `.replace(']', '')` call only removes the first `]`, leaving subsequent occurrences in the parsed `defaultValue` field.

**Issue 2 (Prototype Pollution):** When AWS SSM parameter results contain a parameter whose path-derived `group` or name-derived `name` value equals `__proto__`, `constructor`, or `prototype`, the assignment `paramstore[group][name] = param.Value` can modify `Object.prototype`, compromising all objects in the runtime.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type {issue: 1|2, context: Object}
  OUTPUT: boolean

  IF input.issue == 1 THEN
    // Incomplete string escaping
    LET tag = input.context.jsdocLine
    LET defaultValuePart = extractDefaultValue(tag)
    LET bracketCount = countOccurrences(defaultValuePart, ']')
    RETURN bracketCount >= 2

  ELSE IF input.issue == 2 THEN
    // Prototype pollution
    LET group = input.context.group
    LET name = input.context.name
    LET DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype']
    RETURN group IN DANGEROUS_KEYS OR name IN DANGEROUS_KEYS

  END IF
END FUNCTION
```

### Examples

- **Issue 1, Example A**: `@param {string} [name=default]]` — `.replace(']', '')` produces `defaultValue = "default]"` (trailing `]` remains). Expected: `defaultValue = "default"`
- **Issue 1, Example B**: `@param {string} [name=val]]]` — produces `defaultValue = "val]]"`. Expected: `defaultValue = "val"`
- **Issue 1, Edge Case**: `@param {string} [name=val]` — single `]` is correctly removed by both old and new code. No behavior change.
- **Issue 2, Example A**: SSM parameter `/app/__proto__/polluted` with group resolving to `__proto__` — `paramstore["__proto__"]["polluted"] = value` modifies `Object.prototype.polluted`. Expected: parameter is skipped, warning logged.
- **Issue 2, Example B**: SSM parameter `/app/config/__proto__` with name resolving to `__proto__` — `paramstore["config"]["__proto__"] = value` modifies `Object.prototype` via the nested object. Expected: parameter is skipped, warning logged.
- **Issue 2, Edge Case**: SSM parameter `/app/config/apiKey` — normal group and name, stored as `paramstore["config"]["apiKey"] = value`. No behavior change.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- JSDoc `@param` tags with zero or one `]` character in the default value continue to parse correctly, producing the same `defaultValue` output
- JSDoc `@param` tags with no default value continue to return `null` for `defaultValue`
- JSDoc `@param` tags with simple default values (e.g., `[param=100]`) continue to extract the correct default value string
- AWS SSM parameters with normal group and name values (not dangerous keys) continue to be stored in `paramstore[group][name]` exactly as before
- Empty SSM parameter results continue to return an empty `paramstore` object
- Multi-group SSM parameters continue to be organized into their respective groups correctly
- The return type and structure of `paramstore` remains a plain object (not Map) for backwards compatibility

**Scope:**
All inputs that do NOT involve multiple `]` characters in JSDoc default values or dangerous prototype-polluting keys in SSM parameters should be completely unaffected by this fix. This includes:
- Normal JSDoc `@param` parsing (all tag formats)
- Normal SSM parameter retrieval and storage
- All other `parseParamTag` fields (`name`, `type`, `description`, `optional`)
- All other `_getParametersFromStore` logic (path queries, name queries, promise handling)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Issue 1 — String.replace with string argument**: In both `test/helpers/jsdoc-parser.mjs:78` and `scripts/audit-documentation.mjs:155`, the code uses `.replace(']', '')` which is JavaScript's `String.prototype.replace(string, replacement)` form. Per the ECMAScript specification, when the first argument is a string (not a regex), only the first occurrence is replaced. The fix is to use `.replace(/\]/g, '')` which uses a global regex to replace all occurrences.

2. **Issue 2 — Unguarded dynamic property assignment**: In `src/lib/tools/index.js` within `AppConfig._getParametersFromStore`, the code assigns `paramstore[group][name] = param.Value` where both `group` and `name` are derived from SSM parameter paths. If an SSM parameter path contains `__proto__`, `constructor`, or `prototype` as a segment, the assignment can modify `Object.prototype`. The code does not validate these keys before assignment. The fix is to add a guard that checks both `group` and `name` against dangerous keys before assignment, skipping and logging a warning if either matches.

## Correctness Properties

Property 1: Bug Condition — Incomplete String Escaping Fix

_For any_ JSDoc `@param` tag string where the default value portion contains two or more `]` characters, the fixed `parseParamTag` function SHALL remove all `]` characters from the `defaultValue` field, producing a clean string with no remaining `]` characters.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Prototype Pollution Guard

_For any_ SSM parameter result where the derived `group` or `name` value equals `__proto__`, `constructor`, or `prototype`, the fixed `_getParametersFromStore` method SHALL skip that parameter assignment entirely and log a warning, ensuring `Object.prototype` is not modified.

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation — JSDoc Parsing Unchanged for Normal Inputs

_For any_ JSDoc `@param` tag string where the default value portion contains zero or one `]` character (or has no default value), the fixed `parseParamTag` function SHALL produce the same `defaultValue` result as the original function.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 4: Preservation — SSM Parameter Storage Unchanged for Normal Keys

_For any_ SSM parameter result where neither the derived `group` nor `name` value equals `__proto__`, `constructor`, or `prototype`, the fixed `_getParametersFromStore` method SHALL store the parameter in `paramstore[group][name]` exactly as the original function does.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `test/helpers/jsdoc-parser.mjs`

**Function**: `parseParamTag`

**Specific Changes**:
1. **Line 78 — Replace string `.replace()` with global regex**: Change `.replace(']', '')` to `.replace(/\]/g, '')` to remove all `]` occurrences from the default value string.

---

**File**: `scripts/audit-documentation.mjs`

**Function**: `parseParamTag`

**Specific Changes**:
1. **Line 155 — Replace string `.replace()` with global regex**: Change `.replace(']', '')` to `.replace(/\]/g, '')` — identical fix to the test helper.

---

**File**: `src/lib/tools/index.js`

**Function**: `AppConfig._getParametersFromStore`

**Specific Changes**:
1. **Add dangerous key constant**: Define `const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];` at the top of the `results.forEach` block or as a local constant within the method.
2. **Add guard before assignment**: Before `paramstore[group][name] = param.Value`, check if `group` or `name` is in `DANGEROUS_KEYS`. If either matches, skip the assignment and log a warning using `DebugAndLog.warn()`.
3. **Add security comment**: Use `// >!` notation to document the security rationale for the guard.
4. **Preserve existing flow**: The guard should use `continue` (or early return within the `forEach` callback) to skip only the dangerous parameter, allowing all other parameters to be processed normally.

**Pseudocode for the guard:**
```
results.forEach(param => {
    // ... existing name/group derivation ...

    // >! Guard against prototype pollution (CWE-471)
    const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
    if (DANGEROUS_KEYS.includes(group) || DANGEROUS_KEYS.includes(name)) {
        DebugAndLog.warn(`Skipping dangerous parameter key: group="${group}", name="${name}"`);
        return; // skip this parameter
    }

    // ... existing paramstore assignment ...
});
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise the specific bug conditions on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Multi-bracket default value test (jsdoc-parser)**: Parse `@param {string} [name=default]]` and assert `defaultValue` equals `"default"` (will fail on unfixed code — returns `"default]"`)
2. **Multi-bracket default value test (audit-documentation)**: Same input against the audit script's parser (will fail on unfixed code)
3. **Prototype pollution via group key**: Create mock SSM results with group resolving to `__proto__` and verify `Object.prototype` is not modified (will fail on unfixed code)
4. **Prototype pollution via name key**: Create mock SSM results with name resolving to `__proto__` and verify `Object.prototype` is not modified (will fail on unfixed code)

**Expected Counterexamples**:
- `parseParamTag('@param {string} [name=val]]')` returns `defaultValue: "val]"` instead of `"val"`
- `paramstore["__proto__"]["key"] = value` modifies `Object.prototype.key` to equal `value`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL jsdocLine WHERE countBrackets(extractDefault(jsdocLine), ']') >= 2 DO
  result := parseParamTag_fixed(jsdocLine)
  ASSERT result.defaultValue does NOT contain ']'
END FOR

FOR ALL ssmParam WHERE group IN DANGEROUS_KEYS OR name IN DANGEROUS_KEYS DO
  paramstore := _getParametersFromStore_fixed([ssmParam])
  ASSERT Object.prototype is unmodified
  ASSERT paramstore does NOT contain the dangerous key path
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL jsdocLine WHERE countBrackets(extractDefault(jsdocLine), ']') <= 1 DO
  ASSERT parseParamTag_original(jsdocLine) = parseParamTag_fixed(jsdocLine)
END FOR

FOR ALL ssmParam WHERE group NOT IN DANGEROUS_KEYS AND name NOT IN DANGEROUS_KEYS DO
  ASSERT _getParametersFromStore_original([ssmParam]) = _getParametersFromStore_fixed([ssmParam])
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many JSDoc tag variations automatically to verify parsing is unchanged
- It generates many SSM parameter name/group combinations to verify storage is unchanged
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **JSDoc parsing preservation**: Generate random `@param` tags with zero or one `]` in default values, verify `parseParamTag` output is identical before and after fix
2. **JSDoc no-default preservation**: Generate random `@param` tags without default values, verify `defaultValue` remains `null`
3. **SSM normal key preservation**: Generate random SSM parameter results with safe group/name values, verify `paramstore` output is identical before and after fix
4. **SSM empty results preservation**: Verify empty parameter arrays continue to return empty `paramstore`

### Unit Tests

- Test `parseParamTag` with multiple `]` characters in default value (both files)
- Test `parseParamTag` with single `]` in default value (regression)
- Test `parseParamTag` with no default value (regression)
- Test `_getParametersFromStore` with `__proto__` as group key
- Test `_getParametersFromStore` with `constructor` as name key
- Test `_getParametersFromStore` with `prototype` as group key
- Test `_getParametersFromStore` with normal parameters (regression)
- Test `_getParametersFromStore` with mix of dangerous and normal parameters (only dangerous skipped)

### Property-Based Tests

- Generate random JSDoc `@param` tag strings with varying numbers of `]` in default values, verify all `]` are removed from `defaultValue`
- Generate random safe group/name strings (excluding dangerous keys), verify `paramstore` stores them correctly
- Generate random SSM parameter sets mixing dangerous and safe keys, verify only dangerous keys are skipped and safe keys are stored

### Integration Tests

- Test full `parseParamTag` flow with realistic JSDoc lines from the codebase
- Test `_getParametersFromStore` with mocked AWS SSM responses containing mixed safe and dangerous parameter paths
- Verify `DebugAndLog.warn` is called when dangerous keys are encountered
