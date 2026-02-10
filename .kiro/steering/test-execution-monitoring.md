# Test Execution Monitoring and Loop Prevention

## Purpose

This steering document establishes critical rules and monitoring practices to prevent infinite test loops and runaway test processes during local development. It ensures that tests execute efficiently without consuming excessive system resources or filling up disk space.

## Core Principle

**NEVER create tests that recursively execute the full test suite.** Tests that spawn child processes to run other tests MUST be carefully designed to avoid infinite loops and exponential process growth.

## Critical Rules for Test Execution

### Rule 1: No Recursive Test Suite Execution

**NEVER write tests that execute `npm test` or `npm run test:all` from within a test file.**

When a test file is part of the test suite (matched by `test/**/*-tests.mjs`), and that test file executes `npm test`, it creates an infinite loop:

```
npm test
  → runs test/migration/property/test-execution-equivalence-property-tests.mjs
    → executes npm test
      → runs test/migration/property/test-execution-equivalence-property-tests.mjs
        → executes npm test
          → ... (infinite loop)
```

**Bad Example** (causes infinite loop):
```javascript
// test/migration/property/test-execution-equivalence-property-tests.mjs
function runTests(testFile, framework) {
    const command = `npm test -- ${testFile}`;  // ❌ WRONG - runs full test suite
    execSync(command);
}
```

**Good Example** (runs specific test file directly):
```javascript
// test/migration/property/test-execution-equivalence-property-tests.mjs
function runTests(testFile, framework) {
    // ✅ CORRECT - runs mocha/jest directly on specific file
    const command = framework === 'mocha' 
        ? `./node_modules/.bin/mocha ${testFile}`
        : `node --experimental-vm-modules ./node_modules/jest/bin/jest.js ${testFile}`;
    execSync(command);
}
```

### Rule 2: Direct Test Runner Invocation

When tests need to execute other tests (e.g., for migration validation), they MUST:

1. **Invoke the test runner directly** (mocha or jest binary)
2. **Specify the exact test file** to run
3. **Never use npm scripts** that might trigger the full test suite

**Correct patterns:**
```javascript
// Run Mocha directly on specific file
execSync(`./node_modules/.bin/mocha test/endpoint/api-request-tests.mjs`);

// Run Jest directly on specific file
execSync(`node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/api-request-tests.jest.mjs`);
```

**Incorrect patterns:**
```javascript
// ❌ WRONG - runs full test suite
execSync(`npm test -- test/endpoint/api-request-tests.mjs`);

// ❌ WRONG - runs full test suite
execSync(`npm run test:jest -- test/endpoint/api-request-tests.jest.mjs`);
```

### Rule 3: Test File Naming Exclusions

If a test file MUST execute other tests, it should be excluded from the default test suite pattern:

**Option A: Use different file extension**
```javascript
// test/migration/validation/test-execution-validator.mjs
// Not matched by 'test/**/*-tests.mjs' pattern
```

**Option B: Place in excluded directory**
```javascript
// test/scripts/validate-migration.mjs
// Not in test/** pattern
```

**Option C: Explicit exclusion in test scripts**
```json
{
  "scripts": {
    "test": "mocha 'test/**/*-tests.mjs' --exclude 'test/migration/property/test-execution-equivalence-property-tests.mjs'"
  }
}
```

### Rule 4: Monitor Test Processes During Development

Before running tests that spawn child processes:

1. **Check for existing test processes:**
   ```bash
   ps aux | grep -E "(mocha|jest|node.*test)" | grep -v grep
   ```

2. **Monitor process count during test execution:**
   ```bash
   watch -n 1 'ps aux | grep -E "(mocha|jest)" | wc -l'
   ```

3. **Set a timeout for test execution:**
   ```bash
   timeout 60s npm test  # Kill after 60 seconds
   ```

4. **Kill runaway test processes immediately:**
   ```bash
   pkill -f "mocha.*test"
   pkill -f "jest.*test"
   ```

