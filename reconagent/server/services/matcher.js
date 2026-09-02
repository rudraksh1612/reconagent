// matcher.js
// Deterministic, rule-based matching engine. Runs BEFORE any LLM call —
// the LLM only ever sees what this engine could not confidently resolve.
// Two passes: exact match, then fuzzy match within tolerance windows.

const { stringSimilarity } = require("string-similarity-js");

const AMOUNT_TOLERANCE = 0.05; // 5% — covers plausible fee/rounding drift
const DATE_WINDOW_DAYS = 3;    // settlement can lag T+0..T+2, allow slack
const FUZZY_REF_THRESHOLD = 0.7;

function daysBetween(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24));
}

function amountClose(a, b, tolerance = AMOUNT_TOLERANCE) {
  const diff = Math.abs(a - b);
  const base = Math.max(a, b, 1);
  return diff / base <= tolerance;
}

function scoreCandidate(bankRec, ledgerRec) {
  let refScore = 0, amountScore = 0, dateScore = 0;
  const reasons = [];

  if (bankRec.ref === ledgerRec.ref) {
    refScore = 0.5;
    reasons.push("exact reference match");
  } else {
    const sim = stringSimilarity(bankRec.ref, ledgerRec.ref);
    if (sim >= FUZZY_REF_THRESHOLD) {
      refScore = 0.35 * sim;
      reasons.push(`fuzzy reference match (${(sim * 100).toFixed(0)}%)`);
    }
  }

  // ledger amount is gross; bank settlement is net of fee. Compare bank
  // amount against both gross and (gross - fee) to catch either convention.
  const netExpected = ledgerRec.fee ? ledgerRec.amount - ledgerRec.fee : ledgerRec.amount;
  if (amountClose(bankRec.amount, netExpected, 0.01)) {
    amountScore = 0.35;
    reasons.push("amount matches net of fee");
  } else if (amountClose(bankRec.amount, ledgerRec.amount, AMOUNT_TOLERANCE)) {
    amountScore = 0.2;
    reasons.push("amount within tolerance");
  }

  const dd = daysBetween(bankRec.date, ledgerRec.date);
  if (dd <= DATE_WINDOW_DAYS) {
    dateScore = 0.15 * (1 - dd / (DATE_WINDOW_DAYS + 1));
    reasons.push(`within ${dd}-day settlement window`);
  }

  return { score: refScore + amountScore + dateScore, amountScore, reasons };
}

/**
 * @param {Array} bankRecords
 * @param {Array} ledgerRecords
 * @returns {{ matched: Array, unmatchedBank: Array, unmatchedLedger: Array }}
 */
function runMatching(bankRecords, ledgerRecords) {
  const matched = [];
  const usedLedgerIds = new Set();
  const usedBankIds = new Set();

  // Pass 1: exact reference + amount-net-of-fee match
  for (const b of bankRecords) {
    const exact = ledgerRecords.find(
      (l) =>
        !usedLedgerIds.has(l.id) &&
        l.ref === b.ref &&
        amountClose(b.amount, l.fee ? l.amount - l.fee : l.amount, 0.01)
    );
    if (exact) {
      matched.push({
        bank: b, ledger: exact,
        confidence: 0.99,
        method: "exact",
        reasons: ["exact reference match", "amount matches net of fee"]
      });
      usedLedgerIds.add(exact.id);
      usedBankIds.add(b.id);
    }
  }

  // Pass 2: fuzzy match on remaining records — pick best-scoring candidate above threshold
  for (const b of bankRecords) {
    if (usedBankIds.has(b.id)) continue;
    let best = null;
    for (const l of ledgerRecords) {
      if (usedLedgerIds.has(l.id)) continue;
      const { score, amountScore, reasons } = scoreCandidate(b, l);
      // Amount alignment is non-negotiable: a reference+date match with no
      // amount agreement is exactly the "partial payment" case that must
      // surface as an exception, not get waved through as a match.
      if (score >= 0.65 && amountScore > 0 && (!best || score > best.score)) {
        best = { ledger: l, score, reasons };
      }
    }
    if (best) {
      matched.push({
        bank: b, ledger: best.ledger,
        confidence: +best.score.toFixed(2),
        method: "fuzzy",
        reasons: best.reasons
      });
      usedLedgerIds.add(best.ledger.id);
      usedBankIds.add(b.id);
    }
  }

  const unmatchedBank = bankRecords.filter((b) => !usedBankIds.has(b.id));
  const unmatchedLedger = ledgerRecords.filter((l) => !usedLedgerIds.has(l.id));

  return { matched, unmatchedBank, unmatchedLedger };
}

module.exports = { runMatching, amountClose, daysBetween };
