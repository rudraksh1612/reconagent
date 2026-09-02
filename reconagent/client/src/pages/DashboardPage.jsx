import { useEffect, useState, useCallback } from "react";
import { Icon } from "../layout/AppShell";
import { api, formatINR } from "../lib/api";

const TONE_CLASSES = {
  secondary: "text-secondary",
  "on-surface": "text-on-surface-variant",
};

function MetricCard({ label, value, icon, tone = "on-surface", span = false, sub }) {
  return (
    <div
      className={`bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col justify-between h-[120px] ${
        span ? "col-span-2" : ""
      }`}
    >
      <div className="flex justify-between items-start">
        <span className="text-body-sm font-body-sm text-on-surface-variant">{label}</span>
        {icon && <Icon name={icon} className={`text-[16px] ${TONE_CLASSES[tone] || TONE_CLASSES["on-surface"]}`} />}
      </div>
      <div className="flex items-end justify-between">
        <div className={span ? "text-display font-display text-primary" : "text-headline-lg font-headline-lg text-on-surface"}>
          {value}
        </div>
        {sub}
      </div>
    </div>
  );
}

function Sparkline({ daily }) {
  if (!daily?.length) {
    return (
      <div className="w-full h-24 rounded border border-outline-variant bg-surface-bright flex items-center justify-center text-body-sm text-on-surface-variant">
        Run a batch to see a projection
      </div>
    );
  }
  const max = Math.max(...daily.map((d) => d.cumulativeExpected), 1);
  const points = daily
    .map((d, i) => `${(i / (daily.length - 1)) * 100},${30 - (d.cumulativeExpected / max) * 28}`)
    .join(" ");
  const areaPath = `M0,30 L${points} L100,30 Z`;
  const linePath = `M${points}`;
  return (
    <div className="w-full h-24 rounded border border-outline-variant bg-surface-bright relative overflow-hidden flex items-end px-sm pb-sm">
      <svg className="w-full h-16 absolute bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 30">
        <path d={areaPath} fill="rgba(211, 228, 254, 0.5)" />
        <path d={linePath} fill="none" stroke="#131b2e" strokeWidth="0.5" />
      </svg>
      <div className="absolute top-sm right-sm bg-surface px-xs py-xs rounded border border-outline-variant text-data-mono font-data-mono text-on-surface z-10 shadow-sm">
        {formatINR(daily[daily.length - 1].cumulativeExpected, { compact: true })} projected
      </div>
    </div>
  );
}

