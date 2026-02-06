# Changelog Maintenance Guidelines

## Overview

The changelog (`CHANGELOG.md`) should be kept up to date at the conclusion of a spec-driven development workflow. This document provides guidelines for maintaining consistent, informative changelog entries.

## Core Principles

1. **Existing text in the changelog should NEVER be updated** - only add new entries
2. **New entries MUST be added under the "Unreleased" section** in their appropriate category
3. **Only the "Unreleased" section is acceptable for new entries** - never add to released versions
4. **Repository versions are independent** of individual CloudFormation template and script version numbers

## Version Format

### Unreleased Section

The unreleased section will be marked by the upcoming version number followed by `- unreleased`:

```markdown
## v0.0.29 - unreleased
```

### Released Section

Before a release is made, all "Unreleased" entries should be reviewed for accuracy and completeness by the developer. Once entries are properly categorized, the developer will manually change `- unreleased` to the date of the release in `YYYY-MM-DD` format:

```markdown
## v0.0.28 - 2026-01-08
```

### New Development Cycle

The developer will create a new entry with the version number in `v0.0.0` format followed by `- unreleased` after a previous release was made, denoting the start of a new development cycle.

## Available Categories

Entries should be organized under these standard categories:

- **Added** - New features, templates, scripts, or capabilities
- **Changed** - Modifications to existing functionality
- **Deprecated** - Features marked for removal (with sunset date)
- **Removed** - Features removed in this version
- **Fixed** - Bug fixes and corrections
- **Security** - Security-related changes or fixes
- **Dependencies** - Dependency additions, updates, or removals
- **Breaking Changes** - Changes that require user intervention or migration (see special handling below)

If no sections are available for a release, make a best effort to categorize, or simply place the entries under the release version without categorization.

## Entry Format Guidelines

### CloudFormation Template Changes

When CloudFormation templates are modified, the changelog MUST be updated to reflect the changes.

**Format:** `[Category]: [template-name.yml] v[X.Y.Z] - [Brief change description]`

**Example:**
```markdown
### Changed
- **Pipeline: template-pipeline.yml v2.0.18** - Enhanced CodeBuild environment with additional permissions
```

**For multiple templates in a single spec:**
```markdown
### Added
- **Post-Deployment Validation Feature** [Spec: post-deploy-validation](../.kiro/specs/post-deploy-validation/)
  - Pipeline: template-pipeline.yml v2.1.0 - Added post-deployment stage support
  - Storage: template-storage-s3-artifacts.yml v1.3.2 - Added validation artifact storage
  - Service Role: template-service-role-pipeline.yml v1.2.1 - Added permissions for validation tasks
```

### Script and Tool Changes

Scripts and tools should be prefixed with their type if not self-evident from the name.

**Examples:**
```markdown
### Changed
- **Script: cfn_lint_runner.py** - Improved error reporting with file paths

### Added
- **Tool: Template Validator** - Automated validation of CloudFormation templates
```

### Documentation Changes

Only significant documentation changes made by Kiro need to be added to the changelog. The maintainer can always add or remove entries if it is felt appropriate.

**Examples:**
```markdown
### Added
- **Comprehensive Documentation** - Full documentation of the repository structure, templates, and contribution guidelines

### Changed
- **Template Documentation** - Updated all storage template READMEs with new parameter descriptions
```

### Breaking Changes

Breaking changes require special handling and should be placed in a dedicated **Breaking Changes** category.

**Format:**
```markdown
### Breaking Changes
- **[Category]: [template-name.yml] v[X.Y.Z]** - [Description of breaking change]
  - **Migration Guide:** [Link to migration documentation]
  - **Deprecation:** [Old version] deprecated with 24-month support period ending [YYYY-MM-DD]
```

**Example:**
```markdown
### Breaking Changes
- **Pipeline: template-pipeline-v3-0.yml v3.0.0** - Renamed parameter `S3ArtifactsBucket` to `ArtifactsBucketName` and restructured IAM permissions
  - **Migration Guide:** [docs/templates/v2/pipeline/template-pipeline-v3-0-README.md#migration-from-v2x-to-v30](../docs/templates/v2/pipeline/template-pipeline-v3-0-README.md#migration-from-v2x-to-v30)
  - **Deprecation:** v2.0.x deprecated with 24-month support period ending 2028-01-29
```

