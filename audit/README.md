# Guidelines Compliance Audit - Action Plans

> Action plans for fixing issues identified in [GUIDELINES-AUDIT.md](../docs/GUIDELINES-AUDIT.md)
>
> Created: 2026-01-20

---

## Summary

| Priority | Total | Files |
|----------|-------|-------|
| CRITICAL | 12 | 12 individual plans |
| HIGH | 26 | 13 files (some grouped) |
| MEDIUM | 36 | 6 grouped files |
| LOW | 14 | 5 grouped files |
| **Total** | **88** | **36 files** |

---

## Quick Reference

### Must Fix Immediately (Security Critical)

| ID | Issue | File |
|----|-------|------|
| [GW-003](critical/GW-003-identity-delete-auth.md) | Identity delete has no auth check | `identity/delete.ts` |
| [GW-001](critical/GW-001-kv-blob-namespace-ownership.md) | KV/Blob lack ownership validation | `kv/*.ts`, `blob/*.ts` |
| [GW-H05](high/GW-H05-namespace-system-key-access.md) | System key access via namespace | `kv/set.ts` |
| [ORG-001](critical/ORG-001-postmessage-wildcard-origin.md) | postMessage uses wildcard origin | `FrameEnforcer.svelte` |

### Should Fix Soon (Architecture/Privacy)

| ID | Issue | File |
|----|-------|------|
| [SDK-001](critical/SDK-001-channel-client-direct-fetch.md) | ChannelClient bypasses proxy | `channel-client.ts` |
| [GW-002](critical/GW-002-kv-dump-endpoint.md) | /kv/dump exposes all data | `kv/dump.ts` |
| [GW-H08](high/GW-H08-identity-list-exposes-all.md) | Identity list exposes all | `identity/list.ts` |

---

## Directory Structure

```
audit/
├── README.md                    # This file
├── critical/                    # Security-critical issues (fix immediately)
│   ├── SDK-001-channel-client-direct-fetch.md
│   ├── SDK-002-gateway-urls-exposed.md
│   ├── SDK-003-token-parsing-validation.md
│   ├── GW-001-kv-blob-namespace-ownership.md
│   ├── GW-002-kv-dump-endpoint.md
│   ├── GW-003-identity-delete-auth.md
│   ├── ORG-001-postmessage-wildcard-origin.md
│   ├── ORG-002-claimflow-payload-validation.md
│   ├── DOC-001-gateway-urls-in-docs.md
│   ├── DOC-002-architecture-direct-http.md
│   ├── DOC-003-security-vulnerabilities-documented.md
│   └── DOC-004-claimflow-direct-fetch.md
├── high/                        # Important issues (fix soon)
│   ├── SDK-H01-backwards-compatibility-code.md
│   ├── SDK-H02-error-handling-exposes-details.md
│   ├── GW-H01-backwards-compat-ispublic.md
│   ├── GW-H02-no-rate-limiting.md
│   ├── GW-H03-missing-input-validation.md
│   ├── GW-H04-channel-auth-missing.md
│   ├── GW-H05-namespace-system-key-access.md
│   ├── GW-H06-blob-list-exposes-all.md
│   ├── GW-H07-kv-list-namespaces-exposed.md
│   ├── GW-H08-identity-list-exposes-all.md
│   ├── GW-H09-register-app-unauthorized.md
│   ├── GW-H10-token-endpoints-no-rate-limit.md
│   ├── PROXY-H01-H02-secrets-exposure.md
│   ├── ORG-H01-H02-H03-validation-issues.md
│   ├── TEST-H01-H02-test-credentials.md
│   └── DOC-H01-H07-documentation-issues.md
├── medium/                      # Code quality issues (plan to fix)
│   ├── SDK-M01-M15-pattern-inconsistencies.md
│   ├── GW-M01-M08-gateway-quality.md
│   ├── PROXY-M01-M04-code-quality.md
│   ├── ORG-M01-M02-validation-gaps.md
│   ├── TEST-M01-M03-test-quality.md
│   └── DOC-M01-M06-documentation-quality.md
└── low/                         # Polish items (nice to have)
    ├── SDK-L01-index-cleanup.md
    ├── GW-L01-L02-gateway-polish.md
    ├── ORG-L01-L03-org-polish.md
    ├── TEST-L01-L03-test-polish.md
    └── DOC-L01-L03-doc-polish.md
```