### Rule 5: Test Execution Timeouts

All tests that spawn child processes MUST have reasonable timeouts:

```javascript
it('Property 2: Test Execution Equivalence', { timeout: 120000 }, () => {
    // Test implementation with 2-minute timeout
});
```

**Timeout Guidelines:**
- Unit tests: 5 seconds (5000ms)
- Integration tests: 30 seconds (30000ms)
- Property-based tests: 60 seconds (60000ms)
- Tests that spawn child processes: 120 seconds (120000ms) maximum

### Rule 6: Limit Property Test Iterations

Property-based tests that spawn child processes MUST limit iterations:

```javascript
fc.assert(
    fc.property(
        fc.constantFrom(...modules),
        (module) => {
            // Test implementation
        }
    ),
    { numRuns: 3 } // ✅ CORRECT - limit to 3 runs for expensive tests
);
```

**Never use default numRuns (100) for tests that spawn child processes.**

## Detecting Infinite Loops

### Symptoms of Infinite Test Loops

1. **Exponentially growing process count:**
   ```bash
   ps aux | grep mocha | wc -l
   # Output: 50, 100, 200, 400... (doubling rapidly)
   ```

2. **High CPU usage across many processes:**
   ```bash
   top
   # Shows dozens of node/mocha processes at 50-100% CPU
   ```

3. **Disk space filling up rapidly:**
   ```bash
   df -h
   # /tmp or /var/tmp filling up with test artifacts
   ```

4. **Test execution never completes:**
   - Tests run for minutes without finishing
   - No test output or progress indicators

### Emergency Response

If you detect an infinite loop:

1. **Immediately kill all test processes:**
   ```bash
   pkill -9 -f "mocha"
   pkill -9 -f "jest"
   pkill -9 -f "node.*test"
   ```

2. **Verify all processes are killed:**
   ```bash
   ps aux | grep -E "(mocha|jest|node.*test)" | grep -v grep
   # Should return no results
   ```

3. **Check for orphaned processes:**
   ```bash
   ps aux | grep node | grep -v grep
   # Look for any remaining node processes
   ```

4. **Clean up temporary files:**
   ```bash
   rm -rf /tmp/jest_*
   rm -rf /tmp/mocha_*
   ```

## Safe Test Execution Patterns

### Pattern 1: Isolated Test File Execution

When validating test migration, run test files in isolation:

```javascript
function runTestFile(testFile, framework) {
    const command = framework === 'mocha'
        ? `./node_modules/.bin/mocha ${testFile}`
        : `node --experimental-vm-modules ./node_modules/jest/bin/jest.js ${testFile}`;
    
    return execSync(command, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000 // 30 second timeout per file
    });
}
```

### Pattern 2: Test Count Validation Without Execution

Instead of running tests, count test cases by parsing files:

```javascript
function countTests(testFile) {
    const content = fs.readFileSync(testFile, 'utf8');
    const itMatches = content.match(/\bit\(/g) || [];
    const testMatches = content.match(/\btest\(/g) || [];
    return itMatches.length + testMatches.length;
}
```

### Pattern 3: Subprocess Isolation for Validation Tests

If tests MUST execute other tests, use subprocess isolation:

```javascript
// test/scripts/validate-migration.mjs (NOT in test/** pattern)
import { execSync } from 'child_process';

function validateMigration() {
    // Run specific test files directly
    const mochaResult = execSync('./node_modules/.bin/mocha test/endpoint/api-request-tests.mjs');
    const jestResult = execSync('node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/endpoint/api-request-tests.jest.mjs');
    
    // Compare results
    return compareMochaAndJestResults(mochaResult, jestResult);
}
```

## Pre-Commit Checklist

Before committing tests that spawn child processes:

