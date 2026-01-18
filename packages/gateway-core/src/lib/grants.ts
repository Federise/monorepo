/**
 * Capability Grant System
 *
 * This module implements the capability grant model as specified in docs/identity-auth-requirements.md
 *
 * @module grants
 */

// ============================================================================
// Types and Enums
// ============================================================================

export enum GrantSource {
  DIRECT = "direct",
  INVITATION = "invitation",
  DELEGATION = "delegation",
  SYSTEM = "system",
}

export interface ResourceRef {
  type: string;
  id: string;
}

export interface GrantScope {
  namespaces?: string[];
  resources?: ResourceRef[];
  keyPatterns?: string[];
}

export interface CapabilityGrant {
  grantId: string;
  identityId: string;
  capability: string;
  grantedAt: string;
  grantedBy: string;
  source: GrantSource;
  sourceId?: string;
  scope?: GrantScope;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface CreateGrantParams {
  identityId: string;
  capability: string;
  grantedBy: string;
  source?: GrantSource;
  sourceId?: string;
  scope?: GrantScope;
  expiresAt?: string;
}

export interface CredentialScopeRestriction {
  capabilities?: string[];
}

export interface TokenClaimsRestriction {
  capabilities?: string[];
}

export interface EffectivePermissions {
  capabilities: string[];
  namespaces: string[];
  resources: ResourceRef[];

  hasCapability(capability: string): boolean;
  canAccessNamespace(namespace: string): boolean;
  canAccessResource(type: string, id: string): boolean;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateGrantId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `grant_${hex}`;
}

// ============================================================================
// Grant Operations
// ============================================================================

/**
 * Create a new capability grant.
 */
export function createGrant(params: CreateGrantParams): CapabilityGrant {
  return {
    grantId: generateGrantId(),
    identityId: params.identityId,
    capability: params.capability,
    grantedAt: new Date().toISOString(),
    grantedBy: params.grantedBy,
    source: params.source || GrantSource.DIRECT,
    sourceId: params.sourceId,
    scope: params.scope,
    expiresAt: params.expiresAt,
  };
}

/**
 * Revoke a grant.
 */
export function revokeGrant(
  grant: CapabilityGrant,
  revokedBy: string,
  reason: string
): CapabilityGrant {
  return {
    ...grant,
    revokedAt: new Date().toISOString(),
    revokedBy,
    revocationReason: reason,
  };
}

/**
 * Check if a grant is currently valid (not revoked, not expired).
 */
function isGrantValid(grant: CapabilityGrant): boolean {
  // Check if revoked
  if (grant.revokedAt) {
    return false;
  }

  // Check if expired
  if (grant.expiresAt) {
    const expiresAt = new Date(grant.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      return false;
    }
  }

  return true;
}

/**
 * Resolve effective permissions from a list of grants.
 * Optionally intersect with credential scope and/or token claims.
 */
export function resolveEffectivePermissions(
  grants: CapabilityGrant[],
  credentialScope?: CredentialScopeRestriction,
  tokenClaims?: TokenClaimsRestriction
): EffectivePermissions {
  // Filter to valid grants only
  const validGrants = grants.filter(isGrantValid);

  // Collect all capabilities
  let capabilities = new Set<string>();
  const namespaces = new Set<string>();
  const resources: ResourceRef[] = [];
  const hasUnrestrictedNamespace = new Map<string, boolean>();

  for (const grant of validGrants) {
    capabilities.add(grant.capability);

    // Track if this capability has unrestricted namespace access
    if (!grant.scope?.namespaces) {
      hasUnrestrictedNamespace.set(grant.capability, true);
    } else {
      for (const ns of grant.scope.namespaces) {
        namespaces.add(ns);
      }
    }

    // Collect resources
    if (grant.scope?.resources) {
      for (const resource of grant.scope.resources) {
        if (!resources.some((r) => r.type === resource.type && r.id === resource.id)) {
          resources.push(resource);
        }
      }
    }
  }

  // Intersect with credential scope if provided
  if (credentialScope?.capabilities) {
    const allowed = new Set(credentialScope.capabilities);
    capabilities = new Set([...capabilities].filter((c) => allowed.has(c)));
  }

  // Intersect with token claims if provided
  if (tokenClaims?.capabilities) {
    const allowed = new Set(tokenClaims.capabilities);
    capabilities = new Set([...capabilities].filter((c) => allowed.has(c)));
  }

  const capabilitiesArray = Array.from(capabilities);
  const namespacesArray = Array.from(namespaces);

  return {
    capabilities: capabilitiesArray,
    namespaces: namespacesArray,
    resources,

    hasCapability(capability: string): boolean {
      return capabilitiesArray.includes(capability);
    },

    canAccessNamespace(namespace: string): boolean {
      // If any capability has unrestricted access, allow
      for (const cap of capabilitiesArray) {
        if (hasUnrestrictedNamespace.get(cap)) {
          return true;
        }
      }
      // Otherwise check if namespace is in allowed list
      return namespacesArray.includes(namespace);
    },

    canAccessResource(type: string, id: string): boolean {
      // If no resources are specified, allow any (unrestricted)
      if (resources.length === 0) {
        return true;
      }
      return resources.some((r) => r.type === type && r.id === id);
    },
  };
}
