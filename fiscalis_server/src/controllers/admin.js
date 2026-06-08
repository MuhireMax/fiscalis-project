// src/controllers/admin.js
const { pool } = require("../config/database");
const blinkService = require("../services/blink");
const { ok, fail } = require("../utils/response");

// ─────────────────────────────────────────────
//  GET /api/admin/applications
// ─────────────────────────────────────────────
async function listApplications(req, res) {
  const { page = 1, limit = 30, status, service_code, search, date_from, date_to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT
      a.uuid, a.receipt_number, a.status,
      a.submitted_at, a.paid_at, a.processed_at, a.ready_at, a.delivered_at,
      c.full_name AS citizen_name, c.phone AS citizen_phone, c.national_id,
      s.name AS service_name, s.code AS service_code, s.category,
      li.amount_sats, li.status AS payment_status, li.paid_at AS invoice_paid_at,
      o.full_name AS officer_name
    FROM applications a
    JOIN citizens c ON c.id = a.citizen_id
    JOIN services s ON s.id = a.service_id
    LEFT JOIN lightning_invoices li ON li.application_id = a.id
    LEFT JOIN officers o ON o.id = a.officer_id
    WHERE 1=1`;
  const params = [];

  if (status)       { sql += " AND a.status = ?";        params.push(status); }
  if (service_code) { sql += " AND s.code = ?";          params.push(service_code); }
  if (date_from)    { sql += " AND a.submitted_at >= ?"; params.push(date_from); }
  if (date_to)      { sql += " AND a.submitted_at <= ?"; params.push(date_to + " 23:59:59"); }
  if (search) {
    sql += " AND (a.receipt_number LIKE ? OR c.full_name LIKE ? OR c.national_id LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  // Count without pagination
  const countSql = `SELECT COUNT(*) AS total FROM applications a
    JOIN citizens c ON c.id = a.citizen_id
    JOIN services s ON s.id = a.service_id
    LEFT JOIN lightning_invoices li ON li.application_id = a.id
    WHERE 1=1`
    + (status       ? " AND a.status = ?"        : "")
    + (service_code ? " AND s.code = ?"          : "")
    + (date_from    ? " AND a.submitted_at >= ?" : "")
    + (date_to      ? " AND a.submitted_at <= ?" : "")
    + (search       ? " AND (a.receipt_number LIKE ? OR c.full_name LIKE ? OR c.national_id LIKE ?)" : "");

  const [[{ total }]] = await pool.query(countSql, params);

  sql += " ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), offset);

  const [applications] = await pool.query(sql, params);

  return ok(res, {
    applications,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
  });
}

// ─────────────────────────────────────────────
//  GET /api/admin/applications/:uuid
// ─────────────────────────────────────────────
async function getApplication(req, res) {
  const [[row]] = await pool.query(
    `SELECT a.*, c.full_name AS citizen_name, c.phone AS citizen_phone, c.national_id,
            s.name AS service_name, s.code AS service_code, s.fee_sats,
            s.processing_days, s.category, s.form_fields,
            li.payment_request, li.amount_sats, li.status AS payment_status,
            li.expires_at, li.paid_at AS invoice_paid_at,
            o.full_name AS officer_name
     FROM applications a
     JOIN citizens c ON c.id = a.citizen_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN lightning_invoices li ON li.application_id = a.id
     LEFT JOIN officers o ON o.id = a.officer_id
     WHERE a.uuid = ?`,
    [req.params.uuid]
  );
  if (!row) return fail(res, "Application not found", 404);

  const [history] = await pool.query(
    `SELECT h.old_status, h.new_status, h.changed_by_type, h.notes, h.created_at,
            o.full_name AS officer_name
     FROM application_status_history h
     LEFT JOIN officers o ON o.id = h.changed_by_id AND h.changed_by_type = 'officer'
     WHERE h.application_id = ?
     ORDER BY h.created_at ASC`,
    [row.id]
  );

  row.form_data   = row.form_data   ? JSON.parse(row.form_data)   : {};
  row.form_fields = row.form_fields ? JSON.parse(row.form_fields) : [];
  row.statusHistory = history;

  return ok(res, { application: row });
}

// ─────────────────────────────────────────────
//  PATCH /api/admin/applications/:uuid/status
// ─────────────────────────────────────────────
const STATUS_TRANSITIONS = {
  pending_payment:  ["cancelled"],
  paid:             ["processing", "cancelled"],
  processing:       ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["delivered"],
  delivered:        [],
  cancelled:        [],
};

async function updateStatus(req, res) {
  const { status: newStatus, notes } = req.body;
  const officerId = req.officer.id;

  const [[app]] = await pool.query(
    "SELECT id, status FROM applications WHERE uuid = ?", [req.params.uuid]
  );
  if (!app) return fail(res, "Application not found", 404);

  const allowed = STATUS_TRANSITIONS[app.status] || [];
  if (!allowed.includes(newStatus)) {
    return fail(res, `Cannot transition from '${app.status}' to '${newStatus}'. Allowed: ${allowed.join(", ") || "none"}`, 400);
  }

  const timestampField = {
    processing:       "processed_at",
    ready_for_pickup: "ready_at",
    delivered:        "delivered_at",
    cancelled:        "cancelled_at",
  }[newStatus];

  const setClause = timestampField
    ? `status = ?, ${timestampField} = NOW(), officer_id = ?, notes = COALESCE(?, notes)`
    : `status = ?, officer_id = ?, notes = COALESCE(?, notes)`;

  await pool.query(
    `UPDATE applications SET ${setClause} WHERE id = ?`,
    [newStatus, officerId, notes || null, app.id]
  );

  await pool.query(
    `INSERT INTO application_status_history
       (application_id, old_status, new_status, changed_by_type, changed_by_id, notes)
     VALUES (?, ?, ?, 'officer', ?, ?)`,
    [app.id, app.status, newStatus, officerId, notes || null]
  );

  return ok(res, { newStatus }, "Status updated successfully");
}

// ─────────────────────────────────────────────
//  POST /api/admin/applications/verify-receipt
// ─────────────────────────────────────────────
async function verifyReceipt(req, res) {
  const { receipt_number } = req.body;

  const [[app]] = await pool.query(
    `SELECT a.uuid, a.receipt_number, a.status,
            c.full_name AS citizen_name, c.national_id,
            s.name AS service_name,
            li.amount_sats, li.status AS payment_status, li.paid_at AS invoice_paid_at
     FROM applications a
     JOIN citizens c ON c.id = a.citizen_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN lightning_invoices li ON li.application_id = a.id
     WHERE a.receipt_number = ?`,
    [receipt_number]
  );

  if (!app) return fail(res, "Receipt not found", 404);

  return ok(res, {
    valid:          app.payment_status === "paid",
    readyForPickup: app.status === "ready_for_pickup",
    application: {
      receiptNumber: app.receipt_number,
      status:        app.status,
      citizen:       { name: app.citizen_name, nationalId: app.national_id },
      service:       app.service_name,
      amountSats:    app.amount_sats,
      paidAt:        app.invoice_paid_at,
    },
  });
}

// ─────────────────────────────────────────────
//  GET /api/admin/stats
// ─────────────────────────────────────────────
async function getStats(req, res) {
  const [[counts]] = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(status = 'pending_payment')  AS pending_payment,
      SUM(status = 'paid')             AS paid,
      SUM(status = 'processing')       AS processing,
      SUM(status = 'ready_for_pickup') AS ready_for_pickup,
      SUM(status = 'delivered')        AS delivered,
      SUM(status = 'cancelled')        AS cancelled
    FROM applications
  `);

  const [[revenue]] = await pool.query(`
    SELECT SUM(amount_sats) AS total_sats_collected, COUNT(*) AS paid_invoices
    FROM lightning_invoices WHERE status = 'paid'
  `);

  const [byService] = await pool.query(`
    SELECT s.name, s.code, COUNT(*) AS count, SUM(li.amount_sats) AS total_sats
    FROM applications a
    JOIN services s ON s.id = a.service_id
    LEFT JOIN lightning_invoices li ON li.application_id = a.id AND li.status = 'paid'
    WHERE a.status != 'cancelled'
    GROUP BY s.id
    ORDER BY count DESC
  `);

  let walletBalance = null;
  try { walletBalance = await blinkService.getWalletBalance(); } catch { /* non-fatal */ }

  return ok(res, { applications: counts, revenue, byService, walletBalance });
}

module.exports = { listApplications, getApplication, updateStatus, verifyReceipt, getStats };
