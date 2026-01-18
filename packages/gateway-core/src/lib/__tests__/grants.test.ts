/**
 * TDD Tests for Capability Grant System
 *
 * These tests define the expected behavior for the capability grant system
 * that enables fine-grained authorization.
 */

import { describe, it, expect } from "vitest";
import {
  createGrant,
  revokeGrant,
  resolveEffectivePermissions,
  GrantSource,
  type CapabilityGrant,
  type CreateGrantParams,
  type EffectivePermissions,
} from "../grants.js";

describe("Capability Grant System", () => {
  describe("Grant Creation", () => {
    it("should create grant with unique id", async () => {
      const params: CreateGrantParams = {
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
      };

      const grant = createGrant(params);

      expect(grant.grantId).toMatch(/^grant_/);
      expect(grant.identityId).toBe("ident_user123");
      expect(grant.capability).toBe("kv:read");
    });

    it("should set grantedAt timestamp", async () => {
      const before = new Date().toISOString();
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
      });
      const after = new Date().toISOString();

      expect(grant.grantedAt >= before).toBe(true);
      expect(grant.grantedAt <= after).toBe(true);
    });

    it("should record grantedBy identity", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:write",
        grantedBy: "ident_admin456",
      });

      expect(grant.grantedBy).toBe("ident_admin456");
    });

    it("should support DIRECT grant source", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        source: GrantSource.DIRECT,
      });

      expect(grant.source).toBe(GrantSource.DIRECT);
    });

    it("should support INVITATION grant source", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_inviter",
        source: GrantSource.INVITATION,
        sourceId: "inv_abc123",
      });

      expect(grant.source).toBe(GrantSource.INVITATION);
      expect(grant.sourceId).toBe("inv_abc123");
    });

    it("should support DELEGATION grant source", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_delegator",
        source: GrantSource.DELEGATION,
        sourceId: "token_xyz789",
      });

      expect(grant.source).toBe(GrantSource.DELEGATION);
    });

    it("should support SYSTEM grant source", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "system",
        source: GrantSource.SYSTEM,
      });

      expect(grant.source).toBe(GrantSource.SYSTEM);
    });
  });

  describe("Grant Scope Restrictions", () => {
    it("should restrict to specific namespaces", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        scope: {
          namespaces: ["app:myapp", "shared:team"],
        },
      });

      expect(grant.scope?.namespaces).toContain("app:myapp");
      expect(grant.scope?.namespaces).toContain("shared:team");
    });

    it("should restrict to specific resources", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "channel:read",
        grantedBy: "ident_admin",
        scope: {
          resources: [{ type: "channel", id: "chan_123" }],
        },
      });

      expect(grant.scope?.resources?.[0].id).toBe("chan_123");
    });

    it("should support key pattern restrictions", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:write",
        grantedBy: "ident_admin",
        scope: {
          keyPatterns: ["user:*", "settings:*"],
        },
      });

      expect(grant.scope?.keyPatterns).toContain("user:*");
    });

    it("should support expiration on grant", async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        expiresAt,
      });

      expect(grant.expiresAt).toBe(expiresAt);
    });
  });

  describe("Grant Revocation", () => {
    it("should mark grant as revoked", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
      });

      const revoked = revokeGrant(grant, "ident_admin", "No longer needed");

      expect(revoked.revokedAt).toBeDefined();
      expect(revoked.revokedBy).toBe("ident_admin");
      expect(revoked.revocationReason).toBe("No longer needed");
    });
  });

  describe("Effective Permissions Resolution", () => {
    it("should resolve single grant", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      expect(effective.capabilities).toContain("kv:read");
    });

    it("should resolve multiple grants", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
        }),
        createGrant({
          identityId: "ident_user123",
          capability: "kv:write",
          grantedBy: "ident_admin",
        }),
        createGrant({
          identityId: "ident_user123",
          capability: "blob:read",
          grantedBy: "ident_admin",
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      expect(effective.capabilities).toContain("kv:read");
      expect(effective.capabilities).toContain("kv:write");
      expect(effective.capabilities).toContain("blob:read");
    });

    it("should exclude revoked grants", async () => {
      const readGrant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
      });

      const writeGrant = revokeGrant(
        createGrant({
          identityId: "ident_user123",
          capability: "kv:write",
          grantedBy: "ident_admin",
        }),
        "ident_admin",
        "Revoked"
      );

      const effective = resolveEffectivePermissions([readGrant, writeGrant]);

      expect(effective.capabilities).toContain("kv:read");
      expect(effective.capabilities).not.toContain("kv:write");
    });

    it("should exclude expired grants", async () => {
      const validGrant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const expiredGrant = createGrant({
        identityId: "ident_user123",
        capability: "kv:write",
        grantedBy: "ident_admin",
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      });

      const effective = resolveEffectivePermissions([validGrant, expiredGrant]);

      expect(effective.capabilities).toContain("kv:read");
      expect(effective.capabilities).not.toContain("kv:write");
    });

    it("should merge namespace scopes from multiple grants", async () => {
      const grant1 = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        scope: { namespaces: ["app:myapp"] },
      });

      const grant2 = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        scope: { namespaces: ["shared:team"] },
      });

      const effective = resolveEffectivePermissions([grant1, grant2]);

      // Both namespaces should be accessible for kv:read
      expect(effective.namespaces).toContain("app:myapp");
      expect(effective.namespaces).toContain("shared:team");
    });

    it("should intersect with credential scope", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
        }),
        createGrant({
          identityId: "ident_user123",
          capability: "kv:write",
          grantedBy: "ident_admin",
        }),
      ];

      const credentialScope = {
        capabilities: ["kv:read"], // Credential only allows read
      };

      const effective = resolveEffectivePermissions(grants, credentialScope);

      // Only kv:read should be effective (intersection)
      expect(effective.capabilities).toContain("kv:read");
      expect(effective.capabilities).not.toContain("kv:write");
    });

    it("should intersect with token claims", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
        }),
        createGrant({
          identityId: "ident_user123",
          capability: "kv:write",
          grantedBy: "ident_admin",
        }),
      ];

      const tokenClaims = {
        capabilities: ["kv:write"], // Token only grants write
      };

      const effective = resolveEffectivePermissions(grants, undefined, tokenClaims);

      // Only kv:write should be effective (intersection with token)
      expect(effective.capabilities).toContain("kv:write");
      expect(effective.capabilities).not.toContain("kv:read");
    });
  });

  describe("Grant Authorization Checks", () => {
    it("should check if capability is granted", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      expect(effective.hasCapability("kv:read")).toBe(true);
      expect(effective.hasCapability("kv:write")).toBe(false);
    });

    it("should check namespace access", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
          scope: { namespaces: ["app:myapp"] },
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      expect(effective.canAccessNamespace("app:myapp")).toBe(true);
      expect(effective.canAccessNamespace("app:other")).toBe(false);
    });

    it("should check resource access", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "channel:read",
          grantedBy: "ident_admin",
          scope: { resources: [{ type: "channel", id: "chan_123" }] },
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      expect(effective.canAccessResource("channel", "chan_123")).toBe(true);
      expect(effective.canAccessResource("channel", "chan_456")).toBe(false);
    });

    it("should allow unrestricted access when no scope specified", async () => {
      const grants: CapabilityGrant[] = [
        createGrant({
          identityId: "ident_user123",
          capability: "kv:read",
          grantedBy: "ident_admin",
          // No scope restriction
        }),
      ];

      const effective = resolveEffectivePermissions(grants);

      // Should allow any namespace
      expect(effective.canAccessNamespace("app:any")).toBe(true);
      expect(effective.canAccessNamespace("shared:anything")).toBe(true);
    });
  });

  describe("Grant Serialization", () => {
    it("should serialize to storage format", async () => {
      const grant = createGrant({
        identityId: "ident_user123",
        capability: "kv:read",
        grantedBy: "ident_admin",
        scope: { namespaces: ["app:myapp"] },
      });

      const json = JSON.stringify(grant);
      const restored = JSON.parse(json) as CapabilityGrant;

      expect(restored.grantId).toBe(grant.grantId);
      expect(restored.capability).toBe("kv:read");
      expect(restored.scope?.namespaces).toContain("app:myapp");
    });
  });
});
