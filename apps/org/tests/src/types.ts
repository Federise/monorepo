import type { FederiseClient } from '@federise/sdk';

export type TestGroup = 'unauthorized' | 'authorized';

export interface Test {
  id: string;
  name: string;
  description: string;
  group: TestGroup;
  run: (client: FederiseClient) => Promise<TestRunResult>;
}

export interface TestRunResult {
  message?: string;
  details?: any;
}

export interface TestResult {
  testId: string;
  testName: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startTime: number;
  endTime?: number;
  message?: string;
  details?: any;
}