export default function DashboardPage({ batch, onBatchRun, loading, error }) {
  const [bankFile, setBankFile] = useState(null);
  const [ledgerFile, setLedgerFile] = useState(null);
  const [groundTruthFile, setGroundTruthFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.batches());
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory, batch]);

  useEffect(() => {
    if (!batch) return;
    api.forecast(batch.id).then(setForecast).catch(() => setForecast(null));
  }, [batch]);

  return (
    <div className="space-y-md pt-md">
      {/* Run controls */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col md:flex-row md:items-center gap-md justify-between">
        <div>
          <h2 className="text-body-lg font-body-lg font-bold text-on-surface">Run a reconciliation batch</h2>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
            Use the bundled synthetic dataset, or upload your own bank statement and ledger CSVs.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-sm">
          <button
            onClick={onBatchRun}
            disabled={loading}
            className="px-4 py-2 rounded bg-primary text-on-primary hover:opacity-90 transition-opacity text-body-md font-body-md font-medium disabled:opacity-50"
          >
            {loading ? "Reconciling…" : "Run on sample batch"}
          </button>
        </div>
      </section>
      {error && (
        <div className="bg-error-container text-on-error-container border border-error rounded-lg p-md text-body-sm font-body-sm">
          {error}
        </div>
      )}

      {/* Performance Summary Bento Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-sm">
        <MetricCard
          label="Precision"
          value={batch?.accuracy ? `${(batch.accuracy.precision * 100).toFixed(1)}%` : "—"}
          icon="check_circle"
          tone="secondary"
        />
        <MetricCard
          label="Recall"
          value={batch?.accuracy ? `${(batch.accuracy.recall * 100).toFixed(1)}%` : "—"}
          icon="visibility"
        />
        <MetricCard
          label="Match Rate"
          value={batch ? `${(batch.matchRate * 100).toFixed(1)}%` : "—"}
          icon="trending_up"
          tone="secondary"
          span
        />
      </section>

      {/* Cash Forecast */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md space-y-sm">
        <div className="flex justify-between items-center mb-sm">
          <h2 className="text-body-lg font-body-lg font-bold text-on-surface">Cash Forecast (30 Day)</h2>
        </div>
        <Sparkline daily={forecast?.daily} />
      </section>

      {/* Batch history */}
      <section className="space-y-sm">
        <h2 className="text-body-lg font-body-lg font-bold text-on-surface">Recent batches</h2>
        <div className="flex flex-col gap-xs">
          {history.length === 0 && (
            <p className="text-body-sm font-body-sm text-on-surface-variant">No batches run yet.</p>
          )}
          {history.map((b) => (
            <div
              key={b.id}
              className="bg-surface-container-lowest border border-outline-variant rounded-lg p-sm hover:bg-surface-container-low transition-colors"
            >
              <div className="flex justify-between items-center mb-xs">
                <div className="flex items-center gap-sm">
                  <Icon name="account_balance" className="text-on-surface-variant text-[20px]" />
                  <span className="text-body-md font-body-md font-semibold">
                    {b.counts.bankRecords + b.counts.ledgerRecords} records
                  </span>
                </div>
                <span className="text-data-mono font-data-mono text-on-surface-variant text-[11px]">
                  ID: {b.id.slice(0, 8)}
                </span>
              </div>
              <div className="flex items-center gap-sm mb-xs">
                <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${b.matchRate * 100}%` }} />
                </div>
                <span className="text-body-sm font-body-sm font-bold text-primary w-12 text-right">
                  {(b.matchRate * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between text-body-sm font-body-sm text-on-surface-variant">
                <span>{b.counts.matched} matched · {b.counts.exceptions} exceptions</span>
                <span className="text-secondary font-medium">{new Date(b.finishedAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CSV upload */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md">
        <div className="mb-sm">
          <h2 className="text-body-lg font-body-lg font-bold text-on-surface">Bring your own data</h2>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Upload bank and ledger CSVs to run reconciliation and calculate accuracy metrics.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm items-end">
          <label className="flex flex-col text-body-sm font-body-sm text-on-surface-variant gap-1">
            <span className="font-medium text-on-surface">Bank statement CSV *</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setBankFile(e.target.files?.[0] || null)}
              className="text-body-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
            />
          </label>
          <label className="flex flex-col text-body-sm font-body-sm text-on-surface-variant gap-1">
            <span className="font-medium text-on-surface">Ledger CSV *</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setLedgerFile(e.target.files?.[0] || null)}
              className="text-body-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
            />
          </label>
          <label className="flex flex-col text-body-sm font-body-sm text-on-surface-variant gap-1">
            <span className="text-on-surface-variant">Ground Truth CSV <span className="text-xs text-secondary">(Optional)</span></span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setGroundTruthFile(e.target.files?.[0] || null)}
              className="text-body-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
            />
          </label>
        </div>
        <div className="mt-md flex justify-end">
          <button
            onClick={() => onBatchRun({ bankFile, ledgerFile, groundTruthFile })}
            disabled={loading || !bankFile || !ledgerFile}
            className="px-4 py-2 rounded bg-primary text-on-primary hover:opacity-90 transition-opacity text-body-md font-body-md font-medium disabled:opacity-40"
          >
            {loading ? "Reconciling…" : "Run on my files"}
          </button>
        </div>
      </section>
    </div>
  );
}
