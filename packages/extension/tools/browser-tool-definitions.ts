import type { ToolDefinition } from '@parchi/shared';
import { MAX_SESSION_TABS } from './browser-tool-shared.js';

export const BASE_BROWSER_TOOL_DEFINITIONS = [
  {
    name: 'navigate',
    description: 'Navigate the current tab to a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to visit.' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'openTab',
    description: `Open a new tab with a URL. Limited to ${MAX_SESSION_TABS} tabs per session. Prefer navigating existing tabs or switching to current tabs first (use describeSessionTabs or getTabs).`,
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to open.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description:
      'Click an element by selector. Prefer a valid CSS selector (querySelector). Also supports simple text selectors like `text=Create note` and `button.contains("Create note")`.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to click.' },
        timeoutMs: { type: 'number', description: 'Optional wait timeout for element to appear (ms).' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'clickAt',
    description:
      'Click at exact viewport coordinates (x, y). Use this when you cannot identify an element by selector — for example after taking a screenshot and identifying a position visually. Coordinates are relative to the viewport top-left corner. Optionally double-click or right-click.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in viewport pixels (from left edge).' },
        y: { type: 'number', description: 'Y coordinate in viewport pixels (from top edge).' },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button (default: left).',
        },
        doubleClick: { type: 'boolean', description: 'If true, perform a double-click.' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type',
    description:
      'Type text into an input/textarea/contenteditable. If selector points at a container (e.g. CodeMirror wrapper), it will try to find an editable descendant.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input.' },
        text: { type: 'string', description: 'Text to enter.' },
        timeoutMs: { type: 'number', description: 'Optional wait timeout for element to appear (ms).' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'pressKey',
    description: 'Press a key in the page.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Keyboard key (e.g., Enter, ArrowDown).' },
        selector: { type: 'string', description: 'Optional selector to target.' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'up, down, top, or bottom.' },
        amount: { type: 'number', description: 'Scroll amount in pixels.' },
        selector: { type: 'string', description: 'Optional selector for a scrollable container.' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
  {
    name: 'getContent',
    description: 'Extract page content.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'text, html, title, url, or links.' },
        selector: { type: 'string', description: 'Optional selector to scope content.' },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
  {
    name: 'findHtml',
    description:
      'Check whether a provided HTML snippet exists in the current page DOM structure (full page by default). Useful for confirming exact markup presence.',
    input_schema: {
      type: 'object',
      properties: {
        htmlSnippet: { type: 'string', description: 'Exact HTML snippet to search for.' },
        selector: { type: 'string', description: 'Optional CSS selector to scope search.' },
        normalizeWhitespace: {
          type: 'boolean',
          description: 'Collapse whitespace in both snippet and page HTML before matching.',
        },
        maxMatches: {
          type: 'number',
          description: 'Maximum number of matches to return (default 8).',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
      required: ['htmlSnippet'],
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current tab.',
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
  {
    name: 'getTabs',
    description: 'List tabs in the current window.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'closeTab',
    description: 'Close a tab by id.',
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab id to close.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'switchTab',
    description: 'Activate a tab by id.',
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab id to activate.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'focusTab',
    description: 'Focus a tab by id.',
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab id to focus.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'groupTabs',
    description: 'Group tabs together with an optional name and color.',
    input_schema: {
      type: 'object',
      properties: {
        tabIds: { type: 'array', items: { type: 'number' }, description: 'Tabs to group.' },
        title: { type: 'string', description: 'Group title.' },
        color: { type: 'string', description: 'Group color name.' },
      },
    },
  },
  {
    name: 'describeSessionTabs',
    description: 'List tabs captured for this session.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'watchVideo',
    description:
      'Watch and analyze a video on the current page. Captures multiple frames and describes what is happening. Requires a vision-capable profile to be configured.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector for the video element. If not provided, uses the first video on page.',
        },
        durationSeconds: {
          type: 'number',
          description: 'How many seconds of video to analyze (default: 10, max: 60).',
        },
        frameIntervalSeconds: {
          type: 'number',
          description: 'Interval between captured frames in seconds (default: 2).',
        },
        question: {
          type: 'string',
          description: 'Optional specific question about the video content.',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
  {
    name: 'getVideoInfo',
    description:
      'Get information about video elements on the page (duration, current time, playing state, dimensions).',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector for a specific video element.',
        },
        tabId: { type: 'number', description: 'Optional tab id.' },
      },
    },
  },
] as const satisfies readonly ToolDefinition[];

export type BrowserToolName = (typeof BASE_BROWSER_TOOL_DEFINITIONS)[number]['name'];

export function getBrowserToolDefinitions(supportsTabGroups: boolean): ToolDefinition[] {
  return supportsTabGroups
    ? [...BASE_BROWSER_TOOL_DEFINITIONS]
    : BASE_BROWSER_TOOL_DEFINITIONS.filter((tool) => tool.name !== 'groupTabs');
}

export function getBrowserToolMap(supportsTabGroups: boolean): Partial<Record<BrowserToolName, true>> {
  return Object.fromEntries(getBrowserToolDefinitions(supportsTabGroups).map((tool) => [tool.name, true] as const));
}
