# Naming Conventions for Parameters, Variables, Functions/Methods, Classes, Files and more

## Purpose

This document establishes organization-wide naming conventions for variables, functions, classes, CloudFormation resources, environment variables, and AWS tags. Consistent naming improves code readability, maintainability, and reduces cognitive load when working across multiple projects and languages.

## Core Principles

1. **Consistency**: Follow the established conventions for each language and context
2. **Clarity**: Names should clearly communicate purpose and intent
3. **Existing Code First**: When working in existing codebases, follow the majority convention already in use
4. **Don't Refactor Names**: Apply these conventions to new code only; do not rename existing variables unless explicitly required
5. **Context Matters**: Choose the appropriate convention based on the language, framework, and scope

---

## Glossary of Naming Styles

### camelCase
- **Format**: First word lowercase, subsequent words capitalized
- **Examples**: `userName`, `fetchUserData`, `isValidEmail`
- **Usage**: JavaScript/TypeScript variables, functions, methods, parameters

### PascalCase
- **Format**: All words capitalized, no separators
- **Examples**: `UserName`, `FetchUserData`, `IsValidEmail`
- **Usage**: Classes, CloudFormation parameters, CloudFormation resource references

### snake_case
- **Format**: All lowercase, words separated by underscores
- **Examples**: `user_name`, `fetch_user_data`, `is_valid_email`
- **Usage**: Python variables, functions, parameters, file names

### kebab-case
- **Format**: All lowercase, words separated by hyphens
- **Examples**: `user-name`, `fetch-user-data`, `is-valid-email`
- **Usage**: URLs, file names, CSS classes, HTML attributes, Git branch names

### UPPER_SNAKE_CASE
- **Format**: All uppercase, words separated by underscores
- **Examples**: `USER_NAME`, `MAX_RETRY_COUNT`, `API_ENDPOINT`
- **Usage**: Constants, environment variables

### SCREAMING-KEBAB-CASE
- **Format**: All uppercase, words separated by hyphens
- **Examples**: `USER-NAME`, `MAX-RETRY-COUNT`
- **Usage**: Rarely used; avoid unless required by specific framework

---

## Language-Specific Conventions

### JavaScript / TypeScript / Node.js

#### Variables
```javascript
// camelCase for variables
const userName = "John";
const isActive = true;
const userCount = 42;

// UPPER_SNAKE_CASE for global constants
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_TIMEOUT = 30000;

// Local constants: developer's choice (camelCase or UPPER_SNAKE_CASE)
function processData() {
    const maxItems = 100;  // OK
    const MAX_ITEMS = 100; // Also OK
    // Use best judgment based on context
}
```

#### Functions and Methods
```javascript
// camelCase for functions and methods
function getUserData() { }
async function fetchUserProfile() { }
const calculateTotal = () => { };

// Private methods: prefix with underscore (optional)
class UserService {
    _validateUser() { }  // Private method
    getUserById() { }    // Public method
}
```

#### Classes
```javascript
// PascalCase for classes
class UserAccount { }
class APIRequest { }
class CacheManager { }
```

#### Interfaces (TypeScript)
```typescript
// PascalCase, optionally prefix with 'I'
interface UserData { }
interface IUserData { }  // Alternative style

// Type aliases: PascalCase
type UserId = string;
type UserRole = "admin" | "user" | "guest";
```

#### File Names
```javascript
// kebab-case for file names
user-service.js
api-request.js
cache-manager.js

// Or camelCase (choose one style per project)
userService.js
apiRequest.js
cacheManager.js

// Class files may use PascalCase
UserService.js
APIRequest.js
CacheManager.js
```

### Python

#### Variables
```python
# snake_case for variables
user_name = "John"
is_active = True
user_count = 42

# UPPER_SNAKE_CASE for global constants
MAX_RETRY_COUNT = 3
API_BASE_URL = "https://api.example.com"
DEFAULT_TIMEOUT = 30

# Local constants: developer's choice
def process_data():
    max_items = 100  # OK
    MAX_ITEMS = 100  # Also OK
```

#### Functions
```python
# snake_case for functions
def get_user_data():
    pass

async def fetch_user_profile():
    pass

def calculate_total():
    pass

# Private functions: prefix with underscore
def _validate_user():
    pass
```

#### Classes
```python
# PascalCase for classes
class UserAccount:
    pass

class APIRequest:
    pass

class CacheManager:
    pass
```

#### Methods
```python
# snake_case for methods
class UserService:
    def get_user_by_id(self):
        pass
    
    def _validate_user(self):  # Private method
        pass
```

#### File Names
```python
# snake_case for Python files
user_service.py
api_request.py
cache_manager.py
```

#### Modules and Packages
```python
# snake_case for module names
import user_service
from api_request import APIRequest
```

### Shell Scripts (Bash)

#### Variables
```bash
# snake_case for local variables
user_name="John"
is_active=true
user_count=42

# UPPER_SNAKE_CASE for environment variables and constants
MAX_RETRY_COUNT=3
API_BASE_URL="https://api.example.com"
DEFAULT_TIMEOUT=30

# Exported variables: UPPER_SNAKE_CASE
export AWS_REGION="us-east-1"
export LOG_LEVEL="info"
```

