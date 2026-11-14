---
inclusion: fileMatch
fileMatchPattern: ['**/CHANGELOG.md', '.kiro/specs/**/*.md']
---

# Changelog maintenance guidelines

## Overview

This document tells an agent how to maintain `CHANGELOG.md` in a Node.js package repository. The release version comes from the `version` property in `package.json`.

The agent touches the changelog at two points:

1. **Before a spec is started:** a read-only version check (see [Checking the version before starting a spec](#checking-the-version-before-starting-a-spec)).
2. **In the final task of the spec's `tasks.md`:** adding entries.

Outside a spec, the agent updates the changelog only when the user asks.

## Rules

1. Add new entries only to the `(unreleased)` section for the current `package.json` version.
2. Never edit a dated (released) section.
3. Never write a release date and never write or change the intro prose under a version heading. The `release-changelog-package` skill, which only the user invokes, does both.
4. Any entry under `(unreleased)` may be edited, merged, or re-summarized to keep it accurate (see [Editing existing unreleased entries](#editing-existing-unreleased-entries)).

## Version headings

Two heading formats are accepted. Replace `0.0.0` with the real version.

```markdown
## v0.0.0 (unreleased)
## v0.0.0 (YYYY-MM-DD)
```

A heading with a date is released and locked. A heading with `(unreleased)` is open.

### Choosing the section to write to

Read `version` from `package.json`, then look in `CHANGELOG.md` for a heading that starts with `## v<version> `.

| What you find | What to do |
|---------------|------------|
| Heading with `(unreleased)` | Add entries there. |
| No heading for this version | Create `## v<version> (unreleased)` directly above the newest existing version heading, below any text at the top of the file. Add entries there. |
| Heading with a date | Stop. Tell the user to run `npm version [major|minor|patch]` first. Do not add the entry anywhere else. |
| More than one `(unreleased)` heading, or an `(unreleased)` version that differs from `package.json` | Stop and ask the user. |

### Checking the version before starting a spec

Run the same lookup before creating a spec directory or any spec file (`ISSUE.md`, `PLAN.md`, `requirements.md`). At this point the check is **read-only**: do not create the `(unreleased)` heading yet, because the heading is added in the final task.

Run it first because spec directory names use the `package.json` version, and `npm version` needs a clean git working tree. Files created before the check would leave the tree dirty and block the version bump.

| Result at spec start | What to do |
|----------------------|------------|
| `(unreleased)` heading, or no heading for this version | Continue with the spec. |
| Heading with a date | Stop before creating any file or directory. Tell the user to commit or stash pending work, run `npm version [major|minor|patch]`, and then ask again. |
| More than one `(unreleased)` heading, or an `(unreleased)` version that differs from `package.json` | Stop and ask the user. |

Run the lookup again in the final task. `package.json` may have changed since the spec started.

## Categories

Use these categories, in this order, inside a version section. All of them are always available. Choose by what the change does, not by what was used in recent releases.

| Category | Use for |
|----------|---------|
| **Security** | Security fixes or hardening. |
| **Fixed** | Bug fixes and corrections, including documentation corrections. |
| **Breaking Changes** | Changes that require users to act or migrate. |
| **Added** | New features, exports, options, environment variables, or documentation pages. |
| **Changed** | Modified behavior of existing functionality. |
| **Deprecated** | Features marked for removal. |
| **Removed** | Features removed in this version. |
| **Dependencies** | Dependency additions, updates, or removals. |

- Create a category heading (`### Fixed`) only when it has at least one entry. Do not leave empty categories.
- List a change under one category only.
- Within a category, group related entries together. Closely related entries may be merged into one.

## Entry format

```markdown
- **Title** - Description. [Spec: spec-directory-name](.kiro/specs/spec-directory-name/) addresses [#123](https://github.com/example-org/example-package/issues/123)
  - Detail that does not fit in the first sentence or two.
```

- Separator after the bold title is a hyphen with spaces: ` - `.
- Put spec and issue links at the end of the entry. The issue reference follows the spec reference.
- Sub-bullets are indented two spaces and hold secondary detail, such as new options or migration steps.
- Use backticks for code identifiers, for example `Response.setBody()`, `Cache.init()`, or `MY_ENV_VAR`.

### Writing the description

Write for a developer who uses the package. Say:

1. What changed, in terms of observable behavior.
2. Who is affected, and for fixes and security entries, the version range affected (for example, "Affects v1.3.11 through v1.4.0").
3. What the reader should do, if anything: a workaround, a new setting, or a migration step.

Use plain language. Do not write marketing wording or restate the code.

### Example entries

```markdown
### Fixed
- **`parseDuration()` handles empty strings** - Passing `""` threw `TypeError: Cannot read properties of undefined`. It now returns `0`, as documented. Affects v2.1.0 through v2.3.4. [Spec: 2-3-5-parse-duration-empty-input](.kiro/specs/2-3-5-parse-duration-empty-input/) addresses [#88](https://github.com/example-org/example-package/issues/88)

### Added
- **`Client.retry` option** - Sets the number of retries for failed requests. Defaults to `0`, so existing behavior is unchanged. [Spec: 2-4-0-client-retry](.kiro/specs/2-4-0-client-retry/)
  - New environment variable `CLIENT_RETRY_COUNT` sets the default for every client.
  - Retries use exponential backoff.

### Dependencies
- **`fast-check` 3.15.0 to 3.22.0** - Development dependency. Used by the property tests.
```

## Documentation and internal changes

- **Documentation:** Add an entry for a new or substantially rewritten documentation page or section, or for a correction that would have misled a user. Do not add entries for typos, formatting, or link fixes.
- **Tests, tooling, and CI:** Add an entry only if a contributor or the release process must know about it, such as a new required environment variable or a changed test command.

```markdown
### Added
- **Caching guide** - New `docs/caching.md` covering cache profiles, expiration, and in-memory caching with runnable examples.

### Fixed
- **`Cache` documentation** - Corrected the `ttl` option, which is documented in seconds, not milliseconds.
```

## Breaking changes

A breaking change requires a major version bump and a migration guide. If you are about to log one and the `package.json` version change is not a major bump, stop and ask the user.

```markdown
### Breaking Changes
- **`Foo.get()` parameter renamed** - Renamed parameter `bucketName` to `artifactsBucketName` with no alias.
  - **Migration Guide:** [docs/migration/v2-to-v3.md](docs/migration/v2-to-v3.md)
```

If the old behavior was deprecated first, add a sub-bullet such as `**Deprecation:** Deprecated in v2.5.0.`

## Deprecations

When deprecating:

1. Add `@deprecated` to the JSDoc with migration instructions.
2. Log a deprecation warning when the deprecated feature is used.
3. Add an entry under **Deprecated** that names the replacement.
4. Keep the deprecated feature for at least one major version before removing it.

```markdown
### Deprecated
- **`Foo.fetch()`** - Use `Foo.get()` instead. `Foo.fetch()` logs a warning and is kept through all of v3.x and will be removed no earlier than v4.0.0.
```

## Security entries

- Describe the impact and the fix. Do not include exploit steps, payloads, or code that reproduces the weakness.
- State the affected versions and what users must do (upgrade, change a setting).
- Reference the advisory when one exists, using a GitHub Security Advisory or a CVE.

```markdown
### Security
- **Request path is validated before use** - A crafted path could read files outside the intended directory. Upgrade to this version. Affects v1.2.0 through v1.4.0. [GHSA-xxxx-xxxx-xxxx](https://github.com/example-org/example-package/security/advisories/GHSA-xxxx-xxxx-xxxx)
```

## Spec and issue references

- **Spec link:** The link target is the spec directory in `.kiro/specs/`, relative to `CHANGELOG.md` at the repository root: `[Spec: <directory-name>](.kiro/specs/<directory-name>/)`. Use the exact directory name, and only link a directory that exists.
- **Issue link:** `addresses [#123](<issues-url>/123)`. Take the issues URL from `bugs.url` in `package.json`, or from `repository.url`. If neither exists, ask the user. Do not guess a URL or an issue number.
- An entry with several specs lists each `[Spec: ...]` link, then the issue references.

## Editing existing unreleased entries

Under the `(unreleased)` heading, the agent may:

- Correct or remove an entry that a later change made stale or wrong.
- Merge similar or closely related entries.
- Re-summarize an entry to keep it short and accurate.

When editing, keep every spec link and issue reference from the entries involved, keep the affected version range, and keep the migration or workaround text. Never move an entry out of `(unreleased)` into a released section.

If a later change contradicts an entry in a **released** section, do not edit that section. Add a new entry under `(unreleased)` that states the correction.

## Before finishing

- [ ] The version lookup was repeated in this task, not carried over from the start of the spec.
- [ ] The entry is under the `(unreleased)` heading for the `package.json` version.
- [ ] No dated section and no intro text was changed.
- [ ] Category headings are in the order listed above, and none is empty.
- [ ] The separator is ` - `, and spec and issue links are at the end of the entry.
- [ ] Every spec link points to a directory that exists.
- [ ] Every issue number comes from the spec or the user, not from a guess.
- [ ] Security entries contain no exploit detail.
