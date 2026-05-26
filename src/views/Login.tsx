'use client';

import React, { useState } from 'react';
import { Shield, Eye, EyeOff, LogIn, KeyRound } from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { AppRole, getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { supabaseBrowser } from '../lib/supabase';

interface LoginProps {
  onLogin: (role: AppRole) => void;
}

export function Login({ onLogin }: LoginProps) {
  // ── Credentials step ────────────────────────────────────────────────────
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [isLoading, setIsLoading]       = useState(false);

  // ── MFA step ────────────────────────────────────────────────────────────
  const [step, setStep]                   = useState<'credentials' | 'mfa'>('credentials');
  const [mfaFactorId, setMfaFactorId]     = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState('');
  const [mfaCode, setMfaCode]             = useState('');
  const [pendingRole, setPendingRole]     = useState<AppRole>('bishop');

  // ── Supabase sign-in + optional MFA challenge ───────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const lowerEmail = email.toLowerCase().trim();

    try {
      // ── 1. Try Supabase Auth (real accounts) ──────────────────────────
      const { data: sbData, error: sbError } =
        await supabaseBrowser.auth.signInWithPassword({ email: lowerEmail, password });

      if (sbData?.session?.user && !sbError) {
        const meta = sbData.session.user.user_metadata ?? {};
        const role = (meta.role as AppRole) ?? 'bishop';

        // Check whether MFA is required (user enrolled TOTP)
        const { data: aalData } =
          await supabaseBrowser.auth.mfa.getAuthenticatorAssuranceLevel();

        if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
          // Fetch enrolled TOTP factors
          const { data: factorsData } = await supabaseBrowser.auth.mfa.listFactors();
          const totpFactor = factorsData?.totp?.[0];

          if (totpFactor) {
            const { data: challengeData, error: challengeErr } =
              await supabaseBrowser.auth.mfa.challenge({ factorId: totpFactor.id });

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
      const validSampleCredentials: Record<string, {
        password: string;
        accessRole: 'parish_priest' | 'parish_secretary';
        displayName: string;
      }> = {
        'priest@gmail.com': {
          password:    'password123',
          accessRole:  'parish_priest',
          displayName: 'Parish Priest',
        },
        'parishsecretary@gmail.com': {
          password:    'password123',
          accessRole:  'parish_secretary',
          displayName: 'Parish Secretary',
        },
      };

      let displayName  = email.split('@')[0];
      let accessRole   = normalizeAccessRole('parish_priest');
      let role         = getAppRole(accessRole);
      let entityName   = '';
      let entityType   = 'parish';
      let entityId     = '';

      const storedUsers      = JSON.parse(localStorage.getItem('users') || '[]');
      const storedUser       = storedUsers.find(
        (user: Record<string, unknown>) =>
          typeof user.email === 'string' &&
          user.email.toLowerCase() === lowerEmail &&
          user.status !== 'archived'
      );
      const sampleCredential = validSampleCredentials[lowerEmail];

      if (sampleCredential) {
        if (password !== sampleCredential.password) throw new Error('Invalid credentials');
        displayName = sampleCredential.displayName;
        accessRole  = sampleCredential.accessRole;
        role        = getAppRole(accessRole);
        entityName  = 'San Isidro Labrador Parish';
      } else if (storedUser) {
        accessRole  = normalizeAccessRole(storedUser.roleId || storedUser.accessRole || storedUser.role);
        role        = getAppRole(accessRole);
        displayName = storedUser.displayName || storedUser.email.split('@')[0];
        entityName  = storedUser.entityName  || '';
        entityType  = storedUser.entityType  || (role === 'school' ? 'school' : role === 'seminary' ? 'seminary' : 'parish');
        entityId    = storedUser.entityId    || '';
      } else if (lowerEmail === 'bishop@diocese.com') {
        displayName = 'San Pablo Cathedral';
        role        = 'bishop';
        accessRole  = 'bishop';
        entityType  = 'diocese';
      } else if (lowerEmail === 'parish@church.com') {
        displayName = 'San Isidro Labrador (Biñan)';
        role        = 'parish_priest';
        accessRole  = 'parish_priest';
      } else if (lowerEmail === 'seminary@church.com') {
        displayName = "St. Peter's College Seminary";
        role        = 'seminary';
      } else if (lowerEmail === 'school@church.com') {
        displayName = 'Liceo de San Pablo';
        role        = 'school';
      } else {
        if      (lowerEmail.includes('bishop'))                          role = 'bishop';
        else if (lowerEmail.includes('admin') || lowerEmail.includes('diocese')) role = 'admin';
        else if (lowerEmail.includes('school'))    role = 'school';
        else if (lowerEmail.includes('seminary'))  role = 'seminary';
      }

      if (!storedUser && !sampleCredential) {
        if      (lowerEmail === 'bishop@diocese.com' || role === 'bishop') accessRole = 'bishop';
        else if (role === 'admin')                                          accessRole = 'diocese_admin';
        else if (lowerEmail.includes('secretary'))                          accessRole = 'parish_secretary';
        else if (role === 'seminary')                                       accessRole = 'seminary_rector';
        else if (role === 'school')                                         accessRole = 'school_registrar';
        else                                                                accessRole = 'parish_priest';

        role       = getAppRole(accessRole);
        entityType = role === 'school' ? 'school' : role === 'seminary' ? 'seminary' : (role === 'bishop' || role === 'admin') ? 'diocese' : 'parish';

        if (!entityName && (role === 'parish_priest' || role === 'parish_secretary')) entityName = 'San Isidro Labrador Parish';
        if (!entityName && role === 'seminary') entityName = "St. Peter's College Seminary";
        if (!entityName && role === 'school')   entityName = 'Liceo de San Pablo';
      }

      const userData = {
        uid:       Math.random().toString(36).substr(2, 9),
        email,
        displayName,
        role,
        accessRole,
        roleId:    accessRole,
        roleLabel: getAccessRoleLabel(accessRole),
        entityName,
        entityType,
        entityId,
        status:    'active',
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
        factorId:    mfaFactorId,
        challengeId: mfaChallengeId,
        code:        mfaCode.trim(),
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
      <div className="space-y-3 sm:space-y-4">
        <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Credentials</p>

        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-church-green-dark border border-church-green rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-colors"
            required
            disabled={isLoading}
          />
        </div>

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-church-green-dark border border-church-green rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-colors pr-10"
            required
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>

        <div className="flex justify-end">
          <a href="#" className="text-xs sm:text-sm text-[#D4AF37] hover:text-[#B5952F] transition-colors">
            Forgot Password?
          </a>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-[#D4AF37] hover:bg-[#B5952F] text-[#1A1A1A] font-bold py-2.5 sm:py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
      >
        {isLoading ? 'Processing…' : (
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
        <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
          Two-Factor Authentication
        </p>
        <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
          Enter the 6-digit code from your authenticator app.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full bg-church-green-dark border border-church-green rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-2xl text-center font-mono text-white tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-colors"
          required
          disabled={isLoading}
          autoFocus
        />
      </div>

      {error && <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => { setStep('credentials'); setMfaCode(''); setError(''); }}
          disabled={isLoading}
          className="flex-1 border border-white/20 text-gray-300 hover:text-white hover:border-white/40 font-bold py-2.5 sm:py-3 rounded-lg transition-colors text-sm sm:text-base disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isLoading || mfaCode.length !== 6}
          className="flex-1 bg-[#D4AF37] hover:bg-[#B5952F] text-[#1A1A1A] font-bold py-2.5 sm:py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
        >
          {isLoading ? 'Verifying…' : (
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
    <div className="h-screen flex flex-col bg-white font-sans overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 overflow-y-auto">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-10 flex-shrink-0">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-church-green leading-tight mb-3 sm:mb-4">
            Legacy of <span className="text-[#D4AF37]">Faith</span>,<br />
            Precision of <span className="text-[#D4AF37]">Data</span>.
          </h1>
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-3">
            <div className="h-px bg-gray-300 w-16 sm:w-24" />
            <p className="text-[10px] sm:text-xs font-bold tracking-[0.15em] text-gray-500 uppercase whitespace-nowrap">
              Accountability • Transparency
            </p>
            <div className="h-px bg-gray-300 w-16 sm:w-24" />
          </div>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-medium">
            Diocese Financial Analytics System
          </p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md bg-church-green rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 md:p-10 shadow-2xl flex-shrink-0">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-[#D4AF37] rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4">
              {step === 'mfa'
                ? <KeyRound className="w-6 h-6 sm:w-8 sm:h-8 text-[#D4AF37]" />
                : <Shield    className="w-6 h-6 sm:w-8 sm:h-8 text-[#D4AF37]" />
              }
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mb-1 sm:mb-2">
              {step === 'mfa' ? 'Verify Identity' : 'Ecclesiastical Portal'}
            </h2>
            <p className="text-gray-400 text-xs sm:text-sm">The Diocese of San Pablo</p>
          </div>

          {step === 'credentials' ? credentialsForm : mfaForm}

          {step === 'credentials' && (
            <div className="mt-5 text-xs text-gray-300 border-t border-white/20 pt-4">
              <p className="font-semibold text-white text-sm mb-2">Sample parish test accounts</p>
              <p>priest@gmail.com / password123</p>
              <p>parishsecretary@gmail.com / password123</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white">
        <Footer />
      </div>
    </div>
  );
}
