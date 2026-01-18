import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { createIdentity, IdentityType, type Identity } from "../../lib/identity.js";
import { createCredential, CredentialType, type Credential } from "../../lib/credential.js";

const IdentityCreateRequest = z.object({
  displayName: z.string().min(1).max(100),
  type: z.enum(["user", "service", "agent"]).default("user"),
});

const IdentityCreateResponse = z.object({
  identity: z.object({
    id: z.string(),
    type: z.string(),
    displayName: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
  credential: z.object({
    id: z.string(),
    type: z.string(),
  }),
  secret: z.string(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class IdentityCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "Create a new identity with credentials",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: IdentityCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Identity created successfully",
        content: { "application/json": { schema: IdentityCreateResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");

    // Map string type to IdentityType enum
    const typeMap: Record<string, IdentityType> = {
      user: IdentityType.USER,
      service: IdentityType.SERVICE,
      agent: IdentityType.AGENT,
    };

    // Create the identity
    const identity = createIdentity({
      type: typeMap[data.body.type],
      displayName: data.body.displayName,
    });

    // Create credential for the identity
    const { credential, secret } = await createCredential({
      identityId: identity.id,
      type: CredentialType.API_KEY,
    });

    // Store identity
    await kv.put(`__IDENTITY:${identity.id}`, JSON.stringify(identity));

    // Store credential indexed by secret hash for lookup
    await kv.put(`__CREDENTIAL:${credential.secretHash}`, JSON.stringify(credential));

    // Also store credential by ID for management
    await kv.put(`__CREDENTIAL_ID:${credential.id}`, JSON.stringify(credential));

    return {
      identity: {
        id: identity.id,
        type: identity.type,
        displayName: identity.displayName,
        status: identity.status,
        createdAt: identity.createdAt,
      },
      credential: {
        id: credential.id,
        type: credential.type,
      },
      secret,
    };
  }
}
