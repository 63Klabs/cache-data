# Design Document: Test Migration Phase 6

## Overview

This design document specifies the technical approach for completing the migration of the @63klabs/cache-data test suite from Mocha to Jest. Phase 6 represents the final migration phase, covering the remaining 38 Mocha test files (67% of the original test suite) and removing Mocha as a dependency once migration is complete and validated.

### Scope

This phase migrates the following test categories:

**Root Level** (1 file):
- `test/index-tests.mjs` → `test/index-tests.jest.mjs`

**Cache Module** (13 files):
- `test/cache/cache-tests.mjs` → `test/cache/cache-tests.jest.mjs`
- `test/cache/cache-backwards-compatibility-property-tests.mjs` → `test/cache/cache-backwards-compatibility-property-tests.jest.mjs`
- `test/cache/cache-feature-flag-tests.mjs` → `test/cache/cache-feature-flag-tests.jest.mjs`
- `test/cache/cache-getheader-passthrough-property-tests.mjs` → `test/cache/cache-getheader-passthrough-property-tests.jest.mjs`
- `test/cache/cache-getheader-property-tests.mjs` → `test/cache/cache-getheader-property-tests.jest.mjs`
- `test/cache/cache-getheader-unit-tests.mjs` → `test/cache/cache-getheader-unit-tests.jest.mjs`
- `test/cache/cache-header-assignment-integration-tests.mjs` → `test/cache/cache-header-assignment-integration-tests.jest.mjs`
- `test/cache/cache-header-assignment-property-tests.mjs` → `test/cache/cache-header-assignment-property-tests.jest.mjs`
- `test/cache/cache-header-sanitization-tests.mjs` → `test/cache/cache-header-sanitization-tests.jest.mjs`
- `test/cache/cache-isvalidheadervalue-property-tests.mjs` → `test/cache/cache-isvalidheadervalue-property-tests.jest.mjs`
- `test/cache/cache-isvalidheadervalue-unit-tests.mjs` → `test/cache/cache-isvalidheadervalue-unit-tests.jest.mjs`
- `test/cache/cache-validation-tests.mjs` → `test/cache/cache-validation-tests.jest.mjs`
- `test/cache/in-memory-cache/property/Cache-integration-property-tests.mjs` → `test/cache/in-memory-cache/property/Cache-integration-property-tests.jest.mjs`

**Cache In-Memory** (3 additional files):
- `test/cache/in-memory-cache/property/InMemoryCache-property-tests.mjs` → `test/cache/in-memory-cache/property/InMemoryCache-property-tests.jest.mjs`
- `test/cache/in-memory-cache/unit/InMemoryCache-basic-tests.mjs` → `test/cache/in-memory-cache/unit/InMemoryCache-basic-tests.jest.mjs`
- `test/cache/in-memory-cache/unit/InMemoryCache-constructor-tests.mjs` → `test/cache/in-memory-cache/unit/InMemoryCache-constructor-tests.jest.mjs`

**Config Module** (3 files):
- `test/config/config-getConnCacheProfile-tests.mjs` → `test/config/config-getConnCacheProfile-tests.jest.mjs`
- `test/config/connections-property-tests.mjs` → `test/config/connections-property-tests.jest.mjs`
- `test/config/connections-unit-tests.mjs` → `test/config/connections-unit-tests.jest.mjs`

**Documentation** (12 files):
- `test/documentation/property/backwards-compatibility-documentation-property-tests.mjs` → `test/documentation/property/backwards-compatibility-documentation-property-tests.jest.mjs`
- `test/documentation/property/documentation-link-validity-property-tests.mjs` → `test/documentation/property/documentation-link-validity-property-tests.jest.mjs`
- `test/documentation/property/example-code-validation-property-tests.mjs` → `test/documentation/property/example-code-validation-property-tests.jest.mjs`
- `test/documentation/property/executable-example-validation-property-tests.mjs` → `test/documentation/property/executable-example-validation-property-tests.jest.mjs`
- `test/documentation/property/feature-documentation-coverage-property-tests.mjs` → `test/documentation/property/feature-documentation-coverage-property-tests.jest.mjs`
- `test/documentation/property/jsdoc-completeness-property-tests.mjs` → `test/documentation/property/jsdoc-completeness-property-tests.jest.mjs`
- `test/documentation/property/jsdoc-hallucination-detection-property-tests.mjs` → `test/documentation/property/jsdoc-hallucination-detection-property-tests.jest.mjs`
- `test/documentation/property/jsdoc-return-type-format-property-tests.mjs` → `test/documentation/property/jsdoc-return-type-format-property-tests.jest.mjs`
- `test/documentation/property/jsdoc-throws-completeness-property-tests.mjs` → `test/documentation/property/jsdoc-throws-completeness-property-tests.jest.mjs`
- `test/documentation/property/module-documentation-completeness-property-tests.mjs` → `test/documentation/property/module-documentation-completeness-property-tests.jest.mjs`
- `test/documentation/property/readme-feature-coverage-property-tests.mjs` → `test/documentation/property/readme-feature-coverage-property-tests.jest.mjs`
- `test/documentation/property/test-documentation-property-tests.mjs` → `test/documentation/property/test-documentation-property-tests.jest.mjs`

