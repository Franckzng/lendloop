"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { IncomingRequests } from "@/components/loans/IncomingRequests";
import { MyRequests } from "@/components/loans/MyRequests";
import { AllTools } from "@/components/tools/AllTools";
import { MyListings } from "@/components/tools/MyListings";
import { api } from "@/convex/_generated/api";

const TABS = [
  { id: "all", label: "All tools" },
  { id: "mine", label: "My listings" },
  { id: "requests", label: "My requests" },
  { id: "incoming", label: "Incoming requests" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case "all":
      return <AllTools />;
    case "mine":
      return <MyListings />;
    case "requests":
      return <MyRequests />;
    case "incoming":
      return <IncomingRequests />;
  }
}

export default function AppPage() {
  // Null until the user record exists in Convex: the protected queries below
  // would be rejected before that, so nothing else renders until it is ready.
  const user = useQuery(api.users.current);
  const [tab, setTab] = useState<TabId>("all");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          LendLoop
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden text-sm text-zinc-600 sm:inline">
              {user.name}
            </span>
          )}
          <UserButton />
        </div>
      </header>

      {!user ? (
        <p className="text-sm text-zinc-500">Loading your account…</p>
      ) : (
        <>
          <nav
            aria-label="Sections"
            className="flex gap-1 overflow-x-auto border-b border-zinc-200"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  tab === id
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <main>
            <TabContent tab={tab} />
          </main>
        </>
      )}
    </div>
  );
}
