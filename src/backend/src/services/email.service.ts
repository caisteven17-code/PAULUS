import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export type OtpPurpose = 'onboarding' | 'forgot_password';

export interface SecurityAlertPayload {
  email: string;
  ipAddress?: string;
  attemptedAt?: string;
}

const PURPOSE_COPY: Record<OtpPurpose, { subject: string; heading: string; intro: string }> = {
  onboarding: {
    subject: 'Verify your email — Diocese of San Pablo',
    heading: 'Email Verification',
    intro:
      'Use the code below to verify your email address and complete your onboarding for the Diocese Financial Analytics System.',
  },
  forgot_password: {
    subject: 'Password reset code — Diocese of San Pablo',
    heading: 'Password Reset',
    intro:
      'We received a request to reset the password for your Diocese Financial Analytics System account. Use the code below to continue.',
  },
};

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  /** True when SMTP credentials are present; false = dev mode (log OTP to console). */
  get isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  async sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<{ devMode: boolean }> {
    if (!this.isConfigured) {
      // Dev mode — no SMTP configured. Print the code so flows remain testable.
      console.warn(`[email.service] SMTP not configured. OTP for ${to} (${purpose}): ${code}`);
      return { devMode: true };
    }

    const copy = PURPOSE_COPY[purpose];
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';

    try {
      await this.getTransporter().sendMail({
      from,
      to,
      subject: copy.subject,
      text: `${copy.intro}\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request it, you can safely ignore this email.`,
      html: `
        <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e0d5; border-radius: 12px; overflow: hidden;">
          <div style="background: #0f172a; padding: 28px 32px; text-align: center;">
            <p style="color: #D4AF37; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 6px;">Diocese of San Pablo</p>
            <h1 style="color: #ffffff; font-size: 22px; margin: 0;">${copy.heading}</h1>
          </div>
          <div style="padding: 32px; background: #fdfcf7;">
            <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${copy.intro}</p>
            <div style="background: #ffffff; border: 1px dashed #D4AF37; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0f172a;">${code}</span>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin: 0;">
              This code expires in <strong>10 minutes</strong>. If you did not request it, you can safely ignore this email.
            </p>
          </div>
          <div style="background: #f5f4ee; padding: 14px 32px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">Diocese Financial Analytics System — automated message, please do not reply.</p>
          </div>
        </div>`,
      });
    } catch (err: any) {
      // Surface the real cause in the backend console, return a typed error to the UI.
      console.error(
        `[email.service] SMTP send failed for ${to}:`,
        err?.message ?? err,
        '\nCheck SMTP_HOST/SMTP_PORT/SMTP_SECURE in .env — port 465 needs SMTP_SECURE=true, port 587 needs SMTP_SECURE=false.',
      );
      // Connection settings changed? Drop the cached transporter so the next try reconnects fresh.
      this.transporter = null;
      throw new Error('SMTP_SEND_FAILED');
    }

    return { devMode: false };
  }

  async sendSecurityAlertEmail(payload: SecurityAlertPayload): Promise<{ devMode: boolean }> {
    const { email, ipAddress, attemptedAt } = payload;
    const timeStr = attemptedAt ? new Date(attemptedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

    if (!this.isConfigured) {
      console.warn(`[email.service] SMTP not configured. Security alert for ${email} from IP ${ipAddress ?? 'unknown'} at ${timeStr}.`);
      return { devMode: true };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';

    try {
      await this.getTransporter().sendMail({
        from,
        to: email,
        subject: 'Security Alert: Multiple Failed Login Attempts — Diocese of San Pablo',
        text: `We detected 3 consecutive failed login attempts on your PAULUS account (${email}).\n\nTime: ${timeStr}\nIP Address: ${ipAddress ?? 'unknown'}\n\nIf this was you, please reset your password. If not, contact the Diocese IT administrator immediately.`,
        html: `
          <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e0d5; border-radius: 12px; overflow: hidden;">
            <div style="background: #0f172a; padding: 28px 32px; text-align: center;">
              <p style="color: #D4AF37; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 6px;">Diocese of San Pablo</p>
              <h1 style="color: #ffffff; font-size: 22px; margin: 0;">⚠️ Security Alert</h1>
            </div>
            <div style="padding: 32px; background: #fdfcf7;">
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                We detected <strong>3 consecutive failed login attempts</strong> on your PAULUS account.
              </p>
              <div style="background: #fff5f5; border: 1px solid #fca5a5; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #991b1b;"><strong>Account:</strong> ${email}</p>
                <p style="margin: 0 0 6px; font-size: 13px; color: #991b1b;"><strong>Time:</strong> ${timeStr} (Philippine Time)</p>
                <p style="margin: 0; font-size: 13px; color: #991b1b;"><strong>IP Address:</strong> ${ipAddress ?? 'unknown'}</p>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 16px;">
                If this was you, you may have forgotten your password — use the <em>Forgot Password</em> link on the login page to reset it.
              </p>
              <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0;">
                If you did <strong>not</strong> attempt to log in, please contact the Diocese IT administrator immediately to secure your account.
              </p>
            </div>
            <div style="background: #f5f4ee; padding: 14px 32px; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; margin: 0;">Diocese Financial Analytics System — automated message, please do not reply.</p>
            </div>
          </div>`,
      });
    } catch (err: any) {
      console.error(`[email.service] SMTP security alert send failed for ${email}:`, err?.message ?? err);
      this.transporter = null;
      throw new Error('SMTP_SEND_FAILED');
    }

    return { devMode: false };
  }
}
