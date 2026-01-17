/**
 * Base62 encoding/decoding utilities
 *
 * Uses alphabet: 0-9, A-Z, a-z (62 characters)
 * 64 bits encodes to ~11 characters
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = BigInt(62);

/**
 * Encode a Uint8Array to base62 string
 */
export function base62Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "0";

  // Convert bytes to a BigInt
  let num = BigInt(0);
  for (const byte of bytes) {
    num = (num << BigInt(8)) | BigInt(byte);
  }

  // Convert to base62
  if (num === BigInt(0)) return "0";

  let result = "";
  while (num > 0) {
    result = ALPHABET[Number(num % BASE)] + result;
    num = num / BASE;
  }

  return result;
}

/**
 * Decode a base62 string to Uint8Array
 */
export function base62Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  // Convert from base62 to BigInt
  let num = BigInt(0);
  for (const char of str) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base62 character: ${char}`);
    }
    num = num * BASE + BigInt(index);
  }

  // Convert BigInt to bytes
  if (num === BigInt(0)) return new Uint8Array([0]);

  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num & BigInt(0xff)));
    num = num >> BigInt(8);
  }

  return new Uint8Array(bytes);
}

/**
 * Generate a cryptographically random short ID
 * Uses 64 bits of randomness, encoded as base62 (~11 characters)
 */
export function generateShortId(): string {
  const bytes = new Uint8Array(8); // 64 bits
  crypto.getRandomValues(bytes);
  return base62Encode(bytes);
}
