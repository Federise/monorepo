import type { FederiseClient } from '@federise/sdk';
import type { Test, TestResult } from './types';

export class TestRunner {
  private client: FederiseClient;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(client: FederiseClient) {
    this.client = client;
  }

  async runTest(test: Test): Promise<void> {
    const startTime = Date.now();

    // Emit pending result
    this.emit('result', {
      testId: test.id,
      testName: test.name,
      status: 'pending',
      startTime,
      message: 'Starting test...',
    } as TestResult);

    // Emit running result
    this.emit('result', {
      testId: test.id,
      testName: test.name,
      status: 'running',
      startTime,
      message: 'Running test...',
    } as TestResult);

    try {
      const result = await test.run(this.client);
      const endTime = Date.now();

      this.emit('result', {
        testId: test.id,
        testName: test.name,
        status: 'success',
        startTime,
        endTime,
        message: result.message || 'Test passed',
        details: result.details,
      } as TestResult);
    } catch (error) {
      const endTime = Date.now();

      this.emit('result', {
        testId: test.id,
        testName: test.name,
        status: 'error',
        startTime,
        endTime,
        message: error instanceof Error ? error.message : 'Test failed',
        details: error instanceof Error ? { stack: error.stack } : undefined,
      } as TestResult);
    }
  }

  async runAll(tests: Test[]): Promise<void> {
    for (const test of tests) {
      await this.runTest(test);
      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async runGroup(tests: Test[], group: 'unauthorized' | 'authorized'): Promise<void> {
    const groupTests = tests.filter(t => t.group === group);
    await this.runAll(groupTests);
  }

  on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
  }
}
