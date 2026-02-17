import './ui/panel-modules.js';
import './ui/account/panel-account.js';
import { loadPanelLayout } from './ui/core/layout-loader.js';
import { SidePanelUI } from './ui/core/panel-ui.js';

const init = async () => {
  await loadPanelLayout();
  const ui = new SidePanelUI();
  // Expose for debugging
  (window as any).sidePanelUI = ui;
};

void init();
