import type { ToolDefinition } from '@parchi/shared';

export const ADVANCED_BROWSER_TOOL_DEFINITIONS = [
  {
    name: 'evaluate',
    description:
      'Execute JavaScript in the active page context and return a JSON-serializable result. Use this to inspect app state, framework data, shadow DOM, and page globals beyond visible DOM text.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression or promise-producing expression to evaluate in the page context.',
        },
        awaitPromise: {
          type: 'boolean',
          description: 'If true (default), await a returned promise before serializing the result.',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'watchNetwork',
    description:
      'Start or refresh network capture for the current page so later reads can inspect recent fetch/XHR responses and metadata.',
    input_schema: {
      type: 'object',
      properties: {
        clearExisting: {
          type: 'boolean',
          description: 'If true (default), clear any previously captured entries before watching.',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
  {
    name: 'getNetworkLog',
    description:
      'Read recently captured network requests/responses for the current page, with optional filtering and response body snippets.',
    input_schema: {
      type: 'object',
      properties: {
        urlIncludes: { type: 'string', description: 'Only include entries whose URL contains this substring.' },
        method: { type: 'string', description: 'Optional HTTP method filter (GET, POST, etc).' },
        status: { type: 'number', description: 'Optional HTTP status filter.' },
        limit: { type: 'number', description: 'Maximum number of entries to return (default 20, max 50).' },
        includeBody: {
          type: 'boolean',
          description: 'If true, include truncated response body text when available.',
        },
        clearAfterRead: {
          type: 'boolean',
          description: 'If true, clear the captured log after returning the current entries.',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
] as const satisfies readonly ToolDefinition[];
