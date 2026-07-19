'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GitBranch,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';

type CanonicalAccount = {
  id?: string;
  account_code: string;
  account_name: string;
  section_code?: string;
  subsection_code?: string | null;
  account_type?: string;
  classification?: string | null;
};

type ParishInstitution = {
  id: string;
  name: string;
  institution_code?: string | null;
  vicariate?: string | null;
  class?: string | null;
};

type ParishMatch = {
  sourceCode: string | null;
  sourceName: string;
  institutionId: string | null;
  matchStatus: 'matched' | 'suggested' | 'unmatched';
  matchName?: string | null;
  confidence?: number | null;
  validationStatus: 'ready' | 'warning' | 'blocked';
  rowCount: number;
};

type PusherColumn = {
  key: string;
  column: string;
  source_section: string;
  source_header: string;
  header_path: string;
  suggested_account_code: string | null;
  suggested_account_name: string | null;
  suggested_field: string | null;
  confidence: number;
  status: 'approved' | 'needs_review' | 'ignored' | 'suggested';
  reason: string;
  aggregation_rule: string;
  is_combined: boolean;
};

type PusherFileResult = {
  batchId: string | null;
  fileName: string;
  persistenceStatus: 'persisted' | 'preview_only';
  summary: {
    detectedYear: number | null;
    monthCount: number;
    parishCount: number;
    extractedRowCount: number;
    readyRowCount: number;
    warningRowCount: number;
    blockedRowCount: number;
    columnCount: number;
    mappingReviewCount: number;
    zeroFilledCellCount: number;
  };
  columns: PusherColumn[];
  parishMatches: ParishMatch[];
  sampleRows: Array<{
    parish_code: string | null;
    parish_name: string;
    reporting_month_label: string;
    reporting_year: number;
    validation_status: string;
    zero_filled_fields: number;
    institution_match_status: string;
    institution_match_name?: string | null;
  }>;
};

type MappingChoice = {
  key: string;
  action: 'map' | 'ignore' | 'memo' | 'not_in_template';
  canonicalAccountCode: string | null;
  canonicalField: string | null;
  aggregationRule: string;
  sourceHeader: string;
  sourceSection: string;
};

type CommitProgress = {
  batchId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  committedRows: number;
  skippedRows: number;
  blockedRows: number;
  readyRows: number;
  warningRows: number;
  lineItemsCreated?: number | null;
  percent: number;
  error?: string | null;
};

type BatchRow = {
  id: string;
  parishCode: string | null;
  parishName: string;
  sourceRowNumber?: number | null;
  reportingMonth: number;
  reportingMonthLabel?: string | null;
  reportingYear: number;
  validationStatus: string;
  issues?: Array<{
    severity?: string;
    type?: string;
    message?: string;
    column?: string;
  }>;
  reason?: string | null;
};

interface PusherProps {
  onBack: () => void;
}

const importModes = [
  { id: 'skip_existing', label: 'Skip existing', description: 'Keeps current parish-month records unchanged.' },
  {
    id: 'replace_existing',
    label: 'Replace existing',
    description: 'Rebuilds line items for matching parish-month records.',
  },
  {
    id: 'version_existing',
    label: 'Version existing',
    description: 'Reserved for later versioning; currently behaves like replace.',
  },
  {
    id: 'patch_selected',
    label: 'Patch selected columns',
    description: 'Updates mapped columns only and preserves every other line item.',
  },
] as const;

const statusStyle: Record<string, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  ignored: 'border-gray-200 bg-gray-50 text-gray-600',
  suggested: 'border-blue-200 bg-blue-50 text-blue-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
};

