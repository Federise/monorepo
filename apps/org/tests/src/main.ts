import { FederiseClient } from '@federise/sdk';
import { TestRunner } from './test-runner';
import { defineTests } from './tests';
import type { TestResult } from './types';

// Get frame URL from environment variable or use default
const FRAME_URL = import.meta.env.VITE_FRAME_URL || 'http://localhost:4321/frame';

// Initialize SDK client
const client = new FederiseClient({
  frameUrl: FRAME_URL,
  timeout: 10000,
});

// Initialize test runner with SDK client
const runner = new TestRunner(client);

// Define all tests
const tests = defineTests();

// Connect to the frame before allowing tests to run
let connected = false;
async function ensureConnected() {
  if (!connected) {
    console.log('Connecting to frame...');
    try {
      await client.connect();
      connected = true;
      console.log('Connected successfully!');
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }
}

// Track test results
const testResults = new Map<string, TestResult>();

// Update global status summary
function updateStatusSummary() {
  const results = Array.from(testResults.values());
  const total = results.length;
  const passed = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;

  document.getElementById('total-tests')!.textContent = total.toString();
  document.getElementById('passed-tests')!.textContent = passed.toString();
  document.getElementById('failed-tests')!.textContent = failed.toString();

  const statusEl = document.getElementById('overall-status')!;
  if (total === 0) {
    statusEl.textContent = 'Not Run';
    statusEl.className = 'summary-value';
  } else if (failed > 0) {
    statusEl.textContent = 'Failed';
    statusEl.className = 'summary-value error';
  } else if (passed === total) {
    statusEl.textContent = 'All Passed';
    statusEl.className = 'summary-value success';
  } else {
    statusEl.textContent = 'Running...';
    statusEl.className = 'summary-value';
  }
}

// Update test item visual indicator
function updateTestItemStatus(testId: string, status: 'success' | 'error' | 'running' | 'pending') {
  const testItems = document.querySelectorAll('.test-item');
  testItems.forEach((item) => {
    const btn = item.querySelector(`button[data-test="${testId}"]`);
    if (btn) {
      const testInfo = item.querySelector('.test-info') as HTMLElement;

      // Remove existing status indicators
      const existingIndicator = testInfo.querySelector('.test-status');
      if (existingIndicator) {
        existingIndicator.remove();
      }

      // Add new status indicator
      if (status !== 'pending') {
        const indicator = document.createElement('span');
        indicator.className = `test-status ${status}`;

        if (status === 'success') {
          indicator.textContent = '✓ Passed';
        } else if (status === 'error') {
          indicator.textContent = '✗ Failed';
        } else if (status === 'running') {
          indicator.textContent = '⟳ Running';
        }

        testInfo.appendChild(indicator);
      }
    }
  });
}

// Render test list
function renderTestList() {
  const listEl = document.getElementById('test-list')!;
  listEl.innerHTML = '';

  tests.forEach((test) => {
    const item = document.createElement('div');
    item.className = 'test-item';
    item.innerHTML = `
      <div class="test-info">
        <h3>${test.name}</h3>
        <p>${test.description}</p>
      </div>
      <button class="btn btn-small btn-primary" data-test="${test.id}">Run</button>
    `;
    listEl.appendChild(item);
  });

  // Attach event listeners
  listEl.querySelectorAll('button[data-test]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const testId = (e.target as HTMLButtonElement).dataset.test!;
      const test = tests.find((t) => t.id === testId);
      if (test) {
        await ensureConnected();
        await runner.runTest(test);
      }
    });
  });
}

// Populate filter dropdown
function populateFilterDropdown() {
  const filterEl = document.getElementById('filter-test');
  if (!(filterEl instanceof HTMLSelectElement)) return;

  tests.forEach((test) => {
    const option = document.createElement('option');
    option.value = test.id;
    option.textContent = test.name;
    filterEl.appendChild(option);
  });

  // Add filter event listener
  filterEl.addEventListener('change', (e) => {
    const selectedTestId = (e.target as HTMLSelectElement).value;
    filterResults(selectedTestId);
  });
}

// Filter results based on selected test
function filterResults(filterValue: string) {
  const resultsEl = document.getElementById('results')!;
  const allResults = resultsEl.querySelectorAll('.result');

  allResults.forEach((resultEl) => {
    const htmlResultEl = resultEl as HTMLElement;
    const resultTestName = resultEl.querySelector('.result-title')?.textContent;

    if (!filterValue) {
      // Show all results
      htmlResultEl.style.display = 'block';
    } else if (filterValue === '__failed__') {
      // Show only failed results
      const isFailed = resultEl.classList.contains('error');
      htmlResultEl.style.display = isFailed ? 'block' : 'none';
    } else if (filterValue === '__passed__') {
      // Show only passed results
      const isPassed = resultEl.classList.contains('success');
      htmlResultEl.style.display = isPassed ? 'block' : 'none';
    } else {
      // Filter by specific test ID
      const test = tests.find((t) => t.id === filterValue);
      if (test && resultTestName === test.name) {
        htmlResultEl.style.display = 'block';
      } else {
        htmlResultEl.style.display = 'none';
      }
    }
  });
}

// Subscribe to results
runner.on('result', (result: TestResult) => {
  // Track result
  testResults.set(result.testId, result);

  // Update global status summary
  updateStatusSummary();

  // Update test item status indicator
  updateTestItemStatus(result.testId, result.status);

  // Render result in results panel
  const resultsEl = document.getElementById('results')!;

  const resultDiv = document.createElement('div');
  resultDiv.className = `result ${result.status}`;
  resultDiv.dataset.testId = result.testId;

  const duration = result.endTime ? `${result.endTime - result.startTime}ms` : '';

  resultDiv.innerHTML = `
    <div class="result-header">
      <span class="result-title">${result.testName}</span>
      ${duration ? `<span class="result-time">${duration}</span>` : ''}
    </div>
    ${result.message ? `<div class="result-message">${result.message}</div>` : ''}
    ${result.details ? `<div class="result-details">${JSON.stringify(result.details, null, 2)}</div>` : ''}
  `;

  resultsEl.insertBefore(resultDiv, resultsEl.firstChild);

  // Apply current filter
  const filterEl = document.getElementById('filter-test');
  if (filterEl instanceof HTMLSelectElement && filterEl.value) {
    filterResults(filterEl.value);
  }
});

// Run tests based on selected group
document.getElementById('run-tests')!.addEventListener('click', async () => {
  const groupSelectEl = document.getElementById('test-group-select');
  if (!(groupSelectEl instanceof HTMLSelectElement)) return;
  const selectedGroup = groupSelectEl.value;

  await ensureConnected();

  switch (selectedGroup) {
    case 'all':
      await runner.runAll(tests);
      break;
    case 'unauthorized':
      await runner.runGroup(tests, 'unauthorized');
      break;
    case 'authorized':
      await runner.runGroup(tests, 'authorized');
      break;
  }
});

// Clear results
document.getElementById('clear-results')!.addEventListener('click', () => {
  document.getElementById('results')!.innerHTML = '';
  testResults.clear();
  updateStatusSummary();

  // Clear test item status indicators
  const testItems = document.querySelectorAll('.test-item');
  testItems.forEach((item) => {
    const existingIndicator = item.querySelector('.test-status');
    if (existingIndicator) {
      existingIndicator.remove();
    }
  });
});

// Initialize
renderTestList();
populateFilterDropdown();

console.log('Frame Test Harness initialized');
console.log(`Frame URL: ${FRAME_URL}`);
console.log(`Loaded ${tests.length} tests`);
