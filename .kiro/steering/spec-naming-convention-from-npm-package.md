---
inclusion: always
---

# Spec Directory Naming Convention

When creating new specification directories in `.kiro/specs/`, you MUST follow this naming convention:

## Format

```
{version}-{feature-name}
```

Where:
- `{version}` is the version from `package.json` with dots replaced by hyphens (e.g., `1.3.6` becomes `1-3-6`)
- `{feature-name}` is a kebab-case description of the feature

## Examples

For package.json version `1.3.6`:
- `.kiro/specs/1-3-6-in-memory-cache/`
- `.kiro/specs/1-3-6-documentation-enhancement/`
- `.kiro/specs/1-3-6-reduce-json-stringify/`

## Process

1. Read the current version from `package.json`
2. Convert the version to the hyphenated format (replace `.` with `-`)
3. Append the feature name in kebab-case
4. Create the directory: `.kiro/specs/{version}-{feature-name}/`

## Important Notes

- The version in `package.json` will have already been updated for the next release
- Always use the CURRENT version from `package.json`, not a future or past version
- Feature names should be descriptive but concise
- Use kebab-case (lowercase with hyphens) for feature names
- Do NOT create spec directories without the version prefix
