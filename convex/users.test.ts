import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setup } from "./test.setup";

test("a new account always gets the user role", async () => {
  const { t, owner } = await setup();
  const user = await t.run((ctx) => ctx.db.get("users", owner.userId));
  expect(user?.role).toBe("user");
  expect(user?.trustedLender).toBe(false);
});

test("the client cannot choose its role or identity when signing in", async () => {
  const { owner } = await setup();
  await expect(
    // @ts-expect-error store takes no arguments
    owner.account.mutation(api.users.store, { role: "admin" }),
  ).rejects.toThrow();
});

test("signing in again keeps the role and does not create a duplicate", async () => {
  const { t, admin } = await setup();
  const sameId = await admin.account.mutation(api.users.store, {});
  expect(sameId).toBe(admin.userId);

  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(3);
  expect(users.find((user) => user._id === admin.userId)?.role).toBe("admin");
});

test("signed-out visitors cannot create an account record", async () => {
  const { t } = await setup();
  await expect(t.mutation(api.users.store, {})).rejects.toThrow(
    "You must be signed in.",
  );
});
