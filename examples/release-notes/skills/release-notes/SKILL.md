---
name: release-notes
description: Use when preparing release notes from a Git tag, commit range, or unreleased branch.
---

# Prepare release notes

Confirm the release target and the commit range. If the user has not supplied a range, inspect `git status --short`, `git tag --sort=-version:refname`, and `git log --oneline --decorate -n 20`. Propose the range you would use and ask the user to confirm it when the base or target is unclear.

Keep uncommitted changes separate from committed history. Do not describe working-tree changes as part of a tagged release.

Review the selected range with `git log --format=fuller --name-status <base>..<target>`. Use `git diff --find-renames --stat <base>..<target>` to locate broad changes. Read the relevant file diffs and commit details before writing a note. Commit messages alone do not prove user-visible behavior.

Write notes for users. Include features, fixes, compatibility changes, breaking changes, deprecations, and migration steps only when the code and tests support them. Leave out internal refactors that do not change user behavior.

Give each note a concise evidence line with the commit hash and the relevant repository path. Separate confirmed behavior from questions or missing evidence. Use the [release notes template](references/template.md).

Do not create a commit or tag, publish a release, or edit release files. Ask for an explicit request before taking any of those actions.
