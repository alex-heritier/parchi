# Report: Visibility & Traceability Improvements

## Problem
The system had data flowing through it that wasn't surfaced to the user:
- Tool results were opaque — you could see a tool was called but not what it returned
- Error banners were uniform — no distinction between recoverable and terminal errors
- Agent phases (planning, executing, finalizing) and retry counts were silent
- No way to inspect what a tool actually did without reading console logs

## What Changed

### Files Modified (4)
| File | Change |
|------|--------|
| `ui/chat/panel-tools.ts` | Click-to-expand tool results; `showErrorBanner` accepts `recoverable` flag; persistent banner class |
| `ui/core/panel-core.ts` | Non-terminal phase display with retry counts in status bar; pass `recoverable` to error banner |
| `styles/tools.css` | `.tool-detail` expandable panel with monospace font, max-height, overflow scroll |
| `styles/utilities.css` | `.error-persistent` left border accent for non-recoverable errors |

### Lines Added/Removed
- **+60 / -4** across source files (net +56)

## Features

### 1. Click-to-Expand Tool Results
Every tool call element is now clickable. Clicking expands a `.tool-detail` panel showing:
- JSON-formatted result (for objects) or plain text
- Truncated to 2000 chars with `...(truncated)` indicator
- Click again to collapse

Implementation: Single `click` event listener on the tool container. Creates/removes a `div.tool-detail` child. CSS handles the fade-in animation.

### 2. Non-Terminal Phase Display
The `run_status` handler now surfaces intermediate phases:
- `planning` → "Planning"
- `executing` → "Executing"
- `finalizing` → "Finalizing"

With retry information when available:
- "Executing (retries: api 1/3, tool 2/5)"

### 3. Error Banner Severity
`showErrorBanner` now accepts `opts.recoverable`:
- `recoverable: true` → standard 12s auto-dismiss
- `recoverable: false` → 30s auto-dismiss + `.error-persistent` class (red left border)

The `run_error` handler passes the `recoverable` flag from the runtime message.

## Design Decisions

1. **Click-to-expand over always-visible** — Tool results can be large (DOM snapshots, page text). Showing them inline would destroy chat readability. Click-to-expand is progressive disclosure.

2. **2000 char truncation** — Prevents the UI from hanging on massive results. The `...(truncated)` suffix tells users there's more.

3. **CSS-only animation** — `@keyframes fadeIn` with 0.15s duration. No JS animation library needed.

4. **30s vs 12s** — Non-recoverable errors need to stay visible longer so users can read and react. 30s is long enough without being permanent.

## Risk Assessment
- **Zero risk to functionality**: All changes are UI-only. No background logic modified.
- **Accessibility**: Tool details use `cursor: pointer` to indicate interactivity. Monospace font improves readability of JSON/code.
