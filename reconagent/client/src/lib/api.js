const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function json(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Backend error (${res.status}): Please make sure the backend server (port 5050) is running and restarted.`
    );
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  status: () => fetch(`${API_BASE}/reconcile/status`).then(json),
  runSample: () => fetch(`${API_BASE}/reconcile/run`, { method: "POST" }).then(json),
  runUpload: (bankFile, ledgerFile, groundTruthFile = null) => {
    const form = new FormData();
    form.append("bankFile", bankFile);
    form.append("ledgerFile", ledgerFile);
    if (groundTruthFile) {
      form.append("groundTruthFile", groundTruthFile);
    }
    return fetch(`${API_BASE}/reconcile/run-upload`, { method: "POST", body: form }).then(json);
  },
  audit: (batchId) => fetch(`${API_BASE}/reconcile/audit?batchId=${batchId}`).then(json),
  batches: () => fetch(`${API_BASE}/reconcile/batches`).then(json),
  forecast: (batchId) => fetch(`${API_BASE}/reconcile/forecast/${batchId}`).then(json),
  ask: (batchId, question) =>
    fetch(`${API_BASE}/reconcile/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, question }),
    }).then(json),
};

export function formatINR(amount, { compact = false } = {}) {
  if (amount === null || amount === undefined) return "—";
  if (compact) {
    if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
    if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  }
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
