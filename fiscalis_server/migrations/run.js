// migrations/run.js
const mysql = require("mysql2/promise");
require("dotenv").config();

const SCHEMA = `
CREATE DATABASE IF NOT EXISTS \`fiscalis\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE \`fiscalis\`;

CREATE TABLE IF NOT EXISTS citizens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(30) NOT NULL UNIQUE,
  national_id   VARCHAR(50) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_verified   TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_national_id (national_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS officers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('superadmin','admin','officer') NOT NULL DEFAULT 'officer',
  department    VARCHAR(100),
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(30) NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  category        VARCHAR(80),
  fee_sats        BIGINT UNSIGNED NOT NULL,
  fee_usd_cents   INT UNSIGNED,
  form_fields     JSON DEFAULT NULL,
  processing_days TINYINT UNSIGNED DEFAULT 5,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  sort_order      SMALLINT UNSIGNED DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_category (category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  receipt_number  VARCHAR(30) NOT NULL UNIQUE,
  citizen_id      INT UNSIGNED NOT NULL,
  service_id      INT UNSIGNED NOT NULL,
  officer_id      INT UNSIGNED,
  status          ENUM(
                    'pending_payment','paid','processing',
                    'ready_for_pickup','delivered','cancelled',
                    'refund_requested','refunded'
                  ) NOT NULL DEFAULT 'pending_payment',
  form_data       JSON DEFAULT NULL,
  notes           TEXT,
  citizen_notes   TEXT,
  submitted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at         DATETIME,
  processed_at    DATETIME,
  ready_at        DATETIME,
  delivered_at    DATETIME,
  cancelled_at    DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (citizen_id) REFERENCES citizens(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE SET NULL,
  INDEX idx_receipt (receipt_number),
  INDEX idx_citizen (citizen_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lightning_invoices (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  application_id  INT UNSIGNED NOT NULL UNIQUE,
  payment_request TEXT NOT NULL,
  payment_hash    VARCHAR(64) UNIQUE,
  amount_sats     BIGINT UNSIGNED NOT NULL,
  wallet_currency ENUM('BTC','USD') NOT NULL DEFAULT 'BTC',
  expires_at      DATETIME NOT NULL,
  status          ENUM('pending','paid','expired','cancelled') NOT NULL DEFAULT 'pending',
  paid_at         DATETIME,
  blink_tx_id     VARCHAR(120),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT,
  INDEX idx_status (status),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_events (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload    JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES lightning_invoices(id) ON DELETE CASCADE,
  INDEX idx_invoice_id (invoice_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_status_history (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id  INT UNSIGNED NOT NULL,
  old_status      VARCHAR(30),
  new_status      VARCHAR(30) NOT NULL,
  changed_by_type ENUM('system','citizen','officer') NOT NULL DEFAULT 'system',
  changed_by_id   INT UNSIGNED,
  notes           TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  INDEX idx_application_id (application_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_type  ENUM('citizen','officer') NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token_hash (token_hash),
  INDEX idx_user (user_type, user_id)
) ENGINE=InnoDB;
`;

const SEED = `
USE \`fiscalis\`;

INSERT IGNORE INTO services
  (code, name, description, category, fee_sats, processing_days, sort_order, form_fields)
VALUES
(
  'PASSPORT_NEW', 'Nouveau Passeport', 'Demande de premier passeport', 'Identité', 50000, 15, 1,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"birth_date","label":"Date de naissance","type":"date","required":true},{"key":"birth_place","label":"Lieu de naissance","type":"text","required":true}]'
),
(
  'PASSPORT_RENEW', 'Renouvellement Passeport', 'Renouvellement de passeport expiré', 'Identité', 40000, 10, 2,
  '[{"key":"old_passport_number","label":"Numéro ancien passeport","type":"text","required":true},{"key":"expiry_date","label":"Date d expiration","type":"date","required":true}]'
),
(
  'BIRTH_CERT', 'Extrait d Acte de Naissance', 'Copie officielle de l acte de naissance', 'État Civil', 10000, 5, 3,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"birth_date","label":"Date de naissance","type":"date","required":true},{"key":"father_name","label":"Nom du père","type":"text","required":false},{"key":"mother_name","label":"Nom de la mère","type":"text","required":false}]'
),
(
  'CASIER_JUDICIAIRE', 'Extrait du Casier Judiciaire', 'Certificat de bonne conduite', 'Judiciaire', 12000, 7, 4,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"birth_date","label":"Date de naissance","type":"date","required":true},{"key":"birth_place","label":"Lieu de naissance","type":"text","required":true}]'
),
(
  'RESIDENCE_CERT', 'Certificat de Résidence', 'Attestation de domicile', 'État Civil', 8000, 3, 5,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"address","label":"Adresse complète","type":"text","required":true},{"key":"commune","label":"Commune","type":"text","required":true}]'
),
(
  'REDEVANCE_ROUTIERE', 'Redevance Routière Annuelle', 'Taxe annuelle de circulation routière', 'Transport', 35000, 2, 6,
  '[{"key":"plate_number","label":"Numéro de plaque","type":"text","required":true},{"key":"car_brand","label":"Marque du véhicule","type":"text","required":true},{"key":"car_weight","label":"Poids du véhicule (kg)","type":"number","required":true},{"key":"owner_name","label":"Nom du propriétaire","type":"text","required":true}]'
),
(
  'NATIONALITY_CERT', 'Certificat de Nationalité', 'Attestation de nationalité burundaise', 'Identité', 15000, 7, 7,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"birth_date","label":"Date de naissance","type":"date","required":true}]'
),
(
  'MARRIAGE_CERT', 'Extrait d Acte de Mariage', 'Copie officielle de l acte de mariage', 'État Civil', 10000, 5, 8,
  '[{"key":"husband_name","label":"Nom du mari","type":"text","required":true},{"key":"wife_name","label":"Nom de l épouse","type":"text","required":true},{"key":"marriage_date","label":"Date du mariage","type":"date","required":true}]'
),
(
  'DRIVING_LICENSE', 'Permis de Conduire', 'Demande de permis de conduire', 'Transport', 35000, 10, 9,
  '[{"key":"full_name","label":"Nom complet","type":"text","required":true},{"key":"birth_date","label":"Date de naissance","type":"date","required":true},{"key":"license_category","label":"Catégorie (A/B/C/D)","type":"text","required":true}]'
),
(
  'BUSINESS_REG', 'Enregistrement Commercial', 'Enregistrement d une nouvelle entreprise', 'Commerce', 60000, 14, 10,
  '[{"key":"business_name","label":"Nom de l entreprise","type":"text","required":true},{"key":"business_type","label":"Type d activité","type":"text","required":true},{"key":"owner_name","label":"Nom du propriétaire","type":"text","required":true},{"key":"address","label":"Adresse du siège","type":"text","required":true}]'
);

INSERT IGNORE INTO officers (full_name, email, password_hash, role, department) VALUES
(
  'Administrateur Système',
  'admin@fiscalis.gov.bi',
  '\$2b\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew5cw.pLi3Yv3pEa',
  'superadmin',
  'Informatique'
);
`;

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  try {
    console.log("🔄 Running migrations...");
    await conn.query(SCHEMA);
    console.log("✅ Schema applied");

    console.log("🌱 Seeding default data...");
    await conn.query(SEED);
    console.log("✅ Seed data inserted");

    console.log("\n🎉 Database ready!");
    console.log("   Default admin: admin@fiscalis.gov.bi / Admin@1234");
    console.log(
      "   ⚠️  Change the admin password immediately in production!\n"
    );
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
