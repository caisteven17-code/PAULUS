export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'email is required.' }, { status: 400 });
    }

    const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    const smtpConfigured =
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

    if (!smtpConfigured) {
      console.warn(
        `[security-alert] SMTP not configured — security alert for ${email} from IP ${ip} at ${now}`,
      );
      return NextResponse.json({ ok: true, devMode: true });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '';

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Security Alert: Multiple Failed Login Attempts — Diocese of San Pablo',
      text: [
        `We detected 3 consecutive failed login attempts on your PAULUS account (${email}).`,
        '',
        `Time: ${now} (Philippine Time)`,
        `IP Address: ${ip}`,
        '',
        'If this was you, use the Forgot Password link on the login page to reset your password.',
        'If you did NOT attempt to log in, contact the Diocese IT administrator immediately.',
      ].join('\n'),
      html: `
        <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;border:1px solid #e5e0d5;border-radius:12px;overflow:hidden;">
          <div style="background:#0f172a;padding:28px 32px;text-align:center;">
            <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Diocese of San Pablo</p>
            <h1 style="color:#ffffff;font-size:22px;margin:0;">&#9888; Security Alert</h1>
          </div>
          <div style="padding:32px;background:#fdfcf7;">
            <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 16px;">
              We detected <strong>3 consecutive failed login attempts</strong> on your PAULUS account.
            </p>
            <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:10px;padding:16px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:13px;color:#991b1b;"><strong>Account:</strong> ${email}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#991b1b;"><strong>Time:</strong> ${now} (Philippine Time)</p>
              <p style="margin:0;font-size:13px;color:#991b1b;"><strong>IP Address:</strong> ${ip}</p>
            </div>
            <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 16px;">
              If this was you, use the <em>Forgot Password</em> link on the login page to reset your password.
            </p>
            <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
              If you did <strong>not</strong> attempt to log in, contact the Diocese IT administrator immediately to secure your account.
            </p>
          </div>
          <div style="background:#f5f4ee;padding:14px 32px;text-align:center;">
            <p style="color:#94a3b8;font-size:11px;margin:0;">Diocese Financial Analytics System — automated message, please do not reply.</p>
          </div>
        </div>`,
    });

    return NextResponse.json({ ok: true, devMode: false });
  } catch (err: unknown) {
    console.error('[security-alert] Failed to send alert email:', err);
    return NextResponse.json({ ok: false, error: 'Failed to send alert' }, { status: 500 });
  }
}
