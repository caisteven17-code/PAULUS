'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Cake,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthUser } from '../../firebase';
import { APP_CONFIG } from '../../constants';
import { OtpVerificationStep } from './OtpVerificationStep';

interface OnboardingModalProps {
  user: AuthUser;
  onComplete: (updated: { email: string; contactNumber: string; birthday: string }) => void;
  onLogout: () => void;
}

type Step = 'form' | 'otp' | 'success';

export function OnboardingModal({ user, onComplete, onLogout }: OnboardingModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [introIndex, setIntroIndex] = useState(0);

  const [contactNumber, setContactNumber] = useState(user.contactNumber || '');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string>('');

  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [otpDevMode, setOtpDevMode] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, or WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large. Please pick one under 5 MB.');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const introSlides = useMemo(
    () => [
      {
        eyebrow: 'First Access',
        title: 'Welcome to PAULUS',
        accent: 'Your diocesan workspace',
        body: 'Before you begin, we will prepare your account with a short and secure first-time setup.',
      },
      {
        eyebrow: 'PAULUS',
        title: 'Faithful stewardship, clearer records.',
        accent: 'Serve with clarity',
        body: 'This system helps the Diocese of San Pablo care for reports, accountability, and the temporal goods entrusted to the Church.',
      },
      {
        eyebrow: 'A Short Setup',
        title: 'Complete your personnel record.',
        accent: 'Almost there',
        body: 'We will confirm your contact details, birthday, registered email, and password before opening your workspace.',
      },
    ],
    [],
  );
  const showingIntro = step === 'form' && introIndex < introSlides.length;
  const currentIntro = introSlides[introIndex];
  const progressItems = [
    { label: 'Welcome', detail: 'First-time greeting', done: !showingIntro, active: showingIntro },
    { label: 'Profile', detail: 'Contact and account details', done: step === 'otp' || step === 'success', active: step === 'form' && !showingIntro },
    { label: 'Verify', detail: 'Email security code', done: step === 'success', active: step === 'otp' },
    { label: 'Complete', detail: 'Open your workspace', done: step === 'success', active: step === 'success' },
  ];

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
        setOtpNote(data?.error || 'A code was already sent recently. Check your inbox.');
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

      // Onboarding saved — the profile now exists, so upload the photo if chosen.
      if (photoFile) {
        try {
          const fd = new FormData();
          fd.append('file', photoFile);
          fd.append('userId', user.uid || user.id || '');
          const up = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
          const upData = await up.json().catch(() => ({}));
          if (up.ok && upData?.avatarUrl) setUploadedAvatarUrl(upData.avatarUrl);
        } catch {
          /* photo is optional — never block onboarding on it */
        }
      }

      setStep('success');
      return null;
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    }
  };

  const handleFinish = () => {
    sessionStorage.setItem('onboarding_completed', 'true');
    const current = JSON.parse(localStorage.getItem('currentUser') || '{}');
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        ...current,
        email: email.trim().toLowerCase(),
        contactNumber: contactNumber.trim(),
        birthday,
        onboardingCompleted: true,
        ...(uploadedAvatarUrl ? { avatarUrl: uploadedAvatarUrl, photoURL: uploadedAvatarUrl } : {}),
      }),
    );
    onComplete({ email: email.trim().toLowerCase(), contactNumber: contactNumber.trim(), birthday });
  };

  const fieldClass =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pl-11 text-sm font-semibold text-slate-900 placeholder:text-slate-300 outline-none transition-all focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10';

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden bg-[#EEF0F3] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.9),transparent_30%),radial-gradient(circle_at_86%_20%,rgba(212,175,55,0.16),transparent_28%)]" />

      <div className="relative z-10 flex h-full flex-col">
        <header className="bg-slate-950 px-5 pb-8 pt-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={APP_CONFIG.logoPath} alt="Diocese of San Pablo" className="h-12 w-12 object-contain" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#D4AF37]">PAULUS Setup</p>
                <p className="text-sm font-semibold text-white">Diocese of San Pablo</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold text-slate-200 transition-colors hover:bg-white hover:text-slate-950 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-8 sm:px-8">
          <AnimatePresence mode="wait">
            {showingIntro ? (
              <motion.section
                key={`intro-${introIndex}`}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="mx-auto w-full max-w-3xl overflow-hidden rounded-[30px] border border-white bg-white shadow-[0_26px_70px_rgba(15,23,42,0.14)]"
              >
                <div className="relative overflow-hidden bg-slate-950 px-7 py-8 text-center text-white sm:px-10">
                  <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#D4AF37]/15 blur-3xl" />
                  <div className="absolute -bottom-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
                  <div className="relative z-10">
                    <img src={APP_CONFIG.logoPath} alt="Diocese of San Pablo" className="mx-auto h-20 w-20 object-contain drop-shadow-xl" />
                    <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10">
                      <Sparkles className="h-7 w-7 text-[#D4AF37]" />
                    </div>
                    <p className="mt-7 text-[10px] font-black uppercase tracking-[0.32em] text-[#D4AF37]">
                      {currentIntro.eyebrow}
                    </p>
                    <h1 className="mx-auto mt-4 max-w-2xl font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl">
                      {currentIntro.title}
                    </h1>
                    <p className="mt-3 text-base font-black uppercase tracking-[0.18em] text-[#E6C27A] sm:text-lg">
                      {currentIntro.accent}
                    </p>
                    <p className="mx-auto mt-6 max-w-lg text-sm font-semibold leading-7 text-slate-300">
                      {currentIntro.body}
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4 border-t border-white/10 pt-6 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                      <span>Secure</span>
                      <span>Accountable</span>
                      <span>Diocesan</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-center gap-2">
                    {introSlides.map((_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 rounded-full transition-all ${
                          index === introIndex ? 'w-10 bg-[#D4AF37]' : 'w-5 bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-7 flex flex-wrap justify-center gap-3">
                    {introIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => setIntroIndex((i) => Math.max(0, i - 1))}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIntroIndex((i) => i + 1)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-8 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition-all hover:bg-slate-800 active:scale-[0.98]"
                    >
                      {introIndex === introSlides.length - 1 ? 'Begin Setup' : 'Continue'}
                      <ArrowRight className="h-4 w-4 text-[#D4AF37]" />
                    </button>
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key={step}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="mx-auto w-full max-w-6xl"
              >
                <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <aside className="self-start rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                    <p className="mb-5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Setup Progress</p>
                    <div className="space-y-3">
                      {progressItems.map((item, index) => (
                        <div
                          key={item.label}
                          className={`flex gap-3 rounded-2xl border p-3 transition-colors ${
                            item.active
                              ? 'border-slate-950 bg-slate-950 text-white'
                              : item.done
                                ? 'border-[#D4AF37]/25 bg-[#FFF8E5] text-slate-950'
                                : 'border-slate-100 bg-slate-50 text-slate-400'
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                              item.active
                                ? 'bg-[#D4AF37] text-slate-950'
                                : item.done
                                  ? 'bg-white text-[#B5952F]'
                                  : 'bg-white text-slate-400'
                            }`}
                          >
                            {item.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                          </span>
                          <span>
                            <span className="block text-sm font-black">{item.label}</span>
                            <span className={`mt-0.5 block text-xs font-semibold ${item.active ? 'text-slate-300' : 'text-slate-500'}`}>
                              {item.detail}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">PAULUS</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                        A short setup keeps your diocesan account accurate and secure before access is opened.
                      </p>
                    </div>
                  </aside>

                  <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                    <div className="flex items-start gap-4 border-b border-slate-100 bg-slate-950 p-6 text-white sm:p-8">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D4AF37]/15">
                        {step === 'success' ? (
                          <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                        ) : step === 'otp' ? (
                          <ShieldCheck className="h-7 w-7 text-[#E6C27A]" />
                        ) : (
                          <UserCheck className="h-7 w-7 text-[#E6C27A]" />
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#D4AF37]">
                          {step === 'success' ? 'Complete' : step === 'otp' ? 'Security Check' : 'Personnel Record'}
                        </p>
                        <h2 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">
                          {step === 'success'
                            ? "You're all set."
                            : step === 'otp'
                              ? 'Verify your email.'
                              : 'Complete your profile.'}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                          {step === 'success'
                            ? 'Welcome to PAULUS. May your work be guided by wisdom, care, and faithful service.'
                            : step === 'otp'
                              ? 'Confirm your registered email so your account can be secured.'
                              : 'Fill in the required details below. Once verified, your PAULUS workspace will open.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-6 sm:p-8">
                      {step === 'form' && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                          <p className="rounded-2xl border border-[#D4AF37]/25 bg-[#FFF8E5] px-4 py-3 text-xs font-semibold leading-relaxed text-slate-600">
                            All fields are required. Your email will receive a verification code before your account is opened.
                          </p>

                          {/* Profile photo (optional) */}
                          <div className="flex flex-col items-center gap-2">
                            <div className="relative">
                              <label htmlFor="onboard-photo" className="block cursor-pointer">
                                {photoPreview ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={photoPreview}
                                    alt="Profile preview"
                                    className="h-24 w-24 rounded-full object-cover ring-2 ring-[#D4AF37]/50"
                                  />
                                ) : (
                                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 ring-2 ring-slate-200">
                                    <Camera className="h-7 w-7 text-slate-400" />
                                  </div>
                                )}
                                <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#D4AF37] text-slate-950 shadow-md">
                                  <Camera className="h-4 w-4" />
                                </span>
                              </label>
                              <input
                                id="onboard-photo"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                onChange={handlePhotoSelect}
                                disabled={isSending}
                              />
                            </div>
                            <p className="text-[11px] font-semibold text-slate-400">
                              Add a profile photo <span className="text-slate-300">(optional)</span>
                            </p>
                            {photoPreview && (
                              <button
                                type="button"
                                onClick={removePhoto}
                                disabled={isSending}
                                className="text-[11px] font-bold text-rose-500 hover:text-rose-600 disabled:opacity-50"
                              >
                                Remove photo
                              </button>
                            )}
                          </div>

                          <SetupField label="Contact Number" icon={Phone} required>
                            <input
                              type="tel"
                              value={contactNumber}
                              onChange={(e) => setContactNumber(e.target.value)}
                              placeholder="+63 900 000 0000"
                              required
                              disabled={isSending}
                              className={fieldClass}
                            />
                          </SetupField>

                          <SetupField label="Birthday" icon={Cake} required>
                            <input
                              type="date"
                              value={birthday}
                              max={todayStr}
                              onChange={(e) => setBirthday(e.target.value)}
                              required
                              disabled={isSending}
                              className={fieldClass}
                            />
                          </SetupField>

                          <SetupField label="Email Address" icon={Mail} required>
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="name@diocese.ph"
                              required
                              disabled={isSending}
                              className={fieldClass}
                            />
                          </SetupField>

                          <SetupField label="Update Password" icon={Lock} required>
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
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </SetupField>

                          <SetupField label="Confirm Password" icon={Lock} required>
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
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </SetupField>

                          {confirmPassword.length > 0 && password !== confirmPassword && (
                            <p className="text-xs font-semibold text-rose-500">Passwords do not match.</p>
                          )}
                          {error && <p className="text-center text-sm font-semibold text-rose-500">{error}</p>}

                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setIntroIndex(introSlides.length - 1)}
                              disabled={isSending}
                              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-500 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                            >
                              Back
                            </button>
                            <button
                              type="submit"
                              disabled={isSending || formIncomplete}
                              className="flex-1 rounded-2xl bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] py-3 text-sm font-black text-slate-950 shadow-lg shadow-[#D4AF37]/15 transition-all hover:from-[#D4AF37] hover:to-[#B5952F] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSending ? 'Sending verification code...' : 'Send Verification Code'}
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
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                          </div>
                          <h3 className="font-serif text-3xl font-bold text-slate-950">Welcome to PAULUS.</h3>
                          <p className="mt-3 max-w-md text-sm font-medium leading-7 text-slate-500">
                            Your birthday, contact number, email, and new password have been saved to your account.
                          </p>
                          <button
                            onClick={handleFinish}
                            className="mt-8 w-full max-w-sm rounded-2xl bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-[#D4AF37]/15 transition-all hover:from-[#D4AF37] hover:to-[#B5952F] active:scale-[0.98]"
                          >
                            Continue to Dashboard
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function SetupField({
  label,
  icon: Icon,
  required,
  children,
}: {
  label: string;
  icon: React.ElementType;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        {children}
      </div>
    </div>
  );
}
