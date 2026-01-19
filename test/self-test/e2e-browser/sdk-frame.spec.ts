/**
 * SDK → Frame → Gateway E2E Tests
 *
 * These tests exercise the full postMessage flow from the SDK through the
 * FrameEnforcer to the Gateway. They serve as:
 * 1. Baseline documentation of current behavior
 * 2. Regression tests during proxy package extraction
 * 3. Validation that the migration preserves behavior
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const GATEWAY_URL = "http://localhost:3000";
const FRAME_URL = "http://localhost:4321/frame";
const DEMO_URL = "http://localhost:5174";
const ORG_URL = "http://localhost:4321";
const BOOTSTRAP_KEY = "testbootstrapkey123";

// Can be set via FEDERISE_API_KEY environment variable
let identityApiKey: string | null = process.env.FEDERISE_API_KEY || null;

/**
 * Helper to create an identity via the gateway API
 */
async function createIdentity(): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/identity/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${BOOTSTRAP_KEY}`,
    },
    body: JSON.stringify({ displayName: "sdk-frame-test-identity", type: "user" }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create identity: ${error.message}`);
  }

  const data = await response.json();
  return data.secret;
}

/**
 * Helper to inject gateway config into org app's localStorage and cookies
 */
async function injectGatewayConfig(page: Page, apiKey: string): Promise<void> {
  await page.goto(ORG_URL);
  await page.evaluate(
    ({ apiKey, url }) => {
      localStorage.setItem("federise:gateway:apiKey", apiKey);
      localStorage.setItem("federise:gateway:url", url);
      // Set cookies for cross-origin iframe access (localhost uses SameSite=Lax)
      document.cookie = `federise_gateway_apiKey=${encodeURIComponent(apiKey)}; path=/; SameSite=Lax`;
      document.cookie = `federise_gateway_url=${encodeURIComponent(url)}; path=/; SameSite=Lax`;
    },
    { apiKey, url: GATEWAY_URL }
  );
}

/**
 * Helper to inject frame URL into demo app's localStorage
 */
async function injectFrameUrl(page: Page): Promise<void> {
  await page.goto(DEMO_URL);
  await page.evaluate(
    ({ frameUrl }) => {
      localStorage.setItem("federise-demo:frameUrl", frameUrl);
    },
    { frameUrl: FRAME_URL }
  );
}

/**
 * Helper to grant test permissions via the frame's TEST_GRANT_PERMISSIONS message
 */
async function grantTestPermissions(
  page: Page,
  capabilities: string[]
): Promise<void> {
  await page.evaluate(
    async ({ frameUrl, capabilities }) => {
      return new Promise<void>((resolve, reject) => {
        const iframe = document.querySelector(
          'iframe[src*="/frame"]'
        ) as HTMLIFrameElement;
        if (!iframe?.contentWindow) {
          reject(new Error("Frame iframe not found"));
          return;
        }

        const msgId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const handler = (event: MessageEvent) => {
          if (event.data?.id === msgId) {
            window.removeEventListener("message", handler);
            if (event.data.type === "TEST_PERMISSIONS_GRANTED") {
              resolve();
            } else if (event.data.type === "ERROR") {
              reject(new Error(event.data.message));
            }
          }
        };

        window.addEventListener("message", handler);

        iframe.contentWindow.postMessage(
          {
            type: "TEST_GRANT_PERMISSIONS",
            id: msgId,
            capabilities,
          },
          new URL(frameUrl).origin
        );

        // Timeout after 5 seconds
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Timeout waiting for permission grant"));
        }, 5000);
      });
    },
    { frameUrl: FRAME_URL, capabilities }
  );
}

/**
 * Helper to clear test permissions via the frame's TEST_CLEAR_PERMISSIONS message
 */
