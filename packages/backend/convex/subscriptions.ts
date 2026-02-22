import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const currentMonthKey = () => {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
};

export const getCurrent = queryGeneric({
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
      .withIndex('by_userId_month', (q: any) => q.eq('userId', userId).eq('month', currentMonthKey()))
      .first();

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
    };
  },
});

export const getByUserId = queryGeneric({
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

export const getByStripeCustomerId = queryGeneric({
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

export const getByStripeSubscriptionId = queryGeneric({
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

export const upsertForUser = mutationGeneric({
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

export const markInactiveForUser = mutationGeneric({
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

export const recordUsage = mutationGeneric({
  args: {
    userId: v.id('users'),
    requestCountIncrement: v.optional(v.number()),
    tokenEstimate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const month = currentMonthKey();
    const increment = Number(args.requestCountIncrement || 1);
    const tokens = Number(args.tokenEstimate || 0);

    const existing = await ctx.db
      .query('usage')
      .withIndex('by_userId_month', (q: any) => q.eq('userId', args.userId).eq('month', month))
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

export const addCredits = mutationGeneric({
  args: {
    userId: v.id('users'),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (existing?._id) {
      const newBalance = (existing.creditBalanceCents ?? 0) + args.amountCents;
      await ctx.db.patch(existing._id, { creditBalanceCents: newBalance });
      return { creditBalanceCents: newBalance };
    }

    await ctx.db.insert('subscriptions', {
      userId: args.userId,
      plan: 'free',
      status: 'inactive',
      creditBalanceCents: args.amountCents,
    });
    return { creditBalanceCents: args.amountCents };
  },
});

export const deductCredits = mutationGeneric({
  args: {
    userId: v.id('users'),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    const currentBalance = existing?.creditBalanceCents ?? 0;
    if (currentBalance < args.amountCents) {
      return { success: false, remainingCents: currentBalance };
    }

    const newBalance = currentBalance - args.amountCents;
    if (existing?._id) {
      await ctx.db.patch(existing._id, { creditBalanceCents: newBalance });
    }
    return { success: true, remainingCents: newBalance };
  },
});

export const getBalance = queryGeneric({
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
