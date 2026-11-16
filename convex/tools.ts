import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
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

/** Today's calendar day in UTC, in the same "YYYY-MM-DD" format as loans. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tools that are currently out: an approved loan has started and the tool
 * has not been marked as returned yet (this includes overdue loans).
 */
async function toolIdsOnLoan(ctx: QueryCtx): Promise<Set<Id<"tools">>> {
  const today = todayUtc();
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_status_end", (q) => q.eq("status", "approved"))
    .collect();
  return new Set(
    approved.filter((loan) => loan.startDate <= today).map((loan) => loan.toolId),
  );
}

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

    const onLoan = await toolIdsOnLoan(ctx);
    const ownerIds = [...new Set(tools.map((tool) => tool.ownerId))];
    const owners = await Promise.all(
      ownerIds.map((ownerId) => ctx.db.get("users", ownerId)),
    );
    const ownerNames = new Map(
      ownerIds.map((ownerId, index) => [ownerId, owners[index]?.name]),
    );

    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      // The owner's name only: their email is never sent to other users.
      ownerName: ownerNames.get(tool.ownerId) ?? "Unknown",
      isMine: tool.ownerId === user._id,
      available: !onLoan.has(tool._id),
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
    const onLoan = await toolIdsOnLoan(ctx);

    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      available: !onLoan.has(tool._id),
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

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await requireOwnedTool(ctx, toolId);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();

    if (loans.some((loan) => loan.status === "approved")) {
      throw new ConvexError(
        "This tool has an approved loan. Mark it as returned before deleting.",
      );
    }
    // Requests still waiting for an answer cannot be fulfilled any more.
    const pending = loans.filter((loan) => loan.status === "pending");
    await Promise.all(
      pending.map((loan) =>
        ctx.db.patch("loans", loan._id, { status: "declined" }),
      ),
    );
    await ctx.db.delete("tools", tool._id);
  },
});
