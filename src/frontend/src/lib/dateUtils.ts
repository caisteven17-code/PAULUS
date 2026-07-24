/**
 * dateUtils.ts
 *
 * Shared date helpers that always operate in the canonical business timezone
 * (Asia/Manila, UTC+8) for the Diocese of San Pablo system.
 *
 * All date comparisons, minimum-date guards, and overdue calculations across
 * the application MUST use these helpers instead of bare `new Date()` calls
 * so that the system behaves correctly regardless of where the browser is
 * running.
 */

const MANILA_TZ = 'Asia/Manila';

/**
 * Returns today's date (year/month/day) in Manila time as a plain Date
 * object with the time set to 00:00:00 local (Manila) midnight.
 *
 * Use this wherever you need "today's date" for comparisons (e.g. overdue
 * calculations, budget month guards).
 */
export function getTodayManila(): Date {
  const now = new Date();
  // Use Intl to extract the current date parts in Manila timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  // Return as a local Date at midnight (time comparisons are day-level only)
  return new Date(year, month - 1, day);
}

/**
 * Returns tomorrow's date in Manila time.
 *
 * Use this as the `min` value for end-viewing date pickers on Events and
 * Announcements (Bug 3.2 and 3.3) to prevent selecting today or past dates.
 */
export function getTomorrowManila(): Date {
  const today = getTodayManila();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
}

/**
 * Returns tomorrow's date as a string in `YYYY-MM-DD` format, suitable for
 * use as the HTML `min` attribute on `<input type="date">` elements.
 *
 * Example:  <input type="date" min={getTomorrowManilaISO()} />
 */
export function getTomorrowManilaISO(): string {
  const d = getTomorrowManila();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns today's date as a string in `YYYY-MM-DD` format (Manila timezone).
 *
 * Use this for budget month guards — months before today's month/year must
 * not be selectable (Bug 3.6).
 */
export function getTodayManilaISO(): string {
  const d = getTodayManila();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the current year and month (1-indexed) in Manila timezone.
 *
 * Use this for budget period selectors to disable past months (Bug 3.6).
 *
 * Example:
 *   const { year, month } = getCurrentYearMonthManila();
 *   // month 7 = July (January = 1)
 */
export function getCurrentYearMonthManila(): { year: number; month: number } {
  const today = getTodayManila();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/**
 * Calculates the number of whole months elapsed between `pastDate` and today
 * (Manila time). Used by Health Tracker overdue duration calculations (Bug 4.3).
 *
 * Returns 0 if pastDate is in the future.
 */
export function monthsElapsedSince(pastDate: Date): number {
  const today = getTodayManila();
  const yearDiff = today.getFullYear() - pastDate.getFullYear();
  const monthDiff = today.getMonth() - pastDate.getMonth();
  const total = yearDiff * 12 + monthDiff;
  // If the day of the month hasn't been reached yet, subtract 1
  const dayAdjust = today.getDate() < pastDate.getDate() ? -1 : 0;
  return Math.max(0, total + dayAdjust);
}

/**
 * Returns a human-readable overdue label for Health Tracker display.
 *
 * Examples: "3 months late", "1 year and 2 months late", "2 years late"
 */
export function formatOverdueLabel(pastDate: Date): string {
  const months = monthsElapsedSince(pastDate);
  if (months <= 0) return 'Up to date';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (years === 0) return `${months} month${months !== 1 ? 's' : ''} late`;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''} late`;
  return `${years} year${years !== 1 ? 's' : ''} and ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} late`;
}