**Migration Validation** (2 files):
- `test/migration/property/test-execution-equivalence-property-tests.mjs` → `test/migration/property/test-execution-equivalence-property-tests.jest.mjs`
- `test/migration/property/test-migration-completeness-property-tests.mjs` → `test/migration/property/test-migration-completeness-property-tests.jest.mjs`

**Security** (4 files):
- `test/security/jsdoc-parser-security-tests.mjs` → `test/security/jsdoc-parser-security-tests.jest.mjs`
- `test/security/shell-command-security-tests.mjs` → `test/security/shell-command-security-tests.jest.mjs`
- `test/security/property/jsdoc-parsing-property-tests.mjs` → `test/security/property/jsdoc-parsing-property-tests.jest.mjs`
- `test/security/property/shell-injection-prevention-property-tests.mjs` → `test/security/property/shell-injection-prevention-property-tests.jest.mjs`

### Goals

1. Migrate all 38 remaining Mocha test files to Jest format
2. Maintain test coverage and quality throughout migration
3. Ensure all Jest tests pass successfully
4. Validate no breaking changes introduced
5. Remove Mocha, Chai, and Sinon dependencies after validation
6. Update CI/CD configuration to run Jest only
7. Update documentation to reflect Jest-only testing

### Non-Goals

- Modifying source code functionality
- Refactoring source code
- Adding new features
- Changing public APIs
- Migrating tests outside the 38 files in scope

## Architecture

### Migration Strategy

Phase 6 follows the established parallel testing approach from phases 4 and 5, with an additional final step to remove Mocha:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Migration Period                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: Migrate Tests (Parallel Testing)                       │
│  ├─ Mocha Tests (Legacy)        Jest Tests (New)                │
│  ├─ 38 *-tests.mjs files        38 *.jest.mjs files             │
│  └─ npm test                     npm run test:jest               │
│                                                                   │
│  Step 2: Validate Migration                                      │
│  ├─ Run both test suites: npm run test:all                      │
│  ├─ Verify test count equivalence                               │
│  ├─ Verify no breaking changes                                  │
│  └─ Verify test coverage maintained                             │
│                                                                   │
│  Step 3: Remove Mocha (Final Step)                              │
│  ├─ Delete all *-tests.mjs files                                │
│  ├─ Remove Mocha from package.json devDependencies              │
│  ├─ Remove Chai from package.json devDependencies               │
│  ├─ Remove Sinon from package.json devDependencies              │
│  ├─ Update npm test script to run Jest                          │
│  ├─ Remove test:all script (no longer needed)                   │
│  ├─ Update CI/CD to run Jest only                               │
│  └─ Update documentation                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Test File Organization

The migration maintains the existing directory structure:

```
test/
├── index-tests.jest.mjs                    (Root level)
├── cache/
│   ├── cache-tests.jest.mjs
│   ├── cache-backwards-compatibility-property-tests.jest.mjs
│   ├── cache-feature-flag-tests.jest.mjs
│   ├── cache-getheader-*.jest.mjs (3 files)
│   ├── cache-header-*.jest.mjs (3 files)
│   ├── cache-isvalidheadervalue-*.jest.mjs (2 files)
│   ├── cache-validation-tests.jest.mjs
│   └── in-memory-cache/
│       ├── property/
│       │   ├── Cache-integration-property-tests.jest.mjs
│       │   └── InMemoryCache-property-tests.jest.mjs
│       └── unit/
│           ├── InMemoryCache-basic-tests.jest.mjs
│           └── InMemoryCache-constructor-tests.jest.mjs
├── config/
│   ├── config-getConnCacheProfile-tests.jest.mjs
│   ├── connections-property-tests.jest.mjs
│   └── connections-unit-tests.jest.mjs
├── documentation/
│   └── property/
│       └── [12 property test files].jest.mjs
├── migration/
│   └── property/
│       ├── test-execution-equivalence-property-tests.jest.mjs
│       └── test-migration-completeness-property-tests.jest.mjs
└── security/
    ├── jsdoc-parser-security-tests.jest.mjs
    ├── shell-command-security-tests.jest.mjs
    └── property/
        ├── jsdoc-parsing-property-tests.jest.mjs
        └── shell-injection-prevention-property-tests.jest.mjs
```

## Components and Interfaces

### Module 1: Root Level Test Migration

**Source Module**: `src/index.js`

**Test File**: `test/index-tests.mjs` → `test/index-tests.jest.mjs`

**Test Coverage**:
- Verify main entry point exports
- Test tools module export
- Test cache module export
- Test endpoint module export

**Migration Considerations**:
- Simple test file with basic export validation
- No complex mocking required
- Straightforward assertion conversion

### Module 2: Cache Module Test Migration

**Source Modules**: `src/lib/dao-cache.js`, `src/lib/utils/InMemoryCache.js`

**Test Files** (13 files):
- Core cache tests
- Backwards compatibility property tests
- Feature flag tests
- Header handling tests (getHeader, assignment, sanitization, validation)
- Integration tests
- In-memory cache tests

**Test Coverage**:
- Cache initialization and configuration
- S3 and DynamoDB storage operations
- Cache data encryption and decryption
- Header handling and validation
- In-memory cache operations
- Cache expiration logic
- Backwards compatibility

**Migration Considerations**:
- Complex mocking of AWS services (S3, DynamoDB)
- Property-based tests with fast-check
- Integration tests requiring multiple components
- Subprocess isolation for validation tests
- Careful handling of Cache.init() singleton pattern

