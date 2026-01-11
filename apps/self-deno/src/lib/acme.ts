/**
 * ACME Client for Let's Encrypt Certificates
 *
 * Automatically provisions and renews TLS certificates using the ACME protocol.
 * Uses HTTP-01 challenge for domain validation.
 */

import * as acme from "npm:acme-client@5";

const ACCOUNT_KEY_FILE = "acme-account-key.pem";
const CERT_FILE = "acme-cert.pem";
const KEY_FILE = "acme-key.pem";
const CERT_INFO_FILE = "acme-cert-info.json";

// Renew certificates 30 days before expiry
const RENEWAL_THRESHOLD_DAYS = 30;

interface CertInfo {
  domain: string;
  issuedAt: string;
  expiresAt: string;
}

interface TlsConfig {
  cert: string;
  key: string;
}

interface AcmeOptions {
  domain: string;
  email?: string;
  dataDir: string;
  staging?: boolean; // Use staging environment for testing
}

// Store pending challenges for HTTP-01 validation
const pendingChallenges = new Map<string, string>();

/**
 * Get the HTTP-01 challenge response for a given token.
 * This is called by the challenge server.
 */
export function getChallengeResponse(token: string): string | undefined {
  return pendingChallenges.get(token);
}

/**
 * Check if there are any pending challenges.
 */
export function hasPendingChallenges(): boolean {
  return pendingChallenges.size > 0;
}

/**
 * Load existing certificate if valid, or obtain a new one from Let's Encrypt.
 */
export async function ensureAcmeCertificate(options: AcmeOptions): Promise<TlsConfig> {
  const { domain, email, dataDir, staging = false } = options;

  const certPath = `${dataDir}/${CERT_FILE}`;
  const keyPath = `${dataDir}/${KEY_FILE}`;
  const infoPath = `${dataDir}/${CERT_INFO_FILE}`;

  // Check if we have a valid existing certificate
  try {
    const cert = await Deno.readTextFile(certPath);
    const key = await Deno.readTextFile(keyPath);
    const infoText = await Deno.readTextFile(infoPath);
    const info: CertInfo = JSON.parse(infoText);

    // Check if certificate is for the right domain
    if (info.domain !== domain) {
      console.log(`Certificate is for ${info.domain}, but we need ${domain}. Obtaining new certificate...`);
    } else {
      // Check if certificate needs renewal
      const expiresAt = new Date(info.expiresAt);
      const renewalDate = new Date(expiresAt.getTime() - RENEWAL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

      if (new Date() < renewalDate) {
        console.log(`Using existing Let's Encrypt certificate for ${domain}`);
        console.log(`  Expires: ${expiresAt.toISOString()}`);
        return { cert, key };
      }

      console.log(`Certificate expires soon (${expiresAt.toISOString()}). Renewing...`);
    }
  } catch {
    console.log(`No existing certificate found. Obtaining new certificate for ${domain}...`);
  }

  // Obtain new certificate
  return await obtainCertificate(options);
}

/**
 * Obtain a new certificate from Let's Encrypt.
 */
async function obtainCertificate(options: AcmeOptions): Promise<TlsConfig> {
  const { domain, email, dataDir, staging = false } = options;

  const accountKeyPath = `${dataDir}/${ACCOUNT_KEY_FILE}`;
  const certPath = `${dataDir}/${CERT_FILE}`;
  const keyPath = `${dataDir}/${KEY_FILE}`;
  const infoPath = `${dataDir}/${CERT_INFO_FILE}`;

  // Ensure data directory exists
  await Deno.mkdir(dataDir, { recursive: true });

  // Load or create account key
  let accountKey: string;
  try {
    accountKey = await Deno.readTextFile(accountKeyPath);
    console.log("Using existing ACME account key");
  } catch {
    console.log("Generating new ACME account key...");
    accountKey = (await acme.crypto.createPrivateKey()).toString();
    await Deno.writeTextFile(accountKeyPath, accountKey);
  }

  // Create ACME client
  const directoryUrl = staging
    ? acme.directory.letsencrypt.staging
    : acme.directory.letsencrypt.production;

  console.log(`Using Let's Encrypt ${staging ? "staging" : "production"} environment`);

  const client = new acme.Client({
    directoryUrl,
    accountKey,
  });

  // Create account (or retrieve existing)
  console.log("Registering ACME account...");
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: email ? [`mailto:${email}`] : undefined,
  });

  // Generate certificate key
  console.log("Generating certificate key pair...");
  const [certKey, csr] = await acme.crypto.createCsr({
    altNames: [domain],
  });

  // Order certificate
  console.log(`Ordering certificate for ${domain}...`);
  const cert = await client.auto({
    csr,
    email,
    termsOfServiceAgreed: true,
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      if (challenge.type === "http-01") {
        console.log(`Setting up HTTP-01 challenge for ${authz.identifier.value}`);
        console.log(`  Token: ${challenge.token}`);
        pendingChallenges.set(challenge.token, keyAuthorization);
      }
    },
    challengeRemoveFn: async (authz, challenge) => {
      if (challenge.type === "http-01") {
        console.log(`Cleaning up HTTP-01 challenge for ${authz.identifier.value}`);
        pendingChallenges.delete(challenge.token);
      }
    },
    challengePriority: ["http-01"],
  });

  // Parse certificate to get expiry date
  const certInfo = await acme.crypto.readCertificateInfo(cert);
  const expiresAt = certInfo.notAfter;

  // Save certificate, key, and info
  const keyPem = certKey.toString();
  await Deno.writeTextFile(certPath, cert);
  await Deno.writeTextFile(keyPath, keyPem);
  await Deno.writeTextFile(
    infoPath,
    JSON.stringify(
      {
        domain,
        issuedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      } satisfies CertInfo,
      null,
      2
    )
  );

  console.log(`Certificate obtained successfully!`);
  console.log(`  Domain: ${domain}`);
  console.log(`  Expires: ${expiresAt.toISOString()}`);

  return { cert, key: keyPem };
}

/**
 * Create an HTTP server on port 80 for ACME HTTP-01 challenges.
 * This server only responds to /.well-known/acme-challenge/ requests.
 * All other requests are redirected to HTTPS.
 */
export function startChallengeServer(httpsPort: number): Deno.HttpServer {
  console.log("Starting HTTP challenge server on port 80...");

  return Deno.serve({ port: 80 }, (req) => {
    const url = new URL(req.url);

    // Handle ACME challenges
    if (url.pathname.startsWith("/.well-known/acme-challenge/")) {
      const token = url.pathname.split("/").pop() || "";
      const response = getChallengeResponse(token);

      if (response) {
        console.log(`Serving ACME challenge for token: ${token}`);
        return new Response(response, {
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("Challenge not found", { status: 404 });
    }

    // Redirect all other requests to HTTPS
    const httpsUrl = new URL(req.url);
    httpsUrl.protocol = "https:";
    httpsUrl.port = httpsPort === 443 ? "" : String(httpsPort);

    return Response.redirect(httpsUrl.toString(), 301);
  });
}
