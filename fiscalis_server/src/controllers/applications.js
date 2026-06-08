// src/controllers/applications.js
const { pool } = require("../config/database");
const blinkService = require("../services/blink");
const { generateReceiptNumber } = require("../services/receipt");
const { generateQuittancePDF } = require("../services/quittance");
const { ok, fail } = require("../utils/response");
const QRCode = require("qrcode");

// ─────────────────────────────────────────────
//  POST /api/applications
// ─────────────────────────────────────────────
// src/controllers/applications.js - Fix the create function

async function create(req, res) {
  const { service_code, citizen_notes, form_data = {} } = req.body;
  const citizenId = req.citizen.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch service
    const [[service]] = await conn.query(
      "SELECT * FROM services WHERE code = ? AND is_active = 1",
      [service_code]
    );
    if (!service) {
      await conn.rollback();
      return fail(res, "Service not found or inactive", 404);
    }

    // 2. Validate dynamic form fields
    const formFields = service.form_fields
      ? typeof service.form_fields === "string"
        ? JSON.parse(service.form_fields)
        : service.form_fields
      : [];

    const missingFields = formFields
      .filter((f) => f.required && !form_data[f.key])
      .map((f) => ({ field: f.key, message: `${f.label} is required` }));

    if (missingFields.length > 0) {
      await conn.rollback();
      return res.status(422).json({
        success: false,
        message: "Missing required fields for this document",
        data: missingFields,
      });
    }

    // 3. Generate receipt number
    const receiptNumber = await generateReceiptNumber();

    // 4. Create application
    const [appResult] = await conn.query(
      `INSERT INTO applications
         (receipt_number, citizen_id, service_id, status, citizen_notes, form_data)
       VALUES (?, ?, ?, 'pending_payment', ?, ?)`,
      [
        receiptNumber,
        citizenId,
        service.id,
        citizen_notes || null,
        JSON.stringify(form_data),
      ]
    );
    const applicationId = appResult.insertId;

    // 5. Create Lightning invoice via Blink
    const memo = `Fiscalis: ${service.name} — ${receiptNumber}`;

    console.log(`[applications] Creating invoice for ${service.fee_sats} sats`);
    console.log(
      `[applications] Amount type: ${typeof service.fee_sats}, value: ${
        service.fee_sats
      }`
    );

    let invoice;
    try {
      // Ensure amount is a number
      const amountSats = Number(service.fee_sats);

      if (isNaN(amountSats) || amountSats <= 0) {
        throw new Error(`Invalid amount: ${service.fee_sats}`);
      }

      invoice = await blinkService.createInvoice({
        amountSats: amountSats,
        memo: memo,
        expiresInMinutes: 15, // Changed from 60 to 15 (Blink default)
      });

      console.log(
        `[applications] Invoice created successfully: ${invoice.paymentRequest.substring(
          0,
          50
        )}...`
      );
    } catch (blinkErr) {
      await conn.rollback();
      console.error("[applications.create] Blink error details:", blinkErr);
      console.error(
        "[applications.create] Blink error message:",
        blinkErr.message
      );
      if (blinkErr.response) {
        console.error(
          "[applications.create] Blink response data:",
          blinkErr.response.data
        );
      }
      return fail(
        res,
        "Failed to create payment invoice: " + blinkErr.message,
        502
      );
    }

    // 6. Store invoice
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const [invResult] = await conn.query(
      `INSERT INTO lightning_invoices
         (application_id, payment_request, payment_hash, amount_sats, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        applicationId,
        invoice.paymentRequest,
        invoice.paymentHash || null,
        service.fee_sats,
        expiresAt,
      ]
    );

    // 7. Audit trail
    await conn.query(
      "INSERT INTO payment_events (invoice_id, event_type, payload) VALUES (?, 'CREATED', ?)",
      [
        invResult.insertId,
        JSON.stringify({
          receipt_number: receiptNumber,
          amount_sats: service.fee_sats,
        }),
      ]
    );

    await conn.query(
      `INSERT INTO application_status_history
         (application_id, old_status, new_status, changed_by_type, notes)
       VALUES (?, NULL, 'pending_payment', 'system', 'Application created')`,
      [applicationId]
    );

    await conn.commit();

    // 8. Generate QR code for the Lightning invoice
    const paymentQR = await QRCode.toDataURL(
      invoice.paymentRequest.toUpperCase(),
      {
        errorCorrectionLevel: "L",
        width: 400,
        margin: 2,
      }
    );

    const [[{ uuid }]] = await pool.query(
      "SELECT uuid FROM applications WHERE id = ?",
      [applicationId]
    );

    return ok(
      res,
      {
        application: {
          uuid,
          receiptNumber,
          status: "pending_payment",
          service: {
            name: service.name,
            code: service.code,
            fee_sats: service.fee_sats,
          },
        },
        invoice: {
          paymentRequest: invoice.paymentRequest,
          amountSats: service.fee_sats,
          expiresAt: expiresAt.toISOString(),
          paymentQR,
        },
      },
      "Application created successfully",
      201
    );
  } catch (err) {
    await conn.rollback();
    console.error("[applications.create] Error:", err);
    return fail(res, "Failed to create application: " + err.message, 500);
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────
//  GET /api/applications/:uuid/payment-status
// ─────────────────────────────────────────────
async function paymentStatus(req, res) {
  try {
    const [[row]] = await pool.query(
      `SELECT a.status AS app_status, a.paid_at,
              li.status AS invoice_status, li.payment_request,
              li.amount_sats, li.expires_at, li.paid_at AS invoice_paid_at, li.id AS invoice_id
       FROM applications a
       JOIN lightning_invoices li ON li.application_id = a.id
       WHERE a.uuid = ? AND a.citizen_id = ?`,
      [req.params.uuid, req.citizen.id]
    );
    if (!row) return fail(res, "Application not found", 404);

    if (row.invoice_status === "pending") {
      try {
        const liveStatus = await blinkService.checkInvoiceStatus(
          row.payment_request
        );
        if (liveStatus === "PAID") {
          await blinkService.confirmPayment(row.invoice_id);
          row.app_status = "paid";
          row.invoice_status = "paid";
          row.invoice_paid_at = new Date();
        } else if (liveStatus === "EXPIRED") {
          await pool.query(
            "UPDATE lightning_invoices SET status = 'expired' WHERE id = ?",
            [row.invoice_id]
          );
          row.invoice_status = "expired";
        }
      } catch (e) {
        console.error("[paymentStatus] Blink check failed:", e.message);
      }
    }

    return ok(res, {
      applicationStatus: row.app_status,
      payment: {
        status: row.invoice_status,
        amountSats: row.amount_sats,
        expiresAt: row.expires_at,
        paidAt: row.invoice_paid_at,
      },
    });
  } catch (err) {
    console.error("[applications.paymentStatus]", err);
    return fail(res, "Failed to fetch payment status", 500);
  }
}

// ─────────────────────────────────────────────
//  GET /api/applications  (citizen's list)
// ─────────────────────────────────────────────
async function listMine(req, res) {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT a.uuid, a.receipt_number, a.status, a.submitted_at, a.paid_at,
           s.name AS service_name, s.code AS service_code,
           li.amount_sats, li.status AS payment_status
    FROM applications a
    JOIN services s ON s.id = a.service_id
    LEFT JOIN lightning_invoices li ON li.application_id = a.id
    WHERE a.citizen_id = ?`;
  const params = [req.citizen.id];

  if (status) {
    sql += " AND a.status = ?";
    params.push(status);
  }
  sql += " ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), offset);

  const [applications] = await pool.query(sql, params);
  return ok(res, { applications });
}

// ─────────────────────────────────────────────
//  GET /api/applications/:uuid
// ─────────────────────────────────────────────
async function getOne(req, res) {
  const [[row]] = await pool.query(
    `SELECT a.uuid, a.receipt_number, a.status, a.citizen_notes, a.submitted_at, a.paid_at,
            a.form_data,
            s.name AS service_name, s.code AS service_code,
            s.processing_days, s.form_fields,
            li.amount_sats, li.payment_request,
            li.status AS payment_status, li.expires_at, li.paid_at AS invoice_paid_at
     FROM applications a
     JOIN services s ON s.id = a.service_id
     LEFT JOIN lightning_invoices li ON li.application_id = a.id
     WHERE a.uuid = ? AND a.citizen_id = ?`,
    [req.params.uuid, req.citizen.id]
  );
  if (!row) return fail(res, "Application not found", 404);

  // Parse JSON fields
  row.form_data = row.form_data ? JSON.parse(row.form_data) : {};
  row.form_fields = row.form_fields ? JSON.parse(row.form_fields) : [];

  // Regenerate QR if still pending
  if (row.payment_status === "pending" && row.payment_request) {
    row.paymentQR = await QRCode.toDataURL(row.payment_request.toUpperCase(), {
      errorCorrectionLevel: "L",
      width: 400,
    });
  }

  return ok(res, { application: row });
}

// ─────────────────────────────────────────────
//  GET /api/applications/:uuid/payment-info
//  Returns payment details without full application data
// ─────────────────────────────────────────────
async function getPaymentInfo(req, res) {
  try {
    const [[row]] = await pool.query(
      `SELECT 
         a.uuid, a.receipt_number, a.status,
         li.payment_request, li.amount_sats, li.expires_at, li.status AS payment_status,
         s.name AS service_name, s.fee_sats
       FROM applications a
       JOIN lightning_invoices li ON li.application_id = a.id
       JOIN services s ON s.id = a.service_id
       WHERE a.uuid = ? AND a.citizen_id = ?`,
      [req.params.uuid, req.citizen.id]
    );

    if (!row) return fail(res, "Application not found", 404);

    // Generate fresh QR code
    const paymentQR = await QRCode.toDataURL(
      row.payment_request.toUpperCase(),
      {
        errorCorrectionLevel: "L",
        width: 400,
        margin: 2,
      }
    );

    // Calculate time remaining
    const expiresAt = new Date(row.expires_at);
    const now = new Date();
    const timeRemainingMs = Math.max(0, expiresAt - now);
    const timeRemainingMinutes = Math.floor(timeRemainingMs / 60000);
    const timeRemainingSeconds = Math.floor((timeRemainingMs % 60000) / 1000);

    // Get BTC price in USD (optional, for fiat display)
    let fiatAmount = null;
    try {
      const btcPrice = await blinkService.getBTCPrice("USD");
      fiatAmount = (row.amount_sats * btcPrice.satPriceInCurrency).toFixed(2);
    } catch (e) {
      console.error("Failed to get BTC price:", e.message);
    }

    return ok(res, {
      payment: {
        status: row.payment_status,
        amountSats: row.amount_sats,
        amountFiat: fiatAmount ? `${fiatAmount} USD` : null,
        paymentRequest: row.payment_request,
        paymentQR: paymentQR,
        expiresAt: row.expires_at,
        timeRemaining: {
          minutes: timeRemainingMinutes,
          seconds: timeRemainingSeconds,
          expired: timeRemainingMs <= 0,
        },
      },
      application: {
        uuid: row.uuid,
        receiptNumber: row.receipt_number,
        serviceName: row.service_name,
        status: row.status,
      },
    });
  } catch (err) {
    console.error("[applications.getPaymentInfo]", err);
    return fail(res, "Failed to fetch payment info", 500);
  }
}
// ─────────────────────────────────────────────
//  GET /api/applications/:uuid/quittance  (PDF download)
// ─────────────────────────────────────────────
async function downloadQuittance(req, res) {
  const [[app]] = await pool.query(
    // "SELECT id, receipt_number, status FROM applications WHERE uuid = ? AND citizen_id = ?",
    "SELECT id, receipt_number, status FROM applications WHERE uuid = ?",
    [req.params.uuid]
  );

  if (!app) return fail(res, "Application not found", 404);
  if (app.status === "pending_payment") {
    return fail(
      res,
      "Quittance is only available after payment is confirmed",
      400
    );
  }

  try {
    const pdfBuffer = await generateQuittancePDF(app.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="quittance-${app.receipt_number}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error("[downloadQuittance]", err);
    return fail(res, "Failed to generate quittance PDF", 500);
  }
}

module.exports = {
  create,
  paymentStatus,
  listMine,
  getOne,
  getPaymentInfo,
  downloadQuittance,
};
