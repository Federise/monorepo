import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fromHono } from "chanfana";
import { Hono } from "hono";
import { PingEndpoint } from "../src/endpoints/ping";
import { PrincipalListEndpoint } from "../src/endpoints/principalList";
import { PrincipalCreateEndpoint } from "../src/endpoints/principalCreate";
import { PrincipalDeleteEndpoint } from "../src/endpoints/principalDelete";
import { KVListNamespacesEndpoint } from "../src/endpoints/kvListNamespaces";
import { KVListKeysEndpoint } from "../src/endpoints/kvListKeys";
import { KVGetEndpoint } from "../src/endpoints/kvGet";
import { KVSetEndpoint } from "../src/endpoints/kvSet";
import { KVBulkGetEndpoint } from "../src/endpoints/kvBulkGet";
import { KVBulkSetEndpoint } from "../src/endpoints/kvBulkSet";
import { KVDumpEndpoint } from "../src/endpoints/kvDump";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create a minimal Hono app for OpenAPI generation (without middleware)
const app = new Hono();

const openapi = fromHono(app, {
  docs_url: "/openapi",
  schema: {
    info: {
      title: "Federise Gateway API",
      version: "1.0.0",
      description: "API for managing principals and key-value storage",
    },
    servers: [
      {
        url: "http://localhost:8787",
        description: "Local development server",
      },
    ],
  },
});

// Register all endpoints
openapi.get("/ping", PingEndpoint);
openapi.post("/principal/list", PrincipalListEndpoint);
openapi.post("/principal/create", PrincipalCreateEndpoint);
openapi.post("/principal/delete", PrincipalDeleteEndpoint);
openapi.post("/kv/get", KVGetEndpoint);
openapi.post("/kv/set", KVSetEndpoint);
openapi.post("/kv/keys", KVListKeysEndpoint);
openapi.post("/kv/bulk/get", KVBulkGetEndpoint);
openapi.post("/kv/bulk/set", KVBulkSetEndpoint);
openapi.post("/kv/namespaces", KVListNamespacesEndpoint);
openapi.post("/kv/dump", KVDumpEndpoint);

// Generate OpenAPI spec by making a request to the /openapi endpoint
async function generateSpec() {
  // Try .json endpoint first, fall back to adding Accept header
  let req = new Request("http://localhost/openapi.json");
  let res = await openapi.fetch(req);

  if (!res.ok) {
    // Try with Accept header
    req = new Request("http://localhost/openapi", {
      headers: { "Accept": "application/json" },
    });
    res = await openapi.fetch(req);
  }

  const spec = await res.json();

  // Write to file
  const outputPath = join(__dirname, "..", "openapi.json");
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`✓ OpenAPI spec generated at: ${outputPath}`);
  console.log(`  Title: ${spec.info?.title}`);
  console.log(`  Version: ${spec.info?.version}`);
  console.log(`  Endpoints: ${Object.keys(spec.paths || {}).length}`);
}

generateSpec().catch((error) => {
  console.error("Failed to generate OpenAPI spec:", error);
  process.exit(1);
});