- [ ] Test does NOT execute `npm test` or `npm run test:all`
- [ ] Test invokes test runners directly (mocha/jest binaries)
- [ ] Test specifies exact test files to run
- [ ] Test has appropriate timeout (≤ 120 seconds)
- [ ] Property test has limited iterations (≤ 10 for expensive tests)
- [ ] Test file is excluded from default test suite if it executes other tests
- [ ] Verified test execution locally without infinite loops
- [ ] Monitored process count during test execution
- [ ] Confirmed test completes in reasonable time (< 2 minutes)

## Monitoring During Development

### Before Running Tests

```bash
# Check for existing test processes
ps aux | grep -E "(mocha|jest)" | grep -v grep

# If any exist, kill them
pkill -f "mocha"
pkill -f "jest"
```

### During Test Execution

```bash
# In a separate terminal, monitor process count
watch -n 1 'ps aux | grep -E "(mocha|jest)" | wc -l'

# If count exceeds 10, investigate immediately
# If count keeps growing, kill all test processes
```

### After Test Execution

```bash
# Verify all test processes completed
ps aux | grep -E "(mocha|jest)" | grep -v grep

# Clean up any orphaned processes
pkill -f "mocha"
pkill -f "jest"
```

## AI Assistant Guidelines

When creating or modifying tests:

1. **ALWAYS check if test spawns child processes** (execSync, spawn, exec)
2. **NEVER use npm scripts** in tests that spawn child processes
3. **ALWAYS use direct test runner invocation** (mocha/jest binaries)
4. **ALWAYS set timeouts** for tests that spawn child processes
5. **ALWAYS limit property test iterations** for expensive tests
6. **ALWAYS exclude from default test suite** if test executes other tests
7. **ALWAYS verify locally** before committing
8. **ALWAYS monitor process count** during test execution

## Known Issues and Fixes

### Issue: test-execution-equivalence-property-tests.mjs Infinite Loop

**Problem:** Test file uses `npm test -- ${testFile}` which causes infinite loop.

**Fix:** Change to direct test runner invocation:

```javascript
// Before (WRONG):
const command = `npm test -- ${testFile}`;

// After (CORRECT):
const command = framework === 'mocha'
    ? `./node_modules/.bin/mocha ${testFile}`
    : `node --experimental-vm-modules ./node_modules/jest/bin/jest.js ${testFile}`;
```

**Alternative:** Exclude from default test suite:

```json
{
  "scripts": {
    "test": "mocha 'test/**/*-tests.mjs' --exclude 'test/migration/property/test-execution-equivalence-property-tests.mjs'",
    "test:migration:validation": "mocha test/migration/property/test-execution-equivalence-property-tests.mjs"
  }
}
```

## Additional Guardrails

### Resource Limits

#### Memory Limits for Tests

Set memory limits to prevent tests from consuming all system memory:

```json
{
  "scripts": {
    "test": "node --max-old-space-size=2048 ./node_modules/.bin/mocha 'test/**/*-tests.mjs'",
    "test:jest": "node --max-old-space-size=2048 --experimental-vm-modules node_modules/jest/bin/jest.js"
  }
}
```

**Recommended limits:**
- Unit tests: 512MB (`--max-old-space-size=512`)
- Integration tests: 1024MB (`--max-old-space-size=1024`)
- Property-based tests: 2048MB (`--max-old-space-size=2048`)

#### Disk Space Monitoring

Before running tests that generate artifacts:

```bash
# Check available disk space
df -h | grep -E "/$|/tmp"

# Minimum 1GB free space recommended
# If less, clean up before running tests
```

#### Process Limits

Set ulimit to prevent fork bombs:

```bash
# Limit number of processes per user
ulimit -u 1000

# Run tests
npm test
```

### Test Isolation Guardrails

#### Global State Pollution

**Problem:** Tests that modify global state can affect other tests.

**Solution:** Always restore global state in afterEach:

```javascript
describe('Tests that modify globals', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Save original state
        originalEnv = { ...process.env };
    });
    
    afterEach(() => {
        // Restore original state
        process.env = originalEnv;
        jest.restoreAllMocks();
    });
});
```

