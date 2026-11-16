"use client";

import { useState } from "react";
import { errorMessage } from "./errors";

/** Runs a server call while tracking its pending state and error message. */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error };
}
