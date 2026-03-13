# Design Document: Test Migration Phase 4

## Overview

This design document outlines the technical approach for migrating Mocha tests to Jest for four critical tools modules: CachedParametersSecrets.classes, Connections.classes, DebugAndLog.class, and Timer.class. This migration is part of the ongoing effort to transition the entire test suite from Mocha to Jest while maintaining full test coverage and ensuring no breaking changes to the source code.

### Scope

The migration covers four test files:
- `test/config/parameter-secret-tests.mjs` → `test/config/parameter-secret-tests.jest.mjs`
- `test/config/connections-tests.mjs` → `test/config/connections-tests.jest.mjs`
- `test/logging/debug-and-log-tests.mjs` → `test/logging/debug-and-log-tests.jest.mjs`
- `test/logging/timer-tests.mjs` → `test/logging/timer-tests.jest.mjs`

### Goals

1. Convert all existing Mocha tests to Jest format
2. Preserve all test assertions and validation logic
3. Maintain or improve test coverage
4. Ensure both Mocha and Jest test suites pass during migration period
5. Follow Jest best practices and coding standards
6. Make no changes to source code (backwards compatibility)

### Non-Goals

1. Refactoring source code
2. Adding new features to the modules
3. Changing public APIs
4. Migrating other test files (out of scope for Phase 4)

## Architecture

### Migration Strategy

The migration follows a parallel testing approach where both Mocha and Jest test suites coexist and must pass:

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Period                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Mocha Tests (Legacy)          Jest Tests (New)             │
│  ├── parameter-secret-tests    ├── parameter-secret-tests   │
│  │   .mjs                       │   .jest.mjs                │
│  ├── connections-tests.mjs     ├── connections-tests        │
│  │                              │   .jest.mjs                │
│  ├── debug-and-log-tests       ├── debug-and-log-tests      │
│  │   .mjs                       │   .jest.mjs                │
│  └── timer-tests.mjs           └── timer-tests.jest.mjs     │
│                                                               │
│  npm test                       npm run test:jest            │
│  (Mocha)                        (Jest)                       │
│                                                               │
│              npm run test:all                                │
│              (Both must pass)                                │
└─────────────────────────────────────────────────────────────┘
```

### Test File Organization

Each migrated test file maintains the same structure as the original:

```javascript
// test/config/parameter-secret-tests.jest.mjs
import { describe, it, expect } from '@jest/globals';
import { CachedParameterSecrets, CachedSecret, CachedSsmParameter } 
  from '../../src/lib/tools/index.js';

