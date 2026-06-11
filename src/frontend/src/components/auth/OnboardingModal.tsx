'use client';

import React, { useState } from 'react';
import { Cake, CheckCircle2, Eye, EyeOff, Lock, LogOut, Mail, Phone, ShieldCheck, UserCheck } from 'lucide-react';
import { AuthUser } from '../../firebase';
import { OtpVerificationStep } from './OtpVerificationStep';

interface OnboardingModalProps {
  user: AuthUser;
  /** Called once everything is verified and saved to the database. */
  onComplete: (updated: { email: string; contactNumber: string; birthday: string }) => void;
  /** Onboarding is mandatory — logging out is the only other way off this screen. */
  onLogout: () => void;
}

type Step = 'form' | 'otp' | 'success';

export function OnboardingModal({ user, onComplete, onLogout }: OnboardingModalProps) {
  const [step, setStep] = useState<Step>('form');

  const [contactNumber, setContactNumber] = useState(user.contactNumber || '');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [otpDevMode, setOtpDevMode] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Submit unlocks only when every required field is filled in correctly
  const formIncomplete =
    !contactNumber.trim() ||
    !birthday ||
    !email.trim() ||
    password.length < 8 ||
    confirmPassword.length < 8 ||
    password !== confirmPassword;

  const validateForm = (): string => {
    if (!contactNumber.trim() || contactNumber.replace(/\D/g, '').length < 7) {
      return 'Please enter a valid contact number.';
    }
    if (!birthday) return 'Please select your birthday.';
    if (birthday > todayStr) return 'Birthday cannot be in the future.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return '';
  };

  // Submit the form → send an OTP to the (possibly new) email
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'onboarding' }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setOtpDevMode(Boolean(data?.devMode));
        setOtpNote('');
        setStep('otp');
      } else if (res.status === 429) {
        // A code was already sent within the last minute — let them type it in
        setOtpNote(data?.error || 'A code was already sent recently — check your inbox.');
        setStep('otp');
      } else {
        setError(data?.error || 'Failed to send the verification code. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  // OTP confirmed → persist everything to the database
  const handleVerified = async (code: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid || user.id,
          email: email.trim().toLowerCase(),
          password,
          contactNumber: contactNumber.trim(),
          birthday,
          otpCode: code,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return data?.error || 'Failed to save your details. Please try again.';
      }

      setStep('success');
      return null;
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    }
  };

  const handleFinish = () => {
    // The cached Supabase session keeps old metadata until the token refreshes —
    // this flag stops the gate from reappearing on an immediate reload.
    sessionStorage.setItem('onboarding_completed', 'true');
    // Keep the local session in sync with what was just saved
    const current = JSON.parse(localStorage.getItem('currentUser') || '{}');
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        ...current,
        email: email.trim().toLowerCase(),
        contactNumber: contactNumber.trim(),
        birthday,
        onboardingCompleted: true,
      }),
    );
    onComplete({ email: email.trim().toLowerCase(), contactNumber: contactNumber.trim(), birthday });
  };

  const fieldClass =
    'w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all';

  return (
    // Full-page gate: a solid background so nothing of the system is visible
    // (not even blurred) until onboarding is completed.
    <div className="fixed inset-0 z-[120] bg-gradient-to-b from-[#FDFCF7] via-[#FAF9F5] to-[#F5F4EE] flex flex-col items-center justify-center p-4 overflow-y-auto scrollbar-hide animate-in fade-in duration-200">
      <div className="text-center mb-6 flex-shrink-0">
        <p className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-[#B5952F] uppercase">
          Diocese of San Pablo
        </p>
        <p className="text-xs text-slate-500 tracking-widest uppercase mt-1 font-semibold">
          Diocese Financial Analytics System
        </p>
      </div>
      <div className="bg-white rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] border border-slate-200/60 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[88vh] overflow-y-auto scrollbar-hide flex-shrink-0">
        {/* Header */}
        <div className="bg-slate-950 p-6 sm:p-7 text-center relative">
          <div className="w-12 h-12 mx-auto bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl flex items-center justify-center mb-3">
            {step === 'success' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : step === 'otp' ? (
              <ShieldCheck className="w-6 h-6 text-[#E6C27A]" />
            ) : (
              <UserCheck className="w-6 h-6 text-[#E6C27A]" />
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">
            {step === 'success' ? 'All Set!' : step === 'otp' ? 'Verify Your Email' : 'Complete Your Profile'}
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            {step === 'success'
              ? 'Your account details have been saved.'
              : step === 'otp'
                ? 'One last step to secure your account.'
                : 'This form is required before you can access the system.'}
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-[11px] text-gray-400 -mt-1">
                <span className="text-rose-500 font-bold">*</span> All fields are required.
              </p>

              {/* Contact Number */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Contact Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="+63 900 000 0000"
                    required
                    disabled={isSending}
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Birthday */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Birthday <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Cake className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={birthday}
                    max={todayStr}
                    onChange={(e) => setBirthday(e.target.value)}
                    required
                    disabled={isSending}
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@diocese.ph"
                    required
                    disabled={isSending}
                    className={fieldClass}
                  />
                </div>
                <p className="mt-1 ml-1 text-[10px] text-gray-400">
                  A verification code will be sent here — this becomes your registered email.
                </p>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Update Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    minLength={8}
                    required
                    disabled={isSending}
                    className={`${fieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    minLength={8}
                    required
                    disabled={isSending}
                    className={`${fieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="mt-1 ml-1 text-[11px] text-red-500">Passwords do not match.</p>
                )}
              </div>

              {error && <p className="text-red-500 text-xs sm:text-sm text-center">{error}</p>}

              <button
                type="submit"
                disabled={isSending || formIncomplete}
                className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-[#D4AF37]/15 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isSending ? 'Sending verification code…' : 'Submit'}
              </button>

              <div className="pt-1 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={isSending}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-rose-500 transition-colors py-2 disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log out
                </button>
              </div>
            </form>
          )}

          {step === 'otp' && (
            <OtpVerificationStep
              email={email.trim().toLowerCase()}
              purpose="onboarding"
              onVerified={handleVerified}
              onBack={() => setStep('form')}
              backLabel="Edit Details"
              initialNote={otpNote || undefined}
              initialDevMode={otpDevMode}
            />
          )}

          {step === 'success' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <p className="text-gray-900 font-bold">Email verified successfully!</p>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Your birthday, contact number, email, and new password have been saved to your account.
                </p>
              </div>
              <button
                onClick={handleFinish}
                className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-[#D4AF37]/15 text-sm"
              >
                Continue to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
