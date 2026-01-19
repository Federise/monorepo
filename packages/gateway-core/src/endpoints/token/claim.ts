import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  deserializeToken,
  getTokenKVKey,
  isValidTokenId,
  isTokenValid,
  getTokenInvalidReason,
  markTokenUsed,
  serializeToken,
  TokenAction,
} from "../../lib/stateful-token.js";
import { IdentityStatus, type Identity } from "../../lib/identity.js";
import { createCredential, CredentialType } from "../../lib/credential.js";
import type { CapabilityGrant } from "../../lib/grants.js";

const TokenClaimRequest = z.object({
  tokenId: z.string().min(1),
  // For now, we just create an API key. Future: support password/passkey
});

const GrantInfo = z.object({
  grantId: z.string(),
  capability: z.string(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
});

const TokenClaimResponse = z.object({
  success: z.boolean(),
  identity: z
    .object({
      id: z.string(),
      type: z.string(),
      displayName: z.string(),
      status: z.string(),
    })
    .optional(),
  credential: z
    .object({
      id: z.string(),
      type: z.string(),
    })
    .optional(),
  secret: z.string().optional(),
  grants: z.array(GrantInfo).optional(),
  error: z.string().optional(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class TokenClaimEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Token"],
    summary: "Claim an identity using a token",
    description:
      "Use an identity claim token to activate a PENDING_CLAIM identity and create credentials.",
    request: {
      body: {
        content: { "application/json": { schema: TokenClaimRequest } },
      },
    },
    responses: {
      "200": {
        description: "Claim result",
        content: { "application/json": { schema: TokenClaimResponse } },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const { tokenId } = data.body;

    // Validate token ID format
    if (!isValidTokenId(tokenId)) {
      return {
        success: false,
        error: "Invalid token format",
      };
    }

    // Look up token in KV
    const tokenJson = await kv.get(getTokenKVKey(tokenId));
    if (!tokenJson) {
      return {
        success: false,
        error: "Token not found",
      };
    }

    // Deserialize token
    const token = deserializeToken(tokenJson);
    if (!token) {
      return {
        success: false,
        error: "Invalid token data",
      };
    }

    // Check if token is valid
    if (!isTokenValid(token)) {
      return {
        success: false,
        error: getTokenInvalidReason(token) || "Token is invalid",
      };
    }

    // Only identity claim tokens can be used here
    if (token.action !== TokenAction.IDENTITY_CLAIM) {
      return {
        success: false,
        error: "This token cannot be used for identity claim",
      };
    }

    // Get the identity
    const identityJson = await kv.get(`__IDENTITY:${token.payload.identityId}`);
    if (!identityJson) {
      return {
        success: false,
        error: "Identity not found",
      };
    }

    const identity: Identity = JSON.parse(identityJson);

    // Check identity is in PENDING_CLAIM status
    if (identity.status !== IdentityStatus.PENDING_CLAIM) {
      return {
        success: false,
        error: "Identity has already been claimed",
      };
    }

    // Create credential for the identity
    const { credential, secret } = await createCredential({
      identityId: identity.id,
      type: CredentialType.API_KEY,
    });

    // Activate the identity
    const activatedIdentity: Identity = {
      ...identity,
      status: IdentityStatus.ACTIVE,
    };

    // Mark token as used
    const usedToken = markTokenUsed(token, identity.id);

    // Save all changes atomically (in practice, should use transactions)
    await Promise.all([
      // Update identity
      kv.put(`__IDENTITY:${identity.id}`, JSON.stringify(activatedIdentity)),
      // Store credential indexed by secret hash
      kv.put(`__CREDENTIAL:${credential.secretHash}`, JSON.stringify(credential)),
      // Store credential by ID for management
      kv.put(`__CREDENTIAL_ID:${credential.id}`, JSON.stringify(credential)),
      // Update token (or delete it for single-use)
      kv.put(getTokenKVKey(tokenId), serializeToken(usedToken)),
    ]);

    // Load grants for this identity
    const grantsList = await kv.list({ prefix: "__GRANT:" });
    const grants: Array<{
      grantId: string;
      capability: string;
      resourceType?: string;
      resourceId?: string;
    }> = [];

    for (const key of grantsList.keys) {
      const grantJson = await kv.get(key.name);
      if (grantJson) {
        try {
          const grant = JSON.parse(grantJson) as CapabilityGrant;
          // Only include grants for this identity
          if (grant.identityId === identity.id) {
            // Extract resource info from scope if present
            let resourceType: string | undefined;
            let resourceId: string | undefined;
            if (grant.scope?.resources?.length) {
              resourceType = grant.scope.resources[0].type;
              resourceId = grant.scope.resources[0].id;
            }
            grants.push({
              grantId: grant.grantId,
              capability: grant.capability,
              resourceType,
              resourceId,
            });
          }
        } catch {
          // Skip malformed grants
        }
      }
    }

    return {
      success: true,
      identity: {
        id: activatedIdentity.id,
        type: activatedIdentity.type,
        displayName: activatedIdentity.displayName,
        status: activatedIdentity.status,
      },
      credential: {
        id: credential.id,
        type: credential.type,
      },
      secret,
      grants: grants.length > 0 ? grants : undefined,
    };
  }
}