**Key Testing Patterns**:
```javascript
// Mock AWS services
import { jest } from '@jest/globals';

const tools = await import('../../src/lib/tools/index.js');

jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
  client: {},
  get: jest.fn().mockResolvedValue({ Item: {...} }),
  put: jest.fn(),
  scan: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  sdk: {}
});
```

### Module 3: Config Module Test Migration

**Source Modules**: `src/lib/tools/Connections.classes.js`

**Test Files** (3 files):
- Connection cache profile tests
- Connection property tests
- Connection unit tests

**Test Coverage**:
- Connection configuration
- Cache profile retrieval
- Connection properties (parameters, headers, body)
- Promise handling in connections
- Authentication handling

**Migration Considerations**:
- Promise handling tests
- Complex object structures
- Nested property access
- Configuration validation

### Module 4: Documentation Test Migration

**Source**: Documentation validation tests

**Test Files** (12 files):
- All property-based documentation validation tests

**Test Coverage**:
- JSDoc completeness and accuracy
- JSDoc hallucination detection
- Documentation link validity
- Example code validation
- Feature documentation coverage
- README coverage
- Backwards compatibility documentation

**Migration Considerations**:
- File system operations (reading source files)
- JSDoc parsing
- Link validation (may require network access)
- Code execution for example validation
- Large test suites with many iterations

**Key Testing Patterns**:
```javascript
// File system operations
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// JSDoc parsing
import { parseJSDoc } from '../helpers/jsdoc-parser.mjs';

// Property-based testing
import fc from 'fast-check';

it('Property: JSDoc completeness', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...sourceFiles),
      (file) => {
        const content = readFileSync(file, 'utf8');
        const jsdoc = parseJSDoc(content);
        // Validate completeness
        return jsdoc.isComplete;
      }
    ),
    { numRuns: 100 }
  );
});
```

### Module 5: Migration Validation Test Migration

**Source**: Test migration validation logic

**Test Files** (2 files):
- Test execution equivalence property tests
- Test migration completeness property tests

**Test Coverage**:
- Validate Mocha and Jest produce equivalent results
- Validate all Mocha tests have Jest equivalents
- Validate test count consistency
- Validate migration completeness

**Migration Considerations**:
- **CRITICAL**: These tests execute other tests using subprocess isolation
- Must use direct test runner invocation (not npm scripts)
- Must avoid infinite loops
- Must update to use Jest test runner for Jest tests
- Requires careful handling of test execution

**Key Testing Patterns**:
```javascript
import { execFileSync } from 'child_process';

function runMochaTest(testFile) {
  return execFileSync(
    './node_modules/.bin/mocha',
    [testFile],
    { encoding: 'utf8' }
  );
}

function runJestTest(testFile) {
  return execFileSync(
    'node',
    ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', testFile],
    { encoding: 'utf8' }
  );
}
```

### Module 6: Security Test Migration

**Source**: Security validation tests

**Test Files** (4 files):
- JSDoc parser security tests
- Shell command security tests
- JSDoc parsing property tests
- Shell injection prevention property tests

**Test Coverage**:
- JSDoc parser security (bracket matching, nested structures)
- Shell command injection prevention
- Input validation
- Safe command execution patterns

**Migration Considerations**:
- Security-critical tests
- Shell command execution tests
- Property-based security testing
- Validation of security properties

**Key Testing Patterns**:
```javascript
import { execFileSync } from 'child_process';

it('should prevent shell injection', () => {
  const maliciousInput = '/tmp/test.js; rm -rf /';
  
  // Should not execute the rm command
  expect(() => {
    execFileSync('node', ['--check', maliciousInput]);
  }).toThrow();
  
  // Verify no shell interpretation occurred
  expect(fs.existsSync('/')).toBe(true);
});
```

## Data Models

### Test File Mapping

| Category | Mocha Files | Jest Files | Status |
|----------|-------------|------------|--------|
| Root | 1 | 1 | New |
| Cache | 13 | 13 | New |
| Cache In-Memory | 3 | 3 | New |
| Config | 3 | 3 | New |
| Documentation | 12 | 12 | New |
| Migration | 2 | 2 | New |
| Security | 4 | 4 | New |
| **Total** | **38** | **38** | **New** |

### Assertion Conversion Reference

Following established patterns from phases 4 and 5:

| Mocha/Chai | Jest | Use Case |
|------------|------|----------|
| `expect(x).to.equal(y)` | `expect(x).toBe(y)` | Primitive equality |
| `expect(x).to.deep.equal(y)` | `expect(x).toEqual(y)` | Object equality |
| `expect(x).to.not.equal(y)` | `expect(x).not.toBe(y)` | Inequality |
| `expect(x).to.be.true` | `expect(x).toBe(true)` | Boolean |
| `expect(x).to.be.null` | `expect(x).toBeNull()` | Null check |
| `expect(x).to.be.undefined` | `expect(x).toBeUndefined()` | Undefined check |
| `expect(arr).to.have.lengthOf(n)` | `expect(arr).toHaveLength(n)` | Array length |
| `expect(x).to.be.greaterThan(y)` | `expect(x).toBeGreaterThan(y)` | Comparison |
| `expect(str).to.include(substr)` | `expect(str).toContain(substr)` | String contains |
| `expect(fn).to.throw()` | `expect(fn).toThrow()` | Error throwing |

### Mock Conversion Reference

