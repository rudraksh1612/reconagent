// store.js
// Deliberately simple JSON-file persistence — no external DB service required
// to run the demo. Swappable for MongoDB later (see README "Build Challenges").

const fs = require("fs");
const path = require("path");

const DB_DIR = path.join(__dirname, "..", "db");
const BATCHES_FILE = path.join(DB_DIR, "batches.json");
const AUDIT_FILE = path.join(DB_DIR, "audit.json");

function ensure() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(BATCHES_FILE)) fs.writeFileSync(BATCHES_FILE, "[]");
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, "[]");
}

function readJSON(file) {
  ensure();
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
function writeJSON(file, data) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function saveBatch(batch) {
  const batches = readJSON(BATCHES_FILE);
  batches.unshift(batch); // newest first
  writeJSON(BATCHES_FILE, batches.slice(0, 20)); // keep last 20 runs
  return batch;
}

function getBatches() {
  return readJSON(BATCHES_FILE);
}

function getBatch(id) {
  return readJSON(BATCHES_FILE).find((b) => b.id === id);
}

function appendAudit(entries) {
  const audit = readJSON(AUDIT_FILE);
  const combined = audit.concat(entries);
  writeJSON(AUDIT_FILE, combined);
  return entries;
}

function getAudit(batchId) {
  const audit = readJSON(AUDIT_FILE);
  return batchId ? audit.filter((a) => a.batchId === batchId) : audit;
}

module.exports = { saveBatch, getBatches, getBatch, appendAudit, getAudit };
