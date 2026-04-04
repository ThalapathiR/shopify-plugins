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

// ⚡ MANUAL TEST CALL ENDPOINT
app.post("/api/test-call", async (req, res) => {
    try {
        const { phone, customer_name } = req.body;
        console.log(`⚡ [TEST] Manual call trigger for ${customer_name} at ${phone}...`);

        if (!phone) {
            return res.status(400).send("Phone is required");
        }

        const phoneFormatted = phone.startsWith("+") ? phone : `+91${phone}`;

        // Documentation: https://docs.vapi.ai/api-reference/calls/create-call
        const apiUrl = process.env.CALL_API_URL
            ? `${process.env.CALL_API_URL}/api/public/shopify/webhook`
            : "https://hemicyclic-counterchanged-evangeline.ngrok-free.dev/api/public/shopify/webhook";

        const response = await axios.post(apiUrl, {
            agent_id: process.env.DEFAULT_AGENT_ID,
            secret: process.env.SHOPIFY_TRIGGER_SECRET,
            customer_name: customer_name || "Test User",
            phone_number: phoneFormatted,
            metadata: { source: "manual_test_trigger" },
        });

        console.log("✅ [TEST] Call triggered successfully!");
        res.status(200).json({ success: true, message: "Call Triggered", data: response.data });
    } catch (error) {
        console.error("❌ [TEST] Error triggering call:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
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

        console.log("🔥 Shopify Webhook Received");

        const order = req.body;
        
        // Log the ENTIRE raw order to the console so you can inspect all available fields
        console.log("📦 Full Raw Shopify Order Payload:");
        console.dir(order, { depth: null, colors: true });

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

        const metadata = {
            order_id: order.name || order.id,
            customer_name: order.customer?.first_name || order.billing_address?.first_name || "Customer",
            total: order.total_price,
            currency: order.currency,
            financial_status: order.financial_status, // e.g., "paid", "pending"
            items_purchased: order.line_items?.map(item => `${item.quantity}x ${item.name}`).join(", ") || "Unknown Items",
            shipping_city: order.shipping_address?.city || "Unknown City",
            billing_name: order.billing_address?.name || "Unknown",
            billing_company: order.billing_address?.company || "",
            billing_province: order.billing_address?.province || "Unknown State",
            billing_country: order.billing_address?.country || "Unknown Country",
            source: "shopify_webhook",
        };

        console.log("📝 Formatted Order Details (Metadata) ready to send to AI:", JSON.stringify(metadata, null, 2));

        const response = await axios.post(
            apiUrl,
            {
                agent_id: process.env.DEFAULT_AGENT_ID,
                secret: process.env.SHOPIFY_TRIGGER_SECRET, // must match your NestJS
                customer_name: order.customer?.first_name || order.billing_address?.first_name || "Customer",
                phone_number: phoneFormatted,
                metadata: metadata,
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

// 🔥 REFUND WEBHOOK ENDPOINT
app.post("/webhook/refund", async (req, res) => {
    try {
        const secret = req.headers["x-app-secret"];
        if (secret !== (process.env.BACKEND_API_SECRET || "my-super-secret-token")) {
            return res.status(403).send("Unauthorized");
        }

        console.log("🔥 Shopify Refund Webhook Received");
        const refund = req.body;
        
        console.log("📦 Full Raw Shopify Refund Payload:");
        console.dir(refund, { depth: null, colors: true });

        // We read the phone and customer name that was magically extracted via 
        // a Shopify GraphQL query in the Remix side before it was forwarded here!
        const phone = refund.extracted_phone || refund.phone || "";
        const customerName = refund.extracted_customer_name || "Customer";
        const debug = refund.debug_info || {};

        console.log(`🔎 Extraction Info - Phone: "${phone}", Name: "${customerName}"`);
        console.log("🛠️ Diagnostic from Remix:", JSON.stringify(debug, null, 2));

        if (!phone) {
            console.log("⚠️ No phone number found in original order. Call skipped.");
            return res.status(200).send("No phone");
        }

        const phoneFormatted = phone.startsWith("+") ? phone : `+91${phone}`;
        const apiUrl = process.env.CALL_API_URL
            ? `${process.env.CALL_API_URL}/api/public/shopify/webhook`
            : "https://hemicyclic-counterchanged-evangeline.ngrok-free.dev/api/public/shopify/webhook";

        const metadata = {
            refund_id: refund.id,
            order_id: refund.order_id,
            source: "shopify_refund_webhook",
        };

        const response = await axios.post(apiUrl, {
            agent_id: process.env.DEFAULT_AGENT_ID,
            secret: process.env.SHOPIFY_TRIGGER_SECRET,
            customer_name: refund.extracted_customer_name || "Customer",
            phone_number: phoneFormatted,
            metadata: metadata,
        });

        console.log("📞 Refund Call Triggered!");
        res.status(200).send("Refund processed");
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

// 🚨 WEBHOOK: Abandoned Checkout Trigger
app.post("/webhook/abandoned-checkout", async (req, res) => {
    try {
        const secret = req.headers["x-app-secret"];
        if (secret !== (process.env.BACKEND_API_SECRET || "my-super-secret-token")) {
            console.error("Unauthorized request to backend (Abandoned Checkout)");
            return res.status(403).send("Unauthorized");
        }

        const payload = req.body;
        console.log("🚨 [BACKEND] Abandoned Checkout Trigger Received!");
        
        const { phone, customer_name, shop, checkout_id } = payload;

        if (!phone) {
            console.log("⚠️ No phone number provided for abandonment call. Skipping.");
            return res.status(200).send("No phone");
        }

        const phoneFormatted = phone.startsWith("+") ? phone : `+91${phone}`;
        const apiUrl = process.env.CALL_API_URL
            ? `${process.env.CALL_API_URL}/api/public/shopify/webhook`
            : "https://hemicyclic-counterchanged-evangeline.ngrok-free.dev/api/public/shopify/webhook";

        const metadata = {
            checkout_id: checkout_id,
            shop: shop,
            source: "abandoned_checkout_trigger",
        };

        console.log(`📞 Initiating AI Voice Call for ${customer_name} at ${phoneFormatted}...`);

        const response = await axios.post(apiUrl, {
            agent_id: process.env.DEFAULT_AGENT_ID,
            secret: process.env.SHOPIFY_TRIGGER_SECRET,
            customer_name: customer_name || "Customer",
            phone_number: phoneFormatted,
            metadata: metadata,
        });

        console.log("✅ Abandoned Call Triggered successfully!");
        res.status(200).send("Abandoned checkout processed");
    } catch (error) {
        console.error("❌ Error in abandoned checkout handler:", error.message);
        res.status(500).send("Error");
    }
});

// Start server
app.listen(5000, () => {
    console.log("🚀 Server running on http://localhost:5000");
});