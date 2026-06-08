// src/controllers/officerAuth.js
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { signToken, signRefreshToken } = require("../middleware/auth");
const { ok, fail } = require("../utils/response");

// POST /api/auth/officer/login
async function login(req, res) {
  const { email, password } = req.body;
  try {
    const [[officer]] = await pool.query(
      "SELECT * FROM officers WHERE email = ? AND is_active = 1", [email]
    );
    if (!officer) return fail(res, "Invalid credentials", 401);

    const valid = await bcrypt.compare(password, officer.password_hash);
    if (!valid) return fail(res, "Invalid credentials", 401);

    await pool.query("UPDATE officers SET last_login_at = NOW() WHERE id = ?", [officer.id]);

    const token   = signToken({ id: officer.id, uuid: officer.uuid, role: officer.role, type: "officer" });
    const refresh = signRefreshToken({ id: officer.id, uuid: officer.uuid, role: officer.role, type: "officer" });

    return ok(res, {
      token,
      refreshToken: refresh,
      officer: {
        uuid:       officer.uuid,
        full_name:  officer.full_name,
        email:      officer.email,
        role:       officer.role,
        department: officer.department,
      },
    }, "Login successful");
  } catch (err) {
    console.error("[officerAuth.login]", err);
    return fail(res, "Login failed", 500);
  }
}

// GET /api/auth/officer/me
async function me(req, res) {
  const [[officer]] = await pool.query(
    "SELECT uuid, full_name, email, role, department, last_login_at FROM officers WHERE id = ?",
    [req.officer.id]
  );
  return ok(res, { officer });
}

// POST /api/auth/officer/create  (superadmin only)
async function createOfficer(req, res) {
  const { full_name, email, password, role, department } = req.body;
  if (req.officer.role !== "superadmin") {
    return fail(res, "Superadmin role required", 403);
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO officers (full_name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)",
      [full_name, email, hash, role || "officer", department || null]
    );
    return ok(res, null, "Officer created successfully", 201);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return fail(res, "Email already exists", 409);
    console.error("[officerAuth.createOfficer]", err);
    return fail(res, "Failed to create officer", 500);
  }
}

module.exports = { login, me, createOfficer };
