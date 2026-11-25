# 🎯 gtm-icp-score

> **ESLint for your Ideal Customer Profile** — declarative, explainable, and deterministic account scoring.

[![npm version](https://img.shields.io/npm/v/gtm-icp-score.svg)](https://www.npmjs.com/package/gtm-icp-score)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

---

## Why This Exists

Most GTM teams run into the same pitfalls with lead and account scoring:
1. **Hard-coded in spreadsheets:** ICP matching logic is buried inside Clay or Excel formula columns that break silently when schemas shift.
2. **Locked inside CRM silos:** HubSpot and Salesforce scoring models cannot be version-controlled, tested in CI, or ported to another tool.
3. **Black box & unexplainable:** Sales reps don't trust numeric scores without knowing *why* an account scored high and what data points were verified.
4. **Silent missing data degradation:** Accounts with missing data simply get 0 points, confusing "unqualified" with "un-enriched".

`gtm-icp-score` solves this by treating your ICP as **versioned code**. Define your criteria in a clean YAML or JSON profile, validate it with CI, pipe account data (CSV, JSON, or stdin) through it, and receive deterministic scores with confidence levels, missing field warnings, and rule-by-rule explanations.

---

## Features

- 📜 **Declarative Profile-as-Code:** Version-control your ICP in Git (`icp.yaml`).
- 🔍 **Explainable Diagnostics:** Inspect why an account scored the way it did, which rules fired, and disqualification reasons.
- 🛑 **Hard Disqualifiers:** Instantly gate unqualified accounts (industry, revenue, geography) before wasting credits.
- ⚖️ **Weighted Category Scoring:** Group attributes into categories (firmographics, technographics, engagement) with weights summing to 100%.
- ⚡ **Time-Decaying Signals:** Boost scores with recency-weighted events (funding, hiring sprees, product launches).
- 🎯 **Confidence & Data Completeness:** Distinguish between a genuine bad fit and an account missing critical data points.
- 📊 **Standalone HTML Reports:** Generate zero-dependency visual dashboards with tier distribution, category heatmaps, and scorecards.
- 🔌 **Dual Interface:** Use as a fast CLI tool or import directly into Node.js, n8n, or backend microservices.

---

## Quickstart

Requires Node.js 20 or newer.

```bash
# Clone and install
git clone https://github.com/your-org/gtm-icp-score.git
cd gtm-icp-score
npm install

# Run scoring on sample B2B SaaS accounts
node bin/cli.js run examples/b2b-saas.yaml examples/accounts.csv
```

### 1. View Terminal Table Output

```bash
node bin/cli.js run examples/b2b-saas.yaml examples/accounts.csv
```

Outputs:
```text
┌─────────────────────┬──────────────────────┬───────┬────────────────┬──────────────────┬───────────────────────────────────┐
│ Account ID          │ Company              │ Score │ Tier           │ Confidence       │ Top Missing Fields                │
├─────────────────────┼──────────────────────┼───────┼────────────────┼──────────────────┼───────────────────────────────────┤
│ acme-corp           │ Acme Corp            │   100 │ tier_1         │ High (100%)      │ None                              │
│ cloudnova-systems   │ CloudNova Systems    │    99 │ tier_1         │ High (100%)      │ None                              │
│ techflow-inc        │ TechFlow Inc         │    98 │ tier_1         │ High (100%)      │ None                              │
│ datastream-io       │ DataStream IO        │    94 │ tier_1         │ High (100%)      │ None                              │
│ gov-tech            │ GovTech Solutions    │    90 │ disqualified   │ High (100%)      │ None                              │
│ ...                 │ ...                  │   ... │ ...            │ ...              │ ...                               │
└─────────────────────┴──────────────────────┴───────┴────────────────┴──────────────────┴───────────────────────────────────┘
```

### 2. Generate a Standalone HTML Report

```bash
node bin/cli.js run examples/b2b-saas.yaml examples/accounts.csv --format html -o report.html
```

Open `report.html` in any browser. It contains interactive expanders, tier breakdown charts, confidence metrics, and missing field analyses with zero external dependencies.

### 3. Explain an Account Score

```bash
node bin/cli.js explain examples/b2b-saas.yaml examples/accounts.csv --account acme-corp
```

Outputs:
```text
═══════════════════════════════════════════════════════════════
  Score Explanation: Acme Corp (acme-corp)
═══════════════════════════════════════════════════════════════

  Summary: tier_1 (enterprise_ae) — Score: 100/100, Confidence: High (100%)

  Category Breakdown
  ───────────────────────────────────────────────────────────
  firmographics (weight: 30%)
    ████████████████████ 100%  raw: 100/100 → weighted: 30/30
      ✓ revenue: 25000000  [range]  100/100
      ✓ employee_count: 800  [range]  100/100
      ✓ industry: Technology  [exact_match]  100/100
      ✓ headquarters_country: US  [exact_match]  100/100

  technographics (weight: 25%)
    ████████████████████ 100%  raw: 100/100 → weighted: 25/25
      ✓ tech_stack: React;Node.js;Python;Docker;Kubernetes  [contains_any]  100/100
      ✓ has_api: true  [exists]  80/80
      ✓ cloud_provider: AWS  [exact_match]  100/100

  ...
```

### 4. Aggregate Scoring Summary

```bash
node bin/cli.js summary examples/b2b-saas.yaml examples/accounts.csv
```

---

### 5. Compare ICP Profiles Before Changing Routing

Run both profiles on one account export to see how a proposed scoring change affects scores, tiers, routing actions, disqualification, and confidence.

```bash
node bin/cli.js compare examples/b2b-saas.yaml examples/dev-tools.yaml examples/accounts.csv --format json
```

Both profiles use the same evaluation time for signal decay. The report counts changed and unchanged records and shows before and after values for each changed record. The `inputRow` is the 1-based account position, which distinguishes repeated or missing account IDs. Use `-` as the data path to read from stdin, or `-o comparison.json` to save JSON. The default output is a terminal summary.

## ICP Profile Specification (`icp.yaml`)

An ICP profile is a YAML or JSON file containing 5 sections:

```yaml
metadata:
  name: "B2B SaaS Mid-Market"
  version: "1.0.0"
  description: "ICP targeting mid-market cloud-native businesses"
  author: "GTM Architecture"
  last_updated: "2026-11-22"

# 1. Hard Disqualifiers — Immediate gates
disqualifiers:
  - field: revenue
    operator: less_than
    value: 1000000
    reason: "Revenue below $1M minimum"
  - field: employee_count
    operator: less_than
    value: 10
    reason: "Too few employees"
  - field: industry
    operator: in
    value: [Government, Education, Non-Profit]
    reason: "Industry not in target market"

# 2. Weighted Scoring Categories (weights must sum to 100)
scoring:
  firmographics:
    weight: 30
    attributes:
      - field: revenue
        rule: range
        ranges:
          - min: 10000000
            max: null
            score: 100
          - min: 5000000
            max: 10000000
            score: 80
          - min: 1000000
            max: 5000000
            score: 50
      - field: industry
        rule: exact_match
        values:
          Technology: 100
          Financial Services: 90
          Healthcare: 80
      - field: headquarters_country
        rule: exact_match
        values:
          US: 100
          UK: 90
          Canada: 85

  technographics:
    weight: 35
    attributes:
      - field: tech_stack
        rule: contains_any
        values: [React, Node.js, Python, Kubernetes, Docker]
        match_scoring:
          "4+": 100
          "2-3": 70
          "1": 40
      - field: has_api
        rule: exists
        score_if_present: 80
        score_if_missing: 0

  engagement:
    weight: 35
    attributes:
      - field: website_visits
        rule: threshold
        thresholds:
          - min: 20
            score: 100
          - min: 10
            score: 70
          - min: 5
            score: 40
      - field: demo_requested
        rule: exists
        score_if_present: 100
        score_if_missing: 0

# 3. Tiers & Routing Actions
tiers:
  - name: "tier_1"
    min_score: 80
    action: "enterprise_ae"
  - name: "tier_2"
    min_score: 60
    action: "sdr_outreach"
  - name: "tier_3"
    min_score: 40
    action: "nurture_sequence"
  - name: "unqualified"
    min_score: 0
    action: "suppress"

# 4. Signal Boosters (optional time-decay points)
signals:
  - name: "Recent Funding"
    field: "recent_funding_date"
    boost: 15
    decay_days: 90
  - name: "Executive Hiring"
    field: "exec_hiring_date"
    boost: 10
    decay_days: 60
```

---

## Scoring Rules Reference

| Rule Type | Description | Key Properties |
|---|---|---|
| `range` | Numeric value tested against ascending/descending ranges | `ranges: [{ min, max, score }]` |
| `exact_match` | Exact or case-insensitive string matching | `values: { "Key": score }` |
| `contains_any` | Semicolon or array list contains any matching items | `values: [...]`, `match_scoring: { "4+": 100, ... }` |
| `contains_all` | Semicolon or array list contains all required items | `values: [...]`, `score: 100` |
| `regex` | Regular expression pattern matching on string fields | `pattern: "...", flags: "i", score: 100` |
| `threshold` | Value meets or exceeds numeric thresholds | `thresholds: [{ min, score }]` |
| `exists` | Field is populated and truthy | `score_if_present: 100, score_if_missing: 0` |

### Disqualifier Operators

- `less_than` — numeric less than value
- `greater_than` — numeric greater than value
- `equals` — exact match
- `not_equals` — mismatch
- `in` — value is inside array
- `not_in` — value is not inside array
- `required` — field must not be empty/null

---

## CLI Reference

```text
icp-score run <profile> <data>       Score accounts against an ICP profile
icp-score validate <profile>         Validate an ICP profile definition
icp-score explain <profile> <data>   Detailed score explanation for one account
icp-score init                       Generate a starter ICP template
icp-score summary <profile> <data>   Aggregate scoring statistics
icp-score compare <baseline> <candidate> <data>   Compare account scores and routing across profiles
```

### Options

| Flag | Meaning |
|---|---|
| `--format, -f <format>` | Output format: `table`, `json`, `csv`, `html` (default: `table`). `compare` supports `table` and `json` |
| `-o, --output <file>` | Write report or template directly to file |
| `--account, -a <id>` | Account ID for the `explain` command |
| `--no-color` | Disable ANSI terminal colors |
| `--help, -h` | Display usage instructions |
| `--version, -v` | Display version |

### Stdin Pipeline Support

```bash
# Pipe JSON from curl or database directly
cat accounts.json | node bin/cli.js run examples/b2b-saas.yaml -
```

---

## Library Usage

`gtm-icp-score` is an importable ES module for custom pipelines or microservices:

```javascript
import { scoreAccount, scoreAccounts, generateSummary } from 'gtm-icp-score';
import { loadProfile, loadAccounts } from 'gtm-icp-score/loader';
import { validateProfile } from 'gtm-icp-score/validator';

// 1. Load and validate profile
const profile = await loadProfile('./examples/b2b-saas.yaml');
const validation = validateProfile(profile);

if (!validation.valid) {
  throw new Error(`Profile errors: ${validation.errors.join(', ')}`);
}

// 2. Score a single account
const account = {
  account_id: 'acme-corp',
  company_name: 'Acme Corp',
  revenue: 25000000,
  employee_count: 800,
  industry: 'Technology',
  headquarters_country: 'US',
  tech_stack: ['React', 'Node.js', 'Python'],
  has_api: true,
  cloud_provider: 'AWS',
};

const result = scoreAccount(profile, account);

console.log(result.totalScore); // 100
console.log(result.tier.name);  // "tier_1"
console.log(result.tier.action); // "enterprise_ae"
console.log(result.confidence); // { rating: 'High', percentage: 100 }
console.log(result.disqualified); // false
```

---

## Related Projects

| Project | Focus | Relationship |
|---|---|---|
| **[GTM Signal Lab](https://github.com/stephenstilwell/gtm-signal-lab)** | Captures public signals, tracks evidence, and evaluates hypotheses | Feeds captured market events into `gtm-icp-score` |
| **[GTM Pipeline Audit](https://github.com/stephenstilwell/gtm-pipeline-audit)** | Audits waterfall routing mechanics and lead hygiene | Audits waterfall plumbing; `gtm-icp-score` audits the ICP logic |
| **[GTM Workflow Preflight](https://github.com/stephenstilwell/gtm-workflow-preflight)** | Regression-tests automated routing decisions | Tests routing rules against `gtm-icp-score` ground truths |

---

## License

[MIT](LICENSE)
