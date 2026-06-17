'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, KeyRound, Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import { AccessRole, AppRole, getAccessRoleLabel, getAppRole, normalizeAccessRole } from '../lib/access';
import { supabaseBrowser } from '../lib/supabase';
import { APP_CONFIG } from '../constants';
import { clearLoginTransitionPending, markLoginTransitionPending } from '../lib/loginTransition';

interface LoginProps {
  onLogin: (role: AppRole) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [error, setError]                     = useState('');
  const [isLoading, setIsLoading]             = useState(false);
  const [transitioning, setTransitioning]     = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [step, setStep]                       = useState<'credentials' | 'mfa'>('credentials');
  const [mfaFactorId, setMfaFactorId]         = useState('');
  const [mfaChallengeId, setMfaChallengeId]   = useState('');
  const [mfaCode, setMfaCode]                 = useState('');
  const [pendingRole, setPendingRole]         = useState<AppRole>('bishop');

  const completeLogin = (role: AppRole) => {
    setTransitioning(true);
    setTimeout(() => onLogin(role), 800);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    markLoginTransitionPending();
    const lowerEmail = email.toLowerCase().trim();
    try {
      const { data: sbData, error: sbError } = await supabaseBrowser.auth.signInWithPassword({ email: lowerEmail, password });
      if (sbData?.session?.user && !sbError) {
        const meta = sbData.session.user.user_metadata ?? {};
        const role = (meta.role as AppRole) ?? 'bishop';
        const accessRole = normalizeAccessRole(meta.role || 'parish_priest');
        localStorage.setItem('currentUser', JSON.stringify({
          uid: sbData.session.user.id, email: sbData.session.user.email ?? '',
          displayName: meta.displayName ?? meta.display_name ?? sbData.session.user.email?.split('@')[0] ?? '',
          role, accessRole, roleId: accessRole, roleLabel: getAccessRoleLabel(accessRole),
          entityName: meta.entityName ?? meta.entity_name ?? '',
          entityType: meta.entityType ?? meta.entity_type ?? '',
          entityId: meta.entityId ?? meta.entity_id ?? '', status: 'active',
        }));
        const { data: aalData } = await supabaseBrowser.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
          const { data: factorsData } = await supabaseBrowser.auth.mfa.listFactors();
          const totpFactor = factorsData?.totp?.[0];
          if (totpFactor) {
            const { data: challengeData, error: challengeErr } = await supabaseBrowser.auth.mfa.challenge({ factorId: totpFactor.id });
            if (challengeErr) throw challengeErr;
            setMfaFactorId(totpFactor.id); setMfaChallengeId(challengeData.id);
            setPendingRole(role); setStep('mfa'); return;
          }
        }
        completeLogin(role); return;
      }
      const samples: Record<string, { password: string; accessRole: AccessRole; displayName: string; entityName?: string; entityType?: string }> = {
        'bishop@gmail.com':          { password: 'password123', accessRole: 'bishop',           displayName: 'Bishop Office', entityName: 'Diocese of San Pablo', entityType: 'diocese' },
        'priest@gmail.com':          { password: 'password123', accessRole: 'parish_priest',    displayName: 'Parish Priest' },
        'parishsecretary@gmail.com': { password: 'password123', accessRole: 'parish_secretary', displayName: 'Parish Secretary' },
      };
      let displayName = email.split('@')[0], accessRole = normalizeAccessRole('parish_priest');
      let role = getAppRole(accessRole), entityName = '', entityType = 'parish', entityId = '';
      const storedUsers = JSON.parse(localStorage.getItem('users') || '[]');
      const storedUser  = storedUsers.find((u: Record<string, unknown>) =>
        typeof u.email === 'string' && u.email.toLowerCase() === lowerEmail && u.status !== 'archived');
      const sample = samples[lowerEmail];
      if (sample) {
        if (password !== sample.password) throw new Error('invalid');
        displayName = sample.displayName; accessRole = sample.accessRole; role = getAppRole(accessRole);
        entityName = sample.entityName || 'San Isidro Labrador Parish'; entityType = sample.entityType || entityType;
      } else if (storedUser) {
        if (!storedUser.password || password !== storedUser.password) throw new Error('invalid');
        accessRole = normalizeAccessRole(storedUser.roleId || storedUser.accessRole || storedUser.role);
        role = getAppRole(accessRole); displayName = storedUser.displayName || storedUser.email.split('@')[0];
        entityName = storedUser.entityName || ''; entityId = storedUser.entityId || '';
        entityType = storedUser.entityType || (role === 'school' ? 'school' : role === 'seminary' ? 'seminary' : 'parish');
      } else if (lowerEmail === 'bishop@diocese.com')   { if (password !== 'password123') throw new Error('invalid'); displayName = 'San Pablo Cathedral'; role = 'bishop'; accessRole = 'bishop'; entityType = 'diocese';
      } else if (lowerEmail === 'parish@church.com')    { if (password !== 'password123') throw new Error('invalid'); displayName = 'San Isidro Labrador (Biñan)'; role = 'parish_priest'; accessRole = 'parish_priest';
      } else if (lowerEmail === 'seminary@church.com')  { if (password !== 'password123') throw new Error('invalid'); displayName = "St. Peter's College Seminary"; role = 'seminary';
      } else if (lowerEmail === 'school@church.com')    { if (password !== 'password123') throw new Error('invalid'); displayName = 'Liceo de San Pablo'; role = 'school';
      } else { throw new Error('invalid'); }
      if (!storedUser && !sample) {
        if (lowerEmail === 'bishop@diocese.com' || role === 'bishop') accessRole = 'bishop';
        else if (role === 'admin') accessRole = 'diocesan_oeconomus';
        else if (lowerEmail.includes('secretary')) accessRole = 'parish_secretary';
        else if (role === 'seminary') accessRole = 'seminary_rector';
        else if (role === 'school')   accessRole = 'school_principal';
        else accessRole = 'parish_priest';
        role = getAppRole(accessRole);
        entityType = role === 'school' ? 'school' : role === 'seminary' ? 'seminary' : role === 'bishop' || role === 'admin' ? 'diocese' : 'parish';
        if (!entityName && (role === 'parish_priest' || (accessRole as string) === 'parish_secretary')) entityName = 'San Isidro Labrador Parish';
        if (!entityName && role === 'seminary') entityName = "St. Peter's College Seminary";
        if (!entityName && role === 'school')   entityName = 'Liceo de San Pablo';
      }
      localStorage.setItem('currentUser', JSON.stringify({
        uid: Math.random().toString(36).substr(2, 9), email, displayName, role, accessRole,
        roleId: accessRole, roleLabel: getAccessRoleLabel(accessRole),
        entityName, entityType, entityId, status: 'active',
      }));
      completeLogin(role);
    } catch {
      clearLoginTransitionPending();
      setError('Invalid email or password. Please try again.');
    } finally { setIsLoading(false); }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setError('');
    try {
      const { error: verifyError } = await supabaseBrowser.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: mfaChallengeId, code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;
      completeLogin(pendingRole);
    } catch { setError('Invalid verification code. Please try again.');
    } finally { setIsLoading(false); }
  };

  return (
    <>
      <div className="min-h-screen flex overflow-hidden font-sans" style={{ background: '#07070a' }}>

        {/* ══════════════════════════════════════════════════════════════════
            LEFT PANEL — Sign-in form
        ══════════════════════════════════════════════════════════════════ */}
        <div className="relative flex min-h-screen w-full flex-shrink-0 flex-col justify-center px-5 py-8 sm:px-8 lg:w-[44%] lg:px-10 xl:w-[40%] xl:px-14"
          style={{ background: 'linear-gradient(160deg, #181208 0%, #110e06 35%, #0c0a06 70%, #09080a 100%)' }}>

          {/* Gold radial glow — top center, pulsing */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-96 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 90% 110% at 50% 0%, rgba(212,175,55,0.16) 0%, rgba(180,130,20,0.06) 50%, transparent 75%)',
              transformOrigin: 'top center',
            }}
            animate={{ opacity: [0.55, 1, 0.55], scaleY: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Warm gold glow — bottom, counter-pulse */}
          <motion.div
            className="absolute bottom-0 left-0 w-full h-72 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 80% 100% at 25% 100%, rgba(212,175,55,0.11) 0%, rgba(180,130,20,0.04) 55%, transparent 75%)',
              transformOrigin: 'bottom left',
            }}
            animate={{ opacity: [1, 0.5, 1], scaleY: [1.1, 1, 1.1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Mid-panel shimmer — slow drift */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 55%, rgba(212,175,55,0.04) 0%, transparent 70%)' }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.92, 1.06, 0.92] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />

          {/* Gold right-edge separator */}
          <div className="absolute top-0 right-0 w-px h-full"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(212,175,55,0.5) 25%, rgba(212,175,55,0.5) 75%, transparent 100%)' }} />

          <div className="relative z-10 mx-auto w-full max-w-[480px]">

            {/* Logo + system name */}
            {/* Logo — bigger */}
            <div className="mb-7 flex flex-col items-center text-center">
              <motion.div
                className="mb-4 flex h-24 w-24 items-center justify-center p-1"
                style={{ filter: 'drop-shadow(0 0 18px rgba(212,175,55,0.35))' }}
                animate={{ y: [0, -14, 0], scale: [1, 1.05, 1] }}
                transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img src={APP_CONFIG.logoPath} alt="Diocese of San Pablo" className="h-full w-full object-contain" />
              </motion.div>
              <p
                className="text-[9px] font-black uppercase leading-tight tracking-[0.32em]"
                style={{ color: 'rgba(212,175,55,0.66)' }}
              >
                Diocese of San Pablo
              </p>
              <p className="mt-1 text-[12px] font-bold uppercase leading-tight tracking-[0.22em] text-white/55">
                Financial Analytics System
              </p>
            </div>

            {step === 'credentials' ? (
              <div className="rounded-[32px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                {/* Heading */}
                <div className="mb-7 text-center">
                  <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />
                  <h2 className="whitespace-nowrap font-serif text-[2.1rem] font-semibold leading-tight text-white sm:text-[2.35rem]">
                    Welcome to <span className="text-[#E6C27A]">PAULUS</span>
                  </h2>
                  <p className="mt-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.42)' }}>
                    Sign in to access your diocesan workspace.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-5">
                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Email Address</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                      <input
                        type="email" placeholder="name@diocese.ph" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-white/25 transition-all focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.18)' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.07)'; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
                        required disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Password</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                      <input
                        type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-2xl py-4 pl-12 pr-12 text-base text-white placeholder-white/25 transition-all focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.18)' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.07)'; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
                        required disabled={isLoading}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                        style={{ color: 'rgba(255,255,255,0.25)' }}
                        onMouseOver={(e) => (e.currentTarget.style.color = '#D4AF37')}
                        onMouseOut={(e)  => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {/* Forgot password — below the field */}
                    <div className="flex justify-end pt-1">
                      <button type="button" onClick={() => setShowForgotPassword(true)}
                        className="text-[11px] font-semibold transition-colors"
                        style={{ color: 'rgba(212,175,55,0.55)' }}
                        onMouseOver={(e) => (e.currentTarget.style.color = '#D4AF37')}
                        onMouseOut={(e)  => (e.currentTarget.style.color = 'rgba(212,175,55,0.55)')}>
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-red-400" />
                      <p className="text-sm font-medium" style={{ color: '#FCA5A5' }}>{error}</p>
                    </div>
                  )}

                  <button
                    type="submit" disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-slate-950 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #F5D98A 0%, #D4AF37 48%, #B8941E 100%)',
                      boxShadow: '0 6px 24px rgba(212,175,55,0.28), 0 2px 8px rgba(0,0,0,0.3)',
                    }}
                  >
                    {isLoading
                      ? <><span className="h-5 w-5 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />Signing in...</>
                      : <><LogIn className="h-5 w-5" />Sign In</>}
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-[32px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white mb-1">Two-factor verification</h2>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
                <form onSubmit={handleMfaVerify} className="space-y-4">
                  <input
                    type="text" inputMode="numeric" maxLength={6} placeholder="000 000" value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-4 rounded-xl text-2xl text-center font-mono text-white tracking-[0.5em] placeholder-white/20 focus:outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    required disabled={isLoading} autoFocus
                  />
                  {error && (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <p className="text-xs font-medium" style={{ color: '#FCA5A5' }}>{error}</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { setStep('credentials'); setMfaCode(''); setError(''); }}
                      disabled={isLoading}
                      className="flex-1 rounded-xl py-3.5 text-sm font-semibold transition-all disabled:opacity-50"
                      style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                      Back
                    </button>
                    <button type="submit" disabled={isLoading || mfaCode.length !== 6}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-slate-950 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #F5D98A 0%, #D4AF37 48%, #B8941E 100%)', boxShadow: '0 6px 24px rgba(212,175,55,0.28)' }}>
                      <KeyRound className="h-4 w-4" />
                      {isLoading ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Footer */}
            <p className="mt-7 text-center text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.22)' }}>
              Authorized diocesan personnel only - Diocese of San Pablo
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT PANEL — Church visual · tagline upper-right
        ══════════════════════════════════════════════════════════════════ */}
        <div className="relative hidden lg:flex flex-1 overflow-hidden"
          style={{ background: '#06060a' }}>

          {/* Twinkling stars — upper right */}
          {([
            { top: '2%',  right: '5%',  size: 2.5, delay: 0,    dur: 2.1 },
            { top: '4%',  right: '14%', size: 1.5, delay: 0.6,  dur: 1.7 },
            { top: '1%',  right: '24%', size: 2,   delay: 1.1,  dur: 2.5 },
            { top: '7%',  right: '9%',  size: 1.5, delay: 0.3,  dur: 1.9 },
            { top: '9%',  right: '20%', size: 1,   delay: 0.9,  dur: 2.3 },
            { top: '3%',  right: '33%', size: 1.5, delay: 1.5,  dur: 1.6 },
            { top: '12%', right: '4%',  size: 1,   delay: 0.4,  dur: 2.8 },
            { top: '6%',  right: '40%', size: 2,   delay: 0.8,  dur: 2.0 },
            { top: '14%', right: '28%', size: 1,   delay: 1.3,  dur: 1.8 },
            { top: '2%',  right: '50%', size: 1.5, delay: 0.2,  dur: 2.4 },
            { top: '11%', right: '45%', size: 1,   delay: 1.7,  dur: 2.2 },
            { top: '17%', right: '13%', size: 1.5, delay: 0.7,  dur: 1.5 },
            { top: '5%',  right: '58%', size: 1,   delay: 1.2,  dur: 2.6 },
            { top: '16%', right: '36%', size: 2,   delay: 0.5,  dur: 1.9 },
            { top: '20%', right: '22%', size: 1,   delay: 1.9,  dur: 2.1 },
            { top: '8%',  right: '62%', size: 1.5, delay: 0.1,  dur: 1.7 },
            { top: '22%', right: '8%',  size: 1,   delay: 2.1,  dur: 2.4 },
            { top: '19%', right: '50%', size: 2,   delay: 0.4,  dur: 1.6 },
            { top: '25%', right: '30%', size: 1,   delay: 1.0,  dur: 2.9 },
            { top: '13%', right: '70%', size: 1.5, delay: 0.8,  dur: 2.0 },
            { top: '27%', right: '18%', size: 1,   delay: 1.6,  dur: 1.8 },
            { top: '10%', right: '75%', size: 1,   delay: 2.3,  dur: 2.3 },
            { top: '30%', right: '42%', size: 1.5, delay: 0.3,  dur: 2.7 },
            { top: '24%', right: '60%', size: 1,   delay: 1.4,  dur: 1.5 },
            { top: '32%', right: '6%',  size: 2,   delay: 0.9,  dur: 2.2 },
            { top: '28%', right: '75%', size: 1,   delay: 1.8,  dur: 1.9 },
            { top: '35%', right: '25%', size: 1,   delay: 0.6,  dur: 2.5 },
            { top: '33%', right: '55%', size: 1.5, delay: 2.0,  dur: 1.7 },
            { top: '38%', right: '14%', size: 1,   delay: 1.1,  dur: 2.8 },
            { top: '36%', right: '68%', size: 1,   delay: 0.7,  dur: 2.0 },
          ] as { top: string; right: string; size: number; delay: number; dur: number }[]).map((s, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                top: s.top, right: s.right,
                width: s.size, height: s.size,
                background: '#F5D98A',
                boxShadow: `0 0 ${s.size * 2}px ${s.size}px rgba(245,217,138,0.7)`,
              }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
              transition={{ duration: s.dur, repeat: Infinity, ease: 'easeInOut', delay: s.delay }}
            />
          ))}

          {/* Church illustration — dimmed so tagline pops */}
          <img
            src="/assets/Diocese Church.png"
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
            style={{
              objectFit: 'cover',
              objectPosition: 'center 12%',
              filter: 'invert(1) sepia(0.9) saturate(3) hue-rotate(5deg)',
              opacity: 0.35,
              mixBlendMode: 'screen',
            }}
          />

          {/* Dark overlay — uniform dim across the whole panel */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(6,6,10,0.52)' }} />

          {/* Left edge bleed */}
          <div className="absolute inset-y-0 left-0 w-16 pointer-events-none"
            style={{ background: 'linear-gradient(to right, rgba(6,6,10,0.7), transparent)' }} />

          {/* ── Tagline — vertically and horizontally centered ────────────── */}
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-10">

            {/* Gold cross ornament */}
            <div className="flex items-center gap-3 mb-7">
              <div className="h-px w-14" style={{ background: 'linear-gradient(to right, transparent, #D4AF37)' }} />
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="6" y="0" width="2" height="14" rx="1" fill="#D4AF37" />
                <rect x="0" y="6" width="14" height="2" rx="1" fill="#D4AF37" />
              </svg>
              <div className="h-px w-14" style={{ background: 'linear-gradient(to left, transparent, #D4AF37)' }} />
            </div>

            {/* Tagline — large, centered */}
            <h1 className="font-serif font-semibold leading-[1.15]"
              style={{ fontSize: 'clamp(2.6rem, 4.2vw, 3.8rem)', color: '#ffffff' }}>
              Legacy of{' '}
              <span style={{
                background: 'linear-gradient(90deg, #F5D98A 0%, #D4AF37 55%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>Faith</span>
              ,<br />Precision of{' '}
              <span style={{
                background: 'linear-gradient(90deg, #F5D98A 0%, #D4AF37 55%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>Data</span>
              .
            </h1>

            {/* Bottom gold rule */}
            <div className="flex items-center gap-3 mt-7">
              <div className="h-px w-14" style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.5))' }} />
              <div className="h-1 w-1 rounded-full" style={{ background: 'rgba(212,175,55,0.6)' }} />
              <div className="h-px w-14" style={{ background: 'linear-gradient(to left, transparent, rgba(212,175,55,0.5))' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Login success transition */}
      {transitioning && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
        >
          <motion.img
            src={APP_CONFIG.logoPath} alt="Diocese of San Pablo"
            className="h-24 w-24 object-contain"
            style={{ filter: 'drop-shadow(0 10px 30px rgba(212,175,55,0.3))' }}
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </motion.div>
      )}

      <ForgotPasswordModal open={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
    </>
  );
}
