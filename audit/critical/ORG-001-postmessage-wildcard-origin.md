# ORG-001: Unsafe postMessage origin in FrameEnforcer

## Issue Summary
- **Severity**: CRITICAL
- **File**: `apps/org/src/components/FrameEnforcer.svelte` (lines 84, 147, 188)
- **Guideline Violated**: "Principle of least privilege"

## Description
Frame uses `postMessage()` with wildcard origin (`'*'`). Attacker could potentially intercept or spoof messages.

## Impact
- Message interception by malicious iframes
- Credential theft via spoofed messages
- Cross-origin attack vector

---

## Current State Analysis

### What to Test Before Changes
- [ ] Find all postMessage calls with '*' origin
- [ ] Understand why wildcard was used
- [ ] Identify what messages are sent with wildcard
- [ ] Determine the expected parent origins
- [ ] Check if origin is available at message time

### Commands to Test Current State
```bash
# Find postMessage with wildcard
grep -rn "postMessage.*'\*'\|postMessage.*\"\*\"" apps/org/src/

# Find all postMessage calls
grep -rn "postMessage" apps/org/src/

# Check FrameEnforcer specifically
cat apps/org/src/components/FrameEnforcer.svelte
```

---

## Possible Approaches

### Approach A: Track and Validate Parent Origin (Recommended)
**Description**: Store the origin of incoming messages and only respond to that origin.

**Pros**:
- Precise origin targeting
- Works with multiple parent apps
- Standard security pattern

**Cons**:
- Need to track origin per conversation
- Slightly more complex state management

**Effort**: Medium

### Approach B: Allowlist of Known Origins
**Description**: Define an allowlist of valid parent origins, only post to those.

**Pros**:
- Simple to implement
- Clear security boundary

**Cons**:
- Requires knowing all valid origins upfront
- Hard to support dynamic/unknown apps
- Breaks extensibility model

**Effort**: Low

### Approach C: Origin from URL Parameters
**Description**: Get expected parent origin from URL parameters, validate and use.

**Pros**:
- Flexible
- App specifies its own origin

**Cons**:
- Origin can be spoofed in URL
- Additional validation needed
- Security depends on URL integrity

**Effort**: Low-Medium

---

## Recommended Approach

**Approach A: Track and Validate Parent Origin**

When a message is received, capture its origin. Use that captured origin for all responses in that conversation. This is the standard pattern for secure postMessage communication.

---

## Implementation Plan

### Step 1: Audit Current postMessage Usage
1. List all postMessage calls in FrameEnforcer
2. Document what each message contains
3. Identify which need origin restriction

### Step 2: Implement Origin Tracking
1. Create state variable to store parent origin
2. On first message received, capture `event.origin`
3. Validate origin is a valid URL

### Step 3: Update postMessage Calls
1. Replace `'*'` with tracked origin
2. Handle case where origin not yet known
3. Queue messages if needed until origin established

### Step 4: Add Origin Validation
1. Validate origin format (proper URL)
2. Optionally validate against protocol (https only in prod)
3. Log invalid origin attempts

### Step 5: Update Message Handler
1. Verify incoming message origin matches tracked origin
2. Reject messages from unexpected origins
3. Handle origin change scenarios

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Identify all postMessage(..., '*') calls
- [ ] Test message interception from other origins
- [ ] Document current message flow
- [ ] Verify security issue exists

### Implementation Tests
- [ ] Unit test for origin tracking
- [ ] Test postMessage uses correct origin
- [ ] Test rejection of cross-origin messages
- [ ] Test origin validation logic

### Post-Implementation Tests (New State)
- [ ] No postMessage calls use '*'
- [ ] Messages only sent to verified origin
- [ ] Malicious origins cannot intercept
- [ ] Legitimate apps still work

### Regression Tests
- [ ] Frame communication still works
- [ ] Permission grants work
- [ ] Channel operations work
- [ ] Multi-tab scenarios work
- [ ] Popup-based flows work
- [ ] Demo app can still connect
- [ ] All SDK operations through frame work

---

## Implementation Code

```svelte
<script lang="ts">
  let parentOrigin: string | null = null;

  function handleMessage(event: MessageEvent) {
    // Capture origin on first message
    if (!parentOrigin) {
      // Validate origin format
      try {
        new URL(event.origin);
        parentOrigin = event.origin;
      } catch {
        console.error('Invalid origin:', event.origin);
        return;
      }
    }

    // Reject messages from different origins
    if (event.origin !== parentOrigin) {
      console.error('Origin mismatch:', event.origin, 'expected:', parentOrigin);
      return;
    }

    // Process message...
  }

  function sendToParent(message: unknown) {
    if (!parentOrigin) {
      console.error('Cannot send message: parent origin not established');
      return;
    }

    // Use specific origin instead of '*'
    window.parent.postMessage(message, parentOrigin);
  }
</script>
```

---

## Security Considerations

### Valid Origin Patterns
```typescript
function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    // In production, might want to enforce https
    // if (url.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}
```

### Origin vs Source
- `event.origin`: The origin of the sending window
- `event.source`: Reference to the sending window
- Both should be validated for secure communication

---

## Related Issues
- ORG-002: ClaimFlow accepts arbitrary share payloads
- ORG-H01: Missing origin validation in AuthorizeFlow

---

## Notes
- This is a fundamental security fix
- Test thoroughly with actual apps
- Consider logging for security monitoring
- May need to handle edge cases (null origin, etc.)
