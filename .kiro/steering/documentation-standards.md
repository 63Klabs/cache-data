# Documentation Steering Guide

## Purpose

This document establishes standards, processes, and guidelines for maintaining high-quality documentation in the @63klabs/cache-data package. It serves as the authoritative reference for all documentation-related decisions and ensures consistency across JSDoc comments, user guides, and technical documentation.

## Core Principles

1. **Accuracy First**: Documentation must accurately reflect the actual implementation. No hallucinations.
2. **Completeness**: All public APIs must be documented with sufficient detail for users to understand usage without reading source code.
3. **Clarity**: Documentation should be clear, concise, and accessible to the target audience.
4. **Maintainability**: Documentation must be kept in sync with code changes through defined processes.
5. **Testability**: Documentation claims should be verifiable through automated testing where possible.

---

## JSDoc Standards

### Required Tags

All public functions, methods, and classes MUST include the following JSDoc tags:

#### For Functions and Methods

- **Description**: A clear explanation of what the function does and when to use it (no tag, just text)
- **@param**: One tag per parameter with type, name, and description
- **@returns**: Return value type and description (omit only for void functions)
- **@example**: At least one code example demonstrating typical usage
- **@throws**: Document each error type that can be thrown (if applicable)

#### For Classes

- **Description**: Explanation of the class purpose and responsibilities
- **@param**: Constructor parameters (in the constructor JSDoc)
- **@example**: Usage example showing instantiation and common methods
- **@property**: Document public properties (if applicable)

### Type Annotation Format

Use precise type annotations following these standards:

#### Primitive Types
```javascript
/**
 * @param {string} name - User name
 * @param {number} age - User age
 * @param {boolean} active - Whether user is active
 */
```

#### Complex Types

**Promises**:
```javascript
/**
 * @returns {Promise<Object>} Resolves with user data
 * @returns {Promise<{id: string, name: string, email: string}>} Detailed structure
 */
```

**Arrays**:
```javascript
/**
 * @returns {Array.<string>} Array of user names
 * @returns {Array.<{id: string, name: string}>} Array of user objects
 */
```

**Objects with Known Structure**:
```javascript
/**
 * @returns {{success: boolean, data: Array.<Object>, error: string|null}} Response object
 */
```

**Object Maps**:
```javascript
/**
 * @param {Object.<string, number>} scores - Map of names to scores
 */
```

#### Optional Parameters
```javascript
/**
 * @param {string} [optionalParam] - Optional parameter
 * @param {number} [count=10] - Optional with default value
 */
```

#### Union Types
```javascript
/**
 * @param {string|number} id - User ID as string or number
 * @returns {Object|null} User object or null if not found
 */
```

#### Callback Functions
```javascript
/**
 * @param {function(Error|null, Object): void} callback - Callback function
 */
```

### JSDoc Templates

#### Function Template
```javascript
/**
 * [Clear, concise description of what the function does and when to use it]
 * 
 * @param {Type} paramName - Description of what this parameter represents
 * @param {Type} [optionalParam=defaultValue] - Description of optional parameter
 * @returns {ReturnType} Description of what is returned
 * @throws {ErrorType} Description of when this error occurs
 * @example
 * // Example showing typical usage
 * const result = functionName(param1, param2);
 * console.log(result);
 * 
 * @example
 * // Example showing edge case or alternative usage
 * const result = functionName(param1);
 */
```

#### Class Template
```javascript
/**
 * [Clear description of the class purpose and responsibilities]
 * 
 * @example
 * // Create instance and use common methods
 * const instance = new ClassName(param1, param2);
 * const result = instance.method();
 */
class ClassName {
  /**
   * Creates a new instance of ClassName
   * 
   * @param {Type} param1 - Description of first parameter
   * @param {Type} param2 - Description of second parameter
   * @throws {ErrorType} Description of construction errors
   */
  constructor(param1, param2) {
    // Implementation
  }

  /**
   * [Method description]
   * 
   * @param {Type} param - Parameter description
   * @returns {ReturnType} Return value description
   * @example
   * const result = instance.methodName(param);
   */
  methodName(param) {
    // Implementation
  }
}
```

#### Async Function Template
```javascript
/**
 * [Description of async operation]
 * 
 * @async
 * @param {Type} param - Parameter description
 * @returns {Promise<{success: boolean, data: Object, error: string|null}>} Promise resolving to result object
 * @throws {ErrorType} Description of when this error occurs
 * @example
 * // Using async/await
 * const result = await asyncFunction(param);
 * if (result.success) {
 *   console.log(result.data);
 * }
 * 
 * @example
 * // Using promises
 * asyncFunction(param)
 *   .then(result => console.log(result.data))
 *   .catch(error => console.error(error));
 */
```

