import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { base62Encode, base62Decode, generateShortId } from "@federise/gateway-core";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

describe("KV Gateway E2E Tests", () => {
  const BOOTSTRAP_API_KEY = "testbootstrapkey123";
  let adminApiKey: string;

  describe("Bootstrap & Identity Management", () => {
    beforeEach(async () => {
      // Clear KV before each test
      const list = await env.KV.list();
      await Promise.all(list.keys.map((k: { name: string }) => env.KV.delete(k.name)));
    });

    it("should create first identity with bootstrap key", async () => {
      const response = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("secret");
      expect(data).toHaveProperty("identity");
      expect(data).toHaveProperty("credential");
      expect(data.identity.displayName).toBe("Admin");
      expect(data.identity.status).toBe("active");

      adminApiKey = data.secret;
    });

    it("should list identities", async () => {
      // Create an identity first with bootstrap key
      const createRes = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await createRes.json() as any;
      adminApiKey = admin.secret;

      const response = await SELF.fetch("http://localhost/identity/list", {
        method: "POST",
        headers: { Authorization: `ApiKey ${adminApiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("identities");
      expect(data.identities).toHaveLength(1);
      expect(data.identities[0].displayName).toBe("Admin");
      expect(data.identities[0]).toHaveProperty("id");
      expect(data.identities[0]).not.toHaveProperty("secret");
    });

    it("should create additional identities when authenticated", async () => {
      // Bootstrap admin with bootstrap key
      const bootstrap = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await bootstrap.json() as any;
      adminApiKey = admin.secret;

      const response = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: "User", type: "user" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.identity.displayName).toBe("User");
      expect(data).toHaveProperty("secret");
    });

    it("should delete an identity", async () => {
      // Bootstrap admin with bootstrap key
      const bootstrap = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await bootstrap.json() as any;
      adminApiKey = admin.secret;

      // Create user to delete
      const createRes = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: "ToDelete", type: "user" }),
      });
      const user = await createRes.json() as any;

      const response = await SELF.fetch("http://localhost/identity/delete", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identityId: user.identity.id }),
      });

      expect(response.status).toBe(204);

      // Verify deleted
      const listRes = await SELF.fetch("http://localhost/identity/list", {
        method: "POST",
        headers: { Authorization: `ApiKey ${adminApiKey}` },
      });
      const list = await listRes.json() as any;
      expect(list.identities).toHaveLength(1);
    });

    it("should reject requests without valid auth", async () => {
      const response = await SELF.fetch("http://localhost/identity/list", {
        method: "POST",
        headers: { Authorization: "ApiKey invalid" },
      });

      expect(response.status).toBe(401);
    });

    it("should reject requests with malformed auth header", async () => {
      const response = await SELF.fetch("http://localhost/identity/list", {
        method: "POST",
        headers: { Authorization: "Bearer invalid" },
      });

      expect(response.status).toBe(401);
    });

    it("should reject bootstrap key for non-create endpoints after identities exist", async () => {
      // Create an identity first
      await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });

      // Try to use bootstrap key for list endpoint (should be rejected)
      const response = await SELF.fetch("http://localhost/identity/list", {
        method: "POST",
        headers: { Authorization: `ApiKey ${BOOTSTRAP_API_KEY}` },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("KV Operations", () => {
    beforeEach(async () => {
      // Clear KV and bootstrap admin for each test
      const list = await env.KV.list();
      await Promise.all(list.keys.map((k: { name: string }) => env.KV.delete(k.name)));

      const bootstrap = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await bootstrap.json() as any;
      adminApiKey = admin.secret;
    });

    it("should set a key-value pair", async () => {
      const response = await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo", value: "bar" }),
      });

      expect(response.status).toBe(204);
    });

    it("should get a key-value pair", async () => {
      // Set first
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo", value: "bar" }),
      });

      const response = await SELF.fetch("http://localhost/kv/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.key).toBe("foo");
      expect(data.value).toBe("bar");
    });

    it("should return 404 for non-existent key", async () => {
      const response = await SELF.fetch("http://localhost/kv/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "nonexistent" }),
      });

      expect(response.status).toBe(404);
    });

    it("should accept namespace with uri-safe characters", async () => {
      const response = await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "example.com:8080", key: "foo", value: "bar" }),
      });

      expect(response.status).toBe(204);

      // Verify it was set
      const getRes = await SELF.fetch("http://localhost/kv/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "example.com:8080", key: "foo" }),
      });

      expect(getRes.status).toBe(200);
    });

    it("should list keys in a namespace", async () => {
      // Set multiple keys
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo", value: "bar" }),
      });
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "baz", value: "qux" }),
      });

      const response = await SELF.fetch("http://localhost/kv/keys", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toEqual(expect.arrayContaining(["foo", "baz"]));
    });

    it("should list namespaces", async () => {
      // Set keys in different namespaces
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "app1", key: "foo", value: "bar" }),
      });
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "app2", key: "baz", value: "qux" }),
      });

      const response = await SELF.fetch("http://localhost/kv/namespaces", {
        method: "POST",
        headers: { Authorization: `ApiKey ${adminApiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toEqual(expect.arrayContaining(["app1", "app2"]));
      expect(data).not.toContain("__IDENTITY");
    });

    it("should bulk get values", async () => {
      // Set multiple keys
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo", value: "bar" }),
      });
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "baz", value: "qux" }),
      });

      const response = await SELF.fetch("http://localhost/kv/bulk/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", keys: ["foo", "baz", "nonexistent"] }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.entries).toHaveLength(2);
      expect(data.entries).toEqual(
        expect.arrayContaining([
          { key: "foo", value: "bar" },
          { key: "baz", value: "qux" },
        ])
      );
    });

    it("should bulk set values", async () => {
      const response = await SELF.fetch("http://localhost/kv/bulk/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          entries: [
            { key: "foo", value: "bar" },
            { key: "baz", value: "qux" },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);

      // Verify values were set
      const getRes = await SELF.fetch("http://localhost/kv/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo" }),
      });
      const getValue = await getRes.json() as any;
      expect(getValue.value).toBe("bar");
    });

    it("should dump all KV data", async () => {
      // Set keys in multiple namespaces
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "app1", key: "foo", value: "bar" }),
      });
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "app2", key: "baz", value: "qux" }),
      });

      const response = await SELF.fetch("http://localhost/kv/dump", {
        method: "POST",
        headers: { Authorization: `ApiKey ${adminApiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveLength(2);
      expect(data).toEqual(
        expect.arrayContaining([
          {
            namespace: "app1",
            entries: [{ key: "foo", value: "bar" }],
          },
          {
            namespace: "app2",
            entries: [{ key: "baz", value: "qux" }],
          },
        ])
      );
    });

    it("should handle keys with colons", async () => {
      await SELF.fetch("http://localhost/kv/set", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo:bar:baz", value: "test" }),
      });

      const response = await SELF.fetch("http://localhost/kv/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "foo:bar:baz" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.key).toBe("foo:bar:baz");
      expect(data.value).toBe("test");
    });
  });

  describe("Blob Operations", () => {
    beforeEach(async () => {
      // Clear KV and bootstrap admin for each test
      const list = await env.KV.list();
      await Promise.all(list.keys.map((k: { name: string }) => env.KV.delete(k.name)));

      const bootstrap = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await bootstrap.json() as any;
      adminApiKey = admin.secret;
    });

    it("should initiate private blob upload and return presigned URL", async () => {
      const response = await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "test-file.txt",
          contentType: "text/plain",
          size: 1024,
          isPublic: false,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("uploadUrl");
      expect(data).toHaveProperty("expiresAt");
      expect(data.uploadUrl).toContain("federise-objects");

      // Verify metadata was created in KV
      const metadata = await env.KV.get("__BLOB:myapp:test-file.txt");
      expect(metadata).toBeTruthy();
      const parsed = JSON.parse(metadata!);
      expect(parsed.isPublic).toBe(false);
      expect(parsed.size).toBe(1024);
      expect(parsed.contentType).toBe("text/plain");
    });

    it("should initiate public blob upload and return presigned URL", async () => {
      const response = await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "public-image.png",
          contentType: "image/png",
          size: 2048,
          isPublic: true,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("uploadUrl");
      expect(data).toHaveProperty("expiresAt");
      expect(data.uploadUrl).toContain("federise-objects-public");

      // Verify metadata was created in KV
      const metadata = await env.KV.get("__BLOB:myapp:public-image.png");
      expect(metadata).toBeTruthy();
      const parsed = JSON.parse(metadata!);
      expect(parsed.isPublic).toBe(true);
    });

    it("should get private blob download URL with expiry", async () => {
      // Create blob metadata first
      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "private-doc.pdf",
          contentType: "application/pdf",
          size: 1024,
          isPublic: false,
        }),
      });

      const response = await SELF.fetch("http://localhost/blob/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "private-doc.pdf" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("url");
      expect(data).toHaveProperty("metadata");
      expect(data.metadata.isPublic).toBe(false);
      // URL points to gateway download endpoint
      expect(data.url).toContain("/blob/download/myapp/private-doc.pdf");
    });

    it("should get public blob custom domain URL without expiry", async () => {
      // Create blob metadata first
      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "public-banner.jpg",
          contentType: "image/jpeg",
          size: 2048,
          isPublic: true,
        }),
      });

      const response = await SELF.fetch("http://localhost/blob/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "public-banner.jpg" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("url");
      expect(data).toHaveProperty("metadata");
      expect(data.metadata.isPublic).toBe(true);
      // URL points to gateway download endpoint
      expect(data.url).toContain("localhost");
      expect(data.url).toContain("/blob/download/myapp/public-banner.jpg");
    });

    it("should return 404 for non-existent blob", async () => {
      const response = await SELF.fetch("http://localhost/blob/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "nonexistent.txt" }),
      });

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.message).toBe("Blob not found");
    });

    it("should list blobs in a namespace", async () => {
      // Create multiple blobs
      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "file1.txt",
          contentType: "text/plain",
          size: 1024,
          isPublic: false,
        }),
      });

      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "file2.txt",
          contentType: "text/plain",
          size: 2048,
          isPublic: true,
        }),
      });

      const response = await SELF.fetch("http://localhost/blob/list", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.blobs).toHaveLength(2);
      expect(data.blobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "file1.txt", isPublic: false }),
          expect.objectContaining({ key: "file2.txt", isPublic: true }),
        ])
      );
    });

    it("should list all blobs across namespaces", async () => {
      // Create blobs in different namespaces
      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "app1",
          key: "file.txt",
          contentType: "text/plain",
          size: 1024,
          isPublic: false,
        }),
      });

      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "app2",
          key: "image.png",
          contentType: "image/png",
          size: 2048,
          isPublic: true,
        }),
      });

      const response = await SELF.fetch("http://localhost/blob/list", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.blobs).toHaveLength(2);
      expect(data.blobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ namespace: "app1", key: "file.txt" }),
          expect.objectContaining({ namespace: "app2", key: "image.png" }),
        ])
      );
    });

    it("should delete a blob", async () => {
      // Create blob first
      await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "to-delete.txt",
          contentType: "text/plain",
          size: 1024,
          isPublic: false,
        }),
      });

      // Verify it exists
      const metadata = await env.KV.get("__BLOB:myapp:to-delete.txt");
      expect(metadata).toBeTruthy();

      const response = await SELF.fetch("http://localhost/blob/delete", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "to-delete.txt" }),
      });

      expect(response.status).toBe(204);

      // Verify metadata was deleted
      const deletedMetadata = await env.KV.get("__BLOB:myapp:to-delete.txt");
      expect(deletedMetadata).toBeNull();
    });

    it("should return 404 when deleting non-existent blob", async () => {
      const response = await SELF.fetch("http://localhost/blob/delete", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "nonexistent.txt" }),
      });

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.message).toBe("Blob not found");
    });

    it("should handle blob keys with special characters", async () => {
      const response = await SELF.fetch("http://localhost/blob/presign-upload", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: "myapp",
          key: "folder/subfolder/file-name_v2.txt",
          contentType: "text/plain",
          size: 1024,
          isPublic: false,
        }),
      });

      expect(response.status).toBe(200);

      // Verify it can be retrieved
      const getRes = await SELF.fetch("http://localhost/blob/get", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ namespace: "myapp", key: "folder/subfolder/file-name_v2.txt" }),
      });

      expect(getRes.status).toBe(200);
      const data = await getRes.json() as any;
      expect(data.metadata.key).toBe("folder/subfolder/file-name_v2.txt");
    });
  });

  describe("Short Link Operations", () => {
    beforeEach(async () => {
      // Clear KV and bootstrap admin for each test
      const list = await env.KV.list();
      await Promise.all(list.keys.map((k: { name: string }) => env.KV.delete(k.name)));

      const bootstrap = await SELF.fetch("http://localhost/identity/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ displayName: "Admin", type: "user" }),
      });
      const admin = await bootstrap.json() as any;
      adminApiKey = admin.secret;
    });

    it("should create a short link", async () => {
      const targetUrl = "https://example.com/very/long/path?with=params&and=more";

      const response = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: targetUrl }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("shortUrl");
      expect(data).toHaveProperty("targetUrl");
      expect(data.targetUrl).toBe(targetUrl);
      expect(data.shortUrl).toContain("/s/");
      expect(data.id.length).toBeGreaterThanOrEqual(10); // 64-bit base62 is ~11 chars
    });

    it("should resolve a short link with redirect", async () => {
      const targetUrl = "https://example.com/destination";

      // Create short link
      const createRes = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: targetUrl }),
      });
      const created = await createRes.json() as any;

      // Resolve short link (should redirect)
      const resolveRes = await SELF.fetch(`http://localhost/s/${created.id}`, {
        method: "GET",
        redirect: "manual", // Don't follow redirects
      });

      expect(resolveRes.status).toBe(302);
      expect(resolveRes.headers.get("Location")).toBe(targetUrl);
    });

    it("should return 404 for non-existent short link", async () => {
      const response = await SELF.fetch("http://localhost/s/nonexistent123", {
        method: "GET",
      });

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.message).toBe("Short link not found");
    });

    it("should delete a short link", async () => {
      const targetUrl = "https://example.com/to-delete";

      // Create short link
      const createRes = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: targetUrl }),
      });
      const created = await createRes.json() as any;

      // Delete short link
      const deleteRes = await SELF.fetch(`http://localhost/short/${created.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
        },
      });

      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json() as any;
      expect(deleteData.success).toBe(true);

      // Verify it no longer resolves
      const resolveRes = await SELF.fetch(`http://localhost/s/${created.id}`, {
        method: "GET",
      });
      expect(resolveRes.status).toBe(404);
    });

    it("should return 404 when deleting non-existent short link", async () => {
      const response = await SELF.fetch("http://localhost/short/nonexistent123", {
        method: "DELETE",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.message).toBe("Short link not found");
    });

    it("should require auth to create short links", async () => {
      const response = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com" }),
      });

      expect(response.status).toBe(401);
    });

    it("should require auth to delete short links", async () => {
      const response = await SELF.fetch("http://localhost/short/someid", {
        method: "DELETE",
      });

      expect(response.status).toBe(401);
    });

    it("should not require auth to resolve short links", async () => {
      const targetUrl = "https://example.com/public";

      // Create with auth
      const createRes = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: targetUrl }),
      });
      const created = await createRes.json() as any;

      // Resolve without auth (should work)
      const resolveRes = await SELF.fetch(`http://localhost/s/${created.id}`, {
        method: "GET",
        redirect: "manual",
      });

      expect(resolveRes.status).toBe(302);
    });

    it("should create unique IDs for different URLs", async () => {
      const url1 = "https://example.com/page1";
      const url2 = "https://example.com/page2";

      const [res1, res2] = await Promise.all([
        SELF.fetch("http://localhost/short", {
          method: "POST",
          headers: {
            Authorization: `ApiKey ${adminApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: url1 }),
        }),
        SELF.fetch("http://localhost/short", {
          method: "POST",
          headers: {
            Authorization: `ApiKey ${adminApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: url2 }),
        }),
      ]);

      const data1 = await res1.json() as any;
      const data2 = await res2.json() as any;

      expect(data1.id).not.toBe(data2.id);
    });

    it("should reject invalid URLs", async () => {
      const response = await SELF.fetch("http://localhost/short", {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${adminApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "not-a-valid-url" }),
      });

      expect(response.status).toBe(400);
    });
  });
});

