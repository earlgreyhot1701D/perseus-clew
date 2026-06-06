import type { Metadata } from 'next';
import { Archivo, Archivo_Black, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/globals.css';

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
  title: 'Agentis Lux',
  description: 'See what AI agents experience on your site. Agent-readiness scanner powered by the Perseus Clew engine.',
  openGraph: {
    title: 'Agentis Lux',
    description: 'See what AI agents experience on your site.',
    url: 'https://agentislux.io',
    siteName: 'Agentis Lux',
    type: 'website'
  }
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
      <body>{children}</body>
    </html>
  );
}
