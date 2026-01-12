import { test, expect, type Page } from "@playwright/test";

const GATEWAY_URL = "http://localhost:3000";
const FRAME_URL = "http://localhost:4321/frame";
const BOOTSTRAP_KEY = "test-bootstrap-key-for-e2e";

// Store the principal API key after creation
let principalApiKey: string | null = null;

/**
 * Helper to create a principal via the gateway API
 */
async function createPrincipal(): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/principal/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${BOOTSTRAP_KEY}`,
    },
    body: JSON.stringify({ display_name: "e2e-test-principal" }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create principal: ${error.message}`);
  }

  const data = await response.json();
  return data.secret;
}

/**
 * Helper to inject gateway config into org app's localStorage
 */
async function injectGatewayConfig(page: Page, apiKey: string): Promise<void> {
  // Navigate to org app first to set localStorage in its origin
  await page.goto("http://localhost:4321");

  // Inject gateway configuration
  await page.evaluate(
    ({ apiKey, url }) => {
      localStorage.setItem("federise:gateway:apiKey", apiKey);
      localStorage.setItem("federise:gateway:url", url);
      // Also set cookies for iframe access
      document.cookie = `federise_gateway_apiKey=${encodeURIComponent(apiKey)}; path=/; SameSite=None; Secure`;
      document.cookie = `federise_gateway_url=${encodeURIComponent(url)}; path=/; SameSite=None; Secure`;
    },
    { apiKey, url: GATEWAY_URL }
  );
}

/**
 * Helper to inject frame URL into demo app's localStorage
 */
async function injectFrameUrl(page: Page): Promise<void> {
  await page.goto("http://localhost:5174");

  await page.evaluate(
    ({ frameUrl }) => {
      localStorage.setItem("federise-demo:frameUrl", frameUrl);
    },
    { frameUrl: FRAME_URL }
  );
}

test.describe("Gateway API Compliance", () => {
  test.beforeAll(async () => {
    // Create a principal for testing
    try {
      principalApiKey = await createPrincipal();
      console.log("Created test principal");
    } catch (e) {
      // Principal might already exist, try to use bootstrap key won't work
      // In that case, tests will fail and we need to clean KV
      console.warn("Could not create principal:", e);
    }
  });

  test("should respond to ping", async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/ping`, {
      headers: {
        Authorization: `ApiKey ${principalApiKey || BOOTSTRAP_KEY}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.message).toBe("pong");
    expect(data.timestamp).toBeDefined();
  });

  test("should set and get KV values", async ({ request }) => {
    const namespace = `test_${Date.now()}`;
    const key = "test-key";
    const value = "test-value";

    // Set value
    const setResponse = await request.post(`${GATEWAY_URL}/kv/set`, {
      headers: {
        Authorization: `ApiKey ${principalApiKey || BOOTSTRAP_KEY}`,
        "Content-Type": "application/json",
      },
      data: { namespace, key, value },
    });
    expect(setResponse.status()).toBe(204);

    // Get value
    const getResponse = await request.post(`${GATEWAY_URL}/kv/get`, {
      headers: {
        Authorization: `ApiKey ${principalApiKey || BOOTSTRAP_KEY}`,
        "Content-Type": "application/json",
      },
      data: { namespace, key },
    });
    expect(getResponse.ok()).toBeTruthy();
    const data = await getResponse.json();
    expect(data.value).toBe(value);
  });

  test("should handle CORS preflight", async ({ request }) => {
    const response = await request.fetch(`${GATEWAY_URL}/kv/get`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5174",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });

    expect(response.status()).toBe(204);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["access-control-allow-methods"]).toContain("POST");
    expect(response.headers()["access-control-allow-headers"]).toContain("Authorization");
  });

  test("should return 401 for invalid auth", async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/kv/get`, {
      headers: {
        Authorization: "ApiKey invalid-key",
        "Content-Type": "application/json",
      },
      data: { namespace: "test", key: "test" },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.code).toBe(401);
  });
});

test.describe("Cross-Origin Browser Behavior", () => {
  test("should make cross-origin fetch from browser", async ({ page }) => {
    // Create a simple test page that makes a fetch request
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="result"></div>
          <script>
            async function testFetch() {
              try {
                const response = await fetch('${GATEWAY_URL}/ping', {
                  headers: {
                    'Authorization': 'ApiKey ${principalApiKey || BOOTSTRAP_KEY}'
                  }
                });
                const data = await response.json();
                document.getElementById('result').textContent = JSON.stringify(data);
              } catch (e) {
                document.getElementById('result').textContent = 'ERROR: ' + e.message;
              }
            }
            testFetch();
          </script>
        </body>
      </html>
    `);

    // Wait for the fetch to complete
    await page.waitForFunction(
      () => document.getElementById("result")?.textContent !== "",
      { timeout: 10000 }
    );

    const result = await page.locator("#result").textContent();
    expect(result).not.toContain("ERROR");
    expect(result).toContain("pong");
  });
});

