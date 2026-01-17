import type { Context } from "hono";
import type { IKVStore, IBlobStore, IPresigner, IChannelStore, IShortLinkStore } from "./adapters/index.js";

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  bootstrapApiKey?: string;
  corsOrigin?: string;
  /** Secret key for HMAC signing of presigned download URLs */
  signingSecret: string;
  /** Single bucket name for all blob storage */
  bucket: string;
  /** Default expiry for presigned URLs in seconds (default: 3600) */
  presignExpiresIn?: number;
}

/**
 * Gateway environment with adapters
 */
export interface GatewayEnv {
  kv: IKVStore;
  /** Single blob store for all files */
  blob: IBlobStore;
  /** Channel store for atomic channel operations */
  channelStore: IChannelStore;
  /** Presigner for direct S3-compatible uploads (optional) */
  presigner?: IPresigner;
  /** Short link store for URL shortening */
  shortLink: IShortLinkStore;
  config: GatewayConfig;
}

/**
 * Hono context with gateway environment
 */
export type AppContext = Context<{ Variables: GatewayEnv }>;

/**
 * Helper to get KV store from context
 */
export function getKV(c: AppContext): IKVStore {
  return c.get("kv");
}

/**
 * Helper to get blob store from context
 */
export function getBlob(c: AppContext): IBlobStore {
  return c.get("blob");
}

/**
 * Helper to get channel store from context
 */
export function getChannelStore(c: AppContext): IChannelStore {
  return c.get("channelStore");
}

/**
 * Helper to get presigner from context (may be undefined if not configured)
 */
export function getPresigner(c: AppContext): IPresigner | undefined {
  return c.get("presigner");
}

/**
 * Helper to get config from context
 */
export function getConfig(c: AppContext): GatewayConfig {
  return c.get("config");
}

/**
 * Helper to get short link store from context
 */
export function getShortLink(c: AppContext): IShortLinkStore {
  return c.get("shortLink");
}
