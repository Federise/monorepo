# DOC-001: Documentation describes gateway URLs exposed to apps

## Issue Summary
- **Severity**: CRITICAL
- **File**: `docs/unified-token-system.md` (lines 69-79)
- **Guideline Violated**: "Third party apps never see gateway endpoints"

## Description
Share Link format embeds gateway URL in token string (`#<token>@<gateway>`). Documents architecture that violates security constraints.

## Impact
- Documents insecure architecture pattern
- New developers may implement this pattern
- Existing implementation likely follows documented design

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review unified-token-system.md
- [ ] Check if implementation matches documentation
- [ ] Identify all places gateway URLs appear in docs
- [ ] Understand why this design was chosen
- [ ] Document current share link format

### Commands to Test Current State
```bash
# Find gateway URL documentation
grep -rn "gateway.*url\|@.*gateway" docs/

# Review token system docs
cat docs/unified-token-system.md

# Check for share link format
grep -rn "share.*link\|#.*@" docs/
```

---

## The Problem

The current share link format:
```
https://example.com/channel#<token>@<base64-gateway-url>
```

This exposes the gateway URL to:
1. The third-party app receiving the share link
2. Anyone who sees/intercepts the URL
3. Browser history, logs, referrer headers

---

## Possible Approaches

### Approach A: Proxy-Routed Share Links (Recommended)
**Description**: Share links point to federise.org proxy, which routes to appropriate gateway.

**Pros**:
- Hides gateway from apps
- Consistent with other architecture
- Single trusted domain

**Cons**:
- Requires federise.org service
- Additional latency
- Single point of failure

**Effort**: High

### Approach B: Token-Only Share Links
**Description**: Share links contain only token, token encodes gateway info server-side.

**Pros**:
- Simpler URL format
- Gateway stays server-side

**Cons**:
- Requires lookup service
- Token becomes gateway-specific
- May expose gateway at claim time

**Effort**: Medium

### Approach C: Shortlink Service
**Description**: Create short links that hide gateway URL entirely.

**Pros**:
- Clean URLs
- Complete URL hiding
- Can add analytics/tracking

**Cons**:
- Requires shortlink service
- URL redirection complexity
- Database dependency

**Effort**: Medium

### Approach D: Document as Known Limitation
**Description**: Update docs to acknowledge this is a known security trade-off.

**Pros**:
- No code changes
- Honest documentation

**Cons**:
- Doesn't fix the issue
- May not be acceptable for security model

**Effort**: Low

---

## Recommended Approach

**Approach A or C** depending on infrastructure availability.

For immediate documentation fix, update docs to reflect actual security posture and document planned changes. Then implement proper fix.

---

## Implementation Plan

### Phase 1: Documentation Updates
1. Audit all docs for gateway URL exposure
2. Update to reflect current state honestly
3. Add security considerations section
4. Document planned architectural changes

### Phase 2: Architecture Design
1. Design proxy-routed share system
2. Document new share link format
3. Plan migration from old format
4. Consider backwards compatibility

### Phase 3: Implementation
1. Implement federise.org proxy for shares
2. Update share link generation
3. Update share link consumption
4. Migrate existing share links (if possible)

### Phase 4: Documentation Cleanup
1. Update all docs to new architecture
2. Remove references to old format
3. Document new security model

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document all gateway URL exposure in docs
- [ ] Verify implementation matches docs
- [ ] List all share link formats used

### Phase 1 Tests (Doc Updates)
- [ ] All docs accurately reflect current state
- [ ] Security considerations documented
- [ ] No misleading security claims

### Phase 2/3 Tests (Implementation)
- [ ] New share links don't expose gateway
- [ ] Old share links still work (migration)
- [ ] Apps can claim shares without seeing gateway
- [ ] Proxy routing works correctly

### Regression Tests
- [ ] Share link generation works
- [ ] Share link claiming works
- [ ] Cross-app sharing works
- [ ] Existing shares remain functional

---

## Documentation Changes Needed

### Files to Update
1. `docs/unified-token-system.md` - Main offender
2. `requirements/ARCHITECTURE.md` - May reference format
3. `docs/ARCHITECTURAL-REVIEW.md` - References direct calls
4. Any README or guide mentioning share links

### Security Considerations Section (to add)
```markdown
## Security Considerations

### Gateway URL Exposure

**Current State**: Share links currently include the gateway URL in the format
`#<token>@<base64-gateway>`. This means:
- Third-party apps can see which gateway is used
- The URL may appear in browser history, logs, and referrers

**Planned Fix**: Migration to proxy-routed shares where apps only see
a federise.org URL, and gateway routing happens server-side.

**Risk Mitigation**: Until fixed, share links should only be used with
trusted applications.
```

---

## Related Issues
- DOC-002: Architecture documents direct HTTP calls
- DOC-004: ClaimFlow documented using direct fetch
- SDK-001: ChannelClient makes direct fetch calls

---

## Notes
- This is both a documentation and architecture issue
- Full fix requires significant infrastructure
- Document the gap honestly in the meantime
- Consider share link versioning for migration
