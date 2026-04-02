const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// Health check
app.get("/", (req, res) => {
    res.send("✅ AI Call Backend Running");
});

// 🔥 WEBHOOK ENDPOINT
app.post("/webhook/order", async (req, res) => {
    try {
        // Enforce shared secret from Remix App
        const secret = req.headers["x-app-secret"];
        if (secret !== (process.env.BACKEND_API_SECRET || "my-super-secret-token")) {
            console.error("Unauthorized request to backend");
            return res.status(403).send("Unauthorized");
        }

        console.log("🔥 Shopify Webddhook Received");

        const order = req.body;

        // Extract phone safely
        const phone =
            order.phone ||
            order.customer?.phone ||
            order.shipping_address?.phone ||
            order.billing_address?.phone;

        console.log("📞 Customer Phone:", phone);

        if (!phone) {
            console.log("⚠️ No phone number found");
            return res.status(200).send("No phone");
        }

        const phoneFormatted = phone.startsWith("+")
            ? phone
            : `+91${phone}`;

        // 👉 CALL VAPI AI VOICE AGENT
        // Documentation: https://docs.vapi.ai/api-reference/calls/create-call

        const apiUrl = process.env.CALL_API_URL
            ? `${process.env.CALL_API_URL}/api/public/shopify/webhook`
            : "https://hemicyclic-counterchanged-evangeline.ngrok-free.dev/api/public/shopify/webhook";

        const response = await axios.post(
            apiUrl,
            {
                agent_id: process.env.DEFAULT_AGENT_ID,
                secret: process.env.SHOPIFY_TRIGGER_SECRET, // must match your NestJS
                customer_name: order.customer?.first_name || "Customer",
                phone_number: phoneFormatted,
                metadata: {
                    order_id: order.name || order.id,
                    total: order.total_price,
                    source: "shopify_webhook",
                },
            }
        );


        console.log("📞 Call Triggered!");
        console.log("📄 Response Data:", JSON.stringify(response.data, null, 2));

        res.status(200).send("Webhook processed");
    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).send("Error");
    }
});

// 🧪 TEST AI CALL (mock)
app.post("/call", (req, res) => {
    console.log("📞 MOCK AI CALL");
    console.log(req.body);

    res.json({
        success: true,
    });
});

// Start server
app.listen(5000, () => {
    console.log("🚀 Server running on http://localhost:5000");
});