#### File System Pollution

**Problem:** Tests that create files can leave artifacts.

**Solution:** Use temporary directories and clean up:

```javascript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Tests that create files', () => {
    let tempDir;
    
    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    });
    
    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
```

#### Network Pollution

**Problem:** Tests that make real network requests can be slow and flaky.

**Solution:** Mock network requests or use test servers:

```javascript
// Mock HTTP requests
beforeEach(() => {
    jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        // Return mock response
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});
```

### Parallel Test Execution Guardrails

#### Race Conditions

**Problem:** Tests running in parallel can interfere with each other.

**Solution:** Use test isolation or sequential execution for problematic tests:

```javascript
// Mocha: Run specific tests sequentially
describe('Sequential tests', function() {
    this.timeout(60000);
    
    it.skip('test 1', async () => { /* ... */ });
    it.skip('test 2', async () => { /* ... */ });
});

// Jest: Disable parallel execution for specific files
// Add to jest.config.mjs
export default {
    maxWorkers: 1, // Run tests sequentially
    // Or use test.concurrent.skip() for specific tests
};
```

#### Shared Resource Conflicts

**Problem:** Multiple tests accessing the same resource (file, port, database).

**Solution:** Use unique identifiers or locks:

```javascript
// Use unique ports for each test
const getUniquePort = () => 3000 + Math.floor(Math.random() * 1000);

// Use unique file names
const getUniqueFileName = () => `test-${Date.now()}-${Math.random()}.txt`;
```

### CI/CD Specific Guardrails

#### GitHub Actions Timeout

Set job-level timeouts to prevent hanging builds:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15  # Kill job after 15 minutes
    steps:
      - name: Run tests
        run: timeout 600s npm run test:all  # 10 minute timeout
```

#### AWS CodeBuild Timeout and Resource Limits

**CRITICAL:** CodeBuild has specific timeout and resource constraints that must be configured.

**buildspec.yml Configuration:**

```yaml
version: 0.2

# Set build timeout (max 480 minutes, but use much less for tests)
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - echo "Installing dependencies..."
      - npm ci
      
  pre_build:
    commands:
      # Health check before running tests
      - echo "Checking system resources..."
      - df -h
      - free -h
      - ulimit -a
      
      # Kill any existing test processes (shouldn't exist, but safety check)
      - pkill -9 -f "mocha" || true
      - pkill -9 -f "jest" || true
      
      # Set resource limits
      - ulimit -u 1000  # Limit processes to prevent fork bombs
      - ulimit -n 4096  # Increase file descriptors for parallel tests
      
  build:
    commands:
      # Run tests with timeout protection
      - echo "Running test suite with timeout protection..."
      - timeout 600s npm run test:all || exit 1
      
  post_build:
    commands:
      # Always cleanup, even if tests fail
      - echo "Cleaning up test artifacts..."
      - pkill -9 -f "mocha" || true
      - pkill -9 -f "jest" || true
      - rm -rf /tmp/jest_* || true
      - rm -rf /tmp/mocha_* || true
      - rm -rf coverage/ || true
      
      # Report final status
      - echo "Test execution completed"
      - df -h
      - free -h

# Artifacts to preserve (optional)
artifacts:
  files:
    - 'coverage/**/*'
    - 'test-results/**/*'
  name: test-results-$(date +%Y%m%d-%H%M%S)

# Cache dependencies for faster builds
cache:
  paths:
    - 'node_modules/**/*'

