import { extractModelEntries, fetchWithTimeout } from '../../../packages/extension/ai/providers/model-listing.js';
import { type AsyncTestRunner, log } from '../shared/runner.js';

export async function runModelListingIntegrationSuite(runner: AsyncTestRunner) {
  log('\n=== Integration: Model Listing ===', 'info');

  await runner.test('fetchWithTimeout forwards an AbortSignal to fetch', async () => {
    const originalFetch = globalThis.fetch;
    let signalSeen: AbortSignal | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      signalSeen = init?.signal as AbortSignal;
      return new Response(JSON.stringify({ data: ['gpt-4.1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const response = await fetchWithTimeout('https://example.com/models', { method: 'GET' });
      runner.assertTrue(response.ok, 'Expected successful response');
      runner.assertTrue(
        Boolean(signalSeen) && typeof (signalSeen as AbortSignal | null)?.aborted === 'boolean',
        'Expected an AbortSignal',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runner.test('extractModelEntries preserves labels and context windows after network fetch', async () => {
    const payload = {
      models: [
        { id: 'claude-sonnet-4.5', display_name: 'Claude Sonnet 4.5', context_length: 200000 },
        { slug: 'kimi-k2', name: 'Kimi K2' },
      ],
    };
    runner.assertEqual(extractModelEntries(payload), [
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', contextWindow: 200000 },
      { id: 'kimi-k2', label: 'Kimi K2' },
    ]);
  });
}
