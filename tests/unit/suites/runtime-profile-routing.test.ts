import { resolveRuntimeModelProfile } from '../../../packages/extension/background/model-profiles.js';
import { type TestRunner, log } from '../shared/runner.js';

export function runRuntimeProfileRoutingSuite(runner: TestRunner) {
  log('\n=== Testing Runtime Model Profile Routing ===', 'info');

  runner.test('OAuth profiles route to oauth even when stale apiKey exists', () => {
    const result = resolveRuntimeModelProfile(
      {
        provider: 'copilot-oauth',
        apiKey: 'stale-key-should-not-force-byok',
        model: 'claude-sonnet-4',
      },
      {},
    );
    runner.assertTrue(result.allowed);
    runner.assertEqual(result.route, 'oauth');
  });

  runner.test('BYOK profiles still route to byok', () => {
    const result = resolveRuntimeModelProfile(
      {
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      },
      {},
    );
    runner.assertTrue(result.allowed);
    runner.assertEqual(result.route, 'byok');
  });
}
