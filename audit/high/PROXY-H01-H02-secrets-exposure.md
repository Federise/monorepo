# PROXY-H01 & PROXY-H02: Gateway URLs and Credentials Exposure

## Issue Summary

### PROXY-H01: groupByGateway() exposes gateway URLs as object keys
- **Severity**: HIGH
- **File**: `packages/proxy/src/router.ts`
- **Guideline Violated**: "Third party apps never see gateway endpoints"

### PROXY-H02: Plaintext localStorage credential storage
- **Severity**: HIGH
- **File**: `packages/proxy/src/vault/`
- **Guideline Violated**: "No secrets in client-side code"

---

## PROXY-H01: Gateway URLs as Object Keys

### Description
Internal function `groupByGateway()` uses gateway URLs as object keys. If this object is ever serialized or logged, URLs leak.

### Current State Analysis
- [ ] Review groupByGateway() implementation
- [ ] Check if result is ever exposed
- [ ] Trace data flow for URL object
- [ ] Check for serialization/logging

### Commands
```bash
grep -rn "groupByGateway" packages/proxy/src/
grep -rn "gateway" packages/proxy/src/router.ts
```

### Fix Plan
1. If internal only and never exposed, document as safe
2. If exposed, change to use obfuscated/hashed keys
3. Review all logging of gateway-related data

---

## PROXY-H02: Plaintext localStorage Storage

### Description
Credentials (API keys, tokens) stored in localStorage without encryption. XSS can steal credentials.

### Impact
- Credential theft via XSS
- Session hijacking
- Complete account compromise

### Current State Analysis
- [ ] Review vault storage implementation
- [ ] Check what credentials are stored
- [ ] Verify they're plaintext
- [ ] Assess XSS risk in context

### Commands
```bash
cat packages/proxy/src/vault/
grep -rn "localStorage\|storage" packages/proxy/src/
grep -rn "encrypt\|decrypt" packages/proxy/src/
```

---

## Possible Approaches

### Approach A: Encrypt at Rest (Recommended for H02)
**Description**: Encrypt credentials before storing in localStorage.

**Pros**:
- Protects against simple XSS
- Industry practice

**Cons**:
- Key management challenge
- Still accessible to sophisticated XSS

**Effort**: Medium

### Approach B: Use sessionStorage + Memory
**Description**: Keep credentials in memory, session only.

**Pros**:
- Shorter exposure window
- Cleared on tab close

**Cons**:
- Re-auth needed per session
- Worse UX

**Effort**: Low-Medium

### Approach C: HttpOnly Cookies
**Description**: Store tokens in httpOnly cookies.

**Pros**:
- Not accessible to JavaScript
- Best XSS protection

**Cons**:
- CSRF concerns
- Requires same-origin setup

**Effort**: High

---

## Recommended Approach

**Approach A: Encrypt at Rest** as practical middle ground.

Full protection requires architectural changes (cookies), but encryption provides significant improvement.

---

## Implementation Plan for PROXY-H02

### Step 1: Create Encryption Module
```typescript
// packages/proxy/src/vault/crypto.ts
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptCredential(
  plaintext: string,
  password: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptCredential(
  encrypted: string,
  password: string
): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}
```

### Step 2: Update Vault Storage
```typescript
export function createVaultStorage(storage: Storage, password: string) {
  return {
    async add(credential: Credential): Promise<void> {
      const encrypted = await encryptCredential(JSON.stringify(credential), password);
      const all = await this.getAll();
      all.push(credential);
      storage.setItem('vault', await encryptCredential(JSON.stringify(all), password));
    },

    async getAll(): Promise<Credential[]> {
      const encrypted = storage.getItem('vault');
      if (!encrypted) return [];
      const decrypted = await decryptCredential(encrypted, password);
      return JSON.parse(decrypted);
    }
  };
}
```

### Step 3: Key Management
1. Derive from user secret (password/PIN)
2. Or use device-bound key
3. Document security model

---

## Testing Checklist

### PROXY-H01 Tests
- [ ] groupByGateway result never logged
- [ ] Result never serialized to client
- [ ] No gateway URL exposure found

### PROXY-H02 Pre-Implementation Tests
- [ ] Verify credentials are plaintext
- [ ] Identify what's stored
- [ ] Document current format

### PROXY-H02 Implementation Tests
- [ ] Encryption works correctly
- [ ] Decryption recovers original
- [ ] Wrong password fails gracefully

### PROXY-H02 Post-Implementation Tests
- [ ] localStorage shows encrypted data
- [ ] Credentials still usable
- [ ] Migration works

### Regression Tests
- [ ] Vault operations work
- [ ] Add/remove credentials works
- [ ] Auth flow works
- [ ] Multi-identity works

---

## Security Limitations

Even with encryption:
- Key must be in memory for decryption
- Sophisticated XSS can wait for decryption
- User-provided password can be weak

For highest security, consider:
- Hardware security keys (WebAuthn)
- Backend session management
- Time-limited tokens

---

## Related Issues
- DOC-003: Security vulnerabilities documented
- TEST-H01: Gateway API key in localStorage

---

## Notes
- Encryption is defense-in-depth
- Document security model clearly
- Consider user-provided encryption password
- May need migration for existing users
