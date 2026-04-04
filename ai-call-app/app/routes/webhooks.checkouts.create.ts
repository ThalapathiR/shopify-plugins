import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Keep track of checkouts that have been converted to orders (Simple memory cache for testing)
const convertedCheckouts = new Set<string>();

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { payload, admin, shop, topic } = await authenticate.webhook(request);

        console.log(`🔥 Shopify Checkout Webhook: ${topic} from ${shop}`);
        
        // --- DEBUG: Print full payload to see available fields ---
        console.log("📦 Full Checkout Payload:", JSON.stringify(payload, null, 2));

        // Extract customer info safely
        const checkoutId = (payload.id || payload.token || "unknown").toString();
        const phone = payload.phone || payload.customer?.phone || payload.billing_address?.phone || payload.shipping_address?.phone || "";
        const customerName = payload.customer?.first_name || "Customer";

        if (!phone) {
            console.log("⚠️ No phone number found for checkout. Abandonment call skip-able later.");
        }

        // --- PRODUCTION NOTE ---
        // For testing, we use a 30-second delay.
        const ABANDONMENT_DELAY = 30 * 1000; // 30 Seconds (Testing)

        console.log(`⏳ [CHECKOUT WEBHOOK] Starting ${ABANDONMENT_DELAY / 1000}-sec timer for Checkout ${checkoutId} (Customer: ${customerName})...`);

        setTimeout(async () => {
            try {
                // 1. Re-authenticate to get a fresh Admin Context
                const { unauthenticated } = await import("../shopify.server");
                const { admin: checkAdmin } = await unauthenticated.admin(shop);

                // 2. CHECK: Has this checkout become an order?
                // We query for any order associated with this checkout ID
                const response = await checkAdmin.graphql(
                    `#graphql
                    query getOrderByCheckout($query: String!) {
                        orders(first: 1, query: $query) {
                            nodes {
                                id
                            }
                        }
                    }`,
                    { variables: { query: `checkout_id:${checkoutId}` } }
                );

                const result = await response.json() as any;
                const ordersFound = result.data?.orders?.nodes?.length > 0;

                if (ordersFound) {
                    console.log(`✅ Checkout ${checkoutId} converted to Order. Abandonment call CANCELLED.`);
                } else {
                    console.log(`🚨 Checkout ${checkoutId} ABANDONED for ${ABANDONMENT_DELAY / 60000} mins.`);
                    
                    if (phone) {
                        console.log(`📞 Triggering AI Voice Call for ${customerName} at ${phone}...`);
                        
                        // Send to your backend
                        await fetch("http://127.0.0.1:5000/webhook/abandoned-checkout", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-app-secret": process.env.BACKEND_API_SECRET || "my-super-secret-token",
                            },
                            body: JSON.stringify({
                                shop,
                                checkout_id: checkoutId,
                                phone,
                                customer_name: customerName,
                                abandoned_at: new Date().toISOString()
                            }),
                        });
                    } else {
                        console.log("❌ No phone number found in abandoned checkout. Skipping call.");
                    }
                }
            } catch (err: any) {
                console.error("❌ Error in abandonment check timer:", err.message);
            }
        }, ABANDONMENT_DELAY);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error", { status: 500 });
    }
};
