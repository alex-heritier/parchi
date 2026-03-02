import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server.js';

const currentMonthKey = () => {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
};

const currentMonthStartMs = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
};

const normalizeCents = (value: number) => {
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount;
};

const normalizeTokens = (value: number) => {
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount)) return 0;
  return amount;
};

const insertCreditTransaction = async (
  ctx: {
    db: {
      insert: (table: any, value: Record<string, unknown>) => Promise<unknown>;
    };
  },
  args: {
    userId: unknown;
    direction: 'credit' | 'debit';
    type: string;
    status: 'posted' | 'reserved' | 'voided' | 'denied';
    amountCents: number;
    balanceAfterCents: number;
    requestId?: string;
    provider?: string;
    model?: string;
    tokenEstimate?: number;
    tokenActual?: number;
    note?: string;
    stripeCheckoutSessionId?: string;
    stripeEventId?: string;
  },
) =>
  ctx.db.insert('creditTransactions', {
    userId: args.userId,
    createdAt: Date.now(),
    direction: args.direction,
    type: args.type,
    status: args.status,
    amountCents: normalizeCents(args.amountCents),
    balanceAfterCents: normalizeCents(args.balanceAfterCents),
    requestId: args.requestId,
    provider: args.provider,
    model: args.model,
    tokenEstimate: args.tokenEstimate,
    tokenActual: args.tokenActual,
    note: args.note,
    stripeCheckoutSessionId: args.stripeCheckoutSessionId,
    stripeEventId: args.stripeEventId,
  });

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();

    const usage = await ctx.db
      .query('usage')
      .withIndex('by_userId_month', (q) => q.eq('userId', userId).eq('month', currentMonthKey()))
      .first();

    const transactions = await ctx.db
      .query('creditTransactions')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .order('desc')
      .take(120);

    const monthStartMs = currentMonthStartMs();
    let monthDebitCents = 0;
    let monthRefundCents = 0;
    let monthPurchasedCents = 0;

    for (const tx of transactions) {
      if (Number(tx?.createdAt || 0) < monthStartMs) continue;
      const amount = normalizeCents(Number(tx?.amountCents || 0));
      if (tx.direction === 'debit' && tx.status !== 'denied' && tx.status !== 'voided') {
        monthDebitCents += amount;
      }
      if (tx.direction === 'credit' && String(tx.type || '').includes('refund')) {
        monthRefundCents += amount;
      }
      if (tx.direction === 'credit' && String(tx.type || '') === 'stripe_credit_purchase') {
        monthPurchasedCents += amount;
      }
    }

    return {
      ...(subscription || {
        userId,
        plan: 'free',
        status: 'inactive',
      }),
      creditBalanceCents: subscription?.creditBalanceCents ?? 0,
      usage: usage || {
        requestCount: 0,
        tokensUsed: 0,
        month: currentMonthKey(),
      },
      cost: {
        month: currentMonthKey(),
        debitCents: monthDebitCents,
        refundedCents: monthRefundCents,
        netSpendCents: Math.max(0, monthDebitCents - monthRefundCents),
        purchasedCents: monthPurchasedCents,
      },
      recentTransactions: transactions.slice(0, 30).map((tx) => ({
        createdAt: tx.createdAt,
        direction: tx.direction,
        type: tx.type,
        status: tx.status,
        amountCents: tx.amountCents,
        balanceAfterCents: tx.balanceAfterCents,
        requestId: tx.requestId,
        provider: tx.provider,
        model: tx.model,
        tokenEstimate: tx.tokenEstimate,
        tokenActual: tx.tokenActual,
        note: tx.note,
      })),
    };
  },
});

export const getByUserId = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (authUserId && String(authUserId) !== String(args.userId)) {
      throw new Error('Unauthorized');
    }
    return ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();
  },
});

export const getByStripeCustomerId = query({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query('subscriptions')
      .withIndex('by_stripeCustomerId', (q) => q.eq('stripeCustomerId', args.stripeCustomerId))
      .first();
  },
});

export const getByStripeSubscriptionId = query({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query('subscriptions')
      .withIndex('by_stripeSubscriptionId', (q) => q.eq('stripeSubscriptionId', args.stripeSubscriptionId))
      .first();
  },
});

export const upsertForUser = mutation({
  args: {
    userId: v.id('users'),
    plan: v.union(v.literal('free'), v.literal('pro')),
    status: v.union(v.literal('active'), v.literal('canceled'), v.literal('past_due'), v.literal('inactive')),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (existing?._id) {
      await ctx.db.patch(existing._id, {
        plan: args.plan,
        status: args.status,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        currentPeriodEnd: args.currentPeriodEnd,
      });
      return ctx.db.get(existing._id);
    }

    const createdId = await ctx.db.insert('subscriptions', {
      userId: args.userId,
      plan: args.plan,
      status: args.status,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      currentPeriodEnd: args.currentPeriodEnd,
    });
    return ctx.db.get(createdId);
  },
});

