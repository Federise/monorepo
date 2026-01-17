import { fromHono } from "chanfana";
import { Hono } from "hono";
import type { GatewayEnv } from "./context.js";

// Endpoints
import { PingEndpoint } from "./endpoints/ping.js";
import { PrincipalListEndpoint } from "./endpoints/principal/list.js";
import { PrincipalCreateEndpoint } from "./endpoints/principal/create.js";
import { PrincipalDeleteEndpoint } from "./endpoints/principal/delete.js";
import { KVListNamespacesEndpoint } from "./endpoints/kv/list-namespaces.js";
import { KVListKeysEndpoint } from "./endpoints/kv/list-keys.js";
import { KVGetEndpoint } from "./endpoints/kv/get.js";
import { KVSetEndpoint } from "./endpoints/kv/set.js";
import { KVBulkGetEndpoint } from "./endpoints/kv/bulk-get.js";
import { KVBulkSetEndpoint } from "./endpoints/kv/bulk-set.js";
import { KVDumpEndpoint } from "./endpoints/kv/dump.js";
import { BlobUploadEndpoint } from "./endpoints/blob/upload.js";
import { BlobPresignUploadEndpoint } from "./endpoints/blob/presign-upload.js";
import { BlobGetEndpoint } from "./endpoints/blob/get.js";
import { BlobDeleteEndpoint } from "./endpoints/blob/delete.js";
import { BlobListEndpoint } from "./endpoints/blob/list.js";
import { BlobSetVisibilityEndpoint } from "./endpoints/blob/set-visibility.js";
import { registerBlobDownloadRoute } from "./endpoints/blob/download.js";
import { registerPublicBlobRoute } from "./endpoints/blob/public-download.js";
import {
  ChannelCreateEndpoint,
  ChannelListEndpoint,
  ChannelAppendEndpoint,
  ChannelReadEndpoint,
  ChannelDeleteEndpoint,
  ChannelDeleteEventEndpoint,
  ChannelTokenCreateEndpoint,
} from "./endpoints/channel/index.js";
import { registerTokenChannelRoutes } from "./endpoints/channel/token-routes.js";
import { registerChannelSubscribeRoute } from "./endpoints/channel/subscribe.js";
import {
  ShortLinkCreateEndpoint,
  ShortLinkDeleteEndpoint,
  registerShortLinkResolveRoute,
} from "./endpoints/shortlink/index.js";

/**
 * Register all gateway routes on a Hono app.
 * Returns the OpenAPI wrapper for adding additional routes.
 */
export function registerGatewayRoutes<T extends { Variables: GatewayEnv }>(
  app: Hono<T>,
  options: { docsUrl?: string } = {}
) {
  const openapi = fromHono(app, {
    docs_url: options.docsUrl ?? "/openapi",
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

  // Blob routes
  openapi.post("/blob/upload", BlobUploadEndpoint);
  openapi.post("/blob/presign-upload", BlobPresignUploadEndpoint);
  openapi.post("/blob/get", BlobGetEndpoint);
  openapi.post("/blob/delete", BlobDeleteEndpoint);
  openapi.post("/blob/list", BlobListEndpoint);
  openapi.post("/blob/visibility", BlobSetVisibilityEndpoint);

  // Channel routes
  openapi.post("/channel/create", ChannelCreateEndpoint);
  openapi.post("/channel/list", ChannelListEndpoint);
  openapi.post("/channel/append", ChannelAppendEndpoint);
  openapi.post("/channel/read", ChannelReadEndpoint);
  openapi.post("/channel/delete", ChannelDeleteEndpoint);
  openapi.post("/channel/delete-event", ChannelDeleteEventEndpoint);
  openapi.post("/channel/token/create", ChannelTokenCreateEndpoint);

  // Short link routes
  openapi.post("/short", ShortLinkCreateEndpoint);
  openapi.delete("/short/:id", ShortLinkDeleteEndpoint);

  return openapi;
}

// Re-export for direct access
export {
  registerBlobDownloadRoute,
  registerPublicBlobRoute,
  registerTokenChannelRoutes,
  registerChannelSubscribeRoute,
  registerShortLinkResolveRoute,
};
