import * as x509 from "npm:@peculiar/x509";

const CERT_FILE = "federise-cert.pem";
const KEY_FILE = "federise-key.pem";

interface TlsConfig {
  cert: string;
  key: string;
}

/**
 * Ensure TLS certificates exist, generating self-signed ones if needed.
 * Certificates are stored in the specified data directory.
 */
export async function ensureTlsCerts(dataDir: string): Promise<TlsConfig> {
  const certPath = `${dataDir}/${CERT_FILE}`;
  const keyPath = `${dataDir}/${KEY_FILE}`;

  // Check if certs already exist
  try {
    const cert = await Deno.readTextFile(certPath);
    const key = await Deno.readTextFile(keyPath);
    console.log(`Using existing TLS certificates from ${dataDir}`);
    return { cert, key };
  } catch {
    // Certs don't exist, generate them
  }

  console.log("Generating self-signed TLS certificate...");

  // Ensure data directory exists
  await Deno.mkdir(dataDir, { recursive: true });

  // Generate RSA key pair
  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };

  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

  // Create self-signed certificate valid for 1 year
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomUUID().replace(/-/g, ""),
    name: "CN=Federise Gateway,O=Federise,C=US",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: algorithm,
    extensions: [
      // Allow localhost and common local IPs
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: "localhost" },
        { type: "dns", value: "*.localhost" },
        { type: "ip", value: "127.0.0.1" },
        { type: "ip", value: "::1" },
      ]),
      // Mark as CA for self-signed
      new x509.BasicConstraintsExtension(true, undefined, true),
      // Key usage
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
        true
      ),
      // Extended key usage for TLS server
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
    ],
  });

  // Export certificate as PEM
  const certPem = cert.toString("pem");

  // Export private key as PEM
  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const keyPem = [
    "-----BEGIN PRIVATE KEY-----",
    btoa(String.fromCharCode(...new Uint8Array(privateKey)))
      .match(/.{1,64}/g)!
      .join("\n"),
    "-----END PRIVATE KEY-----",
  ].join("\n");

  // Save to files
  await Deno.writeTextFile(certPath, certPem);
  await Deno.writeTextFile(keyPath, keyPem);

  console.log(`TLS certificate generated and saved to ${dataDir}`);
  console.log(`  Certificate: ${certPath}`);
  console.log(`  Private key: ${keyPath}`);

  return { cert: certPem, key: keyPem };
}
