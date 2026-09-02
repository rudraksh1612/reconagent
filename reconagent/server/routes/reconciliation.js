// reconciliation.js — API routes
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();

const { runReconciliationBatch } = require("../services/reconcile");
const { getBatches, getBatch, getAudit } = require("../services/store");
const { hasKey } = require("../services/llmReasoner");
const { parseRecordsCsv, parseGroundTruthCsv } = require("../services/csvImport");
const { answerQuestion } = require("../services/qaAgent");
const { buildForecast } = require("../services/forecast");
const { scoreBatch, deriveAutoGroundTruth } = require("../services/accuracy");

const DATA_DIR = path.join(__dirname, "..", "data");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/status", (req, res) => {
  res.json({ llmConfigured: hasKey, model: hasKey ? "claude-haiku-4-5-20251001" : null });
});

// POST /api/reconcile/run — trigger a batch using the bundled synthetic data files
router.post("/run", async (req, res) => {
  try {
    const bankRecords = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "bankStatement.json"), "utf-8"));
    const ledgerRecords = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "ledger.json"), "utf-8"));
    const batch = await runReconciliationBatch(bankRecords, ledgerRecords);
    // Ground truth exists for this bundled synthetic dataset — score it.
    const groundTruth = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "groundTruth.json"), "utf-8"));
    batch.accuracy = scoreBatch(batch, groundTruth);
    res.json(batch);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// POST /api/reconcile/run-upload — trigger a batch from uploaded CSV files
// Fields: bankFile, ledgerFile, groundTruthFile (optional). Expected CSV headers:
// id,ref,merchant,amount,date,narration,fee(optional, ledger side)
router.post(
  "/run-upload",
  upload.fields([
    { name: "bankFile", maxCount: 1 },
    { name: "ledgerFile", maxCount: 1 },
    { name: "groundTruthFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.files?.bankFile || !req.files?.ledgerFile) {
        return res.status(400).json({ error: "Both bankFile and ledgerFile are required" });
      }
      const bankRecords = parseRecordsCsv(req.files.bankFile[0].buffer);
      const ledgerRecords = parseRecordsCsv(req.files.ledgerFile[0].buffer, { requireFee: true });
      const batch = await runReconciliationBatch(bankRecords, ledgerRecords);

      // Score against uploaded ground truth CSV or auto-derive ground truth
      if (req.files?.groundTruthFile) {
        const groundTruth = parseGroundTruthCsv(req.files.groundTruthFile[0].buffer);
        batch.accuracy = scoreBatch(batch, groundTruth);
      } else {
        const autoGroundTruth = deriveAutoGroundTruth(bankRecords, ledgerRecords);
        if (autoGroundTruth && autoGroundTruth.length > 0) {
          batch.accuracy = scoreBatch(batch, autoGroundTruth);
        } else {
          batch.accuracy = null;
        }
      }

      res.json(batch);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: String(err.message || err) });
    }
  }
);

router.get("/batches", (req, res) => {
  res.json(getBatches());
});

router.get("/batches/:id", (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: "batch not found" });
  res.json(batch);
});

router.get("/audit", (req, res) => {
  res.json(getAudit(req.query.batchId));
});

// POST /api/reconcile/ask — Settlement Q&A over a specific batch's results
router.post("/ask", async (req, res) => {
  try {
    const { batchId, question } = req.body;
    if (!batchId || !question) return res.status(400).json({ error: "batchId and question are required" });
    const batch = getBatch(batchId);
    if (!batch) return res.status(404).json({ error: "batch not found" });
    const result = await answerQuestion(question, batch);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// GET /api/reconcile/forecast/:batchId — projected cash recovery over 30 days
router.get("/forecast/:batchId", (req, res) => {
  const batch = getBatch(req.params.batchId);
  if (!batch) return res.status(404).json({ error: "batch not found" });
  res.json(buildForecast(batch));
});

module.exports = router;
