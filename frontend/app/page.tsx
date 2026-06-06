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

export default function Home() {
  return (
    <>
      <ArcsSvgDefs />
      <Topbar />
      <main id="main">
        <HeroSection />
      </main>
    </>
  );
}
