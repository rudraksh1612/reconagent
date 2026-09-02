// generateData.js
// Produces two synthetic transaction sources (bank/settlement feed + internal ledger)
// with deliberately injected real-world mismatch patterns, and a ground-truth file
// so we can measure the reconciliation engine's accuracy honestly.

const fs = require("fs");
const path = require("path");

const OUT_DIR = __dirname;
const RECORD_COUNT = 70; // > 50 as required by the brief

const MERCHANTS = [
  "Kaveri Textiles", "Nimbus Foods", "Verve Fitness", "Orchid Clinic",
  "Sundown Cafe", "Trailhead Logistics", "Bluewave Studio", "Anchor Books",
  "Padma Electronics", "Solstice Travel"
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}
function pad(n, len = 6) {
  return String(n).padStart(len, "0");
}
function dateStr(base, offsetDays = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function typo(str) {
  // swap two adjacent chars near the end to simulate a data-entry typo
  if (str.length < 4) return str;
  const i = str.length - 3;
  const chars = str.split("");
  [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  return chars.join("");
}

const baseDate = "2026-08-01";

const bankStatement = [];
const ledger = [];
const groundTruth = []; // { bankId, ledgerId|null, label, reason }

let txnSeq = 100000;

for (let i = 0; i < RECORD_COUNT; i++) {
  txnSeq++;
  const ref = `RZP${pad(txnSeq)}`;
  const merchant = pick(MERCHANTS);
  const amount = rand(500, 85000) + rand(0, 99) / 100;
  const day = rand(0, 20);
  const settleDay = day + rand(0, 2); // settlement often lags T+0..T+2
  const fee = +(amount * 0.02).toFixed(2); // 2% payment gateway fee

  const bankId = `BNK-${pad(txnSeq)}`;
  const ledgerId = `LED-${pad(txnSeq)}`;

  const scenario = rand(1, 100);

  if (scenario <= 55) {
    // 1. Clean match — same ref, amount net of fee, timing offset
    bankStatement.push({
      id: bankId, ref, merchant,
      amount: +(amount - fee).toFixed(2),
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${ref} ${merchant}`
    });
    ledger.push({
      id: ledgerId, ref, merchant,
      amount: +amount.toFixed(2),
      fee,
      date: dateStr(baseDate, day),
      narration: `Payment received - ${merchant}`
    });
    groundTruth.push({ bankId, ledgerId, label: "match", reason: "clean settlement net of fee" });

  } else if (scenario <= 68) {
    // 2. Reference typo — should be caught by fuzzy match
    bankStatement.push({
      id: bankId, ref: typo(ref), merchant,
      amount: +(amount - fee).toFixed(2),
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${typo(ref)} ${merchant}`
    });
    ledger.push({
      id: ledgerId, ref, merchant,
      amount: +amount.toFixed(2),
      fee,
      date: dateStr(baseDate, day),
      narration: `Payment received - ${merchant}`
    });
    groundTruth.push({ bankId, ledgerId, label: "match", reason: "reference typo, fuzzy matchable" });

  } else if (scenario <= 78) {
    // 3. Partial payment — bank shows less than ledger expects
    const partial = +(amount * 0.6 - fee).toFixed(2);
    bankStatement.push({
      id: bankId, ref, merchant,
      amount: partial,
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${ref} ${merchant} PARTIAL`
    });
    ledger.push({
      id: ledgerId, ref, merchant,
      amount: +amount.toFixed(2),
      fee,
      date: dateStr(baseDate, day),
      narration: `Payment received - ${merchant}`
    });
    groundTruth.push({ bankId, ledgerId, label: "exception", reason: "partial payment - amount mismatch" });

  } else if (scenario <= 86) {
    // 4. Duplicate entry on the bank side
    bankStatement.push({
      id: bankId, ref, merchant,
      amount: +(amount - fee).toFixed(2),
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${ref} ${merchant}`
    });
    bankStatement.push({
      id: `${bankId}-DUP`, ref, merchant,
      amount: +(amount - fee).toFixed(2),
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${ref} ${merchant}`
    });
    ledger.push({
      id: ledgerId, ref, merchant,
      amount: +amount.toFixed(2),
      fee,
      date: dateStr(baseDate, day),
      narration: `Payment received - ${merchant}`
    });
    groundTruth.push({ bankId, ledgerId, label: "match", reason: "primary entry matches" });
    groundTruth.push({ bankId: `${bankId}-DUP`, ledgerId: null, label: "exception", reason: "duplicate bank entry, no second ledger record" });

  } else if (scenario <= 94) {
    // 5. Missing on ledger side entirely (bank has it, internal system never recorded it)
    bankStatement.push({
      id: bankId, ref, merchant,
      amount: +(amount - fee).toFixed(2),
      date: dateStr(baseDate, settleDay),
      narration: `SETTLEMENT ${ref} ${merchant}`
    });
    groundTruth.push({ bankId, ledgerId: null, label: "exception", reason: "no corresponding ledger record" });

  } else {
    // 6. Missing on bank side (ledger recorded a payment that never settled / failed)
    ledger.push({
      id: ledgerId, ref, merchant,
      amount: +amount.toFixed(2),
      fee,
      date: dateStr(baseDate, day),
      narration: `Payment received - ${merchant}`
    });
    groundTruth.push({ bankId: null, ledgerId, label: "exception", reason: "no corresponding bank settlement" });
  }
}

fs.writeFileSync(path.join(OUT_DIR, "bankStatement.json"), JSON.stringify(bankStatement, null, 2));
fs.writeFileSync(path.join(OUT_DIR, "ledger.json"), JSON.stringify(ledger, null, 2));
fs.writeFileSync(path.join(OUT_DIR, "groundTruth.json"), JSON.stringify(groundTruth, null, 2));

console.log(`Generated ${bankStatement.length} bank records, ${ledger.length} ledger records, ${groundTruth.length} ground-truth labels.`);
