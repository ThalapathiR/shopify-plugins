import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        // Extract all available info to debug session issues
        const { payload, admin: webhookAdmin, shop, topic, session: webhookSession } = await authenticate.webhook(request);
        
        let admin = webhookAdmin;
        let session = webhookSession;

        // PRODUCTION FALLBACK: For webhooks, we must use an OFF-LINE session.
        // If the standard handler fails (common in Remix), we manually fetch the offline session.
        if (!admin && shop) {
            try {
                const { unauthenticated } = await import("../shopify.server");
                const { admin: offlineAdmin, session: offlineSession } = await unauthenticated.admin(shop);
                admin = offlineAdmin;
                session = offlineSession;
                console.log(`✅ Production Fallback: Restored offline session for ${shop}`);
            } catch (fallbackError: any) {
                console.error(`❌ Production Issue: No offline session in database for ${shop}. Re-installation required.`);
            }
        }

        // Diagnostic Summary (Handy for debugging during rollouts)
        console.log("🔥 Shopify Webhook:", topic, "| Shop:", shop || "Unknown");
        console.log("🛠️  Session Check:", {
            shop,
            isOnline: session?.isOnline,
            hasToken: !!session?.accessToken,
            adminReady: !!admin
        });
        console.log("🛠️  Order Ref:", payload.order_id);

        let extracted_phone = "";
        let extracted_customer_name = "Customer";

        // Query the original order directly from Shopify to find the phone number
        if (admin && payload.order_id) {
            try {
                const response = await admin.graphql(
                    `#graphql
                    query getOrderPhone($id: ID!) {
                        order(id: $id) {
                            customer { 
                                firstName 
                                lastName 
                                phone 
                                defaultAddress { phone }
                            }
                            billingAddress { firstName, phone }
                            shippingAddress { phone }
                            phone
                        }
                    }`,
                    { variables: { id: `gid://shopify/Order/${payload.order_id}` } }
                );
                
                const result = await response.json() as any;
                console.log("📊 GraphQL Result:", JSON.stringify(result, null, 2));

                if (result.errors) {
                    console.error("❌ GraphQL Errors:", result.errors);
                }

                const orderData = result.data?.order;
                
                if (orderData) {
                    extracted_phone = 
                        orderData.phone || 
                        orderData.customer?.phone || 
                        orderData.billingAddress?.phone || 
                        orderData.shippingAddress?.phone ||
                        orderData.customer?.defaultAddress?.phone || 
                        "";

                    extracted_customer_name = 
                        orderData.customer?.firstName || 
                        orderData.billingAddress?.firstName || 
                        "Customer";
                    
                    console.log("✅ Extracted Phone:", extracted_phone);
                    console.log("✅ Extracted Name:", extracted_customer_name);
                } else {
                    console.error("⚠️ Order not found in GraphQL for ID:", payload.order_id);
                }
            } catch (err) {
                console.error("❌ Failed to query order for refund:", err);
            }
        } else {
            if (!admin) console.error("❌ Admin context missing in webhook handler!");
            if (!payload.order_id) console.error("❌ Order ID missing in refund payload!");
        }

        // Add diagnostic info to help us debug remotely
        const debug_info = {
            admin_available: !!admin,
            shop_received: shop,
            session_online: session?.isOnline,
            has_access_token: !!session?.accessToken,
            order_id_received: payload.order_id,
            graphql_query_attempted: (admin && payload.order_id) ? true : false,
            timestamp: new Date().toISOString()
        };

        // Add the phone number manually into the data we send to the backend
        const extendedPayload = {
            ...payload,
            extracted_phone,
            extracted_customer_name,
            debug_info
        };

        // 👉 call your backend 
        await fetch("http://127.0.0.1:5000/webhook/refund", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-app-secret": process.env.BACKEND_API_SECRET || "my-super-secret-token",
            },
            body: JSON.stringify(extendedPayload),
        });

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error", { status: 500 });
    }
};
