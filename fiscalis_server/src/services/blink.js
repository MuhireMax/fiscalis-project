// src/services/blink.js
const axios = require("axios");
const { pool } = require("../config/database");
require("dotenv").config();

const BLINK_API = "https://api.blink.sv/graphql";
const BLINK_WS = "wss://ws.blink.sv/graphql";

// Use your actual wallet ID from the test
const WALLET_ID =
  process.env.BLINK_WALLET_ID || "bce366d5-2d4c-4652-9dc4-9e238b8f78bf";

// Internal GraphQL helper
async function blinkQuery(query, variables = {}) {
  const response = await axios.post(
    BLINK_API,
    { query, variables },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  if (response.data.errors && response.data.errors.length > 0) {
    throw new Error(response.data.errors[0].message || "Blink API error");
  }
  return response.data.data;
}

// Create BTC Invoice directly with wallet ID
// Add this to your createBTCInvoice function right before the API call
// src/services/blink.js - Fix the createBTCInvoice function

async function createBTCInvoice(amountSats, memo, expiresInMinutes = 15) {
  console.log(`[Blink] createBTCInvoice called with:`);
  console.log(`  amountSats: ${amountSats} (${typeof amountSats})`);
  console.log(`  memo: ${memo}`);
  console.log(`  expiresInMinutes: ${expiresInMinutes}`);
  console.log(`  WALLET_ID: ${WALLET_ID}`);

  // REMOVE expiresAt and paymentHash from the query - they don't exist in the response!
  const mutation = `
    mutation Mutation($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
      lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
        invoice {
          paymentRequest
          satoshis
        }
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      recipientWalletId: WALLET_ID,
      amount: amountSats.toString(),
      memo: memo,
      expiresIn: expiresInMinutes.toString(),
    },
  };

  console.log(`[Blink] Variables:`, JSON.stringify(variables, null, 2));

  const data = await blinkQuery(mutation, variables);

  if (
    data.lnInvoiceCreateOnBehalfOfRecipient.errors &&
    data.lnInvoiceCreateOnBehalfOfRecipient.errors.length > 0
  ) {
    throw new Error(data.lnInvoiceCreateOnBehalfOfRecipient.errors[0].message);
  }

  const invoice = data.lnInvoiceCreateOnBehalfOfRecipient.invoice;

  // Calculate expiresAt manually since the API doesn't return it
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  return {
    paymentRequest: invoice.paymentRequest,
    paymentHash: null, // Not returned by this mutation
    amountSats: Number(invoice.satoshis),
    expiresAt: expiresAt.toISOString(),
  };
}

// Main createInvoice function
async function createInvoice({ amountSats, memo, expiresInMinutes = 15 }) {
  console.log(`[Blink] Creating invoice for ${amountSats} sats: ${memo}`);
  console.log(`[Blink] Expires in: ${expiresInMinutes} minutes`);
  return await createBTCInvoice(amountSats, memo, expiresInMinutes);
}

// Check payment status
async function checkInvoiceStatus(paymentRequest) {
  const query = `
    query CheckPaymentStatus($input: LnInvoicePaymentStatusInput!) {
      lnInvoicePaymentStatus(input: $input) {
        status
      }
    }
  `;

  const data = await blinkQuery(query, {
    input: { paymentRequest },
  });

  return data.lnInvoicePaymentStatus.status;
}

// WebSocket monitor (keep your existing implementation)
function watchInvoiceWebSocket({
  paymentRequest,
  invoiceId,
  onPaid,
  onExpired,
  timeoutMs = 1800000,
}) {
  const WebSocket = require("ws");
  let ws;
  let settled = false;
  let pollInterval;

  const cleanup = () => {
    settled = true;
    clearInterval(pollInterval);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  };

  const startPolling = () => {
    if (settled) return;
    console.log(`[Blink] WS fallback → polling invoice ${invoiceId}`);
    pollInterval = setInterval(async () => {
      if (settled) return clearInterval(pollInterval);
      try {
        const status = await checkInvoiceStatus(paymentRequest);
        if (status === "PAID") {
          cleanup();
          onPaid();
        }
        if (status === "EXPIRED") {
          cleanup();
          onExpired();
        }
      } catch (e) {
        console.error("[Blink] Poll error:", e.message);
      }
    }, 5000);
  };

  const hardTimeout = setTimeout(() => {
    if (!settled) {
      cleanup();
      onExpired();
    }
  }, timeoutMs);

  try {
    ws = new WebSocket(BLINK_WS, "graphql-transport-ws");

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "connection_init", payload: {} }));
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "connection_ack") {
        ws.send(
          JSON.stringify({
            id: "1",
            type: "subscribe",
            payload: {
              query: `
                subscription LnInvoicePaymentStatusByPaymentRequest($input: LnInvoicePaymentStatusByPaymentRequestInput!) {
                  lnInvoicePaymentStatusByPaymentRequest(input: $input) {
                    paymentRequest
                    status
                  }
                }
              `,
              variables: {
                input: { paymentRequest },
              },
            },
          })
        );
      }

      if (msg.type === "next" && msg.payload?.data) {
        const { status } =
          msg.payload.data.lnInvoicePaymentStatusByPaymentRequest;
        if (status === "PAID" && !settled) {
          clearTimeout(hardTimeout);
          cleanup();
          onPaid();
        }
      }
    });

    ws.on("error", () => startPolling());

    setTimeout(() => {
      if (!settled && (!ws || ws.readyState !== WebSocket.OPEN)) startPolling();
    }, 8000);
  } catch (e) {
    console.error("[Blink] WS init error:", e.message);
    startPolling();
  }

  return cleanup;
}

// Confirm payment and update DB
async function confirmPayment(invoiceId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[invoice]] = await conn.query(
      "SELECT * FROM lightning_invoices WHERE id = ? AND status = 'pending' FOR UPDATE",
      [invoiceId]
    );

    if (!invoice) {
      await conn.rollback();
      return false;
    }

    const now = new Date();

    await conn.query(
      "UPDATE lightning_invoices SET status = 'paid', paid_at = ? WHERE id = ?",
      [now, invoiceId]
    );

    await conn.query(
      "UPDATE applications SET status = 'paid', paid_at = ? WHERE id = ?",
      [now, invoice.application_id]
    );

    await conn.query(
      `INSERT INTO application_status_history
         (application_id, old_status, new_status, changed_by_type, notes)
       VALUES (?, 'pending_payment', 'paid', 'system', 'Lightning payment confirmed via Blink')`,
      [invoice.application_id]
    );

    await conn.query(
      "INSERT INTO payment_events (invoice_id, event_type, payload) VALUES (?, 'PAID', ?)",
      [invoiceId, JSON.stringify({ confirmed_at: now })]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Get BTC price
async function getBTCPrice(displayCurrency = "USD") {
  const data = await blinkQuery(
    `query($currency: DisplayCurrency!) {
       realtimePrice(currency: $currency) {
         btcSatPrice { base offset }
         usdCentPrice { base offset }
         timestamp
       }
     }`,
    { currency: displayCurrency.toUpperCase() }
  );

  const r = data.realtimePrice;
  const satPriceInCurrency =
    r.btcSatPrice.base * Math.pow(10, r.btcSatPrice.offset);

  return {
    satPriceInCurrency,
    currency: displayCurrency,
    timestamp: r.timestamp,
  };
}

// Optional: Get wallet balance (requires auth)
async function getWalletBalance() {
  if (!process.env.BLINK_API_KEY) {
    return null;
  }

  const response = await axios.post(
    BLINK_API,
    {
      query: `
        query {
          me {
            defaultAccount {
              wallets {
                ... on BTCWallet { id balance walletCurrency }
                ... on UsdWallet { id balance walletCurrency }
              }
            }
          }
        }
      `,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.BLINK_API_KEY,
      },
    }
  );

  return response.data.data.me.defaultAccount.wallets;
}

module.exports = {
  createInvoice,
  checkInvoiceStatus,
  watchInvoiceWebSocket,
  confirmPayment,
  getBTCPrice,
  getWalletBalance,
};
