import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { IdentityStatus, type Identity } from "../../lib/identity.js";
import type { Credential } from "../../lib/credential.js";

const IdentityDeleteRequest = z.object({
  identityId: z.string(),
});

const IdentityDeleteResponse = z.object({
  success: z.boolean(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class IdentityDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "Delete an identity and its credentials",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: IdentityDeleteRequest } },
      },
    },
    responses: {
      "200": {
        description: "Identity deleted",
        content: { "application/json": { schema: IdentityDeleteResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Identity not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");

    const identityKey = `__IDENTITY:${data.body.identityId}`;
    const identityVal = await kv.get(identityKey);

    if (!identityVal) {
      return c.json({ code: "NOT_FOUND", message: "Identity not found" }, 404);
    }

    const identity = JSON.parse(identityVal) as Identity;

    // Mark identity as deleted
    const deletedIdentity: Identity = {
      ...identity,
      status: IdentityStatus.DELETED,
    };
    await kv.put(identityKey, JSON.stringify(deletedIdentity));

    // Find and revoke all credentials for this identity
    const credList = await kv.list({ prefix: "__CREDENTIAL:" });
    for (const key of credList.keys) {
      const credVal = await kv.get(key.name);
      if (credVal) {
        try {
          const credential = JSON.parse(credVal) as Credential;
          if (credential.identityId === data.body.identityId) {
            // Delete the credential
            await kv.delete(key.name);
            // Also delete from ID index
            await kv.delete(`__CREDENTIAL_ID:${credential.id}`);
          }
        } catch {
          // Skip malformed entries
        }
      }
    }

    return { success: true };
  }
}
