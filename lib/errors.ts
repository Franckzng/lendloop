import { ConvexError } from "convex/values";

/**
 * Turns a failed Convex call into a message that is safe to show.
 * Only ConvexError messages are written for users; anything else
 * (network failure, unexpected server error) gets the fallback.
 */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return fallback;
}
