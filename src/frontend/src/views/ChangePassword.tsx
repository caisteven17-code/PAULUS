'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';

import { auth } from '../firebase';
import { supabaseBrowser } from '../lib/supabase';
import { getPasswordRequirementState, passwordMeetsPolicy } from '../lib/passwordPolicy';

interface ChangePasswordProps {
  onBack: () => void;
}

type PasswordField = 'current' | 'next' | 'confirm';

export function ChangePassword({ onBack }: ChangePasswordProps) {
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const requirements = useMemo(() => getPasswordRequirementState(passwords.next), [passwords.next]);
  const passwordsMatch = passwords.confirm.length > 0 && passwords.next === passwords.confirm;
  const differsFromCurrent = passwords.next.length > 0 && passwords.next !== passwords.current;
  const canSubmit =
    passwords.current.length > 0 &&
    passwordMeetsPolicy(passwords.next) &&
    passwordsMatch &&
    differsFromCurrent &&
    !isSubmitting;

  const updatePassword = (field: PasswordField, value: string) => {
    setPasswords((current) => ({ ...current, [field]: value }));
    setError('');
    setSuccess(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const email = auth.currentUser?.email;
    if (!email) {
      setError('Your authenticated email address is unavailable. Please sign in again.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const { error: verificationError } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: passwords.current,
      });
      if (verificationError) {
        throw new Error('The current password is incorrect.');
      }

      const { error: updateError } = await supabaseBrowser.auth.updateUser({ password: passwords.next });
      if (updateError) throw updateError;

      setPasswords({ current: '', next: '', confirm: '' });
      setVisible({ current: false, next: false, confirm: false });
      setSuccess(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The password could not be updated.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fields: Array<{ field: PasswordField; label: string; autoComplete: string }> = [
    { field: 'current', label: 'Current Password', autoComplete: 'current-password' },
    { field: 'next', label: 'New Password', autoComplete: 'new-password' },
    { field: 'confirm', label: 'Confirm New Password', autoComplete: 'new-password' },
  ];

  return (
    <div className="min-h-full bg-slate-50 px-4 py-8 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </button>

        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.1)]">
          <div className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#D4AF37]/15 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D4AF37] text-slate-950 shadow-lg shadow-[#D4AF37]/20">
                <LockKeyhole className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">Account Security</p>
                <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Change Password</h1>
                <p className="mt-1 text-sm text-white/55">Choose a strong password that you do not use elsewhere.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              {success && (
                <div
                  role="status"
                  className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"
                >
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                  Password updated successfully.
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
                >
                  <X className="mt-0.5 h-5 w-5 shrink-0" />
                  {error}
                </div>
              )}

              {fields.map(({ field, label, autoComplete }) => (
                <div key={field} className="space-y-2">
                  <label
                    htmlFor={`password-${field}`}
                    className="ml-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500"
                  >
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      id={`password-${field}`}
                      type={visible[field] ? 'text' : 'password'}
                      autoComplete={autoComplete}
                      value={passwords[field]}
                      onChange={(event) => updatePassword(field, event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 pr-12 font-medium text-slate-950 outline-none transition focus:border-[#D4AF37] focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVisible((current) => ({ ...current, [field]: !current[field] }))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      aria-label={visible[field] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    >
                      {visible[field] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              ))}

              {passwords.confirm.length > 0 && (
                <p
                  className={`flex items-center gap-2 text-sm font-bold ${passwordsMatch ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {passwordsMatch ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-2xl border border-slate-200 px-6 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-7 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-[#D4AF37]/20 transition hover:bg-[#E2BF43] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <KeyRound className="h-4 w-4" />
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>

            <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-7">
              <h2 className="font-serif text-xl font-bold text-slate-950">Password requirements</h2>
              <p className="mt-1 text-sm text-slate-500">Your new password must satisfy every requirement.</p>
              <div className="mt-6 space-y-3">
                {requirements.map((requirement) => {
                  const untouched = passwords.next.length === 0;
                  return (
                    <div
                      key={requirement.key}
                      className={`flex items-center gap-3 text-sm font-bold ${
                        untouched ? 'text-slate-400' : requirement.met ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          untouched ? 'bg-slate-200' : requirement.met ? 'bg-emerald-100' : 'bg-rose-100'
                        }`}
                      >
                        {requirement.met ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </span>
                      {requirement.label}
                    </div>
                  );
                })}
                {passwords.next.length > 0 && (
                  <div
                    className={`flex items-center gap-3 text-sm font-bold ${differsFromCurrent ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${differsFromCurrent ? 'bg-emerald-100' : 'bg-rose-100'}`}
                    >
                      {differsFromCurrent ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    Different from current password
                  </div>
                )}
              </div>
            </aside>
          </form>
        </div>
      </div>
    </div>
  );
}