function parishKey(match: Pick<ParishMatch, 'sourceCode' | 'sourceName'>) {
  return `${match.sourceCode ?? ''}:${match.sourceName}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function rowIssueMessages(row: BatchRow) {
  if (!row.issues?.length) return [row.reason || 'Row was blocked by validation.'];
  return row.issues.map((issue) => {
    const label = issue.column ? `${issue.column}: ` : '';
    return `${label}${issue.message || issue.type || 'Validation issue'}`;
  });
}

function mappingFromColumn(column: PusherColumn): MappingChoice {
  const action =
    column.status === 'ignored'
      ? 'ignore'
      : column.aggregation_rule === 'memo'
        ? 'memo'
        : column.suggested_account_code
          ? 'map'
          : 'memo';

  return {
    key: column.key,
    action,
    canonicalAccountCode: column.suggested_account_code,
    canonicalField: column.suggested_field,
    aggregationRule: column.aggregation_rule,
    sourceHeader: column.source_header,
    sourceSection: column.source_section,
  };
}

function defaultAccountDraft(year = new Date().getFullYear()) {
  return {
    accountCode: '',
    accountName: '',
    sectionCode: 'D',
    subsectionCode: '',
    accountType: 'receipt',
    classification: '',
    effectiveYear: year,
    reason: '',
  };
}

export function Pusher({ onBack }: PusherProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [accounts, setAccounts] = useState<CanonicalAccount[]>([]);
  const [institutions, setInstitutions] = useState<ParishInstitution[]>([]);
  const [results, setResults] = useState<PusherFileResult[]>([]);
  const [activeFileName, setActiveFileName] = useState('');
  const [mappingChoices, setMappingChoices] = useState<Record<string, MappingChoice>>({});
  const [parishChoices, setParishChoices] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<CommitProgress | null>(null);
  const [skippedRows, setSkippedRows] = useState<BatchRow[]>([]);
  const [skippedRowsTotal, setSkippedRowsTotal] = useState(0);
  const [skippedRowsOpen, setSkippedRowsOpen] = useState(false);
  const [isLoadingSkippedRows, setIsLoadingSkippedRows] = useState(false);
  const [blockedRows, setBlockedRows] = useState<BatchRow[]>([]);
  const [blockedRowsTotal, setBlockedRowsTotal] = useState(0);
  const [blockedRowsOpen, setBlockedRowsOpen] = useState(false);
  const [isLoadingBlockedRows, setIsLoadingBlockedRows] = useState(false);
  const [savingParishKeys, setSavingParishKeys] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [importMode, setImportMode] = useState<(typeof importModes)[number]['id']>('skip_existing');
  const [search, setSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountDraftOpen, setAccountDraftOpen] = useState(false);
  const [draftSource, setDraftSource] = useState<PusherColumn | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draftAccount, setDraftAccount] = useState(defaultAccountDraft());

  useEffect(() => {
    fetch('/api/pusher/accounts')
      .then((res) => (res.ok ? res.json() : { accounts: [] }))
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]));
    fetch('/api/pusher/institutions')
      .then((res) => (res.ok ? res.json() : { institutions: [] }))
      .then((data) => setInstitutions(data.institutions ?? []))
      .catch(() => setInstitutions([]));
  }, []);

  useEffect(() => {
    return () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, []);

  const activeResult = results.find((file) => file.fileName === activeFileName) ?? results[0] ?? null;

  const accountLabel = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((account) => {
      map[account.account_code] = `${account.account_code} - ${account.account_name}`;
    });
    return map;
  }, [accounts]);

  const filteredColumns = useMemo(() => {
    if (!activeResult) return [];
    const term = search.trim().toLowerCase();
    if (!term) return activeResult.columns;
    return activeResult.columns.filter((column) =>
      [column.column, column.source_header, column.source_section, column.header_path, column.suggested_account_code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [activeResult, search]);

  const mappingSummary = useMemo(() => {
    if (!activeResult) return { mapped: 0, review: 0, ignored: 0 };
    return activeResult.columns.reduce(
      (acc, column) => {
        const choice = mappingChoices[`${activeResult.fileName}:${column.key}`] ?? mappingFromColumn(column);
        if (choice.action === 'map' && choice.canonicalAccountCode) acc.mapped += 1;
        else if (choice.action === 'ignore' || choice.action === 'not_in_template') acc.ignored += 1;
        else acc.review += 1;
        return acc;
      },
      { mapped: 0, review: 0, ignored: 0 },
    );
  }, [activeResult, mappingChoices]);

  const parishReviewRows = useMemo(() => {
    if (!activeResult) return [];
    return activeResult.parishMatches.filter(
      (match) => match.validationStatus !== 'ready' || match.matchStatus !== 'matched',
    );
  }, [activeResult]);

  const unresolvedParishCount = useMemo(() => {
    if (!activeResult) return 0;
    return parishReviewRows.filter((match) => !parishChoices[`${activeResult.fileName}:${parishKey(match)}`]).length;
  }, [activeResult, parishChoices, parishReviewRows]);

  const filteredAccounts = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((account) =>
      [account.account_code, account.account_name, account.section_code, account.account_type, account.classification]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [accountSearch, accounts]);

  const handleFiles = (files: FileList | null) => {
    const next = Array.from(files ?? []).filter((file) => /\.xlsx$/i.test(file.name));
    setSelectedFiles(next);
    setResults([]);
    setMappingChoices({});
    setParishChoices({});
    setCommitProgress(null);
    setSkippedRows([]);
    setSkippedRowsTotal(0);
    setSkippedRowsOpen(false);
    setBlockedRows([]);
    setBlockedRowsTotal(0);
    setBlockedRowsOpen(false);
    setIsCommitting(false);
    setCommitMessage('');
    setError(next.length ? '' : 'Please choose one or more .xlsx files.');
  };

  const validateFiles = async () => {
    if (selectedFiles.length === 0) {
      setError('Please choose the yearly Excel files first.');
      return;
    }
    setIsValidating(true);
    setError('');
    setCommitMessage('');
    setCommitProgress(null);
    setSkippedRows([]);
    setSkippedRowsTotal(0);
    setSkippedRowsOpen(false);
    setBlockedRows([]);
    setBlockedRowsTotal(0);
    setBlockedRowsOpen(false);
    setIsCommitting(false);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      formData.append('uploadedBy', 'PUSHER temporary user');
      const res = await fetch('/api/pusher/validate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Validation failed.');
      const files: PusherFileResult[] = data.files ?? [];
      const initialChoices: Record<string, MappingChoice> = {};
      const initialParishChoices: Record<string, string> = {};
      files.forEach((file) => {
        file.columns.forEach((column) => {
          initialChoices[`${file.fileName}:${column.key}`] = mappingFromColumn(column);
        });
        file.parishMatches.forEach((match) => {
          if (match.institutionId) {
            initialParishChoices[`${file.fileName}:${parishKey(match)}`] = match.institutionId;
          }
        });
      });
      setResults(files);
      setMappingChoices(initialChoices);
      setParishChoices(initialParishChoices);
      setActiveFileName(files[0]?.fileName ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const updateChoice = (column: PusherColumn, patch: Partial<MappingChoice>) => {
    if (!activeResult) return;
    const choiceKey = `${activeResult.fileName}:${column.key}`;
    setMappingChoices((prev) => ({
      ...prev,
      [choiceKey]: {
        ...(prev[choiceKey] ?? mappingFromColumn(column)),
        ...patch,
      },
    }));
  };

  const selectImportMode = (mode: (typeof importModes)[number]['id']) => {
    setImportMode(mode);
    if (mode !== 'patch_selected' || !activeResult) return;
    setMappingChoices((previous) => {
      const next = { ...previous };
      activeResult.columns.forEach((column) => {
        const key = `${activeResult.fileName}:${column.key}`;
        const current = previous[key] ?? mappingFromColumn(column);
        next[key] =
          current.canonicalAccountCode === 'B.3.06'
            ? { ...current, action: 'map', aggregationRule: 'sum' }
            : {
                ...current,
                action: 'ignore',
                canonicalAccountCode: null,
                canonicalField: null,
                aggregationRule: 'ignore',
              };
      });
      return next;
    });
  };

  const toggleColumnVisibility = (column: PusherColumn, choice: MappingChoice) => {
    if (choice.action === 'ignore') {
      updateChoice(column, mappingFromColumn(column));
      return;
    }
    updateChoice(column, {
      action: 'ignore',
      canonicalAccountCode: null,
      canonicalField: null,
      aggregationRule: 'ignore',
    });
  };

  const stopProgressPolling = () => {
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
  };

  const fetchCommitProgress = async (batchId: string) => {
    const res = await fetch(`/api/pusher/commit-progress/${encodeURIComponent(batchId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || data?.error || 'Could not read push progress.');
    setCommitProgress(data);
    if (data.status === 'committed') {
      stopProgressPolling();
      setIsCommitting(false);
      setCommitMessage(
        `Committed ${formatNumber(data.committedRows)} parish-month rows and wrote ${formatNumber(
          data.lineItemsCreated ?? 0,
        )} line items. Skipped ${formatNumber(data.skippedRows)} row(s).`,
      );
    } else if (data.status === 'failed') {
      stopProgressPolling();
      setIsCommitting(false);
      setError(data.error || 'Push failed while inserting records.');
    }
    return data as CommitProgress;
  };

  const loadSkippedRows = async (batchId: string) => {
    setIsLoadingSkippedRows(true);
    setError('');
    try {
      const res = await fetch(`/api/pusher/batch-rows/${encodeURIComponent(batchId)}?status=skipped&limit=1000`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Could not load skipped rows.');
      setSkippedRows(data.rows ?? []);
      setSkippedRowsTotal(data.total ?? 0);
      setSkippedRowsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load skipped rows.');
    } finally {
      setIsLoadingSkippedRows(false);
    }
  };

  const loadBlockedRows = async (batchId: string) => {
    setIsLoadingBlockedRows(true);
    setError('');
    try {
      const res = await fetch(`/api/pusher/batch-rows/${encodeURIComponent(batchId)}?status=blocked&limit=2000`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Could not load blocked rows.');
      setBlockedRows(data.rows ?? []);
      setBlockedRowsTotal(data.total ?? 0);
      setBlockedRowsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load blocked rows.');
    } finally {
      setIsLoadingBlockedRows(false);
    }
  };

  const toggleBlockedRows = async () => {
    if (blockedRowsOpen) {
      setBlockedRowsOpen(false);
      return;
    }
    if (!activeResult?.batchId) {
      setError('Blocked rows are only available after the validation preview is saved. Re-validate this file first.');
      return;
    }
    await loadBlockedRows(activeResult.batchId);
  };

  const saveParishMatch = async (match: ParishMatch, institutionId: string) => {
    if (!activeResult) return;
    const key = `${activeResult.fileName}:${parishKey(match)}`;
    setParishChoices((prev) => ({ ...prev, [key]: institutionId }));
    if (!institutionId) return;
    if (!activeResult.batchId) {
      setError('This preview was not saved yet. Re-validate the file before saving parish matches.');
      return;
    }

    setSavingParishKeys((prev) => ({ ...prev, [key]: true }));
    setError('');
    try {
      const res = await fetch('/api/pusher/parish-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: activeResult.batchId,
          sourceCode: match.sourceCode,
          sourceName: match.sourceName,
          institutionId,
          savedBy: 'PUSHER temporary user',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Could not save parish match.');

      setResults((prev) =>
        prev.map((file) =>
          file.fileName === activeResult.fileName
            ? {
                ...file,
                summary: {
                  ...file.summary,
                  readyRowCount: data.readyRowCount ?? file.summary.readyRowCount,
                  warningRowCount: data.warningRowCount ?? file.summary.warningRowCount,
                  blockedRowCount: data.blockedRowCount ?? file.summary.blockedRowCount,
                },
                parishMatches: file.parishMatches.map((item) =>
                  parishKey(item) === parishKey(match)
                    ? {
                        ...item,
                        institutionId,
                        matchStatus: 'matched',
                        matchName: data.institutionName ?? item.matchName,
                        confidence: 1,
                        validationStatus: 'ready',
                      }
                    : item,
                ),
              }
            : file,
        ),
      );
      setCommitMessage(`Saved parish match and updated ${formatNumber(data.updatedRows ?? 0)} staged row(s).`);
      if (blockedRowsOpen) {
        await loadBlockedRows(activeResult.batchId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save parish match.');
    } finally {
      setSavingParishKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const startProgressPolling = (batchId: string) => {
    stopProgressPolling();
    void fetchCommitProgress(batchId).catch((err) =>
      setError(err instanceof Error ? err.message : 'Could not read push progress.'),
    );
    progressPollRef.current = setInterval(() => {
      void fetchCommitProgress(batchId).catch((err) => {
        stopProgressPolling();
        setIsCommitting(false);
        setError(err instanceof Error ? err.message : 'Could not read push progress.');
      });
    }, 2500);
  };

  const commitActiveFile = async () => {
    if (!activeResult?.batchId) {
      setError('This preview was not persisted. Apply the PUSHER migration and validate again before committing.');
      return;
    }
    if (!activeResult.summary.extractedRowCount) {
      setError('No parish rows were detected in this file. Re-validate after checking the workbook format.');
      return;
    }
    const mappings = activeResult.columns.map(
      (column) => mappingChoices[`${activeResult.fileName}:${column.key}`] ?? mappingFromColumn(column),
    );
    const unresolved = mappings.filter((mapping) => mapping.action === 'map' && !mapping.canonicalAccountCode).length;
    if (unresolved) {
      setError('Some mapped columns do not have a canonical account yet.');
      return;
    }
    if (importMode === 'patch_selected' && !mappings.some((mapping) => mapping.action === 'map')) {
      setError('Select at least one source column to patch.');
      return;
    }
    if (unresolvedParishCount) {
      setError('Some parish matches still need a selected institution before pushing.');
      return;
    }
    const parishMappings = activeResult.parishMatches
      .map((match) => ({
        sourceCode: match.sourceCode,
        sourceName: match.sourceName,
        institutionId: parishChoices[`${activeResult.fileName}:${parishKey(match)}`] ?? match.institutionId,
      }))
      .filter((mapping) => mapping.institutionId);

    setIsCommitting(true);
    setCommitProgress(null);
    setSkippedRows([]);
    setSkippedRowsTotal(0);
    setSkippedRowsOpen(false);
    setBlockedRows([]);
    setBlockedRowsTotal(0);
    setBlockedRowsOpen(false);
    setError('');
    setCommitMessage('');
    try {
      const res = await fetch('/api/pusher/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: activeResult.batchId,
          mappings,
          parishMappings,
          importMode,
          committedBy: 'PUSHER temporary user',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Commit failed.');
      setCommitMessage('Push started. Watching live progress...');
      startProgressPolling(data.batchId ?? activeResult.batchId);
    } catch (err) {
      stopProgressPolling();
      setError(err instanceof Error ? err.message : 'Commit failed.');
      setIsCommitting(false);
    }
  };

  const openAccountDraft = (column: PusherColumn) => {
    setDraftSource(column);
    setEditingAccountId(null);
    setDraftAccount({
      ...defaultAccountDraft(activeResult?.summary.detectedYear ?? new Date().getFullYear()),
      accountName: column.source_header,
      classification: column.source_section,
      reason: `Created from PUSHER source column ${column.column}.`,
    });
    setAccountSearch('');
    setAccountDraftOpen(true);
  };

  const openAccountManager = () => {
    setDraftSource(null);
    setEditingAccountId(null);
    setDraftAccount(defaultAccountDraft(activeResult?.summary.detectedYear ?? new Date().getFullYear()));
    setAccountSearch('');
    setAccountDraftOpen(true);
  };

  const editCanonicalAccount = (account: CanonicalAccount) => {
    if (!account.id) return;
    setDraftSource(null);
    setEditingAccountId(account.id);
    setDraftAccount({
      accountCode: account.account_code,
      accountName: account.account_name,
      sectionCode: account.section_code ?? account.account_code.slice(0, 1),
      subsectionCode: account.subsection_code ?? '',
      accountType: account.account_type ?? 'receipt',
      classification: account.classification ?? '',
      effectiveYear: activeResult?.summary.detectedYear ?? new Date().getFullYear(),
      reason: 'Updated from PUSHER canonical account management.',
    });
  };

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setDraftSource(null);
    setDraftAccount(defaultAccountDraft(activeResult?.summary.detectedYear ?? new Date().getFullYear()));
  };

  const createCanonicalAccount = async () => {
    if (!draftAccount.accountCode.trim() || !draftAccount.accountName.trim()) {
      setError('Account code and account name are required.');
      return;
    }
    setError('');
    try {
      const res = await fetch('/api/pusher/canonical-account', {
        method: editingAccountId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccountId,
          ...draftAccount,
          sourceHeader: draftSource?.source_header ?? 'Canonical account manager',
          sourceSection: draftSource?.source_section ?? draftAccount.sectionCode,
          requestedBy: 'PUSHER temporary user',
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.detail || created?.error || 'Could not save canonical account.');
      const nextAccount: CanonicalAccount = created;
      setAccounts((prev) => {
        const withoutCurrent = prev.filter((account) => account.id !== nextAccount.id);
        return [...withoutCurrent, nextAccount].sort((a, b) => a.account_code.localeCompare(b.account_code));
      });
      if (draftSource) {
        updateChoice(draftSource, {
          action: 'map',
          canonicalAccountCode: nextAccount.account_code,
          canonicalField: null,
          aggregationRule: 'sum',
        });
      }
      setCommitMessage(
        `Canonical account ${nextAccount.account_code} was ${editingAccountId ? 'updated' : 'created'}.`,
      );
      setAccountDraftOpen(false);
      setDraftSource(null);
      setEditingAccountId(null);
      setDraftAccount(defaultAccountDraft(activeResult?.summary.detectedYear ?? new Date().getFullYear()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save canonical account.');
    }
  };

  const deleteCanonicalAccount = async (account: CanonicalAccount) => {
    if (!account.id) {
      setError('This canonical account cannot be deleted because it has no database id.');
      return;
    }
    const confirmed = window.confirm(`Deactivate canonical account ${account.account_code} - ${account.account_name}?`);
    if (!confirmed) return;
    setError('');
    try {
      const res = await fetch(`/api/pusher/canonical-account?id=${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
      });
      const deleted = await res.json();
      if (!res.ok) throw new Error(deleted?.detail || deleted?.error || 'Could not delete canonical account.');
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      if (editingAccountId === account.id) resetAccountForm();
      setCommitMessage(`Canonical account ${account.account_code} was deactivated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete canonical account.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-4 sm:px-6">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
            title="Back to login"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
                Temporary PUSHER
              </span>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                Preview before commit
              </span>
            </div>
            <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Historical Parish Financial Import
            </h1>
          </div>
          <button
            onClick={openAccountManager}
            className="hidden items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-stone-50 sm:flex"
          >
            <Database className="h-4 w-4" />
            Canonical Accounts
          </button>
          <button
            onClick={validateFiles}
            disabled={isValidating || selectedFiles.length === 0}
            className="hidden items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
          >
            {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Validate
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr_1fr]">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">1. Upload</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Choose the annual Excel files. The scanner expects monthly sheets like January 2024.
                </p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-4 text-sm font-bold text-amber-800 transition hover:bg-amber-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Choose Excel Files
            </button>
            {selectedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {selectedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{file.name}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={validateFiles}
              disabled={isValidating || selectedFiles.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
            >
              {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              Validate Files
            </button>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">2. Validate and Clean</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Blank numeric cells are staged as zero. Unknown mappings and parish matches are surfaced before
                  commit.
                </p>
              </div>
            </div>
            {activeResult ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Months" value={activeResult.summary.monthCount} />
                <Metric label="Parishes" value={activeResult.summary.parishCount} />
                <Metric label="Rows" value={activeResult.summary.extractedRowCount} />
                <Metric label="Zero-filled" value={activeResult.summary.zeroFilledCellCount} />
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-slate-500">
                Validation results will appear here.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">3. Push Approved Data</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Commit only after mappings are reviewed. Existing parish-month records follow your selected mode.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {importModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => selectImportMode(mode.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    importMode === mode.id
                      ? 'border-slate-900 bg-slate-950 text-white'
                      : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50'
                  }`}
                >
                  <p className="text-sm font-bold">{mode.label}</p>
                  <p className={`mt-1 text-[11px] ${importMode === mode.id ? 'text-white/65' : 'text-slate-500'}`}>
                    {mode.description}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={commitActiveFile}
              disabled={!activeResult || isCommitting || !activeResult.batchId || unresolvedParishCount > 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {isCommitting ? 'Pushing...' : 'Push Active File'}
            </button>
            {commitProgress && (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
                <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
                  <span>{commitProgress.status === 'committed' ? 'Push complete' : 'Live push progress'}</span>
                  <span>{Math.min(100, Math.max(0, Math.round(commitProgress.percent)))}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, commitProgress.percent))}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span>
                    Processed <b className="text-slate-950">{formatNumber(commitProgress.processedRows)}</b> /{' '}
                    {formatNumber(commitProgress.totalRows)}
                  </span>
                  <span>
                    Inserted <b className="text-slate-950">{formatNumber(commitProgress.committedRows)}</b>
                  </span>
                  <span>
                    Skipped <b className="text-slate-950">{formatNumber(commitProgress.skippedRows)}</b>
                  </span>
                  <span>
                    Line items <b className="text-slate-950">{formatNumber(commitProgress.lineItemsCreated ?? 0)}</b>
                  </span>
                </div>
                {commitProgress.skippedRows > 0 && (
                  <div className="mt-3 border-t border-emerald-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        skippedRowsOpen ? setSkippedRowsOpen(false) : loadSkippedRows(commitProgress.batchId)
                      }
                      disabled={isLoadingSkippedRows}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingSkippedRows ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ListChecks className="h-3.5 w-3.5" />
                      )}
                      {skippedRowsOpen ? 'Hide skipped rows' : 'View skipped rows'}
                    </button>
                    {skippedRowsOpen && (
                      <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-emerald-100 bg-white">
                        <div className="sticky top-0 grid grid-cols-[0.8fr_1.5fr_1.4fr] gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-900">
                          <span>Month</span>
                          <span>Parish</span>
                          <span>Reason</span>
                        </div>
                        {skippedRows.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[0.8fr_1.5fr_1.4fr] gap-2 border-b border-stone-100 px-3 py-2 text-xs text-slate-600 last:border-b-0"
                          >
                            <span className="font-bold text-slate-800">
                              {row.reportingMonthLabel ?? row.reportingMonth} {row.reportingYear}
                            </span>
                            <span>
                              <b className="text-slate-900">{row.parishCode ?? 'name match'}</b>
                              <br />
                              {row.parishName}
                            </span>
                            <span>{row.reason}</span>
                          </div>
                        ))}
                        {skippedRows.length === 0 && (
                          <div className="px-3 py-4 text-xs font-semibold text-slate-500">
                            No skipped rows found for this batch.
                          </div>
                        )}
                      </div>
                    )}
                    {skippedRowsOpen && skippedRowsTotal > skippedRows.length && (
                      <p className="mt-2 text-xs font-semibold text-emerald-800">
                        Showing {formatNumber(skippedRows.length)} of {formatNumber(skippedRowsTotal)} skipped rows.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        )}
        {commitMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{commitMessage}</p>
          </div>
        )}

        {results.length > 0 && (
          <section className="rounded-lg border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 py-3">
              {results.map((file) => (
                <button
                  key={file.fileName}
                  onClick={() => setActiveFileName(file.fileName)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                    activeResult?.fileName === file.fileName
                      ? 'bg-slate-950 text-white'
                      : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                  }`}
                >
                  {file.summary.detectedYear ?? 'Mixed'} · {file.fileName}
                </button>
              ))}
            </div>

            {activeResult && (
              <>
                <div className="grid grid-cols-2 gap-3 border-b border-stone-200 p-4 md:grid-cols-6">
                  <Metric label="Ready" value={activeResult.summary.readyRowCount} tone="emerald" />
                  <Metric label="Warnings" value={activeResult.summary.warningRowCount} tone="amber" />
                  <Metric
                    label="Blocked"
                    value={activeResult.summary.blockedRowCount}
                    tone="red"
                    onClick={activeResult.summary.blockedRowCount > 0 ? toggleBlockedRows : undefined}
                    active={blockedRowsOpen}
                  />
                  <Metric label="Columns" value={activeResult.summary.columnCount} />
                  <Metric label="Mapped" value={mappingSummary.mapped} tone="emerald" />
                  <Metric label="Review" value={mappingSummary.review} tone="amber" />
                </div>

                {activeResult.summary.blockedRowCount > 0 && (
                  <div className="border-b border-red-100 bg-red-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-red-900">Blocked Rows</h3>
                        <p className="mt-1 text-sm text-red-800">
                          These parish-month rows will not push until their validation issues are fixed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleBlockedRows}
                        disabled={isLoadingBlockedRows}
                        className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoadingBlockedRows ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ListChecks className="h-3.5 w-3.5" />
                        )}
                        {blockedRowsOpen ? 'Hide blocked rows' : 'View blocked rows'}
                      </button>
                    </div>

                    {blockedRowsOpen && (
                      <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-red-100 bg-white">
                        <div className="sticky top-0 grid grid-cols-[0.75fr_0.5fr_1.5fr_2fr] gap-2 border-b border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-900">
                          <span>Month</span>
                          <span>Row</span>
                          <span>Parish</span>
                          <span>Issue</span>
                        </div>
                        {blockedRows.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[0.75fr_0.5fr_1.5fr_2fr] gap-2 border-b border-stone-100 px-3 py-2 text-xs text-slate-600 last:border-b-0"
                          >
                            <span className="font-bold text-slate-800">
                              {row.reportingMonthLabel ?? row.reportingMonth} {row.reportingYear}
                            </span>
                            <span className="font-semibold text-slate-500">{row.sourceRowNumber ?? '-'}</span>
                            <span>
                              <b className="text-slate-900">{row.parishCode ?? 'name match'}</b>
                              <br />
                              {row.parishName}
                            </span>
                            <span className="space-y-1">
                              {rowIssueMessages(row).map((message, index) => (
                                <span key={`${row.id}-${index}`} className="block leading-relaxed">
                                  {message}
                                </span>
                              ))}
                            </span>
                          </div>
                        ))}
                        {blockedRows.length === 0 && (
                          <div className="px-3 py-4 text-xs font-semibold text-slate-500">
                            No blocked rows found for this batch.
                          </div>
                        )}
                      </div>
                    )}
                    {blockedRowsOpen && blockedRowsTotal > blockedRows.length && (
                      <p className="mt-2 text-xs font-semibold text-red-800">
                        Showing {formatNumber(blockedRows.length)} of {formatNumber(blockedRowsTotal)} blocked rows.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-0 xl:grid-cols-[1fr_430px]">
                  <div className="min-w-0 border-b border-stone-200 xl:border-b-0 xl:border-r">
                    <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 p-4">
                      <div className="relative min-w-[260px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search columns, sections, account codes"
                          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400"
                        />
                      </div>
                      <button
                        onClick={validateFiles}
                        disabled={isValidating}
                        className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        <RefreshCcw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                        Re-validate
                      </button>
                    </div>

                    <div className="max-h-[650px] overflow-auto">
                      <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-stone-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <tr>
                            <th className="border-b border-stone-200 px-4 py-3">Use</th>
                            <th className="border-b border-stone-200 px-4 py-3">Source</th>
                            <th className="border-b border-stone-200 px-4 py-3">Suggestion</th>
                            <th className="border-b border-stone-200 px-4 py-3">Action</th>
                            <th className="border-b border-stone-200 px-4 py-3">Canonical Account</th>
                            <th className="border-b border-stone-200 px-4 py-3">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredColumns.map((column) => {
                            const choiceKey = `${activeResult.fileName}:${column.key}`;
                            const choice = mappingChoices[choiceKey] ?? mappingFromColumn(column);
                            const isHidden = choice.action === 'ignore';
                            return (
                              <tr
                                key={column.key}
                                className={`border-b align-top transition ${
                                  isHidden ? 'border-red-100 bg-red-50/80 text-slate-500' : 'border-stone-100'
                                }`}
                              >
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleColumnVisibility(column, choice)}
                                    title={isHidden ? 'Include this column' : 'Hide and exclude this column'}
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                                      isHidden
                                        ? 'border-red-200 bg-red-100 text-red-700 hover:bg-red-200'
                                        : 'border-stone-200 bg-white text-slate-600 hover:bg-stone-50 hover:text-slate-950'
                                    }`}
                                  >
                                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <span
                                      className={`rounded-md border px-2 py-1 text-xs font-black ${
                                        isHidden
                                          ? 'border-red-200 bg-red-100 text-red-700'
                                          : 'border-stone-200 bg-stone-50 text-slate-600'
                                      }`}
                                    >
                                      {column.column}
                                    </span>
                                    <div>
                                      <p
                                        className={`font-bold ${isHidden ? 'text-red-900 line-through decoration-red-400' : 'text-slate-900'}`}
                                      >
                                        {column.source_header}
                                      </p>
                                      <p
                                        className={`mt-1 max-w-[360px] text-xs leading-relaxed ${isHidden ? 'text-red-700/80' : 'text-slate-500'}`}
                                      >
                                        {column.header_path}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${
                                      statusStyle[column.status] ?? statusStyle.suggested
                                    }`}
                                  >
                                    {column.status.replace('_', ' ')} · {Math.round(column.confidence * 100)}%
                                  </span>
                                  {column.is_combined && (
                                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                                      <GitBranch className="h-3.5 w-3.5" />
                                      combined source column
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={choice.action}
                                    onChange={(event) =>
                                      updateChoice(column, {
                                        action: event.target.value as MappingChoice['action'],
                                        canonicalAccountCode:
                                          event.target.value === 'map' ? choice.canonicalAccountCode : null,
                                        aggregationRule:
                                          event.target.value === 'memo'
                                            ? 'memo'
                                            : event.target.value === 'ignore' ||
                                                event.target.value === 'not_in_template'
                                              ? event.target.value
                                              : 'sum',
                                      })
                                    }
                                    className="w-40 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                                  >
                                    <option value="map">Map</option>
                                    <option value="memo">Memo only</option>
                                    <option value="ignore">Ignore</option>
                                    <option value="not_in_template">Not in template</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2">
                                    <select
                                      value={choice.canonicalAccountCode ?? ''}
                                      disabled={choice.action !== 'map'}
                                      onChange={(event) =>
                                        updateChoice(column, { canonicalAccountCode: event.target.value || null })
                                      }
                                      className="min-w-[280px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none disabled:bg-stone-100 disabled:text-slate-400"
                                    >
                                      <option value="">Choose account</option>
                                      {accounts.map((account) => (
                                        <option key={account.account_code} value={account.account_code}>
                                          {account.account_code} - {account.account_name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => openAccountDraft(column)}
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-slate-500 transition hover:bg-stone-50 hover:text-slate-900"
                                      title="Add canonical account"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                  {choice.canonicalAccountCode && (
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                      {accountLabel[choice.canonicalAccountCode] ?? choice.canonicalAccountCode}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <p className="max-w-[320px] text-xs leading-relaxed text-slate-500">
                                    {column.reason}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <aside className="space-y-4 p-4">
                    {parishReviewRows.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-900">
                              Parish Review
                            </h3>
                            <p className="mt-1 text-sm text-amber-800">
                              Confirm suggested or unmatched workbook parish names before pushing.
                            </p>
                          </div>
                          <span className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-black text-amber-800">
                            {formatNumber(unresolvedParishCount)} open
                          </span>
                        </div>
                        <div className="mt-3 max-h-[330px] space-y-2 overflow-auto pr-1">
                          {parishReviewRows.map((match) => {
                            const key = `${activeResult.fileName}:${parishKey(match)}`;
                            return (
                              <div key={key} className="rounded-lg border border-amber-200 bg-white p-3">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">
                                    {match.sourceCode}
                                  </span>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                                      statusStyle[match.validationStatus] ?? statusStyle.warning
                                    }`}
                                  >
                                    {match.matchStatus}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm font-bold text-slate-900">{match.sourceName}</p>
                                {match.matchName && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <p className="min-w-0 flex-1 text-xs text-slate-500">
                                      Suggested: {match.matchName}{' '}
                                      {match.confidence ? `(${Math.round(match.confidence * 100)}%)` : ''}
                                    </p>
                                    {match.institutionId && (
                                      <button
                                        onClick={() => saveParishMatch(match, match.institutionId ?? '')}
                                        disabled={savingParishKeys[key]}
                                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {savingParishKeys[key] ? 'Saving...' : 'Use'}
                                      </button>
                                    )}
                                  </div>
                                )}
                                <select
                                  value={parishChoices[key] ?? ''}
                                  onChange={(event) => saveParishMatch(match, event.target.value)}
                                  disabled={savingParishKeys[key]}
                                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                                >
                                  <option value="">Choose institution</option>
                                  {institutions.map((institution) => (
                                    <option key={institution.id} value={institution.id}>
                                      {institution.institution_code ? `${institution.institution_code} - ` : ''}
                                      {institution.name}
                                      {institution.vicariate ? ` / ${institution.vicariate}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800">Sample Rows</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        A quick check of parish matching and zero-fill behavior.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {activeResult.sampleRows.slice(0, 8).map((row) => (
                        <div
                          key={`${row.parish_code ?? row.parish_name}-${row.reporting_month_label}`}
                          className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-black text-slate-600">
                              {row.parish_code ?? 'name match'}
                            </span>
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                                statusStyle[row.validation_status] ?? statusStyle.warning
                              }`}
                            >
                              {row.validation_status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-bold text-slate-900">{row.parish_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.reporting_month_label} {row.reporting_year} · {row.institution_match_status}
                            {row.institution_match_name ? ` to ${row.institution_match_name}` : ''}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            {formatNumber(row.zero_filled_fields)} blank numeric field(s) staged as 0
                          </p>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {accountDraftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-5xl rounded-lg border border-stone-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 p-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  {draftSource
                    ? 'Add Canonical Account'
                    : editingAccountId
                      ? 'Edit Canonical Account'
                      : 'Canonical Account Management'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {draftSource
                    ? `${draftSource.column} - ${draftSource.source_header}`
                    : editingAccountId
                      ? 'Update the selected canonical account.'
                      : 'Review existing accounts and add a new canonical account.'}
                </p>
              </div>
              <button
                onClick={() => {
                  setAccountDraftOpen(false);
                  setDraftSource(null);
                  setEditingAccountId(null);
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-stone-50 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={`grid grid-cols-1 gap-4 p-4 ${draftSource ? '' : 'lg:grid-cols-[0.95fr_1.05fr]'}`}>
              {!draftSource && (
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Existing Accounts</h4>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-500">
                      {formatNumber(accounts.length)}
                    </span>
                  </div>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={accountSearch}
                      onChange={(event) => setAccountSearch(event.target.value)}
                      placeholder="Search account code or name"
                      className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                  <div className="mt-3 max-h-[430px] space-y-2 overflow-auto pr-1">
                    {filteredAccounts.map((account) => (
                      <div key={account.account_code} className="rounded-lg border border-stone-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">
                              {account.account_code}
                            </span>
                            {account.section_code && (
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                Section {account.section_code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => editCanonicalAccount(account)}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 text-slate-500 hover:bg-stone-50 hover:text-slate-900"
                              title="Edit canonical account"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteCanonicalAccount(account)}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-red-100 text-red-500 hover:bg-red-50"
                              title="Deactivate canonical account"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm font-bold text-slate-900">{account.account_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[account.account_type, account.classification].filter(Boolean).join(' / ') ||
                            'No classification'}
                        </p>
                      </div>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-sm text-slate-500">
                        No canonical accounts match your search.
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Account Code"
                  value={draftAccount.accountCode}
                  onChange={(value) => setDraftAccount((prev) => ({ ...prev, accountCode: value }))}
                  placeholder="D.09"
                />
                <Field
                  label="Account Name"
                  value={draftAccount.accountName}
                  onChange={(value) => setDraftAccount((prev) => ({ ...prev, accountName: value }))}
                />
                <Field
                  label="Section Code"
                  value={draftAccount.sectionCode}
                  onChange={(value) =>
                    setDraftAccount((prev) => ({ ...prev, sectionCode: value.toUpperCase().slice(0, 1) }))
                  }
                  placeholder="D"
                />
                <Field
                  label="Subsection Code"
                  value={draftAccount.subsectionCode}
                  onChange={(value) => setDraftAccount((prev) => ({ ...prev, subsectionCode: value }))}
                  placeholder="Optional"
                />
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Account Type</span>
                  <select
                    value={draftAccount.accountType}
                    onChange={(event) => setDraftAccount((prev) => ({ ...prev, accountType: event.target.value }))}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="receipt">receipt</option>
                    <option value="expense">expense</option>
                    <option value="remittance">remittance</option>
                    <option value="balance">balance</option>
                    <option value="personal_contribution">personal_contribution</option>
                    <option value="memo">memo</option>
                  </select>
                </label>
                <Field
                  label="Classification"
                  value={draftAccount.classification}
                  onChange={(value) => setDraftAccount((prev) => ({ ...prev, classification: value }))}
                />
                <Field
                  label="Effective Year"
                  value={String(draftAccount.effectiveYear)}
                  onChange={(value) =>
                    setDraftAccount((prev) => ({ ...prev, effectiveYear: Number(value) || new Date().getFullYear() }))
                  }
                />
                <Field
                  label="Reason"
                  value={draftAccount.reason}
                  onChange={(value) => setDraftAccount((prev) => ({ ...prev, reason: value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-stone-200 p-4">
              <button
                onClick={() => {
                  setAccountDraftOpen(false);
                  setDraftSource(null);
                  setEditingAccountId(null);
                }}
                className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              {!draftSource && editingAccountId && (
                <button
                  onClick={resetAccountForm}
                  className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-stone-50"
                >
                  New Account
                </button>
              )}
              <button
                onClick={createCanonicalAccount}
                className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                {draftSource ? 'Create and Map' : editingAccountId ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'slate',
  onClick,
  active = false,
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber' | 'red';
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    slate: 'border-stone-200 bg-stone-50 text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  };
  const className = `rounded-lg border p-3 text-left transition ${tones[tone]} ${
    onClick ? 'cursor-pointer hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-slate-400' : ''
  } ${active ? 'ring-2 ring-red-300' : ''}`;
  const content = (
    <>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">{label}</p>
      <p className="mt-1 text-xl font-black">{formatNumber(value)}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title={`View ${label.toLowerCase()} rows`}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}
