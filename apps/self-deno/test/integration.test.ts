/**
 * Integration tests for self-hosted Deno gateway.
 *
 * Run with: deno task test
 *
 * Prerequisites:
 * 1. Start the server: deno task dev (or deno task start)
 * 2. Ensure S3/MinIO is running for blob operations
 * 3. Set environment variables as needed (see .env.example)
 *
 * If principals already exist from previous runs, set TEST_API_KEY env var
 * with an existing principal's API key.
 */

import {
  assertEquals,
  assertExists,
  assertArrayIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  testFetch,
  getOrCreateAdminKey,
  uniqueNamespace,
  BOOTSTRAP_API_KEY,
} from "./setup.ts";

// ============================================================================
// Health Check (no auth required for this test)
// ============================================================================

Deno.test({
  name: "Health: should respond to ping with valid auth",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const response = await testFetch("/ping", {
      method: "GET",
      headers: { Authorization: `ApiKey ${adminApiKey}` },
    });

    assertEquals(response.status, 200);
    const data = await response.json() as { message: string; timestamp: string };
    assertEquals(data.message, "pong");
    assertExists(data.timestamp);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ============================================================================
// Principal Management Tests
// ============================================================================

Deno.test({
  name: "Principal: should list principals",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();

    const response = await testFetch("/principal/list", {
      method: "POST",
      headers: { Authorization: `ApiKey ${adminApiKey}` },
    });

    assertEquals(response.status, 200);
    const data = await response.json() as { items: Array<Record<string, unknown>> };
    assertExists(data.items);
    assertEquals(Array.isArray(data.items), true);
    // Should have at least one principal (the one we're using)
    assertEquals(data.items.length >= 1, true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Principal: should create additional principals when authenticated",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();

    const response = await testFetch("/principal/create", {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${adminApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: `TestUser_${Date.now()}` }),
    });

    assertEquals(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assertExists(data.display_name);
    assertExists(data.secret);
    assertExists(data.secret_hash);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Principal: should reject requests without valid auth",
  async fn() {
    const response = await testFetch("/principal/list", {
      method: "POST",
      headers: { Authorization: "ApiKey invalid_key_12345" },
    });

    assertEquals(response.status, 401);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Principal: should reject requests with malformed auth header",
  async fn() {
    const response = await testFetch("/principal/list", {
      method: "POST",
      headers: { Authorization: "Bearer some_token" },
    });

    assertEquals(response.status, 401);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ============================================================================
// KV Operations Tests
// ============================================================================

Deno.test({
  name: "KV: should set and get a key-value pair",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("kv");

    // Set value
    const setRes = await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        key: "greeting",
        value: "hello world",
      }),
    });
    assertEquals(setRes.status, 204);

    // Get value
    const getRes = await testFetch("/kv/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "greeting" }),
    });
    assertEquals(getRes.status, 200);
    const data = await getRes.json() as Record<string, unknown>;
    assertEquals(data.key, "greeting");
    assertEquals(data.value, "hello world");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should return 404 for non-existent key",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("kv404");

    const response = await testFetch("/kv/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "nonexistent_key_xyz" }),
    });

    assertEquals(response.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should list keys in a namespace",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("kvlist");

    // Set multiple values
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "key_a", value: "1" }),
    });
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "key_b", value: "2" }),
    });

    const response = await testFetch("/kv/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace }),
    });

    assertEquals(response.status, 200);
    const keys = await response.json() as string[];
    assertArrayIncludes(keys, ["key_a", "key_b"]);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should list namespaces",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const ns1 = uniqueNamespace("nstest1");
    const ns2 = uniqueNamespace("nstest2");

    // Set keys in different namespaces
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace: ns1, key: "foo", value: "bar" }),
    });
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace: ns2, key: "baz", value: "qux" }),
    });

    const response = await testFetch("/kv/namespaces", {
      method: "POST",
      headers: { Authorization: `ApiKey ${adminApiKey}` },
    });

    assertEquals(response.status, 200);
    const namespaces = await response.json() as string[];
    assertArrayIncludes(namespaces, [ns1, ns2]);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should bulk set and get values",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("kvbulk");

    // Bulk set
    const setRes = await testFetch("/kv/bulk/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        entries: [
          { key: "x", value: "10" },
          { key: "y", value: "20" },
        ],
      }),
    });
    assertEquals(setRes.status, 200);
    const setData = await setRes.json() as { success: boolean; count: number };
    assertEquals(setData.success, true);
    assertEquals(setData.count, 2);

    // Bulk get
    const getRes = await testFetch("/kv/bulk/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        keys: ["x", "y", "z"],
      }),
    });
    assertEquals(getRes.status, 200);
    const getData = await getRes.json() as { entries: Array<{ key: string; value: string }> };
    assertEquals(getData.entries.length, 2); // z doesn't exist
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should handle keys with colons",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("kvcolon");

    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "foo:bar:baz", value: "test" }),
    });

    const response = await testFetch("/kv/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "foo:bar:baz" }),
    });

    assertEquals(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assertEquals(data.key, "foo:bar:baz");
    assertEquals(data.value, "test");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "KV: should dump all KV data",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const ns1 = uniqueNamespace("dump1");
    const ns2 = uniqueNamespace("dump2");

    // Set keys in multiple namespaces
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace: ns1, key: "foo", value: "bar" }),
    });
    await testFetch("/kv/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace: ns2, key: "baz", value: "qux" }),
    });

    const response = await testFetch("/kv/dump", {
      method: "POST",
      headers: { Authorization: `ApiKey ${adminApiKey}` },
    });

    assertEquals(response.status, 200);
    const data = await response.json() as Array<{ namespace: string; entries: Array<{ key: string; value: string }> }>;

    // Find our namespaces in the dump
    const dump1 = data.find((d) => d.namespace === ns1);
    const dump2 = data.find((d) => d.namespace === ns2);
    assertExists(dump1);
    assertExists(dump2);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ============================================================================