# Build timeout (in minutes) - CRITICAL
# Set this in CodeBuild project settings or here
# Recommended: 15 minutes for test execution
# Maximum: 480 minutes (8 hours)
```

**CodeBuild Project Configuration (via CloudFormation/Console):**

```yaml
# CloudFormation example
Resources:
  TestCodeBuildProject:
    Type: AWS::CodeBuild::Project
    Properties:
      Name: npm-package-tests
      TimeoutInMinutes: 15  # CRITICAL: Set timeout
      QueuedTimeoutInMinutes: 30  # Timeout for queued builds
      
      Environment:
        Type: LINUX_CONTAINER
        ComputeType: BUILD_GENERAL1_SMALL  # Or MEDIUM for more resources
        Image: aws/codebuild/standard:7.0
        EnvironmentVariables:
          - Name: NODE_OPTIONS
            Value: "--max-old-space-size=2048"  # Limit Node.js memory
          - Name: CI
            Value: "true"
          - Name: AWS_REGION
            Value: !Ref AWS::Region
            
      Source:
        Type: GITHUB  # or CODECOMMIT, S3, etc.
        BuildSpec: buildspec.yml
        
      # Enable CloudWatch Logs for debugging
      LogsConfig:
        CloudWatchLogs:
          Status: ENABLED
          GroupName: /aws/codebuild/npm-package-tests
```

**CodeBuild-Specific Protections:**

1. **Build Timeout Protection:**
   ```yaml
   # In buildspec.yml
   phases:
     build:
       commands:
         # Use timeout command as additional safety
         - timeout 600s npm run test:all || exit 1
   ```

2. **Process Monitoring in CodeBuild:**
   ```yaml
   phases:
     build:
       commands:
         # Monitor process count during tests
         - |
           npm run test:all &
           TEST_PID=$!
           while kill -0 $TEST_PID 2>/dev/null; do
             PROCESS_COUNT=$(ps aux | grep -E "(mocha|jest)" | grep -v grep | wc -l)
             if [ $PROCESS_COUNT -gt 20 ]; then
               echo "ERROR: Too many test processes detected ($PROCESS_COUNT)"
               pkill -9 -f "mocha"
               pkill -9 -f "jest"
               exit 1
             fi
             sleep 5
           done
           wait $TEST_PID
   ```

3. **Memory Monitoring:**
   ```yaml
   phases:
     build:
       commands:
         # Check memory before tests
         - |
           AVAILABLE_MEM=$(free -m | awk 'NR==2{print $7}')
           if [ $AVAILABLE_MEM -lt 500 ]; then
             echo "ERROR: Insufficient memory available: ${AVAILABLE_MEM}MB"
             exit 1
           fi
         - npm run test:all
   ```

4. **Disk Space Monitoring:**
   ```yaml
   phases:
     pre_build:
       commands:
         # Check disk space before tests
         - |
           DISK_USAGE=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
           if [ $DISK_USAGE -gt 80 ]; then
             echo "ERROR: Disk usage too high: ${DISK_USAGE}%"
             exit 1
           fi
   ```

5. **Automatic Cleanup on Failure:**
   ```yaml
   phases:
     post_build:
       commands:
         # Always run cleanup, even on failure
         - |
           echo "Performing cleanup..."
           pkill -9 -f "mocha" || true
           pkill -9 -f "jest" || true
           rm -rf /tmp/jest_* /tmp/mocha_* coverage/ || true
           
           # Report resource usage
           echo "Final resource usage:"
           df -h /
           free -h
           ps aux | grep -E "(mocha|jest)" | grep -v grep || echo "No test processes running"
   ```

**CodeBuild Environment Variables:**

Set these in your CodeBuild project:

```bash
NODE_OPTIONS="--max-old-space-size=2048"
CI="true"
AWS_REGION="us-east-1"  # Or your region
DISABLE_MOCKS="false"  # Set to true to test without mocks
LOG_LEVEL="3"  # Reduce logging in CI
```

**CodeBuild Compute Type Recommendations:**

- **BUILD_GENERAL1_SMALL** (3 GB RAM, 2 vCPUs): Basic unit tests
- **BUILD_GENERAL1_MEDIUM** (7 GB RAM, 4 vCPUs): Integration tests, property-based tests
- **BUILD_GENERAL1_LARGE** (15 GB RAM, 8 vCPUs): Heavy test suites with parallel execution

**CodeBuild-Specific Issues:**

1. **Container Reuse:** CodeBuild may reuse containers, so always clean up:
   ```yaml
   pre_build:
     commands:
       - pkill -9 -f "mocha" || true
       - pkill -9 -f "jest" || true
   ```

2. **Network Timeouts:** CodeBuild has network timeouts, mock external services:
   ```javascript
   if (process.env.CI === 'true') {
       // Use mocks in CI
       jest.mock('./external-service');
   }
   ```

3. **Build Logs:** Enable CloudWatch Logs to debug infinite loops:
   ```yaml
   LogsConfig:
     CloudWatchLogs:
       Status: ENABLED
       StreamName: test-execution
   ```

#### Retry Logic for Flaky Tests

**Problem:** Network-dependent tests can be flaky in CI.

**Solution:** Add retry logic:

```javascript
// Mocha: Use mocha-retry
describe('Flaky tests', function() {
    this.retries(2); // Retry up to 2 times
    
    it('might fail due to network', async () => {
        // Test implementation
    });
});

