import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Text, BlockStack, TextField, Button, Banner, InlineStack, Box } from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { 
    defaultPhone: "+919384293940",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  if (actionType === "injectScript") {
      try {
          const adminAny = admin as any;
          const themes = await adminAny.rest.get({ path: "themes" }) as any;
          const mainTheme = themes.data.themes.find((t: any) => t.role === "main");
          
          if (!mainTheme) return { success: false, error: "Main theme not found" };

          const scriptContent = `
            <script>
            (function() {
                document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(() => {
                        const customerId = window.ShopifyAnalytics?.meta?.customer?.id;
                        const cartToken = document.cookie.match(/(^|;)\\s*cart=([^;]+)/)?.[2];
                        
                        if (customerId && cartToken) {
                            fetch('/apps/ai-call/api/proxy?cart_token=' + cartToken + '&customer_id=' + customerId + '&shop=' + Shopify.shop)
                            .then(() => console.log('✅ AI Call Handshake success'))
                            .catch(err => console.log('❌ Handshake failed'));
                        }
                    }, 2000);
                });
            })();
            </script>
          `;

          await adminAny.rest.put({
              path: `themes/${mainTheme.id}/assets`,
              body: { asset: { key: "snippets/ai-call-handshake.liquid", value: scriptContent } }
          });

          const themeLiquid = await adminAny.rest.get({ path: `themes/${mainTheme.id}/assets`, query: { "asset[key]": "layout/theme.liquid" } }) as any;
          let content = themeLiquid.data.asset.value;

          if (!content.includes("{% render 'ai-call-handshake' %}")) {
              content = content.replace("</body>", "{% render 'ai-call-handshake' %}\\n</body>");
              await adminAny.rest.put({
                  path: `themes/${mainTheme.id}/assets`,
                  body: { asset: { key: "layout/theme.liquid", value: content } }
              });
          }

          return { success: true, message: "Handshake Script Injected!" };
      } catch (err: any) {
          return { success: false, error: "Script injection failed: " + err.message };
      }
  }

  const phone = formData.get("phone") as string;
  const name = formData.get("name") as string;

  try {
    const response = await fetch("http://127.0.0.1:5000/api/test-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, customer_name: name }),
    });

    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    return { success: false, error: "Backend not reachable. Ensure server.js is running." };
  }
};

export default function Index() {
  const { defaultPhone } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [phone, setPhone] = useState(defaultPhone);
  const [name, setName] = useState("Gokul Test");

  const isLoading = fetcher.state !== "idle";
  const isSuccess = fetcher.data?.success;
  const error = fetcher.data?.error;

  useEffect(() => {
    if (isSuccess) {
      shopify.toast.show("Success!");
    } else if (error) {
      shopify.toast.show(`Error: ${error}`);
    }
  }, [isSuccess, error, shopify]);

  return (
    <Page title="AI Call Center - Dashboard">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Banner title="AI Call Status" tone="info">
              <p>Follow the steps below to verify your AI voice calling system.</p>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">🤝 Step 1: Enable Tracking</Text>
                <Text as="p">Link your storefront customer profiles to avoid "Anonymous" calls.</Text>
                <InlineStack align="end">
                  <Button variant="primary" 
                    loading={isLoading && fetcher.formData?.get("actionType") === "injectScript"}
                    onClick={() => fetcher.submit({ actionType: "injectScript" }, { method: "POST" })}>
                    ✨ Enable Storefront Tracking
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">🛠️ Step 2: Trigger a Test Call</Text>
                <Box paddingBlockStart="200">
                  <BlockStack gap="400">
                    <TextField label="Phone Number" value={phone} onChange={setPhone} />
                    <TextField label="Name" value={name} onChange={setName} />
                    <InlineStack align="end">
                      <Button variant="primary" loading={isLoading} 
                        onClick={() => fetcher.submit({ phone, name }, { method: "POST" })}>
                        🚀 Trigger Test Call
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>

            {isSuccess && <Banner title="Call Success!" tone="success" />}
            {error && <Banner title="Error" tone="critical"><p>{error}</p></Banner>}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
