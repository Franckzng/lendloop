"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { TrustedBadge } from "@/components/TrustedBadge";
import { api } from "@/convex/_generated/api";
import { buttonSecondary, cardClass } from "@/lib/styles";
import { useAsyncAction } from "@/lib/useAsyncAction";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

function UserRow({ user }: { user: AdminUser }) {
  const setTrustedLender = useMutation(api.admin.setTrustedLender);
  const { run, pending, error } = useAsyncAction();

  return (
    <li className={`${cardClass} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-zinc-900">{user.name}</h3>
        {user.trustedLender && <TrustedBadge />}
        {user.role === "admin" && (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            Admin
          </span>
        )}
      </div>
      <p className="text-xs break-all text-zinc-500">{user.email}</p>
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="pt-1">
        <button
          type="button"
          className={buttonSecondary}
          disabled={pending}
          onClick={() =>
            void run(() =>
              setTrustedLender({ userId: user._id, value: !user.trustedLender }),
            )
          }
        >
          {user.trustedLender ? "Remove Trusted Lender" : "Mark as Trusted Lender"}
        </button>
      </div>
    </li>
  );
}

export function AdminUsers() {
  const users = useQuery(api.admin.listUsers);

  if (users === undefined) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {users.map((user) => (
        <UserRow key={user._id} user={user} />
      ))}
    </ul>
  );
}