// Jest: Use jest-retry
jest.retryTimes(2);
```

#### Artifact Cleanup in CI

Ensure CI cleans up test artifacts:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm run test:all

- name: Cleanup test artifacts
  if: always()
  run: |
    rm -rf /tmp/jest_*
    rm -rf /tmp/mocha_*
    rm -rf coverage/
```

### Property-Based Testing Specific Guardrails

#### Seed Preservation for Reproducibility

**Problem:** Failed property tests with random seeds are hard to reproduce.

**Solution:** Log and preserve seeds:

```javascript
fc.assert(
    fc.property(
        fc.integer(),
        (value) => {
            // Test implementation
        }
    ),
    { 
        numRuns: 100,
        seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now(),
        verbose: true // Show seed on failure
    }
);
```

**Reproduce failures:**
```bash
FC_SEED=1234567890 npm test -- test/property/my-test.mjs
```

#### Shrinking Timeout

**Problem:** Property test shrinking can take too long.

**Solution:** Limit shrinking iterations:

```javascript
fc.assert(
    fc.property(
        fc.array(fc.integer()),
        (arr) => {
            // Test implementation
        }
    ),
    { 
        numRuns: 100,
        endOnFailure: true, // Stop on first failure
        maxSkipsPerRun: 100 // Limit shrinking attempts
    }
);
```

### Mock and Stub Guardrails

#### Mock Leakage Prevention

**Problem:** Mocks from one test affecting other tests.

**Solution:** Always restore mocks:

```javascript
describe('Tests with mocks', () => {
    afterEach(() => {
        // Jest
        jest.restoreAllMocks();
        jest.clearAllMocks();
        
        // Sinon
        sinon.restore();
    });
});
```

#### Mock Verification

**Problem:** Mocks that don't match actual implementation.

**Solution:** Periodically run tests without mocks:

```bash
# Run tests with real implementations
DISABLE_MOCKS=true npm test
```

### Test Data Guardrails

#### Sensitive Data in Tests

**Problem:** Accidentally committing real credentials or PII.

**Solution:** Use environment variables and .env.test:

```javascript
// ❌ WRONG - hardcoded credentials
const apiKey = 'sk-real-api-key-12345';

// ✅ CORRECT - use environment variables
const apiKey = process.env.TEST_API_KEY || 'test-api-key';
```

**Add to .gitignore:**
```
.env.test
.env.local
test-credentials.json
```

#### Test Data Size Limits

**Problem:** Large test data slowing down tests.

**Solution:** Limit test data size:

```javascript
// ❌ WRONG - testing with huge arrays
const testData = Array(1000000).fill(0);

// ✅ CORRECT - use representative sample
const testData = Array(100).fill(0);
```

