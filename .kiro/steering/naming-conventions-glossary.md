# Naming Conventions Glossary

## Purpose

This glossary defines the naming style conventions used across all programming languages and contexts in this organization. Reference this document when you need to understand what a naming convention means.

---

## Naming Styles

### camelCase
- **Format**: First word lowercase, subsequent words capitalized
- **Examples**: `userName`, `fetchUserData`, `isValidEmail`
- **Common Usage**: JavaScript/TypeScript variables, functions, methods, parameters

### PascalCase
- **Format**: All words capitalized, no separators
- **Examples**: `UserName`, `FetchUserData`, `IsValidEmail`
- **Common Usage**: Classes (all languages), CloudFormation parameters, CloudFormation resource references

### snake_case
- **Format**: All lowercase, words separated by underscores
- **Examples**: `user_name`, `fetch_user_data`, `is_valid_email`
- **Common Usage**: Python variables, functions, parameters, file names

### kebab-case
- **Format**: All lowercase, words separated by hyphens
- **Examples**: `user-name`, `fetch-user-data`, `is-valid-email`
- **Common Usage**: URLs, file names, CSS classes, HTML attributes, Git branch names

### UPPER_SNAKE_CASE
- **Format**: All uppercase, words separated by underscores
- **Examples**: `USER_NAME`, `MAX_RETRY_COUNT`, `API_ENDPOINT`
- **Common Usage**: Constants (all languages), environment variables (all platforms)

### SCREAMING-KEBAB-CASE
- **Format**: All uppercase, words separated by hyphens
- **Examples**: `USER-NAME`, `MAX-RETRY-COUNT`
- **Common Usage**: Rarely used; avoid unless required by specific framework

---

## Quick Reference Tables

### Variables by Language

| Language | Variables | Constants (Global) | Constants (Local) |
|----------|-----------|-------------------|-------------------|
| JavaScript/Node | camelCase | UPPER_SNAKE_CASE | Developer's choice |
| Python | snake_case | UPPER_SNAKE_CASE | Developer's choice |
| Shell | snake_case | UPPER_SNAKE_CASE | Developer's choice |

### Functions by Language

| Language | Functions | Private Functions |
|----------|-----------|-------------------|
| JavaScript/Node | camelCase | _camelCase (optional) |
| Python | snake_case | _snake_case |
| Shell | snake_case | _snake_case |

### Classes by Language

| Language | Classes | Private Members |
|----------|---------|-----------------|
| JavaScript/Node | PascalCase | #fieldName |
| Python | PascalCase | _field_name |

### CloudFormation Elements

| Element | Convention | Example |
|---------|-----------|---------|
| Parameters | PascalCase | EnvironmentName |
| Resources (Logical ID) | PascalCase | UserTable |
| Resources (Actual Name) | kebab-case | users-table |
| Conditions | PascalCase | IsProduction |
| Mappings | PascalCase | EnvironmentConfig |
| Outputs | PascalCase | UserTableName |

### Environment Variables

| Context | Convention | Example |
|---------|-----------|---------|
| All Platforms | UPPER_SNAKE_CASE | AWS_REGION |
| Lambda | UPPER_SNAKE_CASE | TABLE_NAME |
| CodeBuild | UPPER_SNAKE_CASE | BUILD_ENV |
| Docker | UPPER_SNAKE_CASE | APP_PORT |

### AWS Tags

| Type | Convention | Example |
|------|-----------|---------|
| Standard Tags | PascalCase | Environment, Project |
| Service Tags | serviceName:TagName | cacheInvalidator:AllowAccess |
| GitHub Properties | serviceName_TagName | cache_invalidator_AllowAccess |

---

## When in Doubt

- Check existing code in the same module
- Follow the language's standard convention
- Prioritize clarity and consistency
- Ask for guidance from project maintainers
