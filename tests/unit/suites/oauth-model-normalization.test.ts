import { normalizeOAuthModelIdForProvider } from '../../../packages/extension/oauth/model-normalization.js';
import { type TestRunner, log } from '../shared/runner.js';

export function runOauthModelNormalizationSuite(runner: TestRunner) {
  log('\n=== Testing OAuth Model Normalization ===', 'info');

  runner.test('Copilot prefixed model IDs are normalized', () => {
    runner.assertEqual(normalizeOAuthModelIdForProvider('copilot-oauth', 'copilot/claude-sonnet-4'), 'claude-sonnet-4');
    runner.assertEqual(normalizeOAuthModelIdForProvider('copilot', 'github-copilot/gpt-4o'), 'gpt-4o');
  });

  runner.test('Codex prefixed model IDs are normalized', () => {
    runner.assertEqual(normalizeOAuthModelIdForProvider('codex-oauth', 'openai/gpt-5.2'), 'gpt-5.2');
  });

  runner.test('Non-prefixed OAuth model IDs remain unchanged', () => {
    runner.assertEqual(normalizeOAuthModelIdForProvider('qwen-oauth', 'qwen-max'), 'qwen-max');
  });

  runner.test('Namespaced OAuth model IDs collapse to final raw model segment', () => {
    runner.assertEqual(
      normalizeOAuthModelIdForProvider('copilot-oauth', 'openrouter/moonshotai/kimi-k2.5'),
      'kimi-k2.5',
    );
  });

  runner.test('Copilot shorthand Anthropic names normalize to claude-* slugs', () => {
    runner.assertEqual(normalizeOAuthModelIdForProvider('copilot-oauth', 'copilot/sonnet-4.6'), 'claude-sonnet-4.6');
    runner.assertEqual(normalizeOAuthModelIdForProvider('copilot-oauth', 'opus-4.6'), 'claude-opus-4.6');
  });
}
