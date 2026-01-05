import { OpenAPIRoute } from "chanfana";

import { PrincipalCreateRequest, PrincipalCreateResponse, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";
import { generateApiKey, hashApiKey } from "../../lib/crypto.js";

export class PrincipalCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Principal Management"],
    summary: "Create a new principal",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: PrincipalCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: PrincipalCreateResponse } },
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
    const secret = generateApiKey();
    const secretHash = await hashApiKey(secret);
    const created_at = new Date().toISOString();

    const principal = {
      display_name: data.body.display_name,
      created_at,
      active: true,
    };

    await kv.put(`__PRINCIPAL:${secretHash}`, JSON.stringify(principal));

    return {
      secret_hash: secretHash,
      display_name: data.body.display_name,
      created_at,
      active: true,
      secret,
    };
  }
}
