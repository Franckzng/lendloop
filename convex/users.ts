import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

async function findByClerkId(
  ctx: Ctx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/**
 * Returns the signed-in user's record, or throws.
 * Every protected query and mutation starts with this call (or requireAdmin).
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("You must be signed in.");
  }
  const user = await findByClerkId(ctx, identity.subject);
  if (user === null) {
    throw new ConvexError("Your account is not set up yet. Please try again.");
  }
  return user;
}

/** Same as getCurrentUser, but also requires the admin role. */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required.");
  }
  return user;
}

/**
 * Creates the user record on first sign-in and keeps name/email in sync.
 * Takes no arguments: everything comes from the verified Clerk token, and
 * the role is always "user" on creation and never changed here.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You must be signed in.");
    }
    // `email` and `name` are custom claims added to the Clerk session token
    // (see README). They can be missing or empty, e.g. no name on the account.
    if (!identity.email) {
      throw new ConvexError("Your account needs an email address.");
    }
    const name = identity.name || identity.email;

    const existing = await findByClerkId(ctx, identity.subject);
    if (existing !== null) {
      if (existing.name !== name || existing.email !== identity.email) {
        await ctx.db.patch(existing._id, { name, email: identity.email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name,
      email: identity.email,
      role: "user",
      trustedLender: false,
    });
  },
});

/**
 * The signed-in user's own profile, for display.
 * Returns null (instead of throwing) while signed out or before `store` ran,
 * so the UI can show a loading state.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    const user = await findByClerkId(ctx, identity.subject);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});
