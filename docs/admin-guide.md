# Admin Guide — Techademy Interview & Reporting System

This admin guide explains everything an administrator needs to operate, configure, and manage interviews, report templates, candidate workflows, and evaluation settings (including CEFR mode). It is comprehensive — follow the sections below when creating interviews, adjusting templates, interpreting reports, or troubleshooting.

---

## Table of contents

- Overview
- Creating a new interview (step-by-step)
- Interview form fields — meaning & usage
- Report templates — structure and how they impact final reports
- CEFR evaluation mode — what it is and how it affects scoring
- Candidate lifecycle, attempts, and proctor photos
- Generating, regenerating and exporting reports
- Printing and best practices (including known print quirks)
- Bulk uploads, invites, and candidate management
- Troubleshooting & tips
- Recommended integrations (MCPs) and why to connect them

---

## Overview

This application lets admins create interviews (scenarios), attach candidates, capture transcripts and proctor photos, and generate per-attempt evaluation reports. Reports are generated from a report template that defines which parameters are scored, how they are weighted, and how results should be displayed.

Admins can:
- Create and edit interviews and their metadata
- Attach candidates and set per-candidate overrides (e.g., max attempts)
- Upload resumes, send invites, and preview resumes
- View, regenerate, export (CSV/PDF), and print candidate reports
- Enable CEFR evaluation mode to use language-proficiency bands for scoring

---

## Creating a new interview (step-by-step)

1. Navigate to Admin → New Interview.
2. Fill the interview form fields (detailed below).
3. Optionally attach a Report Template (recommended).
4. Save the interview.
5. Add candidates (individually or by bulk upload) and invite them.

Once saved, the interview is listed on the Admin Dashboard. You can edit it later to change context, duration, or the selected report template.

---

## Interview form fields — meaning & usage

Below are fields present on the Interview create/edit form (names match database schema):

- Title (title) — Required
  - User-friendly name for this interview. Appears in lists and report headers.

- Description (description) — Required
  - Longer text describing the interview's purpose, scenario, or instructions.

- Context (context) — Required
  - The contextual prompt or scenario given to the candidate (e.g., role-play situation). This is used by the interview UI and may be summarized in reports.

- Context Summary (contextSummary) — Optional
  - Shorter, human-friendly summary of the context used for quick reference and in certain report spots.

- Context Domain (contextDomain) — Optional
  - A high-level categorization (e.g., "Customer Support", "Sales", "Engineering"). Helps group interviews.

- Interviewer Role (interviewerRole) — Required
  - A textual label that describes the role of the interviewer (shown in reports as "Interviewer Role").

- Duration Minutes (durationMinutes) — Optional
  - Suggested duration for the interview. Not strictly enforced, but used for candidate guidance and scheduling.

- Interaction Mode (interactionMode) — Required (enum: AUDIO | TEXT_ONLY)
  - AUDIO: Candidate interacts using audio (recorded, transcribed) and the system processes audio transcripts.
  - TEXT_ONLY: Candidate interacts via text input only.

- CEFR Evaluation (cefrEvaluation) — Boolean (default: false)
  - When true, report generation attempts to map parameter scores into CEFR bands (A1..C2) and generate CEFR labels per relevant parameters.

- Max Attempts (maxAttempts) — Optional
  - Default number of attempts allowed per candidate for this interview. If a candidate record has a per-candidate override (InterviewCandidate.maxAttempts), that takes precedence.

Notes and validation rules:
- Required fields must be present to create the interview.
- Interaction mode selection affects transcript collection and scoring logic (audio processing pipeline vs. plain text).
- CEFR Evaluation should only be enabled for language-related interviews where CEFR mapping is meaningful.

---

## Report templates — what they are and how they affect final reports

A Report Template is a JSON-based structure that defines how a report is composed. In the database the template is stored as `ReportTemplate.structure` (JSON). When a report is generated, a snapshot of this template structure is saved into the `InterviewReport.structure` field so that historical reports remain stable even if you later edit the template.

