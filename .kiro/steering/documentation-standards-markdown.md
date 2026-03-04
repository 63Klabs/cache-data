---
inclusion: fileMatch
fileMatchPattern: '**/*.md'
---

# Documentation Standards - Markdown

## Purpose

This document defines documentation standards for Markdown files including README files, user guides, technical documentation, and other markdown-based documentation.

---

## File Structure

### README.md Template

```markdown
# Project/Package Name

Brief description of the project/package purpose (1-2 sentences).

## Features

- Feature 1: Brief description
- Feature 2: Brief description
- Feature 3: Brief description

## Installation

```bash
npm install package-name
# or
pip install package-name
```

## Prerequisites

- Node.js 20.x or Python 3.11+
- AWS CLI configured
- Other dependencies

## Quick Start

```javascript
// Minimal working example
const example = require('package-name');
example.doSomething();
```

## Documentation

- [Quick Start Guide](docs/quick-start.md)
- [API Reference](docs/api-reference.md)
- [Examples](docs/examples.md)

## Related Resources

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE.txt)

## License

[License information]
```

### User Guide Template

```markdown
# Feature Name

## Overview

Brief description of what this feature does and why it's useful.

## Installation

If feature requires special setup:

```bash
npm install additional-package
```

## Usage

### Basic Usage

Simple example with explanation:

```javascript
const feature = require('package-name/feature');

// Do something basic
const result = feature.process(data);
console.log(result);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| option1 | string | 'default' | What this option does |
| option2 | number | 100 | What this option does |
| option3 | boolean | false | What this option does |

### Advanced Usage

More complex examples:

```javascript
const feature = require('package-name/feature');

// Advanced configuration
const result = feature.process(data, {
  option1: 'custom',
  option2: 200,
  option3: true
});
```

## Common Patterns

### Pattern 1: Pattern Name

Description of the pattern and when to use it:

```javascript
// Example implementation
const pattern = feature.createPattern({
  config: 'value'
});
```

### Pattern 2: Pattern Name

Description of another common pattern:

```javascript
// Example implementation
```

## Troubleshooting

### Issue 1: Problem Description

**Problem**: Detailed description of the issue

**Solution**: Step-by-step solution

```javascript
// Code example showing the fix
```

### Issue 2: Problem Description

**Problem**: Description

**Solution**: Solution steps

## Related Documentation

- [Related Feature 1](related-feature-1.md)
- [Related Feature 2](related-feature-2.md)
```

---

## Code Blocks in Markdown

### Language-Specific Code Blocks

Always specify the language for syntax highlighting:

````markdown
```javascript
// JavaScript code
const example = 'value';
```

```python
# Python code
example = 'value'
```

```bash
# Shell commands
npm install package-name
```

```yaml
# YAML configuration
key: value
nested:
  key: value
```
````

### Code Block Best Practices

1. **Always specify language**: Use language identifier after opening backticks
2. **Include comments**: Explain what the code does
3. **Show complete examples**: Include necessary imports and setup
4. **Use realistic data**: Don't use foo/bar, use meaningful names
5. **Follow language conventions**: Code in blocks must follow the language-specific documentation standards

**Example of good code block**:

````markdown
```javascript
// Import required modules
const { Cache } = require('@63klabs/cache-data');

// Initialize cache with configuration
const cache = new Cache({
  dynamoDbTable: 'my-cache-table',
  s3Bucket: 'my-cache-bucket',
  secureDataKey: Buffer.from(process.env.CACHE_KEY, 'hex')
});

// Store data in cache
await cache.set('user:123', {
  name: 'John Doe',
  email: 'john@example.com'
});

// Retrieve data from cache
const userData = await cache.get('user:123');
console.log(userData.name); // Output: John Doe
```
````

**Example of bad code block**:

````markdown
```javascript
// Bad: No context, unclear purpose
cache.set(key, value);
```
````

---

## Code Examples Must Follow Language Standards

When including code examples in Markdown, they MUST follow the appropriate language-specific documentation standards:

### JavaScript/TypeScript Examples

Must follow JSDoc standards (see documentation-standards-jsdoc.md):

````markdown
```javascript
/**
 * Calculate total price including tax.
 * 
 * @param {number} price - Base price before tax
 * @param {number} taxRate - Tax rate as decimal
 * @returns {number} Total price including tax
 */
function calculateTotal(price, taxRate) {
  return price * (1 + taxRate);
}

// Usage example
const total = calculateTotal(100, 0.08);
console.log(total); // 108
```
````

### Python Examples

Must follow Python docstring standards (see documentation-standards-python.md):

````markdown
```python
def calculate_total(price: float, tax_rate: float) -> float:
    """Calculate total price including tax.
    
    Args:
        price: Base price before tax.
        tax_rate: Tax rate as decimal (e.g., 0.08 for 8%).
    
    Returns:
        Total price including tax.
    
    Example:
        >>> total = calculate_total(100.0, 0.08)
        >>> print(total)
        108.0
    """
    return price * (1 + tax_rate)

# Usage example
total = calculate_total(100.0, 0.08)
print(total)  # 108.0
```
````

### Shell Script Examples

Must follow shell script conventions:

````markdown
```bash
#!/bin/bash
# Deploy application to production

