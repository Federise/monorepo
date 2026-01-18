/**
 * TDD Tests for Identity System
 *
 * These tests define the expected behavior for the identity system.
 * The implementation should make these tests pass.
 */

import { describe, it, expect } from "vitest";
import {
  createIdentity,
  getIdentity,
  updateIdentity,
  deleteIdentity,
  IdentityType,
  IdentityStatus,
  type Identity,
  type CreateIdentityParams,
} from "../identity.js";

describe("Identity System", () => {
  describe("Identity Types", () => {
    it("should support USER identity type", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.USER,
        displayName: "Alice",
      };

      const identity = createIdentity(params);

      expect(identity.type).toBe(IdentityType.USER);
      expect(identity.displayName).toBe("Alice");
      expect(identity.id).toMatch(/^ident_/);
    });

    it("should support SERVICE identity type", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.SERVICE,
        displayName: "CI/CD Bot",
      };

      const identity = createIdentity(params);

      expect(identity.type).toBe(IdentityType.SERVICE);
    });

    it("should support AGENT identity type", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.AGENT,
        displayName: "AI Assistant",
        createdBy: "ident_abc123",
      };

      const identity = createIdentity(params);

      expect(identity.type).toBe(IdentityType.AGENT);
      expect(identity.createdBy).toBe("ident_abc123");
    });

    it("should support APP identity type with origin", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.APP,
        displayName: "MyApp",
        appConfig: {
          origin: "https://myapp.example.com",
          grantedCapabilities: ["kv:read", "kv:write"],
          frameAccess: true,
        },
      };

      const identity = createIdentity(params);

      expect(identity.type).toBe(IdentityType.APP);
      expect(identity.appConfig?.origin).toBe("https://myapp.example.com");
      expect(identity.appConfig?.namespace).toBe("myapp_example_com");
      expect(identity.appConfig?.grantedCapabilities).toContain("kv:read");
    });

    it("should support ANONYMOUS identity type", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.ANONYMOUS,
        displayName: "Guest",
      };

      const identity = createIdentity(params);

      expect(identity.type).toBe(IdentityType.ANONYMOUS);
    });
  });

  describe("Identity Structure", () => {
    it("should generate unique id with ident_ prefix", async () => {
      const identity1 = createIdentity({
        type: IdentityType.USER,
        displayName: "User1",
      });

      const identity2 = createIdentity({
        type: IdentityType.USER,
        displayName: "User2",
      });

      expect(identity1.id).toMatch(/^ident_[a-zA-Z0-9]+$/);
      expect(identity2.id).toMatch(/^ident_[a-zA-Z0-9]+$/);
      expect(identity1.id).not.toBe(identity2.id);
    });

    it("should set createdAt to current timestamp", async () => {
      const before = new Date().toISOString();
      const identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
      });
      const after = new Date().toISOString();

      expect(identity.createdAt).toBeDefined();
      expect(identity.createdAt >= before).toBe(true);
      expect(identity.createdAt <= after).toBe(true);
    });

    it("should set default status to ACTIVE", async () => {
      const identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
      });

      expect(identity.status).toBe(IdentityStatus.ACTIVE);
    });

    it("should support metadata object", async () => {
      const params: CreateIdentityParams = {
        type: IdentityType.USER,
        displayName: "User",
        metadata: {
          email: "user@example.com",
          company: "Acme Inc",
        },
      };

      const identity = createIdentity(params);

      expect(identity.metadata?.email).toBe("user@example.com");
      expect(identity.metadata?.company).toBe("Acme Inc");
    });

    it("should track createdBy for child identities", async () => {
      const parent = createIdentity({
        type: IdentityType.USER,
        displayName: "Parent",
      });

      const child = createIdentity({
        type: IdentityType.SERVICE,
        displayName: "Child Service",
        createdBy: parent.id,
      });

      expect(child.createdBy).toBe(parent.id);
    });
  });

  describe("Identity Status Transitions", () => {
    it("should update status to SUSPENDED", async () => {
      const identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
      });

      const updated = updateIdentity(identity, {
        status: IdentityStatus.SUSPENDED,
      });

      expect(updated.status).toBe(IdentityStatus.SUSPENDED);
    });

    it("should update status to DELETED", async () => {
      const identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
      });

      const updated = updateIdentity(identity, {
        status: IdentityStatus.DELETED,
      });

      expect(updated.status).toBe(IdentityStatus.DELETED);
    });

    it("should allow reactivation from SUSPENDED", async () => {
      let identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
      });

      identity = updateIdentity(identity, {
        status: IdentityStatus.SUSPENDED,
      });

      identity = updateIdentity(identity, {
        status: IdentityStatus.ACTIVE,
      });

      expect(identity.status).toBe(IdentityStatus.ACTIVE);
    });
  });

  describe("APP Identity Namespace", () => {
    it("should compute namespace from origin", async () => {
      const identity = createIdentity({
        type: IdentityType.APP,
        displayName: "MyApp",
        appConfig: {
          origin: "https://myapp.example.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      expect(identity.appConfig?.namespace).toBe("myapp_example_com");
    });

    it("should produce consistent namespace for same origin", async () => {
      const identity1 = createIdentity({
        type: IdentityType.APP,
        displayName: "MyApp1",
        appConfig: {
          origin: "https://myapp.example.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      const identity2 = createIdentity({
        type: IdentityType.APP,
        displayName: "MyApp2",
        appConfig: {
          origin: "https://myapp.example.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      expect(identity1.appConfig?.namespace).toBe(identity2.appConfig?.namespace);
    });

    it("should produce different namespace for different origins", async () => {
      const identity1 = createIdentity({
        type: IdentityType.APP,
        displayName: "App1",
        appConfig: {
          origin: "https://app1.example.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      const identity2 = createIdentity({
        type: IdentityType.APP,
        displayName: "App2",
        appConfig: {
          origin: "https://app2.example.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      expect(identity1.appConfig?.namespace).not.toBe(identity2.appConfig?.namespace);
    });

    it("should include port in namespace (mapped to underscore)", async () => {
      const identity = createIdentity({
        type: IdentityType.APP,
        displayName: "LocalApp",
        appConfig: {
          origin: "http://localhost:5174",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      expect(identity.appConfig?.namespace).toBe("localhost_5174");
    });

    it("should handle www subdomain", async () => {
      const identity = createIdentity({
        type: IdentityType.APP,
        displayName: "WebApp",
        appConfig: {
          origin: "https://www.example-app.com",
          grantedCapabilities: [],
          frameAccess: true,
        },
      });

      expect(identity.appConfig?.namespace).toBe("www_example-app_com");
    });
  });

  describe("Identity Validation", () => {
    it("should require displayName", async () => {
      expect(() =>
        createIdentity({
          type: IdentityType.USER,
          displayName: "",
        })
      ).toThrow("displayName is required");
    });

    it("should require type", async () => {
      expect(() =>
        createIdentity({
          type: undefined as unknown as IdentityType,
          displayName: "User",
        })
      ).toThrow("type is required");
    });

    it("should require origin for APP type", async () => {
      expect(() =>
        createIdentity({
          type: IdentityType.APP,
          displayName: "App",
          // Missing appConfig with origin
        })
      ).toThrow("origin is required for APP identity");
    });
  });

  describe("Identity Serialization", () => {
    it("should serialize to storage format", async () => {
      const identity = createIdentity({
        type: IdentityType.USER,
        displayName: "User",
        metadata: { key: "value" },
      });

      // Identity should be JSON-serializable
      const json = JSON.stringify(identity);
      const restored = JSON.parse(json) as Identity;

      expect(restored.id).toBe(identity.id);
      expect(restored.type).toBe(identity.type);
      expect(restored.displayName).toBe(identity.displayName);
      expect(restored.metadata?.key).toBe("value");
    });
  });
});