A template typically includes:
- A list of parameters (the things you score), each with:
  - id: unique key
  - name: human name shown in reports
  - weight: numeric weight used to compute overall weighted score
  - scale: defines scoring type (e.g., min, max, type=percentage or numeric)
  - cefr: optional mapping settings to output CEFR bands for that parameter
  - description or guidance for raters
- Presentation metadata: sections, ordering, and layout hints
- Summary fields that determine which text is shown at the top/bottom of reports

How templates affect reports:
- Parameter selection: Only parameters present in the template are scored/shown.
- Weights: Overall weighted score is computed by aggregating parameter percentages multiplied by their weights.
- Scales: If a parameter uses a percentage scale vs. a 1–5 numeric scale, the template defines how raw scores map to a percentage.
- CEFR: If enabled globally (interview.cefrEvaluation) and the template provides CEFR mapping for a parameter, the report will include CEFR labels (A1..C2) for that parameter.
- Snapshotting: Each generated report stores a copy of the template structure so future edits do not retroactively change historical reports.

Authoring templates:
- Author templates carefully. Typical parameter configuration includes: id, name, weight, scale.min, scale.max, scale.type.
- Provide guidance text per parameter to help reviewers provide consistent scoring.

---

## CEFR Evaluation mode — explanation and guidance

CEFR (Common European Framework of Reference for Languages) is a standard for describing language proficiency in six bands: A1, A2, B1, B2, C1, C2.

Why CEFR helps:
- Provides a standardized, widely understood rubric for language ability across Listening, Speaking, Reading, and Writing.
- Makes reports comparable across interviews and candidates by mapping raw scores to CEFR bands.

How CEFR is applied in this system:
- Toggle `cefrEvaluation` on the interview to enable CEFR across that interview's reports.
- Templates can include CEFR mapping rules per parameter (for example: score 1 → A1, 2 → A2, 3 → B1, etc.).
- When generating reports with CEFR enabled, the engine will compute both numeric percentage/score values and CEFR band labels wherever mapping is defined.

CEFR band high-level guidance (for inclusion in templates/help):
- A1: Understands and uses basic everyday expressions and simple phrases. Can introduce self and ask basic questions.
- A2: Can understand short, simple messages and interact in routine tasks.
- B1: Can handle everyday conversations, explain opinions and experiences.
- B2: Understands extended speech and communicates clearly on a wide range of topics.
- C1: Understands complex speech, expresses ideas fluently and flexibly.
- C2: Near-native proficiency; understands virtually everything heard or read.

When to use CEFR:
- Use CEFR when the interview is explicitly language-focused (listening, speaking, reading, writing), or when you want standardized proficiency labels rather than raw internal numeric scores.

---

## Candidate lifecycle, attempts, and proctor photos

Key concepts:
- Candidate record: stored in `Candidate` and linked to an `Interview` via `InterviewCandidate`.
- Attempts: Each candidate can have multiple attempts per interview. Attempts are tracked and reported independently.
- Proctor photo: Each attempt can include a proctoring photo captured during the attempt; stored at transcript level and shown in reports.

Per-candidate overrides:
- InterviewCandidate.maxAttempts — allows you to override the interview-level maxAttempts for a specific candidate.

Important UI flows:
- Add candidate: via Add Candidate or bulk upload (zip / multiple resumes).
- Invite candidate: triggers an email with a unique invite link and token; invite count and timestamps are stored.
- Candidate performs attempt(s): the system stores transcripts and proctor photos per attempt.

---

## Generating, regenerating and exporting reports

- Show Report: From the Candidates table, click to open the report side-panel for a candidate. The panel shows the latest available report data, parameter scores, overview ring, summary, and conversation history.

