import { OpenAPIRoute } from "chanfana";

import { ShortLinkCreateRequest, ShortLinkCreateResponse, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class ShortLinkCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Short Links"],
    summary: "Create a short link",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ShortLinkCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Short link created successfully",
        content: { "application/json": { schema: ShortLinkCreateResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const shortLink = c.get("shortLink");

    const created = await shortLink.create(data.body.url);

    // Build the short URL based on the request URL
    const requestUrl = new URL(c.req.url);
    const shortUrl = `${requestUrl.protocol}//${requestUrl.host}/s/${created.id}`;

    return c.json({
      id: created.id,
      shortUrl,
      targetUrl: created.targetUrl,
    });
  }
}
