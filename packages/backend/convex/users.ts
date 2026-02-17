import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

export const me = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.get(userId);
  },
});

export const updateProfile = mutationGeneric({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Unauthorized');
    }
    const patch: Record<string, string> = {};
    if (typeof args.name === 'string') patch.name = args.name;
    if (typeof args.image === 'string') patch.image = args.image;
    await ctx.db.patch(userId, patch);
    return ctx.db.get(userId);
  },
});
