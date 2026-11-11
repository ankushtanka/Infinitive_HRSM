import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/app/globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Infinitive Cloud — Enterprise HR Suite',
  description: 'Infinitive Cloud Enterprise Management System & HR Operations Platform',
  icons: {
    icon: '/infinitive-cloud-icon.png',
    shortcut: '/infinitive-cloud-icon.png',
    apple: '/infinitive-cloud-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} bg-slate-50 text-slate-900 font-sans antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
