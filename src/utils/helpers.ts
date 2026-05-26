/**
 * Utility helper functions for the Diocese Financial Analytics System
 */

import { Role } from '../App';

/**
 * Formats currency values to Philippine Peso format
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "₱1,234.56")
 */
export const formatCurrency = (amount: number, decimals: number = 2): string => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

/**
 * Formats date to readable format
 * @param date - Date to format
 * @returns Formatted date string (e.g., "Apr 19, 2026")
 */
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Calculates days since a given date
 * @param date - Date to calculate from
 * @returns Number of days elapsed
 */
export const daysSince = (date: Date | string): number => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 3600 * 24));
};

/**
 * Checks if a date is within the submission deadline (15th of month)
 * @param date - Date to check
 * @returns True if before or on the 15th
 */
export const isBeforeDeadline = (date: Date): boolean => {
  return date.getDate() <= 15;
};

/**
 * Gets role display label
 * @param role - User role
 * @returns Display name for role
 */
export const getRoleDisplayName = (role: Role): string => {
  const labels: Record<Role, string> = {
    bishop: 'Bishop',
    admin: 'Administrator',
    priest: 'Parish Priest',
    school: 'School',
    seminary: 'Seminary',
  };
  return labels[role] || 'User';
};

/**
 * Checks if role has diocese-wide access
 * @param role - User role
 * @returns True if diocese access
 */
export const hasDioceseAccess = (role: Role): boolean => {
  return role === 'bishop' || role === 'admin';
};

/**
 * Generates a unique ID
 * @returns UUID-like string
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
