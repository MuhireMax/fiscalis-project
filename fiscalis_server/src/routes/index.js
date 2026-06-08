// src/routes/index.js
const express = require("express");
const { body, param } = require("express-validator");
const rateLimit = require("express-rate-limit");

const { validate } = require("../middleware/validate");
const {
  requireCitizen,
  requireOfficer,
  requireAdmin,
} = require("../middleware/auth");

const citizenAuth = require("../controllers/citizenAuth");
const officerAuth = require("../controllers/officerAuth");
const servicesCtrl = require("../controllers/services");
const appsCtrl = require("../controllers/applications");
const adminCtrl = require("../controllers/admin");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many attempts", data: null },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, message: "Rate limit exceeded", data: null },
});

router.use(apiLimiter);

// ══════════════════════════════════════════════════════════════
//  CITIZEN AUTH
// ══════════════════════════════════════════════════════════════
router.post(
  "/auth/citizen/register",
  authLimiter,
  [
    body("full_name").trim().notEmpty().isLength({ max: 120 }),
    body("phone").isMobilePhone().withMessage("Valid phone number required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("national_id").optional().trim(),
  ],
  validate,
  citizenAuth.register
);

router.post(
  "/auth/citizen/login",
  authLimiter,
  [
    body("phone").isMobilePhone().withMessage("Valid phone number required"),
    body("password").notEmpty(),
  ],
  validate,
  citizenAuth.login
);

router.get("/auth/citizen/me", requireCitizen, citizenAuth.me);

// ══════════════════════════════════════════════════════════════
//  OFFICER AUTH
// ══════════════════════════════════════════════════════════════
router.post(
  "/auth/officer/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  validate,
  officerAuth.login
);

router.get("/auth/officer/me", requireOfficer, officerAuth.me);

router.post(
  "/auth/officer/create",
  requireOfficer,
  [
    body("full_name").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
    body("role").optional().isIn(["superadmin", "admin", "officer"]),
    body("department").optional().trim(),
  ],
  validate,
  officerAuth.createOfficer
);

// ══════════════════════════════════════════════════════════════
//  PUBLIC: SERVICE CATALOG
// ══════════════════════════════════════════════════════════════
router.get("/services", servicesCtrl.list);
router.get("/services/:code", servicesCtrl.getOne);

// ══════════════════════════════════════════════════════════════
//  CITIZEN: APPLICATIONS
// ══════════════════════════════════════════════════════════════
router.post(
  "/applications",
  requireCitizen,
  [
    body("service_code")
      .trim()
      .notEmpty()
      .withMessage("service_code is required"),
    body("citizen_notes").optional().trim().isLength({ max: 500 }),
    body("form_data").optional().isObject(),
  ],
  validate,
  appsCtrl.create
);

router.get("/applications", requireCitizen, appsCtrl.listMine);

router.get(
  "/applications/:uuid",
  requireCitizen,
  [param("uuid").isUUID()],
  validate,
  appsCtrl.getOne
);

router.get(
  "/applications/:uuid/payment-status",
  requireCitizen,
  [param("uuid").isUUID()],
  validate,
  appsCtrl.paymentStatus
);

router.get(
  "/applications/:uuid/payment-info",
  requireCitizen,
  [param("uuid").isUUID()],
  validate,
  appsCtrl.getPaymentInfo
);

// PDF quittance download
router.get(
  "/applications/:uuid/quittance",
  [param("uuid").isUUID()],
  validate,
  appsCtrl.downloadQuittance
);

// ══════════════════════════════════════════════════════════════
//  ADMIN: APPLICATIONS
// ══════════════════════════════════════════════════════════════
router.get("/admin/stats", requireOfficer, adminCtrl.getStats);
router.get("/admin/applications", requireOfficer, adminCtrl.listApplications);
router.get(
  "/admin/applications/:uuid",
  requireOfficer,
  adminCtrl.getApplication
);

router.patch(
  "/admin/applications/:uuid/status",
  requireOfficer,
  [
    param("uuid").isUUID(),
    body("status").isIn([
      "processing",
      "ready_for_pickup",
      "delivered",
      "cancelled",
    ]),
    body("notes").optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  adminCtrl.updateStatus
);

router.post(
  "/admin/applications/verify-receipt",
  requireOfficer,
  [body("receipt_number").trim().notEmpty()],
  validate,
  adminCtrl.verifyReceipt
);

// ══════════════════════════════════════════════════════════════
//  ADMIN: SERVICE MANAGEMENT
// ══════════════════════════════════════════════════════════════
router.post(
  "/admin/services",
  requireAdmin,
  [
    body("code").trim().notEmpty().toUpperCase(),
    body("name").trim().notEmpty(),
    body("fee_sats").isInt({ min: 1 }),
    body("category").trim().notEmpty(),
    body("processing_days").optional().isInt({ min: 1, max: 365 }),
    body("form_fields").optional().isArray(),
  ],
  validate,
  servicesCtrl.create
);

router.put(
  "/admin/services/:code",
  requireAdmin,
  [
    param("code").trim().notEmpty(),
    body("fee_sats").optional().isInt({ min: 1 }),
    body("is_active").optional().isBoolean(),
    body("form_fields").optional().isArray(),
  ],
  validate,
  servicesCtrl.update
);

// ══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════════
router.get("/health", (req, res) =>
  res.json({ success: true, message: "OK", data: { timestamp: new Date() } })
);

module.exports = router;