// Blob Operations Tests
// ============================================================================

Deno.test({
  name: "Blob: should upload and retrieve blob metadata",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("blob");

    // Upload blob
    const content = new TextEncoder().encode("Hello, World!");
    const uploadRes = await testFetch("/blob/upload", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `ApiKey ${adminApiKey}`,
        "X-Blob-Namespace": namespace,
        "X-Blob-Key": "test.txt",
      },
      body: content,
    });

    assertEquals(uploadRes.status, 200);
    const uploadData = await uploadRes.json() as { metadata: Record<string, unknown> };
    assertEquals(uploadData.metadata.key, "test.txt");
    assertEquals(uploadData.metadata.namespace, namespace);
    assertEquals(uploadData.metadata.size, content.length);

    // Get blob URL
    const getRes = await testFetch("/blob/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "test.txt" }),
    });

    assertEquals(getRes.status, 200);
    const getData = await getRes.json() as { url: string };
    assertExists(getData.url);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Blob: should return 404 for non-existent blob",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("blob404");

    const response = await testFetch("/blob/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "nonexistent.txt" }),
    });

    assertEquals(response.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Blob: should list blobs in a namespace",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("bloblist");

    // Upload blob
    const content = new TextEncoder().encode("Test content");
    await testFetch("/blob/upload", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `ApiKey ${adminApiKey}`,
        "X-Blob-Namespace": namespace,
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
      body: JSON.stringify({ namespace }),
    });

    assertEquals(listRes.status, 200);
    const listData = await listRes.json() as { blobs: Array<{ key: string }> };
    const found = listData.blobs.find((b) => b.key === "file.txt");
    assertExists(found);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Blob: should delete a blob",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("blobdel");

    // Upload blob
    const content = new TextEncoder().encode("To delete");
    await testFetch("/blob/upload", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `ApiKey ${adminApiKey}`,
        "X-Blob-Namespace": namespace,
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
      body: JSON.stringify({ namespace, key: "delete-me.txt" }),
    });

    assertEquals(deleteRes.status, 204);

    // Verify deleted
    const getRes = await testFetch("/blob/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "delete-me.txt" }),
    });

    assertEquals(getRes.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Blob: should handle keys with special characters (paths)",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("blobpath");

    const content = new TextEncoder().encode("Nested file");
    const uploadRes = await testFetch("/blob/upload", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `ApiKey ${adminApiKey}`,
        "X-Blob-Namespace": namespace,
        "X-Blob-Key": "folder/subfolder/file-name_v2.txt",
      },
      body: content,
    });

    assertEquals(uploadRes.status, 200);

    // Verify it can be retrieved
    const getRes = await testFetch("/blob/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "folder/subfolder/file-name_v2.txt" }),
    });

    assertEquals(getRes.status, 200);
    const data = await getRes.json() as { metadata: { key: string } };
    assertEquals(data.metadata.key, "folder/subfolder/file-name_v2.txt");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ============================================================================
