import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  IPresigner,
  PresignUploadOptions,
  PresignDownloadOptions,
} from "@federise/gateway-core";

export interface S3PresignerConfig {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible Presigner implementation
 *
 * Generates presigned URLs for direct client uploads/downloads
 * to S3-compatible storage (MinIO, AWS S3, etc.)
 */
export class S3Presigner implements IPresigner {
  private client: S3Client;

  constructor(config: S3PresignerConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
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
}
