// scoreAgainstGroundTruth.js
// Compares a batch's output against data/groundTruth.json to report honest,
// measured accuracy — not a cherry-picked example. Run after /api/reconcile/run.

const fs = require("fs");
const path = require("path");
const { scoreBatch } = require("../services/accuracy");

const batch = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/batch.json", "utf-8"));
const groundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, "groundTruth.json"), "utf-8"));

const { tp, fp, fn, tn, precision, recall, f1 } = scoreBatch(batch, groundTruth);

console.log("=== Reconciliation accuracy vs. synthetic ground truth ===");
console.log(`Correct matches (TP):        ${tp}`);
console.log(`False matches (FP):          ${fp}  <- matched something that should've been an exception`);
console.log(`Missed matches (FN):         ${fn}  <- should've matched, flagged as exception instead`);
console.log(`Correct exceptions (TN):     ${tn}`);
console.log(`Precision: ${(precision * 100).toFixed(1)}%   Recall: ${(recall * 100).toFixed(1)}%   F1: ${(f1 * 100).toFixed(1)}%`);
console.log(`Overall batch match rate: ${(batch.matchRate * 100).toFixed(1)}%`);

