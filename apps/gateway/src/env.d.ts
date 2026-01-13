import type { LogStorageDO } from "./durable-objects/log-storage.js";

declare interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  LOG_DO: DurableObjectNamespace<LogStorageDO>;
  BOOTSTRAP_API_KEY?: string;
  CORS_ORIGIN?: string;
  SIGNING_SECRET: string;
  R2_BUCKET?: string;
  PRESIGN_EXPIRES_IN?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Custom domain connected to R2 bucket for public file access */
  R2_CUSTOM_DOMAIN?: string;
}
