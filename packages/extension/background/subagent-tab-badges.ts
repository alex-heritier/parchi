export type SubagentTabBadgeState = {
  agentId: string;
  name: string;
  colorIndex: number;
  status: 'running' | 'completed' | 'error';
};

export async function sendSubagentTabBadge(tabId: number, state: SubagentTabBadgeState) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'show_subagent_badge', ...state });
  } catch {}
}

export async function clearSubagentTabBadge(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'clear_subagent_badge' });
  } catch {}
}
