<div align="center">

<img src="packages/extension/icons/icon.svg" alt="Parchi" width="120" height="120" />

# Parchi

**Your AI-powered browser copilot.**

Chat-driven browser automation that lives in your sidebar. Navigate, read, click, extract — all through natural language.

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Firefox](https://img.shields.io/badge/Firefox-109%2B-FF7139?logo=firefox&logoColor=white)](https://www.mozilla.org/firefox/)
[![License: MIT](https://img.shields.io/badge/License-MIT-a5b4fc.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.4.10-6366f1.svg)]()

<br />

[Installation](#-installation) · [Setup](#-setup-your-ai-provider) · [Features](#-features) · [Use Your Subscription](#-use-your-existing-ai-subscription) · [Relay CLI](#-relay-daemon--cli)

</div>

---

## 📦 Installation

### Chrome (recommended)

<table>
<tr>
<td width="60">

**1.**

</td>
<td>

**Get the extension files**

```bash
git clone https://github.com/0xSero/parchi.git
cd parchi
npm install
npm run build
```

This creates a `dist/` folder with the built extension.

</td>
</tr>
<tr>
<td>

**2.**

</td>
<td>

**Open Chrome Extensions page**

Navigate to `chrome://extensions` in your address bar, or go to **⋮ Menu → Extensions → Manage Extensions**.

</td>
</tr>
<tr>
<td>

**3.**

</td>
<td>

**Enable Developer Mode**

Toggle the **Developer mode** switch in the top-right corner of the extensions page.

</td>
</tr>
<tr>
<td>

**4.**

</td>
<td>

**Load the extension**

Click **"Load unpacked"** and select the `dist/` folder from the cloned repo.

</td>
</tr>
<tr>
<td>

**5.**

</td>
<td>

**Open Parchi**

Click the Parchi icon in your toolbar (you may need to pin it first via the puzzle piece icon). The side panel opens — you're ready to go.

</td>
</tr>
</table>

### Firefox

```bash
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on"**
3. Select any file inside the `dist/` folder

> **XPI packaging:** `npm run build:firefox:xpi` outputs `dist-firefox/<extension-name>-<version>.xpi` for distribution. Requires Developer Edition/Nightly or Mozilla add-on signing for release installs.

---

## 🔧 Setup Your AI Provider

Parchi works with any OpenAI-compatible endpoint. Open the **Settings** panel (gear icon) to configure.

### Option A: Direct API Key (BYOK)

Use your own API key from any supported provider:

| Provider | API URL | Example Models |
|----------|---------|----------------|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4-turbo`, `o1` |
| **Anthropic** | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022` |
| **Kimi** | `https://api.moonshot.cn/v1` | `moonshot-v1-128k` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Any model on OpenRouter |
| **Local (Ollama, LM Studio)** | `http://localhost:11434/v1` | `llama3`, `mistral`, etc. |
| **Any OpenAI-compatible** | Your endpoint URL | Your model name |

**Steps:**

1. Open **Settings** → select your provider or choose **Custom**
2. Paste your **API Key**
3. Set the **API URL** (auto-filled for known providers)
4. Pick a **Model** from the dropdown (auto-fetched) or type one manually
5. Hit **Save** — start chatting

### Option B: Parchi Account (Proxy Mode)

Sign in with Google or GitHub to use Parchi's hosted proxy. No API keys needed — billing is handled through your Parchi subscription.

1. Open **Settings** → choose **Paid** account mode
2. Sign in via OAuth
3. Select a model and start chatting

---

## 🔑 Use Your Existing AI Subscription

Already paying for **Claude Pro**, **ChatGPT Plus**, **Gemini Advanced**, or another AI subscription? You can route that subscription through Parchi using **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)**.

CLIProxyAPI is an open-source proxy that converts your existing AI subscription access into an OpenAI-compatible API endpoint — no separate API key purchase needed.

### How it works

1. **Install CLIProxyAPI** — follow the [setup guide](https://github.com/router-for-me/CLIProxyAPI)
2. **Authenticate** with your existing provider (Claude, OpenAI, Gemini, etc.) via OAuth
3. **Point Parchi** at the proxy endpoint:
   - Open **Settings** → provider: **Custom**
   - **API URL:** your CLIProxyAPI endpoint (e.g. `http://localhost:PORT/v1`)
   - **API Key:** your proxy token
   - **Model:** the model you want to use
4. **Chat** — requests route through your existing subscription

### Supported subscriptions

| Subscription | What you get |
|--------------|-------------|
| **Claude Pro / Max** | Claude models via your Anthropic account |
| **ChatGPT Plus / Pro** | GPT-4o, o1, etc. via your OpenAI account |
| **Gemini Advanced** | Gemini models via your Google account |
| **Qwen / iFlow** | Additional provider access |

> CLIProxyAPI supports multi-account round-robin, streaming, function calling, and multimodal inputs. See their [documentation](https://help.router-for.me) for full details.

---

## ✨ Features

### Chat & AI

- **Streaming responses** with real-time reasoning display
- **Extended thinking** for Claude models (thinking budget scales with max tokens)
- **Multiple profiles** — save different provider/model/prompt configs and switch instantly
- **Vision support** — analyze screenshots and video frames with vision-capable models
- **Context compaction** — auto-summarizes old conversation when approaching token limits
- **Workflow templates** — save and reuse prompt templates with `/` quick access

### Browser Automation (25+ tools)

Parchi can control your browser through natural language:

| Category | Tools | What they do |
|----------|-------|-------------|
| **Navigate** | `navigate`, `openTab`, `closeTab`, `switchTab` | Go to URLs, manage tabs |
| **Interact** | `click`, `clickAt`, `type`, `pressKey`, `scroll` | Click elements, fill forms, press keys |
| **Read** | `getContent`, `screenshot`, `findHtml` | Extract text, capture pages, search DOM |
| **Video** | `watchVideo`, `getVideoInfo` | Analyze video by frame capture |
| **Organize** | `groupTabs`, `getTabs`, `describeSessionTabs` | Group and list tabs |
| **Plan** | `set_plan`, `update_plan` | Step-by-step task planning and tracking |
| **Delegate** | `spawn_subagent`, `subagent_complete` | Multi-agent orchestration |

### Session Management

- **Session tabs** — auto-groups tabs opened during a session (Chrome)
- **Floating HUD** showing active session tabs
- **Chat history** — up to 50 sessions, 200 messages each
- **Export** conversations as markdown (full, last response, or detailed with tool events)

### Settings & Controls

- **Tool permissions** — toggle read, interact, navigate, tabs, screenshots
- **Domain allowlist** — restrict which sites the agent can act on
- **Action confirmation** — require approval before the agent acts
- **Themes** — Void, Ember, Forest, Ocean, and more
- **UI zoom** — 85% to 125%
- **Custom headers** — add auth tokens or special headers per profile

---

## 🛰 Relay Daemon & CLI

Expose Parchi as a local automation endpoint for scripts and external tools.

```bash
# 1. Build with relay token
PARCHI_RELAY_TOKEN=your-secret npm run build

# 2. Start the daemon
PARCHI_RELAY_TOKEN=your-secret npm run relay:daemon

# 3. Open the extension once — it can auto-pair from localhost /v1/pair.
#    (Manual fallback in Settings → Relay:
#      URL: http://127.0.0.1:17373
#      Token: your-secret)
```

**Safer managed daemon helper (recommended):**

```bash
npm run relay:secure -- start   # generates/stores strong token, loopback-only
npm run relay:secure -- status
npm run relay:secure -- rotate  # rotates token (+ restarts if running)
npm run relay:secure -- stop
```

**CLI commands:**

```bash
export PARCHI_RELAY_TOKEN=your-secret

# List connected agents
npm run relay -- agents

# List available tools
npm run relay -- tools

# Execute a single tool
npm run relay -- tool navigate --args='{"url":"https://example.com"}'

# Run the agent and wait for result
npm run relay -- run "Open example.com and summarize the page"
```

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│                  Side Panel UI                   │
│  Chat · Tools Timeline · Settings · History      │
└──────────────────────┬──────────────────────────┘
                       │ runtime messages
┌──────────────────────▼──────────────────────────┐
│            Background Service Worker             │
│  Agent loop · Tool execution · Stream handling   │
└───────┬───────────────────┬─────────────────────┘
        │                   │
   Chrome APIs         AI Provider
  (tabs, scripting,    (OpenAI, Anthropic,
   navigation)          custom endpoints)
```

**Monorepo workspaces:**

| Workspace | Role |
|------|------|
| `packages/backend/` | Convex backend (auth, billing, API proxy) |
| `packages/cli/` | Local CLI entrypoint and daemon client |
| `packages/extension/` | Browser extension runtime, UI, and tools |
| `packages/relay-service/` | Relay daemon + relay protocol CLI |
| `packages/shared/` | Shared plans, prompts, schemas, and message types |
| `packages/website/` | Static website + billing pages |

---

## 🔨 Development

```bash
npm install                   # install all workspace deps
npm run build                 # build extension + relay + CLI bundles
npm run typecheck             # repo-wide type checking
npm run lint                  # biome linter
npm run lint:fix              # auto-fix lint issues
npm run test:unit             # run unit tests
npm run perf:tabs             # sample Firefox/Chrome tab CPU + RAM
npm run backend:dev           # run Convex dev backend workspace
npm run dev -w @parchi/website  # run website workspace locally
```

After building, reload the extension in `chrome://extensions` to pick up changes.

### Firefox builds

```bash
npm run build:firefox       # build for Firefox → dist/
npm run build:firefox:xpi   # package as .xpi for distribution
```

### Performance leak audits

```bash
TAB_AUDIT_SAMPLES=6 TAB_AUDIT_INTERVAL_MS=10000 npm run perf:tabs
```

Use the full workflow in [`docs/tab-process-performance-playbook.md`](docs/tab-process-performance-playbook.md) to run active/idle audits and validate regressions in Firefox + Chrome.

---

## 📊 Chrome vs Firefox

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Tab grouping | ✅ | — |
| Side panel | ✅ Native | Sidebar (adapted) |
| Relay keepalive | ✅ Offscreen doc | — |
| Min version | MV3 | 109.0+ |

---

<div align="center">

**[Parchi](https://github.com/0xSero/parchi)** is MIT licensed.

Built with the [AI SDK](https://sdk.vercel.ai) · Styled with [Warm Paper](https://github.com/0xSero/parchi) design system

</div>
