# Test Requirements and CI/CD Guidelines

## Purpose

This steering document establishes critical requirements for test execution to ensure GitHub Actions CI/CD pipelines succeed and NPM deployments are not blocked by test failures.

## Core Principle

**ALL TESTS MUST PASS BEFORE ANY CODE IS COMMITTED OR MERGED.**

GitHub Actions will run the full test suite on every push and pull request. If any test fails, the deployment to NPM will be blocked. This is a critical safeguard to prevent broken code from reaching production.

## Pre-Commit Checklist

Before committing any code changes, you MUST:

1. **Run the full test suite locally**:
   ```bash
   npm test
   ```

2. **Verify all tests pass**:
   - Check the output for "X passing" with 0 failing
   - Exit code must be 0
   - No test failures, errors, or exceptions

3. **If any tests fail**:
   - **DO NOT COMMIT** until all failures are resolved
   - Investigate the root cause of the failure
   - Fix the failing tests or the code causing the failure
   - Re-run the full test suite to verify the fix

4. **Run Jest tests separately** (if applicable):
   ```bash
   npm run test:jest
   ```

5. **Run all tests together**:
   ```bash
   npm run test:all
   ```

## Test Isolation Requirements

### Problem: Test Interdependencies

Tests that depend on shared global state (like `Cache.init()`) can fail when run in different orders or when new tests are added. This creates brittle tests that break unexpectedly.

### Solution: Proper Test Isolation

When writing tests that use global initialization:

1. **Use subprocess isolation for validation tests**: Tests that validate initialization parameters should run in separate Node.js processes (see `cache-validation-tests.mjs` for examples using `execSync`)

2. **Accept shared initialization in integration tests**: Tests that verify behavior after initialization can share the global state, but must be aware that the first test to run will set the configuration

3. **Document initialization dependencies**: If a test suite requires specific initialization, document this in the test file header

4. **Use test-specific instances when possible**: Prefer creating new instances over relying on global singletons

### Example: Proper Subprocess Isolation

```javascript
it("Should throw error for invalid parameter", () => {
    const testCode = `
        import { Cache } from './src/lib/dao-cache.js';
        try {
            Cache.init({ invalidParam: true });
            process.exit(1); // Fail if no error thrown
        } catch (error) {
            if (error.message === 'Expected error message') {
                process.exit(0); // Success
            }
            process.exit(1); // Fail if wrong error
        }
    `;
    execSync(`node --input-type=module -e "${testCode}"`);
});
```

## Known Test Issues

### Pre-Existing Test Failures

Some tests may fail due to pre-existing issues unrelated to your changes:

1. **Cache Init Test** (`cache-tests.mjs`):
   - **Issue**: Expects 'myDynamoDbTable' but gets 'test-table' from earlier test initialization
   - **Root Cause**: Cache.init() can only be called once, and property tests initialize it first
   - **Status**: Pre-existing issue, not caused by recent changes
   - **Workaround**: This test should be refactored to use subprocess isolation

2. **Documentation Link Validity Tests**:
   - **Issue**: Broken links to example specs in `changelog-convention.md`
   - **Root Cause**: Example links in steering documents point to non-existent specs
   - **Status**: Pre-existing issue, these are example links for documentation purposes
   - **Workaround**: These tests should exclude steering documents or mark example links

### Handling Pre-Existing Failures

If you encounter pre-existing test failures that are NOT caused by your changes:

1. **Verify the failure existed before your changes**:
   ```bash
   git stash
   npm test
   git stash pop
   ```

2. **Document the pre-existing failure**: Add a note to this steering document

3. **Create a separate issue/task** to fix the pre-existing failure

4. **DO NOT commit code that introduces NEW failures**

## Test Categories

### Unit Tests
- Test individual functions and methods in isolation
- Should not depend on external state or other tests
- Should be fast and deterministic

### Property-Based Tests
- Test universal properties across many generated inputs
- Use fast-check for randomized testing
- Should run with minimum 100 iterations
- May take longer to execute

### Integration Tests
- Test interactions between modules
- May use mocked AWS services
- Should clean up resources after execution

### End-to-End Tests
- Test complete workflows
- May make real HTTP requests to test endpoints
- Should be idempotent and not affect production

## Test Execution Commands

### Run All Mocha Tests
```bash
npm test
```

### Run All Jest Tests
```bash
npm run test:jest
```

