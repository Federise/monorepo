import { WebContainer } from '@webcontainer/api';
import { webcontainerStore } from '../stores/webcontainer.svelte.js';
import { mountGatewayFiles } from './filesystem.js';

let bootPromise: Promise<WebContainer> | null = null;

export async function bootWebContainer(): Promise<WebContainer> {
  // Return existing instance if already booted
  if (webcontainerStore.instance) {
    return webcontainerStore.instance;
  }

  // Return existing boot promise if in progress
  if (bootPromise) {
    return bootPromise;
  }

  webcontainerStore.setBooting(true);
  webcontainerStore.setError(null);

  bootPromise = (async () => {
    try {
      // Check for cross-origin isolation
      if (!crossOriginIsolated) {
        throw new Error(
          'Cross-origin isolation is required for WebContainers. ' +
            'Ensure COOP and COEP headers are set correctly.'
        );
      }

      // Boot the WebContainer
      const instance = await WebContainer.boot();

      // Mount gateway files
      await mountGatewayFiles(instance);

      webcontainerStore.setInstance(instance);

      return instance;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to boot WebContainer';
      webcontainerStore.setError(message);
      bootPromise = null;
      throw error;
    }
  })();

  return bootPromise;
}

export function getWebContainer(): WebContainer {
  const instance = webcontainerStore.instance;
  if (!instance) {
    throw new Error('WebContainer not initialized. Call bootWebContainer() first.');
  }
  return instance;
}
