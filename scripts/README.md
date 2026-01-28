# Documentation Validation Scripts

This directory contains scripts for validating and auditing documentation in the @63klabs/cache-data package.

## Scripts

### audit-documentation.mjs

Comprehensive documentation audit and validation script that checks:

- **JSDoc Completeness**: Ensures all exported functions have complete JSDoc with required tags (@param, @returns, @example)
- **JSDoc Accuracy**: Verifies that documented parameters match actual function signatures
- **Link Validation**: Checks all links in documentation files to ensure they point to existing files
- **Example Code Validation**: Validates that JavaScript code examples have correct syntax

#### Usage

```bash
node scripts/audit-documentation.mjs
```

#### Output

The script generates a detailed report at:
```
.kiro/specs/1-3-6-documentation-enhancement/audit-report.json
```

The report includes:
- Summary statistics (coverage percentages, error counts)
- List of functions missing JSDoc
- List of functions with incomplete JSDoc
- List of functions with inaccurate JSDoc (hallucinated parameters)
- List of broken links in documentation
- List of invalid code examples

#### Exit Codes

- `0`: All validation checks passed
- `1`: Critical errors found (missing JSDoc, inaccurate JSDoc, broken links, or invalid examples)

### Pre-Commit Hook

A Git pre-commit hook is installed at `.git/hooks/pre-commit` that automatically runs documentation validation before each commit.

#### How It Works

1. When you run `git commit`, the hook automatically executes
2. It runs `audit-documentation.mjs` to validate all documentation
3. If critical errors are found, the commit is blocked
4. You must fix the errors before committing

#### Bypassing the Hook

If you need to commit despite validation errors (not recommended):

```bash
git commit --no-verify
```

#### Installing the Hook

The hook is automatically created when task 16.3 is completed. If you need to reinstall it:

```bash
chmod +x .git/hooks/pre-commit
```

## Validation Requirements

### JSDoc Requirements

All exported functions, methods, and classes must have:

1. **Description**: Clear explanation of what the function does
2. **@param tags**: For each parameter, with type and description
3. **@returns tag**: With detailed type information and description
4. **@example tag**: Demonstrating typical usage
5. **@throws tag**: If the function can throw errors (optional but recommended)

### Type Annotation Standards

- Promises: `{Promise<ResolvedType>}`
- Arrays: `{Array.<ElementType>}`
- Objects: `{Object.<string, Type>}` or detailed property list
- Complex returns: `{Promise<{prop1: Type1, prop2: Type2}>}`
- Optional parameters: `{Type} [paramName=default]`
- Union types: `{Type1|Type2}`

### Example Code Standards

All JavaScript code examples in documentation must:

- Have valid syntax (pass Node.js syntax check)
- Include necessary imports if using package functionality
- Not use deprecated APIs
- Be executable or clearly marked as snippets

### Link Standards

All links in documentation must:

- Point to existing files for internal links
- Be valid URLs for external links
- Use relative paths for internal documentation

## Common Issues and Fixes

### Missing JSDoc

**Issue**: Function has no JSDoc comment

**Fix**: Add a JSDoc comment block above the function:

```javascript
/**
 * Description of what the function does
 * 
 * @param {Type} paramName - Description of parameter
 * @returns {ReturnType} Description of return value
 * @example
 * // Example usage
 * const result = functionName(param);
 */
function functionName(paramName) {
  // ...
}
```

### Incomplete JSDoc

**Issue**: JSDoc is missing required tags

**Fix**: Add the missing tags (@param, @returns, @example)

### Inaccurate JSDoc

**Issue**: JSDoc documents parameters that don't exist in the function signature

**Fix**: Update JSDoc to match the actual function signature, or update the function signature if JSDoc is correct

### Broken Links

**Issue**: Documentation contains links to non-existent files

**Fix**: Update the link to point to the correct file, or create the missing file

### Invalid Code Examples

**Issue**: Code example has syntax errors

**Fix**: Correct the syntax error, or mark the code as a snippet if it's intentionally incomplete

## Integration with CI/CD

To integrate documentation validation into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Validate Documentation
  run: node scripts/audit-documentation.mjs
```

The script will exit with code 1 if validation fails, causing the CI/CD pipeline to fail.

## Maintenance

The validation script should be updated when:

- New JSDoc requirements are added
- New documentation standards are established
- New types of validation checks are needed
- Deprecated APIs change

See `.kiro/specs/1-3-6-documentation-enhancement/STEERING.md` for documentation standards and maintenance procedures.