### Run All Tests (Mocha + Jest)
```bash
npm run test:all
```

### Run Specific Test File
```bash
npm test -- test/cache/cache-tests.mjs
```

### Run Tests Matching Pattern
```bash
npm test -- 'test/cache/**/*-property-tests.mjs'
```

### Run Tests with Debugging
```bash
NODE_ENV=development npm test
```

## GitHub Actions Integration

### Automated Test Execution

GitHub Actions will automatically run tests on:
- Every push to any branch
- Every pull request
- Before every NPM release

### CI/CD Pipeline Requirements

The CI/CD pipeline requires:
1. All Mocha tests pass (`npm test`)
2. All Jest tests pass (`npm run test:jest`)
3. Exit code 0 from test execution
4. No unhandled exceptions or errors

### Deployment Blocking

If ANY test fails in GitHub Actions:
- The workflow will fail
- NPM deployment will be blocked
- Pull requests cannot be merged
- Releases cannot be published

## Debugging Test Failures

### Local Debugging

1. **Run tests with verbose output**:
   ```bash
   npm test -- --reporter spec
   ```

2. **Run a single test file**:
   ```bash
   npm test -- test/cache/cache-tests.mjs
   ```

3. **Check for test isolation issues**:
   ```bash
   npm test -- test/cache/cache-tests.mjs --grep "Test Cache Init"
   ```

4. **Enable debug logging**:
   ```bash
   LOG_LEVEL=5 npm test
   ```

### Common Failure Causes

1. **Test Interdependencies**: Tests that depend on execution order or shared state
2. **Timing Issues**: Tests that depend on specific timing or race conditions
3. **Environment Differences**: Tests that behave differently in CI vs local
4. **Resource Leaks**: Tests that don't clean up resources (timers, connections, etc.)
5. **Mocking Issues**: Mocks that aren't properly restored after tests

## Best Practices

### Writing New Tests

1. **Ensure tests are isolated**: Each test should be independent
2. **Clean up after tests**: Restore mocks, clear timers, close connections
3. **Use descriptive test names**: Clearly describe what is being tested
4. **Test both success and failure cases**: Don't just test the happy path
5. **Use property-based testing for core logic**: Validate universal properties
6. **Mock external dependencies**: Don't make real API calls or database queries in unit tests

### Maintaining Existing Tests

1. **Run tests before and after changes**: Ensure you don't break existing tests
2. **Update tests when changing behavior**: Keep tests in sync with code
3. **Refactor brittle tests**: Fix tests that fail intermittently
4. **Document test dependencies**: Make implicit dependencies explicit
5. **Remove obsolete tests**: Delete tests for removed functionality

## Emergency Procedures

### If Tests Fail in CI/CD

1. **DO NOT bypass or disable tests**: This defeats the purpose of automated testing
2. **Investigate the failure immediately**: Check GitHub Actions logs
3. **Reproduce locally**: Run the same test command that failed in CI
4. **Fix the root cause**: Don't just make the test pass, fix the underlying issue
5. **Verify the fix**: Run full test suite locally before pushing

### If Deployment is Blocked

1. **Identify the failing test(s)**: Check GitHub Actions output
2. **Determine if failure is new or pre-existing**: Compare with previous runs
3. **If new failure**: Fix immediately before proceeding
4. **If pre-existing failure**: Document and create separate fix task
5. **Communicate with team**: Let others know about the blocked deployment

## Continuous Improvement

### Regular Test Maintenance

1. **Review test failures monthly**: Identify patterns and common issues
2. **Refactor brittle tests**: Improve test isolation and reliability
3. **Update test documentation**: Keep this steering document current
4. **Add tests for bugs**: Every bug fix should include a test
5. **Monitor test execution time**: Optimize slow tests

### Test Coverage Goals

1. **Unit test coverage**: Aim for >80% coverage of core logic
2. **Property test coverage**: All core algorithms should have property tests
3. **Integration test coverage**: All module interactions should be tested
4. **Edge case coverage**: Test boundary conditions and error cases

## Summary

**Remember: Tests are not optional. They are a critical part of the development process.**

- Run tests before every commit
- Fix all test failures before pushing
- Don't bypass or disable failing tests
- Maintain test isolation and independence
- Document pre-existing issues separately
- Communicate test failures to the team

**If tests fail in CI/CD, deployment is blocked. This is by design to protect production.**