### Example Writing Guidelines

Examples should:

1. **Be Executable**: Examples must run without modification (except for placeholder values like API keys)
2. **Show Real Usage**: Demonstrate realistic use cases, not contrived scenarios
3. **Include Context**: Show necessary imports, setup, and cleanup
4. **Be Concise**: Focus on the specific function being documented
5. **Handle Errors**: Show proper error handling where appropriate
6. **Use Comments**: Explain what the example demonstrates

**Good Example**:
```javascript
/**
 * @example
 * // Cache user data in S3
 * const cache = new S3Cache({ bucket: 'my-cache-bucket' });
 * await cache.set('user:123', { name: 'John', email: 'john@example.com' });
 * const userData = await cache.get('user:123');
 */
```

**Bad Example** (too vague):
```javascript
/**
 * @example
 * cache.set(key, value);
 */
```

---

## Documentation Update Process

### When to Update Documentation

Documentation MUST be updated in the following scenarios:

1. **New Public API**: When adding new exported functions, classes, or methods
2. **API Changes**: When modifying function signatures, parameters, or return types
3. **Behavior Changes**: When changing how a function works, even if signature stays the same
4. **Bug Fixes**: When fixing bugs that affect documented behavior
5. **Deprecations**: When deprecating features (add @deprecated tag)
6. **New Features**: When adding new capabilities to existing functions

### Documentation Update Checklist

Before merging any code changes, verify:

- [ ] All new public functions have complete JSDoc
- [ ] Modified functions have updated JSDoc reflecting changes
- [ ] Parameter names in JSDoc match actual function signatures
- [ ] Return types in JSDoc match actual return values
- [ ] Examples use current API (no deprecated methods)
- [ ] User documentation updated if user-facing behavior changed
- [ ] Technical documentation updated if implementation details changed
- [ ] CHANGELOG.md updated with user-facing changes
- [ ] All documentation validation tests pass

### Code Review Requirements

Reviewers MUST verify:

1. **JSDoc Completeness**: All required tags present
2. **JSDoc Accuracy**: Documentation matches implementation
3. **No Hallucinations**: No documented features that don't exist in code
4. **Example Validity**: Code examples are executable and correct
5. **Link Validity**: All documentation links work
6. **Consistency**: Documentation style matches existing patterns

### Validation Process

Run the following validation steps before merging:

```bash
# Run documentation validation script
npm run validate:docs

# Run all documentation tests
npm test -- test/documentation/

# Check for broken links
npm run check:links
```

All validation checks must pass before merging.

---

## User vs Technical Documentation

### User Documentation

**Purpose**: Help developers use the package effectively

**Location**: 
- `README.md`
- `docs/00-quick-start-implementation/`
- `docs/01-advanced-implementation-for-web-service/`
- `docs/00-example-implementation/`
- `docs/features/`
- `docs/lambda-optimization/`

**Content Focus**:
- How to install and configure
- How to use features and APIs
- Common use cases and patterns
- Best practices for users
- Troubleshooting user issues
- Examples and tutorials

**Audience**: Developers using the package in their applications

**Tone**: Instructional, example-driven, focused on practical usage

### Technical Documentation

**Purpose**: Help maintainers understand and modify the package

**Location**:
- `docs/technical/`
- Inline code comments (not JSDoc)
- Architecture decision records (if created)

**Content Focus**:
- Internal architecture and design decisions
- Implementation details and algorithms
- Performance considerations and optimizations
- Maintenance procedures
- Testing strategies
- Contribution guidelines

**Audience**: Package maintainers and contributors

**Tone**: Technical, detailed, focused on implementation

### Separation Guidelines

**User documentation should NOT include**:
- Internal implementation details
- Private function documentation
- Performance optimization internals
- Code architecture explanations

**Technical documentation should NOT include**:
- Basic usage instructions
- Getting started guides
- User-facing examples
- Feature marketing

**When in doubt**: If a user needs to know it to use the package, it's user documentation. If only maintainers need to know it, it's technical documentation.

---

## Documentation File Structure

### README.md Template

