/**
 * Filesystem Presigner
 *
 * Generates token-based presigned URLs for filesystem blob storage.
 * These URLs point back to the gateway which validates the token and handles the upload/download.
 */

import type {
  IPresigner,
  PresignUploadOptions,
  PresignDownloadOptions,
} from "@federise/gateway-core/adapters/presigner.js";
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
} from "../lib/signing.ts";

export interface FilesystemPresignerConfig {
  /** Base URL of the gateway (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Secret key for signing tokens (should be the bootstrap API key or a dedicated secret) */
  signingSecret: string;
}

export class FilesystemPresigner implements IPresigner {
  private baseUrl: string;
  private signingSecret: string;

  constructor(config: FilesystemPresignerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.signingSecret = config.signingSecret;
  }

  async getSignedUploadUrl(
    bucket: string,
    key: string,
    options: PresignUploadOptions
  ): Promise<string> {
    const payload = {
      bucket,
      key,
      contentType: options.contentType,
      contentLength: options.contentLength,
      expiresAt: Date.now() + options.expiresIn * 1000,
    };

    return generatePresignedUploadUrl(this.baseUrl, payload, this.signingSecret);
  }

  async getSignedDownloadUrl(
    bucket: string,
    key: string,
    options: PresignDownloadOptions
  ): Promise<string> {
    return generatePresignedDownloadUrl(
      this.baseUrl,
      bucket,
      key,
      options.expiresIn,
      this.signingSecret
    );
  }
}
