/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

// Every Convex function file, but not the test files themselves.
const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
  "!./test.setup.ts",
]);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** A calendar day relative to today, as "YYYY-MM-DD". */
export function daysFromNow(count: number): string {
  return new Date(Date.now() + count * DAY_IN_MS).toISOString().slice(0, 10);
}

export const drill = {
  name: "Cordless drill",
  category: "power tools",
  condition: "good",
  description: "Two batteries included",
} as const;

/**
 * An in-memory backend with three signed-in accounts. They are created
 * through the real `store` mutation, as a first sign-in would do.
 */
export async function setup() {
  const t = convexTest(schema, modules);

  async function signIn(name: string) {
    const account = t.withIdentity({
      subject: `clerk_${name}`,
      name,
      email: `${name}@example.com`,
    });
    const userId = await account.mutation(api.users.store, {});
    return { account, userId };
  }

  const owner = await signIn("owner");
  const borrower = await signIn("borrower");
  const admin = await signIn("admin");
  // The only way to become an admin: a direct edit of the database.
  await t.run((ctx) => ctx.db.patch("users", admin.userId, { role: "admin" }));

  return { t, owner, borrower, admin };
}