```markdown
# Package Name

[Brief description of package purpose]

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

```bash
npm install package-name
```

## Prerequisites

- Node.js version
- AWS services required
- Other dependencies

## Quick Start

[Minimal working example]

## Documentation

- [Quick Start Guide](../../docs/00-quick-start-implementation/README.md)
- [Advanced Implementation](../../docs/01-advanced-implementation-for-web-service/README.md)
- [Features Documentation](../../docs/features/README.md)
- [Examples](../../docs/00-example-implementation/README.md)

## Related Resources

- [Changelog](../../CHANGELOG.md)
- [Security Policy](../../SECURITY.md)
- [Issues](https://github.com/63Klabs/cache-data/issues)

## License

[License information]
```

### Feature Documentation Template

```markdown
# Feature Name

## Overview

[What this feature does and why it's useful]

## Installation

[If feature requires special setup]

## Usage

### Basic Usage

[Simple example with explanation]

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| option1 | string | 'default' | What this option does |
| option2 | number | 100 | What this option does |

### Advanced Usage

[More complex examples]

## API Reference

See JSDoc documentation for detailed API information:
- [Cache Module](../../src/lib/dao-cache.js) - Link to source with JSDoc

## Common Patterns

### Pattern 1: [Pattern Name]

[Example and explanation]

### Pattern 2: [Pattern Name]

[Example and explanation]

## Troubleshooting

### Issue 1

**Problem**: [Description]
**Solution**: [How to fix]

## Related Documentation

- [Related Feature 1](../../docs/features/README.md)
- [Related Feature 2](../../docs/features/README.md)
```

---

## Quality Standards

### Accuracy Requirements

1. **No Hallucinations**: Every documented feature, parameter, and behavior MUST exist in the actual implementation
2. **Signature Matching**: JSDoc parameter names MUST exactly match function signature parameter names
3. **Type Accuracy**: Documented types MUST match actual runtime types
4. **Example Validity**: All code examples MUST execute without errors
5. **Link Validity**: All documentation links MUST resolve to existing resources

### Completeness Requirements

1. **API Coverage**: All exported functions, classes, and methods MUST have JSDoc
2. **Tag Completeness**: All required JSDoc tags MUST be present
3. **Feature Coverage**: All major features MUST be documented in user guides
4. **Example Coverage**: All public APIs MUST have at least one usage example

### Clarity Requirements

1. **Concise Descriptions**: Avoid unnecessary verbosity
2. **Clear Language**: Use simple, direct language appropriate for developers
3. **Consistent Terminology**: Use the same terms throughout documentation
4. **Proper Grammar**: Documentation should be grammatically correct
5. **Logical Organization**: Information should be organized logically

### Maintainability Requirements

1. **Version Sync**: Documentation version should match code version
2. **Change Tracking**: Document changes in CHANGELOG.md
3. **Deprecation Notices**: Mark deprecated features with @deprecated tag
4. **Migration Guides**: Provide migration guides for breaking changes

---

## Validation and Testing

### Automated Validation

The package includes automated validation for:

1. **JSDoc Completeness**: Checks all exports have required JSDoc tags
2. **JSDoc Accuracy**: Verifies parameter names match function signatures
3. **Type Format Compliance**: Ensures proper type notation for Promises, Arrays, Objects
4. **Throws Documentation**: Verifies error conditions are documented
5. **Link Validity**: Checks all documentation links resolve
6. **Example Validity**: Tests that code examples execute correctly
7. **Module Coverage**: Ensures all modules have feature documentation
8. **Configuration Coverage**: Verifies all config options are documented

### Running Validation

```bash
# Run all documentation tests
npm test -- test/documentation/

# Run specific validation
npm test -- test/documentation/property/jsdoc-completeness-tests.mjs

# Run documentation audit
node scripts/audit-documentation.mjs
```

### Property-Based Testing

Documentation correctness is validated using property-based tests that verify universal properties across all documentation:

- Property 1: JSDoc Completeness for All Exports
- Property 2: JSDoc Parameter Accuracy
- Property 3: JSDoc Return Type Format Compliance
- Property 4: JSDoc Throws Documentation Completeness
- Property 5: No Hallucinated Documentation
- Property 6: Module Documentation Completeness
- Property 7: README Feature Coverage
- Property 8: Documentation Link Validity
- Property 9-15: Example and configuration validation

All property tests must pass before merging changes.

### Manual Review Checklist

In addition to automated validation, manually verify:

- [ ] Documentation reads naturally and is easy to understand
- [ ] Examples demonstrate realistic use cases
- [ ] Technical accuracy of explanations
- [ ] Consistency with existing documentation style
- [ ] Appropriate level of detail for target audience
- [ ] No sensitive information (API keys, credentials) in examples

