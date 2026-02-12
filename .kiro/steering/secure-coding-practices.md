# Secure Coding Practices

## Purpose

This document establishes secure coding practices for the @63klabs/cache-data package and provides guidance for preventing common security vulnerabilities in Node.js and Python backend development. These practices are designed to protect against injection attacks, credential leaks, and other security issues in Lambda functions, CI/CD scripts, and backend services.

## Table of Contents

1. [Shell Command Execution Security](#shell-command-execution-security)
2. [Input Validation](#input-validation)
3. [String Handling and Escaping](#string-handling-and-escaping)
4. [Credential Management](#credential-management)
5. [Security Testing](#security-testing)
6. [Lambda and CI/CD Security](#lambda-and-cicd-security)
7. [Security Comment Notation](#security-comment-notation)

---

## Shell Command Execution Security

### Overview

Shell command injection is one of the most critical security vulnerabilities. It occurs when untrusted input is used to construct shell commands without proper sanitization, allowing attackers to execute arbitrary commands on the system.

### Node.js: execFile vs exec

**CRITICAL RULE: Always use `execFile` or `execFileSync` instead of `exec` or `execSync`.**

#### Why exec is Dangerous

The `exec` function spawns a shell and interprets the entire command string, including special characters:

```javascript
// ❌ DANGEROUS - Shell injection vulnerability
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// If filePath contains "; rm -rf /", the shell will execute it!
await execAsync(`node --check ${filePath}`);
```

**Attack Example:**
```javascript
const filePath = '/tmp/test.js; rm -rf /';
await execAsync(`node --check ${filePath}`);
// Shell interprets this as TWO commands:
// 1. node --check /tmp/test.js
// 2. rm -rf /
```

#### Secure Pattern: Use execFile

The `execFile` function executes the command directly without spawning a shell:

```javascript
// ✅ SECURE - No shell interpretation
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// >! Use execFile to prevent shell interpretation
// >! Arguments passed as array are not interpreted by shell
await execFileAsync('node', ['--check', filePath]);
```

**Why This is Safe:**
- No shell is spawned
- Arguments are passed directly to the executable
- Special characters like `;`, `|`, `$()`, `` ` ``, `&`, `>`, `<` are treated as literal strings
- Even malicious file paths cannot execute commands


#### Complete Example

```javascript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Safely execute a command with user-provided arguments
 * 
 * @param {string} command - Command to execute (e.g., 'node', 'git')
 * @param {Array<string>} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 */
async function safeExecute(command, args) {
  try {
    // >! Use execFile to prevent shell interpretation
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 // 1MB max output
    });
    return { stdout, stderr };
  } catch (error) {
    // Handle errors appropriately
    if (error.code === 'ENOENT') {
      throw new Error(`Command not found: ${command}`);
    }
    throw error;
  }
}

// Usage examples
await safeExecute('node', ['--check', userProvidedPath]);
await safeExecute('git', ['log', '--oneline', '-n', '10']);
```

### Python: subprocess.run with shell=False

**CRITICAL RULE: Always use `subprocess.run` with `shell=False` (the default).**

#### Dangerous Pattern

```python
# ❌ DANGEROUS - Shell injection vulnerability
import subprocess

file_path = user_input
subprocess.run(f"node --check {file_path}", shell=True)
```

#### Secure Pattern

```python
# ✅ SECURE - No shell interpretation
import subprocess

# >! Use subprocess.run with shell=False to prevent shell injection
# >! Arguments passed as list are not interpreted by shell
result = subprocess.run(
    ['node', '--check', file_path],
    shell=False,  # This is the default, but explicit is better
    capture_output=True,
    text=True,
    timeout=30
)
```


#### Complete Python Example

```python
import subprocess
from typing import Tuple

def safe_execute(command: str, args: list[str], timeout: int = 30) -> Tuple[str, str]:
    """
    Safely execute a command with arguments
    
    Args:
        command: Command to execute (e.g., 'node', 'git')
        args: Command arguments as list
        timeout: Timeout in seconds
        
    Returns:
        Tuple of (stdout, stderr)
        
    Raises:
        subprocess.TimeoutExpired: If command exceeds timeout
        subprocess.CalledProcessError: If command returns non-zero exit code
    """
    # >! Use subprocess.run with shell=False to prevent shell injection
    result = subprocess.run(
        [command] + args,
        shell=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=True  # Raise exception on non-zero exit
    )
    return result.stdout, result.stderr

# Usage examples
stdout, stderr = safe_execute('node', ['--check', user_provided_path])
stdout, stderr = safe_execute('git', ['log', '--oneline', '-n', '10'])
```

### Anti-Patterns to Avoid

#### ❌ String Concatenation with exec

```javascript
// NEVER do this
const command = `node --check ${filePath}`;
await execAsync(command);
```

#### ❌ Template Literals with exec

```javascript
// NEVER do this
await execAsync(`node --check ${filePath}`);
```

#### ❌ Shell=True in Python

```python
# NEVER do this
subprocess.run(f"node --check {file_path}", shell=True)
```

### When You Might Think You Need a Shell

Sometimes you might want shell features like pipes, redirects, or wildcards. **Don't use a shell.** Instead:


**For Pipes:** Use multiple execFile calls and pipe data manually:

```javascript
// Instead of: ls | grep test
const { stdout: lsOutput } = await execFileAsync('ls', []);
const lines = lsOutput.split('\n').filter(line => line.includes('test'));
```

**For Wildcards:** Use file system APIs:

```javascript
// Instead of: rm *.tmp
import { readdir, unlink } from 'fs/promises';
const files = await readdir('.');
const tmpFiles = files.filter(f => f.endsWith('.tmp'));
await Promise.all(tmpFiles.map(f => unlink(f)));
```

**For Redirects:** Use file system APIs:

```javascript
// Instead of: command > output.txt
import { writeFile } from 'fs/promises';
const { stdout } = await execFileAsync('command', []);
await writeFile('output.txt', stdout);
```

### ESLint Rule

Add this rule to your `.eslintrc.json` to prevent unsafe patterns:

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["child_process"],
        "importNames": ["exec", "execSync"],
        "message": "Use execFile or execFileSync instead of exec/execSync to prevent shell injection. See .kiro/steering/secure-coding-practices.md"
      }]
    }]
  }
}
```

---

## Input Validation

### Overview

Input validation is the first line of defense against many security vulnerabilities. All user input should be validated before use, especially when used in file operations, database queries, or command execution.

### File Path Validation

File paths from user input can be dangerous if not validated properly.

#### Dangerous Patterns

```javascript
// ❌ DANGEROUS - No validation
function readUserFile(userPath) {
  return fs.readFileSync(userPath);
}

// User could provide: '../../../etc/passwd'
```

#### Secure Pattern: Allowlist Validation

```javascript
import { resolve, normalize, relative } from 'path';
import { readFile } from 'fs/promises';

/**
 * Safely read a file from an allowed directory
 * 
 * @param {string} userPath - User-provided file path
 * @param {string} allowedDir - Directory where files are allowed
 * @returns {Promise<string>} File contents
 * @throws {Error} If path is outside allowed directory
 */
async function readUserFile(userPath, allowedDir) {
  // >! Normalize and resolve paths to prevent directory traversal
  const normalizedPath = normalize(userPath);
  const resolvedPath = resolve(allowedDir, normalizedPath);
  const resolvedAllowedDir = resolve(allowedDir);
  
  // >! Check that resolved path is within allowed directory
  const relativePath = relative(resolvedAllowedDir, resolvedPath);
  if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
    throw new Error('Path is outside allowed directory');
  }
  
  return await readFile(resolvedPath, 'utf8');
}

// Usage
const content = await readUserFile(userInput, '/var/app/uploads');
```


### User Input Sanitization

#### String Validation

```javascript
/**
 * Validate that a string contains only allowed characters
 * 
 * @param {string} input - User input to validate
 * @param {RegExp} allowedPattern - Pattern of allowed characters
 * @param {string} fieldName - Name of field for error messages
 * @returns {string} Validated input
 * @throws {Error} If input contains disallowed characters
 */
function validateString(input, allowedPattern, fieldName) {
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  
  if (!allowedPattern.test(input)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  
  return input;
}

// Examples
const username = validateString(
  userInput,
  /^[a-zA-Z0-9_-]+$/,
  'Username'
);

const email = validateString(
  userInput,
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  'Email'
);
```

#### Numeric Validation

```javascript
/**
 * Validate and parse a numeric input
 * 
 * @param {any} input - User input to validate
 * @param {Object} options - Validation options
 * @returns {number} Validated number
 * @throws {Error} If input is not a valid number or out of range
 */
function validateNumber(input, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const num = Number(input);
  
  if (isNaN(num)) {
    throw new Error('Input must be a valid number');
  }
  
  if (integer && !Number.isInteger(num)) {
    throw new Error('Input must be an integer');
  }
  
  if (num < min || num > max) {
    throw new Error(`Input must be between ${min} and ${max}`);
  }
  
  return num;
}

// Examples
const age = validateNumber(userInput, { min: 0, max: 150, integer: true });
const price = validateNumber(userInput, { min: 0 });
```


### Allowlisting vs Denylisting

**ALWAYS prefer allowlisting (defining what IS allowed) over denylisting (defining what is NOT allowed).**

#### ❌ Denylisting (Dangerous)

```javascript
// Trying to block dangerous characters - easy to bypass
function sanitizeInput(input) {
  // What about other dangerous characters we forgot?
  return input.replace(/[;<>|&$`]/g, '');
}
```

**Problems with denylisting:**
- Easy to forget dangerous characters
- New attack vectors may be discovered
- Different contexts have different dangerous characters
- Encoding tricks can bypass filters

#### ✅ Allowlisting (Secure)

```javascript
// Only allow known-safe characters
function sanitizeInput(input) {
  // Only alphanumeric, dash, and underscore allowed
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    throw new Error('Input contains invalid characters');
  }
  return input;
}
```

**Benefits of allowlisting:**
- Explicitly defines what is safe
- Rejects everything else by default
- Easier to reason about security
- More maintainable

### Validation Examples by Use Case

#### S3 Bucket Names

```javascript
function validateS3BucketName(name) {
  // S3 bucket naming rules
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) {
    throw new Error('Invalid S3 bucket name');
  }
  if (name.includes('..')) {
    throw new Error('Bucket name cannot contain consecutive periods');
  }
  return name;
}
```

#### DynamoDB Table Names

```javascript
function validateDynamoTableName(name) {
  // DynamoDB table naming rules
  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(name)) {
    throw new Error('Invalid DynamoDB table name');
  }
  return name;
}
```

#### Lambda Function Names

```javascript
function validateLambdaFunctionName(name) {
  // Lambda function naming rules
  if (!/^[a-zA-Z0-9-_]{1,64}$/.test(name)) {
    throw new Error('Invalid Lambda function name');
  }
  return name;
}
```

---

## String Handling and Escaping

### Overview

Improper string handling can lead to injection vulnerabilities, parsing errors, and security issues. This section covers secure patterns for handling strings with special characters.

### Bracket Matching for Nested Structures

When parsing strings with nested structures (like JSDoc type annotations), simple regex patterns often fail.

#### ❌ Dangerous Pattern: Simple Regex

```javascript
// FAILS for nested brackets: {Array<{id: string}>}
const match = line.match(/\{([^}]+)\}/);
// Only matches up to first }, leaving rest unparsed
```

#### ✅ Secure Pattern: Bracket Depth Counting

```javascript
/**
 * Parse a string with nested brackets by counting bracket depth
 * 
 * @param {string} str - String to parse
 * @param {number} startPos - Position to start parsing
 * @returns {{content: string, endPos: number}|null} Parsed content and end position
 */
