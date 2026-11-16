"use client";

import { useQuery } from "convex/react";
import { LoanCard } from "@/components/loans/LoanCard";
import { api } from "@/convex/_generated/api";
import { cardClass } from "@/lib/styles";

export function AdminLoans() {
  const loans = useQuery(api.admin.listAllLoans);

  if (loans === undefined) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (loans.length === 0) {
    return (
      <p className={`${cardClass} text-sm text-zinc-600`}>
        No loans have been requested yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {loans.map((loan) => (
        <LoanCard
          key={loan._id}
          toolName={loan.toolName}
          counterpart={`Lent by ${loan.ownerName} · Requested by ${loan.borrowerName}`}
          startDate={loan.startDate}
          endDate={loan.endDate}
          status={loan.status}
          overdue={loan.overdue}
        />
      ))}
    </ul>
  );
}
