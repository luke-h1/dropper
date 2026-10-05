import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Dropper', template: '%s · Dropper' },
  description: 'Install internal iOS and Android builds',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='en'>
      <body className='min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100'>
        <div className='mx-auto max-w-3xl px-4 pb-16'>
          <header className='flex items-center justify-between py-6'>
            <Link href='/' className='text-lg font-semibold tracking-tight'>
              Dropper
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
