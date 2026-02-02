---
inclusion: always
---

# AI Context Reference

## Purpose

This steering document ensures that all AI assistants working on this repository are aware of and follow the comprehensive guidelines in the AI_CONTEXT.md document located in the repository root.

## Critical Rule

**BEFORE making ANY changes to this repository, you MUST:**

1. Read and understand the `AI_CONTEXT.md` document in the repository root
2. Follow ALL guidelines, constraints, and patterns defined in that document
3. Reference specific sections when making decisions about code changes

## AI_CONTEXT.md Location

The AI context document is located at: `AI_CONTEXT.md` (repository root)

## What AI_CONTEXT.md Contains

The AI_CONTEXT.md document is the authoritative source for:

1. **Backwards Compatibility Requirements** (HIGHEST PRIORITY)
   - How to avoid breaking changes
   - Deprecation process
   - Semantic versioning rules

2. **Testing Requirements**
   - Unit tests, property-based tests, integration tests
   - Test organization and naming conventions
   - Test execution commands

3. **Documentation Standards**
   - JSDoc requirements for all public APIs
   - Documentation validation process
   - Links to detailed documentation standards

4. **Architecture and Code Organization**
   - Module structure (cache, endpoint, tools)
   - Separation of concerns
   - Class design principles
   - Where to add new functionality

5. **Code Quality Standards**
   - Code style (tabs, quotes, semicolons)
   - Naming conventions (PascalCase, camelCase, UPPER_SNAKE_CASE)
   - Error handling patterns
   - Performance considerations
   - Security considerations

6. **Testing Strategy**
   - Test organization and structure
   - Test framework (Mocha, Chai, fast-check)
   - Writing good tests

7. **Spec-Driven Development**
   - Spec structure and workflow
   - Property-based testing in specs

8. **Common Patterns and Anti-Patterns**
   - Good patterns to follow
   - Anti-patterns to avoid
   - Code examples

9. **Deployment and Versioning**
   - Release process
   - Changelog format
   - Breaking changes process

10. **AWS Integration**
    - AWS services used
    - AWS SDK v3 usage
    - IAM permissions

11. **Performance Optimization**
    - Lambda memory allocation
    - Cache strategy
    - Optimization techniques

12. **Troubleshooting**
    - Common issues and solutions
    - Debugging techniques

13. **Quick Reference Checklists**
    - Before making changes
    - Before committing
    - Key commands and files

## When to Reference AI_CONTEXT.md

You MUST reference AI_CONTEXT.md when:

- Starting any new task or feature
- Adding new functions, classes, or methods
- Modifying existing public APIs
- Writing or updating tests
- Writing or updating documentation
- Making architectural decisions
- Handling errors or edge cases
- Optimizing performance
- Troubleshooting issues
- Reviewing code changes
- Planning breaking changes

## Integration with Other Steering Documents

This repository has multiple steering documents that work together:

1. **ai-context-reference.md** (this document): Ensures AI_CONTEXT.md is always consulted
2. **spec-naming-convention.md**: Spec directory naming rules
3. **documentation-standards.md**: Detailed documentation standards

**Hierarchy:**
- AI_CONTEXT.md provides the comprehensive overview and critical constraints
- Individual steering documents provide detailed guidance on specific topics
- When conflicts exist, AI_CONTEXT.md takes precedence for critical constraints (backwards compatibility, testing, etc.)
- Steering documents provide additional detail and specific workflows

## Critical Reminders

### Backwards Compatibility (From AI_CONTEXT.md Section 2.1)

**NEVER break backwards compatibility without explicit user approval.**

Before changing ANY public API:
1. Check if it's exported in `src/index.js`
2. Search for usage in tests
3. Consider impact on existing applications
4. Discuss with user if breaking change is necessary

### Testing Requirements (From AI_CONTEXT.md Section 2.3)

**ALL changes must include appropriate tests. No exceptions.**

Required test types:
- Unit tests for all new functions/classes
- Property-based tests for core logic
- Integration tests for module interactions

### Documentation Requirements (From AI_CONTEXT.md Section 2.4)

**ALL public APIs must have complete JSDoc documentation.**

Required JSDoc tags:
- Description
- `@param` for each parameter
- `@returns` with type and description
- `@example` with working code example
- `@throws` for error conditions

### Separation of Concerns (From AI_CONTEXT.md Section 3.2)

**Maintain clear separation between modules:**
- Cache module: S3Cache, DynamoDbCache, CacheData, Cache
- Endpoint module: Endpoint class, get function
- Tools module: Utilities, AWS wrappers, logging

Do NOT mix concerns between modules.

## Workflow for AI Assistants

When working on this repository, follow this workflow:

1. **Read AI_CONTEXT.md** (if you haven't already in this session)
2. **Identify the relevant sections** for your current task
3. **Review steering documents** for additional detail if needed
4. **Check existing code** for patterns to follow
5. **Make changes** following all guidelines
6. **Write tests** for all changes
7. **Update documentation** for public API changes
8. **Validate** using the checklists in AI_CONTEXT.md Section 13
9. **Update CHANGELOG.md** with user-facing changes

## Package Context

This is the **@63klabs/cache-data NPM package** (version 1.3.6):
- Used in production environments handling over 1 million requests per week
- Provides distributed caching for AWS Lambda Node.js functions
- Backwards compatibility is CRITICAL - breaking changes require major version bumps

## Questions to Ask Yourself

Before making any change, ask:

1. **Backwards Compatibility**: Will this break existing code?
2. **Testing**: Have I written tests for this change?
3. **Documentation**: Have I documented this change?
4. **Separation of Concerns**: Is this in the right module/class?
5. **Performance**: Will this impact production performance?
6. **Security**: Does this handle sensitive data properly?

If you answer "yes" to #1 or "no" to #2-6, review AI_CONTEXT.md for guidance.

## Summary

**The AI_CONTEXT.md document is your primary reference for all development work on this repository.**

- Read it before starting any task
- Reference specific sections when making decisions
- Follow all guidelines, constraints, and patterns
- Use the quick reference checklists before committing
- When in doubt, consult AI_CONTEXT.md first

**Remember**: This is a production NPM package used by real applications. Quality, reliability, and backwards compatibility are non-negotiable.

---

**Action Required**: If you haven't already read AI_CONTEXT.md in this session, read it now before proceeding with any code changes.
