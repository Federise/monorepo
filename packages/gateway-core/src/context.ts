import type { Context } from "hono";
import type { IKVStore, IBlobStore, IPresigner } from "./adapters/index.js";

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  bootstrapApiKey?: string;
  corsOrigin?: string;
  publicDomain?: string;
  privateBucket: string;
  publicBucket: string;
}

/**
 * Gateway environment with adapters
 */
export interface GatewayEnv {
  kv: IKVStore;
  r2: IBlobStore;
  r2Public: IBlobStore;
  presigner?: IPresigner;
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
 * Helper to get private blob store from context
 */
export function getR2(c: AppContext): IBlobStore {
  return c.get("r2");
}

/**
 * Helper to get public blob store from context
 */
export function getR2Public(c: AppContext): IBlobStore {
  return c.get("r2Public");
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
