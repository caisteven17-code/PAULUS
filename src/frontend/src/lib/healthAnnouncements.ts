// Builds the auto-generated ("System") medical-records reminders from health
// records. These are computed live, so they vanish the moment a record is
// submitted — no stored announcement to clean up.
import { getSubmissionStatus, birthMonthName } from './healthDeadlines';

export interface HealthRecordLike {
  name: string;
  parish?: string;
  position?: string;
  email?: string;
  birthDate?: string | null;
  lastCheckup?: string | null;
}

export interface SystemHealthAnnouncement {
  id: string;
  title: string;
  content: string;
  category: 'system';
  priority: 'important';
  /** For the diocesan aggregate: the priests behind the count (drill-down). */
  names?: { name: string; parish?: string; status: string }[];
}

/** Personal reminder for the signed-in priest, or null when nothing is due. */
export function getPriestHealthReminder(
  record: HealthRecordLike | undefined | null,
  now: Date = new Date(),
): SystemHealthAnnouncement | null {
  if (!record) return null;
  const status = getSubmissionStatus(record.birthDate, record.lastCheckup, now);
  if (!status.needsAttention) return null;

  const month = birthMonthName(record.birthDate);
  let content: string;
  if (status.code === 'pending') {
    content = `Your medical records are due this month${month ? ` (${month})` : ''}. Please submit them in the Health Tracker.`;
  } else if (status.code === 'year-late') {
    content = `You are 1 year late submitting your medical records. Please submit them in the Health Tracker as soon as possible.`;
  } else {
    content = `You are ${status.label.toLowerCase()} submitting your medical records. Please submit them in the Health Tracker.`;
  }
  return { id: 'health-self', title: 'Medical Records Submission', content, category: 'system', priority: 'important' };
}

/** Diocesan aggregate: how many priests are pending/late, plus their names. */
export function getDioceseHealthSummary(
  records: HealthRecordLike[],
  now: Date = new Date(),
): SystemHealthAnnouncement | null {
  const overdue = records
    .map((r) => ({ r, s: getSubmissionStatus(r.birthDate, r.lastCheckup, now) }))
    .filter((x) => x.s.needsAttention);

  if (overdue.length === 0) return null;

  const n = overdue.length;
  return {
    id: 'health-diocese',
    title: 'Priests With Pending Medical Records',
    content: `${n} parish priest${n === 1 ? '' : 's'} ${n === 1 ? "hasn't" : "haven't"} submitted their medical records this cycle. Click for details.`,
    category: 'system',
    priority: 'important',
    names: overdue
      .sort((a, b) => b.s.monthsLate - a.s.monthsLate)
      .map((x) => ({ name: x.r.name, parish: x.r.parish, status: x.s.label })),
  };
}
