// qaAgent.js — "Settlement Q&A agent" (Track 4 example direction).
// Answers questions about a specific batch, grounded ONLY in that batch's
// own matched/exception/audit data — never invents figures. Falls back to
// a small set of rule-based lookups if no API key is configured.

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-haiku-4-5-20251001";
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const client = hasKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

function summarizeBatchForContext(batch) {
  // Condensed, token-cheap summary — full record dumps would blow up cost
  // and let the model wander off the actual data.
  return {
    counts: batch.counts,
    matchRate: batch.matchRate,
    policy: batch.policy,
    matched: batch.matched.map((m) => ({
      bankRef: m.bank.ref, ledgerRef: m.ledger.ref, merchant: m.bank.merchant,
      amount: m.bank.amount, method: m.method, confidence: m.confidence,
    })),
    exceptions: batch.exceptions.map((e) => ({
      bankRef: e.bank?.ref || null, ledgerRef: e.ledger?.ref || null,
      merchant: e.bank?.merchant || e.ledger?.merchant || null,
      amount: e.bank?.amount ?? e.ledger?.amount ?? null,
      action: e.verdict.action, cause: e.verdict.cause,
      explanation: e.verdict.explanation, confidence: e.verdict.confidence,
      policyOverride: e.verdict.policyOverride || null,
    })),
  };
}

function heuristicAnswer(question, batch) {
  const q = question.toLowerCase();
  const ctx = summarizeBatchForContext(batch);

  if (q.includes("match rate") || q.includes("how many match")) {
    return `Match rate is ${(batch.matchRate * 100).toFixed(1)}% (${batch.counts.matched} matched out of ${batch.counts.bankRecords + batch.counts.ledgerRecords} total records).`;
  }
  if (q.includes("escalat")) {
    const esc = ctx.exceptions.filter((e) => e.action === "escalate");
    return esc.length
      ? `${esc.length} record(s) escalated: ${esc.map((e) => `${e.bankRef || e.ledgerRef} (${e.cause})`).join(", ")}.`
      : "No records were escalated in this batch.";
  }
  if (q.includes("duplicate")) {
    const dups = ctx.exceptions.filter((e) => e.cause?.includes("duplicat"));
    return dups.length
      ? `${dups.length} duplicate-related exception(s): ${dups.map((e) => e.bankRef || e.ledgerRef).join(", ")}.`
      : "No duplicate-related exceptions found.";
  }
  if (q.includes("override") || q.includes("policy")) {
    return `${batch.counts.policyOverrides} auto-resolve proposal(s) were downgraded by the bounded-action policy (cap: ₹${batch.policy.AUTO_RESOLVE_MAX_AMOUNT}, confidence floor: ${batch.policy.AUTO_RESOLVE_MIN_CONFIDENCE}).`;
  }
  return `I can answer this more precisely with an LLM key configured. Without one: this batch has ${batch.counts.matched} matches, ${batch.counts.exceptions} exceptions, and a ${(batch.matchRate * 100).toFixed(1)}% match rate. Try asking about "match rate", "escalations", "duplicates", or "overrides".`;
}

async function answerQuestion(question, batch) {
  if (!hasKey) {
    return { answer: heuristicAnswer(question, batch), method: "heuristic_fallback" };
  }

  const context = summarizeBatchForContext(batch);
  const prompt = `You are a settlement Q&A assistant for a finance-ops reconciliation batch. Answer the user's question using ONLY the data below — never invent figures or records that aren't present. If the data doesn't contain the answer, say so plainly.

Batch data:
${JSON.stringify(context, null, 2)}

Question: "${question}"

Give a concise, factual answer (2-4 sentences max). Reference specific record refs where relevant.`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text?.trim() || "";
    return { answer: text || heuristicAnswer(question, batch), method: "llm" };
  } catch (err) {
    return { answer: heuristicAnswer(question, batch), method: "heuristic_fallback_after_error", error: String(err.message || err) };
  }
}

module.exports = { answerQuestion, hasKey };