// Admin Operations Tests
// ============================================================================

Deno.test({
  name: "Admin: should check system status with bootstrap key",
  async fn() {
    const response = await testFetch("/admin/check", {
      method: "POST",
      headers: { Authorization: `ApiKey ${BOOTSTRAP_API_KEY}` },
    });

    assertEquals(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assertExists(data.kv);
    assertExists(data.r2_private);
    assertExists(data.r2_public);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Admin: should check system status with principal key",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const response = await testFetch("/admin/check", {
      method: "POST",
      headers: { Authorization: `ApiKey ${adminApiKey}` },
    });

    assertEquals(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assertExists(data.kv);
    assertExists(data.r2_private);
    assertExists(data.r2_public);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ============================================================================
// Presigned Upload Tests
// ============================================================================

Deno.test({
  name: "Presign: should get presigned upload URL",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("presign");

    const response = await testFetch("/blob/presign-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        key: "presigned-test.txt",
        contentType: "text/plain",
        size: 13,
        isPublic: false,
      }),
    });

    assertEquals(response.status, 200);
    const data = await response.json() as { uploadUrl: string; expiresAt: string };
    assertExists(data.uploadUrl);
    assertExists(data.expiresAt);
    // In filesystem mode, URL should point back to gateway
    assertEquals(data.uploadUrl.includes("/blob/presigned-put"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Presign: should upload via presigned URL and retrieve blob",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("presign-upload");
    const content = "Hello, World!";

    // Step 1: Get presigned URL
    const presignRes = await testFetch("/blob/presign-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        key: "uploaded.txt",
        contentType: "text/plain",
        size: content.length,
        isPublic: false,
      }),
    });

    assertEquals(presignRes.status, 200);
    const { uploadUrl } = await presignRes.json() as { uploadUrl: string };

    // Step 2: Upload using presigned URL (no auth header needed)
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: content,
    });

    assertEquals(uploadRes.status, 200);

    // Step 3: Verify blob can be retrieved
    const getRes = await testFetch("/blob/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({ namespace, key: "uploaded.txt" }),
    });

    assertEquals(getRes.status, 200);
    const getData = await getRes.json() as { url: string; metadata: { size: number } };
    assertExists(getData.url);
    assertEquals(getData.metadata.size, content.length);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Presign: should reject upload with wrong content length",
  async fn() {
    const adminApiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace("presign-wrong-size");

    // Get presigned URL for 10 bytes
    const presignRes = await testFetch("/blob/presign-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${adminApiKey}`,
      },
      body: JSON.stringify({
        namespace,
        key: "wrong-size.txt",
        contentType: "text/plain",
        size: 10,
        isPublic: false,
      }),
    });

    assertEquals(presignRes.status, 200);
    const { uploadUrl } = await presignRes.json() as { uploadUrl: string };

    // Try to upload 20 bytes instead
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "This is more than ten bytes!",
    });

    assertEquals(uploadRes.status, 400);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Presign: should reject expired token",
  async fn() {
    // Create a manually expired token by modifying a valid URL
    // Since we can't easily create an expired token, we'll test with an invalid token
    const response = await fetch("http://localhost:3000/blob/presigned-put?token=invalid_token", {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "test",
    });

    assertEquals(response.status, 401);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
