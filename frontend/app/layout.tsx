import type { Metadata } from 'next';
import { Archivo, Archivo_Black, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentislux.io';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap'
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap'
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap'
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: {
    default: 'Agentis Lux',
    template: '%s | Agentis Lux'
  },
  description: 'See what AI agents experience on your site. Agent-readiness scanner powered by the Perseus Clew engine.',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Agentis Lux',
    description: 'See what AI agents experience on your site. For your second audience.',
    url: SITE_URL,
    siteName: 'Agentis Lux',
    type: 'website',
    images: [
      {
        url: '/api/og?domain=agentislux.io&score=70&rating=Partially+Ready&hero=For+your+second+audience.',
        width: 1200,
        height: 630,
        alt: 'Agentis Lux: agent-readiness scanner for your second audience',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agentis Lux',
    description: 'See what AI agents experience on your site. For your second audience.',
    images: ['/api/og?domain=agentislux.io&score=70&rating=Partially+Ready&hero=For+your+second+audience.'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${archivoBlack.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
