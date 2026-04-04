import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const cartToken = url.searchParams.get("cart_token");
  const customerId = url.searchParams.get("customer_id");
  const shop = url.searchParams.get("shop");

  if (cartToken && customerId) {
    console.log(`🤝 [HANDSHAKE] Linking Cart ${cartToken} to Customer ${customerId} for ${shop}`);
    
    // Store in global memory cache
    if (!global.cartHandshakes) {
        global.cartHandshakes = new Map();
    }
    global.cartHandshakes.set(cartToken, customerId);
  }

  return new Response("OK", { status: 200 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return loader({ request } as any);
};
