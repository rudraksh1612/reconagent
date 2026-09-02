// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const reconciliationRoutes = require("./routes/reconciliation");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/reconcile", reconciliationRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve the built React client in production
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`ReconAgent server running on port ${PORT}`));
