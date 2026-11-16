import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("admin"), v.literal("user"));

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
);

export const reminderStatusValidator = v.union(
  v.literal("sent"),
  v.literal("failed"),
);

export default defineSchema({
  users: defineTable({
    // Clerk user id, read from the verified JWT (never sent by the client).
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // Calendar days as "YYYY-MM-DD": a loan is counted in days, and this
    // format sorts and compares correctly without any timezone handling.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_tool", ["toolId"])
    .index("by_status_end", ["status", "endDate"]),

  reminders: defineTable({
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    status: reminderStatusValidator,
    sentAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    type: v.string(),
    createdAt: v.number(),
  }).index("by_loan", ["loanId"]),
});