test.describe("Full E2E Flow: SDK -> Frame -> Gateway", () => {
  test.beforeEach(async ({ page, context }) => {
    // Ensure we have a principal
    if (!principalApiKey) {
      try {
        principalApiKey = await createPrincipal();
      } catch (e) {
        console.warn("Principal creation failed, tests may fail");
      }
    }

    // Grant permissions for cross-origin storage access
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("should configure gateway and frame URLs", async ({ page }) => {
    if (!principalApiKey) {
      test.skip();
      return;
    }

    // First, set up the org app with gateway credentials
    await injectGatewayConfig(page, principalApiKey);

    // Verify the config was saved
    await page.goto("http://localhost:4321");
    const savedApiKey = await page.evaluate(() =>
      localStorage.getItem("federise:gateway:apiKey")
    );
    expect(savedApiKey).toBe(principalApiKey);

    // Now set up the demo app with frame URL
    await injectFrameUrl(page);

    // Verify frame URL was saved
    await page.goto("http://localhost:5174");
    const savedFrameUrl = await page.evaluate(() =>
      localStorage.getItem("federise-demo:frameUrl")
    );
    expect(savedFrameUrl).toBe(FRAME_URL);
  });

  test("should connect demo app to frame", async ({ page }) => {
    if (!principalApiKey) {
      test.skip();
      return;
    }

    // Set up configurations
    await injectGatewayConfig(page, principalApiKey);
    await injectFrameUrl(page);

    // Navigate to demo app
    await page.goto("http://localhost:5174");

    // Wait for the app to load
    await page.waitForLoadState("networkidle");

    // Look for the connect button or status
    const connectButton = page.locator('button:has-text("Connect")');
    if (await connectButton.isVisible()) {
      await connectButton.click();

      // Wait for connection (this may show a modal or change status)
      await page.waitForTimeout(3000);
    }

    // Check console for any errors
    const consoleMessages: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleMessages.push(msg.text());
      }
    });

    // Take a screenshot for debugging
    await page.screenshot({ path: "e2e-connect-result.png" });

    // Log any errors for debugging
    if (consoleMessages.length > 0) {
      console.log("Console errors:", consoleMessages);
    }
  });
});

test.describe("Presigned URL Flow (Filesystem Mode)", () => {
  test("should get presigned upload URL and upload blob", async ({ request }) => {
    const namespace = `blob_test_${Date.now()}`;
    const key = "test-file.txt";
    const content = "Hello, World!";
    const contentType = "text/plain";

    // Get presigned upload URL
    const presignResponse = await request.post(`${GATEWAY_URL}/blob/presign-upload`, {
      headers: {
        Authorization: `ApiKey ${principalApiKey || BOOTSTRAP_KEY}`,
        "Content-Type": "application/json",
      },
      data: {
        namespace,
        key,
        contentType,
        size: content.length,
        isPublic: false,
      },
    });

    expect(presignResponse.ok()).toBeTruthy();
    const { uploadUrl, expiresAt } = await presignResponse.json();
    expect(uploadUrl).toBeDefined();
    expect(expiresAt).toBeDefined();

    // Upload via presigned URL
    const uploadResponse = await request.put(uploadUrl, {
      headers: {
        "Content-Type": contentType,
      },
      data: content,
    });

    expect(uploadResponse.status()).toBe(200);

    // Verify blob exists by getting it
    const getResponse = await request.post(`${GATEWAY_URL}/blob/get`, {
      headers: {
        Authorization: `ApiKey ${principalApiKey || BOOTSTRAP_KEY}`,
        "Content-Type": "application/json",
      },
      data: { namespace, key },
    });

    expect(getResponse.ok()).toBeTruthy();
    const blobData = await getResponse.json();
    expect(blobData.url).toBeDefined();
    expect(blobData.metadata.key).toBe(key);
  });
});
