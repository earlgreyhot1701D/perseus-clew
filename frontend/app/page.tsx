/**
 * Landing page: Agentis Lux marketing hero.
 *
 * Replaces the dev placeholder with the real topbar + hero
 * matching mockups/agentislux-landing.html exactly.
 *
 * The /scan route handles actual scan logic. This page navigates there on submit.
 */

import ArcsSvgDefs from '@/components/landing/ArcsSvgDefs';
import Topbar from '@/components/landing/Topbar';
import HeroSection from '@/components/landing/HeroSection';
import Manifesto from '@/components/landing/Manifesto';
import Editorial from '@/components/landing/Editorial';
import Categories from '@/components/landing/Categories';
import ReportPreview from '@/components/landing/ReportPreview';
import Footer from '@/components/landing/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentislux.io';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Agentis Lux',
  url: SITE_URL,
  description: 'Agent-readiness scanner. See what AI agents experience on your site.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  creator: {
    '@type': 'Organization',
    name: 'Clew Labs',
    url: 'https://earlgreyhot1701d.github.io/Clew-Labs/',
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArcsSvgDefs />
      <Topbar />
      <main id="main-content">
        <HeroSection />
        <Manifesto />
        <Editorial />
        <Categories />
        <ReportPreview />
      </main>
      <Footer />
    </>
  );
}
