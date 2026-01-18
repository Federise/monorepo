import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  createClaimableIdentity,
  IdentityType,
} from "../../lib/identity.js";
import {
  createGrant,
  GrantSource,
  type GrantScope,
} from "../../lib/grants.js";
import {
  createIdentityClaimToken,
  getTokenKVKey,
  serializeToken,
} from "../../lib/stateful-token.js";

const ChannelPermission = z.enum([
  "read",
  "append",
  "delete:own",
  "delete:any",
  "read:deleted",
]);

const IdentityInviteRequest = z.object({
  displayName: z.string().min(1).max(100),
  channelId: z.string().min(1),
  namespace: z.string().min(1),
  permissions: z.array(ChannelPermission).min(1),
  expiresInSeconds: z.number().int().positive().default(604800), // 7 days
});

const IdentityInviteResponse = z.object({
  tokenId: z.string(),
  identityId: z.string(),
  expiresAt: z.string().datetime(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

/**
 * Map channel permission strings to capability names.
 */
function permissionToCapability(permission: string): string {
  switch (permission) {
    case "read":
      return "channel:read";
    case "append":
      return "channel:append";
    case "delete:own":
      return "channel:delete:own";
    case "delete:any":
      return "channel:delete:any";
    case "read:deleted":
      return "channel:read:deleted";
    default:
      return `channel:${permission}`;
  }
}

export class IdentityInviteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "Create a claimable identity with channel access grants",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: IdentityInviteRequest } },
      },
    },
    responses: {
      "200": {
        description: "Invitation created successfully",
        content: { "application/json": { schema: IdentityInviteResponse } },
      },
      "403": {
        description: "Not the channel owner",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Channel not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const channelStore = c.get("channelStore");

    const { displayName, channelId, namespace, permissions, expiresInSeconds } =
      data.body;

    // Get the caller's identity
    const callerIdentity = c.get("identity");
    const createdBy = callerIdentity?.id || "unknown";

    // Get channel metadata to verify ownership
    const channelMeta = await channelStore.getMetadata(channelId);
    if (!channelMeta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Verify the caller owns the channel
    if (channelMeta.ownerNamespace !== namespace) {
      return c.json({ code: 403, message: "Not the channel owner" }, 403);
    }

    // 1. Create claimable identity
    const newIdentity = createClaimableIdentity({
      type: IdentityType.USER,
      displayName,
      createdBy,
    });

    // 2. Create grants for each permission
    const grants = permissions.map((permission) => {
      const scope: GrantScope = {
        resources: [{ type: "channel", id: channelId }],
      };

      return createGrant({
        identityId: newIdentity.id,
        capability: permissionToCapability(permission),
        grantedBy: createdBy,
        source: GrantSource.INVITATION,
        sourceId: newIdentity.id,
        scope,
      });
    });

    // 3. Create identity claim token
    const token = createIdentityClaimToken({
      identityId: newIdentity.id,
      createdBy,
      label: `Channel access for ${displayName}`,
      expiresInSeconds,
    });

    // 4. Store everything in KV
    // Store identity
    await kv.put(`__IDENTITY:${newIdentity.id}`, JSON.stringify(newIdentity));

    // Store grants
    for (const grant of grants) {
      await kv.put(`__GRANT:${grant.grantId}`, JSON.stringify(grant));
    }

    // Store token
    await kv.put(getTokenKVKey(token.id), serializeToken(token));

    return {
      tokenId: token.id,
      identityId: newIdentity.id,
      expiresAt: token.expiresAt,
    };
  }
}
