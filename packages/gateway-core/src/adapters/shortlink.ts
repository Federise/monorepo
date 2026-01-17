/**
 * Short Link Store Adapter Interface
 *
 * Abstracts short link storage operations for the Federise Gateway.
 * Implementations can use Cloudflare KV, Redis, etc.
 */

export interface ShortLink {
  /** Unique identifier (64-bit random, base62 encoded) */
  id: string;
  /** The original long URL to redirect to */
  targetUrl: string;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
}

export interface IShortLinkStore {
  /**
   * Create a new short link
   * @param targetUrl The URL to shorten
   * @returns The created short link with generated ID
   */
  create(targetUrl: string): Promise<ShortLink>;

  /**
   * Resolve a short link ID to its target
   * @param id The short link ID
   * @returns The short link if found, null otherwise
   */
  resolve(id: string): Promise<ShortLink | null>;

  /**
   * Delete a short link
   * @param id The short link ID to delete
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;
}
