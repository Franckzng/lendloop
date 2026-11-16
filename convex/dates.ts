// Loans are counted in calendar days, stored as "YYYY-MM-DD" strings.
// That format sorts and compares correctly as plain text.

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function toDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Today's calendar day in UTC. */
export function todayUtc(): string {
  return toDay(Date.now());
}

export function addDays(day: string, count: number): string {
  return toDay(Date.parse(`${day}T00:00:00Z`) + count * DAY_IN_MS);
}

/** True for a real calendar day such as "2026-02-28", false for "2026-02-31". */
export function isValidDay(value: string): boolean {
  if (!DAY_FORMAT.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(timestamp) && toDay(timestamp) === value;
}

type DayRange = { startDate: string; endDate: string };

/** Both ends are inclusive: a loan ending on the 5th blocks one starting on the 5th. */
export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
