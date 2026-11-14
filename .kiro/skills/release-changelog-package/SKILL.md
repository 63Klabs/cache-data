---
name: release-changelog-package
description: Prepares the CHANGELOG.md section for release. Changes the `(unreleased)` heading for the current package.json version to a release date and adds a short intro under the heading. Run manually when the user is ready to release. Never run on the agent's own initiative.
---
# Release Changelog

Lock the `(unreleased)` section of `CHANGELOG.md` for the current `package.json` version by setting its release date and adding an intro. Changelog rules are in `.kiro/steering/changelog-convention-package.md`. This skill is the only place an agent may write a release date or an intro.

Edit `CHANGELOG.md` only. Do not run `npm version`, run tests, commit, tag, or publish.

## Steps

1. **Find the section.** Read `version` from `package.json`. Search `CHANGELOG.md` for headings that start with `## v<version> `.
   - Exactly one heading, and it ends in `(unreleased)`: continue.
   - The heading has a date: stop. Tell the user the version is already released and that `npm version [major|minor|patch]` is needed for a new cycle.
   - No heading, more than one, or an `(unreleased)` heading for a different version: stop and ask the user.
2. **Choose the date.** Use the date the user gave. Otherwise use today's date from `date +%F`. The format is `YYYY-MM-DD`. If the date is earlier than the previous release heading's date, tell the user and ask which to use.
3. **Review the section without changing entries.** Read everything between this heading and the next `## ` heading. Report, and do not fix, any of these:
   - The section has no entries.
   - A `[Spec: ...]` link points to a directory that does not exist in `.kiro/specs/`.
   - A Breaking Changes entry exists but the version change from the previous release is not a major bump.
   - A Security entry contains exploit steps, payloads, or reproduction code.
   - Categories are out of the steering doc's order, or the entry separator is not ` - `.

   If the section is empty, has a missing spec link, or has an unexplained Breaking Changes entry, ask the user whether to continue before editing. Mention other findings and continue.
4. **Draft the intro.** Base it only on the entries in the section.
   - Write one to three sentences of plain prose. Use more only when the release has Security or Breaking Changes entries.
   - Lead with what users must do: upgrade for a security fix, or migrate for a breaking change. Then name the main themes.
   - Do not add claims, numbers, or features that are not in the entries. Do not use marketing wording. Do not include exploit detail.
   - If the user asked for no intro, skip this step.
   - If prose already sits under the heading, show it and ask whether to keep or replace it.
5. **Apply the edit.** Change the heading to `## v<version> (<date>)`. Place the intro on its own paragraph directly under the heading, with a blank line before the first `###` category. Change nothing else.
6. **Verify.** Run `git diff -- CHANGELOG.md`. The diff must contain only the heading line and the intro lines. Run `grep -n "(unreleased)" CHANGELOG.md` and confirm no `(unreleased)` heading remains.
7. **Report.** Show the diff and the findings from step 3. Say that the user can edit the intro. Do not start the remaining release steps in `AGENTS.md` section 9.1.