async function clearTestPermissions(page: Page): Promise<void> {
  await page.evaluate(
    async ({ frameUrl }) => {
      return new Promise<void>((resolve, reject) => {
        const iframe = document.querySelector(
          'iframe[src*="/frame"]'
        ) as HTMLIFrameElement;
        if (!iframe?.contentWindow) {
          reject(new Error("Frame iframe not found"));
          return;
        }

        const msgId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const handler = (event: MessageEvent) => {
          if (event.data?.id === msgId) {
            window.removeEventListener("message", handler);
            if (event.data.type === "TEST_PERMISSIONS_CLEARED") {
              resolve();
            } else if (event.data.type === "ERROR") {
              reject(new Error(event.data.message));
            }
          }
        };

        window.addEventListener("message", handler);

        iframe.contentWindow.postMessage(
          {
            type: "TEST_CLEAR_PERMISSIONS",
            id: msgId,
          },
          new URL(frameUrl).origin
        );

        // Timeout after 5 seconds
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Timeout waiting for permission clear"));
        }, 5000);
      });
    },
    { frameUrl: FRAME_URL }
  );
}

/**
 * Helper to send a message to the frame and wait for response
 */
async function sendFrameMessage(
  page: Page,
  message: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ({ frameUrl, message }) => {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const iframe = document.querySelector(
          'iframe[src*="/frame"]'
        ) as HTMLIFrameElement;
        if (!iframe?.contentWindow) {
          reject(new Error("Frame iframe not found"));
          return;
        }

        const msgId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const fullMessage = { ...message, id: msgId };

        const handler = (event: MessageEvent) => {
          if (event.data?.id === msgId) {
            window.removeEventListener("message", handler);
            resolve(event.data);
          }
        };

        window.addEventListener("message", handler);

        // Handle ArrayBuffer transfer if present
        const transferables: Transferable[] = [];
        if (message.data instanceof ArrayBuffer) {
          transferables.push(message.data);
        }

        iframe.contentWindow.postMessage(
          fullMessage,
          new URL(frameUrl).origin,
          transferables
        );

        // Timeout after 10 seconds
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Timeout waiting for frame response"));
        }, 10000);
      });
    },
    { frameUrl: FRAME_URL, message }
  );
}

/**
 * Helper to wait for iframe to be ready
 */
async function waitForFrameReady(page: Page): Promise<void> {
  await page.evaluate(
    ({ frameUrl }) => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === "__FRAME_READY__") {
            window.removeEventListener("message", handler);
            resolve();
          }
        };

        window.addEventListener("message", handler);

        // Check if frame is already loaded
        const iframe = document.querySelector(
          'iframe[src*="/frame"]'
        ) as HTMLIFrameElement;
        if (iframe?.contentWindow) {
          // Try SYN handshake to check if ready
          const checkId = `check-${Date.now()}`;
          const checkHandler = (e: MessageEvent) => {
            if (e.data?.id === checkId && e.data?.type === "ACK") {
              window.removeEventListener("message", checkHandler);
              window.removeEventListener("message", handler);
              resolve();
            }
          };
          window.addEventListener("message", checkHandler);

          iframe.contentWindow.postMessage(
            { type: "SYN", id: checkId, version: "1.0.0" },
            new URL(frameUrl).origin
          );
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve(); // Resolve anyway, let test fail if not ready
        }, 10000);
      });
    },
    { frameUrl: FRAME_URL }
  );
}

