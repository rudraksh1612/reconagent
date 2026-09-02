import { useState } from "react";
import { Icon } from "../layout/AppShell";
import { formatINR } from "../lib/api";

const CAUSE_ICON = {
  timing_gap: "schedule",
  partial_payment: "pie_chart",
  duplicate_bank_entry: "content_copy",
  bank_only: "account_balance",
  ledger_only: "receipt_long",
  amount_mismatch: "balance",
};

const ACTION_LABEL = {
  auto_resolve: "Auto-resolve",
  hold_for_review: "Hold",
  escalate: "Escalate",
};

function ExceptionCard({ ex }) {
  const amount = ex.bank?.amount ?? ex.ledger?.amount ?? 0;
  const isOverride = !!ex.verdict.policyOverride;
  const icon = CAUSE_ICON[ex.verdict.cause] || "help";

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-md hover:bg-surface-container-low transition-colors relative overflow-hidden ${
        isOverride ? "border border-error" : "border border-outline-variant"
      }`}
    >
      {isOverride && <div className="absolute top-0 left-0 w-1 h-full bg-error" />}
      <div className={`flex flex-col md:flex-row md:items-start justify-between gap-md mb-md ${isOverride ? "pl-xs" : ""}`}>
        <div className="flex gap-md">
          <div className="h-10 w-10 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center shrink-0">
            <Icon name={icon} />
          </div>
          <div>
            <div className="flex items-center gap-sm mb-xs flex-wrap">
              <h3 className="font-headline-md text-headline-md capitalize">{ex.verdict.cause.replace(/_/g, " ")}</h3>
              {ex.bank?.ref && (
                <span className="bg-surface-container text-on-surface text-label-caps font-label-caps px-2 py-1 rounded-sm uppercase">
                  {ex.bank.ref}
                </span>
              )}
              {isOverride && (
                <span className="bg-error-container text-on-error-container text-label-caps font-label-caps px-2 py-1 rounded-sm uppercase flex items-center gap-xs border border-error">
                  <Icon name="gavel" className="text-[12px]" /> Policy Override
                </span>
              )}
            </div>
            <p className="text-on-surface-variant font-body-sm text-body-sm max-w-2xl">{ex.verdict.explanation}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-xs shrink-0">
          <span className="font-data-mono text-data-mono text-on-surface">{formatINR(amount)}</span>
          <div className="flex items-center gap-xs text-on-surface-variant bg-surface-variant px-2 py-1 rounded-sm">
            <Icon name="bolt" className="text-[14px]" />
            <span className="font-label-caps text-label-caps">{(ex.verdict.confidence * 100).toFixed(0)}% conf</span>
          </div>
        </div>
      </div>
      <div className={`flex flex-wrap gap-sm items-center justify-between pt-md border-t border-outline-variant ${isOverride ? "pl-xs" : ""}`}>
        <div className="flex gap-sm">
          {["auto_resolve", "hold_for_review"].map((a) => {
            const isActive = ex.verdict.action === a;
            const disabled = a === "auto_resolve" && ex.verdict.action !== "auto_resolve";
            return (
              <button
                key={a}
                disabled
                className={`font-body-md text-body-md px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-on-primary"
                    : disabled
                    ? "border border-outline text-on-surface-variant opacity-40 cursor-not-allowed"
                    : "border border-outline text-primary"
                }`}
              >
                {ACTION_LABEL[a]}
              </button>
            );
          })}
        </div>
        <span
          className={`font-body-md text-body-md flex items-center gap-xs ${
            ex.verdict.action === "escalate" ? "text-error font-semibold" : "text-on-surface-variant"
          }`}
        >
          <Icon name="flag" className="text-[16px]" /> {ex.verdict.action === "escalate" ? "Escalated" : "Escalate"}
        </span>
      </div>
      <div className="text-body-sm font-body-sm text-on-surface-variant mt-sm pt-sm border-t border-outline-variant/50">
        via {ex.verdict.method}
      </div>
    </div>
  );
}

function MatchedRow({ m }) {
  return (
    <tr className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
      <td className="p-3 font-data-mono text-data-mono text-primary">{m.bank.ref}</td>
      <td className="p-3 font-data-mono text-data-mono text-on-surface-variant">{m.ledger.ref}</td>
      <td className="p-3 text-body-sm font-body-sm">{m.bank.merchant}</td>
      <td className="p-3 font-data-mono text-data-mono text-right">{formatINR(m.bank.amount)}</td>
      <td className="p-3 text-body-sm font-body-sm">{m.method}</td>
      <td className="p-3 text-body-sm font-body-sm text-right">{(m.confidence * 100).toFixed(0)}%</td>
    </tr>
  );
}

function AuditRow({ a }) {
  return (
    <div className="grid grid-cols-[70px_1fr] md:grid-cols-[70px_120px_180px_1fr] items-center gap-sm py-2 px-3 border-b border-outline-variant text-body-sm font-body-sm">
      <span className="font-data-mono text-data-mono text-on-surface-variant">{a.timestamp.slice(11, 19)}</span>
      <span
        className={`font-label-caps text-label-caps px-2 py-0.5 rounded-sm border w-fit ${
          a.action === "escalate"
            ? "border-error text-error"
            : a.action === "hold_for_review"
            ? "border-tertiary-fixed-dim text-on-tertiary-container"
            : "border-secondary text-secondary"
        }`}
      >
        {a.action.replace(/_/g, " ")}
      </span>
      <span className="hidden md:inline font-data-mono text-data-mono text-on-surface-variant text-[12px]">
        {a.bankId || "—"} ↔ {a.ledgerId || "—"}
      </span>
      <span className="col-span-2 md:col-span-1 text-on-surface">{a.reason}</span>
    </div>
  );
}

export default function ReconPage({ batch, audit }) {
  const [view, setView] = useState("exceptions");

  if (!batch) {
    return (
      <div className="pt-md">
        <p className="text-on-surface-variant font-body-md text-body-md">
          No batch run yet. Head to Dashboard to run one.
        </p>
      </div>
    );
  }

  const highConfidence = batch.exceptions.filter((e) => e.verdict.confidence >= 0.75).length;
  const netVariance = batch.exceptions.reduce((sum, e) => sum + Math.abs(e.bank?.amount ?? e.ledger?.amount ?? 0), 0);

  return (
    <div className="pt-md">
      <div className="mb-lg">
        <h2 className="text-headline-lg font-headline-lg mb-xs">Reconciliation Loop</h2>
        <p className="text-on-surface-variant font-body-md text-body-md">
          AI-identified discrepancies requiring manual review or automated resolution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-lg">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider mb-sm block">
            Total Exceptions
          </span>
          <div className="text-display font-display text-on-surface">{batch.counts.exceptions}</div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider mb-sm block">
            At-Risk Value
          </span>
          <div className="text-display font-display text-error">{formatINR(netVariance, { compact: true })}</div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider mb-sm block">
            High Confidence
          </span>
          <div className="text-display font-display text-on-secondary-container">
            {highConfidence}{" "}
            <span className="text-body-md font-body-md text-on-surface-variant align-middle">
              ({batch.counts.exceptions ? ((highConfidence / batch.counts.exceptions) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-sm mb-md">
        {[
          ["exceptions", `Exceptions (${batch.counts.exceptions})`],
          ["matched", `Matched (${batch.counts.matched})`],
          ["audit", `Audit trail (${audit.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-body-sm font-body-sm font-medium transition-colors ${
              view === key ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "exceptions" && (
        <div className="space-y-md">
          {batch.exceptions.length === 0 && (
            <p className="text-body-sm font-body-sm text-on-surface-variant">No exceptions — clean batch.</p>
          )}
          {batch.exceptions.map((ex) => (
            <ExceptionCard ex={ex} key={ex.id} />
          ))}
        </div>
      )}

      {view === "matched" && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-bright">
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Bank ref</th>
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Ledger ref</th>
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Merchant</th>
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant text-right">Amount</th>
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Method</th>
                <th className="p-3 text-label-caps font-label-caps text-on-surface-variant text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {batch.matched.map((m) => (
                <MatchedRow m={m} key={m.bank.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "audit" && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          {audit.map((a) => (
            <AuditRow a={a} key={a.id} />
          ))}
        </div>
      )}
    </div>
  );
}
