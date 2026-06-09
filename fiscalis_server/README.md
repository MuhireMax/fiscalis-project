# Fiscalis Backend

**Government Document Payment Platform — Node.js + MySQL + Bitcoin Lightning**

## Overview

Fiscalis is a backend API that lets citizens pay for government documents (passports,
birth certificates, residence permits, etc.) using Bitcoin over the Lightning Network.
Payments are processed through the **Blink API**. The government holds a single Blink
wallet; citizens pay from any Lightning wallet (Blink, Zeus, Phoenix, Muun, etc.).

```
Citizen App  ──►  Fiscalis API  ──►  Blink API  ──►  Gov Blink Wallet
                      │
                   MySQL DB
                      │
              Officer Dashboard
```

---

## Project Structure

```
Fiscalis-backend/
├── src/
│   ├── index.js                    # Express app entry point
│   ├── config/
│   │   └── database.js             # MySQL pool
│   ├── middleware/
│   │   ├── auth.js                 # JWT sign / verify / guards
│   │   └── validate.js             # express-validator error handler
│   ├── services/
│   │   ├── blink.js                # All Blink API calls (invoice, status, WebSocket)
│   │   ├── paymentMonitor.js       # Singleton WS watcher for pending invoices
│   │   └── receipt.js              # Receipt number generation + QR codes
│   ├── controllers/
│   │   ├── citizenAuth.js          # Register / login / me  (citizens)
│   │   ├── officerAuth.js          # Login / me / create    (officers)
│   │   ├── services.js             # Service catalog CRUD
│   │   ├── applications.js         # Submit request, check status, receipt
│   │   └── admin.js                # Officer dashboard: list, update, verify, stats
│   └── routes/
│       └── index.js                # All routes with validation rules
├── migrations/
│   └── run.js                      # Creates schema + seeds default data
├── .env.example
├── package.json
└── README.md
```

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/MuhireMax/fiscalis-project.git
cd Fiscalis-server
npm install
```

### 2. Configure environment

# Edit .env — set your MySQL credentials and Blink API key

### 3. Create database & run migrations

```bash
# Make sure MySQL is running, then:
node migrations/run.js
```

This creates the `Fiscalis` database, all tables, default services, and a
superadmin account (`admin@Fiscalis.gov.bi` / `Admin@1234` — **change immediately**).

### 4. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

---

## Environment Variables

| Variable                                                      | Description                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `PORT`                                                        | HTTP port (default 8000)                                   |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | MySQL credentials                                          |
| `JWT_SECRET`                                                  | Access token secret — generate with `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET`                                          | Refresh token secret                                       |
| `JWT_EXPIRES_IN`                                              | Access token TTL (default `15m`)                           |
| `BLINK_API_KEY`                                               | Your government Blink API key                              |
| `BLINK_WALLET_ID`                                             | Your government Blink BTC wallet ID                        |
| `RECEIPT_PREFIX`                                              | Receipt number prefix (default `GVP`)                      |

---

## Database Schema

### Tables

| Table                        | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `citizens`                   | Citizen accounts                                |
| `officers`                   | Government staff (admin dashboard users)        |
| `services`                   | Document service catalog with fees in satoshis  |
| `applications`               | Document requests (one per citizen per service) |
| `lightning_invoices`         | Blink invoices linked to applications           |
| `payment_events`             | Append-only audit log for every invoice event   |
| `application_status_history` | Every status change with who made it            |
| `refresh_tokens`             | JWT refresh token store                         |

### Application Status Flow

```
pending_payment  →  paid  →  processing  →  ready_for_pickup  →  delivered
       │                                           │
       └──────────────── cancelled ────────────────┘
```

---

## API Reference

Base URL: `http://localhost:8000/api`

All authenticated requests require:

```
Authorization: Bearer <access_token>
```

---

### Auth — Citizens

#### Register

