import type { Doc } from "@/convex/_generated/dataModel";

type LoanStatus = Doc<"loans">["status"];

const STATUS_STYLES: Record<LoanStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  declined: "bg-zinc-100 text-zinc-600",
  returned: "bg-sky-50 text-sky-800",
};

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize";

export function StatusBadge({
  status,
  overdue,
}: {
  status: LoanStatus;
  overdue: boolean;
}) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <span className={`${badgeBase} ${STATUS_STYLES[status]}`}>{status}</span>
      {overdue && (
        <span className={`${badgeBase} bg-red-50 text-red-700`}>Overdue</span>
      )}
    </span>
  );
}
