/**
 * Unified Token System
 *
 * This module implements the unified token format as specified in docs/identity-auth-requirements.md
 * It provides a single token format for bearer, resource, share, and invitation tokens.
 *
 * @module unified-token
 */

// ============================================================================
// Types and Enums
// ============================================================================

export enum TokenType {
  BEARER = 0x01,
  RESOURCE = 0x02,
  SHARE = 0x03,
  INVITATION = 0x04,
}

/**
 * Permission bitmap values.
 * Low byte (0-7): Common permissions
 * High byte (8-15): Resource-specific permissions
 */
export const Permission = {
  READ: 0x01,
  WRITE: 0x02,
  DELETE: 0x04,
  LIST: 0x08,
  ADMIN: 0x10,
  SHARE: 0x20,
  DELEGATE: 0x40,
  // Reserved: 0x80
} as const;

export type PermissionBitmap = number;

export interface TokenConstraints {
  maxUses?: number;
  canDelegate?: boolean;
  maxDelegationDepth?: number;
  requiresStateCheck?: boolean;
}

export interface CreateTokenParams {
  type: TokenType;
  permissions: PermissionBitmap;
  expiresInSeconds: number;

  // For BEARER tokens
  identityId?: string;

  // For RESOURCE and SHARE tokens
  resourceType?: string;
  resourceId?: string;

  // For SHARE tokens
  authorId?: string;

  // For INVITATION tokens
  grantedCapabilities?: string[];

  // Constraints
  constraints?: TokenConstraints;
}

export interface Token {
  version: number;
  type: TokenType;
  permissions: PermissionBitmap;
  issuedAt: number;
  expiresAt: number;

  // Optional fields based on token type
  identityId?: string;
  resourceType?: string;
  resourceId?: string;
  authorId?: string;
  grantedCapabilities?: string[];
  constraints?: TokenConstraints;
}

export interface VerifiedToken extends Token {}

export interface ParsedToken {
  version: number;
  type: TokenType;
  resourceId?: string;
  resourceType?: string;
}

// ============================================================================
// Constants
// ============================================================================

const TOKEN_VERSION = 0x01;
const TOKEN_EPOCH = 1704067200; // 2024-01-01 00:00:00 UTC
const SIGNATURE_LENGTH = 12;

// ============================================================================
// Token Operations
// ============================================================================

/**
 * Create a new token.
 */
export async function createToken(
  params: CreateTokenParams,
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + params.expiresInSeconds;
  const issuedAt = now;

  // Build payload based on token type
  let payload: Uint8Array;

  switch (params.type) {
    case TokenType.BEARER:
      payload = buildBearerPayload(params, issuedAt, expiresAt);
      break;
    case TokenType.RESOURCE:
    case TokenType.SHARE:
      payload = buildResourcePayload(params, issuedAt, expiresAt);
      break;
    case TokenType.INVITATION:
      payload = buildInvitationPayload(params, issuedAt, expiresAt);
      break;
    default:
      throw new Error(`Unknown token type: ${params.type}`);
  }

  // Sign the payload
  const signature = await signPayload(payload, secret);
  const truncatedSig = signature.slice(0, SIGNATURE_LENGTH);

  // Combine payload + signature
  const token = new Uint8Array(payload.length + SIGNATURE_LENGTH);
  token.set(payload, 0);
  token.set(truncatedSig, payload.length);

  return {
    token: base64UrlEncode(token),
    expiresAt,
  };
}

/**
 * Verify and decode a token.
 */
