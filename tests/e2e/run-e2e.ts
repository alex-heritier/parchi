#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  console.error('Playwright is not installed. Run: npm install');
  process.exit(1);
}

const colors = {
  info: '\x1b[36m',
  success: '\x1b[32m',
  error: '\x1b[31m',
  warning: '\x1b[33m',
  reset: '\x1b[0m',
} as const;

function log(message: string, type: keyof typeof colors = 'info') {
  console.log(`${colors[type]}${message}${colors.reset}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const repoRoot = path.resolve(process.cwd());
const extensionPath = path.join(repoRoot, 'dist');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parchi-e2e-'));

const timeoutMs = Number(process.env.E2E_TIMEOUT || 20000);
const slowMo = Number(process.env.E2E_SLOWMO || 0);
const headless = process.env.E2E_HEADLESS === 'true';
if (headless) {
  log('Extensions are not supported in headless mode; tests may fail.', 'warning');
}

const readEnv = (key: string) => {
  const raw = process.env[key];
  return typeof raw === 'string' ? raw.trim() : '';
};

type TestContext = {
  panel: import('playwright').Page;
  context: import('playwright').BrowserContext;
  worker: import('playwright').Worker;
};

const tests: Array<{ name: string; fn: (ctx: TestContext) => Promise<void> }> = [];
const test = (name: string, fn: (ctx: TestContext) => Promise<void>) => tests.push({ name, fn });

async function getExtensionId(context: import('playwright').BrowserContext): Promise<string> {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: timeoutMs });
  }
  const url = new URL(worker.url());
  return url.host;
}

async function emitPanelRuntimeMessage(panel: import('playwright').Page, message: Record<string, unknown>) {
  await panel.evaluate((payload) => {
    const ui = (window as Window & { sidePanelUI?: { handleRuntimeMessage?: (msg: unknown) => void } }).sidePanelUI;
    if (!ui?.handleRuntimeMessage) {
      throw new Error('sidePanelUI.handleRuntimeMessage is unavailable');
    }
    ui.handleRuntimeMessage(payload);
  }, message);
}

async function setSidebarOpen(panel: import('playwright').Page, open: boolean) {
  await panel.evaluate((shouldOpen) => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('openSidebarBtn') as HTMLButtonElement | null;
    if (!sidebar || !toggle) return;
    const isClosed = sidebar.classList.contains('closed');
    if (shouldOpen && isClosed) toggle.click();
    if (!shouldOpen && !isClosed) toggle.click();
  }, open);
  await panel.waitForFunction(
    (shouldOpen) => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return false;
      return shouldOpen ? !sidebar.classList.contains('closed') : sidebar.classList.contains('closed');
    },
    open,
    { timeout: timeoutMs },
  );
}

async function sendRuntimeMessageWithResponse(worker: import('playwright').Worker, message: Record<string, unknown>) {
  return await worker.evaluate(
    (payload) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, (response) => resolve(response));
      }),
    message,
  );
}

test('Side panel loads and shows ready state', async ({ panel }) => {
  await panel.waitForSelector('text=Parchi', { timeout: timeoutMs });
  await panel.waitForFunction(
    () => {
      const el = document.querySelector('#statusText');
      return el && el.textContent && el.textContent.includes('Ready');
    },
    { timeout: timeoutMs },
  );
});

test('New session stays as the + button and reset lives in Settings', async ({ panel }) => {
  await panel.waitForSelector('#quickActionsFab', { timeout: timeoutMs });
  await panel.evaluate(() => (document.getElementById('quickActionsFab') as HTMLButtonElement | null)?.click());
  await panel.waitForSelector('#quickActionsMenu', { state: 'visible', timeout: timeoutMs });
  const quickState = await panel.evaluate(() => ({
    hasNewSession: Boolean(document.getElementById('quickActionNewSession')),
    hasResetProfiles: Boolean(document.getElementById('quickActionResetProfiles')),
    hasRecordContext: Boolean(document.getElementById('quickActionRecordContext')),
  }));
  assert(!quickState.hasNewSession, 'Quick actions should not contain a New session item.');
  assert(!quickState.hasResetProfiles, 'Quick actions should not contain Reset all profiles.');
  assert(!quickState.hasRecordContext, 'Quick actions should not contain Record context.');
  const composerRecordVisible = await panel.evaluate(() => Boolean(document.getElementById('composerActionRecordContext')));
  assert(composerRecordVisible, 'Composer should contain the Record context icon.');
  const plusGlyphCount = await panel.locator('#newSessionFab svg path').count();
  assert(plusGlyphCount >= 2, 'New session FAB should remain the icon-only plus button.');
  await panel.evaluate(() => (document.getElementById('quickActionsFab') as HTMLButtonElement | null)?.click());

  await setSidebarOpen(panel, true);
  await panel.click('#settingsTabAdvancedBtn');
  await panel.waitForSelector('#settingsResetProfilesBtn', { state: 'visible', timeout: timeoutMs });
  await setSidebarOpen(panel, false);
});

test('Quick actions exposes text size controls and supports up to 150%', async ({ panel }) => {
  await panel.evaluate(() => {
    document.documentElement.style.setProperty('--ui-zoom', '1');
    const ui = (window).sidePanelUI;
    if (ui && typeof ui.applyUiZoom === 'function') ui.applyUiZoom(1);
  });
  await panel.evaluate(() => (document.getElementById('quickActionsFab') as HTMLButtonElement | null)?.click());
  await panel.waitForSelector('#quickActionTextSizeUp', { state: 'visible', timeout: timeoutMs });
  await panel.click('#quickActionTextSizeUp');
  await panel.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() === '1.05', { timeout: timeoutMs });
  let label = await panel.locator('#quickActionTextSizeValue').textContent();
  assert(label?.includes('105'), 'Expected quick text size label to update to 105%.');

  await panel.evaluate(() => {
    const ui = (window).sidePanelUI;
    if (!ui || typeof ui.applyUiZoom !== 'function') throw new Error('applyUiZoom unavailable');
    ui.applyUiZoom(1.5);
  });
  await panel.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() === '1.5', { timeout: timeoutMs });
  label = await panel.locator('#quickActionTextSizeValue').textContent();
  assert(label?.includes('150'), 'Expected text size to support 150%.');

  await panel.click('#quickActionTextSizeReset');
  await panel.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() === '1', { timeout: timeoutMs });
});

test('Record context composer action is wired and toggles recording UI', async ({ panel }) => {
  await panel.evaluate(() => {
    const win = window as Window & {
      sidePanelUI?: {
        elements: { recordBtn?: HTMLButtonElement | null };
        startRecording?: () => Promise<void> | void;
        stopRecording?: () => Promise<void> | void;
        showRecordingTimer?: () => void;
        cleanupRecordingUI?: () => void;
        recordingState: { status: string; elapsedMs: number; timerId: number | null };
      };
      __recordStartCalled?: number;
      __recordStopCalled?: number;
    };
    const ui = win.sidePanelUI;
    if (!ui) throw new Error('Missing sidePanelUI');
    if (!ui.elements.recordBtn) throw new Error('recordBtn is not wired to the composer action');
    ui.recordingState = { status: 'idle', elapsedMs: 0, timerId: null };
    ui.elements.recordBtn.classList.remove('recording');
    document.getElementById('recordingTimer')?.classList.add('hidden');
    win.__recordStartCalled = 0;
    win.__recordStopCalled = 0;

    ui.startRecording = async function mockStartRecording(this: typeof ui) {
      win.__recordStartCalled = (win.__recordStartCalled || 0) + 1;
      this.recordingState.status = 'recording';
      this.recordingState.elapsedMs = 0;
      this.elements.recordBtn?.classList.add('recording');
      this.showRecordingTimer?.();
    };

    ui.stopRecording = async function mockStopRecording(this: typeof ui) {
      win.__recordStopCalled = (win.__recordStopCalled || 0) + 1;
      this.cleanupRecordingUI?.();
    };
  });

  await panel.evaluate(() => {
    (document.getElementById('composerActionRecordContext') as HTMLButtonElement | null)?.click();
  });
  await panel.waitForFunction(
    () => {
      const win = window as Window & { __recordStartCalled?: number };
      const button = document.getElementById('composerActionRecordContext');
      const timer = document.getElementById('recordingTimer');
      return (
        (win.__recordStartCalled || 0) === 1 &&
        button?.classList.contains('recording') === true &&
        timer?.classList.contains('hidden') === false
      );
    },
    { timeout: timeoutMs },
  );

  await panel.evaluate(() => {
    (document.getElementById('composerActionRecordContext') as HTMLButtonElement | null)?.click();
  });
  await panel.waitForFunction(
    () => {
      const win = window as Window & { __recordStopCalled?: number };
      const button = document.getElementById('composerActionRecordContext');
      const timer = document.getElementById('recordingTimer');
      return (
        (win.__recordStopCalled || 0) === 1 &&
        button?.classList.contains('recording') === false &&
        timer?.classList.contains('hidden') === true
      );
    },
    { timeout: timeoutMs },
  );
});

test('Pasting media into the composer attaches it', async ({ panel }) => {
  await panel.evaluate(() => {
    const input = document.getElementById('userInput') as HTMLTextAreaElement | null;
    if (!input) throw new Error('Missing user input');
    input.value = '';
    const ui = (window as Window & { sidePanelUI?: { pendingComposerAttachments?: unknown[] } }).sidePanelUI;
    if (ui) ui.pendingComposerAttachments = [];

    const data = new DataTransfer();
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'clipboard-image.png', { type: 'image/png' });
    data.items.add(file);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    input.dispatchEvent(event);
  });

  await panel.waitForFunction(() => {
    const win = window as Window & { sidePanelUI?: { pendingComposerAttachments?: Array<{ name?: string }> } };
    const attachments = win.sidePanelUI?.pendingComposerAttachments || [];
    const input = document.getElementById('userInput') as HTMLTextAreaElement | null;
    return attachments.length === 1 && attachments[0]?.name === 'clipboard-image.png' && !!input?.value.includes('[Attached image: clipboard-image.png]');
  }, { timeout: timeoutMs });

  const attachmentCount = await panel.evaluate(() => {
    const win = window as Window & { sidePanelUI?: { pendingComposerAttachments?: unknown[] } };
    return win.sidePanelUI?.pendingComposerAttachments?.length || 0;
  });
  assert(attachmentCount === 1, 'Expected one pasted media attachment.');
});

test('Settings sidebar opens and provider grids render', async ({ panel }) => {
  await setSidebarOpen(panel, true);
  await panel.waitForSelector('#settingsPanel', { state: 'visible', timeout: timeoutMs });
  await panel.click('#settingsTabProvidersBtn');
  await panel.waitForSelector('#oauthProviderGrid', { state: 'visible', timeout: timeoutMs });
  await panel.waitForSelector('#paidModeProviderGrid', { state: 'visible', timeout: timeoutMs });
  await setSidebarOpen(panel, false);
});

test('Tab selector lists integration test page', async ({ panel, context }) => {
  await setSidebarOpen(panel, false);
  const testPagePath = path.join(repoRoot, 'tests/integration/test-page.html');
  const testPageUrl = `file://${testPagePath}`;
  const testPage = await context.newPage();
  await testPage.goto(testPageUrl);

  const tabSelectorVisible = await panel.evaluate(() => {
    const el = document.getElementById('tabSelectorBtn');
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  });

  if (tabSelectorVisible) {
    await panel.click('#tabSelectorBtn');
  } else {
    await panel.evaluate(() => {
      (document.getElementById('composerActionSelectTabs') as HTMLButtonElement | null)?.click();
    });
  }

  await panel.waitForSelector('#tabSelector', { state: 'visible', timeout: timeoutMs });
  await panel.waitForSelector('.tab-item-title', { timeout: timeoutMs });
  const titles = await panel.$$eval('.tab-item-title', (nodes) => nodes.map((node) => (node.textContent || '').trim()));
  assert(
    titles.some((title) => title.includes('Integration Test Page')),
    'Expected integration test page in tab selector.',
  );

  await panel.evaluate(() => {
    (document.getElementById('closeTabSelector') as HTMLButtonElement | null)?.click();
  });
  await panel.waitForFunction(() => document.getElementById('tabSelector')?.classList.contains('hidden') === true, {
    timeout: timeoutMs,
  });
});

