# Frame Test Harness

Test harness for the Federise `/frame` endpoint.

## Purpose

This test app runs on a different origin (port 5174) to properly test cross-origin communication with the `/frame` endpoint (running on port 4321 via Astro dev server).

## Configuration

The test harness uses environment variables for configuration. Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

### Environment Variables

- `VITE_FRAME_URL` - URL of the frame endpoint to test (default: `http://localhost:4321/frame`)

## Running Tests

### Prerequisites

Make sure the Astro dev server is running on port 4321:

```bash
# In the org directory
pnpm dev
```

### Start the Test Harness

```bash
# From the org directory
pnpm test:frame

# Or directly from tests directory
cd tests
pnpm dev
```

Then open http://localhost:5174 in your browser.

## Using the Test UI

- **Run All Tests**: Click the "Run All Tests" button to execute all test cases sequentially
- **Run Individual Test**: Click the "Run" button next to any test to execute just that test
- **Clear Results**: Click "Clear Results" to remove all test output from the results panel

## Test Cases

The harness includes tests for:

1. **SYN/ACK Handshake**: Initial frame connection
2. **Request Capabilities**: Requesting permissions from the frame
3. **KV Operations**: Get, Set, Delete, and List operations (with and without permissions)
4. **Invalid Messages**: Error handling for malformed requests
5. **Sequential Messages**: Multiple messages in sequence
6. **Message ID Uniqueness**: Verifying unique message correlation IDs
7. **Permission Testing**: Grant, use, and clear permissions programmatically

## Adding New Tests

Edit `src/tests.ts` and add a new test object to the array returned by `defineTests()`:

```typescript
{
  id: 'my-test',
  name: 'My Test Name',
  description: 'What this test does',
  async run(runner: TestRunner) {
    const response = await runner.sendMessage({
      type: 'SOME_TYPE',
      // ... payload
    });

    // Assertions
    if (response.type !== 'EXPECTED_TYPE') {
      throw new Error('Test failed');
    }

    return {
      message: 'Test passed',
      details: { /* optional details */ },
    };
  },
}
```

## Architecture

- **Test Runner**: Manages communication with the frame via postMessage
- **Test Definitions**: Individual test cases defined in `src/tests.ts`
- **UI**: Real-time test execution and results display
- **Message Correlation**: Each message gets a unique ID for response matching
- **Timeout Handling**: Tests fail if no response within timeout period

## Testing Against Different Environments

To test against a different frame endpoint, update the `VITE_FRAME_URL` in your `.env` file:

```bash
# Test against production
VITE_FRAME_URL=https://federise.org/frame

# Test against staging
VITE_FRAME_URL=https://staging.federise.org/frame

# Test against local dev (different port)
VITE_FRAME_URL=http://localhost:3000/frame
```

## Test-Only Message Types

For permission testing, the frame must implement these test-only message types:

### TEST_GRANT_PERMISSIONS
Programmatically grants permissions to the test harness origin.

**Request:**
```typescript
{
  type: 'TEST_GRANT_PERMISSIONS',
  capabilities: string[] // e.g., ['kv:read', 'kv:write', 'kv:delete']
}
```

**Response:**
```typescript
{
  type: 'TEST_PERMISSIONS_GRANTED'
}
```

### TEST_CLEAR_PERMISSIONS
Clears all permissions for the test harness origin.

**Request:**
```typescript
{
  type: 'TEST_CLEAR_PERMISSIONS'
}
```

**Response:**
```typescript
{
  type: 'TEST_PERMISSIONS_CLEARED'
}
```

**Security Note:** These message types should only be enabled in development mode and should validate that requests come from `http://localhost:5174` (the test harness origin).
