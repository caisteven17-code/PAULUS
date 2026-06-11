'use client';

import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, HelpCircle, KeyRound, Lock, Mail, ShieldQuestion, X } from 'lucide-react';
import { OtpVerificationStep } from './OtpVerificationStep';

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'email' | 'otp' | 'password' | 'confirm' | 'success';

export function ForgotPasswordModal({ open, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [otpDevMode, setOtpDevMode] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStep('email');
    setEmail('');
    setVerifiedCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
    setError('');
    setIsBusy(false);
    setOtpNote('');
    setOtpDevMode(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Step 1 — registered email → send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'forgot_password' }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setOtpDevMode(Boolean(data?.devMode));
        setOtpNote('');
        setStep('otp');
      } else if (res.status === 429) {
        setOtpNote(data?.error || 'A code was already sent recently — check your inbox.');
        setStep('otp');
      } else {
        setError(data?.error || 'Failed to send the verification code. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsBusy(false);
    }
  };

  // Step 2 — OTP verified → collect the new password
  const handleVerified = async (code: string): Promise<string | null> => {
    setVerifiedCode(code);
    setStep('password');
    return null;
  };

  // Step 3 — passwords match → ask for confirmation
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setStep('confirm');
  };

  // Step 4 — user pressed Yes → save the new password
  const handleConfirmYes = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otpCode: verifiedCode,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Failed to update the password. Please try again.');
        setStep('password');
        return;
      }

      setStep('success');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setStep('password');
    } finally {
      setIsBusy(false);
    }
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    email: { title: 'Forgot Password', subtitle: 'Enter your registered email to receive a verification code.' },
    otp: { title: 'Verify Your Email', subtitle: 'Enter the code we sent to your registered email.' },
    password: { title: 'Set New Password', subtitle: 'Choose a new password for your account.' },
    confirm: { title: 'Confirm Update', subtitle: 'One last check before we save your new password.' },
    success: { title: 'Password Updated', subtitle: 'You can now log in with your new password.' },
  };

  const inputClass =
    'w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all';

  return (
    <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-950/95 border border-slate-800/80 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden backdrop-blur-md max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 sm:p-7 pb-0 relative">
          <button
            onClick={handleClose}
            className="absolute right-5 top-5 p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl flex items-center justify-center mb-3">
            {step === 'success' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : step === 'confirm' ? (
              <ShieldQuestion className="w-6 h-6 text-[#E6C27A]" />
            ) : step === 'password' ? (
              <KeyRound className="w-6 h-6 text-[#E6C27A]" />
            ) : (
              <HelpCircle className="w-6 h-6 text-[#E6C27A]" />
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">{titles[step].title}</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">{titles[step].subtitle}</p>
        </div>

        <div className="p-6 sm:p-7">
          {/* Step 1 — registered email */}
          {step === 'email' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Registered email address"
                  required
                  disabled={isBusy}
                  className={inputClass}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Note: an email is registered only after its owner has completed the onboarding form.
              </p>

              {error && <p className="text-red-400 text-xs sm:text-sm">{error}</p>}

              <button
                type="submit"
                disabled={isBusy}
                className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-[#D4AF37]/10 disabled:opacity-50 text-sm"
              >
                {isBusy ? 'Sending code…' : 'Next'}
              </button>
            </form>
          )}

          {/* Step 2 — OTP */}
          {step === 'otp' && (
            <OtpVerificationStep
              email={email.trim().toLowerCase()}
              purpose="forgot_password"
              onVerified={handleVerified}
              onBack={() => setStep('email')}
              backLabel="Change Email"
              dark
              initialNote={otpNote || undefined}
              initialDevMode={otpDevMode}
            />
          )}

          {/* Step 3 — new password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    minLength={8}
                    required
                    disabled={isBusy}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    minLength={8}
                    required
                    disabled={isBusy}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="mt-1 ml-1 text-[11px] text-red-400">Passwords do not match.</p>
                )}
              </div>

              {error && <p className="text-red-400 text-xs sm:text-sm">{error}</p>}

              <button
                type="submit"
                disabled={isBusy || !newPassword || newPassword !== confirmPassword}
                className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-[#D4AF37]/10 disabled:opacity-50 text-sm"
              >
                Submit
              </button>
            </form>
          )}

          {/* Step 4 — Yes / No confirmation */}
          {step === 'confirm' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <p className="text-slate-200 text-sm font-semibold leading-relaxed">
                  Are you sure you want to update your password?
                </p>
                <p className="text-slate-500 text-xs mt-1.5">
                  You will use the new password the next time you log in to{' '}
                  <span className="text-slate-300 font-medium">{email.trim().toLowerCase()}</span>.
                </p>
              </div>

              {error && <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('password')}
                  disabled={isBusy}
                  className="flex-1 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleConfirmYes}
                  disabled={isBusy}
                  className="flex-1 bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-[#D4AF37]/10"
                >
                  {isBusy ? 'Updating…' : 'Yes, Update'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5 — success */}
          {step === 'success' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 mx-auto bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">
                Your password has been updated successfully. Use it the next time you sign in.
              </p>
              <button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-[#D4AF37]/10 text-sm"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
