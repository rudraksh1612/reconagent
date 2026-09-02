// csvImport.js — parses uploaded bank/ledger CSVs into the internal record
// schema. Expected headers: id,ref,merchant,amount,date,narration,fee(optional)

const { parse } = require("csv-parse/sync");

function parseRecordsCsv(buffer, { requireFee = false } = {}) {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map((row, i) => {
    if (!row.id || !row.ref || !row.amount) {
      throw new Error(`Row ${i + 2}: missing required column (id, ref, amount)`);
    }
    const record = {
      id: row.id,
      ref: row.ref,
      merchant: row.merchant || "Unknown",
      amount: parseFloat(row.amount),
      date: row.date || new Date().toISOString().slice(0, 10),
      narration: row.narration || "",
    };
    if (isNaN(record.amount)) throw new Error(`Row ${i + 2}: amount "${row.amount}" is not a number`);
    if (row.fee !== undefined && row.fee !== "") record.fee = parseFloat(row.fee);
    else if (requireFee) record.fee = 0;
    return record;
  });
}

function parseGroundTruthCsv(buffer) {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map((row) => ({
    bankId: row.bankId || row.bank_id || null,
    ledgerId: row.ledgerId || row.ledger_id || null,
    label: row.label || (row.ledgerId && row.bankId ? "match" : "exception"),
    reason: row.reason || "",
  }));
}

module.exports = { parseRecordsCsv, parseGroundTruthCsv };
