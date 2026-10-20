# FUSIONBRIEF

[![Checks](https://github.com/ChanuSong/fusionbrief-osint/actions/workflows/checks.yml/badge.svg)](https://github.com/ChanuSong/fusionbrief-osint/actions/workflows/checks.yml)
**A research copilot that connects conclusions to their sources — and keeps uncertainty visible.**

FUSIONBRIEF turns a research question into a multi-source investigation, a cited report, and an analyst review workflow. It connects claims, original sources, conflicting evidence, risk judgments, and follow-up actions so a reader can inspect why a conclusion was reached.

**[Explore saved reports](https://chanusong.github.io/fusionbrief-osint/)** · [Watch the walkthrough](https://youtu.be/N5J4tvXNMQ4) · [한국어 상세 설명](README.ko.md)

The hosted showcase lets you explore preserved reports and observation snapshots without setup. Run the application locally to investigate a new question.

![FUSIONBRIEF report with evidence and risk analysis](output/submission/screenshots/fusionbrief-01-report.png)

## Why this project

Research can fail even when every paragraph has a citation: a source may be irrelevant to the question, a translated claim may overstate the original, or multiple articles may repeat a single source.

This project makes those checks part of the workflow:

```text
Question → research plan → public sources → evidence checks
         → cited report → analyst review → follow-up actions
```

## Decisions worth inspecting

| Decision | Implementation to explore |
| :--- | :--- |
| Trace claims to original material and distinguish repeated sources from independent evidence. | [Source audit](server/origin-audit.ts) · [Tests](tests/origin-audit.test.ts) |
| Keep criteria, claims, judgments, and evidence connected through explicit types and validation. | [Analysis framework](server/analysis-framework.ts) · [Ontology tests](tests/analysis-ontology.test.ts) |
| Re-evaluate judgments and review state when supporting evidence changes. | [Revalidation](server/framework-revalidation.ts) · [Browser checks](tests/browser/framework.spec.ts) |
| Show partial results and source-access failures during research. | [Collection and research](server/research.ts) · [Progress interface](src/components/ResearchProgress.tsx) |
| Keep synthetic scenarios separate from observed events. | [Scenario tests](tests/synthetic-scenario.test.ts) · [Detailed scope](README.ko.md) |

## Explore in a few minutes

1. Open a [saved report](https://chanusong.github.io/fusionbrief-osint/).
2. Follow a claim to its cited source and inspect the evidence.
3. Review conflicting information, missing evidence, and recommended follow-up actions.
4. Compare the report with the separately labeled synthetic scenario.

The APAC example includes public reporting and observations related to the Korean Peninsula. Risk indicators are qualitative prototype judgments, not official alerts or calibrated forecasts.

## Run locally

Requirements: **Node.js 22.13+**, an authenticated **Cursor CLI** (`agent`), and **`pdftotext`** for PDF extraction.

```sh
git clone https://github.com/ChanuSong/fusionbrief-osint.git
cd fusionbrief-osint
npm ci
agent login
npm run dev
```

Open `http://127.0.0.1:5176`. Optional settings are documented in [`.env.example`](.env.example). On macOS, PDF tools are available through `brew install poppler`; on Linux, install `poppler-utils`.

New analysis uses the connected Cursor account for model and search calls. The static showcase does not run those calls.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run demo:verify
```

Tests cover citation and source checks, research scope, risk constraints, synthetic-data handling, and review behavior. Automated fixtures and browser checks are distinct from live model/search validation.

[Verification history](VERIFICATION-T2-1.md) · [Demo walkthrough](DEMO-T2-1.md) · [Recorded artifacts](output/submission/)

## Stack and scope

React · TypeScript · Vite · Node.js · Cursor CLI · Zod · SQLite FTS5 · React Flow · Cytoscape · Leaflet.

This is a working prototype with recorded public-source runs. Commercial observation feeds and organization-backed authentication for collaborative approval are not integrated. Data availability, source access, and model behavior affect each new run. See the [Korean technical notes](README.ko.md) for implementation boundaries and the context of recorded timing comparisons.

Project by [Chanwoo Song](https://github.com/ChanuSong) · [Portfolio](https://chanwoosong.com/)