#### Functions
```bash
# snake_case for functions
get_user_data() {
    # Implementation
}

fetch_user_profile() {
    # Implementation
}

# Private functions: prefix with underscore
_validate_user() {
    # Implementation
}
```

#### File Names
```bash
# kebab-case for shell scripts
user-service.sh
api-request.sh
deploy-application.sh

# Or snake_case
user_service.sh
api_request.sh
deploy_application.sh
```

---

## Environment Variables

### General Rules

**ALWAYS use UPPER_SNAKE_CASE for environment variables across all platforms.**

```bash
# Good examples
AWS_REGION=us-east-1
DATABASE_HOST=db.example.com
MAX_RETRY_COUNT=3
API_BASE_URL=https://api.example.com
LOG_LEVEL=info
ENABLE_DEBUG_MODE=true
```

### AWS Lambda Environment Variables

```bash
# Configuration
TABLE_NAME=users-table
BUCKET_NAME=cache-bucket
REGION=us-east-1

# Feature flags
ENABLE_CACHING=true
ENABLE_LOGGING=true

# Secrets (retrieve from SSM/Secrets Manager, not hardcoded)
# Reference only - actual values retrieved at runtime
API_KEY_PARAMETER=/myapp/api/key
DB_PASSWORD_SECRET=myapp/database/password

# Timeouts and limits
REQUEST_TIMEOUT=30000
MAX_CONNECTIONS=10
```

### AWS CodeBuild Environment Variables

```bash
# Build configuration
BUILD_ENV=production
NODE_VERSION=20
PYTHON_VERSION=3.11

# AWS resources
ARTIFACT_BUCKET=build-artifacts-bucket
DEPLOY_ROLE_ARN=arn:aws:iam::123456789012:role/DeployRole

# Feature flags
ENABLE_TESTS=true
ENABLE_LINTING=true
SKIP_INTEGRATION_TESTS=false

# Credentials (from Parameter Store/Secrets Manager)
NPM_TOKEN_PARAMETER=/build/npm/token
GITHUB_TOKEN_PARAMETER=/build/github/token
```

### Docker Environment Variables

```bash
# Application configuration
APP_ENV=production
APP_PORT=3000
APP_HOST=0.0.0.0

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=myapp
DB_USER=appuser

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

---

## CloudFormation Naming Conventions

### Template Parameters

**Use PascalCase for parameter names.**

```yaml
Parameters:
  # Good examples
  EnvironmentName:
    Type: String
    Description: Environment name (dev, staging, prod)
  
  DatabaseInstanceType:
    Type: String
    Description: RDS instance type
  
  EnableAutoScaling:
    Type: String
    AllowedValues: [true, false]
    Description: Enable auto scaling
  
  MaxInstanceCount:
    Type: Number
    Description: Maximum number of instances
  
  VpcCIDR:
    Type: String
    Description: VPC CIDR block
  
  S3BucketName:
    Type: String
    Description: S3 bucket name for artifacts
```

### Resource Logical IDs (Reference Names)

**Use PascalCase for resource logical IDs.**

```yaml
Resources:
  # Good examples
  UserTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${EnvironmentName}-users
  
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub ${EnvironmentName}-cache-bucket
  
  APIGatewayRestAPI:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub ${EnvironmentName}-api
  
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub ${EnvironmentName}-lambda-execution-role
  
  ApplicationLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: !Sub ${EnvironmentName}-alb
```

### Condition Names

**Use PascalCase for condition names.**

```yaml
Conditions:
  # Good examples
  IsProduction: !Equals [!Ref EnvironmentName, prod]
  
  EnableAutoScaling: !Equals [!Ref EnableAutoScaling, true]
  
  CreateDatabaseReplica: !And
    - !Condition IsProduction
    - !Equals [!Ref EnableHighAvailability, true]
  
  UseCustomDomain: !Not [!Equals [!Ref DomainName, ""]]
```

### Mapping Names

**Use PascalCase for mapping names.**

```yaml
Mappings:
  # Good examples
  EnvironmentConfig:
    dev:
      InstanceType: t3.micro
      MinSize: 1
      MaxSize: 2
    prod:
      InstanceType: t3.large
      MinSize: 3
      MaxSize: 10
  
  RegionConfig:
    us-east-1:
      AMI: ami-12345678
    us-west-2:
      AMI: ami-87654321
```

### Output Names

**Use PascalCase for output names.**

```yaml
Outputs:
  # Good examples
  UserTableName:
    Description: DynamoDB table name for users
    Value: !Ref UserTable
    Export:
      Name: !Sub ${AWS::StackName}-UserTableName
  
  APIEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub https://${APIGatewayRestAPI}.execute-api.${AWS::Region}.amazonaws.com
  
  LoadBalancerDNS:
    Description: Application Load Balancer DNS name
    Value: !GetAtt ApplicationLoadBalancer.DNSName
