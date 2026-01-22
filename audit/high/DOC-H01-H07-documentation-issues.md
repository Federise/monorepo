# DOC-H01 through DOC-H07: Documentation Issues

## Issue Summary

Documentation issues related to deprecated terminology, unresolved architectural conflicts, and documented vulnerabilities.

---

## DOC-H01: Legacy "principal" terminology
- **File**: `docs/identity-auth-requirements.md` (lines 18-20)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Documentation still uses deprecated "principal" terminology

### Fix Plan
1. Search for all "principal" references
2. Replace with "identity"
3. Update diagrams if any

```bash
grep -rn "principal" docs/ requirements/
```

---

## DOC-H02: Unresolved Principal vs Identity conflict
- **File**: `docs/ARCHITECTURAL-REVIEW.md` (lines 74-119)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Documents unresolved issue where two parallel systems exist

### Fix Plan
1. Resolve the conflict (identity is the term)
2. Remove references to dual systems
3. Update architecture docs

---

## DOC-H03: Future docs describe fundamental flaws
- **File**: `future/identity-and-auth.md` (lines 1-50)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Documents "Identity = API Key" model, no invitation flow, all-or-nothing access

### Fix Plan
1. Review if flaws have been fixed
2. Update to reflect current state
3. Or add "RESOLVED" annotations

---

## DOC-H04: Unresolved security vulnerabilities documented
- **File**: `future/auth.md` (lines 7-10)
- **Guideline Violated**: Multiple security constraints
- **Description**: Lists SEC-001 through SEC-005 as unresolved

### Fix Plan
1. Cross-reference with DOC-003 critical issue
2. Either fix vulnerabilities or document mitigations
3. Track resolution status

---

## DOC-H05: Multi-identity vault unimplemented
- **File**: `docs/plans/multi-identity-vault.md` (lines 23-28)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Documents credential overwriting vulnerability in ClaimFlow

### Fix Plan
1. Check if vault is now implemented
2. Update doc to reflect current state
3. Or track as known issue

---

## DOC-H06: Test docs use deprecated terminology
- **File**: `requirements/TESTING.md` (lines 114-127)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Tests use deprecated "principal" terminology

### Fix Plan
1. Update test documentation
2. Align with identity terminology
3. Update test code if needed

---

## DOC-H07: Guidelines audit documents 40+ violations
- **File**: `docs/GUIDELINES-AUDIT.md`
- **Note**: This file itself documents the violations (this audit)

### Fix Plan
This is the audit file. Resolution is fixing the issues and updating the audit status.

---

## Implementation Plan

### Phase 1: Terminology Cleanup (Quick Wins)
1. Replace "principal" with "identity" everywhere
2. Update diagrams
3. Update examples

### Phase 2: Architectural Clarity
1. Resolve principal vs identity conflict decisively
2. Document current architecture clearly
3. Remove references to deprecated designs

### Phase 3: Vulnerability Documentation
1. For each SEC-xxx:
   - If fixed: Document as resolved
   - If not fixed: Track in issue tracker, remove from public docs
   - If accepted risk: Document mitigation

### Phase 4: Plan Status Updates
1. Review all docs in `future/` and `docs/plans/`
2. Mark implemented items as done
3. Archive obsolete plans

---

## Terminology Migration

| Old Term | New Term |
|----------|----------|
| principal | identity |
| principalId | identityId |
| getPrincipal | getIdentity |
| PrincipalType | IdentityType |

### Search and Replace Commands
```bash
# Find all occurrences
grep -rn "principal" docs/ requirements/ future/

# Careful replacement (review each)
sed -i 's/principal/identity/g' docs/*.md
sed -i 's/Principal/Identity/g' docs/*.md
sed -i 's/principalId/identityId/g' docs/*.md
```

---

## Testing Checklist

### Terminology Tests
- [ ] No "principal" in public docs
- [ ] Identity terminology consistent
- [ ] Examples use correct terms

### Architecture Tests
- [ ] No conflicting architecture descriptions
- [ ] Single source of truth for design
- [ ] Diagrams match text

### Vulnerability Doc Tests
- [ ] No unresolved vulnerabilities in public docs
- [ ] Fixed issues marked as resolved
- [ ] Known issues tracked appropriately

---

## Related Issues
- SDK-H01: Backwards compatibility code
- GW-H01: Backwards compatibility for isPublic

---

## Notes
- Documentation cleanup is lower risk
- Can be done incrementally
- Consider doc review in PR process
- Automate terminology checks
