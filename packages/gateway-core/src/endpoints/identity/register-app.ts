/**
 * Register or update an APP identity.
 *
 * This endpoint is called by the frame when an app is granted permissions.
 * It creates or updates an APP identity with the granted capabilities.
 */

import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { createIdentity, IdentityType, type Identity } from "../../lib/identity.js";

const RegisterAppRequest = z.object({
  origin: z.string().url(),
  displayName: z.string().optional(),
  capabilities: z.array(z.string()),
});

const RegisterAppResponse = z.object({
  identity: z.object({
    id: z.string(),
    type: z.string(),
    displayName: z.string(),
    status: z.string(),
    createdAt: z.string(),
    appConfig: z.object({
      origin: z.string(),
      namespace: z.string(),
      grantedCapabilities: z.array(z.string()),
      frameAccess: z.boolean(),
    }),
  }),
  created: z.boolean(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class IdentityRegisterAppEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "Register or update an APP identity",
    description: "Creates a new APP identity or updates capabilities for an existing one",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: RegisterAppRequest } },
      },
    },
    responses: {
      "200": {
        description: "APP identity registered/updated",
        content: { "application/json": { schema: RegisterAppResponse } },
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
    const callerIdentity = c.get("identity");

    const { origin, displayName, capabilities } = data.body;

    // Derive namespace from origin for lookup
    const namespace = origin
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/[.:]/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    // Check if an APP identity already exists for this origin
    const lookupKey = `__APP_ORIGIN:${namespace}`;
    const existingId = await kv.get(lookupKey);

    let identity: Identity;
    let created = false;

    if (existingId) {
      // Update existing identity
      const identityKey = `__IDENTITY:${existingId}`;
      const identityVal = await kv.get(identityKey);

      if (identityVal) {
        identity = JSON.parse(identityVal) as Identity;

        // Merge capabilities (add new ones, keep existing)
        const existingCaps = identity.appConfig?.grantedCapabilities ?? [];
        const mergedCaps = [...new Set([...existingCaps, ...capabilities])];

        identity = {
          ...identity,
          appConfig: {
            ...identity.appConfig!,
            grantedCapabilities: mergedCaps,
          },
        };

        // Update displayName if provided
        if (displayName) {
          identity.displayName = displayName;
        }

        await kv.put(identityKey, JSON.stringify(identity));
      } else {
        // Lookup exists but identity is gone - recreate
        identity = createIdentity({
          type: IdentityType.APP,
          displayName: displayName || namespace,
          createdBy: callerIdentity?.id,
          appConfig: {
            origin,
            grantedCapabilities: capabilities,
            frameAccess: true,
          },
        });
        created = true;
        await kv.put(`__IDENTITY:${identity.id}`, JSON.stringify(identity));
        await kv.put(lookupKey, identity.id);
      }
    } else {
      // Create new APP identity
      identity = createIdentity({
        type: IdentityType.APP,
        displayName: displayName || namespace,
        createdBy: callerIdentity?.id,
        appConfig: {
          origin,
          grantedCapabilities: capabilities,
          frameAccess: true,
        },
      });
      created = true;

      // Store identity and lookup
      await kv.put(`__IDENTITY:${identity.id}`, JSON.stringify(identity));
      await kv.put(lookupKey, identity.id);
    }

    return {
      identity: {
        id: identity.id,
        type: identity.type,
        displayName: identity.displayName,
        status: identity.status,
        createdAt: identity.createdAt,
        appConfig: identity.appConfig!,
      },
      created,
    };
  }
}
