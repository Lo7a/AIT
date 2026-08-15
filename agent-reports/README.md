# agent-reports

Findings produced by the review agent. This directory contains **documentation only** — no
source code, tests, configuration, or dependencies are ever modified by the agent that writes
here.

## Layout

| Directory | Contents |
|---|---|
| `reviews/` | Code review findings — broad assessments, plan reviews, readiness summaries |
| `bugs/` | Individual defects, one file per defect |
| `features/` | Feature and improvement proposals |

## Report format

Every report carries the same header block and sections:

- **Title** — a specific claim, not a category
- **Report type** — Bug, Review, or Feature
- **Status** — Open until a maintainer closes it
- **Priority** — Critical, High, Medium, or Low
- **Branch / commit** — the exact revision the finding was made against
- **Description**, **Evidence**, **Location** (file, function, line)
- **Impact**, **Reproduction**, **Expected vs current behavior**
- **Recommended direction** — describes a fix, never applies one
- **Acceptance criteria**
- **Open questions and assumptions**

## Evidence standard

Each finding states how it was established:

- **Verified by execution** — the real module was run and the output is quoted in the report.
- **Reasoned from code** — derived by reading the source; plausible but not executed.

Anything not verified is labelled as an assumption rather than presented as fact. Reports are
written against a specific commit and may go stale; check the commit hash in the header before
acting on one.

## Working agreement

The review agent does not fix bugs or implement features. When a fix is wanted, the report is
the handoff artifact — a development agent or a human picks it up from here.

Reports are written in English; quoted Hebrew strings from the codebase are reproduced verbatim.
