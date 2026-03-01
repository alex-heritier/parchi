import './ui/panel-modules.js';
import './ui/account/panel-account.js';
import { loadPanelLayout } from './ui/core/layout-loader.js';
import { SidePanelUI } from './ui/core/panel-ui.js';

declare const __PERF_DEBUG__: boolean;

const init = async () => {
  await loadPanelLayout();
  const ui = new SidePanelUI();
  const debugWindow = window as Window & { sidePanelUI?: SidePanelUI; __PERF_DEBUG__?: boolean };
  debugWindow.sidePanelUI = ui;

  if (__PERF_DEBUG__ || debugWindow.__PERF_DEBUG__) {
    const { perfMonitor } = await import('../utils/perf-monitor.js');
    perfMonitor.start();
  }
};

void init();
