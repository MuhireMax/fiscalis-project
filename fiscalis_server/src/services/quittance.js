// src/services/quittance.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

const LOGO_MINISTRY = path.join(__dirname, "../assets/logos/burundi.png");
const LOGO_FISCALIS = path.join(
  __dirname,
  "../assets/logos/fiscalis_logo.jpeg"
);
const WATERMARK = path.join(__dirname, "../assets/logos/fiscalis.png");

const C = {
  primary: "#1D8882",
  secondary: "#24456E",
  gold: "#C5A059",
  lightBg: "#F8F9FA",
  border: "#DEE2E6",
  success: "#27AE60",
  warning: "#F39C12",
};

async function generateQuittancePDF(applicationId) {
  const [[row]] = await pool.query(
    `SELECT
       a.receipt_number, a.submitted_at, a.paid_at, a.form_data,
       c.full_name AS citizen_name, c.phone, c.national_id,
       s.name AS service_name, s.category,
       li.amount_sats, li.paid_at AS invoice_paid_at
     FROM applications a
     JOIN citizens c  ON c.id = a.citizen_id
     JOIN services s  ON s.id = a.service_id
     JOIN lightning_invoices li ON li.application_id = a.id
     WHERE a.id = ? AND li.status = 'paid'`,
    [applicationId]
  );

  if (!row) throw new Error("Application not found or not yet paid");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, layout: "portrait" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── A4 constants ─────────────────────────────────────
    const PW = 595; // page width
    const PH = 842; // page height
    const ML = 40; // margin left
    const MR = 40; // margin right
    const W = PW - ML - MR; // 515 usable width

    // ── Parse dates & form data ───────────────────────────
    const paidDate = new Date(row.invoice_paid_at || row.paid_at);
    const paidDateStr = paidDate.toLocaleString("fr-FR", {
      timeZone: "Africa/Bujumbura",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const formData = row.form_data
      ? typeof row.form_data === "string"
        ? JSON.parse(row.form_data)
        : row.form_data
      : {};
    const formEntries = Object.entries(formData);

    // ── Watermark ─────────────────────────────────────────
    if (fs.existsSync(WATERMARK)) {
      doc.save();
      doc.opacity(0.05);
      doc.image(WATERMARK, PW / 2 - 90, PH / 2 - 110, { width: 180 });
      doc.restore();
    }

    //  HEADER  (y: 0 → 88)

    // Gold top stripe
    doc.rect(0, 0, PW, 5).fill(C.gold);

    // Navy band
    doc.rect(0, 5, PW, 83).fill(C.secondary);

    // Ministry logo
    if (fs.existsSync(LOGO_MINISTRY)) {
      doc.image(LOGO_MINISTRY, ML, 12, { width: 58, height: 58 });
    }
    // Fiscalis logo
    if (fs.existsSync(LOGO_FISCALIS)) {
      doc.image(LOGO_FISCALIS, PW - ML - 58, 12, { width: 58, height: 58 });
    }

    // Header text
    doc
      .fillColor("#ffffff")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("RÉPUBLIQUE DU BURUNDI", ML, 18, { width: W, align: "center" });
    doc
      .fontSize(9)
      .font("Helvetica")
      .text("Office Burundais des Recettes", ML, 36, {
        width: W,
        align: "center",
      });
    doc
      .fontSize(9)
      .fillColor(C.gold)
      .text("PLATEFORME FISCALIS", ML, 50, { width: W, align: "center" });

    // Teal accent line
    doc.rect(0, 88, PW, 3).fill(C.primary);
    doc.rect(0, 91, PW, 1).fill(C.gold);

    // ── Document title (y: 96) ────────────────────────────
    doc
      .fillColor(C.secondary)
      .fontSize(17)
      .font("Helvetica-Bold")
      .text("QUITTANCE DE PAIEMENT", ML, 99, { width: W, align: "center" });

    doc
      .moveTo(180, 121)
      .lineTo(415, 121)
      .lineWidth(1.5)
      .strokeColor(C.gold)
      .stroke();

    //  RECEIPT INFO BAR  (y: 128 → 158)

    doc.rect(ML, 128, W, 34).fill("#EEF2FF").stroke(C.secondary).lineWidth(0.5);

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(C.secondary)
      .text("NUMÉRO DE QUITTANCE", ML + 12, 133);
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(row.receipt_number, ML + 12, 143);

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(C.secondary)
      .text("DATE DE PAIEMENT", ML + 270, 133);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(paidDateStr, ML + 270, 143);

    //  LAYOUT: two columns below y=168
    //  Left col:  x=ML       w=240
    //  Right col: x=ML+258   w=215

    let yL = 170; // left column cursor
    let yR = 170; // right column cursor

    const colL = ML;
    const colR = ML + 258;
    const wL = 238;
    const wR = PW - colR - MR;

    // ── Helpers ───────────────────────────────────────────
    function secTitle(label, x, w, y) {
      doc.rect(x, y, 3, 16).fill(C.primary);
      doc.rect(x + 3, y, w - 3, 16).fill(C.lightBg);
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(C.secondary)
        .text(label, x + 8, y + 5, { width: w - 10 });
      return y + 20;
    }

    function field(label, value, x, w, y) {
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#777777")
        .text(label, x + 8, y, { width: w - 10 });
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#111111")
        .text(String(value || "—"), x + 8, y + 9, { width: w - 10 });
      return y + 22;
    }

    function divider(x, w, y) {
      doc
        .moveTo(x, y)
        .lineTo(x + w, y)
        .lineWidth(0.4)
        .strokeColor(C.border)
        .stroke();
      return y + 6;
    }

    //  LEFT COLUMN: Citizen + Service

    yL = secTitle("INFORMATIONS DU DEMANDEUR", colL, wL, yL);
    yL = field("Nom complet", row.citizen_name, colL, wL, yL);
    yL = field("Téléphone", row.phone, colL, wL, yL);
    yL = field("Pièce d'identité", row.national_id, colL, wL, yL);
    yL = divider(colL, wL, yL);

    yL = secTitle("DOCUMENT DEMANDÉ", colL, wL, yL);
    yL = field("Type de document", row.service_name, colL, wL, yL);
    yL = field("Catégorie", row.category, colL, wL, yL);

    //  RIGHT COLUMN: Dynamic form fields

    if (formEntries.length > 0) {
      yR = secTitle("INFORMATIONS SPÉCIFIQUES", colR, wR, yR);
      for (const [key, value] of formEntries) {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        yR = field(label, value, colR, wR, yR);
      }
    }

    // ── Separator between columns ─────────────────────────
    const colTopY = 168;
    const colBottomY = Math.max(yL, yR) + 4;
    doc
      .moveTo(colR - 11, colTopY)
      .lineTo(colR - 11, colBottomY)
      .lineWidth(0.4)
      .strokeColor(C.border)
      .stroke();

    //  PAYMENT BOX  — sits below both columns
    //  Target y ≈ colBottomY + 10, but capped so footer fits

    const payY = Math.min(colBottomY + 12, PH - 215);
    const payH = 72;

    // Gradient fill
    const pg = doc.linearGradient(ML, payY, ML, payY + payH);
    pg.stop(0, "#F0FFF8");
    pg.stop(1, "#E4F9F2");
    doc.rect(ML, payY, W, payH).fill(pg).stroke(C.primary).lineWidth(1.5);
    doc.rect(ML, payY, 5, payH).fill(C.primary);

    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(C.secondary)
      .text("MONTANT PAYÉ", ML + 14, payY + 9);
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .fillColor(C.primary)
      .text(
        `${row.amount_sats.toLocaleString("fr-FR")} sats`,
        ML + 14,
        payY + 22
      );
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#777777")
      .text(
        "Paiement effectué via le réseau Bitcoin Lightning Network",
        ML + 14,
        payY + 52
      );

    // PAYÉ stamp
    doc.save();
    doc.rotate(-22, { origin: [PW - ML - 70, payY + 36] });
    doc
      .rect(PW - ML - 135, payY + 14, 118, 44)
      .lineWidth(2.5)
      .stroke(C.success)
      .fillOpacity(0.08)
      .fill(C.success);
    doc
      .fillOpacity(1)
      .fontSize(25)
      .font("Helvetica-Bold")
      .fillColor(C.success)
      .text("PAYÉ", PW - ML - 133, payY + 26, { width: 114, align: "center" });
    doc.restore();

    //  NOTICE BOX

    const noticeY = payY + payH + 8;
    const noticeH = 44;
    doc
      .rect(ML, noticeY, W, noticeH)
      .fill("#FFF8E7")
      .stroke(C.warning)
      .lineWidth(1);
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(C.warning)
      .text("⚠  INFORMATION IMPORTANTE", ML + 10, noticeY + 8);
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor("#7a5c00")
      .text(
        "Veuillez présenter cette quittance accompagnée de votre pièce d'identité au guichet compétent " +
          "pour le retrait de votre document officiel. Ce document constitue la preuve légale de votre paiement.",
        ML + 10,
        noticeY + 19,
        { width: W - 20 }
      );

    //  SIGNATURE LINE

    const sigY = noticeY + noticeH + 12;
    doc
      .moveTo(PW - ML - 200, sigY)
      .lineTo(PW - MR, sigY)
      .strokeColor("#000000")
      .lineWidth(0.5)
      .stroke();
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#555555")
      .text(
        "Signature et cachet du service compétent",
        PW - ML - 200,
        sigY + 3,
        { width: 200, align: "center" }
      );

    //  FOOTER  (pinned to bottom)

    const footerY = PH - 52;
    doc.rect(0, footerY - 2, PW, 1).fill(C.primary);
    doc.rect(0, footerY - 1, PW, 1).fill(C.gold);

    doc
      .fontSize(6.5)
      .font("Helvetica")
      .fillColor("#666666")
      .text(
        "Office Burundais des Recettes  |  Boulevard de la Révolution, Bujumbura",
        ML,
        footerY + 4,
        { width: W, align: "center" }
      )
      .text(
        `Tél: +257 22 22 1234  |  contact@obr.gov.bi  |  www.fiscalis.gov.bi`,
        ML,
        footerY + 14,
        { width: W, align: "center" }
      )
      .text(
        `Document généré le ${new Date().toLocaleString(
          "fr-FR"
        )}  —  © Fiscalis ${new Date().getFullYear()}  —  République du Burundi`,
        ML,
        footerY + 24,
        { width: W, align: "center" }
      );

    doc.end();
  });
}

module.exports = { generateQuittancePDF };