export async function verifyToken(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    const bytes = base64UrlDecode(tokenString);
    if (bytes.length < 10 + SIGNATURE_LENGTH) {
      return null;
    }

    // Extract payload and signature
    const payloadLength = bytes.length - SIGNATURE_LENGTH;
    const payload = bytes.slice(0, payloadLength);
    const providedSig = bytes.slice(payloadLength);

    // Verify signature
    const expectedSig = await signPayload(payload, secret);
    const truncatedExpected = expectedSig.slice(0, SIGNATURE_LENGTH);

    if (!timingSafeEqualBytes(providedSig, truncatedExpected)) {
      return null;
    }

    // Parse token
    const token = parsePayload(payload);
    if (!token) {
      return null;
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (token.expiresAt < now) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Parse a token without verification (for extracting type/resourceId).
 */
export function parseToken(tokenString: string): ParsedToken | null {
  try {
    const bytes = base64UrlDecode(tokenString);
    if (bytes.length < 5) {
      return null;
    }

    const version = bytes[0];
    const type = bytes[1] as TokenType;

    // Extract resourceId for resource/share tokens
    let resourceId: string | undefined;
    let resourceType: string | undefined;

    if (type === TokenType.RESOURCE || type === TokenType.SHARE) {
      // Resource type is 1 byte at position 2
      const resourceTypeByte = bytes[2];
      resourceType = decodeResourceType(resourceTypeByte);

      // Resource ID length at position 3
      const resourceIdLen = bytes[3];
      if (bytes.length >= 4 + resourceIdLen) {
        const resourceIdBytes = bytes.slice(4, 4 + resourceIdLen);
        resourceId = new TextDecoder().decode(resourceIdBytes);
      }
    }

    return {
      version,
      type,
      resourceId,
      resourceType,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Payload Builders
// ============================================================================

function buildBearerPayload(
  params: CreateTokenParams,
  issuedAt: number,
  expiresAt: number
): Uint8Array {
  const identityId = params.identityId || "";
  const identityBytes = new TextEncoder().encode(identityId);

  // version(1) + type(1) + permissions(2) + issuedAt(4) + expiresAt(4) + identityIdLen(1) + identityId(N)
  const payloadLen = 1 + 1 + 2 + 4 + 4 + 1 + identityBytes.length;
  const payload = new Uint8Array(payloadLen);

  let offset = 0;
  payload[offset++] = TOKEN_VERSION;
  payload[offset++] = params.type;

  // Permissions (2 bytes, big-endian)
  payload[offset++] = (params.permissions >> 8) & 0xff;
  payload[offset++] = params.permissions & 0xff;

  // IssuedAt (4 bytes, relative to epoch)
  const relativeIssued = issuedAt - TOKEN_EPOCH;
  writeUint32(payload, offset, relativeIssued);
  offset += 4;

  // ExpiresAt (4 bytes, relative to epoch)
  const relativeExpires = expiresAt - TOKEN_EPOCH;
  writeUint32(payload, offset, relativeExpires);
  offset += 4;

  // Identity ID
  payload[offset++] = identityBytes.length;
  payload.set(identityBytes, offset);

  return payload;
}

function buildResourcePayload(
  params: CreateTokenParams,
  issuedAt: number,
  expiresAt: number
): Uint8Array {
  const resourceType = encodeResourceType(params.resourceType || "");
  const resourceId = params.resourceId || "";
  const resourceIdBytes = new TextEncoder().encode(resourceId);
  const authorId = params.authorId || "";
  const authorIdBytes = new TextEncoder().encode(authorId);

  // Encode constraints as flags + values
  const constraints = params.constraints || {};
  const constraintFlags = encodeConstraintFlags(constraints);
  const constraintValues = encodeConstraintValues(constraints);

  // version(1) + type(1) + resourceType(1) + resourceIdLen(1) + resourceId(N) +
  // permissions(2) + issuedAt(4) + expiresAt(4) + authorIdLen(1) + authorId(N) +
  // constraintFlags(1) + constraintValues(N)
  const payloadLen = 1 + 1 + 1 + 1 + resourceIdBytes.length + 2 + 4 + 4 + 1 + authorIdBytes.length + 1 + constraintValues.length;
  const payload = new Uint8Array(payloadLen);

  let offset = 0;
  payload[offset++] = TOKEN_VERSION;
  payload[offset++] = params.type;
  payload[offset++] = resourceType;
  payload[offset++] = resourceIdBytes.length;
  payload.set(resourceIdBytes, offset);
  offset += resourceIdBytes.length;

  // Permissions (2 bytes)
  payload[offset++] = (params.permissions >> 8) & 0xff;
  payload[offset++] = params.permissions & 0xff;

  // Times
  writeUint32(payload, offset, issuedAt - TOKEN_EPOCH);
  offset += 4;
  writeUint32(payload, offset, expiresAt - TOKEN_EPOCH);
  offset += 4;

  // Author ID
  payload[offset++] = authorIdBytes.length;
  payload.set(authorIdBytes, offset);
  offset += authorIdBytes.length;

  // Constraints
  payload[offset++] = constraintFlags;
  payload.set(constraintValues, offset);

  return payload;
}

function buildInvitationPayload(
  params: CreateTokenParams,
  issuedAt: number,
  expiresAt: number
): Uint8Array {
  const identityId = params.identityId || "";
  const identityBytes = new TextEncoder().encode(identityId);
  const capabilities = params.grantedCapabilities || [];
  const capabilitiesJson = JSON.stringify(capabilities);
  const capabilitiesBytes = new TextEncoder().encode(capabilitiesJson);

  // version(1) + type(1) + permissions(2) + issuedAt(4) + expiresAt(4) +
  // identityIdLen(1) + identityId(N) + capabilitiesLen(2) + capabilities(N)
  const payloadLen = 1 + 1 + 2 + 4 + 4 + 1 + identityBytes.length + 2 + capabilitiesBytes.length;
  const payload = new Uint8Array(payloadLen);

  let offset = 0;
  payload[offset++] = TOKEN_VERSION;
  payload[offset++] = params.type;

  // Permissions
  payload[offset++] = (params.permissions >> 8) & 0xff;
  payload[offset++] = params.permissions & 0xff;

  // Times
  writeUint32(payload, offset, issuedAt - TOKEN_EPOCH);
  offset += 4;
  writeUint32(payload, offset, expiresAt - TOKEN_EPOCH);
  offset += 4;

  // Identity ID
  payload[offset++] = identityBytes.length;
  payload.set(identityBytes, offset);
  offset += identityBytes.length;

  // Capabilities (2-byte length)
  payload[offset++] = (capabilitiesBytes.length >> 8) & 0xff;
  payload[offset++] = capabilitiesBytes.length & 0xff;
  payload.set(capabilitiesBytes, offset);

  return payload;
}

function parsePayload(payload: Uint8Array): VerifiedToken | null {
  try {
    let offset = 0;
    const version = payload[offset++];
    const type = payload[offset++] as TokenType;

    let permissions: number;
    let issuedAt: number;
    let expiresAt: number;
    let identityId: string | undefined;
    let resourceType: string | undefined;
    let resourceId: string | undefined;
    let authorId: string | undefined;
    let grantedCapabilities: string[] | undefined;
    let constraints: TokenConstraints | undefined;

    switch (type) {
      case TokenType.BEARER: {
        permissions = (payload[offset++] << 8) | payload[offset++];
        issuedAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        expiresAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        const identityIdLen = payload[offset++];
        identityId = new TextDecoder().decode(payload.slice(offset, offset + identityIdLen));
        break;
      }

      case TokenType.RESOURCE:
      case TokenType.SHARE: {
        resourceType = decodeResourceType(payload[offset++]);
        const resourceIdLen = payload[offset++];
        resourceId = new TextDecoder().decode(payload.slice(offset, offset + resourceIdLen));
        offset += resourceIdLen;
        permissions = (payload[offset++] << 8) | payload[offset++];
        issuedAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        expiresAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        const authorIdLen = payload[offset++];
        authorId = new TextDecoder().decode(payload.slice(offset, offset + authorIdLen));
        offset += authorIdLen;

        // Decode constraints if present
        if (offset < payload.length) {
          const constraintFlags = payload[offset++];
          if (constraintFlags > 0) {
            const result = decodeConstraints(constraintFlags, payload, offset);
            constraints = result.constraints;
          }
        }
        break;
      }

      case TokenType.INVITATION: {
        permissions = (payload[offset++] << 8) | payload[offset++];
        issuedAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        expiresAt = readUint32(payload, offset) + TOKEN_EPOCH;
        offset += 4;
        const identityIdLen = payload[offset++];
        identityId = new TextDecoder().decode(payload.slice(offset, offset + identityIdLen));
        offset += identityIdLen;
        const capLen = (payload[offset++] << 8) | payload[offset++];
        const capJson = new TextDecoder().decode(payload.slice(offset, offset + capLen));
        grantedCapabilities = JSON.parse(capJson);
        break;
      }

      default:
        return null;
    }

    return {
      version,
      type,
      permissions,
      issuedAt,
      expiresAt,
      identityId,
      resourceType,
      resourceId,
      authorId,
      grantedCapabilities,
      constraints,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

// Constraint flag bits
const CONSTRAINT_HAS_MAX_USES = 0x01;
const CONSTRAINT_CAN_DELEGATE = 0x02;
const CONSTRAINT_HAS_MAX_DEPTH = 0x04;

function encodeConstraintFlags(constraints: TokenConstraints): number {
  let flags = 0;
  if (constraints.maxUses !== undefined) flags |= CONSTRAINT_HAS_MAX_USES;
  if (constraints.canDelegate) flags |= CONSTRAINT_CAN_DELEGATE;
  if (constraints.maxDelegationDepth !== undefined) flags |= CONSTRAINT_HAS_MAX_DEPTH;
  return flags;
}

function encodeConstraintValues(constraints: TokenConstraints): Uint8Array {
  const values: number[] = [];

  if (constraints.maxUses !== undefined) {
    // Encode maxUses as 2 bytes
    values.push((constraints.maxUses >> 8) & 0xff);
    values.push(constraints.maxUses & 0xff);
  }

  if (constraints.maxDelegationDepth !== undefined) {
    values.push(constraints.maxDelegationDepth);
  }

  return new Uint8Array(values);
}

function decodeConstraints(
  flags: number,
  data: Uint8Array,
  offset: number
): { constraints: TokenConstraints; bytesRead: number } {
  const constraints: TokenConstraints = {};
  let bytesRead = 0;

  if (flags & CONSTRAINT_HAS_MAX_USES) {
    constraints.maxUses = (data[offset + bytesRead] << 8) | data[offset + bytesRead + 1];
    constraints.requiresStateCheck = true;
    bytesRead += 2;
  }

  if (flags & CONSTRAINT_CAN_DELEGATE) {
    constraints.canDelegate = true;
  }

  if (flags & CONSTRAINT_HAS_MAX_DEPTH) {
    constraints.maxDelegationDepth = data[offset + bytesRead];
    bytesRead += 1;
  }

  return { constraints, bytesRead };
}

const RESOURCE_TYPE_MAP: Record<string, number> = {
  kv: 0x01,
  blob: 0x02,
  channel: 0x03,
  namespace: 0x04,
};

const RESOURCE_TYPE_REVERSE: Record<number, string> = {
  0x01: "kv",
  0x02: "blob",
  0x03: "channel",
  0x04: "namespace",
};

function encodeResourceType(type: string): number {
  return RESOURCE_TYPE_MAP[type] || 0x00;
}

function decodeResourceType(byte: number): string {
  return RESOURCE_TYPE_REVERSE[byte] || "unknown";
}

function writeUint32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 24) & 0xff;
  buf[offset + 1] = (value >> 16) & 0xff;
  buf[offset + 2] = (value >> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function readUint32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  );
}

async function signPayload(data: Uint8Array, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, buffer);
  return new Uint8Array(signature);
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function base64UrlEncode(data: Uint8Array): string {
  const str = String.fromCharCode(...data);
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  if (padding) {
    padded += "=".repeat(4 - padding);
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
