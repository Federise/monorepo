import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  IPresigner,
  PresignUploadOptions,
  PresignDownloadOptions,
} from "@federise/gateway-core";

export interface CloudflarePresignerConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom domain connected to R2 bucket (e.g., "cdn.example.com") */
  customDomain?: string;
}

/**
 * Cloudflare R2 presigner using S3-compatible API
 */
export class CloudflarePresigner implements IPresigner {
  private client: S3Client;
  private customDomain?: string;

  constructor(config: CloudflarePresignerConfig) {
    this.customDomain = config.customDomain;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async getSignedUploadUrl(
    bucket: string,
    key: string,
    options: PresignUploadOptions
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn,
    });
  }

  async getSignedDownloadUrl(
    bucket: string,
    key: string,
    options: PresignDownloadOptions
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn,
    });
  }

  /** Get direct public URL via custom domain. Returns null if not configured. */
  getPublicUrl(bucket: string, key: string): string | null {
    if (!this.customDomain) return null;
    return `https://${this.customDomain}/${key}`;
  }
}