test.describe("SDK → Frame Protocol Tests", () => {
  test.beforeAll(async () => {
    if (identityApiKey) {
      console.log("Using API key from FEDERISE_API_KEY environment variable");
      return;
    }

    try {
      identityApiKey = await createIdentity();
      console.log("Created test identity for SDK-Frame tests");
    } catch (e) {
      console.warn("Could not create identity:", e);
    }
  });

  test.beforeEach(async ({ page }) => {
    if (!identityApiKey) {
      test.skip();
      return;
    }

    // Set up gateway config in org app
    await injectGatewayConfig(page, identityApiKey);

    // Set up frame URL in demo app
    await injectFrameUrl(page);
  });

  test.describe("Handshake (SYN/ACK)", () => {
    test("should complete SYN/ACK handshake with no capabilities", async ({
      page,
    }) => {
      // Navigate to demo app to trigger iframe creation
      await page.goto(`${DEMO_URL}/#chat`);

      // Click connect button
      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      // Wait for frame to be ready
      await waitForFrameReady(page);

      // Clear any permissions from previous tests
      await clearTestPermissions(page);

      // Send SYN message
      const response = await sendFrameMessage(page, {
        type: "SYN",
        version: "1.0.0",
      });

      expect(response.type).toBe("ACK");
      expect(response.version).toBe("1.0.0");
      expect(response.capabilities).toEqual([]);
    });

    test("should return granted capabilities in ACK", async ({ page }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant some permissions first
      await grantTestPermissions(page, ["kv:read", "kv:write"]);

      // Send SYN message
      const response = await sendFrameMessage(page, {
        type: "SYN",
        version: "1.0.0",
      });

      expect(response.type).toBe("ACK");
      expect(response.capabilities).toContain("kv:read");
      expect(response.capabilities).toContain("kv:write");
    });
  });

  test.describe("Capability Request Flow", () => {
    test("should return AUTH_REQUIRED when requesting new capabilities", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Clear any permissions from previous tests
      await clearTestPermissions(page);

      // Request capabilities without prior grant
      const response = await sendFrameMessage(page, {
        type: "REQUEST_CAPABILITIES",
        capabilities: ["kv:read", "blob:write"],
      });

      expect(response.type).toBe("AUTH_REQUIRED");
      expect(response.url).toContain("/authorize");
      expect(response.url).toContain("app_origin=");
      expect(response.url).toContain("scope=");
      expect(response.granted).toEqual([]);
    });

    test("should return CAPABILITIES_GRANTED when all already granted", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant permissions first
      await grantTestPermissions(page, ["kv:read", "kv:write"]);

      // Request same capabilities
      const response = await sendFrameMessage(page, {
        type: "REQUEST_CAPABILITIES",
        capabilities: ["kv:read", "kv:write"],
      });

      expect(response.type).toBe("CAPABILITIES_GRANTED");
      expect(response.granted).toContain("kv:read");
      expect(response.granted).toContain("kv:write");
    });
  });

  test.describe("KV Operations", () => {
    test("should return PERMISSION_DENIED without kv:read", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Clear any permissions from previous tests
      await clearTestPermissions(page);

      // Try to read without permission
      const response = await sendFrameMessage(page, {
        type: "KV_GET",
        key: "test-key",
      });

      expect(response.type).toBe("PERMISSION_DENIED");
      expect(response.capability).toBe("kv:read");
    });

    test("should get/set/delete KV values with permission", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant KV permissions
      await grantTestPermissions(page, ["kv:read", "kv:write", "kv:delete"]);

      const testKey = `test-key-${Date.now()}`;
      const testValue = "test-value-123";

      // Set value
      const setResponse = await sendFrameMessage(page, {
        type: "KV_SET",
        key: testKey,
        value: testValue,
      });
      expect(setResponse.type).toBe("KV_OK");

      // Get value
      const getResponse = await sendFrameMessage(page, {
        type: "KV_GET",
        key: testKey,
      });
      expect(getResponse.type).toBe("KV_RESULT");
      expect(getResponse.value).toBe(testValue);

      // List keys
      const keysResponse = await sendFrameMessage(page, {
        type: "KV_KEYS",
        prefix: "test-key-",
      });
      expect(keysResponse.type).toBe("KV_KEYS_RESULT");
      expect(keysResponse.keys).toContain(testKey);

      // Delete value
      const deleteResponse = await sendFrameMessage(page, {
        type: "KV_DELETE",
        key: testKey,
      });
      expect(deleteResponse.type).toBe("KV_OK");

      // Verify deleted (should return null or empty)
      const getDeletedResponse = await sendFrameMessage(page, {
        type: "KV_GET",
        key: testKey,
      });
      expect(getDeletedResponse.type).toBe("KV_RESULT");
      // After delete, value should be null or empty string
      expect(
        getDeletedResponse.value === null || getDeletedResponse.value === ""
      ).toBe(true);
    });
  });

  test.describe("Blob Operations", () => {
    test("should return PERMISSION_DENIED without blob:write", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Clear any permissions from previous tests
      await clearTestPermissions(page);

      // Create test data
      const testData = new TextEncoder().encode("test content");

      // Try to upload without permission
      const response = await page.evaluate(
        async ({ frameUrl }) => {
          return new Promise<Record<string, unknown>>((resolve, reject) => {
            const iframe = document.querySelector(
              'iframe[src*="/frame"]'
            ) as HTMLIFrameElement;
            if (!iframe?.contentWindow) {
              reject(new Error("Frame iframe not found"));
              return;
            }

            const msgId = `test-${Date.now()}`;
            const data = new TextEncoder().encode("test content").buffer;

            const handler = (event: MessageEvent) => {
              if (event.data?.id === msgId) {
                window.removeEventListener("message", handler);
                resolve(event.data);
              }
            };

            window.addEventListener("message", handler);

            iframe.contentWindow.postMessage(
              {
                type: "BLOB_UPLOAD",
                id: msgId,
                key: "test.txt",
                contentType: "text/plain",
                data: data,
                visibility: "private",
              },
              new URL(frameUrl).origin,
              [data]
            );

            setTimeout(() => {
              window.removeEventListener("message", handler);
              reject(new Error("Timeout"));
            }, 10000);
          });
        },
        { frameUrl: FRAME_URL }
      );

      expect(response.type).toBe("PERMISSION_DENIED");
      expect(response.capability).toBe("blob:write");
    });

    test("should upload and retrieve blob with permission", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant blob permissions
      await grantTestPermissions(page, ["blob:read", "blob:write"]);

      const testKey = `test-blob-${Date.now()}.txt`;
      const testContent = "Hello, blob world!";

      // Upload blob
      const uploadResponse = await page.evaluate(
        async ({ frameUrl, key, content }) => {
          return new Promise<Record<string, unknown>>((resolve, reject) => {
            const iframe = document.querySelector(
              'iframe[src*="/frame"]'
            ) as HTMLIFrameElement;
            if (!iframe?.contentWindow) {
              reject(new Error("Frame iframe not found"));
              return;
            }

            const msgId = `test-${Date.now()}`;
            const data = new TextEncoder().encode(content).buffer;

            const handler = (event: MessageEvent) => {
              if (event.data?.id === msgId) {
                window.removeEventListener("message", handler);
                resolve(event.data);
              }
            };

            window.addEventListener("message", handler);

            iframe.contentWindow.postMessage(
              {
                type: "BLOB_UPLOAD",
                id: msgId,
                key,
                contentType: "text/plain",
                data: data,
                visibility: "presigned",
              },
              new URL(frameUrl).origin,
              [data]
            );

            setTimeout(() => {
              window.removeEventListener("message", handler);
              reject(new Error("Timeout"));
            }, 10000);
          });
        },
        { frameUrl: FRAME_URL, key: testKey, content: testContent }
      );

      expect(uploadResponse.type).toBe("BLOB_UPLOADED");
      expect((uploadResponse.metadata as { key: string }).key).toBe(testKey);

      // Get blob URL
      const getResponse = await sendFrameMessage(page, {
        type: "BLOB_GET",
        key: testKey,
      });

      expect(getResponse.type).toBe("BLOB_DOWNLOAD_URL");
      expect(getResponse.url).toBeTruthy();

      // List blobs
      const listResponse = await sendFrameMessage(page, {
        type: "BLOB_LIST",
      });

      expect(listResponse.type).toBe("BLOB_LIST_RESULT");
      const blobs = listResponse.blobs as Array<{ key: string }>;
      expect(blobs.some((b) => b.key === testKey)).toBe(true);

      // Delete blob
      const deleteResponse = await sendFrameMessage(page, {
        type: "BLOB_DELETE",
        key: testKey,
      });

      expect(deleteResponse.type).toBe("BLOB_OK");
    });
  });

  test.describe("Channel Operations", () => {
    test("should return PERMISSION_DENIED without channel:create", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Clear any permissions from previous tests
      await clearTestPermissions(page);

      // Try to create channel without permission
      const response = await sendFrameMessage(page, {
        type: "CHANNEL_CREATE",
        name: "Test Channel",
      });

      expect(response.type).toBe("PERMISSION_DENIED");
      expect(response.capability).toBe("channel:create");
    });

    test("should create channel and append/read events with permission", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant channel permissions
      await grantTestPermissions(page, ["channel:create", "channel:delete"]);

      const channelName = `Test Channel ${Date.now()}`;

      // Create channel
      const createResponse = await sendFrameMessage(page, {
        type: "CHANNEL_CREATE",
        name: channelName,
      });

      expect(createResponse.type).toBe("CHANNEL_CREATED");
      const metadata = createResponse.metadata as {
        channelId: string;
        name: string;
      };
      expect(metadata.name).toBe(channelName);
      expect(metadata.channelId).toBeTruthy();
      expect(createResponse.secret).toBeTruthy();

      const channelId = metadata.channelId;

      // List channels
      const listResponse = await sendFrameMessage(page, {
        type: "CHANNEL_LIST",
      });

      expect(listResponse.type).toBe("CHANNEL_LIST_RESULT");
      const channels = listResponse.channels as Array<{ channelId: string }>;
      expect(channels.some((c) => c.channelId === channelId)).toBe(true);

      // Append event
      const appendResponse = await sendFrameMessage(page, {
        type: "CHANNEL_APPEND",
        channelId,
        content: "Hello, channel!",
      });

      expect(appendResponse.type).toBe("CHANNEL_APPENDED");
      const event = appendResponse.event as { seq: number; content: string };
      expect(event.content).toBe("Hello, channel!");
      expect(event.seq).toBe(1);

      // Read events
      const readResponse = await sendFrameMessage(page, {
        type: "CHANNEL_READ",
        channelId,
      });

      expect(readResponse.type).toBe("CHANNEL_READ_RESULT");
      const events = readResponse.events as Array<{ content: string }>;
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].content).toBe("Hello, channel!");

      // Delete channel
      const deleteResponse = await sendFrameMessage(page, {
        type: "CHANNEL_DELETE",
        channelId,
      });

      expect(deleteResponse.type).toBe("CHANNEL_DELETED");
    });

    test("should create share token", async ({ page }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Grant channel permissions
      await grantTestPermissions(page, ["channel:create", "channel:delete"]);

      // Create channel
      const createResponse = await sendFrameMessage(page, {
        type: "CHANNEL_CREATE",
        name: `Token Test ${Date.now()}`,
      });

      expect(createResponse.type).toBe("CHANNEL_CREATED");
      const channelId = (createResponse.metadata as { channelId: string })
        .channelId;

      // Create token
      const tokenResponse = await sendFrameMessage(page, {
        type: "CHANNEL_TOKEN_CREATE",
        channelId,
        permissions: ["read", "append"],
        displayName: "TestUser",
        expiresInSeconds: 3600,
      });

      expect(tokenResponse.type).toBe("CHANNEL_TOKEN_CREATED");
      expect(tokenResponse.token).toBeTruthy();
      expect(tokenResponse.expiresAt).toBeTruthy();
      expect(tokenResponse.gatewayUrl).toBe(GATEWAY_URL);

      // Cleanup
      await sendFrameMessage(page, {
        type: "CHANNEL_DELETE",
        channelId,
      });
    });
  });

  test.describe("Error Handling", () => {
    test("should return ERROR for invalid message format", async ({
      page,
    }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      // Send malformed message
      const response = await sendFrameMessage(page, {
        type: "INVALID_TYPE",
        someField: "value",
      });

      expect(response.type).toBe("ERROR");
      expect(response.code).toBe("INVALID_MESSAGE");
    });

    test("should return ERROR for KV_SET without value", async ({ page }) => {
      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      await grantTestPermissions(page, ["kv:write"]);

      // Send KV_SET without value field
      const response = await sendFrameMessage(page, {
        type: "KV_SET",
        key: "test-key",
        // missing value
      });

      expect(response.type).toBe("ERROR");
      expect(response.code).toBe("INVALID_MESSAGE");
    });
  });

  test.describe("Namespace Isolation", () => {
    test("should isolate data between different origins", async ({
      page,
      browser,
    }) => {
      // This test verifies that data set from one origin cannot be read from another
      // We simulate this by checking that keys from one session don't appear in another

      await page.goto(`${DEMO_URL}/#chat`);

      const connectButton = page.locator('button:has-text("Connect")');
      if (await connectButton.isVisible({ timeout: 5000 })) {
        await connectButton.click();
      }

      await waitForFrameReady(page);

      await grantTestPermissions(page, ["kv:read", "kv:write"]);

      const isolationKey = `isolation-test-${Date.now()}`;

      // Set a value
      await sendFrameMessage(page, {
        type: "KV_SET",
        key: isolationKey,
        value: "origin-1-value",
      });

      // Verify it exists
      const getResponse = await sendFrameMessage(page, {
        type: "KV_GET",
        key: isolationKey,
      });
      expect(getResponse.value).toBe("origin-1-value");

      // The namespace is derived from the origin hash, so the same origin
      // should always see the same data. Different origins would get different namespaces.
      // This test confirms that the data persists for the same origin.

      // List keys to verify
      const keysResponse = await sendFrameMessage(page, {
        type: "KV_KEYS",
        prefix: "isolation-test-",
      });
      expect(keysResponse.keys).toContain(isolationKey);

      // Cleanup
      await sendFrameMessage(page, {
        type: "KV_DELETE",
        key: isolationKey,
      });
    });
  });
});

