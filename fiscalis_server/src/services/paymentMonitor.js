// src/services/paymentMonitor.js
// Manages active WebSocket subscriptions to Blink for each pending invoice.
// When a payment is confirmed, updates DB and notifies the app via an in-process event.

const EventEmitter = require("events");
const { watchInvoiceWebSocket, confirmPayment } = require("./blink");
const { pool } = require("../config/database");

class PaymentMonitor extends EventEmitter {
  constructor() {
    super();
    this.active = new Map(); // invoiceId → cleanup fn
  }

  // Start watching an invoice (called right after invoice is created)
  watch(invoiceId, paymentRequest, expiresAt) {
    if (this.active.has(invoiceId)) return; // already watching

    const msUntilExpiry = Math.max(0, new Date(expiresAt) - Date.now()) + 5000;

    const cleanup = watchInvoiceWebSocket({
      paymentRequest,
      invoiceId,
      timeoutMs: msUntilExpiry,

      onPaid: async () => {
        this.active.delete(invoiceId);
        try {
          const changed = await confirmPayment(invoiceId);
          if (changed) {
            console.log(`[PaymentMonitor] Invoice ${invoiceId} confirmed ✅`);
            this.emit("paid", { invoiceId });
          }
        } catch (err) {
          console.error("[PaymentMonitor] confirmPayment error:", err.message);
        }
      },

      onExpired: async () => {
        this.active.delete(invoiceId);
        try {
          await pool.query(
            "UPDATE lightning_invoices SET status = 'expired' WHERE id = ? AND status = 'pending'",
            [invoiceId]
          );
          console.log(`[PaymentMonitor] Invoice ${invoiceId} expired ⏰`);
          this.emit("expired", { invoiceId });
        } catch (err) {
          console.error("[PaymentMonitor] expire update error:", err.message);
        }
      },
    });

    this.active.set(invoiceId, cleanup);
    console.log(`[PaymentMonitor] Watching invoice ${invoiceId} (${this.active.size} active)`);
  }

  // Restore watchers on server restart for all pending invoices
  async restoreOnStartup() {
    const [rows] = await pool.query(
      `SELECT id, payment_request, expires_at
       FROM lightning_invoices
       WHERE status = 'pending' AND expires_at > NOW()`
    );
    for (const row of rows) {
      this.watch(row.id, row.payment_request, row.expires_at);
    }
    if (rows.length > 0) {
      console.log(`[PaymentMonitor] Restored ${rows.length} pending invoice watchers`);
    }
  }

  stop(invoiceId) {
    const cleanup = this.active.get(invoiceId);
    if (cleanup) { cleanup(); this.active.delete(invoiceId); }
  }

  stopAll() {
    for (const [, cleanup] of this.active) cleanup();
    this.active.clear();
  }
}

// Singleton
const monitor = new PaymentMonitor();
module.exports = monitor;
