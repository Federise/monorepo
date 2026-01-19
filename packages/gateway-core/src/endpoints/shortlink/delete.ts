import { OpenAPIRoute } from "chanfana";
import { z } from "zod";

import { ShortLinkDeleteResponse, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class ShortLinkDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Short Links"],
    summary: "Delete a short link",
    security: [{ apiKey: [] }],
    request: {
      params: z.object({
        id: z.string().describe("Short link ID"),
      }),
    },
    responses: {
      "200": {
        description: "Short link deleted successfully",
        content: { "application/json": { schema: ShortLinkDeleteResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Short link not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const shortLink = c.get("shortLink");

    const deleted = await shortLink.delete(data.params.id);
    if (!deleted) {
      return c.json({ code: "NOT_FOUND", message: "Short link not found" }, 404);
    }

    return c.json({ success: true });
  }
}
