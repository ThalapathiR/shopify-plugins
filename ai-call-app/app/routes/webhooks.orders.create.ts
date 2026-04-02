import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        // Must use Shopify's authenticator to securely get the payload body! 
        const { payload } = await authenticate.webhook(request);

        console.log("🔥 Shopify Order Received:", payload.id);

        // 👉 call your backend using 127.0.0.1 instead of localhost to prevent Windows/Node IPv6 bugs
        await fetch("http://127.0.0.1:5000/webhook/order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-app-secret": process.env.BACKEND_API_SECRET || "my-super-secret-token",
            },
            body: JSON.stringify(payload),
        });

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error", { status: 500 });
    }
};