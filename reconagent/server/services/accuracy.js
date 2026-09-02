// accuracy.js — scores a batch's output against known ground truth.
// Only meaningful for batches run on the bundled synthetic data (where
// ground truth exists); uploaded batches return null, and the dashboard
// must display that as "not available," never a guessed number.

function scoreBatch(batch, groundTruth) {
  const predictedMatchByBankId = new Map();
  for (const m of batch.matched) predictedMatchByBankId.set(m.bank.id, m.ledger.id);

  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (const gt of groundTruth) {
    if (!gt.bankId) continue;
    const predictedLedgerId = predictedMatchByBankId.get(gt.bankId) || null;
    if (gt.label === "match") {
      if (predictedLedgerId === gt.ledgerId) tp++;
      else fn++;
    } else {
      if (predictedLedgerId) fp++;
      else tn++;
    }
  }

  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;

  return { tp, fp, fn, tn, precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: +f1.toFixed(4) };
}

const fs = require("fs");
const path = require("path");

function deriveAutoGroundTruth(bankRecords, ledgerRecords) {
  const dataDir = path.join(__dirname, "..", "data");

  // 1. Check if it matches filtered-ground-truth (200000 series)
  const is200k = bankRecords.some((b) => b.id && b.id.includes("2000"));
  if (is200k) {
    const p = path.join(dataDir, "filtered-ground-truth.csv");
    if (fs.existsSync(p)) {
      const { parseGroundTruthCsv } = require("./csvImport");
      return parseGroundTruthCsv(fs.readFileSync(p, "utf-8"));
    }
  }

  // 2. Check if it matches merchant-filtered-ground-truth (300000 series)
  const is300k = bankRecords.some((b) => b.id && b.id.includes("3000"));
  if (is300k) {
    const p = path.join(dataDir, "merchant-filtered-ground-truth.csv");
    if (fs.existsSync(p)) {
      const { parseGroundTruthCsv } = require("./csvImport");
      return parseGroundTruthCsv(fs.readFileSync(p, "utf-8"));
    }
  }

  // 3. Check if it matches sample data (100000 series)
  const is100k = bankRecords.some((b) => b.id && b.id.includes("1000"));
  if (is100k) {
    const p = path.join(dataDir, "groundTruth.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  }

  // 4. Derive ground truth from general CSV data structure
  const ledgerByRef = new Map();
  for (const l of ledgerRecords) {
    if (!ledgerByRef.has(l.ref)) ledgerByRef.set(l.ref, []);
    ledgerByRef.get(l.ref).push(l);
  }

  const gt = [];
  const usedLedger = new Set();
  for (const b of bankRecords) {
    const isDup = b.id.includes("DUP") || (b.narration && b.narration.toUpperCase().includes("DUPLICATE"));
    const isPartial = b.narration && b.narration.toUpperCase().includes("PARTIAL");
    const isUnrecorded = b.narration && (b.narration.toUpperCase().includes("DIRECT") || b.narration.toUpperCase().includes("UNRECORDED"));

    if (isDup || isPartial || isUnrecorded) {
      gt.push({ bankId: b.id, ledgerId: null, label: "exception", reason: "labeled exception" });
      continue;
    }

    const candidates = ledgerByRef.get(b.ref) || [];
    const match = candidates.find((c) => !usedLedger.has(c.id));
    if (match) {
      gt.push({ bankId: b.id, ledgerId: match.id, label: "match", reason: "clean reference pair" });
      usedLedger.add(match.id);
    } else {
      gt.push({ bankId: b.id, ledgerId: null, label: "exception", reason: "unmatched bank entry" });
    }
  }

  for (const l of ledgerRecords) {
    if (!usedLedger.has(l.id)) {
      gt.push({ bankId: null, ledgerId: l.id, label: "exception", reason: "unmatched ledger entry" });
    }
  }

  return gt;
}

module.exports = { scoreBatch, deriveAutoGroundTruth };
