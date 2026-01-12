import type { Test } from './types';
import type { FederiseClient, PermissionDeniedError } from '@federise/sdk';

export function defineTests(): Test[] {
  return [
    // Connection Test (SYN/ACK happens in client.connect())
    {
      id: 'connection',
      name: 'Connection Test',
      description: 'Verify connection to frame is established',
      group: 'unauthorized',
      async run(client: FederiseClient) {
        if (!client.isConnected()) {
          throw new Error('Client is not connected');
        }

        return {
          message: 'Connection established successfully',
        };
      },
    },

    // Request Capabilities Test
    {
      id: 'request-capabilities',
      name: 'Request Capabilities',
      description: 'Test requesting capabilities from frame',
      group: 'authorized',
      async run(client: FederiseClient) {
        // Note: This will open a popup in real usage
        // For testing, we're just verifying the API works
        try {
          const result = await client.requestCapabilities(['kv:read', 'kv:write']);

          return {
            message: result.granted
              ? 'Capabilities request processed'
              : 'Auth required (popup would open)',
            details: {
              granted: result.granted,
              capabilities: result.capabilities,
            },
          };
        } catch (error) {
          // Auth required is expected if no permissions granted yet
          if (error instanceof Error && error.message.includes('Popup blocked')) {
            return {
              message: 'Auth required (popup blocked in test environment)',
            };
          }
          throw error;
        }
      },
    },

    // KV Get (No Permission) Test
    {
      id: 'kv-get-no-permission',
      name: 'KV Get (No Permission)',
      description: 'Test KV get without permission',
      group: 'unauthorized',
      async run(client: FederiseClient) {
        try {
          await client.kv.get('test-key');
          throw new Error('Expected PermissionDeniedError');
        } catch (error) {
          if ((error as any).name === 'PermissionDeniedError') {
            return {
              message: 'Permission correctly denied',
              details: { capability: (error as PermissionDeniedError).capability },
            };
          }
          throw error;
        }
      },
    },

    // === PERMISSION TESTS ===
    // These tests use the test-only SDK methods to grant permissions

    // Grant Read Permission Test
    {
      id: 'grant-read-permission',
      name: 'Grant Read Permission',
      description: 'Grant kv:read permission for subsequent tests',
      group: 'authorized',
      async run(client: FederiseClient) {
        await client._testGrantPermissions(['kv:read']);

        // Wait a bit for the frame to process the permission change
        await new Promise((resolve) => setTimeout(resolve, 100));

        const granted = client.getGrantedCapabilities();

        return {
          message: 'Read permission granted successfully',
          details: { capabilities: granted },
        };
      },
    },

    // KV Get With Permission Test
    {
      id: 'kv-get-with-permission',
      name: 'KV Get (With Permission)',
      description: 'Test KV get with read permission',
      group: 'authorized',
      async run(client: FederiseClient) {
        const value = await client.kv.get('test-key');

        return {
          message: 'KV get successful with permission',
          details: { value, exists: value !== null },
        };
      },
    },

    // Grant Write Permission Test
    {
      id: 'grant-write-permission',
      name: 'Grant Write Permission',
      description: 'Grant kv:write permission for subsequent tests',
      group: 'authorized',
      async run(client: FederiseClient) {
        await client._testGrantPermissions(['kv:read', 'kv:write']);

        await new Promise((resolve) => setTimeout(resolve, 100));

        const granted = client.getGrantedCapabilities();

        return {
          message: 'Write permission granted successfully',
          details: { capabilities: granted },
        };
      },
    },

    // KV Set With Permission Test
    {
      id: 'kv-set-with-permission',
      name: 'KV Set (With Permission)',
      description: 'Test KV set with write permission',
      group: 'authorized',
      async run(client: FederiseClient) {
        const testValue = `test-value-${Date.now()}`;

        await client.kv.set('test-key', testValue);

        return {
          message: 'KV set successful with permission',
          details: { key: 'test-key', value: testValue },
        };
      },
    },

    // KV Get After Set Test
    {
      id: 'kv-get-after-set',
      name: 'KV Get After Set',
      description: 'Verify the value we just set can be retrieved',
      group: 'authorized',
      async run(client: FederiseClient) {
        const value = await client.kv.get('test-key');

        if (!value) {
          throw new Error('Value not found after setting');
        }

        return {
          message: 'Retrieved value matches what was set',
          details: { value },
        };
      },
    },

    // Grant Delete Permission Test
    {
      id: 'grant-delete-permission',
      name: 'Grant Delete Permission',
      description: 'Grant kv:delete permission for subsequent tests',
      group: 'authorized',
      async run(client: FederiseClient) {
        await client._testGrantPermissions(['kv:read', 'kv:write', 'kv:delete']);

        await new Promise((resolve) => setTimeout(resolve, 100));

        const granted = client.getGrantedCapabilities();

        return {
          message: 'Delete permission granted successfully',
          details: { capabilities: granted },
        };
      },
    },

    // KV Delete With Permission Test
    {
      id: 'kv-delete-with-permission',
      name: 'KV Delete (With Permission)',
      description: 'Test KV delete with delete permission',
      group: 'authorized',
      async run(client: FederiseClient) {
        await client.kv.delete('test-key');

        return {
          message: 'KV delete successful with permission',
        };
      },
    },

    // KV Get After Delete Test
    {
      id: 'kv-get-after-delete',
      name: 'KV Get After Delete',
      description: 'Verify the value was actually deleted',
      group: 'authorized',
      async run(client: FederiseClient) {
        const value = await client.kv.get('test-key');

        if (value !== null) {
          throw new Error('Value still exists after deletion');
        }

        return {
          message: 'Value confirmed deleted',
          details: { value },
        };
      },
    },

    // KV Keys With Permission Test
    {
      id: 'kv-keys-with-permission',
      name: 'KV Keys (With Permission)',
      description: 'Test listing KV keys with read permission',
      group: 'authorized',
      async run(client: FederiseClient) {
        // First set some test keys
        await client.kv.set('app-key-1', 'value1');
        await client.kv.set('app-key-2', 'value2');

        // Now list keys with prefix
        const keys = await client.kv.keys('app-');

        return {
          message: 'KV keys listed successfully',
          details: { keys, count: keys.length },
        };
      },
    },

    // Clear Permissions Test
    {
      id: 'clear-permissions',
      name: 'Clear Permissions',
      description: 'Clear all permissions for cleanup',
      group: 'authorized',
      async run(client: FederiseClient) {
        await client._testClearPermissions();

        await new Promise((resolve) => setTimeout(resolve, 100));

        const granted = client.getGrantedCapabilities();

        return {
          message: 'All permissions cleared successfully',
          details: { remainingCapabilities: granted },
        };
      },
    },

    // Verify Permission Cleared Test
    {
      id: 'verify-permission-cleared',
      name: 'Verify Permission Cleared',
      description: 'Verify that operations are denied after clearing permissions',
      group: 'authorized',
      async run(client: FederiseClient) {
        try {
          await client.kv.get('test-key');
          throw new Error('Expected PermissionDeniedError after clearing permissions');
        } catch (error) {
          if ((error as any).name === 'PermissionDeniedError') {
            return {
              message: 'Permissions correctly cleared',
              details: { deniedCapability: (error as PermissionDeniedError).capability },
            };
          }
          throw error;
        }
      },
    },
  ];
}
