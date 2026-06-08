// test-blink.js
const axios = require("axios");

async function testBlinkAPI() {
  const BLINK_API = "https://api.blink.sv/graphql";

  // Test 1: Get wallet by username (public)
  console.log("Test 1: Get wallet by username");
  try {
    const response = await axios.post(BLINK_API, {
      query: `
        query {
          accountDefaultWallet(username: "muhire") {
            id
            currency
          }
        }
      `,
    });
    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }

  // Test 2: Create invoice if we have a wallet ID
  console.log("\nTest 2: Create invoice");
  const WALLET_ID = "bce366d5-2d4c-4652-9dc4-9e238b8f78bf"; // Replace with actual ID from test 1

  try {
    const response = await axios.post(BLINK_API, {
      query: `
        mutation {
          lnInvoiceCreateOnBehalfOfRecipient(input: {
            recipientWalletId: "${WALLET_ID}",
            amount: 1000,
            memo: "Test invoice",
            expiresIn: 15
          }) {
            invoice {
              paymentRequest
              satoshis
            }
            errors {
              message
            }
          }
        }
      `,
    });
    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testBlinkAPI();
