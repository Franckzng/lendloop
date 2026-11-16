"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { AdminListings } from "@/components/admin/AdminListings";
import { AdminLoans } from "@/components/admin/AdminLoans";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AppHeader } from "@/components/AppHeader";
import { api } from "@/convex/_generated/api";
import { cardClass } from "@/lib/styles";

function AdminSections() {
  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-zinc-900">All loans</h2>
        <AdminLoans />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-zinc-900">All listings</h2>
        <AdminListings />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-zinc-900">Users</h2>
        <AdminUsers />
      </section>
    </main>
  );
}

export default function AdminPage() {
  const user = useQuery(api.users.current);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <AppHeader user={user} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Admin</h1>
        <Link
          href="/app"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline"
        >
          Back to the app
        </Link>
      </div>

      {!user && <p className="text-sm text-zinc-500">Loading your account…</p>}
      {/* The admin queries are only mounted for admins. A non-admin calling
          them directly is still rejected by requireAdmin on the server. */}
      {user && user.role !== "admin" && (
        <p role="alert" className={`${cardClass} text-sm text-zinc-700`}>
          Admin access required.
        </p>
      )}
      {user?.role === "admin" && <AdminSections />}
    </div>
  );
}
