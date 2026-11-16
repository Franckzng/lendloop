import type { ToolCategory } from "@/convex/toolOptions";

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export function CategoryBadge({ category }: { category: ToolCategory }) {
  return (
    <span className={`${badgeBase} bg-zinc-100 text-zinc-700 capitalize`}>
      {category}
    </span>
  );
}

export function AvailabilityBadge({ available }: { available: boolean }) {
  return available ? (
    <span className={`${badgeBase} bg-emerald-50 text-emerald-800`}>
      Available
    </span>
  ) : (
    <span className={`${badgeBase} bg-amber-50 text-amber-800`}>On loan</span>
  );
}
