import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Called after every loan status change (request created, approved,
 * declined, returned). Single place where outgoing notifications start.
 */
export async function notifyStatusChange(
  _ctx: MutationCtx,
  _loanId: Id<"loans">,
): Promise<void> {
  // Intentionally empty for now: the n8n webhook call plugs in here.
}
