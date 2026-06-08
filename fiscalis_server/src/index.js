// src/index.js
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");

const { testConnection } = require("./config/database");
const routes = require("./routes/index");
const paymentMonitor = require("./services/paymentMonitor");
const { setupWebSocketServer } = require("./services/websocket");

const app = express();
const PORT = process.env.PORT || 8000;

// ── Security & parsing ─────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:3001",
      process.env.ADMIN_URL || "http://127.0.0.1:5500",
      "http://localhost:5500", // Live server default
      "http://127.0.0.1:5500", // IP version
      "http://localhost:3000", // React default
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:5501",
      "http://127.0.0.1:5501",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Routes ─────────────────────────────────────────────────────
app.use("/api", routes);

// ── 404 ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Create HTTP server ─────────────────────────────────────────
const server = http.createServer(app);

// ── Setup WebSocket on the same server ─────────────────────────
setupWebSocketServer(server);

// ── Start ──────────────────────────────────────────────────────
async function start() {
  await testConnection();

  // Re-attach Blink WebSocket watchers for any invoices that were
  // pending when the server last shut down
  await paymentMonitor.restoreOnStartup();

  server.listen(PORT, () => {
    console.log(`\n🚀 Fiscalis API running on port ${PORT}`);
    console.log(`   ENV : ${process.env.NODE_ENV || "development"}`);
    console.log(`   Docs: http://localhost:${PORT}/api/health`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  });
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully");
  paymentMonitor.stopAll();
  server.close(() => {
    process.exit(0);
  });
});

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
