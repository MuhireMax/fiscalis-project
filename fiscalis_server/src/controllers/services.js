// src/controllers/services.js
const { pool } = require("../config/database");
const { getBTCPrice } = require("../services/blink");
const { ok, fail } = require("../utils/response");

// GET /api/services
async function list(req, res) {
  try {
    const { category } = req.query;
    let sql = "SELECT * FROM services WHERE is_active = 1";
    const params = [];
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    sql += " ORDER BY sort_order, name";

    const [rows] = await pool.query(sql, params);

    let satPrice = null;
    try {
      const rate = await getBTCPrice("USD");
      satPrice = rate.satPriceInCurrency;
    } catch {
      /* non-fatal */
    }

    const services = rows.map((s) => ({
      ...s,
      form_fields: s.form_fields ? JSON.parse(s.form_fields) : [],
      fee_usd_approx: satPrice ? +(s.fee_sats * satPrice).toFixed(2) : null,
    }));

    return ok(res, { services });
  } catch (err) {
    console.error("[services.list]", err);
    return fail(res, "Failed to fetch services", 500);
  }
}

// GET /api/services/:code
async function getOne(req, res) {
  const [[service]] = await pool.query(
    "SELECT * FROM services WHERE code = ? AND is_active = 1",
    [req.params.code]
  );
  if (!service) return fail(res, "Service not found", 404);
  service.form_fields = service.form_fields
    ? JSON.parse(service.form_fields)
    : [];
  return ok(res, { service });
}

// POST /api/admin/services  (admin)
async function create(req, res) {
  const {
    code,
    name,
    description,
    category,
    fee_sats,
    processing_days,
    form_fields,
  } = req.body;
  try {
    await pool.query(
      `INSERT INTO services (code, name, description, category, fee_sats, processing_days, form_fields)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        name,
        description || null,
        category,
        fee_sats,
        processing_days || 5,
        form_fields ? JSON.stringify(form_fields) : null,
      ]
    );
    return ok(res, null, "Service created successfully", 201);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return fail(res, "Service code already exists", 409);
    console.error("[services.create]", err);
    return fail(res, "Failed to create service", 500);
  }
}

// PUT /api/admin/services/:code  (admin)
async function update(req, res) {
  const allowed = [
    "name",
    "description",
    "category",
    "fee_sats",
    "processing_days",
    "is_active",
    "sort_order",
    "form_fields",
  ];
  const updates = [];
  const vals = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(
        f === "form_fields" ? JSON.stringify(req.body[f]) : req.body[f]
      );
    }
  }

  if (!updates.length) return fail(res, "No fields to update", 400);

  vals.push(req.params.code);
  await pool.query(
    `UPDATE services SET ${updates.join(", ")} WHERE code = ?`,
    vals
  );
  return ok(res, null, "Service updated successfully");
}

module.exports = { list, getOne, create, update };