- Regenerate Report: Use the "Regenerate report for this attempt" button to force re-evaluation (server-side) using current report generation logic. This is useful if templates or evaluation logic have changed and you want an updated result for a specific attempt. NOTE: Regenerating will overwrite the most recent `InterviewReport` snapshot for that attempt.

- Export CSV: The Reports page provides an Export CSV action to generate a spreadsheet containing per-candidate/attempt scores and metadata.

- Download PDF / Print: The report side-panel includes a Download PDF action that triggers the browser print pipeline. PDFs are generated via the browser print dialog and may vary slightly across browsers.

Historical data and snapshots:
- When generating a report, the system stores a snapshot of the template (InterviewReport.structure). This preserves historical reports even when you update templates later.

---

## Printing, PDF generation and known quirks

Printing is performed by the browser. The app clones the right-side report panel into a temporary print container and triggers the print API. Important notes:
- Some browsers (notably Chrome) may apply slightly different pagination rules; ensure you preview using the browser's print preview.
- If page duplication or overlap occurs in print preview, ensure you are using the latest version of the app (the system cleans up other DOM nodes during print). If you still experience duplication, the most common causes are custom styles (page-break rules) or third-party CSS interfering with print styles. Review `@media print` rules or disable custom browser extensions.

Best practices for printable reports:
- Use concise content per section (avoid extremely long unbroken elements).
- Add explicit page-break containers in long sections using `.page-break { page-break-after: always; }` where logical.
- Ensure images use `max-width:100%` so they scale across page widths.

---

## Bulk uploads, invites, and candidate management

- Bulk upload: Navigate to the Candidates sheet and choose bulk upload. ZIP files are supported for batch resumes, or upload multiple resume files at once.
- Invite: Click the invite action to send an email invite to the candidate; the system records the invite URL and token.
- Preview resume: Use the resume preview to inspect uploaded resumes via an embedded iframe.

---

## Troubleshooting & tips

- "No scores available" in report: Ensure a report template is attached to the interview and that transcripts/attempts exist for the candidate. If template parameters don't match scores returned by the evaluation service, the report may appear empty.
- Regenerate not updating: Use the "Regenerate report for this attempt" to refresh. If the server fails, inspect server logs or connect Sentry (recommended) to collect errors.
- Print duplication or multiple <body> tags: Avoid opening new print windows. The current flow clones the right-side panel into a top-level container and calls `window.print()` to prevent multiple `<body>` tags and duplications.
- Stale proctor images: The app uses abortable image loader to avoid stale image caching; if you see wrong photos, try closing and reopening the report panel.

---

## Recommended integrations (MCP servers)

You can connect integrations to extend functionality — suggested services and why they help:

- Builder.io — Content management and CMS operations (manage content or help pages).
- Neon — Hosted Postgres; useful for database management and scaling.
- Netlify — Hosting and deployment of the frontend.
- Zapier — Automation and workflows (e.g., automate invites, notifications).
- Figma — Design-to-code flows (use the Builder.io Figma plugin for UI conversion).
- Supabase — Alternative backend for authentication and realtime data.
- Linear ��� Project management and issue tracking.
- Notion — Documentation and knowledge base for internal/external user guides.
- Sentry — Error monitoring and debugging of server and frontend crashes.
- Context7 — Up-to-date docs for libraries and APIs.
- Semgrep — Security scanning and SAST.
- Prisma Postgres — ORM and DB management via Prisma.

To connect MCPs: Open the MCP popover in the Builder.io UI and follow the connection steps for each service.

---

## Final notes

- Always attach a report template to an interview if you want rich, parameterized reports.
- Use CEFR mode for language evaluations, and provide CEFR mappings inside template parameters to generate band labels.
- Keep templates versioned externally or make copies before editing; generated reports snapshot template structure.

If you want, I can also:
- Generate a printable PDF of this guide.
- Populate the in-app Help panel with an "Admin Guide" entry so the panel can show the full guide.
- Create a Notion page or Builder.io CMS model for guides and sync content.

---

*End of Admin Guide*
