'use client';

const LOGIN_TRANSITION_PENDING_KEY = 'paulus_login_transition_pending_at';
const LOGIN_TRANSITION_PENDING_TTL_MS = 15000;

export const markLoginTransitionPending = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LOGIN_TRANSITION_PENDING_KEY, String(Date.now()));
};

export const clearLoginTransitionPending = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LOGIN_TRANSITION_PENDING_KEY);
};

export const isLoginTransitionPending = () => {
  if (typeof window === 'undefined') return false;

  const pendingAt = Number(sessionStorage.getItem(LOGIN_TRANSITION_PENDING_KEY) || 0);
  if (!pendingAt) return false;

  if (Date.now() - pendingAt > LOGIN_TRANSITION_PENDING_TTL_MS) {
    clearLoginTransitionPending();
    return false;
  }

  return true;
};
