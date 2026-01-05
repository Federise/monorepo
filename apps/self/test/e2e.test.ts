import { describe, it, expect } from "vitest";
import { testFetch, BOOTSTRAP_API_KEY } from "./setup.js";

describe("Self-Hosted Gateway E2E Tests", () => {
  let adminApiKey: string;

  describe("Bootstrap & Principal Management", () => {
    it("should create first principal with bootstrap key", async () => {
      const response = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data).toHaveProperty("secret");
      expect(data).toHaveProperty("secret_hash");
      expect(data.display_name).toBe("Admin");
      expect(data.active).toBe(true);

      adminApiKey = data.secret;
    });

    it("should list principals", async () => {
      // Create a principal first
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      const admin = (await createRes.json()) as any;
      adminApiKey = admin.secret;

      const response = await testFetch("/principal/list", {
        method: "POST",
        headers: { Authorization: `ApiKey ${adminApiKey}` },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data).toHaveProperty("items");
      expect(data.items).toHaveLength(1);
      expect(data.items[0].display_name).toBe("Admin");
    });

    it("should reject requests without valid auth", async () => {
      const response = await testFetch("/principal/list", {
        method: "POST",
        headers: { Authorization: "ApiKey invalid" },
      });

      expect(response.status).toBe(401);
    });

    it("should reject requests with malformed auth header", async () => {
      const response = await testFetch("/principal/list", {
        method: "POST",
        headers: { Authorization: "Bearer invalid" },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("KV Operations", () => {
    it("should set and get a key-value pair", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Set value
      const setRes = await testFetch("/kv/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({
          namespace: "test",
          key: "greeting",
          value: "hello world",
        }),
      });
      expect(setRes.status).toBe(204);

      // Get value
      const getRes = await testFetch("/kv/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "test", key: "greeting" }),
      });
      expect(getRes.status).toBe(200);
      const data = (await getRes.json()) as any;
      expect(data.key).toBe("greeting");
      expect(data.value).toBe("hello world");
    });

    it("should return 404 for non-existent key", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      const response = await testFetch("/kv/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "test", key: "nonexistent" }),
      });

      expect(response.status).toBe(404);
    });

    it("should list keys in a namespace", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Set multiple values
      await testFetch("/kv/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "ns1", key: "a", value: "1" }),
      });
      await testFetch("/kv/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "ns1", key: "b", value: "2" }),
      });

      const response = await testFetch("/kv/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "ns1" }),
      });

      expect(response.status).toBe(200);
      const keys = (await response.json()) as string[];
      expect(keys).toContain("a");
      expect(keys).toContain("b");
    });

    it("should bulk set and get values", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Bulk set
      const setRes = await testFetch("/kv/bulk/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({
          namespace: "bulk",
          entries: [
            { key: "x", value: "10" },
            { key: "y", value: "20" },
          ],
        }),
      });
      expect(setRes.status).toBe(200);
      const setData = (await setRes.json()) as any;
      expect(setData.success).toBe(true);
      expect(setData.count).toBe(2);

      // Bulk get
      const getRes = await testFetch("/kv/bulk/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({
          namespace: "bulk",
          keys: ["x", "y", "z"],
        }),
      });
      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.entries).toHaveLength(2); // z doesn't exist
    });
  });

  describe("Blob Operations", () => {
    it("should upload and retrieve blob metadata", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Upload blob
      const content = new TextEncoder().encode("Hello, World!");
      const uploadRes = await testFetch("/blob/upload", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `ApiKey ${adminApiKey}`,
          "X-Blob-Namespace": "docs",
          "X-Blob-Key": "test.txt",
        },
        body: content,
      });

      expect(uploadRes.status).toBe(200);
      const uploadData = (await uploadRes.json()) as any;
      expect(uploadData.metadata.key).toBe("test.txt");
      expect(uploadData.metadata.namespace).toBe("docs");
      expect(uploadData.metadata.size).toBe(content.length);

      // Get blob URL
      const getRes = await testFetch("/blob/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "docs", key: "test.txt" }),
      });

      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.url).toContain("/blob/download/docs/test.txt");
    });

    it("should list blobs in a namespace", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Upload blob
      const content = new TextEncoder().encode("Test content");
      await testFetch("/blob/upload", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `ApiKey ${adminApiKey}`,
          "X-Blob-Namespace": "myns",
          "X-Blob-Key": "file.txt",
        },
        body: content,
      });

      // List blobs
      const listRes = await testFetch("/blob/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "myns" }),
      });

      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.blobs).toHaveLength(1);
      expect(listData.blobs[0].key).toBe("file.txt");
    });

    it("should delete a blob", async () => {
      // Create admin
      const createRes = await testFetch("/principal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${BOOTSTRAP_API_KEY}`,
        },
        body: JSON.stringify({ display_name: "Admin" }),
      });
      adminApiKey = ((await createRes.json()) as any).secret;

      // Upload blob
      const content = new TextEncoder().encode("To delete");
      await testFetch("/blob/upload", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `ApiKey ${adminApiKey}`,
          "X-Blob-Namespace": "temp",
          "X-Blob-Key": "delete-me.txt",
        },
        body: content,
      });

      // Delete blob
      const deleteRes = await testFetch("/blob/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "temp", key: "delete-me.txt" }),
      });

      expect(deleteRes.status).toBe(204);

      // Verify deleted
      const getRes = await testFetch("/blob/get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${adminApiKey}`,
        },
        body: JSON.stringify({ namespace: "temp", key: "delete-me.txt" }),
      });

      expect(getRes.status).toBe(404);
    });
  });

  describe("Admin Operations", () => {
    it("should check system status", async () => {
      const response = await testFetch("/admin/check", {
        method: "POST",
        headers: { Authorization: `ApiKey ${BOOTSTRAP_API_KEY}` },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data).toHaveProperty("kv");
      expect(data).toHaveProperty("r2_private");
      expect(data).toHaveProperty("r2_public");
      expect(data.kv.ok).toBe(true);
      expect(data.r2_private.ok).toBe(true);
      expect(data.r2_public.ok).toBe(true);
    });
  });
});
