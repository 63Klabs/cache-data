---
inclusion: manual
description: "Checks the 63klabs/cache-data GitHub repository for unassigned issues with the label `Approved for Development`, assigns them to the currently logged-in GitHub user, pulls issue details (labels like bug/enhancement, title, body), and creates a new Kiro spec directory with requirements.md containing the issue metadata and a link back to the issue."
---

Check the GitHub repository 63klabs/cache-data for unassigned issues with the label `Approved for Development` using the GitHub CLI (`gh`). For each unassigned issue found:

1. Assign the issue to the currently logged-in GitHub user (`gh api user --jq '.login'` to get the username, then `gh issue edit <number> --repo 63klabs/cache-data --add-assignee <username>`).

2. Get the issue details including title, body, labels, and number using `gh issue view <number> --repo 63klabs/cache-data --json number,title,body,labels,url`.

3. Read the current version from package.json (for example: 1.3.15). Convert dots to hyphens (1-3-15).

4. Create a new spec directory at `.kiro/specs/{version}-{feature-name}/` where feature-name is derived from the issue title in kebab-case.

5. Create a `issue.md` file in that spec directory with the following structure:

```markdown
# {Issue Title}

## Metadata

- **GitHub Issue**: [#{number}]({url})
- **Type**: {labels - e.g., bug, enhancement, documentation, etc.}
- **Assigned**: {username}
- **Created from issue**: {date}

> **Note:** Since this issue was imported directly from GitHub it should be reviewed before a plan or requirements document is generated. Verify the behavior empirically rather than trusting the issue report. All recommendations should be reviewed and challenged to find the correct solution that fits within the project scope and parameters. While the goal may be good, there may be better paths to reaching it. Review every issue as a senior level architect, software engineer, and security analyst before providing recommendations for plan, specs, requirements, design, etc.

## Description

{Issue body content}

```

If there are no unassigned issues, report that there are no unassigned issues to process.

List all issues found and specs created when done.
