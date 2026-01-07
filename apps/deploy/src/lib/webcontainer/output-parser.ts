/**
 * Parse KV namespace ID from wrangler output
 * Example: id = "e29b263ab50e42ce9b637fa8370175e8"
 */
export function parseKvNamespaceId(output: string): string | null {
  const match = output.match(/id\s*=\s*"([a-f0-9]+)"/);
  return match ? match[1] : null;
}

/**
 * Parse Worker URL from wrangler deploy output
 * Example: https://federise-gateway.username.workers.dev
 */
export function parseWorkerUrl(output: string): string | null {
  const match = output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
  return match ? match[0] : null;
}

/**
 * Parse account info from wrangler whoami output
 * Example output:
 *   Getting User settings...
 *   👋 You are logged in with an OAuth Token, associated with the email user@example.com.
 *   ...
 *   | Account Name | Account ID |
 *   | My Account   | abc123...  |
 */
export function parseWhoamiOutput(output: string): { accountId: string; email: string } | null {
  const emailMatch = output.match(/email\s+([^\s.]+@[^\s.]+\.[^\s]+)/i);
  const accountIdMatch = output.match(/\|\s*[^|]+\s*\|\s*([a-f0-9]{32})\s*\|/);

  if (accountIdMatch) {
    return {
      accountId: accountIdMatch[1],
      email: emailMatch ? emailMatch[1] : 'unknown'
    };
  }

  return null;
}

/**
 * Check if output indicates authentication is required
 */
export function isAuthRequired(output: string): boolean {
  return (
    output.includes('not authenticated') ||
    output.includes('You must be logged in') ||
    output.includes('wrangler login')
  );
}

/**
 * Check if a bucket already exists from error output
 */
export function bucketAlreadyExists(output: string): boolean {
  return output.includes('already exists') || output.includes('AlreadyExists');
}

/**
 * Check if a KV namespace already exists from error output
 */
export function kvNamespaceAlreadyExists(output: string): boolean {
  return output.includes('already exists');
}
