import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sign } from "./signature";
import { daysFromNow, drill, setup } from "./test.setup";

const SECRET = "test-secret";

beforeEach(() => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type SignOptions = { secret?: string; ageMs?: number; signedBody?: string };

/** Builds a request signed the way n8n signs it. */
async function signed(method: "GET" | "POST", body = "", options: SignOptions = {}) {
  const timestamp = String(Date.now() - (options.ageMs ?? 0));
  const signature = await sign(
    options.secret ?? SECRET,
    timestamp,
    options.signedBody ?? body,
  );
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-LendLoop-Timestamp": timestamp,
      "X-LendLoop-Signature": signature,
    },
    body: method === "POST" ? body : undefined,
  };
}

/** One overdue loan, one loan still in time, one pending request. */
async function setupOverdue() {
  const context = await setup();
  const toolId = await context.owner.account.mutation(api.tools.create, drill);
  const loan = (startDate: string, endDate: string, status: "approved" | "pending") =>
    context.t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        ownerId: context.owner.userId,
        borrowerId: context.borrower.userId,
        startDate,
        endDate,
        status,
      }),
    );
  const overdueId = await loan(daysFromNow(-9), daysFromNow(-3), "approved");
  await loan(daysFromNow(-1), daysFromNow(4), "approved");
  await loan(daysFromNow(-8), daysFromNow(-2), "pending");
  return { ...context, overdueId };
}

function report(loanId: Id<"loans">, day = daysFromNow(0), status = "sent") {
  return JSON.stringify({ loanId, idempotencyKey: `${loanId}:${day}`, status });
}

test("both routes reject a request without a signature", async () => {
  const { t } = await setupOverdue();
  expect((await t.fetch("/overdue-loans", { method: "GET" })).status).toBe(401);
  const response = await t.fetch("/reminder-status", { method: "POST", body: "{}" });
  expect(response.status).toBe(401);
});

test("a signature made with another secret is rejected", async () => {
  const { t } = await setupOverdue();
  const request = await signed("GET", "", { secret: "wrong-secret" });
  expect((await t.fetch("/overdue-loans", request)).status).toBe(401);
});

test("a signature older than five minutes is rejected", async () => {
  const { t } = await setupOverdue();
  const stale = await signed("GET", "", { ageMs: 6 * 60 * 1000 });
  expect((await t.fetch("/overdue-loans", stale)).status).toBe(401);
  const recent = await signed("GET", "", { ageMs: 4 * 60 * 1000 });
  expect((await t.fetch("/overdue-loans", recent)).status).toBe(200);
});

test("a body changed after signing is rejected and nothing is stored", async () => {
  const { t, overdueId } = await setupOverdue();
  const request = await signed("POST", report(overdueId), {
    signedBody: report(overdueId, daysFromNow(-1)),
  });
  expect((await t.fetch("/reminder-status", request)).status).toBe(401);
  expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toHaveLength(0);
});

test("without a configured secret the routes stay closed", async () => {
  vi.stubEnv("N8N_WEBHOOK_SECRET", "");
  const { t } = await setupOverdue();
  const request = await signed("GET");
  expect((await t.fetch("/overdue-loans", request)).status).toBe(503);
});

test("overdue loans: only approved loans past their end date, minimal fields", async () => {
  const { t, overdueId } = await setupOverdue();
  const response = await t.fetch("/overdue-loans", await signed("GET"));
  expect(response.status).toBe(200);

  const { loans } = await response.json();
  expect(loans).toEqual([
    {
      loanId: overdueId,
      borrowerEmail: "borrower@example.com",
      toolName: drill.name,
      endDate: daysFromNow(-3),
      reminderSentToday: false,
    },
  ]);
  // Not the owner's email, not the tool description.
  const text = JSON.stringify(loans);
  expect(text).not.toContain("owner@example.com");
  expect(text).not.toContain(drill.description);
});

test("recording the same reminder twice creates a single row", async () => {
  const { t, overdueId } = await setupOverdue();
  const body = report(overdueId);

  const first = await t.fetch("/reminder-status", await signed("POST", body));
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ ok: true, created: true });

  const second = await t.fetch("/reminder-status", await signed("POST", body));
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual({ ok: true, created: false });

  expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toHaveLength(1);
});

test("once recorded, the loan is flagged as already reminded today", async () => {
  const { t, overdueId } = await setupOverdue();
  await t.fetch("/reminder-status", await signed("POST", report(overdueId)));

  const response = await t.fetch("/overdue-loans", await signed("GET"));
  const { loans } = await response.json();
  expect(loans[0].reminderSentToday).toBe(true);
});

test("a failed reminder can be completed later the same day, still one row", async () => {
  const { t, overdueId } = await setupOverdue();
  const failed = report(overdueId, daysFromNow(0), "failed");
  await t.fetch("/reminder-status", await signed("POST", failed));

  const before = await (await t.fetch("/overdue-loans", await signed("GET"))).json();
  expect(before.loans[0].reminderSentToday).toBe(false);

  await t.fetch("/reminder-status", await signed("POST", report(overdueId)));
  const rows = await t.run((ctx) => ctx.db.query("reminders").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("sent");
});

test("invalid reports are refused: unknown loan, foreign key, bad status", async () => {
  const { t, overdueId } = await setupOverdue();
  const post = async (body: string) =>
    (await t.fetch("/reminder-status", await signed("POST", body))).status;

  expect(await post("not json")).toBe(400);
  expect(await post(report(overdueId, daysFromNow(0), "delivered"))).toBe(400);
  expect(await post(report(overdueId, "2026-02-31"))).toBe(400);
  expect(
    await post(
      JSON.stringify({
        loanId: overdueId,
        idempotencyKey: "something-else",
        status: "sent",
      }),
    ),
  ).toBe(400);
  expect(
    await post(
      JSON.stringify({
        loanId: "not-a-loan",
        idempotencyKey: `not-a-loan:${daysFromNow(0)}`,
        status: "sent",
      }),
    ),
  ).toBe(400);
  expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toHaveLength(0);
});

test("borrower and owner see when the last reminder was sent", async () => {
  const { t, owner, borrower, overdueId } = await setupOverdue();
  await t.fetch("/reminder-status", await signed("POST", report(overdueId)));

  const mine = await borrower.account.query(api.loans.myRequests, {});
  expect(mine.find((loan) => loan._id === overdueId)?.lastReminderAt).toBeTypeOf(
    "number",
  );
  const incoming = await owner.account.query(api.loans.incomingRequests, {});
  expect(
    incoming.find((loan) => loan._id === overdueId)?.lastReminderAt,
  ).toBeTypeOf("number");
  expect(incoming.filter((loan) => loan.lastReminderAt !== null)).toHaveLength(1);
});
