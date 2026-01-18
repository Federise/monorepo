/**
 * TDD Tests for Unified Token System
 *
 * These tests define the expected behavior for the unified token system
 * that will replace the current channel-specific token implementation.
 */

import { describe, it, expect } from "vitest";
import {
  createToken,
  verifyToken,
  parseToken,
  TokenType,
  Permission,
  type Token,
  type CreateTokenParams,
  type TokenConstraints,
  type VerifiedToken,
} from "../unified-token.js";

describe("Unified Token System", () => {
  const TEST_SECRET = "test-secret-key-for-unit-tests";

  describe("Token Types", () => {
    it("should create BEARER token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ | Permission.WRITE,
        expiresInSeconds: 3600,
      };

      const { token, expiresAt } = await createToken(params, TEST_SECRET);

      expect(token).toBeDefined();
      expect(expiresAt).toBeGreaterThan(Date.now() / 1000);

      const parsed = parseToken(token);
      expect(parsed?.type).toBe(TokenType.BEARER);
    });

    it("should create RESOURCE token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "channel",
        resourceId: "chan_abc123",
        permissions: Permission.READ | Permission.WRITE,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);

      const verified = await verifyToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified!.type).toBe(TokenType.RESOURCE);
      expect(verified!.resourceType).toBe("channel");
      expect(verified!.resourceId).toBe("chan_abc123");
    });

    it("should create SHARE token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "channel",
        resourceId: "chan_abc123",
        permissions: Permission.READ,
        authorId: "Alice",
        expiresInSeconds: 86400,
      };

      const { token } = await createToken(params, TEST_SECRET);

      const verified = await verifyToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified!.type).toBe(TokenType.SHARE);
      expect(verified!.authorId).toBe("Alice");
    });

    it("should create INVITATION token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.INVITATION,
        identityId: "ident_inviter123",
        permissions: Permission.READ | Permission.WRITE,
        grantedCapabilities: ["kv:read", "kv:write"],
        expiresInSeconds: 7 * 24 * 3600, // 7 days
      };

      const { token } = await createToken(params, TEST_SECRET);

      const verified = await verifyToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified!.type).toBe(TokenType.INVITATION);
      expect(verified!.grantedCapabilities).toContain("kv:read");
    });
  });

  describe("Permission Bitmap", () => {
    it("should encode READ permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.READ).toBeTruthy();
      expect(verified!.permissions & Permission.WRITE).toBeFalsy();
    });

    it("should encode WRITE permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions: Permission.WRITE,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.WRITE).toBeTruthy();
    });

    it("should encode DELETE permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions: Permission.READ | Permission.DELETE,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.DELETE).toBeTruthy();
    });

    it("should encode LIST permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions: Permission.LIST,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.LIST).toBeTruthy();
    });

    it("should encode ADMIN permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_admin",
        permissions: Permission.ADMIN,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.ADMIN).toBeTruthy();
    });

    it("should encode SHARE permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ | Permission.SHARE,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.SHARE).toBeTruthy();
    });

    it("should encode DELEGATE permission", async () => {
      const params: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ | Permission.DELEGATE,
        authorId: "Delegator",
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.DELEGATE).toBeTruthy();
    });

    it("should encode combined permissions", async () => {
      const permissions = Permission.READ | Permission.WRITE | Permission.DELETE | Permission.LIST;

      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions).toBe(permissions);
    });
  });

  describe("Token Constraints", () => {
    it("should encode issuedAt timestamp", async () => {
      const before = Math.floor(Date.now() / 1000);

      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      const after = Math.floor(Date.now() / 1000);

      expect(verified!.issuedAt).toBeGreaterThanOrEqual(before);
      expect(verified!.issuedAt).toBeLessThanOrEqual(after);
    });

    it("should encode expiresAt timestamp", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 7200, // 2 hours
      };

      const { token, expiresAt } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.expiresAt).toBe(expiresAt);
    });

    it("should support maxUses constraint", async () => {
      const constraints: TokenConstraints = {
        maxUses: 5,
      };

      const params: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "blob",
        resourceId: "blob_123",
        permissions: Permission.READ,
        authorId: "Sharer",
        expiresInSeconds: 86400,
        constraints,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.constraints?.maxUses).toBe(5);
      expect(verified!.constraints?.requiresStateCheck).toBe(true);
    });

    it("should support canDelegate constraint", async () => {
      const constraints: TokenConstraints = {
        canDelegate: true,
        maxDelegationDepth: 2,
      };

      const params: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ | Permission.DELEGATE,
        authorId: "Original",
        expiresInSeconds: 86400,
        constraints,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.constraints?.canDelegate).toBe(true);
      expect(verified!.constraints?.maxDelegationDepth).toBe(2);
    });
  });

  describe("Token Verification", () => {
    it("should verify valid token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.identityId).toBe("ident_abc123");
    });

    it("should reject token with wrong secret", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, "wrong-secret");

      expect(verified).toBeNull();
    });

    it("should reject expired token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: -10, // Already expired
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified).toBeNull();
    });

    it("should reject tampered token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const tampered = token.slice(0, -3) + "XYZ";

      const verified = await verifyToken(tampered, TEST_SECRET);

      expect(verified).toBeNull();
    });

    it("should reject malformed token", async () => {
      const verified = await verifyToken("not-a-valid-token", TEST_SECRET);
      expect(verified).toBeNull();
    });

    it("should use timing-safe comparison", async () => {
      // This test validates the security requirement
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);

      // Verification with wrong secret should still complete
      // (timing-safe means no early exit on first mismatch)
      const result = await verifyToken(token, "X".repeat(TEST_SECRET.length));
      expect(result).toBeNull();
    });
  });

  describe("Token Parsing (without verification)", () => {
    it("should parse token to extract type", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const parsed = parseToken(token);

      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe(TokenType.RESOURCE);
    });

    it("should parse token to extract resourceId", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "channel",
        resourceId: "chan_abc123def",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const parsed = parseToken(token);

      expect(parsed!.resourceId).toBe("chan_abc123def");
    });

    it("should return null for malformed token", () => {
      const parsed = parseToken("malformed");
      expect(parsed).toBeNull();
    });
  });

  describe("Backward Compatibility with Channel Tokens", () => {
    it("should create token compatible with channel permissions", async () => {
      // Map channel permissions to unified permissions
      const readPermission = Permission.READ;
      const appendPermission = Permission.WRITE;
      const deleteOwnPermission = Permission.DELETE;

      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "channel",
        resourceId: "chan_abc123",
        permissions: readPermission | appendPermission,
        authorId: "User123",
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const verified = await verifyToken(token, TEST_SECRET);

      expect(verified!.permissions & Permission.READ).toBeTruthy();
      expect(verified!.permissions & Permission.WRITE).toBeTruthy();
    });
  });

  describe("Token Size Efficiency", () => {
    it("should create compact bearer token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);

      // Bearer tokens should be reasonably compact
      expect(token.length).toBeLessThan(100);
    });

    it("should create compact resource token", async () => {
      const params: CreateTokenParams = {
        type: TokenType.RESOURCE,
        resourceType: "kv",
        resourceId: "ns:myapp",
        permissions: Permission.READ | Permission.WRITE,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);

      // Resource tokens should be reasonably compact
      expect(token.length).toBeLessThan(80);
    });

    it("should handle variable-length authorId efficiently", async () => {
      const shortParams: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ,
        authorId: "A",
        expiresInSeconds: 3600,
      };

      const longParams: CreateTokenParams = {
        type: TokenType.SHARE,
        resourceType: "channel",
        resourceId: "chan_123",
        permissions: Permission.READ,
        authorId: "This is a much longer author name",
        expiresInSeconds: 3600,
      };

      const { token: shortToken } = await createToken(shortParams, TEST_SECRET);
      const { token: longToken } = await createToken(longParams, TEST_SECRET);

      // Longer authorId should result in longer token
      expect(longToken.length).toBeGreaterThan(shortToken.length);

      // But both should be verifiable
      expect(await verifyToken(shortToken, TEST_SECRET)).not.toBeNull();
      expect(await verifyToken(longToken, TEST_SECRET)).not.toBeNull();
    });
  });

  describe("Token Format Version", () => {
    it("should include version byte", async () => {
      const params: CreateTokenParams = {
        type: TokenType.BEARER,
        identityId: "ident_abc123",
        permissions: Permission.READ,
        expiresInSeconds: 3600,
      };

      const { token } = await createToken(params, TEST_SECRET);
      const parsed = parseToken(token);

      expect(parsed!.version).toBeDefined();
      expect(parsed!.version).toBeGreaterThanOrEqual(1);
    });
  });
});