| Mocha/Sinon | Jest | Use Case |
|-------------|------|----------|
| `sinon.stub(obj, 'method')` | `jest.spyOn(obj, 'method').mockImplementation()` | Method stub |
| `sinon.restore()` | `jest.restoreAllMocks()` | Restore all |
| `stub.called` | `mockFn.mock.calls.length > 0` | Check called |
| `stub.getCall(0).args[0]` | `mockFn.mock.calls[0][0]` | Get arguments |

### Migration Priority Order

Based on complexity and dependencies:

1. **Root Level** (1 file) - Simplest, no dependencies
2. **Config Module** (3 files) - Low complexity, well-isolated
3. **Security** (4 files) - Critical but isolated
4. **Cache In-Memory** (3 files) - Isolated subsystem
5. **Cache Module** (13 files) - Complex, core functionality
6. **Documentation** (12 files) - Large but independent
7. **Migration** (2 files) - Self-referential, migrate last

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing the acceptance criteria, I identified the following properties and their relationships:

**Consolidation Opportunities**:
- Properties 1.2 and 1.3 both validate migration completeness and equivalence - can be combined
- Properties 2.7 and 10.4 both validate coverage preservation - can be combined
- Properties 10.1, 10.2, and 10.3 all relate to regression detection - can be combined

**Final Property Set**:
The following properties provide comprehensive validation without redundancy.

### Property 1: Test Migration Completeness

*For any* Mocha test file in the test suite, there exists a corresponding Jest test file with equivalent test coverage.

**Validates: Requirements 1.2, 1.3, 2.7**

**Rationale**: This property ensures that every Mocha test has been successfully migrated to Jest with the same test cases and functionality. It validates both the presence of Jest tests and their equivalence to Mocha tests.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.constantFrom(...mochaTestFiles),
    (mochaFile) => {
      const jestFile = mochaFile.replace('-tests.mjs', '-tests.jest.mjs');
      
      // Verify Jest file exists
      expect(fs.existsSync(jestFile)).toBe(true);
      
      // Count test cases in both files
      const mochaTestCount = countTests(mochaFile);
      const jestTestCount = countTests(jestFile);
      
      // Verify equivalent test count
      return jestTestCount >= mochaTestCount;
    }
  ),
  { numRuns: 38 } // One run per test file
);
```

### Property 2: Test Execution Equivalence

*For any* test module, the Jest version produces the same test results as the Mocha version (before Mocha deletion).

**Validates: Requirements 1.3, 10.3**

**Rationale**: This property ensures that migrated tests validate the same behavior as the original tests. If both test suites pass with the same test count, the migration preserves functionality.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.constantFrom(...testModules),
    (module) => {
      const mochaResults = runMochaTests(module);
      const jestResults = runJestTests(module);
      
      return mochaResults.passed === jestResults.passed &&
             mochaResults.failed === jestResults.failed;
    }
  ),
  { numRuns: 38 }
);
```

### Property 3: Round-Trip Invariant for Parsers

*For any* parser P and pretty printer PP, *for any* valid input X: P(PP(P(X))) = P(X)

**Validates: Requirements 9.3**

**Rationale**: This property validates that serialization and deserialization cycles preserve data integrity. It's critical for cache data, configuration, and any data transformation.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.object(),
    (input) => {
      const parsed = parser.parse(input);
      const printed = prettyPrinter.print(parsed);
      const reparsed = parser.parse(printed);
      
      return deepEqual(parsed, reparsed);
    }
  ),
  { numRuns: 100 }
);
```

### Property 4: Test Coverage Non-Regression

*For any* module M, the test coverage after migration is >= test coverage before migration.

**Validates: Requirements 2.7, 10.4**

**Rationale**: This property ensures that migration doesn't reduce test coverage. Coverage should be maintained or improved, never decreased.

**Test Implementation**:
```javascript
const coverageBefore = getCoverage('mocha');
const coverageAfter = getCoverage('jest');

expect(coverageAfter.lines).toBeGreaterThanOrEqual(coverageBefore.lines);
expect(coverageAfter.branches).toBeGreaterThanOrEqual(coverageBefore.branches);
expect(coverageAfter.functions).toBeGreaterThanOrEqual(coverageBefore.functions);
```

### Property 5: No Breaking Changes

*For any* public API A, the behavior after migration is identical to behavior before migration.

**Validates: Requirements 11.3, 11.5**

**Rationale**: This property ensures that test migration doesn't introduce breaking changes to the source code. The public API must remain stable.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.constantFrom(...publicAPIs),
    (api) => {
      const resultBefore = executeAPI(api, testInput);
      // ... perform migration ...
      const resultAfter = executeAPI(api, testInput);
      
      return deepEqual(resultBefore, resultAfter);
    }
  ),
  { numRuns: 100 }
);
```

### Property 6: Test Isolation

*For any* tests T1 and T2, the execution of T1 does not affect the result of T2.

**Validates: Requirements 10.3, 10.6**

**Rationale**: This property ensures that tests are properly isolated and don't pollute each other's state. Tests should be deterministic regardless of execution order.

**Test Implementation**:
```javascript
const order1 = runTests([test1, test2]);
const order2 = runTests([test2, test1]);

expect(order1.results).toEqual(order2.results);
```

### Property 7: Mocha Dependency Removal Completeness