---

## Action Plan Structure

Each action plan file follows this structure:

```markdown
# Issue ID: Brief Title

## Issue Summary
- Severity, file, guideline violated

## Description
What the issue is and its impact

## Current State Analysis
What to test before changes

## Possible Approaches
Multiple solutions with pros/cons

## Recommended Approach
Chosen solution with justification

## Implementation Plan
Step-by-step instructions

## Testing Checklist
- [ ] Pre-implementation tests
- [ ] Implementation tests
- [ ] Post-implementation tests
- [ ] Regression tests

## Related Issues
Links to connected issues

## Notes
Additional considerations
```

---

## Recommended Fix Order

### Phase 1: Security Emergencies (Week 1)
1. **GW-003**: Add identity delete authorization
2. **GW-001**: Add namespace ownership validation
3. **GW-H05**: Block system key access
4. **ORG-001**: Fix postMessage origin

### Phase 2: Authorization Gaps (Week 2)
5. **GW-H04**: Channel authorization
6. **GW-H06, H07, H08**: List endpoint restrictions
7. **GW-H09**: Register-app authorization
8. **GW-002**: Remove /kv/dump

### Phase 3: Architecture Alignment (Week 3)
9. **SDK-001**: Route ChannelClient through proxy
10. **SDK-002, H02**: Error sanitization
11. **SDK-003**: Token validation
12. **ORG-002**: ClaimFlow validation

### Phase 4: Rate Limiting & Input Validation (Week 4)
13. **GW-H02, H10**: Add rate limiting
14. **GW-H03**: Input validation
15. **ORG-H01, H02, H03**: Org validation

### Phase 5: Cleanup (Ongoing)
16. Backwards compatibility removal (SDK-H01, GW-H01)
17. Credential encryption (PROXY-H02)
18. Documentation updates (DOC-*)
19. Code quality improvements (Medium priority)
20. Polish items (Low priority)

---

## Coordination Points

### Changes That Affect Multiple Components

| Change | Affects |
|--------|---------|
| Namespace ownership model | Gateway, SDK, Org, Tests |
| Error sanitization | SDK, Proxy |
| Backwards compat removal | SDK, Gateway, Docs |
| Rate limiting | Gateway, all clients |
| Terminology update | All docs, code comments |

### Breaking Changes

These changes will require version bumps:
- SDK-H01: Removing deprecated exports
- GW-H01: Removing isPublic field
- GW-002: Removing /kv/dump endpoint
- Namespace format changes

---

## Progress Tracking

Use this template to track completion:

```markdown
## Sprint: [Date Range]

### Completed
- [x] GW-003 - Identity delete auth - PR #123
- [x] GW-001 - Namespace ownership - PR #124

### In Progress
- [ ] ORG-001 - postMessage origin - PR #125 (in review)

### Blocked
- [ ] SDK-001 - Waiting on frame protocol design

### Deferred
- [ ] DOC-* - Deprioritized for security fixes
```

---

## Testing Strategy

### Before Any Fix
1. Run existing test suite
2. Document current behavior
3. Add tests for expected new behavior

### After Each Fix
1. Run full test suite
2. Manual testing of affected flows
3. Security review if applicable

### Integration Testing
After fixing related issues, test interactions:
- Namespace ownership + list restrictions
- Rate limiting + token endpoints
- Authorization + channel operations

---

## Resources

- [Original Audit](../docs/GUIDELINES-AUDIT.md)
- [Guidelines](../guidelines.md)
- [Architecture](../requirements/ARCHITECTURE.md)

---

## Contributing

When working on fixes:

1. **Pick an issue** from this directory
2. **Follow the plan** in the action plan file
3. **Check off items** as you complete them
4. **Update the plan** if you discover new issues
5. **Link your PR** to the action plan
6. **Mark complete** when merged

---

*Last updated: 2026-01-20*
