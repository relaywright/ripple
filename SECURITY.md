# Security

RIPPLE is a static educational application. It has no user accounts, database, backend, API keys, or intentional telemetry. Scenario sharing places the scenario in the URL, so shared inputs should be treated as public. Do not put confidential information in a scenario name or file.

The relevant security boundaries are imported JSON and URL inputs, generated downloads, dependency updates, and the static hosting environment. Imported data must never become executable HTML or code. Computation must remain bounded.

## Report a vulnerability

If the repository's **Security > Advisories > Report a vulnerability** option is available, use it for a private report. Include the affected revision, a minimal reproduction, and the impact you can demonstrate. Do not include personal information, private credentials, or someone else's data.

If private reporting is unavailable, open an issue asking the maintainer to enable it without posting exploit details. Ordinary model accuracy issues and usability problems belong in the issue tracker.

Security fixes target the current main branch. This small project has no guaranteed response window or formal support commitment. The MIT license's warranty terms apply.
