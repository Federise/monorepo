import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {
  ErrorResponse,
  type AppContext,
  getKV,
  getR2,
  getR2Public,
} from "@federise/gateway-core";

const AdminCheckResponse = z.object({
  kv: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
  r2_private: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
  r2_public: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
  presigned_ready: z.boolean(),
  principals_exist: z.boolean(),
});

export class AdminCheckEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Admin"],
    summary: "Check gateway dependencies and configuration status",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "Dependency status report",
        content: { "application/json": { schema: AdminCheckResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const kv = getKV(c);
    const r2 = getR2(c);
    const r2Public = getR2Public(c);

    const results = {
      kv: { ok: false, error: undefined as string | undefined },
      r2_private: { ok: false, error: undefined as string | undefined },
      r2_public: { ok: false, error: undefined as string | undefined },
      presigned_ready: true, // Always true for self-hosted (S3 credentials are required)
      principals_exist: false,
    };

    // Test KV (Deno KV)
    try {
      await kv.list({ prefix: "__ADMIN_CHECK:", limit: 1 });
      results.kv.ok = true;
    } catch (e) {
      results.kv.error = e instanceof Error ? e.message : "KV binding failed";
    }

    // Test private blob storage
    try {
      await r2.list({ prefix: "__admin_check/", limit: 1 });
      results.r2_private.ok = true;
    } catch (e) {
      results.r2_private.error = e instanceof Error ? e.message : "Private blob storage failed";
    }

    // Test public blob storage
    try {
      await r2Public.list({ prefix: "__admin_check/", limit: 1 });
      results.r2_public.ok = true;
    } catch (e) {
      results.r2_public.error = e instanceof Error ? e.message : "Public blob storage failed";
    }

    // Check if principals exist
    try {
      const list = await kv.list({ prefix: "__PRINCIPAL:", limit: 1 });
      results.principals_exist = list.keys.length > 0;
    } catch {
      // If KV failed, principals_exist stays false
    }

    return results;
  }
}
