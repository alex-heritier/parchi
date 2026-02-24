import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  subscriptions: defineTable({
    userId: v.id('users'),
    plan: v.union(v.literal('free'), v.literal('pro')),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('canceled'), v.literal('past_due'), v.literal('inactive')),
    currentPeriodEnd: v.optional(v.number()),
    creditBalanceCents: v.optional(v.number()),
  })
    .index('by_userId', ['userId'])
    .index('by_stripeCustomerId', ['stripeCustomerId'])
    .index('by_stripeSubscriptionId', ['stripeSubscriptionId']),

  usage: defineTable({
    userId: v.id('users'),
    month: v.string(),
    requestCount: v.number(),
    tokensUsed: v.number(),
  }).index('by_userId_month', ['userId', 'month']),

  stripeCreditPurchases: defineTable({
    userId: v.id('users'),
    stripeCheckoutSessionId: v.string(),
    stripeEventId: v.optional(v.string()),
    amountCents: v.number(),
    creditedAt: v.number(),
  })
    .index('by_checkoutSessionId', ['stripeCheckoutSessionId'])
    .index('by_eventId', ['stripeEventId'])
    .index('by_userId', ['userId']),

  creditTransactions: defineTable({
    userId: v.id('users'),
    createdAt: v.number(),
    direction: v.union(v.literal('credit'), v.literal('debit')),
    type: v.string(),
    status: v.union(v.literal('posted'), v.literal('reserved'), v.literal('voided'), v.literal('denied')),
    amountCents: v.number(),
    balanceAfterCents: v.number(),
    requestId: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    tokenEstimate: v.optional(v.number()),
    tokenActual: v.optional(v.number()),
    note: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripeEventId: v.optional(v.string()),
  })
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_requestId', ['requestId']),
});
