# DOC-003: Known critical security vulnerabilities documented

## Issue Summary
- **Severity**: CRITICAL
- **File**: `requirements/CROSS-CUTTING-CONCERNS.md` (lines 136-141)
- **Guideline Violated**: "No secrets in client-side code"

## Description
Documents SEC-001: API keys stored unencrypted in localStorage, bootstrap key exposed. Documents known unresolved critical security issues.

## Impact
- Security vulnerabilities are known but unfixed
- Documentation serves as roadmap for attackers
- Creates liability if security issues are exploited

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review CROSS-CUTTING-CONCERNS.md
- [ ] List all documented security vulnerabilities
- [ ] Check if vulnerabilities are still present
- [ ] Assess severity of each vulnerability

### Commands to Test Current State
```bash
# Find security documentation
grep -rn "SEC-\|security\|vulnerab" requirements/CROSS-CUTTING-CONCERNS.md

# Check for other security docs
grep -rn "SEC-" docs/ requirements/ future/

# Look at what's documented
cat requirements/CROSS-CUTTING-CONCERNS.md | grep -A 10 "SEC-"
```

---

## The Problem

The documentation explicitly lists security vulnerabilities:
- SEC-001: API keys stored unencrypted in localStorage
- SEC-002: Bootstrap key exposure
- (Possibly others)

This creates several issues:
1. Known vulnerabilities remain unfixed
2. Documentation helps attackers identify weaknesses
3. Leaving vulnerabilities documented without fix plans is concerning

---

## Possible Approaches

### Approach A: Fix Vulnerabilities, Then Update Docs (Recommended)
**Description**: Address the actual security issues, then update documentation.

**Pros**:
- Actually fixes the problem
- Documentation becomes accurate

**Cons**:
- More work
- Takes longer

**Effort**: High (depends on vulnerabilities)

### Approach B: Move to Private Security Tracker
**Description**: Remove vulnerability details from public docs, track internally.

**Pros**:
- Reduces public exposure
- Maintains tracking

**Cons**:
- Doesn't fix issues
- May still be in git history

**Effort**: Low

### Approach C: Add Fix Plans and Timelines
**Description**: Keep documentation but add concrete fix plans.

**Pros**:
- Transparent about issues
- Shows commitment to fixing

**Cons**:
- Still documents vulnerabilities
- Creates pressure to deliver

**Effort**: Medium

---

## Recommended Approach

**Approach A: Fix Vulnerabilities**

The documented vulnerabilities are serious (unencrypted credentials). They should be fixed as priority, then documentation updated to reflect the secure state.

---

## Implementation Plan

### Phase 1: Vulnerability Assessment
1. List all documented vulnerabilities
2. Verify each still exists
3. Assess severity and exploitability
4. Prioritize by risk

### Phase 2: Fix SEC-001 (localStorage Encryption)
1. Design encrypted storage solution
2. Implement secure credential storage
3. Migrate existing credentials
4. Verify encryption is effective

### Phase 3: Fix SEC-002 (Bootstrap Key)
1. Review bootstrap key exposure
2. Implement secure key handling
3. Update provisioning flow
4. Remove bootstrap key from logs

### Phase 4: Fix Other SEC-xxx Issues
1. Address each documented vulnerability
2. Verify fixes are effective
3. Add tests for security properties

### Phase 5: Update Documentation
1. Remove vulnerability details from public docs
2. Document secure architecture
3. Add security best practices
4. Note that issues were fixed (without exploit details)

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Verify credentials are in localStorage unencrypted
- [ ] Verify bootstrap key is exposed (where/how?)
- [ ] Document all SEC-xxx issues and their status
- [ ] Assess actual exploitability

### Phase 2 Tests (SEC-001 Fix)
- [ ] Credentials are encrypted at rest
- [ ] Encryption keys are properly managed
- [ ] Old unencrypted data is migrated
- [ ] Decryption works correctly

### Phase 3 Tests (SEC-002 Fix)
- [ ] Bootstrap key not in logs
- [ ] Bootstrap key not in client code
- [ ] Key handling follows best practices

### Post-Implementation Tests
- [ ] All documented vulnerabilities fixed
- [ ] Documentation updated
- [ ] Security audit passes
- [ ] No new vulnerabilities introduced

### Regression Tests
- [ ] Authentication still works
- [ ] Credential storage still works
- [ ] Provisioning still works
- [ ] Apps can still connect

---

## Documented Vulnerabilities to Fix

### SEC-001: API Keys in localStorage
**Current State**: API keys stored as plaintext in localStorage
**Risk**: XSS can steal credentials
**Fix**: Encrypt credentials, use secure storage patterns

### SEC-002: Bootstrap Key Exposed
**Current State**: Bootstrap key visible in logs/code
**Risk**: Unauthorized gateway access
**Fix**: Secure key handling, remove from logs

### Other SEC-xxx (to document)
Review `future/auth.md` lines 7-10 for SEC-001 through SEC-005

---

## Documentation Updates

### Before (Current)
```markdown
## Known Security Issues

- SEC-001: API keys stored unencrypted in localStorage
- SEC-002: Bootstrap key is exposed during provisioning
```

### After (Fixed)
```markdown
## Security Architecture

### Credential Storage
Credentials are encrypted at rest using [mechanism]. Keys are
derived from [source] and never stored in plaintext.

### Bootstrap Process
Initial provisioning uses secure key exchange. Bootstrap keys
are single-use and not persisted beyond initial setup.
```

---

## Related Issues
- PROXY-H02: Plaintext localStorage credential storage
- TEST-H01: Gateway API key stored in client localStorage
- DOC-H04: Unresolved security vulnerabilities documented

---

## Notes
- This is a high-priority security fix
- Consider security audit after fixes
- May need to rotate any exposed keys
- Coordinate with other credential-related fixes
