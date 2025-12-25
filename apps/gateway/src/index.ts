import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { PingEndpoint } from "./endpoints/ping";
import { PrincipalListEndpoint } from "./endpoints/principalList";
import { PrincipalCreateEndpoint } from "./endpoints/principalCreate";
import { PrincipalDeleteEndpoint } from "./endpoints/principalDelete";
import { KVListNamespacesEndpoint } from "./endpoints/kvListNamespaces";
import { KVListKeysEndpoint } from "./endpoints/kvListKeys";
import { KVGetEndpoint } from "./endpoints/kvGet";
import { KVSetEndpoint } from "./endpoints/kvSet";
import { KVBulkGetEndpoint } from "./endpoints/kvBulkGet";
import { KVBulkSetEndpoint } from "./endpoints/kvBulkSet";
import { KVDumpEndpoint } from "./endpoints/kvDump";

const app = new Hono<{ Bindings: Env }>();

app.use("*", (c, next) => {
  const origin = c.env.CORS_ORIGIN || "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    credentials: false,
  })(c, next);
});
app.use("*", authMiddleware);

const openapi = fromHono(app, {
  docs_url: "/openapi",
});

// Health routes
openapi.get("/ping", PingEndpoint);

// Principal routes
openapi.post("/principal/list", PrincipalListEndpoint);
openapi.post("/principal/create", PrincipalCreateEndpoint);
openapi.post("/principal/delete", PrincipalDeleteEndpoint);

// KV routes
openapi.post("/kv/get", KVGetEndpoint);
openapi.post("/kv/set", KVSetEndpoint);
openapi.post("/kv/keys", KVListKeysEndpoint);
openapi.post("/kv/bulk/get", KVBulkGetEndpoint);
openapi.post("/kv/bulk/set", KVBulkSetEndpoint);
openapi.post("/kv/namespaces", KVListNamespacesEndpoint);
openapi.post("/kv/dump", KVDumpEndpoint);

export default app;
