// src/controllers/citizenAuth.js
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { signToken, signRefreshToken } = require("../middleware/auth");
const { ok, fail } = require("../utils/response");

// POST /api/auth/citizen/register
async function register(req, res) {
  const { full_name, password, phone, national_id } = req.body;
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM citizens WHERE phone = ?", [phone]
    );
    if (existing) return fail(res, "Phone number already registered", 409);

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      `INSERT INTO citizens (full_name, phone, password_hash, national_id, is_verified)
       VALUES (?, ?, ?, ?, 1)`,
      [full_name, phone, hash, national_id || null]
    );

    const [[citizen]] = await pool.query(
      "SELECT id, uuid, full_name, phone, national_id, created_at FROM citizens WHERE id = ?",
      [result.insertId]
    );

    const token   = signToken({ id: citizen.id, uuid: citizen.uuid, type: "citizen" });
    const refresh = signRefreshToken({ id: citizen.id, uuid: citizen.uuid, type: "citizen" });

    return ok(res, { token, refreshToken: refresh, citizen }, "Registration successful", 201);
  } catch (err) {
    console.error("[citizenAuth.register]", err);
    return fail(res, "Registration failed", 500);
  }
}

// POST /api/auth/citizen/login
async function login(req, res) {
  const { phone, password } = req.body;
  try {
    const [[citizen]] = await pool.query(
      "SELECT * FROM citizens WHERE phone = ? AND is_active = 1", [phone]
    );
    if (!citizen) return fail(res, "Invalid credentials", 401);

    const valid = await bcrypt.compare(password, citizen.password_hash);
    if (!valid) return fail(res, "Invalid credentials", 401);

    const token   = signToken({ id: citizen.id, uuid: citizen.uuid, type: "citizen" });
    const refresh = signRefreshToken({ id: citizen.id, uuid: citizen.uuid, type: "citizen" });

    return ok(res, {
      token,
      refreshToken: refresh,
      citizen: {
        uuid:        citizen.uuid,
        full_name:   citizen.full_name,
        phone:       citizen.phone,
        national_id: citizen.national_id,
      },
    }, "Login successful");
  } catch (err) {
    console.error("[citizenAuth.login]", err);
    return fail(res, "Login failed", 500);
  }
}

// GET /api/auth/citizen/me
async function me(req, res) {
  const [[citizen]] = await pool.query(
    "SELECT uuid, full_name, phone, national_id, is_verified, created_at FROM citizens WHERE id = ?",
    [req.citizen.id]
  );
  return ok(res, { citizen });
}

module.exports = { register, login, me };