function parseNestedBrackets(str, startPos) {
  let depth = 0;
  let i = startPos;
  
  // >! Find closing bracket by counting bracket depth
  while (i < str.length) {
    const char = str[i];
    
    // >! Handle escaped characters
    if (char === '\\' && i + 1 < str.length) {
      i += 2; // Skip escaped character
      continue;
    }
    
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      if (depth === 0) {
        // Found matching closing bracket
        return {
          content: str.substring(startPos, i),
          endPos: i
        };
      }
      depth--;
    }
    
    i++;
  }
  
  // >! Unmatched brackets - handle gracefully
  return null;
}

// Usage
const result = parseNestedBrackets('{Array<{id: string, name: string}>}', 1);
// result.content = 'Array<{id: string, name: string}>'
```


### Handling Special Characters

#### HTML/XML Escaping

```javascript
/**
 * Escape HTML special characters
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  
  return str.replace(/[&<>"']/g, char => escapeMap[char]);
}
```

#### SQL Escaping (Use Parameterized Queries Instead)

```javascript
// ❌ NEVER concatenate SQL queries
const query = `SELECT * FROM users WHERE name = '${userName}'`;

// ✅ ALWAYS use parameterized queries
const query = 'SELECT * FROM users WHERE name = ?';
db.execute(query, [userName]);
```

#### JSON Escaping

```javascript
// ✅ Use JSON.stringify for safe JSON encoding
const jsonStr = JSON.stringify(userInput);

// ❌ NEVER manually construct JSON strings
const jsonStr = `{"name": "${userName}"}`;  // Vulnerable to injection
```

### Regular Expression Security

#### ReDoS (Regular Expression Denial of Service)

Some regex patterns can cause exponential backtracking, leading to DoS:

```javascript
// ❌ DANGEROUS - Catastrophic backtracking
const badRegex = /^(a+)+$/;
badRegex.test('aaaaaaaaaaaaaaaaaaaaaaaaaaab');  // Hangs!

// ✅ SAFE - Linear time complexity
const goodRegex = /^a+$/;
```

**Rules for safe regex:**
- Avoid nested quantifiers: `(a+)+`, `(a*)*`
- Avoid alternation with overlapping patterns: `(a|a)*`
- Test regex with long inputs
- Set timeouts for regex operations


#### Safe Regex Patterns

```javascript
/**
 * Test a regex with timeout protection
 * 
 * @param {RegExp} regex - Regular expression to test
 * @param {string} str - String to test against
 * @param {number} timeout - Timeout in milliseconds
 * @returns {boolean} Whether regex matches
 * @throws {Error} If regex times out
 */
