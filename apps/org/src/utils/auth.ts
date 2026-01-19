/**
 * Authentication utilities for Federise
 *
 * Handles Storage Access API for iframe contexts.
 * Credentials are stored in the vault (via @federise/proxy), not here.
 */

// Track whether we have storage access in iframe context
let hasStorageAccess = false;

/**
 * Check if we're running in an iframe
 */
function isIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // If we can't access window.top due to cross-origin restrictions, we're in an iframe
    return true;
  }
}

/**
 * Check if we already have storage access (without requesting it).
 * Returns true if we have access, false otherwise.
 */
export async function checkStorageAccess(): Promise<boolean> {
  if (!isIframe()) {
    hasStorageAccess = true;
    return true;
  }

  if (!document.hasStorageAccess) {
    // API not available - assume we have access
    hasStorageAccess = true;
    return true;
  }

  try {
    const result = await document.hasStorageAccess();
    if (result) {
      hasStorageAccess = true;
    }
    return result;
  } catch {
    return false;
  }
}

/**
 * Request storage access (for iframe contexts).
 * Must be called from a user gesture (click/tap).
 */
export async function requestStorageAccess(): Promise<boolean> {
  if (!isIframe()) {
    hasStorageAccess = true;
    return true;
  }

  if (!document.requestStorageAccess) {
    console.warn('[Auth] Storage Access API not available');
    hasStorageAccess = true;
    return true;
  }

  try {
    await document.requestStorageAccess();
    hasStorageAccess = true;
    return true;
  } catch (err) {
    console.warn('[Auth] Storage access request failed:', err);
    return false;
  }
}

/**
 * Check if storage access has been granted
 */
export function hasGrantedStorageAccess(): boolean {
  return hasStorageAccess;
}
