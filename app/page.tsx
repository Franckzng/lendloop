"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";

function Greeting() {
  const user = useQuery(api.users.current);

  if (user === undefined || user === null) {
    return <p className="text-zinc-500">Setting up your account…</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <UserButton />
      <p>
        Signed in as <span className="font-medium">{user.name}</span>
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">LendLoop</h1>
      <p className="text-zinc-600">
        Borrow what you need. Lend what you don&apos;t.
      </p>

      <AuthLoading>
        <p className="text-zinc-500">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Sign in to lend or borrow
          </button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Greeting />
      </Authenticated>
    </main>
  );
}
