const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-18" -> "18 Nov 2026". */
export function formatDay(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00Z`));
}

export function formatDayRange(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDay(startDate)
    : `${formatDay(startDate)} – ${formatDay(endDate)}`;
}

/** Today in the visitor's own timezone, as "YYYY-MM-DD". */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
