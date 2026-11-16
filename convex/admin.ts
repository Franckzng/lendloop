import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { todayUtc } from "./dates";
import { deleteToolAndCloseRequests } from "./tools";
import { requireAdmin } from "./users";

// Every function in this file starts with requireAdmin: the role is read
// from the caller's own record in the database, never from the request.

/** Upper bound on any admin list, so no query can grow without limit. */
const MAX_LISTED = 200;

/** Looks up the display name of each given user. */
async function loadUserNames(
  ctx: QueryCtx,
  ids: Id<"users">[],
): Promise<Map<Id<"users">, string | undefined>> {
  const uniqueIds = [...new Set(ids)];
  const users = await Promise.all(
    uniqueIds.map((id) => ctx.db.get("users", id)),
  );
  return new Map(uniqueIds.map((id, index) => [id, users[index]?.name]));
}

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(MAX_LISTED);
    // The email is shown to admins only, to tell apart accounts with the same name.
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      trustedLender: user.trustedLender,
    }));
  },
});

export const listAllListings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await ctx.db.query("tools").order("desc").take(MAX_LISTED);
    const ownerNames = await loadUserNames(
      ctx,
      tools.map((tool) => tool.ownerId),
    );
    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      ownerName: ownerNames.get(tool.ownerId) ?? "Unknown",
    }));
  },
});

export const listAllLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(MAX_LISTED);
    const toolIds = [...new Set(loans.map((loan) => loan.toolId))];
    const tools = await Promise.all(
      toolIds.map((toolId) => ctx.db.get("tools", toolId)),
    );
    const toolNames = new Map(
      toolIds.map((id, index) => [id, tools[index]?.name]),
    );
    const userNames = await loadUserNames(
      ctx,
      loans.flatMap((loan) => [loan.ownerId, loan.borrowerId]),
    );
    const today = todayUtc();

    return loans.map((loan) => ({
      _id: loan._id,
      toolName: toolNames.get(loan.toolId) ?? "Deleted tool",
      ownerName: userNames.get(loan.ownerId) ?? "Unknown",
      borrowerName: userNames.get(loan.borrowerId) ?? "Unknown",
      startDate: loan.startDate,
      endDate: loan.endDate,
      status: loan.status,
      overdue: loan.status === "approved" && loan.endDate < today,
    }));
  },
});

export const removeAnyListing = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (tool === null) {
      throw new ConvexError("This tool no longer exists.");
    }
    await deleteToolAndCloseRequests(ctx, tool);
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), value: v.boolean() },
  handler: async (ctx, { userId, value }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) {
      throw new ConvexError("This user no longer exists.");
    }
    await ctx.db.patch("users", user._id, { trustedLender: value });
  },
});