## Spec and Issue References

### Kiro Spec References

When a changelog entry is related to a Kiro spec, reference and link to the spec:

**Format:** `[Spec: feature-name](../.kiro/specs/feature-name/)`

**Example:**
```markdown
### Added
- **CloudFormation Template Validation** [Spec: cfn-validation](../.kiro/specs/cfn-validation/)
  - Automated validation of all CloudFormation templates using cfn-lint
  - Integration with pytest for local development testing
```

### GitHub Issue References

When a changelog entry addresses a GitHub issue, include the issue reference with a link:

**Format:** `addresses [#123](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/123)`

**Example:**
```markdown
### Fixed
- **Pipeline: template-pipeline.yml v2.0.19** - Fixed CodeBuild timeout configuration, addresses [#45](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/45)
```

**Combined spec and issue reference:**
```markdown
### Added
- **Post-Deployment Validation** [Spec: post-deploy-validation](../.kiro/specs/post-deploy-validation/) addresses [#78](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/78)
  - Pipeline: template-pipeline.yml v2.1.0 - Added post-deployment stage support
```

## Entry Detail Level

### High-Level Feature Entries

Use bold text for the main feature or change, followed by sub-bullets for details:

```markdown
### Added
- **CloudFormation Template Validation**: Automated validation of all CloudFormation templates using cfn-lint
  - Recursive template discovery in templates/v2 directory
  - Integration with pytest for local development testing
  - CI/CD pipeline integration via buildspec.yml
  - Comprehensive error reporting with file paths and violation details
```

### Template-Specific Entries

For template changes, keep the description brief but informative:

```markdown
### Changed
- **Storage: template-storage-s3-artifacts.yml v1.3.5** - Enhanced bucket policy for cross-account access
```

### Dependency Entries

List dependencies with version constraints:

```markdown
### Dependencies
- Added cfn-lint>=0.83.0 for CloudFormation template validation
- Added hypothesis>=6.92.0 for property-based testing
- Updated boto3>=1.28.0 for improved AWS API support
```

## Ordering Within Categories

Within each category, entries should be ordered by:
1. **Importance** - Breaking changes and major features first
2. **Scope** - Broader changes before specific changes
3. **Chronological** - When importance and scope are equal

## When NOT to Update the Changelog

Do NOT add changelog entries for:
- Work-in-progress commits during spec development
- Internal refactoring that doesn't change functionality
- Minor documentation typo fixes
- Test-only changes that don't affect functionality
- Version control or CI/CD configuration changes (unless they affect users)

The changelog should focus on changes that affect end users of the templates and tools.

## Spec-Driven Development Integration

### Changelog Update Task

Changelog updates should be included as a task in spec-driven development workflows, typically as one of the final tasks:

```markdown
- [ ] X.Y Update CHANGELOG.md
  - Add entry under "Unreleased" section
  - Include all modified templates with version numbers
  - Reference spec and any related issues
  - Categorize changes appropriately
```

### Validation Checklist

Before completing a spec, verify the changelog entry:

- [ ] Entry is under the "Unreleased" section
- [ ] Entry is in the appropriate category
- [ ] Template names include category prefix (e.g., "Pipeline:", "Storage:")
- [ ] Template version numbers are included
- [ ] Spec is referenced with link to `.kiro/specs/` directory
- [ ] Issue numbers are referenced with GitHub links (if applicable)
- [ ] Breaking changes are in "Breaking Changes" category with migration guide links
- [ ] Entry is clear and informative for end users
- [ ] Sub-bullets are used for multi-template changes
- [ ] Existing changelog text was not modified

## Examples

### Example 1: Single Template Non-Breaking Change

```markdown
## v0.0.30 - unreleased

### Changed
- **Pipeline: template-pipeline.yml v2.0.20** - Improved error handling in CodeBuild post-build phase [Spec: pipeline-error-handling](../.kiro/specs/pipeline-error-handling/)
```

### Example 2: Multi-Template Feature Addition

```markdown
## v0.0.30 - unreleased

### Added
- **CloudFront Cache Invalidation** [Spec: cloudfront-invalidation](../.kiro/specs/cloudfront-invalidation/) addresses [#92](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/92)
  - Network: template-network-route53-cloudfront-s3-apigw.yml v1.5.0 - Added S3 event notifications for cache invalidation
  - Storage: template-storage-s3-oac-for-cloudfront.yml v1.2.3 - Added Lambda trigger configuration
  - Service Role: template-service-role-storage.yml v1.1.2 - Added CloudFront invalidation permissions
```

