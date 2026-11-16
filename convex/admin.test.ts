import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { daysFromNow, drill, setup } from "./test.setup";

const DENIED = "Admin access required.";

test("a regular user cannot call any admin function", async () => {
  const { t, owner, borrower } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);
  const { account } = borrower;

  await expect(account.query(api.admin.listUsers, {})).rejects.toThrow(DENIED);
  await expect(account.query(api.admin.listAllLoans, {})).rejects.toThrow(DENIED);
  await expect(account.query(api.admin.listAllListings, {})).rejects.toThrow(
    DENIED,
  );
  await expect(
    account.mutation(api.admin.removeAnyListing, { toolId }),
  ).rejects.toThrow(DENIED);
  await expect(
    account.mutation(api.admin.setTrustedLender, {
      userId: borrower.userId,
      value: true,
    }),
  ).rejects.toThrow(DENIED);

  // Nothing changed.
  expect(await t.run((ctx) => ctx.db.get("tools", toolId))).not.toBeNull();
  const user = await t.run((ctx) => ctx.db.get("users", borrower.userId));
  expect(user?.trustedLender).toBe(false);
});

test("signed-out visitors cannot call admin functions", async () => {
  const { t } = await setup();
  await expect(t.query(api.admin.listUsers, {})).rejects.toThrow(
    "You must be signed in.",
  );
});

test("an admin can remove any listing", async () => {
  const { t, owner, admin } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);

  await admin.account.mutation(api.admin.removeAnyListing, { toolId });
  expect(await t.run((ctx) => ctx.db.get("tools", toolId))).toBeNull();
});

test("an admin cannot remove a listing that has an approved loan", async () => {
  const { owner, borrower, admin } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);
  const loanId = await borrower.account.mutation(api.loans.requestLoan, {
    toolId,
    startDate: daysFromNow(1),
    endDate: daysFromNow(2),
  });
  await owner.account.mutation(api.loans.approve, { loanId });

  await expect(
    admin.account.mutation(api.admin.removeAnyListing, { toolId }),
  ).rejects.toThrow("This tool has an approved loan.");
});

test("an admin sees every loan with the three names", async () => {
  const { owner, borrower, admin } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);
  await borrower.account.mutation(api.loans.requestLoan, {
    toolId,
    startDate: daysFromNow(1),
    endDate: daysFromNow(2),
  });

  const loans = await admin.account.query(api.admin.listAllLoans, {});
  expect(loans).toHaveLength(1);
  expect(loans[0]).toMatchObject({
    toolName: drill.name,
    ownerName: "owner",
    borrowerName: "borrower",
    status: "pending",
  });
});

test("the Trusted Lender badge set by an admin reaches borrowers", async () => {
  const { owner, borrower, admin } = await setup();
  await owner.account.mutation(api.tools.create, drill);

  const before = await borrower.account.query(api.tools.listAll, {});
  expect(before[0].ownerTrusted).toBe(false);

  await admin.account.mutation(api.admin.setTrustedLender, {
    userId: owner.userId,
    value: true,
  });
  const after = await borrower.account.query(api.tools.listAll, {});
  expect(after[0].ownerTrusted).toBe(true);
});

test("being a Trusted Lender does not grant admin rights", async () => {
  const { owner, admin } = await setup();
  await admin.account.mutation(api.admin.setTrustedLender, {
    userId: owner.userId,
    value: true,
  });
  await expect(owner.account.query(api.admin.listUsers, {})).rejects.toThrow(
    DENIED,
  );
});
