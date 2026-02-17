# Convex Integration Plan — Browser-AI Account & Payment System

## Context

The extension currently has no backend — all settings, API keys, and profiles live in `chrome.storage.local`. We want to add user accounts so we can accept payments. Users choose one of two paths on install:

1. **BYOK (Bring Your Own Key)** — free, works exactly as today
2. **Paid Plan** — user pays a subscription, AI calls are proxied through Convex HTTP Actions using server-managed API keys

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Chrome Extension (packages/extension/)          │
│                                                  │
│  Sidepanel UI ──→ Convex Auth (login/signup)     │
│                ──→ chrome.storage.local (BYOK)   │
│                ──→ Convex DB (account, sub)       │
│                                                  │
│  Background ──→ BYOK: direct AI provider calls   │
│              ──→ Paid: Convex HTTP Action proxy   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Convex Backend (packages/backend/convex/)       │
│                                                  │
│  Auth: Email/Password + Google + GitHub OAuth     │
│  DB: users, subscriptions, usage                 │
│  HTTP Actions: /ai-proxy (streams AI responses)  │
│  HTTP Actions: /stripe-webhook                   │
│  Actions: createCheckoutSession, manageSubscription│
└─────────────────────────────────────────────────┘
```

## Decisions Made

- **AI Proxy:** Convex HTTP Actions (all-in-one, no extra infra)
- **Auth:** Email/Password + Google OAuth + GitHub OAuth via `@convex-dev/auth`
- **Location:** `packages/backend/` (new monorepo package)
- **Payment:** Stripe Checkout + webhook handling

---

## Phase 1: Convex Backend Setup

### 1.1 Create `packages/backend/`

```
packages/backend/
├── package.json
├── convex/
│   ├── schema.ts          # DB schema
│   ├── auth.ts            # Auth config (providers)
│   ├── http.ts            # HTTP router (auth routes, stripe webhook, AI proxy)
│   ├── users.ts           # User queries/mutations
│   ├── subscriptions.ts   # Subscription queries/mutations
│   ├── payments.ts        # Stripe checkout action
│   └── aiProxy.ts         # AI proxy HTTP action
└── .env.local             # CONVEX_URL (gitignored)
```

### 1.2 Schema (`convex/schema.ts`)

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // authTables already creates `users` with name, email, etc.

  subscriptions: defineTable({
    userId: v.id("users"),
    plan: v.union(v.literal("free"), v.literal("pro")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("inactive")
    ),
    currentPeriodEnd: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

  usage: defineTable({
    userId: v.id("users"),
    month: v.string(), // "2026-02"
    requestCount: v.number(),
    tokensUsed: v.number(),
  })
    .index("by_userId_month", ["userId", "month"]),
});
```

### 1.3 Auth Config (`convex/auth.ts`)

- Providers: `Password`, `GitHub`, `Google`
- Environment variables: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`

### 1.4 AI Proxy HTTP Action (`convex/aiProxy.ts` + route in `http.ts`)

- Receives POST requests from the extension with: model, messages, settings
- Validates the user's auth token (from Authorization header)
- Checks subscription is active
- Increments usage counters
- Forwards the request to the AI provider (OpenAI/Anthropic) with server-side API keys
- Streams the response back to the extension
- Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

### 1.5 Stripe Integration

- `payments.ts`: `createCheckoutSession` action — creates Stripe Checkout session, returns URL
- `http.ts`: `/stripe-webhook` route — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`

---

## Phase 2: Extension Client Integration

### 2.1 New Files

```
packages/extension/
├── convex/
│   └── client.ts          # ConvexClient setup, auth helpers, chromeTokenStorage
├── sidepanel/ui/
│   └── account/
│       ├── panel-account.ts    # Account UI mixin (login/signup/manage)
│       └── account-styles.css  # Account panel styles
```

### 2.2 Convex Client (`packages/extension/convex/client.ts`)

- Creates `ConvexClient` from `"convex/browser"` with deployment URL (build-time constant)
- Custom `chromeTokenStorage` using `chrome.storage.local` for auth tokens
- Exports: `convexClient`, `signIn()`, `signOut()`, `getAuthState()`, `getSubscription()`
- Uses `anyApi` from `"convex/server"` since backend is in separate package

### 2.3 Account UI (`panel-account.ts`)

