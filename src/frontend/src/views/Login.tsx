'use client';

import React, { useState } from 'react';
import { Shield, Eye, EyeOff, LogIn, KeyRound, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Footer } from '../components/layout/Footer';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { AccessRole, AppRole, getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { supabaseBrowser } from '../lib/supabase';
import { APP_CONFIG } from '../constants';
import { clearLoginTransitionPending, markLoginTransitionPending } from '../lib/loginTransition';

interface LoginProps {
  onLogin: (role: AppRole) => void;
}

export function Login({ onLogin }: LoginProps) {
  // ── Credentials step ────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Success transition overlay before the dashboard appears
  const [transitioning, setTransitioning] = useState(false);

  // Fade the black overlay in, then hand off to the app (which fades it out).
  const completeLogin = (role: AppRole) => {
    setTransitioning(true);
    setTimeout(() => onLogin(role), 800);
  };

  // ── Forgot password modal ───────────────────────────────────────────────
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // ── MFA step ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [pendingRole, setPendingRole] = useState<AppRole>('bishop');

  const fillDemoCredentials = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
  };

  // ── Supabase sign-in + optional MFA challenge ───────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    markLoginTransitionPending();

    const lowerEmail = email.toLowerCase().trim();

    try {
      // ── 1. Try Supabase Auth (real accounts) ──────────────────────────
      const { data: sbData, error: sbError } = await supabaseBrowser.auth.signInWithPassword({
        email: lowerEmail,
        password,
      });

      if (sbData?.session?.user && !sbError) {
        const meta = sbData.session.user.user_metadata ?? {};
        const role = (meta.role as AppRole) ?? 'bishop';

        const accessRole = normalizeAccessRole(meta.role || 'parish_priest');
        const realUserData = {
          uid: sbData.session.user.id,
          email: sbData.session.user.email ?? '',
          displayName: meta.displayName ?? meta.display_name ?? sbData.session.user.email?.split('@')[0] ?? '',
          role: role,
          accessRole: accessRole,
          roleId: accessRole,
          roleLabel: getAccessRoleLabel(accessRole),
          entityName: meta.entityName ?? meta.entity_name ?? '',
          entityType: meta.entityType ?? meta.entity_type ?? '',
          entityId: meta.entityId ?? meta.entity_id ?? '',
          status: 'active',
        };
        localStorage.setItem('currentUser', JSON.stringify(realUserData));

        // Check whether MFA is required (user enrolled TOTP)
        const { data: aalData } = await supabaseBrowser.auth.mfa.getAuthenticatorAssuranceLevel();

        if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
          // Fetch enrolled TOTP factors
          const { data: factorsData } = await supabaseBrowser.auth.mfa.listFactors();
          const totpFactor = factorsData?.totp?.[0];

          if (totpFactor) {
            const { data: challengeData, error: challengeErr } = await supabaseBrowser.auth.mfa.challenge({
              factorId: totpFactor.id,
            });

            if (challengeErr) throw challengeErr;

            setMfaFactorId(totpFactor.id);
            setMfaChallengeId(challengeData.id);
            setPendingRole(role);
            setStep('mfa');
            return; // wait for OTP
          }
        }

        // No MFA enrolled or already at aal2 — proceed directly
        completeLogin(role);
        return;
      }

      // ── 2. Fall back to demo / localStorage credentials ────────────────
      const validSampleCredentials: Record<
        string,
        {
          password: string;
          accessRole: AccessRole;
          displayName: string;
          entityName?: string;
          entityType?: string;
        }
      > = {
        'bishop@gmail.com': {
          password: 'password123',
          accessRole: 'bishop',
          displayName: 'Bishop Office',
          entityName: 'Diocese of San Pablo',
          entityType: 'diocese',
        },
        'priest@gmail.com': {
          password: 'password123',
          accessRole: 'parish_priest',
          displayName: 'Parish Priest',
        },
        'parishsecretary@gmail.com': {
          password: 'password123',
          accessRole: 'parish_secretary',
          displayName: 'Parish Secretary',
        },
      };

      let displayName = email.split('@')[0];
      let accessRole = normalizeAccessRole('parish_priest');
      let role = getAppRole(accessRole);
      let entityName = '';
      let entityType = 'parish';
      let entityId = '';

      const storedUsers = JSON.parse(localStorage.getItem('users') || '[]');
      const storedUser = storedUsers.find(
        (user: Record<string, unknown>) =>
          typeof user.email === 'string' && user.email.toLowerCase() === lowerEmail && user.status !== 'archived',
      );
      const sampleCredential = validSampleCredentials[lowerEmail];

      if (sampleCredential) {
        if (password !== sampleCredential.password) throw new Error('Invalid email or password');
        displayName = sampleCredential.displayName;
        accessRole = sampleCredential.accessRole;
        role = getAppRole(accessRole);
        entityName = sampleCredential.entityName || 'San Isidro Labrador Parish';
        entityType = sampleCredential.entityType || entityType;
      } else if (storedUser) {
        if (!storedUser.password || password !== storedUser.password) {
          throw new Error('Invalid email or password');
        }
        accessRole = normalizeAccessRole(storedUser.roleId || storedUser.accessRole || storedUser.role);
        role = getAppRole(accessRole);
        displayName = storedUser.displayName || storedUser.email.split('@')[0];
        entityName = storedUser.entityName || '';
        entityType =
          storedUser.entityType || (role === 'school' ? 'school' : role === 'seminary' ? 'seminary' : 'parish');
        entityId = storedUser.entityId || '';
      } else if (lowerEmail === 'bishop@diocese.com') {
        if (password !== 'password123') throw new Error('Invalid email or password');
        displayName = 'San Pablo Cathedral';
        role = 'bishop';
        accessRole = 'bishop';
        entityType = 'diocese';
      } else if (lowerEmail === 'parish@church.com') {
        if (password !== 'password123') throw new Error('Invalid email or password');
        displayName = 'San Isidro Labrador (Biñan)';
        role = 'parish_priest';
        accessRole = 'parish_priest';
      } else if (lowerEmail === 'seminary@church.com') {
        if (password !== 'password123') throw new Error('Invalid email or password');
        displayName = "St. Peter's College Seminary";
        role = 'seminary';
      } else if (lowerEmail === 'school@church.com') {
        if (password !== 'password123') throw new Error('Invalid email or password');
        displayName = 'Liceo de San Pablo';
        role = 'school';
      } else {
        throw new Error('Invalid email or password');
      }

      if (!storedUser && !sampleCredential) {
        if (lowerEmail === 'bishop@diocese.com' || role === 'bishop') accessRole = 'bishop';
        else if (role === 'admin') accessRole = 'diocesan_oeconomus';
        else if (lowerEmail.includes('secretary')) accessRole = 'parish_secretary';
        else if (role === 'seminary') accessRole = 'seminary_rector';
        else if (role === 'school') accessRole = 'school_principal';
        else accessRole = 'parish_priest';

        role = getAppRole(accessRole);
        entityType =
          role === 'school'
            ? 'school'
            : role === 'seminary'
              ? 'seminary'
              : role === 'bishop' || role === 'admin'
                ? 'diocese'
                : 'parish';

        if (!entityName && (role === 'parish_priest' || role === 'parish_secretary'))
          entityName = 'San Isidro Labrador Parish';
        if (!entityName && role === 'seminary') entityName = "St. Peter's College Seminary";
        if (!entityName && role === 'school') entityName = 'Liceo de San Pablo';
      }

      const userData = {
        uid: Math.random().toString(36).substr(2, 9),
        email,
        displayName,
        role,
        accessRole,
        roleId: accessRole,
        roleLabel: getAccessRoleLabel(accessRole),
        entityName,
        entityType,
        entityId,
        status: 'active',
      };

      localStorage.setItem('currentUser', JSON.stringify(userData));
      completeLogin(role);
    } catch (err: unknown) {
      console.error('Login error:', err);
      clearLoginTransitionPending();
      setError('Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── MFA verify ──────────────────────────────────────────────────────────
  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: verifyError } = await supabaseBrowser.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode.trim(),
      });

      if (verifyError) throw verifyError;
      completeLogin(pendingRole);
    } catch (err: unknown) {
      console.error('MFA verify error:', err);
      setError('Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render: credentials form ─────────────────────────────────────────────
  const credentialsForm = (
    <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
      <div className="space-y-3.5 sm:space-y-4">
        <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Credentials</p>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#FBFAF6] border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 sm:py-3.5 text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
            required
            disabled={isLoading}
          />
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#FBFAF6] border border-slate-200 rounded-xl pl-11 pr-10 py-2.5 sm:py-3.5 text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
            required
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-xs sm:text-sm text-[#B5952F] hover:text-[#9c7d22] hover:underline transition-colors font-medium font-sans"
          >
            Forgot Password?
          </button>
        </div>
      </div>

      {error && <p className="text-rose-600 text-xs sm:text-sm text-center font-medium">{error}</p>}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-3 sm:py-3.5 rounded-xl transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-gold-500/10 hover:shadow-gold-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
      >
        {isLoading ? (
          'Processing…'
        ) : (
          <>
            <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
            Login
          </>
        )}
      </button>
    </form>
  );

  // ── Render: MFA form ─────────────────────────────────────────────────────
  const mfaForm = (
    <form onSubmit={handleMfaVerify} className="space-y-4 sm:space-y-5">
      <div className="space-y-3">
        <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
          Two-Factor Authentication
        </p>
        <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
          Enter the 6-digit code from your authenticator app.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full bg-[#FBFAF6] border border-slate-200 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3.5 text-2xl text-center font-mono text-slate-900 tracking-[0.5em] placeholder-slate-300 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
          required
          disabled={isLoading}
          autoFocus
        />
      </div>

      {error && <p className="text-rose-600 text-xs sm:text-sm text-center font-medium">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setStep('credentials');
            setMfaCode('');
            setError('');
          }}
          disabled={isLoading}
          className="flex-1 border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 font-bold py-2.5 sm:py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isLoading || mfaCode.length !== 6}
          className="flex-1 bg-gradient-to-r from-[#E6C27A] to-[#D4AF37] hover:from-[#D4AF37] hover:to-[#B5952F] text-slate-950 font-bold py-2.5 sm:py-3.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base shadow-lg shadow-gold-500/10"
        >
          {isLoading ? (
            'Verifying…'
          ) : (
            <>
              <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
              Verify
            </>
          )}
        </button>
      </div>
    </form>
  );

  // -- Main render --
  return (
    <>
      <div className="min-h-screen flex bg-[#FAF9F5] font-sans relative overflow-hidden">
        {/* Left branding panel -- classy green/gold gradient */}
        <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1b4332] via-[#13361f] to-[#0a1f13] p-12 text-white xl:p-16 lg:flex">
          <div className="pointer-events-none absolute -left-[15%] top-[8%] h-[45%] w-[45%] rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-transparent blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-[15%] -right-[10%] h-[50%] w-[50%] rounded-full bg-gradient-to-tl from-[#E6C27A]/15 to-transparent blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_40%,#000_55%,transparent_100%)]" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-white/10 p-1.5">
              <img src={APP_CONFIG.logoPath} alt="Diocese of San Pablo" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/50">Diocese of</p>
              <p className="font-serif text-sm font-bold uppercase tracking-wide text-gold-300">San Pablo</p>
            </div>
          </div>

          <div className="relative z-10 max-w-xl">
            <h1 className="font-serif text-5xl font-semibold leading-[1.12] tracking-tight text-white xl:text-6xl">
              Legacy of{' '}
              <span className="bg-gradient-to-r from-[#F0D58A] to-[#D4AF37] bg-clip-text text-transparent">Faith</span>,
              <br />
              Precision of{' '}
              <span className="bg-gradient-to-r from-[#F0D58A] to-[#D4AF37] bg-clip-text text-transparent">Data</span>.
            </h1>
            <div className="mt-6 flex items-center gap-3">
              <span className="h-px w-12 bg-gradient-to-r from-gold-400/70 to-transparent" />
              <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.25em] text-gold-200/90">
                <span>Accountability</span>
                <span className="h-1 w-1 rounded-full bg-gold-400" />
                <span>Transparency</span>
              </div>
            </div>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-white/45">
              Diocese Financial Analytics System
            </p>
          </div>

          <p className="relative z-10 text-xs font-medium text-white/35">
            Stewardship of the temporal goods of the Church.
          </p>
        </div>

        {/* Right form panel -- light & airy */}
        <div className="relative flex flex-1 flex-col">
          <div className="pointer-events-none absolute -right-[8%] -top-[8%] h-[40%] w-[40%] rounded-full bg-gradient-to-br from-amber-200/40 to-transparent blur-[120px]" />
          <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto px-5 py-10 sm:px-8">
            <div className="w-full max-w-md">
              {/* Compact branding for small screens */}
              <div className="mb-8 text-center lg:hidden">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-[#1b4332] p-2">
                  <img src={APP_CONFIG.logoPath} alt="Diocese" className="h-full w-full object-contain" />
                </div>
                <h1 className="font-serif text-3xl font-semibold leading-tight text-slate-900">
                  Legacy of{' '}
                  <span className="bg-gradient-to-r from-[#D4AF37] to-[#B5952F] bg-clip-text text-transparent">Faith</span>,
                  Precision of{' '}
                  <span className="bg-gradient-to-r from-[#D4AF37] to-[#B5952F] bg-clip-text text-transparent">Data</span>.
                </h1>
              </div>

              <div className="rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-[0_30px_70px_-30px_rgba(20,60,40,0.3)] sm:p-8 md:p-10">
                <div className="mb-7 flex flex-col items-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#FBF4E0] to-[#F5E6C0] shadow-[0_8px_24px_rgba(212,175,55,0.18)]">
                    {step === 'mfa' ? (
                      <KeyRound className="h-7 w-7 text-[#B5952F]" />
                    ) : (
                      <Shield className="h-7 w-7 text-[#B5952F]" />
                    )}
                  </div>
                  <h2 className="font-serif text-2xl font-bold tracking-wide text-slate-900 sm:text-3xl">
                    {step === 'mfa' ? 'Verify Identity' : 'Ecclesiastical Portal'}
                  </h2>
                  <p className="mt-1 text-xs font-medium tracking-wide text-slate-500 sm:text-sm">
                    The Diocese of San Pablo
                  </p>
                </div>

                {step === 'credentials' ? credentialsForm : mfaForm}
              </div>

              <p className="mt-6 text-center text-[11px] font-medium text-slate-400">
                Authorized diocesan personnel only.
              </p>
            </div>
          </div>

          <div className="relative z-10 border-t border-slate-200/70 bg-[#FAF9F5]/80 backdrop-blur-md">
            <Footer />
          </div>
        </div>
      </div>

      {/* Success transition — black fades in with the crest; App fades it back
          out to reveal the dashboard (see App's login reveal). */}
      {transitioning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
        >
          <motion.img
            src={APP_CONFIG.logoPath}
            alt="Diocese of San Pablo"
            className="h-24 w-24 object-contain drop-shadow-[0_10px_30px_rgba(212,175,55,0.3)]"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </motion.div>
      )}

      {/* Forgot Password flow */}
      <ForgotPasswordModal open={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
    </>
  );
}
