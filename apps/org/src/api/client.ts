import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Create a gateway API client
 */
export function createGatewayClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

/**
 * Helper to create authorization header params
 */
export function withAuth(apiKey: string) {
  return {
    params: {
      header: {
        authorization: `ApiKey ${apiKey}`,
      },
    },
  } as const;
}
