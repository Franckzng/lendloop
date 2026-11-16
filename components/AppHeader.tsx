"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

type AppHeaderProps = {
  /** The signed-in user's profile, or null/undefined while it loads. */
  user: { name: string; role: "admin" | "user" } | null | undefined;
};

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/app" className="text-xl font-semibold tracking-tight">
        LendLoop
      </Link>
      <div className="flex items-center gap-3">
        {/* Hidden for non-admins as a convenience only: every admin
            function checks the role again on the server. */}
        {user?.role === "admin" && (
          <Link
            href="/app/admin"
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Admin
          </Link>
        )}
        {user && (
          <span className="hidden text-sm text-zinc-600 sm:inline">
            {user.name}
          </span>
        )}
        <UserButton />
      </div>
    </header>
  );
}