New mixin on `SidePanelUI` following existing pattern:
- **Onboarding screen** (shown on first install): "Use your own API keys" vs "Get a subscription"
- **Login/signup form**: email/password fields, Google/GitHub OAuth buttons
- **Account section** in settings: shows plan, usage, manage subscription button
- Attaches to existing settings panel as a new collapsible section

### 2.4 Background Service Changes (`background/service.ts`)

Modify the AI call path:
- On startup, initialize Convex client (if user has account)
- Before each AI call, check: does user have own API key set? → use it directly (BYOK)
- No API key + active subscription? → route through Convex HTTP Action proxy
- No API key + no subscription? → show "add API key or subscribe" message

### 2.5 Build Changes (`scripts/build.mjs`)

- Add `CONVEX_URL` as esbuild `define` constant (from env or hardcoded for prod)
- Ensure `convex/browser` module is bundled correctly for extension
- No changes to entry points needed — new code imports into existing entries

### 2.6 Manifest Changes

- Add Convex deployment domain to `host_permissions`: `https://*.convex.cloud/*`, `https://*.convex.site/*`

---

## Phase 3: Payment Flow

### User Journey (Paid Path)

1. User clicks "Get a subscription" on onboarding (or "Upgrade" in settings)
2. Extension calls `convexClient.action(anyApi.payments.createCheckoutSession, {})`
3. Action returns Stripe Checkout URL
4. Extension opens URL in new tab (`chrome.tabs.create`)
5. User completes payment on Stripe
6. Stripe webhook fires → Convex creates/updates subscription record
7. Extension polls or subscribes to subscription status → unlocks paid features
8. AI calls now routed through Convex proxy

### User Journey (BYOK Path)

1. User clicks "Use your own keys" on onboarding
2. Extension shows existing settings panel (provider, API key, model)
3. Works exactly as today — no Convex account required
4. Optional: user can later create account for cloud sync / backup

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/backend/package.json` | Backend package config |
| `packages/backend/convex/schema.ts` | Database schema |
| `packages/backend/convex/auth.ts` | Auth providers config |
| `packages/backend/convex/http.ts` | HTTP router (auth, webhook, proxy) |
| `packages/backend/convex/users.ts` | User queries/mutations |
| `packages/backend/convex/subscriptions.ts` | Subscription CRUD |
| `packages/backend/convex/payments.ts` | Stripe checkout action |
| `packages/backend/convex/aiProxy.ts` | AI proxy HTTP action |
| `packages/extension/convex/client.ts` | Extension Convex client |
| `packages/extension/sidepanel/ui/account/panel-account.ts` | Account UI mixin |
| `packages/extension/sidepanel/styles/account.css` | Account styles |

## Files to Modify

| File | Change |
|------|--------|
| `packages/extension/manifest.json` | Add Convex domains to host_permissions |
| `packages/extension/background/service.ts` | Add subscription check + proxy routing |
| `packages/extension/sidepanel/ui/core/panel-core.ts` | Initialize account UI, add account section |
| `packages/extension/sidepanel/ui/settings/panel-settings.ts` | Add account section to settings |
| `packages/extension/sidepanel/templates/main.html` | Add account UI containers |
| `packages/extension/sidepanel/panel.ts` | Import account mixin |
| `scripts/build.mjs` | Add CONVEX_URL define |
| `package.json` (root) | Add backend workspace, convex deps |

---

## Verification

1. **Backend:** `cd packages/backend && npx convex dev` — schema deploys, functions sync
2. **Auth:** Sign up with email, verify login works, test Google/GitHub OAuth
3. **BYOK flow:** Existing behavior unchanged — enter API key, chat works
4. **Paid flow:** Create checkout → pay with Stripe test card → subscription activates → AI calls proxy through Convex
5. **Proxy:** Send a message as paid user → response streams back via Convex HTTP action
6. **Cancellation:** Cancel in Stripe → webhook fires → subscription deactivated → proxy stops working
7. **Build:** `npm run build` from root succeeds, extension loads in Chrome

---

## Implementation Order

1. Backend setup (schema, auth, basic functions) — can test independently via Convex dashboard
2. Extension client + account UI (login/signup flow)
3. Stripe integration (checkout, webhook, subscription management)
4. AI proxy HTTP action (the most complex piece)
5. Background service routing (BYOK vs proxy decision logic)
6. Polish (onboarding flow, error handling, loading states)
