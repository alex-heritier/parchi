import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const repoRoot = '/Users/sero/projects/browser-ai';
const extensionPath = path.join(repoRoot, 'dist');
const screenshotsDir = path.join(repoRoot, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-profile-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    // Find extension ID
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    const extensionId = new URL(background.url()).host;
    console.log('Extension ID:', extensionId);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await panel.waitForSelector('text=Parchi', { timeout: 10000 });

    // 1. Settings > Advanced > Controllers
    console.log('Navigating to Settings > Advanced...');
    const sidebarToggle = await panel.$('#openSidebarBtn');
    if (sidebarToggle) {
      const isClosed = await panel.evaluate(() => document.getElementById('sidebar')?.classList.contains('closed'));
      if (isClosed) await sidebarToggle.click();
    }

    await panel.click('#settingsTabAdvancedBtn');
    await panel.waitForSelector('text=Controllers', { timeout: 5000 });
    await panel.screenshot({ path: path.join(screenshotsDir, '1-controllers-settings.png') });
    console.log('Captured: 1-controllers-settings.png');

    // Close sidebar
    console.log('Closing sidebar...');
    await panel.evaluate(() => {
      const toggle = document.getElementById('openSidebarBtn');
      const isClosed = document.getElementById('sidebar')?.classList.contains('closed');
      if (toggle && !isClosed) toggle.click();
    });
    await panel.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('closed'), {
      timeout: 5000,
    });

    // 2. Trigger Mission Control FAB
    console.log('Triggering Mission Control FAB...');
    const runId = 'run-mission-control-' + Date.now();
    const now = Date.now();

    // Use the internal method to add a subagent
    await panel.evaluate(
      ({ runId, now }) => {
        const ui = (window as any).sidePanelUI;
        if (ui?.addSubagent) {
          ui.addSubagent('sub-agent-1', 'Sub-Agent 1', 'Searching for product details');
        }
      },
      { runId, now },
    );

    // The addSubagent call should automatically open Mission Control if it's the first one
    // Let's wait for it to be open
    console.log('Waiting for Mission Control panel to open...');
    await panel.waitForSelector('#missionControlPanel.open', { timeout: 10000 });

    // 3. Mission Control - Agent List
    console.log('Mission Control opened, waiting for agent list...');
    await panel.waitForSelector('.mc-agent-card', { timeout: 5000 });
    await panel.screenshot({ path: path.join(screenshotsDir, '2-mission-control-list.png') });
    console.log('Captured: 2-mission-control-list.png');

    // 4. Mission Control - Agent Detail
    console.log('Clicking on agent card to show detail view...');
    await panel.click('.mc-agent-card');

    // Inject some activity to populate the feed
    await panel.evaluate(() => {
      const ui = (window as any).sidePanelUI;
      if (ui?.renderSubagentActivity) {
        ui.renderSubagentActivity('sub-agent-1', 'thought', {
          content: 'I am analyzing the page structure to find the required information.',
        });
      }
    });

    await panel.waitForSelector('.mc-detail-body', { timeout: 5000 });
    await panel.screenshot({ path: path.join(screenshotsDir, '3-mission-control-detail.png') });
    console.log('Captured: 3-mission-control-detail.png');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run();
