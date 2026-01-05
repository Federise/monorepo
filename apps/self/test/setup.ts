import { beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  type GatewayEnv,
  type IPresigner,
} from "@federise/gateway-core";

// Adapters
import { MemoryKVStore } from "../src/adapters/memory-kv.js";
import { MemoryBlobStore } from "../src/adapters/memory-blob.js";

// Self-hosted only endpoint
import { AdminCheckEndpoint } from "../src/endpoints/admin/check.js";

// Test configuration
export const BOOTSTRAP_API_KEY = "testbootstrapkey123";

// In-memory adapters for testing
export const kvStore = new MemoryKVStore();
export const privateBlobStore = new MemoryBlobStore();
export const publicBlobStore = new MemoryBlobStore();

// Mock presigner for testing
const mockPresigner: IPresigner = {
  getSignedUploadUrl: async () => "http://test-presigned-url/upload",
  getSignedDownloadUrl: async () => "http://test-presigned-url/download",
};

const testConfig = {
  bootstrapApiKey: BOOTSTRAP_API_KEY,
  corsOrigin: "*",
  publicDomain: undefined,
  privateBucket: "test-private",
  publicBucket: "test-public",
};

// Create test app
function createTestApp() {
  const app = new Hono<{ Variables: GatewayEnv }>();

  // Inject test adapters
  app.use("*", async (c, next) => {
    c.set("kv", kvStore);
    c.set("r2", privateBlobStore);
    c.set("r2Public", publicBlobStore);
    c.set("presigner", mockPresigner);
    c.set("config", testConfig);
    return next();
  });

  // CORS
  app.use("*", cors());

  // Download route before auth
  registerBlobDownloadRoute(app);

  // Auth middleware (with admin support for self-hosted)
  app.use("*", createAuthMiddleware({ allowBootstrapAdmin: true }));

  // Register all shared routes
  const openapi = registerGatewayRoutes(app);

  // Self-hosted only: admin check endpoint
  openapi.post("/admin/check", AdminCheckEndpoint);

  return app;
}

export const app = createTestApp();

// Test helper to make requests
export async function testFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `http://localhost${path}`;
  const request = new Request(url, init);
  return app.fetch(request);
}

// Clear stores before each test
beforeEach(() => {
  kvStore.clear();
  privateBlobStore.clear();
  publicBlobStore.clear();
});
