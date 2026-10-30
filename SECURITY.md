# Security

Marketing OS stores other companies' marketing data. Treat vulnerabilities accordingly.

## Supported versions

| Version | Security fixes |
| --- | --- |
| `main` before the first release | Best effort while the project is pre-alpha |
| The latest minor of a tagged release | Yes, once releases exist |

There is no release tag yet. See `tasks.md`.

## Reporting

Do not open a public GitHub issue for a security problem.

Email the maintainer. Until a dedicated address is published in this file, use the contact on the GitHub profile that owns this repository and put `SECURITY` in the subject.

Include:

- a description of the issue,
- the version or commit,
- steps to reproduce,
- whether tenant data could be exposed.

You will get an acknowledgement within 7 days. A fix or a documented mitigation is the goal within 30 days for issues that cross a tenant boundary. Those times are a target, not an SLA. An SLA is an enterprise contract ([COMMERCIAL.md](COMMERCIAL.md)).

## What we want to hear about

- A tenant reading or writing another tenant's rows, embeddings, logs or prompts
- Authentication or invitation bypass
- Secret leakage (tokens in logs, error bodies, or the repository)
- Missing row-level security on a tenant table
- An action executing against a marketing platform without the required approval

## What to leave in a normal issue

Feature requests, documentation gaps, and bugs that do not cross a trust boundary.
