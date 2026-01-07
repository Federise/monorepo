import type { FileSystemTree } from '@webcontainer/api';

/**
 * Returns the file system tree for the Cloudflare gateway.
 * This includes all necessary files to deploy to Cloudflare Workers.
 */
export function getGatewayFiles(): FileSystemTree {
  return {
    'package.json': {
      file: {
        contents: JSON.stringify(
          {
            name: 'federise-gateway',
            version: '0.0.1',
            private: true,
            scripts: {
              deploy: 'wrangler deploy'
            },
            dependencies: {
              '@federise/gateway-core': '^0.0.1',
              '@aws-sdk/client-s3': '^3.958.0',
              '@aws-sdk/s3-request-presigner': '^3.958.0',
              chanfana: '^2.6.3',
              hono: '^4.6.20',
              zod: '^3.24.1'
            },
            devDependencies: {
              wrangler: '^4.56.0'
            }
          },
          null,
          2
        )
      }
    },
    'wrangler.jsonc': {
      file: {
        contents: `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "federise-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2025-02-04",
  "observability": {
    "enabled": true
  },
  "kv_namespaces": [
    { "binding": "KV", "id": "YOUR_KV_NAMESPACE_ID" }
  ],
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "federise-objects" },
    { "binding": "R2_PUBLIC", "bucket_name": "federise-objects-public" }
  ]
}`
      }
    },
    src: {
      directory: {
        'index.ts': {
          file: {
            contents: `import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  type GatewayEnv,
} from "@federise/gateway-core";
import { CloudflareKVAdapter } from "./adapters/cloudflare-kv";
import { CloudflareR2Adapter } from "./adapters/cloudflare-r2";
import { CloudflarePresigner } from "./adapters/cloudflare-presigner";

const app = new Hono<{ Bindings: Env; Variables: GatewayEnv }>();

// Inject adapters into context from Cloudflare bindings
app.use("*", async (c, next) => {
  c.set("kv", new CloudflareKVAdapter(c.env.KV));
  c.set("r2", new CloudflareR2Adapter(c.env.R2));
  c.set("r2Public", new CloudflareR2Adapter(c.env.R2_PUBLIC));

  // Create presigner if credentials are configured
  if (c.env.R2_ACCOUNT_ID && c.env.R2_ACCESS_KEY_ID && c.env.R2_SECRET_ACCESS_KEY) {
    c.set("presigner", new CloudflarePresigner({
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    }));
  }

  c.set("config", {
    bootstrapApiKey: c.env.BOOTSTRAP_API_KEY,
    corsOrigin: c.env.CORS_ORIGIN,
    publicDomain: c.env.PUBLIC_DOMAIN,
    privateBucket: "federise-objects",
    publicBucket: "federise-objects-public",
  });

  return next();
});

// CORS middleware
app.use("*", (c, next) => {
  const origin = c.get("config").corsOrigin || "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public"],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    maxAge: 86400,
    credentials: false,
  })(c, next);
});

// Register blob download route BEFORE auth middleware (uses URL-based auth via obscurity)
registerBlobDownloadRoute(app);

// Auth middleware
app.use("*", createAuthMiddleware());

// Register all gateway routes
registerGatewayRoutes(app);

export default app;
`
          }
        },
        'env.d.ts': {
          file: {
            contents: `interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  R2_PUBLIC: R2Bucket;
  BOOTSTRAP_API_KEY: string;
  CORS_ORIGIN?: string;
  PUBLIC_DOMAIN?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}
`
          }
        },
        adapters: {
          directory: {
            'index.ts': {
              file: {
                contents: `export { CloudflareKVAdapter } from "./cloudflare-kv.js";
export { CloudflareR2Adapter } from "./cloudflare-r2.js";
export { CloudflarePresigner, type CloudflarePresignerConfig } from "./cloudflare-presigner.js";
`
              }
            },
            'cloudflare-kv.ts': {
              file: {
                contents: `import type { KVAdapter, ListOptions, ListResult, KVValue } from "@federise/gateway-core";

export class CloudflareKVAdapter implements KVAdapter {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key, "text");
  }

  async getWithMetadata<T = unknown>(key: string): Promise<KVValue<T> | null> {
    const result = await this.kv.getWithMetadata<T>(key, "text");
    if (!result.value) return null;
    return {
      value: result.value,
      metadata: result.metadata ?? undefined,
    };
  }

  async set(key: string, value: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.kv.put(key, value, { metadata });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const result = await this.kv.list({
      prefix: options.prefix,
      limit: options.limit,
      cursor: options.cursor,
    });
    return {
      keys: result.keys.map((k) => ({
        name: k.name,
        metadata: k.metadata as Record<string, unknown> | undefined,
      })),
      cursor: result.list_complete ? undefined : result.cursor,
    };
  }
}
`
              }
            },
            'cloudflare-r2.ts': {
              file: {
                contents: `import type { BlobAdapter, BlobMeta, UploadOptions, ListOptions, BlobListResult, HeadResult } from "@federise/gateway-core";

export class CloudflareR2Adapter implements BlobAdapter {
  constructor(private bucket: R2Bucket) {}

  async get(key: string): Promise<{ body: ReadableStream; meta: BlobMeta } | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: object.body,
      meta: {
        size: object.size,
        contentType: object.httpMetadata?.contentType,
        etag: object.etag,
        uploaded: object.uploaded.toISOString(),
        customMetadata: object.customMetadata,
      },
    };
  }

  async head(key: string): Promise<HeadResult | null> {
    const object = await this.bucket.head(key);
    if (!object) return null;
    return {
      size: object.size,
      contentType: object.httpMetadata?.contentType,
      etag: object.etag,
      uploaded: object.uploaded.toISOString(),
      customMetadata: object.customMetadata,
    };
  }

  async put(key: string, body: ReadableStream | ArrayBuffer | string, options?: UploadOptions): Promise<BlobMeta> {
    const object = await this.bucket.put(key, body, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.customMetadata,
    });
    return {
      size: object.size,
      contentType: object.httpMetadata?.contentType,
      etag: object.etag,
      uploaded: object.uploaded.toISOString(),
      customMetadata: object.customMetadata,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(options: ListOptions = {}): Promise<BlobListResult> {
    const result = await this.bucket.list({
      prefix: options.prefix,
      limit: options.limit,
      cursor: options.cursor,
    });
    return {
      objects: result.objects.map((obj) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        etag: obj.etag,
        customMetadata: obj.customMetadata,
      })),
      cursor: result.truncated ? result.cursor : undefined,
    };
  }
}
`
              }
            },
            'cloudflare-presigner.ts': {
              file: {
                contents: `import type { PresignerAdapter, PresignedUrlResult } from "@federise/gateway-core";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface CloudflarePresignerConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class CloudflarePresigner implements PresignerAdapter {
  private client: S3Client;

  constructor(config: CloudflarePresignerConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: \`https://\${config.accountId}.r2.cloudflarestorage.com\`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async presignUpload(
    bucket: string,
    key: string,
    options?: { expiresIn?: number; contentType?: string }
  ): Promise<PresignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options?.contentType,
    });

    const expiresIn = options?.expiresIn ?? 3600;
    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return { url, expiresAt };
  }
}
`
              }
            }
          }
        }
      }
    },
    'tsconfig.json': {
      file: {
        contents: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              types: ['@cloudflare/workers-types']
            },
            include: ['src/**/*']
          },
          null,
          2
        )
      }
    }
  };
}
