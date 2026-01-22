# DOC-L01 through L03: Documentation Polish Issues

## Issue Summary
- **Severity**: LOW
- **Files**: Various docs

---

## Issues

### DOC-L01: Historic research docs with unclear status
Some documents are historical research that may confuse readers about current state.

**Fix Options**:
1. Move to `archive/` folder
2. Add "HISTORICAL" banner
3. Delete if no longer relevant

```markdown
---
status: historical
date: 2024-06-15
note: This document describes research that informed the current design.
      See docs/current-architecture.md for current implementation.
---
```

### DOC-L02: Multiple unresolved design alternatives
Documents present alternatives without indicating which was chosen.

**Fix**: Update documents to show decisions made.

```markdown
## Design Alternatives (RESOLVED)

We evaluated three approaches:
1. Option A: ... ❌ Not chosen - too complex
2. Option B: ... ❌ Not chosen - security concerns
3. **Option C: ... ✅ IMPLEMENTED** - best balance of security and simplicity
```

### DOC-L03: Stale future/ documents
The `future/` directory may contain outdated plans.

**Fix**:
1. Review each document
2. Mark as implemented, obsolete, or still planned
3. Move implemented items to main docs

---

## Implementation Plan

### Step 1: Documentation Inventory
```markdown
| File | Status | Action |
|------|--------|--------|
| future/auth.md | ? | Review |
| future/identity.md | ? | Review |
| ... | | |
```

### Step 2: Apply Status Labels
Add frontmatter to each doc indicating status.

### Step 3: Reorganize
1. Archive historical docs
2. Move implemented plans to docs
3. Delete obsolete content

---

## Testing Checklist

### Status Tests
- [ ] All docs have clear status
- [ ] Historical docs marked
- [ ] Current docs accurate

### Organization Tests
- [ ] Directory structure logical
- [ ] No confusion about current vs planned

---

## Notes
- Low priority cleanup
- Do during documentation sprints
- Consider automated doc status checking
