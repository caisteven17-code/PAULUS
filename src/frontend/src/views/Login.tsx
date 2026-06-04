'use client';

import React, { useState } from 'react';
import { Shield, Eye, EyeOff, LogIn, KeyRound, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { AppRole, getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { supabaseBrowser } from '../lib/supabase';

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
        onLogin(role);
        return;
      }

      // ── 2. Fall back to demo / localStorage credentials ────────────────
      const validSampleCredentials: Record<
        string,
        {
          password: string;
          accessRole: 'parish_priest' | 'parish_secretary';
          displayName: string;
        }
      > = {
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
        entityName = 'San Isidro Labrador Parish';
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
      onLogin(role);
    } catch (err: unknown) {
      console.error('Login error:', err);
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
      onLogin(pendingRole);
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
        <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Credentials</p>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 sm:py-3.5 text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
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
            className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-11 pr-10 py-2.5 sm:py-3.5 text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
            required
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>

        <div className="flex justify-end">
          <a
            href="#"
            className="text-xs sm:text-sm text-[#E6C27A] hover:text-[#D4AF37] hover:underline transition-colors font-medium font-sans"
          >
            Forgot Password?
          </a>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>}

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
        <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">
          Two-Factor Authentication
        </p>
        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed font-light">
          Enter the 6-digit code from your authenticator app.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3.5 text-2xl text-center font-mono text-white tracking-[0.5em] placeholder-slate-600 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200"
          required
          disabled={isLoading}
          autoFocus
        />
      </div>

      {error && <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setStep('credentials');
            setMfaCode('');
            setError('');
          }}
          disabled={isLoading}
          className="flex-1 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 font-bold py-2.5 sm:py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base disabled:opacity-50"
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

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#FDFCF7] via-[#FAF9F5] to-[#F5F4EE] font-sans relative overflow-hidden">
      {/* Decorative blurred lighting blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-amber-200/10 to-transparent rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tl from-amber-500/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      {/* Elegant geometric grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16 overflow-y-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-10 flex-shrink-0 relative z-10">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-semibold text-slate-900 tracking-tight leading-[1.15] mb-4 sm:mb-5">
            Legacy of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#B5952F]">Faith</span>,
            <br />
            Precision of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#B5952F]">Data</span>.
          </h1>
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
            <div className="h-[1px] bg-gradient-to-r from-transparent via-slate-300 to-transparent w-16 sm:w-28" />
            <p className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-[#B5952F] uppercase whitespace-nowrap">
              Accountability • Transparency
            </p>
            <div className="h-[1px] bg-gradient-to-l from-transparent via-slate-300 to-transparent w-16 sm:w-28" />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-semibold tracking-widest uppercase">
            Diocese Financial Analytics System
          </p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md bg-slate-950/95 border border-slate-800/80 rounded-[2rem] p-6 sm:p-8 md:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45),0_0_50px_rgba(212,175,55,0.05)] flex-shrink-0 relative z-10 backdrop-blur-md">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-[0_0_20px_rgba(212,175,55,0.15)] transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37]/20">
              {step === 'mfa' ? (
                <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-[#E6C27A]" />
              ) : (
                <Shield className="w-6 h-6 sm:w-7 sm:h-7 text-[#E6C27A]" />
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide mb-1 sm:mb-2">
              {step === 'mfa' ? 'Verify Identity' : 'Ecclesiastical Portal'}
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm tracking-wide font-medium">The Diocese of San Pablo</p>
          </div>

          {step === 'credentials' ? credentialsForm : mfaForm}

          {step === 'credentials' && (
            <div className="mt-6 sm:mt-8 border-t border-slate-800/80 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                <p className="font-semibold text-slate-200 text-xs sm:text-sm tracking-wide">
                  Demo Accounts (Click to Autofill)
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('priest@gmail.com')}
                  className="flex flex-col items-start bg-slate-900/40 hover:bg-[#D4AF37]/10 border border-slate-800 hover:border-[#D4AF37]/30 rounded-xl p-3 text-left transition-all duration-200 group"
                >
                  <span className="font-bold text-[#E6C27A] group-hover:text-white transition-colors font-sans">
                    Parish Priest Access
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">priest@gmail.com · password123</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoCredentials('parishsecretary@gmail.com')}
                  className="flex flex-col items-start bg-slate-900/40 hover:bg-[#D4AF37]/10 border border-slate-800 hover:border-[#D4AF37]/30 rounded-xl p-3 text-left transition-all duration-200 group"
                >
                  <span className="font-bold text-[#E6C27A] group-hover:text-white transition-colors font-sans">
                    Parish Secretary Access
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">parishsecretary@gmail.com · password123</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-slate-200/50 bg-[#FAF9F5]/80 backdrop-blur-md relative z-10">
        <Footer />
      </div>
    </div>
  );
}
