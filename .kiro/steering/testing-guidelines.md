# Testing Guidelines for CFN Template Repository

## Property-Based Testing Restrictions

Property-based tests are **not critical**. The focus should be on **fast-running unit tests** that provide quick feedback during development.

### Guidelines:

1. **Minimize Property-Based Tests**: Only implement property-based tests for core validation logic where they provide significant value over unit tests.

2. **Prioritize Unit Tests**: Focus on comprehensive unit test coverage that:
   - Runs quickly (< 1 second per test)
   - Tests specific scenarios with known inputs/outputs
   - Covers edge cases with concrete examples
   - Provides clear failure messages

3. **Property Test Criteria**: Only implement property-based tests when:
   - The functionality involves complex input spaces that are difficult to cover with unit tests
   - The property represents a fundamental invariant that must hold across all inputs
   - The test provides unique value not covered by existing unit tests

4. **Performance Requirements**:
   - Total test suite should complete in under 30 seconds
   - Individual property tests should run with minimal iterations (10-20 instead of 100+)
   - Unit tests should be the primary testing mechanism

5. **Test Organization**:
   - Keep property-based tests in separate files for easy identification
   - Mark property tests as optional in task lists when possible
   - Ensure unit tests provide sufficient coverage for CI/CD confidence

## Implementation Priority

When implementing testing tasks:
1. **First**: Implement comprehensive unit tests
2. **Second**: Add integration tests for end-to-end workflows  
3. **Last**: Add minimal property-based tests only where absolutely necessary

This approach ensures fast feedback loops and maintains developer productivity while still ensuring code correctness.