#!/usr/bin/env -S deno run -A
/**
 * Federise Gateway Deployment Script
 *
 * Idempotent deployment script for Cloudflare Workers.
 * Handles resource provisioning (KV, R2) and worker deployment.
 *
 * Usage:
 *   deno run -A scripts/deploy.ts           # Full deployment
 *   deno run -A scripts/deploy.ts --code-only  # Deploy code only
 *   deno run -A scripts/deploy.ts --status     # Show current state
 *   deno run -A scripts/deploy.ts --destroy    # Destroy all resources
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

// Configuration
const CONFIG = {
  workerName: "federise-gateway",
  kvNamespaceName: "federise-kv",
  r2PrivateBucket: "federise-private",
  r2PublicBucket: "federise-public",
  stateFile: ".federise-state.json",
  templateFile: "wrangler.template.jsonc",
  outputFile: "wrangler.json",
};

// State file structure
interface DeploymentState {
  environment: string;
  kv_namespace_id: string;
  r2_private_bucket: string;
  r2_public_bucket: string;
  worker_name: string;
  bootstrap_api_key?: string;
  deployed_at?: string;
}

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: string) {
  console.log(`\n${colors.cyan}==> ${step}${colors.reset}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}    ✓ ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}    ! ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}    ✗ ${message}${colors.reset}`);
}

// Execute wrangler command and return JSON output
async function wrangler(args: string[], options: { json?: boolean; silent?: boolean } = {}): Promise<{
  success: boolean;
  output: string;
  // deno-lint-ignore no-explicit-any
  json?: any;
}> {
  const cmd = new Deno.Command("npx", {
    args: ["wrangler", ...args],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  const errorOutput = new TextDecoder().decode(stderr);

  if (code !== 0 && !options.silent) {
    log(`Command failed: wrangler ${args.join(" ")}`, colors.red);
    if (errorOutput) console.error(errorOutput);
  }

  // deno-lint-ignore no-explicit-any
  let jsonResult: any;
  if (options.json && output) {
    try {
      jsonResult = JSON.parse(output);
    } catch {
      // Not JSON, that's fine
    }
  }

  return {
    success: code === 0,
    output: output + errorOutput,
    json: jsonResult,
  };
}

// Load existing state
async function loadState(): Promise<DeploymentState | null> {
  try {
    const content = await Deno.readTextFile(CONFIG.stateFile);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Save state
async function saveState(state: DeploymentState): Promise<void> {
  await Deno.writeTextFile(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

// Check if wrangler is authenticated
async function checkAuth(): Promise<boolean> {
  const result = await wrangler(["whoami"], { silent: true });
  return result.success && !result.output.includes("not authenticated");
}

// List KV namespaces
interface KVNamespace {
  id: string;
  title: string;
}

async function listKVNamespaces(): Promise<KVNamespace[]> {
  const result = await wrangler(["kv", "namespace", "list"]);

  // Debug: show raw output
  if (result.output) {
    log(`    Debug: kv list output: ${result.output.slice(0, 500)}`, colors.dim);
  }

  if (result.success && result.output) {
    try {
      // Output is JSON array by default
      const parsed = JSON.parse(result.output.trim());
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, try to parse text output
      // Format: "id: xxx, title: yyy"
      const namespaces: KVNamespace[] = [];
      const lines = result.output.split("\n");
      for (const line of lines) {
        const idMatch = line.match(/id[:\s]+([a-f0-9]+)/i);
        const titleMatch = line.match(/title[:\s]+["']?([^"'\n,]+)/i);
        if (idMatch) {
          namespaces.push({
            id: idMatch[1],
            title: titleMatch?.[1] || "",
          });
        }
      }
      return namespaces;
    }
  }
  return [];
}

// Create KV namespace
async function createKVNamespace(name: string): Promise<string | null> {
  const result = await wrangler(["kv", "namespace", "create", name]);

  // Debug: show raw output
  if (result.output) {
    log(`    Debug: wrangler output: ${result.output.slice(0, 500)}`, colors.dim);
  }

  if (result.success && result.output) {
    // Parse output like: "Add the following to your configuration file..."
    // or "🌀 Creating namespace with title "federise-kv"" followed by id
    const idMatch = result.output.match(/id\s*[=:]\s*["']?([a-f0-9]+)["']?/i);
    if (idMatch) {
      return idMatch[1];
    }
    // Also try JSON parsing
    try {
      const parsed = JSON.parse(result.output.trim());
      if (parsed.id) return parsed.id;
    } catch {
      // Not JSON
    }
  }
  return null;
}

// List R2 buckets
interface R2Bucket {
  name: string;
  creation_date?: string;
}

async function listR2Buckets(): Promise<R2Bucket[]> {
  const result = await wrangler(["r2", "bucket", "list"]);
  if (result.success && result.output) {
    try {
      // Try JSON parsing first
      const parsed = JSON.parse(result.output.trim());
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Parse text output - buckets are listed one per line
      const buckets: R2Bucket[] = [];
      const lines = result.output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and header lines
        if (trimmed && !trimmed.startsWith("name") && !trimmed.includes("─")) {
          // Could be "bucket-name" or "bucket-name  2024-01-01"
          const parts = trimmed.split(/\s+/);
          if (parts[0]) {
            buckets.push({
              name: parts[0],
              creation_date: parts[1],
            });
          }
        }
      }
      return buckets;
    }
  }
  return [];
}

// Create R2 bucket (returns true if created or already exists)
async function createR2Bucket(name: string): Promise<boolean> {
  const result = await wrangler(["r2", "bucket", "create", name], { silent: true });
  if (result.success) {
    return true;
  }
  // Check if bucket already exists (error code 10004)
  if (result.output.includes("already exists") || result.output.includes("10004")) {
    return true;
  }
  // Log the actual error for other failures
  log(`    Error creating bucket: ${result.output}`, colors.red);
  return false;
}

// CORS configuration for R2 buckets (enables presigned URL uploads from browsers)
const R2_CORS_CONFIG = {
  rules: [
    {
      allowed: {
        methods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        origins: ["*"],
        headers: ["content-type", "content-length", "x-amz-*"],
      },
      exposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      maxAgeSeconds: 3600,
    },
  ],
};

// Configure CORS on R2 bucket
async function configureR2Cors(bucketName: string): Promise<boolean> {
  // Write CORS config to temp file
  const tempFile = await Deno.makeTempFile({ suffix: ".json" });
  try {
    await Deno.writeTextFile(tempFile, JSON.stringify(R2_CORS_CONFIG));
    const result = await wrangler(["r2", "bucket", "cors", "set", bucketName, `--file=${tempFile}`], { silent: true });
    return result.success;
  } finally {
    try {
      await Deno.remove(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Generate secure API key
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate wrangler.json from template
async function generateWranglerConfig(state: DeploymentState): Promise<void> {
  let template: string;
  try {
    template = await Deno.readTextFile(CONFIG.templateFile);
  } catch {
    // No template, create a basic one
    template = JSON.stringify(
      {
        $schema: "node_modules/wrangler/config-schema.json",
        name: "{{WORKER_NAME}}",
        main: "src/index.ts",
        compatibility_date: "2025-02-04",
        observability: { enabled: true },
        kv_namespaces: [{ binding: "KV", id: "{{KV_NAMESPACE_ID}}" }],
        r2_buckets: [
          { binding: "R2", bucket_name: "{{R2_PRIVATE_BUCKET}}" },
          { binding: "R2_PUBLIC", bucket_name: "{{R2_PUBLIC_BUCKET}}" },
        ],
        vars: {
          BOOTSTRAP_API_KEY: "{{BOOTSTRAP_API_KEY}}",
          R2_PRIVATE_BUCKET: "{{R2_PRIVATE_BUCKET}}",
          R2_PUBLIC_BUCKET: "{{R2_PUBLIC_BUCKET}}",
        },
      },
      null,
      2
    );
  }

  // Replace placeholders
  const config = template
    .replace(/\{\{WORKER_NAME\}\}/g, state.worker_name)
    .replace(/\{\{KV_NAMESPACE_ID\}\}/g, state.kv_namespace_id)
    .replace(/\{\{R2_PRIVATE_BUCKET\}\}/g, state.r2_private_bucket)
    .replace(/\{\{R2_PUBLIC_BUCKET\}\}/g, state.r2_public_bucket)
    .replace(/\{\{BOOTSTRAP_API_KEY\}\}/g, state.bootstrap_api_key || "");

  await Deno.writeTextFile(CONFIG.outputFile, config);
}

// Deploy worker
async function deployWorker(): Promise<boolean> {
  logStep("Deploying worker");
  const result = await wrangler(["deploy", "-c", CONFIG.outputFile]);
  if (result.success) {
    logSuccess("Worker deployed successfully");
  } else {
    logError("Worker deployment failed");
  }
  return result.success;
}

// Show current status
async function showStatus(): Promise<void> {
  logStep("Current deployment status");

  const state = await loadState();
  if (!state) {
    logWarning("No deployment state found. Run deploy first.");
    return;
  }

  console.log(`
  Environment:      ${state.environment}
  Worker:           ${state.worker_name}
  KV Namespace ID:  ${state.kv_namespace_id}
  R2 Private:       ${state.r2_private_bucket}
  R2 Public:        ${state.r2_public_bucket}
  Bootstrap Key:    ${state.bootstrap_api_key ? state.bootstrap_api_key.slice(0, 8) + "..." : "Not set"}
  Last Deployed:    ${state.deployed_at || "Never"}
`);
}

// Destroy all resources
async function destroyResources(): Promise<void> {
  logStep("Destroying resources");

  const state = await loadState();
  if (!state) {
    logWarning("No deployment state found. Nothing to destroy.");
    return;
  }

  console.log(`\n${colors.red}WARNING: This will delete the following resources:${colors.reset}`);
  console.log(`  - Worker: ${state.worker_name}`);
  console.log(`  - KV Namespace: ${state.kv_namespace_id}`);
  console.log(`  - R2 Bucket: ${state.r2_private_bucket}`);
  console.log(`  - R2 Bucket: ${state.r2_public_bucket}`);

  const confirm = prompt("\nType 'destroy' to confirm: ");
  if (confirm !== "destroy") {
    log("Aborted.", colors.yellow);
    return;
  }

  // Delete worker
  log("\nDeleting worker...");
  await wrangler(["delete", "--name", state.worker_name, "--force"], { silent: true });

  // Delete KV namespace
  log("Deleting KV namespace...");
  await wrangler(["kv", "namespace", "delete", "--namespace-id", state.kv_namespace_id, "--force"], { silent: true });

  // Delete R2 buckets
  log("Deleting R2 buckets...");
  await wrangler(["r2", "bucket", "delete", state.r2_private_bucket], { silent: true });
  await wrangler(["r2", "bucket", "delete", state.r2_public_bucket], { silent: true });

  // Remove state file
  try {
    await Deno.remove(CONFIG.stateFile);
  } catch {
    // Ignore
  }

  // Remove generated config
  try {
    await Deno.remove(CONFIG.outputFile);
  } catch {
    // Ignore
  }

  logSuccess("All resources destroyed");
}

// Main deployment function
async function deploy(codeOnly: boolean): Promise<void> {
  log("\n🚀 Federise Gateway Deployment\n", colors.cyan);

  // Check authentication
  logStep("Checking authentication");
  if (!(await checkAuth())) {
    logError("Not authenticated. Run 'wrangler login' first.");
    Deno.exit(1);
  }
  logSuccess("Authenticated with Cloudflare");

  // Load or initialize state
  let state = await loadState();
  const isFirstDeploy = !state;

  if (isFirstDeploy) {
    state = {
      environment: "production",
      kv_namespace_id: "",
      r2_private_bucket: CONFIG.r2PrivateBucket,
      r2_public_bucket: CONFIG.r2PublicBucket,
      worker_name: CONFIG.workerName,
    };
  }

  if (!codeOnly) {
    // Provision KV namespace
    logStep("Provisioning KV namespace");
    const kvNamespaces = await listKVNamespaces();
    const existingKV = kvNamespaces.find((ns) => ns.title === CONFIG.kvNamespaceName);

    if (existingKV) {
      state!.kv_namespace_id = existingKV.id;
      logSuccess(`Using existing KV namespace: ${existingKV.id}`);
    } else {
      const newId = await createKVNamespace(CONFIG.kvNamespaceName);
      if (newId) {
        state!.kv_namespace_id = newId;
        logSuccess(`Created KV namespace: ${newId}`);
      } else {
        logError("Failed to create KV namespace");
        Deno.exit(1);
      }
    }

    // Provision R2 buckets
    logStep("Provisioning R2 buckets");

    // Private bucket - createR2Bucket handles "already exists" gracefully
    if (await createR2Bucket(CONFIG.r2PrivateBucket)) {
      logSuccess(`Private bucket ready: ${CONFIG.r2PrivateBucket}`);
    } else {
      logError(`Failed to provision private bucket: ${CONFIG.r2PrivateBucket}`);
      Deno.exit(1);
    }

    // Public bucket - createR2Bucket handles "already exists" gracefully
    if (await createR2Bucket(CONFIG.r2PublicBucket)) {
      logSuccess(`Public bucket ready: ${CONFIG.r2PublicBucket}`);
    } else {
      logError(`Failed to provision public bucket: ${CONFIG.r2PublicBucket}`);
      Deno.exit(1);
    }

    // Configure CORS on R2 buckets (enables presigned URL uploads from browsers)
    logStep("Configuring R2 CORS for presigned uploads");
    if (await configureR2Cors(CONFIG.r2PrivateBucket)) {
      logSuccess(`Configured CORS on ${CONFIG.r2PrivateBucket}`);
    } else {
      logWarning(`Failed to configure CORS on ${CONFIG.r2PrivateBucket} (presigned uploads may not work)`);
    }
    if (await configureR2Cors(CONFIG.r2PublicBucket)) {
      logSuccess(`Configured CORS on ${CONFIG.r2PublicBucket}`);
    } else {
      logWarning(`Failed to configure CORS on ${CONFIG.r2PublicBucket} (presigned uploads may not work)`);
    }

    // Generate bootstrap API key on first deploy
    if (isFirstDeploy && !state!.bootstrap_api_key) {
      logStep("Generating bootstrap API key");
      state!.bootstrap_api_key = generateApiKey();
      logSuccess("Generated new bootstrap API key");
      log(`\n${colors.yellow}    IMPORTANT: Save this key - it will only be shown once!${colors.reset}`);
      log(`    ${colors.green}${state!.bootstrap_api_key}${colors.reset}\n`);
    }
  } else {
    // Code-only deployment - ensure state exists
    if (!state || !state.kv_namespace_id) {
      logError("No deployment state found. Run full deployment first.");
      Deno.exit(1);
    }
    logSuccess("Using existing resource configuration");
  }

  // Generate wrangler config
  logStep("Generating wrangler configuration");
  await generateWranglerConfig(state!);
  logSuccess(`Generated ${CONFIG.outputFile}`);

  // Deploy worker
  const deploySuccess = await deployWorker();
  if (!deploySuccess) {
    Deno.exit(1);
  }

  // Update state with deployment time
  state!.deployed_at = new Date().toISOString();
  await saveState(state!);

  // Summary
  log("\n✅ Deployment complete!\n", colors.green);
  console.log(`  Worker URL: https://${state!.worker_name}.<your-subdomain>.workers.dev`);
  if (isFirstDeploy) {
    console.log(`  Bootstrap Key: ${state!.bootstrap_api_key}`);
    console.log(`\n  Test with:`);
    console.log(`  curl https://${state!.worker_name}.<your-subdomain>.workers.dev/ping \\`);
    console.log(`    -H "Authorization: ApiKey ${state!.bootstrap_api_key}"`);
  }
  console.log();
}

// Main
async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["code-only", "status", "destroy", "help"],
    alias: {
      h: "help",
      c: "code-only",
      s: "status",
      d: "destroy",
    },
  });

  if (args.help) {
    console.log(`
Federise Gateway Deployment Script

Usage:
  deno run -A scripts/deploy.ts [options]

Options:
  --code-only, -c   Deploy code only (skip resource provisioning)
  --status, -s      Show current deployment status
  --destroy, -d     Destroy all resources (with confirmation)
  --help, -h        Show this help message

Examples:
  deno run -A scripts/deploy.ts              # Full deployment
  deno run -A scripts/deploy.ts --code-only  # Redeploy code only
  deno run -A scripts/deploy.ts --status     # Show status
`);
    Deno.exit(0);
  }

  if (args.status) {
    await showStatus();
    Deno.exit(0);
  }

  if (args.destroy) {
    await destroyResources();
    Deno.exit(0);
  }

  await deploy(args["code-only"]);
}

main().catch((err) => {
  logError(`Deployment failed: ${err.message}`);
  Deno.exit(1);
});
