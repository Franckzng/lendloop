"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { buttonPrimary, buttonSecondary, cardClass } from "@/lib/styles";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { LoanCard } from "./LoanCard";

type IncomingLoan = FunctionReturnType<
  typeof api.loans.incomingRequests
>[number];

function IncomingLoanCard({ loan }: { loan: IncomingLoan }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const { run, pending, error } = useAsyncAction();
  const loanId = loan._id;

  return (
    <LoanCard
      toolName={loan.toolName}
      counterpart={`Requested by ${loan.borrowerName}`}
      startDate={loan.startDate}
      endDate={loan.endDate}
      status={loan.status}
      overdue={loan.overdue}
      lastReminderAt={loan.lastReminderAt}
    >
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {loan.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className={buttonPrimary}
            disabled={pending}
            onClick={() => void run(() => approve({ loanId }))}
          >
            Approve
          </button>
          <button
            type="button"
            className={buttonSecondary}
            disabled={pending}
            onClick={() => void run(() => decline({ loanId }))}
          >
            Decline
          </button>
        </div>
      )}
      {loan.status === "approved" && (
        <div className="pt-1">
          <button
            type="button"
            className={buttonSecondary}
            disabled={pending}
            onClick={() => void run(() => markReturned({ loanId }))}
          >
            Mark as returned
          </button>
        </div>
      )}
    </LoanCard>
  );
}

export function IncomingRequests() {
  const loans = useQuery(api.loans.incomingRequests);

  if (loans === undefined) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (loans.length === 0) {
    return (
      <p className={`${cardClass} text-sm text-zinc-600`}>
        Nobody has asked to borrow your tools yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {loans.map((loan) => (
        <IncomingLoanCard key={loan._id} loan={loan} />
      ))}
    </ul>
  );
}
