'use client';

import { useState, useMemo, useEffect } from 'react';
import { FinancialRecord, FinancialHealthScore, DiagnosticResult } from '../types';
import { dataService } from '../services/dataService';
import { auth } from '../firebase';

export function usePriestDashboardData(
  entityId: string | undefined,
  entityType?: 'parish' | 'seminary' | 'school',
  entityClass?: string,
) {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userEntityInfo = useMemo(() => {
    const user = auth.currentUser;
    if (!user) return { id: 'default', type: 'parish' as const, name: 'San Isidro Labrador Parish', class: 'Class A' };

    // Retrieve dynamic values from the logged-in user profile metadata
    const id = user.entityId || 'default';
    const type = (user.entityType as 'parish' | 'seminary' | 'school') || 'parish';
    const name = user.entityName || 'San Isidro Labrador Parish';

    // Determine dynamic class based on standard parameters
    let fallbackClass = 'Class A';
    if (type === 'seminary') fallbackClass = 'Class B';

    return {
      id,
      type,
      name,
      class: fallbackClass,
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const id = entityId || userEntityInfo.id;
        const type = entityType || userEntityInfo.type;

        const [fetchedRecords, score, diag] = await Promise.all([
          dataService.getRecords(id, type, entityClass as any),
          dataService.calculateHealthScore(id, type, entityClass as any),
          dataService.getDiagnostic(id, 'Jan'), // Default to current month
        ]);
        setRecords(fetchedRecords);
        setHealthScore(score);
        setDiagnostics([diag]); // Wrap in array as expected by component
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [entityId, entityType, entityClass, userEntityInfo]);

  const kpis = useMemo(() => {
    if (!records.length) return null;
    const totalCollections = records.reduce((sum, r) => sum + r.collections, 0);
    const totalExpenses = records.reduce((sum, r) => sum + r.disbursements, 0);
    const netGrowth = ((totalCollections - totalExpenses) / totalCollections) * 100;

    return {
      totalCollections,
      totalExpenses,
      netGrowth,
      efficiency: (totalCollections / (totalExpenses || 1)) * 100,
    };
  }, [records]);

  return {
    records,
    healthScore,
    diagnostics,
    kpis,
    isLoading,
    userEntityInfo,
  };
}
