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

export default function Home() {
  return (
    <>
      <ArcsSvgDefs />
      <Topbar />
      <main id="main">
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
