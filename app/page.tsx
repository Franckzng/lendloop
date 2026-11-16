"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import Link from "next/link";
import { CategoryBadge } from "@/components/tools/Badges";
import { api } from "@/convex/_generated/api";
import { buttonPrimary, cardClass } from "@/lib/styles";

function PublicToolList() {
  // Public query: returns the name and category of each tool, nothing else.
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) {
    return <p className="text-sm text-zinc-500">Loading tools…</p>;
  }
  if (tools.length === 0) {
    return (
      <p className={`${cardClass} text-sm text-zinc-600`}>
        No tools have been listed yet. Sign in to add the first one.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {tools.map((tool) => (
        <li
          key={tool._id}
          className={`${cardClass} flex items-center justify-between gap-2`}
        >
          <span className="font-medium text-zinc-900">{tool.name}</span>
          <CategoryBadge category={tool.category} />
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12">
      <section className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">LendLoop</h1>
        <p className="text-lg text-zinc-600">
          Borrow what you need. Lend what you don&apos;t.
        </p>

        <AuthLoading>
          <p className="text-sm text-zinc-500">Loading…</p>
        </AuthLoading>
        <Unauthenticated>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/app"
            signUpForceRedirectUrl="/app"
          >
            <button type="button" className={buttonPrimary}>
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <Link href="/app" className={buttonPrimary}>
            Open the app
          </Link>
        </Authenticated>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-zinc-900">Tools in the neighbourhood</h2>
        <PublicToolList />
      </section>
    </main>
  );
}
