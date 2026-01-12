/**
 * Observability utilities for request tracking and debugging.
 */

export type RequestAction = "redirect" | "proxy" | "error";

export interface RequestMetrics {
  requestId: string;
  action: RequestAction;
  visibility?: string;
  presignExpiry?: number;
}

/**
 * Add observability headers to a response for debugging and monitoring.
 */
export function addObservabilityHeaders(
  headers: Headers,
  metrics: RequestMetrics
): void {
  headers.set("X-Request-Id", metrics.requestId);
  headers.set("X-Action", metrics.action);

  if (metrics.visibility) {
    headers.set("X-Visibility", metrics.visibility);
  }

  if (metrics.presignExpiry !== undefined) {
    headers.set("X-Presign-Expiry", String(metrics.presignExpiry));
  }
}

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
