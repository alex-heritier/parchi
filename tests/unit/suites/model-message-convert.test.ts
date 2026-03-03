import type { Message } from '../../../packages/extension/ai/message-schema.js';
import { toModelMessages } from '../../../packages/extension/ai/model-convert.js';
import { type TestRunner, log } from '../shared/runner.js';

export function runModelMessageConvertSuite(runner: TestRunner) {
  log('\n=== Testing Model Message Conversion ===', 'info');

  runner.test('Tool results without top-level toolCallId are recovered from content entries', () => {
    const history: Message[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'set_plan:0', name: 'set_plan', args: {} },
          { id: 'navigate:1', name: 'navigate', args: { url: 'https://example.com' } },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'set_plan:0',
            toolName: 'set_plan',
            output: { success: true },
          },
          {
            type: 'tool-result',
            toolCallId: 'navigate:1',
            toolName: 'navigate',
            output: { success: true },
          },
        ],
      },
    ];

    const messages = toModelMessages(history);
    const toolMessages = messages.filter((msg) => msg.role === 'tool');

    runner.assertEqual(toolMessages.length, 2, 'Expected one model tool message per tool call');
    runner.assertTrue(
      JSON.stringify(toolMessages).includes('set_plan:0') && JSON.stringify(toolMessages).includes('navigate:1'),
      'Recovered tool messages should preserve toolCallId values',
    );
  });

  runner.test('Tool results with unknown toolCallId are filtered out', () => {
    const history: Message[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'known:1', name: 'getContent', args: {} }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'unknown:9',
            toolName: 'getContent',
            output: { success: true },
          },
        ],
      },
    ];

    const messages = toModelMessages(history);
    const toolMessages = messages.filter((msg) => msg.role === 'tool');
    runner.assertEqual(toolMessages.length, 0, 'Unknown tool_call_id entries should be dropped');
  });
}
