import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { daysFromNow, drill, setup } from "./test.setup";

/** A tool listed by the owner and a pending request from the borrower. */
async function setupRequest() {
  const context = await setup();
  const toolId = await context.owner.account.mutation(api.tools.create, drill);
  const loanId = await context.borrower.account.mutation(
    api.loans.requestLoan,
    { toolId, startDate: daysFromNow(1), endDate: daysFromNow(3) },
  );
  return { ...context, toolId, loanId };
}

test("a borrower cannot approve their own request", async () => {
  const { t, borrower, loanId } = await setupRequest();
  await expect(
    borrower.account.mutation(api.loans.approve, { loanId }),
  ).rejects.toThrow("Only the owner of the tool can do this.");
  const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
  expect(loan?.status).toBe("pending");
});

test("a borrower cannot decline or mark a loan as returned", async () => {
  const { owner, borrower, loanId } = await setupRequest();
  await expect(
    borrower.account.mutation(api.loans.decline, { loanId }),
  ).rejects.toThrow("Only the owner of the tool can do this.");

  await owner.account.mutation(api.loans.approve, { loanId });
  await expect(
    borrower.account.mutation(api.loans.markReturned, { loanId }),
  ).rejects.toThrow("Only the owner of the tool can do this.");
});

test("an owner cannot borrow their own tool", async () => {
  const { owner, toolId } = await setupRequest();
  await expect(
    owner.account.mutation(api.loans.requestLoan, {
      toolId,
      startDate: daysFromNow(10),
      endDate: daysFromNow(11),
    }),
  ).rejects.toThrow("You cannot borrow your own tool.");
});

test("a request overlapping an approved loan is refused", async () => {
  const { owner, admin, toolId, loanId } = await setupRequest();
  await owner.account.mutation(api.loans.approve, { loanId });

  await expect(
    admin.account.mutation(api.loans.requestLoan, {
      toolId,
      startDate: daysFromNow(3),
      endDate: daysFromNow(5),
    }),
  ).rejects.toThrow("This tool is already booked for those dates.");
});

test("two overlapping requests cannot both be approved", async () => {
  const { owner, admin, toolId, loanId } = await setupRequest();
  const competing = await admin.account.mutation(api.loans.requestLoan, {
    toolId,
    startDate: daysFromNow(2),
    endDate: daysFromNow(4),
  });

  await owner.account.mutation(api.loans.approve, { loanId });
  await expect(
    owner.account.mutation(api.loans.approve, { loanId: competing }),
  ).rejects.toThrow("These dates overlap a loan you have already approved.");
});

test("each status only allows its own transitions", async () => {
  const { owner, loanId } = await setupRequest();
  await expect(
    owner.account.mutation(api.loans.markReturned, { loanId }),
  ).rejects.toThrow("Only approved requests can be marked as returned.");

  await owner.account.mutation(api.loans.approve, { loanId });
  await expect(
    owner.account.mutation(api.loans.decline, { loanId }),
  ).rejects.toThrow("Only pending requests can be declined.");

  await owner.account.mutation(api.loans.markReturned, { loanId });
  await expect(
    owner.account.mutation(api.loans.approve, { loanId }),
  ).rejects.toThrow("Only pending requests can be approved.");
});

test("a tool with an approved loan cannot be deleted by its owner", async () => {
  const { owner, toolId, loanId } = await setupRequest();
  await owner.account.mutation(api.loans.approve, { loanId });
  await expect(
    owner.account.mutation(api.tools.remove, { toolId }),
  ).rejects.toThrow("This tool has an approved loan.");
});

test("each side only sees their own loans, without the other's email", async () => {
  const { owner, borrower, admin } = await setupRequest();

  const mine = await borrower.account.query(api.loans.myRequests, {});
  expect(mine).toHaveLength(1);
  expect(JSON.stringify(mine)).not.toContain("@example.com");

  const incoming = await owner.account.query(api.loans.incomingRequests, {});
  expect(incoming).toHaveLength(1);
  expect(JSON.stringify(incoming)).not.toContain("@example.com");

  // A third account is not part of this loan and sees nothing.
  expect(await admin.account.query(api.loans.myRequests, {})).toHaveLength(0);
  expect(
    await admin.account.query(api.loans.incomingRequests, {}),
  ).toHaveLength(0);
});
