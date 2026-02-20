# Report: OpenRouter Provider Integration

## Problem
OpenRouter was lumped under "Custom / OpenRouter" — a single dropdown option that required manual endpoint configuration. No dedicated provider logic, no proxy support, no model hints. Users had to know the exact base URL and configure headers manually.

## What Changed

### Files Modified (5)
| File | Change |
|------|--------|
| `ai/sdk-client.ts` | Added `'openrouter'` to `proxyProvider` union; added proxy branch and direct branch using `createOpenAICompatible` |
| `templates/panels/settings-general.html` | Split "Custom / OpenRouter" into separate `<option>` entries |
| `templates/panels/settings-profiles.html` | Added OpenRouter option to profile editor dropdown |
| `ui/settings/panel-settings.ts` | Updated `toggleCustomEndpoint`, model hints, validation for openrouter |
| `background/service.ts` | Updated `applyConvexProxyProfile`, `isVisionModelProfile`, `enableAnthropicThinking` for openrouter |

### Lines Added/Removed
- **+68 / -7** across source files (net +61)

## Design Decisions

1. **`createOpenAICompatible` over `createOpenAI`** — OpenRouter is OpenAI-compatible but requires `HTTP-Referer` and `X-Title` headers. Using `createOpenAICompatible` from `@ai-sdk/openai-compatible` gives full header control without hacks.

2. **Proxy path** — Added `/ai-proxy/openrouter` proxy route using the auth token directly as API key (same pattern as OpenAI proxy). This enables the revenue-sharing model when proxy is enabled.

3. **Vision detection** — OpenRouter routes to many models. `isVisionModelProfile` now pattern-matches the model name for known vision-capable models: `/(claude|gpt-4o|gpt-4-turbo|gemini|vision)/i`.

4. **Thinking support** — Extended `enableAnthropicThinking` to detect `openrouter` provider + Claude model combo, enabling extended thinking for Anthropic models accessed via OpenRouter.

## What's NOT Included
- OAuth PKCE flow for OpenRouter's revenue sharing program. This requires a server-side component and redirect URI registration. Deferred for a separate iteration.
- Model list fetching from OpenRouter's `/models` API. Users type model IDs manually (consistent with other providers).

## Risk Assessment
- **Low risk**: All changes are additive. Existing providers untouched. OpenRouter branch only executes when `provider === 'openrouter'`.
- **Edge case**: If a user had previously saved `provider: 'custom'` with an OpenRouter endpoint, it still works through the custom path. No migration needed.
