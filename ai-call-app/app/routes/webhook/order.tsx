import { authenticate } from "../../shopify.server";

export async function loader() {
    console.log("✅ GET webhook hit");
    return new Response("GET OK");
}

export async function action({ request }: any) {
    try {
        // Authenticate webhook payload directly from Shopify
        const { topic, shop, payload } = await authenticate.webhook(request);
        
        console.log(`🔥 POST webhook hit for shop: ${shop} topic: ${topic}`);

        // Forward the actual order payload to your background Express server
        const response = await fetch("http://localhost:5000/webhook/order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-app-secret": "my-super-secret-token" // Protect your express server
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Express backend failed to handle order webhook.");
        }

        // Always reply to Shopify Webhooks with 200 soon as possible
        return new Response("POST OK", { status: 200 });
    } catch (error) {
        console.error("Webhook validation error:", error);
        return new Response("Error", { status: 500 });
    }
}