*When* migration is complete, *no* Mocha-related dependencies or files remain in the project.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7**

**Rationale**: This property validates that Mocha has been completely removed from the project after migration is validated.

**Test Implementation**:
```javascript
const mochaFiles = findFiles('test/**/*-tests.mjs');
expect(mochaFiles).toHaveLength(0);

const packageJson = JSON.parse(fs.readFileSync('package.json'));
expect(packageJson.devDependencies.mocha).toBeUndefined();
expect(packageJson.devDependencies.chai).toBeUndefined();
expect(packageJson.devDependencies.sinon).toBeUndefined();
```

### Property 8: Property-Based Test Configuration

*For any* property-based test using fast-check, the test SHALL run with minimum 100 iterations.

**Validates: Requirements 3.7**

**Rationale**: This property ensures that property-based tests have sufficient iterations to find edge cases and validate properties across many inputs.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.constantFrom(...propertyTestFiles),
    (testFile) => {
      const content = fs.readFileSync(testFile, 'utf8');
      const numRunsMatch = content.match(/numRuns:\s*(\d+)/);
      
      if (numRunsMatch) {
        const numRuns = parseInt(numRunsMatch[1]);
        return numRuns >= 100;
      }
      
      return true; // No numRuns specified means default (100)
    }
  ),
  { numRuns: 38 }
);
```

### Property 9: Security Property Validation

*For any* security test, the test SHALL validate that injection attacks are prevented.

**Validates: Requirements 8.6, 8.7**

**Rationale**: This property ensures that security tests actually test security properties, not just execute without errors.

**Test Implementation**:
```javascript
fc.assert(
  fc.property(
    fc.string(),
    (maliciousInput) => {
      // Security tests should prevent injection
      const result = executeWithInjectionAttempt(maliciousInput);
      
      // Verify injection was prevented
      return result.injectionPrevented === true;
    }
  ),
  { numRuns: 100 }
);
```

## Error Handling

### Migration Error Scenarios

#### Scenario 1: Test Execution Failure

**Problem**: Migrated Jest test fails when Mocha test passes.

**Solution**:
- Compare test logic between Mocha and Jest versions
- Verify assertion conversion is correct
- Check for mock restoration issues
- Verify async/await handling
- Add debugging output to identify failure point

**Example**:
```javascript
// Debug test failure
it('should pass like Mocha version', () => {
  console.log('Input:', input);
  const result = functionUnderTest(input);
  console.log('Result:', result);
  expect(result).toBe(expected);
});
```

#### Scenario 2: Mock Restoration Failure

**Problem**: Mocks from one test affect subsequent tests.

**Solution**:
- Always use `jest.restoreAllMocks()` in `afterEach()`
- Use `jest.clearAllMocks()` to clear call history
- Verify mocks are restored even if test fails
- Use try-finally for critical restoration

**Example**:
```javascript
describe('Tests with mocks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  
  it('test with mock', () => {
    const spy = jest.spyOn(console, 'log');
    try {
      // Test code
    } finally {
      // Ensure restoration even on failure
      jest.restoreAllMocks();
    }
  });
});
```

#### Scenario 3: AWS Service Mock Failure

**Problem**: AWS service mocks don't work correctly in Jest.

**Solution**:
- Import tools module before creating mocks
- Spy on getter properties correctly
- Return complete mock objects with all required methods
- Verify mock is called with correct parameters

**Example**:
```javascript
// Import tools first
const tools = await import('../../src/lib/tools/index.js');

// Spy on getter property
jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
  client: {},
  get: jest.fn().mockResolvedValue({ Item: {...} }),
  put: jest.fn(),
  scan: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  sdk: {}
});
```

#### Scenario 4: Cache.init() Singleton Issue

**Problem**: Cache.init() can only be called once, causing test failures.

**Solution**:
- Use subprocess isolation for validation tests
- Accept shared initialization in integration tests
- Document initialization dependencies
- Use unique cache keys per test

**Example**:
```javascript
// Subprocess isolation for validation
it('should validate cache init parameters', () => {
  const testCode = `
    import { Cache } from './src/lib/dao-cache.js';
    try {
      Cache.init({ invalidParam: true });
      process.exit(1);
    } catch (error) {
      if (error.message === 'Expected error') {
        process.exit(0);
      }
      process.exit(1);
    }
  `;
  execSync(`node --input-type=module -e "${testCode}"`);
});
```

#### Scenario 5: Property Test Failure

**Problem**: Property-based test fails with specific counterexample.

**Solution**:
- Log the failing input for reproduction
- Use fc.assert verbose mode
- Preserve seed for reproducibility
- Add unit test for the failing case
- Investigate if failure reveals actual bug

**Example**:
```javascript
it('Property test', () => {
  try {
    fc.assert(
      fc.property(fc.object(), (obj) => {
        // Test logic
      }),
      { 
        numRuns: 100,
        verbose: true,
        seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now()
      }
    );
  } catch (error) {
    console.error('Property test failed with seed:', error.seed);
    console.error('Counterexample:', error.counterexample);
    throw error;
  }
});
```

#### Scenario 6: Documentation Test Timeout

**Problem**: Documentation validation tests take too long or timeout.

**Solution**:
- Set appropriate test timeouts
- Limit file scanning scope
- Cache parsed results
- Run tests in parallel where possible
- Skip slow tests in development mode

**Example**:
```javascript
describe('Documentation validation', () => {
  jest.setTimeout(60000); // 60 seconds
  
  it('should validate all JSDoc', () => {
    const files = getSourceFiles();
    const results = files.map(file => validateJSDoc(file));
    expect(results.every(r => r.valid)).toBe(true);
  });
});
```

#### Scenario 7: Migration Validation Infinite Loop

**Problem**: Migration validation tests execute themselves recursively.

**Solution**:
- Use direct test runner invocation (not npm scripts)
- Specify exact test files to run
- Avoid executing full test suite from within tests
- Use subprocess isolation

**Example**:
```javascript
// CORRECT: Direct test runner invocation
function runMochaTest(testFile) {
  return execFileSync(
    './node_modules/.bin/mocha',
    [testFile],
    { encoding: 'utf8' }
  );
}

