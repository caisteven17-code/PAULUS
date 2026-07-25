# OTP Onboarding + Forgot Password — Setup Guide

Everything is already coded and wired. You only need to do the **3 manual steps** below, then test.

---

## What was built

| Feature | Where |
|---|---|
| Onboarding form (contact #, birthday, email, new password) shown on first login | `src/frontend/src/components/auth/OnboardingModal.tsx`, wired in `App.tsx` |
| Email OTP verification with 60-second resend timer + "still no code" warning | `src/frontend/src/components/auth/OtpVerificationStep.tsx` |
| Forgot Password on the login page (email → OTP → new password → Yes/No confirm) | `src/frontend/src/components/auth/ForgotPasswordModal.tsx`, wired in `Login.tsx` |
| Backend OTP endpoints (send, verify, complete-onboarding, reset-password) | `src/backend/src/controllers/auth.controller.ts` + `services/auth.service.ts` |
| SMTP mailer (nodemailer) | `src/backend/src/services/email.service.ts` |
| OTP database table + profile columns | `supabase/migrations/0004_otp_onboarding.sql` |
| Health Tracker UI refresh + Birthday & Age in the diocese view (table column + detail modal) | `src/frontend/src/views/HealthTracker.tsx` |

All data is saved to the database: OTP codes go to `diocese.otp_verifications`; birthday, contact number, email, and `onboarding_completed` go to `diocese.profiles` **and** the Supabase Auth user (password + metadata).

---

## STEP 1 — Run the SQL migration in Supabase  (required)

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Copy the entire contents of:
   `supabase/migrations/0004_otp_onboarding.sql`
3. Paste and click **Run**.

This creates the `diocese.otp_verifications` table and adds `birthday`, `contact_number`, `onboarding_completed` columns to `diocese.profiles`. It is safe to run more than once (`IF NOT EXISTS` everywhere).

---

## STEP 2 — Add your SMTP credentials to `.env`  (required for real emails)

Open the root `.env` file (the one next to `package.json`) and add the SMTP block — copy it from `.env.example`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Diocese of San Pablo <no-reply@diocesesanpablo.org>"
```

Use the **same credentials you entered in Supabase → Authentication → SMTP Settings**.

> **Gmail users:** `SMTP_PASS` is NOT your Gmail password. Create an App Password:
> Google Account → Security → 2-Step Verification → App passwords → generate one for "Mail".

> **No SMTP yet?** Leave the values blank — the system runs in **dev mode**: the OTP code is printed in the backend (auth-service) terminal, and the UI shows a note telling you to look there. Flows remain fully testable.

---

## STEP 3 — Rebuild and restart the backend  (required)

From the `PAULUS` folder:

```bash
npm run dev
```

(`dev` rebuilds the backend automatically before starting. If services were already running, stop them first, then run `npm run dev` again.)

---

## How the flows work (for testing)

### Onboarding (first login of a real Supabase account)
1. Log in with a real Supabase account (created in Settings → User Management or the Supabase dashboard).
2. The **Complete Your Profile** modal appears automatically (demo/localStorage accounts are skipped).
3. Fill in Contact Number, Birthday, Email, Update Password + Confirm Password → **Submit**.
4. An OTP is emailed to the address entered. Type the 6-digit code.
   - **Resend Code** unlocks after **60 seconds**.
   - If you resend and still get nothing after another 60s, a **warning** appears (check spam / verify address / contact admin).
5. On success everything is saved (DB + auth user) and the email becomes the account's **registered email**.

### Forgot Password (login page)
1. Click **Forgot Password?** on the login page.
2. Enter the **registered email** (only works for accounts that completed onboarding — others get a clear error).
3. Enter the OTP from the email (same 60s resend rules).
4. Type New Password + Confirm Password (must match, min 8 chars) → **Submit**.
5. Answer **"Are you sure you want to update your password?" → Yes / No**.
6. Yes saves the new password — log in with it.

### Health Tracker (diocese view)
- New **Birthday** column (with "in Nd" badge when within 30 days, "Today! 🎉" on the day).
- **Age** is now always computed live from the birth date.
- Click any priest row → the detail modal shows **Birthday + age** prominently, plus refreshed card layout.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Backend service unavailable" when sending OTP | Backend isn't running — `npm run dev` from the PAULUS folder. |
| OTP email never arrives, no dev-mode note | Check SMTP_* values in `.env`; for Gmail confirm you used an App Password. Watch the auth-service terminal for nodemailer errors. |
| "relation diocese.otp_verifications does not exist" | Step 1 was skipped — run the migration in the Supabase SQL Editor. |
| "permission denied for table otp_verifications" | Run the GRANT statements (included at the end of `0004_otp_onboarding.sql`) — re-running the whole file is safe. |
| "This email is not registered" in Forgot Password | Expected: that account hasn't completed the onboarding form yet. |
| Onboarding modal never appears | It only shows for **real Supabase** logins whose metadata lacks `onboardingCompleted: true`. Demo accounts (bishop@gmail.com etc. with no Supabase user) skip it. |
