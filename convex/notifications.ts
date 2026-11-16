import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { loanStatusValidator } from "./schema";
import { signedHeaders } from "./signature";

/** One first try, then one retry after each of these delays. */
const RETRY_DELAYS_MS = [30_000, 120_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const REQUEST_TIMEOUT_MS = 10_000;

// Everything n8n receives. Nothing else leaves Convex: no description,
// no names, and only the email of the one person to notify.
const payloadValidator = v.object({
  eventId: v.id("automationEvents"),
  loanId: v.id("loans"),
  status: loanStatusValidator,
  recipientEmail: v.string(),
  toolName: v.string(),
  timestamp: v.number(),
});

/**
 * Called by every mutation that changes a loan status. Records the event
 * and schedules the webhook call. Being part of the mutation's transaction,
 * nothing is sent if the mutation fails, and the mutation never waits on n8n.
 */
export async function notifyStatusChange(
  ctx: MutationCtx,
  loanId: Id<"loans">,
): Promise<void> {
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) {
    return;
  }
  // A new request is for the owner to answer; every later change is news
  // for the borrower.
  const recipientId =
    loan.status === "pending" ? loan.ownerId : loan.borrowerId;
  const [recipient, tool] = await Promise.all([
    ctx.db.get("users", recipientId),
    ctx.db.get("tools", loan.toolId),
  ]);
  if (recipient === null) {
    return;
  }

  const timestamp = Date.now();
  // The event id identifies this notification across retries, so the
  // receiver can recognise a duplicate delivery.
  const eventId = await ctx.db.insert("automationEvents", {
    loanId,
    type: `status_${loan.status}`,
    createdAt: timestamp,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
    attempt: 1,
    payload: {
      eventId,
      loanId,
      status: loan.status,
      recipientEmail: recipient.email,
      toolName: tool?.name ?? "Deleted tool",
      timestamp,
    },
  });
}

/** Describes why a delivery failed, or returns null when it succeeded. */
async function post(
  url: string,
  secret: string,
  body: string,
): Promise<{ reason: string; retryable: boolean } | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Signed again on every attempt: the receiver rejects old timestamps.
        ...(await signedHeaders(secret, body)),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      return null;
    }
    // A 4xx means the request itself is refused (wrong secret, wrong URL):
    // sending the same request again cannot succeed.
    return {
      reason: `HTTP ${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    return { reason, retryable: true };
  }
}

export const deliver = internalAction({
  args: { payload: payloadValidator, attempt: v.number() },
  handler: async (ctx, { payload, attempt }) => {
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      // The app works without n8n: notifications are simply not sent.
      console.warn(
        "Notification skipped: N8N_REQUEST_WEBHOOK_URL or N8N_WEBHOOK_SECRET is not set.",
      );
      return;
    }

    const failure = await post(url, secret, JSON.stringify(payload));
    if (failure === null) {
      return;
    }
    if (failure.retryable && attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        RETRY_DELAYS_MS[attempt - 1],
        internal.notifications.deliver,
        { payload, attempt: attempt + 1 },
      );
      return;
    }
    // No email address in the log line: the event id is enough to investigate.
    console.error(
      `Notification ${payload.eventId} failed for good after ${attempt} attempt(s): ${failure.reason}`,
    );
    await ctx.runMutation(internal.notifications.recordFailure, {
      loanId: payload.loanId,
    });
  },
});

/** Keeps a trace of a notification that could not be delivered. */
export const recordFailure = internalMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await ctx.db.insert("automationEvents", {
      loanId,
      type: "notification_failed",
      createdAt: Date.now(),
    });
  },
});
