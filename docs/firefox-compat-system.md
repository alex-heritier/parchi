# Firefox Compatibility System

This project now uses a capability-based compatibility layer for background runtime features.

## Feature Mapping

| Capability | Chrome/Chromium Path | Firefox Path | Fallback |
|---|---|---|---|
| Open panel from toolbar click | `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` | `chrome.action.onClicked` + `chrome.sidebarAction.open()` | No-op if neither API exists |
| Kimi `User-Agent: coding-agent` injection | `chrome.declarativeNetRequest.updateDynamicRules()` | `chrome.webRequest.onBeforeSendHeaders` (`blocking`, `requestHeaders`) | Emit runtime warning and advise proxy/header-support build |

## Implementation

- Compatibility entrypoint: `/Users/sero/projects/browser-ai/packages/extension/background/browser-compat.ts`
- Integration point: `/Users/sero/projects/browser-ai/packages/extension/background/service.ts`
- Firefox permissions: `/Users/sero/projects/browser-ai/packages/extension/manifest.firefox.json`

## Rule

When adding new browser-specific behavior in background runtime, add it to `browser-compat.ts` first, then call it from `service.ts`.
