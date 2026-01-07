import type { WebContainer, FileSystemTree } from '@webcontainer/api';
import { getGatewayFiles } from '../gateway-files/index.js';

export async function mountGatewayFiles(container: WebContainer): Promise<void> {
  const files = getGatewayFiles();
  await container.mount(files);
}

export async function updateWranglerConfig(
  container: WebContainer,
  kvNamespaceId: string
): Promise<void> {
  // Read the current wrangler.jsonc
  const content = await container.fs.readFile('wrangler.jsonc', 'utf-8');

  // Replace the placeholder KV namespace ID
  const updated = content.replace(
    /"id":\s*"YOUR_KV_NAMESPACE_ID"/,
    `"id": "${kvNamespaceId}"`
  );

  // Write back
  await container.fs.writeFile('wrangler.jsonc', updated);
}

export function createFileSystemTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      const entry = current[part];
      if ('directory' in entry) {
        current = entry.directory;
      }
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }

  return tree;
}
