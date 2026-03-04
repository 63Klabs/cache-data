# Naming Conventions - Common Principles

## Core Principles

1. **Consistency**: Follow the established conventions for each language and context
2. **Clarity**: Names should clearly communicate purpose and intent
3. **Existing Code First**: When working in existing codebases, follow the majority convention already in use
4. **Don't Refactor Names**: Apply these conventions to new code only; do not rename existing variables unless explicitly required
5. **Context Matters**: Choose the appropriate convention based on the language, framework, and scope

---

## Scope-Specific Rules

### Global Constants

**ALWAYS use UPPER_SNAKE_CASE for global constants across all languages.**

```javascript
// JavaScript/Node.js
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_TIMEOUT = 30000;
```

```python
# Python
MAX_RETRY_COUNT = 3
API_BASE_URL = "https://api.example.com"
DEFAULT_TIMEOUT = 30
```

```bash
# Shell
MAX_RETRY_COUNT=3
API_BASE_URL="https://api.example.com"
DEFAULT_TIMEOUT=30
```

### Local Constants (Function/Loop Scope)

**Developer's choice: Use best judgment based on context.**

```javascript
// JavaScript - both are acceptable
function processData() {
    const maxItems = 100;        // OK - feels like a variable
    const MAX_ITEMS = 100;       // OK - emphasizes it's constant
    
    // Use UPPER_SNAKE_CASE when:
    // - Value is truly constant and won't change
    // - Value is used in multiple places
    // - Value has special significance
    
    // Use camelCase when:
    // - Value is derived from parameters
    // - Value is only used once
    // - Value is more like a variable than a constant
}
```

```python
# Python - both are acceptable
def process_data():
    max_items = 100        # OK
    MAX_ITEMS = 100        # OK
    
    # Same guidelines as JavaScript
```

---

## Working with Existing Code

### Majority Rules Principle

**When working in an existing codebase, follow the convention that is most prevalent.**

#### Assessment Process

1. **Survey the codebase**: Look at multiple files in the same module/package
2. **Count occurrences**: Which convention is used most often?
3. **Follow the majority**: Use the same convention for new code
4. **Don't refactor**: Do not rename existing variables to match your preference

#### Example Scenarios

**Scenario 1: JavaScript file uses camelCase for file names**
```
existing-files/
  userService.js      (camelCase)
  apiRequest.js       (camelCase)
  cacheManager.js     (camelCase)
  data-processor.js   (kebab-case) - outlier

New file: orderService.js  (follow majority: camelCase)
```

**Scenario 2: Python module uses UPPER_SNAKE_CASE for local constants**
```python
# Existing code pattern
def process_order():
    MAX_ITEMS = 100
    MIN_PRICE = 10
    DEFAULT_QUANTITY = 1

# New function: follow the pattern
def process_shipment():
    MAX_WEIGHT = 50  # Follow existing pattern
```

**Scenario 3: Mixed conventions in legacy code**
```javascript
// Legacy code has mixed conventions
const userName = "John";      // camelCase
const user_email = "...";     // snake_case
const UserPhone = "...";      // PascalCase

// Strategy: Follow the most recent convention or the convention
// used in the same file/module. If unclear, use the standard
// convention for the language (camelCase for JavaScript).

// New code in same file
const userAddress = "...";    // Use camelCase (language standard)
```

### When to Refactor Names

**Only refactor names when:**
- Explicitly requested by project maintainer
- Part of a larger refactoring effort
- Name is misleading or incorrect
- Consolidating duplicate functionality
- Migrating to new architecture

**Never refactor names:**
- Just to match your preference
- As part of unrelated changes
- Without updating all references
- Without updating documentation and tests

---

## Special Cases and Exceptions

### Acronyms and Abbreviations

**CRITICAL: Treat acronyms as regular words in camelCase and PascalCase.**

This is the industry standard and AWS convention. It ensures compatibility with frameworks that convert PascalCase to kebab-case (e.g., `ApiClassification` → `api-classification`).

```javascript
// ✅ CORRECT - Treat acronyms as words
const apiUrl = "...";
const httpRequest = "...";
const xmlParser = "...";
const userId = "...";
const s3BucketArn = "...";
const dynamoDbTable = "...";

// Classes: First letter capitalized, rest lowercase
class ApiClient { }
class HttpRequest { }
class XmlParser { }
class ApiGateway { }
class S3Bucket { }
class DynamoDbTable { }

// ❌ AVOID - All-caps acronyms break framework conversions
const APIUrl = "...";        // Converts to "apiurl" in kebab-case
const HTTPRequest = "...";   // Converts to "httprequest" in kebab-case
const XMLParser = "...";     // Converts to "xmlparser" in kebab-case

class APIGateway { }   // Converts to "apigateway" - loses word boundary
class S3BUCKET { }     // Converts to "s3bucket" - loses word boundary
```

