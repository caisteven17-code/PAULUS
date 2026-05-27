import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Diocese of San Pablo — Financial Analytics System',
  description: 'Next generation ecclesiastical stewardship platform for the Diocese of San Pablo. Track, analyze, and manage financial data across parishes, seminaries, and diocesan schools.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
