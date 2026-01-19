/**
 * Integration test setup for self-hosted Deno gateway.
 *
 * These tests run against a live server instance.
 * Before running tests:
 * 1. Start the server: deno task dev
 * 2. Ensure S3/MinIO is running if testing blob operations
 *
 * Environment variables:
 * - TEST_BASE_URL: Server URL (default: http://localhost:3000)
 * - BOOTSTRAP_API_KEY: Bootstrap key matching server config
 * - TEST_API_KEY: Optional - use existing identity's key instead of creating new ones
 */

// Test configuration
export const BASE_URL = Deno.env.get("TEST_BASE_URL") || "http://localhost:3000";
export const BOOTSTRAP_API_KEY = Deno.env.get("BOOTSTRAP_API_KEY") || "testbootstrapkey123";

// Cached admin API key (created once, reused across tests)
let cachedAdminKey: string | null = null;

/**
 * HTTP client helper for making test requests
 */
export async function testFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  return await fetch(url, init);
}

/**
 * Get or create an admin API key for testing.
 * This handles the case where identities may already exist from previous test runs.
 */
export async function getOrCreateAdminKey(): Promise<string> {
  // Return cached key if available
  if (cachedAdminKey) {
    return cachedAdminKey;
  }

  // Check if user provided a pre-existing key
  const envKey = Deno.env.get("TEST_API_KEY");
  if (envKey) {
    // Verify the key works
    const verifyRes = await testFetch("/identity/list", {
      method: "POST",
      headers: { Authorization: `ApiKey ${envKey}` },
    });
    if (verifyRes.status === 200) {
      cachedAdminKey = envKey;
      return envKey;
    }
    throw new Error("TEST_API_KEY provided but is invalid");
  }

  // Try to create a new identity using bootstrap key
  const createRes = await testFetch("/identity/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
    },
    body: JSON.stringify({ displayName: "IntegrationTestAdmin", type: "user" }),
  });

  if (createRes.status === 200) {
    const data = await createRes.json() as { secret: string };
    cachedAdminKey = data.secret;
    console.log("Created new test identity");
    return data.secret;
  }

  // Bootstrap key failed - identities likely already exist
  // In this case, user needs to provide TEST_API_KEY
  throw new Error(
    "Could not create identity with bootstrap key (identities may already exist). " +
    "Please set TEST_API_KEY environment variable with an existing identity's API key, " +
    "or clear the KV store and restart the server."
  );
}

/**
 * Generate a unique namespace for test isolation
 */
export function uniqueNamespace(prefix = "test"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reset cached admin key (useful if you want to force re-creation)
 */
export function resetCachedAdminKey(): void {
  cachedAdminKey = null;
}
