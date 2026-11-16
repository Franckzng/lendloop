import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { drill, setup } from "./test.setup";

test("the public list exposes the name and category only", async () => {
  const { t, owner } = await setup();
  await owner.account.mutation(api.tools.create, drill);

  // No identity: this is what a signed-out visitor receives.
  const tools = await t.query(api.tools.listPublic, {});
  expect(tools).toHaveLength(1);
  expect(Object.keys(tools[0]).sort()).toEqual(["_id", "category", "name"]);
});

test("signed-out visitors cannot read the full list or add a tool", async () => {
  const { t } = await setup();
  await expect(t.query(api.tools.listAll, {})).rejects.toThrow(
    "You must be signed in.",
  );
  await expect(t.mutation(api.tools.create, drill)).rejects.toThrow(
    "You must be signed in.",
  );
});

test("a user cannot delete another user's tool", async () => {
  const { t, owner, borrower } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);

  await expect(
    borrower.account.mutation(api.tools.remove, { toolId }),
  ).rejects.toThrow("You can only change your own tools.");
  expect(await t.run((ctx) => ctx.db.get("tools", toolId))).not.toBeNull();
});

test("a user cannot edit another user's tool", async () => {
  const { t, owner, borrower } = await setup();
  const toolId = await owner.account.mutation(api.tools.create, drill);

  await expect(
    borrower.account.mutation(api.tools.update, {
      toolId,
      ...drill,
      name: "Taken over",
    }),
  ).rejects.toThrow("You can only change your own tools.");
  const tool = await t.run((ctx) => ctx.db.get("tools", toolId));
  expect(tool?.name).toBe(drill.name);
});

test("the owner of a new tool is the signed-in user, never a client value", async () => {
  const { t, owner, borrower } = await setup();
  await expect(
    owner.account.mutation(api.tools.create, {
      ...drill,
      // @ts-expect-error ownerId is not an accepted argument
      ownerId: borrower.userId,
    }),
  ).rejects.toThrow();

  const toolId = await owner.account.mutation(api.tools.create, drill);
  const tool = await t.run((ctx) => ctx.db.get("tools", toolId));
  expect(tool?.ownerId).toBe(owner.userId);
});

test("the full list never includes the owner's email or id", async () => {
  const { owner, borrower } = await setup();
  await owner.account.mutation(api.tools.create, drill);

  const [tool] = await borrower.account.query(api.tools.listAll, {});
  expect(tool.ownerName).toBe("owner");
  expect(JSON.stringify(tool)).not.toContain("owner@example.com");
  expect(tool).not.toHaveProperty("ownerId");
});