### Example 3: Breaking Change with Migration

```markdown
## v0.0.30 - unreleased

### Breaking Changes
- **Storage: template-storage-s3-artifacts-v2-0.yml v2.0.0** - Restructured bucket naming convention and removed legacy encryption parameter [Spec: storage-modernization](../.kiro/specs/storage-modernization/)
  - **Migration Guide:** [docs/templates/v2/storage/template-storage-s3-artifacts-v2-0-README.md#migration-from-v1x-to-v20](../docs/templates/v2/storage/template-storage-s3-artifacts-v2-0-README.md#migration-from-v1x-to-v20)
  - **Deprecation:** v1.x deprecated with 24-month support period ending 2028-01-29
```

### Example 4: Script and Dependency Changes

```markdown
## v0.0.30 - unreleased

### Changed
- **Script: sync_templates.sh** - Added support for multi-region synchronization

### Dependencies
- Updated cfn-lint>=0.85.0 for improved rule coverage
- Added requests>=2.31.0 for API integration testing
```

### Example 5: Bug Fix with Issue Reference

```markdown
## v0.0.30 - unreleased

### Fixed
- **Pipeline: template-pipeline-github.yml v2.1.5** - Fixed GitHub connection ARN validation, addresses [#103](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/103)
- **Service Role: template-service-role-pipeline.yml v1.3.1** - Corrected IAM policy for cross-account deployments
```

### Example 6: Documentation Update

```markdown
## v0.0.30 - unreleased

### Changed
- **Documentation: Template READMEs** - Updated all pipeline template documentation with new parameter examples and troubleshooting sections [Spec: docs-enhancement](../.kiro/specs/docs-enhancement/)
```

## Complete Example Release

```markdown
## v0.0.30 - unreleased

### Breaking Changes
- **Storage: template-storage-s3-artifacts-v2-0.yml v2.0.0** - Restructured bucket naming convention and removed legacy encryption parameter [Spec: storage-modernization](../.kiro/specs/storage-modernization/)
  - **Migration Guide:** [docs/templates/v2/storage/template-storage-s3-artifacts-v2-0-README.md#migration-from-v1x-to-v20](../docs/templates/v2/storage/template-storage-s3-artifacts-v2-0-README.md#migration-from-v1x-to-v20)
  - **Deprecation:** v1.x deprecated with 24-month support period ending 2028-01-29

### Added
- **CloudFront Cache Invalidation** [Spec: cloudfront-invalidation](../.kiro/specs/cloudfront-invalidation/) addresses [#92](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/92)
  - Network: template-network-route53-cloudfront-s3-apigw.yml v1.5.0 - Added S3 event notifications for cache invalidation
  - Storage: template-storage-s3-oac-for-cloudfront.yml v1.2.3 - Added Lambda trigger configuration
  - Service Role: template-service-role-storage.yml v1.1.2 - Added CloudFront invalidation permissions

### Changed
- **Pipeline: template-pipeline.yml v2.0.20** - Improved error handling in CodeBuild post-build phase [Spec: pipeline-error-handling](../.kiro/specs/pipeline-error-handling/)
- **Script: sync_templates.sh** - Added support for multi-region synchronization
- **Documentation: Template READMEs** - Updated all pipeline template documentation with new parameter examples

### Fixed
- **Pipeline: template-pipeline-github.yml v2.1.5** - Fixed GitHub connection ARN validation, addresses [#103](https://github.com/63klabs/atlantis-cfn-template-repo-for-serverless-deployments/issues/103)
- **Service Role: template-service-role-pipeline.yml v1.3.1** - Corrected IAM policy for cross-account deployments

### Dependencies
- Updated cfn-lint>=0.85.0 for improved rule coverage
- Added requests>=2.31.0 for API integration testing

## v0.0.29 - 2026-01-28

### Added
- **Comprehensive Documentation**: Full documentation of the repository structure, templates, and contribution guidelines
- **AI Steering Documents**: Initial AI steering documents to guide the development and maintenance of AI-related components
```