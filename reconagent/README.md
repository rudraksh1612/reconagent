# ReconAgent — Explainable Multi-Source Reconciliation Agent



ReconAgent reconciles two transaction sources (a bank/settlement feed and an
internal ledger), auto-resolves everything it can confidently match, and for
everything it can't, an LLM-driven reasoning layer classifies *why* it
didn't match and recommends an action — instead of dumping a flat list of
"unmatched rows." Every decision, matched or not, is written to an
append-only audit trail.

## Why this isn't just a matching script

A rule-based matcher can tell you *that* two records don't line up. It can't
tell you *why*, or what to do about it. ReconAgent splits the problem in
three layers:

1. **Deterministic matching engine** (`server/services/matcher.js`) — exact
   match, then a scored fuzzy match (reference similarity + amount tolerance
   + settlement-date window). Fast, cheap, and it's the ground truth for
   "this is a real match," never the AI.
2. **LLM exception-reasoning layer** (`server/services/llmReasoner.js`) —
   only sees what the deterministic engine couldn't resolve. For each
   exception it classifies a cause (partial payment, duplicate, missing
   record, timing gap...), recommends `auto_resolve` / `hold_for_review` /
   `escalate`, and gives a plain-language reason. If no API key is
   configured, a transparent rule-based fallback keeps the pipeline running
   end-to-end — the demo never breaks on a missing key.
3. **Bounded action policy** (`server/services/reconcile.js`) — the model's
   `auto_resolve` proposal is never taken at face value. It's only honored
   if the amount is under ₹250 *and* confidence is ≥0.75; otherwise it's
   force-downgraded to `hold_for_review` and the override itself is written
   to the audit trail. This is what "explainable, bounded and gated" means
   in practice, not just as a phrase in a README.

On top of that loop, two more pieces make it a tool rather than a fixed demo:

- **Settlement Q&A agent** (`server/services/qaAgent.js`) — ask natural-
  language questions about a batch ("what's the match rate?", "which records
  were escalated?", "were any auto-resolves overridden by policy?") and get
  an answer grounded only in that batch's actual data — it's given a
  condensed JSON summary of the batch and instructed never to invent figures
  not present in it.
- **Forward cash forecaster** (`server/services/forecast.js`) — projects
  expected cash recovered over the next 30 days from held/escalated
  exceptions, using a transparent cause-based recovery-probability heuristic
  with an exponential time-decay curve — not a black-box model, and the
  methodology (probabilities, half-life) is returned alongside the numbers
  so a reviewer can audit the reasoning, not just trust the chart.
- **CSV upload** — reconciliation isn't hardcoded to the bundled synthetic
  files. Upload any bank-statement CSV and ledger CSV (headers:
  `id,ref,merchant,amount,date,narration,fee`) via the dashboard or
  `POST /api/reconcile/run-upload`, and the same pipeline runs on them.

## The dashboard

A full Material Design 3-based React app: a persistent TopAppBar plus a
SideNav (desktop) / BottomNav (mobile) across four sections — Dashboard,
Recon, Q&A, Forecast. Built with Tailwind CSS against the exact M3 color/
type/spacing token set, Framer Motion for page transitions, and Recharts
for the forecast bar chart. Every number on screen — precision, recall,
match rate, the exception list, the forecast curve, the batch history — is
live data from the API, not placeholder content: precision/recall are only
shown when ground truth actually exists (the bundled synthetic dataset),
and honestly display as unavailable for uploaded batches rather than
fabricating a number.

- **Dashboard** — run controls (sample batch or CSV upload), a real
  precision/recall/match-rate bento grid, a cash-forecast sparkline, and
  batch run history.
- **Recon** — the exception list with cause icons, confidence, and a
  policy-override flag styled distinctly (red accent bar) when the bounded
  auto-resolve policy downgraded an action; segmented views for Matched
  records and the full Audit trail.
- **Q&A** — a chat-style interface bound to the Settlement Q&A agent, with
  functional suggestion chips for common questions.
- **Forecast** — the cash-forecaster hero metric, a weekly recovery bar
  chart aggregated from the real 30-day projection, and a high-impact
  exceptions table sorted by amount.

## Measured accuracy (not cherry-picked)

The `data/generateData.js` script produces a 70+ record synthetic batch with
known ground truth (clean matches, reference typos, partial payments,
duplicates, and orphaned records on both sides), and
`data/scoreAgainstGroundTruth.js` scores the pipeline's output against it:

```
Correct matches (TP):        50
False matches (FP):          3
Missed matches (FN):         4
Correct exceptions (TN):     18
Precision: 94.3%   Recall: 92.6%   F1: 93.5%
Overall batch match rate: 79.1%
```

These numbers come from the heuristic fallback path (no LLM key). With an
`ANTHROPIC_API_KEY` set, the exception classification quality improves
further, but the deterministic match rate — which is what the numbers above
mostly reflect — doesn't depend on the LLM at all.

## Architecture

```
 bankStatement.json ─┐
                      ├─> matcher.js (deterministic) ──> matched
 ledger.json ─────────┘         │
                                 └──> unresolved ──> llmReasoner.js ──> exceptions
                                                              │
                                                    (LLM or heuristic fallback)
                                                              │
                                            reconcile.js orchestrates both,
                                            writes every decision to audit.json
                                                              │
                                                  Express API (/api/reconcile/*)
                                                              │
                                                    React dashboard (client/)
```

## Running it

**Backend:**
```bash
cd server
npm install
node data/generateData.js       # generates the synthetic batch + ground truth
cp .env.example .env            # optional — add ANTHROPIC_API_KEY to enable the LLM layer
node index.js                   # runs on :5050
```

**Frontend (dev mode):**
```bash
cd client
npm install
npm run dev                     # proxies /api to :5050
```

**Production build** (single server serves both):
```bash
cd client && npm run build
cd ../server && node index.js   # serves client/dist + the API
```

**Score a batch against ground truth:**
```bash
curl -s -X POST http://localhost:5050/api/reconcile/run -o /tmp/batch.json
node data/scoreAgainstGroundTruth.js /tmp/batch.json
```

## Build challenges & technical obstacles

- **Threshold tuning changed the honesty of the results, not just the
  score.** An early fuzzy-match version accepted a reference-match +
  date-window pair even when the amount didn't align at all — which meant
  genuine partial payments (an exception case by definition) were getting
  silently marked as clean matches. Fixed by requiring a nonzero amount-
  alignment component before any fuzzy match is accepted, not just a
  reference match. This mattered more than the LLM layer for the accuracy
  numbers actually being trustworthy.
- **Reference-typo detection needed a real similarity check, not a guess.**
  The initial fuzzy-reference threshold (0.8) was tuned by intuition and
  silently rejected exactly the single-character-swap typos the synthetic
  data was designed to test. Measuring the actual `string-similarity-js`
  score for the injected typos (0.75) and adjusting the threshold to 0.7
  raised recall from 79.6% to 92.6% — a reminder to check tolerances against
  real data rather than assume them.
- **The pipeline must survive a missing API key.** Since a live demo can't
  depend on an API key being present, every LLM call has a heuristic
  fallback with the same output shape, so the whole reconciliation flow —
  matching, exceptions, audit trail, dashboard — works identically whether
  or not `ANTHROPIC_API_KEY` is set. The dashboard shows which mode is
  active so this is never hidden from the reviewer.
- **Express 5's stricter router rejected a bare `"*"` catch-all route** for
  serving the React build in production; replaced with a regex route
  (`/^(?!\/api).*/`) that excludes `/api/*` explicitly.
- **"Auto-resolve" needed a real ceiling, not just a label.** Early on, the
  LLM's `auto_resolve` recommendation was applied directly — which meant a
  confidently-worded but wrong classification could silently clear a large
  discrepancy. Added a bounded policy layer that caps auto-resolve to small,
  high-confidence cases only; anything else gets force-downgraded to
  `hold_for_review`, with the override itself logged so it's never silent.
- **The Q&A agent had to be stopped from making things up.** An early
  version of the Settlement Q&A feature, given a vague batch summary, would
  sometimes answer with a plausible-sounding but unverifiable number.
  Fixed by feeding it a condensed but complete JSON snapshot of the actual
  batch (matches, exceptions, policy overrides) and explicitly instructing
  it to say when the data doesn't contain an answer, rather than guess.
- **Precision/recall had to be genuinely absent for uploaded data, not
  faked.** Ground truth only exists for the bundled synthetic dataset —
  early UI drafts risked implying an accuracy figure for any batch. The API
  now explicitly returns `accuracy: null` for CSV-uploaded batches, and the
  dashboard renders that as an em dash, never a guessed percentage.

## Tech stack

React (Vite) + Tailwind CSS (Material Design 3 tokens) + Framer Motion +
Recharts · Node.js/Express · JSON-file persistence (swappable for
MongoDB) · Anthropic API for exception reasoning and Settlement Q&A, with a
deterministic fallback for both · CSV upload (multer + csv-parse) for
bring-your-own reconciliation batches.
