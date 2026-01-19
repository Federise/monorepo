import type { Page } from "@playwright/test";

const GATEWAY_URL = "http://localhost:3000";
const ORG_URL = "http://localhost:4321";
const DEMO_URL = "http://localhost:5174";
const FRAME_URL = `${ORG_URL}/frame`;
const BOOTSTRAP_KEY = "testbootstrapkey123";

export interface TestIdentity {
  secret: string;
  identityId: string;
  displayName: string;
}

// Cache for identity secret across tests
let cachedIdentity: TestIdentity | null = null;

/**
 * Ensures an identity exists. Creates one if needed.
 * Caches the identity for subsequent test runs in the same process.
 */
export async function ensureIdentity(): Promise<TestIdentity> {
  // Return cached identity if available
  if (cachedIdentity) {
    return cachedIdentity;
  }

  // Check if we have a saved secret from a previous run
  const savedSecret = process.env.E2E_IDENTITY_SECRET;
  if (savedSecret) {
    // Verify the secret works by making an authenticated request
    const verifyResponse = await fetch(`${GATEWAY_URL}/ping`, {
      headers: { Authorization: `ApiKey ${savedSecret}` },
    });
    if (verifyResponse.ok) {
      cachedIdentity = {
        secret: savedSecret,
        identityId: "cached",
        displayName: "e2e-test",
      };
      return cachedIdentity;
    }
  }

  // Try to create a new identity
  const response = await fetch(`${GATEWAY_URL}/identity/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${BOOTSTRAP_KEY}`,
    },
    body: JSON.stringify({ displayName: "e2e-test", type: "user" }),
  });

  if (response.ok) {
    const data = await response.json();
    cachedIdentity = {
      secret: data.secret,
      identityId: data.identity.id,
      displayName: data.identity.displayName,
    };
    console.log(`\n  Created identity. To reuse, set: E2E_IDENTITY_SECRET=${cachedIdentity.secret}\n`);
    return cachedIdentity;
  }

  // If 401, an identity already exists but we don't have the secret
  if (response.status === 401) {
    throw new Error(
      "Identity already exists but no secret available.\n" +
      "Options:\n" +
      "  1. Set E2E_IDENTITY_SECRET env var with the existing secret\n" +
      "  2. Clear gateway state: rm -rf apps/gateway/.wrangler/state && restart gateway\n" +
      "  3. Use the secret printed when the identity was first created"
    );
  }

  throw new Error(`Failed to create identity: ${response.status}`);
}

/**
 * Configures the Org app localStorage with gateway credentials
 */
export async function setupOrgApp(page: Page, identitySecret: string) {
  await page.goto(ORG_URL);
  await page.evaluate(
    ({ secret, gatewayUrl }) => {
      localStorage.setItem("federise:gateway:apiKey", secret);
      localStorage.setItem("federise:gateway:url", gatewayUrl);
    },
    { secret: identitySecret, gatewayUrl: GATEWAY_URL }
  );
}

/**
 * Configures the Demo app localStorage with frame URL
 */
export async function setupDemoApp(page: Page) {
  await page.goto(DEMO_URL);
  await page.evaluate(
    ({ frameUrl }) => {
      localStorage.setItem("federise-demo:frameUrl", frameUrl);
    },
    { frameUrl: FRAME_URL }
  );
}

/**
 * Full setup: creates identity and configures both apps
 */
export async function fullSetup(page: Page): Promise<TestIdentity> {
  const identity = await ensureIdentity();
  await setupOrgApp(page, identity.secret);
  await setupDemoApp(page);
  return identity;
}

export const urls = {
  gateway: GATEWAY_URL,
  org: ORG_URL,
  demo: DEMO_URL,
  frame: FRAME_URL,
};