function safeRegexTest(regex, str, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Regex timeout - possible ReDoS'));
    }, timeout);
    
    try {
      const result = regex.test(str);
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
```

### Escaping Examples by Context

#### File Paths

```javascript
// Use path.join to safely construct paths
import { join } from 'path';

const safePath = join(baseDir, userInput);
// Automatically handles separators and prevents traversal
```

#### URLs

```javascript
// Use URL API for safe URL construction
const url = new URL('/api/users', 'https://example.com');
url.searchParams.set('name', userInput);  // Automatically encoded
```

#### Command Arguments

```javascript
// Use execFile with array arguments (no escaping needed)
await execFileAsync('command', [userInput]);
// Arguments are passed directly, no shell escaping required
```

---

## Credential Management

### Overview

**CRITICAL RULE: NEVER hardcode credentials in source code, configuration files, or environment variables committed to version control.**

All credentials must be stored in AWS Systems Manager Parameter Store or AWS Secrets Manager and retrieved at runtime.

### AWS SSM Parameter Store

Parameter Store is ideal for configuration values and non-sensitive parameters. It can also store encrypted secrets.

#### Storing Parameters

```javascript
import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

/**
 * Store a parameter in SSM Parameter Store
 * 
 * @param {string} name - Parameter name (e.g., '/myapp/database/host')
 * @param {string} value - Parameter value
 * @param {boolean} secure - Whether to encrypt the parameter
 */
async function storeParameter(name, value, secure = false) {
  const command = new PutParameterCommand({
    Name: name,
    Value: value,
    Type: secure ? 'SecureString' : 'String',
    Overwrite: true
  });
  
  await ssmClient.send(command);
}

// Usage
await storeParameter('/myapp/api/key', apiKey, true);
await storeParameter('/myapp/database/host', dbHost, false);
```

#### Retrieving Parameters

```javascript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

/**
 * Retrieve a parameter from SSM Parameter Store
 * 
 * @param {string} name - Parameter name
 * @param {boolean} decrypt - Whether to decrypt SecureString parameters
 * @returns {Promise<string>} Parameter value
 */
async function getParameter(name, decrypt = true) {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: decrypt
  });
  
  const response = await ssmClient.send(command);
  return response.Parameter.Value;
}

