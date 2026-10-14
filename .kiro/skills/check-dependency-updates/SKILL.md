---
name: check-dependency-updates
description: Checks all package.json dependencies for available updates, prioritizing security vulnerabilities. After identifying updates, ensures all tests pass with the updated dependencies. Run manually when you want to review and apply dependency updates.
---

# Check Dependency Updates

Review all dependencies in `package.json` for available updates, prioritizing security fixes, then verify the project still passes its tests.

## Steps

1. **Identify security vulnerabilities first.** Run `npm audit` to surface known vulnerabilities before anything else.
2. **Compare versions.** For each dependency, check the current version against the latest available (`npm outdated`).
3. **Group the proposed updates** into:
   1. Security fixes (handle critical/high severity first)
   2. Major version updates (note breaking changes)
   3. Minor/patch updates
4. **Apply and verify.** Install the updates and run `npm test` to confirm all tests still pass.
5. **Handle failures.** If tests fail after an update, revert that specific update and note the incompatibility.
6. **Summarize.** Report what was updated, what was skipped, and any security issues that remain unresolved.