describe("CachedParameterSecret, CachedSsmParameter, CachedSecret", () => {
  // Test structure mirrors Mocha version
  describe("CachedParameterSecrets class", () => {
    it("toObject()", () => {
      // Jest assertions instead of Chai
    });
  });
});
```

## Components and Interfaces

### Module 1: CachedParametersSecrets Migration

**Source Module**: `src/lib/tools/CachedParametersSecrets.classes.js`

**Classes Under Test**:
- `CachedParameterSecrets` (container class)
- `CachedSsmParameter` (extends CachedParameterSecret)
- `CachedSecret` (extends CachedParameterSecret)

**Test Coverage**:
- Container methods: `add()`, `get()`, `toArray()`, `toObject()`, `toJSON()`, `getNameTags()`, `getNames()`, `prime()`
- CachedSsmParameter methods: `getName()`, `getNameTag()`, `toObject()`, `getValue()`, `sync_getValue()`, `prime()`, `refresh()`
- CachedSecret methods: Same as CachedSsmParameter

**Migration Considerations**:
- No mocking required (tests use actual class instances)
- Tests create instances and verify state
- No async complexity in existing tests
- Focus on data structure validation

### Module 2: Connections Migration

**Source Module**: `src/lib/tools/Connections.classes.js`

**Classes Under Test**:
- `Connections` (container class)
- `Connection` (connection configuration)
- `ConnectionAuthentication` (authentication handling)
- `ConnectionRequest` (extends Connection)

**Test Coverage**:
- Connections methods: `add()`, `get()`, `toObject()`, `info()`, `toJSON()`
- Connection methods: `getParameters()`, `getHeaders()`, `getBody()`, `getCacheProfile()`, `toObject()`, `toInfoObject()`, `getName()`, `toString()`
- ConnectionAuthentication methods: `hasHeader()`, `hasParameter()`, `hasBody()`, `hasBasic()`, `toObject()`
- ConnectionRequest methods: `addHeaders()`, `addHeader()`, `addParameters()`, `addParameter()`
- Promise handling in connection properties

**Migration Considerations**:
- Complex Promise handling tests
- Uses `assert` module in addition to `expect`
- Tests for nested Promise resolution
- safeClone utility function behavior with Promises

### Module 3: DebugAndLog Migration

**Source Module**: `src/lib/tools/DebugAndLog.class.js`

**Classes Under Test**:
- `DebugAndLog` (static class)

**Test Coverage**:
- Environment detection: `getEnv()`, `getEnvType()`, `isProduction()`, `isDevelopment()`, `isTest()`, `isNotProduction()`
- NODE_ENV detection: `nodeEnvIsProduction()`, `nodeEnvIsDevelopment()`, `getNodeEnv()`, `nodeEnvHasChanged()`
- Log level management: `getLogLevel()`, `getDefaultLogLevel()`, `setLogLevel()`
- Logging methods: `log()`, `error()`, `warn()`, `info()`, `msg()`, `message()`, `diag()`, `debug()`, `writeLog()`
- Environment variable handling: `ALLOWED_ENV_TYPE_VAR_NAMES`, `ALLOWED_LOG_VAR_NAMES`
- Log level restrictions in production

**Migration Considerations**:
- Heavy use of Sinon for console method stubs
- Must migrate to Jest mocking (`jest.spyOn()`)
- Environment variable manipulation in beforeEach/afterEach
- ANSI color code stripping in assertions
- Complex environment variable testing patterns

### Module 4: Timer Migration

**Source Module**: `src/lib/tools/Timer.class.js`

**Classes Under Test**:
- `Timer` (instance class)

**Test Coverage**:
- State methods: `isRunning()`, `wasStarted()`, `notStarted()`, `wasStopped()`, `status()`
- Control methods: `start()`, `stop()`
- Calculation methods: `elapsed()`, `elapsedSinceStart()`, `elapsedSinceStop()`, `now()`
- Constructor behavior: auto-start enabled/disabled
- Timer behavior after stop

**Migration Considerations**:
- Uses Sinon for console stubs (migrate to Jest)
- Timing-dependent tests (use `sleep()` helper)
- Environment variable cleanup
- Tests verify timing calculations

## Data Models

### Test Structure Model

```typescript
interface TestFile {
  path: string;                    // e.g., "test/config/parameter-secret-tests.jest.mjs"
  framework: 'mocha' | 'jest';
  imports: ImportStatement[];
  testSuites: TestSuite[];
}

interface TestSuite {
  description: string;
  beforeEach?: SetupFunction;
  afterEach?: TeardownFunction;
  tests: Test[];
  nestedSuites: TestSuite[];
}

interface Test {
  description: string;
  async: boolean;
  assertions: Assertion[];
}