```
POST /auth/citizen/register
Content-Type: application/json

{
  "full_name":   "Jean Ndayishimiye",
  "email":       "jean@example.com",
  "password":    "SecurePass123",
  "phone":       "+25761234567",     // optional
  "national_id": "BI-123456"         // optional
}

→ 201
{
  "token":        "<jwt>",
  "refreshToken": "<jwt>",
  "citizen": { "uuid": "...", "full_name": "...", "email": "..." }
}
```

#### Login

```
POST /auth/citizen/login

{ "email": "jean@example.com", "password": "SecurePass123" }

→ 200  { "token": "...", "refreshToken": "...", "citizen": {...} }
```

#### My profile

```
GET /auth/citizen/me
Authorization: Bearer <token>

→ 200  { "citizen": { uuid, full_name, email, phone, national_id, ... } }
```

---

### Auth — Officers

#### Login

```
POST /auth/officer/login

{ "email": "admin@Fiscalis.gov.bi", "password": "Admin@1234" }

→ 200  { "token": "...", "officer": { uuid, full_name, role, department } }
```

#### Create officer _(superadmin only)_

```
POST /auth/officer/create
Authorization: Bearer <superadmin_token>

{
  "full_name":  "Aline Niyonzima",
  "email":      "aline@gov.bi",
  "password":   "SecurePass123",
  "role":       "officer",        // officer | admin | superadmin
  "department": "Civil Registry"
}
```

---

### Service Catalog _(public)_

#### List all services

```
GET /services
GET /services?category=Identity

→ 200
{
  "services": [
    {
      "id": 1,
      "code": "PASSPORT_NEW",
      "name": "New Passport",
      "category": "Identity",
      "fee_sats": 50000,
      "fee_usd_approx": 32.50,    // live exchange rate
      "processing_days": 15
    }, ...
  ]
}
```

#### Get single service

```
GET /services/PASSPORT_NEW
```

---

### Applications _(citizen)_

#### Submit a document request

```
POST /applications
Authorization: Bearer <citizen_token>

{ "service_code": "PASSPORT_NEW", "citizen_notes": "Urgent travel" }

→ 201
{
  "application": {
    "uuid":          "abc-123",
    "receiptNumber": "GVP-2024-000001",
    "status":        "pending_payment",
    "service":       { "name": "New Passport", "fee_sats": 50000 }
  },
  "invoice": {
    "paymentRequest": "lnbc500u1p...",   // BOLT11 — paste into any LN wallet
    "amountSats":     50000,
    "expiresAt":      "2024-01-15T11:00:00Z",
    "paymentQR":      "data:image/png;base64,..."  // ready for <img> tag
  }
}
```

#### Check payment status _(citizen polls this)_

```
GET /applications/:uuid/payment-status
Authorization: Bearer <citizen_token>

→ 200
{
  "applicationStatus": "paid",
  "payment": {
    "status":    "paid",
    "amountSats": 50000,
    "paidAt":    "2024-01-15T10:32:11Z"
  }
}
```

#### Get my applications

```
GET /applications
GET /applications?status=paid&page=1&limit=20
```

#### Get receipt _(only after payment)_

```
GET /applications/:uuid/receipt

→ 200
{
  "receipt": {
    "receiptNumber": "GVP-2024-000001",
    "citizen":       { "name": "...", "nationalId": "..." },
    "service":       { "name": "New Passport", ... },
    "payment":       { "amountSats": 50000, "paidAt": "..." },
    "qrCode":        "data:image/png;base64,..."   // for officer to scan
  }
}
```

---

### Admin Dashboard _(officers)_

#### Statistics

```
GET /admin/stats
Authorization: Bearer <officer_token>

→ 200
{
  "applications": { "total": 248, "paid": 190, "processing": 32, ... },
  "revenue":      { "total_sats_collected": 9400000, "paid_invoices": 190 },
  "byService":    [ { "code": "PASSPORT_NEW", "count": 87, ... }, ... ],
  "walletBalance": [ { "walletCurrency": "BTC", "balance": 9400000 } ]
}
```