# Set variables
ENVIRONMENT="prod"
REGION="us-east-1"

# Deploy using AWS SAM
sam deploy \
  --template-file template.yaml \
  --stack-name my-app-${ENVIRONMENT} \
  --region ${REGION} \
  --capabilities CAPABILITY_IAM
```
````

### CloudFormation Examples

Must follow CloudFormation naming conventions:

````markdown
```yaml
Resources:
  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${Prefix}-${ProjectId}-${StageId}-GetUser
      Handler: index.handler
      Runtime: nodejs20.x
      Environment:
        Variables:
          TABLE_NAME: !Ref UserTable
          LOG_LEVEL: info
```
````

---

## Formatting Guidelines

### Headers

Use ATX-style headers (# syntax):

```markdown
# H1 - Document Title
## H2 - Major Section
### H3 - Subsection
#### H4 - Sub-subsection
```

**Rules**:
- Only one H1 per document (the title)
- Don't skip header levels (H1 → H3)
- Use sentence case for headers
- No punctuation at end of headers

### Lists

#### Unordered Lists

```markdown
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3
```

#### Ordered Lists

```markdown
1. First step
2. Second step
   1. Sub-step 2.1
   2. Sub-step 2.2
3. Third step
```

### Tables

Use pipe tables with alignment:

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Left     | Center   | Right    |
| Data 1   | Data 2   | Data 3   |
```

With alignment:

```markdown
| Left Aligned | Center Aligned | Right Aligned |
|:-------------|:--------------:|--------------:|
| Left         | Center         | Right         |
```

### Links

#### Internal Links

Use relative paths:

```markdown
[Link to another doc](../docs/other-doc.md)
[Link to section](#section-name)
```

#### External Links

```markdown
[GitHub](https://github.com)
[AWS Documentation](https://docs.aws.amazon.com)
```

### Emphasis

```markdown
*italic* or _italic_
**bold** or __bold__
***bold italic*** or ___bold italic___
`inline code`
```

### Blockquotes

```markdown
> This is a blockquote.
> It can span multiple lines.

> **Note**: Important information here.

> **Warning**: Critical warning here.
```

---

## Special Sections

### Admonitions

Use blockquotes with bold labels:

```markdown
> **Note**: Additional information that's helpful but not critical.

> **Important**: Information that users should pay attention to.

> **Warning**: Critical information about potential issues.

> **Tip**: Helpful suggestions or best practices.

> **Example**: Demonstration of a concept.
```

### Command-Line Examples

Show commands with their output:

```markdown
```bash
$ npm install package-name
added 1 package in 2s

$ npm test
> package-name@1.0.0 test
> jest

PASS  test/example.test.js
✓ should work correctly (5ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```
```

### API Reference Tables

Document API parameters clearly:

```markdown
### `functionName(param1, param2, options)`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| param1 | string | Yes | - | Description of param1 |
| param2 | number | Yes | - | Description of param2 |
| options | Object | No | {} | Configuration options |
| options.key1 | string | No | 'default' | Description of key1 |
| options.key2 | boolean | No | false | Description of key2 |

**Returns:** `Promise<Object>` - Description of return value

**Throws:**
- `Error` - When param1 is invalid
- `TypeError` - When param2 is not a number

**Example:**

```javascript
const result = await functionName('test', 42, {
  key1: 'custom',
  key2: true
});
```
```

---

## Documentation Organization

### Directory Structure

```
docs/
├── README.md                 # Documentation index
├── quick-start.md           # Getting started guide
├── installation.md          # Installation instructions
├── configuration.md         # Configuration guide
├── api-reference/           # API documentation
│   ├── README.md
│   ├── cache.md
│   └── utils.md
├── guides/                  # User guides
│   ├── basic-usage.md
│   └── advanced-usage.md
├── examples/                # Example code
│   ├── basic-example.md
│   └── advanced-example.md
└── technical/               # Technical documentation
    ├── architecture.md
    └── contributing.md
```

### Cross-References

Link related documentation:

```markdown
## Related Documentation

- [Installation Guide](installation.md) - How to install the package
- [Configuration Guide](configuration.md) - Configuration options
- [API Reference](api-reference/README.md) - Complete API documentation
- [Examples](examples/basic-example.md) - Code examples
```

---

## Validation Checklist

Before committing Markdown documentation:

- [ ] All code blocks specify language
- [ ] Code examples follow language-specific standards
- [ ] All links are valid (internal and external)
- [ ] Headers follow proper hierarchy (no skipped levels)
- [ ] Tables are properly formatted
- [ ] Examples are executable and realistic
- [ ] No sensitive information (API keys, credentials)
- [ ] Proper grammar and spelling
- [ ] Consistent terminology throughout
- [ ] Related documentation is cross-referenced

---

## Summary

**Markdown Documentation Quick Reference:**

- Use ATX-style headers (# syntax)
- Always specify language in code blocks
- Code examples must follow language-specific documentation standards
- Use relative paths for internal links
- Include admonitions for important information (Note, Warning, Tip)
- Organize documentation in logical directory structure
- Cross-reference related documentation
- Validate all links before committing
- Keep examples realistic and executable
- Follow consistent formatting throughout