interface Assertion {
  type: 'equality' | 'truthiness' | 'error' | 'type';
  mochaStyle: string;              // e.g., "expect(x).to.equal(y)"
  jestStyle: string;               // e.g., "expect(x).toBe(y)"
}
```

### Assertion Mapping Model

```typescript
interface AssertionMapping {
  mocha: {
    import: string;                // "import { expect } from 'chai';"
    syntax: string;                // "expect(x).to.equal(y)"
  };
  jest: {
    import: string;                // "import { expect } from '@jest/globals';"
    syntax: string;                // "expect(x).toBe(y)"
  };
}
```

### Mock Migration Model

```typescript
interface MockMigration {
  mocha: {
    library: 'sinon';
    setup: string;                 // "const stub = sinon.stub(console, 'log');"
    restore: string;               // "stub.restore();"
  };
  jest: {
    library: 'jest';
    setup: string;                 // "const spy = jest.spyOn(console, 'log');"
    restore: string;               // "jest.restoreAllMocks();"
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Test Execution Equivalence

*For any* migrated test file, when both the Mocha version and Jest version are executed, both test suites SHALL pass with the same number of passing tests.

**Validates: Requirements 1.8, 2.9, 3.12, 4.10, 7.1, 7.2, 7.3**

**Rationale**: This property ensures that the migration preserves all test behavior. If both test suites pass with the same test count, we have successfully migrated the tests without losing coverage or introducing failures.

### Property 2: Source Code Immutability

*For any* source file in the four target modules, the file content before migration SHALL be identical to the file content after migration.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

**Rationale**: This property ensures backwards compatibility. No source code changes means no breaking changes to the public API or existing functionality.

### Property 3: Assertion Syntax Conversion

*For any* assertion in a migrated test file, the assertion SHALL use Jest syntax (`expect().toBe()`, `expect().toEqual()`, etc.) and SHALL NOT use Chai syntax (`expect().to.equal()`, `expect().to.be`, etc.).

**Validates: Requirements 1.3, 8.6**

**Rationale**: This property ensures consistent use of Jest assertion syntax throughout the migrated tests, which is required for Jest to execute the tests correctly.

### Property 4: Mock Library Consistency

*For any* mock or stub in a migrated test file, the mock SHALL use Jest mocking (`jest.spyOn()`, `jest.fn()`) and SHALL NOT use Sinon (`sinon.stub()`, `sinon.spy()`).

**Validates: Requirements 1.4, 3.3, 4.3, 8.3**

**Rationale**: This property ensures that all mocking uses Jest's built-in mocking capabilities, eliminating the Sinon dependency and following Jest best practices.

### Property 5: Test Isolation

*For any* test in a migrated test file, after the test completes, all mocks SHALL be restored and all environment variables SHALL be reset to their original state.

**Validates: Requirements 3.11, 4.9, 7.6, 8.2, 10.6**

**Rationale**: This property ensures that tests do not pollute each other's state, which is critical for deterministic test execution and preventing flaky tests.

### Property 6: Test Coverage Preservation

*For any* public method in the four target modules, if the method was tested in the Mocha test suite, then the method SHALL also be tested in the Jest test suite.

**Validates: Requirements 1.2, 1.5, 1.6, 1.7, 2.3, 2.4, 2.5, 2.6, 3.4-3.10, 4.4-4.8, 5.1-5.4**

**Rationale**: This property ensures that we don't lose test coverage during migration. Every tested method in Mocha must have corresponding tests in Jest.

### Property 7: Test Determinism

*For any* migrated test, running the test multiple times SHALL produce the same result (pass or fail) on each execution.

**Validates: Requirements 7.4, 10.7**

**Rationale**: This property ensures that tests are not flaky and produce consistent results, which is essential for reliable CI/CD pipelines.

### Property 8: Import Statement Correctness

*For any* migrated test file, all imports SHALL use the Jest globals import pattern (`import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals'`) and SHALL NOT import from Chai or Sinon.

**Validates: Requirements 8.1**

**Rationale**: This property ensures that test files use the correct Jest imports and don't have leftover imports from Mocha/Chai/Sinon.

## Error Handling

### Migration Error Scenarios

#### Scenario 1: Assertion Conversion Failure

**Problem**: A Mocha assertion doesn't have a direct Jest equivalent.

**Solution**: 
- Document the assertion pattern
- Create custom Jest matcher if needed
- Use multiple Jest assertions to replicate behavior
- Add comment explaining the conversion

**Example**:
```javascript
// Mocha (Chai)
expect(array).to.have.lengthOf(3);

// Jest equivalent
expect(array).toHaveLength(3);
// OR
expect(array.length).toBe(3);
```

#### Scenario 2: Mock Restoration Failure

**Problem**: Mocks are not properly restored, causing test pollution.

**Solution**:
- Always use `jest.restoreAllMocks()` in `afterEach()`
- Use `jest.clearAllMocks()` if needed
- Document mock lifecycle in comments

**Example**:
```javascript
describe('Tests with mocks', () => {
  afterEach(() => {
    // CRITICAL: Restore all mocks to prevent test pollution
    jest.restoreAllMocks();
  });

  it('test with mock', () => {
    const spy = jest.spyOn(console, 'log');
    // ... test code ...
    expect(spy).toHaveBeenCalled();
  });
});
```

#### Scenario 3: Environment Variable Pollution

**Problem**: Environment variables modified in tests affect subsequent tests.

**Solution**:
- Save original environment in `beforeEach()`
- Restore original environment in `afterEach()`
- Delete test-specific variables

**Example**:
```javascript
let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  // Clear test-specific variables
  delete process.env.TEST_VAR;
});

afterEach(() => {
  process.env = originalEnv;
});
```

#### Scenario 4: Timing-Dependent Test Failures

**Problem**: Tests that depend on timing may fail intermittently.

**Solution**:
- Use appropriate timeouts
- Use `sleep()` helper for delays
- Avoid exact timing assertions
- Use ranges for timing validation

**Example**:
```javascript
it('should measure elapsed time', async () => {
  const timer = new Timer('test', true);
  await sleep(100);
  const elapsed = timer.stop();
  
  // Use range instead of exact value
  expect(elapsed).toBeGreaterThanOrEqual(100);
  expect(elapsed).toBeLessThan(150);
});
```

### Test Execution Errors

#### Error 1: Import Resolution Failure

**Symptom**: `Cannot find module` errors when running Jest tests.

**Cause**: Incorrect import paths or missing file extensions.

**Solution**:
- Verify all import paths are correct
- Ensure `.js` extension is included for local modules
- Check that imported modules exist

#### Error 2: Async Test Timeout

**Symptom**: Tests hang or timeout.

**Cause**: Missing `await` on async operations or infinite loops.

**Solution**:
- Ensure all async operations are awaited
- Set appropriate test timeouts
- Add timeout guards for long-running operations

#### Error 3: Mock Not Working

**Symptom**: Mock is not being called or assertions fail.

**Cause**: Mock created after code execution or incorrect spy target.

**Solution**:
- Create mocks before executing code under test
- Verify spy target is correct
- Check that mock is on the right object/method

## Testing Strategy

### Dual Testing Approach

During the migration period, both Mocha and Jest test suites must pass:

**Unit Tests (Both Frameworks)**:
- Verify specific examples and expected behavior
- Test edge cases (null, undefined, empty, boundary values)
- Test error conditions and error messages
- Use descriptive test names

**Property-Based Tests** (if applicable):
- Use fast-check library (works with both Mocha and Jest)
- Validate universal properties across many inputs
- Minimum 100 iterations per property test

**Integration Tests**:
- Test interactions between classes
- Test Promise handling and async operations
- Test environment variable interactions

### Test Execution Commands

```bash
# Run Mocha tests only (legacy)
npm test

# Run Jest tests only (current)
npm run test:jest

# Run both test suites (REQUIRED for CI/CD)
npm run test:all

# Run specific module tests
npm run test:config        # Mocha
npm run test:config:jest   # Jest
npm run test:logging       # Mocha
npm run test:logging:jest  # Jest
```

### Migration Validation Process

1. **Pre-Migration Baseline**:
   - Run Mocha tests: `npm test`
   - Record test count and results
   - Verify all tests pass

2. **Create Jest Test File**:
   - Copy Mocha test file
   - Rename with `.jest.mjs` extension
   - Update imports to Jest

3. **Convert Assertions**:
   - Replace Chai assertions with Jest assertions
   - Update all `expect()` statements
   - Verify assertion logic is preserved

4. **Convert Mocks**:
   - Replace Sinon stubs with Jest spies
   - Update mock setup and teardown
   - Ensure mocks are restored in `afterEach()`

5. **Run Jest Tests**:
   - Execute: `npm run test:jest`
   - Verify same test count as Mocha
   - Verify all tests pass

6. **Run Both Test Suites**:
   - Execute: `npm run test:all`
   - Verify both Mocha and Jest pass
   - Verify no test pollution between suites

7. **Verify Source Code Unchanged**:
   - Check git diff for source files
   - Ensure no modifications to source code
   - Verify only test files changed

### Test Coverage Requirements

**Minimum Coverage**:
- All public methods must have tests
- All edge cases from Mocha tests must be preserved
- All error conditions must be tested

**Additional Coverage** (Requirement 5):
- Add tests for untested edge cases
- Add tests for error conditions
- Add tests for boundary conditions
- Add tests for async error handling

### Jest Best Practices Checklist

- [ ] Use `import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals'`
- [ ] Use `jest.restoreAllMocks()` in `afterEach()` hooks
- [ ] Use `jest.spyOn()` for mocking methods
- [ ] Use descriptive test names
- [ ] Organize tests into logical `describe` blocks
- [ ] Use `expect().toBe()` for primitives
- [ ] Use `expect().toEqual()` for objects
- [ ] Use `expect().toBeUndefined()`, `expect().toBeNull()`, etc.
- [ ] Use async/await for asynchronous tests
- [ ] Include comments for complex setups

### Property-Based Test Configuration

For property-based tests using fast-check:

```javascript
import fc from 'fast-check';

it('Property: Test description', () => {
  fc.assert(
    fc.property(
      fc.string(),
      (input) => {
        // Test implementation
        return true;
      }
    ),
    { 
      numRuns: 100,  // Minimum 100 iterations
      verbose: true   // Show failures clearly
    }
  );
});
```

**Tag Format**: 
```javascript
// Feature: test-migration-phase-4, Property 1: Test Execution Equivalence
```

## Implementation Details

### Module 1: CachedParametersSecrets Migration

**File**: `test/config/parameter-secret-tests.jest.mjs`

**Import Changes**:
```javascript
// Before (Mocha)
import { expect } from 'chai';

// After (Jest)
import { describe, it, expect } from '@jest/globals';
```

**Assertion Changes**:
```javascript
// Before (Mocha/Chai)
expect(CachedParameterSecrets.toObject().objects.length).to.equal(6);

// After (Jest)
expect(CachedParameterSecrets.toObject().objects.length).toBe(6);
```

**Test Structure** (preserved):
- Main describe: "CachedParameterSecret, CachedSsmParameter, CachedSecret"
- Nested describes for each class
- Individual tests for each method

**No Mocking Required**: Tests use actual class instances.

### Module 2: Connections Migration

**File**: `test/config/connections-tests.jest.mjs`

**Import Changes**:
```javascript
// Before (Mocha)
import { expect } from 'chai';
import assert from 'assert';

// After (Jest)
import { describe, it, expect } from '@jest/globals';
// Note: Remove assert import, use Jest assertions
```

**Assertion Changes**:
```javascript
// Before (Mocha/Chai)
expect(conn.toString()).to.equal("null null null://api.chadkluck.net/games/");

// After (Jest)
expect(conn.toString()).toBe("null null null://api.chadkluck.net/games/");

// Before (assert)
assert.strictEqual(params.apiKey, 'test-key');
assert.deepStrictEqual(params.token, {});

// After (Jest)
expect(params.apiKey).toBe('test-key');
expect(params.token).toEqual({});
```

**Promise Handling Tests**: Preserve all Promise handling test logic.

### Module 3: DebugAndLog Migration

**File**: `test/logging/debug-and-log-tests.jest.mjs`

**Import Changes**:
```javascript
// Before (Mocha)
import { expect } from 'chai';
import sinon from 'sinon';

// After (Jest)
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
// Note: Remove sinon import
```

**Mock Migration**:
```javascript
// Before (Mocha/Sinon)
let logStub, warnStub, errorStub;

beforeEach(() => {
  logStub = sinon.stub(console, 'log');
  warnStub = sinon.stub(console, 'warn');
  errorStub = sinon.stub(console, 'error');
});

afterEach(() => {
  logStub.restore();
  warnStub.restore();
  errorStub.restore();
});

// After (Jest)
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

**Assertion Changes**:
```javascript
// Before (Mocha/Chai)
expect(DebugAndLog.getLogLevel()).to.equal(2);
expect(DebugAndLog.isProduction()).to.equal(true);

// After (Jest)
expect(DebugAndLog.getLogLevel()).toBe(2);
expect(DebugAndLog.isProduction()).toBe(true);
```

**Environment Variable Handling**: Preserve all environment variable manipulation logic.

### Module 4: Timer Migration

**File**: `test/logging/timer-tests.jest.mjs`

**Import Changes**:
```javascript
// Before (Mocha)
import { expect } from 'chai';
import sinon from 'sinon';
import { sleep } from '../helpers/utils.mjs';

// After (Jest)
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { sleep } from '../helpers/utils.mjs';
```

**Mock Migration**: Same pattern as DebugAndLog (Sinon → Jest).

**Timing Tests**: Preserve all timing validation logic with `sleep()` helper.

**Assertion Changes**:
```javascript
// Before (Mocha/Chai)
expect(t1.isRunning()).to.equal(true);
expect(t1.status()).to.equal("IS_RUNNING");

// After (Jest)
expect(t1.isRunning()).toBe(true);
expect(t1.status()).toBe("IS_RUNNING");
```

### Common Migration Patterns

#### Pattern 1: Simple Equality

```javascript
// Mocha/Chai
expect(value).to.equal(expected);

// Jest
expect(value).toBe(expected);
```

#### Pattern 2: Object Equality

```javascript
// Mocha/Chai
expect(obj).to.deep.equal(expected);

// Jest
expect(obj).toEqual(expected);
```

#### Pattern 3: Truthiness

```javascript
// Mocha/Chai
expect(value).to.be.true;
expect(value).to.be.false;

// Jest
expect(value).toBe(true);
expect(value).toBe(false);
```

#### Pattern 4: Array Length

```javascript
// Mocha/Chai
expect(array).to.have.lengthOf(3);

// Jest
expect(array).toHaveLength(3);
// OR
expect(array.length).toBe(3);
```

#### Pattern 5: Greater Than / Less Than

```javascript
// Mocha/Chai
expect(value).to.be.greaterThan(10);
expect(value).to.be.lessThan(100);

// Jest
expect(value).toBeGreaterThan(10);
expect(value).toBeLessThan(100);
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

  // Nested test suites
  describe("Class or Method Group", () => {
    it("should do something specific", () => {
      // Test implementation
      expect(result).toBe(expected);
    });
  });
});
```

## Documentation Requirements

### Test File Comments

Each migrated test file should include a header comment:

```javascript
/**
 * Jest tests for [Module Name]
 * Migrated from Mocha (parameter-secret-tests.mjs)
 * 
 * Tests cover:
 * - [Class 1] methods
 * - [Class 2] methods
 * - [Specific behavior]
 */
```

### Significant Differences

Document any significant differences between Mocha and Jest implementations:

```javascript
// Note: Jest uses toEqual() for deep object comparison
// instead of Chai's to.deep.equal()
expect(obj).toEqual(expected);
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

## Summary

This design provides a comprehensive approach to migrating four critical test files from Mocha to Jest while maintaining full backwards compatibility and test coverage. The migration follows established patterns, preserves all test logic, and ensures both test suites pass during the migration period. The correctness properties provide formal validation criteria, and the detailed implementation guidance ensures consistent, high-quality test migration.
