/**
 * Tests for Channel Token System
 *
 * Channel tokens are self-contained capability tokens for channel access.
 * They encode permissions, expiry, and author identity in a compact binary format.
 */

import { describe, it, expect } from "vitest";
import {
  createChannelToken,
  verifyChannelToken,
  parseChannelToken,
  type CreateTokenParams,
} from "../channel-token.js";

describe("Channel Token System", () => {
  const TEST_SECRET = "test-secret-key-for-unit-tests";
  const TEST_CHANNEL_ID = "abc123def456";

  describe("Token Creation", () => {
    it("should create and verify a basic read token", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: 3600,
      };

      const { token, expiresAt } = await createChannelToken(params, TEST_SECRET);

      expect(token.length).toBeGreaterThan(30);
      expect(expiresAt).toBeGreaterThan(Date.now() / 1000);

      const verified = await verifyChannelToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified!.channelId).toBe(TEST_CHANNEL_ID);
      expect(verified!.permissions).toContain("read");
    });

    it("should create and verify a read+append token", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read", "append"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.permissions).toContain("read");
      expect(verified!.permissions).toContain("append");
    });

    it("should generate authorId if not provided", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.authorId).toBeDefined();
      expect(verified!.authorId.length).toBe(4);
    });

    it("should use provided authorId", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        authorId: "a1b2",
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.authorId).toBe("a1b2");
    });

    it("should use displayName as authorId", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        displayName: "Alice",
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.authorId).toBe("Alice");
    });
  });

  describe("Extended Permissions", () => {
    it("should support delete:own permission", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read", "delete:own"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.permissions).toContain("read");
      expect(verified!.permissions).toContain("delete:own");
    });

    it("should support all extended permissions", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read", "append", "read:deleted", "delete:own", "delete:any"],
        displayName: "Admin",
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.permissions).toEqual(
        expect.arrayContaining(["read", "append", "read:deleted", "delete:own", "delete:any"])
      );
    });
  });

  describe("UTF-8 Display Names", () => {
    it("should support UTF-8 displayNames", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        displayName: "日本語ユーザー",
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).not.toBeNull();
      expect(verified!.authorId).toBe("日本語ユーザー");
    });

    it("should reject displayName over 32 bytes", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        displayName: "This is a very long display name that exceeds 32 bytes",
        expiresInSeconds: 3600,
      };

      await expect(createChannelToken(params, TEST_SECRET)).rejects.toThrow(
        "Author name too long"
      );
    });
  });

  describe("Token Verification", () => {
    it("should reject token with wrong secret", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, "wrong-secret");

      expect(verified).toBeNull();
    });

    it("should reject expired token", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: -1,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const verified = await verifyChannelToken(token, TEST_SECRET);

      expect(verified).toBeNull();
    });

    it("should reject tampered token", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const tampered = token.slice(0, -3) + "XYZ";
      const verified = await verifyChannelToken(tampered, TEST_SECRET);

      expect(verified).toBeNull();
    });

    it("should reject malformed token", async () => {
      const verified = await verifyChannelToken("not-a-valid-token", TEST_SECRET);
      expect(verified).toBeNull();
    });

    it("should reject empty token", async () => {
      const verified = await verifyChannelToken("", TEST_SECRET);
      expect(verified).toBeNull();
    });
  });

  describe("Token Parsing (without verification)", () => {
    it("should parse token to extract channelId", async () => {
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds: 3600,
      };

      const { token } = await createChannelToken(params, TEST_SECRET);
      const parsed = parseChannelToken(token);

      expect(parsed).not.toBeNull();
      expect(parsed!.channelId).toBe(TEST_CHANNEL_ID);
    });

    it("should return null for malformed token", () => {
      const parsed = parseChannelToken("malformed");
      expect(parsed).toBeNull();
    });
  });

  describe("Token Expiry", () => {
    it("should encode and decode expiry correctly", async () => {
      const expiresInSeconds = 86400; // 24 hours
      const params: CreateTokenParams = {
        channelId: TEST_CHANNEL_ID,
        permissions: ["read"],
        expiresInSeconds,
      };

      const before = Math.floor(Date.now() / 1000);
      const { token, expiresAt } = await createChannelToken(params, TEST_SECRET);
      const after = Math.floor(Date.now() / 1000);

      expect(expiresAt).toBeGreaterThanOrEqual(before + expiresInSeconds);
      expect(expiresAt).toBeLessThanOrEqual(after + expiresInSeconds + 1);

      const verified = await verifyChannelToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();

      // Expiry is encoded in hours, so there may be rounding
      expect(verified!.expiresAt).toBeGreaterThanOrEqual(before + expiresInSeconds - 3600);
      expect(verified!.expiresAt).toBeLessThanOrEqual(after + expiresInSeconds + 3600);
    });
  });
});
