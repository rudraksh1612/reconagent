// llmReasoner.js
// For every record the deterministic matcher could NOT confidently resolve,
// this asks an LLM to classify the likely cause and recommend an action.
// If no API key is configured, falls back to a transparent heuristic so the
// whole pipeline still runs end-to-end (never block a demo on a missing key).

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-haiku-4-5-20251001";
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const client = hasKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const VALID_ACTIONS = ["auto_resolve", "hold_for_review", "escalate"];

function heuristicFallback(candidate) {
  const { bank, ledger, bestGuessLedger } = candidate;
  if (!bank) {
    return {
      action: "hold_for_review",
      cause: "ledger_only",
      explanation: "Internal ledger recorded a payment with no matching bank settlement — possibly a failed or pending settlement.",
      confidence: 0.4,
    };
  }
  if (!ledger && !bestGuessLedger) {
    return {
      action: "escalate",
      cause: "bank_only",
      explanation: "Bank statement shows a settlement with no corresponding internal ledger record at all.",
      confidence: 0.35,
    };
  }
  if (bestGuessLedger) {
    const diff = Math.abs(bank.amount - (bestGuessLedger.amount - (bestGuessLedger.fee || 0)));
    if (diff > 0) {
      return {
        action: "hold_for_review",
        cause: "amount_mismatch",
        explanation: `Closest ledger candidate (${bestGuessLedger.ref}) differs by ~${diff.toFixed(2)} — looks like a partial payment or short settlement.`,
        confidence: 0.45,
      };
    }
  }
  return {
    action: "hold_for_review",
    cause: "unclassified",
    explanation: "Could not confidently classify this exception without further data.",
    confidence: 0.2,
  };
}

async function classifyException(candidate) {
  if (!hasKey) {
    return { ...heuristicFallback(candidate), method: "heuristic_fallback" };
  }

  const { bank, ledger, bestGuessLedger } = candidate;
  const prompt = `You are a finance-ops reconciliation assistant. Given ONE unresolved bank/ledger record pair, classify the likely cause and recommend an action.

Bank record: ${bank ? JSON.stringify(bank) : "none"}
Ledger record (exact match candidate): ${ledger ? JSON.stringify(ledger) : "none"}
Closest ledger candidate found by the matcher (may be null): ${bestGuessLedger ? JSON.stringify(bestGuessLedger) : "none"}

Respond with ONLY a JSON object, no prose, no markdown fences, in this exact shape:
{"action": "auto_resolve" | "hold_for_review" | "escalate", "cause": "<short snake_case label>", "explanation": "<one sentence, plain language>", "confidence": <0 to 1 number>}

Guidance: "auto_resolve" only for clearly explainable, low-risk cases (e.g. tiny rounding). "hold_for_review" for ambiguous cases needing a human (partial payments, timing gaps). "escalate" for cases suggesting fraud, duplication, or a missing record entirely.`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text?.trim() || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!VALID_ACTIONS.includes(parsed.action)) throw new Error("invalid action from model");
    return { ...parsed, method: "llm" };
  } catch (err) {
    return { ...heuristicFallback(candidate), method: "heuristic_fallback_after_error", error: String(err.message || err) };
  }
}

module.exports = { classifyException, hasKey };