```

### Actual Resource Names (Properties)

**Use kebab-case or environment-prefixed names for actual AWS resource names.**

```yaml
Resources:
  UserTable:
    Type: AWS::DynamoDB::Table
    Properties:
      # Actual resource name: kebab-case with environment prefix
      TableName: !Sub ${EnvironmentName}-users-table
  
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      # Actual bucket name: kebab-case with environment prefix
      BucketName: !Sub ${EnvironmentName}-cache-bucket
  
  ProcessingFunction:
    Type: AWS::Lambda::Function
    Properties:
      # Actual function name: kebab-case with environment prefix
      FunctionName: !Sub ${EnvironmentName}-data-processor
```

---

## AWS Resource Tagging

### Standard Tags

**All AWS resources should include these standard tags:**

```yaml
Tags:
  - Key: Environment
    Value: !Ref EnvironmentName
  
  - Key: Project
    Value: MyProject
  
  - Key: ManagedBy
    Value: CloudFormation
  
  - Key: CostCenter
    Value: Engineering
  
  - Key: Owner
    Value: team-name
```

### Service-Specific Tags

**Use service:TagName format for service-specific tags.**

**Format**: `serviceName:TagName` where:
- First word of service name is lowercase
- Subsequent words are capitalized
- Tag name is PascalCase

```yaml
Tags:
  # Cache invalidation service
  - Key: cacheInvalidator:AllowAccess
    Value: true
  
  - Key: cacheInvalidator:Priority
    Value: high
  
  # API Gateway service
  - Key: apiGateway:RateLimit
    Value: 1000
  
  - Key: apiGateway:EnableCaching
    Value: true
  
  # Lambda function service
  - Key: lambdaFunction:Timeout
    Value: 300
  
  - Key: lambdaFunction:MemorySize
    Value: 1024
  
  # Database service
  - Key: database:BackupRetention
    Value: 7
  
  - Key: database:EnableEncryption
    Value: true
  
  # Monitoring service
  - Key: monitoring:AlertThreshold
    Value: 80
  
  - Key: monitoring:EnableDetailedMetrics
    Value: true
```

**Examples by Service:**

```yaml
# Single-word service names
- Key: cache:Enabled
  Value: true

- Key: queue:MaxMessages
  Value: 100

# Multi-word service names (first word lowercase)
- Key: cacheInvalidator:AllowAccess
  Value: true

- Key: dataProcessor:BatchSize
  Value: 50

- Key: apiGateway:Throttling
  Value: enabled

- Key: loadBalancer:HealthCheckPath
  Value: /health
```

### GitHub Custom Properties

**Use the same naming convention as AWS tags, but replace `:` with `_`.**

**Format**: `serviceName_TagName`

```yaml
# GitHub repository custom properties
cache_invalidator_AllowAccess: true
cache_invalidator_Priority: high

api_gateway_RateLimit: 1000
api_gateway_EnableCaching: true

lambda_function_Timeout: 300
lambda_function_MemorySize: 1024

database_BackupRetention: 7
database_EnableEncryption: true

monitoring_AlertThreshold: 80
monitoring_EnableDetailedMetrics: true
```

**Why underscore instead of colon?**
- GitHub custom properties don't support colons in property names
- Underscore maintains readability while being compatible
- Easy to convert between AWS tags and GitHub properties

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

### Private Members

**JavaScript/TypeScript: Use # for private fields (ES2022+)**
```javascript
class UserService {
    #apiKey;  // Private field
    
    #validateUser() { }  // Private method
}
```

**Python: Use single underscore prefix**
```python
class UserService:
    def __init__(self):
        self._api_key = None  # Private attribute
    
    def _validate_user(self):  # Private method
        pass
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

## Validation Checklist

Before committing code, verify:

- [ ] Variable names follow language-specific conventions
- [ ] Function names follow language-specific conventions
- [ ] Class names use PascalCase
- [ ] Global constants use UPPER_SNAKE_CASE
- [ ] Environment variables use UPPER_SNAKE_CASE
- [ ] CloudFormation parameters use PascalCase
- [ ] CloudFormation resource IDs use PascalCase
- [ ] CloudFormation resource names use kebab-case
- [ ] AWS tags follow service:TagName format
- [ ] GitHub properties follow service_TagName format
- [ ] Existing code conventions are respected (majority rules)
- [ ] No unnecessary renaming of existing variables

---

## Summary

**Key Takeaways:**

1. **Follow language standards**: JavaScript uses camelCase, Python uses snake_case
2. **Constants are UPPER_SNAKE_CASE**: Global constants across all languages
3. **Classes are PascalCase**: Across all languages
4. **Environment variables are UPPER_SNAKE_CASE**: Across all platforms
5. **CloudFormation uses PascalCase**: For parameters, resources, conditions
6. **AWS tags use service:TagName**: First word lowercase, rest PascalCase
7. **GitHub properties use service_TagName**: Same as tags but with underscore
8. **Respect existing code**: Follow majority convention, don't refactor names
9. **Local constants are flexible**: Use best judgment based on context

**When in doubt:**
- Check existing code in the same module
- Follow the language's standard convention
- Prioritize clarity and consistency
- Ask for guidance from project maintainers
