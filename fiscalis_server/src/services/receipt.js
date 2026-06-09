// src/services/receipt.js
const QRCode = require("qrcode");
const { pool } = require("../config/database");

const PREFIX = process.env.RECEIPT_PREFIX || "GVP";

//  Generate sequential receipt number: GVP-2024-000001

async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const [[row]] = await pool.query(
    `SELECT receipt_number FROM applications
     WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let seq = 1;
  if (row) {
    const last = parseInt(row.receipt_number.split("-").pop(), 10);
    seq = last + 1;
  }

  return `${prefix}${String(seq).padStart(6, "0")}`;
}

//  QR code — encodes the receipt number for officer scanning

async function generateReceiptQR(receiptNumber) {
  return await QRCode.toDataURL(receiptNumber, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
  });
}

//  Build the full receipt object for API response

async function buildReceipt(applicationId) {
  const [[row]] = await pool.query(
    `SELECT
       a.id, a.uuid, a.receipt_number, a.status,
       a.submitted_at, a.paid_at,
       c.full_name AS citizen_name, c.email AS citizen_email,
       c.national_id,
       s.name AS service_name, s.code AS service_code,
       s.category,
       li.amount_sats, li.payment_request, li.status AS payment_status, li.paid_at AS invoice_paid_at
     FROM applications a
     JOIN citizens c   ON c.id = a.citizen_id
     JOIN services s   ON s.id = a.service_id
     LEFT JOIN lightning_invoices li ON li.application_id = a.id
     WHERE a.id = ?`,
    [applicationId]
  );

  if (!row) return null;

  const qrCode = await generateReceiptQR(row.receipt_number);

  return {
    receiptNumber: row.receipt_number,
    applicationUuid: row.uuid,
    status: row.status,
    citizen: {
      name: row.citizen_name,
      email: row.citizen_email,
      nationalId: row.national_id,
    },
    service: {
      name: row.service_name,
      code: row.service_code,
      category: row.category,
    },
    payment: {
      amountSats: row.amount_sats,
      status: row.payment_status,
      paidAt: row.invoice_paid_at,
    },
    submittedAt: row.submitted_at,
    paidAt: row.paid_at,
    qrCode, // base64 data URL
  };
}

module.exports = { generateReceiptNumber, generateReceiptQR, buildReceipt };
