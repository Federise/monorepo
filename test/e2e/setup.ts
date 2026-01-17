import type { Page } from "@playwright/test";

const GATEWAY_URL = "http://localhost:3000";
const ORG_URL = "http://localhost:4321";
const DEMO_URL = "http://localhost:5174";
const FRAME_URL = `${ORG_URL}/frame`;
const BOOTSTRAP_KEY = "testbootstrapkey123";

export interface TestPrincipal {
  secret: string;
  secretHash: string;
  displayName: string;
}

// Cache for principal secret across tests
let cachedPrincipal: TestPrincipal | null = null;

/**
 * Ensures a principal exists. Creates one if needed.
 * Caches the principal for subsequent test runs in the same process.
 */
export async function ensurePrincipal(): Promise<TestPrincipal> {
  // Return cached principal if available
  if (cachedPrincipal) {
    return cachedPrincipal;
  }

  // Check if we have a saved secret from a previous run
  const savedSecret = process.env.E2E_PRINCIPAL_SECRET;
  if (savedSecret) {
    // Verify the secret works by making an authenticated request
    const verifyResponse = await fetch(`${GATEWAY_URL}/ping`, {
      headers: { Authorization: `ApiKey ${savedSecret}` },
    });
    if (verifyResponse.ok) {
      cachedPrincipal = {
        secret: savedSecret,
        secretHash: "cached",
        displayName: "e2e-test",
      };
      return cachedPrincipal;
    }
  }

  // Try to create a new principal
  const response = await fetch(`${GATEWAY_URL}/principal/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${BOOTSTRAP_KEY}`,
    },
    body: JSON.stringify({ display_name: "e2e-test" }),
  });

  if (response.ok) {
    const data = await response.json();
    cachedPrincipal = {
      secret: data.secret,
      secretHash: data.secret_hash,
      displayName: data.display_name,
    };
    console.log(`\n  Created principal. To reuse, set: E2E_PRINCIPAL_SECRET=${cachedPrincipal.secret}\n`);
    return cachedPrincipal;
  }

  // If 401, a principal already exists but we don't have the secret
  if (response.status === 401) {
    throw new Error(
      "Principal already exists but no secret available.\n" +
      "Options:\n" +
      "  1. Set E2E_PRINCIPAL_SECRET env var with the existing secret\n" +
      "  2. Clear gateway state: rm -rf apps/gateway/.wrangler/state && restart gateway\n" +
      "  3. Use the secret printed when the principal was first created"
    );
  }

  throw new Error(`Failed to create principal: ${response.status}`);
}

/**
 * Configures the Org app localStorage with gateway credentials
 */
export async function setupOrgApp(page: Page, principalSecret: string) {
  await page.goto(ORG_URL);
  await page.evaluate(
    ({ secret, gatewayUrl }) => {
      localStorage.setItem("federise:gateway:apiKey", secret);
      localStorage.setItem("federise:gateway:url", gatewayUrl);
    },
    { secret: principalSecret, gatewayUrl: GATEWAY_URL }
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
 * Full setup: creates principal and configures both apps
 */
export async function fullSetup(page: Page): Promise<TestPrincipal> {
  const principal = await ensurePrincipal();
  await setupOrgApp(page, principal.secret);
  await setupDemoApp(page);
  return principal;
}

export const urls = {
  gateway: GATEWAY_URL,
  org: ORG_URL,
  demo: DEMO_URL,
  frame: FRAME_URL,
};
