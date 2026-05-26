/**
 * In-memory data store shared across all microservices.
 * Data persists for the lifetime of the server process.
 * In production this would be replaced by a proper database (e.g. PostgreSQL, MongoDB).
 */

import type { FinancialRecord, Project, Donation, ProjectExpense } from '../types';

// ------------------------------------------------------------------
// Financial records — keyed by `${entityId}:${entityType}` for fast
// entity-scoped lookups; also kept in a flat list for diocese-wide views.
// ------------------------------------------------------------------
export const recordsByEntity = new Map<string, FinancialRecord[]>();
export const allStoredRecords: FinancialRecord[] = [];

// ------------------------------------------------------------------
// Projects
// ------------------------------------------------------------------
export const projectsById = new Map<string, Project>();

// ------------------------------------------------------------------
// Donations & Expenses
// ------------------------------------------------------------------
export const donationsById = new Map<string, Donation>();
export const expensesById = new Map<string, ProjectExpense>();

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
export const entityKey = (entityId: string, entityType: string) =>
  `${entityId}:${entityType}`;

/** Generate a short random ID (placeholder; swap for uuid in production) */
export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
