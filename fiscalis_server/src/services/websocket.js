// src/services/websocket.js
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");
const paymentMonitor = require("./paymentMonitor");

let wss = null;

function setupWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: "/ws" });

  // Store connected clients
  const clients = new Map(); // citizenId -> Set of WebSocket connections

  wss.on("connection", async (ws, req) => {
    // Get token from query string
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "No authentication token");
      return;
    }

    try {
      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== "citizen") {
        ws.close(1008, "Invalid token type");
        return;
      }

      const citizenId = decoded.id;

      // Store connection
      if (!clients.has(citizenId)) {
        clients.set(citizenId, new Set());
      }
      clients.get(citizenId).add(ws);

      console.log(`WebSocket connected for citizen ${citizenId}`);

      // Send initial connection success
      ws.send(
        JSON.stringify({
          type: "connection",
          status: "connected",
          message: "Connected to payment updates",
        })
      );

      // Handle incoming messages
      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          if (data.type === "subscribe") {
            const { applicationUuid } = data;
            ws.applicationUuid = applicationUuid;
            ws.send(
              JSON.stringify({
                type: "subscribed",
                applicationUuid: applicationUuid,
              })
            );
          }
        } catch (e) {
          console.error("WebSocket message error:", e);
        }
      });

      // Handle disconnection
      ws.on("close", () => {
        const citizenClients = clients.get(citizenId);
        if (citizenClients) {
          citizenClients.delete(ws);
          if (citizenClients.size === 0) {
            clients.delete(citizenId);
          }
        }
        console.log(`WebSocket disconnected for citizen ${citizenId}`);
      });
    } catch (error) {
      console.error("WebSocket auth error:", error);
      ws.close(1008, "Invalid token");
    }
  });

  // Listen to payment monitor events
  paymentMonitor.on("paid", async ({ invoiceId }) => {
    try {
      // Get application details
      const [[app]] = await pool.query(
        `SELECT a.citizen_id, a.uuid, li.payment_request, li.amount_sats
         FROM applications a
         JOIN lightning_invoices li ON li.application_id = a.id
         WHERE li.id = ?`,
        [invoiceId]
      );

      if (app && clients.has(app.citizen_id)) {
        // Notify all connected clients for this citizen
        const message = JSON.stringify({
          type: "payment_confirmed",
          data: {
            applicationUuid: app.uuid,
            amountSats: app.amount_sats,
            status: "paid",
            timestamp: new Date().toISOString(),
          },
        });

        for (const client of clients.get(app.citizen_id)) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      }
    } catch (error) {
      console.error("WebSocket notification error:", error);
    }
  });

  console.log("✅ WebSocket server initialized on /ws");
}

function notifyPaymentUpdate(citizenId, applicationUuid, status) {
  // This can be called from other parts of the app
  // Implementation similar to above
}

module.exports = { setupWebSocketServer, notifyPaymentUpdate };