export const markInactiveForUser = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();
    if (!existing?._id) return null;
    await ctx.db.patch(existing._id, {
      plan: 'free',
      status: 'inactive',
      stripeSubscriptionId: undefined,
      currentPeriodEnd: undefined,
    });
    return ctx.db.get(existing._id);
  },
});

export const recordUsage = mutation({
  args: {
    userId: v.id('users'),
    requestCountIncrement: v.optional(v.number()),
    tokenEstimate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const month = currentMonthKey();
    const increment = Math.max(0, Math.floor(Number(args.requestCountIncrement || 1)));
    const tokens = Math.max(0, normalizeTokens(Number(args.tokenEstimate || 0)));

    const existing = await ctx.db
      .query('usage')
      .withIndex('by_userId_month', (q) => q.eq('userId', args.userId).eq('month', month))
      .first();

    if (existing?._id) {
      await ctx.db.patch(existing._id, {
        requestCount: Number(existing.requestCount || 0) + increment,
        tokensUsed: Number(existing.tokensUsed || 0) + tokens,
      });
      return ctx.db.get(existing._id);
    }

    const createdId = await ctx.db.insert('usage', {
      userId: args.userId,
      month,
      requestCount: increment,
      tokensUsed: tokens,
    });
    return ctx.db.get(createdId);
  },
});

export const adjustUsageTokens = mutation({
  args: {
    userId: v.id('users'),
    tokenDelta: v.number(),
  },
  handler: async (ctx, args) => {
    const month = currentMonthKey();
    const delta = normalizeTokens(args.tokenDelta);
    if (delta === 0) return null;

    const existing = await ctx.db
      .query('usage')
      .withIndex('by_userId_month', (q) => q.eq('userId', args.userId).eq('month', month))
      .first();

    if (!existing?._id) {
      const createdId = await ctx.db.insert('usage', {
        userId: args.userId,
        month,
        requestCount: 0,
        tokensUsed: Math.max(0, delta),
      });
      return ctx.db.get(createdId);
    }

    const nextTokens = Math.max(0, normalizeTokens(Number(existing.tokensUsed || 0) + delta));
    await ctx.db.patch(existing._id, { tokensUsed: nextTokens });
    return ctx.db.get(existing._id);
  },
});

export const addCredits = mutation({
  args: {
    userId: v.id('users'),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const amountCents = normalizeCents(args.amountCents);
    if (amountCents <= 0) {
      const existingBalance = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first();
      return { creditBalanceCents: normalizeCents(existingBalance?.creditBalanceCents ?? 0) };
    }

    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (existing?._id) {
      const newBalance = normalizeCents((existing.creditBalanceCents ?? 0) + amountCents);
      await ctx.db.patch(existing._id, { creditBalanceCents: newBalance });
      await insertCreditTransaction(ctx, {
        userId: args.userId,
        direction: 'credit',
        type: 'manual_credit',
        status: 'posted',
        amountCents,
        balanceAfterCents: newBalance,
      });
      return { creditBalanceCents: newBalance };
    }

    await ctx.db.insert('subscriptions', {
      userId: args.userId,
      plan: 'free',
      status: 'inactive',
      creditBalanceCents: amountCents,
    });
    await insertCreditTransaction(ctx, {
      userId: args.userId,
      direction: 'credit',
      type: 'manual_credit',
      status: 'posted',
      amountCents,
      balanceAfterCents: amountCents,
    });
    return { creditBalanceCents: amountCents };
  },
});

