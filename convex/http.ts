import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./signature";

// HTTP routes called by n8n. Each one requires a valid HMAC signature
// before it reads or writes anything.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Returns the request body when the signature is valid, or the response to
 * send back when it is not. A rejected caller learns nothing about why.
 */
async function authenticate(request: Request): Promise<string | Response> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return json({ ok: false, error: "Not configured." }, 503);
  }
  // The exact text that was signed: never a re-serialised copy.
  const body = await request.text();
  const valid = await verify(
    secret,
    request.headers.get(TIMESTAMP_HEADER) ?? "",
    body,
    request.headers.get(SIGNATURE_HEADER) ?? "",
  );
  return valid ? body : json({ ok: false, error: "Unauthorized." }, 401);
}

type ReminderReport = {
  loanId: string;
  idempotencyKey: string;
  status: "sent" | "failed";
};

function parseReminderReport(body: string): ReminderReport | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { loanId, idempotencyKey, status } = data as Record<string, unknown>;
  if (
    typeof loanId !== "string" ||
    typeof idempotencyKey !== "string" ||
    (status !== "sent" && status !== "failed")
  ) {
    return null;
  }
  return { loanId, idempotencyKey, status };
}

const http = httpRouter();

http.route({
  path: "/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const loans = await ctx.runQuery(internal.reminders.listOverdue, {});
    return json({ loans });
  }),
});

http.route({
  path: "/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const report = parseReminderReport(authenticated);
    if (report === null) {
      return json({ ok: false, error: "Invalid body." }, 400);
    }
    const result = await ctx.runMutation(internal.reminders.record, report);
    return json(result, result.ok ? 200 : 400);
  }),
});

export default http;
