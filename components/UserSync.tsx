"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

function toMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "We could not set up your account. Please reload the page.";
}

/**
 * Creates (or refreshes) the Convex user record right after sign-in.
 * Renders nothing unless that call fails.
 */
export function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    storeUser().then(
      () => setError(null),
      (cause: unknown) => setError(toMessage(cause)),
    );
  }, [isAuthenticated, storeUser]);

  if (error === null) {
    return null;
  }
  return (
    <p
      role="alert"
      className="bg-red-50 px-4 py-2 text-center text-sm text-red-800"
    >
      {error}
    </p>
  );
}