// WRONG: npm script execution (causes infinite loop)
function runMochaTest(testFile) {
  return execSync(`npm test -- ${testFile}`);
}
```

### Test Execution Errors

#### Error 1: Import Resolution Failure

**Symptom**: `Cannot find module` errors.

**Cause**: Incorrect import paths or missing file extensions.

**Solution**:
- Verify all import paths are correct
- Ensure `.js` extension for local modules
- Check that imported modules exist
- Use absolute paths from project root

#### Error 2: Async Test Timeout

**Symptom**: Tests hang or timeout.

**Cause**: Missing `await` or infinite loops.

**Solution**:
- Ensure all async operations are awaited
- Set appropriate test timeouts
- Add timeout guards
- Check for infinite loops

#### Error 3: Environment Variable Pollution

**Symptom**: Tests fail when run in different order.

**Cause**: Environment variables not cleaned up.

**Solution**:
- Save original environment in `beforeEach()`
- Restore in `afterEach()`
- Delete test-specific variables
- Use isolated test instances

## Testing Strategy

### Dual Testing Approach

During migration, both Mocha and Jest test suites must pass:

**Unit Tests**:
- Verify specific examples and expected behavior
- Test edge cases (null, undefined, empty, boundary values)
- Test error conditions and error messages
- Use descriptive test names

**Property-Based Tests**:
- Test universal properties across many inputs
- Use fast-check library (works with both Mocha and Jest)
- Validate invariants and mathematical properties
- Minimum 100 iterations per property test

**Integration Tests**:
- Test interactions between classes/modules
- Test AWS service integrations (with mocks)
- Test end-to-end workflows

### Test Execution Commands

```bash
# Run Mocha tests only (legacy)
npm test

# Run Jest tests only (current)
npm run test:jest

# Run both test suites (REQUIRED for CI/CD during migration)
npm run test:all

# Run specific test suites
npm run test:cache        # Mocha cache tests
npm run test:cache:jest   # Jest cache tests
npm run test:config       # Mocha config tests
npm run test:endpoint     # Mocha endpoint tests
```

### Migration Validation Process

1. **Pre-Migration Baseline**:
   - Run Mocha tests: `npm test`
   - Record test count and results
   - Measure test coverage
   - Verify all tests pass

2. **Create Jest Test File**:
   - Copy Mocha test file
   - Rename with `.jest.mjs` extension
   - Update imports to Jest
   - Place in same directory as Mocha test

3. **Convert Assertions**:
   - Replace Chai assertions with Jest assertions
   - Update all `expect()` statements
   - Verify assertion logic is preserved
   - Test edge cases

4. **Convert Mocks**:
   - Replace Sinon stubs with Jest spies
   - Update mock setup and teardown
   - Ensure mocks are restored in `afterEach()`
   - Test mock behavior

5. **Run Jest Tests**:
   - Execute: `npm run test:jest`
   - Verify same test count as Mocha
   - Verify all tests pass
   - Check for test pollution

6. **Run Both Test Suites**:
   - Execute: `npm run test:all`
   - Verify both Mocha and Jest pass
   - Verify no test pollution between suites
   - Compare test coverage

7. **Verify Source Code Unchanged**:
   - Check git diff for source files
   - Ensure no modifications to source code
   - Verify only test files changed

8. **Validate Migration Complete** (after all 38 files):
   - Verify all Mocha tests have Jest equivalents
   - Run both test suites one final time
   - Verify test coverage maintained or improved
   - Verify no breaking changes

9. **Remove Mocha** (final step):
   - Delete all `*-tests.mjs` files
   - Remove Mocha from package.json
   - Remove Chai from package.json
   - Remove Sinon from package.json
   - Update npm test script to run Jest
   - Remove test:all script
   - Update CI/CD configuration
   - Update documentation
   - Run Jest tests to verify: `npm test`

### Test Coverage Requirements

**Minimum Coverage**:
- All public methods must have tests
- All edge cases from Mocha tests must be preserved
- All error conditions must be tested
- Coverage must not decrease

**Coverage Measurement**:
```bash
# Mocha coverage (if configured)
npm test -- --coverage

# Jest coverage
npm run test:jest -- --coverage