---

## Maintenance Procedures

### Quarterly Documentation Review

Every quarter, conduct a comprehensive documentation review:

1. **Audit Coverage**: Run documentation audit script and address gaps
2. **Update Examples**: Verify all examples use current best practices
3. **Check Links**: Validate all internal and external links
4. **Review Accuracy**: Compare documentation to current implementation
5. **User Feedback**: Review documentation-related issues and questions
6. **Update Guides**: Refresh user guides with new patterns and practices

### Handling Documentation Issues

When users report documentation issues:

1. **Triage**: Determine if issue is inaccuracy, incompleteness, or clarity
2. **Verify**: Confirm the issue by checking against implementation
3. **Prioritize**: Critical (wrong information) > High (missing information) > Medium (unclear) > Low (enhancement)
4. **Fix**: Update documentation following this steering guide
5. **Validate**: Run validation tests to ensure fix is correct
6. **Communicate**: Update issue with resolution and documentation location

### Breaking Changes

When making breaking changes:

1. **Document Deprecation**: Add @deprecated tag to old API with migration instructions
2. **Create Migration Guide**: Document how to migrate from old to new API
3. **Update Examples**: Ensure all examples use new API
4. **Update CHANGELOG**: Clearly mark breaking changes
5. **Version Bump**: Follow semantic versioning (major version bump)

### Adding New Features

When adding new features:

1. **Write JSDoc First**: Document the API before or during implementation
2. **Create Examples**: Write usage examples as you develop
3. **Update Feature Docs**: Add feature to appropriate documentation section
4. **Update README**: Add feature to features list if major
5. **Add Tests**: Include documentation validation tests
6. **Update CHANGELOG**: Document new feature

---

## Tools and Scripts

### Documentation Audit Script

Location: `scripts/audit-documentation.mjs`

Purpose: Scans all source files and generates a report of documentation coverage and issues.

Usage:
```bash
node scripts/audit-documentation.mjs
```

Output: JSON report with documentation statistics and issues

### Documentation Review Script

Location: `scripts/review-documentation-files.mjs`

Purpose: Analyzes documentation files for broken links, outdated content, and completeness.

Usage:
```bash
node scripts/review-documentation-files.mjs
```

Output: JSON report with documentation file analysis

### Validation Tests

Location: `test/documentation/property/`

Purpose: Property-based tests that verify documentation correctness properties.

Usage:
```bash
npm test -- test/documentation/
```

---

## Common Pitfalls and Solutions

### Pitfall 1: Hallucinated Parameters

**Problem**: Documenting parameters that don't exist in the function signature

**Solution**: Always verify parameter names match exactly. Use validation tests to catch mismatches.

### Pitfall 2: Outdated Examples

**Problem**: Examples using deprecated APIs or old patterns

**Solution**: Include example validation in CI/CD. Update examples when APIs change.

### Pitfall 3: Vague Descriptions

**Problem**: Generic descriptions like "Does something with data"

**Solution**: Be specific about what the function does, what inputs it expects, and what outputs it produces.

### Pitfall 4: Missing Error Documentation

**Problem**: Not documenting when and why functions throw errors

**Solution**: Review implementation for throw statements and document each error condition.

### Pitfall 5: Inconsistent Terminology

**Problem**: Using different terms for the same concept across documentation

**Solution**: Establish a glossary and use consistent terms throughout.

### Pitfall 6: Over-Technical User Docs

**Problem**: Including implementation details in user-facing documentation

**Solution**: Keep user docs focused on usage. Move technical details to technical documentation.

### Pitfall 7: Broken Links

**Problem**: Links to moved or deleted files

**Solution**: Run link validation regularly. Use relative paths for internal links.

### Pitfall 8: Incomplete Type Annotations

**Problem**: Using generic Object or Array without specifying structure

**Solution**: Document object properties and array element types for better IDE support.

---

## Conclusion

This steering guide establishes the foundation for maintaining high-quality documentation in the @63klabs/cache-data package. By following these standards and processes, we ensure that documentation remains accurate, complete, and valuable to both users and maintainers.

**Key Takeaways**:
- Accuracy is paramount - documentation must match implementation
- Completeness is required - all public APIs must be documented
- Validation is automated - tests catch documentation issues
- Maintenance is ongoing - documentation requires regular review
- Quality is measurable - validation tests provide objective metrics

When in doubt, refer to this guide. When the guide is unclear, propose improvements through the standard contribution process.
