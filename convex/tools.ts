import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { todayUtc } from "./dates";
import { notifyStatusChange } from "./notifications";
import {
  categoryValidator,
  conditionValidator,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
} from "./toolOptions";
import { getCurrentUser } from "./users";

/** Upper bound on any tool list, so no query can grow without limit. */
const MAX_LISTED_TOOLS = 100;

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

type ToolInput = Pick<
  Doc<"tools">,
  "name" | "category" | "condition" | "description"
>;

/** Trims the text fields and enforces their length limits. */
function validateTool(input: ToolInput): ToolInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length === 0) {
    throw new ConvexError("Please give the tool a name.");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(
      `The name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ConvexError(
      `The description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
    );
  }
  return { ...input, name, description };
}

type Booking = { startDate: string; endDate: string };

type Availability = {
  /** False while the tool is out: started, approved, and not returned yet. */
  available: boolean;
  /** Approved loans that are current or upcoming, soonest first. */
  bookings: Booking[];
};

/**
 * Availability of every tool that has an approved loan. A tool counts as out
 * from the start date until it is marked as returned, overdue loans included.
 */
async function loadAvailability(
  ctx: QueryCtx,
): Promise<Map<Id<"tools">, Availability>> {
  const today = todayUtc();
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_status_end", (q) => q.eq("status", "approved"))
    .collect();

  const byTool = new Map<Id<"tools">, Availability>();
  for (const loan of approved) {
    const entry = byTool.get(loan.toolId) ?? { available: true, bookings: [] };
    if (loan.startDate <= today) {
      entry.available = false;
    }
    if (loan.endDate >= today) {
      entry.bookings.push({ startDate: loan.startDate, endDate: loan.endDate });
    }
    byTool.set(loan.toolId, entry);
  }
  for (const entry of byTool.values()) {
    entry.bookings.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  return byTool;
}

const NO_LOANS: Availability = { available: true, bookings: [] };

/** Loads a tool and checks that the signed-in user owns it. */
async function requireOwnedTool(
  ctx: MutationCtx,
  toolId: Id<"tools">,
): Promise<Doc<"tools">> {
  const user = await getCurrentUser(ctx);
  const tool = await ctx.db.get("tools", toolId);
  if (tool === null) {
    throw new ConvexError("This tool no longer exists.");
  }
  if (tool.ownerId !== user._id) {
    throw new ConvexError("You can only change your own tools.");
  }
  return tool;
}

/**
 * Public, no sign-in required. Returns the name and category only:
 * no owner, no description, no condition.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .order("desc")
      .take(MAX_LISTED_TOOLS);
    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
    }));
  },
});

/** All tools with their availability, for signed-in users. */
export const listAll = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const user = await getCurrentUser(ctx);

    const tools =
      category === undefined
        ? await ctx.db.query("tools").order("desc").take(MAX_LISTED_TOOLS)
        : await ctx.db
            .query("tools")
            .withIndex("by_category", (q) => q.eq("category", category))
            .order("desc")
            .take(MAX_LISTED_TOOLS);

    const availability = await loadAvailability(ctx);
    const ownerIds = [...new Set(tools.map((tool) => tool.ownerId))];
    const owners = await Promise.all(
      ownerIds.map((ownerId) => ctx.db.get("users", ownerId)),
    );
    const ownersById = new Map(
      ownerIds.map((ownerId, index) => [ownerId, owners[index]]),
    );

    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      // The owner's name only: their email is never sent to other users.
      ownerName: ownersById.get(tool.ownerId)?.name ?? "Unknown",
      ownerTrusted: ownersById.get(tool.ownerId)?.trustedLender ?? false,
      isMine: tool.ownerId === user._id,
      // Dates only: who borrowed the tool is not shown to other users.
      ...(availability.get(tool._id) ?? NO_LOANS),
    }));
  },
});

/** The signed-in user's own tools. */
export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(MAX_LISTED_TOOLS);
    const availability = await loadAvailability(ctx);

    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      available: (availability.get(tool._id) ?? NO_LOANS).available,
    }));
  },
});

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    // The owner is always the signed-in user, never a value from the client.
    const user = await getCurrentUser(ctx);
    return await ctx.db.insert("tools", {
      ...validateTool(args),
      ownerId: user._id,
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    const tool = await requireOwnedTool(ctx, toolId);
    await ctx.db.patch("tools", tool._id, validateTool(fields));
  },
});

/**
 * Deletes a tool. Shared by the owner's `remove` and the admin's
 * `removeAnyListing`, so both follow the same rules: never while a loan is
 * approved, and requests still waiting for an answer are declined.
 * The caller is responsible for the access check.
 */
export async function deleteToolAndCloseRequests(
  ctx: MutationCtx,
  tool: Doc<"tools">,
): Promise<void> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
    .collect();

  if (loans.some((loan) => loan.status === "approved")) {
    throw new ConvexError(
      "This tool has an approved loan. It must be marked as returned before it can be deleted.",
    );
  }
  const pending = loans.filter((loan) => loan.status === "pending");
  for (const loan of pending) {
    await ctx.db.patch("loans", loan._id, { status: "declined" });
    await notifyStatusChange(ctx, loan._id);
  }
  await ctx.db.delete("tools", tool._id);
}

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await requireOwnedTool(ctx, toolId);
    await deleteToolAndCloseRequests(ctx, tool);
  },
});
