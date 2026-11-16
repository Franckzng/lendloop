"use client";

import { useState, type ReactNode } from "react";
import { TrustedBadge } from "@/components/TrustedBadge";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDayRange, reminderLabel } from "@/lib/dates";
import { cardClass } from "@/lib/styles";
import { StatusBadge } from "./StatusBadge";

type LoanCardProps = {
  toolName: string;
  /** Who the other person is, e.g. "Lent by Awa" or "Requested by Issa". */
  counterpart: string;
  startDate: string;
  endDate: string;
  status: Doc<"loans">["status"];
  overdue: boolean;
  /** True when the lender named in `counterpart` is a Trusted Lender. */
  trusted?: boolean;
  /** When the latest overdue reminder was sent, if any. */
  lastReminderAt?: number | null;
  children?: ReactNode;
};

export function LoanCard({
  toolName,
  counterpart,
  startDate,
  endDate,
  status,
  overdue,
  trusted = false,
  lastReminderAt = null,
  children,
}: LoanCardProps) {
  const [now] = useState(Date.now);

  return (
    <li className={`${cardClass} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-900">{toolName}</h3>
        <StatusBadge status={status} overdue={overdue} />
      </div>
      <p className="text-sm text-zinc-700">{formatDayRange(startDate, endDate)}</p>
      <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {counterpart}
        {trusted && <TrustedBadge />}
      </p>
      {lastReminderAt !== null && (
        <p className="text-xs text-red-700">
          {reminderLabel(lastReminderAt, now)}
        </p>
      )}
      {children}
    </li>
  );
}
