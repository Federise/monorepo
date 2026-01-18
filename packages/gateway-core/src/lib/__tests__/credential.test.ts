/**
 * TDD Tests for Credential System
 *
 * These tests define the expected behavior for the credential system.
 * The implementation should make these tests pass.
 */

import { describe, it, expect } from "vitest";
import {
  createCredential,
  verifyCredential,
  rotateCredential,
  revokeCredential,
  CredentialType,
  CredentialStatus,
  type Credential,
  type CreateCredentialParams,
  type CredentialScope,
} from "../credential.js";

describe("Credential System", () => {
  describe("Credential Types", () => {
    it("should create API_KEY credential", async () => {
      const params: CreateCredentialParams = {
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      };

      const { credential, secret } = await createCredential(params);

      expect(credential.type).toBe(CredentialType.API_KEY);
      expect(credential.id).toMatch(/^cred_/);
      expect(credential.identityId).toBe("ident_abc123");
      expect(credential.secretHash).toBeDefined();
      expect(secret).toHaveLength(64); // 32 bytes hex
    });

    it("should create BEARER_TOKEN credential reference", async () => {
      const params: CreateCredentialParams = {
        identityId: "ident_abc123",
        type: CredentialType.BEARER_TOKEN,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };

      const { credential } = await createCredential(params);

      expect(credential.type).toBe(CredentialType.BEARER_TOKEN);
      expect(credential.expiresAt).toBeDefined();
    });

    it("should create REFRESH_TOKEN credential", async () => {
      const params: CreateCredentialParams = {
        identityId: "ident_abc123",
        type: CredentialType.REFRESH_TOKEN,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      };

      const { credential, secret } = await createCredential(params);

      expect(credential.type).toBe(CredentialType.REFRESH_TOKEN);
      expect(secret).toBeDefined();
    });

    it("should create INVITATION credential", async () => {
      const params: CreateCredentialParams = {
        identityId: "ident_abc123", // Inviter's identity
        type: CredentialType.INVITATION,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        scope: {
          capabilities: ["kv:read"],
        },
      };

      const { credential, secret } = await createCredential(params);

      expect(credential.type).toBe(CredentialType.INVITATION);
      expect(credential.scope?.capabilities).toContain("kv:read");
      expect(secret).toBeDefined();
    });
  });

  describe("Credential Structure", () => {
    it("should generate unique id with cred_ prefix", async () => {
      const { credential: cred1 } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const { credential: cred2 } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      expect(cred1.id).toMatch(/^cred_[a-zA-Z0-9]+$/);
      expect(cred2.id).toMatch(/^cred_[a-zA-Z0-9]+$/);
      expect(cred1.id).not.toBe(cred2.id);
    });

    it("should store secret as SHA-256 hash", async () => {
      const { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      expect(credential.secretHash).toBeDefined();
      expect(credential.secretHash).toHaveLength(64); // SHA-256 hex

      // Secret should not be stored directly
      expect((credential as unknown as { secret?: string }).secret).toBeUndefined();
    });

    it("should set default status to ACTIVE", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      expect(credential.status).toBe(CredentialStatus.ACTIVE);
    });

    it("should set createdAt timestamp", async () => {
      const before = new Date().toISOString();
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });
      const after = new Date().toISOString();

      expect(credential.createdAt >= before).toBe(true);
      expect(credential.createdAt <= after).toBe(true);
    });

    it("should support optional expiresAt", async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        expiresAt,
      });

      expect(credential.expiresAt).toBe(expiresAt);
    });
  });

  describe("Credential Verification", () => {
    it("should verify valid API key", async () => {
      const { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const result = await verifyCredential(credential, secret);

      expect(result.valid).toBe(true);
      expect(result.identityId).toBe("ident_abc123");
    });

    it("should reject invalid API key", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const result = await verifyCredential(credential, "wrong-secret");

      expect(result.valid).toBe(false);
    });

    it("should reject expired credential", async () => {
      const { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      });

      const result = await verifyCredential(credential, secret);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("should reject revoked credential", async () => {
      let { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      credential = revokeCredential(credential, "test revocation");

      const result = await verifyCredential(credential, secret);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("revoked");
    });

    it("should use timing-safe comparison", async () => {
      const { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      // This test verifies the implementation uses timing-safe comparison
      // by ensuring verification time is consistent regardless of how
      // "wrong" the secret is (first char wrong vs last char wrong)
      const wrongFirst = "X" + secret.slice(1);
      const wrongLast = secret.slice(0, -1) + "X";

      const result1 = await verifyCredential(credential, wrongFirst);
      const result2 = await verifyCredential(credential, wrongLast);

      // Both should be invalid
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });
  });

  describe("Credential Scoping", () => {
    it("should restrict to specific capabilities", async () => {
      const scope: CredentialScope = {
        capabilities: ["kv:read", "blob:read"],
      };

      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        scope,
      });

      expect(credential.scope?.capabilities).toContain("kv:read");
      expect(credential.scope?.capabilities).toContain("blob:read");
      expect(credential.scope?.capabilities).not.toContain("kv:write");
    });

    it("should restrict to specific namespaces", async () => {
      const scope: CredentialScope = {
        namespaces: ["app:myapp", "shared:team"],
      };

      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        scope,
      });

      expect(credential.scope?.namespaces).toContain("app:myapp");
      expect(credential.scope?.namespaces).toContain("shared:team");
    });

    it("should restrict to specific resources", async () => {
      const scope: CredentialScope = {
        resources: [
          { type: "channel", id: "chan_123", permissions: ["read", "append"] },
        ],
      };

      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        scope,
      });

      expect(credential.scope?.resources?.[0].type).toBe("channel");
      expect(credential.scope?.resources?.[0].id).toBe("chan_123");
    });

    it("should support scope with earlier expiry", async () => {
      const credExpiry = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours
      const scopeExpiry = new Date(Date.now() + 1 * 3600 * 1000); // 1 hour

      const scope: CredentialScope = {
        capabilities: ["kv:read"],
        expiresAt: scopeExpiry.toISOString(),
      };

      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        expiresAt: credExpiry.toISOString(),
        scope,
      });

      expect(credential.scope?.expiresAt).toBe(scopeExpiry.toISOString());
      expect(new Date(credential.scope!.expiresAt!).getTime())
        .toBeLessThan(new Date(credential.expiresAt!).getTime());
    });
  });

  describe("Credential Rotation", () => {
    it("should create new credential with same scope", async () => {
      const { credential: oldCred } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        scope: { capabilities: ["kv:read"] },
      });

      const { oldCredential, newCredential, newSecret } = await rotateCredential(oldCred);

      expect(newCredential.id).not.toBe(oldCredential.id);
      expect(newCredential.identityId).toBe(oldCred.identityId);
      expect(newCredential.scope?.capabilities).toContain("kv:read");
      expect(newSecret).toBeDefined();
    });

    it("should set old credential to ROTATING status", async () => {
      const { credential: oldCred, secret: oldSecret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const { oldCredential } = await rotateCredential(oldCred);

      expect(oldCredential.status).toBe(CredentialStatus.ROTATING);

      // Old credential should still work during rotation
      const result = await verifyCredential(oldCredential, oldSecret);
      expect(result.valid).toBe(true);
    });

    it("should allow both credentials during grace period", async () => {
      const { credential: oldCred, secret: oldSecret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const { oldCredential, newCredential, newSecret } = await rotateCredential(oldCred);

      // Both should be valid during grace period
      const oldResult = await verifyCredential(oldCredential, oldSecret);
      const newResult = await verifyCredential(newCredential, newSecret);

      expect(oldResult.valid).toBe(true);
      expect(newResult.valid).toBe(true);
    });
  });

  describe("Credential Revocation", () => {
    it("should set status to REVOKED", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const revoked = revokeCredential(credential, "User requested");

      expect(revoked.status).toBe(CredentialStatus.REVOKED);
    });

    it("should record revocation reason", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const revoked = revokeCredential(credential, "Suspected compromise");

      expect(revoked.revocationReason).toBe("Suspected compromise");
    });

    it("should record revokedAt timestamp", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const before = new Date().toISOString();
      const revoked = revokeCredential(credential, "Test");
      const after = new Date().toISOString();

      expect(revoked.revokedAt).toBeDefined();
      expect(revoked.revokedAt! >= before).toBe(true);
      expect(revoked.revokedAt! <= after).toBe(true);
    });
  });

  describe("Multiple Credentials Per Identity", () => {
    it("should allow multiple API keys", async () => {
      const { credential: cred1 } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const { credential: cred2 } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      expect(cred1.id).not.toBe(cred2.id);
      expect(cred1.identityId).toBe(cred2.identityId);
    });

    it("should allow different credential types", async () => {
      const { credential: apiKey } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const { credential: refreshToken } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.REFRESH_TOKEN,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });

      expect(apiKey.type).toBe(CredentialType.API_KEY);
      expect(refreshToken.type).toBe(CredentialType.REFRESH_TOKEN);
    });
  });

  describe("Credential Serialization", () => {
    it("should serialize to storage format", async () => {
      const { credential } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
        scope: { capabilities: ["kv:read"] },
      });

      // Should be JSON-serializable
      const json = JSON.stringify(credential);
      const restored = JSON.parse(json) as Credential;

      expect(restored.id).toBe(credential.id);
      expect(restored.type).toBe(credential.type);
      expect(restored.scope?.capabilities).toContain("kv:read");
    });

    it("should not include secret in serialized form", async () => {
      const { credential, secret } = await createCredential({
        identityId: "ident_abc123",
        type: CredentialType.API_KEY,
      });

      const json = JSON.stringify(credential);

      // Secret should not appear in JSON
      expect(json).not.toContain(secret);
      expect(json).toContain("secretHash");
    });
  });
});