export const applyCreditCheckoutSession = mutation({
  args: {
    userId: v.id('users'),
    stripeCheckoutSessionId: v.string(),
    amountCents: v.number(),
    stripeEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const amountCents = normalizeCents(args.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error(`Invalid amountCents: ${args.amountCents}`);
    }

    const stripeEventId = args.stripeEventId;
    if (stripeEventId) {
      const existingByEvent = await ctx.db
        .query('stripeCreditPurchases')
        .withIndex('by_eventId', (q) => q.eq('stripeEventId', stripeEventId))
        .first();
      if (existingByEvent) {
        const sub = await ctx.db
          .query('subscriptions')
          .withIndex('by_userId', (q) => q.eq('userId', existingByEvent.userId))
          .first();
        return {
          applied: false,
          alreadyApplied: true,
          creditBalanceCents: sub?.creditBalanceCents ?? 0,
        };
      }
    }

    const existingBySession = await ctx.db
      .query('stripeCreditPurchases')
      .withIndex('by_checkoutSessionId', (q) => q.eq('stripeCheckoutSessionId', args.stripeCheckoutSessionId))
      .first();
    if (existingBySession) {
      const sub = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', existingBySession.userId))
        .first();
      return {
        applied: false,
        alreadyApplied: true,
        creditBalanceCents: sub?.creditBalanceCents ?? 0,
      };
    }

    const existingSubscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    const nextBalance = (existingSubscription?.creditBalanceCents ?? 0) + amountCents;
    if (existingSubscription?._id) {
      await ctx.db.patch(existingSubscription._id, { creditBalanceCents: nextBalance });
    } else {
      await ctx.db.insert('subscriptions', {
        userId: args.userId,
        plan: 'free',
        status: 'inactive',
        creditBalanceCents: nextBalance,
      });
    }

    await ctx.db.insert('stripeCreditPurchases', {
      userId: args.userId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripeEventId: args.stripeEventId,
      amountCents,
      creditedAt: Date.now(),
    });

    await insertCreditTransaction(ctx, {
      userId: args.userId,
      direction: 'credit',
      type: 'stripe_credit_purchase',
      status: 'posted',
      amountCents,
      balanceAfterCents: nextBalance,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripeEventId: args.stripeEventId,
      note: 'Stripe checkout completed',
    });

    return {
      applied: true,
      alreadyApplied: false,
      creditBalanceCents: nextBalance,
    };
  },
});

