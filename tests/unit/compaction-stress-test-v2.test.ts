import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { type TestRunner, log } from './shared/runner.js';

export function runCompactionStressTestV2Suite(runner: TestRunner) {
  log('\n=== Testing Compaction Stress Harness v2 ===', 'info');

  runner.test('compaction stress harness v2 self-test passes', () => {
    const scriptPath = resolve(process.cwd(), 'scripts', 'compaction-stress-test-v2.py');
    const result = spawnSync('python3', [scriptPath, '--self-test'], {
      encoding: 'utf-8',
    });

    runner.assertEqual(
      result.status,
      0,
      `Unexpected exit code: ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
    runner.assertTrue(
      result.stdout.includes('SELF-TEST PASSED'),
      `Expected SELF-TEST PASSED marker\nSTDOUT:\n${result.stdout}`,
    );
  });
}
