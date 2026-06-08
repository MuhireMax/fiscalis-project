// src/middleware/auth.js
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "change_me";

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || "15m") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
}

// ─── Middleware: require citizen JWT ──────────────────────────
function requireCitizen(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "citizen") return res.status(403).json({ error: "Access denied" });
    req.citizen = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Middleware: require officer JWT ─────────────────────────
function requireOfficer(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "officer") return res.status(403).json({ error: "Officers only" });
    req.officer = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Middleware: require superadmin or admin ──────────────────
function requireAdmin(req, res, next) {
  requireOfficer(req, res, () => {
    if (!["superadmin", "admin"].includes(req.officer.role)) {
      return res.status(403).json({ error: "Admin role required" });
    }
    next();
  });
}

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

module.exports = { signToken, signRefreshToken, requireCitizen, requireOfficer, requireAdmin };
