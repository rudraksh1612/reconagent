import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppShell from "./layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import ReconPage from "./pages/ReconPage";
import QaPage from "./pages/QaPage";
import ForecastPage from "./pages/ForecastPage";
import { api } from "./lib/api";

export default function App() {
  const [nav, setNav] = useState("dashboard");
  const [batch, setBatch] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);
  const [question, setQuestion] = useState("");
  const [qaHistory, setQaHistory] = useState([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    api.status().then(setLlmStatus).catch(() => setLlmStatus({ llmConfigured: false }));
  }, []);

  const runBatch = useCallback(async (uploadArgs) => {
    setLoading(true);
    setError(null);
    setQaHistory([]);
    try {
      const data = uploadArgs?.bankFile && uploadArgs?.ledgerFile
        ? await api.runUpload(uploadArgs.bankFile, uploadArgs.ledgerFile, uploadArgs.groundTruthFile)
        : await api.runSample();
      setBatch(data);
      setAudit(await api.audit(data.id));
      api.status().then(setLlmStatus).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const askQuestion = useCallback(
    async (q) => {
      if (!q?.trim() || !batch) return;
      setAsking(true);
      setQuestion("");
      try {
        const data = await api.ask(batch.id, q.trim());
        setQaHistory((h) => [...h, { question: q.trim(), ...data }]);
      } catch (e) {
        setQaHistory((h) => [...h, { question: q.trim(), answer: `Error: ${e.message}`, method: "error" }]);
      } finally {
        setAsking(false);
      }
    },
    [batch]
  );

  return (
    <AppShell active={nav} onChange={setNav} llmStatus={llmStatus}>
      <AnimatePresence mode="wait">
        <motion.div
          key={nav}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {nav === "dashboard" && (
            <DashboardPage batch={batch} onBatchRun={runBatch} loading={loading} error={error} />
          )}
          {nav === "recon" && <ReconPage batch={batch} audit={audit} />}
          {nav === "qa" && (
            <QaPage
              batch={batch}
              history={qaHistory}
              question={question}
              setQuestion={setQuestion}
              onAsk={askQuestion}
              asking={asking}
            />
          )}
          {nav === "forecast" && <ForecastPage batch={batch} />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