// Usage in Lambda function
export const handler = async (event) => {
  // >! Retrieve credentials from SSM at runtime
  const apiKey = await getParameter('/myapp/api/key');
  const dbHost = await getParameter('/myapp/database/host');
  
  // Use credentials
  const response = await fetch('https://api.example.com', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  return response;
};
```


### AWS Secrets Manager

Secrets Manager is designed specifically for sensitive credentials like database passwords, API keys, and OAuth tokens. It provides automatic rotation and versioning.

#### Storing Secrets

```javascript
import { SecretsManagerClient, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

/**
 * Store a secret in AWS Secrets Manager
 * 
 * @param {string} name - Secret name
 * @param {Object} secretValue - Secret value as object
 */
async function storeSecret(name, secretValue) {
  const command = new CreateSecretCommand({
    Name: name,
    SecretString: JSON.stringify(secretValue)
  });
  
  await secretsClient.send(command);
}

// Usage
await storeSecret('myapp/database/credentials', {
  username: 'dbuser',
  password: 'securePassword123',
  host: 'db.example.com',
  port: 5432
});
```

#### Retrieving Secrets

```javascript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

/**
 * Retrieve a secret from AWS Secrets Manager
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<Object>} Secret value as object
 */
async function getSecret(secretName) {
  const command = new GetSecretValueCommand({
    SecretId: secretName
  });
  
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString);
}

// Usage in Lambda function
export const handler = async (event) => {
  // >! Retrieve credentials from Secrets Manager at runtime
  const dbCredentials = await getSecret('myapp/database/credentials');
  
  // Use credentials to connect to database
  const connection = await createConnection({
    host: dbCredentials.host,
    port: dbCredentials.port,
    user: dbCredentials.username,
    password: dbCredentials.password
  });
  
  // ... use connection
};
```


### Caching Credentials in Lambda

Lambda functions should cache credentials to avoid repeated API calls:

```javascript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

// Cache credentials outside handler for reuse across invocations
let cachedApiKey = null;
let cacheExpiry = 0;

/**
 * Get API key with caching
 * 
 * @returns {Promise<string>} API key
 */
async function getApiKey() {
  const now = Date.now();
  
  // >! Cache credentials for 5 minutes to reduce SSM API calls
  if (cachedApiKey && now < cacheExpiry) {
    return cachedApiKey;
  }
  
  // Retrieve from SSM
  const command = new GetParameterCommand({
    Name: '/myapp/api/key',
    WithDecryption: true
  });
  
  const response = await ssmClient.send(command);
  cachedApiKey = response.Parameter.Value;
  cacheExpiry = now + (5 * 60 * 1000); // 5 minutes
  
  return cachedApiKey;
}

export const handler = async (event) => {
  const apiKey = await getApiKey();
  // Use apiKey
};
```

### What NOT to Do

#### ❌ Hardcoded Credentials

```javascript
// NEVER do this
const API_KEY = 'sk-1234567890abcdef';
const DB_PASSWORD = 'mySecretPassword123';
```

#### ❌ Credentials in Environment Variables (Committed)

```javascript
// .env file committed to git - NEVER do this
API_KEY=sk-1234567890abcdef
DB_PASSWORD=mySecretPassword123
```

#### ❌ Credentials in Configuration Files

```javascript
// config.json committed to git - NEVER do this
{
  "apiKey": "sk-1234567890abcdef",
  "dbPassword": "mySecretPassword123"
}
```


### IAM Permissions for Credential Access

Lambda functions need appropriate IAM permissions to access SSM and Secrets Manager:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:123456789012:parameter/myapp/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:kms:us-east-1:123456789012:key/your-kms-key-id"
      ]
    }
  ]
}
```

### Python Example

```python
import boto3
import json
from functools import lru_cache

ssm_client = boto3.client('ssm', region_name='us-east-1')
secrets_client = boto3.client('secretsmanager', region_name='us-east-1')

@lru_cache(maxsize=128)
def get_parameter(name: str, decrypt: bool = True) -> str:
    """
    Retrieve parameter from SSM Parameter Store with caching
    
    Args:
        name: Parameter name
        decrypt: Whether to decrypt SecureString parameters
        
    Returns:
        Parameter value
    """
    # >! Retrieve credentials from SSM at runtime
    response = ssm_client.get_parameter(
        Name=name,
        WithDecryption=decrypt
    )
    return response['Parameter']['Value']

@lru_cache(maxsize=128)
def get_secret(secret_name: str) -> dict:
    """
    Retrieve secret from AWS Secrets Manager with caching
    
    Args:
        secret_name: Secret name
        
    Returns:
        Secret value as dictionary
    """
    # >! Retrieve credentials from Secrets Manager at runtime
    response = secrets_client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

def lambda_handler(event, context):
    # Use cached credential retrieval
    api_key = get_parameter('/myapp/api/key')
    db_creds = get_secret('myapp/database/credentials')
    
    # Use credentials
    # ...
```

---

## Security Testing

### Overview

Security testing validates that security controls work correctly and that vulnerabilities are prevented. This section covers security testing patterns for both Jest (JavaScript) and Hypothesis (Python).

### Jest Security Testing Patterns

#### Testing Shell Injection Prevention

```javascript
import { describe, it, expect } from '@jest/globals';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Shell Injection Prevention', () => {
  it('should handle file paths with semicolons safely', async () => {
    const maliciousPath = '/tmp/test.js; rm -rf /';
    
    try {
      // >! execFile treats semicolon as part of filename, not command separator
      await execFileAsync('node', ['--check', maliciousPath]);
    } catch (error) {
      // File not found is expected - the important thing is no command injection
      expect(error.code).toBe('ENOENT');
      expect(error.message).toContain(maliciousPath);
    }
  });
  
  it('should handle file paths with pipes safely', async () => {
    const maliciousPath = '/tmp/test.js | cat /etc/passwd';
    
    try {
      await execFileAsync('node', ['--check', maliciousPath]);
    } catch (error) {
      expect(error.code).toBe('ENOENT');
      // Pipe character should be part of filename, not executed
      expect(error.message).toContain(maliciousPath);
    }
  });
  
  it('should handle command substitution safely', async () => {
    const maliciousPath = '/tmp/test.js $(whoami)';
    
    try {
      await execFileAsync('node', ['--check', maliciousPath]);
    } catch (error) {
      expect(error.code).toBe('ENOENT');
      // Command substitution should not be executed
      expect(error.message).toContain(maliciousPath);
    }
  });
});
```


#### Testing Input Validation

```javascript
import { describe, it, expect } from '@jest/globals';

describe('Input Validation', () => {
  it('should reject paths with directory traversal', () => {
    const validatePath = (userPath, allowedDir) => {
      const normalized = path.normalize(userPath);
      const resolved = path.resolve(allowedDir, normalized);
      const relative = path.relative(allowedDir, resolved);
      
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Path traversal detected');
      }
      return resolved;
    };
    
    expect(() => validatePath('../../../etc/passwd', '/var/app'))
      .toThrow('Path traversal detected');
    
    expect(() => validatePath('/etc/passwd', '/var/app'))
      .toThrow('Path traversal detected');
    
    // Valid paths should work
    expect(validatePath('uploads/file.txt', '/var/app'))
      .toBe('/var/app/uploads/file.txt');
  });
  
  it('should validate string format', () => {
    const validateUsername = (username) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        throw new Error('Invalid username format');
      }
      return username;
    };
    
    expect(() => validateUsername('user; DROP TABLE users'))
      .toThrow('Invalid username format');
    
    expect(() => validateUsername('user<script>'))
      .toThrow('Invalid username format');
    
    expect(validateUsername('valid_user-123')).toBe('valid_user-123');
  });
});
```

#### Property-Based Security Testing with fast-check

```javascript
import fc from 'fast-check';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Property-Based Security Tests', () => {
  it('Property: execFile prevents shell interpretation for any input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary strings including shell metacharacters
        fc.string({ minLength: 1, maxLength: 100 }),
        async (randomString) => {
          const testPath = `/tmp/${randomString}.js`;
          
          try {
            await execFileAsync('echo', [testPath]);
            // Command executed without shell interpretation
            return true;
          } catch (error) {
            // File not found is OK - we're testing injection prevention
            // The important thing is no shell commands were executed
            return error.code === 'ENOENT' || error.code === 'EACCES';
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


### Python Security Testing with Hypothesis

#### Testing Shell Injection Prevention

```python
import subprocess
import pytest
from hypothesis import given, strategies as st

def safe_execute(command: str, args: list[str]) -> tuple[str, str]:
    """Execute command safely without shell"""
    # >! Use subprocess.run with shell=False to prevent shell injection
    result = subprocess.run(
        [command] + args,
        shell=False,
        capture_output=True,
        text=True,
        timeout=5
    )
    return result.stdout, result.stderr

class TestShellInjectionPrevention:
    def test_semicolon_injection(self):
        """Test that semicolons are treated as literal characters"""
        malicious_path = '/tmp/test.py; rm -rf /'
        
        with pytest.raises(FileNotFoundError):
            # Should fail with file not found, not execute rm command
            safe_execute('python', ['-c', 'import sys; print(sys.argv)', malicious_path])
    
    def test_pipe_injection(self):
        """Test that pipes are treated as literal characters"""
        malicious_path = '/tmp/test.py | cat /etc/passwd'
        
        with pytest.raises(FileNotFoundError):
            safe_execute('python', [malicious_path])
    
    @given(st.text(min_size=1, max_size=100))
    def test_arbitrary_input_safety(self, random_input):
        """Property test: Any input should be safe from shell interpretation"""
        try:
            safe_execute('echo', [random_input])
            # If it succeeds, that's fine
            assert True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            # These errors are acceptable - no shell injection occurred
            assert True
        except subprocess.CalledProcessError:
            # Command failed but didn't inject
            assert True
```

#### Testing Input Validation

```python
import pytest
from hypothesis import given, strategies as st
import re

def validate_username(username: str) -> str:
    """Validate username format"""
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        raise ValueError('Invalid username format')
    return username

class TestInputValidation:
    def test_sql_injection_attempt(self):
        """Test that SQL injection attempts are rejected"""
        with pytest.raises(ValueError):
            validate_username("admin'; DROP TABLE users--")
    
    def test_xss_attempt(self):
        """Test that XSS attempts are rejected"""
        with pytest.raises(ValueError):
            validate_username("<script>alert('xss')</script>")
    
    @given(st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=1))
    def test_valid_usernames_accepted(self, username):
        """Property test: Valid usernames should be accepted"""
        # Only alphanumeric characters should pass
        result = validate_username(username)
        assert result == username
    
    @given(st.text(min_size=1).filter(lambda s: not re.match(r'^[a-zA-Z0-9_-]+$', s)))
    def test_invalid_usernames_rejected(self, username):
        """Property test: Invalid usernames should be rejected"""
        with pytest.raises(ValueError):
            validate_username(username)
