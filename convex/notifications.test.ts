import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { sign } from "./signature";
import { daysFromNow, drill, setup } from "./test.setup";

const WEBHOOK_URL = "https://n8n.example.com/webhook/lendloop/request-notification";
const SECRET = "test-secret";

type SentRequest = {
  url: string;
  body: string;
  timestamp: string;
  signature: string;
};

/** Replaces fetch with a fake that records each call and answers in order. */
function mockFetch(...statuses: (number | "network-error")[]) {
  const sent: SentRequest[] = [];
  const fake = vi.fn(async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    sent.push({
      url,
      body: String(init.body),
      timestamp: headers.get("X-LendLoop-Timestamp") ?? "",
      signature: headers.get("X-LendLoop-Signature") ?? "",
    });
    const status = statuses[Math.min(sent.length, statuses.length) - 1];
    if (status === "network-error") {
      throw new Error("connection refused");
    }
    return new Response(null, { status });
  });
  vi.stubGlobal("fetch", fake);
  return sent;
}

/** A tool, a pending request, and every scheduled delivery fully run. */
async function requestAndDeliver() {
  const context = await setup();
  const toolId = await context.owner.account.mutation(api.tools.create, drill);
  const loanId = await context.borrower.account.mutation(
    api.loans.requestLoan,
    { toolId, startDate: daysFromNow(1), endDate: daysFromNow(2) },
  );
  await context.t.finishAllScheduledFunctions(vi.runAllTimers);
  return { ...context, toolId, loanId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", WEBHOOK_URL);
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("signature matches a known HMAC-SHA256 value", async () => {
  // Reference value computed with: printf '1700000000000.{"a":1}' | openssl dgst -sha256 -hmac test-secret
  expect(await sign(SECRET, "1700000000000", '{"a":1}')).toBe(
    "41d7ea3edeb2e83531bda1e7ceab5460d14d124d8721e8413f26e451c86e039c",
  );
});

test("a new request notifies the owner with the minimal payload", async () => {
  const sent = mockFetch(200);
  const { loanId } = await requestAndDeliver();

  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(WEBHOOK_URL);
  const payload = JSON.parse(sent[0].body);
  expect(Object.keys(payload).sort()).toEqual([
    "eventId",
    "loanId",
    "recipientEmail",
    "status",
    "timestamp",
    "toolName",
  ]);
  expect(payload).toMatchObject({
    loanId,
    status: "pending",
    recipientEmail: "owner@example.com",
    toolName: drill.name,
  });
  // Nothing about the tool beyond its name, and not the other person's email.
  expect(sent[0].body).not.toContain(drill.description);
  expect(sent[0].body).not.toContain("borrower@example.com");
});

test("the request is signed over the timestamp and the exact body", async () => {
  const sent = mockFetch(200);
  await requestAndDeliver();

  const { body, timestamp, signature } = sent[0];
  expect(signature).toBe(await sign(SECRET, timestamp, body));
  expect(signature).not.toBe(await sign("another-secret", timestamp, body));
});

test("approval, decline and return notify the borrower", async () => {
  const sent = mockFetch(200);
  const { t, owner, admin, toolId, loanId } = await requestAndDeliver();

  await owner.account.mutation(api.loans.approve, { loanId });
  await owner.account.mutation(api.loans.markReturned, { loanId });
  const second = await admin.account.mutation(api.loans.requestLoan, {
    toolId,
    startDate: daysFromNow(5),
    endDate: daysFromNow(6),
  });
  await owner.account.mutation(api.loans.decline, { loanId: second });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const notified = sent.map((request) => {
    const { status, recipientEmail } = JSON.parse(request.body);
    return `${status} -> ${recipientEmail}`;
  });
  expect(notified.sort()).toEqual([
    "approved -> borrower@example.com",
    "declined -> admin@example.com",
    "pending -> owner@example.com",
    "pending -> owner@example.com",
    "returned -> borrower@example.com",
  ]);
});

test("a failing webhook is retried, with the same event id, then succeeds", async () => {
  const sent = mockFetch(503, "network-error", 200);
  const { t } = await requestAndDeliver();

  expect(sent).toHaveLength(3);
  const eventIds = new Set(sent.map((request) => JSON.parse(request.body).eventId));
  expect(eventIds.size).toBe(1);
  // Each attempt carries its own fresh signature.
  for (const request of sent) {
    expect(request.signature).toBe(
      await sign(SECRET, request.timestamp, request.body),
    );
  }
  const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
  expect(events.map((event) => event.type)).toEqual(["status_pending"]);
});

test("after three failed attempts the failure is recorded", async () => {
  const sent = mockFetch(500);
  const { t, loanId } = await requestAndDeliver();

  expect(sent).toHaveLength(3);
  const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
  expect(events.map((event) => event.type)).toEqual([
    "status_pending",
    "notification_failed",
  ]);
  expect(events[1].loanId).toBe(loanId);
  expect(console.error).toHaveBeenCalledOnce();
});

test("a rejected signature (401) is not retried", async () => {
  const sent = mockFetch(401);
  const { t } = await requestAndDeliver();

  expect(sent).toHaveLength(1);
  const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
  expect(events.map((event) => event.type)).toContain("notification_failed");
});

test("without n8n configured, nothing is sent and the request still works", async () => {
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "");
  const sent = mockFetch(200);
  const { t, loanId } = await requestAndDeliver();

  expect(sent).toHaveLength(0);
  const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
  expect(loan?.status).toBe("pending");
});

test("a mutation that fails sends no notification", async () => {
  const sent = mockFetch(200);
  const { t, borrower, loanId } = await requestAndDeliver();
  sent.length = 0;

  await expect(
    borrower.account.mutation(api.loans.approve, { loanId }),
  ).rejects.toThrow();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(0);
});
