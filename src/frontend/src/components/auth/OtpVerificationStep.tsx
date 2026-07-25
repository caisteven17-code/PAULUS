'use client';

import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, MailWarning, RefreshCw } from 'lucide-react';

interface OtpVerificationStepProps {
  email: string;
  purpose: 'onboarding' | 'forgot_password';
  /**
   * Called with the code after the backend confirms it. Return an error
   * message to display, or null when the parent handled the next step.
   */
  onVerified: (code: string) => Promise<string | null>;
  onBack?: () => void;
  backLabel?: string;
  /** Dark style matches the login card; light matches in-app modals. */
  dark?: boolean;
  /** Optional note shown on mount (e.g. "a code was already sent recently"). */
  initialNote?: string;
  /** True when the backend reported SMTP is not configured (dev mode). */
  initialDevMode?: boolean;
}

const RESEND_SECONDS = 60;

export function OtpVerificationStep({
  email,
  purpose,
  onVerified,
  onBack,
  backLabel = 'Back',
  dark = false,
  initialNote,
  initialDevMode = false,
}: OtpVerificationStepProps) {
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resendCount, setResendCount] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(initialNote ?? '');
  const [devMode, setDevMode] = useState(initialDevMode);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Warning required by spec: user pressed Resend, waited the full timer again,
  // and still has no working code.
  const showNoCodeWarning = resendCount >= 1 && countdown === 0 && !isVerifying;

  const handleResend = async () => {
    if (countdown > 0 || isResending) return;
    setIsResending(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setInfo(`A new code has been sent to ${email}.`);
        if (data?.devMode) setDevMode(true);
      } else if (res.status === 429) {
        setInfo(data?.error || 'A code was sent recently. Please wait before trying again.');
      } else {
        setError(data?.error || 'Failed to resend the code. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setResendCount((c) => c + 1);
      setCountdown(RESEND_SECONDS);
      setIsResending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, purpose }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Invalid verification code. Please try again.');
        return;
      }

      const followUpError = await onVerified(code);
      if (followUpError) setError(followUpError);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const labelClass = dark ? 'text-slate-300' : 'text-gray-600';
  const strongClass = dark ? 'text-white' : 'text-gray-900';
  const inputClass = dark
    ? 'bg-slate-900/50 border border-slate-800 text-white placeholder-slate-600'
    : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-300';

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <p className={`text-sm leading-relaxed ${labelClass}`}>
        We sent a 6-digit verification code to <span className={`font-bold ${strongClass}`}>{email}</span>. Enter it
        below to confirm this email address.
      </p>

      {devMode && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 text-xs leading-relaxed">
          <strong>Developer note:</strong> SMTP is not configured yet, so the code was printed to the backend
          (auth-service) console instead of being emailed.
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={isVerifying}
        className={`w-full rounded-xl px-4 py-3.5 text-2xl text-center font-mono tracking-[0.5em] focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all ${inputClass}`}
      />

      {/* Resend with 60s lockout */}
      <div className="flex items-center justify-between text-xs sm:text-sm">
        <span className={labelClass}>
          {countdown > 0 ? (
            <>
              Resend available in <span className={`font-mono font-bold ${strongClass}`}>{countdown}s</span>
            </>
          ) : (
            "Didn't receive the code?"
          )}
        </span>
        <button
          type="button"
          onClick={handleResend}
          disabled={countdown > 0 || isResending}
          className={`flex items-center gap-1.5 font-bold transition-colors ${
            countdown > 0 || isResending
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-[#B5952F] hover:text-[#D4AF37] hover:underline'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
          {isResending ? 'Sending…' : 'Resend Code'}
        </button>
      </div>

      {info && <p className="text-emerald-500 text-xs sm:text-sm">{info}</p>}
      {error && <p className="text-red-500 text-xs sm:text-sm">{error}</p>}

      {showNoCodeWarning && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs leading-relaxed">
          <MailWarning className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Still no code?</strong> Check your Spam / Junk folder and make sure{' '}
            <span className="font-bold">{email}</span> is spelled correctly. If the problem continues, the email
            service may be temporarily unavailable — please contact the system administrator.
          </span>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isVerifying}
            className={`flex-1 font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-50 ${
              dark
                ? 'border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
                : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {backLabel}
          </button>
        )}
        <button
          type="submit"
          disabled={isVerifying || code.length !== 6}
          className="flex-1 bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-[#D4AF37]/10"
        >
          {isVerifying ? (
            'Verifying…'
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              Verify Code
            </>
          )}
        </button>
      </div>
    </form>
  );
}
