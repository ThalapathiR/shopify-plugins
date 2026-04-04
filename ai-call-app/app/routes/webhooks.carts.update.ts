import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Simple memory store to prevent duplicate active timers for the same cart
const activeCartTimers = new Set<string>();

export const action = async ({ request }: ActionFunctionArgs) => {
    console.log("📥 [DEBUG] Webhook request received at /webhooks/carts/update");
    try {
        const { payload, admin, shop, topic } = await authenticate.webhook(request);

        console.log(`🔥 Shopify Cart Webhook: ${topic} from ${shop}`);
        
        // --- DEBUG: Print full payload to see available fields ---
        console.log("📦 Full Cart Payload:", JSON.stringify(payload, null, 2));

        const cartId = (payload.id || payload.token || "unknown").toString();

        // Attempt to find customer in multiple locations
        const raw_customer_id = payload.customer_id || payload.customer?.id;
        const raw_customer_email = payload.customer?.email || payload.email;

        console.log(`🔎 [DIAGNOSTIC] Found ID: ${raw_customer_id}, Email: ${raw_customer_email}`);

        let finalCustomerId = raw_customer_id;

        // NEW: Check the "Handshake" memory cache if Shopify didn't send an ID/Email
        if (!finalCustomerId && !raw_customer_email) {
            const token = payload.token || payload.id;
            const handshakedCustomerId = global.cartHandshakes?.get(token);
            if (handshakedCustomerId) {
                console.log(`🤝 [HANDSHAKE] Successfully linked cart ${token} to Customer ${handshakedCustomerId} via storefront session.`);
                finalCustomerId = handshakedCustomerId;
            }
        }

        // EMERGENCY FALLBACK: If we have an email but no ID, Shopify might be sending an incomplete cart.
        // We will try to find the customer by email in your database or via GraphQL.
        if (!finalCustomerId && raw_customer_email && admin) {
            console.log(`📡 [DIAGNOSTIC] No ID but found Email: ${raw_customer_email}. Searching Shopify for this customer...`);
            
            const response = await admin.graphql(
                `#graphql
                query findCustomer($query: String!) {
                    customers(first: 1, query: $query) {
                        nodes {
                            id
                            firstName
                            phone
                        }
                    }
                }`,
                { variables: { query: `email:${raw_customer_email}` } }
            );

            const result = await response.json() as any;
            const customer = result.data?.customers?.nodes?.[0];
            
            if (customer) {
                console.log(`✅ [DIAGNOSTIC] Customer FOUND by email! Name: ${customer.firstName}, ID: ${customer.id}`);
                finalCustomerId = customer.id.replace("gid://shopify/Customer/", "");
            }
        }

        if (!finalCustomerId) {
            console.log(`ℹ️ [CART WEBHOOK] Anonymous Cart ${cartId}. Skipping (Logged-in required to find phone).`);
            return new Response("OK", { status: 200 });
        }

        const customerId = finalCustomerId;

        if (activeCartTimers.has(cartId)) {
            console.log(`ℹ️ [CART WEBHOOK] Timer already active for Cart ${cartId}. Skipping duplicate.`);
            return new Response("OK", { status: 200 });
        }

        // --- PRODUCTION NOTE ---
        // For testing "now", we use a shorter delay.
        const ABANDONMENT_DELAY = 30 * 1000; // 30 Seconds (Testing)
        
        console.log(`⏳ [CART WEBHOOK] Starting ${ABANDONMENT_DELAY / 1000}-sec Logged-In abandonment timer for Cart ${cartId} (Customer: ${customerId})...`);
        activeCartTimers.add(cartId);

        setTimeout(async () => {
            try {
                activeCartTimers.delete(cartId);

                // 1. FRESH ADMIN CONTEXT
                const { unauthenticated } = await import("../shopify.server");
                const { admin: checkAdmin } = await unauthenticated.admin(shop);

                // 2. FETCH CUSTOMER PHONE & CHECK FOR RECENT ORDERS
                // We fetch the customer info and their last order
                const response = await checkAdmin.graphql(
                    `#graphql
                    query getCustomerPhone($id: ID!) {
                        customer(id: $id) {
                            firstName
                            phone
                            lastOrder {
                                processedAt
                            }
                        }
                    }`,
                    { variables: { id: `gid://shopify/Customer/${customerId}` } }
                );

                const result = await response.json() as any;
                const customer = result.data?.customer;

                if (!customer || !customer.phone) {
                    console.log(`⚠️ Logged-in Customer ${customerId} has no phone number. Skipping call.`);
                    return;
                }

                // CHECK: Did they place an order in the last 2.5 minutes?
                // This is a simple logic to see if the cart was converted
                const lastOrderTime = customer.lastOrder?.processedAt ? new Date(customer.lastOrder.processedAt).getTime() : 0;
                const now = new Date().getTime();
                const wasConverted = (now - lastOrderTime) < (ABANDONMENT_DELAY + 30000);

                if (wasConverted) {
                    console.log(`✅ Cart ${cartId} converted to Order. Abandonment call CANCELLED.`);
                } else {
                    console.log(`🚨 Cart ${cartId} ABANDONED by Logged-In Customer ${customer.firstName}.`);
                    
                    // Trigger Call
                    await fetch("http://127.0.0.1:5000/webhook/abandoned-checkout", { // Reuse backend endpoint for simplicity
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-app-secret": process.env.BACKEND_API_SECRET || "my-super-secret-token",
                        },
                        body: JSON.stringify({
                            shop,
                            checkout_id: cartId, // Using cart_id as reference
                            phone: customer.phone,
                            customer_name: customer.firstName,
                            abandoned_at: new Date().toISOString(),
                            source: "logged_in_cart"
                        }),
                    });
                }
            } catch (err: any) {
                console.error("❌ Error in cart abandonment timer:", err.message);
            }
        }, ABANDONMENT_DELAY);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error", { status: 500 });
    }
};
