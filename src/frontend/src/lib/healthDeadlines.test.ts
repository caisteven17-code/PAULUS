import assert from 'node:assert/strict';
import { getSubmissionStatus } from './healthDeadlines';

// No birthday on file.
assert.equal(getSubmissionStatus(null, null, new Date('2026-06-01')).code, 'unknown');

// Submitted this cycle (checkup on/after this year's birth-month start).
assert.equal(getSubmissionStatus('1980-03-15', '2026-03-20', new Date('2026-06-01')).code, 'submitted');

// Currently inside the birth month, not yet submitted => due this month.
{
  const status = getSubmissionStatus('1980-03-15', null, new Date('2026-03-10'));
  assert.equal(status.code, 'pending');
  assert.equal(status.severity, 'due');
  assert.equal(status.needsAttention, true);
}

// Past the birth month, not submitted => late, with the correct month count.
{
  const status = getSubmissionStatus('1980-03-15', null, new Date('2026-06-01'));
  assert.equal(status.code, 'late');
  assert.equal(status.monthsLate, 3);
  assert.equal(status.label, '3 months late');
}

// Birth month in December wraps into the next calendar year correctly.
{
  const status = getSubmissionStatus('1980-12-10', null, new Date('2027-02-01'));
  assert.equal(status.code, 'late');
  assert.equal(status.monthsLate, 2);
}

// A checkup from a prior cycle (before this cycle's due-start) doesn't count as submitted.
{
  const status = getSubmissionStatus('1980-03-15', '2025-04-01', new Date('2026-06-01'));
  assert.equal(status.code, 'late');
}