#### List applications

```
GET /admin/applications
GET /admin/applications?status=paid&search=Ndayi&date_from=2024-01-01&page=1
```

#### Get single application

```
GET /admin/applications/:uuid
→ includes full statusHistory array
```

#### Update application status

```
PATCH /admin/applications/:uuid/status

{ "status": "processing", "notes": "Documents under review" }
{ "status": "ready_for_pickup" }
{ "status": "delivered" }
{ "status": "cancelled", "notes": "Duplicate request" }
```

**Valid transitions:**

- `paid` → `processing` or `cancelled`
- `processing` → `ready_for_pickup` or `cancelled`
- `ready_for_pickup` → `delivered`

#### Verify receipt at pickup counter

```
POST /admin/applications/verify-receipt
Authorization: Bearer <officer_token>

{ "receipt_number": "GVP-2024-000001" }

→ 200
{
  "valid":          true,    // payment was made
  "readyForPickup": true,    // document is ready
  "application": {
    "receiptNumber": "GVP-2024-000001",
    "citizen":       { "name": "Jean Ndayishimiye", "nationalId": "BI-123456" },
    "service":       "New Passport",
    "amountSats":    50000,
    "paidAt":        "2024-01-15T10:32:11Z"
  }
}
```

---

### Manage Services _(admin only)_

#### Create service

```
POST /admin/services

{
  "code":            "LAND_TITLE",
  "name":            "Land Title Certificate",
  "category":        "Property",
  "fee_sats":        75000,
  "processing_days": 21
}
```

#### Update service / toggle active

```
PUT /admin/services/LAND_TITLE

{ "fee_sats": 80000 }
{ "is_active": false }
```

---

## Payment Flow (detailed)

```
1. Citizen POSTs /applications  with service_code
         │
2. Backend fetches service fee (in sats)
         │
3. Backend calls Blink API: lnInvoiceCreate (authenticated)
   ← returns paymentRequest (BOLT11) + paymentHash
         │
4. Backend stores application (pending_payment) + invoice in MySQL
         │
5. paymentMonitor.watch() opens Blink WebSocket subscription
         │
6. API returns paymentRequest + QR to citizen
         │
7. Citizen scans QR with their Lightning wallet and pays
         │
8a. Blink WebSocket fires "PAID" event
    → paymentMonitor calls confirmPayment()
    → DB: invoice=paid, application=paid  (atomic transaction)
         OR
8b. Citizen polls GET /applications/:uuid/payment-status
    → Backend calls Blink HTTP lnInvoicePaymentStatus
    → Same confirmation logic
         │
9. Officer sees application as "paid" in dashboard
         │
10. Officer processes → ready_for_pickup → delivered
         │
11. Citizen comes to counter, officer scans QR / types receipt number
    → POST /admin/applications/verify-receipt confirms payment + identity
```

---

## Security

- **JWT** access tokens (15 min) + refresh tokens (7 days)
- **bcrypt** (cost 12) for all passwords
- **Helmet** sets security HTTP headers
- **Rate limiting**: 20 req/15min on auth routes, 100 req/min globally
- **express-validator** on all inputs
- **Atomic DB transactions** for payment confirmation (no double-confirm)
- **Role-based access**: citizen / officer / admin / superadmin
- API key never exposed to client — all Blink calls are server-side only

---

## Production Checklist

- [ ] Change default admin password
- [ ] Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (64+ random bytes)
- [ ] Use MySQL user with least-privilege (not root)
- [ ] Enable HTTPS (reverse proxy: nginx/caddy)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `FRONTEND_URL` and `ADMIN_URL` in CORS
- [ ] Set up process manager (PM2 or systemd)
- [ ] Enable MySQL backups
- [ ] Monitor with logs (consider Winston + log rotation)

## ─────────────────────────────────────────────

The Mobile APP repo is here: https://github.com/yvartpro/biingo.git

## ─────────────────────────────────────────────
