---
name: parchi-relay
description: Use Parchi Relay to control a real browser via the Parchi extension agent (WebSocket) or directly via JSON-RPC from a CLI/tooling workflow.
---

# Parchi Relay (How To Use It)

This skill documents how to run the Parchi relay daemon, connect the browser extension as an agent, and use the CLI to drive browser automation.

## What You Get

- A local relay daemon (`/v1/rpc` + `/v1/extension`) that brokers calls.
- A browser extension agent that connects to the daemon over WebSocket and executes browser tools.
- A CLI (`parchi-relay` / `npm run relay`) that can:
  - list agents
  - pick the default agent
  - list tools / call tools
  - run an agent task and wait for completion

## Quickstart (Local)

1. Build everything:
```bash
npm install
npm run build
```

2. Start the relay daemon (terminal A):
```bash
npm run relay:daemon -- --token=<YOUR_TOKEN> --host=127.0.0.1 --port=17373
```

3. Load the extension (Chrome):

- Open `chrome://extensions`
- Enable Developer mode
- Load unpacked: `dist/`
- Open the extension sidepanel
- Settings -> Relay:
  - Enable: `On`
  - URL: `http://127.0.0.1:17373`
  - Token: `<YOUR_TOKEN>`
  - Click `Apply`

4. Confirm the agent is connected (terminal B):
```bash
npm run relay -- agents --token=<YOUR_TOKEN>
```

## CLI Usage (Real Commands)

The CLI talks to the daemon over HTTP JSON-RPC.

Set env vars (recommended):
```bash
export PARCHI_RELAY_TOKEN="<YOUR_TOKEN>"
export PARCHI_RELAY_HOST="127.0.0.1"
export PARCHI_RELAY_PORT="17373"
```

List agents:
```bash
npm run relay -- agents
```

Doctor (sanity-check daemon, auth, agent connection, tool forwarding):
```bash
npm run relay -- doctor
```

Get/set default agent:
```bash
npm run relay -- default-agent get
npm run relay -- default-agent set agent-123
```

List tools (on default agent or a specific agent):
```bash
npm run relay -- tools
npm run relay -- tools --agentId=agent-123
```

Call a tool:
```bash
npm run relay -- tool getTabs --args='{}'
npm run relay -- tool getContent --args='{\"mode\":\"text\"}'
```

Run a full agent task and wait for completion:
```bash
npm run relay -- run "On the active tab, extract the main headline." --tabs=active --timeoutMs=600000
```

## RPC Surface (What The Relay Exposes)

Relay daemon (`POST /v1/rpc`, `Authorization: Bearer <token>`):

- `relay.ping`
- `agents.list`
- `agents.default.get`
- `agents.default.set` `{ agentId }`
- `tools.list` `{ agentId? }`
- `tool.call` `{ tool, args, agentId? }`
- `agent.run` `{ prompt, selectedTabIds?, agentId? }`
- `run.wait` `{ runId, timeoutMs? }`
- `run.events` `{ runId }`

Extension agent (WebSocket `/v1/extension?token=...`):

- Sends: `agent.hello` (registers the agent)
- Receives: JSON-RPC requests (forwarded by daemon)
- Sends: JSON-RPC responses
- Can publish: `run.event` / `run.done` notifications (for streamed run telemetry)

## Troubleshooting

- `agents` returns `[]`:
  - confirm daemon token matches extension token
  - confirm you loaded `dist/` (not `packages/extension/`)
  - in the extension, Settings -> Relay should show connected status (and any error message)

- Tool calls fail due to policy:
  - check the extension Settings -> Tool Permissions and Allowed Domains

## Notes For Production Use

- Keep the relay token private. Treat it like a local admin password.
- Bind to `127.0.0.1` unless you explicitly intend to expose it.
- If you expose it beyond localhost, add additional auth and transport security.

## Electron Agent Mode

Parchi now supports a dedicated relay-native Electron agent:

```bash
# Terminal A
PARCHI_RELAY_TOKEN=<TOKEN> npm run relay:daemon

# Terminal B
PARCHI_RELAY_TOKEN=<TOKEN> npm run electron:agent
```

Then select the Electron agent with:

```bash
npm run relay -- agents
npm run relay -- default-agent set <electron-agent-id>
```

Useful methods:
- `tool.call` with `electron.launch`
- `tool.call` with `electron.connect`
- `tool.call` with `electron.snapshot`, `electron.click`, `electron.type`, `electron.press`