# Compare coverage reports
diff coverage/lcov.info coverage-jest/lcov.info
```

### Property-Based Test Configuration

All property-based tests must follow these standards:

**Minimum Iterations**: 100 runs per property test
```javascript
fc.assert(
  fc.property(/* ... */),
  { numRuns: 100 }
);
```

**Property Test Tags**: Reference design document property
```javascript
// Feature: 1-3-10-test-migration-phase-6, Property 1: Test Migration Completeness
it('Property 1: Test migration completeness', () => {
  fc.assert(/* ... */);
});
```

**Seed Preservation**: Use environment variable for reproducibility
```javascript
fc.assert(
  fc.property(/* ... */),
  { 
    numRuns: 100,
    seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : Date.now()
  }
);
```

### Jest Best Practices Checklist

- [ ] Use `import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals'`
- [ ] Use `jest.restoreAllMocks()` in `afterEach()` hooks
- [ ] Use `jest.spyOn()` for mocking methods
- [ ] Use descriptive test names
- [ ] Organize tests into logical `describe` blocks
- [ ] Use `expect().toBe()` for primitives
- [ ] Use `expect().toEqual()` for objects
- [ ] Use async/await for asynchronous tests
- [ ] Include comments for complex setups
- [ ] Clean up resources in `afterEach()`

## Implementation Details

### Migration Patterns by Test Category

#### Pattern 1: Root Level Tests

**File**: `test/index-tests.mjs` → `test/index-tests.jest.mjs`

**Complexity**: Low

**Key Changes**:
```javascript
// Before (Mocha)
import { expect } from 'chai';

// After (Jest)
import { describe, it, expect } from '@jest/globals';

// Assertions
// Before: expect(tools).to.not.be.undefined;
// After: expect(tools).toBeDefined();
```

#### Pattern 2: Cache Module Tests

**Files**: 13 cache test files

**Complexity**: High

**Key Changes**:
```javascript
// Import tools for mocking
const tools = await import('../../src/lib/tools/index.js');

// Mock AWS services
jest.spyOn(tools.default.AWS, 'dynamo', 'get').mockReturnValue({
  client: {},
  get: jest.fn().mockResolvedValue({ Item: {...} }),
  put: jest.fn(),
  scan: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  sdk: {}
});

// Clean up mocks
afterEach(() => {
  jest.restoreAllMocks();
});
```

#### Pattern 3: Config Module Tests

**Files**: 3 config test files

**Complexity**: Medium

**Key Changes**:
```javascript
// Promise handling
// Before: expect(await promise).to.equal(value);
// After: await expect(promise).resolves.toBe(value);

// Object comparison
// Before: expect(obj).to.deep.equal(expected);
// After: expect(obj).toEqual(expected);
```

#### Pattern 4: Documentation Tests

**Files**: 12 documentation property test files

**Complexity**: Medium

**Key Changes**:
```javascript
// File system operations (same in both)
import { readFileSync } from 'fs';

// Property-based testing (same library)
import fc from 'fast-check';

// Assertions
// Before: expect(result).to.be.true;
// After: expect(result).toBe(true);
```

#### Pattern 5: Migration Validation Tests

**Files**: 2 migration property test files

**Complexity**: High (self-referential)

**Key Changes**:
```javascript
// CRITICAL: Use direct test runner invocation
function runMochaTest(testFile) {
  return execFileSync(
    './node_modules/.bin/mocha',
    [testFile],
    { encoding: 'utf8' }
  );
}

function runJestTest(testFile) {
  return execFileSync(
    'node',
    ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', testFile],
    { encoding: 'utf8' }
  );
}

// DO NOT use npm scripts (causes infinite loop)
```

#### Pattern 6: Security Tests

**Files**: 4 security test files

**Complexity**: Medium

**Key Changes**:
```javascript
// Shell command execution (same in both)
import { execFileSync } from 'child_process';

// Security validation
it('should prevent shell injection', () => {
  const maliciousInput = '/tmp/test.js; rm -rf /';
  
  expect(() => {
    execFileSync('node', ['--check', maliciousInput]);
  }).toThrow();
});
```

### Common Migration Patterns

#### Pattern A: Simple Equality

```javascript
// Mocha/Chai
expect(value).to.equal(expected);

// Jest
expect(value).toBe(expected);
```

#### Pattern B: Object Equality

```javascript
// Mocha/Chai
expect(obj).to.deep.equal(expected);

// Jest
expect(obj).toEqual(expected);
```

#### Pattern C: Truthiness

```javascript
// Mocha/Chai
expect(value).to.be.true;
expect(value).to.be.false;

// Jest
expect(value).toBe(true);
expect(value).toBe(false);
```

#### Pattern D: Array Length

```javascript
// Mocha/Chai
expect(array).to.have.lengthOf(3);

// Jest
expect(array).toHaveLength(3);
```

#### Pattern E: Mock Creation

```javascript
// Mocha/Sinon
const stub = sinon.stub(console, 'log');

// Jest
const spy = jest.spyOn(console, 'log').mockImplementation();
```

#### Pattern F: Mock Restoration

```javascript
// Mocha/Sinon
afterEach(() => {
  stub.restore();
});

// Jest
afterEach(() => {
  jest.restoreAllMocks();
});
```

### File Structure Template

```javascript
// test/[module]/[name]-tests.jest.mjs

// Jest imports
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Module imports
import { ModuleClass } from '../../src/lib/tools/index.js';

// Helper imports (if needed)
import { sleep } from '../helpers/utils.mjs';
import fc from 'fast-check';

// Test suite
describe("Module Name", () => {
  // Setup/teardown
  beforeEach(() => {
    // Setup code
  });
  
  afterEach(() => {
    // Cleanup code
    jest.restoreAllMocks();
  });

  // Unit tests
  describe("Method or Feature", () => {
    it("should do something specific", () => {
      // Test implementation
      expect(result).toBe(expected);
    });
  });
  
  // Property tests
  describe("Property Tests", () => {
    it("Property 1: Description", () => {
      fc.assert(
        fc.property(
          fc.object(),
          (input) => {
            // Test implementation
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  // Edge cases
  describe("Edge Cases", () => {
    it("should handle null values", () => {
      // Test implementation
    });
  });
});
```

