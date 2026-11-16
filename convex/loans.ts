import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { addDays, isValidDay, rangesOverlap, todayUtc } from "./dates";
import { notifyStatusChange } from "./notifications";
import { getCurrentUser } from "./users";

/** Upper bound on any loan list, so no query can grow without limit. */
const MAX_LISTED_LOANS = 100;

const DELETED_TOOL_NAME = "Deleted tool";

type LoanStatus = Doc<"loans">["status"];

/** Requests waiting for an answer first, then loans in progress, then history. */
const STATUS_ORDER: Record<LoanStatus, number> = {
  pending: 0,
  approved: 1,
  returned: 2,
  declined: 3,
};

/**
 * Loads a loan and checks that the signed-in user owns the tool.
 * Only the owner answers a request, and only the owner confirms a return:
 * the owner is the one who sees the tool come back, and a borrower able to
 * mark a loan as returned could free the tool without bringing it back.
 */
async function requireLoanAsOwner(
  ctx: MutationCtx,
  loanId: Id<"loans">,
): Promise<Doc<"loans">> {
  const user = await getCurrentUser(ctx);
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) {
    throw new ConvexError("This request no longer exists.");
  }
  if (loan.ownerId !== user._id) {
    throw new ConvexError("Only the owner of the tool can do this.");
  }
  return loan;
}

/** Rejects any transition that does not start from the expected status. */
function requireStatus(
  loan: Doc<"loans">,
  expected: LoanStatus,
  action: string,
): void {
  if (loan.status !== expected) {
    throw new ConvexError(
      `Only ${expected} requests can be ${action}. This one is ${loan.status}.`,
    );
  }
}

async function loansForTool(
  ctx: QueryCtx,
  toolId: Id<"tools">,
): Promise<Doc<"loans">[]> {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
}

export const requestLoan = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await getCurrentUser(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (tool === null) {
      throw new ConvexError("This tool no longer exists.");
    }
    if (tool.ownerId === user._id) {
      throw new ConvexError("You cannot borrow your own tool.");
    }
    if (!isValidDay(startDate) || !isValidDay(endDate)) {
      throw new ConvexError("Please choose a valid start and end date.");
    }
    if (endDate < startDate) {
      throw new ConvexError("The end date must be on or after the start date.");
    }
    // One day of tolerance: the server counts in UTC, the borrower may not.
    if (startDate < addDays(todayUtc(), -1)) {
      throw new ConvexError("The start date cannot be in the past.");
    }

    const requested = { startDate, endDate };
    const existing = await loansForTool(ctx, toolId);
    const overlapping = existing.filter((loan) => rangesOverlap(loan, requested));
    if (overlapping.some((loan) => loan.status === "approved")) {
      throw new ConvexError("This tool is already booked for those dates.");
    }
    if (
      overlapping.some(
        (loan) => loan.status === "pending" && loan.borrowerId === user._id,
      )
    ) {
      throw new ConvexError(
        "You already have a pending request for those dates.",
      );
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      // Taken from the tool, never from the client.
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await notifyStatusChange(ctx, loanId);
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await requireLoanAsOwner(ctx, loanId);
    requireStatus(loan, "pending", "approved");
    if (loan.endDate < todayUtc()) {
      throw new ConvexError(
        "The dates of this request have passed. Decline it instead.",
      );
    }
    // Checked again here: another request may have been approved meanwhile.
    const others = await loansForTool(ctx, loan.toolId);
    const conflict = others.some(
      (other) =>
        other._id !== loan._id &&
        other.status === "approved" &&
        rangesOverlap(other, loan),
    );
    if (conflict) {
      throw new ConvexError(
        "These dates overlap a loan you have already approved.",
      );
    }
    await ctx.db.patch("loans", loan._id, { status: "approved" });
    await notifyStatusChange(ctx, loan._id);
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await requireLoanAsOwner(ctx, loanId);
    requireStatus(loan, "pending", "declined");
    await ctx.db.patch("loans", loan._id, { status: "declined" });
    await notifyStatusChange(ctx, loan._id);
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await requireLoanAsOwner(ctx, loanId);
    requireStatus(loan, "approved", "marked as returned");
    await ctx.db.patch("loans", loan._id, { status: "returned" });
    await notifyStatusChange(ctx, loan._id);
  },
});

/** Resolves the tool and user names shown next to a list of loans. */
async function loadNames(
  ctx: QueryCtx,
  loans: Doc<"loans">[],
  userIdOf: (loan: Doc<"loans">) => Id<"users">,
) {
  const toolIds = [...new Set(loans.map((loan) => loan.toolId))];
  const userIds = [...new Set(loans.map(userIdOf))];
  const [tools, users] = await Promise.all([
    Promise.all(toolIds.map((toolId) => ctx.db.get("tools", toolId))),
    Promise.all(userIds.map((userId) => ctx.db.get("users", userId))),
  ]);
  return {
    toolNames: new Map(toolIds.map((id, index) => [id, tools[index]?.name])),
    usersById: new Map(userIds.map((id, index) => [id, users[index]])),
  };
}

function byStatusThenNewest(a: Doc<"loans">, b: Doc<"loans">): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    b._creationTime - a._creationTime
  );
}

/** Late when an approved loan is past its end date and not returned yet. */
function isOverdue(loan: Doc<"loans">, today: string): boolean {
  return loan.status === "approved" && loan.endDate < today;
}

/** Loans where the signed-in user is the borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(MAX_LISTED_LOANS);
    const { toolNames, usersById } = await loadNames(
      ctx,
      loans,
      (loan) => loan.ownerId,
    );
    const today = todayUtc();

    // Names only: no email and no user id of the other person.
    return loans.sort(byStatusThenNewest).map((loan) => ({
      _id: loan._id,
      toolName: toolNames.get(loan.toolId) ?? DELETED_TOOL_NAME,
      ownerName: usersById.get(loan.ownerId)?.name ?? "Unknown",
      ownerTrusted: usersById.get(loan.ownerId)?.trustedLender ?? false,
      startDate: loan.startDate,
      endDate: loan.endDate,
      status: loan.status,
      overdue: isOverdue(loan, today),
    }));
  },
});

/** Loans on the signed-in user's own tools. */
export const incomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(MAX_LISTED_LOANS);
    const { toolNames, usersById } = await loadNames(
      ctx,
      loans,
      (loan) => loan.borrowerId,
    );
    const today = todayUtc();

    return loans.sort(byStatusThenNewest).map((loan) => ({
      _id: loan._id,
      toolName: toolNames.get(loan.toolId) ?? DELETED_TOOL_NAME,
      borrowerName: usersById.get(loan.borrowerId)?.name ?? "Unknown",
      startDate: loan.startDate,
      endDate: loan.endDate,
      status: loan.status,
      overdue: isOverdue(loan, today),
    }));
  },
});
