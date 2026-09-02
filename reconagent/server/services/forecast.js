// forecast.js — "Forward cash forecaster" (the 4th Track 4 example direction).
// Deliberately a transparent heuristic, not a black-box model: each held/
// escalated exception is assigned a recovery probability by cause + a time
// decay curve, and we project cumulative expected cash recovered per day.
// The methodology is returned alongside the numbers so nothing is a black box.

const CAUSE_RECOVERY_PROBABILITY = {
  timing_gap: 0.9,
  partial_payment: 0.55,
  duplicate_bank_entry: 0.3,
  bank_only: 0.35,
  ledger_only: 0.25,
  amount_mismatch: 0.5,
  unclassified: 0.2,
};
const DEFAULT_PROBABILITY = 0.3;
const HALF_LIFE_DAYS = 5; // most recoverable exceptions clear within ~1-2 weeks
const FORECAST_HORIZON_DAYS = 30;

function baseProbability(cause) {
  return CAUSE_RECOVERY_PROBABILITY[cause] ?? DEFAULT_PROBABILITY;
}

// Fraction of an exception's value expected recovered by day D, given its
// base recovery probability p: a simple exponential approach curve.
function cumulativeFractionByDay(p, day) {
  return p * (1 - Math.exp(-day / HALF_LIFE_DAYS));
}

function buildForecast(batch) {
  const recoverable = batch.exceptions.filter(
    (e) => e.verdict.action === "hold_for_review" || e.verdict.action === "escalate"
  );

  const items = recoverable.map((e) => {
    const amount = Math.abs(e.bank?.amount ?? e.ledger?.amount ?? 0);
    const p = baseProbability(e.verdict.cause) * (e.verdict.action === "escalate" ? 0.6 : 1);
    return { id: e.id, amount, probability: p, cause: e.verdict.cause, action: e.verdict.action };
  });

  const atRiskTotal = items.reduce((sum, it) => sum + it.amount, 0);

  const daily = [];
  for (let day = 1; day <= FORECAST_HORIZON_DAYS; day++) {
    const cumulativeExpected = items.reduce(
      (sum, it) => sum + it.amount * cumulativeFractionByDay(it.probability, day),
      0
    );
    daily.push({ day, cumulativeExpected: +cumulativeExpected.toFixed(2) });
  }

  const expectedRecovered30d = daily[daily.length - 1]?.cumulativeExpected ?? 0;
  const expectedUnrecoverable = +(atRiskTotal - expectedRecovered30d).toFixed(2);

  return {
    atRiskTotal: +atRiskTotal.toFixed(2),
    expectedRecovered30d: +expectedRecovered30d.toFixed(2),
    expectedUnrecoverable,
    itemCount: items.length,
    daily,
    methodology: {
      note: "Heuristic projection, not a trained model — each exception's cause maps to a base recovery probability, then approaches that ceiling over time via an exponential decay curve (half-life " + HALF_LIFE_DAYS + " days). Escalated items are further discounted 40% versus held items to reflect higher risk.",
      causeProbabilities: CAUSE_RECOVERY_PROBABILITY,
      halfLifeDays: HALF_LIFE_DAYS,
    },
  };
}

module.exports = { buildForecast };