## Mocha Removal Strategy

### Prerequisites for Mocha Removal

Before removing Mocha, verify:

- [ ] All 38 Mocha test files have been migrated to Jest
- [ ] All Jest tests pass: `npm run test:jest`
- [ ] All Mocha tests pass: `npm test`
- [ ] Both test suites pass: `npm run test:all`
- [ ] Test coverage is maintained or improved
- [ ] No breaking changes detected
- [ ] All correctness properties pass

### Mocha Removal Steps

#### Step 1: Delete Mocha Test Files

```bash
# Delete all Mocha test files
find test -name '*-tests.mjs' -type f -delete

# Verify no Mocha test files remain
find test -name '*-tests.mjs' -type f
# Should return no results
```

#### Step 2: Update package.json

**Remove Dependencies**:
```json
{
  "devDependencies": {
    "mocha": "^11.7.5",    // REMOVE
    "chai": "^6.2.2",      // REMOVE
    "sinon": "^21.0.1"     // REMOVE
  }
}
```

**Update Scripts**:
```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:jest": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:all": "npm test",  // REMOVE (no longer needed)
    "test:cache": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/cache",
    "test:config": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/config",
    "test:endpoint": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/endpoint",
    "test:tools": "node --experimental-vm-modules node_modules/jest/bin/jest.js test/tools"
  }
}
```

#### Step 3: Update CI/CD Configuration

**GitHub Actions** (.github/workflows/test.yml):
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Jest tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./coverage-jest
```

#### Step 4: Update Documentation

**README.md**:
- Remove Mocha references
- Update test execution instructions to Jest only
- Update examples to use Jest syntax

**CONTRIBUTING.md**:
- Update testing guidelines to Jest only
- Remove Mocha/Chai/Sinon instructions
- Add Jest testing patterns

**Steering Documents**:
- Update test-requirements.md to remove Mocha references
- Update test-execution-monitoring.md
- Update any other steering documents mentioning Mocha

#### Step 5: Verify Mocha Removal

```bash
# Run tests
npm test

# Verify all tests pass
# Should see only Jest output

# Verify no Mocha files
find . -name '*mocha*' -o -name '*chai*' -o -name '*sinon*'
# Should return no results (except in node_modules if not cleaned)

# Clean install to remove old dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests again
npm test
```

#### Step 6: Update CHANGELOG.md

```markdown
## [1.3.11] - 2024-XX-XX

### Changed
- Completed migration from Mocha to Jest test framework
- All tests now use Jest exclusively
- Removed Mocha, Chai, and Sinon dependencies

### Removed
- Mocha test framework
- Chai assertion library
- Sinon mocking library
```

## Documentation Requirements

### Test File Comments

Each migrated test file should include a header comment:

```javascript
/**
 * Jest tests for [Module Name]
 * Migrated from Mocha ([original-file-name]-tests.mjs)
 * 
 * Tests cover:
 * - [Feature 1]
 * - [Feature 2]
 * - [Feature 3]
 */
```

### Migration Checklist Per File

- [ ] File created with `.jest.mjs` extension
- [ ] Imports updated to Jest
- [ ] All assertions converted to Jest syntax
- [ ] All mocks converted from Sinon to Jest
- [ ] `afterEach()` includes `jest.restoreAllMocks()`
- [ ] Environment variables properly cleaned up
- [ ] All tests pass: `npm run test:jest`
- [ ] Original Mocha tests still pass: `npm test`
- [ ] Both test suites pass: `npm run test:all`
- [ ] No source code modifications
- [ ] Test coverage preserved or improved

### Migration Completion Checklist

- [ ] All 38 Mocha test files migrated to Jest
- [ ] All Jest tests pass
- [ ] Test coverage maintained or improved
- [ ] No breaking changes detected
- [ ] All correctness properties pass
- [ ] Mocha test files deleted
- [ ] Mocha removed from package.json
- [ ] Chai removed from package.json
- [ ] Sinon removed from package.json
- [ ] npm test script updated to run Jest
- [ ] test:all script removed
- [ ] CI/CD updated to run Jest only
- [ ] README.md updated
- [ ] CONTRIBUTING.md updated
- [ ] Steering documents updated
- [ ] CHANGELOG.md updated
- [ ] All tests pass after Mocha removal

## Summary

This design provides a comprehensive approach to completing the test migration from Mocha to Jest for the @63klabs/cache-data package. The migration covers 38 remaining test files across 7 categories, follows established patterns from phases 4 and 5, and includes a detailed strategy for removing Mocha once migration is validated.

The correctness properties provide formal validation criteria, ensuring that:
1. All tests are migrated completely
2. Test behavior is equivalent between frameworks
3. Test coverage is maintained
4. No breaking changes are introduced
5. Mocha is completely removed after validation

The implementation details provide specific patterns for each test category, and the Mocha removal strategy ensures a clean transition to Jest-only testing.