export const reserveCredits = mutation({
  args: {
    userId: v.id('users'),
    amountCents: v.number(),
    requestId: v.string(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    tokenEstimate: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const amountCents = normalizeCents(args.amountCents);
    if (amountCents <= 0) {
      return { success: false, remainingCents: 0 };
    }

    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();
    const currentBalance = normalizeCents(existing?.creditBalanceCents ?? 0);
    if (currentBalance < amountCents || !existing?._id) {
      return { success: false, remainingCents: currentBalance };
    }

    const newBalance = normalizeCents(currentBalance - amountCents);
    await ctx.db.patch(existing._id, { creditBalanceCents: newBalance });
    await insertCreditTransaction(ctx, {
      userId: args.userId,
      direction: 'debit',
      type: 'proxy_reservation',
      status: 'reserved',
      amountCents,
      balanceAfterCents: newBalance,
      requestId: args.requestId,
      provider: args.provider,
      model: args.model,
      tokenEstimate: args.tokenEstimate,
      note: args.note || 'Reserved credits before proxy call',
    });
    return { success: true, remainingCents: newBalance };
  },
});

export const releaseReservedCredits = mutation({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    amountCents: v.number(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    tokenEstimate: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const amountCents = normalizeCents(args.amountCents);
    if (amountCents <= 0) {
      const existingBalance = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first();
      return { success: true, creditBalanceCents: normalizeCents(existingBalance?.creditBalanceCents ?? 0) };
    }

    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    const currentBalance = normalizeCents(existing?.creditBalanceCents ?? 0);
    const nextBalance = normalizeCents(currentBalance + amountCents);
    if (existing?._id) {
      await ctx.db.patch(existing._id, { creditBalanceCents: nextBalance });
    } else {
      await ctx.db.insert('subscriptions', {
        userId: args.userId,
        plan: 'free',
        status: 'inactive',
        creditBalanceCents: nextBalance,
      });
    }

    const reservation = await ctx.db
      .query('creditTransactions')
      .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
      .first();
    if (reservation?._id && reservation.status === 'reserved') {
      await ctx.db.patch(reservation._id, {
        status: 'voided',
        note: args.note || reservation.note || 'Reservation released',
      });
    }

    await insertCreditTransaction(ctx, {
      userId: args.userId,
      direction: 'credit',
      type: 'proxy_refund',
      status: 'posted',
      amountCents,
      balanceAfterCents: nextBalance,
      requestId: args.requestId,
      provider: args.provider,
      model: args.model,
      tokenEstimate: args.tokenEstimate,
      note: args.note || 'Reservation released after failed request',
    });

    return {
      success: true,
      creditBalanceCents: nextBalance,
    };
  },
});

export const settleReservedCredits = mutation({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    reservedAmountCents: v.number(),
    finalAmountCents: v.number(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    tokenEstimate: v.optional(v.number()),
    tokenActual: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reservedAmountCents = normalizeCents(args.reservedAmountCents);
    const finalAmountCents = normalizeCents(args.finalAmountCents);
    if (reservedAmountCents <= 0) {
      return {
        success: false,
        creditBalanceCents: 0,
        chargedAdditionalCents: 0,
        refundedCents: 0,
        shortfallCents: 0,
      };
    }

    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();
    if (!existing?._id) {
      return {
        success: false,
        creditBalanceCents: 0,
        chargedAdditionalCents: 0,
        refundedCents: 0,
        shortfallCents: 0,
      };
    }

    const reservation = await ctx.db
      .query('creditTransactions')
      .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
      .first();
    if (reservation?._id && reservation.status !== 'reserved') {
      return {
        success: true,
        creditBalanceCents: normalizeCents(existing.creditBalanceCents ?? 0),
        chargedAdditionalCents: 0,
        refundedCents: 0,
        shortfallCents: 0,
      };
    }

    let balance = normalizeCents(existing.creditBalanceCents ?? 0);
    let chargedAdditionalCents = 0;
    let refundedCents = 0;
    let shortfallCents = 0;

    if (finalAmountCents < reservedAmountCents) {
      refundedCents = reservedAmountCents - finalAmountCents;
      balance = normalizeCents(balance + refundedCents);
      await ctx.db.patch(existing._id, { creditBalanceCents: balance });
      await insertCreditTransaction(ctx, {
        userId: args.userId,
        direction: 'credit',
        type: 'proxy_settlement_refund',
        status: 'posted',
        amountCents: refundedCents,
        balanceAfterCents: balance,
        requestId: args.requestId,
        provider: args.provider,
        model: args.model,
        tokenEstimate: args.tokenEstimate,
        tokenActual: args.tokenActual,
        note: args.note || 'Refunded reserved credits after settlement',
      });
    } else if (finalAmountCents > reservedAmountCents) {
      const additionalCents = finalAmountCents - reservedAmountCents;
      chargedAdditionalCents = Math.min(additionalCents, balance);
      shortfallCents = Math.max(0, additionalCents - chargedAdditionalCents);
      if (chargedAdditionalCents > 0) {
        balance = normalizeCents(balance - chargedAdditionalCents);
        await ctx.db.patch(existing._id, { creditBalanceCents: balance });
        await insertCreditTransaction(ctx, {
          userId: args.userId,
          direction: 'debit',
          type: 'proxy_settlement_debit',
          status: 'posted',
          amountCents: chargedAdditionalCents,
          balanceAfterCents: balance,
          requestId: args.requestId,
          provider: args.provider,
          model: args.model,
          tokenEstimate: args.tokenEstimate,
          tokenActual: args.tokenActual,
          note: args.note || 'Charged additional credits after settlement',
        });
      }
      if (shortfallCents > 0) {
        await insertCreditTransaction(ctx, {
          userId: args.userId,
          direction: 'debit',
          type: 'proxy_settlement_shortfall',
          status: 'denied',
          amountCents: shortfallCents,
          balanceAfterCents: balance,
          requestId: args.requestId,
          provider: args.provider,
          model: args.model,
          tokenEstimate: args.tokenEstimate,
          tokenActual: args.tokenActual,
          note: 'Settlement shortfall: insufficient credits for full final charge',
        });
      }
    }

    if (reservation?._id && reservation.status === 'reserved') {
      await ctx.db.patch(reservation._id, {
        status: 'posted',
        tokenActual: args.tokenActual,
        note: args.note || reservation.note || 'Reservation settled',
      });
    }

    return {
      success: true,
      creditBalanceCents: balance,
      chargedAdditionalCents,
      refundedCents,
      shortfallCents,
    };
  },
});

export const deductCredits = mutation({
  args: {
    userId: v.id('users'),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const amountCents = normalizeCents(args.amountCents);
    if (amountCents <= 0) {
      const existingBalance = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first();
      return { success: true, remainingCents: normalizeCents(existingBalance?.creditBalanceCents ?? 0) };
    }
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    const currentBalance = existing?.creditBalanceCents ?? 0;
    if (currentBalance < amountCents) {
      return { success: false, remainingCents: currentBalance };
    }

    const newBalance = normalizeCents(currentBalance - amountCents);
    if (existing?._id) {
      await ctx.db.patch(existing._id, { creditBalanceCents: newBalance });
      await insertCreditTransaction(ctx, {
        userId: args.userId,
        direction: 'debit',
        type: 'manual_debit',
        status: 'posted',
        amountCents,
        balanceAfterCents: newBalance,
      });
    }
    return { success: true, remainingCents: newBalance };
  },
});

export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { creditBalanceCents: 0 };

    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();

    return { creditBalanceCents: subscription?.creditBalanceCents ?? 0 };
  },
});