```


### Security Test Organization

Organize security tests in dedicated directories:

```
test/
├── security/
│   ├── shell-command-security-tests.mjs
│   ├── input-validation-security-tests.mjs
│   ├── credential-handling-security-tests.mjs
│   └── property/
│       ├── shell-injection-prevention-property-tests.mjs
│       └── input-validation-property-tests.mjs
```

### Security Test Best Practices

1. **Test Both Success and Failure Cases**: Verify that valid inputs work and invalid inputs are rejected
2. **Use Property-Based Testing**: Generate arbitrary inputs to find edge cases
3. **Test Real Implementations**: Don't mock security-critical code
4. **Document Security Properties**: Clearly state what security property each test validates
5. **Run Tests in CI/CD**: Security tests must pass before deployment
6. **Test Error Messages**: Ensure error messages don't leak sensitive information

### Example: Complete Security Test Suite

```javascript
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

describe('Security Test Suite', () => {
  describe('Shell Injection Prevention', () => {
    it('should prevent semicolon injection', async () => {
      // Unit test for specific attack
    });
    
    it('Property: prevents injection for any input', async () => {
      // Property-based test for general case
      await fc.assert(
        fc.asyncProperty(fc.string(), async (input) => {
          // Test implementation
        }),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Input Validation', () => {
    it('should reject SQL injection attempts', () => {
      // Unit test for specific attack
    });
    
    it('Property: accepts only valid formats', () => {
      // Property-based test for general case
      fc.assert(
        fc.property(fc.string(), (input) => {
          // Test implementation
        }),
        { numRuns: 100 }
      );
    });
  });
});
```

---

## Lambda and CI/CD Security

### Overview

Lambda functions and CI/CD scripts have unique security considerations due to their privileged access to AWS resources and automated execution.

### Lambda Function Security Best Practices

#### Principle of Least Privilege

Lambda functions should have minimal IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::my-specific-bucket/specific-prefix/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:123456789012:table/MySpecificTable"
      ]
    }
  ]
}
```

**Avoid wildcards in production:**
```json
// ❌ DANGEROUS - Too permissive
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "*"
}

// ✅ SECURE - Specific permissions
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-bucket/my-prefix/*"
}
```

#### Environment Variable Security

```javascript
// Lambda handler with secure environment variable usage
export const handler = async (event) => {
  // >! Validate environment variables at startup
  const requiredVars = ['TABLE_NAME', 'BUCKET_NAME', 'REGION'];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }
  
  // >! Use environment variables for configuration, not secrets
  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;
  
  // >! Retrieve secrets from SSM/Secrets Manager, not environment variables
  const apiKey = await getParameter('/myapp/api/key');
  
  // Use configuration and secrets
  // ...
};
```


#### Input Validation in Lambda

```javascript
export const handler = async (event) => {
  // >! Always validate Lambda event input
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' })
    };
  }
  
  let requestData;
  try {
    requestData = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }
  
  // >! Validate required fields
  if (!requestData.userId || typeof requestData.userId !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid userId' })
    };
  }
  
  // >! Validate format
  if (!/^[a-zA-Z0-9-]+$/.test(requestData.userId)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'userId contains invalid characters' })
    };
  }
  
  // Process validated input
  // ...
};
```

#### Error Handling in Lambda

```javascript
export const handler = async (event) => {
  try {
    // Lambda logic
    const result = await processRequest(event);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    // >! Log full error for debugging (CloudWatch)
    console.error('Error processing request:', error);
    
    // >! Return sanitized error to client (no sensitive info)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        requestId: event.requestContext?.requestId
      })
    };
  }
};
```

### CodeBuild Script Security

#### Secure buildspec.yml

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      # >! Use specific versions, not 'latest'
      - npm ci --production
      
  pre_build:
    commands:
      # >! Retrieve credentials from SSM/Secrets Manager
      - export API_KEY=$(aws ssm get-parameter --name /myapp/api/key --with-decryption --query 'Parameter.Value' --output text)
      
  build:
    commands:
      # >! Use execFile-equivalent in shell scripts
      - node scripts/build.js
      
  post_build:
    commands:
      # >! Clean up sensitive data
      - unset API_KEY
      - rm -f .env .env.local

artifacts:
  files:
    - '**/*'
  exclude-paths:
    - node_modules/**/*
    - .git/**/*
    - '**/.env*'
```


#### Secure Shell Scripts in CodeBuild

```bash
#!/bin/bash
set -euo pipefail  # Exit on error, undefined variables, pipe failures

# >! Retrieve credentials from SSM
API_KEY=$(aws ssm get-parameter \
  --name /myapp/api/key \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text)

# >! Use quotes around variables to prevent word splitting
echo "Deploying to environment: ${ENVIRONMENT}"

# >! Validate input before use
if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: Invalid environment: ${ENVIRONMENT}"
  exit 1
fi

# >! Use arrays for command arguments (bash equivalent of execFile)
aws s3 cp \
  "${LOCAL_FILE}" \
  "s3://${BUCKET_NAME}/${OBJECT_KEY}"

# >! Clean up sensitive data
unset API_KEY
```

### Environment Variable Handling

#### What to Store in Environment Variables

**✅ Safe for Environment Variables:**
- Configuration values (table names, bucket names, regions)
- Feature flags
- Non-sensitive settings
- Resource identifiers

**❌ Never in Environment Variables:**
- API keys
- Database passwords
- OAuth tokens
- Private keys
- Any sensitive credentials

#### Example: Proper Environment Variable Usage

```javascript
// Lambda function configuration
export const handler = async (event) => {
  // ✅ Configuration from environment variables
  const config = {
    tableName: process.env.TABLE_NAME,
    bucketName: process.env.BUCKET_NAME,
    region: process.env.AWS_REGION,
    logLevel: process.env.LOG_LEVEL || 'info'
  };
  
  // ✅ Secrets from SSM/Secrets Manager
  const secrets = {
    apiKey: await getParameter('/myapp/api/key'),
    dbPassword: await getSecret('myapp/database/password')
  };
  
  // Use config and secrets
  // ...
};
```

### CI/CD Pipeline Security Checklist

- [ ] Use specific dependency versions (no `latest` or `*`)
- [ ] Retrieve credentials from SSM/Secrets Manager, not environment variables
- [ ] Validate all inputs before use
- [ ] Use least privilege IAM roles
- [ ] Clean up sensitive data after use
- [ ] Log security events to CloudWatch
- [ ] Use VPC endpoints for AWS service access (if in VPC)
- [ ] Enable CloudTrail logging for audit trail
- [ ] Scan dependencies for vulnerabilities (`npm audit`, `pip-audit`)
- [ ] Use signed commits and protected branches

---

## Security Comment Notation

### Overview

Security comments use special notation to make them easily identifiable in code reviews and audits. They explain the security rationale behind code decisions and help future maintainers understand why code is written a certain way.

### Notation by File Type

#### JavaScript/TypeScript: `// >!`

```javascript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// >! Use execFile to prevent shell interpretation
// >! Arguments passed as array are not interpreted by shell
await execFileAsync('node', ['--check', filePath]);
```

#### Python: `# >!`

```python
import subprocess

# >! Use subprocess.run with shell=False to prevent shell injection
# >! Arguments passed as list are not interpreted by shell
result = subprocess.run(
    ['node', '--check', file_path],
    shell=False,
    capture_output=True
)
```

#### YAML (CloudFormation, buildspec.yml): `# >!`

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      # >! Retrieve credentials from SSM, never hardcode
      - export API_KEY=$(aws ssm get-parameter --name /myapp/api/key --with-decryption --query 'Parameter.Value' --output text)
```

#### Bash Scripts: `# >!`

```bash
#!/bin/bash

# >! Use quotes around variables to prevent word splitting and globbing
echo "Processing file: ${FILE_PATH}"

# >! Validate input before use
if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: Invalid environment"
  exit 1
fi
```

#### Markdown Documentation: `>`

```markdown
> **Security Note**: Always use `execFile` instead of `exec` to prevent shell injection attacks. Pass arguments as an array, not as a template string.
```


### When to Use Security Comments

Use security comments in these situations:

#### 1. Preventing Known Vulnerabilities

```javascript
// >! Use execFile to prevent shell injection
await execFileAsync('node', ['--check', filePath]);
```

#### 2. Explaining Security Decisions

```javascript
// >! Cache credentials for 5 minutes to reduce SSM API calls
// >! Balance between security (short cache) and performance
if (cachedApiKey && Date.now() < cacheExpiry) {
  return cachedApiKey;
}
```

#### 3. Validating Input

```javascript
// >! Validate that path is within allowed directory to prevent directory traversal
const relativePath = path.relative(allowedDir, resolvedPath);
if (relativePath.startsWith('..')) {
  throw new Error('Path traversal detected');
}
```

#### 4. Handling Sensitive Data

```javascript
// >! Retrieve credentials from Secrets Manager at runtime
// >! Never hardcode credentials in source code
const dbPassword = await getSecret('myapp/database/password');
```

#### 5. Implementing Security Controls

```javascript
// >! Find closing bracket by counting bracket depth
// >! This prevents injection via unmatched brackets
let depth = 0;
for (let i = startPos; i < str.length; i++) {
  if (str[i] === '{') depth++;
  else if (str[i] === '}') {
    if (depth === 0) return i;
    depth--;
  }
}
```

#### 6. Explaining Why Unsafe Patterns Are Avoided

```javascript
// >! Don't use exec() here - it spawns a shell and interprets special characters
// >! Use execFile() instead to pass arguments directly to the executable
await execFileAsync('command', [arg1, arg2]);
```

### Security Comment Best Practices

1. **Be Specific**: Explain exactly what security issue is being prevented
2. **Be Concise**: Keep comments short and focused
3. **Reference Vulnerabilities**: Mention specific attack types (e.g., "shell injection", "directory traversal")
4. **Explain Alternatives**: If avoiding an unsafe pattern, mention what you're using instead
5. **Link to Documentation**: Reference this steering document or other security resources when appropriate


### Examples by Security Category

#### Shell Command Execution

```javascript
// >! Use execFile to prevent shell interpretation
// >! Arguments passed as array are not interpreted by shell
await execFileAsync('node', ['--check', userProvidedPath]);
```

#### Input Validation

```javascript
// >! Validate username format to prevent injection attacks
// >! Only allow alphanumeric characters, underscore, and dash
if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
  throw new Error('Invalid username format');
}
```

#### Credential Management

```javascript
// >! Retrieve API key from SSM Parameter Store
// >! Never hardcode credentials in source code or environment variables
const apiKey = await getParameter('/myapp/api/key');
```

#### Path Traversal Prevention

```javascript
// >! Normalize and resolve paths to prevent directory traversal
// >! Check that resolved path is within allowed directory
const resolvedPath = path.resolve(allowedDir, userPath);
const relativePath = path.relative(allowedDir, resolvedPath);
if (relativePath.startsWith('..')) {
  throw new Error('Path traversal detected');
}
```

#### Bracket Matching

```javascript
// >! Find closing bracket by counting bracket depth
// >! Handle nested brackets: {Array<{id: string}>}
let depth = 0;
for (let i = startPos; i < str.length; i++) {
  if (str[i] === '{') depth++;
  else if (str[i] === '}') {
    if (depth === 0) return i;
    depth--;
  }
}
```

#### Error Handling

```javascript
// >! Log full error for debugging but return sanitized error to client
// >! Don't expose internal implementation details or sensitive data
console.error('Database error:', error);
return { error: 'Internal server error', requestId };
```

### Searching for Security Comments

Use these commands to find all security comments in your codebase:

```bash
# Find all security comments in JavaScript/TypeScript
grep -r "// >!" src/ test/ scripts/

# Find all security comments in Python
grep -r "# >!" *.py **/*.py

# Find all security comments in YAML
grep -r "# >!" *.yml **/*.yml

# Find all security comments in any file
grep -r ">!" .
```

---

## Summary

This document establishes secure coding practices for the @63klabs/cache-data package. Key takeaways:

1. **Shell Commands**: Always use `execFile` (Node.js) or `subprocess.run` with `shell=False` (Python)
2. **Input Validation**: Use allowlisting, validate all user input before use
3. **String Handling**: Use bracket depth counting for nested structures, avoid unsafe regex
4. **Credentials**: Store in SSM Parameter Store or Secrets Manager, never hardcode
5. **Security Testing**: Write both unit tests and property-based tests for security properties
6. **Lambda/CI/CD**: Use least privilege IAM, validate inputs, clean up sensitive data
7. **Security Comments**: Use `// >!` (JS), `# >!` (Python/YAML), `>` (Markdown) to document security rationale

**Remember**: Security is not optional. Follow these practices consistently to protect against vulnerabilities.

For questions or clarifications, refer to the specific sections above or consult with the security team.