// Unit tests for base62 encoding utilities
describe("Base62 Encoding", () => {
  it("should encode and decode bytes correctly", () => {
    const original = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
    const encoded = base62Encode(original);
    const decoded = base62Decode(encoded);

    expect(decoded).toEqual(original);
  });

  it("should encode zero bytes", () => {
    const bytes = new Uint8Array([0]);
    const encoded = base62Encode(bytes);
    expect(encoded).toBe("0");

    const decoded = base62Decode(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("should encode empty array", () => {
    const bytes = new Uint8Array([]);
    const encoded = base62Encode(bytes);
    expect(encoded).toBe("0");
  });

  it("should generate unique short IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateShortId());
    }
    expect(ids.size).toBe(100); // All IDs should be unique
  });

  it("should generate IDs of appropriate length", () => {
    // 64 bits in base62 should be ~11 characters
    for (let i = 0; i < 10; i++) {
      const id = generateShortId();
      expect(id.length).toBeGreaterThanOrEqual(10);
      expect(id.length).toBeLessThanOrEqual(12);
    }
  });

  it("should only use valid base62 characters", () => {
    const base62Regex = /^[0-9A-Za-z]+$/;
    for (let i = 0; i < 10; i++) {
      const id = generateShortId();
      expect(id).toMatch(base62Regex);
    }
  });

  it("should throw on invalid base62 characters", () => {
    expect(() => base62Decode("abc!def")).toThrow("Invalid base62 character");
  });
});
