// Medical-records submission deadline engine for the Health Tracker.
//
// Each priest must submit their medical records once a year, anchored to their
// BIRTH MONTH. From that we derive a submission status (and how late it is) so
// the UI can show badges and the system can raise auto-generated reminders that
// disappear the moment a record is submitted.

export type SubmissionCode = 'submitted' | 'pending' | 'late' | 'year-late' | 'unknown';

export interface SubmissionStatus {
  code: SubmissionCode;
  /** Whole months past the birth-month deadline (0 when submitted or pending). */
  monthsLate: number;
  /** Human label, e.g. "Submitted", "Pending this month", "2 months late". */
  label: string;
  /** Severity for styling / priority. */
  severity: 'ok' | 'due' | 'late' | 'critical' | 'unknown';
  /** True when a reminder/announcement should be raised for this priest. */
  needsAttention: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Name of a priest's birth month, or '' when unknown. */
export function birthMonthName(birthDate?: string | null): string {
  const d = parseDate(birthDate);
  return d ? MONTHS[d.getMonth()] : '';
}

/**
 * Compute a priest's medical-records submission status.
 * @param birthDate    ISO birth date (the deadline anchor — the month matters).
 * @param lastCheckup  ISO date of their most recent submitted medical record.
 * @param now          Reference date (defaults to today; injectable for tests).
 */
export function getSubmissionStatus(
  birthDate?: string | null,
  lastCheckup?: string | null,
  now: Date = new Date(),
): SubmissionStatus {
  const birth = parseDate(birthDate);
  if (!birth) {
    return { code: 'unknown', monthsLate: 0, label: 'No birthday on file', severity: 'unknown', needsAttention: false };
  }

  const birthMonth = birth.getMonth(); // 0-11
  const year = now.getFullYear();

  // The active cycle's due month: this year's birth month if it has arrived,
  // otherwise last year's (the priest stays "current" until the next birth month).
  const dueYear = now.getMonth() < birthMonth ? year - 1 : year;
  const dueStart = new Date(dueYear, birthMonth, 1);
  const deadlineEnd = new Date(dueYear, birthMonth + 1, 0); // last day of the birth month

  const checkup = parseDate(lastCheckup);
  const submitted = !!checkup && checkup.getTime() >= dueStart.getTime();
  if (submitted) {
    return { code: 'submitted', monthsLate: 0, label: 'Submitted', severity: 'ok', needsAttention: false };
  }

  // Currently inside the birth month and not yet submitted → due this month.
  if (now.getFullYear() === dueYear && now.getMonth() === birthMonth) {
    return { code: 'pending', monthsLate: 0, label: 'Pending this month', severity: 'due', needsAttention: true };
  }

  const monthsLate = (now.getFullYear() - deadlineEnd.getFullYear()) * 12 + (now.getMonth() - deadlineEnd.getMonth());
  if (monthsLate <= 0) {
    // Birth month hasn't fully passed yet this cycle — treat as pending.
    return { code: 'pending', monthsLate: 0, label: 'Pending this month', severity: 'due', needsAttention: true };
  }
  if (monthsLate >= 12) {
    const years = Math.floor(monthsLate / 12);
    const remainingMonths = monthsLate % 12;
    const label = remainingMonths === 0
      ? `${years} year${years !== 1 ? 's' : ''} late`
      : `${years} year${years !== 1 ? 's' : ''} and ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} late`;
    return { code: 'year-late', monthsLate, label, severity: 'critical', needsAttention: true };
  }
  return {
    code: 'late',
    monthsLate,
    label: `${monthsLate} month${monthsLate === 1 ? '' : 's'} late`,
    severity: 'late',
    needsAttention: true,
  };
}
