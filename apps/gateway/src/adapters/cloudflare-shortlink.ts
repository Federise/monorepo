import type { IShortLinkStore, ShortLink } from "@federise/gateway-core";
import { generateShortId } from "@federise/gateway-core";

const KEY_PREFIX = "__SHORTLINK:";

interface StoredShortLink {
  targetUrl: string;
  createdAt: number;
}

/**
 * Cloudflare KV adapter implementing IShortLinkStore interface
 */
export class CloudflareShortLinkAdapter implements IShortLinkStore {
  constructor(private kv: KVNamespace) {}

  async create(targetUrl: string): Promise<ShortLink> {
    const id = generateShortId();
    const createdAt = Date.now();

    const stored: StoredShortLink = {
      targetUrl,
      createdAt,
    };

    await this.kv.put(`${KEY_PREFIX}${id}`, JSON.stringify(stored));

    return { id, targetUrl, createdAt };
  }

  async resolve(id: string): Promise<ShortLink | null> {
    const value = await this.kv.get(`${KEY_PREFIX}${id}`);
    if (!value) {
      return null;
    }

    const stored: StoredShortLink = JSON.parse(value);
    return { id, ...stored };
  }

  async delete(id: string): Promise<boolean> {
    const exists = await this.kv.get(`${KEY_PREFIX}${id}`);
    if (!exists) {
      return false;
    }

    await this.kv.delete(`${KEY_PREFIX}${id}`);
    return true;
  }
}