### Debugging Guardrails

#### Debug Mode for Troubleshooting

Add debug mode that provides more information:

```json
{
  "scripts": {
    "test:debug": "LOG_LEVEL=5 node --inspect-brk ./node_modules/.bin/mocha 'test/**/*-tests.mjs'",
    "test:verbose": "npm test -- --reporter spec --verbose"
  }
}
```

#### Test Execution Logging

Log test execution for debugging:

```javascript
// Add to test setup
beforeEach(function() {
    console.log(`\n▶ Running: ${this.currentTest.title}`);
});

afterEach(function() {
    const status = this.currentTest.state === 'passed' ? '✓' : '✗';
    console.log(`${status} Completed: ${this.currentTest.title}`);
});
```

### Performance Guardrails

#### Test Execution Time Monitoring

Track slow tests:

```javascript
// Mocha: Use slow threshold
describe('Performance tests', function() {
    this.slow(1000); // Warn if test takes > 1 second
    
    it('should be fast', () => {
        // Test implementation
    });
});

// Jest: Use custom reporter
// jest.config.mjs
export default {
    reporters: [
        'default',
        ['jest-slow-test-reporter', { numTests: 10, warnOnSlowerThan: 1000 }]
    ]
};
```

#### Memory Leak Detection

Monitor memory usage during tests:

```javascript
describe('Memory leak tests', () => {
    it('should not leak memory', () => {
        const before = process.memoryUsage().heapUsed;
        
        // Run operation that might leak
        for (let i = 0; i < 1000; i++) {
            // Test implementation
        }
        
        global.gc(); // Requires --expose-gc flag
        const after = process.memoryUsage().heapUsed;
        const leaked = after - before;
        
        expect(leaked).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
});
```

**Run with:**
```bash
node --expose-gc ./node_modules/.bin/mocha test/memory-tests.mjs
```

### Documentation Guardrails

#### Test Documentation Requirements

All complex tests should include:

```javascript
/**
 * Test: User authentication flow
 * 
 * Purpose: Verify that users can authenticate with valid credentials
 * 
 * Setup:
 * - Mock authentication service
 * - Create test user with known credentials
 * 
 * Teardown:
 * - Restore authentication service
 * - Clear test user data
 * 
 * Known Issues:
 * - May fail if authentication service is down
 * - Requires network access in integration mode
 * 
 * Related Tests:
 * - test/auth/login-tests.mjs
 * - test/auth/logout-tests.mjs
 */
describe('User authentication', () => {
    // Test implementation
});
```

#### Test Failure Documentation

Document known test failures:

```javascript
// Known issue: This test fails intermittently due to timing
// See: https://github.com/org/repo/issues/123
it.skip('flaky test that needs fixing', () => {
    // Test implementation
});
```

## Summary

**Key Takeaways:**

1. **Never execute npm test from within a test file** - causes infinite loops
2. **Always use direct test runner invocation** - mocha/jest binaries
3. **Always monitor process count** during test execution
4. **Always set timeouts** for tests that spawn child processes
5. **Always limit property test iterations** for expensive tests
6. **Always restore mocks and global state** in afterEach
7. **Always clean up file system artifacts** after tests
8. **Always use memory limits** to prevent resource exhaustion
9. **Always preserve property test seeds** for reproducibility
10. **Kill runaway processes immediately** - don't wait for them to finish

**Emergency Command:**
```bash
pkill -9 -f "mocha" && pkill -9 -f "jest" && pkill -9 -f "node.*test"
```

Use this command immediately if you detect an infinite loop.

**Health Check Command:**
```bash
# Check test health before running
ps aux | grep -E "(mocha|jest)" | grep -v grep && echo "⚠️  Tests already running!" || echo "✓ Ready to run tests"
df -h | grep -E "/$" | awk '{if ($5+0 > 90) print "⚠️  Disk space low: " $5; else print "✓ Disk space OK: " $5}'
```
