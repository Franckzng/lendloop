import { v } from "convex/values";

// Single source of truth for the fixed tool options: the server validates
// against these lists and the forms build their menus from them.

export const TOOL_CATEGORIES = [
  "power tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const TOOL_CONDITIONS = ["like new", "good", "fair", "worn"] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];
export type ToolCondition = (typeof TOOL_CONDITIONS)[number];

export const categoryValidator = v.union(
  ...TOOL_CATEGORIES.map((category) => v.literal(category)),
);

export const conditionValidator = v.union(
  ...TOOL_CONDITIONS.map((condition) => v.literal(condition)),
);

export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 500;

export function isToolCategory(value: string): value is ToolCategory {
  return TOOL_CATEGORIES.some((category) => category === value);
}

export function isToolCondition(value: string): value is ToolCondition {
  return TOOL_CONDITIONS.some((condition) => condition === value);
}