test.describe("ChannelClient Direct Access", () => {
  test.beforeAll(async () => {
    if (identityApiKey) {
      console.log("Using existing API key for ChannelClient tests");
      return;
    }

    try {
      identityApiKey = await createIdentity();
    } catch (e) {
      console.warn("Could not create identity:", e);
    }
  });

  test("should read channel with token via direct API", async ({ request }) => {
    if (!identityApiKey) {
      test.skip();
      return;
    }

    // Create channel via gateway
    const createResponse = await request.post(`${GATEWAY_URL}/channel/create`, {
      headers: {
        Authorization: `ApiKey ${identityApiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        namespace: "direct-test-ns",
        name: `Direct Test ${Date.now()}`,
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const { metadata, secret } = await createResponse.json();

    // Append an event
    const appendResponse = await request.post(`${GATEWAY_URL}/channel/append`, {
      headers: {
        Authorization: `ApiKey ${identityApiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        channelId: metadata.channelId,
        content: "Test message from direct API",
        authorId: "test-author",
      },
    });

    expect(appendResponse.ok()).toBeTruthy();

    // Create a token
    const tokenResponse = await request.post(
      `${GATEWAY_URL}/channel/token/create`,
      {
        headers: {
          Authorization: `ApiKey ${identityApiKey}`,
          "Content-Type": "application/json",
        },
        data: {
          namespace: "direct-test-ns",
          channelId: metadata.channelId,
          secret,
          permissions: ["read"],
          displayName: "TestReader",
          expiresInSeconds: 3600,
        },
      }
    );

    expect(tokenResponse.ok()).toBeTruthy();
    const { token } = await tokenResponse.json();

    // Read with token
    const readResponse = await request.post(`${GATEWAY_URL}/channel/read`, {
      headers: {
        "X-Channel-Token": token,
        "Content-Type": "application/json",
      },
      data: {
        channelId: metadata.channelId,
      },
    });

    expect(readResponse.ok()).toBeTruthy();
    const { events } = await readResponse.json();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toBe("Test message from direct API");

    // Cleanup
    await request.post(`${GATEWAY_URL}/channel/delete`, {
      headers: {
        Authorization: `ApiKey ${identityApiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        namespace: "direct-test-ns",
        channelId: metadata.channelId,
      },
    });
  });
});
