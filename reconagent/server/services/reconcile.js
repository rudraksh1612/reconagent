// reconcile.js — orchestrates one end-to-end reconciliation batch:
// deterministic match -> LLM exception reasoning -> audit trail -> summary.

const { v4: uuidv4 } = require("uuid");
const { runMatching } = require("./matcher");
const { classifyException } = require("./llmReasoner");
const { saveBatch, appendAudit } = require("./store");

// ---- Bounded action policy -------------------------------------------
// The LLM (or heuristic) proposes an action, but it never has unchecked
// authority to auto-resolve money. A proposal is only honored as-is if it
// clears BOTH gates below; otherwise it's downgraded and the downgrade
// itself is written to the audit trail so the override is never silent.
const AUTO_RESOLVE_MAX_AMOUNT = 250;      // ₹ — small enough that auto-clearing carries little risk
const AUTO_RESOLVE_MIN_CONFIDENCE = 0.75; // model must be genuinely confident, not just non-committal

function applyBoundedPolicy(verdict, candidate) {
  if (verdict.action !== "auto_resolve") return verdict;

  const amount = candidate.bank?.amount ?? candidate.ledger?.amount ?? Infinity;
  const withinAmountBound = Math.abs(amount) <= AUTO_RESOLVE_MAX_AMOUNT;
  const withinConfidenceBound = (verdict.confidence ?? 0) >= AUTO_RESOLVE_MIN_CONFIDENCE;

  if (withinAmountBound && withinConfidenceBound) return verdict;

  const failedGate = !withinAmountBound ? `amount ₹${amount} exceeds ₹${AUTO_RESOLVE_MAX_AMOUNT} auto-resolve cap`
    : `confidence ${verdict.confidence} below ${AUTO_RESOLVE_MIN_CONFIDENCE} auto-resolve floor`;

  return {
    ...verdict,
    action: "hold_for_review",
    explanation: `${verdict.explanation} [Downgraded from auto_resolve by policy: ${failedGate}]`,
    policyOverride: { originalAction: "auto_resolve", reason: failedGate },
  };
}

function findClosestLedgerCandidate(bank, ledgerRecords) {
  if (!bank || ledgerRecords.length === 0) return null;
  let best = null, bestDiff = Infinity;
  for (const l of ledgerRecords) {
    const net = l.fee ? l.amount - l.fee : l.amount;
    const diff = Math.abs(bank.amount - net);
    if (diff < bestDiff) { bestDiff = diff; best = l; }
  }
  return best;
}

async function runReconciliationBatch(bankRecords, ledgerRecords) {
  const batchId = uuidv4();
  const startedAt = new Date().toISOString();
  const auditEntries = [];

  const { matched, unmatchedBank, unmatchedLedger } = runMatching(bankRecords, ledgerRecords);

  for (const m of matched) {
    auditEntries.push({
      id: uuidv4(), batchId, timestamp: new Date().toISOString(),
      action: "auto_matched", method: m.method, confidence: m.confidence,
      bankId: m.bank.id, ledgerId: m.ledger.id,
      reason: m.reasons.join("; "),
    });
  }

  // Build exception candidates: unmatched bank records (with best-guess ledger
  // candidate for context) + genuinely orphaned ledger records.
  const exceptions = [];

  for (const bank of unmatchedBank) {
    const bestGuessLedger = findClosestLedgerCandidate(bank, unmatchedLedger);
    const rawVerdict = await classifyException({ bank, ledger: null, bestGuessLedger });
    const verdict = applyBoundedPolicy(rawVerdict, { bank, ledger: bestGuessLedger });
    exceptions.push({ id: uuidv4(), bank, ledger: bestGuessLedger || null, verdict });
    auditEntries.push({
      id: uuidv4(), batchId, timestamp: new Date().toISOString(),
      action: verdict.action, method: verdict.method, confidence: verdict.confidence,
      bankId: bank.id, ledgerId: bestGuessLedger?.id || null,
      reason: `${verdict.cause}: ${verdict.explanation}`,
    });
  }

  const matchedLedgerIds = new Set(matched.map((m) => m.ledger.id));
  const bestGuessedLedgerIds = new Set(
    unmatchedBank.map((b) => findClosestLedgerCandidate(b, unmatchedLedger)?.id).filter(Boolean)
  );
  for (const ledger of unmatchedLedger) {
    if (matchedLedgerIds.has(ledger.id) || bestGuessedLedgerIds.has(ledger.id)) continue;
    const rawVerdict = await classifyException({ bank: null, ledger, bestGuessLedger: null });
    const verdict = applyBoundedPolicy(rawVerdict, { bank: null, ledger });
    exceptions.push({ id: uuidv4(), bank: null, ledger, verdict });
    auditEntries.push({
      id: uuidv4(), batchId, timestamp: new Date().toISOString(),
      action: verdict.action, method: verdict.method, confidence: verdict.confidence,
      bankId: null, ledgerId: ledger.id,
      reason: `${verdict.cause}: ${verdict.explanation}`,
    });
  }

  const totalRecords = bankRecords.length + ledgerRecords.length;
  const matchRate = totalRecords ? (matched.length * 2) / totalRecords : 0;
  const policyOverrides = exceptions.filter((e) => e.verdict.policyOverride).length;

  const batch = {
    id: batchId,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: {
      bankRecords: bankRecords.length,
      ledgerRecords: ledgerRecords.length,
      matched: matched.length,
      exceptions: exceptions.length,
      policyOverrides,
    },
    policy: { AUTO_RESOLVE_MAX_AMOUNT, AUTO_RESOLVE_MIN_CONFIDENCE },
    matchRate: +matchRate.toFixed(4),
    matched,
    exceptions,
  };

  saveBatch(batch);
  appendAudit(auditEntries);

  return batch;
}

module.exports = { runReconciliationBatch };
