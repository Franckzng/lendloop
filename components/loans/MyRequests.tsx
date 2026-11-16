"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cardClass } from "@/lib/styles";
import { LoanCard } from "./LoanCard";

export function MyRequests() {
  const loans = useQuery(api.loans.myRequests);

  if (loans === undefined) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (loans.length === 0) {
    return (
      <p className={`${cardClass} text-sm text-zinc-600`}>
        You have not asked to borrow anything yet. Pick a tool in “All tools”
        and choose your dates.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {loans.map((loan) => (
        <LoanCard
          key={loan._id}
          toolName={loan.toolName}
          counterpart={`Lent by ${loan.ownerName}`}
          startDate={loan.startDate}
          endDate={loan.endDate}
          status={loan.status}
          overdue={loan.overdue}
        />
      ))}
    </ul>
  );
}
