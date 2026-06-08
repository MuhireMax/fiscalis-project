// test-application.js - FIXED
const axios = require("axios");

const BASE_URL = "http://localhost:8000/api";

async function testFullFlow() {
  try {
    // 1. Register citizen - USE PROPER PHONE FORMAT

    // 2. Login
    console.log("\n2. Logging in...");
    const loginRes = await axios.post(`${BASE_URL}/auth/citizen/login`, {
      phone: "71234567", // Same phone number
      password: "password123",
    });
    const token = loginRes.data.data.token;
    console.log("Got token:", token.substring(0, 50) + "...");

    // 3. Create application
    console.log("\n3. Creating application...");
    const appRes = await axios.post(
      `${BASE_URL}/applications`,
      {
        service_code: "RESIDENCE_CERT",
        form_data: {
          full_name: "Dora Dushme",
          address: "Ng",
          commune: "Ng",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "Success! Application created:",
      JSON.stringify(appRes.data, null, 2)
    );

    // 4. Check the payment QR code and invoice
    if (appRes.data.data.invoice) {
      console.log(
        "\n💰 Payment Request:",
        appRes.data.data.invoice.paymentRequest
      );
      console.log("💵 Amount:", appRes.data.data.invoice.amountSats, "sats");
      console.log("⏰ Expires:", appRes.data.data.invoice.expiresAt);
      console.log("📱 Scan QR code with any Lightning wallet to pay");
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testFullFlow();
