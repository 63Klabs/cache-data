# Documentation Standards - Common Principles

## Purpose

This document establishes common documentation standards that apply across all programming languages and documentation types. These principles ensure consistency, accuracy, and maintainability of documentation.

---

## Core Principles

1. **Accuracy First**: Documentation must accurately reflect the actual implementation. No hallucinations.
2. **Completeness**: All public APIs must be documented with sufficient detail for users to understand usage without reading source code.
3. **Clarity**: Documentation should be clear, concise, and accessible to the target audience.
4. **Maintainability**: Documentation must be kept in sync with code changes through defined processes.
5. **Testability**: Documentation claims should be verifiable through automated testing where possible.

---

## Documentation Update Process

### When to Update Documentation

Documentation MUST be updated in the following scenarios:

1. **New Public API**: When adding new exported functions, classes, or methods
2. **API Changes**: When modifying function signatures, parameters, or return types
3. **Behavior Changes**: When changing how a function works, even if signature stays the same
4. **Bug Fixes**: When fixing bugs that affect documented behavior
5. **Deprecations**: When deprecating features (add deprecation notice)
6. **New Features**: When adding new capabilities to existing functions

### Documentation Update Checklist

Before merging any code changes, verify:

- [ ] All new public functions have complete documentation
- [ ] Modified functions have updated documentation reflecting changes
- [ ] Parameter names in documentation match actual function signatures
- [ ] Return types in documentation match actual return values
- [ ] Examples use current API (no deprecated methods)
- [ ] User documentation updated if user-facing behavior changed
- [ ] Technical documentation updated if implementation details changed
- [ ] CHANGELOG.md updated with user-facing changes
- [ ] All documentation validation tests pass

### Code Review Requirements

Reviewers MUST verify:

1. **Documentation Completeness**: All required elements present
2. **Documentation Accuracy**: Documentation matches implementation
3. **No Hallucinations**: No documented features that don't exist in code
4. **Example Validity**: Code examples are executable and correct
5. **Link Validity**: All documentation links work
6. **Consistency**: Documentation style matches existing patterns

---

## User vs Technical Documentation

### User Documentation

**Purpose**: Help developers use the package/application effectively

**Location**: 
- `README.md`
- `docs/` directory
- User guides and tutorials

**Content Focus**:
- How to install and configure
- How to use features and APIs
- Common use cases and patterns
- Best practices for users
- Troubleshooting user issues
- Examples and tutorials

**Audience**: Developers using the package/application

**Tone**: Instructional, example-driven, focused on practical usage

### Technical Documentation

**Purpose**: Help maintainers understand and modify the code

**Location**:
- `docs/technical/` directory
- Inline code comments (not API documentation)
- Architecture decision records

**Content Focus**:
- Internal architecture and design decisions
- Implementation details and algorithms
- Performance considerations and optimizations
- Maintenance procedures
- Testing strategies
- Contribution guidelines

**Audience**: Package/application maintainers and contributors

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

## Quality Standards

### Accuracy Requirements

1. **No Hallucinations**: Every documented feature, parameter, and behavior MUST exist in the actual implementation
2. **Signature Matching**: Documentation parameter names MUST exactly match function signature parameter names
3. **Type Accuracy**: Documented types MUST match actual runtime types
4. **Example Validity**: All code examples MUST execute without errors
5. **Link Validity**: All documentation links MUST resolve to existing resources

### Completeness Requirements

1. **API Coverage**: All exported functions, classes, and methods MUST be documented
2. **Element Completeness**: All required documentation elements MUST be present
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
3. **Deprecation Notices**: Mark deprecated features appropriately
4. **Migration Guides**: Provide migration guides for breaking changes

---

## Example Writing Guidelines

Examples should:

1. **Be Executable**: Examples must run without modification (except for placeholder values like API keys)
2. **Show Real Usage**: Demonstrate realistic use cases, not contrived scenarios
3. **Include Context**: Show necessary imports, setup, and cleanup
4. **Be Concise**: Focus on the specific function being documented
5. **Handle Errors**: Show proper error handling where appropriate
6. **Use Comments**: Explain what the example demonstrates

**Good Example Characteristics**:
- Shows realistic use case
- Includes necessary context
- Demonstrates proper error handling
- Has explanatory comments

**Bad Example Characteristics**:
- Too vague or abstract
- Missing necessary context
- No error handling
- Unclear purpose

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

**Solution**: Review implementation for error conditions and document each one.

### Pitfall 5: Inconsistent Terminology

**Problem**: Using different terms for the same concept across documentation

**Solution**: Establish a glossary and use consistent terms throughout.

### Pitfall 6: Over-Technical User Docs

**Problem**: Including implementation details in user-facing documentation

**Solution**: Keep user docs focused on usage. Move technical details to technical documentation.

### Pitfall 7: Broken Links

**Problem**: Links to moved or deleted files

**Solution**: Run link validation regularly. Use relative paths for internal links.

### Pitfall 8: Incomplete Type/Parameter Information

**Problem**: Not specifying types, constraints, or structure of parameters

**Solution**: Document all parameter details including types, constraints, and structure.

---

## Summary

**Key Takeaways**:
- Accuracy is paramount - documentation must match implementation
- Completeness is required - all public APIs must be documented
- Validation is automated - tests catch documentation issues
- Maintenance is ongoing - documentation requires regular review
- Quality is measurable - validation tests provide objective metrics

When in doubt, refer to language-specific documentation standards for detailed guidance.
