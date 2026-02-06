# Contributing

Contributions to this project are welcome! Whether you're fixing a bug, adding a new feature, or improving documentation, your help is appreciated.

Building a reputation will require a multi-step approach.

## Steps to Contributing

Begin by submitting bugs to ensure the project works for everyone. If you can submit code suggestions or pseudo code that helps! You can also examine a bug reported by someone else and provide helpful solutions to the team.

Submit feature requests. To keep this project simple and maintainable we accept features that are generally useful by an overwhelming majority of developers using the project. If you can submit code suggestions or pseudo code that helps! You can also examine a feature request from someone else and provide helpful solutions to the team.

After you have successfully participated in the bug reporting and feature request process, fork the repository and make your changes in a separate branch. Once you're satisfied with your changes, submit a pull request for review. Please only submit small changes (a single feature) at first. Pull requests with major code updates or frequent pull requests will often get ignored. Changes should also have code and testing methods well documented.

All code changes MUST start as an Issue (or security report) with a clear description of the problem or enhancement. No changes should be submitted to the repository without an attached, and approved, Issue.

Code developed (by AI or Human) outside of Kiro (see below) must NOT be submitted directly to the repository. Instead submit a proof of concept for a new piece of code or method via the Issue tracker as an enhancement. Someone from the team will review, evaluate the usefulness, and then implement using the proper process.

## Use of AI

This project utilizes the Spec-Driven, AI-Assisted Engineering approach.

Spec-Driven, AI-Assisted Engineering (SD-AI) is a software development methodology that prioritizes creating detailed, structured specifications before writing code. It priortizes context, requirements, and architectural constraints to generate accurate, non-hallucinated code. This approach shifts from ad-hoc, prompt-driven "vibe coding" to a structured, human-guided, AI-executed workflow, improving reliability in complex projects.

> Contributors are responsible for every line of code--AI-generated or not.

Code must be reviewed, understood, and tested by a human before being merged.

Kiro is the required AI coding assistant for final integrations, documentation, and testing, as it is in the AWS Ecosystem and this project is deveoped to deploy on the AWS platform. Just like test suites, Kiro ensures the proper tests, documentation, and guardrails are in place. Kiro is as important as commit-hooks and tests as it is a tool that ensures quality checks and should not be bypassed.

Ensure [AI Context](./AI_CONTEXT.md) and [Kiro steering documents](.kiro/steering/ai-context-reference.md) are reviewed, understood, and used by both humans and AI.

## Development Setup

Tests and documentation are critical to this project.

Do not disable tests.
Do not change tests.
Do not break the build.

Before contributing code, set up your development environment:

### Quick Setup (Recommended)

Run the automated setup script:

```bash
git clone https://github.com/63klabs/cache-data.git
cd cache-data
./scripts/setup-dev-environment.sh
```

This script will:
- Install npm dependencies
- Configure the pre-commit hook
- Run validation tests
- Display helpful next steps

### Manual Setup

If you prefer to set up manually:

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/63klabs/cache-data.git
cd cache-data
npm install
```

### 2. Install Pre-Commit Hook

The project includes a pre-commit hook that validates documentation quality before allowing commits. This ensures all contributions maintain documentation standards.

**Install the hook:**

```bash
# The hook is already in .git/hooks/pre-commit
# Make sure it's executable
chmod +x .git/hooks/pre-commit
```

**What the hook validates:**
- ✅ JSDoc completeness (all required tags present)
- ✅ JSDoc accuracy (parameters match function signatures)
- ✅ Documentation links are valid
- ✅ Code examples have valid syntax

**The hook will block commits if:**
- Incomplete JSDoc (missing @param, @returns, @example tags)
- Inaccurate JSDoc (parameter names don't match code)
- Broken links in documentation files
- Invalid syntax in code examples

**Note**: The hook reports "Missing JSDoc" items for informational purposes, but these don't block commits due to known parser limitations. Only the issues listed above will prevent commits.

**Test the hook:**

```bash
# Run the validation manually
.git/hooks/pre-commit

# Expected output:
# ✅ All validation checks passed
# ✅ Documentation validation passed!
```

**If validation fails:**
1. Review the error messages - they indicate specific files and issues
2. Fix the documentation issues identified
3. Run the hook again to verify fixes
4. Only use `git commit --no-verify` if you're certain the errors are false positives

### 3. Run Tests

Ensure all tests pass before submitting changes:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- test/documentation/
npm test -- test/cache/
```

## Documentation Standards

All public APIs must have complete JSDoc documentation. See [Documentation Standards](.kiro/steering/documentation-standards.md) for detailed requirements.

**Required JSDoc tags:**
- Description of what the function/class does
- `@param` for each parameter with type and description
- `@returns` with type and description (omit for void functions)
- `@example` with at least one working code example
- `@throws` for each error type that can be thrown

**Example:**

```javascript
/**
 * Retrieves cached data or fetches from source if not cached
 * 
 * @param {object} cacheProfile - Cache configuration profile
 * @param {Function} fetchFunction - Function to fetch data if not cached
 * @param {object} connection - Connection configuration
 * @returns {Promise<{success: boolean, data: object, cached: boolean}>} Result object with data and cache status
 * @throws {Error} If cache profile is invalid
 * @example
 * const result = await CacheableDataAccess.getData(
 *   cacheProfile,
 *   endpoint.get,
 *   connection
 * );
 * console.log(result.data);
 */
```

## Current Contributors

Thank you to the following people who have contributed to this project:

Chad Kluck\
DevOps & Developer Experience Engineer\
AWS Certified Cloud Practitioner | AWS Certified Developer - Associate | AWS
Certified Solutions Architect - Associate\
[Website](https://chadkluck.me)