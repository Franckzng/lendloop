import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { isValidDay, todayUtc } from "./dates";
import { reminderStatusValidator } from "./schema";

// Internal functions only: they are reachable through the signed HTTP routes
// in http.ts, never directly from a browser.

/** Upper bound on one run of the reminder workflow. */
const MAX_OVERDUE_LOANS = 200;

/** One reminder per loan and per day: this key is what makes retries safe. */
export function reminderKey(loanId: Id<"loans">, day: string): string {
  return `${loanId}:${day}`;
}

/**
 * Approved loans past their end date. Returns only what a reminder needs:
 * no owner, no description, and the email of the borrower alone.
 */
export const listOverdue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) =>
        q.eq("status", "approved").lt("endDate", today),
      )
      .take(MAX_OVERDUE_LOANS);

    const overdue = await Promise.all(
      loans.map(async (loan) => {
        const [borrower, tool, todaysReminder] = await Promise.all([
          ctx.db.get("users", loan.borrowerId),
          ctx.db.get("tools", loan.toolId),
          ctx.db
            .query("reminders")
            .withIndex("by_key", (q) =>
              q.eq("idempotencyKey", reminderKey(loan._id, today)),
            )
            .unique(),
        ]);
        if (borrower === null) {
          return null;
        }
        return {
          loanId: loan._id,
          borrowerEmail: borrower.email,
          toolName: tool?.name ?? "Deleted tool",
          endDate: loan.endDate,
          // Lets the workflow skip a borrower already reminded today.
          reminderSentToday: todaysReminder?.status === "sent",
        };
      }),
    );
    return overdue.filter((loan) => loan !== null);
  },
});

type RecordResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

/**
 * Stores the outcome of one reminder. Idempotent: a key that is already
 * stored is acknowledged without writing anything, so a retried or repeated
 * call never creates a second row.
 */
export const record = internalMutation({
  args: {
    loanId: v.string(),
    idempotencyKey: v.string(),
    status: reminderStatusValidator,
  },
  handler: async (ctx, args): Promise<RecordResult> => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    const loan = loanId === null ? null : await ctx.db.get("loans", loanId);
    if (loanId === null || loan === null) {
      return { ok: false, error: "Unknown loan." };
    }
    // The key must be "<loanId>:<YYYY-MM-DD>": nothing else is accepted.
    const day = args.idempotencyKey.slice(args.loanId.length + 1);
    if (
      args.idempotencyKey !== reminderKey(loanId, day) ||
      !isValidDay(day)
    ) {
      return { ok: false, error: "Malformed idempotency key." };
    }

    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing !== null) {
      // A failed attempt may be completed later the same day, nothing more.
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch("reminders", existing._id, {
          status: "sent",
          sentAt: Date.now(),
        });
      }
      return { ok: true, created: false };
    }

    await ctx.db.insert("reminders", {
      loanId,
      idempotencyKey: args.idempotencyKey,
      status: args.status,
      sentAt: Date.now(),
    });
    return { ok: true, created: true };
  },
});

/** When the latest reminder was sent for each given loan, if ever. */
export async function lastReminderTimes(
  ctx: QueryCtx,
  loanIds: Id<"loans">[],
): Promise<Map<Id<"loans">, number>> {
  const times = new Map<Id<"loans">, number>();
  await Promise.all(
    loanIds.map(async (loanId) => {
      const reminders = await ctx.db
        .query("reminders")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const sent = reminders
        .filter((reminder) => reminder.status === "sent")
        .map((reminder) => reminder.sentAt);
      if (sent.length > 0) {
        times.set(loanId, Math.max(...sent));
      }
    }),
  );
  return times;
}