test('Runtime events render plan drawer and tool rows', async ({ panel }) => {
  await setSidebarOpen(panel, false);
  const runId = `run-e2e-${Date.now()}`;
  const now = Date.now();
  const plan = {
    steps: [
      { id: 'step-1', title: 'Open page', status: 'running' },
      { id: 'step-2', title: 'Extract data', status: 'pending' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await emitPanelRuntimeMessage(panel, {
    type: 'plan_update',
    schemaVersion: 1,
    runId,
    timestamp: now,
    plan,
  });

  await panel.waitForSelector('#planDrawer:not(.hidden)', { timeout: timeoutMs });
  await panel.waitForFunction(
    () => {
      const text = document.querySelector('#planStepCount')?.textContent || '';
      return text.includes('/2 steps') || text.includes('2 steps');
    },
    { timeout: timeoutMs },
  );

  await emitPanelRuntimeMessage(panel, {
    type: 'run_status',
    schemaVersion: 1,
    runId,
    timestamp: now + 1,
    phase: 'executing',
    attempts: { api: 0, tool: 0, finalize: 0 },
    maxRetries: { api: 1, tool: 1, finalize: 1 },
    note: 'Executing',
  });
  await panel.waitForFunction(
    () => (document.querySelector('#statusText')?.textContent || '').toLowerCase().includes('execut'),
    { timeout: timeoutMs },
  );

  await emitPanelRuntimeMessage(panel, {
    type: 'tool_execution_start',
    schemaVersion: 1,
    runId,
    timestamp: now + 2,
    tool: 'navigate',
    id: 'tool-1',
    args: { url: 'https://example.com' },
  });

  await emitPanelRuntimeMessage(panel, {
    type: 'tool_execution_result',
    schemaVersion: 1,
    runId,
    timestamp: now + 3,
    tool: 'navigate',
    id: 'tool-1',
    args: { url: 'https://example.com' },
    result: { success: true, message: 'Navigated' },
  });

  await panel.waitForSelector('.tool-row[data-tool-id="tool-1"].done', { state: 'attached', timeout: timeoutMs });

  await emitPanelRuntimeMessage(panel, {
    type: 'run_status',
    schemaVersion: 1,
    runId,
    timestamp: now + 4,
    phase: 'failed',
    attempts: { api: 1, tool: 0, finalize: 0 },
    maxRetries: { api: 1, tool: 1, finalize: 1 },
    note: 'Failed',
    lastError: 'Test failure',
  });
  await panel.waitForFunction(
    () => (document.querySelector('#statusText')?.textContent || '').toLowerCase().includes('failed'),
    { timeout: timeoutMs },
  );
});

test('History drawer restores saved transcript', async ({ panel, worker }) => {
  await setSidebarOpen(panel, false);
  await panel.evaluate(() => {
    document.querySelectorAll('#modalRoot .modal-backdrop').forEach((el) => el.remove());
  });
  const now = Date.now();
  const session = {
    id: `session-e2e-${now}`,
    startedAt: now,
    updatedAt: now,
    title: 'History Session',
    turns: [
      {
        id: `turn-e2e-${now}`,
        userMessage: 'History user prompt',
        assistantFinal: {
          content: 'History assistant response',
        },
      },
    ],
  };

  await worker.evaluate((payload) => chrome.storage.local.set({ chatSessions: payload }), [session]);
  await panel.evaluate(() => (document.getElementById('historyFab') as HTMLButtonElement | null)?.click());
  await panel.waitForSelector('.history-item', { timeout: timeoutMs });
  await panel.evaluate(() => {
    (document.querySelector('.history-item .history-item-main') as HTMLElement | null)?.click();
  });
  await panel.waitForSelector('.message.assistant', { timeout: timeoutMs });
  await panel.waitForFunction(
    () =>
      (document.querySelector('.message.assistant .message-content')?.textContent || '').includes('History assistant'),
    { timeout: timeoutMs },
  );
});

test('Chat displays streaming message during assistant response', async ({ panel }) => {
  await setSidebarOpen(panel, false);
  await panel.evaluate(() => {
    document.querySelectorAll('#modalRoot .modal-backdrop').forEach((el) => el.remove());
  });
  const runId = `run-stream-${Date.now()}`;
  const now = Date.now();

  // Send stream start
  await emitPanelRuntimeMessage(panel, {
    type: 'assistant_stream_start',
    schemaVersion: 1,
    runId,
    timestamp: now,
  });

  // Wait for streaming message element to be attached to DOM
  await panel.waitForSelector('.message.assistant.streaming', { state: 'attached', timeout: timeoutMs });

  // Send stream delta with content
  await emitPanelRuntimeMessage(panel, {
    type: 'assistant_stream_delta',
    schemaVersion: 1,
    runId,
    timestamp: now + 1,
    content: 'Hello, I am responding',
  });

  // Verify streamed content exists in DOM
  await panel.waitForFunction(
    () => {
      const el = document.querySelector('.stream-event-text');
      return el && el.textContent && el.textContent.includes('Hello');
    },
    { timeout: timeoutMs },
  );
});

test('Thinking stream renders reasoning content', async ({ panel }) => {
  await setSidebarOpen(panel, false);
  await panel.evaluate(() => {
    document.querySelectorAll('#modalRoot .modal-backdrop').forEach((el) => el.remove());
  });
  const runId = `run-thinking-${Date.now()}`;
  const now = Date.now();

  await emitPanelRuntimeMessage(panel, {
    type: 'assistant_stream_start',
    schemaVersion: 1,
    runId,
    timestamp: now,
  });

  await emitPanelRuntimeMessage(panel, {
    type: 'assistant_stream_delta',
    schemaVersion: 1,
    runId,
    timestamp: now + 1,
    channel: 'reasoning',
    content: 'Let me think about this carefully...',
  });

  await panel.waitForFunction(
    () => {
      const el = document.querySelector('.stream-event-reasoning .stream-reasoning-content');
      return Boolean(el && el.textContent && el.textContent.includes('carefully'));
    },
    { timeout: timeoutMs },
  );
});

test('Tool calls render as completed rows', async ({ panel }) => {
  await setSidebarOpen(panel, false);
  const runId = `run-tool-section-${Date.now()}`;
  const now = Date.now();

  // Send tool execution start
  await emitPanelRuntimeMessage(panel, {
    type: 'tool_execution_start',
    schemaVersion: 1,
    runId,
    timestamp: now,
    tool: 'navigate',
    id: 'tool-section-1',
    args: { url: 'https://example.com' },
  });

  await panel.waitForSelector('.tool-row[data-tool-id="tool-section-1"].running', { timeout: timeoutMs });

  // Send tool result
  await emitPanelRuntimeMessage(panel, {
    type: 'tool_execution_result',
    schemaVersion: 1,
    runId,
    timestamp: now + 1,
    tool: 'navigate',
    id: 'tool-section-1',
    args: { url: 'https://example.com' },
    result: { success: true },
  });

  await panel.waitForSelector('.tool-row[data-tool-id="tool-section-1"].done', {
    state: 'attached',
    timeout: timeoutMs,
  });
  await panel.waitForFunction(
    () =>
      (document.querySelector('.tool-row[data-tool-id="tool-section-1"] .tool-status')?.textContent || '').trim() ===
      'OK',
    { timeout: timeoutMs },
  );
});

test('Live API smoke test via background (optional)', async ({ worker }) => {
  const providers = [
    {
      label: 'OpenAI',
      provider: 'openai',
      apiKeyEnv: 'OPENAI_API_KEY',
      modelEnv: 'OPENAI_MODEL',
      defaultModel: 'gpt-4o',
    },
    {
      label: 'Anthropic',
      provider: 'anthropic',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      modelEnv: 'ANTHROPIC_MODEL',
    },
    {
      label: 'Kimi',
      provider: 'kimi',
      apiKeyEnv: 'KIMI_API_KEY',
      modelEnv: 'KIMI_MODEL',
      endpointEnv: 'KIMI_BASE_URL',
    },
    {
      label: 'Custom',
      provider: 'custom',
      apiKeyEnv: 'CUSTOM_API_KEY',
      modelEnv: 'CUSTOM_MODEL',
      endpointEnv: 'CUSTOM_ENDPOINT',
    },
  ];

  const configured = providers.filter((spec) => {
    const apiKey = readEnv(spec.apiKeyEnv);
    const model = readEnv(spec.modelEnv) || (spec as any).defaultModel || '';
    return Boolean(apiKey && model);
  });

  if (!configured.length) {
    log('API smoke test skipped (no provider env vars set).', 'warning');
    return;
  }

  for (const spec of configured) {
    const apiKey = readEnv(spec.apiKeyEnv);
    const model = readEnv(spec.modelEnv) || (spec as any).defaultModel || '';
    const customEndpoint = spec.endpointEnv ? readEnv(spec.endpointEnv) : '';

    const response: any = await sendRuntimeMessageWithResponse(worker, {
      type: 'api_smoke_test',
      settings: {
        provider: spec.provider,
        apiKey,
        model,
        customEndpoint: customEndpoint || undefined,
      },
      prompt: 'Reply with the word "pong" only.',
    });

    assert(response && response.success, `${spec.label} API smoke test failed to return success.`);
    const resolvedText = String(response?.result?.resolvedText || '')
      .trim()
      .toLowerCase();
    assert(resolvedText.includes('pong'), `${spec.label} returned unexpected response: ${resolvedText}`);

    const usedFallback = !response?.result?.rawText && response?.result?.fallbackText;
    log(`✓ ${spec.label} API responded${usedFallback ? ' (responseMessages fallback)' : ''}`, 'success');
  }
});

test('Color scheme uses neutral grays', async ({ panel }) => {
  // Get computed background color of body
  const bgColor = await panel.$eval('body', (el) => getComputedStyle(el).backgroundColor);

  // Parse RGB values - should be a neutral gray (R, G, B values similar)
  const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    // For neutral gray, R, G, B should be very close (within 5 of each other)
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    assert(maxDiff <= 10, `Colors should be neutral gray, but found difference of ${maxDiff}`);
  }
});

async function run() {
  log('╔════════════════════════════════════════╗', 'info');
  log('║          Parchi - E2E Tests           ║', 'info');
  log('╚════════════════════════════════════════╝', 'info');

  let context;
  try {
    if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
      throw new Error('Missing dist/manifest.json. Run npm run build first.');
    }
    context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      slowMo,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--allow-file-access-from-files',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });

    const extensionId = await getExtensionId(context);
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: timeoutMs }));

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`, {
      waitUntil: 'domcontentloaded',
    });

    let passed = 0;
    for (const t of tests) {
      try {
        await t.fn({ panel, context, worker });
        passed += 1;
        log(`✓ ${t.name}`, 'success');
      } catch (error) {
        log(`✗ ${t.name}: ${error.message}`, 'error');
      }
    }

    log('\n' + '═'.repeat(40), 'info');
    if (passed === tests.length) {
      log('✓ All E2E tests passed!', 'success');
      process.exitCode = 0;
    } else {
      log(`✗ ${tests.length - passed} E2E tests failed`, 'error');
      process.exitCode = 1;
    }
  } catch (error) {
    log(`✗ E2E harness failed: ${error.message}`, 'error');
    process.exitCode = 1;
  } finally {
    if (context) {
      await context.close();
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (error) {
      log(`Warning: failed to remove temp profile: ${error.message}`, 'warning');
    }
  }
}

run();