**Why this matters:**

Many frameworks automatically convert PascalCase to kebab-case for CSS classes, HTML attributes, or URLs:

```javascript
// With proper acronym handling
ApiClassification → api-classification  ✅ Correct
S3BucketArn → s3-bucket-arn            ✅ Correct
HttpRequest → http-request             ✅ Correct

// With all-caps acronyms
APIClassification → apiclassification  ❌ Lost word boundary
S3BUCKETARN → s3bucketarn             ❌ Lost word boundaries
HTTPRequest → httprequest             ❌ Lost word boundary
```

**Common Acronyms - Correct Usage:**

```javascript
// API
const apiKey = "...";
const apiEndpoint = "...";
class ApiGateway { }

// HTTP/HTTPS
const httpClient = "...";
const httpsUrl = "...";
class HttpRequest { }

// AWS Services
const s3Bucket = "...";
const dynamoDbTable = "...";
const ec2Instance = "...";
const rdsDatabase = "...";
class S3Client { }
class DynamoDbClient { }

// XML/JSON/HTML
const xmlParser = "...";
const jsonData = "...";
const htmlContent = "...";

// URL/URI
const apiUrl = "...";
const baseUri = "...";

// ID
const userId = "...";
const orderId = "...";
```

**Special Cases:**

For well-established AWS service names that are commonly written with specific capitalization, follow AWS conventions:

```javascript
// AWS service names - follow AWS convention
class DynamoDb { }     // Not DynamoDB (AWS uses DynamoDB in docs but DynamoDb in code)
class ApiGateway { }   // AWS convention
class CloudFront { }   // Two words, both capitalized

// But in variables, still treat as words
const dynamoDbClient = new DynamoDb();
const apiGatewayId = "...";
const cloudFrontDistribution = "...";
```

### Boolean Variables

**Prefix with is, has, can, should, or similar:**

```javascript
// Good
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRetry = false;
const wasSuccessful = true;

// Avoid
const active = true;      // Ambiguous
const permission = false; // Ambiguous
const edit = true;        // Ambiguous
```

### Event Handlers

**Use handle or on prefix:**

```javascript
// Good
function handleClick() { }
function onSubmit() { }
function handleUserLogin() { }

// React components
const onClick = () => { };
const onSubmit = () => { };
```

### Test Files and Functions

**Test files: Match source file with .test or .spec suffix**
```
user-service.js → user-service.test.js
user-service.js → user-service.spec.js
user_service.py → test_user_service.py
```

**Test functions: Descriptive names**
```javascript
// JavaScript/Jest
describe('UserService', () => {
    it('should return user data when user exists', () => { });
    it('should throw error when user not found', () => { });
});
```

```python
# Python/pytest
def test_get_user_returns_data_when_user_exists():
    pass

def test_get_user_raises_error_when_user_not_found():
    pass
```

---

## Validation Checklist

Before committing code, verify:

- [ ] Variable names follow language-specific conventions
- [ ] Function names follow language-specific conventions
- [ ] Class names use PascalCase
- [ ] Global constants use UPPER_SNAKE_CASE
- [ ] Environment variables use UPPER_SNAKE_CASE
- [ ] Existing code conventions are respected (majority rules)
- [ ] No unnecessary renaming of existing variables
- [ ] Acronyms are treated as words (not all-caps)
- [ ] Boolean variables have appropriate prefixes
- [ ] Test files follow naming conventions

---

## Summary

**Key Takeaways:**

1. **Follow language standards**: Each language has its preferred convention
2. **Constants are UPPER_SNAKE_CASE**: Global constants across all languages
3. **Classes are PascalCase**: Across all languages
4. **Respect existing code**: Follow majority convention, don't refactor names
5. **Local constants are flexible**: Use best judgment based on context
6. **Acronyms as words**: Treat API as Api, HTTP as Http, etc.
7. **Boolean prefixes**: Use is, has, can, should for clarity

**When in doubt:**
- Check existing code in the same module
- Follow the language's standard convention
- Prioritize clarity and consistency
- Ask for guidance from project maintainers
