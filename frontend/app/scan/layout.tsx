import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scan',
  description: 'Scan a URL and see what AI agents experience on that site. Six categories, one score, findings only.',
  alternates: {
    canonical: '/scan',
  },
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
