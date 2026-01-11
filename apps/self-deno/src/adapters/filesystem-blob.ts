/**
 * Filesystem Blob Store Adapter
 *
 * Stores blobs on the local filesystem for standalone deployments.
 * No external S3/MinIO required - everything runs from a single binary + data folder.
 */

import type {
  IBlobStore,
  BlobObject,
  BlobPutOptions,
  BlobListOptions,
  BlobListResult,
} from "@federise/gateway-core/adapters/blob.js";

export interface FilesystemBlobStoreConfig {
  /** Base directory for blob storage */
  basePath: string;
}

export class FilesystemBlobStore implements IBlobStore {
  private basePath: string;
  private initialized = false;

  constructor(config: FilesystemBlobStoreConfig) {
    this.basePath = config.basePath;
  }

  /**
   * Ensure the base directory exists
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await Deno.mkdir(this.basePath, { recursive: true });
      this.initialized = true;
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
      this.initialized = true;
    }
  }

  /**
   * Convert a blob key to a safe filesystem path
   * Keys can contain slashes (e.g., "namespace:folder/file.txt")
   */
  private keyToPath(key: string): string {
    // Replace colons with directory separators for namespace separation
    // Keep slashes as-is for nested paths
    const safePath = key.replace(/:/g, "/");
    return `${this.basePath}/${safePath}`;
  }

  /**
   * Get the metadata file path for a blob
   */
  private metadataPath(key: string): string {
    return `${this.keyToPath(key)}.meta.json`;
  }

  /**
   * Ensure parent directories exist for a file path
   */
  private async ensureParentDir(filePath: string): Promise<void> {
    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (parentDir) {
      await Deno.mkdir(parentDir, { recursive: true });
    }
  }

  async get(key: string): Promise<BlobObject | null> {
    await this.ensureInitialized();

    const filePath = this.keyToPath(key);
    const metaPath = this.metadataPath(key);

    try {
      // Check if file exists
      const stat = await Deno.stat(filePath);
      if (!stat.isFile) {
        return null;
      }

      // Try to read metadata
      let contentType = "application/octet-stream";
      try {
        const metaContent = await Deno.readTextFile(metaPath);
        const meta = JSON.parse(metaContent);
        contentType = meta.contentType || contentType;
      } catch {
        // Metadata file doesn't exist, use defaults
      }

      // Open file and create readable stream
      const file = await Deno.open(filePath, { read: true });
      const body = file.readable;

      return {
        body,
        size: stat.size,
        contentType,
      };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  async put(
    key: string,
    body: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: BlobPutOptions
  ): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.keyToPath(key);
    const metaPath = this.metadataPath(key);

    // Ensure parent directories exist
    await this.ensureParentDir(filePath);

    // Convert body to Uint8Array if needed
    let data: Uint8Array;
    if (body instanceof ArrayBuffer) {
      data = new Uint8Array(body);
    } else {
      // Read the stream
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      // Concatenate chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      data = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
    }

    // Write the file
    await Deno.writeFile(filePath, data);

    // Write metadata file
    const metadata = {
      contentType: options?.httpMetadata?.contentType || "application/octet-stream",
      size: data.length,
      createdAt: new Date().toISOString(),
    };
    await Deno.writeTextFile(metaPath, JSON.stringify(metadata));
  }

  async delete(key: string): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.keyToPath(key);
    const metaPath = this.metadataPath(key);

    // Delete the file
    try {
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }

    // Delete metadata file
    try {
      await Deno.remove(metaPath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  async list(options?: BlobListOptions): Promise<BlobListResult> {
    await this.ensureInitialized();

    const objects: { key: string; size: number }[] = [];
    const prefix = options?.prefix || "";
    const limit = options?.limit || 1000;

    // Walk the directory tree
    await this.walkDirectory(this.basePath, "", prefix, objects, limit);

    // Sort by key for consistent ordering
    objects.sort((a, b) => a.key.localeCompare(b.key));

    // Apply limit
    const truncated = objects.length > limit;
    const result = objects.slice(0, limit);

    return {
      objects: result,
      truncated,
      cursor: truncated ? result[result.length - 1].key : undefined,
    };
  }

  /**
   * Recursively walk directory and collect blob files
   */
  private async walkDirectory(
    basePath: string,
    relativePath: string,
    prefix: string,
    objects: { key: string; size: number }[],
    limit: number
  ): Promise<void> {
    if (objects.length >= limit * 2) {
      // Stop early if we have enough
      return;
    }

    const currentPath = relativePath ? `${basePath}/${relativePath}` : basePath;

    try {
      for await (const entry of Deno.readDir(currentPath)) {
        const entryRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.isDirectory) {
          // Recurse into subdirectory
          await this.walkDirectory(basePath, entryRelativePath, prefix, objects, limit);
        } else if (entry.isFile && !entry.name.endsWith(".meta.json")) {
          // Convert path back to key format (replace / with :)
          // But only the first slash (namespace separator)
          const parts = entryRelativePath.split("/");
          let key: string;
          if (parts.length >= 2) {
            // First part is namespace, rest is the key path
            key = parts[0] + ":" + parts.slice(1).join("/");
          } else {
            key = entryRelativePath;
          }

          // Check prefix filter
          if (prefix && !key.startsWith(prefix)) {
            continue;
          }

          // Get file size
          try {
            const stat = await Deno.stat(`${currentPath}/${entry.name}`);
            objects.push({ key, size: stat.size });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }
}
