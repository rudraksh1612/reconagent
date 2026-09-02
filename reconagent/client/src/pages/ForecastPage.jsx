import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Icon } from "../layout/AppShell";
import { api, formatINR } from "../lib/api";

function aggregateByWeek(daily) {
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const slice = daily.slice(w * 7, w * 7 + 7);
    if (!slice.length) break;
    const startVal = w === 0 ? 0 : daily[w * 7 - 1]?.cumulativeExpected ?? 0;
    const endVal = slice[slice.length - 1].cumulativeExpected;
    weeks.push({ week: `Week ${w + 1}`, recovered: +(endVal - startVal).toFixed(2) });
  }
  return weeks;
}

function ConfidenceBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-surface-variant rounded-full overflow-hidden">
        <div
          className={value >= 0.75 ? "bg-secondary h-full" : value >= 0.5 ? "bg-primary h-full" : "bg-primary-container h-full"}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-body-sm font-body-sm text-on-surface-variant">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

const STATUS_STYLE = {
  escalate: "bg-error-container text-on-error-container border-error",
  hold_for_review: "bg-tertiary-fixed text-on-tertiary-fixed border-tertiary-fixed-dim",
  auto_resolve: "bg-secondary-container text-on-secondary-container border-secondary",
};
const STATUS_ICON = { escalate: "error", hold_for_review: "pending_actions", auto_resolve: "check_circle" };
const STATUS_LABEL = { escalate: "Escalated", hold_for_review: "Pending Review", auto_resolve: "Auto-resolved" };

export default function ForecastPage({ batch }) {
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!batch) return;
    api.forecast(batch.id).then(setForecast).catch((e) => setError(e.message));
  }, [batch]);

  if (!batch) {
    return (
      <div className="pt-md">
        <p className="text-on-surface-variant font-body-md text-body-md">
          No batch run yet. Head to Dashboard to run one.
        </p>
      </div>
    );
  }
  if (error) return <div className="pt-md text-error">{error}</div>;
  if (!forecast) return <div className="pt-md text-on-surface-variant">Projecting recovery curve…</div>;

  const weekly = aggregateByWeek(forecast.daily);
  const highImpact = [...batch.exceptions]
    .sort((a, b) => (b.bank?.amount ?? b.ledger?.amount ?? 0) - (a.bank?.amount ?? a.ledger?.amount ?? 0))
    .slice(0, 8);

  const highConfTotal = forecast.itemCount
    ? batch.exceptions
        .filter((e) => e.verdict.confidence >= 0.6)
        .reduce((s, e) => s + Math.abs(e.bank?.amount ?? e.ledger?.amount ?? 0), 0)
    : 0;

  return (
    <div className="flex flex-col gap-6 pt-md">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-background">Cash Forecaster</h1>
          <p className="text-on-surface-variant text-body-md font-body-md mt-1">
            Projected recovery value for the next 30 days based on this batch's held and escalated exceptions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hero metric */}
        <div className="lg:col-span-4 glass-card rounded-xl p-6 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Icon name="account_balance_wallet" className="text-9xl" />
          </div>
          <h2 className="text-body-lg font-body-lg text-on-surface-variant mb-2">Expected Recovery (30 Days)</h2>
          <div className="text-display font-display text-primary">{formatINR(forecast.expectedRecovered30d)}</div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-surface-variant text-on-surface-variant px-2 py-1 rounded-sm text-label-caps font-label-caps">
              of {formatINR(forecast.atRiskTotal)} at risk
            </span>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex justify-between items-center text-body-sm font-body-sm">
              <span className="text-on-surface-variant">Recoverable</span>
              <span className="font-data-mono text-data-mono">{formatINR(forecast.expectedRecovered30d, { compact: true })}</span>
            </div>
            <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden">
              <div className="bg-secondary h-full" style={{ width: `${(forecast.expectedRecovered30d / (forecast.atRiskTotal || 1)) * 100}%` }} />
            </div>
            <div className="flex justify-between items-center text-body-sm font-body-sm mt-2">
              <span className="text-on-surface-variant">Expected unrecoverable</span>
              <span className="font-data-mono text-data-mono">{formatINR(forecast.expectedUnrecoverable, { compact: true })}</span>
            </div>
            <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden">
              <div className="bg-primary-container h-full" style={{ width: `${(forecast.expectedUnrecoverable / (forecast.atRiskTotal || 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-8 glass-card rounded-xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-headline-md font-headline-md text-on-background">Projected Recovery by Week</h2>
          </div>
          {weekly.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No held/escalated exceptions to project.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekly}>
                <CartesianGrid stroke="#c6c6cd" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#45464d" }} tickLine={false} axisLine={{ stroke: "#c6c6cd" }} />
                <YAxis
                  tick={{ fontSize: 12, fill: "#45464d" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatINR(v, { compact: true })}
                />
                <Tooltip formatter={(v) => formatINR(v)} />
                <Bar dataKey="recovered" fill="#000000" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* High impact exceptions */}
        <div className="lg:col-span-12 glass-card rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
            <h2 className="text-headline-md font-headline-md text-on-background">High Impact Exceptions</h2>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-lowest">
                  <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Ref</th>
                  <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Merchant</th>
                  <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Amount</th>
                  <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Status</th>
                  <th className="p-3 text-label-caps font-label-caps text-on-surface-variant">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {highImpact.length === 0 && (
                  <tr><td className="p-3 text-body-sm text-on-surface-variant" colSpan={5}>No exceptions in this batch.</td></tr>
                )}
                {highImpact.map((ex) => {
                  const amount = ex.bank?.amount ?? ex.ledger?.amount ?? 0;
                  const status = ex.verdict.action;
                  return (
                    <tr key={ex.id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                      <td className="p-3 font-data-mono text-data-mono text-primary font-medium">{ex.bank?.ref || ex.ledger?.ref}</td>
                      <td className="p-3 text-body-sm font-body-sm text-on-surface">{ex.bank?.merchant || ex.ledger?.merchant}</td>
                      <td className="p-3 font-data-mono text-data-mono text-on-surface">{formatINR(amount)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-label-caps font-label-caps border ${STATUS_STYLE[status]}`}>
                          <Icon name={STATUS_ICON[status]} className="text-[14px]" /> {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="p-3"><ConfidenceBar value={ex.verdict.confidence} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
